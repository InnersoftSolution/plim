import { z } from 'zod';

/**
 * Checklist inteligente de estruturacao da empresa.
 *
 * Principio: o Plim nao espera a empresa estar organizada; ele ajuda a
 * organizar. O checklist orienta, nunca bloqueia. Cada item tem um status
 * proprio por empresa, e alguns se concluem sozinhos quando o dado real
 * aparece (nome, descricao, participacao 100%, primeira movimentacao...).
 */

/** As 6 fases da jornada, em ordem. */
export const checklistPhaseSchema = z.enum([
  'idea',
  'brand',
  'partnership',
  'finance',
  'product',
  'routine',
]);
export type ChecklistPhase = z.infer<typeof checklistPhaseSchema>;

export const checklistPhaseCatalog: ReadonlyArray<{
  id: ChecklistPhase;
  label: string;
  help: string;
}> = [
  { id: 'idea', label: 'Ideia e posicionamento', help: 'O que a empresa e, para quem existe e qual problema resolve.' },
  { id: 'brand', label: 'Marca e presenca', help: 'Identidade e presenca minima para o negocio.' },
  { id: 'partnership', label: 'Sociedade e formalizacao', help: 'Socios, participacao e estrutura legal inicial.' },
  { id: 'finance', label: 'Financeiro inicial', help: 'Gastos, aportes, custos e organizacao financeira basica.' },
  { id: 'product', label: 'Produto, operacao e vendas', help: 'Oferta, MVP, clientes, vendas e operacao.' },
  { id: 'routine', label: 'Rotina e acompanhamento', help: 'Tarefas, responsaveis e ritmo semanal.' },
];

/** Status de um item. Nem todo item se aplica a toda empresa. */
export const checklistStatusSchema = z.enum([
  'not_started',
  'in_progress',
  'completed',
  'skipped',
  'not_applicable',
]);
export type ChecklistStatus = z.infer<typeof checklistStatusSchema>;

export const checklistStatusCatalog: ReadonlyArray<{ id: ChecklistStatus; label: string }> = [
  { id: 'not_started', label: 'Nao iniciado' },
  { id: 'in_progress', label: 'Em andamento' },
  { id: 'completed', label: 'Concluido' },
  { id: 'skipped', label: 'Fazer depois' },
  { id: 'not_applicable', label: 'Nao se aplica' },
];

export const checklistPrioritySchema = z.enum(['low', 'medium', 'high']);
export type ChecklistPriority = z.infer<typeof checklistPrioritySchema>;

/** Item real do checklist de uma empresa (DTO). */
export interface CompanyChecklistItem {
  id: string;
  templateKey: string | null;
  title: string;
  description: string | null;
  phase: ChecklistPhase;
  status: ChecklistStatus;
  priority: ChecklistPriority;
  actionLabel: string | null;
  actionRoute: string | null;
  /** Categoria de parceiro sugerida (preparacao futura; nao usada ainda). */
  recommendedPartnerCategory: string | null;
  isCustom: boolean;
  isSystemGenerated: boolean;
  /** Itens com regra automatica nao podem ser editados na mao pelo usuario. */
  isAuto: boolean;
  completedAt: string | null;
  createdAt: string;
}

/** Progresso geral do checklist (itens que "nao se aplica" saem da conta). */
export interface ChecklistSummary {
  total: number;
  completed: number;
  percent: number;
}

export interface ChecklistView {
  items: CompanyChecklistItem[];
  summary: ChecklistSummary;
}

/** PATCH status de um item (o usuario marca concluido/depois/nao se aplica). */
export const updateChecklistStatusSchema = z.object({
  status: checklistStatusSchema,
});
export type UpdateChecklistStatusInput = z.infer<typeof updateChecklistStatusSchema>;

/** Item personalizado criado pelo usuario. */
export const createChecklistItemSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  phase: checklistPhaseSchema.default('routine'),
  priority: checklistPrioritySchema.default('medium'),
});
export type CreateChecklistItemInput = z.input<typeof createChecklistItemSchema>;

/** Conta apenas itens que valem para o progresso (exclui "nao se aplica"). */
export function checklistSummaryOf(items: ReadonlyArray<Pick<CompanyChecklistItem, 'status'>>): ChecklistSummary {
  const relevant = items.filter((i) => i.status !== 'not_applicable');
  const completed = relevant.filter((i) => i.status === 'completed').length;
  const total = relevant.length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, percent };
}
