import type { FastifyInstance } from 'fastify';
import { createRecurringCostSchema, updateRecurringCostSchema } from '@plim/shared';
import { z } from 'zod';
import type { RecurringService } from '../../services/recurring.service';
import { authenticate } from '../auth';

const companyParamsSchema = z.object({ companyId: z.string().uuid() });
const costParamsSchema = z.object({ companyId: z.string().uuid(), costId: z.string().uuid() });

/** Custos recorrentes (assinaturas/ferramentas). Regras no RecurringService. */
export async function recurringRoutes(app: FastifyInstance, opts: { service: RecurringService }): Promise<void> {
  const { service } = opts;

  app.addHook('preHandler', authenticate);

  app.post('/companies/:companyId/recurring-costs', async (request, reply) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    const input = createRecurringCostSchema.parse(request.body);
    const cost = await service.create(companyId, input, request.user?.id ?? null);
    return reply.status(201).send(cost);
  });

  app.get('/companies/:companyId/recurring-costs', async (request) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    return service.list(companyId, request.user?.id ?? null);
  });

  app.patch('/companies/:companyId/recurring-costs/:costId', async (request) => {
    const { companyId, costId } = costParamsSchema.parse(request.params);
    const input = updateRecurringCostSchema.parse(request.body);
    return service.update(companyId, costId, input, request.user?.id ?? null);
  });
}
