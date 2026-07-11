import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AdminService } from '../../services/admin.service';
import { authenticate } from '../auth';

const companyParamsSchema = z.object({ companyId: z.string().uuid() });
const userParamsSchema = z.object({ userId: z.string().uuid() });

/**
 * Rotas do Painel Administrativo interno (/admin/*).
 * A permissão (ser admin interno ativo) é validada no AdminService em TODA
 * chamada — nunca confiar no front. Nesta fase o painel é read-only, com uma
 * única ação segura: disparar e-mail de redefinição de senha.
 */
export async function adminRoutes(app: FastifyInstance, opts: { service: AdminService }): Promise<void> {
  const { service } = opts;

  app.addHook('preHandler', authenticate);

  /** Quem sou eu no painel — o front usa para mostrar/esconder a entrada Admin. */
  app.get('/admin/me', async (request) => service.me(request.user?.id ?? null));

  app.get('/admin/dashboard', async (request) => service.dashboard(request.user?.id ?? null));

  app.get('/admin/companies', async (request) => service.listCompanies(request.user?.id ?? null));

  app.get('/admin/companies/:companyId', async (request) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    return service.companyDetail(companyId, request.user?.id ?? null);
  });

  app.get('/admin/users', async (request) => service.listUsers(request.user?.id ?? null));

  app.get('/admin/users/:userId', async (request) => {
    const { userId } = userParamsSchema.parse(request.params);
    return service.userDetail(userId, request.user?.id ?? null);
  });

  /** Fluxo seguro: envia link de redefinição — a API nunca vê/define senha. */
  app.post('/admin/users/:userId/reset-password', async (request, reply) => {
    const { userId } = userParamsSchema.parse(request.params);
    const result = await service.sendPasswordReset(userId, request.user?.id ?? null);
    return reply.status(202).send(result);
  });
}
