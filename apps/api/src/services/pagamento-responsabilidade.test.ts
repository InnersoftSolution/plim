import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryCompanyRepository } from '../repositories/in-memory/company.repository.memory';
import { InMemoryFinanceRepository } from '../repositories/in-memory/finance.repository.memory';
import { CompanyService } from './company.service';
import { FinanceService, paymentStatusOf, totalPago } from './finance.service';

/**
 * Pagamento e responsabilidade são duas contas diferentes.
 *
 * Os três cenários abaixo são os que a Rafaelle descreveu e que o modelo antigo
 * (um pagador que pagou 100%) não conseguia representar. Ver
 * docs/PAGAMENTO-E-RESPONSABILIDADE.md.
 */
describe('Pagamento × responsabilidade', () => {
  let companyService: CompanyService;
  let finance: FinanceService;
  let repo: InMemoryFinanceRepository;
  let companyId: string;
  let rafaelle: string;
  let gabi: string;
  let vanessa: string;

  /** Saldo líquido de um sócio (positivo = tem a receber). */
  async function saldo(memberId: string) {
    const balances = await finance.getBalances(companyId, 'u1');
    return balances.find((b) => b.memberId === memberId)!;
  }

  /** A soma dos saldos tem que ser zero: dívida de um é crédito de outro. */
  async function somaDosSaldos() {
    const balances = await finance.getBalances(companyId, 'u1');
    return balances.reduce((s, b) => s + b.netCents, 0);
  }

  beforeEach(async () => {
    const companyRepo = new InMemoryCompanyRepository();
    companyService = new CompanyService(companyRepo);
    repo = new InMemoryFinanceRepository();
    finance = new FinanceService(companyService, repo);
    const { company, ownerMember } = await companyService.createCompany(
      { name: 'OkiDoki' },
      { id: 'u1', fullName: 'Rafaelle', email: 'rafaelle@plim.work' },
    );
    companyId = company.id;
    rafaelle = ownerMember.id;
    await companyService.setMemberEquity(companyId, rafaelle, 50, 'u1');
    gabi = (
      await companyService.addMember(
        companyId,
        { fullName: 'Gabrielli', email: 'gabi@plim.work', equityPercent: 50 },
        'u1',
      )
    ).id;
    vanessa = '';
  });

  /* ── Cenário 1: cada uma pagou a sua parte, direto ao fornecedor ── */

  it('cada sócia paga a sua parte ao fornecedor e não sobra acerto nenhum', async () => {
    const despesa = await finance.createExpense(
      companyId,
      { description: 'Empresa X', amountCents: 200000, paidByMemberId: rafaelle, splitMode: 'equal' },
      'u1',
    );
    // A tela ainda registra um pagador só; aqui simulo o que a fatia C vai
    // permitir informar: as duas pagaram R$ 1.000 direto à empresa X.
    await repo.replaceExpensePayments(despesa.id, [
      { memberId: rafaelle, amountCents: 100000, paidOn: '2026-08-01' },
      { memberId: gabi, amountCents: 100000, paidOn: '2026-08-01' },
    ]);

    expect((await saldo(rafaelle)).netCents).toBe(0);
    expect((await saldo(gabi)).netCents).toBe(0);
    expect(await somaDosSaldos()).toBe(0);

    // E a despesa continua quitada perante o fornecedor.
    const atual = await finance.getMovement(companyId, despesa.id, 'u1');
    expect(atual.paymentStatus).toBe('paid');
    expect(totalPago(atual.payments)).toBe(200000);
  });

  /* ── Cenário 2: uma pagou tudo, a outra devolve depois ── */

  it('quem pagou tudo vira credora da parte da outra', async () => {
    await finance.createExpense(
      companyId,
      { description: 'Empresa Y', amountCents: 200000, paidByMemberId: rafaelle, splitMode: 'equal' },
      'u1',
    );

    expect((await saldo(rafaelle)).netCents).toBe(100000);
    expect((await saldo(gabi)).netCents).toBe(-100000);
    expect(await somaDosSaldos()).toBe(0);

    const acertos = await finance.getSettlements(companyId, 'u1');
    expect(acertos).toHaveLength(1);
    expect(acertos[0]).toMatchObject({
      fromMemberId: gabi,
      toMemberId: rafaelle,
      amountCents: 100000,
    });
  });

  it('o acerto entre sócias não muda quem pagou o fornecedor', async () => {
    const despesa = await finance.createExpense(
      companyId,
      { description: 'Empresa Y', amountCents: 200000, paidByMemberId: rafaelle, splitMode: 'equal' },
      'u1',
    );
    await finance.createSettlementPayment(
      companyId,
      { fromMemberId: gabi, toMemberId: rafaelle, amountCents: 100000 },
      'u1',
    );

    // Dívida quitada entre as sócias...
    expect((await saldo(rafaelle)).netCents).toBe(0);
    expect((await saldo(gabi)).netCents).toBe(0);

    // ...e o histórico continua dizendo que quem pagou a empresa Y foi a
    // Rafaelle. A transferência da Gabi não a substitui como pagadora.
    const atual = await finance.getMovement(companyId, despesa.id, 'u1');
    expect(atual.payments).toHaveLength(1);
    expect(atual.payments[0]).toMatchObject({ memberId: rafaelle, amountCents: 200000 });
  });

  /* ── Cenário 3: sócia nova assumindo despesas anteriores ── */

  it('sócia nova assume parte do passado sem mexer em quem pagou', async () => {
    const despesa = await finance.createExpense(
      companyId,
      { description: 'Advogado', amountCents: 200000, paidByMemberId: rafaelle, splitMode: 'equal' },
      'u1',
    );

    // Vanessa entra com 20% e assume as despesas anteriores. A redistribuição
    // da responsabilidade é da fatia F; aqui vale o efeito no saldo.
    // Abre espaço na participação antes: 40/40/20.
    await companyService.setMemberEquity(companyId, rafaelle, 40, 'u1');
    await companyService.setMemberEquity(companyId, gabi, 40, 'u1');
    vanessa = (
      await companyService.addMember(
        companyId,
        { fullName: 'Vanessa', email: 'vanessa@plim.work', equityPercent: 20 },
        'u1',
      )
    ).id;
    await finance.updateExpense(
      companyId,
      despesa.id,
      {
        splitMode: 'custom',
        customShares: [
          { memberId: rafaelle, shareCents: 80000 },
          { memberId: gabi, shareCents: 80000 },
          { memberId: vanessa, shareCents: 40000 },
        ],
      },
      'u1',
    );

    const atual = await finance.getMovement(companyId, despesa.id, 'u1');
    // Pagamento intocado: continua Rafaelle com os R$ 2.000.
    expect(atual.payments).toHaveLength(1);
    expect(atual.payments[0]).toMatchObject({ memberId: rafaelle, amountCents: 200000 });
    expect(atual.paymentStatus).toBe('paid');

    expect((await saldo(rafaelle)).netCents).toBe(120000);
    expect((await saldo(gabi)).netCents).toBe(-80000);
    expect((await saldo(vanessa)).netCents).toBe(-40000);
    expect(await somaDosSaldos()).toBe(0);

    const acertos = await finance.getSettlements(companyId, 'u1');
    expect(acertos.map((a) => [a.fromMemberId, a.amountCents])).toEqual(
      expect.arrayContaining([
        [gabi, 80000],
        [vanessa, 40000],
      ]),
    );
    expect(acertos.every((a) => a.toMemberId === rafaelle)).toBe(true);
  });

  /* ── Despesa paga pela metade ── */

  it('despesa parcial só acerta o dinheiro que já saiu do bolso', async () => {
    const despesa = await finance.createExpense(
      companyId,
      { description: 'Contador', amountCents: 200000, paidByMemberId: rafaelle, splitMode: 'equal' },
      'u1',
    );
    // Rafaelle pagou só metade ao fornecedor; a outra metade ainda deve.
    await repo.replaceExpensePayments(despesa.id, [
      { memberId: rafaelle, amountCents: 100000, paidOn: '2026-08-01' },
    ]);

    const atual = await finance.getMovement(companyId, despesa.id, 'u1');
    expect(atual.paymentStatus).toBe('partial');

    // Só R$ 1.000 saíram, então a Gabi deve metade DISSO, não da despesa cheia.
    // O resto vira responsabilidade dela quando for pago ao fornecedor.
    expect((await saldo(rafaelle)).netCents).toBe(50000);
    expect((await saldo(gabi)).netCents).toBe(-50000);
    expect(await somaDosSaldos()).toBe(0);
  });

  it('conta a pagar não gera pagamento nem acerto até ser paga', async () => {
    const conta = await finance.createExpense(
      companyId,
      {
        description: 'Aluguel',
        amountCents: 200000,
        paidByMemberId: rafaelle,
        splitMode: 'equal',
        paymentStatus: 'unpaid',
        dueDate: '2026-09-10',
      },
      'u1',
    );
    expect(conta.payments).toHaveLength(0);
    expect(await somaDosSaldos()).toBe(0);
    expect((await saldo(gabi)).netCents).toBe(0);

    const paga = await finance.payExpense(companyId, conta.id, '2026-09-09', 'u1');
    expect(paga.payments).toHaveLength(1);
    expect(paga.payments[0]).toMatchObject({ memberId: rafaelle, amountCents: 200000 });
    expect((await saldo(gabi)).netCents).toBe(-100000);
    expect(await somaDosSaldos()).toBe(0);
  });

  /* ── Invariantes do dinheiro ── */

  it('mudar o valor da despesa mantém pagamento e responsabilidade coerentes', async () => {
    const despesa = await finance.createExpense(
      companyId,
      { description: 'Advogado', amountCents: 320000, paidByMemberId: rafaelle, splitMode: 'equal' },
      'u1',
    );
    await finance.updateExpense(companyId, despesa.id, { amountCents: 64045 }, 'u1');

    const atual = await finance.getMovement(companyId, despesa.id, 'u1');
    expect(totalPago(atual.payments)).toBe(64045);
    expect(atual.shares.reduce((s, x) => s + x.shareCents, 0)).toBe(64045);
    // Nada ligado à movimentação passa do valor dela.
    expect(atual.payments.every((p) => p.amountCents <= 64045)).toBe(true);
    expect(await somaDosSaldos()).toBe(0);
  });

  it('paymentStatusOf deriva do que foi pago, e conta a pagar continua em aberto', () => {
    const base = { amountCents: 10000, paymentStatus: 'paid' as const };
    expect(paymentStatusOf({ ...base, payments: [{ amountCents: 10000 }] })).toBe('paid');
    expect(paymentStatusOf({ ...base, payments: [{ amountCents: 4000 }] })).toBe('partial');
    expect(
      paymentStatusOf({ ...base, payments: [{ amountCents: 6000 }, { amountCents: 4000 }] }),
    ).toBe('paid');
    // Sem pagamento registrado o campo gravado prevalece: é dado antigo, de
    // antes da 0033, e não uma despesa que ninguém pagou.
    expect(paymentStatusOf({ ...base, payments: [] })).toBe('paid');
    expect(
      paymentStatusOf({ amountCents: 10000, paymentStatus: 'unpaid', payments: [] }),
    ).toBe('unpaid');
  });
  /* ── Informar os pagadores pela API (fatia C) ── */

  describe('mais de um pagador informado na tela', () => {
    it('registra cada valor e não gera acerto quando cada uma pagou a sua parte', async () => {
      const despesa = await finance.createExpense(
        companyId,
        {
          description: 'Empresa X',
          amountCents: 200000,
          paidByMemberId: rafaelle,
          splitMode: 'equal',
          payments: [
            { memberId: rafaelle, amountCents: 100000 },
            { memberId: gabi, amountCents: 100000 },
          ],
        },
        'u1',
      );
      expect(despesa.payments).toHaveLength(2);
      expect(totalPago(despesa.payments)).toBe(200000);
      expect(await somaDosSaldos()).toBe(0);
      expect((await saldo(gabi)).netCents).toBe(0);
      expect(await finance.getSettlements(companyId, 'u1')).toHaveLength(0);
    });

    it('pagamento desigual gera acerto só da diferença', async () => {
      await finance.createExpense(
        companyId,
        {
          description: 'Empresa X',
          amountCents: 200000,
          paidByMemberId: rafaelle,
          splitMode: 'equal',
          payments: [
            { memberId: rafaelle, amountCents: 150000 },
            { memberId: gabi, amountCents: 50000 },
          ],
        },
        'u1',
      );
      expect((await saldo(rafaelle)).netCents).toBe(50000);
      expect((await saldo(gabi)).netCents).toBe(-50000);
      expect(await somaDosSaldos()).toBe(0);
    });

    it('recusa soma de pagamentos acima do valor da movimentação', async () => {
      await expect(
        finance.createExpense(
          companyId,
          {
            description: 'Errado',
            amountCents: 200000,
            paidByMemberId: rafaelle,
            splitMode: 'equal',
            payments: [
              { memberId: rafaelle, amountCents: 150000 },
              { memberId: gabi, amountCents: 100000 },
            ],
          },
          'u1',
        ),
      ).rejects.toMatchObject({ code: 'PAYMENTS_ABOVE_AMOUNT' });
    });

    it('recusa pagador que não é sócio da empresa', async () => {
      await expect(
        finance.createExpense(
          companyId,
          {
            description: 'Errado',
            amountCents: 200000,
            paidByMemberId: rafaelle,
            splitMode: 'equal',
            payments: [{ memberId: '00000000-0000-4000-8000-000000000000', amountCents: 200000 }],
          },
          'u1',
        ),
      ).rejects.toMatchObject({ code: 'MEMBER_NOT_FOUND' });
    });

    it('editar os pagadores substitui o histórico e o saldo acompanha', async () => {
      const despesa = await finance.createExpense(
        companyId,
        { description: 'Empresa X', amountCents: 200000, paidByMemberId: rafaelle, splitMode: 'equal' },
        'u1',
      );
      expect((await saldo(gabi)).netCents).toBe(-100000);

      await finance.updateExpense(
        companyId,
        despesa.id,
        {
          payments: [
            { memberId: rafaelle, amountCents: 100000 },
            { memberId: gabi, amountCents: 100000 },
          ],
        },
        'u1',
      );
      const atual = await finance.getMovement(companyId, despesa.id, 'u1');
      expect(atual.payments).toHaveLength(2);
      expect((await saldo(gabi)).netCents).toBe(0);
      expect(await somaDosSaldos()).toBe(0);
    });

    it('conta a pagar não aceita pagadores: nada saiu ainda', async () => {
      await expect(
        finance.createExpense(
          companyId,
          {
            description: 'Aluguel',
            amountCents: 200000,
            paidByMemberId: rafaelle,
            splitMode: 'equal',
            paymentStatus: 'unpaid',
            dueDate: '2026-09-10',
            payments: [{ memberId: rafaelle, amountCents: 200000 }],
          },
          'u1',
        ),
      ).rejects.toMatchObject({ code: 'UNPAID_WITH_PAYMENTS' });
    });
  });
  /* ── Jornada do sócio novo (fatia F) ── */

  describe('sócio novo herdando o passado', () => {
    /** Despesa antiga de R$ 2.000, paga pela Rafaelle, dividida 50/50. */
    async function despesaAntiga() {
      return finance.createExpense(
        companyId,
        {
          description: 'Advogado',
          amountCents: 200000,
          paidByMemberId: rafaelle,
          splitMode: 'equal',
          spentOn: '2026-07-01',
        },
        'u1',
      );
    }

    /** Vanessa entra com 20%, abrindo espaço na participação. */
    async function entraVanessa() {
      await companyService.setMemberEquity(companyId, rafaelle, 40, 'u1');
      await companyService.setMemberEquity(companyId, gabi, 40, 'u1');
      vanessa = (
        await companyService.addMember(
          companyId,
          { fullName: 'Vanessa', email: 'vanessa@plim.work', equityPercent: 20 },
          'u1',
        )
      ).id;
    }

    it('a prévia mostra a conta sem alterar nada', async () => {
      const despesa = await despesaAntiga();
      await entraVanessa();

      const previa = await finance.previewInheritance(
        companyId,
        { memberId: vanessa, since: '2026-08-01', mode: 'equity' },
        'u1',
      );
      expect(previa.expenseCount).toBe(1);
      expect(previa.periodTotalCents).toBe(200000);
      expect(previa.totalCents).toBe(40000); // 20% de R$ 2.000
      expect(previa.owedTo).toEqual([
        { memberId: rafaelle, fullName: 'Rafaelle', amountCents: 40000 },
      ]);

      // Prévia não escreve: a despesa continua como estava.
      const atual = await finance.getMovement(companyId, despesa.id, 'u1');
      expect(atual.shares.some((sh) => sh.memberId === vanessa)).toBe(false);
      expect((await saldo(vanessa)).netCents).toBe(0);
    });

    it('aplicar redistribui a responsabilidade sem tocar em quem pagou', async () => {
      const despesa = await despesaAntiga();
      await entraVanessa();
      await finance.applyInheritance(
        companyId,
        { memberId: vanessa, since: '2026-08-01', mode: 'equity' },
        'u1',
      );

      const atual = await finance.getMovement(companyId, despesa.id, 'u1');
      // Pagamento intocado (RN1).
      expect(atual.payments).toHaveLength(1);
      expect(atual.payments[0]).toMatchObject({ memberId: rafaelle, amountCents: 200000 });
      // Responsabilidade 40/40/20, fechando no valor.
      expect(atual.shares.reduce((soma, sh) => soma + sh.shareCents, 0)).toBe(200000);
      expect(atual.shares.find((sh) => sh.memberId === vanessa)).toMatchObject({
        shareCents: 40000,
        rule: 'inherited',
      });

      expect((await saldo(rafaelle)).netCents).toBe(120000);
      expect((await saldo(gabi)).netCents).toBe(-80000);
      expect((await saldo(vanessa)).netCents).toBe(-40000);
      expect(await somaDosSaldos()).toBe(0);
    });

    it('percentual à mão: o resto se redistribui entre quem já estava', async () => {
      const despesa = await despesaAntiga();
      await entraVanessa();
      await finance.applyInheritance(
        companyId,
        { memberId: vanessa, since: '2026-08-01', mode: 'percent', percent: 10 },
        'u1',
      );

      const atual = await finance.getMovement(companyId, despesa.id, 'u1');
      expect(atual.shares.find((sh) => sh.memberId === vanessa)!.shareCents).toBe(20000);
      expect(atual.shares.find((sh) => sh.memberId === rafaelle)!.shareCents).toBe(90000);
      expect(atual.shares.find((sh) => sh.memberId === gabi)!.shareCents).toBe(90000);
      expect(atual.shares.reduce((soma, sh) => soma + sh.shareCents, 0)).toBe(200000);
      expect(await somaDosSaldos()).toBe(0);
    });

    it('"não participa" não escreve nada: é o estado em que já está', async () => {
      const despesa = await despesaAntiga();
      await entraVanessa();
      const previa = await finance.applyInheritance(
        companyId,
        { memberId: vanessa, since: '2026-08-01', mode: 'none' },
        'u1',
      );
      expect(previa.totalCents).toBe(0);
      expect(previa.expenseCount).toBe(1);

      const atual = await finance.getMovement(companyId, despesa.id, 'u1');
      expect(atual.shares.some((sh) => sh.memberId === vanessa)).toBe(false);
      expect((await saldo(vanessa)).netCents).toBe(0);
    });

    it('não mexe em despesa posterior à entrada', async () => {
      await entraVanessa();
      const nova = await finance.createExpense(
        companyId,
        {
          description: 'Depois que ela entrou',
          amountCents: 100000,
          paidByMemberId: rafaelle,
          splitMode: 'equity',
          spentOn: '2026-08-15',
        },
        'u1',
      );
      const antes = await finance.getMovement(companyId, nova.id, 'u1');
      await finance.applyInheritance(
        companyId,
        { memberId: vanessa, since: '2026-08-01', mode: 'equity' },
        'u1',
      );
      const depois = await finance.getMovement(companyId, nova.id, 'u1');
      expect(depois.shares).toEqual(antes.shares);
    });

    it('a dívida vai para quem adiantou, na proporção do que cada um pagou', async () => {
      await finance.createExpense(
        companyId,
        {
          description: 'Empresa X',
          amountCents: 200000,
          paidByMemberId: rafaelle,
          splitMode: 'equal',
          spentOn: '2026-07-01',
          payments: [
            { memberId: rafaelle, amountCents: 150000 },
            { memberId: gabi, amountCents: 50000 },
          ],
        },
        'u1',
      );
      await entraVanessa();
      const previa = await finance.previewInheritance(
        companyId,
        { memberId: vanessa, since: '2026-08-01', mode: 'equity' },
        'u1',
      );
      // R$ 400 dela, repartidos 75/25 conforme o que cada uma adiantou.
      expect(previa.totalCents).toBe(40000);
      expect(previa.owedTo).toEqual([
        { memberId: rafaelle, fullName: 'Rafaelle', amountCents: 30000 },
        { memberId: gabi, fullName: 'Gabrielli', amountCents: 10000 },
      ]);
    });

    it('conta a pagar fica de fora: ninguém adiantou nada ainda', async () => {
      await finance.createExpense(
        companyId,
        {
          description: 'Aluguel',
          amountCents: 200000,
          paidByMemberId: rafaelle,
          splitMode: 'equal',
          spentOn: '2026-07-01',
          paymentStatus: 'unpaid',
          dueDate: '2026-07-10',
        },
        'u1',
      );
      await entraVanessa();
      const previa = await finance.previewInheritance(
        companyId,
        { memberId: vanessa, since: '2026-08-01', mode: 'equity' },
        'u1',
      );
      expect(previa.expenseCount).toBe(0);
      expect(previa.totalCents).toBe(0);
    });
  });
  /* ── Acertos por origem com mais de um pagador (fatia G) ── */

  describe('acertos por movimentação', () => {
    it('cada credor vira um bloco próprio, com a dívida certa', async () => {
      await companyService.setMemberEquity(companyId, rafaelle, 40, 'u1');
      await companyService.setMemberEquity(companyId, gabi, 40, 'u1');
      vanessa = (
        await companyService.addMember(
          companyId,
          { fullName: 'Vanessa', email: 'vanessa@plim.work', equityPercent: 20 },
          'u1',
        )
      ).id;

      // R$ 5.000 pagos metade por cada uma; parte 40/40/20.
      await finance.createExpense(
        companyId,
        {
          description: 'Advogado',
          amountCents: 500000,
          paidByMemberId: rafaelle,
          splitMode: 'equity',
          payments: [
            { memberId: rafaelle, amountCents: 250000 },
            { memberId: gabi, amountCents: 250000 },
          ],
        },
        'u1',
      );

      const blocos = await finance.getMovementSettlements(companyId, 'u1');
      expect(blocos).toHaveLength(2);
      // Só a Vanessa deve, e deve R$ 500 para cada uma das duas.
      for (const bloco of blocos) {
        expect(bloco.debts).toHaveLength(1);
        expect(bloco.debts[0]).toMatchObject({ debtorId: vanessa, remainingCents: 50000 });
      }
      expect(blocos.map((b) => b.payerId).sort()).toEqual([rafaelle, gabi].sort());
      expect(blocos.reduce((soma, b) => soma + b.remainingCents, 0)).toBe(100000);
    });

    it('quem pagou a própria parte não aparece devendo', async () => {
      await finance.createExpense(
        companyId,
        {
          description: 'Empresa X',
          amountCents: 200000,
          paidByMemberId: rafaelle,
          splitMode: 'equal',
          payments: [
            { memberId: rafaelle, amountCents: 100000 },
            { memberId: gabi, amountCents: 100000 },
          ],
        },
        'u1',
      );
      expect(await finance.getMovementSettlements(companyId, 'u1')).toHaveLength(0);
    });
  });
});
