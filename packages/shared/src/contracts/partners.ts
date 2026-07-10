import { z } from 'zod';

/**
 * Parceiros indicados (PRD §14/§19). Profissionais que ajudam o fundador em
 * etapas específicas — área SEPARADA de sócios. Nesta fase: categorias + captura
 * de interesse (lead). O marketplace completo vem depois; a estrutura já prevê.
 */
export const partnerCategorySchema = z.enum([
  'accounting',
  'legal',
  'design',
  'development',
  'marketing',
  'product',
  'branding',
]);
export type PartnerCategory = z.infer<typeof partnerCategorySchema>;

export const partnerCategoryCatalog = [
  { id: 'accounting', label: 'Contador' },
  { id: 'legal', label: 'Advogado' },
  { id: 'design', label: 'Designer' },
  { id: 'development', label: 'Desenvolvedor' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'product', label: 'Consultor de produto' },
  { id: 'branding', label: 'Consultor de marca' },
] as const;

/** Pedido de indicação de um profissional (lead). */
export const createPartnerLeadSchema = z.object({
  category: partnerCategorySchema,
  note: z.string().trim().max(300).nullable().optional(),
});
export type CreatePartnerLeadInput = z.infer<typeof createPartnerLeadSchema>;

export const partnerLeadSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  category: partnerCategorySchema,
  note: z.string().nullable(),
  status: z.enum(['open', 'contacted', 'closed']),
  createdAt: z.string().datetime(),
});
export type PartnerLead = z.infer<typeof partnerLeadSchema>;
