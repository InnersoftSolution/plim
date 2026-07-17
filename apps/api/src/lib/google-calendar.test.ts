import { describe, expect, it } from 'vitest';
import type { PlimEvent } from '../domain/event';
import { toGoogleEventBody } from './google-calendar';

function evt(over: Partial<PlimEvent>): PlimEvent {
  return {
    id: 'e1',
    companyId: 'c1',
    title: 'Reunião',
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

describe('toGoogleEventBody', () => {
  it('evento com horário vira start/end dateTime (fim padrão +1h)', () => {
    const body = toGoogleEventBody(evt({})) as {
      start: { dateTime: string };
      end: { dateTime: string };
    };
    expect(body.start.dateTime).toBe('2026-07-20T13:00:00.000Z');
    expect(body.end.dateTime).toBe('2026-07-20T14:00:00.000Z');
  });

  it('dia inteiro vira date com fim exclusivo (+1 dia)', () => {
    const body = toGoogleEventBody(
      evt({ allDay: true, startsAt: new Date(2026, 6, 20, 0, 0, 0) }),
    ) as { start: { date: string }; end: { date: string } };
    expect(body.start.date).toBe('2026-07-20');
    expect(body.end.date).toBe('2026-07-21');
  });

  it('inclui lembrete como override e marca a origem Plim', () => {
    const body = toGoogleEventBody(evt({ reminderMinutes: 30 })) as {
      reminders: { useDefault: boolean; overrides: { minutes: number }[] };
      extendedProperties: { private: { plimEventId: string; source: string } };
    };
    expect(body.reminders.useDefault).toBe(false);
    expect(body.reminders.overrides[0]!.minutes).toBe(30);
    expect(body.extendedProperties.private.plimEventId).toBe('e1');
    expect(body.extendedProperties.private.source).toBe('plim');
  });
});
