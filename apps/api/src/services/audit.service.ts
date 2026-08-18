import type { AuditEntityType, AuditEvent } from '@plim/shared';
import type { AuditRepository, NewAuditEvent } from '../repositories/audit.repository';
import type { CompanyService } from './company.service';

/**
 * Trilha de auditoria.
 *
 * Gravar NUNCA derruba a ação principal: se a auditoria falhar, a despesa
 * ainda tem que ser salva; o erro vai para o log do servidor. Já a LEITURA
 * passa pela mesma checagem de acesso do resto do sistema: histórico da
 * empresa é dado da empresa.
 */
export class AuditService {
  constructor(
    private readonly companyService: CompanyService,
    private readonly repo: AuditRepository,
  ) {}

  async record(event: NewAuditEvent): Promise<void> {
    try {
      await this.repo.record(event);
    } catch (err) {
      console.error('[audit] falha ao gravar evento:', (err as Error).message);
    }
  }

  async listByEntity(
    companyId: string,
    entityType: AuditEntityType,
    entityId: string,
    actingUserId?: string | null,
  ): Promise<AuditEvent[]> {
    await this.companyService.getOverview(companyId, actingUserId);
    return this.repo.listByEntity(companyId, entityType, entityId);
  }

  async listByCompany(
    companyId: string,
    actingUserId?: string | null,
    limit = 100,
  ): Promise<AuditEvent[]> {
    await this.companyService.getOverview(companyId, actingUserId);
    return this.repo.listByCompany(companyId, limit);
  }
}
