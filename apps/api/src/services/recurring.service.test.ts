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

  describe('data final ("até quando")', () => {
    const base = (extra: Record<string, unknown> = {}) => ({
      name: 'Contrato semestral',
      category: 'tools' as const,
      amountCents: 10000,
      frequency: 'monthly' as const,
      splitMode: 'equity' as const,
      paidByMemberId: ownerId,
      ...extra,
    });

    it('guarda a data final e devolve na listagem', async () => {
      const cost = await recurring.create(
        companyId,
        base({ nextChargeOn: '2026-01-10', endsOn: '2026-06-10' }),
        'u1',
      );
      expect(cost.endsOn).toBe('2026-06-10');
      const { costs } = await recurring.list(companyId, 'u1');
      expect(costs[0]!.endsOn).toBe('2026-06-10');
    });

    it('sem data final continua como antes (nula)', async () => {
      const cost = await recurring.create(companyId, base(), 'u1');
      expect(cost.endsOn).toBeNull();
    });

    it('recusa fim antes do início', async () => {
      await expect(
        recurring.create(companyId, base({ nextChargeOn: '2026-06-10', endsOn: '2026-01-10' }), 'u1'),
      ).rejects.toMatchObject({ code: 'ENDS_BEFORE_START' });
    });

    it('recusa fim antes do início também ao editar só a data final', async () => {
      const cost = await recurring.create(companyId, base({ nextChargeOn: '2026-06-10' }), 'u1');
      await expect(
        recurring.update(companyId, cost.id, { endsOn: '2026-01-10' }, 'u1'),
      ).rejects.toMatchObject({ code: 'ENDS_BEFORE_START' });
    });

    it('custo já encerrado sai do custo mensal, mas continua na lista', async () => {
      await recurring.create(
        companyId,
        base({ name: 'Acabou', nextChargeOn: '2026-01-10', endsOn: '2026-06-10' }),
        'u1',
      );
      await recurring.create(companyId, base({ name: 'Segue', amountCents: 5000 }), 'u1');

      // "Hoje" depois do fim do primeiro: só o segundo continua custando.
      const depois = await recurring.list(companyId, 'u1', '2026-08-10');
      expect(depois.costs).toHaveLength(2);
      expect(depois.monthlyTotalCents).toBe(5000);

      // Antes do fim, os dois somam.
      const antes = await recurring.list(companyId, 'u1', '2026-03-10');
      expect(antes.monthlyTotalCents).toBe(15000);
    });

    it('no último dia ainda conta (o fim é inclusivo)', async () => {
      await recurring.create(
        companyId,
        base({ nextChargeOn: '2026-01-10', endsOn: '2026-06-10' }),
        'u1',
      );
      const noDia = await recurring.list(companyId, 'u1', '2026-06-10');
      expect(noDia.monthlyTotalCents).toBe(10000);
    });
  });
});
