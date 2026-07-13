import { randomUUID } from 'node:crypto';
import type { ChecklistItemRecord } from '../../domain/checklist';
import type {
  ChecklistExtraSignals,
  ChecklistItemPatch,
  ChecklistRepository,
  NewChecklistItem,
} from '../checklist.repository';

export class InMemoryChecklistRepository implements ChecklistRepository {
  private items = new Map<string, ChecklistItemRecord>();
  private signals = new Map<string, ChecklistExtraSignals>();

  /** Helper de teste/dev: define os sinais extras de uma empresa. */
  setSignals(companyId: string, signals: Partial<ChecklistExtraSignals>): void {
    this.signals.set(companyId, {
      logoUrl: null,
      expensesCount: 0,
      activeRecurringCount: 0,
      activitiesThisWeekCount: 0,
      ...signals,
    });
  }

  async listItems(companyId: string): Promise<ChecklistItemRecord[]> {
    return [...this.items.values()].filter((i) => i.companyId === companyId);
  }

  async insertItems(items: NewChecklistItem[]): Promise<ChecklistItemRecord[]> {
    const now = new Date().toISOString();
    return items.map((input) => {
      const record: ChecklistItemRecord = {
        id: randomUUID(),
        companyId: input.companyId,
        templateKey: input.templateKey,
        title: input.title,
        description: input.description,
        phase: input.phase,
        status: input.status,
        priority: input.priority,
        actionLabel: input.actionLabel,
        actionRoute: input.actionRoute,
        recommendedPartnerCategory: input.recommendedPartnerCategory,
        isCustom: input.isCustom,
        isSystemGenerated: input.isSystemGenerated,
        note: null,
        data: null,
        completedAt: null,
        skippedAt: null,
        createdAt: now,
      };
      this.items.set(record.id, record);
      return record;
    });
  }

  async findItemById(companyId: string, itemId: string): Promise<ChecklistItemRecord | null> {
    const item = this.items.get(itemId);
    return item && item.companyId === companyId ? item : null;
  }

  async updateItem(itemId: string, patch: ChecklistItemPatch): Promise<ChecklistItemRecord> {
    const item = this.items.get(itemId);
    if (!item) throw new Error('checklist item not found');
    if (patch.status !== undefined) item.status = patch.status;
    if (patch.completedAt !== undefined) item.completedAt = patch.completedAt;
    if (patch.skippedAt !== undefined) item.skippedAt = patch.skippedAt;
    if (patch.note !== undefined) item.note = patch.note;
    if (patch.data !== undefined) item.data = patch.data;
    return item;
  }

  async extraSignals(companyId: string): Promise<ChecklistExtraSignals> {
    return (
      this.signals.get(companyId) ?? {
        logoUrl: null,
        expensesCount: 0,
        activeRecurringCount: 0,
        activitiesThisWeekCount: 0,
      }
    );
  }
}
