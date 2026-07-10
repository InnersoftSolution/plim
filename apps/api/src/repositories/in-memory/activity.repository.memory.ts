import { randomUUID } from 'node:crypto';
import type { Activity, ActivityUpdate, ChecklistItem } from '../../domain/activity';
import type { ActivityRepository, StatusChange } from '../activity.repository';

export class InMemoryActivityRepository implements ActivityRepository {
  private activities = new Map<string, Activity>();

  async create(
    data: Omit<Activity, 'id' | 'createdAt' | 'updatedAt' | 'checklist'>,
    checklistTitles: string[],
  ): Promise<Activity> {
    const now = new Date();
    const id = randomUUID();
    const checklist: ChecklistItem[] = checklistTitles.map((title, i) => ({
      id: randomUUID(),
      activityId: id,
      title,
      isCompleted: false,
      position: i,
      createdAt: now,
      updatedAt: now,
    }));
    const activity: Activity = { ...data, id, checklist, createdAt: now, updatedAt: now };
    this.activities.set(id, activity);
    return activity;
  }

  async list(companyId: string): Promise<Activity[]> {
    return [...this.activities.values()]
      .filter((a) => a.companyId === companyId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findById(companyId: string, activityId: string): Promise<Activity | null> {
    const a = this.activities.get(activityId);
    return a && a.companyId === companyId ? a : null;
  }

  async update(activityId: string, patch: ActivityUpdate): Promise<Activity> {
    const a = this.mustGet(activityId);
    const updated: Activity = { ...a, ...patch, updatedAt: new Date() };
    this.activities.set(activityId, updated);
    return updated;
  }

  async changeStatus(activityId: string, change: StatusChange): Promise<Activity> {
    const a = this.mustGet(activityId);
    const updated: Activity = {
      ...a,
      status: change.status,
      blockedReason: change.blockedReason,
      completedAt: change.completedAt,
      cancelledAt: change.cancelledAt,
      updatedAt: new Date(),
    };
    this.activities.set(activityId, updated);
    return updated;
  }

  async addChecklistItem(activityId: string, title: string): Promise<ChecklistItem> {
    const a = this.mustGet(activityId);
    const now = new Date();
    const item: ChecklistItem = {
      id: randomUUID(),
      activityId,
      title,
      isCompleted: false,
      position: a.checklist.length,
      createdAt: now,
      updatedAt: now,
    };
    a.checklist.push(item);
    a.updatedAt = now;
    return item;
  }

  async setChecklistItemCompleted(itemId: string, isCompleted: boolean): Promise<ChecklistItem> {
    for (const a of this.activities.values()) {
      const item = a.checklist.find((c) => c.id === itemId);
      if (item) {
        item.isCompleted = isCompleted;
        item.updatedAt = new Date();
        return item;
      }
    }
    throw new Error(`Item de checklist ${itemId} não encontrado`);
  }

  async removeChecklistItem(itemId: string): Promise<void> {
    for (const a of this.activities.values()) {
      const idx = a.checklist.findIndex((c) => c.id === itemId);
      if (idx >= 0) {
        a.checklist.splice(idx, 1);
        return;
      }
    }
  }

  private mustGet(activityId: string): Activity {
    const a = this.activities.get(activityId);
    if (!a) throw new Error(`Atividade ${activityId} não encontrada`);
    return a;
  }
}
