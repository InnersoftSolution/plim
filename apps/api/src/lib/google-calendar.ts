import type { PlimEvent } from '../domain/event';

/**
 * Cliente fino da Google Calendar API v3. Só o que a integração unidirecional
 * precisa: criar, atualizar e remover eventos no calendário primário do usuário
 * conectado. NUNCA lista nem lê a agenda pessoal dele.
 *
 * Recebe um access_token já válido (a renovação é responsabilidade de quem
 * chama, via CalendarService). Marca cada evento com a origem (extendedProperties)
 * para rastrear que foi o Plim que criou.
 */

const API = 'https://www.googleapis.com/calendar/v3';
const CALENDAR_ID = 'primary';

/** Mapa PlimEvent -> corpo de evento do Google. */
export function toGoogleEventBody(event: PlimEvent): Record<string, unknown> {
  const body: Record<string, unknown> = {
    summary: event.title,
    description: descriptionWithMark(event),
    location: event.location ?? undefined,
    extendedProperties: { private: { plimEventId: event.id, source: 'plim' } },
  };

  if (event.allDay) {
    // Dia inteiro: datas puras (YYYY-MM-DD). O fim no Google é exclusivo (+1 dia).
    const startDate = ymd(event.startsAt);
    const endBase = event.endsAt ?? event.startsAt;
    body.start = { date: startDate };
    body.end = { date: ymd(addDays(endBase, 1)) };
  } else {
    const end = event.endsAt ?? new Date(event.startsAt.getTime() + 60 * 60 * 1000);
    body.start = { dateTime: event.startsAt.toISOString() };
    body.end = { dateTime: end.toISOString() };
  }

  if (event.reminderMinutes != null) {
    body.reminders = {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: event.reminderMinutes }],
    };
  }
  return body;
}

export class GoogleCalendarClient {
  constructor(private readonly accessToken: string) {}

  async createEvent(event: PlimEvent): Promise<string> {
    const res = await this.call(`/calendars/${CALENDAR_ID}/events`, 'POST', toGoogleEventBody(event));
    const data = (await res.json().catch(() => null)) as GoogleResult | null;
    if (!res.ok || !data?.id) throw new Error(failure(res, data, 'criar'));
    return data.id;
  }

  async updateEvent(externalEventId: string, event: PlimEvent): Promise<void> {
    const res = await this.call(
      `/calendars/${CALENDAR_ID}/events/${encodeURIComponent(externalEventId)}`,
      'PATCH',
      toGoogleEventBody(event),
    );
    if (!res.ok) throw new Error(failure(res, await bodyOf(res), 'atualizar'));
  }

  async deleteEvent(externalEventId: string): Promise<void> {
    const res = await this.call(
      `/calendars/${CALENDAR_ID}/events/${encodeURIComponent(externalEventId)}`,
      'DELETE',
    );
    // 410 (Gone) / 404: já não existe no Google. Para nós, é como remover: ok.
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      throw new Error(failure(res, await bodyOf(res), 'remover'));
    }
  }

  private call(path: string, method: string, body?: unknown): Promise<Response> {
    return fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
}

function descriptionWithMark(event: PlimEvent): string {
  const base = event.description?.trim() ?? '';
  const mark = 'Criado pela Agenda do Plim.';
  return base ? `${base}\n\n${mark}` : mark;
}

interface GoogleResult {
  id?: string;
  error?: { message?: string };
}

/** Lê o corpo (JSON) da resposta uma única vez, tolerando corpo vazio. */
async function bodyOf(res: Response): Promise<GoogleResult | null> {
  return (await res.json().catch(() => null)) as GoogleResult | null;
}

function failure(res: Response, data: GoogleResult | null, verb: string): string {
  const detail = data?.error?.message ?? `${res.status} ${res.statusText}`.trim();
  return `Não foi possível ${verb} o evento no Google Calendar: ${detail}`;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}
function pad(n: number): string {
  return String(n).padStart(2, '0');
}
