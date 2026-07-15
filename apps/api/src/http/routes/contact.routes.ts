import type { FastifyInstance } from 'fastify';
import { createContactSchema, updateContactSchema } from '@plim/shared';
import { z } from 'zod';
import type { ContactService } from '../../services/contact.service';
import { authenticate } from '../auth';

const companyParamsSchema = z.object({ companyId: z.string().uuid() });
const contactParamsSchema = z.object({ companyId: z.string().uuid(), contactId: z.string().uuid() });

/**
 * Camada HTTP dos contatos. Autorização (ser membro) acontece no
 * ContactService, via CompanyService.getOverview.
 */
export async function contactRoutes(app: FastifyInstance, opts: { service: ContactService }): Promise<void> {
  const { service } = opts;

  app.addHook('preHandler', authenticate);

  app.get('/companies/:companyId/contacts', async (request) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    return service.list(companyId, request.user?.id ?? null);
  });

  app.post('/companies/:companyId/contacts', async (request, reply) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    const input = createContactSchema.parse(request.body);
    const contact = await service.create(companyId, input, request.user?.id ?? null);
    return reply.status(201).send(contact);
  });

  app.patch('/companies/:companyId/contacts/:contactId', async (request) => {
    const { companyId, contactId } = contactParamsSchema.parse(request.params);
    const input = updateContactSchema.parse(request.body);
    return service.update(companyId, contactId, input, request.user?.id ?? null);
  });

  app.delete('/companies/:companyId/contacts/:contactId', async (request, reply) => {
    const { companyId, contactId } = contactParamsSchema.parse(request.params);
    await service.remove(companyId, contactId, request.user?.id ?? null);
    return reply.status(204).send();
  });
}
