import type { ReactNode } from 'react';
import type { Category, Expense } from '@plim/shared';
import { formatMoney } from './financeApi';
import { daysUntil } from './due';
import './attention.css';

/**
 * "O que precisa da sua atenção": o cartão com tarja lateral por criticidade e
 * as linhas de conta a pagar, com o chip de vencimento.
 *
 * Mora aqui, e não dentro de uma página, porque a mesma lista aparece em
 * Movimentações e na Home. Cada tela tinha a sua versão e elas foram
 * divergindo: mesma informação com caras diferentes (Rafaelle, 1 set).
 */
/** Soma dos valores de um grupo de contas. */
export function somaContas(lista: Expense[]): number {
  return lista.reduce((t, e) => t + e.amountCents, 0);
}

export function AttGroup({
  tone,
  title,
  totalCents,
  children,
}: {
  /** 'warn' = tarja amarela (a vencer). */
  tone: 'overdue' | 'today' | 'soon' | 'warn';
  title: string;
  /** Soma do grupo: quanto sai se tudo isto for pago. */
  totalCents?: number;
  children: ReactNode;
}) {
  return (
    <div className={`fin2-attg fin2-attg--${tone}`}>
      <div className="fin2-attg__head">
        <span className="fin2-attg__cap">{title}</span>
        {totalCents != null && (
          <span className="fin2-attg__total">
            total <b data-financial>{formatMoney(totalCents)}</b>
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

export function AttRow({
  e,
  nameOf,
  categoryOf,
  busy,
  empresa,
  onOpen,
  onPay,
}: {
  e: Expense;
  nameOf: (id: string) => string;
  categoryOf: (id: string | null) => Category | null;
  busy: boolean;
  /** true = a cobrança vem de um custo recorrente pago pelo caixa da empresa. */
  empresa?: boolean;
  onOpen: () => void;
  onPay: () => void;
}) {
  return (
    <div className="fin2-attrow">
      <button type="button" className="fin2-attrow__info" onClick={onOpen}>
        <span className="fin2-attrow__t">{e.description}</span>
        <span className="fin2-attrow__c">
          {categoryOf(e.categoryId)?.name ?? 'Sem categoria'} ·{' '}
          {empresa ? 'sai do caixa da empresa' : `pagador previsto ${nameOf(e.paidByMemberId)}`}
        </span>
      </button>
      {e.dueDate && <StChip dueDate={e.dueDate} />}
      <span className="fin2-attrow__v" data-financial>{formatMoney(e.amountCents)}</span>
      <button type="button" className="fin2-ghostbtn" onClick={onPay} disabled={busy}>
        Marcar como paga
      </button>
    </div>
  );
}

/**
 * Chip de status de vencimento: sempre texto + ícone + cor de apoio, nunca só
 * cor (quem não distingue vermelho de verde lê a palavra).
 */
function StChip({ dueDate }: { dueDate: string }) {
  const d = daysUntil(dueDate);
  if (d < 0) {
    return (
      <span className="fin2-st fin2-st--overdue">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 8v5M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
        {-d} {-d === 1 ? 'dia' : 'dias'} em atraso
      </span>
    );
  }
  if (d === 0) {
    return (
      <span className="fin2-st fin2-st--today">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="6" /></svg>
        Vence hoje
      </span>
    );
  }
  return (
    <span className="fin2-st fin2-st--soon">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
      {d === 1 ? 'Vence amanhã' : `Vence em ${d} dias`}
    </span>
  );
}

