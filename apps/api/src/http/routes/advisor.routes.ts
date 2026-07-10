import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AdvisorService } from '../../services/advisor.service';
import { authenticate } from '../auth';

const companyParamsSchema = z.object({ companyId: z.string().uuid() });

/**
 * Camada HTTP do copiloto. Valida entrada e delega ao AdvisorService.
 * Autorização (ser membro) é aplicada no serviço, via getOverview.
 */
export async function advisorRoutes(app: FastifyInstance, opts: { service: AdvisorService }): Promise<void> {
  const { service } = opts;

  app.addHook('preHandler', authenticate);

  app.get('/companies/:companyId/insights', async (request) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    return service.getInsights(companyId, request.user?.id ?? null);
  });
}
