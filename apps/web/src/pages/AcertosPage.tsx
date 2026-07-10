import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  paymentMethodCatalog,
  type Company,
  type CompanyMember,
  type Expense,
  type MemberBalance,
  type PaymentMethod,
  type Settlement,
  type SettlementPayment,
} from '@plim/shared';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { companyApi, messageForError } from '../company/companyApi';
import { financeApi, formatMoney, parseMoneyToCents } from '../finance/financeApi';
import { IconArrowRight } from './dashIcons';
import './dashboard.css';
import '../finance/wizard.css';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | {
      status: 'ready';
      company: Company;
      members: CompanyMember[];
      balances: MemberBalance[];
      settlements: Settlement[];
      expenses: Expense[];
      payments: SettlementPayment[];
    };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? parts[parts.length - 1]![0] ?? '' : '';
  return (first + last).toUpperCase();
}

function formatDateBr(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export function AcertosPage() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [paying, setPaying] = useState<Settlement | null>(null);
  const [detailKey, setDetailKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const companies = await companyApi.listMyCompanies();
      if (companies.length === 0) return setState({ status: 'empty' });
      const company = companies[0]!;
      const [members, balances, settlements, expenses, payments] = await Promise.all([
        companyApi.listMembers(company.id),
        financeApi.getBalances(company.id),
        financeApi.getSettlements(company.id),
        financeApi.listExpenses(company.id),
        financeApi.listSettlementPayments(company.id),
      ]);
      setState({ status: 'ready', company, members, balances, settlements, expenses, payments });
    } catch (err) {
      setState({ status: 'error', message: messageForError(err) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === 'loading') return <p className="dash-muted">carregando acertos…</p>;
  if (state.status === 'error') return <p className="dash-muted">{state.message}</p>;
  if (state.status === 'empty') return <p className="dash-muted">Crie sua empresa primeiro.</p>;

  const { company, balances, settlements, expenses, payments } = state;
  const sharedExpenses = expenses.filter((e) => e.kind === 'expense');
  const nameOf = (id: string) => state.members.find((m) => m.id === id)?.fullName ?? 'Sócio';
  const keyOf = (s: Settlement) => `${s.fromMemberId}->${s.toMemberId}`;

  return (
    <div className="dash">
      <div>
        <h1 className="dash-page__title">Acertos entre sócios</h1>
        <p className="dash-page__subtitle">
          Veja os valores que precisam ser resolvidos entre os sócios com base nas movimentações
          registradas — e registre os pagamentos quando acontecerem.
        </p>
      </div>

      {/* ── acertos pendentes ── */}
      <section className="dash-panel">
        <div className="dash-panel__head">
          <h2>Acertos pendentes</h2>
        </div>
        {settlements.length === 0 ? (
          <div className="dash-emptyrow">
            <p>
              <strong>Tudo certo entre os sócios.</strong> Quando houver despesas compartilhadas, o
              Plim mostrará aqui quem precisa pagar quem.
            </p>
          </div>
        ) : (
          <div className="dash-settlements">
            {settlements.map((s) => {
              const key = keyOf(s);
              const partial = s.alreadyPaidCents > 0;
              const original = s.amountCents + s.alreadyPaidCents;
              const open = detailKey === key;
              return (
                <div className="ac-item" key={key}>
                  <div className="dash-settlement" style={{ border: 'none', background: 'transparent', padding: 0 }}>
                    <span className="dash-settlement__avatar">{initials(s.fromName)}</span>
                    <span className="dash-settlement__text">
                      <strong>{s.fromName}</strong> precisa pagar{' '}
                      <strong className="dash-settlement__amount">
                        {formatMoney(s.amountCents, company.currencyCode)}
                      </strong>{' '}
                      para <strong>{s.toName}</strong>
                    </span>
                    <span className={'ac-status' + (partial ? ' ac-status--partial' : '')}>
                      {partial ? 'Parcialmente pago' : 'Pendente'}
                    </span>
                  </div>
                  <div className="ac-item__actions">
                    <Button onClick={() => setPaying(s)}>Registrar pagamento</Button>
                    <button className="dash-pending__later" onClick={() => setDetailKey(open ? null : key)}>
                      {open ? 'Esconder detalhes' : 'Ver detalhes'}
                    </button>
                  </div>

                  {open && (
                    <div className="ac-detail">
                      <div className="mw-review">
                        <div className="mw-review__row">
                          <span>Quem paga</span>
                          <strong>{s.fromName}</strong>
                        </div>
                        <div className="mw-review__row">
                          <span>Quem recebe</span>
                          <strong>{s.toName}</strong>
                        </div>
                        <div className="mw-review__row">
                          <span>Valor do acerto</span>
                          <strong data-financial>{formatMoney(original, company.currencyCode)}</strong>
                        </div>
                        <div className="mw-review__row">
                          <span>Já pago</span>
                          <strong data-financial>{formatMoney(s.alreadyPaidCents, company.currencyCode)}</strong>
                        </div>
                        <div className="mw-review__row">
                          <span>Saldo pendente</span>
                          <strong data-financial>{formatMoney(s.amountCents, company.currencyCode)}</strong>
                        </div>
                        <div className="mw-review__row">
                          <span>Status</span>
                          <strong>{partial ? 'Parcialmente pago' : 'Pendente'}</strong>
                        </div>
                      </div>
                      <p className="dash-panel__hint" style={{ margin: '12px 0 8px' }}>
                        {s.toName} pagou mais do que a parte dele(a) nas despesas compartilhadas.{' '}
                        {s.fromName} pagou menos do que a parte dele(a). Por isso, o Plim sugere este
                        acerto — recalculado a cada nova movimentação ou pagamento.
                      </p>
                      <div className="ac-detail__movs">
                        <span className="fin-section__title" style={{ marginBottom: 6 }}>
                          Movimentações que geram o acerto
                        </span>
                        {sharedExpenses.slice(0, 6).map((e) => (
                          <div className="ac-mov" key={e.id}>
                            <span className="ac-mov__desc">{e.description}</span>
                            <span className="ac-mov__meta">
                              pago por {nameOf(e.paidByMemberId)} · {formatDateBr(e.spentOn)}
                            </span>
                            <span className="ac-mov__value">
                              {formatMoney(e.amountCents, company.currencyCode)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── histórico de pagamentos ── */}
      {payments.length > 0 && (
        <section className="dash-panel">
          <div className="dash-panel__head">
            <h2>Pagamentos registrados</h2>
          </div>
          <p className="dash-panel__hint">
            O histórico fica guardado — acertos quitados saem da lista de pendentes.
          </p>
          <div className="dash-settlements">
            {payments.map((p) => (
              <div className="dash-settlement" key={p.id}>
                <span className="dash-settlement__avatar" style={{ background: 'var(--color-status-positive-bg)', color: 'var(--color-status-positive)' }}>
                  <IconArrowRight />
                </span>
                <span className="dash-settlement__text">
                  <strong>{nameOf(p.fromMemberId)}</strong> pagou{' '}
                  <strong data-financial>{formatMoney(p.amountCents, company.currencyCode)}</strong> para{' '}
                  <strong>{nameOf(p.toMemberId)}</strong>
                  <span className="ac-mov__meta" style={{ display: 'block' }}>
                    {formatDateBr(p.paidOn)}
                    {p.method ? ` · ${paymentMethodCatalog.find((m) => m.id === p.method)?.label}` : ''}
                    {p.note ? ` · ${p.note}` : ''}
                  </span>
                </span>
                <span className="ac-status ac-status--paid">Pago</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── saldo de cada sócio ── */}
      <section className="dash-panel">
        <div className="dash-panel__head">
          <h2>Saldo de cada sócio</h2>
        </div>
        <p className="dash-panel__hint">
          "Pagou" é o que saiu do bolso nas despesas; "cabe" é a parte pela participação. Pagamentos
          de acerto já estão descontados do saldo.
        </p>
        <div className="dash-settlements">
          {balances.map((b) => {
            const net = b.netCents;
            const label = net > 0 ? 'a receber' : net < 0 ? 'a pagar' : 'quite';
            const color = net > 0 ? 'var(--color-status-positive)' : net < 0 ? 'var(--rose-600)' : 'var(--color-text-subtle)';
            return (
              <div className="dash-settlement" key={b.memberId}>
                <span className="dash-settlement__avatar">{initials(b.fullName)}</span>
                <span className="dash-settlement__text">
                  <strong>{b.fullName}</strong> · pagou {formatMoney(b.paidCents, company.currencyCode)} · cabe{' '}
                  {formatMoney(b.owedCents, company.currencyCode)}
                </span>
                <strong style={{ fontFamily: 'var(--font-mono)', color }}>
                  {net === 0 ? '—' : formatMoney(Math.abs(net), company.currencyCode)}
                  <span style={{ fontWeight: 400, fontSize: 11, marginLeft: 6, color: 'var(--color-text-subtle)' }}>
                    {label}
                  </span>
                </strong>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── modal registrar pagamento ── */}
      <Modal
        open={paying !== null}
        title="Registrar pagamento"
        subtitle={
          paying
            ? `${paying.fromName} → ${paying.toName} · pendente ${formatMoney(paying.amountCents, company.currencyCode)}`
            : ''
        }
        onClose={() => setPaying(null)}
      >
        {paying && (
          <PaymentForm
            company={company}
            settlement={paying}
            onSaved={() => {
              setPaying(null);
              void load();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

/** Form do pagamento: total ou parcial, com data, forma e observação. */
function PaymentForm({
  company,
  settlement,
  onSaved,
}: {
  company: Company;
  settlement: Settlement;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(
    (settlement.amountCents / 100).toFixed(2).replace('.', ','),
  );
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<PaymentMethod | ''>('pix');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const cents = parseMoneyToCents(amount);
  const isPartial = cents != null && cents < settlement.amountCents;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (cents == null) return setError('Informe um valor válido.');
    if (cents > settlement.amountCents) {
      return setError(
        `O valor é maior que o pendente (${formatMoney(settlement.amountCents, company.currencyCode)}). Para pagamento parcial, use um valor menor.`,
      );
    }
    setSaving(true);
    try {
      await financeApi.createSettlementPayment(company.id, {
        fromMemberId: settlement.fromMemberId,
        toMemberId: settlement.toMemberId,
        amountCents: cents,
        paidOn: date,
        method: method || null,
        note: note.trim() || null,
      });
      onSaved();
    } catch (err) {
      setError(messageForError(err));
      setSaving(false);
    }
  }

  return (
    <form className="mw" onSubmit={handleSubmit} noValidate>
      {error && <div className="form-error">{error}</div>}
      <div className="mw-form">
        <Input
          label={`Valor pago (${company.currencyCode ?? 'BRL'})`}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
        />
        <div className="rc-grid">
          <div className="field">
            <label className="field__label">Data do pagamento</label>
            <input
              type="date"
              className="field__input"
              value={date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <Select
            label="Forma de pagamento"
            value={method}
            onChange={(v) => setMethod(v as PaymentMethod)}
            options={paymentMethodCatalog.map((m) => ({ value: m.id, label: m.label }))}
          />
        </div>
        <Input
          label="Observação (opcional)"
          placeholder="Ex.: Pix da metade combinada"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <p className="mw-hint">
        {isPartial
          ? `Pagamento parcial: o acerto continua pendente com ${formatMoney(settlement.amountCents - (cents ?? 0), company.currencyCode)} restantes.`
          : 'Esse valor quita o acerto — ele sai dos pendentes e fica no histórico.'}
      </p>
      <div className="mw-actions">
        <Button type="submit" block disabled={saving}>
          {saving ? 'Registrando…' : isPartial ? 'Registrar pagamento parcial' : 'Registrar e quitar'}
        </Button>
      </div>
    </form>
  );
}
