import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryCompanyRepository } from '../repositories/in-memory/company.repository.memory';
import { CompanyService } from './company.service';
import { AdvisorService } from './advisor.service';
import type { LlmProvider } from '../ai/llm.provider';

/** Mock — nunca chama a API real, então os testes não gastam token. */
function mockLlm(text: string): LlmProvider {
  return { available: true, complete: vi.fn(async () => text) };
}
const noLlm: LlmProvider = { available: false, complete: vi.fn() };

describe('AdvisorService', () => {
  let companyService: CompanyService;
  let companyId: string;

  beforeEach(async () => {
    companyService = new CompanyService(new InMemoryCompanyRepository());
    const { company } = await companyService.createCompany(
      { name: 'plim', businessModel: 'SaaS' },
      { fullName: 'Rafaelle', email: 'rafaelle@plim.work' },
    );
    companyId = company.id;
  });

  it('gera insights determinísticos sem LLM (custo zero) e summary nulo', async () => {
    const advisor = new AdvisorService(companyService, noLlm);
    const { insights, summary } = await advisor.getInsights(companyId);

    expect(summary).toBeNull();
    expect(noLlm.complete).not.toHaveBeenCalled();
    // dono sozinho, sem participação definida → deve sinalizar
    expect(insights.some((i) => i.id === 'equity-none')).toBe(true);
    expect(insights.some((i) => i.id === 'no-partners')).toBe(true);
  });

  it('adiciona a leitura do copiloto quando há LLM', async () => {
    const advisor = new AdvisorService(companyService, mockLlm('foque em definir as participações.'));
    const { summary } = await advisor.getInsights(companyId);
    expect(summary).toBe('foque em definir as participações.');
  });

  it('não derruba o endpoint se o LLM falhar (cai para summary nulo)', async () => {
    const failing: LlmProvider = {
      available: true,
      complete: vi.fn(async () => {
        throw new Error('boom');
      }),
    };
    const advisor = new AdvisorService(companyService, failing);
    const { insights, summary } = await advisor.getInsights(companyId);
    expect(summary).toBeNull();
    expect(insights.length).toBeGreaterThan(0);
  });

  it('sinaliza sociedade fechada quando soma = 100%', async () => {
    const [owner] = await companyService.listMembers(companyId);
    await companyService.setMemberEquity(companyId, owner!.id, 100);
    const advisor = new AdvisorService(companyService, noLlm);
    const { insights } = await advisor.getInsights(companyId);
    expect(insights.some((i) => i.id === 'equity-complete')).toBe(true);
  });

  it('aplica autorização de membro (herdada do CompanyService)', async () => {
    const advisor = new AdvisorService(companyService, noLlm);
    await expect(advisor.getInsights(companyId, 'estranho')).rejects.toMatchObject({
      code: 'NOT_A_MEMBER',
    });
  });
});
