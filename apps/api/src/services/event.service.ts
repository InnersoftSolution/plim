import type {
  CreateEventInput,
  PlimEvent as EventDto,
  EventSyncSummary,
  UpdateEventInput,
} from '@plim/shared';
import type { PlimEvent } from '../domain/event';
import type { CompanyMember } from '../domain/company';
import type { EventRepository } from '../repositories/event.repository';
import type { CompanyService } from './company.service';
import type { CalendarSyncService } from './calendar-sync.service';
import { DomainError, NotFoundError } from '../lib/errors';

/** Logger mínimo para registrar falhas de sync sem derrubar a operação. */
export interface EventServiceLogger {
  error(obj: unknown, msg?: string): void;
}

function toDto(e: PlimEvent): EventDto {
  return {
    id: e.id,
    companyId: e.companyId,
    title: e.title,
    description: e.description,
    kind: e.kind,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt ? e.endsAt.toISOString() : null,
    allDay: e.allDay,
    location: e.location,
    participantMemberIds: e.participantMemberIds,
    reminderMinutes: e.reminderMinutes,
    createdByMemberId: e.createdByMemberId,
    syncToGoogle: e.syncToGoogle,
  };
}

/** Filtra os participantes informados para só sócios reais da empresa. */
function sanitizeParticipants(ids: string[] | undefined, members: CompanyMember[]): string[] {
  if (!ids || ids.length === 0) return [];
  const valid = new Set(members.map((m) => m.id));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (valid.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/**
 * Agenda de compromissos por empresa (reunião, prazo, lembrete). Criada dentro
 * do Plim; a ponte com o Google Calendar entra em fase posterior. Autorização
 * (ser membro) vem do CompanyService.getOverview.
 */
export class EventService {
  /**
   * syncService/logger são opcionais: sem a integração do Google configurada,
   * a agenda funciona igual, só não espelha nada para fora.
   */
  constructor(
    private readonly companyService: CompanyService,
    private readonly repo: EventRepository,
    private readonly syncService?: CalendarSyncService,
    private readonly logger?: EventServiceLogger,
  ) {}

  /** true quando a integração Google Calendar está ligada no servidor. */
  get syncAvailable(): boolean {
    return Boolean(this.syncService);
  }

  /** Roda uma etapa de sync sem nunca derrubar a operação do evento (RN11). */
  private async runSync(fn: () => Promise<void>): Promise<void> {
    if (!this.syncService) return;
    try {
      await fn();
    } catch (err) {
      this.logger?.error({ err }, 'plim-api: falha ao sincronizar com o Google Calendar');
    }
  }

  async list(companyId: string, actingUserId?: string | null): Promise<EventDto[]> {
    await this.companyService.getOverview(companyId, actingUserId);
    return (await this.repo.listByCompany(companyId)).map(toDto);
  }

  async create(
    companyId: string,
    input: CreateEventInput,
    actingUserId?: string | null,
  ): Promise<EventDto> {
    const { members } = await this.companyService.getOverview(companyId, actingUserId);
    const participants = sanitizeParticipants(input.participantMemberIds, members);
    if ((input.participantMemberIds?.length ?? 0) > 0 && participants.length === 0) {
      throw new DomainError('INVALID_PARTICIPANTS', 'Escolha participantes que fazem parte da empresa.');
    }
    const creator = actingUserId ? members.find((m) => m.userId === actingUserId) : null;
    const event = await this.repo.create({
      companyId,
      title: input.title,
      description: input.description ?? null,
      kind: input.kind,
      startsAt: new Date(input.startsAt),
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      allDay: input.allDay,
      location: input.location ?? null,
      participantMemberIds: participants,
      reminderMinutes: input.reminderMinutes ?? null,
      createdByMemberId: creator?.id ?? null,
      syncToGoogle: input.syncToGoogle ?? false,
    });
    // Espelha no Google Calendar dos participantes conectados (best-effort).
    await this.runSync(() => this.syncService!.syncEvent(event, members));
    return toDto(event);
  }

  async update(
    companyId: string,
    eventId: string,
    input: UpdateEventInput,
    actingUserId?: string | null,
  ): Promise<EventDto> {
    const { members } = await this.companyService.getOverview(companyId, actingUserId);
    const existing = await this.repo.findById(companyId, eventId);
    if (!existing) throw new NotFoundError('EVENT_NOT_FOUND', 'Compromisso não encontrado.');

    // Um fim novo tem que ser depois do início efetivo (novo ou o atual).
    const startsAt = input.startsAt ? new Date(input.startsAt) : existing.startsAt;
    if (input.endsAt && new Date(input.endsAt) < startsAt) {
      throw new DomainError('INVALID_RANGE', 'O fim precisa ser depois do início.');
    }

    const updated = await this.repo.update(eventId, {
      title: input.title,
      description: input.description,
      kind: input.kind,
      startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
      endsAt: input.endsAt === undefined ? undefined : input.endsAt ? new Date(input.endsAt) : null,
      allDay: input.allDay,
      location: input.location,
      participantMemberIds:
        input.participantMemberIds === undefined
          ? undefined
          : sanitizeParticipants(input.participantMemberIds, members),
      reminderMinutes: input.reminderMinutes,
      syncToGoogle: input.syncToGoogle,
    });
    // Atualiza os eventos externos já sincronizados; cria/remove conforme
    // participantes entraram ou saíram.
    await this.runSync(() => this.syncService!.syncEvent(updated, members));
    return toDto(updated);
  }

  async remove(companyId: string, eventId: string, actingUserId?: string | null): Promise<void> {
    await this.companyService.getOverview(companyId, actingUserId);
    const existing = await this.repo.findById(companyId, eventId);
    if (!existing) throw new NotFoundError('EVENT_NOT_FOUND', 'Compromisso não encontrado.');
    // Tenta remover do Google Calendar ANTES de apagar (as linhas de sync somem
    // por cascade junto com o evento).
    await this.runSync(() => this.syncService!.cancelEvent(eventId));
    await this.repo.delete(eventId);
  }

  /** Status de sincronização por participante (detalhe do compromisso). */
  async getSyncSummary(
    companyId: string,
    eventId: string,
    actingUserId?: string | null,
  ): Promise<EventSyncSummary> {
    const { members } = await this.companyService.getOverview(companyId, actingUserId);
    const event = await this.repo.findById(companyId, eventId);
    if (!event) throw new NotFoundError('EVENT_NOT_FOUND', 'Compromisso não encontrado.');
    if (!this.syncService) {
      return { eventId, syncToGoogle: event.syncToGoogle, available: false, participants: [] };
    }
    return this.syncService.getSummary(event, members);
  }

  /** Tenta sincronizar de novo (após uma falha) e devolve o status atualizado. */
  async resync(
    companyId: string,
    eventId: string,
    actingUserId?: string | null,
  ): Promise<EventSyncSummary> {
    const { members } = await this.companyService.getOverview(companyId, actingUserId);
    const event = await this.repo.findById(companyId, eventId);
    if (!event) throw new NotFoundError('EVENT_NOT_FOUND', 'Compromisso não encontrado.');
    if (!this.syncService) {
      throw new DomainError('CALENDAR_NOT_CONFIGURED', 'A integração com o Google Calendar não está disponível.', 503);
    }
    await this.syncService.syncEvent(event, members);
    return this.syncService.getSummary(event, members);
  }
}
