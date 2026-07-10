import type { Insight, InsightsResponse } from '@plim/shared';
import type { Company, CompanyMember } from '../domain/company';
import type { CompanyService } from './company.service';
import type { LlmProvider } from '../ai/llm.provider';
import { buildInsights } from '../ai/insights';

const ADVISOR_SYSTEM_PROMPT = `você é o copiloto do plim, um sistema para fundadores brasileiros em fase inicial de empresa.
seu tom: minúsculas, amigável, direto, sem jargão. fale como um parceiro de negócio, não como um robô.
regras importantes:
- NÃO invente números. use apenas os fatos e insights que receber.
- escreva no máximo 2 frases curtas, em português do brasil.
- destaque o que é mais importante fazer agora e por quê.
- você orienta e organiza; não substitui contador ou advogado.`;

/**
 * Núcleo inteligente — Fase 1. Gera insights DETERMINÍSTICOS (sem custo) e,
 * quando há LLM configurado, adiciona uma "leitura do copiloto" em linguagem
 * natural. O LLM nunca altera os números — só comenta os insights prontos.
 */
export class AdvisorService {
  constructor(
    private readonly companyService: CompanyService,
    private readonly llm: LlmProvider,
  ) {}

  async getInsights(companyId: string, actingUserId?: string | null): Promise<InsightsResponse> {
    const { company, members } = await this.companyService.getOverview(companyId, actingUserId);
    const insights = buildInsights(company, members);

    const summary = this.llm.available ? await this.tryBuildSummary(company, members, insights) : null;

    return { insights, summary };
  }

  /** Pede ao LLM um parágrafo de leitura. Falha de IA não derruba o endpoint. */
  private async tryBuildSummary(
    company: Company,
    members: CompanyMember[],
    insights: Insight[],
  ): Promise<string | null> {
    try {
      const prompt = this.buildPrompt(company, members, insights);
      const text = await this.llm.complete({ system: ADVISOR_SYSTEM_PROMPT, prompt, maxTokens: 250 });
      return text || null;
    } catch {
      // Sem leitura da IA, o usuário ainda vê os insights determinísticos.
      return null;
    }
  }

  private buildPrompt(company: Company, members: CompanyMember[], insights: Insight[]): string {
    const partners = members.filter((m) => m.role === 'partner');
    const equityTotal =
      members.reduce((sum, m) => sum + Math.round((m.equityPercent ?? 0) * 100), 0) / 100;

    const fatos = [
      `empresa: ${company.name}`,
      company.businessModel ? `modelo de negócio: ${company.businessModel}` : 'modelo de negócio: não definido',
      `sócios (além do dono): ${partners.length}`,
      `participação total alocada: ${equityTotal}%`,
    ].join('\n');

    const lista = insights.map((i) => `- [${i.severity}] ${i.title}: ${i.message}`).join('\n');

    return `fatos da empresa:\n${fatos}\n\ninsights detectados:\n${lista}\n\nescreva uma leitura curta (no máximo 2 frases) priorizando o que o fundador deve olhar primeiro.`;
  }
}
