import { z } from 'zod';

/** Em que tipo de movimentação a categoria aparece. */
export const categoryTypeSchema = z.enum(['despesa', 'receita', 'ambos']);
export type CategoryType = z.infer<typeof categoryTypeSchema>;

/** Categoria de gasto/receita, escopada por empresa. */
export const categorySchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  name: z.string(),
  /** Cor de exibição (hex ou token). Nulo = cor padrão. */
  color: z.string().nullable(),
  /** Ícone/emoji opcional. */
  icon: z.string().nullable(),
  type: categoryTypeSchema,
  /** Arquivada: some do select de novas movimentações, fica nos relatórios. */
  archived: z.boolean(),
});
export type Category = z.infer<typeof categorySchema>;

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Dê um nome à categoria').max(60),
  color: z.string().trim().max(30).nullable().optional(),
  icon: z.string().trim().max(20).nullable().optional(),
  type: categoryTypeSchema.optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    color: z.string().trim().max(30).nullable().optional(),
    icon: z.string().trim().max(20).nullable().optional(),
    type: categoryTypeSchema.optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada para atualizar.' });
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

/** Categorias comuns criadas para toda empresa nova (seed inicial). */
export const defaultCategorySeed: { name: string; color: string }[] = [
  { name: 'Tecnologia', color: '#5b6cff' },
  { name: 'Assinaturas/SaaS', color: '#7c5cff' },
  { name: 'Servidor/Infra', color: '#0ea5e9' },
  { name: 'Marketing', color: '#f43f5e' },
  { name: 'Contabilidade', color: '#10b981' },
  { name: 'Impostos', color: '#f59e0b' },
  { name: 'Serviços terceirizados', color: '#8b5cf6' },
  { name: 'Outros', color: '#64748b' },
];
