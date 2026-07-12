import {
  checklistSummaryOf,
  type CompanyChecklistItem,
  type ChecklistView,
  type CreateChecklistItemInput,
  type ChecklistStatus,
} from '@plim/shared';
import type { ChecklistItemRecord, ChecklistSignals } from '../domain/checklist';
import type { ChecklistRepository, NewChecklistItem } from '../repositories/checklist.repository';
import type { CompanyService } from './company.service';
import { autoStatus, checklistCatalog } from './checklist.catalog';
import { NotFoundError } from '../lib/errors';

/** Chaves do catalogo que tem regra automatica (nao editaveis pelo usuario). */
const autoRuleByKey = new Map(checklistCatalog.filter((t) => t.autoRule).map((t) => [t.key, t.autoRule!]));

function toDto(r: ChecklistItemRecord): CompanyChecklistItem {
  return {
    id: r.id,
    templateKey: r.templateKey,
    title: r.title,
    description: r.description,
    phase: r.phase,
    status: r.status,
    priority: r.priority,
    actionLabel: r.actionLabel,
    actionRoute: r.actionRoute,
    recommendedPartnerCategory: r.recommendedPartnerCategory,
    isCustom: r.isCustom,
    isSystemGenerated: r.isSystemGenerated,
    isAuto: r.templateKey ? autoRuleByKey.has(r.templateKey) : false,
    completedAt: r.completedAt,
    createdAt: r.createdAt,
  };
}

/**
 * Regras do checklist inteligente. O front apenas apresenta.
 * Geracao idempotente (nunca duplica) + auto-conclusao a partir dos dados reais.
 */
export class ChecklistService {
  constructor(
    private readonly companyService: CompanyService,
    private readonly repo: ChecklistRepository,
  ) {}

  /** Tela principal: garante geracao, aplica regras automaticas e devolve tudo. */
  async getChecklist(companyId: string, actingUserId?: string | null): Promise<ChecklistView> {
    const { company, members } = await this.companyService.getOverview(companyId, actingUserId);

    let existing = await this.repo.listItems(companyId);

    // 1) Gera itens que faltam (por template_key), sem duplicar.
    const present = new Set(existing.map((i) => i.templateKey).filter(Boolean) as string[]);
    const missing: NewChecklistItem[] = checklistCatalog
      .filter((t) => !present.has(t.key))
      .map((t) => ({
        companyId,
        templateKey: t.key,
        title: t.title,
        description: t.description,
        phase: t.phase,
        status: 'not_started',
        priority: t.priority,
        actionLabel: t.actionLabel ?? null,
        actionRoute: t.actionRoute ?? null,
        recommendedPartnerCategory: t.recommendedPartnerCategory ?? null,
        isCustom: false,
        isSystemGenerated: true,
      }));
    if (missing.length > 0) {
      const created = await this.repo.insertItems(missing);
      existing = [...existing, ...created];
    }

    // 2) Aplica auto-conclusao com os sinais reais da empresa.
    const extra = await this.repo.extraSignals(companyId);
    const equitySum = members.reduce((sum, m) => sum + (m.equityPercent ?? 0), 0);
    const signals: ChecklistSignals = {
      name: company.name,
      isNameTemporary: company.isNameTemporary,
      description: company.description,
      logoUrl: extra.logoUrl,
      equitySum,
      membersCount: members.length,
      expensesCount: extra.expensesCount,
      activeRecurringCount: extra.activeRecurringCount,
      activitiesThisWeekCount: extra.activitiesThisWeekCount,
    };

    for (const item of existing) {
      if (!item.templateKey) continue;
      const rule = autoRuleByKey.get(item.templateKey);
      if (!rule) continue;
      // Nao sobrescreve escolha explicita do usuario (fazer depois / nao se aplica).
      if (item.status === 'skipped' || item.status === 'not_applicable') continue;
      const next = autoStatus(rule, signals);
      if (next && next !== item.status) {
        const updated = await this.repo.updateStatus(
          item.id,
          next,
          next === 'completed' ? new Date().toISOString() : null,
          null,
        );
        Object.assign(item, updated);
      }
    }

    const items = existing.map(toDto).sort(byPhaseThenPriority);
    return { items, summary: checklistSummaryOf(items) };
  }

  /** Usuario marca um item (concluido, fazer depois, nao se aplica...). */
  async updateStatus(
    companyId: string,
    itemId: string,
    status: ChecklistStatus,
    actingUserId?: string | null,
  ): Promise<CompanyChecklistItem> {
    await this.companyService.getOverview(companyId, actingUserId);
    const item = await this.repo.findItemById(companyId, itemId);
    if (!item) throw new NotFoundError('CHECKLIST_ITEM_NOT_FOUND', 'Item do checklist nao encontrado.');
    const now = new Date().toISOString();
    const updated = await this.repo.updateStatus(
      itemId,
      status,
      status === 'completed' ? now : null,
      status === 'skipped' ? now : null,
    );
    return toDto(updated);
  }

  /** Item personalizado da empresa. */
  async createCustomItem(
    companyId: string,
    input: CreateChecklistItemInput,
    actingUserId?: string | null,
  ): Promise<CompanyChecklistItem> {
    await this.companyService.getOverview(companyId, actingUserId);
    const [created] = await this.repo.insertItems([
      {
        companyId,
        templateKey: null,
        title: input.title,
        description: input.description ?? null,
        phase: input.phase ?? 'routine',
        status: 'not_started',
        priority: input.priority ?? 'medium',
        actionLabel: null,
        actionRoute: null,
        recommendedPartnerCategory: null,
        isCustom: true,
        isSystemGenerated: false,
      },
    ]);
    return toDto(created!);
  }
}

const phaseOrder = ['idea', 'brand', 'partnership', 'finance', 'product', 'routine'];
const priorityOrder = { high: 0, medium: 1, low: 2 } as const;

function byPhaseThenPriority(a: CompanyChecklistItem, b: CompanyChecklistItem): number {
  const p = phaseOrder.indexOf(a.phase) - phaseOrder.indexOf(b.phase);
  if (p !== 0) return p;
  return priorityOrder[a.priority] - priorityOrder[b.priority];
}
