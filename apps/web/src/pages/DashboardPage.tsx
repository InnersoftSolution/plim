import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageLoading } from '../components/PageLoading';
import {
  recurringCategoryCatalog,
  recurringFrequencyCatalog,
  type Activity,
  type Company,
  type CompanyMember,
  type Expense,
  type RecurringCostList,
  type Settlement,
} from '@plim/shared';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { companyApi, messageForError } from '../company/companyApi';
import { useActiveCompany } from '../company/ActiveCompanyContext';
import { MovementWizard } from '../finance/MovementWizard';
import { RecurringCostForm } from '../finance/RecurringCostForm';
import { recurringApi } from '../finance/recurringApi';
import { financeApi, formatMoney } from '../finance/financeApi';
import {
  buildPendencias,
  dismissPendencia,
  isDismissed,
  isHiddenOnHome,
  setHiddenOnHome,
  type Pendencia,
} from './pendencias';
import { dueBucket, paidByCompany, payableExpenses } from '../finance/due';
import { activityApi, currentWeekStart } from '../activities/activityApi';
import { checklistApi } from '../company/checklistApi';
import type { ChecklistView } from '@plim/shared';
import {
  IconArrowIn,
  IconArrowOut,
  IconArrowRight,
  IconBuilding,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconClose,
  IconPlus,
  IconRepeat,
  IconUsers,
  IconWallet,
} from './dashIcons';
import './dashboard.css';

type Data = {
  company: Company;
  members: CompanyMember[];
  expenses: Expense[];
  settlements: Settlement[];
  recurring: RecurringCostList;
  activities: Activity[];
};

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | ({ status: 'ready' } & Data);

export function DashboardPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ status: 'loading' });
  const { company: activeCompany } = useActiveCompany();

  async function loadFinance(companyId: string) {
    const [expenses, settlements, recurring] = await Promise.all([
      financeApi.listExpenses(companyId),
      financeApi.getSettlements(companyId),
      recurringApi.list(companyId),
    ]);
    setState((s) => (s.status === 'ready' ? { ...s, expenses, settlements, recurring } : s));
  }

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const company = activeCompany;
      const [members, expenses, settlements, recurring, activities] = await Promise.all([
        companyApi.listMembers(company.id),
        financeApi.listExpenses(company.id),
        financeApi.getSettlements(company.id),
        recurringApi.list(company.id),
        // Atividades não podem derrubar a Home (ex.: módulo ainda sem migration).
        activityApi.list(company.id).catch(() => [] as Activity[]),
      ]);
      setState({ status: 'ready', company, members, expenses, settlements, recurring, activities });
    } catch (err) {
      setState({ status: 'error', message: messageForError(err) });
    }
  }, [activeCompany]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === 'loading') return <PageLoading label="carregando seu painel…" />;
  if (state.status === 'error') return <DashError message={state.message} onRetry={load} />;
  if (state.status === 'empty') {
    return (
      <div className="dash-empty">
        <h2>Vamos criar sua empresa</h2>
        <p>Configure os sócios, as participações e o modelo de negócio para começar.</p>
        <Button onClick={() => navigate('/onboarding')}>Configurar empresa</Button>
      </div>
    );
  }

  return <DashboardReady data={state} onNavigate={navigate} onFinanceChange={loadFinance} />;
}

function DashboardReady({
  data,
  onNavigate,
  onFinanceChange,
}: {
  data: Data;
  onNavigate: (to: string) => void;
  onFinanceChange: (companyId: string) => void;
}) {
  const { company, members, expenses, settlements, recurring, activities } = data;
  const { user } = useAuth();
  const { companies, canCreateMultipleCompanies } = useActiveCompany();
  // So mostra "trabalhando em X" para quem lida com multiempresa.
  const showActiveCompany = companies.length > 1 || canCreateMultipleCompanies;
  const [modalOpen, setModalOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const activeCosts = recurring.costs.filter((c) => c.active);

  const firstName = user?.fullName?.trim().split(/\s+/)[0] ?? '';
  const nameOf = (id: string) => members.find((m) => m.id === id)?.fullName ?? 'Sócio';

  // Filtro de período: mês selecionado (padrão: mês atual) ou "Tudo".
  const now = new Date();
  const [allTime, setAllTime] = useState(false);
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const monthKey = `${view.year}-${String(view.month + 1).padStart(2, '0')}`;
  const monthName = capitalize(new Date(view.year, view.month, 1).toLocaleDateString('pt-BR', { month: 'long' }));
  const monthLabel = capitalize(
    new Date(view.year, view.month, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
  );
  const filteredExpenses = allTime ? expenses : expenses.filter((e) => e.spentOn.startsWith(monthKey));
  function shiftMonth(delta: number) {
    setAllTime(false);
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  const allocated = members.reduce((sum, m) => sum + (m.equityPercent ?? 0), 0);
  const pendingEquity = Math.max(0, 100 - allocated);
  // RB002: aporte não é gasto. Confirmação: só entra o que está confirmado.
  const gastoCents = filteredExpenses
    .filter((e) => e.kind === 'expense' && e.confirmationStatus === 'confirmed' && e.paymentStatus === 'paid')
    .reduce((sum, e) => sum + e.amountCents, 0);
  const expenseCount = expenses.filter(
    (e) => e.kind === 'expense' && e.confirmationStatus === 'confirmed' && e.paymentStatus === 'paid',
  ).length;
  const awaitingMine = expenses.filter((e) => e.canConfirm).length;
  // Contas a pagar: alerta na Home (vencidas + a vencer em breve).
  const payable = payableExpenses(expenses);
  const overdueBills = payable.filter((e) => dueBucket(e) === 'overdue');
  const dueSoonBills = payable.filter((e) => dueBucket(e) === 'soon');
  const billsAlert = overdueBills.length + dueSoonBills.length;
  // Atividades da semana (RP006: não afeta finanças; só organização).
  const weekStart = currentWeekStart();
  const weekActivities = activities.filter((a) => a.weekStartDate === weekStart && a.status !== 'cancelled');
  const actSummary = {
    total: weekActivities.length,
    inProgress: weekActivities.filter((a) => a.status === 'in_progress').length,
    overdue: weekActivities.filter((a) => a.isOverdue).length,
    done: weekActivities.filter((a) => a.status === 'done').length,
  };
  const acertosCents = settlements.reduce((sum, s) => sum + s.amountCents, 0);

  /* ── números dos quatro cards do topo ──────────────────────────────────
   * Confirmado é o que conta: pendente de confirmação não é dinheiro ainda.
   * Entrada é receita; saída é despesa efetivamente paga (conta a pagar em
   * aberto fica no card de compromissos, não no que já saiu). */
  const confirmada = (e: Expense) => e.confirmationStatus === 'confirmed';
  const ehEntrada = (e: Expense) => e.kind === 'revenue' && confirmada(e);
  const ehSaidaPaga = (e: Expense) =>
    e.kind === 'expense' && confirmada(e) && e.paymentStatus === 'paid';
  const soma = (lista: Expense[]) => lista.reduce((t, e) => t + e.amountCents, 0);

  const entradasMes = filteredExpenses.filter(ehEntrada);
  const saidasMes = filteredExpenses.filter(ehSaidaPaga);
  const entradasCents = soma(entradasMes);
  const saidasCents = soma(saidasMes);

  /** Saldo acumulado da empresa: tudo que entrou menos tudo que saiu. */
  const saldoAtualCents = soma(expenses.filter(ehEntrada)) - soma(expenses.filter(ehSaidaPaga));
  /** Mesma conta no mês anterior, para dizer se melhorou ou piorou. */
  const mesAnterior = (() => {
    const d = new Date(view.year, view.month - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const noMesAnterior = expenses.filter((e) => e.spentOn.startsWith(mesAnterior));
  const resultadoMes = entradasCents - saidasCents;
  const resultadoAnterior =
    soma(noMesAnterior.filter(ehEntrada)) - soma(noMesAnterior.filter(ehSaidaPaga));
  const variacaoMes = resultadoMes - resultadoAnterior;

  /** Compromissos: contas a pagar em aberto, e o que vence em até 7 dias. */
  const compromissosCents = payable.reduce((t, e) => t + e.amountCents, 0);
  const venceEmBreveCents = [...overdueBills, ...dueSoonBills].reduce((t, e) => t + e.amountCents, 0);

  const isInProgress = company.onboardingStatus === 'in_progress';

  // Jornada 1 — pendências inteligentes: o Plim observa, explica e sugere.
  // "Fazer depois" esconde temporariamente (localStorage); o tick força re-render.
  const [dismissTick, setDismissTick] = useState(0);
  /**
   * Orientação da Home, com uma chave só para desligar tudo.
   *
   * Antes a mesma sugestão aparecia em três lugares na mesma tela: o card de
   * próximo passo, o bloco de próximos passos e o painel de pendências. Quem
   * não ia fazer aquilo agora tinha que dispensar três vezes, e reencontrava
   * no dia seguinte. Aqui vale uma regra: uma sugestão por vez no topo, e o
   * resto sem repetir.
   */
  const orientacaoDesligada = isHiddenOnHome(company.id, 'sugestoes');
  const todasPendencias = orientacaoDesligada
    ? []
    : buildPendencias(company, members, expenses, activeCosts.length, activities).filter(
        (p) => !isDismissed(company.id, p.id) && !isHiddenOnHome(company.id, p.id),
      );
  void dismissTick;
  // Um único próximo passo recomendado por vez: a pendência mais prioritária.
  const recommended = todasPendencias[0] ?? null;
  // O painel não repete o que já está no topo, e mostra no máximo três.
  const pendencias = todasPendencias.slice(1, 4);
  const pendenciasRestantes = Math.max(0, todasPendencias.length - 4);

  function runPendAction(p: Pendencia) {
    if (p.action.kind === 'modal') setModalOpen(true);
    else if (p.action.kind === 'recurring') setRecurringOpen(true);
    else if (p.action.to) onNavigate(p.action.to);
  }
  // Fechar esconde só até amanhã: lembrete diário, nunca some para sempre.
  function closePendencia(p: Pendencia) {
    dismissPendencia(company.id, p.id);
    setDismissTick((t) => t + 1);
  }
  /** Dispensa de vez: orientação é convite, não cobrança. Quem já decidiu
   *  que não vai preencher agora não precisa ver o mesmo aviso todo dia. */
  function hidePendencia(p: Pendencia) {
    setHiddenOnHome(company.id, p.id, true);
    setDismissTick((t) => t + 1);
  }
  /** Desliga toda a orientação da Home. Religa no Checklist da empresa. */
  function desligarOrientacao() {
    setHiddenOnHome(company.id, 'sugestoes', true);
    setDismissTick((t) => t + 1);
  }
  function runPendSecondary(p: Pendencia) {
    if (!p.secondary) return;
    if (p.secondary.kind === 'dismiss') closePendencia(p);
    else onNavigate(p.secondary.to);
  }

  return (
    <div className="dash">
      {/* ── nível 1: quem é e a ação principal, lado a lado ── */}
      <div className="dash-home-head">
        <div className="dash-home-head__id">
          {company.logoUrl && (
            <img className="dash-companylogo" src={company.logoUrl} alt={`Logo de ${company.name}`} />
          )}
          <div>
            <h1 className="dash-page__title">olá, {firstName || 'por aqui'}</h1>
            {/* Uma linha só. A empresa ativa já aparece na barra lateral, e o
                subtítulo genérico não dizia nada que a página não mostre. */}
            <p className="dash-page__subtitle">{company.name}</p>
          </div>
        </div>
        <div className="dash-quick">
          <button className="dash-quick__btn dash-quick__btn--primary" onClick={() => setModalOpen(true)}>
            <IconPlus /> Registrar movimentação
          </button>
          <MoreActions onNavigate={onNavigate} />
        </div>
      </div>

      {/* ── nível 2: o período que manda nos números abaixo ── */}
      <div className="dash-monthnav">
        <button className="dash-monthnav__arrow" onClick={() => shiftMonth(-1)} aria-label="Mês anterior">
          <IconChevronLeft />
        </button>
        <span className="dash-monthnav__label">{allTime ? 'Todo o período' : monthLabel}</span>
        <button className="dash-monthnav__arrow" onClick={() => shiftMonth(1)} aria-label="Próximo mês">
          <IconChevronRight />
        </button>
        <button
          className={'dash-monthnav__all' + (allTime ? ' is-active' : '')}
          onClick={() => setAllTime((v) => !v)}
        >
          Tudo
        </button>
      </div>

      {/* ── nível 3: resumo do período. Rótulo e número; a frase de apoio só
             aparece quando muda o que a pessoa faria. ── */}
      <div className="dash-cards">
        {/* Quanto a empresa tem: tudo que entrou menos tudo que saiu, desde o
            começo. Não depende do período, por isso a comparação embaixo diz
            como o mês está mexendo nesse número. */}
        <StatCard
          icon={<IconWallet />}
          tone={saldoAtualCents < 0 ? 'rose' : 'green'}
          label="Saldo atual"
          value={formatMoney(saldoAtualCents)}
          hint={
            allTime
              ? 'desde o início'
              : resultadoMes === 0
                ? `sem movimento em ${monthName.toLowerCase()}`
                : `${resultadoMes > 0 ? '+' : '−'} ${formatMoney(Math.abs(resultadoMes))} em ${monthName.toLowerCase()}`
          }
        />
        <StatCard
          icon={<IconArrowIn />}
          tone="green"
          label={allTime ? 'Entradas' : 'Entradas no mês'}
          value={formatMoney(entradasCents)}
          hint={
            entradasMes.length === 0
              ? 'nenhum recebimento'
              : `${entradasMes.length} ${entradasMes.length === 1 ? 'recebimento' : 'recebimentos'}`
          }
        />
        <StatCard
          icon={<IconArrowOut />}
          tone="rose"
          label={allTime ? 'Saídas' : 'Saídas no mês'}
          value={formatMoney(saidasCents)}
          hint={
            saidasMes.length === 0
              ? 'nenhum pagamento'
              : `${saidasMes.length} ${saidasMes.length === 1 ? 'pagamento' : 'pagamentos'}`
          }
        />
        {/* Contas já previstas e ainda não pagas. Ignoram o período de
            propósito: dívida em aberto não some porque o filtro é outro mês. */}
        <StatCard
          icon={<IconClock />}
          tone={venceEmBreveCents > 0 ? 'amber' : compromissosCents > 0 ? 'muted' : 'green'}
          label="Compromissos futuros"
          value={formatMoney(compromissosCents)}
          hint={
            compromissosCents === 0
              ? 'nada a pagar'
              : venceEmBreveCents > 0
                ? `${formatMoney(venceEmBreveCents)} em até 7 dias`
                : `${payable.length} ${payable.length === 1 ? 'conta em aberto' : 'contas em aberto'}`
          }
          onClick={() => onNavigate('/financeiro?filtro=a-pagar')}
        />
      </div>

      {/* ── pagamentos aguardando minha confirmação (prioridade máxima) ── */}
      {awaitingMine > 0 && (
        <section className="dash-recommend dash-recommend--warn">
          <div className="dash-recommend__body">
            <span className="dash-recommend__kicker">Confirme um pagamento</span>
            <h2 className="dash-recommend__title">
              {awaitingMine === 1
                ? 'Registraram um pagamento em seu nome'
                : `${awaitingMine} pagamentos aguardam sua confirmação`}
            </h2>
            <p className="dash-recommend__reason">
              Confirme se você realmente pagou. Só depois disso a movimentação entra nos cálculos.
            </p>
          </div>
          <div className="dash-recommend__actions">
            <Button onClick={() => onNavigate('/financeiro')}>Revisar agora</Button>
          </div>
        </section>
      )}

      {/* ── alerta: contas a pagar (vencidas + a vencer) ── */}
      {billsAlert > 0 && (
        <section className="dash-recommend dash-recommend--warn">
          <div className="dash-recommend__body">
            <span className="dash-recommend__kicker">
              {overdueBills.length > 0 ? 'Conta vencida' : 'Conta a vencer'}
            </span>
            <h2 className="dash-recommend__title">
              {overdueBills.length > 0
                ? overdueBills.length === 1
                  ? '1 conta venceu e não foi paga'
                  : `${overdueBills.length} contas venceram e não foram pagas`
                : dueSoonBills.length === 1
                  ? '1 conta vence nos próximos dias'
                  : `${dueSoonBills.length} contas vencem nos próximos dias`}
            </h2>
            <p className="dash-recommend__reason">
              {overdueBills.length > 0
                ? 'Contas vencidas podem gerar juros e multa. Marque como paga assim que quitar.'
                : 'Programe-se para pagar e mantenha as contas em dia.'}
            </p>
          </div>
          <div className="dash-recommend__actions">
            <Button onClick={() => onNavigate('/financeiro?filtro=a-pagar')}>Ver contas a pagar</Button>
          </div>
        </section>
      )}

      {/* ── próximo passo recomendado (um por vez — PRD §5) ── */}
      {recommended && (
        <section className="dash-recommend">
          {/* Sugestão se fecha de vez: quem já decidiu que não vai fazer isso
              não precisa reencontrar o mesmo card toda vez que abre a Home. */}
          <button
            type="button"
            className="dash-recommend__close"
            title="Não mostrar mais esta sugestão"
            aria-label={`Não mostrar mais: ${recommended.title}`}
            onClick={() => hidePendencia(recommended)}
          >
            <IconClose />
          </button>
          <div className="dash-recommend__body">
            <span className="dash-recommend__kicker">Próximo passo recomendado</span>
            <h2 className="dash-recommend__title">{recommended.title}</h2>
            <p className="dash-recommend__reason">{recommended.reason}</p>
          </div>
          <div className="dash-recommend__actions">
            <Button onClick={() => runPendAction(recommended)}>{recommended.action.label}</Button>
            {recommended.secondary ? (
              <button
                className="dash-pending__later"
                title={recommended.secondary.kind === 'dismiss' ? 'Fecha por hoje. Volta amanhã.' : undefined}
                onClick={() => runPendSecondary(recommended)}
              >
                {recommended.secondary.label}
              </button>
            ) : (
              <button
                className="dash-pending__later"
                title="Fecha por hoje. Volta amanhã."
                onClick={() => closePendencia(recommended)}
              >
                Fazer depois
              </button>
            )}
          </div>
        </section>
      )}

      <ChecklistNextSteps companyId={company.id} hidden={orientacaoDesligada} />

      {/* ── atividades da semana ── */}
      <Panel
        title="Atividades da semana"
        action={actSummary.total > 0 ? { label: 'Ver atividades', to: '/atividades' } : undefined}
        onNavigate={onNavigate}
      >
        {actSummary.total === 0 ? (
          <div className="dash-actempty">
            <p>Nenhuma atividade planejada para esta semana. Crie atividades para organizar o que cada sócio precisa fazer.</p>
            <Button onClick={() => onNavigate('/atividades?nova=1')}>
              <IconPlus /> Criar primeira atividade
            </Button>
          </div>
        ) : (
          <div className="dash-actweek">
            <div className="dash-actweek__pills">
              <span className="dash-actpill">{actSummary.total} {actSummary.total === 1 ? 'atividade' : 'atividades'}</span>
              <span className="dash-actpill">{actSummary.inProgress} em andamento</span>
              {actSummary.overdue > 0 && (
                <span className="dash-actpill dash-actpill--overdue">{actSummary.overdue} atrasada{actSummary.overdue === 1 ? '' : 's'}</span>
              )}
              <span className="dash-actpill dash-actpill--done">{actSummary.done} concluída{actSummary.done === 1 ? '' : 's'}</span>
            </div>
            <div className="dash-actweek__actions">
              <Button variant="secondary" onClick={() => onNavigate('/atividades')}>Ver atividades</Button>
              <Button onClick={() => onNavigate('/atividades?nova=1')}>
                <IconPlus /> Nova atividade
              </Button>
            </div>
          </div>
        )}
      </Panel>

      {/* ── acertos entre sócios ── */}
      <Panel
        title="Acertos entre sócios"
        action={settlements.length > 0 ? { label: 'Ver acertos', to: '/acertos' } : undefined}
        onNavigate={onNavigate}
      >
        {settlements.length === 0 ? (
          <EmptyRow text="Nenhum acerto pendente entre sócios. Quando houver despesas compartilhadas, o Plim mostra aqui quem precisa pagar quem." />
        ) : (
          <>
            <div className="dash-settlements">
              {/* Cada linha abre o extrato do par: de quais despesas veio a
                  dívida, quanto cabia a cada um e o que já foi acertado. Um
                  número sozinho na Home levanta a pergunta "de onde saiu isso?",
                  e a resposta tem que estar a um clique. */}
              {settlements.map((s, i) => (
                <Link
                  className="dash-settlement"
                  key={`${s.fromMemberId}-${s.toMemberId}-${i}`}
                  to={`/acertos/entre/${s.fromMemberId}/${s.toMemberId}`}
                >
                  <span className="dash-settlement__avatar">{initials(s.fromName)}</span>
                  <span className="dash-settlement__text">
                    <strong>{s.fromName}</strong> precisa pagar{' '}
                    <strong className="dash-settlement__amount">
                      {formatMoney(s.amountCents)}
                    </strong>{' '}
                    para <strong>{s.toName}</strong>
                  </span>
                  <span className="dash-settlement__go" aria-hidden="true">
                    <IconChevronRight />
                  </span>
                </Link>
              ))}
            </div>
            <p className="dash-panel__note">
              Já com as dívidas cruzadas descontadas, a partir de {expenseCount}{' '}
              {expenseCount === 1 ? 'despesa compartilhada' : 'despesas compartilhadas'}.
            </p>
          </>
        )}
      </Panel>

      {/* ── últimas movimentações ── */}
      <Panel
        title={allTime ? 'Últimas movimentações' : `Últimas movimentações (${monthName.toLowerCase()})`}
        action={expenses.length > 0 ? { label: 'Ver todas', to: '/financeiro' } : undefined}
        onNavigate={onNavigate}
      >
        {filteredExpenses.length === 0 ? (
          <EmptyRow
            text={
              allTime || expenses.length === 0
                ? 'Você ainda não registrou nenhum gasto. Comece adicionando a primeira movimentação para o Plim calcular quanto já foi investido no negócio.'
                : `Nenhuma movimentação em ${monthName.toLowerCase()}. Registre os gastos do mês para acompanhar o quanto a empresa consome.`
            }
            cta={{ label: 'Registrar movimentação', onClick: () => setModalOpen(true) }}
          />
        ) : (
          <div className="dash-table">
            <div className="dash-table__head" aria-hidden="true">
              <span>Quando</span>
              <span>O quê</span>
              <span className="dash-table__h-type">Tipo</span>
              <span className="dash-table__h-payer">Quem pagou</span>
              <span className="dash-table__h-value">Valor</span>
            </div>
            {filteredExpenses.slice(0, 5).map((e) => (
              <button
                type="button"
                className="dash-row dash-row--link"
                key={e.id}
                title="Ver nas movimentações"
                onClick={() => onNavigate(`/financeiro?mov=${e.id}`)}
              >
                <span className="dash-row__date">{formatDate(e.spentOn)}</span>
                <span className="dash-row__desc">{e.description}</span>
                {/* Entrada não é despesa: antes toda movimentação que não fosse
                    aporte aparecia como "Despesa", e o dinheiro que entrou
                    aparecia com a etiqueta errada. */}
                <span
                  className={
                    'dash-row__type' +
                    (e.kind === 'contribution'
                      ? ' dash-row__type--aporte'
                      : e.kind === 'revenue'
                        ? ' dash-row__type--entrada'
                        : '')
                  }
                >
                  {e.kind === 'contribution' ? 'Aporte' : e.kind === 'revenue' ? 'Entrada' : 'Despesa'}
                </span>
                <span className="dash-row__payer">
                  {/* Em entrada ninguém pagou: a coluna mostra onde o dinheiro
                      caiu, e não um sócio que não desembolsou nada. */}
                  {e.kind === 'revenue' ? (
                    <span className="dash-row__company">{e.account || 'Conta da empresa'}</span>
                  ) : paidByCompany(e) ? (
                    <span className="dash-row__company">Empresa</span>
                  ) : (
                    <>
                      <span className="dash-row__avatar" aria-hidden="true">
                        {initials(nameOf(e.paidByMemberId))}
                      </span>
                      {nameOf(e.paidByMemberId)}
                    </>
                  )}
                </span>
                <span
                  className={'dash-row__value' + (e.kind === 'revenue' ? ' dash-row__value--in' : '')}
                >
                  {e.kind === 'revenue' ? '+ ' : ''}
                  {formatMoney(e.amountCents)}
                </span>
              </button>
            ))}
          </div>
        )}
      </Panel>

      {/* ── custos mensais (Jornada 3) ── */}
      <Panel title="Custos mensais">
        {recurring.costs.length === 0 ? (
          <EmptyRow
            text="Nenhum custo mensal cadastrado. Cadastre assinaturas e ferramentas para entender quanto custa manter sua empresa funcionando."
            cta={{ label: 'Adicionar custo mensal', onClick: () => setRecurringOpen(true) }}
          />
        ) : (
          <>
            <div className="dash-costs">
              {recurring.costs.map((c) => (
                <div className={'dash-cost' + (c.active ? '' : ' dash-cost--off')} key={c.id}>
                  <div className="dash-cost__body">
                    <span className="dash-cost__name">
                      {c.name}
                      <span className="dash-cost__cat">{catLabel(c.category)}</span>
                      {!c.active && <span className="dash-row__offtag">inativo</span>}
                    </span>
                    <span className="dash-cost__meta">
                      {freqLabel(c.frequency)} · pago por {nameOf(c.paidByMemberId)}
                      {c.nextChargeOn ? ` · próxima cobrança ${formatDate(c.nextChargeOn)}` : ''}
                      {c.frequency !== 'monthly' &&
                        ` · entra como ${formatMoney(c.monthlyEquivalentCents)}/mês`}
                    </span>
                  </div>
                  <div className="dash-cost__right">
                    <span className="dash-cost__value">{formatMoney(c.amountCents)}</span>
                    <button
                      className="dash-row__toggle"
                      title={c.active ? 'Desativar (sai da estimativa mensal)' : 'Reativar'}
                      onClick={async () => {
                        await recurringApi.update(company.id, c.id, { active: !c.active });
                        onFinanceChange(company.id);
                      }}
                    >
                      {c.active ? 'desativar' : 'reativar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="dash-panel__note">
              Estimativa mensal: {formatMoney(recurring.monthlyTotalCents)}. Soma
              dos custos ativos (anuais ÷12, semanais ×52÷12, trimestrais ÷3). Custos inativos não contam.
            </p>
          </>
        )}
      </Panel>

      {/* ── pendências inteligentes (Jornada 1) ── */}
      {/* Painel só existe quando há o que sugerir além do card do topo: sem
          pendência, um bloco dizendo "nada pendente" é mais uma caixa para a
          pessoa rolar. */}
      {pendencias.length > 0 && (
      <Panel title="Outras sugestões">
        {(
          <div className="dash-pending">
            {pendencias.map((p) => (
              <div className="dash-pending__item" key={p.id}>
                <span className={`dash-pending__prio dash-pending__prio--${p.priority}`} />
                <div className="dash-pending__body">
                  <span className="dash-pending__title">{p.title}</span>
                  <span className="dash-pending__desc">{p.description}</span>
                  <span className="dash-pending__reason">{p.reason}</span>
                </div>
                <div className="dash-pending__acts">
                  <button className="dash-pending__cta" onClick={() => runPendAction(p)}>
                    {p.action.label} <IconArrowRight />
                  </button>
                  {p.secondary && (
                    <button className="dash-pending__later" onClick={() => runPendSecondary(p)}>
                      {p.secondary.label}
                    </button>
                  )}
                  <button
                    className="dash-pending__hide"
                    title="Não mostrar mais esta sugestão"
                    aria-label={`Dispensar "${p.title}"`}
                    onClick={() => hidePendencia(p)}
                  >
                    Dispensar
                  </button>
                </div>
              </div>
            ))}
            <div className="dash-pending__foot">
              {pendenciasRestantes > 0 && (
                <button className="dash-pending__later" onClick={() => onNavigate('/empresa/checklist')}>
                  Ver as outras {pendenciasRestantes} no checklist
                </button>
              )}
              <button className="dash-pending__hide" onClick={desligarOrientacao}>
                Não mostrar sugestões na Home
              </button>
            </div>
          </div>
        )}
      </Panel>
      )}

      {isInProgress && (
        <div className="dash-continue">
          <Button onClick={() => onNavigate('/onboarding')}>Continuar configuração</Button>
        </div>
      )}

      <Modal
        open={modalOpen}
        title="Registrar movimentação"
        subtitle="O Plim te guia passo a passo, e explica como cada registro afeta os cálculos."
        wide
        onClose={() => setModalOpen(false)}
      >
        {/* key força o wizard a reiniciar do passo 1 a cada abertura */}
        {modalOpen && (
          <MovementWizard
            key="wizard"
            company={company}
            members={members}
            onCreated={() => {
              onFinanceChange(company.id);
              setModalOpen(false);
            }}
          />
        )}
      </Modal>

      <Modal
        open={recurringOpen}
        title="Adicionar custo recorrente"
        subtitle="Assinaturas e serviços que se repetem. O Plim calcula o custo mensal de manter a empresa."
        onClose={() => setRecurringOpen(false)}
      >
        {recurringOpen && (
          <RecurringCostForm
            key="recurring"
            company={company}
            members={members}
            onSaved={() => onFinanceChange(company.id)}
            onClose={() => setRecurringOpen(false)}
          />
        )}
      </Modal>
    </div>
  );
}

/* ── subcomponentes ── */
function DashError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="dash-error">
      <span className="dash-error__icon" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      </span>
      <h2 className="dash-error__title">Não consegui carregar seu painel</h2>
      <p className="dash-error__msg">{message || 'Verifique sua conexão e tente de novo.'}</p>
      <Button onClick={onRetry}>Tentar de novo</Button>
    </div>
  );
}

function StatCard({
  icon,
  tone,
  label,
  value,
  hint,
  badge,
  cta,
  onClick,
}: {
  icon: ReactNode;
  /** Uma cor por significado: rosa sai dinheiro, indigo é recorrência da marca,
   *  verde está resolvido, âmbar pede atenção, cinza não pede nada. */
  tone: 'indigo' | 'rose' | 'green' | 'amber' | 'muted';
  label: string;
  value?: string;
  /** Linha de apoio. Ausente quando o número se explica sozinho. */
  hint?: string;
  badge?: string;
  cta?: ReactNode;
  /** Torna o card clicável (ex.: Sociedade → /socios). */
  onClick?: () => void;
}) {
  const inner = (
    <>
      <div className={`dash-stat__icon dash-stat__icon--${tone}`}>{icon}</div>
      <span className="dash-stat__label">
        {label}
        {badge && <span className="dash-stat__badge">{badge}</span>}
      </span>
      {cta ?? (
        <span className="dash-stat__value" data-financial>
          {value}
        </span>
      )}
      {hint && <span className="dash-stat__hint">{hint}</span>}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className="dash-stat dash-stat--link" onClick={onClick}>
        {inner}
      </button>
    );
  }
  return <div className="dash-stat">{inner}</div>;
}

function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}

function Panel({
  title,
  action,
  onNavigate,
  children,
}: {
  title: string;
  action?: { label: string; to: string };
  onNavigate?: (to: string) => void;
  children: ReactNode;
}) {
  return (
    <section className="dash-panel">
      <div className="dash-panel__head">
        <h2>{title}</h2>
        {action && onNavigate && (
          <button className="dash-panel__action" onClick={() => onNavigate(action.to)}>
            {action.label} <IconArrowRight />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function EmptyRow({
  text,
  cta,
}: {
  text: string;
  cta?: { label: string; onClick: () => void };
}) {
  return (
    <div className="dash-emptyrow">
      <p>{text}</p>
      {cta && (
        <button className="dash-emptyrow__cta" onClick={cta.onClick}>
          {cta.label}
        </button>
      )}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]![0] ?? '' : '';
  return (first + last).toUpperCase();
}

function formatPct(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}` : iso;
}

function catLabel(id: string): string {
  return recurringCategoryCatalog.find((c) => c.id === id)?.label ?? id;
}
function freqLabel(id: string): string {
  return recurringFrequencyCatalog.find((f) => f.id === id)?.label ?? id;
}

/**
 * Bloco "Próximos passos da empresa" na Home. Mostra ate 3 itens do checklist
 * ainda nao concluidos, com atalho para a tela completa. Busca o checklist por
 * conta propria (cache do apiFetch evita chamada repetida).
 */
/**
 * "Mais ações": atalho enxuto para as 3 áreas operacionais do Plim.
 * Não repete o menu lateral nem lista ações individuais: leva a Financeiro,
 * Equipe e Empresa. Desktop = dropdown ancorado ao botão; mobile = bottom sheet
 * (a mesma folha do resto do app, via CSS).
 */
const MORE_AREAS: {
  key: string;
  label: string;
  description: string;
  to: string;
  icon: ReactNode;
}[] = [
  {
    key: 'financeiro',
    label: 'Financeiro',
    description: 'Organize gastos, aportes, custos e acertos.',
    to: '/financeiro',
    icon: <IconWallet />,
  },
  {
    key: 'equipe',
    label: 'Equipe',
    description: 'Veja sócios, papéis e atividades.',
    to: '/socios',
    icon: <IconUsers />,
  },
  {
    key: 'empresa',
    label: 'Empresa',
    description: 'Continue checklist, dados e identidade.',
    to: '/empresa/checklist',
    icon: <IconBuilding />,
  },
];

function MoreActions({ onNavigate }: { onNavigate: (to: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function go(to: string) {
    setOpen(false);
    onNavigate(to);
  }

  return (
    <div className="dash-more" ref={ref}>
      <button
        className="dash-quick__btn dash-more__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Mais ações <IconChevronDown />
      </button>
      {open && (
        <>
          <div className="dash-more__backdrop" onClick={() => setOpen(false)} />
          <div className="dash-more__menu" role="menu">
            <span className="dash-more__label">Ir para</span>
            {MORE_AREAS.map((area) => (
              <button
                key={area.key}
                type="button"
                role="menuitem"
                className="dash-more__item"
                onClick={() => go(area.to)}
              >
                <span className="dash-more__icon" aria-hidden="true">
                  {area.icon}
                </span>
                <span className="dash-more__texts">
                  <span className="dash-more__item-title">{area.label}</span>
                  <span className="dash-more__item-desc">{area.description}</span>
                </span>
                <IconChevronRight />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ChecklistNextSteps({ companyId, hidden }: { companyId: string; hidden: boolean }) {
  const navigate = useNavigate();
  const [view, setView] = useState<ChecklistView | null>(null);
  // Duas saídas, com intenções diferentes: "Fazer depois" fecha por hoje e
  // volta amanhã; "Não mostrar aqui" tira o bloco da Home até a pessoa pedir
  // de volta no checklist. Guia que insiste todo dia vira estorvo.
  const [closed, setClosed] = useState(
    () =>
      isDismissed(companyId, 'checklist-nextsteps') ||
      isHiddenOnHome(companyId, 'checklist-nextsteps') ||
      // A chave geral de sugestões também desliga este bloco: quem pediu para
      // parar de ver orientação na Home pediu por toda ela.
      isHiddenOnHome(companyId, 'sugestoes'),
  );

  useEffect(() => {
    let alive = true;
    checklistApi
      .get(companyId)
      .then((v) => alive && setView(v))
      .catch(() => alive && setView(null));
    return () => {
      alive = false;
    };
  }, [companyId]);

  // `hidden` vem do pai e reage na hora quando a pessoa desliga as sugestões;
  // `closed` guarda a decisão tomada dentro do próprio bloco.
  if (!view || closed || hidden) return null;
  const pending = view.items.filter(
    (i) => i.status === 'not_started' || i.status === 'in_progress',
  );
  if (pending.length === 0) return null;
  const top = pending.slice(0, 3);

  function closeForToday() {
    dismissPendencia(companyId, 'checklist-nextsteps');
    setClosed(true);
  }

  return (
    <section className="dash-panel dash-nextsteps">
      <div className="dash-panel__head">
        <div>
          <h2 className="dash-panel__title">Próximos passos da empresa</h2>
          <p className="dash-nextsteps__sub">
            Você concluiu {view.summary.completed} de {view.summary.total} itens essenciais.
          </p>
        </div>
        <button className="dash-panel__action" onClick={() => navigate('/empresa/checklist')}>
          Ver checklist completo
        </button>
      </div>
      <ul className="dash-nextsteps__list">
        {top.map((item) => (
          <li key={item.id} className="dash-nextsteps__item">
            <span>{item.title}</span>
            {item.actionRoute && (
              <button className="dash-nextsteps__go" onClick={() => navigate(item.actionRoute!)}>
                {item.actionLabel ?? 'Abrir'}
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="dash-nextsteps__foot">
        <button
          className="dash-pending__later"
          title="Fecha por hoje. Volta amanhã."
          onClick={closeForToday}
        >
          Fazer depois
        </button>
        <button
          className="dash-pending__later"
          title="Tira o bloco da Home. Você liga de novo no Checklist da empresa."
          onClick={() => {
            setHiddenOnHome(companyId, 'checklist-nextsteps', true);
            setClosed(true);
          }}
        >
          Não mostrar aqui
        </button>
      </div>
    </section>
  );
}
