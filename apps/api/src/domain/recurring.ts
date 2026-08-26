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
  /**
   * true = a cobrança sai do caixa da empresa. O paidByMemberId vira só um
   * registro histórico: as telas mostram "caixa da empresa" e o pagamento da
   * cobrança gerada não cria acerto entre sócios.
   */
  paidByCompany: boolean;
  /** Como a cobrança gerada se divide entre os sócios. */
  splitMode: RecurringSplitMode;
  /** Próxima cobrança (YYYY-MM-DD). Opcional, mas recomendada. */
  nextChargeOn: string | null;
  /** Ate quando cobrar (YYYY-MM-DD). Nula = sem previsao de fim. */
  endsOn: string | null;
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
    | 'paidByCompany'
    | 'splitMode'
    | 'nextChargeOn'
    | 'endsOn'
    | 'note'
    | 'active'
  >
>;
