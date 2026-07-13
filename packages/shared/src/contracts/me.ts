import { z } from 'zod';

/** Corpo de PATCH /me/active-company: qual empresa passa a ser a ativa. */
export const setActiveCompanySchema = z.object({
  companyId: z.string().uuid(),
});
export type SetActiveCompanyInput = z.infer<typeof setActiveCompanySchema>;

/**
 * GET /me: preferências e permissões do usuário atual.
 * - lastActiveCompanyId: empresa lembrada (última escolhida), ou null.
 * - canCreateMultipleCompanies: se pode ter mais de uma empresa (plano).
 */
export interface MeResponse {
  lastActiveCompanyId: string | null;
  canCreateMultipleCompanies: boolean;
}
