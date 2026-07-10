import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActivityArea, ActivityPriority, ActivityStatus } from '@plim/shared';
import type { Activity, ActivityUpdate, ChecklistItem } from '../../domain/activity';
import type { ActivityRepository, StatusChange } from '../activity.repository';

interface ChecklistRow {
  id: string;
  activity_id: string;
  title: string;
  is_completed: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

interface ActivityRow {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  responsible_member_id: string | null;
  area: ActivityArea;
  status: ActivityStatus;
  priority: ActivityPriority;
  start_date: string | null;
  due_date: string | null;
  week_start_date: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  blocked_reason: string | null;
  activity_checklist_items: ChecklistRow[] | null;
}

function toChecklist(row: ChecklistRow): ChecklistItem {
  return {
    id: row.id,
    activityId: row.activity_id,
    title: row.title,
    isCompleted: row.is_completed,
    position: row.position,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function toActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    companyId: row.company_id,
    title: row.title,
    description: row.description,
    responsibleMemberId: row.responsible_member_id,
    area: row.area,
    status: row.status,
    priority: row.priority,
    startDate: row.start_date,
    dueDate: row.due_date,
    weekStartDate: row.week_start_date,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : null,
    blockedReason: row.blocked_reason,
    checklist: (row.activity_checklist_items ?? [])
      .map(toChecklist)
      .sort((a, b) => a.position - b.position),
  };
}

const SELECT = '*, activity_checklist_items(*)';

/** Acesso a dados de Atividades no Postgres (service role). Regras ficam no serviço. */
export class SupabaseActivityRepository implements ActivityRepository {
  constructor(private readonly db: SupabaseClient) {}

  async create(
    data: Omit<Activity, 'id' | 'createdAt' | 'updatedAt' | 'checklist'>,
    checklistTitles: string[],
  ): Promise<Activity> {
    const { data: row, error } = await this.db
      .from('activities')
      .insert({
        company_id: data.companyId,
        title: data.title,
        description: data.description,
        responsible_member_id: data.responsibleMemberId,
        area: data.area,
        status: data.status,
        priority: data.priority,
        start_date: data.startDate,
        due_date: data.dueDate,
        week_start_date: data.weekStartDate,
        created_by: data.createdBy,
        completed_at: data.completedAt?.toISOString() ?? null,
        cancelled_at: data.cancelledAt?.toISOString() ?? null,
        blocked_reason: data.blockedReason,
      })
      .select('id')
      .single<{ id: string }>();
    if (error || !row) throw new Error(`Falha ao criar atividade: ${error?.message}`);

    if (checklistTitles.length > 0) {
      const { error: clError } = await this.db.from('activity_checklist_items').insert(
        checklistTitles.map((title, i) => ({ activity_id: row.id, title, position: i })),
      );
      if (clError) {
        await this.db.from('activities').delete().eq('id', row.id);
        throw new Error(`Falha ao salvar checklist: ${clError.message}`);
      }
    }

    const created = await this.findByIdRaw(row.id);
    if (!created) throw new Error('Atividade criada mas não encontrada.');
    return created;
  }

  async list(companyId: string): Promise<Activity[]> {
    const { data: rows, error } = await this.db
      .from('activities')
      .select(SELECT)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .returns<ActivityRow[]>();
    if (error) throw new Error(`Falha ao listar atividades: ${error.message}`);
    return (rows ?? []).map(toActivity);
  }

  async findById(companyId: string, activityId: string): Promise<Activity | null> {
    const { data: row, error } = await this.db
      .from('activities')
      .select(SELECT)
      .eq('company_id', companyId)
      .eq('id', activityId)
      .maybeSingle<ActivityRow>();
    if (error) throw new Error(`Falha ao buscar atividade: ${error.message}`);
    return row ? toActivity(row) : null;
  }

  async update(activityId: string, patch: ActivityUpdate): Promise<Activity> {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.description !== undefined) row.description = patch.description;
    if (patch.responsibleMemberId !== undefined) row.responsible_member_id = patch.responsibleMemberId;
    if (patch.area !== undefined) row.area = patch.area;
    if (patch.priority !== undefined) row.priority = patch.priority;
    if (patch.startDate !== undefined) row.start_date = patch.startDate;
    if (patch.dueDate !== undefined) row.due_date = patch.dueDate;
    if (patch.weekStartDate !== undefined) row.week_start_date = patch.weekStartDate;
    const { error } = await this.db.from('activities').update(row).eq('id', activityId);
    if (error) throw new Error(`Falha ao atualizar atividade: ${error.message}`);
    return this.mustFind(activityId);
  }

  async changeStatus(activityId: string, change: StatusChange): Promise<Activity> {
    const { error } = await this.db
      .from('activities')
      .update({
        status: change.status,
        blocked_reason: change.blockedReason,
        completed_at: change.completedAt?.toISOString() ?? null,
        cancelled_at: change.cancelledAt?.toISOString() ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', activityId);
    if (error) throw new Error(`Falha ao mudar status: ${error.message}`);
    return this.mustFind(activityId);
  }

  async addChecklistItem(activityId: string, title: string): Promise<ChecklistItem> {
    const { count } = await this.db
      .from('activity_checklist_items')
      .select('id', { count: 'exact', head: true })
      .eq('activity_id', activityId);
    const { data: row, error } = await this.db
      .from('activity_checklist_items')
      .insert({ activity_id: activityId, title, position: count ?? 0 })
      .select()
      .single<ChecklistRow>();
    if (error || !row) throw new Error(`Falha ao adicionar item: ${error?.message}`);
    return toChecklist(row);
  }

  async setChecklistItemCompleted(itemId: string, isCompleted: boolean): Promise<ChecklistItem> {
    const { data: row, error } = await this.db
      .from('activity_checklist_items')
      .update({ is_completed: isCompleted, updated_at: new Date().toISOString() })
      .eq('id', itemId)
      .select()
      .single<ChecklistRow>();
    if (error || !row) throw new Error(`Falha ao atualizar item: ${error?.message}`);
    return toChecklist(row);
  }

  async removeChecklistItem(itemId: string): Promise<void> {
    const { error } = await this.db.from('activity_checklist_items').delete().eq('id', itemId);
    if (error) throw new Error(`Falha ao remover item: ${error.message}`);
  }

  private async findByIdRaw(activityId: string): Promise<Activity | null> {
    const { data: row, error } = await this.db
      .from('activities')
      .select(SELECT)
      .eq('id', activityId)
      .maybeSingle<ActivityRow>();
    if (error) throw new Error(`Falha ao buscar atividade: ${error.message}`);
    return row ? toActivity(row) : null;
  }

  private async mustFind(activityId: string): Promise<Activity> {
    const a = await this.findByIdRaw(activityId);
    if (!a) throw new Error('Atividade não encontrada após operação.');
    return a;
  }
}
