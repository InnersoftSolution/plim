#!/usr/bin/env node
/**
 * Zera o FINANCEIRO de uma empresa: movimentações (despesas, aportes e
 * receitas), acertos entre sócios e custos recorrentes. Um recomeço do zero.
 *
 * O que NÃO é tocado: a empresa, os sócios e as participações, as categorias,
 * os contatos, o checklist e a agenda. Só o dinheiro sai.
 *
 * Os custos recorrentes entram na limpeza de propósito: se ficassem, o Plim
 * voltaria a gerar contas a pagar sozinho na próxima abertura do financeiro, e
 * "zerei tudo mas apareceu movimentação" ia parecer defeito. Use
 * --manter-recorrentes para preservá-los.
 *
 * Exige --id (e não --name) de propósito: há empresas com o mesmo nome no
 * banco, e apagar dinheiro pelo nome é pedir para errar de alvo.
 *
 * Uso (o padrão é simulação, não escreve nada):
 *   node scripts/zerar-financeiro.mjs --id <uuid>
 *   node scripts/zerar-financeiro.mjs --id <uuid> --confirm
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
const confirmar = args.includes('--confirm');
const manterRecorrentes = args.includes('--manter-recorrentes');

if (!id) {
  console.error('Uso: --id <uuid da empresa> [--confirm] [--manter-recorrentes]');
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

const { data: empresa, error: errEmpresa } = await db
  .from('companies')
  .select('id, name, created_at')
  .eq('id', id)
  .maybeSingle();
if (errEmpresa) throw errEmpresa;
if (!empresa) {
  console.error('Empresa não encontrada com esse id.');
  process.exit(1);
}

const { data: socios } = await db.from('company_members').select('full_name').eq('company_id', id);
const { data: movs } = await db.from('expenses').select('id, kind, amount_cents').eq('company_id', id);
const { count: acertos } = await db
  .from('settlement_payments')
  .select('id', { count: 'exact', head: true })
  .eq('company_id', id);
const { count: recorrentes } = await db
  .from('recurring_costs')
  .select('id', { count: 'exact', head: true })
  .eq('company_id', id);

const total = movs.reduce((s, m) => s + m.amount_cents, 0);
const porTipo = (k) => movs.filter((m) => (m.kind ?? 'expense') === k).length;

console.log(`\nEmpresa: ${empresa.name} (criada em ${empresa.created_at.slice(0, 10)})`);
console.log(`Sócios (ficam intactos): ${socios.map((s) => s.full_name).join(', ')}\n`);
console.log('O que será APAGADO:');
console.log(
  `  ${movs.length} movimentações (${porTipo('expense')} despesas, ${porTipo('contribution')} aportes, ${porTipo('revenue')} entradas) somando ${brl(total)}`,
);
console.log(`  ${acertos} acertos entre sócios`);
console.log(
  manterRecorrentes
    ? `  (custos recorrentes preservados: ${recorrentes})`
    : `  ${recorrentes} custos recorrentes`,
);

if (!confirmar) {
  console.log('\n--- SIMULAÇÃO. Nada foi alterado. Rode de novo com --confirm para apagar. ---');
  process.exit(0);
}

const erro = (e, oQue) => {
  if (e) {
    console.error(`\nFalhou ao apagar ${oQue}: ${e.message}`);
    process.exit(1);
  }
};

// Ordem: acertos primeiro (referenciam sócios, não caem em cascata das
// despesas quando não têm expense_id), depois movimentações (partes e
// pagamentos caem em cascata pela FK), depois os recorrentes.
erro((await db.from('settlement_payments').delete().eq('company_id', id)).error, 'acertos');
erro((await db.from('expenses').delete().eq('company_id', id)).error, 'movimentações');
if (!manterRecorrentes) {
  erro((await db.from('recurring_costs').delete().eq('company_id', id)).error, 'custos recorrentes');
}

// Conferência: nada financeiro pode ter sobrado.
const sobrou = async (tabela) =>
  (await db.from(tabela).select('id', { count: 'exact', head: true }).eq('company_id', id)).count;
const restoMov = await sobrou('expenses');
const restoAc = await sobrou('settlement_payments');
console.log(`\nConferência: ${restoMov} movimentações e ${restoAc} acertos restantes.`);
if (restoMov !== 0 || restoAc !== 0) {
  console.error('ATENÇÃO: sobrou registro. Me avise antes de usar o financeiro.');
  process.exit(1);
}
console.log('Pronto. O financeiro está zerado; empresa, sócios e configurações intactos.');
