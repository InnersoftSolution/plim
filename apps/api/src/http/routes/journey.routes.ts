import type { FastifyInstance } from 'fastify';
import { setJourneyStepSchema } from '@plim/shared';
import { z } from 'zod';
import type { JourneyService } from '../../services/journey.service';
import { authenticate } from '../auth';

const companyParamsSchema = z.object({ companyId: z.string().uuid() });
const stepParamsSchema = z.object({
  companyId: z.string().uuid(),
  stepId: z.string().min(1),
});

/**
 * Camada HTTP da jornada guiada. Valida entrada e delega ao JourneyService.
 * Autorização (ser membro) é aplicada no serviço, via getOverview.
 */
export async function journeyRoutes(app: FastifyInstance, opts: { service: JourneyService }): Promise<void> {
  const { service } = opts;

  app.addHook('preHandler', authenticate);

  app.get('/companies/:companyId/journey', async (request) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    return service.getJourney(companyId, request.user?.id ?? null);
  });

  app.put('/companies/:companyId/journey/:stepId', async (request) => {
    const { companyId, stepId } = stepParamsSchema.parse(request.params);
    const { done } = setJourneyStepSchema.parse(request.body);
    return service.setStep(companyId, stepId, done, request.user?.id ?? null);
  });
}
