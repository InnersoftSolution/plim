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
import type { AuditService } from './audit.service';
import { DomainError, NotFoundError } from '../lib/errors';

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
    endsOn: cost.endsOn,
    note: cost.note,
    active: cost.active,
    monthlyEquivalentCents: monthlyEquivalentCents(cost.amountCents, cost.frequency),
    createdAt: cost.createdAt.toISOString(),
  };
}

/**
 * O fim não pode vir antes do início: um custo que acaba antes de começar nunca
 * geraria cobrança, e a pessoa só descobriria isso semanas depois, ao notar que
 * nada foi cobrado.
 */
function assertEndsAfterStart(nextChargeOn: string | null, endsOn: string | null): void {
  if (!endsOn || !nextChargeOn) return;
  if (endsOn < nextChargeOn) {
    throw new DomainError(
      'ENDS_BEFORE_START',
      'A data final vem antes do início da cobrança. Ajuste o período.',
    );
  }
}

export class RecurringService {
  constructor(
    private readonly companyService: CompanyService,
    private readonly repo: RecurringRepository,
    /** Quando presente, grava a trilha de auditoria. */
    private readonly audit?: AuditService,
  ) {}

  /** Grava o evento sem nunca derrubar a ação principal. */
  private async trilha(
    companyId: string,
    members: { id: string; userId: string | null; fullName: string }[],
    actingUserId: string | null | undefined,
    action: 'created' | 'updated',
    costId: string,
    frase: string,
  ): Promise<void> {
    if (!this.audit) return;
    const actor = actingUserId ? members.find((m) => m.userId === actingUserId) ?? null : null;
    await this.audit.record({
      companyId,
      actorMemberId: actor?.id ?? null,
      actorName: actor?.fullName ?? null,
      action,
      entityType: 'recurring_cost',
      entityId: costId,
      summary: `${actor?.fullName ?? 'Sistema'} ${frase}`,
    });
  }

  async create(
    companyId: string,
    input: CreateRecurringCostInput,
    actingUserId?: string | null,
  ): Promise<RecurringCostDto> {
    const { company, members } = await this.companyService.getOverview(companyId, actingUserId);
    if (!members.some((m) => m.id === input.paidByMemberId)) {
      throw new NotFoundError('MEMBER_NOT_FOUND', 'Sócio pagador não encontrado.');
    }
    const inicio =
      input.nextChargeOn ?? (input.frequency !== 'once' ? new Date().toISOString().slice(0, 10) : null);
    assertEndsAfterStart(inicio, input.endsOn ?? null);
    const cost = await this.repo.create({
      companyId,
      name: input.name,
      category: input.category,
      amountCents: input.amountCents,
      currencyCode: company.currencyCode,
      frequency: input.frequency,
      paidByMemberId: input.paidByMemberId,
      splitMode: input.splitMode ?? 'equity',
      // Recorrente sem data começa a cobrar HOJE (vira conta a pagar dividida na
      // hora). 'once' fica sem data até o usuário informar o pagamento.
      nextChargeOn:
        input.nextChargeOn ?? (input.frequency !== 'once' ? new Date().toISOString().slice(0, 10) : null),
      endsOn: input.endsOn ?? null,
      note: input.note ?? null,
      active: true,
    });
    const valor = (cost.amountCents / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
    await this.trilha(
      companyId,
      members,
      actingUserId,
      'created',
      cost.id,
      `cadastrou o custo recorrente "${cost.name}" de ${valor}`,
    );
    return toDto(cost);
  }

  /**
   * Lista + total mensal do que ainda custa. Fora da soma: os inativos e os que
   * JÁ PASSARAM da data final. Um contrato encerrado continua na lista como
   * histórico, mas somá-lo faria o "custo mensal" cobrar de algo que acabou.
   */
  async list(
    companyId: string,
    actingUserId?: string | null,
    today = new Date().toISOString().slice(0, 10),
  ): Promise<RecurringCostList> {
    await this.companyService.getOverview(companyId, actingUserId);
    const costs = (await this.repo.list(companyId)).map(toDto);
    const monthlyTotalCents = costs
      .filter((c) => c.active && (c.endsOn == null || c.endsOn >= today))
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
    // Compara contra o valor que VAI ficar salvo, não só contra o que veio no
    // corpo: mudar só o fim precisa bater com o início que já estava lá.
    assertEndsAfterStart(
      input.nextChargeOn !== undefined ? input.nextChargeOn : existing.nextChargeOn,
      input.endsOn !== undefined ? input.endsOn : existing.endsOn,
    );
    const updated = await this.repo.update(costId, input);
    await this.trilha(
      companyId,
      members,
      actingUserId,
      'updated',
      costId,
      `editou o custo recorrente "${updated.name}"`,
    );
    return toDto(updated);
  }
}
