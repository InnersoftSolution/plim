import type { ActivityStatus } from '@plim/shared';
import type { Activity, ActivityUpdate, ChecklistItem } from '../domain/activity';

/** Campos que a mudança de status pode gravar junto (timestamps/motivo). */
export interface StatusChange {
  status: ActivityStatus;
  blockedReason: string | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
}

/** Acesso a dados de Atividades. Implementações: in-memory (dev/testes) e Supabase. */
export interface ActivityRepository {
  create(data: Omit<Activity, 'id' | 'createdAt' | 'updatedAt' | 'checklist'>, checklistTitles: string[]): Promise<Activity>;
  list(companyId: string): Promise<Activity[]>;
  findById(companyId: string, activityId: string): Promise<Activity | null>;
  update(activityId: string, patch: ActivityUpdate): Promise<Activity>;
  changeStatus(activityId: string, change: StatusChange): Promise<Activity>;
  addChecklistItem(activityId: string, title: string): Promise<ChecklistItem>;
  setChecklistItemCompleted(itemId: string, isCompleted: boolean): Promise<ChecklistItem>;
  removeChecklistItem(itemId: string): Promise<void>;
}
