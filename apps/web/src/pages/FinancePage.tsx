import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageLoading } from '../components/PageLoading';
import {
  recurringCategoryCatalog,
  recurringFrequencyCatalog,
  type Category,
  type Company,
  type CompanyMember,
  type Contact,
  type Expense,
  type RecurringCost,
  type RecurringCostList,
} from '@plim/shared';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { companyApi, messageForError } from '../company/companyApi';
import { useActiveCompany } from '../company/ActiveCompanyContext';
import { FinChart, type ChartPoint } from '../finance/FinChart';
import { MovementWizard } from '../finance/MovementWizard';
import { MovementEditForm } from '../finance/MovementEditForm';
import { GastosPorCategoriaCard } from '../finance/GastosPorCategoriaCard';
import {
  CashFlowWidget,
  ContributionsWidget,
  CustomizeView,
  OverdueWidget,
  PaidByWidget,
  UpcomingWidget,
  useFinanceView,
  type FlowPoint,
  type PartnerRow,
} from '../finance/FinanceView';
import { RecurringCostForm } from '../finance/RecurringCostForm';
import { centsToMaskedInput, financeApi, formatMoney } from '../finance/financeApi';
import { categoryApi } from '../finance/categoryApi';
import { contactApi } from '../finance/contactApi';
import { recurringApi } from '../finance/recurringApi';
import { DUE_SOON_DAYS, daysUntil, dueBucket, dueLabel, isPayable, payableExpenses, todayIso } from '../finance/due';
import {
  IconArrowIn,
  IconArrowOut,
  IconArrowRight,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconPlus,
  IconPulse,
  IconRepeat,
  IconWallet,
} from './dashIcons';
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
      contacts: Contact[];
    };

type Filter =
  | 'todos'
  | 'receitas'
  | 'despesas'
  | 'aportes'
  | 'recorrentes'
  | 'a-pagar'
  | 'vencidas'
  | 'pagas';

/** Recorte de período da tela (o seletor global controla tudo). */
type PeriodSel = 'month' | 'last-month' | 'last-3' | 'year';

const PERIOD_LABEL: Record<PeriodSel, string> = {
  month: 'Este mês',
  'last-month': 'Mês passado',
  'last-3': 'Últimos 3 meses',
  year: 'Este ano',
};

/** Primeiro dia do mês (deslocado em `shift` meses) em YYYY-MM-DD. */
function monthStartIso(shift: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + shift, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Minúsculas sem acento, para a busca tolerar "credito" e "crédito". */
function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Item unificado da lista (despesa/aporte datados ou custo recorrente). */
type MovItem =
  | { kind: 'expense' | 'contribution' | 'revenue'; expense: Expense }
  | { kind: 'recurring'; cost: RecurringCost };

export function FinancePage() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const { company: activeCompany } = useActiveCompany();
  const [filter, setFilter] = useState<Filter>('todos');
  // Arquivo por ano: /financeiro/2025 abre uma página só daquele ano.
  const { ano } = useParams();
  const archiveYear = ano && /^\d{4}$/.test(ano) ? ano : null;
  const currentYear = String(new Date().getFullYear());
  /**
   * Período da tela principal (o arquivo por ano trava no ano dele).
   * Abre no ano: um mês sem lançamento deixaria a tela zerada, e tela zerada
   * assusta quem tem movimento no ano inteiro. O ano sempre mostra a empresa.
   */
  const [periodSel, setPeriodSel] = useState<PeriodSel>('year');
  /** Busca livre dentro das movimentações. */
  const [query, setQuery] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [detail, setDetail] = useState<MovItem | null>(null);
  const [editingCost, setEditingCost] = useState<RecurringCost | null>(null);
  const [editingMovement, setEditingMovement] = useState<Expense | null>(null);
  // Filtro por categoria vindo do card "Gastos por categoria" ('' nenhum,
  // '__none__' sem categoria, ou id da categoria).
  const [categoryFilter, setCategoryFilter] = useState('');
  // Meses abertos na lista agrupada (undefined = só o mais recente aberto).
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});
  // Visão da lista: cartões (padrão) ou tabela anual (com paginação).
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [tablePage, setTablePage] = useState(1);
  const [searchParams] = useSearchParams();
  const [flashId, setFlashId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Conta sendo marcada como paga (abre o diálogo "quem pagou?"). */
  const [paying, setPaying] = useState<Expense | null>(null);
  const [payWho, setPayWho] = useState('');
  const [payDate, setPayDate] = useState(todayIso());
  /** Fluxo financeiro: barras do mês ou saldo acumulado. */
  const [fluxMode, setFluxMode] = useState<'mensal' | 'acumulado'>('mensal');
  /** Painel de filtros avançados (os pouco usados saem da faixa de chips). */
  const [filtersOpen, setFiltersOpen] = useState(false);
  /** Filtro por sócio pagador ('' = todos). */
  const [memberFilter, setMemberFilter] = useState('');
  /** "Personalizar visão": quais blocos analíticos a pessoa acompanha. */
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const view = useFinanceView(activeCompany.id);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const [members, expenses, recurring, categories, contacts] = await Promise.all([
        companyApi.listMembers(activeCompany.id),
        financeApi.listExpenses(activeCompany.id),
        recurringApi.list(activeCompany.id),
        categoryApi.list(activeCompany.id).catch(() => [] as Category[]),
        contactApi.list(activeCompany.id).catch(() => [] as Contact[]),
      ]);
      setState({ status: 'ready', company: activeCompany, members, expenses, recurring, categories, contacts });
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

  // Trocou de filtro/período/visão: volta a tabela para a primeira página.
  useEffect(() => {
    setTablePage(1);
  }, [filter, categoryFilter, periodSel, archiveYear, viewMode]);

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

  if (state.status === 'loading') return <PageLoading label="carregando movimentações…" />;
  if (state.status === 'error') return <p className="fin-muted">{state.message}</p>;
  if (state.status === 'empty') return <p className="fin-muted">Crie sua empresa primeiro.</p>;

  const { company, members, expenses, recurring, categories, contacts } = state;
  const nameOf = (id: string) => members.find((m) => m.id === id)?.fullName ?? 'Sócio';
  const categoryOf = (id: string | null) =>
    id ? categories.find((c) => c.id === id) ?? null : null;
  const contactNameOf = (id: string | null) =>
    id ? contacts.find((c) => c.id === id)?.name ?? null : null;

  /* ── período global: um intervalo [início, fim) que TODA a página respeita ── */
  const range = archiveYear
    ? {
        start: `${archiveYear}-01-01`,
        end: `${Number(archiveYear) + 1}-01-01`,
        label: `Ano de ${archiveYear}`,
      }
    : periodSel === 'month'
      ? { start: monthStartIso(0), end: monthStartIso(1), label: PERIOD_LABEL[periodSel] }
      : periodSel === 'last-month'
        ? { start: monthStartIso(-1), end: monthStartIso(0), label: PERIOD_LABEL[periodSel] }
        : periodSel === 'last-3'
          ? { start: monthStartIso(-2), end: monthStartIso(1), label: PERIOD_LABEL[periodSel] }
          : {
              start: `${currentYear}-01-01`,
              end: `${Number(currentYear) + 1}-01-01`,
              label: PERIOD_LABEL[periodSel],
            };
  const inPeriod = (e: Expense) => e.spentOn >= range.start && e.spentOn < range.end;
  /** Etiqueta curta do período, para nomes de arquivo e rótulos. */
  const effPeriod = archiveYear ?? periodSel;
  // Anos anteriores com movimentação: viram cards de arquivo ("Visualizar
  // movimentações de 2025"). A tela principal fica só com o ano corrente.
  const pastYears = [...new Set(expenses.map((e) => e.spentOn.slice(0, 4)))]
    .filter((y) => y < currentYear)
    .sort()
    .reverse();

  /* ── números dos cards, só CONFIRMADAS e PAGAS entram (aporte não é gasto, RB002) ──
   * Os cards respeitam o período: escolher "2025" vira o resumo daquele ano. */
  const confirmed = (e: Expense) => e.confirmationStatus === 'confirmed';
  const gastoCents = expenses
    .filter((e) => e.kind === 'expense' && confirmed(e) && e.paymentStatus === 'paid' && inPeriod(e))
    .reduce((s, e) => s + e.amountCents, 0);
  // Receita: dinheiro que entrou (não divide entre sócios, não é gasto).
  const receitaCents = expenses
    .filter((e) => e.kind === 'revenue' && confirmed(e) && inPeriod(e))
    .reduce((s, e) => s + e.amountCents, 0);
  // Saúde do negócio: recebido − gasto (aportes ficam à parte, são capital).
  const resultadoCents = receitaCents - gastoCents;
  // Movimentações aguardando MINHA confirmação (backend marca canConfirm).
  const toConfirm = expenses.filter((e) => e.canConfirm);
  // Contas a pagar (jornada de vencimento): vencidas + a vencer. De propósito
  // NÃO respeitam o período: dívida em aberto não deixa de existir porque o
  // recorte é "este mês" — some da tela e vira surpresa com juros.
  const payable = payableExpenses(expenses);
  const overduePayable = payable.filter((e) => dueBucket(e) === 'overdue');
  const payableCents = payable.reduce((s, e) => s + e.amountCents, 0);

  /* ── contagens e recortes do resumo novo ── */
  const entradasCount = expenses.filter((e) => e.kind === 'revenue' && confirmed(e) && inPeriod(e)).length;
  const despesasCount = expenses.filter(
    (e) => e.kind === 'expense' && confirmed(e) && e.paymentStatus === 'paid' && inPeriod(e),
  ).length;
  const aportesPeriodo = expenses.filter((e) => e.kind === 'contribution' && confirmed(e) && inPeriod(e));
  const aportesPeriodoCents = aportesPeriodo.reduce((s, e) => s + e.amountCents, 0);

  /* Criticidade das pendências: vencidas (mais antigas primeiro), vence hoje,
     próximos 7 dias, e o resto. Vencida = vencimento passado E não paga. */
  const dueOverdue = overduePayable.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
  const dueToday = payable.filter((e) => e.dueDate != null && daysUntil(e.dueDate) === 0);
  const dueSoon = payable.filter((e) => {
    if (!e.dueDate) return false;
    const d = daysUntil(e.dueDate);
    return d > 0 && d <= DUE_SOON_DAYS;
  });
  const dueLater = payable.filter(
    (e) => !e.dueDate || daysUntil(e.dueDate) > DUE_SOON_DAYS,
  );
  const overdueCents = dueOverdue.reduce((s, e) => s + e.amountCents, 0);
  const weekCents = [...dueToday, ...dueSoon].reduce((s, e) => s + e.amountCents, 0);

  /* Dinheiro dos sócios: capital acumulado desde o início (aporte é estoque,
     não fluxo do período; o rótulo na tela diz isso). */
  const aportesPorSocio = (() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      if (e.kind !== 'contribution' || !confirmed(e)) continue;
      map.set(e.paidByMemberId, (map.get(e.paidByMemberId) ?? 0) + e.amountCents);
    }
    return [...map.entries()]
      .map(([memberId, cents]) => ({ memberId, cents }))
      .sort((a, b) => b.cents - a.cents);
  })();
  const totalAportado = aportesPorSocio.reduce((s, a) => s + a.cents, 0);
  const aporteRows: PartnerRow[] = aportesPorSocio.map((a) => ({
    memberId: a.memberId,
    name: nameOf(a.memberId),
    cents: a.cents,
  }));

  /* Quem bancou as despesas do período. É outra pergunta, e outro número:
     aporte é capital colocado na empresa, isto aqui é despesa que a pessoa
     pagou do próprio bolso. Misturar os dois esconde desequilíbrio. */
  const pagamentosPorSocio = (() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      if (e.kind !== 'expense' || !confirmed(e) || e.paymentStatus !== 'paid' || !inPeriod(e)) continue;
      map.set(e.paidByMemberId, (map.get(e.paidByMemberId) ?? 0) + e.amountCents);
    }
    return [...map.entries()]
      .map(([memberId, cents]) => ({ memberId, name: nameOf(memberId), cents }))
      .sort((a, b) => b.cents - a.cents);
  })();
  const totalPagoSocios = pagamentosPorSocio.reduce((s, p) => s + p.cents, 0);

  /* Próximos pagamentos: só o que ainda vai vencer (o que já venceu tem
     widget e área próprios), da data mais próxima para a mais distante. */
  const upcoming = payable
    .filter((e) => dueBucket(e) !== 'overdue')
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));

  /* Fluxo de caixa: trajetória dos últimos 12 meses com movimento. Este
     widget ignora o recorte de período de propósito: tendência com um mês só
     não é tendência, é um ponto. */
  const flowPoints: FlowPoint[] = (() => {
    const map = new Map<string, { inCents: number; outCents: number }>();
    for (const e of expenses) {
      if (!confirmed(e)) continue;
      const entrada = e.kind === 'revenue';
      const saida = e.kind === 'expense' && e.paymentStatus === 'paid';
      if (!entrada && !saida) continue;
      const key = e.spentOn.slice(0, 7);
      const cur = map.get(key) ?? { inCents: 0, outCents: 0 };
      if (entrada) cur.inCents += e.amountCents;
      else cur.outCents += e.amountCents;
      map.set(key, cur);
    }
    const chaves = [...map.keys()].sort();
    if (chaves.length === 0) return [];
    // Preenche os meses sem movimento entre o primeiro e o último: um buraco
    // no meio da linha faria a queda parecer mais curta do que foi.
    const todas: string[] = [];
    const [y0, m0] = chaves[0]!.split('-').map(Number);
    const [y1, m1] = chaves[chaves.length - 1]!.split('-').map(Number);
    for (let y = y0!, m = m0!; y < y1! || (y === y1! && m <= m1!); m === 12 ? ((y += 1), (m = 1)) : (m += 1)) {
      todas.push(`${y}-${String(m).padStart(2, '0')}`);
    }
    return todas.slice(-12).map((key) => ({
      key,
      label: monthLabelOf(key),
      inCents: map.get(key)?.inCents ?? 0,
      outCents: map.get(key)?.outCents ?? 0,
    }));
  })();

  /* ── lista filtrada ── */
  const dated: MovItem[] = expenses
    .filter((e) => {
      if (filter === 'despesas' && e.kind !== 'expense') return false;
      if (filter === 'aportes' && e.kind !== 'contribution') return false;
      if (filter === 'receitas' && e.kind !== 'revenue') return false;
      if (filter === 'recorrentes') return false;
      if (filter === 'a-pagar' && !isPayable(e)) return false;
      if (filter === 'vencidas' && dueBucket(e) !== 'overdue') return false;
      if (
        filter === 'pagas' &&
        !(e.kind === 'expense' && e.paymentStatus === 'paid' && e.confirmationStatus === 'confirmed')
      )
        return false;
      // Pendência não tem período: nas abas de contas em aberto a lista mostra
      // tudo que falta pagar, de qualquer mês (mesma regra da área Atenção).
      if (!inPeriod(e) && filter !== 'a-pagar' && filter !== 'vencidas') return false;
      if (query.trim()) {
        const alvo = norm(
          `${e.description} ${nameOf(e.paidByMemberId)} ${categoryOf(e.categoryId)?.name ?? ''}`,
        );
        const tokens = norm(query).split(/\s+/).filter(Boolean);
        if (!tokens.every((t) => alvo.includes(t))) return false;
      }
      if (memberFilter && e.paidByMemberId !== memberFilter) return false;
      if (categoryFilter === '__none__' && e.categoryId != null) return false;
      if (categoryFilter && categoryFilter !== '__none__' && e.categoryId !== categoryFilter) return false;
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
  /** Quantas movimentações o recorte atual devolve (rótulo do botão Aplicar). */
  const resultadosFiltrados = items.length;
  const nothingYet = expenses.length === 0 && recurring.costs.length === 0;

  // Visão em tabela (anual): linhas planas ordenadas por data, 10 por página.
  const TABLE_PAGE_SIZE = 10;
  const tableRows = dated
    .filter((it): it is Extract<MovItem, { expense: Expense }> => it.kind !== 'recurring')
    .map((it) => it.expense)
    .sort((a, b) => (a.spentOn < b.spentOn ? 1 : a.spentOn > b.spentOn ? -1 : 0));
  const tableTotalPages = Math.max(1, Math.ceil(tableRows.length / TABLE_PAGE_SIZE));
  const tablePageSafe = Math.min(tablePage, tableTotalPages);
  const tablePageRows = tableRows.slice(
    (tablePageSafe - 1) * TABLE_PAGE_SIZE,
    tablePageSafe * TABLE_PAGE_SIZE,
  );

  /**
   * Exporta a tabela INTEIRA do período (não só a página) em CSV amigável ao
   * Excel/Sheets pt-BR: separador ';', decimal com vírgula, BOM para acentos.
   */
  function downloadCsv() {
    const sep = ';';
    const esc = (v: string) => {
      const s = String(v ?? '');
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['Data', 'Movimentação', 'Categoria', 'Contato', 'Tipo', 'Status', 'Quem pagou', 'Valor'];
    const lines = [header.join(sep)];
    for (const e of tableRows) {
      lines.push(
        [
          formatDate(e.spentOn),
          e.description,
          categoryOf(e.categoryId)?.name ?? 'Sem categoria',
          contactNameOf(e.contactId) ?? '',
          movTypeLabel(e),
          movStatus(e).label,
          nameOf(e.paidByMemberId),
          centsToMaskedInput(e.amountCents),
        ]
          .map(esc)
          .join(sep),
      );
    }
    const csv = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    const periodTag = archiveYear ?? periodSel;
    a.download = `movimentacoes-${periodTag}.csv`;
    document.body.appendChild(a);
    a.click();
    // Revogar/remover s\u00F3 depois: revogar na hora cancela o download em alguns
    // navegadores (o clique parece "n\u00E3o fazer nada").
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 1500);
  }

  // Lista enxuta: movimentações agrupadas por mês, seções colapsáveis
  // (só o mês mais recente aberto por padrão). Recorrentes seguem em lista
  // plana, são regras, não têm data de competência.
  const monthGroups = (() => {
    const map = new Map<string, MovItem[]>();
    for (const it of dated) {
      if (it.kind === 'recurring') continue;
      const key = it.expense.spentOn.slice(0, 7);
      const arr = map.get(key);
      if (arr) arr.push(it);
      else map.set(key, [it]);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  })();

  /* ── gastos por categoria (só despesas pagas e confirmadas do período) ── */
  const gastoCat = (() => {
    const paid = expenses.filter(
      (e) =>
        e.kind === 'expense' &&
        e.confirmationStatus === 'confirmed' &&
        e.paymentStatus === 'paid' &&
        inPeriod(e),
    );
    const total = paid.reduce((s, e) => s + e.amountCents, 0);
    const map = new Map<string, { id: string | null; totalCents: number; count: number }>();
    for (const e of paid) {
      const key = e.categoryId ?? '__none__';
      const cur = map.get(key) ?? { id: e.categoryId ?? null, totalCents: 0, count: 0 };
      cur.totalCents += e.amountCents;
      cur.count += 1;
      map.set(key, cur);
    }
    const rows = [...map.values()]
      .map((r) => {
        const cat = r.id ? categoryOf(r.id) : null;
        return {
          id: r.id,
          name: cat?.name ?? 'Sem categoria',
          color: cat?.color ?? '#94a3b8',
          totalCents: r.totalCents,
          count: r.count,
          pct: total > 0 ? r.totalCents / total : 0,
        };
      })
      .sort((a, b) => b.totalCents - a.totalCents);
    return { rows, total };
  })();
  // Card só faz sentido nas abas gerais de despesa.
  const showGastoCat = (filter === 'todos' || filter === 'despesas') && gastoCat.rows.length > 0;
  /* ── recortes da lista, todos dentro do painel "Filtros" ──
   * Contagem em cada opção: a pessoa decide o que abrir vendo o tamanho de
   * cada recorte, em vez de clicar e descobrir que está vazio. As duas
   * pendências contam fora do período (dívida não tem mês). */
  const contaTipo = (f: Filter): number => {
    if (f === 'todos') return expenses.filter(inPeriod).length;
    if (f === 'a-pagar') return payable.length;
    if (f === 'vencidas') return dueOverdue.length;
    if (f === 'recorrentes') return recurring.costs.length;
    if (f === 'receitas') return expenses.filter((e) => e.kind === 'revenue' && inPeriod(e)).length;
    if (f === 'aportes') return expenses.filter((e) => e.kind === 'contribution' && inPeriod(e)).length;
    if (f === 'despesas') return expenses.filter((e) => e.kind === 'expense' && inPeriod(e)).length;
    return expenses.filter(
      (e) => e.kind === 'expense' && e.paymentStatus === 'paid' && confirmed(e) && inPeriod(e),
    ).length;
  };
  const TIPOS: { id: Filter; label: string }[] = [
    { id: 'todos', label: 'Todas' },
    { id: 'receitas', label: 'Entradas' },
    { id: 'despesas', label: 'Despesas' },
    { id: 'aportes', label: 'Aportes' },
    { id: 'a-pagar', label: 'A pagar' },
    { id: 'vencidas', label: 'Vencidas' },
    { id: 'pagas', label: 'Pagas' },
    { id: 'recorrentes', label: 'Custos recorrentes' },
  ];
  const tipoLabel = (f: Filter) => TIPOS.find((t) => t.id === f)?.label ?? 'Todas';
  /** Quantos recortes estão ligados (aparece no botão "Filtros"). */
  const filtrosAtivos =
    (filter !== 'todos' ? 1 : 0) + (categoryFilter ? 1 : 0) + (memberFilter ? 1 : 0);
  function limparFiltros() {
    setFilter('todos');
    setCategoryFilter('');
    setMemberFilter('');
  }

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

  /** Abre o diálogo "quem pagou?": pagar não é só trocar um status. */
  function markPaid(expense: Expense) {
    setPayWho(expense.paidByMemberId);
    setPayDate(todayIso());
    setPaying(expense);
  }

  async function confirmPay() {
    if (!paying) return;
    setBusyId(paying.id);
    try {
      await financeApi.payExpense(company.id, paying.id, payDate, payWho);
      setPaying(null);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  /* ── gráfico mensal ──
   * Padrão: FLUXO (entrou x saiu) + projeção de gastos do próximo mês.
   * Aba "Aportes": série única de aportes por mês. */
  const isFlowChart = filter !== 'aportes';
  // Página de arquivo mostra jan..dez do ano; a principal usa a janela
  // adaptativa com projeção (o dia a dia continua olhando para frente).
  const chartPeriod = archiveYear ?? '';
  const isYearView = archiveYear != null;
  const chart = isFlowChart
    ? buildFlowSeries(expenses, recurring.monthlyTotalCents, chartPeriod)
    : buildMonthlySeries(expenses, 'contribution', recurring.monthlyTotalCents, chartPeriod);
  const showChart = filter !== 'recorrentes' && filter !== 'a-pagar' && !nothingYet;
  const hasProjection = chart.points.some((p) => p.projected);
  const nextLabel = chart.points.find((p) => p.projected)?.label ?? 'próximo mês';

  /* Acumulado: soma corrente de (entrou − saiu); positivo vira barra de
     entrada (violeta), negativo vira barra de saída (vermelho). */
  const chartAcc = (() => {
    let acc = 0;
    return {
      points: chart.points
        .filter((pt) => !pt.projected)
        .map((pt) => {
          acc += (pt.inCents ?? 0) - (pt.outCents ?? 0);
          return {
            key: pt.key,
            label: pt.label,
            inCents: acc > 0 ? acc : 0,
            outCents: acc < 0 ? -acc : 0,
            current: pt.current,
          };
        }),
    };
  })();
  const showAcc = isFlowChart && fluxMode === 'acumulado';

  const chartTitle = isFlowChart
    ? isYearView
      ? `Entradas e saídas de ${chartPeriod}`
      : 'Entradas e saídas'
    : 'Aportes por mês';
  const chartSubtitle = isFlowChart
    ? isYearView
      ? `Resumo do ano: o que entrou (violeta) e o que saiu (vermelho) mês a mês em ${chartPeriod}.`
      : 'O que entrou (violeta) e o que saiu (vermelho) por mês. Clique numa barra para ver as movimentações do mês.'
    : 'Dinheiro que os sócios colocaram no negócio, mês a mês.';
  const chartCaption = isFlowChart
    ? hasProjection
      ? `Projeção de ${nextLabel}: média dos gastos registrados + ${formatMoney(recurring.monthlyTotalCents)} de custos recorrentes ativos.`
      : `Ano fechado: sem projeção, o histórico completo de ${archiveYear}.`
    : 'Aportes não entram na projeção de gastos, são investimento, não custo.';
  const chartHelp = isFlowChart
    ? 'Violeta é o que entrou (receitas), vermelho é o que saiu (despesas); a parte tracejada é o que ainda falta pagar no mês. A última barra é a projeção de gastos do próximo mês: média dos gastos registrados mais os custos recorrentes ativos. Clique numa barra para ver as movimentações daquele mês.'
    : undefined;
  const chartEmpty = isFlowChart
    ? 'Sem dados suficientes ainda. Registre entradas e despesas para o Plim mostrar o fluxo do negócio.'
    : 'Nenhum aporte registrado ainda.';

  return (
    <div className="fin fin--wide">
      {/* ── cabeçalho ── */}
      <div className="fin-head fin-head--row">
        <div>
          {archiveYear && (
            <Link className="fin-back" to="/financeiro">
              ← Voltar para {currentYear}
            </Link>
          )}
          <h1>{archiveYear ? `Movimentações de ${archiveYear}` : 'Movimentações'}</h1>
          <p>Visão financeira da empresa</p>
        </div>
        {/* O botão vale também no ano fechado: "fechado" descreve o período, não
            proíbe lançar. Quem está organizando a contabilidade para trás
            precisa justamente registrar o que aconteceu lá. O rótulo diz o ano
            para ninguém achar que está lançando no ano corrente. */}
        {/* No mobile o rótulo encolhe para "Registrar": o botão inteiro não
            cabe ao lado do título sem quebrar em duas linhas. */}
        <Button onClick={() => setWizardOpen(true)}>
          <IconPlus /> Registrar{' '}
          <span className="fin-hide-sm">{archiveYear ? `em ${archiveYear}` : 'movimentação'}</span>
        </Button>
      </div>

      {/* ── período global: um seletor que manda na página inteira ── */}
      <div className="fin2-period">
        <Select
          label="Ano"
          variant="pill"
          value={archiveYear ?? currentYear}
          onChange={(y) => navigate(y === currentYear ? '/financeiro' : `/financeiro/${y}`)}
          options={[
            { value: currentYear, label: currentYear },
            ...pastYears.map((y) => ({ value: y, label: y })),
          ]}
        />
        {!archiveYear && (
          <Select
            label="Período"
            variant="pill"
            value={periodSel}
            onChange={(p) => setPeriodSel(p as PeriodSel)}
            options={(Object.keys(PERIOD_LABEL) as PeriodSel[]).map((pKey) => ({
              value: pKey,
              label: PERIOD_LABEL[pKey],
            }))}
          />
        )}
        <span className="fin2-period__hint">O período controla tudo nesta página</span>
        {/* Trocar de visualização é ajuste de leitura, não ação principal:
            mora junto do período, não competindo com os filtros da lista. */}
        {!nothingYet && items.length > 0 && filter !== 'recorrentes' && (
          <button
            type="button"
            className="fin2-viewswap"
            onClick={() => setViewMode((v) => (v === 'table' ? 'cards' : 'table'))}
          >
            {viewMode === 'table' ? 'Ver em cartões' : 'Ver em tabela'}
          </button>
        )}
      </div>

      {/* ── resumo: quatro números, o saldo lidera ── */}
      <section className="fin2-sum" aria-label="Resumo financeiro do período">
        <div>
          <span className="fin2-sum__lab">Entrou</span>
          <span className="fin2-sum__val" data-financial>{formatMoney(receitaCents)}</span>
          <span className="fin2-sum__note">
            {entradasCount === 0 ? 'nenhuma entrada' : `${entradasCount} ${entradasCount === 1 ? 'entrada' : 'entradas'}`}
          </span>
        </div>
        <div>
          <span className="fin2-sum__lab">Saiu</span>
          <span className="fin2-sum__val" data-financial>{formatMoney(gastoCents)}</span>
          <span className="fin2-sum__note">
            {despesasCount === 0 ? 'nenhuma despesa paga' : `${despesasCount} ${despesasCount === 1 ? 'despesa' : 'despesas'}`}
          </span>
        </div>
        <div>
          <span className="fin2-sum__lab">Saldo do período</span>
          <span
            className={'fin2-sum__val fin2-sum__val--big' + (resultadoCents < 0 ? ' is-neg' : resultadoCents > 0 ? ' is-pos' : '')}
            data-financial
          >
            {resultadoCents < 0 ? '− ' : ''}{formatMoney(Math.abs(resultadoCents))}
          </span>
          <span className="fin2-sum__note">entrou − saiu</span>
        </div>
        <div>
          <span className="fin2-sum__lab">A pagar</span>
          <span className="fin2-sum__val" data-financial>{formatMoney(payableCents)}</span>
          <span className="fin2-sum__note">
            {payable.length === 0 ? (
              'nenhum pagamento pendente'
            ) : overdueCents > 0 ? (
              <>
                <strong>{formatMoney(overdueCents)} vencidos</strong>
                {weekCents > 0 && <> · {formatMoney(weekCents)} vencem esta semana</>}
              </>
            ) : weekCents > 0 ? (
              `${formatMoney(weekCents)} vencem esta semana`
            ) : (
              'nenhum pagamento vencido'
            )}
          </span>
        </div>
      </section>
      {(receitaCents > 0 || gastoCents > 0) && (
        <p className="fin2-phrase">
          {/* Interpretar o dado, não repetir o número: quase equilibrado é
              equilibrado para quem lê (menos de 1% do que entrou). */}
          {resultadoCents < 0 && -resultadoCents > receitaCents * 0.01 ? (
            <>As saídas superaram as entradas em <b data-financial>{formatMoney(-resultadoCents)}</b> neste período.</>
          ) : resultadoCents > 0 && resultadoCents > receitaCents * 0.01 ? (
            <>As entradas superaram as saídas em <b data-financial>{formatMoney(resultadoCents)}</b> neste período.</>
          ) : (
            <>Entradas e saídas ficaram praticamente equilibradas neste período.</>
          )}
        </p>
      )}
      {(receitaCents > 0 || aportesPeriodoCents > 0) && (
        <div className="fin2-origins">
          <span className="fin2-origins__lab">Origem das entradas</span>
          <span>Receitas <b data-financial>{formatMoney(receitaCents)}</b></span>
          <span>Aportes dos sócios <b data-financial>{formatMoney(aportesPeriodoCents)}</b></span>
          {/* Entrada total ≠ faturamento: aporte é capital dos sócios, e o
              rótulo diz isso para ninguém confundir com receita. */}
          <span className="fin2-origins__tot">
            Entrou no total <b data-financial>{formatMoney(receitaCents + aportesPeriodoCents)}</b>
          </span>
        </div>
      )}

      {/* ── aguardando MINHA confirmação (operacional: só na tela principal) ── */}
      {!archiveYear && toConfirm.length > 0 && (
        <section className="fin-confirm">
          <span className="fin-confirm__title">Confirme estes pagamentos</span>
          {toConfirm.map((e) => (
            <div className="fin-confirm__item" key={e.id}>
              <p className="fin-confirm__text">
                {e.createdByMemberId ? `${nameOf(e.createdByMemberId)} registrou` : 'Registraram'} que você{' '}
                {e.kind === 'contribution' ? 'aportou' : 'pagou'}{' '}
                <strong>{formatMoney(e.amountCents)}</strong> em <strong>{e.description}</strong>.
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

      {/* ── Atenção: pendências por criticidade (vencidas → hoje → 7 dias) ── */}
      {!archiveYear && (
        payable.length === 0 ? (
          <section className="fin2-ok">
            <span className="fin2-ok__badge" aria-hidden="true">✓</span>
            <div>
              <strong>Tudo em dia</strong>
              <p>Nenhum pagamento pendente.</p>
            </div>
          </section>
        ) : (
          <section aria-label="Pagamentos que precisam de atenção" className="fin2-att">
            <div className="fin2-att__head">
              <h2>Atenção</h2>
              {dueOverdue.length > 0 && (
                <span className="fin2-att__count">
                  {dueOverdue.length} {dueOverdue.length === 1 ? 'pagamento em atraso' : 'pagamentos em atraso'}
                </span>
              )}
            </div>
            {dueOverdue.length > 0 && (
              <AttGroup tone="overdue" title="Em atraso">
                {dueOverdue.map((e) => (
                  <AttRow key={e.id} e={e} nameOf={nameOf} categoryOf={categoryOf} busy={busyId === e.id}
                    onOpen={() => navigate(`/financeiro/movimentacao/${e.id}`)} onPay={() => markPaid(e)} />
                ))}
              </AttGroup>
            )}
            {dueToday.length > 0 && (
              <AttGroup tone="today" title="Vence hoje">
                {dueToday.map((e) => (
                  <AttRow key={e.id} e={e} nameOf={nameOf} categoryOf={categoryOf} busy={busyId === e.id}
                    onOpen={() => navigate(`/financeiro/movimentacao/${e.id}`)} onPay={() => markPaid(e)} />
                ))}
              </AttGroup>
            )}
            {dueSoon.length > 0 && (
              <AttGroup tone="soon" title={`Próximos ${DUE_SOON_DAYS} dias`}>
                {dueSoon.map((e) => (
                  <AttRow key={e.id} e={e} nameOf={nameOf} categoryOf={categoryOf} busy={busyId === e.id}
                    onOpen={() => navigate(`/financeiro/movimentacao/${e.id}`)} onPay={() => markPaid(e)} />
                ))}
              </AttGroup>
            )}
            {dueLater.length > 0 && (
              <button type="button" className="fin2-att__later" onClick={() => setFilter('a-pagar')}>
                {dueLater.length} {dueLater.length === 1 ? 'outra conta a vencer' : 'outras contas a vencer'} ·{' '}
                <span data-financial>{formatMoney(dueLater.reduce((sum, e) => sum + e.amountCents, 0))}</span> → ver na lista
              </button>
            )}
          </section>
        )
      )}

      {/* ── movimentações: o conteúdo principal da página ── */}
      <div className="fin2-movhead">
        <h2>Movimentações</h2>
        <div className="fin2-movhead__tools">
          <label className="fin2-search">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
            <input
              type="search"
              placeholder="Buscar movimentação"
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
            />
          </label>
          {/* Um botão só no lugar da fileira de pílulas: a pessoa abre, escolhe
              o recorte e volta para a lista, que é o que ela veio ver. */}
          <button
            type="button"
            className={'fin2-filterbtn' + (filtrosAtivos > 0 ? ' is-on' : '')}
            onClick={() => setFiltersOpen(true)}
            aria-haspopup="dialog"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M3 6h18M7 12h10M11 18h2" /></svg>
            Filtros
            {filtrosAtivos > 0 && <span className="fin2-filterbtn__n">{filtrosAtivos}</span>}
          </button>
        </div>
      </div>
      {/* O que está filtrando fica à vista e sai com um toque: filtro
          escondido é a origem do "cadê minha movimentação?". */}
      {filtrosAtivos > 0 && (
        <div className="fin2-activef">
          {filter !== 'todos' && (
            <button
              type="button"
              aria-label={`Remover filtro ${tipoLabel(filter)}`}
              onClick={() => setFilter('todos')}
            >
              {tipoLabel(filter)} <span aria-hidden="true">×</span>
            </button>
          )}
          {categoryFilter && (
            <button type="button" aria-label="Remover filtro de categoria" onClick={() => setCategoryFilter('')}>
              {categoryFilter === '__none__' ? 'Sem categoria' : categoryOf(categoryFilter)?.name ?? 'Categoria'}{' '}
              <span aria-hidden="true">×</span>
            </button>
          )}
          {memberFilter && (
            <button
              type="button"
              aria-label={`Remover filtro do sócio ${nameOf(memberFilter)}`}
              onClick={() => setMemberFilter('')}
            >
              {nameOf(memberFilter)} <span aria-hidden="true">×</span>
            </button>
          )}
          <button type="button" className="fin2-activef__clear" onClick={limparFiltros}>
            Limpar tudo
          </button>
        </div>
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
            <IconPlus /> Registrar movimentação
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="fin-card">
          <p className="fin-empty">Nada nesse filtro. Troque o filtro ou registre uma nova movimentação.</p>
        </div>
      ) : filter === 'recorrentes' ? (
        <div className="fin-movs">
          {items.map((item) => (
            <MovRow
              key={item.kind === 'recurring' ? `rc-${item.cost.id}` : item.expense.id}
              item={item}
              nameOf={nameOf}
              flash={item.kind !== 'recurring' && flashId === item.expense.id}
              generatesSettlement={generatesSettlement}
              onOpen={() =>
                                  // Custo recorrente nao e movimentacao: nao tem pagina propria,
                                  // segue no detalhe atual. So despesa/entrada/aporte navegam.
                                  item.kind === 'recurring'
                                    ? setDetail(item)
                                    : navigate(`/financeiro/movimentacao/${item.expense.id}`)
                                }
            />
          ))}
        </div>
      ) : viewMode === 'table' ? (
        <MovTable
          rows={tablePageRows}
          nameOf={nameOf}
          categoryNameOf={(id) => categoryOf(id)?.name ?? null}
          contactNameOf={contactNameOf}
          page={tablePageSafe}
          totalPages={tableTotalPages}
          totalRows={tableRows.length}
          onPage={setTablePage}
          onDownload={downloadCsv}
          onOpen={(e) => navigate(`/financeiro/movimentacao/${e.id}`)}
        />
      ) : (
        <div className="fin-groups">
          {monthGroups.map(([key, group], idx) => {
            const containsFlash =
              flashId != null &&
              group.some((g) => g.kind !== 'recurring' && g.expense.id === flashId);
            const open = (openMonths[key] ?? idx === 0) || containsFlash;
            const gastoMes = group
              .filter((g) => g.kind !== 'recurring' && g.expense.kind === 'expense')
              .reduce((s, g) => s + (g.kind !== 'recurring' ? g.expense.amountCents : 0), 0);
            return (
              <section className={'fin-group' + (open ? ' fin-group--open' : '')} key={key} id={`mes-${key}`}>
                <button
                  type="button"
                  className="fin-group__head"
                  aria-expanded={open}
                  onClick={() => setOpenMonths((m) => ({ ...m, [key]: !open }))}
                >
                  <span className="fin-group__title">{monthFullLabel(key)}</span>
                  <span className="fin-group__count">
                    {group.length} {group.length === 1 ? 'movimentação' : 'movimentações'}
                  </span>
                  <span className="fin-group__total">
                    {gastoMes > 0 && <span data-financial>{formatMoney(gastoMes)}</span>}
                    <span className="fin-group__chev" aria-hidden="true">
                      <IconChevronDown />
                    </span>
                  </span>
                </button>
                {open && (
                  <div className="fin-group__body fin-movs">
                    {group.map((item) => (
                      <MovRow
                        key={item.kind === 'recurring' ? `rc-${item.cost.id}` : item.expense.id}
                        item={item}
                        nameOf={nameOf}
                        flash={item.kind !== 'recurring' && flashId === item.expense.id}
                        generatesSettlement={generatesSettlement}
                        onOpen={() =>
                                  // Custo recorrente nao e movimentacao: nao tem pagina propria,
                                  // segue no detalhe atual. So despesa/entrada/aporte navegam.
                                  item.kind === 'recurring'
                                    ? setDetail(item)
                                    : navigate(`/financeiro/movimentacao/${item.expense.id}`)
                                }
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* ── Visão financeira: análise modular, complementa a lista ── */}
      {!nothingYet && (
        <section className="fin2-view" aria-label="Visão financeira">
          <div className="fin2-view__head">
            <h2>Visão financeira</h2>
            <button type="button" className="fin2-ghostbtn" onClick={() => setCustomizeOpen(true)}>
              Personalizar visão
            </button>
          </div>
          <div className="fw-grid">
            {view.isOn('fluxo') && <CashFlowWidget points={flowPoints} />}
            {view.isOn('proximos') && (
              <UpcomingWidget
                items={upcoming}
                onOpen={(e) => navigate(`/financeiro/movimentacao/${e.id}`)}
                onSeeAll={() => setFilter('a-pagar')}
              />
            )}
            {view.isOn('categorias') && showGastoCat && (
              <GastosPorCategoriaCard
                rows={gastoCat.rows}
                totalCents={gastoCat.total}
                selected={categoryFilter}
                onSelect={(key) => setCategoryFilter(key)}
              />
            )}
            {view.isOn('aportes') && <ContributionsWidget rows={aporteRows} total={totalAportado} />}
            {view.isOn('entradas-saidas') && showChart && (
              <div className="fw fw--8 fin2-flux">
                <div className="fin2-flux__seg" role="tablist" aria-label="Modo do gráfico">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={fluxMode === 'mensal'}
                    className={fluxMode === 'mensal' ? 'is-on' : ''}
                    onClick={() => setFluxMode('mensal')}
                  >
                    Mensal
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={fluxMode === 'acumulado'}
                    className={fluxMode === 'acumulado' ? 'is-on' : ''}
                    onClick={() => setFluxMode('acumulado')}
                  >
                    Acumulado
                  </button>
                </div>
                <FinChart
                  points={showAcc ? chartAcc.points : chart.points}
                  title={chartTitle}
                  subtitle={showAcc ? 'Saldo acumulado mês a mês: violeta quando positivo, vermelho quando negativo.' : chartSubtitle}
                  caption={chartCaption}
                  emptyText={chartEmpty}
                  helpText={chartHelp}
                  onSelectMonth={(key) => {
                    // Do "quanto" para o "o quê": abre o mês na lista e rola até ele.
                    setOpenMonths((m) => ({ ...m, [key]: true }));
                    requestAnimationFrame(() =>
                      document
                        .getElementById(`mes-${key}`)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                    );
                  }}
                />
              </div>
            )}
            {view.isOn('atrasos') && (
              <OverdueWidget
                items={dueOverdue}
                onOpen={(e) => navigate(`/financeiro/movimentacao/${e.id}`)}
                onSeeAll={() => setFilter('vencidas')}
              />
            )}
            {view.isOn('pagamentos-socio') && (
              <PaidByWidget rows={pagamentosPorSocio} total={totalPagoSocios} />
            )}
          </div>
        </section>
      )}

      {/* ── personalizar a visão financeira ── */}
      <Modal
        open={customizeOpen}
        title="O que você quer acompanhar?"
        subtitle="Os blocos são prontos, você escolhe quais aparecem. A escolha fica guardada neste navegador."
        onClose={() => setCustomizeOpen(false)}
      >
        <CustomizeView
          isOn={view.isOn}
          toggle={view.toggle}
          reset={view.reset}
          isDefault={view.isDefault}
          ligados={view.enabled.length}
          onClose={() => setCustomizeOpen(false)}
        />
      </Modal>

      {/* ── filtros: tipo, categoria e sócio num lugar só ── */}
      <Modal
        open={filtersOpen}
        title="Filtros"
        subtitle="Escolha o recorte da lista de movimentações."
        onClose={() => setFiltersOpen(false)}
      >
        <div className="fin2-fdlg">
          <div role="radiogroup" aria-label="Tipo de movimentação" className="fin2-fdlg__group">
            <span className="fin2-fdlg__lab">Tipo</span>
            <div className="fin2-fdlg__chips">
              {TIPOS.map((t) => {
                const n = contaTipo(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={filter === t.id}
                    className={'fin-chip' + (filter === t.id ? ' fin-chip--active' : '')}
                    onClick={() => setFilter(t.id)}
                  >
                    {t.label}
                    {n > 0 && <span className="fin-chip__n">{n}</span>}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="fin2-fdlg__group">
            <Select
              label="Categoria"
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[
                { value: '', label: 'Todas as categorias' },
                { value: '__none__', label: 'Sem categoria' },
                ...categories.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </div>
          <div className="fin2-fdlg__group">
            <Select
              label="Sócio"
              value={memberFilter}
              onChange={setMemberFilter}
              options={[
                { value: '', label: 'Todos os sócios' },
                ...members.map((m) => ({ value: m.id, label: m.fullName })),
              ]}
            />
          </div>
          <div className="fin2-fdlg__acts">
            <button
              type="button"
              className="fw-cust__reset"
              disabled={filtrosAtivos === 0}
              onClick={limparFiltros}
            >
              Limpar filtros
            </button>
            <Button onClick={() => setFiltersOpen(false)}>
              Ver {resultadosFiltrados} {resultadosFiltrados === 1 ? 'movimentação' : 'movimentações'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── wizard (mesmo da Home) ── */}
      <Modal
        open={wizardOpen}
        title={archiveYear ? `Registrar movimentação em ${archiveYear}` : 'Registrar movimentação'}
        subtitle={
          archiveYear
            ? `Lançamento retroativo: a data fica presa a ${archiveYear}, então nada escapa para o ano corrente.`
            : 'O Plim te guia passo a passo, e explica como cada registro afeta os cálculos.'
        }
        wide
        onClose={() => setWizardOpen(false)}
      >
        {wizardOpen && (
          <MovementWizard
            company={company}
            members={members}
            year={archiveYear}
            onCreated={() => {
              setWizardOpen(false);
              void load();
            }}
          />
        )}
      </Modal>

      {/* ── detalhe (custo recorrente; movimentação tem página própria) ── */}
      <Modal
        open={detail != null}
        title="Detalhe da movimentação"
        onClose={() => setDetail(null)}
      >
        {detail && (
          <MovDetail
            item={detail}
            nameOf={nameOf}
            category={detail.kind !== 'recurring' ? categoryOf(detail.expense.categoryId) : null}
            contactName={detail.kind !== 'recurring' ? contactNameOf(detail.expense.contactId) : null}
            generatesSettlement={generatesSettlement}
            busy={busyId != null}
            onDecide={async (id, d) => {
              await decide(id, d);
              setDetail(null);
            }}
            onPay={async (id) => {
              const exp = expenses.find((x) => x.id === id);
              setDetail(null);
              if (exp) markPaid(exp);
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

      {/* ── marcar como paga: quem pagou + quando ── */}
      <Modal
        open={paying != null}
        title="Registrar pagamento"
        subtitle={paying ? `${paying.description} · ${formatMoney(paying.amountCents)}` : undefined}
        onClose={() => setPaying(null)}
      >
        {paying && (
          <div className="fin2-paydialog">
            <Select
              label="Quem pagou esta despesa?"
              value={payWho}
              onChange={setPayWho}
              options={members.map((m) => ({
                value: m.id,
                label: m.fullName,
                hint: m.id === paying.paidByMemberId ? 'pagador previsto' : undefined,
              }))}
            />
            <label className="field">
              <span className="field__label">Data do pagamento</span>
              <input
                className="field__input"
                type="date"
                value={payDate}
                max={todayIso()}
                onChange={(ev) => setPayDate(ev.target.value)}
              />
            </label>
            <p className="fin2-paydialog__hint">
              Quem pagou entra no acerto entre os sócios: as partes dos outros passam a ser
              devidas a essa pessoa.
            </p>
            <div className="fin2-paydialog__acts">
              <Button onClick={() => void confirmPay()} disabled={busyId === paying.id || !payDate}>
                Registrar pagamento
              </Button>
              <button type="button" className="fin2-ghostbtn" onClick={() => setPaying(null)}>
                Cancelar
              </button>
            </div>
          </div>
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

/* ── Atenção: grupo por criticidade, com fio lateral ── */
function AttGroup({
  tone,
  title,
  children,
}: {
  tone: 'overdue' | 'today' | 'soon';
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`fin2-attg fin2-attg--${tone}`}>
      <span className="fin2-attg__cap">{title}</span>
      {children}
    </div>
  );
}

function AttRow({
  e,
  nameOf,
  categoryOf,
  busy,
  onOpen,
  onPay,
}: {
  e: Expense;
  nameOf: (id: string) => string;
  categoryOf: (id: string | null) => Category | null;
  busy: boolean;
  onOpen: () => void;
  onPay: () => void;
}) {
  return (
    <div className="fin2-attrow">
      <button type="button" className="fin2-attrow__info" onClick={onOpen}>
        <span className="fin2-attrow__t">{e.description}</span>
        <span className="fin2-attrow__c">
          {categoryOf(e.categoryId)?.name ?? 'Sem categoria'} · pagador previsto {nameOf(e.paidByMemberId)}
        </span>
      </button>
      {e.dueDate && <StChip dueDate={e.dueDate} />}
      <span className="fin2-attrow__v" data-financial>{formatMoney(e.amountCents)}</span>
      <button type="button" className="fin2-ghostbtn" onClick={onPay} disabled={busy}>
        Marcar como paga
      </button>
    </div>
  );
}

/**
 * Chip de status de vencimento: sempre texto + ícone + cor de apoio, nunca só
 * cor (quem não distingue vermelho de verde lê a palavra).
 */
function StChip({ dueDate }: { dueDate: string }) {
  const d = daysUntil(dueDate);
  if (d < 0) {
    return (
      <span className="fin2-st fin2-st--overdue">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 8v5M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
        {-d} {-d === 1 ? 'dia' : 'dias'} em atraso
      </span>
    );
  }
  if (d === 0) {
    return (
      <span className="fin2-st fin2-st--today">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="6" /></svg>
        Vence hoje
      </span>
    );
  }
  return (
    <span className="fin2-st fin2-st--soon">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
      {d === 1 ? 'Vence amanhã' : `Vence em ${d} dias`}
    </span>
  );
}

/* ── linha da lista ── */
function MovRow({
  item,
  nameOf,
  flash,
  generatesSettlement,
  onOpen,
}: {
  item: MovItem;
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
            {formatMoney(c.amountCents)}
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
          {formatMoney(e.amountCents)}
        </span>
        {toPay ? (
          <span className={'fin-mov__impact ' + (overdue ? 'is-refused' : 'is-pending')}>
            {e.dueDate ? dueLabel(e.dueDate) : 'a pagar'}
          </span>
        ) : conf.status === 'confirmed' ? (
          // "gerou acerto" é informação, não alerta: cor neutra (vermelho só
          // para vencida/recusada).
          <span className={'fin-mov__impact' + (isRevenue ? ' is-ok' : ' is-neutral')}>
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

function IconDownload() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

/** Tipo e status compactos de uma movimentação, para a tabela. */
function movTypeLabel(e: Expense): string {
  return e.kind === 'revenue' ? 'Entrada' : e.kind === 'contribution' ? 'Aporte' : 'Despesa';
}
function movStatus(e: Expense): { label: string; cls: string } {
  if (e.kind === 'revenue') return { label: 'Recebida', cls: 'is-ok' };
  if (e.kind === 'contribution') return { label: 'Registrado', cls: 'is-neutral' };
  if (isPayable(e)) {
    return dueBucket(e) === 'overdue'
      ? { label: 'Vencida', cls: 'is-refused' }
      : { label: 'A pagar', cls: 'is-pending' };
  }
  return e.confirmationStatus === 'confirmed'
    ? { label: 'Paga', cls: 'is-ok' }
    : { label: confLabel(e.confirmationStatus), cls: 'is-neutral' };
}

/**
 * Visão em tabela (anual): uma linha por movimentação, ordenada por data.
 * Paginada (10/página) e com rolagem horizontal no mobile. Base pronta para
 * um futuro "Baixar planilha".
 */
function MovTable({
  rows,
  nameOf,
  categoryNameOf,
  contactNameOf,
  page,
  totalPages,
  totalRows,
  onPage,
  onDownload,
  onOpen,
}: {
  rows: Expense[];
  nameOf: (id: string) => string;
  categoryNameOf: (id: string | null) => string | null;
  contactNameOf: (id: string | null) => string | null;
  page: number;
  totalPages: number;
  totalRows: number;
  onPage: (p: number) => void;
  onDownload: () => void;
  onOpen: (e: Expense) => void;
}) {
  return (
    <div className="fin-table-card">
      <div className="fin-tablehead">
        <button type="button" className="fin-downloadbtn" onClick={onDownload}>
          <IconDownload /> Baixar planilha
        </button>
      </div>
      <div className="fin-tablewrap">
        <table className="fin-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Movimentação</th>
              <th>Categoria</th>
              <th>Contato</th>
              <th>Tipo</th>
              <th>Status</th>
              <th>Quem pagou</th>
              <th className="fin-table__num">Valor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const st = movStatus(e);
              return (
                <tr key={e.id} onClick={() => onOpen(e)} tabIndex={0}>
                  <td className="fin-table__date">{formatDate(e.spentOn)}</td>
                  <td className="fin-table__desc">{e.description}</td>
                  <td>{categoryNameOf(e.categoryId) ?? '—'}</td>
                  <td>{contactNameOf(e.contactId) ?? '—'}</td>
                  <td>{movTypeLabel(e)}</td>
                  <td>
                    <span className={'fin-table__status ' + st.cls}>{st.label}</span>
                  </td>
                  <td>{nameOf(e.paidByMemberId)}</td>
                  <td className="fin-table__num" data-financial>
                    {formatMoney(e.amountCents)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="fin-tablefoot">
        <span className="fin-tablefoot__count">
          {totalRows} {totalRows === 1 ? 'movimentação' : 'movimentações'}
        </span>
        {totalPages > 1 && (
          <div className="fin-pager">
            <button
              type="button"
              className="fin-pager__btn"
              disabled={page <= 1}
              onClick={() => onPage(page - 1)}
              aria-label="Página anterior"
            >
              <IconChevronLeft />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                type="button"
                key={p}
                className={'fin-pager__num' + (p === page ? ' is-active' : '')}
                onClick={() => onPage(p)}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              className="fin-pager__btn"
              disabled={page >= totalPages}
              onClick={() => onPage(page + 1)}
              aria-label="Próxima página"
            >
              <IconChevronRight />
            </button>
          </div>
        )}
      </div>
    </div>
  );
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
  nameOf,
  category,
  contactName,
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
  nameOf: (id: string) => string;
  category: Category | null;
  contactName: string | null;
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
        <div className="movd-amount" data-financial>{formatMoney(cfg.amount)}</div>
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
          <Row k="Valor" v={formatMoney(cfg.amount)} mono />
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
                v={item.cost.frequency === 'once' ? 'Pagamento único' : formatMoney(item.cost.monthlyEquivalentCents)}
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
                <>
                  <Row k="Categoria" v={category ? category.name : 'Sem categoria'} />
                  {contactName && (
                    <Row
                      k={item.expense.kind === 'revenue' ? 'Recebido de' : 'Pago para'}
                      v={contactName}
                    />
                  )}
                </>
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
                    cabe {formatMoney(s.shareCents)}
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
                      <strong className="movd-settle__amount">{formatMoney(s.shareCents)}</strong> para{' '}
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
              {formatMoney(cfg.amount)} sai do histórico
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
/**
 * Janela de meses do gráfico. Nunca mostra 6 meses vazios: se os últimos 6
 * meses não têm nada e existe histórico, a janela termina no mês mais recente
 * com dados. Um ano fechado ('2025') vira jan..dez daquele ano.
 */
function chartWindow(period: string, dataMonths: string[]): { keys: string[]; projection: boolean } {
  const now = new Date();
  const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (/^\d{4}$/.test(period)) {
    // Ano fechado: jan..dez, sem projeção (a projeção é da visão corrente).
    const keys = Array.from({ length: 12 }, (_, i) => `${period}-${String(i + 1).padStart(2, '0')}`);
    return { keys, projection: false };
  }
  let end = new Date(now.getFullYear(), now.getMonth(), 1);
  const latest = [...dataMonths].sort().pop();
  if (latest && latest < curKey) {
    const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const startKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
    const hasRecent = dataMonths.some((m) => m >= startKey && m <= curKey);
    if (!hasRecent) end = new Date(Number(latest.slice(0, 4)), Number(latest.slice(5, 7)) - 1, 1);
  }
  const keys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return { keys, projection: keys[keys.length - 1] === curKey };
}

/** Rótulo completo do mês para os grupos da lista ("Julho de 2026"). */
function monthFullLabel(key: string): string {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  const s = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Rótulo do mês; ganha o ano ("nov 25") quando não é o ano corrente. */
function monthLabelOf(key: string): string {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  const d = new Date(y, m - 1, 1);
  const short = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  return y === new Date().getFullYear() ? short : `${short} ${String(y).slice(2)}`;
}

function buildFlowSeries(
  expenses: Expense[],
  recurringMonthlyCents: number,
  period: string,
): { points: ChartPoint[] } {
  const now = new Date();
  const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const confirmed = (e: Expense) => e.confirmationStatus === 'confirmed';
  const isIn = (e: Expense) => e.kind === 'revenue' && confirmed(e);
  const isOut = (e: Expense) => e.kind === 'expense' && confirmed(e) && (e.paymentStatus ?? 'paid') === 'paid';
  const isPending = (e: Expense) => e.kind === 'expense' && confirmed(e) && e.paymentStatus === 'unpaid';
  const billMonth = (e: Expense) => (e.dueDate ?? e.spentOn).slice(0, 7);

  const dataMonths = expenses
    .filter((e) => isIn(e) || isOut(e) || isPending(e))
    .map((e) => (isPending(e) ? billMonth(e) : e.spentOn.slice(0, 7)));
  const { keys, projection } = chartWindow(period, dataMonths);

  const points: ChartPoint[] = [];
  const manualOutByMonth: number[] = [];
  for (const key of keys) {
    const inCents = expenses.filter((e) => isIn(e) && e.spentOn.startsWith(key)).reduce((s, e) => s + e.amountCents, 0);
    const outExp = expenses.filter((e) => isOut(e) && e.spentOn.startsWith(key));
    const outCents = outExp.reduce((s, e) => s + e.amountCents, 0);
    const pendingCents = expenses.filter((e) => isPending(e) && billMonth(e) === key).reduce((s, e) => s + e.amountCents, 0);
    manualOutByMonth.push(outExp.filter((e) => !e.recurringCostId).reduce((s, e) => s + e.amountCents, 0));
    points.push({ key, label: monthLabelOf(key), inCents, outCents, pendingCents, current: key === curKey });
  }
  if (projection) {
    const withData = manualOutByMonth.filter((c) => c > 0);
    const avg = withData.length > 0 ? Math.round(withData.reduce((s, c) => s + c, 0) / withData.length) : 0;
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextKey = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
    points.push({ key: 'proj', label: monthLabelOf(nextKey), outCents: avg + recurringMonthlyCents, projected: true });
  }
  return { points };
}

function buildMonthlySeries(
  expenses: Expense[],
  kind: 'expense' | 'contribution',
  recurringMonthlyCents: number,
  period: string,
): { points: ChartPoint[] } {
  const now = new Date();
  const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const points: ChartPoint[] = [];

  // Regra do produto: só o que está CONFIRMADO e PAGO conta como gasto REAL.
  const counted = (e: Expense) =>
    e.kind === kind && e.confirmationStatus === 'confirmed' && (e.paymentStatus ?? 'paid') === 'paid';
  // Contas do mês ainda NÃO pagas (recorrentes geradas, contas a pagar):
  // entram como "a pagar" (alerta), agrupadas pelo vencimento.
  const pendingBill = (e: Expense) =>
    e.kind === kind && e.confirmationStatus === 'confirmed' && e.paymentStatus === 'unpaid';
  const billMonth = (e: Expense) => (e.dueDate ?? e.spentOn).slice(0, 7);

  const dataMonths = expenses
    .filter((e) => counted(e) || pendingBill(e))
    .map((e) => (pendingBill(e) ? billMonth(e) : e.spentOn.slice(0, 7)));
  const { keys, projection } = chartWindow(period, dataMonths);

  // Base da projeção: só lançamentos manuais. As cobranças geradas de custos
  // recorrentes já entram pela soma recorrente, sem contar duas vezes.
  const manualByMonth: number[] = [];

  for (const key of keys) {
    const inMonth = expenses.filter((e) => counted(e) && e.spentOn.startsWith(key));
    const cents = inMonth.reduce((s, e) => s + e.amountCents, 0);
    const pendingCents = expenses
      .filter((e) => pendingBill(e) && billMonth(e) === key)
      .reduce((s, e) => s + e.amountCents, 0);
    manualByMonth.push(inMonth.filter((e) => !e.recurringCostId).reduce((s, e) => s + e.amountCents, 0));
    points.push({ key, label: monthLabelOf(key), cents, pendingCents, current: key === curKey });
  }

  if (kind === 'expense' && projection) {
    const withData = manualByMonth.filter((c) => c > 0);
    const avg =
      withData.length > 0 ? Math.round(withData.reduce((s, c) => s + c, 0) / withData.length) : 0;
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextKey = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
    points.push({
      key: 'proj',
      label: monthLabelOf(nextKey),
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
