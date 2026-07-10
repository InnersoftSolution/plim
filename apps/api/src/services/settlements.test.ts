import { describe, expect, it } from 'vitest';
import type { MemberBalance } from '@plim/shared';
import { computeSettlements } from './settlements';

function bal(memberId: string, fullName: string, netCents: number): MemberBalance {
  // paid/owed não importam para o acerto; só o net.
  return { memberId, fullName, paidCents: 0, owedCents: 0, netCents };
}

describe('computeSettlements', () => {
  it('sem saldos → nenhum acerto', () => {
    expect(computeSettlements([])).toEqual([]);
  });

  it('todos quitados → nenhum acerto', () => {
    const out = computeSettlements([bal('a', 'A', 0), bal('b', 'B', 0)]);
    expect(out).toEqual([]);
  });

  it('um devedor paga um credor', () => {
    const out = computeSettlements([bal('a', 'Rafaelle', 20000), bal('b', 'Diego', -20000)]);
    expect(out).toEqual([
      { fromMemberId: 'b', fromName: 'Diego', toMemberId: 'a', toName: 'Rafaelle', amountCents: 20000, alreadyPaidCents: 0 },
    ]);
  });

  it('simplifica dívidas cruzadas (RB006): líquido de R$300', () => {
    // Diego deve 500 a Rafaelle e Rafaelle deve 200 a Diego → net: Diego -300, Rafaelle +300
    const out = computeSettlements([bal('r', 'Rafaelle', 30000), bal('d', 'Diego', -30000)]);
    expect(out).toEqual([
      { fromMemberId: 'd', fromName: 'Diego', toMemberId: 'r', toName: 'Rafaelle', amountCents: 30000, alreadyPaidCents: 0 },
    ]);
  });

  it('um devedor cobre dois credores', () => {
    const out = computeSettlements([
      bal('a', 'A', 10000),
      bal('b', 'B', 5000),
      bal('c', 'C', -15000),
    ]);
    expect(out).toHaveLength(2);
    const total = out.reduce((s, x) => s + x.amountCents, 0);
    expect(total).toBe(15000);
    expect(out.every((x) => x.fromMemberId === 'c')).toBe(true);
  });

  it('a soma paga = a soma recebida (conserva o dinheiro)', () => {
    const balances = [bal('a', 'A', 12345), bal('b', 'B', -5000), bal('c', 'C', -7345)];
    const out = computeSettlements(balances);
    const total = out.reduce((s, x) => s + x.amountCents, 0);
    expect(total).toBe(12345);
  });
});
