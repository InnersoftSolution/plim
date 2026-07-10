import type { FastifyInstance } from 'fastify';
import {
  changeActivityStatusSchema,
  checklistItemInputSchema,
  createActivitySchema,
  updateActivitySchema,
} from '@plim/shared';
import { z } from 'zod';
import type { ActivityService } from '../../services/activity.service';
import { authenticate } from '../auth';

const companyParamsSchema = z.object({ companyId: z.string().uuid() });
const activityParamsSchema = z.object({ companyId: z.string().uuid(), activityId: z.string().uuid() });
const itemParamsSchema = z.object({
  companyId: z.string().uuid(),
  activityId: z.string().uuid(),
  itemId: z.string().uuid(),
});

/**
 * Camada HTTP do módulo Atividades. Valida entrada e delega ao ActivityService.
 * Autorização (ser membro da empresa) é aplicada no serviço, via getOverview.
 */
export async function activityRoutes(app: FastifyInstance, opts: { service: ActivityService }): Promise<void> {
  const { service } = opts;

  app.addHook('preHandler', authenticate);

  app.post('/companies/:companyId/activities', async (request, reply) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    const input = createActivitySchema.parse(request.body);
    const activity = await service.createActivity(companyId, input, request.user?.id ?? null);
    return reply.status(201).send(activity);
  });

  app.get('/companies/:companyId/activities', async (request) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    return service.listActivities(companyId, request.user?.id ?? null);
  });

  app.patch('/companies/:companyId/activities/:activityId', async (request) => {
    const { companyId, activityId } = activityParamsSchema.parse(request.params);
    const input = updateActivitySchema.parse(request.body);
    return service.updateActivity(companyId, activityId, input, request.user?.id ?? null);
  });

  app.post('/companies/:companyId/activities/:activityId/status', async (request) => {
    const { companyId, activityId } = activityParamsSchema.parse(request.params);
    const input = changeActivityStatusSchema.parse(request.body);
    return service.changeStatus(companyId, activityId, input, request.user?.id ?? null);
  });

  app.post('/companies/:companyId/activities/:activityId/checklist', async (request, reply) => {
    const { companyId, activityId } = activityParamsSchema.parse(request.params);
    const { title } = checklistItemInputSchema.parse(request.body);
    const activity = await service.addChecklistItem(companyId, activityId, title, request.user?.id ?? null);
    return reply.status(201).send(activity);
  });

  app.patch('/companies/:companyId/activities/:activityId/checklist/:itemId', async (request) => {
    const { companyId, activityId, itemId } = itemParamsSchema.parse(request.params);
    const { isCompleted } = z.object({ isCompleted: z.boolean() }).parse(request.body);
    return service.setChecklistItem(companyId, activityId, itemId, isCompleted, request.user?.id ?? null);
  });

  app.delete('/companies/:companyId/activities/:activityId/checklist/:itemId', async (request) => {
    const { companyId, activityId, itemId } = itemParamsSchema.parse(request.params);
    return service.removeChecklistItem(companyId, activityId, itemId, request.user?.id ?? null);
  });
}
