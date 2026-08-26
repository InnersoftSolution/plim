import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { dueBucket, paidByCompany, payableExpenses } from '../finance/due';
import { activityApi, currentWeekStart } from '../activities/activityApi';
import {
  IconArrowIn,
  IconArrowOut,
  IconArrowRight,
  IconBuilding,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconExchange,
  IconPlus,
  IconRepeat,
  IconTasks,
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
  const { company, members, expenses, recurring, activities } = data;
  const { user } = useAuth();
  const { companies, canCreateMultipleCompanies } = useActiveCompany();
  // So mostra "trabalhando em X" para quem lida com multiempresa.
  const showActiveCompany = companies.length > 1 || canCreateMultipleCompanies;
  const [modalOpen, setModalOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const activeCosts = recurring.costs.filter((c) => c.active);
  /* Custo do mês é só o que sai TODO mês (mensal, semanal, "outro"). O
   * trimestral e o anual não entram diluídos: eles pertencem ao mês em que a
   * cobrança cai, e aparecem citados à parte com valor cheio e data. */
  const custoTodoMesCents = activeCosts
    .filter((c) => c.frequency === 'monthly' || c.frequency === 'weekly' || c.frequency === 'other')
    .reduce((t, c) => t + c.monthlyEquivalentCents, 0);
  const custosEventuais = activeCosts.filter(
    (c) => c.frequency === 'quarterly' || c.frequency === 'annual',
  );

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

  /**
   * Compromissos: contas a pagar em aberto MAIS as cobranças previstas dos
   * recorrentes nos próximos 30 dias. Só as contas registradas mostravam
   * R$ 0,00 e "nada a pagar" para uma empresa com R$ 3.436 saindo dia 5,
   * porque a cobrança de recorrente só vira conta na virada do mês. Sem
   * dupla contagem: quando ela materializa, o nextChargeOn avança junto.
   */
  const compromissosAbertoCents = payable.reduce((t, e) => t + e.amountCents, 0);
  const hojeIso = new Date().toISOString().slice(0, 10);
  const em30dias = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  })();
  const previstos30dCents = recurring.costs
    .filter(
      (c) =>
        c.active &&
        c.nextChargeOn != null &&
        c.nextChargeOn >= hojeIso &&
        c.nextChargeOn <= em30dias &&
        (c.endsOn == null || c.nextChargeOn <= c.endsOn),
    )
    .reduce((t, c) => t + c.amountCents, 0);
  const compromissosCents = compromissosAbertoCents + previstos30dCents;
  const venceEmBreveCents = [...overdueBills, ...dueSoonBills].reduce((t, e) => t + e.amountCents, 0);

  const isInProgress = company.onboardingStatus === 'in_progress';


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
          // Âmbar quando há compromisso vindo: é a cor de "previsto/a vencer"
          // no resto do app. Cinza era o único ícone sem cor da fileira.
          tone={compromissosCents > 0 ? 'amber' : 'green'}
          label="Compromissos futuros"
          value={formatMoney(compromissosCents)}
          hint={
            compromissosCents === 0
              ? 'nada previsto nos próximos 30 dias'
              : venceEmBreveCents > 0
                ? `${formatMoney(venceEmBreveCents)} em até 7 dias`
                : previstos30dCents > 0 && compromissosAbertoCents === 0
                  ? 'previstos nos próximos 30 dias'
                  : previstos30dCents > 0
                    ? `${formatMoney(compromissosAbertoCents)} em aberto + previstos`
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

      {/* A orientação saiu da Home a pedido da Rafaelle (26 ago 2026): o
          "próximo passo recomendado", o painel de sugestões e os próximos
          passos do checklist cobravam coisas já feitas e empurravam os dados
          para baixo. O checklist continua inteiro em /empresa/checklist; na
          Home ficam só fatos que pedem ação: conta vencida e pagamento a
          confirmar, logo acima. */}

      {/* ── atividades da semana ──
          Sem atividade na semana o painel não tem o que mostrar, e um bloco
          inteiro convidando a criar a primeira empurra o resto da Home para
          baixo toda vez. Quem quiser chegar lá tem o atalho em "Mais ações". */}
      {actSummary.total > 0 && (
        <Panel
          title="Atividades da semana"
          action={{ label: 'Ver atividades', to: '/atividades' }}
          onNavigate={onNavigate}
        >
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
        </Panel>
      )}

      {/* Acertos entre sócios saíram da Home: a tela de Acertos mostra o mesmo
          e mais, com o extrato de cada par. Repetir aqui era manter duas
          versões da mesma conta. O caminho está em "Mais ações" e no menu. */}

      {/* ── últimas movimentações ── */}
      <Panel
        title={allTime ? 'Últimas movimentações' : `Últimas movimentações (${monthName.toLowerCase()})`}
        // "Ver todas" respeita o que o painel está mostrando: no recorte de um
        // mês, cai nas movimentações do mês vigente; em "Tudo", cai no ano.
        action={
          expenses.length > 0
            ? { label: 'Ver todas', to: allTime ? '/financeiro' : '/financeiro?periodo=mes' }
            : undefined
        }
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

      {/* ── custos recorrentes (Jornada 3) ──
          O que sai TODO MÊS e o que vem de tempos em tempos são contas
          diferentes, e misturá-las enganava nos dois sentidos: o trimestral
          diluído (÷3) inchava o custo do mês normal e escondia o tamanho do
          baque no mês em que a cobrança cai de verdade (Rafaelle, 26 ago). */}
      <Panel title="Custos recorrentes">
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
                      {freqLabel(c.frequency)} ·{' '}
                      {c.paidByCompany ? 'sai do caixa da empresa' : `pago por ${nameOf(c.paidByMemberId)}`}
                      {c.nextChargeOn ? ` · próxima cobrança ${formatDate(c.nextChargeOn)}` : ''}
                      {/* Só o semanal ganha equivalente mensal, porque ele DE FATO
                          sai todo mês. Trimestral e anual não são custo do mês:
                          diluí-los aqui era inflar a conta de quem lê. */}
                      {c.frequency === 'weekly' &&
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
              Todo mês saem <b data-financial>{formatMoney(custoTodoMesCents)}</b> em custos fixos
              (mensais e semanais ativos).
              {custosEventuais.length > 0 && (
                <>
                  {' '}Fora dessa conta:{' '}
                  {custosEventuais
                    .map(
                      (c) =>
                        `${c.name} com ${formatMoney(c.amountCents)} ${
                          c.frequency === 'annual' ? 'por ano' : 'por trimestre'
                        }${c.nextChargeOn ? `, próxima em ${formatDate(c.nextChargeOn)}` : ''}`,
                    )
                    .join('; ')}
                  . Esses entram no mês em que a cobrança cai.
                </>
              )}
            </p>
          </>
        )}
      </Panel>

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
 * "Mais ações": atalho enxuto para as áreas operacionais do Plim.
 * Não repete o menu lateral nem lista ações individuais: leva a Financeiro,
 * Equipe, Atividades e Empresa. Desktop = dropdown ancorado ao botão; mobile = bottom sheet
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
    description: 'Veja sócios e papéis.',
    to: '/socios',
    icon: <IconUsers />,
  },
  {
    key: 'acertos',
    label: 'Acertos',
    description: 'Veja quem precisa pagar quem e quite as dívidas.',
    to: '/acertos',
    icon: <IconExchange />,
  },
  {
    key: 'atividades',
    label: 'Atividades',
    description: 'Organize o que cada sócio precisa fazer.',
    to: '/atividades',
    icon: <IconTasks />,
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

