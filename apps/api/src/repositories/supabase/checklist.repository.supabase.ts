import type { SupabaseClient } from '@supabase/supabase-js';
import { weekStartOf, type ChecklistPhase, type ChecklistPriority, type ChecklistStatus } from '@plim/shared';
import type { ChecklistItemRecord } from '../../domain/checklist';
import type {
  ChecklistExtraSignals,
  ChecklistItemPatch,
  ChecklistRepository,
  NewChecklistItem,
} from '../checklist.repository';

interface Row {
  id: string;
  company_id: string;
  template_key: string | null;
  title: string;
  description: string | null;
  phase: string;
  status: string;
  priority: string;
  action_label: string | null;
  action_route: string | null;
  recommended_partner_category: string | null;
  is_custom: boolean;
  is_system_generated: boolean;
  note: string | null;
  data: Record<string, string> | null;
  completed_at: string | null;
  skipped_at: string | null;
  created_at: string;
}

const COLS =
  'id, company_id, template_key, title, description, phase, status, priority, action_label, action_route, recommended_partner_category, is_custom, is_system_generated, note, data, completed_at, skipped_at, created_at';

function toRecord(row: Row): ChecklistItemRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    templateKey: row.template_key,
    title: row.title,
    description: row.description,
    phase: row.phase as ChecklistPhase,
    status: row.status as ChecklistStatus,
    priority: row.priority as ChecklistPriority,
    actionLabel: row.action_label,
    actionRoute: row.action_route,
    recommendedPartnerCategory: row.recommended_partner_category,
    isCustom: row.is_custom,
    isSystemGenerated: row.is_system_generated,
    note: row.note,
    data: row.data,
    completedAt: row.completed_at,
    skippedAt: row.skipped_at,
    createdAt: row.created_at,
  };
}

export class SupabaseChecklistRepository implements ChecklistRepository {
  constructor(private readonly db: SupabaseClient) {}

  async listItems(companyId: string): Promise<ChecklistItemRecord[]> {
    const { data, error } = await this.db
      .from('company_checklist_items')
      .select(COLS)
      .eq('company_id', companyId);
    if (error) throw new Error(`checklist list: ${error.message}`);
    return (data as Row[]).map(toRecord);
  }

  async insertItems(items: NewChecklistItem[]): Promise<ChecklistItemRecord[]> {
    if (items.length === 0) return [];
    const payload = items.map((i) => ({
      company_id: i.companyId,
      template_key: i.templateKey,
      title: i.title,
      description: i.description,
      phase: i.phase,
      status: i.status,
      priority: i.priority,
      action_label: i.actionLabel,
      action_route: i.actionRoute,
      recommended_partner_category: i.recommendedPartnerCategory,
      is_custom: i.isCustom,
      is_system_generated: i.isSystemGenerated,
    }));
    const { data, error } = await this.db.from('company_checklist_items').insert(payload).select(COLS);
    if (error) throw new Error(`checklist insert: ${error.message}`);
    return (data as Row[]).map(toRecord);
  }

  async findItemById(companyId: string, itemId: string): Promise<ChecklistItemRecord | null> {
    const { data, error } = await this.db
      .from('company_checklist_items')
      .select(COLS)
      .eq('company_id', companyId)
      .eq('id', itemId)
      .maybeSingle<Row>();
    if (error) throw new Error(`checklist find: ${error.message}`);
    return data ? toRecord(data) : null;
  }

  async updateItem(itemId: string, patch: ChecklistItemPatch): Promise<ChecklistItemRecord> {
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.status !== undefined) payload.status = patch.status;
    if (patch.completedAt !== undefined) payload.completed_at = patch.completedAt;
    if (patch.skippedAt !== undefined) payload.skipped_at = patch.skippedAt;
    if (patch.note !== undefined) payload.note = patch.note;
    if (patch.data !== undefined) payload.data = patch.data;
    const { data, error } = await this.db
      .from('company_checklist_items')
      .update(payload)
      .eq('id', itemId)
      .select(COLS)
      .single<Row>();
    if (error) throw new Error(`checklist update: ${error.message}`);
    return toRecord(data);
  }

  async extraSignals(companyId: string): Promise<ChecklistExtraSignals> {
    const week = weekStartOf(new Date().toISOString().slice(0, 10));
    const [companyRes, expensesRes, recurringRes, activitiesRes] = await Promise.all([
      this.db.from('companies').select('logo_url').eq('id', companyId).maybeSingle<{ logo_url: string | null }>(),
      this.db
        .from('expenses')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId),
      this.db
        .from('recurring_costs')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('active', true),
      this.db
        .from('activities')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('week_start_date', week),
    ]);
    if (companyRes.error) throw new Error(`checklist signals company: ${companyRes.error.message}`);
    if (expensesRes.error) throw new Error(`checklist signals expenses: ${expensesRes.error.message}`);
    if (recurringRes.error) throw new Error(`checklist signals recurring: ${recurringRes.error.message}`);
    if (activitiesRes.error) throw new Error(`checklist signals activities: ${activitiesRes.error.message}`);
    return {
      logoUrl: companyRes.data?.logo_url ?? null,
      expensesCount: expensesRes.count ?? 0,
      activeRecurringCount: recurringRes.count ?? 0,
      activitiesThisWeekCount: activitiesRes.count ?? 0,
    };
  }
}
