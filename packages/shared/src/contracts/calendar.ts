import { z } from 'zod';

/**
 * Integração com o Google Calendar. A regra é sempre unidirecional:
 * Plim -> Google Calendar. O Plim envia os compromissos criados aqui para a
 * agenda pessoal de quem conectou a conta; nunca lê, importa ou exibe eventos
 * pessoais do Google. Só Google Calendar nesta versão (sem Outlook/Apple/iCal).
 */

/** Situação da conexão de um usuário com o Google Calendar. */
export const calendarConnectionStatusSchema = z.enum([
  'connected',
  'disconnected',
  'expired',
  'error',
]);
export type CalendarConnectionStatus = z.infer<typeof calendarConnectionStatusSchema>;

/** Estado da conexão do usuário atual (o que o frontend mostra no card). */
export const calendarConnectionSchema = z.object({
  provider: z.literal('google'),
  /** true = dá para enviar eventos do Plim para a agenda dele. */
  connected: z.boolean(),
  status: calendarConnectionStatusSchema,
  /** E-mail da conta Google conectada (só exibição). Nulo se nunca conectou. */
  accountEmail: z.string().nullable(),
  connectedAt: z.string().nullable(),
});
export type CalendarConnection = z.infer<typeof calendarConnectionSchema>;

/** Resposta de /calendar/google/connect: URL de consentimento do Google. */
export const calendarConnectUrlSchema = z.object({ url: z.string().url() });
export type CalendarConnectUrl = z.infer<typeof calendarConnectUrlSchema>;

/**
 * Status da sincronização de um evento para um participante.
 * - not_connected: o participante ainda não conectou o Google Calendar.
 * - pending: vai sincronizar (ainda não rodou).
 * - synced: evento criado/atualizado no Google Calendar dele.
 * - failed: tentou e não conseguiu (dá para "Tentar novamente").
 * - removed: o evento externo foi removido (participante saiu ou evento apagado).
 * - disabled: a sincronização com o Google está desligada para este evento.
 */
export const eventSyncStatusSchema = z.enum([
  'not_connected',
  'pending',
  'synced',
  'failed',
  'removed',
  'disabled',
]);
export type EventSyncStatus = z.infer<typeof eventSyncStatusSchema>;

export const eventSyncStatusCatalog = [
  { id: 'not_connected', label: 'Google Calendar não conectado' },
  { id: 'pending', label: 'Sincronização pendente' },
  { id: 'synced', label: 'Sincronizado' },
  { id: 'failed', label: 'Falha ao sincronizar' },
  { id: 'removed', label: 'Removido da agenda' },
  { id: 'disabled', label: 'Sincronização desativada' },
] as const;

/** Status por participante, já com o nome do sócio para exibir no detalhe. */
export const eventSyncParticipantSchema = z.object({
  memberId: z.string().uuid(),
  memberName: z.string(),
  syncStatus: eventSyncStatusSchema,
  syncError: z.string().nullable(),
  lastSyncAt: z.string().nullable(),
});
export type EventSyncParticipant = z.infer<typeof eventSyncParticipantSchema>;

/** Resumo de sincronização de um evento (usado no detalhe do compromisso). */
export const eventSyncSummarySchema = z.object({
  eventId: z.string().uuid(),
  /** O evento está marcado para ir ao Google Calendar? */
  syncToGoogle: z.boolean(),
  /** A integração está configurada/ligada no servidor? */
  available: z.boolean(),
  participants: z.array(eventSyncParticipantSchema),
});
export type EventSyncSummary = z.infer<typeof eventSyncSummarySchema>;
