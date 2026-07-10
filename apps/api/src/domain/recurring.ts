import type { RecurringCategory, RecurringFrequency } from '@plim/shared';

/** Custo recorrente (assinatura/ferramenta). Valores em centavos inteiros. */
export interface RecurringCost {
  id: string;
  companyId: string;
  name: string;
  category: RecurringCategory;
  amountCents: number;
  currencyCode: string | null;
  frequency: RecurringFrequency;
  paidByMemberId: string;
  /** Próxima cobrança (YYYY-MM-DD). Opcional, mas recomendada. */
  nextChargeOn: string | null;
  note: string | null;
  /** Só custos ATIVOS entram no custo mensal estimado. */
  active: boolean;
  createdAt: Date;
}

export type RecurringCostUpdate = Partial<
  Pick<
    RecurringCost,
    'name' | 'category' | 'amountCents' | 'frequency' | 'paidByMemberId' | 'nextChargeOn' | 'note' | 'active'
  >
>;
