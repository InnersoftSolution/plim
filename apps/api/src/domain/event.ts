import type { EventKind } from '@plim/shared';

/**
 * Compromisso da agenda, escopado por empresa. Datas guardadas como Date;
 * a camada HTTP serializa em ISO. Participantes são ids de sócios (member).
 */
export interface PlimEvent {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  kind: EventKind;
  startsAt: Date;
  endsAt: Date | null;
  allDay: boolean;
  location: string | null;
  participantMemberIds: string[];
  reminderMinutes: number | null;
  createdByMemberId: string | null;
  /** Enviar aos Google Calendars conectados dos participantes (Plim -> Google). */
  syncToGoogle: boolean;
  createdAt: Date;
}
