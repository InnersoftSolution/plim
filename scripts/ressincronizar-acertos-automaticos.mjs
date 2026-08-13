#!/usr/bin/env node
/**
 * Ressincroniza os acertos AUTOMÁTICOS ("fulano já me pagou") com o estado
 * atual de cada movimentação: partes e pagamentos.
 *
 * Por que existe: até 12/08/2026, editar uma movimentação para ter MAIS DE UM
 * pagador não matava o acerto automático de quem passou a pagar direto ao
 * fornecedor. Sobrou acerto fantasma no banco (caso real: Juridico da OkiDoki,
 * Gabrielli -> Rafaelle R$ 1.280,00), distorcendo os saldos de todo mundo. O
 * código foi corrigido; isto limpa o que ficou para trás.
 *
 * A regra, a mesma que a API passou a aplicar:
 *   o que um "já me pagou" quita = parte do sócio − o que ele mesmo pagou
 *   direto ao fornecedor. Zero ou menos → o acerto morre. O credor é quem
 *   mais adiantou (pagou além da própria parte).
 *
 * Acertos MANUAIS nunca são tocados: são dinheiro que mudou de mão de verdade.
 *
 * Uso (o padrão é simulação, não escreve nada):
 *   node scripts/ressincronizar-acertos-automaticos.mjs
 *   node scripts/ressincronizar-acertos-automaticos.mjs --confirm
 *   node scripts/ressincronizar-acertos-automaticos.mjs --empresa <uuid>
 *
 * Precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.
 */
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const arg = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : null;
};
const empresaFiltro = arg('--empresa');
const confirmar = args.includes('--confirm');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const { data: empresas, error: errEmpresas } = await db.from('companies').select('id, name').order('name');
if (errEmpresas) throw errEmpresas;
const alvo = empresaFiltro ? empresas.filter((c) => c.id === empresaFiltro) : empresas;

let planos = 0;

for (const empresa of alvo) {
  const { data: members } = await db
    .from('company_members')
    .select('id, full_name')
    .eq('company_id', empresa.id);
  const nome = (id) => members.find((m) => m.id === id)?.full_name ?? '(sócio removido)';

  // Só acertos automáticos confirmados e amarrados a uma movimentação.
  const { data: autos } = await db
    .from('settlement_payments')
    .select('id, from_member_id, to_member_id, amount_cents, expense_id')
    .eq('company_id', empresa.id)
    .eq('is_auto', true)
    .eq('status', 'confirmed')
    .not('expense_id', 'is', null);
  if (!autos || autos.length === 0) continue;

  const ids = [...new Set(autos.map((a) => a.expense_id))];
  const { data: expenses } = await db
    .from('expenses')
    .select('id, description, spent_on, paid_by_member_id')
    .in('id', ids);
  const { data: shares } = await db
    .from('expense_shares')
    .select('expense_id, member_id, share_cents')
    .in('expense_id', ids);
  const { data: pagamentos } = await db
    .from('expense_payments')
    .select('expense_id, member_id, amount_cents')
    .in('expense_id', ids);

  let cabecalho = false;
  for (const acerto of autos) {
    const e = expenses.find((x) => x.id === acerto.expense_id);
    if (!e) continue; // movimentação apagada: o cascade já deveria ter levado o acerto
    const parteDe = (mid) =>
      shares.find((s) => s.expense_id === e.id && s.member_id === mid)?.share_cents ?? 0;
    const pagoPor = (mid) =>
      pagamentos
        .filter((p) => p.expense_id === e.id && p.member_id === mid)
        .reduce((soma, p) => soma + p.amount_cents, 0);

    // Credor: quem mais pagou além da própria parte. Sem pagamentos (dados
    // antes da 0033), vale a coluna antiga.
    const pagadores = [...new Set(pagamentos.filter((p) => p.expense_id === e.id).map((p) => p.member_id))];
    const excedentes = pagadores
      .map((id) => ({ id, cents: pagoPor(id) - parteDe(id) }))
      .filter((c) => c.cents > 0)
      .sort((a, b) => b.cents - a.cents);
    const credor = excedentes[0]?.id ?? e.paid_by_member_id;

    const devida = Math.max(0, parteDe(acerto.from_member_id) - pagoPor(acerto.from_member_id));

    let acao = null;
    if (devida <= 0 || acerto.from_member_id === credor) acao = { tipo: 'apagar' };
    else if (devida !== acerto.amount_cents || credor !== acerto.to_member_id)
      acao = { tipo: 'ajustar', amount: devida, to: credor };
    if (!acao) continue;

    if (!cabecalho) {
      console.log(`\n═══ ${empresa.name} ═══`);
      cabecalho = true;
    }
    planos += 1;
    const rotulo = `${nome(acerto.from_member_id)} -> ${nome(acerto.to_member_id)} ${brl(acerto.amount_cents)} | ${e.description} ${e.spent_on}`;
    if (acao.tipo === 'apagar') {
      console.log(`  APAGAR  ${rotulo}`);
      console.log(`          motivo: quem "já pagou" cobriu a parte pagando direto (ou é o próprio credor).`);
      if (confirmar) {
        const { error } = await db.from('settlement_payments').delete().eq('id', acerto.id);
        if (error) {
          console.error('  FALHOU:', error.message);
          process.exit(1);
        }
      }
    } else {
      console.log(`  AJUSTAR ${rotulo}`);
      console.log(`          novo: ${brl(acao.amount)} para ${nome(acao.to)}`);
      if (confirmar) {
        const { error } = await db
          .from('settlement_payments')
          .update({ amount_cents: acao.amount, to_member_id: acao.to })
          .eq('id', acerto.id);
        if (error) {
          console.error('  FALHOU:', error.message);
          process.exit(1);
        }
      }
    }
  }
}

console.log('');
if (planos === 0) console.log('Nada a corrigir: todos os acertos automáticos batem com as movimentações.');
else if (!confirmar) console.log(`--- SIMULAÇÃO: ${planos} correção(ões) encontradas. Nada foi alterado. Rode com --confirm para aplicar. ---`);
else console.log(`${planos} correção(ões) aplicadas. Recarregue Acertos para ver os novos números.`);
