import type { RecurringCategory, RecurringFrequency, RecurringSplitMode } from '@plim/shared';

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
  /** Como a cobrança gerada se divide entre os sócios. */
  splitMode: RecurringSplitMode;
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
    | 'name'
    | 'category'
    | 'amountCents'
    | 'frequency'
    | 'paidByMemberId'
    | 'splitMode'
    | 'nextChargeOn'
    | 'note'
    | 'active'
  >
>;
