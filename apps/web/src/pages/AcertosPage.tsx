import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageLoading } from '../components/PageLoading';
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
import {
  centsToMaskedInput,
  financeApi,
  formatMoney,
  maskedMoneyToCents,
} from '../finance/financeApi';
import { IconArrowRight, IconCheck } from './dashIcons';
import './dashboard.css';
import './acertos.css';
import '../finance/wizard.css';
import { MoneyField } from '../finance/MoneyField';

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

  if (state.status === 'loading') return <PageLoading label="carregando acertos…" />;
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

  /**
   * O que entra na lista de movimentações.
   *
   * Dívida em aberto não tem ano: ela existe até alguém pagar. Por isso a
   * página principal mostra TODA pendente, de qualquer ano, e os cards de ano
   * servem para revisitar o que já foi quitado. Antes o filtro de ano vinha
   * primeiro, e uma despesa de 2025 ainda em aberto sumia da tela.
   *
   * No arquivo de um ano, trava naquele ano e mostra tudo, quitado ou não.
   * Com busca, procura em todos os anos: quem digita um nome quer achar, não
   * ser barrado por recorte de período.
   */
  const groups = movements
    .filter((m) => (archiveYear ? m.spentOn.startsWith(archiveYear) : true))
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
                      {formatMoney(totalAno)}, já contados no saldo
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
            placeholder="Buscar por nome ou mês (ex.: Studio, março)"
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
              {settlements.map((s) => {
                const chave = `${s.fromMemberId}-${s.toMemberId}`;
                return (
                  <article className="sac" key={chave}>
                    <div className="sac__main">
                      <span className="sac__avatar">{initials(s.fromName)}</span>
                      <div className="sac__body">
                        <p className="sac__line">
                          <strong>{s.fromName}</strong> precisa pagar{' '}
                          <strong className="sac__amount" data-financial>
                            {formatMoney(s.amountCents)}
                          </strong>{' '}
                          para <strong>{s.toName}</strong>
                        </p>
                        <span className="sac__status">Pendente</span>
                      </div>
                      <div className="sac__actions">
                        {/* Página própria, e não painel embutido: a pessoa quer
                            ver despesa por despesa e marcar cada uma como paga,
                            e isso não cabe dentro de um card de resumo. */}
                        <Link
                          className="sac__why"
                          to={`/acertos/entre/${s.fromMemberId}/${s.toMemberId}`}
                        >
                          Ver o que está devendo
                        </Link>
                        <Button onClick={() => setNetPaying(s)}>Registrar pagamento</Button>
                      </div>
                    </div>
                  </article>
                );
              })}
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
              const fmt = (c: number) => formatMoney(c);
              const result =
                net < 0 ? 'Precisa pagar' : net > 0 ? 'Vai receber' : 'Tudo certo';
              const explain =
                net < 0
                  ? 'Esse saldo considera a parte que cabia, o que já pagou e os acertos registrados.'
                  : net > 0
                    ? 'Pagou mais despesas do que a parte que cabia, então tem valor a receber.'
                    : 'As contas estão em dia com os outros sócios.';
              /**
               * Com quem essa pessoa acerta, nos DOIS sentidos: no modelo por
               * par alguém pode receber de um sócio e dever a outro ao mesmo
               * tempo, e listar só um lado deixaria o total sem fechar.
               */
              const destinos = settlements
                .filter((st) => st.fromMemberId === b.memberId || st.toMemberId === b.memberId)
                .map((st) => {
                  const paga = st.fromMemberId === b.memberId;
                  return {
                    paga,
                    nome: paga ? st.toName : st.fromName,
                    deId: st.fromMemberId,
                    paraId: st.toMemberId,
                    cents: st.amountCents,
                  };
                })
                .sort((a, z) => z.cents - a.cents);
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
                  {/* "Precisa pagar R$ 625,80" sem dizer PARA QUEM deixava a
                      pergunta pela metade. O destino vem aqui, e cada nome leva
                      à lista do que compõe aquela dívida. */}
                  {destinos.length > 0 && (
                    <ul className="sld__destinos">
                      {destinos.map((d) => (
                        <li key={d.deId + d.paraId}>
                          {d.paga ? 'paga a ' : 'recebe de '}
                          <Link to={`/acertos/entre/${d.deId}/${d.paraId}`}>{d.nome}</Link>{' '}
                          <span data-financial>{fmt(d.cents)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
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
            Tudo que ainda está em aberto, de qualquer ano. O que já foi quitado sai daqui e fica
            nos cards de "Anos anteriores" no topo. Para pagar, use o Resumo dos acertos acima.
          </p>
        )}
        {groups.length === 0 ? (
          <div className="dash-emptyrow">
            <p>
              {hasFilter ? (
                <>
                  <strong>Nada encontrado.</strong> Nenhuma movimentação bate com "{query}", em ano
                  nenhum.
                </>
              ) : archiveYear ? (
                <>
                  <strong>Sem acertos em {archiveYear}.</strong> Nenhuma despesa rateada gerou
                  dívida entre os sócios nesse ano.
                </>
              ) : (
                <>
                  <strong>Nada em aberto.</strong> Todas as despesas compartilhadas já foram
                  acertadas entre os sócios. Quando uma nova gerar dívida, ela aparece aqui.
                </>
              )}
            </p>
          </div>
        ) : (
          <div className="ac-groups">
            {agrupadasPorMovimentacao(groups).map((g) => (
                <DividaCard key={g.cabeca.movementId} grupo={g} />
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
                  <strong data-financial>{formatMoney(p.amountCents)}</strong> para{' '}
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
 * Junta os blocos da MESMA movimentação (a API manda um por credor quando mais
 * de um sócio pagou). Um card por despesa, na ordem em que já vieram.
 */
interface MovimentacaoAgrupada {
  /** O primeiro bloco: descrição, data e valor são os mesmos em todos. */
  cabeca: MovementSettlement;
  /** Um bloco por credor (quase sempre só um). */
  blocos: MovementSettlement[];
}

function agrupadasPorMovimentacao(lista: MovementSettlement[]): MovimentacaoAgrupada[] {
  const porId = new Map<string, MovimentacaoAgrupada>();
  for (const m of lista) {
    const atual = porId.get(m.movementId);
    if (atual) atual.blocos.push(m);
    else porId.set(m.movementId, { cabeca: m, blocos: [m] });
  }
  return [...porId.values()];
}

/**
 * Card de uma dívida (movimentação de origem) com todos os participantes.
 * Recorrentes ganham o selo "Recorrente"; o status geral vira "Quitada" quando
 * ninguém deve mais.
 *
 * Com dois pagadores, a despesa é uma só e os credores são dois: o card fica
 * único e as dívidas aparecem separadas por quem adiantou. Dois cards com o
 * mesmo título faziam a mesma despesa parecer duas.
 */
function DividaCard({ grupo }: { grupo: MovimentacaoAgrupada }) {
  const { cabeca: m, blocos } = grupo;
  const variosCredores = blocos.length > 1;
  const remaining = blocos.reduce((s, b) => s + b.remainingCents, 0);
  const quitada = remaining === 0;
  return (
    <article className="ac-group">
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
            {m.kind === 'contribution' ? 'adiantado' : 'pago'} por{' '}
            {blocos.map((b) => b.payerName).join(' e ')} · {formatDateBr(m.spentOn)}
          </span>
        </div>
        {!quitada && (
          <span className="ac-group__total" data-financial>
            {formatMoney(remaining)}
            <small>em aberto</small>
          </span>
        )}
      </header>

      {blocos.map((b) => (
        <div className="ac-group__debts" key={b.payerId}>
          {variosCredores && (
            // Só o nome do credor: o quanto cada um adiantou não vem neste
            // payload, e inventar o número seria pior que omitir.
            <span className="ac-group__credor">quem deve a {b.payerName}</span>
          )}
          {b.debts.map((d) => (
            <ParticipanteRow key={d.debtorId} debt={d} payerName={b.payerName} />
          ))}
        </div>
      ))}

      <footer className="ac-group__foot">
        <span>
          Total da dívida <strong data-financial>{formatMoney(m.amountCents)}</strong>
        </span>
        <span>
          {quitada ? (
            'Tudo acertado'
          ) : (
            <>
              Em aberto{' '}
              <strong className="ac-debt__amount" data-financial>
                {formatMoney(remaining)}
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
}: {
  debt: MovementDebt;
  payerName: string;
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
        <strong data-financial>{formatMoney(d.originalCents)}</strong>
        {status === 'quitado' ? (
          <span className="ac-debt__sub ac-debt__sub--paid">
            pagou {formatMoney(d.originalCents)} para {payerName}
            {d.lastPaidOn ? ` em ${formatDateBr(d.lastPaidOn)}` : ''}
          </span>
        ) : status === 'parcial' ? (
          <span className="ac-debt__sub">
            pagou {formatMoney(d.paidCents)} · em aberto{' '}
            <strong className="ac-debt__amount" data-financial>
              {formatMoney(d.remainingCents)}
            </strong>{' '}
            para {payerName}
          </span>
        ) : (
          <span className="ac-debt__sub">
            em aberto{' '}
            <strong className="ac-debt__amount" data-financial>
              {formatMoney(d.remainingCents)}
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
export function NetPaymentForm({
  company,
  settlement,
  onSaved,
}: {
  company: Company;
  settlement: Settlement;
  onSaved: () => void;
}) {
  // centsToMaskedInput e não String(cents / 100): dividir por 100 aqui punha um
  // float no meio do caminho, e float em dinheiro é justamente o que a regra do
  // Plim proíbe. Só a formatação final divide por 100.
  const [amount, setAmount] = useState(centsToMaskedInput(settlement.amountCents));
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
        `O valor é maior que o pendente entre eles (${formatMoney(settlement.amountCents)}).`,
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
        {settlement.fromName} precisa pagar {formatMoney(settlement.amountCents)} para{' '}
        {settlement.toName}, o saldo consolidado de todas as despesas entre eles.
      </p>
      <div className="mw-form">
        <MoneyField label="Valor pago (R$)" value={amount} onChange={setAmount} autoFocus />
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
          ? `Pagamento parcial: sobra ${formatMoney(settlement.amountCents - (cents ?? 0))} entre eles.`
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
