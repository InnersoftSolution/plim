import { z } from 'zod';

/**
 * Como uma despesa é dividida entre os sócios.
 * - equity: proporcional à participação de cada um (padrão).
 * - equal: dividido igualmente.
 * - custom: partes explícitas (informadas), que devem somar o total.
 */
export const expenseSplitModeSchema = z.enum(['equity', 'equal', 'custom']);
export type ExpenseSplitMode = z.infer<typeof expenseSplitModeSchema>;

/**
 * De onde veio a parte de um sócio, para a tela conseguir explicar o número.
 * - equity: proporcional à participação societária.
 * - equal: partes iguais.
 * - manual: valor digitado à mão.
 * - inherited: herdada ao entrar na sociedade (jornada do sócio novo).
 */
export const responsibilityRuleSchema = z.enum(['equity', 'equal', 'manual', 'inherited']);
export type ResponsibilityRule = z.infer<typeof responsibilityRuleSchema>;

/**
 * Parte de um sócio numa despesa (em centavos inteiros): a RESPONSABILIDADE
 * pelo custo, que é decisão da sociedade e pode ser revista.
 *
 * Não confundir com pagamento (ExpensePayment), que é quem tirou dinheiro do
 * bolso e nunca muda. A diferença entre os dois é o que gera acerto entre
 * sócios. Ver docs/PAGAMENTO-E-RESPONSABILIDADE.md.
 *
 * `participates: false` guarda a decisão de que o sócio ficou de fora desta
 * despesa, com parte zero. É diferente de não existir linha nenhuma: o
 * primeiro é escolha registrada, o segundo é ausência de informação.
 */
export const expenseShareSchema = z.object({
  memberId: z.string().uuid(),
  shareCents: z.number().int().nonnegative(),
  participates: z.boolean().default(true),
  rule: responsibilityRuleSchema.nullable().default(null),
});
export type ExpenseShare = z.infer<typeof expenseShareSchema>;

/**
 * Parte informada pela tela quando a divisão é manual. Só o par sócio/valor:
 * `participates` e `rule` são conclusão do backend (quem digitou um valor está
 * participando, e a regra é 'manual' por definição), não coisa que o front
 * decide.
 */
export const expenseShareInputSchema = z.object({
  memberId: z.string().uuid(),
  shareCents: z.number().int().nonnegative(),
});
export type ExpenseShareInput = z.infer<typeof expenseShareInputSchema>;

/**
 * Pagamento de uma movimentação: quem colocou dinheiro e quanto.
 *
 * Uma movimentação pode ter VÁRIOS pagamentos. Se cada sócia pagou a parte
 * dela direto ao fornecedor, a despesa está quitada e não existe acerto
 * nenhum. Se uma pagou tudo, a diferença vira dívida das outras com ela.
 *
 * Isto é histórico: entrada ou saída de sócio nunca reescreve estas linhas
 * (RN1). Quem muda com a sociedade é a responsabilidade, não o pagamento.
 */
export const expensePaymentSchema = z.object({
  id: z.string().uuid(),
  expenseId: z.string().uuid(),
  memberId: z.string().uuid(),
  amountCents: z.number().int().positive(),
  /** Data em que o dinheiro saiu (YYYY-MM-DD). */
  paidOn: z.string(),
  createdAt: z.string().datetime(),
});
export type ExpensePayment = z.infer<typeof expensePaymentSchema>;

/**
 * Um pagador informado na tela ("a Gabrielli pagou R$ 1.000 direto à empresa").
 * A soma dos pagamentos não precisa fechar com o valor total: despesa paga
 * pela metade é estado válido, e o que falta aparece como conta em aberto com
 * o fornecedor, nunca como dívida entre sócios.
 */
export const expensePaymentInputSchema = z.object({
  memberId: z.string().uuid(),
  amountCents: z.number().int().positive('Valor deve ser maior que zero'),
  /** Data do pagamento (YYYY-MM-DD). Ausente = data da movimentação. */
  paidOn: z.string().date().optional(),
});
export type ExpensePaymentInput = z.infer<typeof expensePaymentInputSchema>;

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
  /** Movimentação de origem: quita a parte daquela despesa/aporte específico. */
  expenseId: z.string().uuid().nullable().optional(),
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
  /** Movimentação que gerou a dívida (nulo em pagamentos antigos). */
  expenseId: z.string().uuid().nullable().default(null),
  /**
   * Nasceu junto com a movimentação (marcado como "já acertou"), em oposição a
   * um pagamento lançado à parte em Acertos. A tela usa isso para saber o que
   * pode desfazer com um toque: desmarcar um acerto automático é corrigir uma
   * marcação; apagar um pagamento manual é apagar dinheiro que mudou de mão.
   */
  isAuto: z.boolean().default(false),
  createdAt: z.string().datetime(),
});
export type SettlementPayment = z.infer<typeof settlementPaymentSchema>;

/**
 * Tipo de movimentação (jornada "Adicionar movimentação").
 * - expense: gasto da empresa — divide entre sócios e entra no total gasto.
 * - contribution: APORTE — dinheiro que um sócio coloca no negócio. NÃO divide
 *   entre sócios e NÃO soma como gasto (RB002).
 * - revenue: RECEITA — dinheiro que a empresa ganhou (clientes, vendas). É da
 *   empresa (não divide entre sócios), não é gasto. Entra no resultado
 *   (recebido − gasto = saúde do negócio).
 */
export const movementKindSchema = z.enum(['expense', 'contribution', 'revenue']);
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
 * Situação de pagamento da despesa PERANTE O FORNECEDOR. Nada a ver com acerto
 * entre sócios: uma despesa pode estar 100% paga e ainda haver valor a
 * regularizar entre as pessoas.
 * - paid: o valor cheio já saiu → entra nos cálculos.
 * - partial: saiu parte do valor. O que falta é conta em aberto com o
 *   fornecedor, nunca dívida entre sócios.
 * - unpaid: conta a pagar, com data de vencimento → só lembrete, NÃO entra
 *   no total gasto/acertos até ser marcada como paga.
 * Aportes são sempre 'paid' (não têm vencimento).
 *
 * A partir da 0033 isto é DERIVADO da soma dos pagamentos, e não um campo
 * digitado. 'partial' ainda não é produzido por nenhum código: o tratamento
 * chega na fatia B (ver docs/PAGAMENTO-E-RESPONSABILIDADE.md).
 */
export const paymentStatusSchema = z.enum(['paid', 'partial', 'unpaid']);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

/**
 * Criação de despesa. Valor SEMPRE em centavos inteiros (nunca float).
 * `customShares` só é usado quando splitMode = 'custom'.
 */
export const createExpenseSchema = z.object({
  description: z.string().trim().min(1, 'Descreva a despesa').max(120),
  amountCents: z.number().int().positive('Valor deve ser maior que zero'),
  paidByMemberId: z.string().uuid(),
  /**
   * Quem colocou dinheiro, quando mais de uma pessoa pagou a mesma conta
   * (ex.: cada sócia transferiu a parte dela direto ao fornecedor).
   *
   * Ausente ou vazio = pagamento único do `paidByMemberId`, que é o caso
   * comum. A soma pode ser menor que o valor: despesa paga pela metade é
   * estado válido, e o que falta é conta com o fornecedor.
   */
  payments: z.array(expensePaymentInputSchema).max(20).optional(),
  spentOn: z.string().date().optional(), // YYYY-MM-DD; back usa hoje se ausente
  splitMode: expenseSplitModeSchema.default('equity'),
  customShares: z.array(expenseShareInputSchema).optional(),
  note: z.string().trim().max(300).nullable().optional(),
  /** 'paid' (padrão) = já paga; 'unpaid' = conta a pagar (exige dueDate). */
  paymentStatus: paymentStatusSchema.optional(),
  /** Vencimento (YYYY-MM-DD) — obrigatório quando paymentStatus = 'unpaid'. */
  dueDate: z.string().date().nullable().optional(),
  /**
   * Sócios que JÁ acertaram a parte deles com o pagador no momento do
   * registro (só vale para despesa já paga). O Plim registra o pagamento
   * de acerto de cada um automaticamente.
   */
  settledMemberIds: z.array(z.string().uuid()).optional(),
  /** Categoria principal (nulo/ausente = "Sem categoria"). */
  categoryId: z.string().uuid().nullable().optional(),
  /** Tags livres opcionais. */
  tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  /** Contato: pago para quem (fornecedor/prestador). Opcional. */
  contactId: z.string().uuid().nullable().optional(),
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

/**
 * Despesa que se REPETIU num período já encerrado (lançamento retroativo).
 *
 * Não vira custo recorrente: custo recorrente é promessa de cobrança futura, e
 * aqui não há futuro nenhum, o período acabou. Vira uma movimentação por
 * competência, exatamente como aconteceu na vida real, cada uma com o seu
 * pagador. Assim os seis meses entram no total do ano, aparecem no gráfico mês
 * a mês e contam nos acertos entre os sócios, sem sujar a estimativa de custo
 * mensal de hoje.
 *
 * Descrição, valor, divisão e categoria são iguais em todas; o que muda de uma
 * para outra é a data e quem pagou.
 */
export const repeatedOccurrenceSchema = z.object({
  /** Data da despesa daquela competência (YYYY-MM-DD). */
  spentOn: z.string().date(),
  paidByMemberId: z.string().uuid(),
  /**
   * Sócios que já acertaram a parte deles NESTE mês. Vive na ocorrência, e não
   * no pedido inteiro, porque quem deve a quem muda junto com o pagador: se em
   * julho quem pagou foi a Gabrielli e em agosto a Rafaelle, a lista de
   * devedores é diferente nos dois meses.
   */
  settledMemberIds: z.array(z.string().uuid()).optional(),
});
export type RepeatedOccurrence = z.infer<typeof repeatedOccurrenceSchema>;

export const createRepeatedExpenseSchema = z.object({
  description: z.string().trim().min(1, 'Descreva a despesa').max(120),
  /** Valor de CADA ocorrência, não do período inteiro. */
  amountCents: z.number().int().positive('Valor deve ser maior que zero'),
  splitMode: expenseSplitModeSchema.default('equity'),
  note: z.string().trim().max(300).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  contactId: z.string().uuid().nullable().optional(),
  /**
   * Uma entrada por competência. Teto de 60 para conter engano de digitação
   * (5 anos de mensalidade); acima disso é erro, não uso legítimo.
   */
  occurrences: z.array(repeatedOccurrenceSchema).min(1, 'Informe ao menos um mês').max(60),
});
export type CreateRepeatedExpenseInput = z.infer<typeof createRepeatedExpenseSchema>;

/** Marcar uma conta a pagar como paga (jornada "contas a pagar"). */
export const payExpenseSchema = z.object({
  paidOn: z.string().date().optional(), // data do pagamento; back usa hoje se ausente
});
export type PayExpenseInput = z.infer<typeof payExpenseSchema>;

/**
 * Edição de uma movimentação já registrada (despesa, aporte ou entrada).
 * Todos os campos são opcionais: manda só o que mudou. Campos por tipo:
 * - despesa/aporte: description, amountCents, spentOn, note, paidByMemberId, splitMode.
 * - entrada (revenue): description, amountCents, spentOn, note, source, account.
 * O back recalcula o rateio quando valor/divisão/pagador mudam. Se a
 * movimentação já tiver acertos registrados, mudanças estruturais são barradas.
 */
export const updateMovementSchema = z
  .object({
    description: z.string().trim().min(1, 'Descreva a movimentação').max(120).optional(),
    amountCents: z.number().int().positive('Valor deve ser maior que zero').optional(),
    spentOn: z.string().date().optional(),
    note: z.string().trim().max(300).nullable().optional(),
    paidByMemberId: z.string().uuid().optional(),
    /** Substitui quem pagou e quanto. Ver createExpenseSchema.payments. */
    payments: z.array(expensePaymentInputSchema).max(20).optional(),
    splitMode: expenseSplitModeSchema.optional(),
    customShares: z.array(expenseShareInputSchema).optional(),
    source: z.string().trim().max(60).nullable().optional(),
    account: z.string().trim().max(60).nullable().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
    contactId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada para atualizar.' });
export type UpdateMovementInput = z.infer<typeof updateMovementSchema>;

/**
 * Criação de receita: dinheiro que ENTROU na empresa (venda, cliente, SaaS...).
 * É da empresa: não divide entre sócios, não é gasto. Entra no resultado.
 */
export const createRevenueSchema = z.object({
  description: z.string().trim().min(1, 'Descreva a entrada').max(120),
  amountCents: z.number().int().positive('Valor deve ser maior que zero'),
  /** Sócio que recebeu (quando a conta é de um sócio). Opcional. */
  receivedByMemberId: z.string().uuid().nullable().optional(),
  /** Conta que recebeu: sócio, "Conta da empresa" ou uma conta própria. */
  account: z.string().trim().max(60).nullable().optional(),
  /** Origem: de onde o dinheiro veio (Asaas, Mercado Livre, Pix, cliente...). */
  source: z.string().trim().max(60).nullable().optional(),
  receivedOn: z.string().date().optional(), // YYYY-MM-DD; back usa hoje se ausente
  note: z.string().trim().max(300).nullable().optional(),
  /** Categoria principal (nulo/ausente = "Sem categoria"). */
  categoryId: z.string().uuid().nullable().optional(),
  /** Tags livres opcionais. */
  tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  /** Contato: recebido de quem (cliente). Opcional. */
  contactId: z.string().uuid().nullable().optional(),
});
export type CreateRevenueInput = z.infer<typeof createRevenueSchema>;

/** Como um aporte reembolsável é dividido entre os sócios (nunca 'custom'). */
export const contributionSplitModeSchema = z.enum(['equity', 'equal']);
export type ContributionSplitMode = z.infer<typeof contributionSplitModeSchema>;

/**
 * Criação de aporte: sócio coloca dinheiro no negócio.
 * - Padrão (reimbursable = false): capital do sócio, NÃO divide, NÃO vira dívida.
 * - Reembolsável (reimbursable = true): o sócio adiantou por todos; cada sócio
 *   passa a dever a parte proporcional a ele. Continua sendo capital (não entra
 *   no total gasto), mas gera acerto entre os sócios.
 */
export const createContributionSchema = z.object({
  description: z.string().trim().min(1, 'Descreva o aporte').max(120),
  amountCents: z.number().int().positive('Valor deve ser maior que zero'),
  /** Sócio que fez o aporte. */
  memberId: z.string().uuid(),
  contributedOn: z.string().date().optional(), // YYYY-MM-DD; back usa hoje se ausente
  note: z.string().trim().max(300).nullable().optional(),
  /** true = os sócios reembolsam a parte deles ao autor do aporte. */
  reimbursable: z.boolean().optional(),
  /** Como dividir o reembolso (só usado quando reimbursable). Padrão: equity. */
  splitMode: contributionSplitModeSchema.optional(),
  /**
   * Sócios que JÁ acertaram a parte deles com o autor no momento do registro
   * (só vale para aporte reembolsável). O Plim registra o acerto na hora.
   */
  settledMemberIds: z.array(z.string().uuid()).optional(),
  /** Categoria principal (nulo/ausente = "Sem categoria"). */
  categoryId: z.string().uuid().nullable().optional(),
  /** Tags livres opcionais. */
  tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
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
  /**
   * DEPRECADO desde a 0033: use `payments`. Continua preenchido com o maior
   * pagador, para não quebrar o que já lê este campo. Sai na fatia G.
   */
  paidByMemberId: z.string().uuid(),
  /**
   * Quem colocou dinheiro nesta movimentação, e quanto cada um colocou.
   * Vazio = ainda não saiu dinheiro (conta a pagar).
   * Preenchido pela API a partir da fatia C; até lá chega vazio.
   */
  payments: z.array(expensePaymentSchema).default([]),
  spentOn: z.string(),
  splitMode: expenseSplitModeSchema,
  /** Responsabilidade: de quem é o custo. Não é quem pagou. */
  shares: z.array(expenseShareSchema),
  note: z.string().nullable(),
  /** Origem da receita (Asaas, Mercado Livre...). Nulo em gasto/aporte. */
  source: z.string().nullable().default(null),
  /** Conta que recebeu a entrada (sócio, empresa, própria). Nulo em gasto/aporte. */
  account: z.string().nullable().default(null),
  /** Pagamento: só 'paid' entra nos cálculos. 'unpaid' = conta a pagar. */
  paymentStatus: paymentStatusSchema.default('paid'),
  /** Vencimento da conta a pagar (YYYY-MM-DD). Nulo quando já paga. */
  dueDate: z.string().nullable().default(null),
  /** Confirmação: só 'confirmed' entra nos cálculos. */
  confirmationStatus: confirmationStatusSchema,
  /** Sócio que CADASTROU (pode ser diferente do pagador). Nulo em dados antigos. */
  createdByMemberId: z.string().uuid().nullable(),
  /** Custo recorrente que gerou esta cobrança (nulo em lançamento manual). */
  recurringCostId: z.string().uuid().nullable().default(null),
  /** Categoria principal da movimentação (nulo = "Sem categoria"). */
  categoryId: z.string().uuid().nullable().default(null),
  /** Tags livres, para granularidade extra (ex.: "Adobe", "AWS"). */
  tags: z.array(z.string()).default([]),
  /** Contato: pago para quem (despesa) / recebido de quem (entrada). */
  contactId: z.string().uuid().nullable().default(null),
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

/**
 * Acerto POR ORIGEM (RB006 refinado): cada movimentação compartilhada gera as
 * dívidas dos sócios ao autor, amarradas àquela movimentação. Nada de juntar
 * origens diferentes num número só — o par pode aparecer em vários blocos.
 */
export const movementDebtSchema = z.object({
  debtorId: z.string().uuid(),
  debtorName: z.string(),
  /** Parte original do devedor nessa movimentação. */
  originalCents: z.number().int().nonnegative(),
  /** Quanto já foi pago dessa parte (acertos ligados a essa movimentação). */
  paidCents: z.number().int().nonnegative(),
  /** originalCents menos paidCents. */
  remainingCents: z.number().int().nonnegative(),
  /** Data do último pagamento amarrado a essa dívida (YYYY-MM-DD). Nulo se nada pago. */
  lastPaidOn: z.string().nullable().default(null),
});
export type MovementDebt = z.infer<typeof movementDebtSchema>;

export const movementSettlementSchema = z.object({
  /** Id da movimentacao (despesa ou aporte reembolsavel). */
  movementId: z.string().uuid(),
  kind: movementKindSchema,
  description: z.string(),
  spentOn: z.string(),
  amountCents: z.number().int(),
  /** Quem adiantou / pagou (recebe os acertos). */
  payerId: z.string().uuid(),
  payerName: z.string(),
  /** True quando a movimentação veio de um custo recorrente. */
  recorrente: z.boolean().default(false),
  /** Total ainda pendente nessa movimentacao (soma dos remaining). */
  remainingCents: z.number().int().nonnegative(),
  debts: z.array(movementDebtSchema),
});
export type MovementSettlement = z.infer<typeof movementSettlementSchema>;

/* ── jornada do sócio novo: herdar (ou não) as despesas anteriores ── */

/**
 * Como a pessoa que acabou de entrar trata as despesas de antes.
 * - none: não participa do passado (padrão seguro).
 * - equity: assume conforme a participação societária dela.
 * - percent: assume um percentual definido à mão.
 *
 * "Revisar despesa por despesa" não é modo: é a pessoa editando cada
 * movimentação pela tela, que já existe.
 */
export const inheritanceModeSchema = z.enum(['none', 'equity', 'percent']);
export type InheritanceMode = z.infer<typeof inheritanceModeSchema>;

export const inheritanceInputSchema = z
  .object({
    memberId: z.string().uuid(),
    /** Despesas ANTERIORES a esta data entram na conta (YYYY-MM-DD). */
    since: z.string().date(),
    mode: inheritanceModeSchema,
    /** 0–100 com 2 casas. Obrigatório quando mode = 'percent'. */
    percent: z.number().min(0).max(100).optional(),
  })
  .refine((v) => v.mode !== 'percent' || v.percent != null, {
    message: 'Informe o percentual que essa pessoa assume.',
    path: ['percent'],
  });
export type InheritanceInput = z.infer<typeof inheritanceInputSchema>;

/** Uma despesa do passado e quanto o sócio novo passa a assumir dela. */
export const inheritanceLineSchema = z.object({
  expenseId: z.string().uuid(),
  description: z.string(),
  spentOn: z.string(),
  amountCents: z.number().int(),
  /** Parte que o sócio novo passa a ter (centavos). */
  shareCents: z.number().int().nonnegative(),
});
export type InheritanceLine = z.infer<typeof inheritanceLineSchema>;

/**
 * Prévia do que vai acontecer, para a pessoa confirmar antes de qualquer
 * escrita. Nenhuma jornada que mexe em dinheiro alheio começa pelo salvar.
 */
export const inheritancePreviewSchema = z.object({
  memberId: z.string().uuid(),
  /** Quantas movimentações entram na conta. */
  expenseCount: z.number().int().nonnegative(),
  /** Soma das despesas do período (centavos). */
  periodTotalCents: z.number().int().nonnegative(),
  /** Quanto o sócio novo passa a assumir no total (centavos). */
  totalCents: z.number().int().nonnegative(),
  /** Para quem ele fica devendo, e quanto de cada. */
  owedTo: z.array(
    z.object({
      memberId: z.string().uuid(),
      fullName: z.string(),
      amountCents: z.number().int().nonnegative(),
    }),
  ),
  lines: z.array(inheritanceLineSchema),
});
export type InheritancePreview = z.infer<typeof inheritancePreviewSchema>;
