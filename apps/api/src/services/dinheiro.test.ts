import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryCompanyRepository } from '../repositories/in-memory/company.repository.memory';
import { InMemoryFinanceRepository } from '../repositories/in-memory/finance.repository.memory';
import { CompanyService } from './company.service';
import { FinanceService } from './finance.service';
import { computeSplit } from './rateio';

/**
 * Regra única de dinheiro do Plim, travada por teste:
 *
 *   Banco e cálculo → centavos como inteiro (R$ 640,45 = 64045).
 *   Reais → centavos acontece UMA vez, na entrada do valor digitado.
 *   Rateio, soma, subtração, saldo e acerto → só centavos inteiros.
 *   Divisão por 100 → só na apresentação.
 *
 * O caso de referência é R$ 640,45 pago inteiro por um sócio: nada relacionado
 * a essa movimentação pode passar de 64045 centavos.
 */
const TOTAL = 64045;

describe('Cadeia monetária dos acertos (centavos inteiros)', () => {
  let companyService: CompanyService;
  let finance: FinanceService;
  let companyId: string;
  let anaId: string;
  let biaId: string;

  beforeEach(async () => {
    const companyRepo = new InMemoryCompanyRepository();
    companyService = new CompanyService(companyRepo);
    finance = new FinanceService(companyService, new InMemoryFinanceRepository());
    const { company, ownerMember } = await companyService.createCompany(
      { name: 'plim' },
      { id: 'u1', fullName: 'Ana', email: 'ana@plim.work' },
    );
    companyId = company.id;
    anaId = ownerMember.id;
    await companyService.setMemberEquity(companyId, anaId, 50, 'u1');
    const bia = await companyService.addMember(
      companyId,
      { fullName: 'Bia', email: 'bia@plim.work', equityPercent: 50 },
      'u1',
    );
    biaId = bia.id;
  });

  const criar = () =>
    finance.createExpense(
      companyId,
      { description: 'Contador', amountCents: TOTAL, paidByMemberId: anaId, splitMode: 'equity' },
      'u1',
    );
  const parte = (shares: { memberId: string; shareCents: number }[], id: string) =>
    shares.find((s) => s.memberId === id)!.shareCents;

  // 1) valor original + 3) divisão + 4) quanto cada um deveria pagar
  it('divide 640,45 em 50/50 sem criar nem sumir centavo', async () => {
    const despesa = await criar();
    expect(despesa.amountCents).toBe(TOTAL);
    expect(Number.isInteger(despesa.amountCents)).toBe(true);

    const partes = despesa.shares.map((s) => s.shareCents).sort((a, b) => b - a);
    expect(partes).toEqual([32023, 32022]); // R$ 320,23 e R$ 320,22
    expect(partes[0]! + partes[1]!).toBe(TOTAL);
    expect(despesa.shares.every((s) => Number.isInteger(s.shareCents))).toBe(true);
    // Nenhuma parte isolada pode passar do total.
    expect(Math.max(...partes)).toBeLessThanOrEqual(TOTAL);
  });

  // 2) valor pago por cada sócio + 5) diferença + 6) saldo líquido
  it('saldo é pagou menos parte devida, e a soma dos saldos é zero', async () => {
    await criar();
    const saldos = await finance.getBalances(companyId, 'u1');
    const ana = saldos.find((b) => b.memberId === anaId)!;
    const bia = saldos.find((b) => b.memberId === biaId)!;

    expect(ana.paidCents).toBe(TOTAL);
    expect(bia.paidCents).toBe(0);
    expect(ana.owedCents + bia.owedCents).toBe(TOTAL);
    expect(ana.netCents).toBe(TOTAL - ana.owedCents); // 64045 − 32023 = 32022
    expect(bia.netCents).toBe(-bia.owedCents);
    expect(saldos.reduce((s, b) => s + b.netCents, 0)).toBe(0);
    // Ninguém tem a receber mais do que o total da movimentação.
    expect(Math.max(...saldos.map((b) => Math.abs(b.netCents)))).toBeLessThanOrEqual(TOTAL);
  });

  // 7) consolidação das dívidas
  it('consolida em um único acerto, nunca acima do total', async () => {
    await criar();
    const acertos = await finance.getSettlements(companyId, 'u1');
    expect(acertos).toHaveLength(1);
    expect(acertos[0]!.fromMemberId).toBe(biaId);
    expect(acertos[0]!.toMemberId).toBe(anaId);
    expect(acertos[0]!.amountCents).toBe(32022);
    expect(acertos[0]!.amountCents).toBeLessThanOrEqual(TOTAL);
    expect(acertos[0]!.alreadyPaidCents).toBe(0);
  });

  // 8) pagamentos registrados + 9) saldo restante
  it('pagamento parcial desconta em centavos e zera no acerto final', async () => {
    const despesa = await criar();
    await finance.createSettlementPayment(
      companyId,
      { fromMemberId: biaId, toMemberId: anaId, amountCents: 10000, expenseId: despesa.id },
      'u1',
    );

    const porOrigem = await finance.getMovementSettlements(companyId, 'u1');
    const divida = porOrigem[0]!.debts[0]!;
    expect(divida.originalCents).toBe(32022);
    expect(divida.paidCents).toBe(10000);
    expect(divida.remainingCents).toBe(22022);
    expect(divida.paidCents + divida.remainingCents).toBe(divida.originalCents);

    const acertos = await finance.getSettlements(companyId, 'u1');
    expect(acertos[0]!.amountCents).toBe(22022);

    await finance.createSettlementPayment(
      companyId,
      { fromMemberId: biaId, toMemberId: anaId, amountCents: 22022, expenseId: despesa.id },
      'u1',
    );
    expect(await finance.getSettlements(companyId, 'u1')).toHaveLength(0);
    const saldosFinais = await finance.getBalances(companyId, 'u1');
    expect(saldosFinais.every((b) => b.netCents === 0)).toBe(true);
  });

  it('nada ligado à movimentação passa do valor dela', async () => {
    const despesa = await criar();
    const porOrigem = await finance.getMovementSettlements(companyId, 'u1');
    const somaDividas = porOrigem[0]!.debts.reduce((s, d) => s + d.originalCents, 0);
    expect(somaDividas).toBeLessThan(despesa.amountCents); // falta a parte de quem pagou
    expect(somaDividas + parte(despesa.shares, anaId)).toBe(TOTAL);
  });

  /**
   * O erro clássico de dinheiro é o *100 aplicado duas vezes. Aqui isso salta:
   * o valor guardado tem que continuar sendo exatamente o que entrou.
   */
  it('o valor guardado é idêntico ao recebido, sem conversão a mais', async () => {
    for (const cents of [1, 99, 100, 32022, 64045, 320000, 99999999]) {
      const e = await finance.createExpense(
        companyId,
        { description: 'x', amountCents: cents, paidByMemberId: anaId, splitMode: 'equity' },
        'u1',
      );
      expect(e.amountCents).toBe(cents);
      expect(e.shares.reduce((s, x) => s + x.shareCents, 0)).toBe(cents);
    }
  });

  it('rateio fecha o total em qualquer combinação de pesos', () => {
    const casos: [number, number[]][] = [
      [64045, [50, 50]],
      [64045, [40, 40, 20]],
      [64045, [1, 1, 1]],
      [1, [1, 1, 1]],
      [100000, [33.33, 33.33, 33.34]],
      [999999, [70, 30]],
    ];
    for (const [total, pesos] of casos) {
      const partes = computeSplit(total, pesos);
      expect(partes.reduce((s, p) => s + p, 0)).toBe(total);
      expect(partes.every(Number.isInteger)).toBe(true);
      expect(partes.every((p) => p >= 0 && p <= total)).toBe(true);
    }
  });
});
