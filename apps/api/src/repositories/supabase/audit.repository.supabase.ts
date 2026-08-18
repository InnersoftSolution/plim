import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuditAction, AuditEntityType, AuditEvent } from '@plim/shared';
import type { AuditRepository, NewAuditEvent } from '../audit.repository';

interface AuditRow {
  id: string;
  company_id: string;
  actor_member_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  created_at: string;
}

/**
 * O nome do autor não tem coluna própria: vai embutido no summary (frase
 * escrita no momento do evento). Para a tela, o actorName sai do prefixo do
 * summary quando existe; manter uma coluna só para isso duplicaria o dado.
 */
export class SupabaseAuditRepository implements AuditRepository {
  constructor(private readonly db: SupabaseClient) {}

  async record(event: NewAuditEvent): Promise<void> {
    const { error } = await this.db.from('audit_events').insert({
      company_id: event.companyId,
      actor_member_id: event.actorMemberId,
      action: event.action,
      entity_type: event.entityType,
      entity_id: event.entityId,
      summary: event.summary,
    });
    if (error) throw new Error(`Falha ao gravar auditoria: ${error.message}`);
  }

  async listByEntity(
    companyId: string,
    entityType: AuditEntityType,
    entityId: string,
  ): Promise<AuditEvent[]> {
    const { data, error } = await this.db
      .from('audit_events')
      .select()
      .eq('company_id', companyId)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .returns<AuditRow[]>();
    if (error) throw new Error(`Falha ao carregar auditoria: ${error.message}`);
    return (data ?? []).map(toEvent);
  }

  async listByCompany(companyId: string, limit: number): Promise<AuditEvent[]> {
    const { data, error } = await this.db
      .from('audit_events')
      .select()
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(limit)
      .returns<AuditRow[]>();
    if (error) throw new Error(`Falha ao carregar auditoria: ${error.message}`);
    return (data ?? []).map(toEvent);
  }
}

function toEvent(r: AuditRow): AuditEvent {
  return {
    id: r.id,
    companyId: r.company_id,
    actorMemberId: r.actor_member_id,
    // O summary começa com o nome do autor ("Dyely registrou…"); a primeira
    // palavra não é confiável como nome completo, então a tela usa o summary
    // inteiro e o actorName fica nulo na leitura.
    actorName: null,
    action: r.action as AuditAction,
    entityType: r.entity_type as AuditEntityType,
    entityId: r.entity_id,
    summary: r.summary,
    createdAt: r.created_at,
  };
}
