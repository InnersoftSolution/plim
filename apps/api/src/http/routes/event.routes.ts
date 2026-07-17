import type { FastifyInstance } from 'fastify';
import { createEventSchema, updateEventSchema } from '@plim/shared';
import { z } from 'zod';
import type { EventService } from '../../services/event.service';
import { authenticate } from '../auth';

const companyParamsSchema = z.object({ companyId: z.string().uuid() });
const eventParamsSchema = z.object({ companyId: z.string().uuid(), eventId: z.string().uuid() });

/**
 * Camada HTTP da agenda. Autorização (ser membro) acontece no EventService,
 * via CompanyService.getOverview.
 */
export async function eventRoutes(app: FastifyInstance, opts: { service: EventService }): Promise<void> {
  const { service } = opts;

  app.addHook('preHandler', authenticate);

  app.get('/companies/:companyId/events', async (request) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    return service.list(companyId, request.user?.id ?? null);
  });

  app.post('/companies/:companyId/events', async (request, reply) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    const input = createEventSchema.parse(request.body);
    const event = await service.create(companyId, input, request.user?.id ?? null);
    return reply.status(201).send(event);
  });

  app.patch('/companies/:companyId/events/:eventId', async (request) => {
    const { companyId, eventId } = eventParamsSchema.parse(request.params);
    const input = updateEventSchema.parse(request.body);
    return service.update(companyId, eventId, input, request.user?.id ?? null);
  });

  app.delete('/companies/:companyId/events/:eventId', async (request, reply) => {
    const { companyId, eventId } = eventParamsSchema.parse(request.params);
    await service.remove(companyId, eventId, request.user?.id ?? null);
    return reply.status(204).send();
  });

  // Status da sincronização com o Google Calendar, por participante.
  app.get('/companies/:companyId/events/:eventId/sync', async (request) => {
    const { companyId, eventId } = eventParamsSchema.parse(request.params);
    return service.getSyncSummary(companyId, eventId, request.user?.id ?? null);
  });

  // Tentar sincronizar de novo (após falha). Devolve o status atualizado.
  app.post('/companies/:companyId/events/:eventId/resync', async (request) => {
    const { companyId, eventId } = eventParamsSchema.parse(request.params);
    return service.resync(companyId, eventId, request.user?.id ?? null);
  });
}
