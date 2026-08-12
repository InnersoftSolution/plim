import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConfirmationStatus, ExpenseSplitMode, MovementKind, PaymentMethod, PaymentStatus } from '@plim/shared';
import type { Expense, ExpensePayment, ExpenseShare, SettlementPayment } from '../../domain/finance';
import type { FinanceRepository, NewExpense } from '../finance.repository';

/**
 * Ponte enquanto a migração 0033 não está aplicada em todos os bancos.
 *
 * As colunas de responsabilidade (participates, rule) nasceram na 0033. Se o
 * código subir antes dela, TODA consulta de movimentação passa a falhar e o
 * financeiro inteiro cai, porque o Postgres recusa a coluna inexistente em vez
 * de devolver nulo. Então o repositório tenta com as colunas, e na primeira
 * recusa passa a operar sem elas até o processo reiniciar.
 *
 * Isto sai na fatia G, quando a 0033 for passado em todo lugar.
 */
let temColunasDeResponsabilidade = true;

/** Erro de coluna que não existe (Postgres 42703) ou fora do cache (PGRST204). */
function colunaAusente(error: { code?: string } | null): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204';
}

function expenseSelect(): string {
  const rateio = temColunasDeResponsabilidade
    ? 'expense_shares(member_id, share_cents, participates, rule)'
    : 'expense_shares(member_id, share_cents)';
  return `*, ${rateio}, expense_payments(id, member_id, amount_cents, paid_on)`;
}

/** Roda a consulta e, se o banco recusar as colunas novas, repete sem elas. */
async function semColunasNovas<T extends { error: { code?: string } | null }>(
  run: () => PromiseLike<T>,
): Promise<T> {
  const primeira = await run();
  if (temColunasDeResponsabilidade && colunaAusente(primeira.error)) {
    temColunasDeResponsabilidade = false;
    return run();
  }
  return primeira;
}

/** Linha de rateio para gravar, com ou sem as colunas da 0033. */
function shareRow(s: ExpenseShare, expenseId: string): Record<string, unknown> {
  return temColunasDeResponsabilidade
    ? {
        expense_id: expenseId,
        member_id: s.memberId,
        share_cents: s.shareCents,
        participates: s.participates,
        rule: s.rule,
      }
    : { expense_id: expenseId, member_id: s.memberId, share_cents: s.shareCents };
}


interface PaymentRow {
  id: string;
  company_id: string;
  from_member_id: string;
  to_member_id: string;
  amount_cents: number;
  paid_on: string;
  method: PaymentMethod | null;
  note: string | null;
  status: 'confirmed' | 'cancelled';
  expense_id: string | null;
  is_auto: boolean | null;
  created_at: string;
}

function toPayment(row: PaymentRow): SettlementPayment {
  return {
    id: row.id,
    companyId: row.company_id,
    fromMemberId: row.from_member_id,
    toMemberId: row.to_member_id,
    amountCents: row.amount_cents,
    paidOn: row.paid_on,
    method: row.method,
    note: row.note,
    status: row.status,
    expenseId: row.expense_id ?? null,
    isAuto: row.is_auto ?? false,
    createdAt: new Date(row.created_at),
  };
}

interface ExpenseRow {
  id: string;
  company_id: string;
  kind: MovementKind;
  description: string;
  amount_cents: number;
  currency_code: string | null;
  paid_by_member_id: string;
  spent_on: string;
  split_mode: ExpenseSplitMode;
  note: string | null;
  source: string | null;
  account: string | null;
  payment_status: PaymentStatus | null;
  due_date: string | null;
  confirmation_status: ConfirmationStatus;
  created_by_member_id: string | null;
  recurring_cost_id: string | null;
  recurring_charge_on: string | null;
  category_id: string | null;
  tags: string[] | null;
  contact_id: string | null;
  created_at: string;
  expense_shares:
    | { member_id: string; share_cents: number; participates: boolean | null; rule: string | null }[]
    | null;
  expense_payments:
    | { id: string; member_id: string; amount_cents: number; paid_on: string }[]
    | null;
}

function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    companyId: row.company_id,
    kind: row.kind,
    description: row.description,
    amountCents: row.amount_cents,
    currencyCode: row.currency_code,
    paidByMemberId: row.paid_by_member_id,
    spentOn: row.spent_on,
    splitMode: row.split_mode,
    note: row.note,
    source: row.source ?? null,
    account: row.account ?? null,
    paymentStatus: row.payment_status ?? 'paid',
    dueDate: row.due_date,
    confirmationStatus: row.confirmation_status ?? 'confirmed',
    createdByMemberId: row.created_by_member_id,
    recurringCostId: row.recurring_cost_id ?? null,
    recurringChargeOn: row.recurring_charge_on ?? null,
    categoryId: row.category_id ?? null,
    tags: row.tags ?? [],
    contactId: row.contact_id ?? null,
    shares: (row.expense_shares ?? []).map((s) => ({
      memberId: s.member_id,
      shareCents: s.share_cents,
      // Linha gravada antes da 0033 não tem a decisão registrada: quem tem
      // parte estava participando, e a regra vinha do split_mode.
      participates: s.participates ?? true,
      rule: (s.rule as ExpenseShare['rule']) ?? null,
    })),
    payments: (row.expense_payments ?? [])
      .map((p) => ({
        id: p.id,
        memberId: p.member_id,
        amountCents: p.amount_cents,
        paidOn: p.paid_on,
      }))
      // Ordem estável por data: a tela lista "quem pagou" na ordem em que o
      // dinheiro saiu, e não na ordem que o Postgres devolveu.
      .sort((a, b) => (a.paidOn < b.paidOn ? -1 : a.paidOn > b.paidOn ? 1 : 0)),
    createdAt: new Date(row.created_at),
  };
}

/** Acesso a dados do financeiro no Postgres (service role). Regras ficam no serviço. */
export class SupabaseFinanceRepository implements FinanceRepository {
  constructor(private readonly db: SupabaseClient) {}

  async createExpense(data: NewExpense): Promise<Expense> {
    const { data: row, error } = await this.db
      .from('expenses')
      .insert({
        company_id: data.companyId,
        kind: data.kind,
        description: data.description,
        amount_cents: data.amountCents,
        currency_code: data.currencyCode,
        paid_by_member_id: data.paidByMemberId,
        spent_on: data.spentOn,
        split_mode: data.splitMode,
        note: data.note,
        source: data.source,
        account: data.account,
        payment_status: data.paymentStatus,
        due_date: data.dueDate,
        confirmation_status: data.confirmationStatus,
        created_by_member_id: data.createdByMemberId,
        recurring_cost_id: data.recurringCostId,
        recurring_charge_on: data.recurringChargeOn,
        category_id: data.categoryId,
        tags: data.tags,
        contact_id: data.contactId,
      })
      .select('id, created_at')
      .single<{ id: string; created_at: string }>();
    if (error || !row) throw new Error(`Falha ao criar despesa: ${error?.message}`);

    if (data.shares.length > 0) {
      const { error: sharesError } = await semColunasNovas(() =>
        this.db.from('expense_shares').insert(data.shares.map((s) => shareRow(s, row.id))),
      );
      if (sharesError) {
        // Evita despesa órfã sem rateio.
        await this.db.from('expenses').delete().eq('id', row.id);
        throw new Error(`Falha ao salvar rateio: ${sharesError.message}`);
      }
    }

    // Pagamento: quem colocou dinheiro. Vazio em conta a pagar, e isso é
    // significado, não falta de dado: soma zero é "ainda não saiu nada".
    const payments =
      data.payments.length > 0 ? await this.gravaPagamentos(row.id, data.payments, row.id) : [];

    return { ...data, payments, id: row.id, createdAt: new Date(row.created_at) };
  }

  /**
   * Insere os pagamentos e devolve com os ids do banco. `apagarExpenseId`
   * desfaz a movimentação recém-criada se a gravação falhar, para não sobrar
   * despesa sem registro de quem pagou.
   */
  private async gravaPagamentos(
    expenseId: string,
    payments: Omit<ExpensePayment, 'id'>[],
    apagarExpenseId?: string,
  ): Promise<ExpensePayment[]> {
    const { data: rows, error } = await this.db
      .from('expense_payments')
      .insert(
        payments.map((p) => ({
          expense_id: expenseId,
          member_id: p.memberId,
          amount_cents: p.amountCents,
          paid_on: p.paidOn,
        })),
      )
      .select('id, member_id, amount_cents, paid_on');
    if (error) {
      if (apagarExpenseId) await this.db.from('expenses').delete().eq('id', apagarExpenseId);
      throw new Error(`Falha ao salvar pagamento: ${error.message}`);
    }
    return (rows ?? []).map((p) => ({
      id: p.id,
      memberId: p.member_id,
      amountCents: p.amount_cents,
      paidOn: p.paid_on,
    }));
  }

  async replaceExpensePayments(
    expenseId: string,
    payments: Omit<ExpensePayment, 'id'>[],
  ): Promise<ExpensePayment[]> {
    const { error } = await this.db.from('expense_payments').delete().eq('expense_id', expenseId);
    if (error) throw new Error(`Falha ao atualizar pagamentos: ${error.message}`);
    if (payments.length === 0) return [];
    return this.gravaPagamentos(expenseId, payments);
  }

  async listExpenses(companyId: string): Promise<Expense[]> {
    const { data: rows, error } = await semColunasNovas(() =>
      this.db
        .from('expenses')
        .select(expenseSelect())
        .eq('company_id', companyId)
        .order('spent_on', { ascending: false })
        .order('created_at', { ascending: false })
        .returns<ExpenseRow[]>(),
    );
    if (error) throw new Error(`Falha ao listar despesas: ${error.message}`);
    return (rows ?? []).map(toExpense);
  }

  async findExpenseById(companyId: string, expenseId: string): Promise<Expense | null> {
    const { data: row, error } = await semColunasNovas(() =>
      this.db
        .from('expenses')
        .select(expenseSelect())
        .eq('company_id', companyId)
        .eq('id', expenseId)
        .maybeSingle<ExpenseRow>(),
    );
    if (error) throw new Error(`Falha ao buscar movimentação: ${error.message}`);
    return row ? toExpense(row) : null;
  }

  async updateConfirmation(expenseId: string, status: ConfirmationStatus): Promise<Expense> {
    const { data: row, error } = await semColunasNovas(() =>
      this.db
        .from('expenses')
        .update({ confirmation_status: status })
        .eq('id', expenseId)
        .select(expenseSelect())
        .single<ExpenseRow>(),
    );
    if (error || !row) throw new Error(`Falha ao atualizar confirmação: ${error?.message}`);
    return toExpense(row);
  }

  async markExpensePaid(expenseId: string, paidOn: string): Promise<Expense> {
    const { data: row, error } = await semColunasNovas(() =>
      this.db
        .from('expenses')
        .update({ payment_status: 'paid', due_date: null, spent_on: paidOn })
        .eq('id', expenseId)
        .select(expenseSelect())
        .single<ExpenseRow>(),
    );
    if (error || !row) throw new Error(`Falha ao marcar como paga: ${error?.message}`);
    return toExpense(row);
  }

  async createPayment(data: Omit<SettlementPayment, 'id' | 'createdAt'>): Promise<SettlementPayment> {
    const { data: row, error } = await this.db
      .from('settlement_payments')
      .insert({
        company_id: data.companyId,
        from_member_id: data.fromMemberId,
        to_member_id: data.toMemberId,
        amount_cents: data.amountCents,
        paid_on: data.paidOn,
        method: data.method,
        note: data.note,
        status: data.status,
        expense_id: data.expenseId,
        is_auto: data.isAuto,
      })
      .select()
      .single<PaymentRow>();
    if (error || !row) throw new Error(`Falha ao registrar pagamento: ${error?.message}`);
    return toPayment(row);
  }


  async updatePayment(
    paymentId: string,
    patch: Partial<Pick<SettlementPayment, 'amountCents' | 'toMemberId' | 'note'>>,
  ): Promise<SettlementPayment> {
    const row: Record<string, unknown> = {};
    if (patch.amountCents !== undefined) row.amount_cents = patch.amountCents;
    if (patch.toMemberId !== undefined) row.to_member_id = patch.toMemberId;
    if (patch.note !== undefined) row.note = patch.note;
    const { data, error } = await this.db
      .from('settlement_payments')
      .update(row)
      .eq('id', paymentId)
      .select()
      .single<PaymentRow>();
    if (error || !data) throw new Error(`Falha ao ajustar o acerto: ${error?.message}`);
    return toPayment(data);
  }

  async deletePayment(paymentId: string): Promise<void> {
    const { error } = await this.db.from('settlement_payments').delete().eq('id', paymentId);
    if (error) throw new Error(`Falha ao remover o acerto: ${error.message}`);
  }

  async listPayments(companyId: string): Promise<SettlementPayment[]> {
    const { data: rows, error } = await this.db
      .from('settlement_payments')
      .select()
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .returns<PaymentRow[]>();
    if (error) throw new Error(`Falha ao listar pagamentos: ${error.message}`);
    return (rows ?? []).map(toPayment);
  }

  async updateExpense(
    expenseId: string,
    patch: Partial<
      Pick<
        Expense,
        'description' | 'amountCents' | 'spentOn' | 'note' | 'paidByMemberId' | 'splitMode' | 'shares' | 'source' | 'account' | 'categoryId' | 'tags' | 'contactId'
      >
    >,
  ): Promise<Expense> {
    // Monta só as colunas presentes no patch (camelCase → snake_case).
    const row: Record<string, unknown> = {};
    if (patch.description !== undefined) row.description = patch.description;
    if (patch.amountCents !== undefined) row.amount_cents = patch.amountCents;
    if (patch.spentOn !== undefined) row.spent_on = patch.spentOn;
    if (patch.note !== undefined) row.note = patch.note;
    if (patch.paidByMemberId !== undefined) row.paid_by_member_id = patch.paidByMemberId;
    if (patch.splitMode !== undefined) row.split_mode = patch.splitMode;
    if (patch.source !== undefined) row.source = patch.source;
    if (patch.account !== undefined) row.account = patch.account;
    if (patch.categoryId !== undefined) row.category_id = patch.categoryId;
    if (patch.tags !== undefined) row.tags = patch.tags;
    if (patch.contactId !== undefined) row.contact_id = patch.contactId;

    if (Object.keys(row).length > 0) {
      const { error } = await this.db.from('expenses').update(row).eq('id', expenseId);
      if (error) throw new Error(`Falha ao atualizar movimentação: ${error.message}`);
    }

    // Rateio novo: apaga as partilhas antigas e insere as atuais.
    if (patch.shares) {
      const { error: delError } = await this.db
        .from('expense_shares')
        .delete()
        .eq('expense_id', expenseId);
      if (delError) throw new Error(`Falha ao atualizar rateio: ${delError.message}`);
      const novasPartes = patch.shares;
      if (novasPartes.length > 0) {
        const { error: insError } = await semColunasNovas(() =>
          this.db.from('expense_shares').insert(novasPartes.map((s) => shareRow(s, expenseId))),
        );
        if (insError) throw new Error(`Falha ao salvar rateio: ${insError.message}`);
      }
    }

    const { data: updated, error: readError } = await semColunasNovas(() =>
      this.db.from('expenses').select(expenseSelect()).eq('id', expenseId).single<ExpenseRow>(),
    );
    if (readError || !updated) throw new Error(`Falha ao reler movimentação: ${readError?.message}`);
    return toExpense(updated);
  }

  async deleteExpense(expenseId: string): Promise<void> {
    // As partilhas (expense_shares) caem em cascata pela FK.
    const { error } = await this.db.from('expenses').delete().eq('id', expenseId);
    if (error) throw new Error(`Falha ao excluir movimentação: ${error.message}`);
  }

  async findExpenseByRecurringCharge(costId: string, chargeOn: string): Promise<Expense | null> {
    const { data: row, error } = await semColunasNovas(() =>
      this.db
        .from('expenses')
        .select(expenseSelect())
        .eq('recurring_cost_id', costId)
        .eq('recurring_charge_on', chargeOn)
        .maybeSingle<ExpenseRow>(),
    );
    if (error) throw new Error(`Falha ao buscar cobrança gerada: ${error.message}`);
    return row ? toExpense(row) : null;
  }
}
