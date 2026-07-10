import type { Expense } from '@plim/shared';

/**
 * Helpers da jornada "Contas a pagar". Determinístico (R$0 de IA):
 * classifica despesas com vencimento em vencidas / a vencer.
 */

/** Janela (em dias) que consideramos "a vencer em breve". */
export const DUE_SOON_DAYS = 7;

export type DueBucket = 'overdue' | 'soon' | 'later';

/** Data de hoje em YYYY-MM-DD (fuso local). */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Dias entre hoje e o vencimento (negativo = já venceu). */
export function daysUntil(dueDate: string, today = todayIso()): number {
  const [ya, ma, da] = dueDate.split('-').map(Number);
  const [yb, mb, db] = today.split('-').map(Number);
  const a = Date.UTC(ya ?? 0, (ma ?? 1) - 1, da ?? 1);
  const b = Date.UTC(yb ?? 0, (mb ?? 1) - 1, db ?? 1);
  return Math.round((a - b) / 86_400_000);
}

/** É uma conta a pagar "viva" (não recusada/cancelada)? */
export function isPayable(e: Expense): boolean {
  return (
    e.kind === 'expense' &&
    e.paymentStatus === 'unpaid' &&
    e.confirmationStatus !== 'refused' &&
    e.confirmationStatus !== 'cancelled'
  );
}

/** Classifica uma conta a pagar pelo vencimento. Null se não for conta a pagar. */
export function dueBucket(e: Expense, today = todayIso()): DueBucket | null {
  if (!isPayable(e) || !e.dueDate) return null;
  const days = daysUntil(e.dueDate, today);
  if (days < 0) return 'overdue';
  if (days <= DUE_SOON_DAYS) return 'soon';
  return 'later';
}

/** Contas a pagar (todas), ordenadas por vencimento mais próximo primeiro. */
export function payableExpenses(expenses: Expense[]): Expense[] {
  return expenses
    .filter(isPayable)
    .sort((a, b) => (a.dueDate ?? '') < (b.dueDate ?? '') ? -1 : (a.dueDate ?? '') > (b.dueDate ?? '') ? 1 : 0);
}

/** Rótulo humano do vencimento: "venceu há 3 dias", "vence hoje", "vence em 5 dias". */
export function dueLabel(dueDate: string, today = todayIso()): string {
  const days = daysUntil(dueDate, today);
  if (days < 0) return `venceu há ${-days} ${-days === 1 ? 'dia' : 'dias'}`;
  if (days === 0) return 'vence hoje';
  if (days === 1) return 'vence amanhã';
  return `vence em ${days} dias`;
}
