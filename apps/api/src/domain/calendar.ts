import type { CalendarConnectionStatus, EventSyncStatus } from '@plim/shared';

/**
 * Conexão de um usuário (auth) com o Google Calendar. Guarda os tokens já
 * CIFRADOS (nunca em texto claro fora do processo). A regra é unidirecional:
 * o Plim usa isto só para ENVIAR eventos, nunca para ler a agenda pessoal.
 */
export interface CalendarConnection {
  id: string;
  userId: string;
  provider: 'google';
  providerAccountEmail: string | null;
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  tokenExpiresAt: Date | null;
  scope: string | null;
  status: CalendarConnectionStatus;
  connectedAt: Date | null;
  disconnectedAt: Date | null;
}

/** Dados para criar/atualizar uma conexão (upsert por usuário/provider). */
export interface CalendarConnectionUpsert {
  userId: string;
  provider: 'google';
  providerAccountEmail: string | null;
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  tokenExpiresAt: Date | null;
  scope: string | null;
  status: CalendarConnectionStatus;
  connectedAt: Date | null;
  disconnectedAt: Date | null;
}

/** Estado da sincronização de um evento do Plim para um participante. */
export interface EventCalendarSync {
  id: string;
  eventId: string;
  companyId: string;
  memberId: string;
  userId: string | null;
  syncStatus: EventSyncStatus;
  externalCalendarProvider: 'google';
  externalEventId: string | null;
  lastSyncAt: Date | null;
  syncError: string | null;
}

/** Campos atualizáveis de uma linha de sincronização (só o que vier definido). */
export interface EventCalendarSyncPatch {
  userId?: string | null;
  syncStatus?: EventSyncStatus;
  externalEventId?: string | null;
  lastSyncAt?: Date | null;
  syncError?: string | null;
}
