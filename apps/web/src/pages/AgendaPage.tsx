import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  eventKindCatalog,
  eventSyncStatusCatalog,
  type CompanyMember,
  type CreateEventInput,
  type EventKind,
  type EventSyncStatus,
  type EventSyncSummary,
  type PlimEvent,
  type UpdateEventInput,
} from '@plim/shared';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { DateField } from '../components/ui/DateField';
import { useActiveCompany } from '../company/ActiveCompanyContext';
import { companyApi, messageForError } from '../company/companyApi';
import { eventApi } from '../agenda/eventApi';
import { calendarApi, type CalendarConnectionState } from '../agenda/calendarApi';
import '../finance/wizard.css'; // .rc-grid
import './dashboard.css';
import './agenda.css';

type ViewMode = 'day' | 'week' | 'month';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; events: PlimEvent[]; members: CompanyMember[] };

const HOUR_H = 46; // px por hora no grid de dia/semana
const kindLabel = (k: EventKind) => eventKindCatalog.find((c) => c.id === k)?.label ?? k;

const pad = (n: number) => String(n).padStart(2, '0');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

// ── utilidades de data (sempre em horário local) ────────────
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(d.getDate() + n);
  return x;
}
function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(d.getMonth() + n);
  return x;
}
function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay()); // domingo
  return x;
}
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const evStart = (e: PlimEvent) => new Date(e.startsAt);
const evEnd = (e: PlimEvent) =>
  e.endsAt ? new Date(e.endsAt) : new Date(new Date(e.startsAt).getTime() + 60 * 60000);

function eventsOfDay(events: PlimEvent[], day: Date): PlimEvent[] {
  return events.filter((e) => sameDay(evStart(e), day));
}

interface Positioned {
  ev: PlimEvent;
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
}
/** Posiciona os eventos com horário de um dia, tratando sobreposição em colunas. */
function layoutDay(dayEvents: PlimEvent[]): Positioned[] {
  const timed = dayEvents
    .filter((e) => !e.allDay)
    .sort((a, b) => evStart(a).getTime() - evStart(b).getTime());
  const out: Positioned[] = [];
  const startMs = (e: PlimEvent) => evStart(e).getTime();
  const endMs = (e: PlimEvent) => evEnd(e).getTime();
  let i = 0;
  while (i < timed.length) {
    const cluster = [timed[i]!];
    let clusterEnd = endMs(timed[i]!);
    let j = i + 1;
    while (j < timed.length && startMs(timed[j]!) < clusterEnd) {
      cluster.push(timed[j]!);
      clusterEnd = Math.max(clusterEnd, endMs(timed[j]!));
      j++;
    }
    const laneEnds: number[] = [];
    const laneOf = new Map<PlimEvent, number>();
    for (const ev of cluster) {
      let placed = -1;
      for (let l = 0; l < laneEnds.length; l++) {
        if (startMs(ev) >= laneEnds[l]!) {
          placed = l;
          break;
        }
      }
      if (placed === -1) {
        placed = laneEnds.length;
        laneEnds.push(0);
      }
      laneEnds[placed] = endMs(ev);
      laneOf.set(ev, placed);
    }
    const lanes = laneEnds.length;
    for (const ev of cluster) {
      const s = evStart(ev);
      const e = evEnd(ev);
      const startMin = s.getHours() * 60 + s.getMinutes();
      let endMin = e.getHours() * 60 + e.getMinutes();
      if (endMin <= startMin) endMin = startMin + 60; // fim no dia seguinte / sem fim
      const lane = laneOf.get(ev)!;
      out.push({
        ev,
        top: (startMin / 60) * HOUR_H,
        height: Math.max(24, ((endMin - startMin) / 60) * HOUR_H),
        leftPct: (lane / lanes) * 100,
        widthPct: (1 / lanes) * 100,
      });
    }
    i = j;
  }
  return out;
}

interface CreateSeed {
  date: string;
  time: string;
  allDay: boolean;
}

/**
 * Agenda da empresa: calendário com visões Dia, Semana e Mês. Fase 1 (só Plim).
 * A ponte com o Google Calendar entra em fase posterior (opt-in, Plim → Google).
 */
export function AgendaPage() {
  const { company } = useActiveCompany();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [view, setView] = useState<ViewMode>('week');
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PlimEvent | null>(null);
  const [seed, setSeed] = useState<CreateSeed | null>(null);
  const [confirming, setConfirming] = useState<PlimEvent | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState('');
  const [conn, setConn] = useState<CalendarConnectionState | null>(null);

  const load = useCallback(async () => {
    try {
      const [events, members] = await Promise.all([
        eventApi.list(company.id),
        companyApi.listMembers(company.id),
      ]);
      setState({ status: 'ready', events, members });
    } catch (err) {
      setState({ status: 'error', message: messageForError(err) });
    }
  }, [company.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Estado da conexão com o Google Calendar (do usuário atual).
  useEffect(() => {
    let active = true;
    calendarApi
      .getConnection()
      .then((c) => active && setConn(c))
      .catch(() => active && setConn({ available: false }));
    return () => {
      active = false;
    };
  }, []);

  // Volta do consentimento do Google (?google=connected|error): dá o retorno e
  // limpa o parâmetro da URL para não repetir a mensagem ao recarregar.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('google');
    if (!result) return;
    if (result === 'connected') {
      setNotice('Google Calendar conectado com sucesso.');
      calendarApi.getConnection().then(setConn).catch(() => undefined);
    } else {
      setNotice('Não foi possível conectar o Google Calendar. Tente novamente.');
    }
    params.delete('google');
    const qs = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
  }, []);

  function openNew(s?: CreateSeed) {
    setEditing(null);
    setSeed(s ?? { date: ymd(anchor), time: '09:00', allDay: false });
    setFormOpen(true);
  }
  function openEdit(ev: PlimEvent) {
    setEditing(ev);
    setSeed(null);
    setFormOpen(true);
  }
  async function confirmDelete() {
    if (!confirming) return;
    setDeleting(true);
    try {
      await eventApi.remove(company.id, confirming.id);
      setNotice(`"${confirming.title}" foi removido da agenda.`);
      setConfirming(null);
      await load();
    } catch (err) {
      setNotice(messageForError(err));
    } finally {
      setDeleting(false);
    }
  }

  function go(dir: -1 | 1) {
    setAnchor((a) => (view === 'month' ? addMonths(a, dir) : addDays(a, dir * (view === 'week' ? 7 : 1))));
  }
  function goToday() {
    setAnchor(new Date());
  }
  function openDayView(day: Date) {
    setAnchor(day);
    setView('day');
  }

  const periodLabel = useMemo(() => {
    if (view === 'month') return cap(`${MONTHS[anchor.getMonth()]} de ${anchor.getFullYear()}`);
    if (view === 'day')
      return cap(`${WEEKDAYS[anchor.getDay()]}, ${anchor.getDate()} de ${MONTHS[anchor.getMonth()]}`);
    const s = startOfWeek(anchor);
    const e = addDays(s, 6);
    if (s.getMonth() === e.getMonth())
      return cap(`${s.getDate()} a ${e.getDate()} de ${MONTHS[s.getMonth()]}`);
    return `${s.getDate()} ${MONTHS[s.getMonth()]!.slice(0, 3)} – ${e.getDate()} ${MONTHS[e.getMonth()]!.slice(0, 3)}`;
  }, [view, anchor]);

  if (state.status === 'loading') return <p className="dash-muted">carregando agenda…</p>;
  if (state.status === 'error') return <p className="dash-muted">{state.message}</p>;

  const events = state.events;

  return (
    <div className="dash agenda">
      <div className="agenda-head">
        <div>
          <h1 className="dash-page__title">Agenda</h1>
          <p className="dash-page__subtitle">
            Reuniões, prazos e lembretes da empresa em um só lugar. Cada sócio pode conectar o Google
            Calendar e receber, na agenda pessoal, os compromissos criados aqui.
          </p>
        </div>
        <Button onClick={() => openNew()}>Novo compromisso</Button>
      </div>

      {notice && <div className="agenda-notice">{notice}</div>}

      <GoogleCalendarCard state={conn} onChanged={setConn} onNotice={setNotice} />

      <div className="agenda-toolbar">
        <div className="agenda-nav">
          <button className="agenda-navbtn" aria-label="Anterior" onClick={() => go(-1)}>‹</button>
          <button className="agenda-today" onClick={goToday}>Hoje</button>
          <button className="agenda-navbtn" aria-label="Próximo" onClick={() => go(1)}>›</button>
          <span className="agenda-period">{periodLabel}</span>
        </div>
        <div className="agenda-seg agenda-seg--views">
          {(['day', 'week', 'month'] as ViewMode[]).map((v) => (
            <button
              key={v}
              className={'agenda-seg__opt' + (view === v ? ' is-active' : '')}
              onClick={() => setView(v)}
            >
              {v === 'day' ? 'Dia' : v === 'week' ? 'Semana' : 'Mês'}
            </button>
          ))}
        </div>
      </div>

      {view === 'month' && (
        <MonthView
          anchor={anchor}
          events={events}
          onDayClick={openDayView}
          onEventClick={openEdit}
          onCreate={(day) => openNew({ date: ymd(day), time: '09:00', allDay: false })}
        />
      )}
      {view !== 'month' && (
        <TimeGrid
          days={view === 'day' ? [anchor] : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i))}
          events={events}
          onEventClick={openEdit}
          onSlotClick={(day, time) => openNew({ date: ymd(day), time, allDay: false })}
        />
      )}

      <Modal
        open={formOpen}
        title={editing ? 'Editar compromisso' : 'Novo compromisso'}
        subtitle="Preencha o essencial. Você pode ajustar depois."
        onClose={() => setFormOpen(false)}
      >
        {formOpen && (
          <EventForm
            companyId={company.id}
            members={state.members}
            event={editing}
            seed={seed}
            syncAvailable={conn?.available === true}
            onClose={() => setFormOpen(false)}
            onDelete={editing ? () => { setFormOpen(false); setConfirming(editing); } : undefined}
            onSaved={(msg) => {
              setFormOpen(false);
              setNotice(msg);
              void load();
            }}
            save={async (payload) => {
              if (editing) return eventApi.update(company.id, editing.id, payload);
              return eventApi.create(company.id, payload as CreateEventInput);
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirming}
        title="Excluir compromisso?"
        message={
          confirming ? (
            <>
              &quot;{confirming.title}&quot; será removido da agenda. Essa ação não pode ser desfeita.
            </>
          ) : (
            ''
          )
        }
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}

// ── Card de conexão com o Google Calendar ───────────────────
const PRIVACY_TEXT =
  'O Plim não importa seus compromissos pessoais. Apenas envia para o Google Calendar os eventos criados dentro do Plim.';

function GoogleCalendarCard({
  state,
  onChanged,
  onNotice,
}: {
  state: CalendarConnectionState | null;
  onChanged: (s: CalendarConnectionState) => void;
  onNotice: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (state === null) return null; // carregando: nada de piscar
  // Integração ainda não configurada no servidor: card "em breve", sem botão.
  if (!state.available) {
    return (
      <div className="gcal-card gcal-card--soon">
        <IconGoogleCal />
        <div className="gcal-card__body">
          <span className="gcal-card__title">Google Calendar em breve</span>
          <span className="gcal-card__text">
            Logo você poderá conectar sua conta Google e receber os compromissos do Plim na sua agenda
            pessoal.
          </span>
        </div>
      </div>
    );
  }

  const c = state.connection;

  async function connect() {
    setBusy(true);
    setError('');
    try {
      await calendarApi.connect(); // redireciona para o consentimento do Google
    } catch (err) {
      setError(messageForError(err));
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError('');
    try {
      const updated = await calendarApi.disconnect();
      onChanged({ available: true, connection: updated });
      onNotice('Google Calendar desconectado. Novos eventos do Plim não serão enviados para sua agenda.');
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={'gcal-card' + (c.connected ? ' gcal-card--on' : '')}>
      <IconGoogleCal />
      <div className="gcal-card__body">
        <span className="gcal-card__title">
          {c.connected ? 'Google Calendar conectado' : 'Google Calendar não conectado'}
        </span>
        <span className="gcal-card__text">
          {c.connected
            ? 'Eventos do Plim podem aparecer na sua agenda Google.'
            : 'Conecte seu Google Calendar para receber os eventos do Plim na sua agenda pessoal.'}
          {c.connected && c.accountEmail ? ` (${c.accountEmail})` : ''}
        </span>
        <span className="gcal-card__privacy">{PRIVACY_TEXT}</span>
        {error && <span className="gcal-card__error">{error}</span>}
      </div>
      <div className="gcal-card__action">
        {c.connected ? (
          <button type="button" className="gcal-btn gcal-btn--ghost" onClick={disconnect} disabled={busy}>
            {busy ? 'Desconectando…' : 'Desconectar'}
          </button>
        ) : (
          <button type="button" className="gcal-btn" onClick={connect} disabled={busy}>
            {busy ? 'Abrindo…' : 'Conectar Google Calendar'}
          </button>
        )}
      </div>
    </div>
  );
}

function IconGoogleCal() {
  return (
    <svg className="gcal-card__icon" width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="17" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 9h18M8 2.5v3M16 2.5v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

// ── Visão de Mês ────────────────────────────────────────────
function MonthView({
  anchor,
  events,
  onDayClick,
  onEventClick,
  onCreate,
}: {
  anchor: Date;
  events: PlimEvent[];
  onDayClick: (day: Date) => void;
  onEventClick: (ev: PlimEvent) => void;
  onCreate: (day: Date) => void;
}) {
  const today = new Date();
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  return (
    <div className="mv">
      <div className="mv-weekdays">
        {WEEKDAYS_SHORT.map((w) => (
          <div key={w} className="mv-weekday">{w}</div>
        ))}
      </div>
      <div className="mv-grid">
        {cells.map((day) => {
          const inMonth = day.getMonth() === anchor.getMonth();
          const dayEvents = eventsOfDay(events, day).sort(
            (a, b) => evStart(a).getTime() - evStart(b).getTime(),
          );
          const shown = dayEvents.slice(0, 3);
          const extra = dayEvents.length - shown.length;
          return (
            <div
              key={ymd(day)}
              className={'mv-cell' + (inMonth ? '' : ' is-out')}
              onClick={() => onCreate(day)}
            >
              <button
                className={'mv-daynum' + (sameDay(day, today) ? ' is-today' : '')}
                onClick={(e) => { e.stopPropagation(); onDayClick(day); }}
              >
                {day.getDate()}
              </button>
              <div className="mv-events">
                {shown.map((ev) => (
                  <button
                    key={ev.id}
                    className={`mv-chip mv-chip--${ev.kind}`}
                    onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                    title={ev.title}
                  >
                    {!ev.allDay && <span className="mv-chip__time">{hhmm(evStart(ev))}</span>}
                    <span className="mv-chip__title">{ev.title}</span>
                  </button>
                ))}
                {extra > 0 && (
                  <button
                    className="mv-more"
                    onClick={(e) => { e.stopPropagation(); onDayClick(day); }}
                  >
                    +{extra} mais
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Visão de Dia / Semana (grade de horas) ──────────────────
function TimeGrid({
  days,
  events,
  onEventClick,
  onSlotClick,
}: {
  days: Date[];
  events: PlimEvent[];
  onEventClick: (ev: PlimEvent) => void;
  onSlotClick: (day: Date, time: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = new Date();
  const hours = Array.from({ length: 24 }, (_, h) => h);

  // Ao abrir/trocar de visão, rola para as 7h (início típico do dia).
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_H;
  }, [days.length, days[0]?.getTime()]);

  const anyAllDay = days.some((d) => eventsOfDay(events, d).some((e) => e.allDay));

  function handleColumnClick(day: Date, e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const totalMin = Math.max(0, Math.min(23 * 60 + 30, (y / HOUR_H) * 60));
    const rounded = Math.round(totalMin / 30) * 30;
    onSlotClick(day, `${pad(Math.floor(rounded / 60))}:${pad(rounded % 60)}`);
  }

  return (
    <div className={'tg' + (days.length === 1 ? ' tg--day' : ' tg--week')}>
      {/* Cabeçalho dos dias */}
      <div className="tg-header">
        <div className="tg-corner" />
        {days.map((day) => (
          <div key={ymd(day)} className={'tg-daycol' + (sameDay(day, today) ? ' is-today' : '')}>
            <span className="tg-dow">{WEEKDAYS_SHORT[day.getDay()]}</span>
            <span className="tg-dnum">{day.getDate()}</span>
          </div>
        ))}
      </div>

      {/* Faixa de dia inteiro */}
      {anyAllDay && (
        <div className="tg-allday">
          <div className="tg-allday__label">dia inteiro</div>
          {days.map((day) => (
            <div key={ymd(day)} className="tg-allday__col">
              {eventsOfDay(events, day)
                .filter((e) => e.allDay)
                .map((ev) => (
                  <button
                    key={ev.id}
                    className={`tg-adchip tg-adchip--${ev.kind}`}
                    onClick={() => onEventClick(ev)}
                  >
                    {ev.title}
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}

      {/* Grade de horas */}
      <div className="tg-scroll" ref={scrollRef}>
        <div className="tg-body" style={{ height: 24 * HOUR_H }}>
          <div className="tg-hours">
            {hours.map((h) => (
              <div key={h} className="tg-hour" style={{ height: HOUR_H }}>
                <span>{h === 0 ? '' : `${pad(h)}:00`}</span>
              </div>
            ))}
          </div>
          {days.map((day) => {
            const positioned = layoutDay(eventsOfDay(events, day));
            const nowTop =
              sameDay(day, today) ? ((today.getHours() * 60 + today.getMinutes()) / 60) * HOUR_H : null;
            return (
              <div
                key={ymd(day)}
                className="tg-col"
                onClick={(e) => handleColumnClick(day, e)}
              >
                {hours.map((h) => (
                  <div key={h} className="tg-slot" style={{ height: HOUR_H }} />
                ))}
                {nowTop != null && <div className="tg-now" style={{ top: nowTop }} />}
                {positioned.map(({ ev, top, height, leftPct, widthPct }) => (
                  <button
                    key={ev.id}
                    className={`tg-event tg-event--${ev.kind}`}
                    style={{ top, height, left: `${leftPct}%`, width: `calc(${widthPct}% - 4px)` }}
                    onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                  >
                    <span className="tg-event__time">{hhmm(evStart(ev))}</span>
                    <span className="tg-event__title">{ev.title}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Formulário (criar/editar) ───────────────────────────────
function localParts(iso: string): { date: string; time: string } {
  const dt = new Date(iso);
  return { date: ymd(dt), time: hhmm(dt) };
}
function toIso(dateISO: string, timeHHMM: string): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const [hh, mm] = timeHHMM.split(':').map(Number);
  return new Date(y!, m! - 1, d!, hh ?? 0, mm ?? 0, 0, 0).toISOString();
}
function toIsoAllDay(dateISO: string): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(y!, m! - 1, d!, 0, 0, 0, 0).toISOString();
}
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const t = `${pad(Math.floor(i / 2))}:${i % 2 === 0 ? '00' : '30'}`;
  return { value: t, label: t };
});
const REMINDER_OPTIONS = [
  { value: '', label: 'Sem lembrete' },
  { value: '10', label: '10 minutos antes' },
  { value: '30', label: '30 minutos antes' },
  { value: '60', label: '1 hora antes' },
  { value: '1440', label: '1 dia antes' },
];

function EventForm({
  companyId,
  members,
  event,
  seed,
  syncAvailable,
  onClose,
  onDelete,
  onSaved,
  save,
}: {
  companyId: string;
  members: CompanyMember[];
  event: PlimEvent | null;
  seed: CreateSeed | null;
  /** A integração com o Google está ligada? Controla o checkbox de sync. */
  syncAvailable: boolean;
  onClose: () => void;
  onDelete?: () => void;
  onSaved: (msg: string) => void;
  save: (payload: CreateEventInput | UpdateEventInput) => Promise<PlimEvent>;
}) {
  const start = event ? localParts(event.startsAt) : null;
  const end = event?.endsAt ? localParts(event.endsAt) : null;

  const [title, setTitle] = useState(event?.title ?? '');
  const [kind, setKind] = useState<EventKind>(event?.kind ?? 'reuniao');
  const [date, setDate] = useState(start?.date ?? seed?.date ?? ymd(new Date()));
  const [allDay, setAllDay] = useState(event?.allDay ?? seed?.allDay ?? false);
  const [startTime, setStartTime] = useState(start?.time ?? seed?.time ?? '09:00');
  const [hasEnd, setHasEnd] = useState(Boolean(end));
  const [endTime, setEndTime] = useState(end?.time ?? '10:00');
  const [location, setLocation] = useState(event?.location ?? '');
  const [participants, setParticipants] = useState<string[]>(event?.participantMemberIds ?? []);
  const [reminder, setReminder] = useState<string>(
    event?.reminderMinutes != null ? String(event.reminderMinutes) : '',
  );
  const [description, setDescription] = useState(event?.description ?? '');
  const [syncToGoogle, setSyncToGoogle] = useState(event?.syncToGoogle ?? false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function toggleParticipant(id: string) {
    setParticipants((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSubmit() {
    setError('');
    if (title.trim().length < 1) return setError('Dê um título ao compromisso.');
    if (!date) return setError('Escolha a data.');
    if (!allDay && hasEnd && endTime < startTime) {
      return setError('O horário de fim precisa ser depois do início.');
    }
    const payload: CreateEventInput = {
      title: title.trim(),
      kind,
      startsAt: allDay ? toIsoAllDay(date) : toIso(date, startTime),
      endsAt: allDay ? null : hasEnd ? toIso(date, endTime) : null,
      allDay,
      location: location.trim() || null,
      description: description.trim() || null,
      participantMemberIds: participants,
      reminderMinutes: reminder ? Number(reminder) : null,
      syncToGoogle,
    };
    setSaving(true);
    try {
      await save(payload);
      onSaved(event ? 'Compromisso atualizado.' : 'Compromisso criado.');
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="agenda-form">
      {error && <div className="form-error">{error}</div>}

      <Input label="Título" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />

      <div className="field">
        <span className="field__label">Tipo</span>
        <div className="agenda-seg">
          {eventKindCatalog.map((k) => (
            <button
              key={k.id}
              type="button"
              className={'agenda-seg__opt' + (kind === k.id ? ' is-active' : '')}
              onClick={() => setKind(k.id)}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="field__label">Data</label>
        <DateField value={date} onChange={setDate} />
      </div>

      <label className="agenda-check">
        <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
        <span>Dia inteiro</span>
      </label>

      {!allDay && (
        <div className="rc-grid">
          <Select label="Começa às" value={startTime} onChange={setStartTime} options={TIME_OPTIONS} />
          {hasEnd ? (
            <Select label="Termina às" value={endTime} onChange={setEndTime} options={TIME_OPTIONS} />
          ) : (
            <div className="field">
              <span className="field__label">Fim</span>
              <button type="button" className="agenda-linkbtn" onClick={() => setHasEnd(true)}>
                + Adicionar horário de fim
              </button>
            </div>
          )}
        </div>
      )}

      <Input
        label="Local ou link (opcional)"
        placeholder="Ex.: escritório, ou link da chamada"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
      />

      {members.length > 0 && (
        <div className="field">
          <span className="field__label">Participantes</span>
          <div className="agenda-people">
            {members.map((m) => (
              <label key={m.id} className="agenda-person">
                <input
                  type="checkbox"
                  checked={participants.includes(m.id)}
                  onChange={() => toggleParticipant(m.id)}
                />
                <span>{m.fullName}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      <Select label="Lembrete" value={reminder} onChange={setReminder} options={REMINDER_OPTIONS} />

      {syncAvailable && (
        <div className="agenda-sync">
          <label className="agenda-check">
            <input
              type="checkbox"
              checked={syncToGoogle}
              onChange={(e) => setSyncToGoogle(e.target.checked)}
            />
            <span>Sincronizar com Google Calendar dos participantes conectados</span>
          </label>
          <p className="agenda-sync__hint">
            Participantes que conectaram o Google Calendar receberão este compromisso na agenda
            pessoal. O Plim nunca lê a agenda deles.
          </p>
        </div>
      )}

      {event && syncAvailable && syncToGoogle && (
        <EventSyncStatus companyId={companyId} eventId={event.id} />
      )}

      <div className="field">
        <label className="field__label">Observação (opcional)</label>
        <textarea
          className="field__input agenda-textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={1000}
          rows={2}
        />
      </div>

      <div className="agenda-form__actions" style={{ marginTop: 4 }}>
        {onDelete && (
          <button type="button" className="agenda-linkbtn agenda-linkbtn--danger" onClick={onDelete}>
            Excluir
          </button>
        )}
        <div className="agenda-form__right">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Salvando…' : event ? 'Salvar' : 'Criar'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Status de sincronização por participante ────────────────
const syncStatusLabel = (s: EventSyncStatus): string =>
  eventSyncStatusCatalog.find((c) => c.id === s)?.label ?? s;

/** Cor do ponto de status: verde ok, vermelho falha, âmbar pendente, cinza o resto. */
function syncStatusTone(s: EventSyncStatus): 'ok' | 'fail' | 'wait' | 'off' {
  if (s === 'synced') return 'ok';
  if (s === 'failed') return 'fail';
  if (s === 'pending') return 'wait';
  return 'off';
}

function EventSyncStatus({ companyId, eventId }: { companyId: string; eventId: string }) {
  const [summary, setSummary] = useState<EventSyncSummary | null>(null);
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let active = true;
    calendarApi
      .getEventSync(companyId, eventId)
      .then((s) => active && setSummary(s))
      .catch((err) => active && setError(messageForError(err)));
    return () => {
      active = false;
    };
  }, [companyId, eventId]);

  async function retry() {
    setRetrying(true);
    setError('');
    try {
      setSummary(await calendarApi.resync(companyId, eventId));
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setRetrying(false);
    }
  }

  if (error) return <div className="agenda-syncstatus"><span className="gcal-card__error">{error}</span></div>;
  if (!summary) return <div className="agenda-syncstatus"><span className="dash-muted">carregando status…</span></div>;
  if (summary.participants.length === 0) {
    return (
      <div className="agenda-syncstatus">
        <span className="dash-muted">Adicione participantes para sincronizar com o Google.</span>
      </div>
    );
  }

  const anyFailed = summary.participants.some((p) => p.syncStatus === 'failed');

  return (
    <div className="agenda-syncstatus">
      <div className="agenda-syncstatus__head">
        <span className="field__label">Sincronização com o Google Calendar</span>
        {anyFailed && (
          <button type="button" className="gcal-btn gcal-btn--small" onClick={retry} disabled={retrying}>
            {retrying ? 'Tentando…' : 'Tentar novamente'}
          </button>
        )}
      </div>
      <ul className="agenda-syncstatus__list">
        {summary.participants.map((p) => (
          <li key={p.memberId} className="agenda-syncstatus__item">
            <span className={'agenda-syncdot agenda-syncdot--' + syncStatusTone(p.syncStatus)} />
            <span className="agenda-syncstatus__name">{p.memberName}</span>
            <span className="agenda-syncstatus__label">{syncStatusLabel(p.syncStatus)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
