import { randomUUID } from 'node:crypto';
import type { RecurringCost, RecurringCostUpdate } from '../../domain/recurring';
import type { RecurringRepository } from '../recurring.repository';

export class InMemoryRecurringRepository implements RecurringRepository {
  private costs = new Map<string, RecurringCost>();

  async create(data: Omit<RecurringCost, 'id' | 'createdAt'>): Promise<RecurringCost> {
    const cost: RecurringCost = { ...data, id: randomUUID(), createdAt: new Date() };
    this.costs.set(cost.id, cost);
    return cost;
  }

  async list(companyId: string): Promise<RecurringCost[]> {
    return [...this.costs.values()]
      .filter((c) => c.companyId === companyId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findById(companyId: string, costId: string): Promise<RecurringCost | null> {
    const cost = this.costs.get(costId);
    return cost && cost.companyId === companyId ? cost : null;
  }

  async update(costId: string, patch: RecurringCostUpdate): Promise<RecurringCost> {
    const current = this.costs.get(costId);
    if (!current) throw new Error(`Custo ${costId} não encontrado`);
    const updated: RecurringCost = { ...current, ...patch };
    this.costs.set(costId, updated);
    return updated;
  }
}
