import type { FastifyInstance } from 'fastify';
import { createPartnerLeadSchema } from '@plim/shared';
import { z } from 'zod';
import type { PartnerService } from '../../services/partner.service';
import { authenticate } from '../auth';

const companyParamsSchema = z.object({ companyId: z.string().uuid() });

/** Leads de indicação de parceiros (contador, designer…). */
export async function partnerRoutes(app: FastifyInstance, opts: { service: PartnerService }): Promise<void> {
  const { service } = opts;

  app.addHook('preHandler', authenticate);

  app.post('/companies/:companyId/partner-leads', async (request, reply) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    const input = createPartnerLeadSchema.parse(request.body);
    const lead = await service.createLead(companyId, input, request.user?.id ?? null);
    return reply.status(201).send(lead);
  });

  app.get('/companies/:companyId/partner-leads', async (request) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    return service.listLeads(companyId, request.user?.id ?? null);
  });
}
