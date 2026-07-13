import type {
  CreateContributionInput,
  CreateExpenseInput,
  CreateRevenueInput,
  CreateSettlementPaymentInput,
  Expense,
  MemberBalance,
  MovementSettlement,
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

  /** Acertos agrupados por movimentação de origem (RB006 por origem). */
  getMovementSettlements(companyId: string): Promise<MovementSettlement[]> {
    return apiFetch<MovementSettlement[]>(`/companies/${companyId}/movement-settlements`);
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

  createRevenue(companyId: string, input: CreateRevenueInput): Promise<Expense> {
    return apiFetch<Expense>(`/companies/${companyId}/revenues`, {
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

/**
 * Máscara de moeda BRL enquanto a pessoa digita.
 * Agrupa milhares com "." e usa "," para os centavos. Ex.:
 * "15000" → "15.000"; "15000,5" → "15.000,5"; "1500000" → "1.500.000".
 * Digitar só inteiros já formata (o valor é lido como reais, não centavos).
 */
export function maskMoneyBRL(raw: string): string {
  const s = raw.replace(/[^\d,]/g, '');
  const commaAt = s.indexOf(',');
  let intPart: string;
  let decPart: string | null = null;
  if (commaAt >= 0) {
    intPart = s.slice(0, commaAt).replace(/\D/g, '');
    decPart = s.slice(commaAt + 1).replace(/\D/g, '').slice(0, 2);
  } else {
    intPart = s.replace(/\D/g, '');
  }
  intPart = intPart.replace(/^0+(?=\d)/, '');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (decPart === null) return grouped;
  return `${grouped === '' ? '0' : grouped},${decPart}`;
}

/** Converte o valor mascarado ("15.000,50") em centavos. Null se inválido. */
export function maskedMoneyToCents(masked: string): number | null {
  const s = masked.replace(/\./g, '').replace(',', '.');
  if (!s) return null;
  const value = Number(s);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

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
