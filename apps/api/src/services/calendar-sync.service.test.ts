import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CompanyMember } from '../domain/company';
import type { PlimEvent } from '../domain/event';
import { InMemoryCalendarRepository } from '../repositories/in-memory/calendar.repository.memory';
import { CalendarSyncService } from './calendar-sync.service';
import type { CalendarService } from './calendar.service';

function member(over: Partial<CompanyMember> & { id: string }): CompanyMember {
  return {
    companyId: 'c1',
    userId: null,
    fullName: 'Sócio',
    email: null,
    functionalRole: null,
    role: 'partner',
    equityPercent: null,
    notes: null,
    status: 'active',
    invitationStatus: 'not_invited',
    ...over,
  };
}

function evt(over: Partial<PlimEvent>): PlimEvent {
  return {
    id: 'e1',
    companyId: 'c1',
    title: 'Reunião semanal',
    description: null,
    kind: 'reuniao',
    startsAt: new Date('2026-07-20T13:00:00.000Z'),
    endsAt: null,
    allDay: false,
    location: null,
    participantMemberIds: [],
    reminderMinutes: null,
    createdByMemberId: null,
    syncToGoogle: true,
    createdAt: new Date('2026-07-16T00:00:00.000Z'),
    ...over,
  };
}

/** Stub do CalendarService: controla qual usuário "tem token" (conectado). */
function fakeCalendar(tokensByUser: Record<string, string | null>): CalendarService {
  return {
    getValidAccessToken: async (userId: string) => tokensByUser[userId] ?? null,
  } as unknown as CalendarService;
}

describe('CalendarSyncService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('participante sem usuário vinculado fica not_connected (sem chamar o Google)', async () => {
    const repo = new InMemoryCalendarRepository();
    const sync = new CalendarSyncService(repo, fakeCalendar({}));
    const m = member({ id: 'm1', userId: null });
    await sync.syncEvent(evt({ participantMemberIds: ['m1'] }), [m]);

    const summary = await sync.getSummary(evt({ participantMemberIds: ['m1'] }), [m]);
    expect(summary.participants[0]!.syncStatus).toBe('not_connected');
  });

  it('participante conectado, mas sem token válido, fica not_connected', async () => {
    const repo = new InMemoryCalendarRepository();
    const sync = new CalendarSyncService(repo, fakeCalendar({ u1: null }));
    const m = member({ id: 'm1', userId: 'u1' });
    await sync.syncEvent(evt({ participantMemberIds: ['m1'] }), [m]);
    const rows = await repo.listSyncByEvent('e1');
    expect(rows[0]!.syncStatus).toBe('not_connected');
  });

  it('evento com sync desligado marca disabled', async () => {
    const repo = new InMemoryCalendarRepository();
    const sync = new CalendarSyncService(repo, fakeCalendar({ u1: 'tok' }));
    const m = member({ id: 'm1', userId: 'u1' });
    await sync.syncEvent(evt({ participantMemberIds: ['m1'], syncToGoogle: false }), [m]);
    const rows = await repo.listSyncByEvent('e1');
    expect(rows[0]!.syncStatus).toBe('disabled');
  });

  it('participante conectado cria o evento no Google e fica synced', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ id: 'gcal-123' }), { status: 200 })),
    );
    const repo = new InMemoryCalendarRepository();
    const sync = new CalendarSyncService(repo, fakeCalendar({ u1: 'tok' }));
    const m = member({ id: 'm1', userId: 'u1' });
    await sync.syncEvent(evt({ participantMemberIds: ['m1'] }), [m]);
    const rows = await repo.listSyncByEvent('e1');
    expect(rows[0]!.syncStatus).toBe('synced');
    expect(rows[0]!.externalEventId).toBe('gcal-123');
  });

  it('falha do Google marca failed sem derrubar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: { message: 'boom' } }), { status: 500 })),
    );
    const repo = new InMemoryCalendarRepository();
    const sync = new CalendarSyncService(repo, fakeCalendar({ u1: 'tok' }));
    const m = member({ id: 'm1', userId: 'u1' });
    await sync.syncEvent(evt({ participantMemberIds: ['m1'] }), [m]);
    const rows = await repo.listSyncByEvent('e1');
    expect(rows[0]!.syncStatus).toBe('failed');
    expect(rows[0]!.syncError).toContain('boom');
  });

  it('participante removido some da sincronização', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ id: 'gcal-1' }), { status: 200 })),
    );
    const repo = new InMemoryCalendarRepository();
    const sync = new CalendarSyncService(repo, fakeCalendar({ u1: 'tok' }));
    const m1 = member({ id: 'm1', userId: 'u1' });
    const m2 = member({ id: 'm2', userId: 'u1' });
    // Começa com dois participantes...
    await sync.syncEvent(evt({ participantMemberIds: ['m1', 'm2'] }), [m1, m2]);
    expect((await repo.listSyncByEvent('e1')).length).toBe(2);
    // ...e depois um sai.
    await sync.syncEvent(evt({ participantMemberIds: ['m1'] }), [m1, m2]);
    const rows = await repo.listSyncByEvent('e1');
    expect(rows.map((r) => r.memberId)).toEqual(['m1']);
  });

  it('getSummary traz o nome do participante e o status guardado', async () => {
    const repo = new InMemoryCalendarRepository();
    const sync = new CalendarSyncService(repo, fakeCalendar({}));
    const m = member({ id: 'm1', userId: null, fullName: 'Rafaelle Rodrigues' });
    const event = evt({ participantMemberIds: ['m1'] });
    await sync.syncEvent(event, [m]);
    const summary = await sync.getSummary(event, [m]);
    expect(summary.participants[0]!.memberName).toBe('Rafaelle Rodrigues');
    expect(summary.available).toBe(true);
  });
});
