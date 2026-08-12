import type { Expense, ExpensePayment, ExpenseShare } from '@plim/shared';

/**
 * Acerto entre sócios DENTRO de uma movimentação: a diferença entre o que cada
 * pessoa pagou e a parte que cabia a ela.
 *
 * Espelha o cálculo do backend (finance.service.ts) para a tela conseguir
 * mostrar "Vanessa tem R$ 600 a regularizar, R$ 300 para cada uma" sem uma
 * chamada nova. Se as duas contas divergirem, a fonte da verdade é o backend.
 *
 * Tudo em centavos inteiros. Ver docs/PAGAMENTO-E-RESPONSABILIDADE.md.
 */

/** Soma dos pagamentos (o que de fato saiu do bolso de alguém). */
export function totalPago(payments: ExpensePayment[]): number {
  return payments.reduce((soma, p) => soma + p.amountCents, 0);
}

/**
 * Divide `total` entre os pesos garantindo que as partes somem exatamente o
 * total (método do maior resto). Mesma regra do rateio do backend.
 */
function dividir(total: number, pesos: number[]): number[] {
  const n = pesos.length;
  if (n === 0) return [];
  if (total <= 0) return pesos.map(() => 0);
  const somaPesos = pesos.reduce((s, p) => s + Math.max(0, p), 0);
  const exatos =
    somaPesos <= 0
      ? pesos.map(() => total / n)
      : pesos.map((p) => (total * Math.max(0, p)) / somaPesos);
  const partes = exatos.map((x) => Math.floor(x));
  let falta = total - partes.reduce((s, p) => s + p, 0);
  const ordem = exatos
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; falta > 0 && k < n; k++, falta--) partes[ordem[k]!.i]! += 1;
  return partes;
}

/**
 * Quanto da parte de cada sócio já está VALENDO nesta movimentação.
 *
 * Numa despesa quitada é a parte cheia. Numa paga pela metade é proporcional ao
 * que saiu: só se acerta entre sócios o dinheiro que alguém adiantou de fato, e
 * o resto continua sendo conta com o fornecedor (RN4a).
 */
export function partesEfetivas(shares: ExpenseShare[], pago: number): Map<string, number> {
  const cents = dividir(
    pago,
    shares.map((s) => s.shareCents),
  );
  return new Map(shares.map((s, i) => [s.memberId, cents[i]!]));
}

export interface AcertoDaMovimentacao {
  /** Quem tem valor a regularizar. */
  devedorId: string;
  /** Total que essa pessoa deve nesta movimentação (centavos). */
  totalCents: number;
  /** Para quem, e quanto de cada. */
  para: { credorId: string; cents: number }[];
}

/**
 * Quem deve para quem nesta movimentação, casando o maior devedor com o maior
 * credor até zerar (mesmo método guloso do backend).
 *
 * Quem pagou exatamente a parte dele não aparece: não deve nem tem a receber.
 */
export function acertosDaMovimentacao(movement: Expense): AcertoDaMovimentacao[] {
  const pago = totalPago(movement.payments);
  if (pago <= 0 || movement.shares.length === 0) return [];
  const efetivas = partesEfetivas(movement.shares, Math.min(pago, movement.amountCents));

  const saldos = movement.shares.map((s) => ({
    memberId: s.memberId,
    // pagou − cabia. Positivo = adiantou; negativo = precisa regularizar.
    cents:
      movement.payments
        .filter((p) => p.memberId === s.memberId)
        .reduce((soma, p) => soma + p.amountCents, 0) - (efetivas.get(s.memberId) ?? 0),
  }));
  // Quem pagou mas não tem parte (ex.: sócio que não participa da despesa)
  // também é credor: colocou dinheiro sem que o custo fosse dele.
  for (const p of movement.payments) {
    if (!saldos.some((s) => s.memberId === p.memberId)) {
      saldos.push({ memberId: p.memberId, cents: p.amountCents });
    }
  }

  const devedores = saldos
    .filter((s) => s.cents < 0)
    .map((s) => ({ id: s.memberId, cents: -s.cents }))
    .sort((a, b) => b.cents - a.cents);
  const credores = saldos
    .filter((s) => s.cents > 0)
    .map((s) => ({ id: s.memberId, cents: s.cents }))
    .sort((a, b) => b.cents - a.cents);

  const porDevedor = new Map<string, AcertoDaMovimentacao>();
  let di = 0;
  let ci = 0;
  while (di < devedores.length && ci < credores.length) {
    const devedor = devedores[di]!;
    const credor = credores[ci]!;
    const valor = Math.min(devedor.cents, credor.cents);
    if (valor > 0) {
      const atual = porDevedor.get(devedor.id) ?? {
        devedorId: devedor.id,
        totalCents: 0,
        para: [],
      };
      atual.totalCents += valor;
      atual.para.push({ credorId: credor.id, cents: valor });
      porDevedor.set(devedor.id, atual);
    }
    devedor.cents -= valor;
    credor.cents -= valor;
    if (devedor.cents === 0) di += 1;
    if (credor.cents === 0) ci += 1;
  }
  return [...porDevedor.values()];
}
