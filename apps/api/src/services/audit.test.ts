import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditRepository } from '../repositories/in-memory/audit.repository.memory';
import { InMemoryCompanyRepository } from '../repositories/in-memory/company.repository.memory';
import { InMemoryFinanceRepository } from '../repositories/in-memory/finance.repository.memory';
import { AuditService } from './audit.service';
import { CompanyService } from './company.service';
import { FinanceService } from './finance.service';

/**
 * Trilha de auditoria: cada ação do financeiro deixa um evento dizendo QUEM
 * fez, com frase pronta e legível. Nasceu de uma dúvida real da Rafaelle:
 * "será que o Diego cadastrou de novo o que eu já tinha cadastrado?".
 */
describe('Auditoria do financeiro', () => {
  let companyService: CompanyService;
  let finance: FinanceService;
  let audit: AuditService;
  let companyId: string;
  let rafaelle: string;
  let diego: string;

  beforeEach(async () => {
    const companyRepo = new InMemoryCompanyRepository();
    companyService = new CompanyService(companyRepo);
    const auditRepo = new InMemoryAuditRepository();
    audit = new AuditService(companyService, auditRepo);
    finance = new FinanceService(
      companyService,
      new InMemoryFinanceRepository(),
      undefined,
      audit,
    );
    const { company, ownerMember } = await companyService.createCompany(
      { name: 'MyClinic' },
      { id: 'u1', fullName: 'Rafaelle Weran', email: 'rafaelle@plim.work' },
    );
    companyId = company.id;
    rafaelle = ownerMember.id;
    await companyService.setMemberEquity(companyId, rafaelle, 50, 'u1');
    diego = (
      await companyService.addMember(
        companyId,
        { fullName: 'Diego Carvalho', email: 'diego@plim.work', equityPercent: 50 },
        'u1',
      )
    ).id;
  });

  it('criar despesa grava quem registrou, com valor na frase', async () => {
    const despesa = await finance.createExpense(
      companyId,
      {
        description: 'Designer André',
        amountCents: 27500,
        paidByMemberId: rafaelle,
        splitMode: 'equity',
      },
      'u1',
    );
    const eventos = await audit.listByEntity(companyId, 'movement', despesa.id, 'u1');
    expect(eventos).toHaveLength(1);
    expect(eventos[0]!.action).toBe('created');
    expect(eventos[0]!.actorMemberId).toBe(rafaelle);
    expect(eventos[0]!.summary).toContain('Rafaelle Weran');
    expect(eventos[0]!.summary).toContain('Designer André');
    expect(eventos[0]!.summary).toContain('275,00');
  });

  it('editar e excluir também deixam rastro, na ordem', async () => {
    const despesa = await finance.createExpense(
      companyId,
      { description: 'Servidor', amountCents: 10000, paidByMemberId: rafaelle, splitMode: 'equity' },
      'u1',
    );
    await finance.updateExpense(companyId, despesa.id, { description: 'Servidor Contabo' }, 'u1');
    await finance.removeExpense(companyId, despesa.id, 'u1');
    const eventos = await audit.listByEntity(companyId, 'movement', despesa.id, 'u1');
    expect(eventos.map((e) => e.action)).toEqual(['deleted', 'updated', 'created']);
  });

  it('acerto amarrado à movimentação aparece no histórico dela', async () => {
    const despesa = await finance.createExpense(
      companyId,
      { description: 'Panfletos', amountCents: 20000, paidByMemberId: rafaelle, splitMode: 'equity' },
      'u1',
    );
    await finance.createSettlementPayment(
      companyId,
      { fromMemberId: diego, toMemberId: rafaelle, amountCents: 10000, expenseId: despesa.id },
      'u1',
    );
    const eventos = await audit.listByEntity(companyId, 'movement', despesa.id, 'u1');
    expect(eventos.some((e) => e.summary.includes('acerto') && e.summary.includes('100,00'))).toBe(
      true,
    );
  });

  it('ação sem usuário (script/importação) fica como Sistema', async () => {
    const despesa = await finance.createExpense(companyId, {
      description: 'Importada',
      amountCents: 5000,
      paidByMemberId: rafaelle,
      splitMode: 'equity',
    });
    const eventos = await audit.listByEntity(companyId, 'movement', despesa.id, 'u1');
    expect(eventos[0]!.actorMemberId).toBeNull();
    expect(eventos[0]!.summary.startsWith('Sistema ')).toBe(true);
  });

  it('a leitura exige acesso à empresa', async () => {
    await expect(
      audit.listByCompany(companyId, 'intruso'),
    ).rejects.toThrow();
  });
});
