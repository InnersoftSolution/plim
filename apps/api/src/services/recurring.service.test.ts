import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryCompanyRepository } from '../repositories/in-memory/company.repository.memory';
import { InMemoryRecurringRepository } from '../repositories/in-memory/recurring.repository.memory';
import { CompanyService } from './company.service';
import { RecurringService, monthlyEquivalentCents } from './recurring.service';

describe('monthlyEquivalentCents', () => {
  it('mensal e outro mantêm o valor', () => {
    expect(monthlyEquivalentCents(10000, 'monthly')).toBe(10000);
    expect(monthlyEquivalentCents(10000, 'other')).toBe(10000);
  });
  it('anual divide por 12', () => {
    expect(monthlyEquivalentCents(120000, 'annual')).toBe(10000);
  });
  it('semanal multiplica por 52/12', () => {
    expect(monthlyEquivalentCents(1200, 'weekly')).toBe(5200); // 1200×52/12
  });
  it('trimestral divide por 3', () => {
    expect(monthlyEquivalentCents(30000, 'quarterly')).toBe(10000);
  });
  it('única vez não entra no custo mensal (0)', () => {
    expect(monthlyEquivalentCents(50000, 'once')).toBe(0);
  });
});

describe('RecurringService', () => {
  let companyService: CompanyService;
  let recurring: RecurringService;
  let companyId: string;
  let ownerId: string;

  beforeEach(async () => {
    companyService = new CompanyService(new InMemoryCompanyRepository());
    recurring = new RecurringService(companyService, new InMemoryRecurringRepository());
    const { company, ownerMember } = await companyService.createCompany(
      { name: 'plim' },
      { id: 'u1', fullName: 'Dona', email: 'dona@plim.work' },
    );
    companyId = company.id;
    ownerId = ownerMember.id;
  });

  it('cria custo ativo e soma no total mensal', async () => {
    await recurring.create(
      companyId,
      { name: 'Adobe', category: 'tools', amountCents: 14000, frequency: 'monthly', paidByMemberId: ownerId, splitMode: 'equity' as const },
      'u1',
    );
    await recurring.create(
      companyId,
      { name: 'Domínio', category: 'infrastructure', amountCents: 12000, frequency: 'annual', paidByMemberId: ownerId, splitMode: 'equity' as const },
      'u1',
    );
    const { costs, monthlyTotalCents } = await recurring.list(companyId, 'u1');
    expect(costs).toHaveLength(2);
    expect(monthlyTotalCents).toBe(14000 + 1000); // Adobe + Domínio/12
  });

  it('custo desativado sai do total, mas continua listado', async () => {
    const adobe = await recurring.create(
      companyId,
      { name: 'Adobe', category: 'tools', amountCents: 14000, frequency: 'monthly', paidByMemberId: ownerId, splitMode: 'equity' as const },
      'u1',
    );
    await recurring.update(companyId, adobe.id, { active: false }, 'u1');
    const { costs, monthlyTotalCents } = await recurring.list(companyId, 'u1');
    expect(costs).toHaveLength(1);
    expect(costs[0]!.active).toBe(false);
    expect(monthlyTotalCents).toBe(0);
  });

  it('rejeita pagador que não é membro', async () => {
    await expect(
      recurring.create(
        companyId,
        {
          name: 'Adobe',
          category: 'tools',
          amountCents: 14000,
          frequency: 'monthly',
          splitMode: 'equity' as const,
          paidByMemberId: '00000000-0000-4000-8000-000000000000',
        },
        'u1',
      ),
    ).rejects.toMatchObject({ code: 'MEMBER_NOT_FOUND' });
  });
});
