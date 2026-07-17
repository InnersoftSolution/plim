import { randomUUID } from 'node:crypto';
import type {
  CalendarConnection,
  CalendarConnectionUpsert,
  EventCalendarSync,
  EventCalendarSyncPatch,
} from '../../domain/calendar';
import type { CalendarRepository } from '../calendar.repository';

/** Repositório de calendário em memória (dev sem Supabase e testes). */
export class InMemoryCalendarRepository implements CalendarRepository {
  private connections = new Map<string, CalendarConnection>(); // key: userId
  private syncs = new Map<string, EventCalendarSync>(); // key: sync.id

  async getConnection(userId: string): Promise<CalendarConnection | null> {
    return this.connections.get(userId) ?? null;
  }

  async getConnectionsByUserIds(userIds: string[]): Promise<CalendarConnection[]> {
    const wanted = new Set(userIds);
    return [...this.connections.values()].filter(
      (c) => wanted.has(c.userId) && c.status === 'connected',
    );
  }

  async upsertConnection(data: CalendarConnectionUpsert): Promise<CalendarConnection> {
    const existing = this.connections.get(data.userId);
    const conn: CalendarConnection = { id: existing?.id ?? randomUUID(), ...data };
    this.connections.set(data.userId, conn);
    return conn;
  }

  async updateTokens(
    userId: string,
    patch: Pick<
      CalendarConnectionUpsert,
      'accessTokenEncrypted' | 'refreshTokenEncrypted' | 'tokenExpiresAt' | 'status'
    >,
  ): Promise<void> {
    const existing = this.connections.get(userId);
    if (!existing) return;
    this.connections.set(userId, { ...existing, ...patch });
  }

  async listSyncByEvent(eventId: string): Promise<EventCalendarSync[]> {
    return [...this.syncs.values()].filter((s) => s.eventId === eventId);
  }

  async findSync(eventId: string, memberId: string): Promise<EventCalendarSync | null> {
    return (
      [...this.syncs.values()].find((s) => s.eventId === eventId && s.memberId === memberId) ?? null
    );
  }

  async createSync(data: Omit<EventCalendarSync, 'id'>): Promise<EventCalendarSync> {
    const row: EventCalendarSync = { id: randomUUID(), ...data };
    this.syncs.set(row.id, row);
    return row;
  }

  async updateSync(id: string, patch: EventCalendarSyncPatch): Promise<EventCalendarSync> {
    const row = this.syncs.get(id);
    if (!row) throw new Error(`Sync ${id} não encontrado`);
    const updated: EventCalendarSync = { ...row, ...patch };
    this.syncs.set(id, updated);
    return updated;
  }

  async deleteSync(id: string): Promise<void> {
    this.syncs.delete(id);
  }
}
