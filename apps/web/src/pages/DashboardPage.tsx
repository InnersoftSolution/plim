import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { MovementWizard } from '../finance/MovementWizard';
import { RecurringCostForm } from '../finance/RecurringCostForm';
import { recurringApi } from '../finance/recurringApi';
import { financeApi, formatMoney } from '../finance/financeApi';
import { buildPendencias, dismissPendencia, isDismissed, type Pendencia } from './pendencias';
import { dueBucket, payableExpenses } from '../finance/due';
import { activityApi, currentWeekStart } from '../activities/activityApi';
import { checklistApi } from '../company/checklistApi';
import type { ChecklistView } from '@plim/shared';
import {
  IconArrowRight,
  IconBuilding,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
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
      const companies = await companyApi.listMyCompanies();
      if (companies.length === 0) {
        setState({ status: 'empty' });
        return;
      }
      const company = companies[0]!;
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === 'loading') return <p className="dash-muted">carregando seu painel…</p>;
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

  const isInProgress = company.onboardingStatus === 'in_progress';

  // Jornada 1 — pendências inteligentes: o Plim observa, explica e sugere.
  // "Fazer depois" esconde temporariamente (localStorage); o tick força re-render.
  const [dismissTick, setDismissTick] = useState(0);
  const pendencias = buildPendencias(company, members, expenses, activeCosts.length, activities).filter(
    (p) => !isDismissed(company.id, p.id),
  );
  void dismissTick;
  // Um único próximo passo recomendado por vez: a pendência mais prioritária.
  const recommended = pendencias[0] ?? null;

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
  function runPendSecondary(p: Pendencia) {
    if (!p.secondary) return;
    if (p.secondary.kind === 'dismiss') closePendencia(p);
    else onNavigate(p.secondary.to);
  }

  return (
    <div className="dash">
      {/* ── título ── */}
      <div className="dash-home-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {company.logoUrl && (
            <img className="dash-companylogo" src={company.logoUrl} alt={`Logo de ${company.name}`} />
          )}
          <div>
          <h1 className="dash-page__title">olá, {firstName || 'por aqui'}</h1>
          <p className="dash-page__subtitle">
            {recommended
              ? 'O estado atual do seu negócio e o que fazer agora.'
              : 'Tudo em dia por aqui. Siga registrando os gastos do mês.'}
          </p>
          </div>
        </div>
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

      <ChecklistNextSteps companyId={company.id} />

      {/* ── ações rápidas: uma ação principal + atalho para as áreas ── */}
      <div className="dash-quick">
        <button className="dash-quick__btn dash-quick__btn--primary" onClick={() => setModalOpen(true)}>
          <IconPlus /> Registrar movimentação
        </button>
        <MoreActions onNavigate={onNavigate} />
      </div>

      {/* ── cards principais ── */}
      <div className="dash-cards">
        <StatCard
          icon={<IconWallet />}
          tone="ink"
          label={allTime ? 'Total gasto' : `Gasto em ${monthName}`}
          value={formatMoney(gastoCents, company.currencyCode)}
          hint={
            filteredExpenses.length > 0
              ? allTime
                ? 'Tudo que já foi investido no negócio até aqui.'
                : `O que a empresa gastou em ${monthName.toLowerCase()}.`
              : 'Registre os gastos para o Plim mostrar quanto já foi investido.'
          }
        />
        {activeCosts.length > 0 ? (
          <StatCard
            icon={<IconRepeat />}
            tone="indigo"
            label="Custo mensal"
            value={formatMoney(recurring.monthlyTotalCents, company.currencyCode)}
            hint={`${activeCosts.length} ${activeCosts.length === 1 ? 'custo ativo' : 'custos ativos'}, o que custa manter a empresa por mês.`}
          />
        ) : (
          <StatCard
            icon={<IconRepeat />}
            tone="indigo"
            label="Custo mensal"
            hint="Cadastre assinaturas e ferramentas para ver quanto custa manter a empresa."
            cta={
              <button className="dash-stat__cta" onClick={() => setRecurringOpen(true)}>
                <IconPlus /> cadastrar
              </button>
            }
          />
        )}
        <StatCard
          icon={<IconArrowRight />}
          tone={acertosCents > 0 ? 'rose' : 'green'}
          label="Acertos"
          value={formatMoney(acertosCents, company.currencyCode)}
          hint={
            acertosCents > 0
              ? 'Alguém pagou mais do que a parte dele. Veja quem acerta com quem.'
              : 'Tudo quite entre os sócios.'
          }
        />
        <StatCard
          icon={<IconUsers />}
          tone="indigo"
          label="Sociedade"
          value={`${members.length} ${members.length === 1 ? 'sócio' : 'sócios'}`}
          hint={
            pendingEquity === 0
              ? 'Participação 100% definida, os acertos saem exatos.'
              : `Quase lá: ${formatPct(allocated)} definidos, faltam ${formatPct(pendingEquity)}. Completar deixa os acertos exatos.`
          }
          onClick={() => onNavigate('/socios')}
        />
      </div>

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
              {settlements.map((s, i) => (
                <div className="dash-settlement" key={`${s.fromMemberId}-${s.toMemberId}-${i}`}>
                  <span className="dash-settlement__avatar">{initials(s.fromName)}</span>
                  <span className="dash-settlement__text">
                    <strong>{s.fromName}</strong> precisa pagar{' '}
                    <strong className="dash-settlement__amount">
                      {formatMoney(s.amountCents, company.currencyCode)}
                    </strong>{' '}
                    para <strong>{s.toName}</strong>
                  </span>
                </div>
              ))}
            </div>
            <p className="dash-panel__note">
              Calculado a partir de {expenseCount} {expenseCount === 1 ? 'despesa compartilhada' : 'despesas compartilhadas'},
              já descontando dívidas cruzadas (aportes não entram). Com as participações em dia, esse número é exato.
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
            cta={{ label: 'Adicionar movimentação', onClick: () => setModalOpen(true) }}
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
                <span className={'dash-row__type' + (e.kind === 'contribution' ? ' dash-row__type--aporte' : '')}>
                  {e.kind === 'contribution' ? 'Aporte' : 'Despesa'}
                </span>
                <span className="dash-row__payer">
                  <span className="dash-row__avatar" aria-hidden="true">
                    {initials(nameOf(e.paidByMemberId))}
                  </span>
                  {nameOf(e.paidByMemberId)}
                </span>
                <span className="dash-row__value">{formatMoney(e.amountCents, company.currencyCode)}</span>
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
                        ` · entra como ${formatMoney(c.monthlyEquivalentCents, company.currencyCode)}/mês`}
                    </span>
                  </div>
                  <div className="dash-cost__right">
                    <span className="dash-cost__value">{formatMoney(c.amountCents, company.currencyCode)}</span>
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
              Estimativa mensal: {formatMoney(recurring.monthlyTotalCents, company.currencyCode)}. Soma
              dos custos ativos (anuais ÷12, semanais ×52÷12, trimestrais ÷3). Custos inativos não contam.
            </p>
          </>
        )}
      </Panel>

      {/* ── pendências inteligentes (Jornada 1) ── */}
      <Panel title="Pendências da empresa">
        {pendencias.length === 0 ? (
          <EmptyRow text="Sua empresa está organizada, nada pendente. Continue registrando os gastos que o Plim cuida dos cálculos." />
        ) : (
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
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {isInProgress && (
        <div className="dash-continue">
          <Button onClick={() => onNavigate('/onboarding')}>Continuar configuração</Button>
        </div>
      )}

      <Modal
        open={modalOpen}
        title="Adicionar movimentação"
        subtitle="O Plim te guia passo a passo, e explica como cada registro afeta os cálculos."
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
            onRefresh={() => onFinanceChange(company.id)}
            onClose={() => setModalOpen(false)}
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
  tone: 'ink' | 'indigo' | 'rose' | 'green';
  label: string;
  value?: string;
  hint: string;
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
      <span className="dash-stat__hint">{hint}</span>
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

function ChecklistNextSteps({ companyId }: { companyId: string }) {
  const navigate = useNavigate();
  const [view, setView] = useState<ChecklistView | null>(null);
  // Mesmo comportamento diário das pendências: fecha por hoje, volta amanhã.
  const [closed, setClosed] = useState(() => isDismissed(companyId, 'checklist-nextsteps'));

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

  if (!view || closed) return null;
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
      </div>
    </section>
  );
}
