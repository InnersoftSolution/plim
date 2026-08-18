import type { AuditAction, AuditEntityType, AuditEvent } from '@plim/shared';

/** Evento a gravar (id e data ficam com o banco). */
export interface NewAuditEvent {
  companyId: string;
  actorMemberId: string | null;
  /** Nome do autor no momento do evento; congelado no registro. */
  actorName: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string | null;
  summary: string;
}

/**
 * Trilha de auditoria: só cresce. Não existe update nem delete de evento,
 * de propósito; auditoria que pode ser reescrita não audita nada.
 */
export interface AuditRepository {
  record(event: NewAuditEvent): Promise<void>;
  /** Histórico de uma entidade (ex.: uma movimentação), mais recente primeiro. */
  listByEntity(
    companyId: string,
    entityType: AuditEntityType,
    entityId: string,
  ): Promise<AuditEvent[]>;
  /** Linha do tempo da empresa, mais recente primeiro. */
  listByCompany(companyId: string, limit: number): Promise<AuditEvent[]>;
}
