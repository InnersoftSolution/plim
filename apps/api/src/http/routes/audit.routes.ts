import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { auditEntityTypeSchema } from '@plim/shared';
import type { AuditService } from '../../services/audit.service';
import { authenticate } from '../auth';

const companyParamsSchema = z.object({ companyId: z.string().uuid() });
const auditQuerySchema = z.object({
  entityType: auditEntityTypeSchema.optional(),
  entityId: z.string().uuid().optional(),
});

/**
 * Trilha de auditoria (somente leitura).
 * Com entityType+entityId: o histórico de uma movimentação, para o detalhe.
 * Sem filtros: a linha do tempo recente da empresa.
 */
export async function auditRoutes(
  app: FastifyInstance,
  opts: { service: AuditService },
): Promise<void> {
  const { service } = opts;

  app.addHook('preHandler', authenticate);

  app.get('/companies/:companyId/audit', async (request) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    const { entityType, entityId } = auditQuerySchema.parse(request.query);
    if (entityType && entityId) {
      return service.listByEntity(companyId, entityType, entityId, request.user?.id ?? null);
    }
    return service.listByCompany(companyId, request.user?.id ?? null);
  });
}
