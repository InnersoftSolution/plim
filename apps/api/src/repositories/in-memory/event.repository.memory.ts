import { randomUUID } from 'node:crypto';
import type { PlimEvent } from '../../domain/event';
import type { EventPatch, EventRepository } from '../event.repository';

export class InMemoryEventRepository implements EventRepository {
  private events = new Map<string, PlimEvent>();

  async listByCompany(companyId: string): Promise<PlimEvent[]> {
    return [...this.events.values()]
      .filter((e) => e.companyId === companyId)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }

  async findById(companyId: string, eventId: string): Promise<PlimEvent | null> {
    const e = this.events.get(eventId);
    return e && e.companyId === companyId ? e : null;
  }

  async create(data: Omit<PlimEvent, 'id' | 'createdAt'>): Promise<PlimEvent> {
    const event: PlimEvent = { ...data, id: randomUUID(), createdAt: new Date() };
    this.events.set(event.id, event);
    return event;
  }

  async update(eventId: string, patch: EventPatch): Promise<PlimEvent> {
    const e = this.events.get(eventId);
    if (!e) throw new Error(`Compromisso ${eventId} não encontrado`);
    const updated: PlimEvent = { ...e, ...patch };
    this.events.set(eventId, updated);
    return updated;
  }

  async delete(eventId: string): Promise<void> {
    this.events.delete(eventId);
  }
}
