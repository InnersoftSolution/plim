import type { PlimEvent } from '../domain/event';

/** Campos editáveis de um compromisso (só o que vier definido). */
export interface EventPatch {
  title?: string;
  description?: string | null;
  kind?: PlimEvent['kind'];
  startsAt?: Date;
  endsAt?: Date | null;
  allDay?: boolean;
  location?: string | null;
  participantMemberIds?: string[];
  reminderMinutes?: number | null;
  syncToGoogle?: boolean;
}

/** Acesso a dados dos compromissos. Implementações: in-memory e Supabase. */
export interface EventRepository {
  listByCompany(companyId: string): Promise<PlimEvent[]>;
  findById(companyId: string, eventId: string): Promise<PlimEvent | null>;
  create(data: Omit<PlimEvent, 'id' | 'createdAt'>): Promise<PlimEvent>;
  update(eventId: string, patch: EventPatch): Promise<PlimEvent>;
  delete(eventId: string): Promise<void>;
}
