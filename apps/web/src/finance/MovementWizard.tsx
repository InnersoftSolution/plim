import { useEffect, useState, type ReactNode } from 'react';
import type {
  Category,
  Company,
  CompanyMember,
  Contact,
  ContactType,
  ExpenseSplitMode,
  RecurringCategory,
  RecurringFrequency,
} from '@plim/shared';
import { recurringCategoryCatalog, recurringFrequencyCatalog } from '@plim/shared';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { DateField } from '../components/ui/DateField';
import { messageForError } from '../company/companyApi';
import { financeApi, formatMoney, maskMoneyBRL, maskedMoneyToCents } from './financeApi';
import { categoryApi } from './categoryApi';
import { contactApi } from './contactApi';
import { CategoriaSelect, TagsInput } from './CategoryFields';
import { ContatoSelect } from './ContactFields';
import { recurringApi } from './recurringApi';
import '../pages/finance.css'; // reusa .fin-split (toggle de divisão)
import './wizard.css';

/**
 * Jornada "Adicionar movimentação" — guiada, nunca formulário frio.
 * Passos: tipo → dados → pessoas/divisão → revisão → salvar.
 * Cada tipo explica como afeta os cálculos do Plim.
 */

/**
 * Prévia do rateio, espelho da regra do backend (método do maior resto):
 * a soma das partes fecha exatamente o valor. Só exibição; quem decide é a API.
 */
function previewSplit(
  amountCents: number,
  members: CompanyMember[],
  mode: ExpenseSplitMode,
): { memberId: string; cents: number }[] {
  const weights = members.map((m) => (mode === 'equal' ? 1 : Math.max(0, m.equityPercent ?? 0)));
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const exact =
    totalWeight <= 0
      ? members.map(() => amountCents / members.length)
      : weights.map((w) => (amountCents * w) / totalWeight);
  const cents = exact.map((x) => Math.floor(x));
  let remaining = amountCents - cents.reduce((s, c) => s + c, 0);
  const byFrac = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; remaining > 0 && k < cents.length; k++, remaining--) cents[byFrac[k]!.i]! += 1;
  return members.map((m, i) => ({ memberId: m.id, cents: cents[i]! }));
}

type MovementType = 'expense' | 'revenue' | 'recurring' | 'contribution' | 'loan' | 'reimbursement';

/* ── ícones das opções (herdam currentColor) ── */
function IconIn() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 19V5" />
      <path d="m5 12 7-7 7 7" />
    </svg>
  );
}
function IconOut() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="m19 12-7 7-7-7" />
    </svg>
  );
}
function IconPartner() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 19a6.5 6.5 0 0 1 13 0" />
      <path d="M19 8v6M16 11h6" />
    </svg>
  );
}
function IconOnce() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
function IconRepeat() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 2.5 21 6l-4 3.5" />
      <path d="M3 12V11a5 5 0 0 1 5-5h13" />
      <path d="M7 21.5 3 18l4-3.5" />
      <path d="M21 12v1a5 5 0 0 1-5 5H3" />
    </svg>
  );
}

/**
 * Etapa 1 em linguagem de gente: a pergunta é o que ACONTECEU com o dinheiro,
 * não qual registro técnico criar. Só 3 caminhos, cada um com exemplo concreto.
 * Recorrente não aparece aqui: é uma despesa que se repete (pergunta seguinte).
 */
const TYPE_CARDS: {
  id: MovementType;
  label: string;
  description: string;
  example: string;
  icon: ReactNode;
}[] = [
  {
    id: 'revenue',
    label: 'Entrou dinheiro',
    description: 'Venda, cliente, assinatura ou outro recebimento.',
    example: 'Ex.: mensalidade de um cliente, venda de um serviço.',
    icon: <IconIn />,
  },
  {
    id: 'expense',
    label: 'Saiu dinheiro',
    description: 'Pagamento, compra, ferramenta, fornecedor ou conta.',
    example: 'Ex.: Adobe, domínio, contador, aluguel.',
    icon: <IconOut />,
  },
  {
    id: 'contribution',
    label: 'Sócio colocou dinheiro',
    description: 'Aporte feito por um sócio para ajudar a empresa.',
    example: 'Ex.: aporte inicial, dinheiro para o caixa.',
    icon: <IconPartner />,
  },
];

/** Equivalente mensal de um custo recorrente (espelho da regra do backend). */
function monthlyEquivalent(amountCents: number, frequency: RecurringFrequency): number {
  switch (frequency) {
    case 'annual':
      return Math.round(amountCents / 12);
    case 'weekly':
      return Math.round((amountCents * 52) / 12);
    case 'quarterly':
      return Math.round(amountCents / 3);
    case 'once':
      return 0;
    default:
      return amountCents;
  }
}

/** Meses por extenso, para o período da despesa repetida em ano fechado. */
const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/**
 * Competências (YYYY-MM) de `from` até `to`, inclusive. Período invertido
 * devolve vazio em vez de estourar: a validação avisa a pessoa com texto.
 */
function monthsBetween(year: string, from: number, to: number): string[] {
  const meses: string[] = [];
  for (let m = from; m <= to; m++) meses.push(`${year}-${String(m).padStart(2, '0')}`);
  return meses;
}

/** Origens comuns de receita (chips de um toque; "+" abre origem própria). */
const REVENUE_SOURCES = ['Asaas', 'Mercado Livre', 'Stripe', 'Pix', 'Cliente direto', 'Boleto'];

/**
 * Jornada: tipo → detalhes → impacto → revisão. A pergunta "se repete?" mora
 * dentro da etapa Tipo (tela 'repeat'), então não ganha bolinha própria.
 */
type WizStep = 'type' | 'details' | 'impact' | 'review';
const STEPS: { id: WizStep; label: string }[] = [
  { id: 'type', label: 'Tipo' },
  { id: 'details', label: 'Detalhes' },
  { id: 'impact', label: 'Impacto' },
  { id: 'review', label: 'Revisão' },
];

export function MovementWizard({
  company,
  members,
  onCreated,
  year,
}: {
  company: Company;
  members: CompanyMember[];
  /** Salvou o registro (qualquer tipo): recarrega os números e fecha o modal. */
  onCreated: () => void;
  /**
   * Ano fechado sendo preenchido de forma retroativa (ex.: "2025"). Prende a
   * data ao ano inteiro, para o lançamento não escapar para o ano corrente sem
   * ninguém perceber. Ausente = registro normal, no ano de hoje.
   */
  year?: string | null;
}) {
  /** Limites da data: dentro do ano quando é retroativo, até hoje quando não é. */
  const hoje = new Date().toISOString().slice(0, 10);
  const dateMin = year ? `${year}-01-01` : undefined;
  const dateMax = year ? `${year}-12-31` : hoje;
  /** 'repeat' é uma tela dentro da etapa Tipo (pergunta se a despesa se repete). */
  const [step, setStep] = useState<WizStep | 'repeat'>('type');
  const [type, setType] = useState<MovementType | ''>('');
  /** Despesa única (lançamento avulso) ou recorrente (assinatura que se repete).
   *  Recorrente também é despesa, então é uma pergunta dentro de "Saiu dinheiro"
   *  em vez de um tipo à parte na primeira etapa. */
  const [expenseKind, setExpenseKind] = useState<'once' | 'recurring'>('once');
  /** Campos exclusivos da despesa recorrente (o resto é compartilhado). */
  const [recCategory, setRecCategory] = useState<RecurringCategory | ''>('');
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  /**
   * Período da despesa repetida em ano fechado (1 = janeiro … 12 = dezembro) e
   * quem pagou em cada mês. O mapa guarda só as EXCEÇÕES; mês sem entrada usa o
   * pagador padrão, então trocar o padrão continua valendo para o resto.
   */
  /** "Até quando" do custo recorrente. Vazio = sem previsão de fim. */
  const [endsOn, setEndsOn] = useState('');
  const [fromMonth, setFromMonth] = useState(1);
  const [toMonth, setToMonth] = useState(12);
  const [payerByMonth, setPayerByMonth] = useState<Record<string, string>>({});
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  // Num ano fechado, "hoje" não existe: começa em 1º de janeiro daquele ano e a
  // pessoa ajusta. O passo de Revisão mostra a data escolhida antes de salvar.
  const [date, setDate] = useState(year ? `${year}-01-01` : hoje);
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'unpaid'>('paid');
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [memberId, setMemberId] = useState(members[0]?.id ?? '');
  const [splitMode, setSplitMode] = useState<ExpenseSplitMode>('equity');
  /** Aporte reembolsável: os sócios pagam a parte deles ao autor. */
  const [reimbursable, setReimbursable] = useState(false);
  /** Receita: origem do dinheiro (Asaas, Mercado Livre, custom...). */
  const [source, setSource] = useState('');
  const [customSource, setCustomSource] = useState(false);
  /** Receita: conta que recebeu (sócio, empresa ou conta própria via "+"). */
  const [account, setAccount] = useState('');
  const [customAccounts, setCustomAccounts] = useState<string[]>([]);
  const [addingAccount, setAddingAccount] = useState(false);
  const [newAccount, setNewAccount] = useState('');
  /** Sócios que já acertaram a parte deles com o pagador (despesa já paga). */
  const [settledIds, setSettledIds] = useState<string[]>([]);
  /** Categorias da empresa + a categoria/tags escolhidas para esta movimentação. */
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  /** Contatos da empresa + o escolhido (pago para / recebido de). */
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactId, setContactId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    categoryApi.list(company.id).then(setCategories).catch(() => setCategories([]));
    contactApi.list(company.id).then(setContacts).catch(() => setContacts([]));
  }, [company.id]);

  async function createCategoryInline(name: string, color: string): Promise<Category | null> {
    const created = await categoryApi.create(company.id, { name, color });
    setCategories((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created;
  }

  async function createContactInline(name: string, type: ContactType): Promise<Contact | null> {
    const created = await contactApi.create(company.id, { name, type });
    setContacts((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created;
  }

  // 'repeat' ainda é a etapa Tipo (não ganha bolinha própria).
  const stepIdx = step === 'repeat' ? 0 : STEPS.findIndex((s) => s.id === step);
  const isExpense = type === 'expense';
  /** Despesa que se repete: salva como custo recorrente (regra do backend). */
  const isRecurringExpense = type === 'expense' && expenseKind === 'recurring';
  /**
   * Num ano fechado, "se repetiu" é história, não promessa: o período acabou.
   * Vira uma movimentação por mês, cada uma com o seu pagador, em vez de um
   * custo recorrente (que só faz sentido para cobrança futura).
   */
  const isRetroRepeated = isRecurringExpense && year != null;
  const isRevenue = type === 'revenue';
  const isUnpaid = isExpense && paymentStatus === 'unpaid';
  const amountCents = maskedMoneyToCents(amount);
  /** Meses do período escolhido, como competências YYYY-MM-01. */
  const occurrences = isRetroRepeated
    ? monthsBetween(year, fromMonth, toMonth).map((mes) => ({
        key: mes,
        spentOn: `${mes}-01`,
        paidByMemberId: payerByMonth[mes] ?? memberId,
      }))
    : [];
  const retroTotalCents = amountCents != null ? amountCents * occurrences.length : null;
  const memberName = members.find((m) => m.id === memberId)?.fullName ?? 'Sócio';
  const soloMember = members.length <= 1;
  // Divisão entre sócios: sempre na despesa; no aporte só quando reembolsável.
  const splitsAmongPartners = isExpense || (type === 'contribution' && reimbursable);

  /** Nome humano do que está sendo registrado (etapas de impacto e revisão). */
  const kindLabel = isRetroRepeated
    ? 'Despesa que se repetiu'
    : isRecurringExpense
    ? 'Despesa recorrente'
    : isExpense
      ? isUnpaid
        ? 'Conta a pagar'
        : 'Despesa única'
      : isRevenue
        ? 'Entrada'
        : reimbursable
          ? 'Aporte reembolsável'
          : 'Aporte';

  /**
   * Como este registro afeta os cálculos. Mostrado ANTES de salvar para a pessoa
   * decidir com consciência (o cálculo em si é sempre do backend).
   */
  const impactBullets: string[] = isRetroRepeated
    ? [
        `Cria ${occurrences.length} ${occurrences.length === 1 ? 'movimentação' : 'movimentações'}, uma por mês, todas já pagas.`,
        retroTotalCents != null
          ? `Soma ${formatMoney(retroTotalCents, company.currencyCode)} ao total gasto de ${year}.`
          : `Entra no total gasto de ${year}.`,
        members.length > 1
          ? 'Cada mês entra nos acertos com o pagador daquele mês, conforme a divisão escolhida.'
          : 'Fica registrada no histórico do ano.',
        'Não entra no custo mensal de hoje: o período já acabou, não há cobrança futura.',
      ]
    : isRecurringExpense
    ? [
        `Entra no custo mensal da empresa${
          amountCents != null
            ? ` (${formatMoney(monthlyEquivalent(amountCents, frequency), company.currencyCode)} por mês)`
            : ''
        } enquanto estiver ativa.`,
        'Na data da cobrança, o Plim gera a conta a pagar já dividida entre os sócios.',
        'Ajuda a prever quanto custa manter a empresa.',
      ]
    : isUnpaid
      ? [
          'Fica registrada como conta a pagar, com lembrete de vencimento.',
          'Só entra no total gasto quando você marcar como paga.',
          'Aparece em Contas a pagar até ser quitada.',
        ]
      : isExpense
        ? [
            'Entra no total gasto da empresa.',
            members.length > 1
              ? 'Pode gerar acerto entre os sócios, conforme a divisão escolhida.'
              : 'Fica registrada no seu histórico de gastos.',
            'Aparece nas movimentações do período.',
          ]
        : isRevenue
          ? [
              'Aumenta o dinheiro recebido e melhora o resultado (recebido menos gasto).',
              'Não entra como despesa.',
              'Não é dividida entre os sócios.',
            ]
          : reimbursable
            ? [
                'Registra o capital do sócio, fora do total gasto.',
                'Cada sócio passa a dever a parte dele para quem aportou.',
                'Entra nos acertos entre os sócios.',
              ]
            : [
                'Registra o investimento do sócio na empresa.',
                'Não entra como despesa.',
                'Não gera acerto automático entre os sócios.',
              ];
  // Soma das participações. Quando "por participação" e a soma não fecha 100%,
  // o Plim divide proporcional ao que está definido — precisa avisar (senão a
  // divisão sai diferente das porcentagens cadastradas, em silêncio).
  const equityTotal = members.reduce((s, m) => s + (m.equityPercent ?? 0), 0);
  const equityGap = Math.round((100 - equityTotal) * 100) / 100;
  const showEquityWarn =
    splitMode === 'equity' && members.length > 1 && Math.abs(equityGap) > 0.01;
  const equityWarn = showEquityWarn ? (
    <div className="mw-eqwarn">
      {equityTotal <= 0 ? (
        <>
          Nenhuma participação foi definida ainda, então o Plim está dividindo{' '}
          <strong>em partes iguais</strong>. Defina as participações em Sócios ou use "Igualmente".
        </>
      ) : equityGap > 0 ? (
        <>
          As participações somam <strong>{formatPct(equityTotal)}</strong> (faltam {formatPct(equityGap)} para
          100%). O Plim divide proporcional ao que está definido, então cada sócio com participação
          assume uma fatia maior. Para dividir exatamente pelas porcentagens, complete a sociedade em
          Sócios; ou escolha "Igualmente".
        </>
      ) : (
        <>
          As participações somam <strong>{formatPct(equityTotal)}</strong> (passou de 100%). Ajuste em
          Sócios para os acertos ficarem exatos.
        </>
      )}
    </div>
  ) : null;

  /** Linhas "Parte de fulano" com o toggle "está devendo / já me pagou". */
  function splitRows(payerId: string, allowSettle: boolean, payerLabel: string) {
    if (amountCents == null) return null;
    return previewSplit(amountCents, members, splitMode).map((s) => {
      const m = members.find((x) => x.id === s.memberId);
      const isPayer = s.memberId === payerId;
      const settled = settledIds.includes(s.memberId);
      const canSettle = allowSettle && !isPayer && s.cents > 0;
      return (
        <div className="mw-review__row" key={s.memberId}>
          <span>
            Parte de {m?.fullName ?? 'Sócio'}
            {isPayer && <span className="mw-payer"> · {payerLabel}</span>}
          </span>
          <span className="mw-splitright">
            {canSettle && (
              <button
                type="button"
                className={'mw-settle' + (settled ? ' mw-settle--on' : '')}
                aria-pressed={settled}
                onClick={() =>
                  setSettledIds((ids) =>
                    settled ? ids.filter((id) => id !== s.memberId) : [...ids, s.memberId],
                  )
                }
              >
                {settled ? 'já me pagou ✓' : 'está devendo'}
              </button>
            )}
            <strong data-financial>{formatMoney(s.cents, company.currencyCode)}</strong>
          </span>
        </div>
      );
    });
  }

  /** Rótulo da conta escolhida (nome do sócio ou conta própria). */
  const accountMember = members.find((m) => m.id === account);
  const accountLabel = accountMember ? accountMember.fullName : account;

  function confirmAddAccount() {
    const v = newAccount.trim();
    if (!v) return;
    if (!customAccounts.includes(v) && !members.some((m) => m.fullName === v)) {
      setCustomAccounts((a) => [...a, v]);
    }
    setAccount(v);
    setNewAccount('');
    setAddingAccount(false);
  }

  function next(to: WizStep | 'repeat') {
    setError('');
    setStep(to);
  }

  function validateDetails(): boolean {
    if (description.trim().length < 1) {
      setError(
        isRecurringExpense
          ? 'Dê um nome à despesa, ex.: "Google Workspace".'
          : isExpense
            ? 'Conte de onde veio o gasto, ex.: "Domínio do site".'
            : isRevenue
              ? 'Diga de onde veio a entrada, ex.: "Mensalidade de cliente".'
              : 'Dê um nome ao aporte, ex.: "Aporte inicial".',
      );
      return false;
    }
    if (amountCents == null) {
      setError('Informe um valor válido, ex.: 150,00.');
      return false;
    }
    if (isRetroRepeated) {
      if (toMonth < fromMonth) {
        setError('O mês final vem antes do inicial. Ajuste o período.');
        return false;
      }
      if (!memberId) {
        setError('Escolha quem pagou (o padrão dos meses).');
        return false;
      }
      return true;
    }
    if (isRecurringExpense) {
      if (!recCategory) {
        setError('Escolha uma categoria para essa despesa recorrente.');
        return false;
      }
      if (!memberId) {
        setError('Escolha quem paga essa despesa.');
        return false;
      }
      return true;
    }
    if (isUnpaid && !dueDate) {
      setError('Informe a data de vencimento dessa conta a pagar.');
      return false;
    }
    return true;
  }

  async function save() {
    setError('');
    setSaving(true);
    try {
      if (isRetroRepeated) {
        // Período encerrado: uma movimentação por mês, cada uma com o pagador
        // daquele mês. Quem monta o rateio de cada uma é o backend.
        await financeApi.createRepeatedExpense(company.id, {
          description: description.trim(),
          amountCents: amountCents!,
          splitMode: splitMode === 'custom' ? 'equity' : splitMode,
          note: note.trim() || null,
          categoryId,
          tags,
          contactId,
          occurrences: occurrences.map((o) => ({
            spentOn: o.spentOn,
            paidByMemberId: o.paidByMemberId,
          })),
          settledMemberIds: settledIds.length > 0 ? settledIds : undefined,
        });
      } else if (isRecurringExpense) {
        // Despesa que se repete: o backend guarda como custo recorrente e cuida
        // de gerar a conta a pagar dividida na data da cobrança.
        await recurringApi.create(company.id, {
          name: description.trim(),
          category: recCategory as RecurringCategory,
          amountCents: amountCents!,
          frequency,
          paidByMemberId: memberId,
          splitMode: splitMode === 'equal' ? 'equal' : 'equity',
          nextChargeOn: date || null,
          endsOn: endsOn || null,
          note: note.trim() || null,
        });
      } else if (type === 'expense') {
        await financeApi.createExpense(company.id, {
          description: description.trim(),
          amountCents: amountCents!,
          paidByMemberId: memberId,
          spentOn: paymentStatus === 'unpaid' ? undefined : date,
          splitMode,
          note: note.trim() || null,
          paymentStatus,
          dueDate: paymentStatus === 'unpaid' ? dueDate : null,
          settledMemberIds:
            paymentStatus === 'paid' && settledIds.length > 0
              ? settledIds.filter((id) => id !== memberId)
              : undefined,
          categoryId,
          tags,
          contactId,
        });
      } else if (type === 'revenue') {
        await financeApi.createRevenue(company.id, {
          description: description.trim(),
          amountCents: amountCents!,
          receivedByMemberId: accountMember ? accountMember.id : undefined,
          account: accountLabel.trim() || null,
          source: source.trim() || null,
          receivedOn: date,
          note: note.trim() || null,
          categoryId,
          tags,
          contactId,
        });
      } else {
        await financeApi.createContribution(company.id, {
          description: description.trim(),
          amountCents: amountCents!,
          memberId,
          contributedOn: date,
          note: note.trim() || null,
          reimbursable,
          splitMode: reimbursable ? (splitMode === 'equal' ? 'equal' : 'equity') : undefined,
          settledMemberIds:
            reimbursable && settledIds.length > 0
              ? settledIds.filter((id) => id !== memberId)
              : undefined,
        });
      }
      onCreated();
    } catch (err) {
      setError(messageForError(err));
      setSaving(false);
    }
  }

  return (
    <div className="mw">
      {/* progresso */}
      {/* Progresso: barras iguais + o nome da etapa atual. Dizer "Etapa 2 de 4 ·
          Detalhes" é mais claro (e cabe no mobile) do que 4 rótulos espremidos. */}
      <div className="mw-steps">
        <div className="mw-steps__bars" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span
              key={s.id}
              className={
                'mw-steps__bar' + (i < stepIdx ? ' is-done' : i === stepIdx ? ' is-active' : '')
              }
            />
          ))}
        </div>
        <span className="mw-steps__now">
          Etapa {stepIdx + 1} de {STEPS.length} · {STEPS[stepIdx]?.label ?? STEPS[0]!.label}
        </span>
      </div>

      {error && <div className="form-error">{error}</div>}

      {/* ── 1: tipo ── */}
      {step === 'type' && (
        <>
          <p className="mw-lead">O que aconteceu com o dinheiro?</p>
          <div className="mw-cards">
            {TYPE_CARDS.map((t) => (
              <button
                type="button"
                key={t.id}
                className={'mw-card' + (type === t.id ? ' is-active' : '')}
                onClick={() => {
                  // Escolher já avança: um toque a menos na jornada.
                  setType(t.id);
                  setExpenseKind('once');
                  // Saiu dinheiro ainda precisa saber se a despesa se repete.
                  next(t.id === 'expense' ? 'repeat' : 'details');
                }}
              >
                <span className="mw-card__icon" aria-hidden="true">{t.icon}</span>
                <span className="mw-card__text">
                  <span className="mw-card__label">{t.label}</span>
                  <span className="mw-card__desc">{t.description}</span>
                  <span className="mw-card__example">{t.example}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── 1b: a despesa se repete? (ainda dentro da etapa Tipo) ── */}
      {step === 'repeat' && (
        <>
          {/* Passado no ano fechado: lá o período já acabou, e a pergunta no
              presente ("se repete?") faria a pessoa esperar cobrança futura. */}
          <p className="mw-lead">{year ? 'Essa despesa se repetiu?' : 'Essa despesa se repete?'}</p>
          <div className="mw-cards">
            <button
              type="button"
              className={'mw-card' + (expenseKind === 'once' ? ' is-active' : '')}
              onClick={() => {
                setExpenseKind('once');
                next('details');
              }}
            >
              <span className="mw-card__icon" aria-hidden="true"><IconOnce /></span>
              <span className="mw-card__text">
                <span className="mw-card__label">Não, foi uma vez</span>
                <span className="mw-card__desc">Uma compra ou pagamento pontual.</span>
                <span className="mw-card__example">Ex.: material, taxa avulsa, compra única.</span>
              </span>
            </button>
            <button
              type="button"
              className={'mw-card' + (expenseKind === 'recurring' ? ' is-active' : '')}
              onClick={() => {
                setExpenseKind('recurring');
                next('details');
              }}
            >
              <span className="mw-card__icon" aria-hidden="true"><IconRepeat /></span>
              <span className="mw-card__text">
                <span className="mw-card__label">{year ? 'Sim, se repetiu' : 'Sim, se repete'}</span>
                <span className="mw-card__desc">Assinatura, mensalidade, ferramenta ou custo fixo.</span>
                <span className="mw-card__example">
                  {year
                    ? `Você diz de quando até quando, e quem pagou cada mês.`
                    : 'Ex.: Adobe, Google Workspace, contador, aluguel.'}
                </span>
              </span>
            </button>
          </div>
          <div className="mw-actions">
            <Button variant="secondary" onClick={() => next('type')}>
              Voltar
            </Button>
          </div>
        </>
      )}

      {/* ── 2: dados ── */}
      {step === 'details' && (
        <>
          <p className="mw-lead">
            {isRetroRepeated
              ? `Sobre essa despesa que se repetiu em ${year}`
              : isRecurringExpense
              ? 'Sobre essa despesa recorrente'
              : isExpense
                ? 'Sobre esse gasto'
                : isRevenue
                  ? 'Sobre essa entrada'
                  : 'Sobre esse aporte'}
          </p>
          {isRetroRepeated ? (
            /* Ano fechado: o período já acabou, então a pessoa informa DE quando
               ATÉ quando e quem pagou em cada mês. Vira uma movimentação por
               mês, não um custo recorrente. */
            <>
              <div className="mw-form">
                <Input
                  label="Nome da despesa"
                  placeholder="Ex.: Adobe, Google Workspace, contador, aluguel…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  autoFocus
                />
                <CategoriaSelect
                  categories={categories}
                  value={categoryId}
                  onChange={setCategoryId}
                  onCreate={createCategoryInline}
                  movementType="despesa"
                />
                <Input
                  label={`Valor de cada mês (${company.currencyCode ?? 'BRL'})`}
                  inputMode="decimal"
                  placeholder="0,00"
                  value={amount}
                  onChange={(e) => setAmount(maskMoneyBRL(e.target.value))}
                />
                <div className="mw-grid">
                  <Select
                    label={`De qual mês de ${year}`}
                    value={String(fromMonth)}
                    onChange={(v) => setFromMonth(Number(v))}
                    options={MONTH_NAMES.map((m, i) => ({ value: String(i + 1), label: m }))}
                  />
                  <Select
                    label="Até qual mês"
                    value={String(toMonth)}
                    onChange={(v) => setToMonth(Number(v))}
                    options={MONTH_NAMES.map((m, i) => ({ value: String(i + 1), label: m }))}
                  />
                </div>

                <Select
                  label="Quem pagou (vale para todos os meses)"
                  value={memberId}
                  onChange={setMemberId}
                  options={members.map((m) => ({ value: m.id, label: m.fullName }))}
                />

                {/* Caso comum resolvido pelo padrão acima; a lista existe para o
                    caso misto ("em agosto foi a Gabi"), sem obrigar a preencher
                    doze vezes quando foi sempre a mesma pessoa. */}
                {occurrences.length > 0 && members.length > 1 && (
                  <div className="field">
                    <label className="field__label">
                      Algum mês foi outra pessoa? ({occurrences.length}{' '}
                      {occurrences.length === 1 ? 'mês' : 'meses'})
                    </label>
                    <div className="mw-months">
                      {occurrences.map((oc) => {
                        const mesIdx = Number(oc.key.slice(5, 7)) - 1;
                        const trocado = payerByMonth[oc.key] != null;
                        return (
                          <div className={'mw-month' + (trocado ? ' is-custom' : '')} key={oc.key}>
                            <span className="mw-month__name">{MONTH_NAMES[mesIdx]}</span>
                            <select
                              className="mw-month__select"
                              value={oc.paidByMemberId}
                              onChange={(e) => {
                                const v = e.target.value;
                                setPayerByMonth((prev) => {
                                  const next = { ...prev };
                                  // Voltar ao padrão remove a exceção, então
                                  // trocar o padrão depois volta a valer aqui.
                                  if (v === memberId) delete next[oc.key];
                                  else next[oc.key] = v;
                                  return next;
                                });
                              }}
                            >
                              {members.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.fullName}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {members.length > 1 && (
                  <div className="field">
                    <label className="field__label">Como dividir entre os sócios</label>
                    <div className="fin-split">
                      <button
                        type="button"
                        className={'fin-split__opt' + (splitMode === 'equity' ? ' fin-split__opt--active' : '')}
                        onClick={() => setSplitMode('equity')}
                      >
                        Por participação
                      </button>
                      <button
                        type="button"
                        className={'fin-split__opt' + (splitMode === 'equal' ? ' fin-split__opt--active' : '')}
                        onClick={() => setSplitMode('equal')}
                      >
                        Igualmente
                      </button>
                    </div>
                    {equityWarn}
                  </div>
                )}
                {/* Quem já acertou: vale para todos os meses de uma vez. Marcar
                    mês a mês seriam doze decisões para o caso mais comum, que é
                    "acertou tudo" ou "não acertou nada". Quem acertou só parte
                    ajusta depois em Acertos. */}
                {members.length > 1 && amountCents != null && (
                  <div className="field">
                    <label className="field__label">
                      Os outros sócios já acertaram a parte deles?
                    </label>
                    <div className="mw-review">
                      {splitRows(memberId, true, 'pagou')}
                    </div>
                    <p className="mw-hint" style={{ marginTop: 8 }}>
                      Vale para os {occurrences.length} meses. No mês em que outra pessoa pagou, ela
                      é ignorada aqui, porque ninguém deve a si mesmo.
                    </p>
                  </div>
                )}
                <div className="field">
                  <label className="field__label">Observação (opcional)</label>
                  <textarea
                    className="field__input rc-textarea"
                    placeholder="Ex.: plano mensal usado para criação de artes."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={300}
                    rows={2}
                  />
                </div>
              </div>
              {retroTotalCents != null && occurrences.length > 0 && (
                <p className="mw-hint">
                  {occurrences.length} {occurrences.length === 1 ? 'movimentação' : 'movimentações'} de{' '}
                  {formatMoney(amountCents!, company.currencyCode)}, somando{' '}
                  <strong>{formatMoney(retroTotalCents, company.currencyCode)}</strong> em {year}.
                </p>
              )}
              <div className="mw-actions">
                <Button block onClick={() => validateDetails() && next('impact')}>
                  Continuar
                </Button>
                <Button variant="secondary" onClick={() => next('repeat')}>
                  Voltar
                </Button>
              </div>
            </>
          ) : isRecurringExpense ? (
            /* Despesa recorrente: mesmos passos dos outros tipos (impacto e
               revisão vêm depois). Salva como custo recorrente no backend. */
            <>
              <div className="mw-form">
                <Input
                  label="Nome da despesa"
                  placeholder="Ex.: Adobe, Google Workspace, contador, aluguel…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  autoFocus
                />
                <div className="mw-grid">
                  <Select
                    label="Categoria"
                    value={recCategory}
                    onChange={(v) => setRecCategory(v as RecurringCategory)}
                    placeholder="Selecione"
                    options={recurringCategoryCatalog.map((c) => ({ value: c.id, label: c.label }))}
                  />
                  <Input
                    label={`Valor (${company.currencyCode ?? 'BRL'})`}
                    inputMode="decimal"
                    placeholder="0,00"
                    value={amount}
                    onChange={(e) => setAmount(maskMoneyBRL(e.target.value))}
                  />
                </div>
                <div className="mw-grid">
                  <Select
                    label="De quanto em quanto tempo"
                    value={frequency}
                    onChange={(v) => setFrequency(v as RecurringFrequency)}
                    options={recurringFrequencyCatalog
                      .filter((f) => f.id !== 'once')
                      .map((f) => ({ value: f.id, label: f.label }))}
                  />
                  <Select
                    label="Quem paga"
                    value={memberId}
                    onChange={setMemberId}
                    options={members.map((m) => ({ value: m.id, label: m.fullName }))}
                  />
                </div>
                <div className="mw-grid">
                  <div className="field">
                    <label className="field__label">A partir de quando cobrar</label>
                    <DateField value={date} onChange={setDate} placeholder="Escolha a data" />
                  </div>
                  <div className="field">
                    <label className="field__label">Até quando (opcional)</label>
                    <DateField
                      value={endsOn}
                      onChange={setEndsOn}
                      min={date || undefined}
                      clearable
                      placeholder="Sem data para acabar"
                    />
                  </div>
                </div>
                {members.length > 1 && (
                  <div className="field">
                    <label className="field__label">Como dividir entre os sócios</label>
                    <div className="fin-split">
                      <button
                        type="button"
                        className={'fin-split__opt' + (splitMode === 'equity' ? ' fin-split__opt--active' : '')}
                        onClick={() => setSplitMode('equity')}
                      >
                        Por participação
                      </button>
                      <button
                        type="button"
                        className={'fin-split__opt' + (splitMode === 'equal' ? ' fin-split__opt--active' : '')}
                        onClick={() => setSplitMode('equal')}
                      >
                        Igualmente
                      </button>
                    </div>
                    {equityWarn}
                  </div>
                )}
                <div className="field">
                  <label className="field__label">Observação (opcional)</label>
                  <textarea
                    className="field__input rc-textarea"
                    placeholder="Ex.: plano mensal usado para criação de artes."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={300}
                    rows={2}
                  />
                </div>
              </div>
              <div className="mw-actions">
                <Button block onClick={() => validateDetails() && next('impact')}>
                  Continuar
                </Button>
                <Button variant="secondary" onClick={() => next('repeat')}>
                  Voltar
                </Button>
              </div>
            </>
          ) : (
          <>
          <div className="mw-form">
            <Input
              label={isExpense ? 'De onde veio o gasto' : isRevenue ? 'De onde veio a entrada' : 'Como quer chamar esse aporte'}
              placeholder={
                isExpense
                  ? 'Ex.: Servidor, domínio, contador…'
                  : isRevenue
                    ? 'Ex.: Mensalidade de cliente, venda…'
                    : 'Ex.: Aporte inicial'
              }
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              autoFocus
            />
            {(isExpense || isRevenue) && (
              <>
                <CategoriaSelect
                  categories={categories}
                  value={categoryId}
                  onChange={setCategoryId}
                  onCreate={createCategoryInline}
                  movementType={isRevenue ? 'receita' : 'despesa'}
                />
                <ContatoSelect
                  contacts={contacts}
                  value={contactId}
                  onChange={setContactId}
                  onCreate={createContactInline}
                  label={isRevenue ? 'Recebido de quem (opcional)' : 'Pago para quem (opcional)'}
                />
                <TagsInput value={tags} onChange={setTags} />
              </>
            )}
            <Input
              label={`Valor (${company.currencyCode ?? 'BRL'})`}
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(maskMoneyBRL(e.target.value))}
            />
            {isExpense && (
              <div className="field">
                <label className="field__label">Essa despesa já foi paga?</label>
                <div className="fin-split">
                  <button
                    type="button"
                    className={'fin-split__opt' + (paymentStatus === 'paid' ? ' fin-split__opt--active' : '')}
                    onClick={() => setPaymentStatus('paid')}
                  >
                    Já paga
                  </button>
                  <button
                    type="button"
                    className={'fin-split__opt' + (paymentStatus === 'unpaid' ? ' fin-split__opt--active' : '')}
                    onClick={() => setPaymentStatus('unpaid')}
                  >
                    A pagar
                  </button>
                </div>
                <p className="mw-hint">
                  {paymentStatus === 'paid'
                    ? 'Já paga: entra no total gasto e nos acertos entre os sócios. Logo abaixo você registra quem pagou e a parte de cada um.'
                    : 'A pagar: vira um lembrete com vencimento. Só entra nos cálculos quando você marcar como paga. Logo abaixo você define quem vai pagar.'}
                </p>
              </div>
            )}
            {isUnpaid ? (
              <div className="field">
                <label className="field__label">Vencimento</label>
                <DateField
                  value={dueDate}
                  onChange={setDueDate}
                  placeholder="Escolha o vencimento"
                />
              </div>
            ) : (
              <div className="field">
                <label className="field__label">
                  {isRevenue ? 'Quando entrou' : 'Quando foi'}
                  {year && ` (em ${year})`}
                </label>
                <DateField value={date} onChange={setDate} min={dateMin} max={dateMax} />
              </div>
            )}
            {isRevenue && (
              <div className="field">
                <label className="field__label">De onde veio o dinheiro (origem)</label>
                <div className="mw-sources">
                  {REVENUE_SOURCES.map((s) => (
                    <button
                      type="button"
                      key={s}
                      className={'mw-chip' + (!customSource && source === s ? ' is-on' : '')}
                      onClick={() => {
                        setSource(s);
                        setCustomSource(false);
                      }}
                    >
                      {s}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={'mw-chip mw-chip--add' + (customSource ? ' is-on' : '')}
                    onClick={() => {
                      setCustomSource(true);
                      setSource('');
                    }}
                  >
                    + Outra
                  </button>
                </div>
                {customSource && (
                  <input
                    className="field__input"
                    style={{ marginTop: 8 }}
                    placeholder="Ex.: Hotmart, PagSeguro, loja física…"
                    value={source}
                    maxLength={60}
                    onChange={(e) => setSource(e.target.value)}
                    autoFocus
                  />
                )}
              </div>
            )}
            {isRevenue && (
              <div className="field">
                <label className="field__label">Entrou na conta de (opcional)</label>
                <div className="mw-accountrow">
                  <select
                    className="field__select"
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                  >
                    <option value="">Não informar</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.fullName}
                      </option>
                    ))}
                    <option value="Conta da empresa">Conta da empresa</option>
                    {customAccounts.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="mw-addbox"
                    onClick={() => setAddingAccount((v) => !v)}
                    aria-label="Adicionar uma conta"
                    title="Adicionar uma conta"
                  >
                    +
                  </button>
                </div>
                {addingAccount && (
                  <div className="mw-accountadd">
                    <input
                      className="field__input"
                      placeholder="Ex.: Conta da empresa, Nubank PJ…"
                      value={newAccount}
                      maxLength={60}
                      onChange={(e) => setNewAccount(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          confirmAddAccount();
                        }
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="mw-addconfirm"
                      onClick={confirmAddAccount}
                      disabled={!newAccount.trim()}
                    >
                      Adicionar
                    </button>
                  </div>
                )}
              </div>
            )}
            {/* pessoas/divisão na MESMA tela (antes era um passo à parte) */}
            {!isRevenue && (
              <Select
                label={isUnpaid ? 'Quem vai pagar' : isExpense ? 'Quem pagou' : 'Sócio que aportou'}
                value={memberId}
                onChange={setMemberId}
                options={members.map((m) => ({ value: m.id, label: m.fullName }))}
              />
            )}
            {isExpense && (
              <div className="field">
                <label className="field__label">Como dividir entre os sócios</label>
                <div className="fin-split">
                  <button
                    type="button"
                    className={'fin-split__opt' + (splitMode === 'equity' ? ' fin-split__opt--active' : '')}
                    onClick={() => setSplitMode('equity')}
                  >
                    Por participação
                  </button>
                  <button
                    type="button"
                    className={'fin-split__opt' + (splitMode === 'equal' ? ' fin-split__opt--active' : '')}
                    onClick={() => setSplitMode('equal')}
                  >
                    Igualmente
                  </button>
                </div>
                <p className="mw-hint">
                  {splitMode === 'equity'
                    ? 'Cada sócio assume a parte proporcional à participação dele. Se alguém pagou mais que a própria parte, o Plim calcula o acerto.'
                    : 'O valor é dividido em partes iguais entre todos os sócios, independente da participação.'}
                </p>
                {equityWarn}
                {amountCents != null && members.length > 1 && (
                  <div className="mw-review mw-splitpreview">
                    {splitRows(memberId, !isUnpaid, isUnpaid ? 'vai pagar' : 'pagou')}
                  </div>
                )}
                {!isUnpaid && members.length > 1 && (
                  <p className="mw-hint">
                    Alguém já te passou a parte dela? Toque em "está devendo" para marcar como
                    acertado. O Plim registra o acerto junto com a despesa.
                  </p>
                )}
              </div>
            )}
            {type === 'contribution' && (
              <div className="field">
                <label className="field__label">Os sócios vão te reembolsar?</label>
                <div className="fin-split">
                  <button
                    type="button"
                    className={'fin-split__opt' + (!reimbursable ? ' fin-split__opt--active' : '')}
                    onClick={() => setReimbursable(false)}
                  >
                    Não, é só meu
                  </button>
                  <button
                    type="button"
                    className={'fin-split__opt' + (reimbursable ? ' fin-split__opt--active' : '')}
                    onClick={() => setReimbursable(true)}
                    disabled={soloMember}
                  >
                    Sim, cada sócio paga a parte
                  </button>
                </div>
                {!reimbursable ? (
                  <p className="mw-hint">
                    Fica registrado como capital de {memberName}: não vira gasto nem gera dívida
                    entre os sócios.
                  </p>
                ) : (
                  <>
                    <p className="mw-hint">
                      Você adiantou por todos. Cada sócio passa a te dever a parte dele: entra nos
                      acertos, mas continua sendo capital (fora do total gasto).
                    </p>
                    {members.length > 1 && (
                      <div className="fin-split">
                        <button
                          type="button"
                          className={'fin-split__opt' + (splitMode === 'equity' ? ' fin-split__opt--active' : '')}
                          onClick={() => setSplitMode('equity')}
                        >
                          Por participação
                        </button>
                        <button
                          type="button"
                          className={'fin-split__opt' + (splitMode === 'equal' ? ' fin-split__opt--active' : '')}
                          onClick={() => setSplitMode('equal')}
                        >
                          Igualmente
                        </button>
                      </div>
                    )}
                    {equityWarn}
                    {amountCents != null && members.length > 1 && (
                      <div className="mw-review mw-splitpreview">
                        {splitRows(memberId, true, 'aportou')}
                      </div>
                    )}
                    {members.length > 1 && (
                      <p className="mw-hint">
                        Alguém já te pagou a parte dela? Toque em "está devendo" para marcar como
                        acertado. O Plim registra o acerto junto com o aporte.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
            <div className="field">
              <label className="field__label">Observação (opcional)</label>
              <textarea
                className="field__input rc-textarea"
                placeholder={
                  isExpense
                    ? 'Ex.: renovação anual do domínio.'
                    : isRevenue
                      ? 'Ex.: assinatura mensal do cliente X.'
                      : 'Ex.: aporte combinado na reunião de junho.'
                }
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                rows={2}
              />
            </div>
          </div>
          <div className="mw-actions">
            <Button block onClick={() => validateDetails() && next('impact')}>
              Continuar
            </Button>
            <Button variant="secondary" onClick={() => next(isExpense ? 'repeat' : 'type')}>
              Voltar
            </Button>
          </div>
          </>
          )}
        </>
      )}

      {/* ── 3: impacto ── */}
      {step === 'impact' && (
        <>
          <p className="mw-lead">O que isso muda no Plim</p>
          <div className="mw-impact">
            <span className="mw-impact__kind">{kindLabel}</span>
            <ul className="mw-impact__list">
              {impactBullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
          <div className="mw-actions">
            <Button block onClick={() => next('review')}>
              Continuar
            </Button>
            <Button variant="secondary" onClick={() => next('details')}>
              Voltar
            </Button>
          </div>
        </>
      )}

      {/* ── 4: revisão ── */}
      {step === 'review' && (
        <>
          <p className="mw-lead">Confere pra mim?</p>
          <div className="mw-review">
            <div className="mw-review__row">
              <span>Você está registrando</span>
              <strong>{kindLabel}</strong>
            </div>
            <div className="mw-review__row">
              <span>{isRecurringExpense ? 'Nome' : isExpense ? 'Gasto' : isRevenue ? 'Entrada' : 'Aporte'}</span>
              <strong>{description.trim() || '—'}</strong>
            </div>
            <div className="mw-review__row">
              <span>{isRetroRepeated ? 'Valor de cada mês' : 'Valor'}</span>
              <strong data-financial>{amountCents != null ? formatMoney(amountCents, company.currencyCode) : '—'}</strong>
            </div>
            {isRetroRepeated ? (
              <>
                <div className="mw-review__row">
                  <span>Período</span>
                  <strong>
                    {MONTH_NAMES[fromMonth - 1]} a {MONTH_NAMES[toMonth - 1]} de {year}
                  </strong>
                </div>
                <div className="mw-review__row">
                  <span>Total do período</span>
                  <strong data-financial>
                    {retroTotalCents != null ? formatMoney(retroTotalCents, company.currencyCode) : '—'}
                  </strong>
                </div>
                {/* A lista fecha o ciclo: a pessoa vê mês a mês quem pagou
                    antes de gravar seis lançamentos de uma vez. */}
                <div className="mw-review__row mw-review__row--stack">
                  <span>Quem pagou cada mês</span>
                  <div className="mw-review__months">
                    {occurrences.map((oc) => (
                      <span className="mw-review__month" key={oc.key}>
                        {MONTH_NAMES[Number(oc.key.slice(5, 7)) - 1]}
                        <strong>
                          {members.find((m) => m.id === oc.paidByMemberId)?.fullName ?? '—'}
                        </strong>
                      </span>
                    ))}
                  </div>
                </div>
              </>
            ) : isRecurringExpense ? (
              <>
                <div className="mw-review__row">
                  <span>Se repete</span>
                  <strong>
                    {recurringFrequencyCatalog.find((f) => f.id === frequency)?.label ?? '—'}
                  </strong>
                </div>
                <div className="mw-review__row">
                  <span>Categoria</span>
                  <strong>
                    {recurringCategoryCatalog.find((c) => c.id === recCategory)?.label ?? '—'}
                  </strong>
                </div>
                <div className="mw-review__row">
                  <span>A partir de</span>
                  <strong>{formatDateBr(date)}</strong>
                </div>
              </>
            ) : isUnpaid ? (
              <>
                <div className="mw-review__row">
                  <span>Situação</span>
                  <strong>A pagar</strong>
                </div>
                <div className="mw-review__row">
                  <span>Vencimento</span>
                  <strong>{dueDate ? formatDateBr(dueDate) : '—'}</strong>
                </div>
              </>
            ) : (
              <div className="mw-review__row">
                <span>Quando</span>
                <strong>{formatDateBr(date)}</strong>
              </div>
            )}
            {isRevenue && source.trim() && (
              <div className="mw-review__row">
                <span>Origem</span>
                <strong>{source.trim()}</strong>
              </div>
            )}
            {/* No retroativo o pagador já foi listado mês a mês logo acima;
                repetir um "quem paga" único aqui contradiria a lista quando
                algum mês foi de outra pessoa. */}
            {!isRetroRepeated && (
              <div className="mw-review__row">
                <span>
                  {isRecurringExpense
                    ? 'Quem paga'
                    : isExpense
                      ? 'Pago por'
                      : isRevenue
                        ? 'Entrou na conta de'
                        : 'Aportado por'}
                </span>
                <strong>{isRevenue ? accountLabel.trim() || 'Não informado' : memberName}</strong>
              </div>
            )}
            {splitsAmongPartners && (
              <div className="mw-review__row">
                <span>{isRetroRepeated ? 'Divisão de cada mês' : 'Divisão'}</span>
                <strong>{splitMode === 'equity' ? 'Por participação' : 'Igualmente'}</strong>
              </div>
            )}
            {splitsAmongPartners &&
              amountCents != null &&
              members.length > 1 &&
              previewSplit(amountCents, members, splitMode).map((s) => {
                const m = members.find((x) => x.id === s.memberId);
                // Retroativo: o pagador muda de mês para mês, então marcar um
                // sócio como "pagou" aqui seria falso nos meses dos outros.
                const isPayer = !isRetroRepeated && s.memberId === memberId;
                const status = isPayer
                  ? isRecurringExpense
                    ? 'paga'
                    : isExpense
                      ? isUnpaid
                        ? 'vai pagar'
                        : 'pagou'
                      : 'aportou'
                  : // Recorrente ainda não cobrou: ninguém deve nada agora. O
                    // retroativo é o oposto: já aconteceu, então a dívida existe
                    // e precisa aparecer aqui.
                    (isRecurringExpense && !isRetroRepeated) || isUnpaid || s.cents === 0
                    ? null
                    : settledIds.includes(s.memberId)
                      ? 'já acertou'
                      : 'está devendo';
                return (
                  <div className="mw-review__row mw-review__row--sub" key={s.memberId}>
                    <span>
                      Parte de {m?.fullName ?? 'Sócio'}
                      {status && (
                        <span className={status === 'está devendo' ? 'mw-owing' : 'mw-payer'}>
                          {' '}
                          · {status}
                        </span>
                      )}
                    </span>
                    <strong data-financial>{formatMoney(s.cents, company.currencyCode)}</strong>
                  </div>
                );
              })}
            {note.trim() && (
              <div className="mw-review__row">
                <span>Observação</span>
                <strong>{note.trim()}</strong>
              </div>
            )}
          </div>
          {/* Uma linha só: a explicação completa já foi na etapa de impacto. */}
          <p className="mw-hint">{impactBullets[0]}</p>
          <div className="mw-actions">
            <Button block onClick={save} disabled={saving}>
              {saving
                ? 'Salvando…'
                : isRecurringExpense
                  ? 'Salvar despesa recorrente'
                  : isUnpaid
                    ? 'Salvar conta a pagar'
                    : isExpense
                      ? 'Salvar despesa'
                      : isRevenue
                        ? 'Salvar entrada'
                        : 'Salvar aporte'}
            </Button>
            <Button variant="secondary" onClick={() => next('impact')} disabled={saving}>
              Voltar
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Porcentagem enxuta em pt-BR (80, 33,33). */
function formatPct(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

function formatDateBr(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}
