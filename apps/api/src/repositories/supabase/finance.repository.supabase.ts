import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConfirmationStatus, ExpenseSplitMode, PaymentMethod, PaymentStatus } from '@plim/shared';
import type { Expense, SettlementPayment } from '../../domain/finance';
import type { FinanceRepository } from '../finance.repository';

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
    createdAt: new Date(row.created_at),
  };
}

interface ExpenseRow {
  id: string;
  company_id: string;
  kind: 'expense' | 'contribution';
  description: string;
  amount_cents: number;
  currency_code: string | null;
  paid_by_member_id: string;
  spent_on: string;
  split_mode: ExpenseSplitMode;
  note: string | null;
  payment_status: PaymentStatus | null;
  due_date: string | null;
  confirmation_status: ConfirmationStatus;
  created_by_member_id: string | null;
  created_at: string;
  expense_shares: { member_id: string; share_cents: number }[] | null;
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
    paymentStatus: row.payment_status ?? 'paid',
    dueDate: row.due_date,
    confirmationStatus: row.confirmation_status ?? 'confirmed',
    createdByMemberId: row.created_by_member_id,
    shares: (row.expense_shares ?? []).map((s) => ({
      memberId: s.member_id,
      shareCents: s.share_cents,
    })),
    createdAt: new Date(row.created_at),
  };
}

/** Acesso a dados do financeiro no Postgres (service role). Regras ficam no serviço. */
export class SupabaseFinanceRepository implements FinanceRepository {
  constructor(private readonly db: SupabaseClient) {}

  async createExpense(data: Omit<Expense, 'id' | 'createdAt'>): Promise<Expense> {
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
        payment_status: data.paymentStatus,
        due_date: data.dueDate,
        confirmation_status: data.confirmationStatus,
        created_by_member_id: data.createdByMemberId,
      })
      .select('id, created_at')
      .single<{ id: string; created_at: string }>();
    if (error || !row) throw new Error(`Falha ao criar despesa: ${error?.message}`);

    if (data.shares.length > 0) {
      const { error: sharesError } = await this.db.from('expense_shares').insert(
        data.shares.map((s) => ({
          expense_id: row.id,
          member_id: s.memberId,
          share_cents: s.shareCents,
        })),
      );
      if (sharesError) {
        // Evita despesa órfã sem rateio.
        await this.db.from('expenses').delete().eq('id', row.id);
        throw new Error(`Falha ao salvar rateio: ${sharesError.message}`);
      }
    }

    return { ...data, id: row.id, createdAt: new Date(row.created_at) };
  }

  async listExpenses(companyId: string): Promise<Expense[]> {
    const { data: rows, error } = await this.db
      .from('expenses')
      .select('*, expense_shares(member_id, share_cents)')
      .eq('company_id', companyId)
      .order('spent_on', { ascending: false })
      .order('created_at', { ascending: false })
      .returns<ExpenseRow[]>();
    if (error) throw new Error(`Falha ao listar despesas: ${error.message}`);
    return (rows ?? []).map(toExpense);
  }

  async findExpenseById(companyId: string, expenseId: string): Promise<Expense | null> {
    const { data: row, error } = await this.db
      .from('expenses')
      .select('*, expense_shares(member_id, share_cents)')
      .eq('company_id', companyId)
      .eq('id', expenseId)
      .maybeSingle<ExpenseRow>();
    if (error) throw new Error(`Falha ao buscar movimentação: ${error.message}`);
    return row ? toExpense(row) : null;
  }

  async updateConfirmation(expenseId: string, status: ConfirmationStatus): Promise<Expense> {
    const { data: row, error } = await this.db
      .from('expenses')
      .update({ confirmation_status: status })
      .eq('id', expenseId)
      .select('*, expense_shares(member_id, share_cents)')
      .single<ExpenseRow>();
    if (error || !row) throw new Error(`Falha ao atualizar confirmação: ${error?.message}`);
    return toExpense(row);
  }

  async markExpensePaid(expenseId: string, paidOn: string): Promise<Expense> {
    const { data: row, error } = await this.db
      .from('expenses')
      .update({ payment_status: 'paid', due_date: null, spent_on: paidOn })
      .eq('id', expenseId)
      .select('*, expense_shares(member_id, share_cents)')
      .single<ExpenseRow>();
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
      })
      .select()
      .single<PaymentRow>();
    if (error || !row) throw new Error(`Falha ao registrar pagamento: ${error?.message}`);
    return toPayment(row);
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
}
