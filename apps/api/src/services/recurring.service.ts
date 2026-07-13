import type {
  CreateRecurringCostInput,
  RecurringCost as RecurringCostDto,
  RecurringCostList,
  RecurringFrequency,
  UpdateRecurringCostInput,
} from '@plim/shared';
import type { RecurringCost } from '../domain/recurring';
import type { RecurringRepository } from '../repositories/recurring.repository';
import type { CompanyService } from './company.service';
import { NotFoundError } from '../lib/errors';

/**
 * Custos recorrentes: quanto custa MANTER a empresa por mês.
 * O equivalente mensal é calculado AQUI (regra no backend, front só apresenta):
 * mensal = valor · anual = valor/12 · semanal = valor×52/12 · trimestral = valor/3
 * · outro = valor (tratado como mensal, é uma estimativa) · única vez = 0
 * (pagamento único não se repete, então não entra no custo mensal).
 * Só custos ATIVOS entram no total. Não gera acerto entre sócios.
 */
export function monthlyEquivalentCents(amountCents: number, frequency: RecurringFrequency): number {
  switch (frequency) {
    case 'annual':
      return Math.round(amountCents / 12);
    case 'weekly':
      return Math.round((amountCents * 52) / 12);
    case 'quarterly':
      return Math.round(amountCents / 3);
    case 'once':
      return 0;
    case 'monthly':
    case 'other':
      return amountCents;
  }
}

function toDto(cost: RecurringCost): RecurringCostDto {
  return {
    id: cost.id,
    companyId: cost.companyId,
    name: cost.name,
    category: cost.category,
    amountCents: cost.amountCents,
    currencyCode: cost.currencyCode,
    frequency: cost.frequency,
    paidByMemberId: cost.paidByMemberId,
    splitMode: cost.splitMode,
    nextChargeOn: cost.nextChargeOn,
    note: cost.note,
    active: cost.active,
    monthlyEquivalentCents: monthlyEquivalentCents(cost.amountCents, cost.frequency),
    createdAt: cost.createdAt.toISOString(),
  };
}

export class RecurringService {
  constructor(
    private readonly companyService: CompanyService,
    private readonly repo: RecurringRepository,
  ) {}

  async create(
    companyId: string,
    input: CreateRecurringCostInput,
    actingUserId?: string | null,
  ): Promise<RecurringCostDto> {
    const { company, members } = await this.companyService.getOverview(companyId, actingUserId);
    if (!members.some((m) => m.id === input.paidByMemberId)) {
      throw new NotFoundError('MEMBER_NOT_FOUND', 'Sócio pagador não encontrado.');
    }
    const cost = await this.repo.create({
      companyId,
      name: input.name,
      category: input.category,
      amountCents: input.amountCents,
      currencyCode: company.currencyCode,
      frequency: input.frequency,
      paidByMemberId: input.paidByMemberId,
      splitMode: input.splitMode ?? 'equity',
      nextChargeOn: input.nextChargeOn ?? null,
      note: input.note ?? null,
      active: true,
    });
    return toDto(cost);
  }

  /** Lista + total mensal dos ATIVOS (inativos aparecem, mas não somam). */
  async list(companyId: string, actingUserId?: string | null): Promise<RecurringCostList> {
    await this.companyService.getOverview(companyId, actingUserId);
    const costs = (await this.repo.list(companyId)).map(toDto);
    const monthlyTotalCents = costs
      .filter((c) => c.active)
      .reduce((sum, c) => sum + c.monthlyEquivalentCents, 0);
    return { costs, monthlyTotalCents };
  }

  async update(
    companyId: string,
    costId: string,
    input: UpdateRecurringCostInput,
    actingUserId?: string | null,
  ): Promise<RecurringCostDto> {
    const { members } = await this.companyService.getOverview(companyId, actingUserId);
    const existing = await this.repo.findById(companyId, costId);
    if (!existing) {
      throw new NotFoundError('RECURRING_COST_NOT_FOUND', 'Custo recorrente não encontrado.');
    }
    if (input.paidByMemberId && !members.some((m) => m.id === input.paidByMemberId)) {
      throw new NotFoundError('MEMBER_NOT_FOUND', 'Sócio pagador não encontrado.');
    }
    const updated = await this.repo.update(costId, input);
    return toDto(updated);
  }
}
