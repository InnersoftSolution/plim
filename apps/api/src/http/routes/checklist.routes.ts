import type { FastifyInstance } from 'fastify';
import { createChecklistItemSchema, updateChecklistItemSchema } from '@plim/shared';
import { z } from 'zod';
import type { ChecklistService } from '../../services/checklist.service';
import { authenticate } from '../auth';

const companyParamsSchema = z.object({ companyId: z.string().uuid() });
const itemParamsSchema = z.object({ companyId: z.string().uuid(), itemId: z.string().uuid() });

/**
 * Camada HTTP do Checklist da empresa. Autorizacao (ser membro) acontece no
 * ChecklistService, via CompanyService.getOverview.
 */
export async function checklistRoutes(app: FastifyInstance, opts: { service: ChecklistService }): Promise<void> {
  const { service } = opts;

  app.addHook('preHandler', authenticate);

  app.get('/companies/:companyId/checklist', async (request) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    return service.getChecklist(companyId, request.user?.id ?? null);
  });

  app.patch('/companies/:companyId/checklist/:itemId', async (request) => {
    const { companyId, itemId } = itemParamsSchema.parse(request.params);
    const patch = updateChecklistItemSchema.parse(request.body);
    return service.updateItem(companyId, itemId, patch, request.user?.id ?? null);
  });

  app.post('/companies/:companyId/checklist', async (request, reply) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    const input = createChecklistItemSchema.parse(request.body);
    const item = await service.createCustomItem(companyId, input, request.user?.id ?? null);
    return reply.status(201).send(item);
  });
}
