import type { FastifyInstance } from 'fastify';
import { setActiveCompanySchema, type MeResponse } from '@plim/shared';
import type { CompanyService } from '../../services/company.service';
import { canCreateMultipleCompanies } from '../../lib/company-access';
import { authenticate } from '../auth';

/**
 * Preferências e permissões do usuário atual (multiempresa).
 * A empresa ativa é lembrada aqui; a autorização de fato acontece nas rotas
 * de dados (todas exigem membro daquela empresa).
 */
export async function meRoutes(app: FastifyInstance, opts: { service: CompanyService }): Promise<void> {
  const { service } = opts;

  app.addHook('preHandler', authenticate);

  app.get('/me', async (request): Promise<MeResponse> => {
    const lastActiveCompanyId = await service.getActiveCompanyId(request.user?.id ?? null);
    // Sem auth (modo dev): libera criar várias e não lembra preferência.
    const canCreate = request.user ? canCreateMultipleCompanies(request.user) : true;
    return { lastActiveCompanyId, canCreateMultipleCompanies: canCreate };
  });

  app.patch('/me/active-company', async (request): Promise<MeResponse> => {
    const { companyId } = setActiveCompanySchema.parse(request.body);
    await service.setActiveCompany(companyId, request.user?.id ?? null);
    const canCreate = request.user ? canCreateMultipleCompanies(request.user) : true;
    return { lastActiveCompanyId: companyId, canCreateMultipleCompanies: canCreate };
  });
}
