import type { RecurringCost, RecurringCostUpdate } from '../domain/recurring';

/** Acesso a dados de custos recorrentes. Implementações: in-memory e Supabase. */
export interface RecurringRepository {
  create(data: Omit<RecurringCost, 'id' | 'createdAt'>): Promise<RecurringCost>;
  list(companyId: string): Promise<RecurringCost[]>;
  findById(companyId: string, costId: string): Promise<RecurringCost | null>;
  update(costId: string, patch: RecurringCostUpdate): Promise<RecurringCost>;
}
