import type { CalendarConnection, EventSyncSummary } from '@plim/shared';
import { apiFetch, ApiError } from '../lib/api';

/**
 * Integração Google Calendar (Plim -> Google, unidirecional). Quando a API não
 * tem a integração configurada, /me/calendar/google responde 404: tratamos como
 * "indisponível" e o front mostra o card "em breve".
 */
export type CalendarConnectionState =
  | { available: false }
  | { available: true; connection: CalendarConnection };

export const calendarApi = {
  async getConnection(): Promise<CalendarConnectionState> {
    try {
      const connection = await apiFetch<CalendarConnection>('/me/calendar/google');
      return { available: true, connection };
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.code === 'CALENDAR_NOT_CONFIGURED')) {
        return { available: false };
      }
      throw err;
    }
  },

  /** Busca a URL de consentimento e leva o usuário até o Google. */
  async connect(): Promise<void> {
    const { url } = await apiFetch<{ url: string }>('/calendar/google/connect');
    window.location.assign(url);
  },

  disconnect(): Promise<CalendarConnection> {
    return apiFetch<CalendarConnection>('/calendar/google/disconnect', { method: 'POST' });
  },

  getEventSync(companyId: string, eventId: string): Promise<EventSyncSummary> {
    return apiFetch<EventSyncSummary>(`/companies/${companyId}/events/${eventId}/sync`);
  },

  resync(companyId: string, eventId: string): Promise<EventSyncSummary> {
    return apiFetch<EventSyncSummary>(`/companies/${companyId}/events/${eventId}/resync`, {
      method: 'POST',
    });
  },
};
