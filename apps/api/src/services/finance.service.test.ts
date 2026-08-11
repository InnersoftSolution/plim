import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryCompanyRepository } from '../repositories/in-memory/company.repository.memory';
import { InMemoryFinanceRepository } from '../repositories/in-memory/finance.repository.memory';
import { CompanyService } from './company.service';
import { FinanceService } from './finance.service';

describe('FinanceService', () => {
  let companyService: CompanyService;
  let companyRepo: InMemoryCompanyRepository;
  let finance: FinanceService;
  let companyId: string;
  let ownerId: string;
  let partnerId: string;
  /** Sócio COM conta própria (userId 'u2') — usado nos testes de confirmação. */
  let accountPartnerId: string;

  beforeEach(async () => {
    companyRepo = new InMemoryCompanyRepository();
    companyService = new CompanyService(companyRepo);
    finance = new FinanceService(companyService, new InMemoryFinanceRepository());
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
    // Sócio com conta vinculada (via repo direto — não há API de vínculo ainda).
    const withAccount = await companyRepo.addMember({
      companyId,
      userId: 'u2',
      fullName: 'Diego',
      email: 'diego@plim.work',
      functionalRole: null,
      role: 'partner',
      equityPercent: null,
      notes: null,
      status: 'active',
      invitationStatus: 'accepted',
    });
    accountPartnerId = withAccount.id;
  });

  const shareOf = (shares: { memberId: string; shareCents: number }[], id: string) =>
    shares.find((s) => s.memberId === id)?.shareCents;

  it('rateia por participação (60/40) e soma exato', async () => {
    const expense = await finance.createExpense(
      companyId,
      { description: 'Servidor', amountCents: 10000, paidByMemberId: ownerId, splitMode: 'equity' },
      'u1',
    );
    expect(shareOf(expense.shares, ownerId)).toBe(6000);
    expect(shareOf(expense.shares, partnerId)).toBe(4000);
    expect(expense.shares.reduce((s, x) => s + x.shareCents, 0)).toBe(10000);
  });

  it('rateia igualmente (equal) entre todos os sócios, soma exata', async () => {
    // 3 sócios: 10000/3 → 3334 + 3333 + 3333 = 10000 (método do maior resto).
    const expense = await finance.createExpense(
      companyId,
      { description: 'Almoço', amountCents: 10000, paidByMemberId: ownerId, splitMode: 'equal' },
      'u1',
    );
    expect(expense.shares).toHaveLength(3);
    expect(expense.shares.every((s) => s.shareCents === 3333 || s.shareCents === 3334)).toBe(true);
    expect(expense.shares.reduce((sum, s) => sum + s.shareCents, 0)).toBe(10000);
  });

  it('saldos: quem pagou a mais tem a receber; soma dos saldos é zero', async () => {
    // Dona paga 100,00, rateio 60/40 → ela deveria 60, então tem +40 a receber.
    await finance.createExpense(
      companyId,
      { description: 'Servidor', amountCents: 10000, paidByMemberId: ownerId, splitMode: 'equity' },
      'u1',
    );
    const balances = await finance.getBalances(companyId, 'u1');
    const owner = balances.find((b) => b.memberId === ownerId)!;
    const partner = balances.find((b) => b.memberId === partnerId)!;
    expect(owner.netCents).toBe(4000); // tem a receber
    expect(partner.netCents).toBe(-4000); // deve
    expect(balances.reduce((s, b) => s + b.netCents, 0)).toBe(0);
  });

  it('aporte: registra com kind=contribution, sem rateio', async () => {
    const aporte = await finance.createContribution(
      companyId,
      { description: 'Aporte inicial', amountCents: 500000, memberId: ownerId },
      'u1',
    );
    expect(aporte.kind).toBe('contribution');
    expect(aporte.shares).toEqual([]);
    expect(aporte.paidByMemberId).toBe(ownerId);
  });

  it('aporte NÃO entra nos saldos/acertos entre sócios (RB002)', async () => {
    await finance.createContribution(
      companyId,
      { description: 'Aporte inicial', amountCents: 500000, memberId: ownerId },
      'u1',
    );
    const balances = await finance.getBalances(companyId, 'u1');
    expect(balances.every((b) => b.netCents === 0)).toBe(true);
    const settlements = await finance.getSettlements(companyId, 'u1');
    expect(settlements).toEqual([]);
  });

  it('receita: registra kind=revenue, não divide e não vira gasto', async () => {
    const rev = await finance.createRevenue(
      companyId,
      { description: 'Mensalidade cliente', amountCents: 500000, receivedByMemberId: ownerId },
      'u1',
    );
    expect(rev.kind).toBe('revenue');
    expect(rev.shares).toEqual([]);
    // Não afeta saldos/acertos entre sócios.
    const balances = await finance.getBalances(companyId, 'u1');
    expect(balances.every((b) => b.netCents === 0)).toBe(true);
  });

  it('aporte reembolsável: gera partes e continua kind=contribution (fora do gasto)', async () => {
    const aporte = await finance.createContribution(
      companyId,
      { description: 'Adiantei tudo', amountCents: 30000, memberId: ownerId, reimbursable: true, splitMode: 'equal' },
      'u1',
    );
    expect(aporte.kind).toBe('contribution'); // não entra no total gasto
    expect(aporte.shares).toHaveLength(3);
    expect(aporte.shares.every((s) => s.shareCents === 10000)).toBe(true);
  });

  it('aporte reembolsável: cria dívida dos sócios ao autor (entra nos acertos)', async () => {
    await finance.createContribution(
      companyId,
      { description: 'Adiantei tudo', amountCents: 30000, memberId: ownerId, reimbursable: true, splitMode: 'equal' },
      'u1',
    );
    const balances = await finance.getBalances(companyId, 'u1');
    const owner = balances.find((b) => b.memberId === ownerId)!;
    const partner = balances.find((b) => b.memberId === partnerId)!;
    expect(owner.netCents).toBe(20000); // adiantou 30000, parte dele 10000 → +20000 a receber
    expect(partner.netCents).toBe(-10000); // deve a parte dele
    expect(balances.reduce((s, b) => s + b.netCents, 0)).toBe(0);
    const settlements = await finance.getSettlements(companyId, 'u1');
    expect(settlements.length).toBeGreaterThan(0);
  });

  it('aporte reembolsável: "já me pagou" registra o acerto na hora', async () => {
    await finance.createContribution(
      companyId,
      {
        description: 'Adiantei tudo',
        amountCents: 30000,
        memberId: ownerId,
        reimbursable: true,
        splitMode: 'equal',
        settledMemberIds: [partnerId],
      },
      'u1',
    );
    const balances = await finance.getBalances(companyId, 'u1');
    const partner = balances.find((b) => b.memberId === partnerId)!;
    expect(partner.netCents).toBe(0); // já acertou a parte dele
    const payments = await finance.listSettlementPayments(companyId, 'u1');
    expect(payments).toHaveLength(1);
    expect(payments[0]!.amountCents).toBe(10000);
  });

  it('acerto por origem: cada movimentação gera um bloco com as dívidas dos sócios', async () => {
    // Aporte reembolsável de 30000 (equal, 3 sócios) → cada sócio deve 10000.
    await finance.createContribution(
      companyId,
      { description: 'Aporte', amountCents: 30000, memberId: ownerId, reimbursable: true, splitMode: 'equal' },
      'u1',
    );
    // Despesa 10000 (60/40 → Sócio deve 4000) paga pela Dona.
    await finance.createExpense(
      companyId,
      { description: 'Servidor', amountCents: 10000, paidByMemberId: ownerId, splitMode: 'equity' },
      'u1',
    );
    const movs = await finance.getMovementSettlements(companyId, 'u1');
    expect(movs).toHaveLength(2);
    const aporte = movs.find((m) => m.description === 'Aporte')!;
    expect(aporte.payerId).toBe(ownerId);
    expect(aporte.debts.every((d) => d.originalCents === 10000 && d.remainingCents === 10000)).toBe(true);
    expect(aporte.debts.some((d) => d.debtorId === ownerId)).toBe(false); // autor não se deve
    const servidor = movs.find((m) => m.description === 'Servidor')!;
    const socioDebt = servidor.debts.find((d) => d.debtorId === partnerId)!;
    expect(socioDebt.remainingCents).toBe(4000);
  });

  it('acerto por origem: pagar amarrado à movimentação quita só aquela origem', async () => {
    const aporte = await finance.createContribution(
      companyId,
      { description: 'Aporte', amountCents: 30000, memberId: ownerId, reimbursable: true, splitMode: 'equal' },
      'u1',
    );
    const servidor = await finance.createExpense(
      companyId,
      { description: 'Servidor', amountCents: 10000, paidByMemberId: ownerId, splitMode: 'equity' },
      'u1',
    );
    // Sócio paga a parte do aporte (10000), amarrado ao aporte.
    await finance.createSettlementPayment(
      companyId,
      { fromMemberId: partnerId, toMemberId: ownerId, amountCents: 10000, expenseId: aporte.id },
      'u1',
    );
    const movs = await finance.getMovementSettlements(companyId, 'u1');
    const aporteAfter = movs.find((m) => m.movementId === aporte.id)!;
    const servidorAfter = movs.find((m) => m.movementId === servidor.id)!;
    // Só a dívida do aporte do Sócio some; a do servidor continua.
    expect(aporteAfter.debts.find((d) => d.debtorId === partnerId)!.remainingCents).toBe(0);
    expect(servidorAfter.debts.find((d) => d.debtorId === partnerId)!.remainingCents).toBe(4000);
  });

  it('acerto por origem: não deixa pagar mais que o pendente daquela movimentação', async () => {
    const servidor = await finance.createExpense(
      companyId,
      { description: 'Servidor', amountCents: 10000, paidByMemberId: ownerId, splitMode: 'equity' },
      'u1',
    );
    await expect(
      finance.createSettlementPayment(
        companyId,
        { fromMemberId: partnerId, toMemberId: ownerId, amountCents: 5000, expenseId: servidor.id },
        'u1',
      ),
    ).rejects.toMatchObject({ code: 'SETTLEMENT_OVERPAY' });
  });

  it('pagamento parcial reduz o acerto e vira "parcialmente pago"', async () => {
    // Dona paga 100,00 (60/40) → Sócio deve 40,00.
    await finance.createExpense(
      companyId,
      { description: 'Servidor', amountCents: 10000, paidByMemberId: ownerId, splitMode: 'equity' },
      'u1',
    );
    await finance.createSettlementPayment(
      companyId,
      { fromMemberId: partnerId, toMemberId: ownerId, amountCents: 1500, method: 'pix' },
      'u1',
    );
    const [s] = await finance.getSettlements(companyId, 'u1');
    expect(s!.amountCents).toBe(2500); // 4000 − 1500
    expect(s!.alreadyPaidCents).toBe(1500);
  });

  it('pagamento total quita: acerto some e saldos zeram', async () => {
    await finance.createExpense(
      companyId,
      { description: 'Servidor', amountCents: 10000, paidByMemberId: ownerId, splitMode: 'equity' },
      'u1',
    );
    await finance.createSettlementPayment(
      companyId,
      { fromMemberId: partnerId, toMemberId: ownerId, amountCents: 4000 },
      'u1',
    );
    expect(await finance.getSettlements(companyId, 'u1')).toEqual([]);
    const balances = await finance.getBalances(companyId, 'u1');
    expect(balances.every((b) => b.netCents === 0)).toBe(true);
  });

  it('rejeita pagamento maior que o pendente (overpay)', async () => {
    await finance.createExpense(
      companyId,
      { description: 'Servidor', amountCents: 10000, paidByMemberId: ownerId, splitMode: 'equity' },
      'u1',
    );
    await expect(
      finance.createSettlementPayment(
        companyId,
        { fromMemberId: partnerId, toMemberId: ownerId, amountCents: 5000 },
        'u1',
      ),
    ).rejects.toMatchObject({ code: 'SETTLEMENT_OVERPAY' });
  });

  it('rejeita pagamento sem acerto pendente entre o par', async () => {
    await expect(
      finance.createSettlementPayment(
        companyId,
        { fromMemberId: partnerId, toMemberId: ownerId, amountCents: 100 },
        'u1',
      ),
    ).rejects.toMatchObject({ code: 'SETTLEMENT_NOT_PENDING' });
  });

  it('mantém histórico de pagamentos', async () => {
    await finance.createExpense(
      companyId,
      { description: 'Servidor', amountCents: 10000, paidByMemberId: ownerId, splitMode: 'equity' },
      'u1',
    );
    await finance.createSettlementPayment(
      companyId,
      { fromMemberId: partnerId, toMemberId: ownerId, amountCents: 1000, method: 'pix', note: '1ª parte' },
      'u1',
    );
    await finance.createSettlementPayment(
      companyId,
      { fromMemberId: partnerId, toMemberId: ownerId, amountCents: 3000 },
      'u1',
    );
    const history = await finance.listSettlementPayments(companyId, 'u1');
    expect(history).toHaveLength(2);
    expect(history.reduce((s, p) => s + p.amountCents, 0)).toBe(4000);
  });

  it('confirmação: paga pelo próprio usuário entra confirmada', async () => {
    const e = await finance.createExpense(
      companyId,
      { description: 'Servidor', amountCents: 10000, paidByMemberId: ownerId, splitMode: 'equity' },
      'u1',
    );
    expect(e.confirmationStatus).toBe('confirmed');
  });

  it('confirmação: cadastrada em nome de OUTRO sócio (com conta) fica pendente e fora dos cálculos', async () => {
    const e = await finance.createExpense(
      companyId,
      { description: 'AWS', amountCents: 100000, paidByMemberId: accountPartnerId, splitMode: 'equal' },
      'u1', // dona cadastra dizendo que Diego pagou
    );
    expect(e.confirmationStatus).toBe('pending');
    // não entra nos saldos enquanto pendente
    const balances = await finance.getBalances(companyId, 'u1');
    expect(balances.every((b) => b.netCents === 0)).toBe(true);
  });

  it('confirmação: pagador confirma → entra nos cálculos', async () => {
    const e = await finance.createExpense(
      companyId,
      { description: 'AWS', amountCents: 100000, paidByMemberId: accountPartnerId, splitMode: 'equal' },
      'u1',
    );
    const confirmed = await finance.setConfirmation(companyId, e.id, 'confirmed', 'u2');
    expect(confirmed.confirmationStatus).toBe('confirmed');
    const balances = await finance.getBalances(companyId, 'u2');
    expect(balances.some((b) => b.netCents !== 0)).toBe(true); // agora conta
  });

  it('confirmação: só o pagador pode confirmar (403 para outro usuário)', async () => {
    const e = await finance.createExpense(
      companyId,
      { description: 'AWS', amountCents: 100000, paidByMemberId: accountPartnerId, splitMode: 'equal' },
      'u1',
    );
    await expect(finance.setConfirmation(companyId, e.id, 'confirmed', 'u1')).rejects.toMatchObject({
      code: 'NOT_THE_PAYER',
    });
  });

  it('confirmação: recusada não entra nos cálculos', async () => {
    const e = await finance.createExpense(
      companyId,
      { description: 'AWS', amountCents: 100000, paidByMemberId: accountPartnerId, splitMode: 'equal' },
      'u1',
    );
    const refused = await finance.setConfirmation(companyId, e.id, 'refused', 'u2');
    expect(refused.confirmationStatus).toBe('refused');
    const balances = await finance.getBalances(companyId, 'u2');
    expect(balances.every((b) => b.netCents === 0)).toBe(true);
  });

  it('aporte: rejeita sócio inexistente', async () => {
    await expect(
      finance.createContribution(
        companyId,
        { description: 'Aporte', amountCents: 1000, memberId: '00000000-0000-4000-8000-000000000000' },
        'u1',
      ),
    ).rejects.toMatchObject({ code: 'MEMBER_NOT_FOUND' });
  });

  it('custom: aceita partes que somam o total', async () => {
    const expense = await finance.createExpense(
      companyId,
      {
        description: 'Rateio combinado',
        amountCents: 10000,
        paidByMemberId: ownerId,
        splitMode: 'custom',
        customShares: [
          { memberId: ownerId, shareCents: 7000 },
          { memberId: partnerId, shareCents: 3000 },
        ],
      },
      'u1',
    );
    expect(shareOf(expense.shares, ownerId)).toBe(7000);
  });

  it('custom: rejeita partes que não somam o total', async () => {
    await expect(
      finance.createExpense(
        companyId,
        {
          description: 'Errado',
          amountCents: 10000,
          paidByMemberId: ownerId,
          splitMode: 'custom',
          customShares: [
            { memberId: ownerId, shareCents: 7000 },
            { memberId: partnerId, shareCents: 2000 },
          ],
        },
        'u1',
      ),
    ).rejects.toMatchObject({ code: 'SPLIT_SUM_MISMATCH' });
  });

  it('rejeita pagador que não é sócio', async () => {
    await expect(
      finance.createExpense(
        companyId,
        {
          description: 'X',
          amountCents: 1000,
          paidByMemberId: '00000000-0000-0000-0000-000000000000',
          splitMode: 'equity',
        },
        'u1',
      ),
    ).rejects.toMatchObject({ code: 'MEMBER_NOT_FOUND' });
  });

  it('barra quem não é membro da empresa', async () => {
    await expect(
      finance.createExpense(
        companyId,
        { description: 'X', amountCents: 1000, paidByMemberId: ownerId, splitMode: 'equity' },
        'intruso',
      ),
    ).rejects.toMatchObject({ code: 'NOT_A_MEMBER' });
  });

  /* ── contas a pagar (vencimento) ── */

  it('conta a pagar exige data de vencimento', async () => {
    await expect(
      finance.createExpense(
        companyId,
        { description: 'Domínio', amountCents: 5000, paidByMemberId: ownerId, splitMode: 'equity', paymentStatus: 'unpaid' },
        'u1',
      ),
    ).rejects.toMatchObject({ code: 'DUE_DATE_REQUIRED' });
  });

  it('conta a pagar NÃO entra no total gasto até ser paga', async () => {
    await finance.createExpense(
      companyId,
      {
        description: 'Contador',
        amountCents: 30000,
        paidByMemberId: ownerId,
        splitMode: 'equity',
        paymentStatus: 'unpaid',
        dueDate: '2026-08-10',
      },
      'u1',
    );
    const before = await finance.getBalances(companyId, 'u1');
    // Ninguém pagou nada ainda (só há conta a pagar).
    expect(before.every((b) => b.paidCents === 0 && b.owedCents === 0)).toBe(true);
  });

  it('marcar como paga faz a despesa entrar nos cálculos', async () => {
    const created = await finance.createExpense(
      companyId,
      {
        description: 'Contador',
        amountCents: 30000,
        paidByMemberId: ownerId,
        splitMode: 'equity',
        paymentStatus: 'unpaid',
        dueDate: '2026-08-10',
      },
      'u1',
    );
    expect(created.paymentStatus).toBe('unpaid');

    const paid = await finance.payExpense(companyId, created.id, '2026-08-05', 'u1');
    expect(paid.paymentStatus).toBe('paid');
    expect(paid.dueDate).toBeNull();
    expect(paid.spentOn).toBe('2026-08-05');

    const after = await finance.getBalances(companyId, 'u1');
    const owner = after.find((b) => b.memberId === ownerId)!;
    expect(owner.paidCents).toBe(30000);
  });

  it('não deixa pagar duas vezes', async () => {
    const created = await finance.createExpense(
      companyId,
      { description: 'Luz', amountCents: 8000, paidByMemberId: ownerId, splitMode: 'equity', paymentStatus: 'unpaid', dueDate: '2026-08-01' },
      'u1',
    );
    await finance.payExpense(companyId, created.id, undefined, 'u1');
    await expect(finance.payExpense(companyId, created.id, undefined, 'u1')).rejects.toMatchObject({
      code: 'ALREADY_PAID',
    });
  });

  it('sócio marcado como "já me pagou" entra com o acerto quitado', async () => {
    await finance.createExpense(
      companyId,
      {
        description: 'Coworking',
        amountCents: 10000,
        paidByMemberId: ownerId,
        splitMode: 'equity',
        settledMemberIds: [partnerId],
      },
      'u1',
    );
    const balances = await finance.getBalances(companyId, 'u1');
    const partner = balances.find((b) => b.memberId === partnerId)!;
    // Devia 4000 (40%), mas o acerto foi registrado junto: saldo zerado.
    expect(partner.netCents).toBe(0);
    const payments = await finance.listSettlementPayments(companyId, 'u1');
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      fromMemberId: partnerId,
      toMemberId: ownerId,
      amountCents: 4000,
    });
  });

  it('ignora "já me pagou" para o próprio pagador e para quem não tem parte', async () => {
    await finance.createExpense(
      companyId,
      {
        description: 'Coworking',
        amountCents: 10000,
        paidByMemberId: ownerId,
        splitMode: 'equity',
        // ownerId é o pagador; accountPartnerId tem participação nula (peso 0).
        settledMemberIds: [ownerId, accountPartnerId],
      },
      'u1',
    );
    const payments = await finance.listSettlementPayments(companyId, 'u1');
    expect(payments).toHaveLength(0);
  });

  it('conta a pagar não registra acerto na criação (ainda não houve pagamento)', async () => {
    await finance.createExpense(
      companyId,
      {
        description: 'Luz',
        amountCents: 8000,
        paidByMemberId: ownerId,
        splitMode: 'equity',
        paymentStatus: 'unpaid',
        dueDate: '2026-08-01',
        settledMemberIds: [partnerId],
      },
      'u1',
    );
    const payments = await finance.listSettlementPayments(companyId, 'u1');
    expect(payments).toHaveLength(0);
  });

  it('exclui a movimentação e recalcula os saldos sem ela', async () => {
    const created = await finance.createExpense(
      companyId,
      { description: 'Servidor', amountCents: 10000, paidByMemberId: ownerId, splitMode: 'equity' },
      'u1',
    );
    await finance.removeExpense(companyId, created.id, 'u1');
    const expenses = await finance.listExpenses(companyId, 'u1');
    expect(expenses.find((e) => e.id === created.id)).toBeUndefined();
    const balances = await finance.getBalances(companyId, 'u1');
    expect(balances.every((b) => b.paidCents === 0 && b.owedCents === 0)).toBe(true);
  });

  it('excluir movimentação inexistente devolve MOVEMENT_NOT_FOUND', async () => {
    await expect(
      finance.removeExpense(companyId, '00000000-0000-0000-0000-000000000000', 'u1'),
    ).rejects.toMatchObject({ code: 'MOVEMENT_NOT_FOUND' });
  });

  it('quem não é membro não consegue excluir movimentação', async () => {
    const created = await finance.createExpense(
      companyId,
      { description: 'Servidor', amountCents: 10000, paidByMemberId: ownerId, splitMode: 'equity' },
      'u1',
    );
    await expect(finance.removeExpense(companyId, created.id, 'u-estranho')).rejects.toMatchObject({
      code: 'NOT_A_MEMBER',
    });
  });

  it('editar valor recalcula o rateio da despesa', async () => {
    const created = await finance.createExpense(
      companyId,
      { description: 'Servidor', amountCents: 10000, paidByMemberId: ownerId, splitMode: 'equity' },
      'u1',
    );
    const updated = await finance.updateExpense(companyId, created.id, { amountCents: 20000 }, 'u1');
    expect(updated.amountCents).toBe(20000);
    expect(shareOf(updated.shares, ownerId)).toBe(12000); // 60%
    expect(shareOf(updated.shares, partnerId)).toBe(8000); // 40%
    expect(updated.shares.reduce((s, x) => s + x.shareCents, 0)).toBe(20000);
  });

  it('editar só a descrição não mexe no rateio', async () => {
    const created = await finance.createExpense(
      companyId,
      { description: 'Servidor', amountCents: 10000, paidByMemberId: ownerId, splitMode: 'equity' },
      'u1',
    );
    const updated = await finance.updateExpense(companyId, created.id, { description: 'Hosting' }, 'u1');
    expect(updated.description).toBe('Hosting');
    expect(shareOf(updated.shares, ownerId)).toBe(6000);
    expect(shareOf(updated.shares, partnerId)).toBe(4000);
  });

  it('mudar divisão para partes iguais recalcula', async () => {
    const created = await finance.createExpense(
      companyId,
      { description: 'Almoço', amountCents: 9000, paidByMemberId: ownerId, splitMode: 'equity' },
      'u1',
    );
    const updated = await finance.updateExpense(companyId, created.id, { splitMode: 'equal' }, 'u1');
    expect(updated.splitMode).toBe('equal');
    // 3 sócios, 9000/3 = 3000 cada.
    expect(updated.shares.every((s) => s.shareCents === 3000)).toBe(true);
  });

  describe('página de detalhe e desfazer acerto', () => {
    it('busca uma movimentação sozinha, sem precisar da lista', async () => {
      const created = await finance.createExpense(
        companyId,
        { description: 'Servidor', amountCents: 10000, paidByMemberId: ownerId, splitMode: 'equity' },
        'u1',
      );
      const detalhe = await finance.getMovement(companyId, created.id, 'u1');
      expect(detalhe.id).toBe(created.id);
      expect(detalhe.description).toBe('Servidor');
      expect(detalhe.shares).toHaveLength(created.shares.length);
    });

    it('movimentação inexistente devolve MOVEMENT_NOT_FOUND', async () => {
      await expect(
        finance.getMovement(companyId, '00000000-0000-0000-0000-000000000000', 'u1'),
      ).rejects.toMatchObject({ code: 'MOVEMENT_NOT_FOUND' });
    });

    it('marcar e desmarcar o acerto de um sócio devolve o saldo ao lugar', async () => {
      const created = await finance.createExpense(
        companyId,
        { description: 'Servidor', amountCents: 10000, paidByMemberId: ownerId, splitMode: 'equity' },
        'u1',
      );
      // Marcar: o sócio quita a parte dele (40% de 100,00).
      const acerto = await finance.createSettlementPayment(
        companyId,
        { fromMemberId: partnerId, toMemberId: ownerId, amountCents: 4000, expenseId: created.id },
        'u1',
      );
      let balances = await finance.getBalances(companyId, 'u1');
      expect(balances.find((b) => b.memberId === partnerId)?.netCents).toBe(0);

      // Desmarcar: volta a dever, sem sobrar registro.
      await finance.removeSettlementPayment(companyId, acerto.id, 'u1');
      expect(await finance.listSettlementPayments(companyId, 'u1')).toHaveLength(0);
      balances = await finance.getBalances(companyId, 'u1');
      expect(balances.find((b) => b.memberId === partnerId)?.netCents).toBe(-4000);
    });

    it('acerto inexistente devolve PAYMENT_NOT_FOUND', async () => {
      await expect(
        finance.removeSettlementPayment(companyId, '00000000-0000-0000-0000-000000000000', 'u1'),
      ).rejects.toMatchObject({ code: 'PAYMENT_NOT_FOUND' });
    });

    it('o acerto diz se nasceu junto com a movimentação ou foi lançado à parte', async () => {
      const auto = await finance.createExpense(
        companyId,
        {
          description: 'Com marcação',
          amountCents: 10000,
          paidByMemberId: ownerId,
          splitMode: 'equity',
          settledMemberIds: [partnerId],
        },
        'u1',
      );
      const manual = await finance.createExpense(
        companyId,
        { description: 'Sem marcação', amountCents: 10000, paidByMemberId: ownerId, splitMode: 'equity' },
        'u1',
      );
      await finance.createSettlementPayment(
        companyId,
        { fromMemberId: partnerId, toMemberId: ownerId, amountCents: 4000, expenseId: manual.id },
        'u1',
      );

      const pagamentos = await finance.listSettlementPayments(companyId, 'u1');
      expect(pagamentos.find((p) => p.expenseId === auto.id)?.isAuto).toBe(true);
      expect(pagamentos.find((p) => p.expenseId === manual.id)?.isAuto).toBe(false);
    });
  });

  describe('corrigir o valor com acerto já registrado', () => {
    it('acerto MANUAL não é reescrito: é dinheiro que mudou de mão', async () => {
      const created = await finance.createExpense(
        companyId,
        { description: 'Servidor', amountCents: 10000, paidByMemberId: ownerId, splitMode: 'equity' },
        'u1',
      );
      // Registrado à parte, em Acertos: o sócio transferiu 40,00 de verdade.
      await finance.createSettlementPayment(
        companyId,
        { fromMemberId: partnerId, toMemberId: ownerId, amountCents: 4000, paidOn: '2026-05-01', expenseId: created.id },
        'u1',
      );

      // A edição deixa de ser bloqueada (antes estourava HAS_SETTLEMENTS).
      const editada = await finance.updateExpense(companyId, created.id, { amountCents: 20000 }, 'u1');
      expect(editada.amountCents).toBe(20000);

      // O pagamento continua valendo 40,00: o histórico não é falsificado.
      const pagamentos = await finance.listSettlementPayments(companyId, 'u1');
      expect(pagamentos).toHaveLength(1);
      expect(pagamentos[0]!.amountCents).toBe(4000);
      // A parte nova é 80,00 (40% de 200,00), então ainda faltam 40,00.
      const balances = await finance.getBalances(companyId, 'u1');
      expect(balances.find((b) => b.memberId === partnerId)?.netCents).toBe(-4000);
    });

    it('acerto AUTOMÁTICO acompanha o novo valor', async () => {
      const created = await finance.createExpense(
        companyId,
        {
          description: 'Juridico',
          amountCents: 10000,
          paidByMemberId: ownerId,
          splitMode: 'equity',
          // "o sócio já me pagou" no próprio registro: acerto automático.
          settledMemberIds: [partnerId],
        },
        'u1',
      );
      expect((await finance.listSettlementPayments(companyId, 'u1'))[0]!.amountCents).toBe(4000);

      // Erro de digitação corrigido: 100,00 vira 3.200,00.
      await finance.updateExpense(companyId, created.id, { amountCents: 320000 }, 'u1');

      // O acerto vira a parte nova (40% de 3.200,00) e o saldo segue zerado.
      const pagamentos = await finance.listSettlementPayments(companyId, 'u1');
      expect(pagamentos).toHaveLength(1);
      expect(pagamentos[0]!.amountCents).toBe(128000);
      const balances = await finance.getBalances(companyId, 'u1');
      expect(balances.find((b) => b.memberId === partnerId)?.netCents).toBe(0);
    });

    it('acerto automático some quando quem acertou vira o pagador', async () => {
      const created = await finance.createExpense(
        companyId,
        {
          description: 'Juridico',
          amountCents: 10000,
          paidByMemberId: ownerId,
          splitMode: 'equity',
          settledMemberIds: [partnerId],
        },
        'u1',
      );
      // Agora quem pagou foi o próprio sócio: ninguém acerta consigo mesmo.
      await finance.updateExpense(companyId, created.id, { paidByMemberId: partnerId }, 'u1');
      expect(await finance.listSettlementPayments(companyId, 'u1')).toHaveLength(0);
    });

    it('editar a descrição continua não mexendo em acerto nenhum', async () => {
      const created = await finance.createExpense(
        companyId,
        {
          description: 'Servidor',
          amountCents: 10000,
          paidByMemberId: ownerId,
          splitMode: 'equity',
          settledMemberIds: [partnerId],
        },
        'u1',
      );
      const ok = await finance.updateExpense(companyId, created.id, { description: 'Hosting' }, 'u1');
      expect(ok.description).toBe('Hosting');
      expect((await finance.listSettlementPayments(companyId, 'u1'))[0]!.amountCents).toBe(4000);
    });
  });

  it('despesa guarda o contato (pago para quem) e a edição troca', async () => {
    const contactId = '11111111-1111-4111-8111-111111111111';
    const created = await finance.createExpense(
      companyId,
      { description: 'Servidor', amountCents: 10000, paidByMemberId: ownerId, splitMode: 'equity', contactId },
      'u1',
    );
    expect(created.contactId).toBe(contactId);
    const cleared = await finance.updateExpense(companyId, created.id, { contactId: null }, 'u1');
    expect(cleared.contactId).toBeNull();
  });

  it('editar movimentação inexistente devolve MOVEMENT_NOT_FOUND', async () => {
    await expect(
      finance.updateExpense(companyId, '00000000-0000-0000-0000-000000000000', { description: 'x' }, 'u1'),
    ).rejects.toMatchObject({ code: 'MOVEMENT_NOT_FOUND' });
  });

  describe('despesa que se repetiu (lançamento retroativo)', () => {
    /** Julho a dezembro de 2025, pagadores alternados entre os dois sócios. */
    const seisMeses = (a: string, b: string) => [
      { spentOn: '2025-07-01', paidByMemberId: a },
      { spentOn: '2025-08-01', paidByMemberId: b },
      { spentOn: '2025-09-01', paidByMemberId: a },
      { spentOn: '2025-10-01', paidByMemberId: b },
      { spentOn: '2025-11-01', paidByMemberId: a },
      { spentOn: '2025-12-01', paidByMemberId: b },
    ];

    it('cria uma movimentação por competência, com o pagador de cada mês', async () => {
      const criadas = await finance.createRepeatedExpense(
        companyId,
        {
          description: 'Hospedagem',
          amountCents: 10000,
          splitMode: 'equity',
          occurrences: seisMeses(ownerId, partnerId),
        },
        'u1',
      );

      expect(criadas).toHaveLength(6);
      expect(criadas.map((e) => e.spentOn)).toEqual([
        '2025-07-01',
        '2025-08-01',
        '2025-09-01',
        '2025-10-01',
        '2025-11-01',
        '2025-12-01',
      ]);
      expect(criadas.map((e) => e.paidByMemberId)).toEqual([
        ownerId,
        partnerId,
        ownerId,
        partnerId,
        ownerId,
        partnerId,
      ]);
      // Valor é de CADA ocorrência, não do período inteiro.
      expect(criadas.every((e) => e.amountCents === 10000)).toBe(true);
      // Retroativo é história: entra como já paga, nunca como conta a pagar.
      expect(criadas.every((e) => e.paymentStatus === 'paid')).toBe(true);
    });

    it('cada mês sai com o rateio da participação (60/40)', async () => {
      const [primeira] = await finance.createRepeatedExpense(
        companyId,
        {
          description: 'Hospedagem',
          amountCents: 10000,
          splitMode: 'equity',
          occurrences: [{ spentOn: '2025-07-01', paidByMemberId: ownerId }],
        },
        'u1',
      );
      expect(primeira!.shares.find((s) => s.memberId === ownerId)?.shareCents).toBe(6000);
      expect(primeira!.shares.find((s) => s.memberId === partnerId)?.shareCents).toBe(4000);
    });

    it('não vira custo recorrente: o custo mensal de hoje não muda', async () => {
      await finance.createRepeatedExpense(
        companyId,
        {
          description: 'Hospedagem',
          amountCents: 10000,
          splitMode: 'equity',
          occurrences: seisMeses(ownerId, partnerId),
        },
        'u1',
      );
      // Nenhuma delas aponta para um custo recorrente.
      const todas = await finance.listExpenses(companyId, 'u1');
      const retro = todas.filter((e) => e.description === 'Hospedagem');
      expect(retro).toHaveLength(6);
      expect(retro.every((e) => e.recurringCostId == null)).toBe(true);
    });

    it('recusa pagador que não é sócio da empresa, sem gravar nada', async () => {
      await expect(
        finance.createRepeatedExpense(
          companyId,
          {
            description: 'Hospedagem',
            amountCents: 10000,
            splitMode: 'equity',
            occurrences: [
              { spentOn: '2025-07-01', paidByMemberId: ownerId },
              { spentOn: '2025-08-01', paidByMemberId: '00000000-0000-0000-0000-000000000000' },
            ],
          },
          'u1',
        ),
      ).rejects.toMatchObject({ code: 'MEMBER_NOT_FOUND' });

      // A validação acontece ANTES de gravar: nem o mês válido entrou.
      const todas = await finance.listExpenses(companyId, 'u1');
      expect(todas.filter((e) => e.description === 'Hospedagem')).toHaveLength(0);
    });

    it('recusa a mesma competência duas vezes', async () => {
      await expect(
        finance.createRepeatedExpense(
          companyId,
          {
            description: 'Hospedagem',
            amountCents: 10000,
            splitMode: 'equity',
            occurrences: [
              { spentOn: '2025-07-01', paidByMemberId: ownerId },
              { spentOn: '2025-07-01', paidByMemberId: partnerId },
            ],
          },
          'u1',
        ),
      ).rejects.toMatchObject({ code: 'DUPLICATE_OCCURRENCE' });
    });

    it('quem já acertou entra como pago em todos os meses', async () => {
      await finance.createRepeatedExpense(
        companyId,
        {
          description: 'Aluguel',
          amountCents: 10000,
          splitMode: 'equity',
          occurrences: [
            { spentOn: '2025-07-01', paidByMemberId: ownerId, settledMemberIds: [partnerId] },
            { spentOn: '2025-08-01', paidByMemberId: ownerId, settledMemberIds: [partnerId] },
          ],
        },
        'u1',
      );
      // 40% de 100,00 em cada mês: dois acertos de 40,00, saldo zerado.
      const balances = await finance.getBalances(companyId, 'u1');
      expect(balances.find((b) => b.memberId === partnerId)?.netCents).toBe(0);
      const pagamentos = await finance.listSettlementPayments(companyId, 'u1');
      expect(pagamentos).toHaveLength(2);
      expect(pagamentos.every((p) => p.amountCents === 4000)).toBe(true);
    });

    it('sem acerto informado, o sócio fica devendo os dois meses', async () => {
      await finance.createRepeatedExpense(
        companyId,
        {
          description: 'Aluguel',
          amountCents: 10000,
          splitMode: 'equity',
          occurrences: [
            { spentOn: '2025-07-01', paidByMemberId: ownerId },
            { spentOn: '2025-08-01', paidByMemberId: ownerId },
          ],
        },
        'u1',
      );
      const balances = await finance.getBalances(companyId, 'u1');
      // Negativo = está devendo: 40,00 de julho mais 40,00 de agosto.
      expect(balances.find((b) => b.memberId === partnerId)?.netCents).toBe(-8000);
      expect(await finance.listSettlementPayments(companyId, 'u1')).toHaveLength(0);
    });

    it('no mês em que o próprio sócio pagou, ele não acerta consigo mesmo', async () => {
      await finance.createRepeatedExpense(
        companyId,
        {
          description: 'Aluguel',
          amountCents: 10000,
          splitMode: 'equity',
          occurrences: [
            // Julho: a dona pagou e o sócio já acertou com ela.
            { spentOn: '2025-07-01', paidByMemberId: ownerId, settledMemberIds: [partnerId] },
            // Agosto: quem pagou foi o sócio, então quem passa a dever é a dona,
            // e ela NÃO acertou. É o caso que a lista por pagador resolve.
            { spentOn: '2025-08-01', paidByMemberId: partnerId },
          ],
        },
        'u1',
      );
      // Um acerto só: o de julho, do sócio para a dona. A dívida da dona com o
      // sócio, criada em agosto, continua em aberto.
      const pagamentos = await finance.listSettlementPayments(companyId, 'u1');
      expect(pagamentos).toHaveLength(1);
      expect(pagamentos[0]).toMatchObject({
        fromMemberId: partnerId,
        toMemberId: ownerId,
        amountCents: 4000,
      });
    });

    it('acerto de um mês não vaza para o mês pago por outra pessoa', async () => {
      await finance.createRepeatedExpense(
        companyId,
        {
          description: 'Aluguel',
          amountCents: 10000,
          splitMode: 'equity',
          occurrences: [
            // Nos dois meses quem pagou foi o sócio; a dona só acertou julho.
            { spentOn: '2025-07-01', paidByMemberId: partnerId, settledMemberIds: [ownerId] },
            { spentOn: '2025-08-01', paidByMemberId: partnerId },
          ],
        },
        'u1',
      );
      const pagamentos = await finance.listSettlementPayments(companyId, 'u1');
      expect(pagamentos).toHaveLength(1);
      expect(pagamentos[0]).toMatchObject({
        fromMemberId: ownerId,
        toMemberId: partnerId,
        amountCents: 6000, // 60% de 100,00
      });
    });

    it('divisão igual reparte meio a meio em todos os meses', async () => {
      const criadas = await finance.createRepeatedExpense(
        companyId,
        {
          description: 'Contador',
          amountCents: 30000,
          splitMode: 'equal',
          occurrences: [
            { spentOn: '2025-07-01', paidByMemberId: ownerId },
            { spentOn: '2025-08-01', paidByMemberId: partnerId },
          ],
        },
        'u1',
      );
      for (const e of criadas) {
        const soma = e.shares.reduce((s, x) => s + x.shareCents, 0);
        expect(soma).toBe(30000);
        // 3 sócios (dona, sócio e Diego) dividindo igualmente.
        expect(new Set(e.shares.map((s) => s.shareCents)).size).toBeLessThanOrEqual(2);
      }
    });
  });
});
