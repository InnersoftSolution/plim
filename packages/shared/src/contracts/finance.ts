import { z } from 'zod';

/**
 * Como uma despesa é dividida entre os sócios.
 * - equity: proporcional à participação de cada um (padrão).
 * - equal: dividido igualmente.
 * - custom: partes explícitas (informadas), que devem somar o total.
 */
export const expenseSplitModeSchema = z.enum(['equity', 'equal', 'custom']);
export type ExpenseSplitMode = z.infer<typeof expenseSplitModeSchema>;

/** Parte de um sócio numa despesa (em centavos inteiros). */
export const expenseShareSchema = z.object({
  memberId: z.string().uuid(),
  shareCents: z.number().int().nonnegative(),
});
export type ExpenseShare = z.infer<typeof expenseShareSchema>;

/**
 * Acerto líquido entre dois sócios: quem paga → quem recebe (RB006).
 * Já vem simplificado (sem dívidas cruzadas duplicadas) e JÁ DESCONTA os
 * pagamentos registrados. `alreadyPaidCents` é o que esse par já acertou.
 */
export const settlementSchema = z.object({
  fromMemberId: z.string().uuid(),
  fromName: z.string(),
  toMemberId: z.string().uuid(),
  toName: z.string(),
  /** Saldo PENDENTE (centavos), já descontando pagamentos. */
  amountCents: z.number().int().positive(),
  /** Quanto esse par já pagou/registrou entre si (from → to). */
  alreadyPaidCents: z.number().int(),
});
export type Settlement = z.infer<typeof settlementSchema>;

/* ── pagamento de acerto (quitar total ou parcial) ── */
export const paymentMethodSchema = z.enum(['pix', 'transfer', 'cash', 'other']);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const paymentMethodCatalog = [
  { id: 'pix', label: 'Pix' },
  { id: 'transfer', label: 'Transferência' },
  { id: 'cash', label: 'Dinheiro' },
  { id: 'other', label: 'Outro' },
] as const;

export const createSettlementPaymentSchema = z.object({
  fromMemberId: z.string().uuid(),
  toMemberId: z.string().uuid(),
  amountCents: z.number().int().positive('Valor deve ser maior que zero'),
  paidOn: z.string().date().optional(),
  method: paymentMethodSchema.nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
});
export type CreateSettlementPaymentInput = z.infer<typeof createSettlementPaymentSchema>;

export const settlementPaymentSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  fromMemberId: z.string().uuid(),
  toMemberId: z.string().uuid(),
  amountCents: z.number().int(),
  paidOn: z.string(),
  method: paymentMethodSchema.nullable(),
  note: z.string().nullable(),
  status: z.enum(['confirmed', 'cancelled']),
  createdAt: z.string().datetime(),
});
export type SettlementPayment = z.infer<typeof settlementPaymentSchema>;

/**
 * Tipo de movimentação (jornada "Adicionar movimentação").
 * - expense: gasto da empresa — divide entre sócios e entra no total gasto.
 * - contribution: APORTE — dinheiro que um sócio coloca no negócio. NÃO divide
 *   entre sócios e NÃO soma como gasto (RB002).
 * (recurring/loan/reimbursement chegam nas próximas jornadas.)
 */
export const movementKindSchema = z.enum(['expense', 'contribution']);
export type MovementKind = z.infer<typeof movementKindSchema>;

/**
 * Status de confirmação da movimentação.
 * - confirmed: cadastrada pelo próprio pagador (ou já confirmada) → entra nos cálculos.
 * - pending: cadastrada em nome de OUTRO sócio → aguarda o pagador confirmar; NÃO entra.
 * - refused: o pagador recusou → não entra; quem cadastrou pode editar/cancelar.
 * - cancelled: reservado para a jornada de cancelamento (não entra).
 */
export const confirmationStatusSchema = z.enum(['confirmed', 'pending', 'refused', 'cancelled']);
export type ConfirmationStatus = z.infer<typeof confirmationStatusSchema>;

/**
 * Situação de pagamento da despesa (jornada "contas a pagar").
 * - paid: já foi paga (como sempre foi) → entra nos cálculos.
 * - unpaid: conta a pagar, com data de vencimento → só lembrete, NÃO entra
 *   no total gasto/acertos até ser marcada como paga.
 * Aportes são sempre 'paid' (não têm vencimento).
 */
export const paymentStatusSchema = z.enum(['paid', 'unpaid']);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

/**
 * Criação de despesa. Valor SEMPRE em centavos inteiros (nunca float).
 * `customShares` só é usado quando splitMode = 'custom'.
 */
export const createExpenseSchema = z.object({
  description: z.string().trim().min(1, 'Descreva a despesa').max(120),
  amountCents: z.number().int().positive('Valor deve ser maior que zero'),
  paidByMemberId: z.string().uuid(),
  spentOn: z.string().date().optional(), // YYYY-MM-DD; back usa hoje se ausente
  splitMode: expenseSplitModeSchema.default('equity'),
  customShares: z.array(expenseShareSchema).optional(),
  note: z.string().trim().max(300).nullable().optional(),
  /** 'paid' (padrão) = já paga; 'unpaid' = conta a pagar (exige dueDate). */
  paymentStatus: paymentStatusSchema.optional(),
  /** Vencimento (YYYY-MM-DD) — obrigatório quando paymentStatus = 'unpaid'. */
  dueDate: z.string().date().nullable().optional(),
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

/** Marcar uma conta a pagar como paga (jornada "contas a pagar"). */
export const payExpenseSchema = z.object({
  paidOn: z.string().date().optional(), // data do pagamento; back usa hoje se ausente
});
export type PayExpenseInput = z.infer<typeof payExpenseSchema>;

/** Criação de aporte: sócio coloca dinheiro no negócio. Sem rateio. */
export const createContributionSchema = z.object({
  description: z.string().trim().min(1, 'Descreva o aporte').max(120),
  amountCents: z.number().int().positive('Valor deve ser maior que zero'),
  /** Sócio que fez o aporte. */
  memberId: z.string().uuid(),
  contributedOn: z.string().date().optional(), // YYYY-MM-DD; back usa hoje se ausente
  note: z.string().trim().max(300).nullable().optional(),
});
export type CreateContributionInput = z.infer<typeof createContributionSchema>;

export const expenseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  /** expense = gasto (divide); contribution = aporte (não divide, não é gasto). */
  kind: movementKindSchema,
  description: z.string(),
  amountCents: z.number().int(),
  currencyCode: z.string().nullable(),
  paidByMemberId: z.string().uuid(),
  spentOn: z.string(),
  splitMode: expenseSplitModeSchema,
  shares: z.array(expenseShareSchema),
  note: z.string().nullable(),
  /** Pagamento: só 'paid' entra nos cálculos. 'unpaid' = conta a pagar. */
  paymentStatus: paymentStatusSchema.default('paid'),
  /** Vencimento da conta a pagar (YYYY-MM-DD). Nulo quando já paga. */
  dueDate: z.string().nullable().default(null),
  /** Confirmação: só 'confirmed' entra nos cálculos. */
  confirmationStatus: confirmationStatusSchema,
  /** Sócio que CADASTROU (pode ser diferente do pagador). Nulo em dados antigos. */
  createdByMemberId: z.string().uuid().nullable(),
  /** True quando o usuário logado é o pagador e a movimentação está pendente. */
  canConfirm: z.boolean().default(false),
  createdAt: z.string().datetime(),
});
export type Expense = z.infer<typeof expenseSchema>;

/** Saldo de um sócio: o que pagou × a parte que lhe cabe. */
export const memberBalanceSchema = z.object({
  memberId: z.string().uuid(),
  fullName: z.string(),
  /** Total que o sócio pagou de despesas (centavos). */
  paidCents: z.number().int(),
  /** Total das partes que cabem ao sócio nas despesas (centavos). */
  owedCents: z.number().int(),
  /** paidCents − owedCents. Positivo = tem a receber; negativo = deve. */
  netCents: z.number().int(),
});
export type MemberBalance = z.infer<typeof memberBalanceSchema>;
