import { describe, expect, it } from 'vitest';
import { computeSplit } from './rateio';

const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

describe('computeSplit', () => {
  it('divide igualmente quando os pesos são iguais', () => {
    expect(computeSplit(1000, [1, 1])).toEqual([500, 500]);
    expect(computeSplit(900, [1, 1, 1])).toEqual([300, 300, 300]);
  });

  it('distribui o centavo que sobra (10,00 em 3) sem perder nada', () => {
    const shares = computeSplit(1000, [1, 1, 1]); // 333,33 cada
    expect(sum(shares)).toBe(1000); // não some nem sobra
    expect(shares).toEqual([334, 333, 333]); // o resto vai para o 1º
  });

  it('rateia por participação (60/40)', () => {
    const shares = computeSplit(10000, [60, 40]);
    expect(shares).toEqual([6000, 4000]);
    expect(sum(shares)).toBe(10000);
  });

  it('rateia por participação quebrada (33,33 x3) somando exato', () => {
    const shares = computeSplit(10000, [33.33, 33.33, 33.33]);
    expect(sum(shares)).toBe(10000);
  });

  it('sempre soma o total, para vários valores e pesos', () => {
    const cases: Array<[number, number[]]> = [
      [1, [1, 1, 1]],
      [7, [1, 1, 1]],
      [12345, [50, 30, 20]],
      [99999, [1, 1, 1, 1, 1, 1, 1]],
      [1000, [33.33, 33.33, 33.34]],
    ];
    for (const [amount, weights] of cases) {
      expect(sum(computeSplit(amount, weights))).toBe(amount);
    }
  });

  it('pesos zerados → divide igualmente', () => {
    const shares = computeSplit(1000, [0, 0, 0]);
    expect(sum(shares)).toBe(1000);
    expect(shares).toEqual([334, 333, 333]);
  });

  it('valor zero → tudo zero', () => {
    expect(computeSplit(0, [60, 40])).toEqual([0, 0]);
  });

  it('lista vazia → vazio', () => {
    expect(computeSplit(1000, [])).toEqual([]);
  });
});
