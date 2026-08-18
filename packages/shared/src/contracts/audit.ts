import { z } from 'zod';

/**
 * Trilha de auditoria: quem fez o quê, e quando.
 *
 * O evento carrega uma frase pronta (summary) em vez de códigos para a tela
 * montar: auditoria é para ser LIDA, e a frase é escrita no momento em que a
 * ação acontece, com os nomes daquele instante. Se o sócio sair da empresa
 * depois, a história não muda.
 */

/** O que aconteceu. Lista fechada para a tela poder iconografar. */
export const auditActionSchema = z.enum([
  'created',
  'updated',
  'deleted',
  'confirmed',
  'refused',
  'paid',
]);
export type AuditAction = z.infer<typeof auditActionSchema>;

/** Sobre o que aconteceu. */
export const auditEntityTypeSchema = z.enum([
  'movement',
  'settlement_payment',
  'recurring_cost',
]);
export type AuditEntityType = z.infer<typeof auditEntityTypeSchema>;

export const auditEventSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  /** Sócio que fez a ação. Nulo = sistema (importação por script, rotina). */
  actorMemberId: z.string().uuid().nullable(),
  /** Nome do autor no momento do evento (resolvido pela API). */
  actorName: z.string().nullable(),
  action: auditActionSchema,
  entityType: auditEntityTypeSchema,
  entityId: z.string().uuid().nullable(),
  /** Frase pronta: 'registrou a despesa "Advogado" de R$ 10.000,00'. */
  summary: z.string(),
  createdAt: z.string(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;
