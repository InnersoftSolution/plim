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

  it('bloqueia mudança estrutural quando já há acerto registrado', async () => {
    const created = await finance.createExpense(
      companyId,
      { description: 'Servidor', amountCents: 10000, paidByMemberId: ownerId, splitMode: 'equity' },
      'u1',
    );
    // Sócio paga a parte dele → vira acerto amarrado a essa despesa.
    await finance.createSettlementPayment(
      companyId,
      { fromMemberId: partnerId, toMemberId: ownerId, amountCents: 4000, paidOn: '2026-05-01', expenseId: created.id },
      'u1',
    );
    await expect(
      finance.updateExpense(companyId, created.id, { amountCents: 20000 }, 'u1'),
    ).rejects.toMatchObject({ code: 'HAS_SETTLEMENTS' });
    // Mas editar a descrição (não estrutural) continua permitido.
    const ok = await finance.updateExpense(companyId, created.id, { description: 'Hosting' }, 'u1');
    expect(ok.description).toBe('Hosting');
  });

  it('editar movimentação inexistente devolve MOVEMENT_NOT_FOUND', async () => {
    await expect(
      finance.updateExpense(companyId, '00000000-0000-0000-0000-000000000000', { description: 'x' }, 'u1'),
    ).rejects.toMatchObject({ code: 'MOVEMENT_NOT_FOUND' });
  });
});
