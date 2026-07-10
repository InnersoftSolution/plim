import { z } from 'zod';

/**
 * Módulo Atividades — organiza o que cada sócio precisa fazer (Kanban leve +
 * plano da semana). Determinístico (R$0 de IA). NÃO impacta cálculos
 * financeiros (RP006). Toda atividade pertence a uma empresa (RP001).
 */

/* ── área da empresa que a atividade impacta ── */
export const activityAreaSchema = z.enum([
  'produto',
  'design',
  'tecnologia',
  'financeiro',
  'juridico',
  'marketing',
  'vendas',
  'operacao',
  'documentos',
  'outros',
]);
export type ActivityArea = z.infer<typeof activityAreaSchema>;

export const activityAreaCatalog = [
  { id: 'produto', label: 'Produto' },
  { id: 'design', label: 'Design' },
  { id: 'tecnologia', label: 'Tecnologia' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'juridico', label: 'Jurídico / Formalização' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'vendas', label: 'Vendas' },
  { id: 'operacao', label: 'Operação' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'outros', label: 'Outros' },
] as const;

/* ── prioridade ── */
export const activityPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);
export type ActivityPriority = z.infer<typeof activityPrioritySchema>;

export const activityPriorityCatalog = [
  { id: 'low', label: 'Baixa' },
  { id: 'medium', label: 'Média' },
  { id: 'high', label: 'Alta' },
  { id: 'urgent', label: 'Urgente' },
] as const;

/* ── status (colunas do Kanban) ── */
export const activityStatusSchema = z.enum(['todo', 'in_progress', 'blocked', 'done', 'cancelled']);
export type ActivityStatus = z.infer<typeof activityStatusSchema>;

export const activityStatusCatalog = [
  { id: 'todo', label: 'A fazer' },
  { id: 'in_progress', label: 'Em andamento' },
  { id: 'blocked', label: 'Bloqueado' },
  { id: 'done', label: 'Concluído' },
  { id: 'cancelled', label: 'Cancelado' },
] as const;

/* ── checklist interno ── */
export const checklistItemSchema = z.object({
  id: z.string().uuid(),
  activityId: z.string().uuid(),
  title: z.string(),
  isCompleted: z.boolean(),
  position: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

/** Item de checklist enviado ao criar/editar (só o título; back gera id/ordem). */
export const checklistItemInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
});
export type ChecklistItemInput = z.infer<typeof checklistItemInputSchema>;

/* ── criação ── */
export const createActivitySchema = z.object({
  title: z.string().trim().min(1, 'Dê um título à atividade').max(160),
  description: z.string().trim().max(1000).nullable().optional(),
  /** Pode ser nulo — gera pendência "sem responsável" (RP002). */
  responsibleMemberId: z.string().uuid().nullable().optional(),
  area: activityAreaSchema.default('outros'),
  priority: activityPrioritySchema.default('medium'),
  /** Data de início (YYYY-MM-DD). Opcional. */
  startDate: z.string().date().nullable().optional(),
  /** Prazo / data de fim (YYYY-MM-DD). Opcional; sem prazo gera pendência leve. */
  dueDate: z.string().date().nullable().optional(),
  status: activityStatusSchema.default('todo'),
  /** Itens de checklist iniciais (opcional). */
  checklist: z.array(checklistItemInputSchema).max(30).optional(),
});
/** Tipo de ENTRADA: campos com default (status/area/priority) são opcionais. */
export type CreateActivityInput = z.input<typeof createActivitySchema>;

/* ── edição (campos parciais) ── */
export const updateActivitySchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  responsibleMemberId: z.string().uuid().nullable().optional(),
  area: activityAreaSchema.optional(),
  priority: activityPrioritySchema.optional(),
  startDate: z.string().date().nullable().optional(),
  dueDate: z.string().date().nullable().optional(),
});
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;

/* ── mudança de status ── */
export const changeActivityStatusSchema = z.object({
  status: activityStatusSchema,
  /** Motivo do bloqueio (opcional) — só faz sentido quando status = 'blocked'. */
  blockedReason: z.string().trim().max(300).nullable().optional(),
});
export type ChangeActivityStatusInput = z.infer<typeof changeActivityStatusSchema>;

/* ── atividade completa (resposta) ── */
export const activitySchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  responsibleMemberId: z.string().uuid().nullable(),
  area: activityAreaSchema,
  status: activityStatusSchema,
  priority: activityPrioritySchema,
  startDate: z.string().nullable(),
  dueDate: z.string().nullable(),
  /** Início da semana (segunda-feira, YYYY-MM-DD) a que a atividade pertence. */
  weekStartDate: z.string(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  blockedReason: z.string().nullable(),
  checklist: z.array(checklistItemSchema).default([]),
  /** Derivado no back: prazo vencido e status não concluído/cancelado (RP003). */
  isOverdue: z.boolean().default(false),
});
export type Activity = z.infer<typeof activitySchema>;

/** Segunda-feira (YYYY-MM-DD) da semana que contém `dateIso`. */
export function weekStartOf(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  const dow = dt.getUTCDay(); // 0=dom … 6=sáb
  const deltaToMonday = (dow + 6) % 7; // segunda = 0
  dt.setUTCDate(dt.getUTCDate() - deltaToMonday);
  return dt.toISOString().slice(0, 10);
}
