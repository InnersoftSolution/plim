#!/usr/bin/env node
/**
 * Corrige o VALOR de uma movimentação e recalcula tudo que depende dele:
 * as partes de cada sócio e os acertos automáticos ligados a ela.
 *
 * Serve para consertar um valor digitado com a ordem de grandeza errada, sem
 * apagar e recadastrar (o que perderia o histórico de quem já acertou).
 *
 * Refaz o mesmo que o FinanceService faz numa edição pela tela:
 *   1. grava o novo valor (em centavos inteiros);
 *   2. redivide entre os sócios pelo mesmo critério da movimentação;
 *   3. reajusta os acertos AUTOMÁTICOS ("já me pagou") para a nova parte;
 *   4. NÃO toca em acerto lançado à parte em Acertos (is_auto = false), que é
 *      dinheiro que mudou de mão de verdade.
 *
 * Uso (o padrão é simulação, não escreve nada):
 *   node scripts/corrigir-valor-movimentacao.mjs --id <uuid> --valor 3200,00
 *   node scripts/corrigir-valor-movimentacao.mjs --id <uuid> --valor 3200,00 --confirm
 *
 * Precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.
 */
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const arg = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : null;
};
const id = arg('--id');
const valorTexto = arg('--valor');
const confirmar = args.includes('--confirm');

if (!id || !valorTexto) {
  console.error('Uso: --id <uuid da movimentação> --valor <ex.: 3200,00> [--confirm]');
  process.exit(1);
}

/** "3.200,00" ou "3200" → 320000 centavos. Sem float no meio do caminho. */
function paraCentavos(texto) {
  const limpo = texto.trim().replace(/[^\d.,]/g, '');
  const [inteiro, decimal = ''] = limpo.includes(',')
    ? limpo.replace(/\./g, '').split(',')
    : [limpo.replace(/\./g, ''), ''];
  const centavos = (decimal + '00').slice(0, 2);
  const n = Number(`${inteiro || '0'}${centavos}`);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

const novoValor = paraCentavos(valorTexto);
if (novoValor == null) {
  console.error(`Valor inválido: "${valorTexto}". Use algo como 3200,00.`);
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Maior resto: as partes somam exatamente o total, sem centavo sobrando. */
function dividir(total, pesos) {
  const soma = pesos.reduce((s, p) => s + Math.max(0, p), 0);
  const exatos = soma <= 0
    ? pesos.map(() => total / pesos.length)
    : pesos.map((p) => (total * Math.max(0, p)) / soma);
  const partes = exatos.map((x) => Math.floor(x));
  let falta = total - partes.reduce((s, p) => s + p, 0);
  const ordem = exatos
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; falta > 0 && k < partes.length; k++, falta--) partes[ordem[k].i] += 1;
  return partes;
}

const { data: mov, error: errMov } = await db
  .from('expenses')
  .select('id, company_id, description, amount_cents, split_mode, paid_by_member_id, spent_on')
  .eq('id', id)
  .maybeSingle();
if (errMov) throw errMov;
if (!mov) {
  console.error('Movimentação não encontrada.');
  process.exit(1);
}

const { data: members } = await db
  .from('company_members')
  // Sem filtro de status de propósito: quem já tem parte nessa movimentação
  // continua tendo, mesmo que hoje esteja inativo. Filtrar aqui redistribuiria
  // a despesa entre menos gente e mudaria a dívida de quem não pediu nada.
  .select('id, full_name, equity_percent')
  .eq('company_id', mov.company_id);
const nome = (mid) => members.find((m) => m.id === mid)?.full_name ?? '?';

const { data: partesAtuais } = await db
  .from('expense_shares')
  .select('id, member_id, share_cents')
  .eq('expense_id', mov.id);

console.log(`\nMovimentação: ${mov.description} (${mov.spent_on})`);
console.log(`Pago por:     ${nome(mov.paid_by_member_id)}`);
console.log(`Valor atual:  ${brl(mov.amount_cents)}`);
console.log(`Valor novo:   ${brl(novoValor)}\n`);

if (mov.split_mode === 'custom') {
  console.error(
    'Essa movimentação tem divisão personalizada. Não dá para redividir sozinho\n' +
      'sem inventar critério: corrija pela tela de edição, informando as partes.',
  );
  process.exit(1);
}

// Só quem já tinha parte continua na divisão, com o mesmo critério de antes.
const participantes = members.filter((m) => partesAtuais.some((p) => p.member_id === m.id));
const pesos = participantes.map((m) =>
  mov.split_mode === 'equal' ? 1 : Number(m.equity_percent ?? 0),
);
const novasPartes = dividir(novoValor, pesos);

console.log('Novas partes:');
participantes.forEach((m, i) => {
  const antes = partesAtuais.find((p) => p.member_id === m.id)?.share_cents ?? 0;
  console.log(`  ${m.full_name.padEnd(20)} ${brl(antes).padStart(16)} → ${brl(novasPartes[i])}`);
});
if (novasPartes.reduce((s, p) => s + p, 0) !== novoValor) {
  console.error('\nAs partes não fecham com o total. Nada foi alterado.');
  process.exit(1);
}

const { data: acertos } = await db
  .from('settlement_payments')
  .select('id, from_member_id, to_member_id, amount_cents, is_auto, status')
  .eq('expense_id', mov.id);

const auto = acertos.filter((a) => a.is_auto);
const manuais = acertos.filter((a) => !a.is_auto);
console.log('\nAcertos automáticos ligados a ela:');
if (auto.length === 0) console.log('  nenhum');
const planoAcertos = [];
for (const a of auto) {
  const idx = participantes.findIndex((m) => m.id === a.from_member_id);
  const novaParte = idx >= 0 ? novasPartes[idx] : 0;
  const virouPagador = a.from_member_id === mov.paid_by_member_id;
  if (virouPagador || novaParte <= 0) {
    planoAcertos.push({ id: a.id, apagar: true });
    console.log(`  ${nome(a.from_member_id)}: ${brl(a.amount_cents)} → apagar`);
  } else {
    planoAcertos.push({ id: a.id, amount: novaParte });
    console.log(`  ${nome(a.from_member_id)}: ${brl(a.amount_cents)} → ${brl(novaParte)}`);
  }
}
if (manuais.length > 0) {
  console.log('\nAcertos lançados à parte (NÃO serão tocados, é dinheiro real):');
  for (const a of manuais) {
    console.log(`  ${nome(a.from_member_id)} → ${nome(a.to_member_id)}: ${brl(a.amount_cents)}`);
  }
}

if (!confirmar) {
  console.log('\n--- SIMULAÇÃO. Nada foi alterado. Rode de novo com --confirm para aplicar. ---');
  process.exit(0);
}

const erro = (e) => {
  if (e) {
    console.error('\nFalhou:', e.message);
    process.exit(1);
  }
};

erro((await db.from('expenses').update({ amount_cents: novoValor }).eq('id', mov.id)).error);
for (let i = 0; i < participantes.length; i++) {
  const parte = partesAtuais.find((p) => p.member_id === participantes[i].id);
  erro(
    (await db.from('expense_shares').update({ share_cents: novasPartes[i] }).eq('id', parte.id))
      .error,
  );
}
for (const p of planoAcertos) {
  if (p.apagar) erro((await db.from('settlement_payments').delete().eq('id', p.id)).error);
  else erro((await db.from('settlement_payments').update({ amount_cents: p.amount }).eq('id', p.id)).error);
}

console.log('\nPronto. Recarregue Movimentações e Acertos para ver os novos números.');
