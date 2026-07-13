import type {
  CreateContributionInput,
  CreateExpenseInput,
  CreateSettlementPaymentInput,
  Expense,
  MemberBalance,
  Settlement,
  SettlementPayment,
} from '@plim/shared';
import { apiFetch } from '../lib/api';

export const financeApi = {
  listExpenses(companyId: string): Promise<Expense[]> {
    return apiFetch<Expense[]>(`/companies/${companyId}/expenses`);
  },

  getBalances(companyId: string): Promise<MemberBalance[]> {
    return apiFetch<MemberBalance[]>(`/companies/${companyId}/balances`);
  },

  getSettlements(companyId: string): Promise<Settlement[]> {
    return apiFetch<Settlement[]>(`/companies/${companyId}/settlements`);
  },

  createExpense(companyId: string, input: CreateExpenseInput): Promise<Expense> {
    return apiFetch<Expense>(`/companies/${companyId}/expenses`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  createContribution(companyId: string, input: CreateContributionInput): Promise<Expense> {
    return apiFetch<Expense>(`/companies/${companyId}/contributions`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  createSettlementPayment(companyId: string, input: CreateSettlementPaymentInput): Promise<SettlementPayment> {
    return apiFetch<SettlementPayment>(`/companies/${companyId}/settlement-payments`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  listSettlementPayments(companyId: string): Promise<SettlementPayment[]> {
    return apiFetch<SettlementPayment[]>(`/companies/${companyId}/settlement-payments`);
  },

  confirmMovement(companyId: string, expenseId: string): Promise<Expense> {
    return apiFetch<Expense>(`/companies/${companyId}/expenses/${expenseId}/confirm`, { method: 'POST' });
  },

  refuseMovement(companyId: string, expenseId: string): Promise<Expense> {
    return apiFetch<Expense>(`/companies/${companyId}/expenses/${expenseId}/refuse`, { method: 'POST' });
  },

  payExpense(companyId: string, expenseId: string, paidOn?: string): Promise<Expense> {
    return apiFetch<Expense>(`/companies/${companyId}/expenses/${expenseId}/pay`, {
      method: 'POST',
      body: JSON.stringify(paidOn ? { paidOn } : {}),
    });
  },

  /** Exclusão definitiva (irreversível); saldos e acertos são recalculados. */
  removeExpense(companyId: string, expenseId: string): Promise<void> {
    return apiFetch<void>(`/companies/${companyId}/expenses/${expenseId}`, {
      method: 'DELETE',
    });
  },
};

/** Converte "1.500,00" / "1500.50" → centavos inteiros. Null se inválido. */
export function parseMoneyToCents(raw: string): number | null {
  const clean = raw.trim().replace(/[^\d.,]/g, '');
  if (!clean) return null;
  const normalized = clean.includes(',')
    ? clean.replace(/\./g, '').replace(',', '.')
    : clean;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

/** Formata centavos na moeda da empresa (ex.: 150000 → "R$ 1.500,00"). */
export function formatMoney(cents: number, currencyCode: string | null): string {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: currencyCode ?? 'BRL',
    }).format(value);
  } catch {
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }
}
