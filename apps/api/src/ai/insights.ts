import type { Insight } from '@plim/shared';
import type { Company, CompanyMember } from '../domain/company';

/**
 * Gera os insights de forma DETERMINÍSTICA a partir do estado real da empresa.
 * Sem LLM, sem rede, sem custo — os números são a verdade do sistema.
 * O LLM (quando ligado) só comenta por cima; nunca entra aqui.
 */
export function buildInsights(company: Company, members: CompanyMember[]): Insight[] {
  const insights: Insight[] = [];
  const partners = members.filter((m) => m.role === 'partner');

  // ── Sociedade: soma de participações ─────────────────────
  // Soma em centésimos para evitar imprecisão de ponto flutuante (igual ao serviço).
  const allocatedHundredths = members.reduce(
    (sum, m) => sum + Math.round((m.equityPercent ?? 0) * 100),
    0,
  );
  const remaining = (100 * 100 - allocatedHundredths) / 100;

  if (allocatedHundredths === 0) {
    insights.push({
      id: 'equity-none',
      category: 'sociedade',
      severity: 'attention',
      title: 'Defina as participações',
      message: 'Nenhuma participação foi definida ainda. Combine quanto cada sócio tem da empresa.',
      actionLabel: 'Definir participações',
      actionHref: '/onboarding?step=members',
    });
  } else if (remaining > 0) {
    insights.push({
      id: 'equity-incomplete',
      category: 'sociedade',
      severity: 'attention',
      title: 'Participação a distribuir',
      message: `Faltam ${formatPct(remaining)} de participação para chegar a 100%.`,
      actionLabel: 'Ajustar participações',
      actionHref: '/onboarding?step=members',
    });
  } else {
    insights.push({
      id: 'equity-complete',
      category: 'sociedade',
      severity: 'positive',
      title: 'Sociedade definida',
      message: 'As participações somam 100% — a base societária está fechada.',
      actionLabel: null,
      actionHref: null,
    });
  }

  // ── Sócios sem percentual definido ───────────────────────
  const undefinedPartners = partners.filter((m) => m.equityPercent == null);
  if (undefinedPartners.length > 0) {
    insights.push({
      id: 'members-without-equity',
      category: 'sociedade',
      severity: 'info',
      title: 'Sócios sem participação',
      message: `${undefinedPartners.length} sócio(s) ainda sem percentual definido.`,
      actionLabel: 'Definir agora',
      actionHref: '/onboarding?step=members',
    });
  }

  // ── Solo: nenhum sócio convidado ─────────────────────────
  if (partners.length === 0) {
    insights.push({
      id: 'no-partners',
      category: 'sociedade',
      severity: 'info',
      title: 'Convide seus sócios',
      message: 'Você é o único membro por enquanto. Convide sócios para dividir participação e despesas.',
      actionLabel: 'Adicionar sócios',
      actionHref: '/onboarding?step=members',
    });
  }

  // ── Segmento (industry) ──────────────────────────────────
  if (!company.industry) {
    insights.push({
      id: 'no-industry',
      category: 'modelo',
      severity: 'info',
      title: 'Defina o segmento',
      message: 'Diga em qual segmento sua empresa atua para o copiloto dar dicas sob medida.',
      actionLabel: 'Escolher segmento',
      actionHref: '/onboarding?step=basic',
    });
  }

  return insights;
}

function formatPct(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}
