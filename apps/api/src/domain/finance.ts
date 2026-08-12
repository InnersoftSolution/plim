import type {
  ConfirmationStatus,
  ExpenseSplitMode,
  MovementKind,
  PaymentMethod,
  PaymentStatus,
  ResponsibilityRule,
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
  /**
   * Nasceu junto com a movimentação (o "já me pagou" do registro). É uma
   * afirmação de que a pessoa quitou A PARTE dela, então acompanha o valor da
   * movimentação quando ele muda. Manual (false) é dinheiro que mudou de mão
   * num valor próprio: nunca é reescrito.
   */
  isAuto: boolean;
  createdAt: Date;
}

/**
 * RESPONSABILIDADE de um sócio pelo custo, que não é a mesma coisa que
 * pagamento: quem pagou vive em ExpensePayment e nunca muda, enquanto isto é
 * decisão da sociedade e pode ser revista quando entra ou sai gente.
 * Ver docs/PAGAMENTO-E-RESPONSABILIDADE.md.
 */
export interface ExpenseShare {
  memberId: string;
  shareCents: number;
  /** false = este sócio ficou de fora desta despesa (decisão, com parte zero). */
  participates: boolean;
  /** De onde veio o número. Nulo em linha gravada antes da 0033. */
  rule: ResponsibilityRule | null;
}

/**
 * PAGAMENTO da movimentação: quem tirou dinheiro do bolso e quanto.
 *
 * Uma movimentação pode ter vários. Se cada sócia pagou a parte dela direto ao
 * fornecedor, a despesa está quitada e não existe acerto nenhum; se uma pagou
 * tudo, a diferença vira dívida das outras com ela.
 *
 * Isto é histórico e não se reescreve quando a sociedade muda (RN1). Quem muda
 * é a responsabilidade (ExpenseShare).
 */
export interface ExpensePayment {
  id: string;
  memberId: string;
  amountCents: number;
  /** Data em que o dinheiro saiu (YYYY-MM-DD). */
  paidOn: string;
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
  /** Responsabilidade: parte de cada sócio (soma = amountCents). */
  shares: ExpenseShare[];
  /**
   * Quem pagou e quanto. Vazio = nada saiu ainda (conta a pagar).
   * A soma pode ser menor que amountCents: despesa paga pela metade é estado
   * válido, e o que falta é conta com o fornecedor, não dívida entre sócios.
   */
  payments: ExpensePayment[];
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
  /** Contato: pago para quem (despesa) / recebido de quem (entrada). */
  contactId: string | null;
  createdAt: Date;
}
