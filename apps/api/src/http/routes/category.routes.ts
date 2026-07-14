import type { FastifyInstance } from 'fastify';
import { createCategorySchema, updateCategorySchema } from '@plim/shared';
import { z } from 'zod';
import type { CategoryService } from '../../services/category.service';
import { authenticate } from '../auth';

const companyParamsSchema = z.object({ companyId: z.string().uuid() });
const categoryParamsSchema = z.object({ companyId: z.string().uuid(), categoryId: z.string().uuid() });

/**
 * Camada HTTP das categorias. Autorização (ser membro) acontece no
 * CategoryService, via CompanyService.getOverview.
 */
export async function categoryRoutes(app: FastifyInstance, opts: { service: CategoryService }): Promise<void> {
  const { service } = opts;

  app.addHook('preHandler', authenticate);

  app.get('/companies/:companyId/categories', async (request) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    return service.list(companyId, request.user?.id ?? null);
  });

  app.post('/companies/:companyId/categories', async (request, reply) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    const input = createCategorySchema.parse(request.body);
    const category = await service.create(companyId, input, request.user?.id ?? null);
    return reply.status(201).send(category);
  });

  app.patch('/companies/:companyId/categories/:categoryId', async (request) => {
    const { companyId, categoryId } = categoryParamsSchema.parse(request.params);
    const input = updateCategorySchema.parse(request.body);
    return service.update(companyId, categoryId, input, request.user?.id ?? null);
  });

  app.delete('/companies/:companyId/categories/:categoryId', async (request, reply) => {
    const { companyId, categoryId } = categoryParamsSchema.parse(request.params);
    await service.remove(companyId, categoryId, request.user?.id ?? null);
    return reply.status(204).send();
  });
}
