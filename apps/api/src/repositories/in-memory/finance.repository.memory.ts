import { randomUUID } from 'node:crypto';
import type { ConfirmationStatus } from '@plim/shared';
import type { Expense, SettlementPayment } from '../../domain/finance';
import type { FinanceRepository } from '../finance.repository';

export class InMemoryFinanceRepository implements FinanceRepository {
  private expenses = new Map<string, Expense>();
  private payments = new Map<string, SettlementPayment>();

  async createPayment(data: Omit<SettlementPayment, 'id' | 'createdAt'>): Promise<SettlementPayment> {
    const payment: SettlementPayment = { ...data, id: randomUUID(), createdAt: new Date() };
    this.payments.set(payment.id, payment);
    return payment;
  }

  async listPayments(companyId: string): Promise<SettlementPayment[]> {
    return [...this.payments.values()]
      .filter((p) => p.companyId === companyId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async createExpense(data: Omit<Expense, 'id' | 'createdAt'>): Promise<Expense> {
    const expense: Expense = { ...data, id: randomUUID(), createdAt: new Date() };
    this.expenses.set(expense.id, expense);
    return expense;
  }

  async listExpenses(companyId: string): Promise<Expense[]> {
    return [...this.expenses.values()]
      .filter((e) => e.companyId === companyId)
      .sort((a, b) => (a.spentOn < b.spentOn ? 1 : a.spentOn > b.spentOn ? -1 : 0));
  }

  async findExpenseById(companyId: string, expenseId: string): Promise<Expense | null> {
    const e = this.expenses.get(expenseId);
    return e && e.companyId === companyId ? e : null;
  }

  async updateConfirmation(expenseId: string, status: ConfirmationStatus): Promise<Expense> {
    const e = this.expenses.get(expenseId);
    if (!e) throw new Error(`Movimentação ${expenseId} não encontrada`);
    const updated: Expense = { ...e, confirmationStatus: status };
    this.expenses.set(expenseId, updated);
    return updated;
  }

  async markExpensePaid(expenseId: string, paidOn: string): Promise<Expense> {
    const e = this.expenses.get(expenseId);
    if (!e) throw new Error(`Movimentação ${expenseId} não encontrada`);
    const updated: Expense = { ...e, paymentStatus: 'paid', dueDate: null, spentOn: paidOn };
    this.expenses.set(expenseId, updated);
    return updated;
  }

  async deleteExpense(expenseId: string): Promise<void> {
    this.expenses.delete(expenseId);
  }

  async findExpenseByRecurringCharge(costId: string, chargeOn: string): Promise<Expense | null> {
    return (
      [...this.expenses.values()].find(
        (e) => e.recurringCostId === costId && e.recurringChargeOn === chargeOn,
      ) ?? null
    );
  }
}
