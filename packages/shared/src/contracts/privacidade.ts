import { z } from 'zod';

/**
 * Privacidade e direito de eliminação (LGPD art. 18, VI).
 *
 * Duas exclusões diferentes, de propósito:
 *  - EMPRESA: apaga a empresa e todo o histórico dela. Afeta os outros sócios,
 *    então só o dono da conta pode pedir.
 *  - CONTA: apaga o acesso da pessoa ao Plim. Não pode destruir empresa de
 *    terceiros: enquanto a pessoa for dona de uma empresa com outros sócios,
 *    o pedido fica bloqueado até ela transferir a titularidade ou excluir a
 *    empresa antes.
 *
 * Ambas passam por CARÊNCIA: o pedido agenda o expurgo e pode ser cancelado
 * dentro do prazo. Nada some no instante do clique.
 */

/** Dias entre o pedido e o expurgo definitivo. Único lugar que define o prazo. */
export const DELETION_GRACE_DAYS = 30;

/** Texto que a pessoa digita para confirmar a exclusão da própria conta. */
export const ACCOUNT_DELETION_CONFIRM_TEXT = 'EXCLUIR MINHA CONTA';

/**
 * Estado da exclusão agendada. Nulo quando não há pedido em aberto.
 * `daysLeft` vem calculado do backend para o front não fazer conta de data.
 */
export const deletionStateSchema = z.object({
  requestedAt: z.string().datetime(),
  scheduledFor: z.string().datetime(),
  /** Dias inteiros que ainda faltam (0 = vence hoje). */
  daysLeft: z.number().int().min(0),
  /** Quem pediu (nome), para os outros sócios saberem de quem partiu. */
  requestedByName: z.string().nullable(),
});
export type DeletionState = z.infer<typeof deletionStateSchema>;

/**
 * Pedido de exclusão da empresa. `confirmName` precisa bater exatamente com o
 * nome da empresa: confirmação por digitação evita o clique acidental num botão
 * que destrói a contabilidade da sociedade.
 */
export const requestCompanyDeletionSchema = z.object({
  confirmName: z.string().trim().min(1, 'Digite o nome da empresa para confirmar.'),
  reason: z.string().trim().max(500).nullable().optional(),
});
export type RequestCompanyDeletionInput = z.infer<typeof requestCompanyDeletionSchema>;

/** Pedido de exclusão da conta, com a mesma confirmação por digitação. */
export const requestAccountDeletionSchema = z.object({
  confirmText: z.string().trim().min(1),
  reason: z.string().trim().max(500).nullable().optional(),
});
export type RequestAccountDeletionInput = z.infer<typeof requestAccountDeletionSchema>;

/** Transferência da titularidade da conta da empresa para outro sócio. */
export const transferOwnershipSchema = z.object({
  memberId: z.string().uuid(),
});
export type TransferOwnershipInput = z.infer<typeof transferOwnershipSchema>;

/**
 * Impedimento para excluir a conta. O front mostra cada um como uma pendência
 * com a ação que resolve, em vez de um "não é possível" seco.
 */
export const accountDeletionBlockerSchema = z.object({
  /** Empresa onde a pessoa é dona da conta e existem outros sócios ativos. */
  kind: z.literal('owns_company_with_partners'),
  companyId: z.string().uuid(),
  companyName: z.string(),
  /** Quantos outros sócios continuam na empresa. */
  otherMembers: z.number().int().min(1),
});
export type AccountDeletionBlocker = z.infer<typeof accountDeletionBlockerSchema>;

/**
 * O que a pessoa precisa saber ANTES de confirmar: o que será apagado, o que
 * está travado e o que fica retido. Backend é dono dessa avaliação.
 */
export const accountDeletionPreviewSchema = z.object({
  /** Pendências que impedem a exclusão. Vazio = pode confirmar. */
  blockers: z.array(accountDeletionBlockerSchema),
  /** Empresas onde a pessoa está sozinha: somem junto com a conta. */
  companiesToDelete: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  /** Empresas onde ela é só sócia: continuam, ela apenas sai. */
  companiesToLeave: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  /** Pedido já em andamento, se houver. */
  deletion: deletionStateSchema.nullable(),
  graceDays: z.number().int().positive(),
});
export type AccountDeletionPreview = z.infer<typeof accountDeletionPreviewSchema>;

/**
 * O que a pessoa precisa saber antes de excluir a EMPRESA: o volume real do que
 * será destruído. Números vindos do banco, não estimativa do front.
 */
export const companyDeletionPreviewSchema = z.object({
  companyId: z.string().uuid(),
  companyName: z.string(),
  /** Se quem está pedindo pode de fato excluir (só o dono da conta). */
  canDelete: z.boolean(),
  /** Contagem por tipo de registro, para a pessoa medir o estrago. */
  counts: z.object({
    members: z.number().int().min(0),
    movements: z.number().int().min(0),
    recurringCosts: z.number().int().min(0),
    contacts: z.number().int().min(0),
    activities: z.number().int().min(0),
    events: z.number().int().min(0),
  }),
  deletion: deletionStateSchema.nullable(),
  graceDays: z.number().int().positive(),
});
export type CompanyDeletionPreview = z.infer<typeof companyDeletionPreviewSchema>;
