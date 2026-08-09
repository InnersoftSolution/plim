import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  requestAccountDeletionSchema,
  requestCompanyDeletionSchema,
  transferOwnershipSchema,
} from '@plim/shared';
import { z } from 'zod';
import type { PrivacyService, ActingUser } from '../../services/privacy.service';
import type { CompanyService } from '../../services/company.service';
import { authenticate } from '../auth';

const companyParamsSchema = z.object({ companyId: z.string().uuid() });

/** Nome de arquivo seguro para o download da exportação. */
function exportFileName(prefix: string): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `plim-${prefix}-${stamp}.json`;
}

function actingFrom(request: FastifyRequest): ActingUser {
  return {
    id: request.user?.id ?? null,
    fullName: request.user?.fullName ?? null,
    email: request.user?.email ?? null,
  };
}

/**
 * Privacidade: exportar os dados e pedir a exclusão (LGPD art. 18).
 * Camada HTTP pura — as regras (quem pode, prazo, bloqueios) moram no
 * PrivacyService.
 */
export async function privacyRoutes(
  app: FastifyInstance,
  opts: { service: PrivacyService; companyService: CompanyService },
): Promise<void> {
  const { service, companyService } = opts;

  app.addHook('preHandler', authenticate);

  /* ── empresa ─────────────────────────────────────────── */

  app.get('/companies/:companyId/deletion', async (request) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    return service.getCompanyDeletionPreview(companyId, actingFrom(request));
  });

  app.get('/companies/:companyId/export', async (request, reply) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    const data = await service.exportCompany(companyId, actingFrom(request));
    // Content-Disposition faz o navegador baixar em vez de exibir o JSON cru.
    return reply
      .header('content-type', 'application/json; charset=utf-8')
      .header('content-disposition', `attachment; filename="${exportFileName('empresa')}"`)
      .send(data);
  });

  app.post('/companies/:companyId/deletion', async (request) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    const input = requestCompanyDeletionSchema.parse(request.body);
    return service.requestCompanyDeletion(companyId, input, actingFrom(request));
  });

  app.delete('/companies/:companyId/deletion', async (request) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    return service.cancelCompanyDeletion(companyId, actingFrom(request));
  });

  /**
   * Transferir a titularidade. Fica aqui porque só existe para desbloquear a
   * saída de quem quer excluir a conta sem destruir a empresa dos outros.
   */
  app.post('/companies/:companyId/transfer-ownership', async (request) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    const { memberId } = transferOwnershipSchema.parse(request.body);
    return companyService.transferOwnership(companyId, memberId, request.user?.id ?? null);
  });

  /* ── conta ───────────────────────────────────────────── */

  app.get('/me/deletion', async (request) => {
    return service.getAccountDeletionPreview(actingFrom(request));
  });

  app.post('/me/deletion', async (request) => {
    const input = requestAccountDeletionSchema.parse(request.body);
    return service.requestAccountDeletion(input, actingFrom(request));
  });

  app.delete('/me/deletion', async (request) => {
    return service.cancelAccountDeletion(actingFrom(request));
  });
}
