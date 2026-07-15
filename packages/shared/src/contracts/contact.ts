import { z } from 'zod';

/** Tipo do contato: empresa (PJ) ou pessoa física (PF). */
export const contactTypeSchema = z.enum(['empresa', 'pessoa']);
export type ContactType = z.infer<typeof contactTypeSchema>;

export const contactTypeCatalog = [
  { id: 'empresa', label: 'Empresa' },
  { id: 'pessoa', label: 'Pessoa física' },
] as const;

/** Contato (fornecedor/cliente), escopado por empresa. */
export const contactSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  name: z.string(),
  type: contactTypeSchema,
  /** CNPJ (empresa) ou CPF (pessoa). Formatação livre. */
  document: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  note: z.string().nullable(),
  /** Arquivado: some do select de novas movimentações, fica no histórico. */
  archived: z.boolean(),
});
export type Contact = z.infer<typeof contactSchema>;

export const createContactSchema = z.object({
  name: z.string().trim().min(1, 'Dê um nome ao contato').max(120),
  type: contactTypeSchema,
  document: z.string().trim().max(30).nullable().optional(),
  email: z.string().trim().toLowerCase().email('E-mail inválido').nullable().optional().or(z.literal('').transform(() => null)),
  phone: z.string().trim().max(30).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
});
export type CreateContactInput = z.infer<typeof createContactSchema>;

export const updateContactSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    type: contactTypeSchema.optional(),
    document: z.string().trim().max(30).nullable().optional(),
    email: z.string().trim().toLowerCase().email('E-mail inválido').nullable().optional().or(z.literal('').transform(() => null)),
    phone: z.string().trim().max(30).nullable().optional(),
    note: z.string().trim().max(300).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada para atualizar.' });
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
