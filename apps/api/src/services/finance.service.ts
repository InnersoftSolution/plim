import type {
  CreateContributionInput,
  CreateExpenseInput,
  CreateRepeatedExpenseInput,
  CreateRevenueInput,
  CreateSettlementPaymentInput,
  ExpenseShare,
  ExpenseShareInput,
  ExpenseSplitMode,
  InheritanceInput,
  InheritanceLine,
  InheritancePreview,
  MemberBalance,
  MovementDebt,
  MovementSettlement,
  PaymentStatus,
  ResponsibilityRule,
  Settlement,
  SettlementPayment as SettlementPaymentDto,
  UpdateMovementInput,
} from '@plim/shared';
import type { CompanyMember } from '../domain/company';
import type { Expense, SettlementPayment } from '../domain/finance';
import type { RecurringCost } from '../domain/recurring';
import type { FinanceRepository } from '../repositories/finance.repository';
import type { RecurringRepository } from '../repositories/recurring.repository';
import type { CompanyService } from './company.service';
import type { AuditService } from './audit.service';
import type { AuditAction, AuditEntityType } from '@plim/shared';

import { computeSplit } from './rateio';
import { DomainError, NotFoundError } from '../lib/errors';

/** Valor em reais para as frases da auditoria. */
const brl = (c: number): string =>
  (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Avança a data da cobrança conforme a frequência (YYYY-MM-DD, sem fuso).
 * Mensal/trimestral/anual preservam o dia, ajustando quando o mês é mais
 * curto (31 jan + 1 mês = 28/29 fev). 'other' é tratado como mensal.
 */
/** Último dia do mês de uma data ISO (YYYY-MM-DD) → YYYY-MM-DD. */
export function lastDayOfMonthIso(iso: string): string {
  const [y, m] = iso.split('-').map(Number) as [number, number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // dia 0 do mês seguinte = último deste
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

export function nextChargeDate(chargeOn: string, frequency: RecurringCost['frequency']): string | null {
  if (frequency === 'once') return null;
  const [y, m, d] = chargeOn.split('-').map(Number) as [number, number, number];
  if (frequency === 'weekly') {
    const date = new Date(Date.UTC(y, m - 1, d + 7));
    return date.toISOString().slice(0, 10);
  }
  const months = frequency === 'quarterly' ? 3 : frequency === 'annual' ? 12 : 1;
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = total % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const date = new Date(Date.UTC(year, month, Math.min(d, lastDay)));
  return date.toISOString().slice(0, 10);
}

/**
 * De onde veio a parte de cada sócio, gravado junto com o número para a tela
 * conseguir explicar ("dividido pela participação" × "digitado à mão").
 * 'custom' vira 'manual': é o mesmo fato com o nome que o usuário entende.
 */
export function responsibilityRuleOf(splitMode: ExpenseSplitMode): ResponsibilityRule {
  return splitMode === 'custom' ? 'manual' : splitMode;
}


/**
 * Situação da despesa PERANTE O FORNECEDOR, derivada do que foi pago.
 *
 * Não confundir com acerto entre sócios: uma despesa pode estar Paga e ainda
 * haver valor a regularizar entre as pessoas.
 *
 * 'unpaid' gravado é conta a pagar e continua valendo (nada saiu). Já a
 * diferença entre 'paid' e 'partial' vem da soma dos pagamentos, e não de um
 * campo digitado, porque campo digitado mente quando alguém esquece de mudar.
 */
export function paymentStatusOf(expense: {
  amountCents: number;
  payments: { amountCents: number }[];
  paymentStatus: PaymentStatus;
}): PaymentStatus {
  if (expense.paymentStatus === 'unpaid') return 'unpaid';
  const pago = totalPago(expense.payments);
  if (pago <= 0) return expense.paymentStatus;
  return pago >= expense.amountCents ? 'paid' : 'partial';
}

export function totalPago(payments: { amountCents: number }[]): number {
  return payments.reduce((soma, p) => soma + p.amountCents, 0);
}

/**
 * Quanto da responsabilidade de cada sócio já está VALENDO nesta movimentação.
 *
 * Numa despesa quitada é a parte cheia. Numa despesa paga pela metade, só se
 * pode acertar entre sócios o dinheiro que de fato saiu do bolso de alguém: o
 * que falta ainda é conta com o fornecedor, e vira responsabilidade de cada um
 * quando for pago. Sem isso o saldo dos sócios deixaria de somar zero e os
 * acertos passariam a cobrar dívida que ninguém adiantou.
 *
 * Usa o mesmo método do maior resto do rateio, então as partes efetivas somam
 * exatamente o valor pago, sem centavo sobrando.
 */
function responsabilidadeEfetiva(expense: {
  amountCents: number;
  shares: ExpenseShare[];
  payments: { amountCents: number }[];
}): Map<string, number> {
  const pago = Math.min(totalPago(expense.payments), expense.amountCents);
  const cents = computeSplit(
    pago,
    expense.shares.map((s) => s.shareCents),
  );
  return new Map(expense.shares.map((s, i) => [s.memberId, cents[i]!]));
}



/**
 * Quem deve a quem DENTRO de uma movimentação, agrupado por credor.
 *
 * Casa o maior devedor com o maior credor (mesmo método guloso dos acertos
 * gerais). Devolve um par credor → lista de dívidas, porque com mais de um
 * pagador a dívida de cada sócio se reparte entre quem adiantou.
 */
function credoresDaMovimentacao(expense: {
  amountCents: number;
  shares: ExpenseShare[];
  payments: { memberId: string; amountCents: number }[];
}): Map<string, { debtorId: string; cents: number }[]> {
  const efetivas = responsabilidadeEfetiva(expense);
  const saldos = new Map<string, number>();
  for (const s of expense.shares) {
    saldos.set(s.memberId, -(efetivas.get(s.memberId) ?? 0));
  }
  for (const p of expense.payments) {
    saldos.set(p.memberId, (saldos.get(p.memberId) ?? 0) + p.amountCents);
  }

  const devedores = [...saldos.entries()]
    .filter(([, c]) => c < 0)
    .map(([id, c]) => ({ id, cents: -c }))
    .sort((a, b) => b.cents - a.cents);
  const credores = [...saldos.entries()]
    .filter(([, c]) => c > 0)
    .map(([id, c]) => ({ id, cents: c }))
    .sort((a, b) => b.cents - a.cents);

  const porCredor = new Map<string, { debtorId: string; cents: number }[]>();
  let di = 0;
  let ci = 0;
  while (di < devedores.length && ci < credores.length) {
    const devedor = devedores[di]!;
    const credor = credores[ci]!;
    const valor = Math.min(devedor.cents, credor.cents);
    if (valor > 0) {
      const lista = porCredor.get(credor.id) ?? [];
      lista.push({ debtorId: devedor.id, cents: valor });
      porCredor.set(credor.id, lista);
    }
    devedor.cents -= valor;
    credor.cents -= valor;
    if (devedor.cents === 0) di += 1;
    if (credor.cents === 0) ci += 1;
  }
  return porCredor;
}

/**
 * Valida e normaliza os pagadores informados na tela.
 *
 * Devolve `null` quando não veio nada, e aí vale o pagamento único do
 * `paidByMemberId`. O que a validação protege:
 *   - sócio inexistente (dinheiro atribuído a quem não é da empresa);
 *   - soma acima do valor da movimentação, que criaria crédito do nada;
 *   - pagamento zerado, que é linha sem significado.
 */
function normalizaPagadores(
  entrada: { memberId: string; amountCents: number; paidOn?: string }[] | undefined,
  members: CompanyMember[],
  amountCents: number,
  dataPadrao: string,
): { memberId: string; amountCents: number; paidOn: string }[] | null {
  if (!entrada || entrada.length === 0) return null;
  for (const p of entrada) {
    if (!members.some((m) => m.id === p.memberId)) {
      throw new NotFoundError('MEMBER_NOT_FOUND', 'Sócio pagador não encontrado.');
    }
  }
  const soma = entrada.reduce((s, p) => s + p.amountCents, 0);
  if (soma > amountCents) {
    throw new DomainError(
      'PAYMENTS_ABOVE_AMOUNT',
      'A soma do que cada um pagou passou do valor da movimentação.',
    );
  }
  return entrada.map((p) => ({
    memberId: p.memberId,
    amountCents: p.amountCents,
    paidOn: p.paidOn ?? dataPadrao,
  }));
}

/** Maior pagador: alimenta a coluna antiga paid_by_member_id (sai na fatia G). */
function maiorPagador(
  payments: { memberId: string; amountCents: number }[],
  padrao: string,
): string {
  return payments.reduce((maior, p) => (p.amountCents > maior.amountCents ? p : maior), {
    memberId: padrao,
    amountCents: -1,
  }).memberId;
}

/**
 * Pagamento único: o sócio informado colocou o valor cheio.
 *
 * É o caso comum e o único que a tela sabe registrar hoje; a partir da fatia C
 * a pessoa poderá informar mais de um pagador. Conta a pagar não gera
 * pagamento nenhum, porque nada saiu ainda.
 */
function pagamentoIntegral(memberId: string, amountCents: number, paidOn: string) {
  return [{ memberId, amountCents, paidOn }];
}

/**
 * Decide se uma movimentação já nasce confirmada ou precisa do pagador confirmar.
 * Confirmação só é exigida quando o pagador tem CONTA vinculada e é diferente
 * de quem cadastrou (senão não há quem confirmar — entra confirmada).
 */
function resolveConfirmation(
  members: CompanyMember[],
  payer: CompanyMember,
  actingUserId?: string | null,
): { status: 'confirmed' | 'pending'; createdByMemberId: string | null } {
  const creator = actingUserId ? members.find((m) => m.userId === actingUserId) ?? null : null;
  const needsConfirmation =
    actingUserId != null && payer.userId != null && payer.userId !== actingUserId;
  return {
    status: needsConfirmation ? 'pending' : 'confirmed',
    createdByMemberId: creator?.id ?? null,
  };
}

function toPaymentDto(p: SettlementPayment): SettlementPaymentDto {
  return {
    id: p.id,
    companyId: p.companyId,
    fromMemberId: p.fromMemberId,
    toMemberId: p.toMemberId,
    amountCents: p.amountCents,
    paidOn: p.paidOn,
    method: p.method,
    note: p.note,
    status: p.status,
    expenseId: p.expenseId,
    isAuto: p.isAuto,
    createdAt: p.createdAt.toISOString(),
  };
}

/**
 * Regras do financeiro. Dinheiro em centavos inteiros; todo cálculo (rateio,
 * saldos) vive aqui. O front só apresenta. Autorização reusa getOverview.
 */
export class FinanceService {
  constructor(
    private readonly companyService: CompanyService,
    private readonly repo: FinanceRepository,
    /** Quando presente, liga a materialização de custos recorrentes. */
    private readonly recurringRepo?: RecurringRepository,
    /** Quando presente, grava a trilha de auditoria das ações. */
    private readonly audit?: AuditService,
  ) {}

  /**
   * Grava "quem fez o quê" sem nunca derrubar a ação principal.
   * A frase nasce aqui, com o nome de agora: se o sócio sair depois,
   * a história continua contada.
   */
  private async trilha(
    companyId: string,
    members: CompanyMember[],
    actingUserId: string | null | undefined,
    action: AuditAction,
    entityType: AuditEntityType,
    entityId: string | null,
    frase: string,
  ): Promise<void> {
    if (!this.audit) return;
    const actor = actingUserId ? members.find((m) => m.userId === actingUserId) ?? null : null;
    await this.audit.record({
      companyId,
      actorMemberId: actor?.id ?? null,
      actorName: actor?.fullName ?? null,
      action,
      entityType,
      entityId,
      summary: `${actor?.fullName ?? 'Sistema'} ${frase}`,
    });
  }

  /**
   * Materializa cobranças vencidas dos custos recorrentes ativos: para cada
   * custo com nextChargeOn <= hoje, gera uma CONTA A PAGAR já rateada entre
   * os sócios (splitMode do custo) e avança a próxima cobrança.
   * Idempotente: (custo, competência) é única; roda "preguiçosa" a cada
   * abertura do financeiro. Determinística, R$0 de IA.
   */
  private async materializeRecurringCharges(
    companyId: string,
    members: CompanyMember[],
    today = new Date().toISOString().slice(0, 10),
  ): Promise<void> {
    if (!this.recurringRepo) return;
    // Materializa as cobranças ATÉ O FIM DO MÊS ATUAL (não só até hoje): uma
    // conta que vence mais pra frente no mês (ex.: dia 20) já entra como conta a
    // pagar do mês, aparecendo em "A vencer" e no gráfico antes do vencimento.
    const horizon = lastDayOfMonthIso(today);
    const costs = await this.recurringRepo.list(companyId);
    for (const cost of costs) {
      if (!cost.active) continue;
      // Recorrente ativo sem data de cobrança começa HOJE (senão nunca viraria
      // conta a pagar). 'once' sem data fica só como registro, não cobra sozinho.
      const start =
        cost.nextChargeOn ?? (cost.frequency !== 'once' ? today : null);
      if (!start || start > horizon) continue;
      // Data final ("até quando"): o custo para de cobrar sozinho no dia certo,
      // sem depender de alguém lembrar de desativar. Um contrato encerrado não
      // pode continuar virando conta a pagar.
      const limite = cost.endsOn != null && cost.endsOn < horizon ? cost.endsOn : horizon;
      if (start > limite) continue;

      let charge: string | null = start;
      // Trava de segurança: no máximo 24 competências por vez (2 anos mensais).
      for (let guard = 0; charge != null && charge <= limite && guard < 24; guard++) {
        const already = await this.repo.findExpenseByRecurringCharge(cost.id, charge);
        if (!already) {
          const weights = members.map((m) =>
            cost.splitMode === 'equal' ? 1 : m.equityPercent ?? 0,
          );
          const split = computeSplit(cost.amountCents, weights);
          await this.repo.createExpense({
            companyId,
            kind: 'expense',
            description: cost.name,
            amountCents: cost.amountCents,
            currencyCode: cost.currencyCode,
            paidByMemberId: cost.paidByMemberId,
            spentOn: charge,
            splitMode: cost.splitMode,
            // Conta a pagar nasce sem pagamento: ninguém tirou do bolso ainda.
            payments: [],
            shares: members.map((m, i) => ({
              memberId: m.id,
              shareCents: split[i]!,
              participates: true,
              rule: responsibilityRuleOf(cost.splitMode),
            })),
            note: null,
            source: null,
            account: null,
            paymentStatus: 'unpaid', // nasce como conta a pagar; entra nos números ao pagar
            dueDate: charge,
            confirmationStatus: 'confirmed', // gerada pelo sistema a partir de regra já acordada
            createdByMemberId: null,
            recurringCostId: cost.id,
            recurringChargeOn: charge,
            categoryId: null,
            tags: [],
            contactId: null,
          });
        }
        charge = nextChargeDate(charge, cost.frequency);
      }
      // Persiste a próxima cobrança (nula quando era pagamento único).
      await this.recurringRepo.update(cost.id, { nextChargeOn: charge });
    }
  }

  async createExpense(
    companyId: string,
    input: CreateExpenseInput,
    actingUserId?: string | null,
  ): Promise<Expense> {
    const { company, members } = await this.companyService.getOverview(companyId, actingUserId);

    const payer = members.find((m) => m.id === input.paidByMemberId);
    if (!payer) {
      throw new NotFoundError('MEMBER_NOT_FOUND', 'Sócio pagador não encontrado.');
    }

    const shares = this.computeShares(input, members);
    const conf = resolveConfirmation(members, payer, actingUserId);

    // Conta a pagar: exige vencimento. Já paga: sem vencimento.
    const isUnpaid = input.paymentStatus === 'unpaid';
    if (isUnpaid && !input.dueDate) {
      throw new DomainError('DUE_DATE_REQUIRED', 'Informe a data de vencimento da conta a pagar.');
    }

    const dia = input.spentOn ?? new Date().toISOString().slice(0, 10);
    const informados = normalizaPagadores(input.payments, members, input.amountCents, dia);
    if (isUnpaid && informados) {
      throw new DomainError(
        'UNPAID_WITH_PAYMENTS',
        'Conta a pagar não tem pagamento: nada saiu ainda.',
      );
    }
    const payments = isUnpaid
      ? []
      : informados ?? pagamentoIntegral(input.paidByMemberId, input.amountCents, dia);

    const expense = await this.repo.createExpense({
      companyId,
      kind: 'expense',
      description: input.description,
      amountCents: input.amountCents,
      currencyCode: company.currencyCode,
      // Coluna antiga: fica com o maior pagador, para o que ainda a lê.
      paidByMemberId: informados
        ? maiorPagador(informados, input.paidByMemberId)
        : input.paidByMemberId,
      spentOn: dia,
      splitMode: input.splitMode,
      shares,
      payments,
      note: input.note ?? null,
      source: null,
      account: null,
      paymentStatus: isUnpaid ? 'unpaid' : 'paid',
      dueDate: isUnpaid ? input.dueDate ?? null : null,
      confirmationStatus: conf.status,
      createdByMemberId: conf.createdByMemberId,
      recurringCostId: null,
      recurringChargeOn: null,
      categoryId: input.categoryId ?? null,
      tags: input.tags ?? [],
      contactId: input.contactId ?? null,
    });

    // "Fulano já me pagou a parte dele": registra o acerto na hora, junto
    // com a despesa. Só faz sentido para despesa JÁ PAGA e confirmada.
    // Com mais de um pagador não existe "o credor": a dívida de cada sócio se
    // reparte entre quem adiantou, e marcar isso na criação viraria adivinhação.
    // Nesse caso o acerto se registra depois, em Acertos, com valor e destino
    // explícitos. A tela também não oferece a marcação quando há vários.
    if (
      input.settledMemberIds?.length &&
      expense.payments.length <= 1 &&
      expense.paymentStatus === 'paid' &&
      expense.confirmationStatus === 'confirmed'
    ) {
      for (const memberId of new Set(input.settledMemberIds)) {
        if (memberId === expense.paidByMemberId) continue; // pagador não deve a si mesmo
        const share = expense.shares.find((s) => s.memberId === memberId);
        if (!share || share.shareCents <= 0) continue;
        await this.repo.createPayment({
          companyId,
          fromMemberId: memberId,
          toMemberId: expense.paidByMemberId,
          amountCents: share.shareCents,
          paidOn: expense.spentOn,
          method: null,
          note: `Acerto registrado junto com a despesa "${expense.description}".`,
          status: 'confirmed',
          expenseId: expense.id,
          isAuto: true,
        });
      }
    }

    await this.trilha(
      companyId,
      members,
      actingUserId,
      'created',
      'movement',
      expense.id,
      isUnpaid
        ? `registrou a conta a pagar "${expense.description}" de ${brl(expense.amountCents)}`
        : `registrou a despesa "${expense.description}" de ${brl(expense.amountCents)}`,
    );

    return expense;
  }

  /**
   * Despesa que se REPETIU num período já encerrado (lançamento retroativo).
   *
   * Cria UMA movimentação por competência, cada uma com o seu pagador. Não cria
   * custo recorrente: recorrente é promessa de cobrança futura, e aqui o
   * período já acabou. Assim os meses entram no total do ano e nos acertos sem
   * inflar a estimativa de custo mensal de hoje.
   *
   * Valida tudo ANTES de gravar qualquer coisa: sem transação no repositório,
   * uma falha no meio deixaria metade dos meses lançados. Depois da validação
   * só restam erros de infraestrutura.
   */
  async createRepeatedExpense(
    companyId: string,
    input: CreateRepeatedExpenseInput,
    actingUserId?: string | null,
  ): Promise<Expense[]> {
    const { company, members } = await this.companyService.getOverview(companyId, actingUserId);

    // Validação prévia: todo pagador existe e nenhuma competência se repete.
    const vistos = new Set<string>();
    for (const oc of input.occurrences) {
      if (!members.some((m) => m.id === oc.paidByMemberId)) {
        throw new NotFoundError('MEMBER_NOT_FOUND', 'Sócio pagador não encontrado.');
      }
      if (vistos.has(oc.spentOn)) {
        throw new DomainError(
          'DUPLICATE_OCCURRENCE',
          `Há mais de um lançamento para ${oc.spentOn}. Cada competência entra uma vez só.`,
        );
      }
      vistos.add(oc.spentOn);
    }

    // O rateio é o mesmo em todas (mesmo valor e mesma regra de divisão), então
    // calcula uma vez só em vez de repetir por mês.
    const shares = this.computeShares(
      { ...input, paidByMemberId: input.occurrences[0]!.paidByMemberId } as CreateExpenseInput,
      members,
    );

    const criadas: Expense[] = [];
    for (const oc of input.occurrences) {
      const payer = members.find((m) => m.id === oc.paidByMemberId)!;
      const conf = resolveConfirmation(members, payer, actingUserId);
      criadas.push(
        await this.repo.createExpense({
          companyId,
          kind: 'expense',
          description: input.description,
          amountCents: input.amountCents,
          currencyCode: company.currencyCode,
          paidByMemberId: oc.paidByMemberId,
          spentOn: oc.spentOn,
          splitMode: input.splitMode,
          shares,
          payments: pagamentoIntegral(oc.paidByMemberId, input.amountCents, oc.spentOn),
          note: input.note ?? null,
          source: null,
          account: null,
          // Retroativo é história: já foi pago, não vira conta a pagar.
          paymentStatus: 'paid',
          dueDate: null,
          confirmationStatus: conf.status,
          createdByMemberId: conf.createdByMemberId,
          recurringCostId: null,
          recurringChargeOn: null,
          categoryId: input.categoryId ?? null,
          tags: input.tags ?? [],
          contactId: input.contactId ?? null,
        }),
      );

      // "Fulano já me acertou" é por MÊS: quem deve a quem muda junto com o
      // pagador daquele mês.
      const criada = criadas[criadas.length - 1]!;
      await this.registerSettledShares(companyId, criada, oc.settledMemberIds);
    }
    return criadas;
  }

  /**
   * Registra o acerto dos sócios que já pagaram a parte deles ao pagador, junto
   * com a movimentação. Só faz sentido em despesa JÁ PAGA e confirmada: em
   * cobrança pendente de confirmação ainda não há dívida acordada.
   */
  private async registerSettledShares(
    companyId: string,
    expense: Expense,
    settledMemberIds: string[] | undefined,
  ): Promise<void> {
    if (!settledMemberIds?.length) return;
    if (expense.paymentStatus !== 'paid' || expense.confirmationStatus !== 'confirmed') return;
    for (const memberId of new Set(settledMemberIds)) {
      if (memberId === expense.paidByMemberId) continue;
      const share = expense.shares.find((s) => s.memberId === memberId);
      if (!share || share.shareCents <= 0) continue;
      await this.repo.createPayment({
        companyId,
        fromMemberId: memberId,
        toMemberId: expense.paidByMemberId,
        amountCents: share.shareCents,
        paidOn: expense.spentOn,
        method: null,
        note: `Acerto registrado junto com a despesa "${expense.description}".`,
        status: 'confirmed',
        expenseId: expense.id,
        isAuto: true,
      });
    }
  }

  /**
   * Aporte: sócio coloca dinheiro no negócio.
   * - Padrão: NÃO divide e NÃO gera dívida (RB002) — é registro de capital.
   * - Reembolsável: o autor adiantou por todos; cada sócio passa a dever a parte
   *   dele. Continua sendo capital (kind 'contribution', fora do total gasto),
   *   mas as partes entram nos acertos entre os sócios.
   */
  async createContribution(
    companyId: string,
    input: CreateContributionInput,
    actingUserId?: string | null,
  ): Promise<Expense> {
    const { company, members } = await this.companyService.getOverview(companyId, actingUserId);
    const member = members.find((m) => m.id === input.memberId);
    if (!member) {
      throw new NotFoundError('MEMBER_NOT_FOUND', 'Sócio do aporte não encontrado.');
    }
    const conf = resolveConfirmation(members, member, actingUserId);

    // Aporte reembolsável divide a parte de cada sócio (o autor também assume a
    // dele). Aporte comum não tem partes.
    const shares: ExpenseShare[] = input.reimbursable
      ? (() => {
          const weights =
            input.splitMode === 'equal' ? members.map(() => 1) : members.map((m) => m.equityPercent ?? 0);
          const cents = computeSplit(input.amountCents, weights);
          const rule = responsibilityRuleOf(input.splitMode === 'equal' ? 'equal' : 'equity');
          return members.map((m, i) => ({
            memberId: m.id,
            shareCents: cents[i]!,
            participates: true,
            rule,
          }));
        })()
      : [];
    const splitMode = input.reimbursable ? input.splitMode ?? 'equity' : 'custom';

    const contribution = await this.repo.createExpense({
      companyId,
      kind: 'contribution',
      description: input.description,
      amountCents: input.amountCents,
      currencyCode: company.currencyCode,
      paidByMemberId: input.memberId,
      spentOn: input.contributedOn ?? new Date().toISOString().slice(0, 10),
      splitMode,
      shares,
      // O autor do aporte colocou o dinheiro: é pagamento como qualquer outro.
      payments: pagamentoIntegral(
        input.memberId,
        input.amountCents,
        input.contributedOn ?? new Date().toISOString().slice(0, 10),
      ),
      note: input.note ?? null,
      source: null,
      account: null,
      paymentStatus: 'paid', // aporte não tem vencimento
      dueDate: null,
      confirmationStatus: conf.status,
      createdByMemberId: conf.createdByMemberId,
      recurringCostId: null,
      recurringChargeOn: null,
      categoryId: input.categoryId ?? null,
      tags: input.tags ?? [],
      contactId: null,
    });

    // "Fulano já me pagou a parte dele" no momento do aporte: registra o acerto.
    if (
      input.reimbursable &&
      input.settledMemberIds?.length &&
      contribution.confirmationStatus === 'confirmed'
    ) {
      for (const memberId of new Set(input.settledMemberIds)) {
        if (memberId === contribution.paidByMemberId) continue; // autor não deve a si mesmo
        const share = contribution.shares.find((s) => s.memberId === memberId);
        if (!share || share.shareCents <= 0) continue;
        await this.repo.createPayment({
          companyId,
          fromMemberId: memberId,
          toMemberId: contribution.paidByMemberId,
          amountCents: share.shareCents,
          paidOn: contribution.spentOn,
          method: null,
          note: `Acerto registrado junto com o aporte "${contribution.description}".`,
          status: 'confirmed',
          expenseId: contribution.id,
          isAuto: true,
        });
      }
    }

    await this.trilha(
      companyId,
      members,
      actingUserId,
      'created',
      'movement',
      contribution.id,
      `registrou o aporte "${contribution.description}" de ${brl(contribution.amountCents)}`,
    );

    return contribution;
  }

  /**
   * Receita: dinheiro que ENTROU na empresa. É da empresa (não divide entre
   * sócios, não é gasto). Entra no resultado (recebido − gasto).
   */
  async createRevenue(
    companyId: string,
    input: CreateRevenueInput,
    actingUserId?: string | null,
  ): Promise<Expense> {
    const { company, members } = await this.companyService.getOverview(companyId, actingUserId);
    if (members.length === 0) {
      throw new NotFoundError('MEMBER_NOT_FOUND', 'Empresa sem sócios.');
    }
    // A conta pode ser de um sócio, "Conta da empresa" ou uma conta própria.
    // O paidByMemberId (FK obrigatória) usa o sócio informado, senão quem
    // registrou, senão o primeiro — é só vínculo; a conta real vai em `account`.
    const receiver =
      members.find((m) => m.id === input.receivedByMemberId) ??
      (actingUserId ? members.find((m) => m.userId === actingUserId) : undefined) ??
      members[0]!;
    const conf = resolveConfirmation(members, receiver, actingUserId);
    const revenue = await this.repo.createExpense({
      companyId,
      kind: 'revenue',
      description: input.description,
      amountCents: input.amountCents,
      currencyCode: company.currencyCode,
      paidByMemberId: receiver.id, // vínculo obrigatório (a conta real fica em account)
      // Entrada é dinheiro que CHEGOU: nenhum sócio pagou nada aqui.
      payments: [],
      spentOn: input.receivedOn ?? new Date().toISOString().slice(0, 10),
      splitMode: 'custom',
      shares: [], // receita não divide entre sócios
      note: input.note ?? null,
      source: input.source ?? null,
      account: input.account ?? null,
      paymentStatus: 'paid',
      dueDate: null,
      confirmationStatus: conf.status,
      createdByMemberId: conf.createdByMemberId,
      recurringCostId: null,
      recurringChargeOn: null,
      categoryId: input.categoryId ?? null,
      tags: input.tags ?? [],
      contactId: input.contactId ?? null,
    });
    await this.trilha(
      companyId,
      members,
      actingUserId,
      'created',
      'movement',
      revenue.id,
      `registrou a entrada "${revenue.description}" de ${brl(revenue.amountCents)}`,
    );
    return revenue;
  }

  /**
   * Confirma/recusa uma movimentação que estava aguardando o pagador.
   * Só o próprio pagador (com conta vinculada) pode. Confirmar → entra nos
   * cálculos; recusar → fica de fora e quem cadastrou pode editar/cancelar.
   */
  async setConfirmation(
    companyId: string,
    expenseId: string,
    decision: 'confirmed' | 'refused',
    actingUserId?: string | null,
  ): Promise<Expense> {
    const { members } = await this.companyService.getOverview(companyId, actingUserId);
    const expense = await this.repo.findExpenseById(companyId, expenseId);
    if (!expense) {
      throw new NotFoundError('MOVEMENT_NOT_FOUND', 'Movimentação não encontrada.');
    }
    if (expense.confirmationStatus !== 'pending') {
      throw new DomainError('MOVEMENT_NOT_PENDING', 'Esta movimentação não está aguardando confirmação.');
    }
    // Autorização: quem age precisa ser o sócio pagador.
    const payer = members.find((m) => m.id === expense.paidByMemberId);
    if (actingUserId != null && payer?.userId !== actingUserId) {
      throw new DomainError('NOT_THE_PAYER', 'Só o sócio informado como pagador pode confirmar.', 403);
    }
    const updated = await this.repo.updateConfirmation(expenseId, decision);
    await this.trilha(
      companyId,
      members,
      actingUserId,
      decision,
      'movement',
      expenseId,
      `${decision === 'confirmed' ? 'confirmou' : 'recusou'} a movimentação "${expense.description}"`,
    );
    return updated;
  }

  /**
   * Marca uma conta a pagar como paga. A partir daí ela entra nos cálculos
   * (total gasto, acertos, projeção). Qualquer sócio pode registrar o pagamento.
   */
  async payExpense(
    companyId: string,
    expenseId: string,
    paidOn: string | undefined,
    actingUserId?: string | null,
    paidByMemberId?: string | null,
  ): Promise<Expense> {
    const { members } = await this.companyService.getOverview(companyId, actingUserId);
    const expense = await this.repo.findExpenseById(companyId, expenseId);
    if (!expense) {
      throw new NotFoundError('MOVEMENT_NOT_FOUND', 'Movimentação não encontrada.');
    }
    if (expense.kind !== 'expense') {
      throw new DomainError('NOT_PAYABLE', 'Só despesas podem ser marcadas como pagas.');
    }
    if (expense.paymentStatus !== 'unpaid') {
      throw new DomainError('ALREADY_PAID', 'Esta despesa já está paga.');
    }
    // Quem pagou de verdade pode não ser o pagador previsto: a pergunta é
    // feita na hora de pagar, e a resposta manda no acerto entre sócios.
    const pagador = paidByMemberId ?? expense.paidByMemberId;
    if (!members.some((m) => m.id === pagador)) {
      throw new NotFoundError('MEMBER_NOT_FOUND', 'Sócio pagador não encontrado.');
    }
    const dia = paidOn ?? new Date().toISOString().slice(0, 10);
    let paga = await this.repo.markExpensePaid(expenseId, dia);
    if (pagador !== paga.paidByMemberId) {
      paga = await this.repo.updateExpense(expenseId, { paidByMemberId: pagador });
    }
    // A conta a pagar não tinha pagamento nenhum; agora tem. Sem esta linha o
    // dinheiro sairia do bolso de alguém sem ninguém ficar credor.
    const payments = await this.repo.replaceExpensePayments(
      expenseId,
      pagamentoIntegral(pagador, paga.amountCents, dia),
    );
    const nomePagador = members.find((m) => m.id === pagador)?.fullName ?? 'Sócio';
    await this.trilha(
      companyId,
      members,
      actingUserId,
      'paid',
      'movement',
      expenseId,
      `marcou como paga a conta "${expense.description}" (${brl(expense.amountCents)}, pagou ${nomePagador})`,
    );
    return { ...paga, payments };
  }

  /**
   * Exclusão definitiva de uma movimentação (despesa ou aporte).
   * Os saldos e acertos são recalculados na hora, pois derivam das despesas.
   * Irreversível: o front confirma com a pessoa antes de chamar.
   */
  async removeExpense(
    companyId: string,
    expenseId: string,
    actingUserId?: string | null,
  ): Promise<void> {
    const { members } = await this.companyService.getOverview(companyId, actingUserId);
    const expense = await this.repo.findExpenseById(companyId, expenseId);
    if (!expense) {
      throw new NotFoundError('MOVEMENT_NOT_FOUND', 'Movimentação não encontrada.');
    }
    await this.repo.deleteExpense(expenseId);
    await this.trilha(
      companyId,
      members,
      actingUserId,
      'deleted',
      'movement',
      expenseId,
      `excluiu a movimentação "${expense.description}" de ${brl(expense.amountCents)}`,
    );
  }

  /**
   * Edição de uma movimentação já registrada. Recalcula o rateio quando muda
   * valor, divisão ou pagador. Barreiras:
   * - cobrança gerada por custo recorrente edita-se pelo custo, não aqui.
   * - se a movimentação já tem acertos registrados, mudanças estruturais
   *   (valor/divisão/pagador) são bloqueadas para não corromper os pagamentos.
   */
  async updateExpense(
    companyId: string,
    expenseId: string,
    input: UpdateMovementInput,
    actingUserId?: string | null,
  ): Promise<Expense> {
    const { members } = await this.companyService.getOverview(companyId, actingUserId);
    const expense = await this.repo.findExpenseById(companyId, expenseId);
    if (!expense) {
      throw new NotFoundError('MOVEMENT_NOT_FOUND', 'Movimentação não encontrada.');
    }
    if (expense.recurringCostId != null) {
      throw new DomainError(
        'RECURRING_MOVEMENT',
        'Essa cobrança vem de um custo recorrente. Edite pelo custo recorrente.',
        409,
      );
    }

    const isRevenue = expense.kind === 'revenue';
    // Muda o "esqueleto" do rateio? (valor, divisão ou quem pagou)
    const amountChanged = input.amountCents != null && input.amountCents !== expense.amountCents;
    const splitChanged =
      (input.splitMode != null && input.splitMode !== expense.splitMode) || input.customShares != null;
    const payerChanged = input.paidByMemberId != null && input.paidByMemberId !== expense.paidByMemberId;
    // Editar quem pagou também mexe no esqueleto: quem passa a pagar direto ao
    // fornecedor deixa de dever "a parte" a alguém, e o acerto automático dela
    // tem que acompanhar. Sem isso, sobra acerto fantasma no saldo.
    const paymentsChanged = !isRevenue && (input.payments?.length ?? 0) > 0;
    const structural =
      !isRevenue && (amountChanged || splitChanged || payerChanged || paymentsChanged);

    /**
     * Acertos MANUAIS ligados a esta movimentação. Manual é dinheiro que mudou
     * de mão num valor próprio: mudar a despesa não pode reescrever isso, então
     * eles ficam intactos e o saldo continua batendo a partir deles.
     * Os AUTOMÁTICOS ("já me pagou") são ajustados mais abaixo, depois que o
     * novo rateio existe.
     */
    const linkedPayments = structural
      ? (await this.repo.listPayments(companyId)).filter(
          (p) => p.expenseId === expenseId && p.status === 'confirmed',
        )
      : [];

    if (payerChanged && !members.some((m) => m.id === input.paidByMemberId)) {
      throw new NotFoundError('MEMBER_NOT_FOUND', 'Sócio pagador não encontrado.');
    }

    const patch: Partial<
      Pick<
        Expense,
        'description' | 'amountCents' | 'spentOn' | 'note' | 'paidByMemberId' | 'splitMode' | 'shares' | 'source' | 'account' | 'categoryId' | 'tags' | 'contactId'
      >
    > = {};
    if (input.description !== undefined) patch.description = input.description;
    if (input.amountCents !== undefined) patch.amountCents = input.amountCents;
    if (input.spentOn !== undefined) patch.spentOn = input.spentOn;
    if (input.note !== undefined) patch.note = input.note;
    if (input.categoryId !== undefined) patch.categoryId = input.categoryId;
    if (input.tags !== undefined) patch.tags = input.tags;
    if (input.contactId !== undefined) patch.contactId = input.contactId;
    if (isRevenue) {
      if (input.source !== undefined) patch.source = input.source;
      if (input.account !== undefined) patch.account = input.account;
    } else {
      if (input.paidByMemberId !== undefined) patch.paidByMemberId = input.paidByMemberId;
      if (input.splitMode !== undefined) patch.splitMode = input.splitMode;
    }

    // Recalcula o rateio se a despesa/aporte reembolsável tem partes e algo
    // do esqueleto mudou. Aporte não reembolsável (sem partes) não rateia.
    const hasShares = expense.shares.length > 0;
    if (!isRevenue && hasShares && (amountChanged || splitChanged)) {
      const amountCents = input.amountCents ?? expense.amountCents;
      const splitMode = (input.splitMode ?? expense.splitMode) as ExpenseSplitMode;
      patch.shares = this.recomputeShares(amountCents, splitMode, input.customShares, members);
    }

    // Pagadores informados na tela substituem o histórico desta movimentação.
    // É edição explícita de quem colocou dinheiro, diferente do ajuste
    // automático mais abaixo (que só acompanha valor e pagador).
    const informados = !isRevenue
      ? normalizaPagadores(
          input.payments,
          members,
          input.amountCents ?? expense.amountCents,
          input.spentOn ?? expense.spentOn,
        )
      : null;
    if (informados) patch.paidByMemberId = maiorPagador(informados, expense.paidByMemberId);

    let atualizada = await this.repo.updateExpense(expenseId, patch);

    if (informados) {
      atualizada = {
        ...atualizada,
        payments: await this.repo.replaceExpensePayments(expenseId, informados),
      };
    }

    /**
     * Pagamento acompanha valor e pagador, mas só enquanto a movimentação tem
     * UM pagador que pagou tudo, que é o que a tela sabe registrar hoje. Se
     * alguém já dividiu o pagamento entre sócios (fatia C em diante), reescrever
     * aqui apagaria o histórico de quem colocou dinheiro, e histórico não se
     * reescreve (RN1): nesse caso a edição de valor não mexe em pagamento.
     */
    const pagamentoUnicoIntegral =
      expense.payments.length === 1 && expense.payments[0]!.amountCents === expense.amountCents;
    if (!informados && !isRevenue && (amountChanged || payerChanged) && pagamentoUnicoIntegral) {
      const payments = await this.repo.replaceExpensePayments(
        expenseId,
        pagamentoIntegral(
          atualizada.paidByMemberId,
          atualizada.amountCents,
          expense.payments[0]!.paidOn,
        ),
      );
      atualizada = { ...atualizada, payments };
    }

    // Só depois de salvar: os acertos automáticos passam a valer sobre o novo
    // rateio. Fazer antes deixaria acerto ajustado apontando para um valor que
    // talvez nem fosse gravado (se a atualização falhasse).
    if (structural && linkedPayments.length > 0) {
      await this.syncAutoSettlements(atualizada, linkedPayments);
    }

    await this.trilha(
      companyId,
      members,
      actingUserId,
      'updated',
      'movement',
      expenseId,
      `editou a movimentação "${atualizada.description}"` +
        (atualizada.amountCents !== expense.amountCents
          ? ` (valor: ${brl(expense.amountCents)} → ${brl(atualizada.amountCents)})`
          : ''),
    );

    return atualizada;
  }


  /* ── jornada do sócio novo: herdar (ou não) o passado ──────────── */

  /**
   * Movimentações anteriores à entrada do sócio que podem ser herdadas.
   *
   * Só despesa confirmada e com rateio: receita não divide, aporte não
   * reembolsável não gera dívida, e conta a pagar ainda não tem dinheiro
   * envolvido. Quem já tem parte na despesa não entra de novo.
   */
  private async despesasHerdaveis(
    companyId: string,
    memberId: string,
    since: string,
  ): Promise<Expense[]> {
    const todas = await this.repo.listExpenses(companyId);
    return todas.filter(
      (e) =>
        e.spentOn < since &&
        e.confirmationStatus === 'confirmed' &&
        e.shares.length > 0 &&
        (e.kind === 'expense' || e.kind === 'contribution') &&
        paymentStatusOf(e) !== 'unpaid' &&
        !e.shares.some((sh) => sh.memberId === memberId && sh.shareCents > 0),
    );
  }

  /**
   * Novo rateio de UMA despesa incluindo o sócio que entrou depois.
   *
   * O pagamento não é tocado (RN1): o que muda é de quem é o custo. Quem já
   * estava fora da despesa (participates = false) continua fora, porque isso
   * foi decisão de alguém e não sobra de cálculo.
   */
  private rateioComHerdeiro(
    expense: Expense,
    members: CompanyMember[],
    memberId: string,
    input: InheritanceInput,
  ): ExpenseShare[] {
    const antigos = expense.shares.filter((sh) => sh.memberId !== memberId);
    const participantes = antigos.filter((sh) => sh.participates !== false);

    if (input.mode === 'equity') {
      // Redivide entre os participantes de antes MAIS o novo, pela participação
      // societária de cada um. Sócio que estava fora desta despesa segue fora.
      const pesos = [
        ...participantes.map((sh) => members.find((m) => m.id === sh.memberId)?.equityPercent ?? 0),
        members.find((m) => m.id === memberId)?.equityPercent ?? 0,
      ];
      const cents = computeSplit(expense.amountCents, pesos);
      return [
        ...participantes.map((sh, i) => ({ ...sh, shareCents: cents[i]!, rule: 'inherited' as const })),
        {
          memberId,
          shareCents: cents[cents.length - 1]!,
          participates: true,
          rule: 'inherited' as const,
        },
        ...antigos.filter((sh) => sh.participates === false),
      ];
    }

    // Percentual à mão: o novo assume a fatia dele e o resto se redistribui
    // entre os antigos na mesma proporção de antes, para não bagunçar acordos
    // que já existiam. Centésimos de por cento para não passar por float.
    const centesimos = Math.round((input.percent ?? 0) * 100);
    const doNovo = Math.round((expense.amountCents * centesimos) / 10000);
    const resto = expense.amountCents - doNovo;
    const cents = computeSplit(
      resto,
      participantes.map((sh) => sh.shareCents),
    );
    return [
      ...participantes.map((sh, i) => ({ ...sh, shareCents: cents[i]!, rule: 'inherited' as const })),
      { memberId, shareCents: doNovo, participates: true, rule: 'inherited' as const },
      ...antigos.filter((sh) => sh.participates === false),
    ];
  }

  /**
   * Prévia de "esse sócio assume as despesas anteriores?". Não escreve nada:
   * mexer no dinheiro dos outros começa mostrando a conta, não salvando.
   */
  async previewInheritance(
    companyId: string,
    input: InheritanceInput,
    actingUserId?: string | null,
  ): Promise<InheritancePreview> {
    const { members } = await this.companyService.getOverview(companyId, actingUserId);
    const novo = members.find((m) => m.id === input.memberId);
    if (!novo) throw new NotFoundError('MEMBER_NOT_FOUND', 'Sócio não encontrado.');

    const despesas = await this.despesasHerdaveis(companyId, input.memberId, input.since);
    const lines: InheritanceLine[] = [];
    const devePara = new Map<string, number>();
    let totalCents = 0;
    let periodTotalCents = 0;

    for (const e of despesas) {
      periodTotalCents += e.amountCents;
      if (input.mode === 'none') continue;
      const novasPartes = this.rateioComHerdeiro(e, members, input.memberId, input);
      const parte = novasPartes.find((sh) => sh.memberId === input.memberId)?.shareCents ?? 0;
      if (parte <= 0) continue;
      totalCents += parte;
      lines.push({
        expenseId: e.id,
        description: e.description,
        spentOn: e.spentOn,
        amountCents: e.amountCents,
        shareCents: parte,
      });
      // A dívida vai para quem adiantou o dinheiro NAQUELA despesa, na mesma
      // proporção do que cada um pagou (RN6). Maior resto para fechar exato.
      const pagos = e.payments.length > 0 ? e.payments : [];
      const fatias = computeSplit(
        parte,
        pagos.map((p) => p.amountCents),
      );
      pagos.forEach((p, i) => {
        if (p.memberId === input.memberId) return;
        devePara.set(p.memberId, (devePara.get(p.memberId) ?? 0) + fatias[i]!);
      });
    }

    return {
      memberId: input.memberId,
      expenseCount: despesas.length,
      periodTotalCents,
      totalCents,
      owedTo: [...devePara.entries()]
        .filter(([, cents]) => cents > 0)
        .map(([memberId, amountCents]) => ({
          memberId,
          fullName: members.find((m) => m.id === memberId)?.fullName ?? 'Sócio',
          amountCents,
        }))
        .sort((a, b) => b.amountCents - a.amountCents),
      lines,
    };
  }

  /**
   * Aplica a decisão. 'none' não escreve nada de propósito: não participar do
   * passado é o estado em que as despesas já estão.
   */
  async applyInheritance(
    companyId: string,
    input: InheritanceInput,
    actingUserId?: string | null,
  ): Promise<InheritancePreview> {
    const previa = await this.previewInheritance(companyId, input, actingUserId);
    if (input.mode === 'none') return previa;

    const { members } = await this.companyService.getOverview(companyId, actingUserId);
    const despesas = await this.despesasHerdaveis(companyId, input.memberId, input.since);
    const acertos = (await this.repo.listPayments(companyId)).filter(
      (p) => p.status === 'confirmed',
    );

    for (const e of despesas) {
      const shares = this.rateioComHerdeiro(e, members, input.memberId, input);
      if (shares.reduce((soma, sh) => soma + sh.shareCents, 0) !== e.amountCents) {
        throw new DomainError(
          'SPLIT_SUM_MISMATCH',
          `O novo rateio de "${e.description}" não fecha com o valor. Nada foi alterado nessa despesa.`,
        );
      }
      const atualizada = await this.repo.updateExpense(e.id, { shares, splitMode: 'custom' });
      // Os acertos automáticos valiam sobre a parte antiga; agora acompanham a
      // nova. Os manuais continuam intocados: são dinheiro que mudou de mão.
      await this.syncAutoSettlements(
        atualizada,
        acertos.filter((p) => p.expenseId === e.id),
      );
    }
    return previa;
  }

  /**
   * Realinha os acertos AUTOMÁTICOS de uma movimentação que mudou de valor,
   * divisão ou pagador.
   *
   * Automático nasceu do "fulano já me pagou": é a afirmação de que a pessoa
   * quitou A PARTE dela, não um pagamento de valor próprio. Quando a parte
   * muda, ele acompanha; quando deixa de haver o que quitar, ele deixa de
   * existir.
   *
   * O que ele deve quitar é a parte MENOS o que a própria pessoa pagou direto
   * ao fornecedor. Foi aqui que nasceu o fantasma do Juridico: a Gabrielli
   * tinha um "já me pagou" de quando a Rafaelle era a única pagadora, e ao
   * virar pagadora de metade da conta o acerto dela tinha que morrer. A regra
   * antiga só matava o acerto de quem virasse O pagador da coluna antiga, e
   * com dois pagadores ninguém "vira o pagador".
   *
   * Acerto MANUAL nunca é tocado: aquilo é dinheiro que mudou de mão de verdade
   * e reescrever seria falsificar o histórico. Ele continua valendo e o saldo
   * se ajusta sozinho a partir do novo rateio.
   */
  private async syncAutoSettlements(
    expense: Expense,
    linkedPayments: SettlementPayment[],
  ): Promise<void> {
    const pagoPor = (memberId: string) =>
      expense.payments
        .filter((p) => p.memberId === memberId)
        .reduce((soma, p) => soma + p.amountCents, 0);
    // O credor do "já me pagou" é quem mais adiantou (pagou além da própria
    // parte). Com um pagador só, é ele mesmo; com vários, o maior excedente.
    const excedentes = [...new Set(expense.payments.map((p) => p.memberId))]
      .map((id) => ({
        id,
        cents: pagoPor(id) - (expense.shares.find((s) => s.memberId === id)?.shareCents ?? 0),
      }))
      .filter((c) => c.cents > 0)
      .sort((a, b) => b.cents - a.cents);
    const principalCredor = excedentes[0]?.id ?? expense.paidByMemberId;

    for (const pagamento of linkedPayments) {
      if (!pagamento.isAuto) continue;
      const parte = expense.shares.find((s) => s.memberId === pagamento.fromMemberId);
      // O que essa pessoa ainda tinha a quitar: a parte dela menos o que ela
      // mesma colocou direto no fornecedor.
      const devida = Math.max(0, (parte?.shareCents ?? 0) - pagoPor(pagamento.fromMemberId));
      if (devida <= 0 || pagamento.fromMemberId === principalCredor) {
        await this.repo.deletePayment(pagamento.id);
        continue;
      }
      if (devida !== pagamento.amountCents || principalCredor !== pagamento.toMemberId) {
        await this.repo.updatePayment(pagamento.id, {
          amountCents: devida,
          toMemberId: principalCredor,
        });
      }
    }
  }

  /** Recalcula as partes conforme o modo de rateio (equity/equal/custom). */
  private recomputeShares(
    amountCents: number,
    splitMode: ExpenseSplitMode,
    customShares: ExpenseShareInput[] | undefined,
    members: CompanyMember[],
  ): ExpenseShare[] {
    if (splitMode === 'custom') {
      const shares = customShares ?? [];
      for (const s of shares) {
        if (!members.some((m) => m.id === s.memberId)) {
          throw new NotFoundError('MEMBER_NOT_FOUND', 'Sócio da divisão não encontrado.');
        }
      }
      const total = shares.reduce((sum, s) => sum + s.shareCents, 0);
      if (total !== amountCents) {
        throw new DomainError('SPLIT_SUM_MISMATCH', 'As partes precisam somar exatamente o valor.');
      }
      // Parte zero digitada à mão é a forma antiga de dizer "não participa".
      return shares.map((s) => ({ ...s, participates: s.shareCents > 0, rule: 'manual' as const }));
    }
    const weights =
      splitMode === 'equal' ? members.map(() => 1) : members.map((m) => m.equityPercent ?? 0);
    const cents = computeSplit(amountCents, weights);
    const rule = responsibilityRuleOf(splitMode);
    return members.map((m, i) => ({
      memberId: m.id,
      shareCents: cents[i]!,
      participates: true,
      rule,
    }));
  }

  async listExpenses(companyId: string, actingUserId?: string | null) {
    const { members } = await this.companyService.getOverview(companyId, actingUserId);
    const meId = actingUserId ? members.find((m) => m.userId === actingUserId)?.id ?? null : null;
    // Cobranças recorrentes vencidas viram contas a pagar antes de listar.
    // Falha aqui não pode derrubar a listagem (ex.: corrida entre duas abas).
    try {
      await this.materializeRecurringCharges(companyId, members);
    } catch {
      /* melhor listar sem materializar do que quebrar o financeiro */
    }
    const expenses = await this.repo.listExpenses(companyId);
    // canConfirm: sou o pagador E está aguardando minha confirmação.
    return expenses.map((e) => ({
      ...e,
      // Situação perante o fornecedor sai da soma dos pagamentos, não do campo.
      paymentStatus: paymentStatusOf(e),
      canConfirm: e.confirmationStatus === 'pending' && meId != null && e.paidByMemberId === meId,
    }));
  }

  /**
   * Saldo de cada sócio: o que PAGOU − a RESPONSABILIDADE que lhe cabe.
   *
   * As duas colunas são independentes (ver docs/PAGAMENTO-E-RESPONSABILIDADE.md):
   * pagou vem de expense_payments, que é histórico de quem tirou do bolso;
   * deve vem de expense_shares, que é decisão da sociedade e pode ser revista
   * quando entra ou sai sócio. Por isso uma despesa 100% paga ao fornecedor
   * ainda pode ter valor a acertar entre as pessoas.
   *
   * Considera SÓ despesas — aportes não geram dívida entre sócios (RB002).
   * Pagamentos de acerto registrados entram no saldo: quem pagou reduz a
   * dívida (net sobe); quem recebeu reduz o crédito (net desce).
   */
  async getBalances(companyId: string, actingUserId?: string | null): Promise<MemberBalance[]> {
    const { members } = await this.companyService.getOverview(companyId, actingUserId);
    // Entram nos cálculos: despesas CONFIRMADAS e JÁ PAGAS e aportes
    // REEMBOLSÁVEIS (aporte com partes). Aporte comum não gera dívida (RB002);
    // pending/refused/cancelled e contas a pagar ficam fora.
    const expenses = (await this.repo.listExpenses(companyId)).filter(
      (e) =>
        e.confirmationStatus === 'confirmed' &&
        // Parcial entra: o que já saiu do bolso de alguém é dinheiro real e
        // gera acerto. O que falta pagar é conta com o fornecedor, e fica de
        // fora até sair.
        paymentStatusOf(e) !== 'unpaid' &&
        (e.kind === 'expense' || (e.kind === 'contribution' && e.shares.length > 0)),
    );
    const payments = (await this.repo.listPayments(companyId)).filter((p) => p.status === 'confirmed');

    return members.map((m) => {
      // Soma o que a pessoa colocou de dinheiro, e não mais "as despesas em que
      // ela figura como A pagadora". A diferença aparece quando duas sócias
      // pagam a mesma conta direto ao fornecedor: as duas pagaram, e o modelo
      // antigo só sabia reconhecer uma.
      const paidCents = expenses.reduce(
        (sum, e) =>
          sum +
          e.payments.filter((p) => p.memberId === m.id).reduce((s, p) => s + p.amountCents, 0),
        0,
      );
      const owedCents = expenses.reduce(
        (sum, e) => sum + (responsabilidadeEfetiva(e).get(m.id) ?? 0),
        0,
      );
      const sentCents = payments
        .filter((p) => p.fromMemberId === m.id)
        .reduce((sum, p) => sum + p.amountCents, 0);
      const receivedCents = payments
        .filter((p) => p.toMemberId === m.id)
        .reduce((sum, p) => sum + p.amountCents, 0);
      return {
        memberId: m.id,
        fullName: m.fullName,
        paidCents,
        owedCents,
        netCents: paidCents - owedCents + sentCents - receivedCents,
      };
    });
  }

  /**
   * Acertos líquidos entre sócios (quem paga quem), já simplificados e com os
   * pagamentos descontados. `alreadyPaidCents` traz o histórico do par.
   */
  /**
   * Quem paga quem, POR PAR de sócios.
   *
   * O valor de cada par é a soma das dívidas em aberto daquele par nas
   * movimentações, menos o que o outro lado deve de volta e menos pagamentos
   * já feitos além das dívidas. Ou seja: clicar no acerto e listar as despesas
   * SEMPRE fecha no mesmo número, porque é a mesma conta.
   *
   * Antes o resumo consolidava globalmente (o maior devedor pagava o maior
   * credor, mesmo sem dívida direta entre eles). O número final até fechava,
   * mas não correspondia a nenhuma lista de itens, e a Rafaelle olhou a tela e
   * não reconheceu a própria dívida. Dinheiro que não se explica está errado,
   * mesmo quando a soma bate.
   */
  async getSettlements(companyId: string, actingUserId?: string | null): Promise<Settlement[]> {
    const { members } = await this.companyService.getOverview(companyId, actingUserId);
    const nameOf = (id: string) => members.find((m) => m.id === id)?.fullName ?? 'Sócio';
    const { movements, sobras } = await this.movementLedger(companyId, actingUserId);

    // Dívidas em aberto por direção (A→B), somadas das movimentações.
    const deve = new Map<string, number>();
    const soma = (k: string, cents: number) => deve.set(k, (deve.get(k) ?? 0) + cents);
    for (const m of movements) {
      for (const d of m.debts) {
        if (d.remainingCents > 0) soma(`${d.debtorId}->${m.payerId}`, d.remainingCents);
      }
    }
    // Pagamento além das dívidas é crédito na direção contrária: se A pagou a
    // B mais do que devia, é B quem fica devendo a diferença.
    for (const [k, cents] of sobras) {
      if (cents <= 0) continue;
      const [de, para] = k.split('->') as [string, string];
      soma(`${para}->${de}`, cents);
    }

    // Compensa só DENTRO do par: o que A deve a B menos o que B deve a A.
    const payments = (await this.repo.listPayments(companyId)).filter((p) => p.status === 'confirmed');
    const vistos = new Set<string>();
    const out: Settlement[] = [];
    for (const k of deve.keys()) {
      const [a, b] = k.split('->') as [string, string];
      const par = [a, b].sort().join('|');
      if (vistos.has(par)) continue;
      vistos.add(par);
      const liquido = (deve.get(`${a}->${b}`) ?? 0) - (deve.get(`${b}->${a}`) ?? 0);
      if (liquido === 0) continue;
      const fromMemberId = liquido > 0 ? a : b;
      const toMemberId = liquido > 0 ? b : a;
      out.push({
        fromMemberId,
        fromName: nameOf(fromMemberId),
        toMemberId,
        toName: nameOf(toMemberId),
        amountCents: Math.abs(liquido),
        alreadyPaidCents: payments
          .filter((p) => p.fromMemberId === fromMemberId && p.toMemberId === toMemberId)
          .reduce((sum, p) => sum + p.amountCents, 0),
      });
    }
    return out.sort((x, y) => y.amountCents - x.amountCents);
  }

  /**
   * Acerto POR ORIGEM: cada movimentação compartilhada (despesa ou aporte
   * reembolsável, confirmada e paga) gera as dívidas dos sócios ao autor,
   * amarradas àquela movimentação. Pagamentos ligados à origem reduzem só ela;
   * pagamentos antigos (sem origem) são distribuídos por par, das dívidas mais
   * antigas para as recentes, para reconciliar com o saldo líquido.
   */
  async getMovementSettlements(
    companyId: string,
    actingUserId?: string | null,
  ): Promise<MovementSettlement[]> {
    const { movements } = await this.movementLedger(companyId, actingUserId);
    return movements;
  }

  /**
   * O livro-razão das movimentações: as dívidas em aberto de cada uma, mais as
   * SOBRAS (pagamentos registrados além do que havia para quitar, por par).
   * As sobras existem para o resumo por par fechar com o saldo: dinheiro que
   * alguém mandou a mais não some, vira crédito.
   */
  private async movementLedger(
    companyId: string,
    actingUserId?: string | null,
  ): Promise<{ movements: MovementSettlement[]; sobras: Map<string, number> }> {
    const { members } = await this.companyService.getOverview(companyId, actingUserId);
    const nameOf = (id: string) => members.find((m) => m.id === id)?.fullName ?? 'Sócio';

    const movements = (await this.repo.listExpenses(companyId))
      .filter(
        (e) =>
          e.confirmationStatus === 'confirmed' &&
          // Parcial entra pelo que já saiu do bolso de alguém; o que falta é
          // conta com o fornecedor, não dívida entre sócios.
          paymentStatusOf(e) !== 'unpaid' &&
          (e.kind === 'expense' || (e.kind === 'contribution' && e.shares.length > 0)),
      )
      // Mais antigas primeiro: o pool de pagamentos antigos quita as dívidas
      // mais velhas antes das recentes.
      .sort((a, b) => a.spentOn.localeCompare(b.spentOn));

    const payments = (await this.repo.listPayments(companyId)).filter((p) => p.status === 'confirmed');

    // Sobras por par: pagamentos além do que havia para quitar.
    const sobras = new Map<string, number>();
    // Pool de pagamentos SEM origem (antigos), por par devedor→credor.
    const legacyPool = new Map<string, number>();
    for (const p of payments) {
      if (p.expenseId) continue;
      const k = `${p.fromMemberId}->${p.toMemberId}`;
      legacyPool.set(k, (legacyPool.get(k) ?? 0) + p.amountCents);
    }

    const out: MovementSettlement[] = [];
    for (const m of movements) {
      // Quem deve a quem NESTA movimentação: a diferença entre o que cada um
      // pagou e a parte que lhe cabia. Com mais de um pagador existe mais de um
      // credor, então a movimentação vira um bloco por credor. Supor "o
      // pagador" seria cobrar todo mundo da pessoa errada.
      // Pares (devedor→credor) que existem NESTA movimentação: pagamento
      // ligado a ela fora desses pares não tem dívida para quitar, e vira
      // sobra (crédito de volta). Sem isso, um acerto órfão some da conta por
      // par mas continua no saldo, e os dois nunca mais fecham.
      const paresDaMovimentacao = new Set<string>();
      for (const [payerId, deveres] of credoresDaMovimentacao(m)) {
        const debts: MovementDebt[] = [];
        for (const { debtorId, cents } of deveres) {
          const direct = payments.filter(
            (p) => p.expenseId === m.id && p.fromMemberId === debtorId && p.toMemberId === payerId,
          );
          const directlyPaid = direct.reduce((sum, p) => sum + p.amountCents, 0);
          // Data do pagamento mais recente amarrado a essa dívida (exibição).
          const lastPaidOn = direct.reduce<string | null>(
            (acc, p) => (acc == null || p.paidOn > acc ? p.paidOn : acc),
            null,
          );
          paresDaMovimentacao.add(`${debtorId}->${payerId}`);
          if (directlyPaid > cents) {
            // Pagou além da dívida desta movimentação: a diferença é sobra.
            const k = `${debtorId}->${payerId}`;
            sobras.set(k, (sobras.get(k) ?? 0) + (directlyPaid - cents));
          }
          let remaining = Math.max(0, cents - directlyPaid);
          if (remaining > 0) {
            const k = `${debtorId}->${payerId}`;
            const pool = legacyPool.get(k) ?? 0;
            if (pool > 0) {
              const used = Math.min(pool, remaining);
              remaining -= used;
              legacyPool.set(k, pool - used);
            }
          }
          debts.push({
            debtorId,
            debtorName: nameOf(debtorId),
            originalCents: cents,
            paidCents: cents - remaining,
            remainingCents: remaining,
            lastPaidOn,
          });
        }
        if (debts.length === 0) continue;
        out.push({
          movementId: m.id,
          kind: m.kind,
          description: m.description,
          spentOn: m.spentOn,
          amountCents: m.amountCents,
          payerId,
          payerName: nameOf(payerId),
          recorrente: m.recurringCostId != null,
          remainingCents: debts.reduce((sum, d) => sum + d.remainingCents, 0),
          debts,
        });
      }
      for (const p of payments) {
        if (p.expenseId !== m.id) continue;
        const k = `${p.fromMemberId}->${p.toMemberId}`;
        if (!paresDaMovimentacao.has(k)) {
          sobras.set(k, (sobras.get(k) ?? 0) + p.amountCents);
        }
      }
    }
    // O que restou do pool também é sobra: pagamento avulso que ninguém devia.
    for (const [k, resto] of legacyPool) {
      if (resto > 0) sobras.set(k, (sobras.get(k) ?? 0) + resto);
    }
    // Exibição: pendentes primeiro, depois mais recentes.
    out.sort((a, b) => {
      const ap = a.remainingCents > 0 ? 1 : 0;
      const bp = b.remainingCents > 0 ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return b.spentOn.localeCompare(a.spentOn);
    });
    return { movements: out, sobras };
  }

  /**
   * Registra pagamento de acerto (total ou parcial). Com origem (expenseId),
   * quita a parte daquela movimentação; sem origem, cai no acerto líquido do
   * par. Guarda-chuva: nunca deixa pagar mais do que o pendente.
   */
  async createSettlementPayment(
    companyId: string,
    input: CreateSettlementPaymentInput,
    actingUserId?: string | null,
  ): Promise<SettlementPaymentDto> {
    const { members } = await this.companyService.getOverview(companyId, actingUserId);
    for (const id of [input.fromMemberId, input.toMemberId]) {
      if (!members.some((m) => m.id === id)) {
        throw new NotFoundError('MEMBER_NOT_FOUND', 'Sócio do acerto não encontrado.');
      }
    }

    if (input.expenseId) {
      const movements = await this.getMovementSettlements(companyId, actingUserId);
      // Uma movimentação pode ter vários credores: procura o bloco DAQUELE
      // credor, e não o primeiro bloco da movimentação.
      const mov = movements.find(
        (m) => m.movementId === input.expenseId && m.payerId === input.toMemberId,
      );
      const debt = mov?.debts.find((d) => d.debtorId === input.fromMemberId);
      if (!mov || !debt) {
        throw new DomainError('SETTLEMENT_NOT_PENDING', 'Não há acerto pendente nessa movimentação.');
      }
      if (input.amountCents > debt.remainingCents) {
        throw new DomainError(
          'SETTLEMENT_OVERPAY',
          `O valor é maior que o pendente dessa movimentação. Falta acertar ${debt.remainingCents} centavos.`,
        );
      }
    } else {
      const settlements = await this.getSettlements(companyId, actingUserId);
      const pending = settlements.find(
        (s) => s.fromMemberId === input.fromMemberId && s.toMemberId === input.toMemberId,
      );
      if (!pending) {
        throw new DomainError('SETTLEMENT_NOT_PENDING', 'Não há acerto pendente entre esses sócios.');
      }
      if (input.amountCents > pending.amountCents) {
        throw new DomainError(
          'SETTLEMENT_OVERPAY',
          `O valor é maior que o pendente entre os dois. Falta acertar ${pending.amountCents} centavos.`,
        );
      }
    }

    const payment = await this.repo.createPayment({
      companyId,
      fromMemberId: input.fromMemberId,
      toMemberId: input.toMemberId,
      amountCents: input.amountCents,
      paidOn: input.paidOn ?? new Date().toISOString().slice(0, 10),
      method: input.method ?? null,
      note: input.note ?? null,
      status: 'confirmed',
      expenseId: input.expenseId ?? null,
      // Registrado à parte, em Acertos: é dinheiro que mudou de mão num valor
      // próprio. Nunca é reescrito quando a movimentação de origem muda.
      isAuto: false,
    });
    const nomeDe = (id: string) => members.find((m) => m.id === id)?.fullName ?? 'Sócio';
    await this.trilha(
      companyId,
      members,
      actingUserId,
      'created',
      // Amarrado à movimentação de origem quando existe: assim o histórico
      // DELA conta também os acertos que a quitaram.
      input.expenseId ? 'movement' : 'settlement_payment',
      input.expenseId ?? payment.id,
      `registrou um acerto de ${brl(input.amountCents)} de ${nomeDe(input.fromMemberId)} para ${nomeDe(input.toMemberId)}`,
    );
    return toPaymentDto(payment);
  }

  /** Histórico de pagamentos de acerto (mais recentes primeiro). */
  async listSettlementPayments(
    companyId: string,
    actingUserId?: string | null,
  ): Promise<SettlementPaymentDto[]> {
    await this.companyService.getOverview(companyId, actingUserId);
    return (await this.repo.listPayments(companyId)).map(toPaymentDto);
  }

  /**
   * Uma movimentação sozinha, para a PÁGINA de detalhe. Existe em vez de a tela
   * baixar a lista inteira e procurar: a página tem URL própria e pode ser
   * aberta direto (link compartilhado, recarregar, voltar do navegador), quando
   * a lista nem chegou a ser carregada.
   */
  async getMovement(
    companyId: string,
    expenseId: string,
    actingUserId?: string | null,
  ): Promise<Expense & { canConfirm: boolean }> {
    const { members } = await this.companyService.getOverview(companyId, actingUserId);
    const expense = await this.repo.findExpenseById(companyId, expenseId);
    if (!expense) {
      throw new NotFoundError('MOVEMENT_NOT_FOUND', 'Movimentação não encontrada.');
    }
    const meId = actingUserId ? members.find((m) => m.userId === actingUserId)?.id ?? null : null;
    return {
      ...expense,
      paymentStatus: paymentStatusOf(expense),
      canConfirm:
        expense.confirmationStatus === 'pending' && meId != null && expense.paidByMemberId === meId,
    };
  }

  /**
   * Desfaz um acerto. É o par do "marcar que acertou": marcar por engano tem
   * que ter volta, senão a pessoa fica presa a um saldo errado.
   *
   * Vale tanto para o automático quanto para o manual, porque os dois podem ter
   * sido registrados por engano. A diferença mora na TELA, que avisa com clareza
   * quando o que está sendo apagado é um pagamento lançado à parte.
   */
  async removeSettlementPayment(
    companyId: string,
    paymentId: string,
    actingUserId?: string | null,
  ): Promise<void> {
    const { members } = await this.companyService.getOverview(companyId, actingUserId);
    const payments = await this.repo.listPayments(companyId);
    const payment = payments.find((p) => p.id === paymentId);
    // Confere a empresa antes de apagar: id de outra empresa não pode passar.
    if (!payment || payment.companyId !== companyId) {
      throw new NotFoundError('PAYMENT_NOT_FOUND', 'Acerto não encontrado.');
    }
    await this.repo.deletePayment(paymentId);
    const nomeDe = (id: string) => members.find((m) => m.id === id)?.fullName ?? 'Sócio';
    await this.trilha(
      companyId,
      members,
      actingUserId,
      'deleted',
      payment.expenseId ? 'movement' : 'settlement_payment',
      payment.expenseId ?? paymentId,
      `desfez um acerto de ${brl(payment.amountCents)} de ${nomeDe(payment.fromMemberId)} para ${nomeDe(payment.toMemberId)}`,
    );
  }

  /** Calcula a parte de cada sócio conforme o modo de rateio. */
  private computeShares(input: CreateExpenseInput, members: CompanyMember[]): ExpenseShare[] {
    if (input.splitMode === 'custom') {
      const shares = input.customShares ?? [];
      for (const s of shares) {
        if (!members.some((m) => m.id === s.memberId)) {
          throw new NotFoundError('MEMBER_NOT_FOUND', 'Sócio da divisão não encontrado.');
        }
      }
      const total = shares.reduce((sum, s) => sum + s.shareCents, 0);
      if (total !== input.amountCents) {
        throw new DomainError('SPLIT_SUM_MISMATCH', 'As partes precisam somar exatamente o valor da despesa.');
      }
      // Parte zero digitada à mão é a forma antiga de dizer "não participa".
      return shares.map((s) => ({ ...s, participates: s.shareCents > 0, rule: 'manual' as const }));
    }

    const weights =
      input.splitMode === 'equal'
        ? members.map(() => 1)
        : members.map((m) => m.equityPercent ?? 0);
    const cents = computeSplit(input.amountCents, weights);
    const rule = responsibilityRuleOf(input.splitMode);
    return members.map((m, i) => ({
      memberId: m.id,
      shareCents: cents[i]!,
      participates: true,
      rule,
    }));
  }
}
