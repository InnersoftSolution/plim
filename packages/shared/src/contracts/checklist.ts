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
  { id: 'idea', label: 'Ideia e posicionamento', help: 'O que a empresa é, para quem existe e qual problema resolve.' },
  { id: 'brand', label: 'Marca e presença', help: 'Identidade e presença mínima para o negócio.' },
  { id: 'partnership', label: 'Sociedade e formalização', help: 'Sócios, participação e estrutura legal inicial.' },
  { id: 'finance', label: 'Financeiro inicial', help: 'Gastos, aportes, custos e organização financeira básica.' },
  { id: 'product', label: 'Produto, operação e vendas', help: 'Oferta, MVP, clientes, vendas e operação.' },
  { id: 'routine', label: 'Rotina e acompanhamento', help: 'Tarefas, responsáveis e ritmo semanal.' },
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
  { id: 'not_started', label: 'Não iniciado' },
  { id: 'in_progress', label: 'Em andamento' },
  { id: 'completed', label: 'Concluído' },
  { id: 'skipped', label: 'Fazer depois' },
  { id: 'not_applicable', label: 'Não se aplica' },
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
  /** Anotacao/conteudo que o usuario registra ali mesmo (guia ou nota livre). */
  note: string | null;
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

/**
 * PATCH de um item. Pode mudar o status (concluido/depois/nao se aplica) e/ou
 * a anotacao (o conteudo que o usuario escreve pelo guia ou nota livre).
 * Ambos opcionais: da para salvar so a nota ou so o status.
 */
export const updateChecklistItemSchema = z.object({
  status: checklistStatusSchema.optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});
export type UpdateChecklistItemInput = z.infer<typeof updateChecklistItemSchema>;

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
