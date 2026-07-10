import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { GuideRepository } from '../../repositories/guide.repository';
import { authenticate } from '../auth';

const topicParamsSchema = z.object({ topic: z.string().min(1).max(60) });

/** Conteúdo de orientação configurável (somente leitura). */
export async function guideRoutes(app: FastifyInstance, opts: { repo: GuideRepository }): Promise<void> {
  const { repo } = opts;

  app.addHook('preHandler', authenticate);

  app.get('/guides/:topic', async (request) => {
    const { topic } = topicParamsSchema.parse(request.params);
    return repo.listByTopic(topic);
  });
}
