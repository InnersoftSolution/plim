import { randomUUID } from 'node:crypto';
import type { AuditEntityType, AuditEvent } from '@plim/shared';
import type { AuditRepository, NewAuditEvent } from '../audit.repository';

export class InMemoryAuditRepository implements AuditRepository {
  // A ordem de inserção desempata eventos no mesmo milissegundo (nos testes
  // tudo acontece "ao mesmo tempo"); o mais recente vem primeiro, como no SQL.
  private events: (AuditEvent & { seq: number })[] = [];
  private seq = 0;

  async record(event: NewAuditEvent): Promise<void> {
    this.events.push({
      seq: this.seq++,
      id: randomUUID(),
      companyId: event.companyId,
      actorMemberId: event.actorMemberId,
      actorName: event.actorName,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      summary: event.summary,
      createdAt: new Date().toISOString(),
    });
  }

  async listByEntity(
    companyId: string,
    entityType: AuditEntityType,
    entityId: string,
  ): Promise<AuditEvent[]> {
    return this.events
      .filter(
        (e) => e.companyId === companyId && e.entityType === entityType && e.entityId === entityId,
      )
      .sort((a, b) => b.seq - a.seq);
  }

  async listByCompany(companyId: string, limit: number): Promise<AuditEvent[]> {
    return this.events
      .filter((e) => e.companyId === companyId)
      .sort((a, b) => b.seq - a.seq)
      .slice(0, limit)
      .map(({ seq: _seq, ...e }) => e);
  }
}
