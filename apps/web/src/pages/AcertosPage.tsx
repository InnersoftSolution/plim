import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  paymentMethodCatalog,
  type Company,
  type CompanyMember,
  type MemberBalance,
  type MovementDebt,
  type MovementSettlement,
  type PaymentMethod,
  type SettlementPayment,
} from '@plim/shared';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { DateField } from '../components/ui/DateField';
import { companyApi, messageForError } from '../company/companyApi';
import { useActiveCompany } from '../company/ActiveCompanyContext';
import { financeApi, formatMoney, maskMoneyBRL, maskedMoneyToCents } from '../finance/financeApi';
import { IconArrowRight } from './dashIcons';
import './dashboard.css';
import './acertos.css';
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
      movements: MovementSettlement[];
      payments: SettlementPayment[];
    };

/** Alvo do pagamento: uma dívida específica dentro de uma movimentação. */
type PayTarget = { movement: MovementSettlement; debt: MovementDebt };

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

const MONTHS_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** "2026-07" -> "Julho de 2026". */
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const name = MONTHS_PT[(m ?? 1) - 1] ?? '';
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${y}`;
}

export function AcertosPage() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [paying, setPaying] = useState<PayTarget | null>(null);
  const [monthFilter, setMonthFilter] = useState('');
  const [movFilter, setMovFilter] = useState('');
  const { company: activeCompany } = useActiveCompany();

  const load = useCallback(async () => {
    try {
      const [members, balances, movements, payments] = await Promise.all([
        companyApi.listMembers(activeCompany.id),
        financeApi.getBalances(activeCompany.id),
        financeApi.getMovementSettlements(activeCompany.id),
        financeApi.listSettlementPayments(activeCompany.id),
      ]);
      setState({ status: 'ready', company: activeCompany, members, balances, movements, payments });
    } catch (err) {
      setState({ status: 'error', message: messageForError(err) });
    }
  }, [activeCompany]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === 'loading') return <p className="dash-muted">carregando acertos…</p>;
  if (state.status === 'error') return <p className="dash-muted">{state.message}</p>;
  if (state.status === 'empty') return <p className="dash-muted">Crie sua empresa primeiro.</p>;

  const { company, balances, movements, payments } = state;
  const nameOf = (id: string) => state.members.find((m) => m.id === id)?.fullName ?? 'Sócio';

  // Meses disponíveis (de movimentações e de pagamentos), mais recente primeiro.
  const monthsSet = new Set<string>();
  movements.forEach((m) => monthsSet.add(m.spentOn.slice(0, 7)));
  payments.forEach((p) => monthsSet.add(p.paidOn.slice(0, 7)));
  const months = [...monthsSet].sort().reverse();

  // Despesas para o seletor "por despesa", respeitando o mês escolhido.
  const movOptions = movements
    .filter((m) => !monthFilter || m.spentOn.startsWith(monthFilter))
    .map((m) => ({ value: m.movementId, label: `${m.description} · ${formatDateBr(m.spentOn)}` }));
  // Se trocar de mês e a despesa selecionada não existir mais, ignora o filtro dela.
  const activeMov = movFilter && movOptions.some((o) => o.value === movFilter) ? movFilter : '';

  const hasFilter = !!monthFilter || !!activeMov;
  // Com filtro: mostra todas as movimentações que batem (inclusive já quitadas,
  // pra ver quem pagou). Sem filtro: só as pendentes, como antes.
  const groups = movements
    .filter((m) => (!monthFilter || m.spentOn.startsWith(monthFilter)) && (!activeMov || m.movementId === activeMov))
    .filter((m) => (hasFilter ? true : m.remainingCents > 0));
  // Histórico de pagamentos também segue o mês selecionado.
  const visiblePayments = payments.filter((p) => !monthFilter || p.paidOn.startsWith(monthFilter));

  return (
    <div className="dash">
      <div>
        <h1 className="dash-page__title">Acertos entre sócios</h1>
        <p className="dash-page__subtitle">
          Cada movimentação compartilhada mostra quem ainda deve a parte dele e para quem. Os
          pagamentos ficam amarrados à movimentação de origem.
        </p>
      </div>

      {/* ── barra de filtros: por mês e por despesa ── */}
      {months.length > 0 && (
        <div className="ac-filters">
          <Select
            label="Mês"
            value={monthFilter}
            onChange={(v) => {
              setMonthFilter(v);
              setMovFilter('');
            }}
            options={[
              { value: '', label: 'Todos os meses' },
              ...months.map((ym) => ({ value: ym, label: monthLabel(ym) })),
            ]}
          />
          <Select
            label="Despesa"
            value={activeMov}
            onChange={setMovFilter}
            options={[{ value: '', label: 'Todas as movimentações' }, ...movOptions]}
          />
          {hasFilter && (
            <button
              type="button"
              className="ac-filters__clear"
              onClick={() => {
                setMonthFilter('');
                setMovFilter('');
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* ── acertos agrupados por movimentação ── */}
      <section className="dash-panel">
        <div className="dash-panel__head">
          <h2>{hasFilter ? 'Acertos por movimentação' : 'Acertos pendentes'}</h2>
        </div>
        {groups.length === 0 ? (
          <div className="dash-emptyrow">
            <p>
              {hasFilter ? (
                <>
                  <strong>Nada neste filtro.</strong> Não há acertos para o mês ou a despesa
                  selecionada. Troque o filtro ou limpe para ver todos.
                </>
              ) : (
                <>
                  <strong>Tudo certo entre os sócios.</strong> Quando uma despesa ou aporte
                  reembolsável gerar dívida, o Plim mostra aqui quem deve o quê, por movimentação.
                </>
              )}
            </p>
          </div>
        ) : (
          <div className="ac-groups">
            {groups.map((m) => (
              <article className="ac-group" key={m.movementId}>
                <header className="ac-group__head">
                  <div className="ac-group__id">
                    <span className={'ac-group__badge' + (m.kind === 'contribution' ? ' ac-group__badge--aporte' : '')}>
                      {m.kind === 'contribution' ? 'Aporte' : 'Despesa'}
                    </span>
                    <strong className="ac-group__title">{m.description}</strong>
                    <span className="ac-group__meta">
                      {m.kind === 'contribution' ? 'adiantado' : 'pago'} por {m.payerName} ·{' '}
                      {formatDateBr(m.spentOn)} · total {formatMoney(m.amountCents, company.currencyCode)}
                    </span>
                  </div>
                  {m.remainingCents > 0 ? (
                    <span className="ac-group__total" data-financial>
                      {formatMoney(m.remainingCents, company.currencyCode)}
                      <small>pendente</small>
                    </span>
                  ) : (
                    <span className="ac-status ac-status--paid">Tudo acertado</span>
                  )}
                </header>

                <div className="ac-group__debts">
                  {m.debts.map((d) => {
                    const status =
                      d.remainingCents === 0
                        ? 'quitado'
                        : d.paidCents > 0
                          ? 'parcial'
                          : 'pendente';
                    return (
                      <div className="ac-debt" key={d.debtorId}>
                        <span className="ac-debt__avatar">{initials(d.debtorName)}</span>
                        <span className="ac-debt__text">
                          {status === 'quitado' ? (
                            <>
                              <strong>{d.debtorName}</strong> já pagou a parte dele,{' '}
                              <strong data-financial>
                                {formatMoney(d.originalCents, company.currencyCode)}
                              </strong>{' '}
                              para <strong>{m.payerName}</strong>
                            </>
                          ) : (
                            <>
                              <strong>{d.debtorName}</strong> deve{' '}
                              <strong className="ac-debt__amount" data-financial>
                                {formatMoney(d.remainingCents, company.currencyCode)}
                              </strong>{' '}
                              para <strong>{m.payerName}</strong>
                              {d.paidCents > 0 && (
                                <span className="ac-debt__sub">
                                  já pagou {formatMoney(d.paidCents, company.currencyCode)} de{' '}
                                  {formatMoney(d.originalCents, company.currencyCode)}
                                </span>
                              )}
                            </>
                          )}
                        </span>
                        {status === 'quitado' ? (
                          <span className="ac-status ac-status--paid">Quitado</span>
                        ) : (
                          <div className="ac-debt__actions">
                            <span className={'ac-status' + (status === 'parcial' ? ' ac-status--partial' : '')}>
                              {status === 'parcial' ? 'Parcial' : 'Pendente'}
                            </span>
                            <Button onClick={() => setPaying({ movement: m, debt: d })}>
                              Registrar pagamento
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ── histórico de pagamentos ── */}
      {visiblePayments.length > 0 && (
        <section className="dash-panel">
          <div className="dash-panel__head">
            <h2>Pagamentos registrados</h2>
          </div>
          <p className="dash-panel__hint">
            {monthFilter
              ? `Pagamentos de acerto de ${monthLabel(monthFilter)}.`
              : 'O histórico fica guardado, dívidas quitadas saem da lista de pendentes.'}
          </p>
          <div className="dash-settlements">
            {visiblePayments.map((p) => (
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

      {/* ── saldo de cada sócio (resumo líquido) ── */}
      <section className="dash-panel">
        <div className="dash-panel__head">
          <h2>Saldo de cada sócio</h2>
        </div>
        <p className="dash-panel__hint">
          Resumo líquido de tudo: "pagou" é o que saiu do bolso; "cabe" é a parte de cada um.
          Pagamentos de acerto já estão descontados.
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

      {/* ── modal registrar pagamento (amarrado à movimentação) ── */}
      <Modal
        open={paying !== null}
        title="Registrar pagamento"
        subtitle={
          paying
            ? `${paying.debt.debtorName} → ${paying.movement.payerName} · ${paying.movement.description}`
            : ''
        }
        onClose={() => setPaying(null)}
      >
        {paying && (
          <PaymentForm
            company={company}
            target={paying}
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

/** Pagamento de UMA dívida (devedor → autor) de UMA movimentação. */
function PaymentForm({
  company,
  target,
  onSaved,
}: {
  company: Company;
  target: PayTarget;
  onSaved: () => void;
}) {
  const { movement, debt } = target;
  const [amount, setAmount] = useState(maskMoneyBRL(String(debt.remainingCents / 100).replace('.', ',')));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<PaymentMethod | ''>('pix');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const cents = maskedMoneyToCents(amount);
  const isPartial = cents != null && cents < debt.remainingCents;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (cents == null) return setError('Informe um valor válido.');
    if (cents > debt.remainingCents) {
      return setError(
        `O valor é maior que o pendente dessa movimentação (${formatMoney(debt.remainingCents, company.currencyCode)}).`,
      );
    }
    setSaving(true);
    try {
      await financeApi.createSettlementPayment(company.id, {
        fromMemberId: debt.debtorId,
        toMemberId: movement.payerId,
        amountCents: cents,
        paidOn: date,
        method: method || null,
        note: note.trim() || null,
        expenseId: movement.movementId,
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
      <p className="mw-hint" style={{ marginTop: 0 }}>
        {debt.debtorName} deve {formatMoney(debt.remainingCents, company.currencyCode)} para{' '}
        {movement.payerName} pela {movement.kind === 'contribution' ? 'parte do aporte' : 'parte da despesa'}{' '}
        "{movement.description}".
      </p>
      <div className="mw-form">
        <Input
          label={`Valor pago (${company.currencyCode ?? 'BRL'})`}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(maskMoneyBRL(e.target.value))}
          autoFocus
        />
        <div className="rc-grid">
          <div className="field">
            <label className="field__label">Data do pagamento</label>
            <DateField value={date} onChange={setDate} max={new Date().toISOString().slice(0, 10)} />
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
          ? `Pagamento parcial: sobra ${formatMoney(debt.remainingCents - (cents ?? 0), company.currencyCode)} nessa movimentação.`
          : 'Esse valor quita a parte dele nessa movimentação.'}
      </p>
      <div className="mw-actions">
        <Button type="submit" block disabled={saving}>
          {saving ? 'Registrando…' : isPartial ? 'Registrar pagamento parcial' : 'Registrar e quitar'}
        </Button>
      </div>
    </form>
  );
}
