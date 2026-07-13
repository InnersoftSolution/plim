import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  addMemberSchema,
  createCompanySchema,
  updateCompanySchema,
  updateMemberSchema,
  uploadLogoSchema,
} from '@plim/shared';
import { z } from 'zod';
import type { ActingOwner, CompanyService } from '../../services/company.service';
import { authenticate } from '../auth';

const companyParamsSchema = z.object({ companyId: z.string().uuid() });
const memberParamsSchema = z.object({
  companyId: z.string().uuid(),
  memberId: z.string().uuid(),
});

const ownerFromBodySchema = z.object({
  fullName: z.string().trim().min(2),
  email: z.string().trim().toLowerCase().email(),
});

/**
 * Camada HTTP: valida entrada (Zod) e delega ao serviço. Nenhuma regra aqui.
 * O dono/ator vem do token autenticado (request.user). No modo dev sem
 * Supabase, request.user é null e usamos o owner enviado no corpo.
 */
export async function companyRoutes(app: FastifyInstance, opts: { service: CompanyService }): Promise<void> {
  const { service } = opts;

  app.addHook('preHandler', authenticate);

  app.get('/companies', async (request) => {
    // O e-mail permite vincular sozinho convites pendentes deste usuário.
    return service.listMyCompanies(request.user?.id ?? null, request.user?.email ?? null);
  });

  app.post('/companies', async (request, reply) => {
    const body = createCompanySchema
      .extend({ owner: ownerFromBodySchema.optional() })
      .parse(request.body);

    const owner = resolveOwner(request, body.owner);
    const result = await service.createCompany(
      {
        name: body.name,
        isNameTemporary: body.isNameTemporary,
        description: body.description,
        industry: body.industry,
        industryOther: body.industryOther,
        businessModel: body.businessModel,
      },
      owner,
    );
    return reply.status(201).send(result);
  });

  app.patch('/companies/:companyId', async (request) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    const patch = updateCompanySchema.parse(request.body);
    return service.updateCompany(companyId, patch, request.user?.id ?? null);
  });

  // Logo (base64; ~5MB decodificados viram ~7MB no corpo, dai o bodyLimit).
  app.post(
    '/companies/:companyId/logo',
    { bodyLimit: 8 * 1024 * 1024 },
    async (request) => {
      const { companyId } = companyParamsSchema.parse(request.params);
      const { dataBase64, contentType } = uploadLogoSchema.parse(request.body);
      return service.setLogo(companyId, dataBase64, contentType, request.user?.id ?? null);
    },
  );

  app.delete('/companies/:companyId/logo', async (request) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    return service.removeLogo(companyId, request.user?.id ?? null);
  });

  app.post('/companies/:companyId/complete-onboarding', async (request) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    return service.completeOnboarding(companyId, request.user?.id ?? null);
  });

  app.post('/companies/:companyId/members', async (request, reply) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    const input = addMemberSchema.parse(request.body);
    const member = await service.addMember(companyId, input, request.user?.id ?? null);
    return reply.status(201).send(member);
  });

  app.get('/companies/:companyId/members', async (request) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    return service.listMembers(companyId, request.user?.id ?? null);
  });

  app.patch('/companies/:companyId/members/:memberId', async (request) => {
    const { companyId, memberId } = memberParamsSchema.parse(request.params);
    // Aceita { equityPercent } (compat) ou edição completa do sócio.
    const input = updateMemberSchema.parse(request.body);
    return service.updateMember(companyId, memberId, input, request.user?.id ?? null);
  });

  app.post('/companies/:companyId/members/:memberId/invite', async (request) => {
    const { companyId, memberId } = memberParamsSchema.parse(request.params);
    return service.inviteMember(companyId, memberId, request.user?.id ?? null);
  });

  app.delete('/companies/:companyId/members/:memberId', async (request, reply) => {
    const { companyId, memberId } = memberParamsSchema.parse(request.params);
    await service.removeMember(companyId, memberId, request.user?.id ?? null);
    return reply.status(204).send();
  });
}

function resolveOwner(
  request: FastifyRequest,
  bodyOwner: { fullName: string; email: string } | undefined,
): ActingOwner {
  if (request.user) {
    return { id: request.user.id, fullName: request.user.fullName, email: request.user.email };
  }
  if (bodyOwner) {
    return { fullName: bodyOwner.fullName, email: bodyOwner.email };
  }
  // Sem token e sem corpo: a validação do serviço/Zod cuidará, mas damos um erro claro.
  throw new Error('Identidade do dono ausente.');
}
