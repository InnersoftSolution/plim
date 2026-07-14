import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryCompanyRepository } from '../repositories/in-memory/company.repository.memory';
import { InMemoryFinanceRepository } from '../repositories/in-memory/finance.repository.memory';
import { InMemoryRecurringRepository } from '../repositories/in-memory/recurring.repository.memory';
import { CompanyService } from './company.service';
import { FinanceService, nextChargeDate, lastDayOfMonthIso } from './finance.service';
import { RecurringService } from './recurring.service';

/** Data de N dias atrás (YYYY-MM-DD, UTC). */
function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

describe('nextChargeDate', () => {
  it('mensal preserva o dia e ajusta mês curto (31 jan → 28 fev)', () => {
    expect(nextChargeDate('2026-01-15', 'monthly')).toBe('2026-02-15');
    expect(nextChargeDate('2026-01-31', 'monthly')).toBe('2026-02-28');
  });
  it('semanal soma 7 dias; trimestral 3 meses; anual 12', () => {
    expect(nextChargeDate('2026-03-30', 'weekly')).toBe('2026-04-06');
    expect(nextChargeDate('2026-01-10', 'quarterly')).toBe('2026-04-10');
    expect(nextChargeDate('2026-02-05', 'annual')).toBe('2027-02-05');
  });
  it('pagamento único não tem próxima cobrança', () => {
    expect(nextChargeDate('2026-01-01', 'once')).toBeNull();
  });
});

describe('lastDayOfMonthIso', () => {
  it('retorna o último dia do mês (trata mês curto e bissexto)', () => {
    expect(lastDayOfMonthIso('2026-01-10')).toBe('2026-01-31');
    expect(lastDayOfMonthIso('2026-02-05')).toBe('2026-02-28');
    expect(lastDayOfMonthIso('2024-02-15')).toBe('2024-02-29');
    expect(lastDayOfMonthIso('2026-07-13')).toBe('2026-07-31');
  });
});

describe('Materialização de custos recorrentes', () => {
  let companyService: CompanyService;
  let recurringRepo: InMemoryRecurringRepository;
  let recurring: RecurringService;
  let finance: FinanceService;
  let companyId: string;
  let ownerId: string;
  let partnerId: string;

  beforeEach(async () => {
    companyService = new CompanyService(new InMemoryCompanyRepository());
    recurringRepo = new InMemoryRecurringRepository();
    recurring = new RecurringService(companyService, recurringRepo);
    finance = new FinanceService(companyService, new InMemoryFinanceRepository(), recurringRepo);
    const { company, ownerMember } = await companyService.createCompany(
      { name: 'plim' },
      { id: 'u1', fullName: 'Dona', email: 'dona@plim.work' },
    );
    companyId = company.id;
    ownerId = ownerMember.id;
    await companyService.setMemberEquity(companyId, ownerId, 60, 'u1');
    const partner = await companyService.addMember(
      companyId,
      { fullName: 'Sócio', email: 'socio@plim.work', equityPercent: 40 },
      'u1',
    );
    partnerId = partner.id;
  });

  const createCost = (over: Partial<Parameters<RecurringService['create']>[1]> = {}) =>
    recurring.create(
      companyId,
      {
        name: 'Servidor',
        category: 'infrastructure',
        amountCents: 10000,
        frequency: 'monthly',
        paidByMemberId: ownerId,
        splitMode: 'equity',
        nextChargeOn: daysAgo(1),
        ...over,
      },
      'u1',
    );

  it('cobrança vencida vira conta a pagar rateada e avança a próxima data', async () => {
    const cost = await createCost();
    const expenses = await finance.listExpenses(companyId, 'u1');
    const charge = expenses.find((e) => e.recurringCostId === cost.id)!;
    expect(charge).toBeDefined();
    expect(charge.paymentStatus).toBe('unpaid'); // nasce como conta a pagar
    expect(charge.dueDate).toBe(daysAgo(1));
    expect(charge.description).toBe('Servidor');
    const share = (id: string) => charge.shares.find((s) => s.memberId === id)?.shareCents;
    expect(share(ownerId)).toBe(6000);
    expect(share(partnerId)).toBe(4000);

    const { costs } = await recurring.list(companyId, 'u1');
    expect(costs[0]!.nextChargeOn).toBe(nextChargeDate(daysAgo(1), 'monthly'));
  });

  it('recorrente sem data começa a cobrar hoje (vira conta a pagar dividida)', async () => {
    const today = new Date().toISOString().slice(0, 10);
    // Passa nextChargeOn nulo explicitamente; o service deve assumir hoje.
    const cost = await createCost({ name: 'Elephant', nextChargeOn: null });
    // O próprio create já agenda para hoje.
    const { costs } = await recurring.list(companyId, 'u1');
    expect(costs.find((c) => c.id === cost.id)!.nextChargeOn).not.toBeNull();
    const expenses = await finance.listExpenses(companyId, 'u1');
    const charge = expenses.find((e) => e.recurringCostId === cost.id)!;
    expect(charge).toBeDefined();
    expect(charge.paymentStatus).toBe('unpaid');
    expect(charge.dueDate).toBe(today);
    expect(charge.shares.reduce((s, x) => s + x.shareCents, 0)).toBe(10000);
  });

  it('pagamento único sem data NÃO cobra sozinho', async () => {
    const cost = await createCost({ name: 'Taxa única', frequency: 'once', nextChargeOn: null });
    const expenses = await finance.listExpenses(companyId, 'u1');
    expect(expenses.filter((e) => e.recurringCostId === cost.id)).toHaveLength(0);
  });

  it('é idempotente: abrir o financeiro duas vezes não duplica a cobrança', async () => {
    const cost = await createCost();
    await finance.listExpenses(companyId, 'u1');
    const expenses = await finance.listExpenses(companyId, 'u1');
    expect(expenses.filter((e) => e.recurringCostId === cost.id)).toHaveLength(1);
  });

  it('cobrança do PRÓXIMO mês e custo inativo não materializam', async () => {
    const future = new Date();
    future.setUTCMonth(future.getUTCMonth() + 1, 1); // 1º dia do próximo mês (fora do mês atual)
    await createCost({ name: 'Futuro', nextChargeOn: future.toISOString().slice(0, 10) });
    const inativo = await createCost({ name: 'Inativo' });
    await recurring.update(companyId, inativo.id, { active: false }, 'u1');

    const expenses = await finance.listExpenses(companyId, 'u1');
    expect(expenses).toHaveLength(0);
  });

  it('cobrança que vence mais tarde no mês já vira conta a pagar (a vencer)', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const endOfMonth = lastDayOfMonthIso(today);
    const cost = await createCost({ name: 'Coworking', nextChargeOn: endOfMonth });
    const expenses = await finance.listExpenses(companyId, 'u1');
    const charge = expenses.find((e) => e.recurringCostId === cost.id)!;
    expect(charge).toBeDefined();
    expect(charge.paymentStatus).toBe('unpaid'); // conta a pagar do mês, antes do vencimento
    expect(charge.dueDate).toBe(endOfMonth);
    // A próxima cobrança avança para o mês seguinte (não duplica no mês atual).
    const { costs } = await recurring.list(companyId, 'u1');
    expect(costs.find((c) => c.id === cost.id)!.nextChargeOn).toBe(
      nextChargeDate(endOfMonth, 'monthly'),
    );
  });

  it('recupera atraso: 3 meses vencidos geram 3 cobranças de uma vez', async () => {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - 2);
    d.setUTCDate(d.getUTCDate() - 1);
    const cost = await createCost({ nextChargeOn: d.toISOString().slice(0, 10) });
    const expenses = await finance.listExpenses(companyId, 'u1');
    const charges = expenses.filter((e) => e.recurringCostId === cost.id);
    expect(charges.length).toBe(3);
    // Competências distintas (nenhuma duplicada).
    expect(new Set(charges.map((c) => c.recurringChargeOn)).size).toBe(3);
  });

  it('pagamento único materializa uma vez e encerra a agenda', async () => {
    const cost = await createCost({ name: 'Registro de marca', frequency: 'once' });
    await finance.listExpenses(companyId, 'u1');
    const expenses = await finance.listExpenses(companyId, 'u1');
    expect(expenses.filter((e) => e.recurringCostId === cost.id)).toHaveLength(1);
    const { costs } = await recurring.list(companyId, 'u1');
    expect(costs.find((c) => c.id === cost.id)!.nextChargeOn).toBeNull();
  });

  it('divisão em partes iguais quando splitMode = equal', async () => {
    const cost = await createCost({ splitMode: 'equal' });
    const expenses = await finance.listExpenses(companyId, 'u1');
    const charge = expenses.find((e) => e.recurringCostId === cost.id)!;
    expect(charge.shares.map((s) => s.shareCents).sort()).toEqual([5000, 5000]);
  });

  it('cobrança materializada e paga entra nos saldos e acertos', async () => {
    const cost = await createCost();
    const expenses = await finance.listExpenses(companyId, 'u1');
    const charge = expenses.find((e) => e.recurringCostId === cost.id)!;
    await finance.payExpense(companyId, charge.id, undefined, 'u1');

    const balances = await finance.getBalances(companyId, 'u1');
    const partner = balances.find((b) => b.memberId === partnerId)!;
    expect(partner.owedCents).toBe(4000); // sócio deve a parte dele ao pagador
  });
});
