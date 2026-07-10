import {
  weekStartOf,
  type Activity as ActivityDto,
  type ChangeActivityStatusInput,
  type ChecklistItem as ChecklistItemDto,
  type CreateActivityInput,
  type UpdateActivityInput,
} from '@plim/shared';
import type { Activity, ChecklistItem } from '../domain/activity';
import type { ActivityRepository, StatusChange } from '../repositories/activity.repository';
import type { CompanyService } from './company.service';
import { DomainError, NotFoundError } from '../lib/errors';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Atrasada: tem prazo vencido e não está concluída/cancelada (RP003). */
function computeOverdue(a: Activity, today: string): boolean {
  return a.dueDate != null && a.dueDate < today && a.status !== 'done' && a.status !== 'cancelled';
}

function toChecklistDto(c: ChecklistItem): ChecklistItemDto {
  return {
    id: c.id,
    activityId: c.activityId,
    title: c.title,
    isCompleted: c.isCompleted,
    position: c.position,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function toDto(a: Activity, today: string): ActivityDto {
  return {
    id: a.id,
    companyId: a.companyId,
    title: a.title,
    description: a.description,
    responsibleMemberId: a.responsibleMemberId,
    area: a.area,
    status: a.status,
    priority: a.priority,
    startDate: a.startDate,
    dueDate: a.dueDate,
    weekStartDate: a.weekStartDate,
    createdBy: a.createdBy,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    completedAt: a.completedAt?.toISOString() ?? null,
    cancelledAt: a.cancelledAt?.toISOString() ?? null,
    blockedReason: a.blockedReason,
    checklist: a.checklist.map(toChecklistDto).sort((x, y) => x.position - y.position),
    isOverdue: computeOverdue(a, today),
  };
}

/**
 * Regras do módulo Atividades. Autorização (ser membro da empresa) reusa
 * getOverview. NÃO toca em finanças (RP006). Determinístico — R$0 de IA.
 */
export class ActivityService {
  constructor(
    private readonly companyService: CompanyService,
    private readonly repo: ActivityRepository,
  ) {}

  async createActivity(
    companyId: string,
    input: CreateActivityInput,
    actingUserId?: string | null,
  ): Promise<ActivityDto> {
    const { members } = await this.companyService.getOverview(companyId, actingUserId);
    this.assertMember(members, input.responsibleMemberId ?? null);
    const creator = actingUserId ? members.find((m) => m.userId === actingUserId) ?? null : null;
    const weekStartDate = weekStartOf(input.dueDate ?? todayIso());
    // Defaults (o schema aplica no boundary HTTP; reforçamos p/ chamadas diretas).
    const status = input.status ?? 'todo';

    const created = await this.repo.create(
      {
        companyId,
        title: input.title,
        description: input.description ?? null,
        responsibleMemberId: input.responsibleMemberId ?? null,
        area: input.area ?? 'outros',
        status,
        priority: input.priority ?? 'medium',
        startDate: input.startDate ?? null,
        dueDate: input.dueDate ?? null,
        weekStartDate,
        createdBy: creator?.id ?? null,
        completedAt: status === 'done' ? new Date() : null,
        cancelledAt: status === 'cancelled' ? new Date() : null,
        blockedReason: null,
      },
      (input.checklist ?? []).map((c) => c.title),
    );
    return toDto(created, todayIso());
  }

  async listActivities(companyId: string, actingUserId?: string | null): Promise<ActivityDto[]> {
    await this.companyService.getOverview(companyId, actingUserId);
    const today = todayIso();
    return (await this.repo.list(companyId)).map((a) => toDto(a, today));
  }

  async updateActivity(
    companyId: string,
    activityId: string,
    input: UpdateActivityInput,
    actingUserId?: string | null,
  ): Promise<ActivityDto> {
    const { members } = await this.companyService.getOverview(companyId, actingUserId);
    const existing = await this.mustFind(companyId, activityId);
    if (input.responsibleMemberId !== undefined) {
      this.assertMember(members, input.responsibleMemberId);
    }
    // Se o prazo mudou, a semana da atividade acompanha.
    const patch = { ...input };
    const updated = await this.repo.update(activityId, {
      ...patch,
      ...(input.dueDate !== undefined
        ? { weekStartDate: weekStartOf(input.dueDate ?? existing.weekStartDate) }
        : {}),
    });
    return toDto(updated, todayIso());
  }

  async changeStatus(
    companyId: string,
    activityId: string,
    input: ChangeActivityStatusInput,
    actingUserId?: string | null,
  ): Promise<ActivityDto> {
    await this.companyService.getOverview(companyId, actingUserId);
    const existing = await this.mustFind(companyId, activityId);
    const now = new Date();
    const change: StatusChange = {
      status: input.status,
      // Só guarda motivo de bloqueio quando bloqueado.
      blockedReason: input.status === 'blocked' ? input.blockedReason ?? null : null,
      // completedAt: preenche ao concluir (RP004), limpa se sair de concluída.
      completedAt: input.status === 'done' ? existing.completedAt ?? now : null,
      // cancelledAt: preenche ao cancelar (RP005), limpa se sair de cancelada.
      cancelledAt: input.status === 'cancelled' ? existing.cancelledAt ?? now : null,
    };
    const updated = await this.repo.changeStatus(activityId, change);
    return toDto(updated, todayIso());
  }

  async addChecklistItem(
    companyId: string,
    activityId: string,
    title: string,
    actingUserId?: string | null,
  ): Promise<ActivityDto> {
    await this.companyService.getOverview(companyId, actingUserId);
    await this.mustFind(companyId, activityId);
    await this.repo.addChecklistItem(activityId, title);
    return toDto(await this.mustFind(companyId, activityId), todayIso());
  }

  async setChecklistItem(
    companyId: string,
    activityId: string,
    itemId: string,
    isCompleted: boolean,
    actingUserId?: string | null,
  ): Promise<ActivityDto> {
    await this.companyService.getOverview(companyId, actingUserId);
    const activity = await this.mustFind(companyId, activityId);
    if (!activity.checklist.some((c) => c.id === itemId)) {
      throw new NotFoundError('CHECKLIST_ITEM_NOT_FOUND', 'Item de checklist não encontrado.');
    }
    await this.repo.setChecklistItemCompleted(itemId, isCompleted);
    return toDto(await this.mustFind(companyId, activityId), todayIso());
  }

  async removeChecklistItem(
    companyId: string,
    activityId: string,
    itemId: string,
    actingUserId?: string | null,
  ): Promise<ActivityDto> {
    await this.companyService.getOverview(companyId, actingUserId);
    const activity = await this.mustFind(companyId, activityId);
    if (!activity.checklist.some((c) => c.id === itemId)) {
      throw new NotFoundError('CHECKLIST_ITEM_NOT_FOUND', 'Item de checklist não encontrado.');
    }
    await this.repo.removeChecklistItem(itemId);
    return toDto(await this.mustFind(companyId, activityId), todayIso());
  }

  private assertMember(
    members: { id: string }[],
    memberId: string | null,
  ): void {
    if (memberId != null && !members.some((m) => m.id === memberId)) {
      throw new DomainError('MEMBER_NOT_FOUND', 'Responsável informado não é sócio desta empresa.');
    }
  }

  private async mustFind(companyId: string, activityId: string): Promise<Activity> {
    const a = await this.repo.findById(companyId, activityId);
    if (!a) throw new NotFoundError('ACTIVITY_NOT_FOUND', 'Atividade não encontrada.');
    return a;
  }
}
