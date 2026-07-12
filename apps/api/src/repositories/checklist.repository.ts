import type { ChecklistPhase, ChecklistPriority, ChecklistStatus } from '@plim/shared';
import type { ChecklistItemRecord } from '../domain/checklist';

/** Sinais que so o checklist precisa buscar (o resto vem do CompanyService). */
export interface ChecklistExtraSignals {
  logoUrl: string | null;
  expensesCount: number;
  activeRecurringCount: number;
  activitiesThisWeekCount: number;
}

/** Item novo a inserir (geracao a partir do catalogo ou item personalizado). */
export interface NewChecklistItem {
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
}

export interface ChecklistRepository {
  listItems(companyId: string): Promise<ChecklistItemRecord[]>;
  insertItems(items: NewChecklistItem[]): Promise<ChecklistItemRecord[]>;
  findItemById(companyId: string, itemId: string): Promise<ChecklistItemRecord | null>;
  updateStatus(
    itemId: string,
    status: ChecklistStatus,
    completedAt: string | null,
    skippedAt: string | null,
  ): Promise<ChecklistItemRecord>;
  extraSignals(companyId: string): Promise<ChecklistExtraSignals>;
}
