import type { ChecklistPhase, ChecklistPriority, ChecklistStatus } from '@plim/shared';

/** Regras de auto-conclusao suportadas (mapeadas para sinais reais da empresa). */
export type ChecklistAutoRule =
  | 'has_name'
  | 'has_description'
  | 'equity_100'
  | 'has_partners'
  | 'has_movement'
  | 'has_recurring'
  | 'has_activities'
  | 'has_logo';

/** Modelo de item (catalogo do Plim). Vira item real por empresa na geracao. */
export interface ChecklistTemplate {
  key: string;
  title: string;
  description: string;
  phase: ChecklistPhase;
  priority: ChecklistPriority;
  actionLabel?: string;
  actionRoute?: string;
  recommendedPartnerCategory?: string;
  autoRule?: ChecklistAutoRule;
}

/** Item real do checklist de uma empresa (linha da tabela). */
export interface ChecklistItemRecord {
  id: string;
  companyId: string;
  templateKey: string | null;
  title: string;
  description: string | null;
  phase: ChecklistPhase;
  status: ChecklistStatus;
  priority: ChecklistPriority;
  actionLabel: string | null;
  actionRoute: string | null;
  recommendedPartnerCategory: string | null;
  isCustom: boolean;
  isSystemGenerated: boolean;
  note: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  createdAt: string;
}

/** Sinais reais da empresa usados pelas regras automaticas. */
export interface ChecklistSignals {
  name: string | null;
  isNameTemporary: boolean;
  description: string | null;
  logoUrl: string | null;
  equitySum: number;
  membersCount: number;
  expensesCount: number;
  activeRecurringCount: number;
  activitiesThisWeekCount: number;
}
