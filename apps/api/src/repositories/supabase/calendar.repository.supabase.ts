import type { SupabaseClient } from '@supabase/supabase-js';
import type { CalendarConnectionStatus, EventSyncStatus } from '@plim/shared';
import type {
  CalendarConnection,
  CalendarConnectionUpsert,
  EventCalendarSync,
  EventCalendarSyncPatch,
} from '../../domain/calendar';
import type { CalendarRepository } from '../calendar.repository';

interface ConnRow {
  id: string;
  user_id: string;
  provider: string;
  provider_account_email: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  scope: string | null;
  status: string;
  connected_at: string | null;
  disconnected_at: string | null;
}

interface SyncRow {
  id: string;
  event_id: string;
  company_id: string;
  member_id: string;
  user_id: string | null;
  sync_status: string;
  external_calendar_provider: string;
  external_event_id: string | null;
  last_sync_at: string | null;
  sync_error: string | null;
}

function toConn(r: ConnRow): CalendarConnection {
  return {
    id: r.id,
    userId: r.user_id,
    provider: 'google',
    providerAccountEmail: r.provider_account_email,
    accessTokenEncrypted: r.access_token_encrypted,
    refreshTokenEncrypted: r.refresh_token_encrypted,
    tokenExpiresAt: r.token_expires_at ? new Date(r.token_expires_at) : null,
    scope: r.scope,
    status: r.status as CalendarConnectionStatus,
    connectedAt: r.connected_at ? new Date(r.connected_at) : null,
    disconnectedAt: r.disconnected_at ? new Date(r.disconnected_at) : null,
  };
}

function toSync(r: SyncRow): EventCalendarSync {
  return {
    id: r.id,
    eventId: r.event_id,
    companyId: r.company_id,
    memberId: r.member_id,
    userId: r.user_id,
    syncStatus: r.sync_status as EventSyncStatus,
    externalCalendarProvider: 'google',
    externalEventId: r.external_event_id,
    lastSyncAt: r.last_sync_at ? new Date(r.last_sync_at) : null,
    syncError: r.sync_error,
  };
}

export class SupabaseCalendarRepository implements CalendarRepository {
  constructor(private readonly db: SupabaseClient) {}

  async getConnection(userId: string): Promise<CalendarConnection | null> {
    const { data, error } = await this.db
      .from('user_calendar_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .maybeSingle<ConnRow>();
    if (error) throw new Error(`Falha ao buscar conexão de calendário: ${error.message}`);
    return data ? toConn(data) : null;
  }

  async getConnectionsByUserIds(userIds: string[]): Promise<CalendarConnection[]> {
    if (userIds.length === 0) return [];
    const { data, error } = await this.db
      .from('user_calendar_connections')
      .select('*')
      .in('user_id', userIds)
      .eq('provider', 'google')
      .eq('status', 'connected')
      .returns<ConnRow[]>();
    if (error) throw new Error(`Falha ao buscar conexões de calendário: ${error.message}`);
    return (data ?? []).map(toConn);
  }

  async upsertConnection(data: CalendarConnectionUpsert): Promise<CalendarConnection> {
    const { data: row, error } = await this.db
      .from('user_calendar_connections')
      .upsert(
        {
          user_id: data.userId,
          provider: 'google',
          provider_account_email: data.providerAccountEmail,
          access_token_encrypted: data.accessTokenEncrypted,
          refresh_token_encrypted: data.refreshTokenEncrypted,
          token_expires_at: data.tokenExpiresAt ? data.tokenExpiresAt.toISOString() : null,
          scope: data.scope,
          status: data.status,
          connected_at: data.connectedAt ? data.connectedAt.toISOString() : null,
          disconnected_at: data.disconnectedAt ? data.disconnectedAt.toISOString() : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,provider' },
      )
      .select('*')
      .single<ConnRow>();
    if (error || !row) throw new Error(`Falha ao salvar conexão de calendário: ${error?.message}`);
    return toConn(row);
  }

  async updateTokens(
    userId: string,
    patch: {
      accessTokenEncrypted: string | null;
      refreshTokenEncrypted: string | null;
      tokenExpiresAt: Date | null;
      status: CalendarConnectionStatus;
    },
  ): Promise<void> {
    const { error } = await this.db
      .from('user_calendar_connections')
      .update({
        access_token_encrypted: patch.accessTokenEncrypted,
        refresh_token_encrypted: patch.refreshTokenEncrypted,
        token_expires_at: patch.tokenExpiresAt ? patch.tokenExpiresAt.toISOString() : null,
        status: patch.status,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('provider', 'google');
    if (error) throw new Error(`Falha ao atualizar tokens: ${error.message}`);
  }

  async listSyncByEvent(eventId: string): Promise<EventCalendarSync[]> {
    const { data, error } = await this.db
      .from('event_calendar_sync')
      .select('*')
      .eq('event_id', eventId)
      .returns<SyncRow[]>();
    if (error) throw new Error(`Falha ao listar sincronizações: ${error.message}`);
    return (data ?? []).map(toSync);
  }

  async findSync(eventId: string, memberId: string): Promise<EventCalendarSync | null> {
    const { data, error } = await this.db
      .from('event_calendar_sync')
      .select('*')
      .eq('event_id', eventId)
      .eq('member_id', memberId)
      .maybeSingle<SyncRow>();
    if (error) throw new Error(`Falha ao buscar sincronização: ${error.message}`);
    return data ? toSync(data) : null;
  }

  async createSync(data: Omit<EventCalendarSync, 'id'>): Promise<EventCalendarSync> {
    const { data: row, error } = await this.db
      .from('event_calendar_sync')
      .insert({
        event_id: data.eventId,
        company_id: data.companyId,
        member_id: data.memberId,
        user_id: data.userId,
        sync_status: data.syncStatus,
        external_calendar_provider: 'google',
        external_event_id: data.externalEventId,
        last_sync_at: data.lastSyncAt ? data.lastSyncAt.toISOString() : null,
        sync_error: data.syncError,
      })
      .select('*')
      .single<SyncRow>();
    if (error || !row) throw new Error(`Falha ao criar sincronização: ${error?.message}`);
    return toSync(row);
  }

  async updateSync(id: string, patch: EventCalendarSyncPatch): Promise<EventCalendarSync> {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.userId !== undefined) row.user_id = patch.userId;
    if (patch.syncStatus !== undefined) row.sync_status = patch.syncStatus;
    if (patch.externalEventId !== undefined) row.external_event_id = patch.externalEventId;
    if (patch.lastSyncAt !== undefined) row.last_sync_at = patch.lastSyncAt ? patch.lastSyncAt.toISOString() : null;
    if (patch.syncError !== undefined) row.sync_error = patch.syncError;
    const { data, error } = await this.db
      .from('event_calendar_sync')
      .update(row)
      .eq('id', id)
      .select('*')
      .single<SyncRow>();
    if (error || !data) throw new Error(`Falha ao atualizar sincronização: ${error?.message}`);
    return toSync(data);
  }

  async deleteSync(id: string): Promise<void> {
    const { error } = await this.db.from('event_calendar_sync').delete().eq('id', id);
    if (error) throw new Error(`Falha ao remover sincronização: ${error.message}`);
  }
}
