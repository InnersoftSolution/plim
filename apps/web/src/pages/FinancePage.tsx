import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  recurringCategoryCatalog,
  recurringFrequencyCatalog,
  type Category,
  type Company,
  type CompanyMember,
  type Expense,
  type RecurringCost,
  type RecurringCostList,
} from '@plim/shared';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { companyApi, messageForError } from '../company/companyApi';
import { useActiveCompany } from '../company/ActiveCompanyContext';
import { FinChart, type ChartPoint } from '../finance/FinChart';
import { MovementWizard } from '../finance/MovementWizard';
import { MovementEditForm } from '../finance/MovementEditForm';
import { RecurringCostForm } from '../finance/RecurringCostForm';
import { financeApi, formatMoney } from '../finance/financeApi';
import { categoryApi } from '../finance/categoryApi';
import { recurringApi } from '../finance/recurringApi';
import { dueBucket, dueLabel, isPayable, payableExpenses } from '../finance/due';
import { IconArrowRight, IconCheck, IconPlus, IconRepeat, IconWallet } from './dashIcons';
import './dashboard.css';
import './finance.css';

/**
 * Central de Movimentações, não é só tabela: cada registro explica o que é
 * e como afeta os cálculos (total gasto, custo mensal, acertos).
 */

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | {
      status: 'ready';
      company: Company;
      members: CompanyMember[];
      expenses: Expense[];
      recurring: RecurringCostList;
      categories: Category[];
    };

type Filter = 'todos' | 'receitas' | 'despesas' | 'aportes' | 'recorrentes' | 'a-pagar';

/** Item unificado da lista (despesa/aporte datados ou custo recorrente). */
type MovItem =
  | { kind: 'expense' | 'contribution' | 'revenue'; expense: Expense }
  | { kind: 'recurring'; cost: RecurringCost };

export function FinancePage() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const { company: activeCompany } = useActiveCompany();
  const [filter, setFilter] = useState<Filter>('todos');
  const [thisMonth, setThisMonth] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [detail, setDetail] = useState<MovItem | null>(null);
  const [editingCost, setEditingCost] = useState<RecurringCost | null>(null);
  const [editingMovement, setEditingMovement] = useState<Expense | null>(null);
  const [searchParams] = useSearchParams();
  const [flashId, setFlashId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const [members, expenses, recurring, categories] = await Promise.all([
        companyApi.listMembers(activeCompany.id),
        financeApi.listExpenses(activeCompany.id),
        recurringApi.list(activeCompany.id),
        categoryApi.list(activeCompany.id).catch(() => [] as Category[]),
      ]);
      setState({ status: 'ready', company: activeCompany, members, expenses, recurring, categories });
    } catch (err) {
      setState({ status: 'error', message: messageForError(err) });
    }
  }, [activeCompany]);

  useEffect(() => {
    void load();
  }, [load]);

  // Chegou da Home com ?filtro=a-pagar: já abre na aba de contas a pagar.
  useEffect(() => {
    const f = searchParams.get('filtro');
    if (f === 'a-pagar' || f === 'despesas' || f === 'aportes' || f === 'recorrentes') {
      setFilter(f);
    }
  }, [searchParams]);

  // Chegou da Home clicando numa movimentação (?mov=id): rola até ela e destaca.
  useEffect(() => {
    if (state.status !== 'ready') return;
    const mov = searchParams.get('mov');
    if (!mov) return;
    setFlashId(mov);
    const t1 = setTimeout(() => {
      document.getElementById(`mov-${mov}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    const t2 = setTimeout(() => setFlashId(null), 2600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [state.status, searchParams]);

  if (state.status === 'loading') return <p className="fin-muted">carregando movimentações…</p>;
  if (state.status === 'error') return <p className="fin-muted">{state.message}</p>;
  if (state.status === 'empty') return <p className="fin-muted">Crie sua empresa primeiro.</p>;

  const { company, members, expenses, recurring, categories } = state;
  const nameOf = (id: string) => members.find((m) => m.id === id)?.fullName ?? 'Sócio';
  const categoryOf = (id: string | null) =>
    id ? categories.find((c) => c.id === id) ?? null : null;
  const currency = company.currencyCode;

  /* ── números dos cards, só CONFIRMADAS e PAGAS entram (aporte não é gasto, RB002) ── */
  const monthKey = new Date().toISOString().slice(0, 7);
  const confirmed = (e: Expense) => e.confirmationStatus === 'confirmed';
  const gastoCents = expenses
    .filter((e) => e.kind === 'expense' && confirmed(e) && e.paymentStatus === 'paid')
    .reduce((s, e) => s + e.amountCents, 0);
  // Receita: dinheiro que entrou (não divide entre sócios, não é gasto).
  const receitaCents = expenses
    .filter((e) => e.kind === 'revenue' && confirmed(e))
    .reduce((s, e) => s + e.amountCents, 0);
  // Saúde do negócio: recebido − gasto (aportes ficam à parte, são capital).
  const resultadoCents = receitaCents - gastoCents;
  // Movimentações aguardando MINHA confirmação (backend marca canConfirm).
  const toConfirm = expenses.filter((e) => e.canConfirm);
  // Contas a pagar (jornada de vencimento): vencidas + a vencer.
  const payable = payableExpenses(expenses);
  const overduePayable = payable.filter((e) => dueBucket(e) === 'overdue');
  const payableCents = payable.reduce((s, e) => s + e.amountCents, 0);

  /* ── lista filtrada ── */
  const dated: MovItem[] = expenses
    .filter((e) => {
      if (filter === 'despesas' && e.kind !== 'expense') return false;
      if (filter === 'aportes' && e.kind !== 'contribution') return false;
      if (filter === 'receitas' && e.kind !== 'revenue') return false;
      if (filter === 'recorrentes') return false;
      if (filter === 'a-pagar' && !isPayable(e)) return false;
      if (thisMonth && !e.spentOn.startsWith(monthKey)) return false;
      return true;
    })
    .map((e) => ({ kind: e.kind, expense: e }) as MovItem);
  // Cadastro de recorrente é uma REGRA, não uma movimentação: em "Todos" só
  // aparece a conta a pagar gerada por ele (senão parece a mesma despesa 2x).
  const recurringItems: MovItem[] =
    filter === 'recorrentes'
      ? recurring.costs.map((c) => ({ kind: 'recurring', cost: c }) as MovItem)
      : [];
  const items = [...recurringItems, ...dated];
  const nothingYet = expenses.length === 0 && recurring.costs.length === 0;

  /** Despesa gera acerto quando outra pessoa (além de quem pagou) tem parte nela. */
  function generatesSettlement(e: Expense): boolean {
    return e.shares.some((s) => s.memberId !== e.paidByMemberId && s.shareCents > 0);
  }

  async function decide(expenseId: string, decision: 'confirm' | 'refuse') {
    setBusyId(expenseId);
    try {
      if (decision === 'confirm') await financeApi.confirmMovement(company.id, expenseId);
      else await financeApi.refuseMovement(company.id, expenseId);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function markPaid(expenseId: string) {
    setBusyId(expenseId);
    try {
      await financeApi.payExpense(company.id, expenseId);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  /* ── gráfico mensal ──
   * Padrão: FLUXO (entrou x saiu) + projeção de gastos do próximo mês.
   * Aba "Aportes": série única de aportes por mês. */
  const isFlowChart = filter !== 'aportes';
  const chart = isFlowChart
    ? buildFlowSeries(expenses, recurring.monthlyTotalCents)
    : buildMonthlySeries(expenses, 'contribution', recurring.monthlyTotalCents);
  const showChart = filter !== 'recorrentes' && filter !== 'a-pagar' && !nothingYet;
  const nextLabel = chart.points.find((p) => p.projected)?.label ?? 'próximo mês';

  const chartTitle = isFlowChart ? 'Entradas e saídas' : 'Aportes por mês';
  const chartSubtitle = isFlowChart
    ? 'O que entrou (azul) e o que saiu (vermelho) por mês, com uma estimativa de gastos do próximo mês.'
    : 'Dinheiro que os sócios colocaram no negócio, mês a mês.';
  const chartCaption = isFlowChart
    ? `Projeção de ${nextLabel}: média dos gastos registrados + ${formatMoney(recurring.monthlyTotalCents, currency)} de custos recorrentes ativos.`
    : 'Aportes não entram na projeção de gastos, são investimento, não custo.';
  const chartHelp = isFlowChart
    ? 'Azul é o que entrou (receitas), vermelho é o que saiu (despesas); a parte tracejada é o que ainda falta pagar no mês. A última barra é a projeção de gastos do próximo mês: média dos gastos registrados mais os custos recorrentes ativos. Passe o mouse em cada barra para ver o valor.'
    : undefined;
  const chartEmpty = isFlowChart
    ? 'Sem dados suficientes ainda. Registre entradas e despesas para o Plim mostrar o fluxo do negócio.'
    : 'Nenhum aporte registrado ainda.';

  return (
    <div className="fin fin--wide">
      {/* ── cabeçalho ── */}
      <div className="fin-head fin-head--row">
        <div>
          <h1>Movimentações</h1>
          <p>Acompanhe tudo que entrou, saiu ou foi investido na empresa.</p>
        </div>
        <Button onClick={() => setWizardOpen(true)}>
          <IconPlus /> Adicionar movimentação
        </Button>
      </div>

      {/* ── cards de resumo: saúde do negócio (recebido − gasto) ── */}
      <div className="dash-cards">
        <div className="dash-stat">
          <div className="dash-stat__icon dash-stat__icon--green"><IconArrowRight /></div>
          <span className="dash-stat__label">Recebido</span>
          <span className="dash-stat__value" data-financial>{formatMoney(receitaCents, currency)}</span>
          <span className="dash-stat__hint">Dinheiro que entrou na empresa (receitas).</span>
        </div>
        <div className="dash-stat">
          <div className="dash-stat__icon dash-stat__icon--ink"><IconWallet /></div>
          <span className="dash-stat__label">Total gasto</span>
          <span className="dash-stat__value" data-financial>{formatMoney(gastoCents, currency)}</span>
          <span className="dash-stat__hint">Só despesas, aportes não entram aqui.</span>
        </div>
        <div className={'dash-stat' + (resultadoCents < 0 ? ' dash-stat--warn' : '')}>
          <div className={'dash-stat__icon ' + (resultadoCents < 0 ? 'dash-stat__icon--warn' : 'dash-stat__icon--green')}>
            <IconRepeat />
          </div>
          <span className="dash-stat__label">Resultado</span>
          <span
            className="dash-stat__value"
            data-financial
            style={{ color: resultadoCents < 0 ? 'var(--rose-600)' : 'var(--color-status-positive)' }}
          >
            {resultadoCents < 0 ? '−' : '+'}
            {formatMoney(Math.abs(resultadoCents), currency)}
          </span>
          <span className="dash-stat__hint">
            {resultadoCents < 0
              ? 'A empresa gastou mais do que recebeu no período.'
              : receitaCents === 0
                ? 'Registre entradas para ver a saúde do negócio.'
                : 'Recebido menos gasto, a saúde do negócio.'}
          </span>
        </div>
        <button
          type="button"
          className={'dash-stat dash-stat--btn' + (overduePayable.length > 0 ? ' dash-stat--warn' : '')}
          onClick={() => setFilter('a-pagar')}
        >
          <div className={'dash-stat__icon ' + (overduePayable.length > 0 ? 'dash-stat__icon--warn' : 'dash-stat__icon--indigo')}>
            <IconWallet />
          </div>
          <span className="dash-stat__label">A vencer</span>
          <span className="dash-stat__value" data-financial>{formatMoney(payableCents, currency)}</span>
          <span className="dash-stat__hint">
            {payable.length === 0
              ? 'Nenhuma conta a pagar em aberto.'
              : overduePayable.length > 0
                ? `${payable.length} em aberto · ${overduePayable.length} vencida${overduePayable.length === 1 ? '' : 's'}.`
                : `${payable.length} conta${payable.length === 1 ? '' : 's'} a pagar em aberto.`}
          </span>
        </button>
      </div>

      {/* ── aguardando MINHA confirmação ── */}
      {toConfirm.length > 0 && (
        <section className="fin-confirm">
          <span className="fin-confirm__title">Confirme estes pagamentos</span>
          {toConfirm.map((e) => (
            <div className="fin-confirm__item" key={e.id}>
              <p className="fin-confirm__text">
                {e.createdByMemberId ? `${nameOf(e.createdByMemberId)} registrou` : 'Registraram'} que você{' '}
                {e.kind === 'contribution' ? 'aportou' : 'pagou'}{' '}
                <strong>{formatMoney(e.amountCents, currency)}</strong> em <strong>{e.description}</strong>.
                Confirme se essa informação está correta.
              </p>
              <div className="fin-confirm__actions">
                <Button onClick={() => decide(e.id, 'confirm')} disabled={busyId === e.id}>
                  Confirmar pagamento
                </Button>
                <button className="fin-confirm__refuse" onClick={() => decide(e.id, 'refuse')} disabled={busyId === e.id}>
                  Recusar
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ── alerta: contas a pagar (vencidas + a vencer) ── */}
      {payable.length > 0 && (
        <section className={'fin-due' + (overduePayable.length > 0 ? ' fin-due--alert' : '')}>
          <div className="fin-due__head">
            <span className="fin-due__title">
              {overduePayable.length > 0
                ? `${overduePayable.length} conta${overduePayable.length === 1 ? '' : 's'} vencida${overduePayable.length === 1 ? '' : 's'}`
                : 'Contas a pagar'}
            </span>
            <span className="fin-due__sub">
              {overduePayable.length > 0
                ? 'Marque como paga assim que quitar, contas vencidas podem gerar juros.'
                : 'Acompanhe os vencimentos para não deixar nada atrasar.'}
            </span>
          </div>
          <div className="fin-due__list">
            {payable.slice(0, 6).map((e) => {
              const overdue = dueBucket(e) === 'overdue';
              return (
                <div className={'fin-due__item' + (overdue ? ' is-overdue' : '')} key={e.id}>
                  <button type="button" className="fin-due__info" onClick={() => setDetail({ kind: e.kind, expense: e })}>
                    <span className="fin-due__desc">{e.description}</span>
                    <span className="fin-due__meta">
                      {e.dueDate ? dueLabel(e.dueDate) : 'a pagar'} · {nameOf(e.paidByMemberId)}
                    </span>
                  </button>
                  <span className="fin-due__value" data-financial>{formatMoney(e.amountCents, currency)}</span>
                  <Button onClick={() => markPaid(e.id)} disabled={busyId === e.id}>
                    Marcar como paga
                  </Button>
                </div>
              );
            })}
          </div>
          {payable.length > 6 && (
            <button type="button" className="fin-due__all" onClick={() => setFilter('a-pagar')}>
              Ver todas as {payable.length} contas a pagar
            </button>
          )}
        </section>
      )}

      {/* ── filtros ── */}
      <div className="fin-filters">
        {(
          [
            ['todos', 'Todos'],
            ['a-pagar', 'A pagar'],
            ['receitas', 'Entradas'],
            ['despesas', 'Despesas'],
            ['aportes', 'Aportes'],
            ['recorrentes', 'Custos recorrentes'],
          ] as [Filter, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={'fin-chip' + (filter === id ? ' fin-chip--active' : '')}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className={'fin-chip fin-chip--month' + (thisMonth ? ' fin-chip--active' : '')}
          onClick={() => setThisMonth((v) => !v)}
        >
          Este mês
        </button>
      </div>

      {/* ── evolução mensal + projeção ── */}
      {showChart && (
        <>
          <FinChart
            points={chart.points}
            currency={currency}
            title={chartTitle}
            subtitle={chartSubtitle}
            caption={chartCaption}
            emptyText={chartEmpty}
            helpText={chartHelp}
          />
        </>
      )}

      {/* ── lista ── */}
      {nothingYet ? (
        <div className="fin-card fin-emptybox">
          <h2>Nenhuma movimentação registrada ainda</h2>
          <p>
            Registre o primeiro gasto, aporte ou custo para o Plim começar a mostrar a situação
            financeira do negócio.
          </p>
          <Button onClick={() => setWizardOpen(true)}>
            <IconPlus /> Adicionar movimentação
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="fin-card">
          <p className="fin-empty">Nada nesse filtro. Troque o filtro ou registre uma nova movimentação.</p>
        </div>
      ) : (
        <div className="fin-movs">
          {items.map((item) => (
            <MovRow
              key={item.kind === 'recurring' ? `rc-${item.cost.id}` : item.expense.id}
              item={item}
              currency={currency}
              nameOf={nameOf}
              flash={item.kind !== 'recurring' && flashId === item.expense.id}
              generatesSettlement={generatesSettlement}
              onOpen={() => setDetail(item)}
            />
          ))}
        </div>
      )}

      {/* ── wizard (mesmo da Home) ── */}
      <Modal
        open={wizardOpen}
        title="Adicionar movimentação"
        subtitle="O Plim te guia passo a passo, e explica como cada registro afeta os cálculos."
        onClose={() => setWizardOpen(false)}
      >
        {wizardOpen && (
          <MovementWizard
            company={company}
            members={members}
            onCreated={() => {
              setWizardOpen(false);
              void load();
            }}
            onRefresh={() => void load()}
            onClose={() => setWizardOpen(false)}
          />
        )}
      </Modal>

      {/* ── detalhe ── */}
      <Modal
        open={detail != null}
        title="Detalhe da movimentação"
        onClose={() => setDetail(null)}
      >
        {detail && (
          <MovDetail
            item={detail}
            currency={currency}
            nameOf={nameOf}
            category={detail.kind !== 'recurring' ? categoryOf(detail.expense.categoryId) : null}
            generatesSettlement={generatesSettlement}
            busy={busyId != null}
            onDecide={async (id, d) => {
              await decide(id, d);
              setDetail(null);
            }}
            onPay={async (id) => {
              await markPaid(id);
              setDetail(null);
            }}
            onRemove={async (id) => {
              await financeApi.removeExpense(company.id, id);
              setDetail(null);
              await load();
            }}
            onClose={() => setDetail(null)}
            onSeeAcertos={() => {
              setDetail(null);
              navigate('/acertos');
            }}
            onEditRecurring={(cost) => {
              setDetail(null);
              setEditingCost(cost);
            }}
            onEditMovement={(exp) => {
              setDetail(null);
              setEditingMovement(exp);
            }}
          />
        )}
      </Modal>

      {/* ── editar custo recorrente ── */}
      <Modal
        open={editingCost != null}
        title="Editar custo recorrente"
        subtitle="Altere o valor, a frequência, a próxima cobrança ou quem paga."
        onClose={() => setEditingCost(null)}
      >
        {editingCost && (
          <RecurringCostForm
            company={company}
            members={members}
            cost={editingCost}
            onSaved={() => void load()}
            onClose={() => setEditingCost(null)}
          />
        )}
      </Modal>

      {/* ── editar movimentação (despesa/aporte/entrada) ── */}
      <Modal
        open={editingMovement != null}
        title="Editar movimentação"
        subtitle="Corrija os dados. O Plim recalcula o rateio quando o valor ou a divisão muda."
        onClose={() => setEditingMovement(null)}
      >
        {editingMovement && (
          <MovementEditForm
            company={company}
            members={members}
            expense={editingMovement}
            onSaved={() => void load()}
            onClose={() => setEditingMovement(null)}
          />
        )}
      </Modal>
    </div>
  );
}

/* ── linha da lista ── */
function MovRow({
  item,
  currency,
  nameOf,
  flash,
  generatesSettlement,
  onOpen,
}: {
  item: MovItem;
  currency: string | null;
  nameOf: (id: string) => string;
  flash: boolean;
  generatesSettlement: (e: Expense) => boolean;
  onOpen: () => void;
}) {
  if (item.kind === 'recurring') {
    const c = item.cost;
    const isOnce = c.frequency === 'once';
    return (
      <button type="button" className={'fin-mov' + (c.active ? '' : ' fin-mov--off')} onClick={onOpen}>
        <span className="fin-mov__icon fin-mov__icon--rec" aria-hidden="true">
          <IconRepeat />
        </span>
        <div className="fin-mov__body">
          <span className="fin-mov__desc">
            {c.name}
            <span className="fin-mov__badge fin-mov__badge--rec">{isOnce ? 'Única vez' : 'Recorrente'}</span>
          </span>
          <span className="fin-mov__meta">
            {freqLabel(c.frequency)} · pago por {nameOf(c.paidByMemberId)}
          </span>
        </div>
        <div className="fin-mov__right">
          <span className="fin-mov__value" data-financial>
            {formatMoney(c.amountCents, currency)}
          </span>
          <span className={'fin-mov__impact' + (!isOnce && c.active ? ' is-ok' : '')}>
            {isOnce ? 'pagamento único' : c.active ? 'no custo mensal' : 'inativo'}
          </span>
        </div>
      </button>
    );
  }
  const e = item.expense;
  const isAporte = e.kind === 'contribution';
  const isRevenue = e.kind === 'revenue';
  const gerou = !isAporte && !isRevenue && generatesSettlement(e);
  const conf = confInfo(e.confirmationStatus);
  const toPay = isPayable(e);
  const bucket = toPay ? dueBucket(e) : null;
  const overdue = bucket === 'overdue';
  // Despesa confirmada e já paga: estado resolvido, verde com selo "Paga".
  const paidExpense = e.kind === 'expense' && !toPay && conf.status === 'confirmed';
  return (
    <button
      type="button"
      id={`mov-${e.id}`}
      className={'fin-mov' + (flash ? ' fin-flash' : '') + (conf.dim ? ' fin-mov--off' : '')}
      onClick={onOpen}
    >
      <span
        className={
          'fin-mov__icon ' +
          (isRevenue
            ? 'fin-mov__icon--revenue'
            : isAporte
              ? 'fin-mov__icon--aporte'
              : toPay
                ? 'fin-mov__icon--due'
                : paidExpense
                  ? 'fin-mov__icon--paid'
                  : 'fin-mov__icon--despesa')
        }
        aria-hidden="true"
      >
        {paidExpense ? <IconCheck /> : isAporte || isRevenue ? <IconArrowRight /> : <IconWallet />}
      </span>
      <div className="fin-mov__body">
        <span className="fin-mov__desc">
          {e.description}
          {toPay ? (
            <span className={'fin-mov__badge fin-mov__badge--due' + (overdue ? ' fin-mov__badge--overdue' : '')}>
              {overdue ? 'Vencida' : 'A pagar'}
            </span>
          ) : paidExpense ? (
            <>
              <span className="fin-mov__badge">Despesa</span>
              <span className="fin-mov__badge fin-mov__badge--paid">Paga</span>
            </>
          ) : (
            <span
              className={
                'fin-mov__badge' +
                (isRevenue ? ' fin-mov__badge--revenue' : isAporte ? ' fin-mov__badge--aporte' : '')
              }
            >
              {isRevenue ? 'Entrada' : isAporte ? 'Aporte' : 'Despesa'}
            </span>
          )}
          {e.recurringCostId && (
            <span className="fin-mov__badge fin-mov__badge--rec" title="Gerada a partir de um custo recorrente">
              recorrente
            </span>
          )}
        </span>
        <span className="fin-mov__meta">
          {toPay && e.dueDate
            ? `Vence ${formatDate(e.dueDate)} · ${nameOf(e.paidByMemberId)} vai pagar`
            : isRevenue
              ? `${formatDate(e.spentOn)}${e.source ? ` · via ${e.source}` : ''}${e.account ? ` · em ${e.account}` : !e.source ? ` · recebido por ${nameOf(e.paidByMemberId)}` : ''}`
              : `${formatDate(e.spentOn)} · ${isAporte ? 'feito por' : 'pago por'} ${nameOf(e.paidByMemberId)}`}
        </span>
      </div>
      <div className="fin-mov__right">
        <span className="fin-mov__value" data-financial>
          {formatMoney(e.amountCents, currency)}
        </span>
        {toPay ? (
          <span className={'fin-mov__impact ' + (overdue ? 'is-refused' : 'is-pending')}>
            {e.dueDate ? dueLabel(e.dueDate) : 'a pagar'}
          </span>
        ) : conf.status === 'confirmed' ? (
          <span className={'fin-mov__impact' + (isRevenue ? ' is-ok' : isAporte ? ' is-neutral' : gerou ? ' is-warn' : '')}>
            {isRevenue ? 'entrou no caixa' : isAporte ? 'não é gasto' : gerou ? 'gerou acerto' : 'sem acerto'}
          </span>
        ) : (
          <span className={'fin-mov__impact ' + conf.cls}>{conf.short}</span>
        )}
      </div>
    </button>
  );
}

function confLabel(status: string): string {
  return status === 'pending'
    ? 'Aguardando confirmação'
    : status === 'refused'
      ? 'Recusada'
      : status === 'cancelled'
        ? 'Cancelada'
        : 'Confirmada';
}

/** Rótulos/cores por status de confirmação. */
function confInfo(status: string) {
  switch (status) {
    case 'pending':
      return { status, short: 'aguardando confirmação', cls: 'is-pending', dim: true };
    case 'refused':
      return { status, short: 'recusada', cls: 'is-refused', dim: true };
    case 'cancelled':
      return { status, short: 'cancelada', cls: 'is-refused', dim: true };
    default:
      return { status: 'confirmed', short: '', cls: '', dim: false };
  }
}

/* ── detalhe: explica o que a movimentação é e como afetou os cálculos ── */
function MovDetail({
  item,
  currency,
  nameOf,
  category,
  generatesSettlement,
  busy,
  onDecide,
  onPay,
  onRemove,
  onClose,
  onSeeAcertos,
  onEditRecurring,
  onEditMovement,
}: {
  item: MovItem;
  currency: string | null;
  nameOf: (id: string) => string;
  category: Category | null;
  generatesSettlement: (e: Expense) => boolean;
  busy: boolean;
  onDecide: (expenseId: string, decision: 'confirm' | 'refuse') => void;
  onPay: (expenseId: string) => void;
  onRemove: (expenseId: string) => Promise<void>;
  onClose: () => void;
  onSeeAcertos: () => void;
  onEditRecurring: (cost: RecurringCost) => void;
  onEditMovement: (exp: Expense) => void;
}) {
  // Exclusão em duas etapas: o botão vira uma confirmação no mesmo lugar.
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState('');
  // Narrowing explícito (o TS não liga cfg.tone ao item.kind).
  const exp = item.kind !== 'recurring' ? item.expense : null;
  const isDespesa = exp != null && exp.kind === 'expense';
  // Status de confirmação (só para despesa/aporte).
  const cst = exp?.confirmationStatus ?? 'confirmed';
  const notConfirmed = exp != null && cst !== 'confirmed';
  // Conta a pagar (jornada de vencimento).
  const toPay = exp != null && isPayable(exp);
  const overdue = toPay && dueBucket(exp!) === 'overdue';
  // Despesa confirmada e já quitada: estado resolvido ("Paga", verde).
  const paidExpense = isDespesa && !toPay && cst === 'confirmed';
  const impactLines = toPay
    ? [
        'Esta é uma conta a pagar: um lembrete com data de vencimento.',
        'Ela só entra no total gasto e nos acertos quando você marcar como paga.',
      ]
    : null;

  // Config por tipo (cabeçalho + impacto humano).
  const cfg =
    item.kind === 'recurring'
      ? {
          tone: 'rec' as const,
          tipo: item.cost.frequency === 'once' ? 'Pagamento único' : 'Custo recorrente',
          title: item.cost.name,
          amount: item.cost.amountCents,
          date: item.cost.nextChargeOn,
          status: item.cost.frequency === 'once' ? 'Registrado' : item.cost.active ? 'Ativo' : 'Inativo',
          impact:
            item.cost.frequency === 'once'
              ? [
                  'Este é um pagamento único, acontece uma vez só.',
                  'Fica no histórico, mas não entra no custo mensal da empresa.',
                ]
              : [
                  'Este custo entra no cálculo mensal enquanto estiver ativo.',
                  'Ele ajuda a entender quanto custa manter a empresa funcionando.',
                ],
        }
      : item.expense.kind === 'revenue'
        ? {
            tone: 'aporte' as const,
            tipo: 'Entrada',
            title: item.expense.description,
            amount: item.expense.amountCents,
            date: item.expense.spentOn,
            status: 'Registrada',
            impact: [
              'Esta é uma entrada: dinheiro que a empresa recebeu.',
              'Ela melhora o resultado (recebido menos gasto) e não divide entre os sócios.',
            ],
          }
        : item.expense.kind === 'contribution'
        ? {
            tone: 'aporte' as const,
            tipo: 'Aporte',
            title: item.expense.description,
            amount: item.expense.amountCents,
            date: item.expense.spentOn,
            status: 'Registrado',
            impact: [
              'Este aporte representa dinheiro colocado na empresa.',
              'Ele não é tratado como despesa e não gera acerto automático entre sócios.',
            ],
          }
        : {
            tone: 'despesa' as const,
            tipo: 'Despesa',
            title: item.expense.description,
            amount: item.expense.amountCents,
            date: item.expense.spentOn,
            status: 'Registrada',
            impact: [
              'Esta despesa entrou no total gasto da empresa.',
              'Ela pode gerar acerto entre sócios conforme a forma de divisão escolhida.',
            ],
          };

  return (
    <div className="movd">
      {/* 1) cabeçalho */}
      <div className="movd-head">
        <div className="movd-head__row">
          <span className={`movd-badge movd-badge--${cfg.tone}`}>{toPay ? 'Conta a pagar' : cfg.tipo}</span>
          <span className={'movd-status' + (paidExpense ? ' movd-status--paid' : '')}>
            {toPay ? (overdue ? 'Vencida' : 'A pagar') : paidExpense ? 'Paga' : exp ? confLabel(cst) : cfg.status}
          </span>
        </div>
        <h3 className="movd-title">{cfg.title}</h3>
        <div className="movd-amount" data-financial>{formatMoney(cfg.amount, currency)}</div>
        {toPay && exp?.dueDate ? (
          <span className="movd-date">Vencimento: {formatDate(exp.dueDate)}</span>
        ) : cfg.date ? (
          <span className="movd-date">
            {item.kind === 'recurring' ? 'Próxima cobrança: ' : ''}
            {formatDate(cfg.date)}
          </span>
        ) : null}
      </div>

      {/* confirmação pendente/recusada, bloco de destaque */}
      {notConfirmed && exp && (
        <div className={'movd-conf movd-conf--' + cst}>
          <p>
            {cst === 'pending'
              ? `Esta movimentação ainda não entrou nos cálculos porque está aguardando confirmação de ${nameOf(exp.paidByMemberId)}.`
              : cst === 'refused'
                ? `${nameOf(exp.paidByMemberId)} recusou este pagamento, então ele não entra nos cálculos. Você pode editar ou cancelar.`
                : 'Movimentação cancelada, fora dos cálculos, mas mantida no histórico.'}
          </p>
          {exp.canConfirm && cst === 'pending' && (
            <div className="movd-conf__actions">
              <Button onClick={() => onDecide(exp.id, 'confirm')} disabled={busy}>
                Confirmar pagamento
              </Button>
              <button className="fin-confirm__refuse" onClick={() => onDecide(exp.id, 'refuse')} disabled={busy}>
                Recusar
              </button>
            </div>
          )}
        </div>
      )}

      {/* conta a pagar, bloco de destaque com ação de pagar */}
      {toPay && exp && (
        <div className={'movd-conf movd-conf--' + (overdue ? 'refused' : 'pending')}>
          <p>
            {overdue
              ? `Esta conta ${exp.dueDate ? dueLabel(exp.dueDate) : 'está vencida'} e ainda não foi paga. Ela não entra nos cálculos até ser quitada.`
              : `Esta conta ${exp.dueDate ? dueLabel(exp.dueDate) : 'está em aberto'}. Marque como paga quando quitar, só então entra no total gasto e nos acertos.`}
          </p>
          <div className="movd-conf__actions">
            <Button onClick={() => onPay(exp.id)} disabled={busy}>
              Marcar como paga
            </Button>
          </div>
        </div>
      )}

      {/* 2) resumo humano do impacto */}
      <div className={`movd-impact movd-impact--${cfg.tone}`}>
        {exp?.recurringCostId && (
          <p>O Plim gerou esta cobrança automaticamente a partir do custo recorrente cadastrado.</p>
        )}
        {(impactLines ?? cfg.impact).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>

      {/* 3) dados financeiros */}
      <div className="movd-section">
        <span className="movd-section__title">Dados financeiros</span>
        <div className="mw-review">
          <Row k="Valor" v={formatMoney(cfg.amount, currency)} mono />
          <Row k="Moeda" v={currency ?? 'BRL'} />
          {item.kind === 'recurring' ? (
            <>
              <Row
                k={item.cost.frequency === 'once' ? 'Data do pagamento' : 'Data (próxima cobrança)'}
                v={item.cost.nextChargeOn ? formatDate(item.cost.nextChargeOn) : '—'}
              />
              <Row k="Quem paga" v={nameOf(item.cost.paidByMemberId)} />
              <Row k="Categoria" v={catLabel(item.cost.category)} />
              <Row k="Frequência" v={freqLabel(item.cost.frequency)} />
              <Row
                k="Equivalente mensal"
                v={item.cost.frequency === 'once' ? 'Pagamento único' : formatMoney(item.cost.monthlyEquivalentCents, currency)}
                mono={item.cost.frequency !== 'once'}
              />
              <Row k="Entrou no total gasto?" v="Não, custo recorrente é separado" />
              <Row
                k="Entra no custo mensal?"
                v={item.cost.frequency === 'once' ? 'Não, pagamento único' : item.cost.active ? 'Sim, enquanto ativo' : 'Não (inativo)'}
              />
              <Row
                k="Participou da projeção mensal?"
                v={item.cost.frequency === 'once' ? 'Não, pagamento único' : item.cost.active ? 'Sim, como custo recorrente' : 'Não (inativo)'}
              />
              <Row k="Gerou acerto?" v="Não" />
              {item.cost.note && <Row k="Observação" v={item.cost.note} />}
            </>
          ) : (
            <>
              {toPay && item.expense.dueDate ? (
                <>
                  <Row k="Vencimento" v={formatDate(item.expense.dueDate)} />
                  <Row k="Situação" v={overdue ? 'Vencida' : 'A pagar'} />
                </>
              ) : (
                <Row k="Data" v={formatDate(item.expense.spentOn)} />
              )}
              {item.expense.kind === 'revenue' && item.expense.source && (
                <Row k="Origem" v={item.expense.source} />
              )}
              {item.expense.kind !== 'contribution' && (
                <Row k="Categoria" v={category ? category.name : 'Sem categoria'} />
              )}
              {item.expense.tags.length > 0 && (
                <div className="mw-review__row">
                  <span>Tags</span>
                  <span className="movd-tags">
                    {item.expense.tags.map((t) => (
                      <span className="movd-tag" key={t}>
                        {t}
                      </span>
                    ))}
                  </span>
                </div>
              )}
              <Row
                k={
                  toPay
                    ? 'Quem vai pagar'
                    : item.expense.kind === 'revenue'
                      ? 'Entrou na conta de'
                      : cfg.tone === 'aporte'
                        ? 'Feito por'
                        : 'Pago por'
                }
                v={
                  item.expense.kind === 'revenue'
                    ? item.expense.account || nameOf(item.expense.paidByMemberId)
                    : nameOf(item.expense.paidByMemberId)
                }
              />
              {item.expense.createdByMemberId && item.expense.createdByMemberId !== item.expense.paidByMemberId && (
                <Row k="Cadastrado por" v={nameOf(item.expense.createdByMemberId)} />
              )}
              <Row k="Status de confirmação" v={confLabel(cst)} />
              {cfg.tone === 'despesa' && (
                <Row
                  k="Forma de divisão"
                  v={item.expense.splitMode === 'equal' ? 'Igualmente' : item.expense.splitMode === 'custom' ? 'Personalizada' : 'Por participação'}
                />
              )}
              <Row
                k="Entrou nos cálculos?"
                v={
                  toPay
                    ? 'Não, conta a pagar em aberto'
                    : notConfirmed
                      ? 'Não, aguardando/recusada'
                      : cfg.tone === 'aporte'
                        ? 'Sim (como aporte, não gasto)'
                        : 'Sim'
                }
              />
              <Row
                k="Entrou no total gasto?"
                v={toPay ? 'Não ainda, só quando for paga' : cfg.tone === 'aporte' ? 'Não, aporte não é despesa' : notConfirmed ? 'Não ainda' : 'Sim'}
              />
              <Row k="Entra no custo mensal?" v="Não" />
              <Row
                k="Participou da projeção mensal?"
                v={toPay ? 'Não, entra quando for paga' : cfg.tone === 'aporte' ? 'Não, aporte não entra na projeção' : 'Sim, entra na média de gastos'}
              />
              <Row
                k="Gerou acerto?"
                v={toPay ? 'Ainda não' : cfg.tone === 'aporte' ? 'Não (automático)' : generatesSettlement(item.expense) ? 'Sim' : 'Não'}
              />
              {item.expense.note && <Row k="Observação" v={item.expense.note} />}
            </>
          )}
        </div>
      </div>

      {/* 4) divisão entre sócios (só despesa compartilhada) */}
      {isDespesa && exp && exp.shares.length > 1 && (
        <div className="movd-section">
          <span className="movd-section__title">Divisão entre sócios</span>
          <div className="movd-shares">
            {exp.shares.map((s) => {
              const paid = s.memberId === exp.paidByMemberId;
              return (
                <div className={'movd-share' + (paid ? ' is-payer' : '')} key={s.memberId}>
                  <span className="movd-share__name">
                    {nameOf(s.memberId)}
                    {paid && <span className="movd-share__badge">pagou</span>}
                  </span>
                  <span className="movd-share__value" data-financial>
                    cabe {formatMoney(s.shareCents, currency)}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="movd-note">
            {generatesSettlement(exp)
              ? `Essa despesa foi paga por ${nameOf(exp.paidByMemberId)}, mas parte dela cabia a ${exp.shares
                  .filter((s) => s.memberId !== exp.paidByMemberId && s.shareCents > 0)
                  .map((s) => nameOf(s.memberId))
                  .join(', ')}. Por isso, ela entrou no cálculo de acertos.`
              : `A parte que cabia a ${nameOf(exp.paidByMemberId)} coincide com o que foi pago, sem diferença a acertar.`}
          </p>
        </div>
      )}

      {/* 5) acerto relacionado */}
      <div className="movd-section">
        <span className="movd-section__title">Acerto entre sócios</span>
        {isDespesa && exp && generatesSettlement(exp) ? (
          <>
            <div className="movd-settle">
              {exp.shares
                .filter((s) => s.memberId !== exp.paidByMemberId && s.shareCents > 0)
                .map((s) => (
                  <div className="movd-settle__row" key={s.memberId}>
                    <span>
                      <strong>{nameOf(s.memberId)}</strong> deve{' '}
                      <strong className="movd-settle__amount">{formatMoney(s.shareCents, currency)}</strong> para{' '}
                      <strong>{nameOf(exp.paidByMemberId)}</strong>
                    </span>
                  </div>
                ))}
            </div>
            <p className="movd-note">
              Estes são os valores que esta despesa gerou. O total consolidado (já descontando
              dívidas cruzadas e pagamentos) está na tela de Acertos.
            </p>
            <button className="movd-link" onClick={onSeeAcertos}>
              Ver acertos <IconArrowRight />
            </button>
          </>
        ) : (
          <p className="movd-note">Esta movimentação não gerou acerto entre sócios.</p>
        )}
      </div>

      {/* 5) ações */}
      <div className="movd-actions">
        {confirmingRemove && exp ? (
          <div className="movd-removeconfirm">
            {removeError && <div className="form-error">{removeError}</div>}
            <p className="movd-removeconfirm__text">
              Tem certeza que deseja excluir <strong>{cfg.title}</strong>?
            </p>
            <div className="movd-removeconfirm__warn">
              Essa ação é <strong>irreversível</strong>. A movimentação de{' '}
              {formatMoney(cfg.amount, currency)} sai do histórico
              {isDespesa && generatesSettlement(exp)
                ? ', e os saldos e acertos entre sócios são recalculados sem ela.'
                : '.'}
            </div>
            <div className="movd-removeconfirm__actions">
              <button
                type="button"
                className="movd-removeconfirm__confirm"
                disabled={removeBusy}
                onClick={async () => {
                  setRemoveBusy(true);
                  setRemoveError('');
                  try {
                    await onRemove(exp.id);
                  } catch (err) {
                    setRemoveError(messageForError(err));
                    setRemoveBusy(false);
                  }
                }}
              >
                {removeBusy ? 'Excluindo…' : 'Sim, excluir definitivamente'}
              </button>
              <Button variant="ghost" onClick={() => setConfirmingRemove(false)} disabled={removeBusy}>
                Voltar
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="movd-actions__soon">
              {item.kind === 'recurring' ? (
                <button
                  type="button"
                  className="movd-btn"
                  onClick={() => onEditRecurring(item.cost)}
                >
                  Editar custo recorrente
                </button>
              ) : exp && exp.recurringCostId ? (
                <button type="button" className="movd-btn" disabled title="Edite pelo custo recorrente">
                  Gerada por custo recorrente
                </button>
              ) : exp ? (
                <button type="button" className="movd-btn" onClick={() => onEditMovement(exp)}>
                  Editar movimentação
                </button>
              ) : null}
              {exp && (
                <button
                  type="button"
                  className="movd-btn movd-btn--danger"
                  onClick={() => setConfirmingRemove(true)}
                >
                  Excluir movimentação
                </button>
              )}
            </div>
            <Button block onClick={onClose}>
              Fechar
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="mw-review__row">
      <span>{k}</span>
      <strong data-financial={mono || undefined}>{v}</strong>
    </div>
  );
}

const catLabel = (id: string) => recurringCategoryCatalog.find((c) => c.id === id)?.label ?? id;
const freqLabel = (id: string) => recurringFrequencyCatalog.find((f) => f.id === id)?.label ?? id;

/**
 * Série mensal: 5 meses passados + mês atual + projeção do próximo.
 * Projeção (só despesas, determinística, R$0 de IA):
 * média dos meses COM registro + custos recorrentes ativos.
 */
/**
 * Série de FLUXO: por mês, o que ENTROU (receitas) e o que SAIU (despesas
 * pagas), mais o "a pagar" do mês. A última barra é a projeção de gastos.
 * Determinística, R$0 de IA.
 */
function buildFlowSeries(
  expenses: Expense[],
  recurringMonthlyCents: number,
): { points: ChartPoint[] } {
  const now = new Date();
  const monthShort = (d: Date) =>
    d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  const confirmed = (e: Expense) => e.confirmationStatus === 'confirmed';
  const isIn = (e: Expense) => e.kind === 'revenue' && confirmed(e);
  const isOut = (e: Expense) => e.kind === 'expense' && confirmed(e) && (e.paymentStatus ?? 'paid') === 'paid';
  const isPending = (e: Expense) => e.kind === 'expense' && confirmed(e) && e.paymentStatus === 'unpaid';
  const billMonth = (e: Expense) => (e.dueDate ?? e.spentOn).slice(0, 7);

  const points: ChartPoint[] = [];
  const manualOutByMonth: number[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const inCents = expenses.filter((e) => isIn(e) && e.spentOn.startsWith(key)).reduce((s, e) => s + e.amountCents, 0);
    const outExp = expenses.filter((e) => isOut(e) && e.spentOn.startsWith(key));
    const outCents = outExp.reduce((s, e) => s + e.amountCents, 0);
    const pendingCents = expenses.filter((e) => isPending(e) && billMonth(e) === key).reduce((s, e) => s + e.amountCents, 0);
    manualOutByMonth.push(outExp.filter((e) => !e.recurringCostId).reduce((s, e) => s + e.amountCents, 0));
    points.push({ key, label: monthShort(d), inCents, outCents, pendingCents, current: i === 0 });
  }
  const withData = manualOutByMonth.filter((c) => c > 0);
  const avg = withData.length > 0 ? Math.round(withData.reduce((s, c) => s + c, 0) / withData.length) : 0;
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  points.push({ key: 'proj', label: monthShort(next), outCents: avg + recurringMonthlyCents, projected: true });
  return { points };
}

function buildMonthlySeries(
  expenses: Expense[],
  kind: 'expense' | 'contribution',
  recurringMonthlyCents: number,
): { points: ChartPoint[] } {
  const now = new Date();
  const monthShort = (d: Date) =>
    d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  const points: ChartPoint[] = [];

  // Regra do produto: só o que está CONFIRMADO e PAGO conta como gasto REAL.
  const counted = (e: Expense) =>
    e.kind === kind && e.confirmationStatus === 'confirmed' && (e.paymentStatus ?? 'paid') === 'paid';
  // Contas do mês ainda NÃO pagas (recorrentes geradas, contas a pagar):
  // entram como "a pagar" (alerta), agrupadas pelo vencimento.
  const pendingBill = (e: Expense) =>
    e.kind === kind && e.confirmationStatus === 'confirmed' && e.paymentStatus === 'unpaid';
  const billMonth = (e: Expense) => (e.dueDate ?? e.spentOn).slice(0, 7);

  // Base da projeção: só lançamentos manuais. As cobranças geradas de custos
  // recorrentes já entram pela soma recorrente, sem contar duas vezes.
  const manualByMonth: number[] = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const inMonth = expenses.filter((e) => counted(e) && e.spentOn.startsWith(key));
    const cents = inMonth.reduce((s, e) => s + e.amountCents, 0);
    const pendingCents = expenses
      .filter((e) => pendingBill(e) && billMonth(e) === key)
      .reduce((s, e) => s + e.amountCents, 0);
    manualByMonth.push(inMonth.filter((e) => !e.recurringCostId).reduce((s, e) => s + e.amountCents, 0));
    points.push({ key, label: monthShort(d), cents, pendingCents, current: i === 0 });
  }

  if (kind === 'expense') {
    const withData = manualByMonth.filter((c) => c > 0);
    const avg =
      withData.length > 0 ? Math.round(withData.reduce((s, c) => s + c, 0) / withData.length) : 0;
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    points.push({
      key: 'proj',
      label: monthShort(next),
      cents: avg + recurringMonthlyCents,
      projected: true,
    });
  }

  return { points };
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}
