import { useCallback, useEffect, useState, type ReactNode } from 'react';
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
import { PayExpenseDialog } from '../finance/PayExpenseDialog';
import { RecurringCostForm } from '../finance/RecurringCostForm';
import { recurringApi } from '../finance/recurringApi';
import { financeApi, formatMoney } from '../finance/financeApi';
import { daysUntil, dueBucket, dueLabel, paidByCompany, payableExpenses } from '../finance/due';
import { activityApi, currentWeekStart } from '../activities/activityApi';
import {
  IconArrowIn,
  IconArrowOut,
  IconArrowRight,
  IconClock,
  IconInfo,
  IconPlus,
  IconRepeat,
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
  /** Conta em aberto que o usuário clicou para registrar o pagamento. */
  const [paying, setPaying] = useState<Expense | null>(null);
  /** Custos que saem do caixa: o diálogo já abre com a empresa escolhida. */
  const custosDoCaixa = new Set(recurring.costs.filter((c) => c.paidByCompany).map((c) => c.id));
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

  /* A Home não filtra período (Rafaelle, 27 ago): é a foto de AGORA. Mês, ano
   * e histórico moram no Financeiro. Os cards usam o mês corrente, fixo. */
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const doMesAtual = expenses.filter((e) => e.spentOn.startsWith(monthKey));
  /* As 5 mais recentes de qualquer mês: a Home mostra o que acabou de
   * acontecer, não o recorte de um período. */
  const recentes = [...expenses]
    .sort((x, y) => (y.spentOn === x.spentOn ? y.createdAt.localeCompare(x.createdAt) : y.spentOn.localeCompare(x.spentOn)))
    .slice(0, 5);

  // RB002: aporte não é gasto. Confirmação: só entra o que está confirmado.
  const awaitingMine = expenses.filter((e) => e.canConfirm).length;
  // Contas a pagar: alerta na Home (vencidas + a vencer em breve).
  const payable = payableExpenses(expenses);
  const overdueBills = payable.filter((e) => dueBucket(e) === 'overdue');
  const dueSoonBills = payable.filter((e) => dueBucket(e) === 'soon');
  const billsAlert = overdueBills.length + dueSoonBills.length;
  /**
   * O que a Home mostra em "Contas a vencer": tudo que está vencido mais o que
   * vence nos próximos 30 dias. Conta com vencimento lá na frente (a anual do
   * ano que vem, por exemplo) não é assunto de hoje e polui a lista, então fica
   * de fora daqui e continua inteira em Movimentações (Rafaelle, 1 set).
   */
  const JANELA_DIAS = 30;
  const aVencer = payable
    .filter((e) => e.dueDate != null && daysUntil(e.dueDate) <= JANELA_DIAS)
    .slice(0, 8);
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

  const entradasMes = doMesAtual.filter(ehEntrada);
  const saidasMes = doMesAtual.filter(ehSaidaPaga);
  const entradasCents = soma(entradasMes);
  const saidasCents = soma(saidasMes);

  /** Caixa REAL da empresa: receitas menos o que o próprio caixa pagou.
   * Despesa que sócio pagou do bolso não sai daqui, nunca esteve aqui: ela
   * vira acerto entre sócios, não buraco no caixa (decisão de 27 ago). */
  const caixaCents =
    soma(expenses.filter(ehEntrada)) -
    soma(expenses.filter((e) => ehSaidaPaga(e) && paidByCompany(e)));
  /** Mesma conta no mês anterior, para dizer se melhorou ou piorou. */
  const mesAnterior = (() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const noMesAnterior = expenses.filter((e) => e.spentOn.startsWith(mesAnterior));
  const resultadoMes = entradasCents - saidasCents;
  const resultadoAnterior =
    soma(noMesAnterior.filter(ehEntrada)) - soma(noMesAnterior.filter(ehSaidaPaga));
  const variacaoMes = resultadoMes - resultadoAnterior;

  /** Mês do lançamento confirmado mais recente: o caixa é sincero até aqui. */
  const mesDoUltimoLancamento = (() => {
    const ultimo = expenses
      .filter(confirmada)
      .reduce((max, e) => (e.spentOn > max ? e.spentOn : max), '');
    if (!ultimo) return null;
    return MESES[Number(ultimo.slice(5, 7)) - 1] ?? null;
  })();
  /** Entradas e Saídas são do mês corrente: o hint diz isso com todas as letras
   * ("isso foi de quando?", Rafaelle 27 ago). */
  const nomeMesAtual = MESES[now.getMonth()] ?? '';

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
        {/* Uma ação só no topo: as secundárias moram nas páginas delas e na
            barra lateral. O CTA perdeu peso junto (classe --slim). */}
        <div className="dash-quick">
          <button className="dash-quick__btn dash-quick__btn--primary dash-quick__btn--slim" onClick={() => setModalOpen(true)}>
            <IconPlus /> Registrar movimentação
          </button>
        </div>
      </div>

      {/* ── nível 3: resumo do período. Rótulo e número; a frase de apoio só
             aparece quando muda o que a pessoa faria. ── */}
      <div className="dash-cards">
        {/* Quanto a empresa tem: tudo que entrou menos tudo que saiu, desde o
            começo. Não depende do período, por isso a comparação embaixo diz
            como o mês está mexendo nesse número. */}
        {/* "Saldo atual" mostrava o resultado (−38k) com cara de saldo de conta,
            e a Rafaelle estranhou com razão: saldo tem que ser o que a empresa
            TEM. Agora o card é o caixa real (receita − o que o caixa pagou), e
            o clique abre o relatório que explica as três contas. */}
        <StatCard
          icon={<IconWallet />}
          tone={caixaCents < 0 ? 'rose' : 'green'}
          label="Caixa da empresa"
          value={formatMoney(caixaCents)}
          // A legenda diz até onde o número é sincero: ele reflete o que está
          // LANÇADO, não o extrato do banco (Rafaelle, 27 ago: "a verdade dos
          // dados"). O resultado do mês mora em Movimentações e no relatório.
          hint={mesDoUltimoLancamento ? `segundo os lançamentos até ${mesDoUltimoLancamento}` : 'nenhum lançamento ainda'}
          info="É o que a conta da empresa tem, somando só o que foi lançado no Plim. Não entra aqui: o que os sócios pagaram do bolso nem os acertos entre vocês (quem deve a quem fica na página Acertos). Clique no card para ver o relatório completo."
          onClick={() => onNavigate('/relatorios')}
        />
        <StatCard
          icon={<IconArrowIn />}
          tone="green"
          label="Entradas"
          value={formatMoney(entradasCents)}
          hint={
            entradasMes.length === 0
              ? `nenhum recebimento em ${nomeMesAtual}`
              : `${entradasMes.length} ${entradasMes.length === 1 ? 'recebimento' : 'recebimentos'} em ${nomeMesAtual}`
          }
        />
        <StatCard
          icon={<IconArrowOut />}
          tone="rose"
          label="Saídas"
          value={formatMoney(saidasCents)}
          hint={
            saidasMes.length === 0
              ? `nenhum pagamento em ${nomeMesAtual}`
              : `${saidasMes.length} ${saidasMes.length === 1 ? 'pagamento' : 'pagamentos'} em ${nomeMesAtual}`
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
              ? 'nada nos próximos 30 dias'
              : venceEmBreveCents > 0
                ? `${formatMoney(venceEmBreveCents)} em até 7 dias`
                : 'próximos 30 dias'
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

      {/* O aviso amarelo de "X contas vencem" saiu: ele anunciava a lista
          sem mostrá-la, e a lista agora está logo abaixo, com a mesma cor
          (Rafaelle, 1 set). */}

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

      {/* ── contas a vencer ──
          Ocupa o lugar das "últimas movimentações": o que já passou não pede
          ação, o que vence pede. Fundo amarelo, o mesmo do alerta que existia
          acima, porque o painel É o alerta agora (Rafaelle, 1 set). */}
      <Panel
        title="Contas a vencer"
        tone="warn"
        action={{ label: 'Ver todas', to: '/financeiro?filtro=a-pagar' }}
        onNavigate={onNavigate}
      >
        {aVencer.length === 0 ? (
          <EmptyRow text="Nenhuma conta a vencer nos próximos 30 dias. Está tudo em dia." />
        ) : (
          <ul className="dash-bills">
            {aVencer.map((e) => {
              const dias = daysUntil(e.dueDate!);
              const vencida = dias < 0;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    className="dash-bill"
                    /* O rótulo diz o que a linha É e o que o clique FAZ: quem
                       usa leitor de tela ouvia só os dados grudados, sem saber
                       que dava para pagar dali. */
                    aria-label={`${e.description}, ${formatMoney(e.amountCents)}, ${dueLabel(e.dueDate!)}. Registrar pagamento.`}
                    onClick={() => setPaying(e)}
                  >
                    <span className="dash-bill__date" aria-hidden="true">
                      {formatDate(e.dueDate!)}
                    </span>
                    <span className="dash-bill__desc" title={e.description} aria-hidden="true">
                      {e.description}
                    </span>
                    <span
                      className={'dash-bill__when' + (vencida ? ' dash-bill__when--late' : '')}
                      aria-hidden="true"
                    >
                      {dueLabel(e.dueDate!)}
                    </span>
                    <span className="dash-bill__value" aria-hidden="true">
                      {formatMoney(e.amountCents)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {aVencer.length > 0 && (
            <div className="dash-bills__foot">
              <span>
                {aVencer.length === 1 ? '1 conta' : `${aVencer.length} contas`} nos próximos 30 dias
              </span>
              <strong>{formatMoney(aVencer.reduce((t, e) => t + e.amountCents, 0))}</strong>
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

      {/* Clicar numa conta em aberto pergunta como ela foi paga: pelo caixa da
          empresa (sem acerto) ou por um sócio (vira acerto). Mesmo diálogo do
          Financeiro, para a regra viver num lugar só. */}
      <PayExpenseDialog
        companyId={company.id}
        expense={paying}
        members={members}
        fromCompanyCash={
          paying?.recurringCostId != null && custosDoCaixa.has(paying.recurringCostId)
        }
        onClose={() => setPaying(null)}
        onPaid={() => onFinanceChange(company.id)}
      />
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

/** Nomes dos meses para hints e legendas ("em agosto", "até agosto"). */
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function StatCard({
  icon,
  tone,
  label,
  value,
  hint,
  info,
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
  /** Explicação sob demanda: vira um ⓘ no canto que abre um balão. Para número
   *  que engana quem só bate o olho (ex.: caixa ≠ inclui acertos de sócio). */
  info?: string;
  badge?: string;
  cta?: ReactNode;
  /** Torna o card clicável (ex.: Sociedade → /socios). */
  onClick?: () => void;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  // Balão aberto fecha como todo balão: clique em qualquer lugar fora ou Esc.
  useEffect(() => {
    if (!infoOpen) return;
    const fechar = () => setInfoOpen(false);
    const porTecla = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setInfoOpen(false);
    };
    // No próximo tick: o mesmo clique que abriu não pode fechar.
    const id = setTimeout(() => {
      document.addEventListener('click', fechar);
      document.addEventListener('keydown', porTecla);
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('click', fechar);
      document.removeEventListener('keydown', porTecla);
    };
  }, [infoOpen]);
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
  const card = onClick ? (
    <button type="button" className="dash-stat dash-stat--link" onClick={onClick}>
      {inner}
    </button>
  ) : (
    <div className="dash-stat">{inner}</div>
  );
  if (!info) return card;
  // O ⓘ não pode morar DENTRO do card clicável (botão dentro de botão é HTML
  // inválido e o clique vira loteria): irmãos num wrapper relativo.
  return (
    <div className="dash-stat__wrap">
      {card}
      <button
        type="button"
        className="dash-stat__infobtn"
        aria-label={`O que conta em ${label}`}
        aria-expanded={infoOpen}
        onClick={() => setInfoOpen((v) => !v)}
      >
        <IconInfo />
      </button>
      {infoOpen && (
        <div className="dash-stat__infopop" role="note">
          {info}
        </div>
      )}
    </div>
  );
}

function Panel({
  title,
  action,
  onNavigate,
  tone,
  children,
}: {
  title: string;
  action?: { label: string; to: string };
  onNavigate?: (to: string) => void;
  /** 'warn' = painel de atenção (fundo amarelo), para o que pede ação. */
  tone?: 'warn';
  children: ReactNode;
}) {
  return (
    <section className={'dash-panel' + (tone === 'warn' ? ' dash-panel--warn' : '')}>
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
