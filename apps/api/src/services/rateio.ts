/**
 * Motor de rateio — divide um valor (em centavos inteiros) entre N partes,
 * proporcional aos pesos, garantindo que a SOMA DAS PARTES = VALOR TOTAL.
 *
 * O truque: cada parte recebe o piso (floor) do proporcional; os centavos que
 * faltam para fechar o total são distribuídos, um a um, para as partes com
 * maior "resto" fracionário (método do maior resto / largest remainder).
 * Assim nunca some nem sobra 1 centavo.
 */
export function computeSplit(amountCents: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  if (amountCents <= 0) return weights.map(() => 0);

  const totalWeight = weights.reduce((sum, w) => sum + Math.max(0, w), 0);

  // Sem pesos válidos (todos zero/negativos): divide igualmente.
  const exact =
    totalWeight <= 0
      ? weights.map(() => amountCents / n)
      : weights.map((w) => (amountCents * Math.max(0, w)) / totalWeight);

  const shares = exact.map((x) => Math.floor(x));
  const distributed = shares.reduce((sum, s) => sum + s, 0);
  let remaining = amountCents - distributed; // 0 .. n-1 centavos a distribuir

  // Índices ordenados pelo maior resto fracionário (desempate: menor índice).
  const byFrac = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  for (let k = 0; remaining > 0 && k < n; k++, remaining--) {
    shares[byFrac[k]!.i]! += 1;
  }
  return shares;
}
