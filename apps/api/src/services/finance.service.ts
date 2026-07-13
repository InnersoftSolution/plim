import type {
  CreateContributionInput,
  CreateExpenseInput,
  CreateSettlementPaymentInput,
  ExpenseShare,
  MemberBalance,
  Settlement,
  SettlementPayment as SettlementPaymentDto,
} from '@plim/shared';
import type { CompanyMember } from '../domain/company';
import type { Expense, SettlementPayment } from '../domain/finance';
import type { FinanceRepository } from '../repositories/finance.repository';
import type { CompanyService } from './company.service';
import { computeSplit } from './rateio';
import { computeSettlements } from './settlements';
import { DomainError, NotFoundError } from '../lib/errors';

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
  ) {}

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

    return this.repo.createExpense({
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
      paymentStatus: isUnpaid ? 'unpaid' : 'paid',
      dueDate: isUnpaid ? input.dueDate ?? null : null,
      confirmationStatus: conf.status,
      createdByMemberId: conf.createdByMemberId,
    });
  }

  /**
   * Aporte: sócio coloca dinheiro no negócio. NÃO divide entre sócios e NÃO
   * entra no total gasto nem nos acertos (RB002) — é registro de capital.
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
    return this.repo.createExpense({
      companyId,
      kind: 'contribution',
      description: input.description,
      amountCents: input.amountCents,
      currencyCode: company.currencyCode,
      paidByMemberId: input.memberId,
      spentOn: input.contributedOn ?? new Date().toISOString().slice(0, 10),
      splitMode: 'custom',
      shares: [],
      note: input.note ?? null,
      paymentStatus: 'paid', // aporte não tem vencimento
      dueDate: null,
      confirmationStatus: conf.status,
      createdByMemberId: conf.createdByMemberId,
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
    // Só entram nos cálculos despesas CONFIRMADAS e JÁ PAGAS.
    // (pending/refused/cancelled e contas a pagar ficam fora).
    const expenses = (await this.repo.listExpenses(companyId)).filter(
      (e) => e.kind === 'expense' && e.confirmationStatus === 'confirmed' && e.paymentStatus === 'paid',
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
   * Registra pagamento de acerto (total ou parcial). Guarda-chuva: não deixa
   * pagar mais do que está pendente entre o par — evita acerto "negativo".
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
    const payment = await this.repo.createPayment({
      companyId,
      fromMemberId: input.fromMemberId,
      toMemberId: input.toMemberId,
      amountCents: input.amountCents,
      paidOn: input.paidOn ?? new Date().toISOString().slice(0, 10),
      method: input.method ?? null,
      note: input.note ?? null,
      status: 'confirmed',
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
