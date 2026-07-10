import type { MemberBalance, Settlement } from '@plim/shared';

/**
 * Simplifica os saldos em acertos líquidos: quem deve paga direto a quem tem
 * a receber, sem dívidas cruzadas duplicadas (RB006).
 *
 * Entrada: saldos por sócio (netCents = pagou − parte devida).
 *   > 0 → tem a receber (credor);  < 0 → deve (devedor).
 * Saída: menor número possível de transferências que zeram todos os saldos.
 *
 * Método guloso: casa o maior devedor com o maior credor, repete. Como a soma
 * dos saldos é sempre 0, o processo termina com todos quitados.
 */
export function computeSettlements(balances: MemberBalance[]): Settlement[] {
  const debtors = balances
    .filter((b) => b.netCents < 0)
    .map((b) => ({ id: b.memberId, name: b.fullName, cents: -b.netCents }))
    .sort((a, b) => b.cents - a.cents);
  const creditors = balances
    .filter((b) => b.netCents > 0)
    .map((b) => ({ id: b.memberId, name: b.fullName, cents: b.netCents }))
    .sort((a, b) => b.cents - a.cents);

  const settlements: Settlement[] = [];
  let di = 0;
  let ci = 0;
  while (di < debtors.length && ci < creditors.length) {
    const debtor = debtors[di]!;
    const creditor = creditors[ci]!;
    const amount = Math.min(debtor.cents, creditor.cents);
    if (amount > 0) {
      settlements.push({
        fromMemberId: debtor.id,
        fromName: debtor.name,
        toMemberId: creditor.id,
        toName: creditor.name,
        amountCents: amount,
        // preenchido pelo FinanceService com o histórico de pagamentos do par
        alreadyPaidCents: 0,
      });
    }
    debtor.cents -= amount;
    creditor.cents -= amount;
    if (debtor.cents === 0) di += 1;
    if (creditor.cents === 0) ci += 1;
  }
  return settlements;
}
