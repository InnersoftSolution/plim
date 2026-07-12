import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryCompanyRepository } from '../repositories/in-memory/company.repository.memory';
import { InMemoryChecklistRepository } from '../repositories/in-memory/checklist.repository.memory';
import { CompanyService } from './company.service';
import { ChecklistService } from './checklist.service';
import { checklistCatalog } from './checklist.catalog';

describe('ChecklistService', () => {
  let companyService: CompanyService;
  let checklistRepo: InMemoryChecklistRepository;
  let checklist: ChecklistService;
  let companyId: string;

  beforeEach(async () => {
    const companyRepo = new InMemoryCompanyRepository();
    companyService = new CompanyService(companyRepo);
    checklistRepo = new InMemoryChecklistRepository();
    checklist = new ChecklistService(companyService, checklistRepo);
    const { company } = await companyService.createCompany(
      { name: 'Startup Teste' },
      { id: 'u1', fullName: 'Dona', email: 'dona@plim.work' },
    );
    companyId = company.id;
  });

  it('gera o checklist a partir do catalogo na primeira visita', async () => {
    const view = await checklist.getChecklist(companyId, 'u1');
    expect(view.items).toHaveLength(checklistCatalog.length);
    expect(view.summary.total).toBeGreaterThan(0);
  });

  it('nao duplica itens em visitas repetidas', async () => {
    await checklist.getChecklist(companyId, 'u1');
    const second = await checklist.getChecklist(companyId, 'u1');
    expect(second.items).toHaveLength(checklistCatalog.length);
  });

  it('conclui automaticamente o item de nome (nome definido)', async () => {
    const view = await checklist.getChecklist(companyId, 'u1');
    const nome = view.items.find((i) => i.templateKey === 'company_name');
    expect(nome?.status).toBe('completed');
    expect(nome?.isAuto).toBe(true);
  });

  it('marca movimentacao como concluida quando ha ao menos uma', async () => {
    checklistRepo.setSignals(companyId, { expensesCount: 2 });
    const view = await checklist.getChecklist(companyId, 'u1');
    const mov = view.items.find((i) => i.templateKey === 'first_movement');
    expect(mov?.status).toBe('completed');
  });

  it('respeita "fazer depois" e nao sobrescreve com regra automatica', async () => {
    let view = await checklist.getChecklist(companyId, 'u1');
    const mov = view.items.find((i) => i.templateKey === 'first_movement')!;
    await checklist.updateItem(companyId, mov.id, { status: 'skipped' }, 'u1');
    // Agora surge uma movimentacao, mas o usuario ja escolheu adiar.
    checklistRepo.setSignals(companyId, { expensesCount: 1 });
    view = await checklist.getChecklist(companyId, 'u1');
    expect(view.items.find((i) => i.templateKey === 'first_movement')?.status).toBe('skipped');
  });

  it('itens "nao se aplica" saem do calculo de progresso', async () => {
    let view = await checklist.getChecklist(companyId, 'u1');
    const totalInicial = view.summary.total;
    const item = view.items.find((i) => i.status !== 'completed')!;
    await checklist.updateItem(companyId, item.id, { status: 'not_applicable' }, 'u1');
    view = await checklist.getChecklist(companyId, 'u1');
    expect(view.summary.total).toBe(totalInicial - 1);
  });

  it('salva a anotacao do item sem mexer no status', async () => {
    const view = await checklist.getChecklist(companyId, 'u1');
    const alvo = view.items.find((i) => i.templateKey === 'target_audience')!;
    const updated = await checklist.updateItem(
      companyId,
      alvo.id,
      { note: 'Donos de pet de classe media que compram online.' },
      'u1',
    );
    expect(updated.note).toBe('Donos de pet de classe media que compram online.');
    expect(updated.status).toBe('not_started');
    const again = await checklist.getChecklist(companyId, 'u1');
    expect(again.items.find((i) => i.id === alvo.id)?.note).toBe(
      'Donos de pet de classe media que compram online.',
    );
  });

  it('salva anotacao e status ao mesmo tempo', async () => {
    const view = await checklist.getChecklist(companyId, 'u1');
    const missao = view.items.find((i) => i.templateKey === 'mission')!;
    const updated = await checklist.updateItem(
      companyId,
      missao.id,
      { note: 'Facilitar a vida de quem esta comecando.', status: 'in_progress' },
      'u1',
    );
    expect(updated.note).toBe('Facilitar a vida de quem esta comecando.');
    expect(updated.status).toBe('in_progress');
  });

  it('cria item personalizado da empresa', async () => {
    const item = await checklist.createCustomItem(
      companyId,
      { title: 'Comprar embalagem', phase: 'product', priority: 'medium' },
      'u1',
    );
    expect(item.isCustom).toBe(true);
    expect(item.templateKey).toBeNull();
    const view = await checklist.getChecklist(companyId, 'u1');
    expect(view.items.some((i) => i.title === 'Comprar embalagem')).toBe(true);
  });

  it('nega acesso de quem nao e membro', async () => {
    await expect(checklist.getChecklist(companyId, 'intruso')).rejects.toMatchObject({ code: 'NOT_A_MEMBER' });
  });
});
