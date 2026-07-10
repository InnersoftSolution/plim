import type { Activity, Company, CompanyMember, Expense } from '@plim/shared';
import { currentWeekStart } from '../activities/activityApi';

/**
 * Jornada 1 — Pendências inteligentes na Home (PRD).
 * O Plim observa o estado da empresa, identifica o que falta, explica POR QUE
 * importa e sugere o próximo passo. Determinístico (R$0 de IA).
 *
 * "Fazer depois" (PRD §8): comportamento visual simples via localStorage
 * (dismissed_until) — a estrutura já prevê migrar para o banco depois.
 */

export type PendPriority = 'critica' | 'alta' | 'media' | 'baixa';

export interface Pendencia {
  id: string;
  title: string;
  description: string;
  /** Por que isso importa (linguagem orientadora, nunca burocrática). */
  reason: string;
  priority: PendPriority;
  action: { label: string; kind: 'navigate' | 'modal' | 'recurring'; to?: string };
  /** Ação secundária: adiar (dismiss) ou navegar (ex.: falar com contador). */
  secondary?: { label: string; kind: 'dismiss'; days: number } | { label: string; kind: 'navigate'; to: string };
}

/* ── "Fazer depois": memória local por empresa+pendência ── */
const dismissKey = (companyId: string, id: string) => `plim:pendencia:${companyId}:${id}`;

export function isDismissed(companyId: string, id: string): boolean {
  try {
    const until = localStorage.getItem(dismissKey(companyId, id));
    return until ? new Date(until) > new Date() : false;
  } catch {
    return false;
  }
}

export function dismissPendencia(companyId: string, id: string, days: number): void {
  try {
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(dismissKey(companyId, id), until);
  } catch {
    /* sem storage: apenas não persiste */
  }
}

function formatPct(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

/**
 * Gera as pendências JÁ NA ORDEM de prioridade do PRD §6:
 * sociedade → movimentação → formalização → natureza → sócios → descrição → contato.
 * (Custo mensal entra quando a jornada de recorrências existir — sem beco sem saída.)
 */
export function buildPendencias(
  company: Company,
  members: CompanyMember[],
  expenses: Expense[],
  recurringActiveCount = 0,
  activities: Activity[] = [],
): Pendencia[] {
  const out: Pendencia[] = [];
  const allocated = members.reduce((sum, m) => sum + (m.equityPercent ?? 0), 0);
  const pendingPct = Math.max(0, Math.round((100 - allocated) * 100) / 100);

  // 1) Sociedade inválida (>100%) — crítica: bloqueia cálculos relacionados.
  if (allocated > 100.001) {
    out.push({
      id: 'equity-invalid',
      title: 'A participação societária precisa de ajuste',
      description: `A soma das participações passou de 100% (está em ${formatPct(allocated)}).`,
      reason: 'Com a soma acima de 100%, o Plim não consegue calcular os acertos com segurança.',
      priority: 'critica',
      action: { label: 'Corrigir sociedade', kind: 'navigate', to: '/socios' },
    });
  } else if (pendingPct > 0) {
    // 1) Sociedade incompleta — alta (não bloqueia o uso).
    out.push({
      id: 'equity-incomplete',
      title: 'Sua sociedade ainda não está completa',
      description:
        allocated > 0
          ? `Você já definiu ${formatPct(allocated)} das participações. Ainda faltam ${formatPct(pendingPct)} para distribuir.`
          : `Você tem ${members.length} ${members.length === 1 ? 'sócio' : 'sócios'}, mas ainda faltam 100% para distribuir.`,
      reason: 'Essa informação ajuda o Plim a calcular melhor os gastos e acertos entre os sócios.',
      priority: 'alta',
      action: { label: 'Ajustar sociedade', kind: 'navigate', to: '/socios' },
      secondary: { label: 'Fazer depois', kind: 'dismiss', days: 7 },
    });
  }

  // (Contas a pagar vencidas/a vencer têm alerta dedicado na Home e nas
  // Movimentações — ver DashboardPage/FinancePage — para não duplicar aqui.)

  // 1.6) Atividades (jornada de execução): atrasadas, sem plano, sem responsável.
  const activeActivities = activities.filter((a) => a.status !== 'cancelled');
  const overdueActs = activeActivities.filter((a) => a.isOverdue);
  const weekStart = currentWeekStart();
  const weekActs = activeActivities.filter((a) => a.weekStartDate === weekStart);
  const noResponsible = activeActivities.filter((a) => !a.responsibleMemberId && a.status !== 'done');

  if (overdueActs.length > 0) {
    out.push({
      id: 'activities-overdue',
      title: 'Você tem atividades atrasadas',
      description: 'Atualize o status ou reagende as atividades que passaram do prazo.',
      reason: 'Manter os prazos em dia mantém a empresa avançando.',
      priority: 'alta',
      action: { label: 'Ver atividades', kind: 'navigate', to: '/atividades' },
    });
  }
  if (weekActs.length === 0) {
    out.push({
      id: 'activities-empty-week',
      title: 'Planeje as atividades da semana',
      description: 'Defina o que precisa acontecer nos próximos dias para manter a empresa avançando.',
      reason: 'Um plano semanal simples evita que tarefas importantes fiquem perdidas.',
      priority: 'media',
      action: { label: 'Criar atividade', kind: 'navigate', to: '/atividades?nova=1' },
      secondary: { label: 'Fazer depois', kind: 'dismiss', days: 3 },
    });
  }
  if (noResponsible.length > 0) {
    out.push({
      id: 'activities-no-responsible',
      title: 'Existem atividades sem responsável',
      description: 'Definir um responsável ajuda a evitar que tarefas importantes fiquem perdidas.',
      reason: 'Cada atividade com dono claro tem muito mais chance de sair do papel.',
      priority: 'media',
      action: { label: 'Definir responsáveis', kind: 'navigate', to: '/atividades' },
      secondary: { label: 'Fazer depois', kind: 'dismiss', days: 3 },
    });
  }

  // 2) Nenhuma movimentação registrada — alta.
  if (expenses.length === 0) {
    out.push({
      id: 'no-expenses',
      title: 'Registre sua primeira movimentação',
      description:
        'Adicione um gasto ou custo inicial para o Plim começar a mostrar quanto já foi investido no negócio.',
      reason: 'É a partir das movimentações que o Plim calcula investimentos e acertos.',
      priority: 'alta',
      action: { label: 'Adicionar movimentação', kind: 'modal' },
    });
  }

  // 3) Formalização indefinida — média.
  if (!company.hasFormalRegistration) {
    out.push({
      id: 'formalization-undefined',
      title: 'Formalização ainda indefinida',
      description:
        'Você ainda não informou se a empresa já possui CNPJ ou registro formal — pode completar quando estiver pronto.',
      reason: 'Essa informação ajuda o Plim a organizar os próximos passos da empresa.',
      priority: 'media',
      action: { label: 'Atualizar formalização', kind: 'navigate', to: '/onboarding?step=formalization' },
      secondary: { label: 'Decidir depois', kind: 'dismiss', days: 7 },
    });
  }

  // 4) Natureza jurídica indefinida — média.
  const legalUndefined =
    !company.legalStructure ||
    company.legalStructure === 'unknown' ||
    company.legalStructureStatus === 'undecided' ||
    company.legalStructureStatus === 'needs_accountant';
  if (legalUndefined) {
    out.push({
      id: 'legal-structure-undefined',
      title: 'Escolha da natureza jurídica pendente',
      description:
        'Você ainda não definiu o tipo de empresa (MEI, LTDA…). Essa decisão pode impactar faturamento, impostos e obrigações.',
      reason: 'Considere conversar com um contador — o Plim pode indicar um parceiro.',
      priority: 'media',
      action: { label: 'Ver opções', kind: 'navigate', to: '/empresa/dados' },
      secondary: { label: 'Falar com contador', kind: 'navigate', to: '/empresa/dados' },
    });
  }

  // 5) Nenhum sócio além do responsável — média (pausável: "estou sozinho").
  if (members.length <= 1) {
    out.push({
      id: 'no-partners',
      title: 'Você está sozinho nessa empresa?',
      description:
        'Se existem outras pessoas envolvidas, cadastre os sócios para organizar papéis, participações e futuros acertos.',
      reason: 'Sócios cadastrados permitem dividir gastos e calcular acertos automaticamente.',
      priority: 'media',
      action: { label: 'Adicionar sócio', kind: 'navigate', to: '/socios' },
      secondary: { label: 'Estou sozinho por enquanto', kind: 'dismiss', days: 30 },
    });
  }

  // 6) Nenhum custo mensal registrado — média (PRD §4.4).
  if (recurringActiveCount === 0) {
    out.push({
      id: 'no-recurring',
      title: 'Mapeie seus custos mensais',
      description:
        'Cadastre assinaturas e ferramentas recorrentes para entender quanto custa manter sua empresa funcionando.',
      reason: 'Com os custos mapeados, o Plim mostra o custo real de manter o negócio por mês.',
      priority: 'media',
      action: { label: 'Adicionar custo mensal', kind: 'recurring' },
      secondary: { label: 'Fazer depois', kind: 'dismiss', days: 7 },
    });
  }

  // 7) Empresa sem descrição — baixa.
  if (!company.description) {
    out.push({
      id: 'no-description',
      title: 'Explique melhor sua ideia',
      description:
        'Uma descrição curta ajuda o Plim a entender o que você está criando — você pode completar depois.',
      reason: 'Com a ideia clara, o Plim organiza melhor os próximos passos.',
      priority: 'baixa',
      action: { label: 'Completar descrição', kind: 'navigate', to: '/empresa/dados' },
      secondary: { label: 'Fazer depois', kind: 'dismiss', days: 7 },
    });
  }

  // 8) Contato da empresa incompleto — baixa.
  if (!company.phone && !company.email) {
    out.push({
      id: 'no-contact',
      title: 'Adicione um contato da empresa',
      description:
        'Você ainda não adicionou telefone ou e-mail da empresa — útil para clientes, bancos e fornecedores.',
      reason: 'Separar o contato da empresa do pessoal deixa tudo mais profissional.',
      priority: 'baixa',
      action: { label: 'Completar contato', kind: 'navigate', to: '/empresa/dados' },
      secondary: { label: 'Fazer depois', kind: 'dismiss', days: 7 },
    });
  }

  return out;
}
