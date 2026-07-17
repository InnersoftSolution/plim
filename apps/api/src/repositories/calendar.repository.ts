import type {
  CalendarConnection,
  CalendarConnectionUpsert,
  EventCalendarSync,
  EventCalendarSyncPatch,
} from '../domain/calendar';

/**
 * Acesso a dados da integração de calendário: conexões por usuário e o estado
 * de sincronização de cada evento por participante. Implementações: in-memory
 * (dev/testes) e Supabase. Só o service role escreve tokens.
 */
export interface CalendarRepository {
  // ── conexões por usuário ──────────────────────────────────
  getConnection(userId: string): Promise<CalendarConnection | null>;
  /** Conexões conectadas de vários usuários de uma vez (para o motor de sync). */
  getConnectionsByUserIds(userIds: string[]): Promise<CalendarConnection[]>;
  upsertConnection(data: CalendarConnectionUpsert): Promise<CalendarConnection>;
  /** Atualiza só os tokens (usado ao renovar o access_token). */
  updateTokens(
    userId: string,
    patch: Pick<
      CalendarConnectionUpsert,
      'accessTokenEncrypted' | 'refreshTokenEncrypted' | 'tokenExpiresAt' | 'status'
    >,
  ): Promise<void>;

  // ── sincronização por evento/participante ─────────────────
  listSyncByEvent(eventId: string): Promise<EventCalendarSync[]>;
  findSync(eventId: string, memberId: string): Promise<EventCalendarSync | null>;
  createSync(
    data: Omit<EventCalendarSync, 'id'>,
  ): Promise<EventCalendarSync>;
  updateSync(id: string, patch: EventCalendarSyncPatch): Promise<EventCalendarSync>;
  deleteSync(id: string): Promise<void>;
}
