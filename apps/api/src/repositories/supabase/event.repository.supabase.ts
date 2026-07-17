import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventKind } from '@plim/shared';
import type { PlimEvent } from '../../domain/event';
import type { EventPatch, EventRepository } from '../event.repository';

interface Row {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  kind: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  participant_member_ids: string[] | null;
  reminder_minutes: number | null;
  created_by_member_id: string | null;
  sync_to_google: boolean | null;
  created_at: string;
}

function toEvent(row: Row): PlimEvent {
  return {
    id: row.id,
    companyId: row.company_id,
    title: row.title,
    description: row.description,
    kind: row.kind as EventKind,
    startsAt: new Date(row.starts_at),
    endsAt: row.ends_at ? new Date(row.ends_at) : null,
    allDay: row.all_day,
    location: row.location,
    participantMemberIds: row.participant_member_ids ?? [],
    reminderMinutes: row.reminder_minutes,
    createdByMemberId: row.created_by_member_id,
    syncToGoogle: row.sync_to_google ?? false,
    createdAt: new Date(row.created_at),
  };
}

export class SupabaseEventRepository implements EventRepository {
  constructor(private readonly db: SupabaseClient) {}

  async listByCompany(companyId: string): Promise<PlimEvent[]> {
    const { data, error } = await this.db
      .from('events')
      .select('*')
      .eq('company_id', companyId)
      .order('starts_at', { ascending: true })
      .returns<Row[]>();
    if (error) throw new Error(`Falha ao listar compromissos: ${error.message}`);
    return (data ?? []).map(toEvent);
  }

  async findById(companyId: string, eventId: string): Promise<PlimEvent | null> {
    const { data, error } = await this.db
      .from('events')
      .select('*')
      .eq('company_id', companyId)
      .eq('id', eventId)
      .maybeSingle<Row>();
    if (error) throw new Error(`Falha ao buscar compromisso: ${error.message}`);
    return data ? toEvent(data) : null;
  }

  async create(data: Omit<PlimEvent, 'id' | 'createdAt'>): Promise<PlimEvent> {
    const { data: row, error } = await this.db
      .from('events')
      .insert({
        company_id: data.companyId,
        title: data.title,
        description: data.description,
        kind: data.kind,
        starts_at: data.startsAt.toISOString(),
        ends_at: data.endsAt ? data.endsAt.toISOString() : null,
        all_day: data.allDay,
        location: data.location,
        participant_member_ids: data.participantMemberIds,
        reminder_minutes: data.reminderMinutes,
        created_by_member_id: data.createdByMemberId,
        sync_to_google: data.syncToGoogle,
      })
      .select('*')
      .single<Row>();
    if (error || !row) throw new Error(`Falha ao criar compromisso: ${error?.message}`);
    return toEvent(row);
  }

  async update(eventId: string, patch: EventPatch): Promise<PlimEvent> {
    const row: Record<string, unknown> = {};
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.description !== undefined) row.description = patch.description;
    if (patch.kind !== undefined) row.kind = patch.kind;
    if (patch.startsAt !== undefined) row.starts_at = patch.startsAt.toISOString();
    if (patch.endsAt !== undefined) row.ends_at = patch.endsAt ? patch.endsAt.toISOString() : null;
    if (patch.allDay !== undefined) row.all_day = patch.allDay;
    if (patch.location !== undefined) row.location = patch.location;
    if (patch.participantMemberIds !== undefined)
      row.participant_member_ids = patch.participantMemberIds;
    if (patch.reminderMinutes !== undefined) row.reminder_minutes = patch.reminderMinutes;
    if (patch.syncToGoogle !== undefined) row.sync_to_google = patch.syncToGoogle;
    const { data, error } = await this.db
      .from('events')
      .update(row)
      .eq('id', eventId)
      .select('*')
      .single<Row>();
    if (error || !data) throw new Error(`Falha ao atualizar compromisso: ${error?.message}`);
    return toEvent(data);
  }

  async delete(eventId: string): Promise<void> {
    const { error } = await this.db.from('events').delete().eq('id', eventId);
    if (error) throw new Error(`Falha ao excluir compromisso: ${error.message}`);
  }
}
