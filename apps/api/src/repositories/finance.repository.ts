import type { ConfirmationStatus } from '@plim/shared';
import type { Expense, SettlementPayment } from '../domain/finance';

/** Acesso a dados do financeiro. Implementações: in-memory (dev/testes) e Supabase. */
export interface FinanceRepository {
  createExpense(data: Omit<Expense, 'id' | 'createdAt'>): Promise<Expense>;
  listExpenses(companyId: string): Promise<Expense[]>;
  findExpenseById(companyId: string, expenseId: string): Promise<Expense | null>;
  updateConfirmation(expenseId: string, status: ConfirmationStatus): Promise<Expense>;
  /** Marca uma conta a pagar como paga (paymentStatus='paid', spentOn=paidOn). */
  markExpensePaid(expenseId: string, paidOn: string): Promise<Expense>;
  /** Atualiza campos de uma movimentação (e substitui as partilhas se vierem). */
  updateExpense(
    expenseId: string,
    patch: Partial<Pick<Expense, 'description' | 'amountCents' | 'spentOn' | 'note' | 'paidByMemberId' | 'splitMode' | 'shares' | 'source' | 'account' | 'categoryId' | 'tags' | 'contactId'>>,
  ): Promise<Expense>;
  createPayment(data: Omit<SettlementPayment, 'id' | 'createdAt'>): Promise<SettlementPayment>;
  listPayments(companyId: string): Promise<SettlementPayment[]>;
  /** Exclusão definitiva de uma movimentação (as partilhas caem em cascata). */
  deleteExpense(expenseId: string): Promise<void>;
  /** Cobrança já materializada deste custo nesta competência (idempotência). */
  findExpenseByRecurringCharge(costId: string, chargeOn: string): Promise<Expense | null>;
}
