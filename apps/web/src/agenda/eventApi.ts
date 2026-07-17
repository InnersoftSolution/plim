import type { CreateEventInput, PlimEvent, UpdateEventInput } from '@plim/shared';
import { apiFetch } from '../lib/api';

export const eventApi = {
  list(companyId: string): Promise<PlimEvent[]> {
    return apiFetch<PlimEvent[]>(`/companies/${companyId}/events`);
  },

  create(companyId: string, input: CreateEventInput): Promise<PlimEvent> {
    return apiFetch<PlimEvent>(`/companies/${companyId}/events`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  update(companyId: string, eventId: string, input: UpdateEventInput): Promise<PlimEvent> {
    return apiFetch<PlimEvent>(`/companies/${companyId}/events/${eventId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  remove(companyId: string, eventId: string): Promise<void> {
    return apiFetch<void>(`/companies/${companyId}/events/${eventId}`, { method: 'DELETE' });
  },
};
