#!/usr/bin/env node
/**
 * Marca os custos recorrentes da MYCLINIC360 como pagos pelo CAIXA DA EMPRESA.
 *
 * Motivo (Rafaelle, 26 ago 2026): os cadastros nomeavam a Dyely (e o Diego)
 * como pagadores, mas desde que a empresa fatura pelo Asaas é o caixa que paga
 * tudo. O nome do sócio na tela era mentira, e o pior estava por vir: na
 * próxima cobrança, marcar a conta como paga geraria um acerto invertido.
 *
 * Pré-requisito: a migração 0035 (coluna recurring_costs.paid_by_company).
 * O script confere sozinho e para com instrução clara se ela não rodou.
 *
 * Uso:
 *   node scripts/recorrentes-caixa-da-empresa.mjs             # só simula
 *   node scripts/recorrentes-caixa-da-empresa.mjs --confirm   # grava
 *
 * Precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.
 */
import { createClient } from '@supabase/supabase-js';

const EMPRESA = '7a477045-b5a2-45dc-ac19-db875c515f21'; // MYCLINIC360
const CONFIRM = process.argv.includes('--confirm');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const { data: costs, error } = await db
  .from('recurring_costs')
  .select('id, name, amount_cents, frequency, paid_by_company, active')
  .eq('company_id', EMPRESA)
  .order('created_at');
if (error) {
  if (/paid_by_company/.test(error.message)) {
    console.error('A coluna paid_by_company não existe: rode a migração 0035 antes.');
    console.error('  supabase/migrations/0035_recorrente_caixa_da_empresa.sql');
  } else {
    console.error('Falha ao listar custos:', error.message);
  }
  process.exit(1);
}

const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const alvo = costs.filter((c) => !c.paid_by_company);

console.log(`Custos recorrentes da MYCLINIC360: ${costs.length}`);
for (const c of costs) {
  const marca = c.paid_by_company ? 'já é do caixa' : 'MARCAR como caixa da empresa';
  console.log(`  ${c.name} · ${brl(c.amount_cents)} · ${c.frequency} · ${marca}`);
}

if (alvo.length === 0) {
  console.log('\nNada a fazer: todos já saem do caixa da empresa.');
  process.exit(0);
}
if (!CONFIRM) {
  console.log(`\nSimulação: ${alvo.length} custo(s) seriam marcados. Rode com --confirm para gravar.`);
  process.exit(0);
}

const { error: upErr } = await db
  .from('recurring_costs')
  .update({ paid_by_company: true })
  .eq('company_id', EMPRESA)
  .eq('paid_by_company', false);
if (upErr) {
  console.error('Falha ao gravar:', upErr.message);
  process.exit(1);
}
console.log(`\nGravado: ${alvo.length} custo(s) agora saem do caixa da empresa.`);
