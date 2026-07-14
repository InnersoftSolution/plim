import type {
  ConfirmationStatus,
  ExpenseSplitMode,
  MovementKind,
  PaymentMethod,
  PaymentStatus,
} from '@plim/shared';

/** Pagamento de acerto entre sócios (quitação total ou parcial). */
export interface SettlementPayment {
  id: string;
  companyId: string;
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
  /** Data do pagamento (YYYY-MM-DD). */
  paidOn: string;
  method: PaymentMethod | null;
  note: string | null;
  status: 'confirmed' | 'cancelled';
  /** Movimentação (despesa/aporte) que gerou a dívida. Nulo = pagamento antigo. */
  expenseId: string | null;
  createdAt: Date;
}

export interface ExpenseShare {
  memberId: string;
  shareCents: number;
}

export interface Expense {
  id: string;
  companyId: string;
  /** expense = gasto (divide entre sócios); contribution = aporte (não divide). */
  kind: MovementKind;
  description: string;
  /** Valor total em centavos inteiros. */
  amountCents: number;
  currencyCode: string | null;
  /** Sócio que pagou a despesa. */
  paidByMemberId: string;
  /** Data do gasto (YYYY-MM-DD). */
  spentOn: string;
  splitMode: ExpenseSplitMode;
  /** Parte de cada sócio (soma = amountCents). */
  shares: ExpenseShare[];
  note: string | null;
  /** Origem da receita (Asaas, Mercado Livre...). Nulo em gasto/aporte. */
  source: string | null;
  /** Conta que recebeu (sócio, empresa, própria). Nulo em gasto/aporte. */
  account: string | null;
  /** Só 'paid' entra nos cálculos; 'unpaid' = conta a pagar (só lembrete). */
  paymentStatus: PaymentStatus;
  /** Vencimento (YYYY-MM-DD) quando 'unpaid'; nulo quando já paga. */
  dueDate: string | null;
  /** Só 'confirmed' entra nos cálculos (total gasto, acertos, projeção). */
  confirmationStatus: ConfirmationStatus;
  /** Sócio que cadastrou (pode ≠ pagador). Nulo em dados antigos / modo dev. */
  createdByMemberId: string | null;
  /** Custo recorrente que gerou esta cobrança (nulo em lançamento manual). */
  recurringCostId: string | null;
  /** Competência da cobrança gerada (YYYY-MM-DD); par único com o custo. */
  recurringChargeOn: string | null;
  /** Categoria principal (nulo = "Sem categoria"). */
  categoryId: string | null;
  /** Tags livres (ex.: "Adobe", "AWS"). */
  tags: string[];
  createdAt: Date;
}
