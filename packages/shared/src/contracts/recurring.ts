import { z } from 'zod';

/**
 * Custos recorrentes (assinaturas, ferramentas, serviços que se repetem).
 * Mostram quanto custa MANTER a empresa por mês. Valores em centavos inteiros.
 * Na data da cobrança, o backend MATERIALIZA uma conta a pagar rateada entre
 * os sócios (splitMode); a partir daí ela segue o fluxo normal de despesa.
 */

export const recurringCategorySchema = z.enum([
  'tools',
  'infrastructure',
  'accounting',
  'marketing',
  'legal',
  'operations',
  'other',
]);
export type RecurringCategory = z.infer<typeof recurringCategorySchema>;

export const recurringCategoryCatalog = [
  { id: 'tools', label: 'Ferramentas' },
  { id: 'infrastructure', label: 'Infraestrutura' },
  { id: 'accounting', label: 'Contabilidade' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'legal', label: 'Jurídico' },
  { id: 'operations', label: 'Operação' },
  { id: 'other', label: 'Outros' },
] as const;

export const recurringFrequencySchema = z.enum(['monthly', 'annual', 'weekly', 'quarterly', 'once', 'other']);
export type RecurringFrequency = z.infer<typeof recurringFrequencySchema>;

export const recurringFrequencyCatalog = [
  { id: 'monthly', label: 'Mensal' },
  { id: 'once', label: 'Única vez' },
  { id: 'annual', label: 'Anual' },
  { id: 'weekly', label: 'Semanal' },
  { id: 'quarterly', label: 'Trimestral' },
  { id: 'other', label: 'Outro' },
] as const;

/**
 * Divisão da cobrança gerada entre os sócios (sem 'custom' por enquanto:
 * recorrente pede uma regra estável, não valores digitados a cada mês).
 */
export const recurringSplitModeSchema = z.enum(['equity', 'equal']);
export type RecurringSplitMode = z.infer<typeof recurringSplitModeSchema>;

export const createRecurringCostSchema = z.object({
  name: z.string().trim().min(1, 'Dê um nome ao custo').max(80),
  category: recurringCategorySchema,
  amountCents: z.number().int().positive('Valor deve ser maior que zero'),
  frequency: recurringFrequencySchema,
  paidByMemberId: z.string().uuid(),
  /** Como a cobrança gerada se divide entre os sócios. */
  splitMode: recurringSplitModeSchema.default('equity'),
  nextChargeOn: z.string().date().nullable().optional(), // opcional, mas recomendada
  note: z.string().trim().max(300).nullable().optional(),
});
export type CreateRecurringCostInput = z.infer<typeof createRecurringCostSchema>;

/** Edição parcial (inclui ativar/desativar). */
export const updateRecurringCostSchema = createRecurringCostSchema
  .partial()
  .extend({ active: z.boolean().optional() });
export type UpdateRecurringCostInput = z.infer<typeof updateRecurringCostSchema>;

export const recurringCostSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  name: z.string(),
  category: recurringCategorySchema,
  amountCents: z.number().int(),
  currencyCode: z.string().nullable(),
  frequency: recurringFrequencySchema,
  paidByMemberId: z.string().uuid(),
  splitMode: recurringSplitModeSchema.default('equity'),
  nextChargeOn: z.string().nullable(),
  note: z.string().nullable(),
  active: z.boolean(),
  /** Equivalente mensal calculado pelo BACKEND (anual/12, semanal×52/12…). */
  monthlyEquivalentCents: z.number().int(),
  createdAt: z.string().datetime(),
});
export type RecurringCost = z.infer<typeof recurringCostSchema>;

/** Resposta da listagem: itens + total mensal dos ATIVOS (calculado no backend). */
export const recurringCostListSchema = z.object({
  costs: z.array(recurringCostSchema),
  monthlyTotalCents: z.number().int(),
});
export type RecurringCostList = z.infer<typeof recurringCostListSchema>;
