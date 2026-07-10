import type { ActivityArea, ActivityPriority, ActivityStatus } from '@plim/shared';

/** Item de checklist de uma atividade. */
export interface ChecklistItem {
  id: string;
  activityId: string;
  title: string;
  isCompleted: boolean;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Atividade/responsabilidade dos sócios (Kanban leve + plano da semana).
 * Não impacta cálculos financeiros (RP006). Sempre pertence a uma empresa (RP001).
 */
export interface Activity {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  /** Pode ser nulo (RP002) — gera pendência "sem responsável". */
  responsibleMemberId: string | null;
  area: ActivityArea;
  status: ActivityStatus;
  priority: ActivityPriority;
  /** Data de início (YYYY-MM-DD) ou nulo. */
  startDate: string | null;
  /** Prazo / data de fim (YYYY-MM-DD) ou nulo. */
  dueDate: string | null;
  /** Segunda-feira (YYYY-MM-DD) da semana da atividade. */
  weekStartDate: string;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
  blockedReason: string | null;
  checklist: ChecklistItem[];
}

export type ActivityUpdate = Partial<
  Pick<
    Activity,
    'title' | 'description' | 'responsibleMemberId' | 'area' | 'priority' | 'startDate' | 'dueDate' | 'weekStartDate'
  >
>;
