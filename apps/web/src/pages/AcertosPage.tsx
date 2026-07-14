import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  paymentMethodCatalog,
  type Company,
  type CompanyMember,
  type MemberBalance,
  type MovementDebt,
  type MovementSettlement,
  type PaymentMethod,
  type Settlement,
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
import { IconArrowRight, IconCheck } from './dashIcons';
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
      settlements: Settlement[];
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

function IconSearch() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

const MONTHS_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** Minúsculas sem acento, para busca tolerante ("março" casa com "marco"). */
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Texto pesquisável de uma data: dd/mm/aaaa, aaaa-mm-dd, nome do mês e ano. */
function dateHaystack(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  const name = MONTHS_PT[(m ?? 1) - 1] ?? '';
  return `${formatDateBr(iso)} ${iso} ${name} de ${y} ${y}`;
}

/**
 * Busca inteligente: quebra a busca em palavras e exige que TODAS apareçam no
 * texto (nome + datas). Assim "studio", "março", "2025", "julho 2025" e
 * "10/2025" funcionam num campo só.
 */
function makeMatcher(query: string): (haystack: string) => boolean {
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return () => true;
  return (haystack: string) => {
    const hay = norm(haystack);
    return tokens.every((t) => hay.includes(t));
  };
}

export function AcertosPage() {
  const [state, setState] = useState<State>({ status: 'loading' });
  // Pagamento consolidado (net) do bloco "Resumo dos acertos".
  const [netPaying, setNetPaying] = useState<Settlement | null>(null);
  // Sócios com "Ver cálculo" aberto no detalhamento.
  const [openCalc, setOpenCalc] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const { company: activeCompany } = useActiveCompany();
  // Arquivo por ano: /acertos/2025 abre uma página só daquele ano.
  const { ano } = useParams();
  const archiveYear = ano && /^\d{4}$/.test(ano) ? ano : null;
  const currentYear = String(new Date().getFullYear());

  const load = useCallback(async () => {
    try {
      const [members, balances, movements, payments, settlements] = await Promise.all([
        companyApi.listMembers(activeCompany.id),
        financeApi.getBalances(activeCompany.id),
        financeApi.getMovementSettlements(activeCompany.id),
        financeApi.listSettlementPayments(activeCompany.id),
        financeApi.getSettlements(activeCompany.id),
      ]);
      setState({ status: 'ready', company: activeCompany, members, balances, movements, payments, settlements });
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

  const { company, balances, movements, payments, settlements } = state;
  const nameOf = (id: string) => state.members.find((m) => m.id === id)?.fullName ?? 'Sócio';

  // Anos anteriores com movimentação: viram cards de arquivo no topo.
  const pastYears = [...new Set(movements.map((m) => m.spentOn.slice(0, 4)))]
    .filter((y) => y < currentYear)
    .sort()
    .reverse();

  // Base do período: página de arquivo trava no ano; a principal mostra tudo.
  const inYear = (iso: string) => !archiveYear || iso.startsWith(archiveYear);
  const matches = makeMatcher(query);
  const hasFilter = query.trim().length > 0;

  // Busca inteligente + arquivo. Com busca (ou no arquivo) mostra tudo, inclusive
  // já quitadas; na home sem busca, só as pendentes.
  const groups = movements
    .filter((m) => inYear(m.spentOn))
    .filter((m) => matches(`${m.description} ${m.payerName} ${dateHaystack(m.spentOn)}`))
    .filter((m) => (hasFilter || archiveYear ? true : m.remainingCents > 0))
    // Recorrentes primeiro; dentro, pendentes antes de quitadas; depois mais recentes.
    .sort((a, b) => {
      if (a.recorrente !== b.recorrente) return a.recorrente ? -1 : 1;
      const ap = a.remainingCents > 0 ? 0 : 1;
      const bp = b.remainingCents > 0 ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return b.spentOn.localeCompare(a.spentOn);
    });
  const visiblePayments = payments
    .filter((p) => inYear(p.paidOn))
    .filter((p) =>
      matches(`${nameOf(p.fromMemberId)} ${nameOf(p.toMemberId)} ${p.note ?? ''} ${dateHaystack(p.paidOn)}`),
    );

  return (
    <div className="dash">
      <div>
        {archiveYear && (
          <Link className="fin-back" to="/acertos">
            ← Voltar para os acertos atuais
          </Link>
        )}
        <h1 className="dash-page__title">
          {archiveYear ? `Acertos de ${archiveYear}` : 'Acertos entre sócios'}
        </h1>
        <p className="dash-page__subtitle">
          {archiveYear
            ? `Tudo que gerou acerto entre os sócios em ${archiveYear}, com quem pagou e quem quitou.`
            : 'Cada movimentação compartilhada mostra quem ainda deve a parte dele e para quem. Os pagamentos ficam amarrados à movimentação de origem.'}
        </p>
      </div>

      {/* ── anos anteriores: cards de arquivo (só na página principal) ── */}
      {!archiveYear && pastYears.length > 0 && (
        <section className="fin-years">
          <span className="fin-years__title">Anos anteriores</span>
          <div className="fin-years__grid">
            {pastYears.map((y) => {
              const doAno = movements.filter((m) => m.spentOn.startsWith(y));
              const totalAno = doAno.reduce((s, m) => s + m.amountCents, 0);
              return (
                <Link className="fin-year" to={`/acertos/${y}`} key={y}>
                  <span className="fin-year__badge">{y}</span>
                  <span className="fin-year__info">
                    <strong>Ver acertos de {y}</strong>
                    <small>
                      {doAno.length} {doAno.length === 1 ? 'movimentação' : 'movimentações'} ·{' '}
                      {formatMoney(totalAno, company.currencyCode)} em despesas rateadas
                    </small>
                  </span>
                  <span className="fin-year__cta" aria-hidden="true">
                    <IconArrowRight />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ── busca inteligente: nome, mês ou ano num campo só ── */}
      {(movements.length > 0 || payments.length > 0) && (
        <div className="ac-search">
          <span className="ac-search__icon" aria-hidden="true">
            <IconSearch />
          </span>
          <input
            className="ac-search__input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome, mês ou ano (ex.: Studio, março, 2025)"
            aria-label="Buscar acertos"
          />
          {hasFilter && (
            <button type="button" className="ac-search__clear" onClick={() => setQuery('')}>
              Limpar
            </button>
          )}
        </div>
      )}

      {/* ── Bloco A: Resumo dos acertos (o resultado consolidado + ação) ── */}
      {!archiveYear && (
        <section className="dash-panel">
          <div className="dash-panel__head">
            <h2>Resumo dos acertos</h2>
          </div>
          <p className="dash-panel__hint">
            Quando alguém paga mais do que a parte dele, o Plim cruza as despesas e mostra quem ainda
            precisa pagar e quem deve receber.
          </p>
          {settlements.length === 0 ? (
            <div className="dash-emptyrow">
              <p>
                <strong>Tudo certo entre os sócios.</strong> Nenhum pagamento pendente no momento.
              </p>
            </div>
          ) : (
            <div className="sac-list">
              {settlements.map((s) => (
                <article className="sac" key={`${s.fromMemberId}-${s.toMemberId}`}>
                  <span className="sac__avatar">{initials(s.fromName)}</span>
                  <div className="sac__body">
                    <p className="sac__line">
                      <strong>{s.fromName}</strong> precisa pagar{' '}
                      <strong className="sac__amount" data-financial>
                        {formatMoney(s.amountCents, company.currencyCode)}
                      </strong>{' '}
                      para <strong>{s.toName}</strong>
                    </p>
                    <span className="sac__status">Pendente</span>
                  </div>
                  <Button onClick={() => setNetPaying(s)}>Registrar pagamento</Button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Bloco B: Detalhamento por sócio (explica o cálculo; some no arquivo) ── */}
      {!archiveYear && (
        <section className="dash-panel">
          <div className="dash-panel__head">
            <h2>Detalhamento por sócio</h2>
          </div>
          <p className="dash-panel__hint">Entenda como o Plim chegou ao saldo de cada pessoa.</p>
          <div className="sld-list">
            {balances.map((b) => {
              const net = b.netCents;
              const acertosPagos = payments
                .filter((p) => p.status === 'confirmed' && p.fromMemberId === b.memberId)
                .reduce((s, p) => s + p.amountCents, 0);
              const acertosRecebidos = payments
                .filter((p) => p.status === 'confirmed' && p.toMemberId === b.memberId)
                .reduce((s, p) => s + p.amountCents, 0);
              const tone = net > 0 ? 'receive' : net < 0 ? 'pay' : 'quite';
              const fmt = (c: number) => formatMoney(c, company.currencyCode);
              const result =
                net < 0 ? 'Precisa pagar' : net > 0 ? 'Vai receber' : 'Tudo certo';
              const explain =
                net < 0
                  ? 'Esse saldo considera a parte que cabia, o que já pagou e os acertos registrados.'
                  : net > 0
                    ? 'Pagou mais despesas do que a parte que cabia, então tem valor a receber.'
                    : 'As contas estão em dia com os outros sócios.';
              const open = !!openCalc[b.memberId];
              return (
                <article className={'sld sld--' + tone} key={b.memberId}>
                  <div className="sld__head">
                    <span className="sld__avatar">{initials(b.fullName)}</span>
                    <span className="sld__name">{b.fullName}</span>
                    <span className={'sld__chip sld__chip--' + tone}>{result}</span>
                  </div>
                  <div className="sld__result">
                    <span className="sld__result-label">{result}</span>
                    <strong className="sld__result-value" data-financial>
                      {net === 0 ? fmt(0) : fmt(Math.abs(net))}
                    </strong>
                  </div>
                  <p className="sld__explain">{explain}</p>
                  <button
                    type="button"
                    className="sld__toggle"
                    aria-expanded={open}
                    onClick={() => setOpenCalc((m) => ({ ...m, [b.memberId]: !open }))}
                  >
                    {open ? 'Ocultar cálculo' : 'Ver cálculo'}
                  </button>
                  {open && (
                    <dl className="sld__break">
                      <div className="sld__row">
                        <dt>Parte que cabia a ele</dt>
                        <dd data-financial>{fmt(b.owedCents)}</dd>
                      </div>
                      <div className="sld__row">
                        <dt>Pagou despesas pela empresa</dt>
                        <dd data-financial>{fmt(b.paidCents)}</dd>
                      </div>
                      {acertosPagos > 0 && (
                        <div className="sld__row">
                          <dt>Já pagou para sócios</dt>
                          <dd data-financial>{fmt(acertosPagos)}</dd>
                        </div>
                      )}
                      {acertosRecebidos > 0 && (
                        <div className="sld__row">
                          <dt>Já recebeu de sócios</dt>
                          <dd data-financial>{fmt(acertosRecebidos)}</dd>
                        </div>
                      )}
                      <div className="sld__row sld__row--final">
                        <dt>Saldo final</dt>
                        <dd data-financial>
                          {result} {net === 0 ? '' : fmt(Math.abs(net))}
                        </dd>
                      </div>
                    </dl>
                  )}
                </article>
              );
            })}
          </div>
          <p className="sld__note">
            <strong>Nota:</strong> aportes não entram nesses acertos. São tratados separadamente das
            despesas compartilhadas.
          </p>
        </section>
      )}

      {/* ── Detalhe por movimentação (só leitura: como cada despesa foi rateada) ── */}
      <section className="dash-panel">
        <div className="dash-panel__head">
          <h2>
            {hasFilter
              ? 'Resultados da busca'
              : archiveYear
                ? `Acertos de ${archiveYear}`
                : 'Detalhe por movimentação'}
          </h2>
        </div>
        {!archiveYear && !hasFilter && groups.length > 0 && (
          <p className="dash-panel__hint">
            Como cada despesa compartilhada foi rateada e quem já quitou. Para registrar um
            pagamento, use o Resumo dos acertos acima.
          </p>
        )}
        {groups.length === 0 ? (
          <div className="dash-emptyrow">
            <p>
              {hasFilter ? (
                <>
                  <strong>Nada encontrado.</strong> Nenhum acerto bate com "{query}". Tente outro
                  nome, mês ou ano.
                </>
              ) : archiveYear ? (
                <>
                  <strong>Sem acertos em {archiveYear}.</strong> Nenhuma despesa rateada gerou
                  dívida entre os sócios nesse ano.
                </>
              ) : (
                <>
                  <strong>Nenhuma pendência por movimentação.</strong> Quando uma despesa
                  compartilhada gerar dívida, o detalhe do rateio aparece aqui.
                </>
              )}
            </p>
          </div>
        ) : (
          <div className="ac-groups">
            {groups.map((m) => (
              <DividaCard key={m.movementId} movement={m} currency={company.currencyCode} />
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
            {archiveYear
              ? `Pagamentos de acerto registrados em ${archiveYear}.`
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

      {/* ── modal registrar pagamento consolidado (net, do Resumo) ── */}
      <Modal
        open={netPaying !== null}
        title="Registrar pagamento"
        subtitle={netPaying ? `${netPaying.fromName} → ${netPaying.toName}` : ''}
        onClose={() => setNetPaying(null)}
      >
        {netPaying && (
          <NetPaymentForm
            company={company}
            settlement={netPaying}
            onSaved={() => {
              setNetPaying(null);
              void load();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

/**
 * Card de uma dívida (movimentação de origem) com todos os participantes.
 * Recorrentes ganham o selo "Recorrente"; o status geral vira "Quitada" quando
 * ninguém deve mais.
 */
function DividaCard({
  movement,
  currency,
}: {
  movement: MovementSettlement;
  currency: string | null;
}) {
  const m = movement;
  const quitada = m.remainingCents === 0;
  return (
    <article className="ac-group" key={m.movementId}>
      <header className="ac-group__head">
        <div className="ac-group__id">
          <div className="ac-group__badges">
            <span className={'ac-group__badge' + (m.kind === 'contribution' ? ' ac-group__badge--aporte' : '')}>
              {m.kind === 'contribution' ? 'Aporte' : 'Despesa'}
            </span>
            {m.recorrente && <span className="ac-group__badge ac-group__badge--rec">Recorrente</span>}
            <span className={'ac-status' + (quitada ? ' ac-status--paid' : '')}>
              {quitada ? 'Quitada' : 'Pendente'}
            </span>
          </div>
          <strong className="ac-group__title">{m.description}</strong>
          <span className="ac-group__meta">
            {m.kind === 'contribution' ? 'adiantado' : 'pago'} por {m.payerName} · {formatDateBr(m.spentOn)}
          </span>
        </div>
        {!quitada && (
          <span className="ac-group__total" data-financial>
            {formatMoney(m.remainingCents, currency)}
            <small>em aberto</small>
          </span>
        )}
      </header>

      <div className="ac-group__debts">
        {m.debts.map((d) => (
          <ParticipanteRow key={d.debtorId} debt={d} payerName={m.payerName} currency={currency} />
        ))}
      </div>

      <footer className="ac-group__foot">
        <span>
          Total da dívida <strong data-financial>{formatMoney(m.amountCents, currency)}</strong>
        </span>
        <span>
          {quitada ? (
            'Tudo acertado'
          ) : (
            <>
              Em aberto{' '}
              <strong className="ac-debt__amount" data-financial>
                {formatMoney(m.remainingCents, currency)}
              </strong>
            </>
          )}
        </span>
      </footer>
    </article>
  );
}

/** Uma linha por sócio dentro do card (só leitura): pago (verde + data) ou em aberto. */
function ParticipanteRow({
  debt,
  payerName,
  currency,
}: {
  debt: MovementDebt;
  payerName: string;
  currency: string | null;
}) {
  const d = debt;
  const status = d.remainingCents === 0 ? 'quitado' : d.paidCents > 0 ? 'parcial' : 'pendente';
  return (
    <div className="ac-debt" key={d.debtorId}>
      <span className={'ac-debt__avatar' + (status === 'quitado' ? ' ac-debt__avatar--paid' : '')}>
        {status === 'quitado' ? <IconCheck /> : initials(d.debtorName)}
      </span>
      <span className="ac-debt__text">
        <strong>{d.debtorName}</strong> · cabe{' '}
        <strong data-financial>{formatMoney(d.originalCents, currency)}</strong>
        {status === 'quitado' ? (
          <span className="ac-debt__sub ac-debt__sub--paid">
            pagou {formatMoney(d.originalCents, currency)} para {payerName}
            {d.lastPaidOn ? ` em ${formatDateBr(d.lastPaidOn)}` : ''}
          </span>
        ) : status === 'parcial' ? (
          <span className="ac-debt__sub">
            pagou {formatMoney(d.paidCents, currency)} · em aberto{' '}
            <strong className="ac-debt__amount" data-financial>
              {formatMoney(d.remainingCents, currency)}
            </strong>{' '}
            para {payerName}
          </span>
        ) : (
          <span className="ac-debt__sub">
            em aberto{' '}
            <strong className="ac-debt__amount" data-financial>
              {formatMoney(d.remainingCents, currency)}
            </strong>{' '}
            para {payerName}
          </span>
        )}
      </span>
      {/* Só leitura: pagar é pelo "Resumo dos acertos". Quitado ganha o selo
          "Pago"; pendente já diz "em aberto R$X" no texto, sem selo redundante. */}
      {status === 'quitado' && <span className="ac-status ac-status--paid">Pago</span>}
    </div>
  );
}

/** Pagamento consolidado do par (net), a partir do "Resumo dos acertos". */
function NetPaymentForm({
  company,
  settlement,
  onSaved,
}: {
  company: Company;
  settlement: Settlement;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(
    maskMoneyBRL(String(settlement.amountCents / 100).replace('.', ',')),
  );
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<PaymentMethod | ''>('pix');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const cents = maskedMoneyToCents(amount);
  const isPartial = cents != null && cents < settlement.amountCents;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (cents == null) return setError('Informe um valor válido.');
    if (cents > settlement.amountCents) {
      return setError(
        `O valor é maior que o pendente entre eles (${formatMoney(settlement.amountCents, company.currencyCode)}).`,
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
      <p className="mw-hint" style={{ marginTop: 0 }}>
        {settlement.fromName} precisa pagar {formatMoney(settlement.amountCents, company.currencyCode)} para{' '}
        {settlement.toName}, o saldo consolidado de todas as despesas entre eles.
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
          placeholder="Ex.: Pix do acerto do mês"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <p className="mw-hint">
        {isPartial
          ? `Pagamento parcial: sobra ${formatMoney(settlement.amountCents - (cents ?? 0), company.currencyCode)} entre eles.`
          : 'Esse valor zera o acerto entre os dois.'}
      </p>
      <div className="mw-actions">
        <Button type="submit" block disabled={saving}>
          {saving ? 'Registrando…' : isPartial ? 'Registrar pagamento parcial' : 'Registrar e quitar'}
        </Button>
      </div>
    </form>
  );
}
