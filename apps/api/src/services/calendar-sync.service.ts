import type { EventSyncParticipant, EventSyncSummary } from '@plim/shared';
import type { PlimEvent } from '../domain/event';
import type { CompanyMember } from '../domain/company';
import type { EventCalendarSync } from '../domain/calendar';
import type { CalendarRepository } from '../repositories/calendar.repository';
import type { CalendarService } from './calendar.service';
import { GoogleCalendarClient } from '../lib/google-calendar';

/**
 * Motor da sincronização Plim -> Google Calendar. Best-effort e não-fatal: o
 * evento já existe no Plim; aqui só espelhamos para a agenda pessoal de cada
 * participante conectado. Qualquer falha vira status 'failed' (com "Tentar
 * novamente"), nunca derruba a operação do evento.
 *
 * Unidirecional por construção: só criamos/editamos/removemos eventos que o
 * Plim gerou. Nunca lemos a agenda do usuário.
 */
export class CalendarSyncService {
  constructor(
    private readonly repo: CalendarRepository,
    private readonly calendar: CalendarService,
  ) {}

  /**
   * Reconcilia o evento com o Google Calendar de cada participante atual e
   * limpa quem saiu. Chamado após criar/editar o evento no Plim.
   */
  async syncEvent(event: PlimEvent, members: CompanyMember[]): Promise<void> {
    const existing = await this.repo.listSyncByEvent(event.id);
    const byMember = new Map(existing.map((r) => [r.memberId, r]));
    const current = new Set(event.participantMemberIds);

    // Participantes atuais: cria/atualiza no Google conforme o caso.
    for (const memberId of event.participantMemberIds) {
      const member = members.find((m) => m.id === memberId) ?? null;
      await this.syncOne(event, memberId, member, byMember.get(memberId) ?? null);
    }

    // Quem saiu do evento: remove o evento externo dele e apaga a linha.
    for (const row of existing) {
      if (current.has(row.memberId)) continue;
      await this.removeExternal(row);
      await this.repo.deleteSync(row.id);
    }
  }

  /**
   * Evento cancelado no Plim: tenta remover o evento externo de cada
   * participante sincronizado. As linhas somem por cascade ao apagar o evento.
   */
  async cancelEvent(eventId: string): Promise<void> {
    const rows = await this.repo.listSyncByEvent(eventId);
    for (const row of rows) {
      await this.removeExternal(row);
    }
  }

  /** Monta o status por participante para o detalhe do compromisso. */
  async getSummary(event: PlimEvent, members: CompanyMember[]): Promise<EventSyncSummary> {
    const rows = await this.repo.listSyncByEvent(event.id);
    const byMember = new Map(rows.map((r) => [r.memberId, r]));
    const participants: EventSyncParticipant[] = event.participantMemberIds.map((memberId) => {
      const member = members.find((m) => m.id === memberId);
      const row = byMember.get(memberId);
      return {
        memberId,
        memberName: member?.fullName ?? 'Participante',
        syncStatus: row?.syncStatus ?? (event.syncToGoogle ? 'pending' : 'disabled'),
        syncError: row?.syncError ?? null,
        lastSyncAt: row?.lastSyncAt ? row.lastSyncAt.toISOString() : null,
      };
    });
    return { eventId: event.id, syncToGoogle: event.syncToGoogle, available: true, participants };
  }

  // ── internos ──────────────────────────────────────────────

  private async syncOne(
    event: PlimEvent,
    memberId: string,
    member: CompanyMember | null,
    row: EventCalendarSync | null,
  ): Promise<void> {
    const userId = member?.userId ?? null;

    // Sincronização desligada para este evento: desativa e limpa o externo.
    if (!event.syncToGoogle) {
      if (row?.externalEventId && userId) await this.removeExternal(row);
      await this.persist(event, memberId, row, {
        userId,
        syncStatus: 'disabled',
        externalEventId: null,
      });
      return;
    }

    // Participante ainda não vinculado a um usuário: nada a enviar.
    if (!userId) {
      await this.persist(event, memberId, row, { userId: null, syncStatus: 'not_connected' });
      return;
    }

    const token = await this.calendar.getValidAccessToken(userId);
    if (!token) {
      // Sem conexão ativa (nunca conectou, expirou ou desconectou).
      await this.persist(event, memberId, row, { userId, syncStatus: 'not_connected' });
      return;
    }

    const client = new GoogleCalendarClient(token);
    try {
      const externalEventId = row?.externalEventId
        ? (await client.updateEvent(row.externalEventId, event), row.externalEventId)
        : await client.createEvent(event);
      await this.persist(event, memberId, row, {
        userId,
        syncStatus: 'synced',
        externalEventId,
        lastSyncAt: new Date(),
        syncError: null,
      });
    } catch (err) {
      await this.persist(event, memberId, row, {
        userId,
        syncStatus: 'failed',
        syncError: err instanceof Error ? err.message : 'Falha ao sincronizar.',
      });
    }
  }

  /** Remove o evento no Google Calendar do participante (melhor esforço). */
  private async removeExternal(row: EventCalendarSync): Promise<void> {
    if (!row.externalEventId || !row.userId) return;
    try {
      const token = await this.calendar.getValidAccessToken(row.userId);
      if (!token) return;
      await new GoogleCalendarClient(token).deleteEvent(row.externalEventId);
    } catch {
      /* melhor esforço: se não deu para remover no Google, seguimos */
    }
  }

  /** Cria ou atualiza a linha de sincronização do participante. */
  private async persist(
    event: PlimEvent,
    memberId: string,
    row: EventCalendarSync | null,
    patch: {
      userId?: string | null;
      syncStatus: EventCalendarSync['syncStatus'];
      externalEventId?: string | null;
      lastSyncAt?: Date | null;
      syncError?: string | null;
    },
  ): Promise<void> {
    if (row) {
      await this.repo.updateSync(row.id, patch);
      return;
    }
    await this.repo.createSync({
      eventId: event.id,
      companyId: event.companyId,
      memberId,
      userId: patch.userId ?? null,
      syncStatus: patch.syncStatus,
      externalCalendarProvider: 'google',
      externalEventId: patch.externalEventId ?? null,
      lastSyncAt: patch.lastSyncAt ?? null,
      syncError: patch.syncError ?? null,
    });
  }
}
