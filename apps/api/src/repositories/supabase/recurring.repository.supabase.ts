import type { SupabaseClient } from '@supabase/supabase-js';
import type { RecurringCategory, RecurringFrequency, RecurringSplitMode } from '@plim/shared';
import type { RecurringCost, RecurringCostUpdate } from '../../domain/recurring';
import type { RecurringRepository } from '../recurring.repository';

interface Row {
  id: string;
  company_id: string;
  name: string;
  category: RecurringCategory;
  amount_cents: number;
  currency_code: string | null;
  frequency: RecurringFrequency;
  paid_by_member_id: string;
  split_mode: RecurringSplitMode | null;
  next_charge_on: string | null;
  note: string | null;
  active: boolean;
  created_at: string;
}

function toCost(row: Row): RecurringCost {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    category: row.category,
    amountCents: row.amount_cents,
    currencyCode: row.currency_code,
    frequency: row.frequency,
    paidByMemberId: row.paid_by_member_id,
    splitMode: row.split_mode ?? 'equity',
    nextChargeOn: row.next_charge_on,
    note: row.note,
    active: row.active,
    createdAt: new Date(row.created_at),
  };
}

function patchToRow(patch: RecurringCostUpdate): Record<string, unknown> {
  const map: Record<keyof RecurringCostUpdate, string> = {
    name: 'name',
    category: 'category',
    amountCents: 'amount_cents',
    frequency: 'frequency',
    paidByMemberId: 'paid_by_member_id',
    splitMode: 'split_mode',
    nextChargeOn: 'next_charge_on',
    note: 'note',
    active: 'active',
  };
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const column = map[key as keyof RecurringCostUpdate];
    if (column) row[column] = value;
  }
  return row;
}

export class SupabaseRecurringRepository implements RecurringRepository {
  constructor(private readonly db: SupabaseClient) {}

  async create(data: Omit<RecurringCost, 'id' | 'createdAt'>): Promise<RecurringCost> {
    const { data: row, error } = await this.db
      .from('recurring_costs')
      .insert({
        company_id: data.companyId,
        name: data.name,
        category: data.category,
        amount_cents: data.amountCents,
        currency_code: data.currencyCode,
        frequency: data.frequency,
        paid_by_member_id: data.paidByMemberId,
        split_mode: data.splitMode,
        next_charge_on: data.nextChargeOn,
        note: data.note,
        active: data.active,
      })
      .select()
      .single<Row>();
    if (error || !row) throw new Error(`Falha ao criar custo recorrente: ${error?.message}`);
    return toCost(row);
  }

  async list(companyId: string): Promise<RecurringCost[]> {
    const { data: rows, error } = await this.db
      .from('recurring_costs')
      .select()
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .returns<Row[]>();
    if (error) throw new Error(`Falha ao listar custos recorrentes: ${error.message}`);
    return (rows ?? []).map(toCost);
  }

  async findById(companyId: string, costId: string): Promise<RecurringCost | null> {
    const { data: row, error } = await this.db
      .from('recurring_costs')
      .select()
      .eq('company_id', companyId)
      .eq('id', costId)
      .maybeSingle<Row>();
    if (error) throw new Error(`Falha ao buscar custo recorrente: ${error.message}`);
    return row ? toCost(row) : null;
  }

  async update(costId: string, patch: RecurringCostUpdate): Promise<RecurringCost> {
    const { data: row, error } = await this.db
      .from('recurring_costs')
      .update(patchToRow(patch))
      .eq('id', costId)
      .select()
      .single<Row>();
    if (error || !row) throw new Error(`Falha ao atualizar custo recorrente: ${error?.message}`);
    return toCost(row);
  }
}
