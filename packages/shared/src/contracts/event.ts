import { z } from 'zod';

/** Tipo do compromisso: reunião, prazo ou lembrete. */
export const eventKindSchema = z.enum(['reuniao', 'prazo', 'lembrete']);
export type EventKind = z.infer<typeof eventKindSchema>;

export const eventKindCatalog = [
  { id: 'reuniao', label: 'Reunião' },
  { id: 'prazo', label: 'Prazo' },
  { id: 'lembrete', label: 'Lembrete' },
] as const;

/**
 * Compromisso da agenda da empresa. É criado dentro do Plim e, na Fase 3,
 * pode ir para o Google Calendar de cada participante que conectou a conta
 * (sempre unidirecional: Plim → Google, nunca o contrário).
 */
export const eventSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  kind: eventKindSchema,
  /** Início (ISO 8601 com timezone). Em "dia inteiro", vale a data. */
  startsAt: z.string(),
  /** Fim (opcional). Quando presente, é depois do início. */
  endsAt: z.string().nullable(),
  allDay: z.boolean(),
  /** Local ou link da reunião (texto livre). */
  location: z.string().nullable(),
  /** Sócios convidados. Na Fase 3, vira o evento na agenda de cada um. */
  participantMemberIds: z.array(z.string().uuid()),
  /** Lembrete X minutos antes (null = sem lembrete). */
  reminderMinutes: z.number().int().nonnegative().nullable(),
  createdByMemberId: z.string().uuid().nullable(),
  /**
   * Enviar este compromisso para o Google Calendar dos participantes que
   * conectaram a conta? Só isto liga a sincronização (Plim -> Google).
   */
  syncToGoogle: z.boolean(),
});
export type PlimEvent = z.infer<typeof eventSchema>;

const isoDateTime = z
  .string()
  .datetime({ offset: true })
  .or(z.string().datetime()); // aceita com ou sem offset explícito

export const createEventSchema = z
  .object({
    title: z.string().trim().min(1, 'Dê um título ao compromisso').max(140),
    description: z.string().trim().max(1000).nullable().optional(),
    kind: eventKindSchema.default('reuniao'),
    startsAt: isoDateTime,
    endsAt: isoDateTime.nullable().optional(),
    allDay: z.boolean().default(false),
    location: z.string().trim().max(300).nullable().optional(),
    participantMemberIds: z.array(z.string().uuid()).max(50).optional(),
    reminderMinutes: z.number().int().nonnegative().max(40320).nullable().optional(), // até 4 semanas
    syncToGoogle: z.boolean().optional(),
  })
  .refine((v) => !v.endsAt || new Date(v.endsAt) >= new Date(v.startsAt), {
    message: 'O fim precisa ser depois do início.',
    path: ['endsAt'],
  });
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSchema = z
  .object({
    title: z.string().trim().min(1).max(140).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    kind: eventKindSchema.optional(),
    startsAt: isoDateTime.optional(),
    endsAt: isoDateTime.nullable().optional(),
    allDay: z.boolean().optional(),
    location: z.string().trim().max(300).nullable().optional(),
    participantMemberIds: z.array(z.string().uuid()).max(50).optional(),
    reminderMinutes: z.number().int().nonnegative().max(40320).nullable().optional(),
    syncToGoogle: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nada para atualizar.' })
  .refine((v) => !v.startsAt || !v.endsAt || new Date(v.endsAt) >= new Date(v.startsAt), {
    message: 'O fim precisa ser depois do início.',
    path: ['endsAt'],
  });
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
