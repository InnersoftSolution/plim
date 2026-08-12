import type { ConfirmationStatus } from '@plim/shared';
import type { Expense, ExpensePayment, SettlementPayment } from '../domain/finance';

/**
 * Movimentação a criar. Os pagamentos vão sem id: quem gera é o banco, como
 * acontece com a própria movimentação.
 */
export type NewExpense = Omit<Expense, 'id' | 'createdAt' | 'payments'> & {
  payments: Omit<ExpensePayment, 'id'>[];
};

/** Acesso a dados do financeiro. Implementações: in-memory (dev/testes) e Supabase. */
export interface FinanceRepository {
  createExpense(data: NewExpense): Promise<Expense>;
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
  /**
   * Troca os PAGAMENTOS da movimentação (quem colocou dinheiro), não os acertos
   * entre sócios. Lista vazia = nada foi pago ainda.
   */
  replaceExpensePayments(
    expenseId: string,
    payments: Omit<ExpensePayment, 'id'>[],
  ): Promise<ExpensePayment[]>;
  createPayment(data: Omit<SettlementPayment, 'id' | 'createdAt'>): Promise<SettlementPayment>;
  listPayments(companyId: string): Promise<SettlementPayment[]>;
  /**
   * Ajuste de um acerto AUTOMÁTICO quando a movimentação de origem muda (novo
   * valor, nova divisão ou novo pagador). Nunca usado em acerto manual: aquilo
   * é dinheiro que mudou de mão e não se reescreve.
   */
  updatePayment(
    paymentId: string,
    patch: Partial<Pick<SettlementPayment, 'amountCents' | 'toMemberId' | 'note'>>,
  ): Promise<SettlementPayment>;
  /** Some com o acerto automático que deixou de fazer sentido (parte virou 0). */
  deletePayment(paymentId: string): Promise<void>;
  /** Exclusão definitiva de uma movimentação (as partilhas caem em cascata). */
  deleteExpense(expenseId: string): Promise<void>;
  /** Cobrança já materializada deste custo nesta competência (idempotência). */
  findExpenseByRecurringCharge(costId: string, chargeOn: string): Promise<Expense | null>;
}
