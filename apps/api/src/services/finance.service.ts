import type {
  CreateContributionInput,
  CreateExpenseInput,
  CreateRevenueInput,
  CreateSettlementPaymentInput,
  ExpenseShare,
  MemberBalance,
  MovementDebt,
  MovementSettlement,
  Settlement,
  SettlementPayment as SettlementPaymentDto,
} from '@plim/shared';
import type { CompanyMember } from '../domain/company';
import type { Expense, SettlementPayment } from '../domain/finance';
import type { RecurringCost } from '../domain/recurring';
import type { FinanceRepository } from '../repositories/finance.repository';
import type { RecurringRepository } from '../repositories/recurring.repository';
import type { CompanyService } from './company.service';
import { computeSplit } from './rateio';
import { computeSettlements } from './settlements';
import { DomainError, NotFoundError } from '../lib/errors';

/**
 * Avança a data da cobrança conforme a frequência (YYYY-MM-DD, sem fuso).
 * Mensal/trimestral/anual preservam o dia, ajustando quando o mês é mais
 * curto (31 jan + 1 mês = 28/29 fev). 'other' é tratado como mensal.
 */
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
  ) {}

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
    const costs = await this.recurringRepo.list(companyId);
    for (const cost of costs) {
      if (!cost.active) continue;
      // Recorrente ativo sem data de cobrança começa HOJE (senão nunca viraria
      // conta a pagar). 'once' sem data fica só como registro, não cobra sozinho.
      const start =
        cost.nextChargeOn ?? (cost.frequency !== 'once' ? today : null);
      if (!start || start > today) continue;

      let charge: string | null = start;
      // Trava de segurança: no máximo 24 competências por vez (2 anos mensais).
      for (let guard = 0; charge != null && charge <= today && guard < 24; guard++) {
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
            shares: members.map((m, i) => ({ memberId: m.id, shareCents: split[i]! })),
            note: null,
            source: null,
            paymentStatus: 'unpaid', // nasce como conta a pagar; entra nos números ao pagar
            dueDate: charge,
            confirmationStatus: 'confirmed', // gerada pelo sistema a partir de regra já acordada
            createdByMemberId: null,
            recurringCostId: cost.id,
            recurringChargeOn: charge,
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

    const expense = await this.repo.createExpense({
      companyId,
      kind: 'expense',
      description: input.description,
      amountCents: input.amountCents,
      currencyCode: company.currencyCode,
      paidByMemberId: input.paidByMemberId,
      spentOn: input.spentOn ?? new Date().toISOString().slice(0, 10),
      splitMode: input.splitMode,
      shares,
      note: input.note ?? null,
      source: null,
      paymentStatus: isUnpaid ? 'unpaid' : 'paid',
      dueDate: isUnpaid ? input.dueDate ?? null : null,
      confirmationStatus: conf.status,
      createdByMemberId: conf.createdByMemberId,
      recurringCostId: null,
      recurringChargeOn: null,
    });

    // "Fulano já me pagou a parte dele": registra o acerto na hora, junto
    // com a despesa. Só faz sentido para despesa JÁ PAGA e confirmada.
    if (
      input.settledMemberIds?.length &&
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
        });
      }
    }

    return expense;
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
          return members.map((m, i) => ({ memberId: m.id, shareCents: cents[i]! }));
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
      note: input.note ?? null,
      source: null,
      paymentStatus: 'paid', // aporte não tem vencimento
      dueDate: null,
      confirmationStatus: conf.status,
      createdByMemberId: conf.createdByMemberId,
      recurringCostId: null,
      recurringChargeOn: null,
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
        });
      }
    }

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
    const member = members.find((m) => m.id === input.receivedByMemberId);
    if (!member) {
      throw new NotFoundError('MEMBER_NOT_FOUND', 'Sócio que recebeu não encontrado.');
    }
    const conf = resolveConfirmation(members, member, actingUserId);
    return this.repo.createExpense({
      companyId,
      kind: 'revenue',
      description: input.description,
      amountCents: input.amountCents,
      currencyCode: company.currencyCode,
      paidByMemberId: input.receivedByMemberId, // quem recebeu (informativo)
      spentOn: input.receivedOn ?? new Date().toISOString().slice(0, 10),
      splitMode: 'custom',
      shares: [], // receita não divide entre sócios
      note: input.note ?? null,
      source: input.source ?? null,
      paymentStatus: 'paid',
      dueDate: null,
      confirmationStatus: conf.status,
      createdByMemberId: conf.createdByMemberId,
      recurringCostId: null,
      recurringChargeOn: null,
    });
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
    return this.repo.updateConfirmation(expenseId, decision);
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
  ): Promise<Expense> {
    await this.companyService.getOverview(companyId, actingUserId);
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
    return this.repo.markExpensePaid(expenseId, paidOn ?? new Date().toISOString().slice(0, 10));
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
    await this.companyService.getOverview(companyId, actingUserId);
    const expense = await this.repo.findExpenseById(companyId, expenseId);
    if (!expense) {
      throw new NotFoundError('MOVEMENT_NOT_FOUND', 'Movimentação não encontrada.');
    }
    await this.repo.deleteExpense(expenseId);
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
      canConfirm: e.confirmationStatus === 'pending' && meId != null && e.paidByMemberId === meId,
    }));
  }

  /**
   * Saldo de cada sócio: o que pagou − a parte que lhe cabe (centavos).
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
        e.paymentStatus === 'paid' &&
        (e.kind === 'expense' || (e.kind === 'contribution' && e.shares.length > 0)),
    );
    const payments = (await this.repo.listPayments(companyId)).filter((p) => p.status === 'confirmed');

    return members.map((m) => {
      const paidCents = expenses
        .filter((e) => e.paidByMemberId === m.id)
        .reduce((sum, e) => sum + e.amountCents, 0);
      const owedCents = expenses.reduce(
        (sum, e) => sum + (e.shares.find((s) => s.memberId === m.id)?.shareCents ?? 0),
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
  async getSettlements(companyId: string, actingUserId?: string | null): Promise<Settlement[]> {
    const balances = await this.getBalances(companyId, actingUserId);
    const settlements = computeSettlements(balances);
    if (settlements.length === 0) return settlements;
    const payments = (await this.repo.listPayments(companyId)).filter((p) => p.status === 'confirmed');
    return settlements.map((s) => ({
      ...s,
      alreadyPaidCents: payments
        .filter((p) => p.fromMemberId === s.fromMemberId && p.toMemberId === s.toMemberId)
        .reduce((sum, p) => sum + p.amountCents, 0),
    }));
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
    const { members } = await this.companyService.getOverview(companyId, actingUserId);
    const nameOf = (id: string) => members.find((m) => m.id === id)?.fullName ?? 'Sócio';

    const movements = (await this.repo.listExpenses(companyId))
      .filter(
        (e) =>
          e.confirmationStatus === 'confirmed' &&
          e.paymentStatus === 'paid' &&
          (e.kind === 'expense' || (e.kind === 'contribution' && e.shares.length > 0)),
      )
      // Mais antigas primeiro: o pool de pagamentos antigos quita as dívidas
      // mais velhas antes das recentes.
      .sort((a, b) => a.spentOn.localeCompare(b.spentOn));

    const payments = (await this.repo.listPayments(companyId)).filter((p) => p.status === 'confirmed');

    // Pool de pagamentos SEM origem (antigos), por par devedor→credor.
    const legacyPool = new Map<string, number>();
    for (const p of payments) {
      if (p.expenseId) continue;
      const k = `${p.fromMemberId}->${p.toMemberId}`;
      legacyPool.set(k, (legacyPool.get(k) ?? 0) + p.amountCents);
    }

    const out: MovementSettlement[] = [];
    for (const m of movements) {
      const payerId = m.paidByMemberId;
      const debts: MovementDebt[] = [];
      for (const share of m.shares) {
        if (share.memberId === payerId || share.shareCents <= 0) continue;
        const directlyPaid = payments
          .filter((p) => p.expenseId === m.id && p.fromMemberId === share.memberId && p.toMemberId === payerId)
          .reduce((sum, p) => sum + p.amountCents, 0);
        let remaining = Math.max(0, share.shareCents - directlyPaid);
        if (remaining > 0) {
          const k = `${share.memberId}->${payerId}`;
          const pool = legacyPool.get(k) ?? 0;
          if (pool > 0) {
            const used = Math.min(pool, remaining);
            remaining -= used;
            legacyPool.set(k, pool - used);
          }
        }
        debts.push({
          debtorId: share.memberId,
          debtorName: nameOf(share.memberId),
          originalCents: share.shareCents,
          paidCents: share.shareCents - remaining,
          remainingCents: remaining,
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
        remainingCents: debts.reduce((sum, d) => sum + d.remainingCents, 0),
        debts,
      });
    }
    // Exibição: pendentes primeiro, depois mais recentes.
    return out.sort((a, b) => {
      const ap = a.remainingCents > 0 ? 1 : 0;
      const bp = b.remainingCents > 0 ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return b.spentOn.localeCompare(a.spentOn);
    });
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
      const mov = movements.find((m) => m.movementId === input.expenseId);
      const debt =
        mov && mov.payerId === input.toMemberId
          ? mov.debts.find((d) => d.debtorId === input.fromMemberId)
          : undefined;
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
    });
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
      return shares;
    }

    const weights =
      input.splitMode === 'equal'
        ? members.map(() => 1)
        : members.map((m) => m.equityPercent ?? 0);
    const cents = computeSplit(input.amountCents, weights);
    return members.map((m, i) => ({ memberId: m.id, shareCents: cents[i]! }));
  }
}
