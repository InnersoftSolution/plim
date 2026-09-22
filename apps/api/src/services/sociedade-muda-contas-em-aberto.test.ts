import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryCompanyRepository } from '../repositories/in-memory/company.repository.memory';
import { InMemoryFinanceRepository } from '../repositories/in-memory/finance.repository.memory';
import { CompanyService } from './company.service';
import { FinanceService } from './finance.service';

/**
 * Quando a sociedade muda, o passado fica: despesa paga não se reescreve.
 * Mas conta em aberto ainda não é passado, e a parte prevista de cada sócio
 * passa a seguir a participação nova. Foi o caso da OkiDoki: a sociedade
 * virou 33/33/33 e a Vanessa continuava prevista com 20% numa conta a pagar.
 */
describe('Sociedade muda: contas em aberto seguem a participação nova', () => {
  let companyService: CompanyService;
  let finance: FinanceService;
  let repo: InMemoryFinanceRepository;
  let companyId: string;
  let rafaelle: string;
  let gabi: string;
  let vanessa: string;

  const parte = (shares: { memberId: string; shareCents: number }[], id: string) =>
    shares.find((s) => s.memberId === id)?.shareCents;

  beforeEach(async () => {
    companyService = new CompanyService(new InMemoryCompanyRepository());
    repo = new InMemoryFinanceRepository();
    finance = new FinanceService(companyService, repo);
    companyService.onSociedadeMudou((id) => finance.realinhaContasEmAberto(id).then(() => undefined));

    const { company, ownerMember } = await companyService.createCompany(
      { name: 'OkiDoki' },
      { id: 'u1', fullName: 'Rafaelle', email: 'rafaelle@plim.work' },
    );
    companyId = company.id;
    rafaelle = ownerMember.id;
    await companyService.setMemberEquity(companyId, rafaelle, 40, 'u1');
    gabi = (await companyService.addMember(companyId, { fullName: 'Gabrielli', email: 'gabi@plim.work', equityPercent: 40 }, 'u1')).id;
    vanessa = (await companyService.addMember(companyId, { fullName: 'Vanessa', email: 'van@plim.work', equityPercent: 20 }, 'u1')).id;
  });

  it('conta em aberto passa a ser dividida pela participação nova', async () => {
    const conta = await finance.createExpense(
      companyId,
      { description: 'Jil', amountCents: 9900, paidByMemberId: rafaelle, splitMode: 'equity', paymentStatus: 'unpaid', dueDate: '2026-10-05' },
      'u1',
    );
    expect(parte(conta.shares, vanessa)).toBe(1980);

    await companyService.updateMember(companyId, rafaelle, { equityPercent: 33.34 }, 'u1');
    await companyService.updateMember(companyId, gabi, { equityPercent: 33.33 }, 'u1');
    await companyService.updateMember(companyId, vanessa, { equityPercent: 33.33 }, 'u1');

    const depois = await finance.getMovement(companyId, conta.id, 'u1');
    expect(parte(depois.shares, vanessa)).toBe(3300);
    expect(depois.shares.reduce((t, s) => t + s.shareCents, 0)).toBe(9900);
  });

  it('despesa já paga não muda: o passado fica como está', async () => {
    const paga = await finance.createExpense(
      companyId,
      { description: 'Marketing', amountCents: 10000, paidByMemberId: rafaelle, splitMode: 'equity' },
      'u1',
    );
    expect(parte(paga.shares, vanessa)).toBe(2000);

    await companyService.setMemberEquity(companyId, vanessa, 10, 'u1');

    const depois = await finance.getMovement(companyId, paga.id, 'u1');
    expect(parte(depois.shares, vanessa)).toBe(2000); // continua 20%, não 10%
  });

  it('divisão feita à mão fica como a pessoa decidiu', async () => {
    const conta = await finance.createExpense(
      companyId,
      {
        description: 'Curso da Gabi',
        amountCents: 10000,
        paidByMemberId: rafaelle,
        splitMode: 'custom',
        customShares: [
          { memberId: rafaelle, shareCents: 0 },
          { memberId: gabi, shareCents: 10000 },
          { memberId: vanessa, shareCents: 0 },
        ],
        paymentStatus: 'unpaid',
        dueDate: '2026-10-05',
      },
      'u1',
    );
    await companyService.setMemberEquity(companyId, vanessa, 10, 'u1');
    const depois = await finance.getMovement(companyId, conta.id, 'u1');
    expect(parte(depois.shares, gabi)).toBe(10000);
    expect(parte(depois.shares, vanessa)).toBe(0);
  });

  it('sócio que entra passa a ter parte nas contas em aberto', async () => {
    await companyService.setMemberEquity(companyId, vanessa, null, 'u1');
    const conta = await finance.createExpense(
      companyId,
      { description: 'Domínio', amountCents: 8000, paidByMemberId: rafaelle, splitMode: 'equity', paymentStatus: 'unpaid', dueDate: '2026-10-05' },
      'u1',
    );
    expect(parte(conta.shares, vanessa)).toBe(0);

    await companyService.setMemberEquity(companyId, vanessa, 20, 'u1');
    const depois = await finance.getMovement(companyId, conta.id, 'u1');
    expect(parte(depois.shares, vanessa)).toBe(1600);
  });
});
