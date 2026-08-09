/**
 * Exclusão MANUAL e imediata de uma empresa, para limpar dado de teste.
 *
 * Atalho de manutenção: pula a carência de 30 dias da jornada normal
 * (scripts/purge-deletions.mjs). Use só em empresa de teste.
 *
 * Uso:
 *   node scripts/delete-company.mjs --name "teste 2"            # simula
 *   node scripts/delete-company.mjs --name "teste 2" --confirm  # apaga
 *   node scripts/delete-company.mjs --id <uuid> --confirm
 *
 * Sem --confirm ele NÃO apaga nada: só mostra o que seria apagado. Sempre rode
 * a simulação primeiro e confira o nome e os números antes de confirmar.
 *
 * Opção extra:
 *   --with-users   apaga também as contas de acesso das pessoas que estavam
 *                  SÓ nesta empresa (contas de teste). Quem participa de outra
 *                  empresa nunca é tocado.
 *
 * Precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente:
 *   export $(grep -E '^SUPABASE_(URL|SERVICE_ROLE_KEY)=' apps/api/.env | xargs)
 */
import { createClient } from '@supabase/supabase-js';

/* ── argumentos ───────────────────────────────────────── */
function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1] ?? null;
}
const NAME = arg('--name');
const ID = arg('--id');
const CONFIRM = process.argv.includes('--confirm');
const WITH_USERS = process.argv.includes('--with-users');

if (!NAME && !ID) {
  console.error('Informe --name "Nome da empresa" ou --id <uuid>.');
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

/**
 * Tabelas que guardam dados da empresa (mesma lista da exportação). Todas caem
 * em cascata ao apagar a linha de companies; contamos antes só para mostrar o
 * tamanho do que vai embora.
 */
const TABELAS = [
  'company_members',
  'company_journey_steps',
  'company_checklist_items',
  'categories',
  'contacts',
  'expenses',
  'recurring_costs',
  'settlement_payments',
  'activities',
  'events',
  'event_calendar_sync',
  'partner_leads',
];

/* ── 1. achar a empresa ───────────────────────────────── */
let query = db.from('companies').select('id, name, created_at, owner_id, logo_url');
query = ID ? query.eq('id', ID) : query.ilike('name', NAME);
const { data: encontradas, error: buscaErro } = await query;
if (buscaErro) {
  console.error(`Falha ao buscar a empresa: ${buscaErro.message}`);
  process.exit(1);
}

if (!encontradas?.length) {
  console.error(`Nenhuma empresa encontrada para ${ID ? `id ${ID}` : `nome "${NAME}"`}.`);
  process.exit(1);
}
if (encontradas.length > 1) {
  // Nunca adivinhar qual apagar: melhor parar e pedir o id exato.
  console.error(`Mais de uma empresa com esse nome. Rode de novo com --id <uuid>:`);
  for (const c of encontradas) console.error(`  ${c.id}  ${c.name}  (criada em ${c.created_at})`);
  process.exit(1);
}

const empresa = encontradas[0];
console.log(`Empresa: ${empresa.name}`);
console.log(`  id: ${empresa.id}`);
console.log(`  criada em: ${empresa.created_at}`);

/* ── 2. quem são os sócios (ler ANTES do cascade) ─────── */
const { data: membros, error: membrosErro } = await db
  .from('company_members')
  .select('id, user_id, full_name, email, role')
  .eq('company_id', empresa.id);
if (membrosErro) {
  console.error(`Falha ao listar sócios: ${membrosErro.message}`);
  process.exit(1);
}

console.log('\nSócios:');
for (const m of membros ?? []) {
  const conta = m.user_id ? 'com conta' : 'só convite';
  console.log(`  - ${m.full_name} <${m.email ?? 'sem e-mail'}> · ${m.role} · ${conta}`);
}

/* ── 3. o que vai embora ──────────────────────────────── */
console.log('\nRegistros que serão apagados (em cascata):');
let total = 0;
for (const tabela of TABELAS) {
  const { count, error } = await db
    .from(tabela)
    .select('id', { count: 'exact', head: true })
    .eq('company_id', empresa.id);
  if (error) {
    console.error(`  ${tabela}: erro ao contar (${error.message})`);
    continue;
  }
  total += count ?? 0;
  console.log(`  ${String(count ?? 0).padStart(5)}  ${tabela}`);
}

// Rateios ficam pendurados na movimentação, não na empresa.
const { data: despesas } = await db.from('expenses').select('id').eq('company_id', empresa.id);
const idsDespesas = (despesas ?? []).map((e) => e.id);
if (idsDespesas.length) {
  const { count } = await db
    .from('expense_shares')
    .select('id', { count: 'exact', head: true })
    .in('expense_id', idsDespesas);
  total += count ?? 0;
  console.log(`  ${String(count ?? 0).padStart(5)}  expense_shares`);
}
console.log(`  ${String(total).padStart(5)}  TOTAL`);

/* ── 4. contas que ficariam órfãs ─────────────────────── */
const orfaos = [];
for (const m of membros ?? []) {
  if (!m.user_id) continue;
  const { data: outras, error } = await db
    .from('company_members')
    .select('company_id')
    .eq('user_id', m.user_id)
    .neq('company_id', empresa.id);
  if (error) {
    console.error(`Falha ao conferir outras empresas de ${m.email}: ${error.message}`);
    continue;
  }
  if (!outras?.length) orfaos.push(m);
}

if (orfaos.length) {
  console.log('\nContas que ficarão sem nenhuma empresa:');
  for (const m of orfaos) console.log(`  - ${m.full_name} <${m.email}> (${m.user_id})`);
  console.log(
    WITH_USERS
      ? '  --with-users ligado: estas contas TAMBÉM serão apagadas.'
      : '  Elas NÃO serão apagadas. Use --with-users se forem contas de teste.',
  );
}

/* ── 5. executar ──────────────────────────────────────── */
if (!CONFIRM) {
  console.log('\n— simulação: nada foi apagado —');
  console.log('Confira os números acima. Para apagar de verdade, repita o comando com --confirm.');
  process.exit(0);
}

console.log('\n— apagando —');

// Logo primeiro: o cascade do banco não alcança o Storage, e depois de apagar
// a empresa perderíamos o id para localizar o arquivo.
const caminhosLogo = ['png', 'jpg', 'webp'].map((ext) => `${empresa.id}/logo.${ext}`);
const { error: logoErro } = await db.storage.from('company-logos').remove(caminhosLogo);
if (logoErro) console.error(`  aviso: falha ao remover a logo do Storage: ${logoErro.message}`);
else console.log('  logo removida do Storage.');

const { error: delErro } = await db.from('companies').delete().eq('id', empresa.id);
if (delErro) {
  console.error(`  ERRO ao apagar a empresa: ${delErro.message}`);
  process.exit(1);
}
console.log(`  empresa "${empresa.name}" apagada, com tudo em cascata.`);

// Fecha qualquer pedido de exclusão em aberto desta empresa (o registro de
// auditoria fica, é o que comprova o atendimento).
const { error: regErro } = await db
  .from('deletion_requests')
  .update({ status: 'completed', completed_at: new Date().toISOString() })
  .eq('subject_type', 'company')
  .eq('subject_id', empresa.id)
  .eq('status', 'scheduled');
// A tabela só existe depois da migração 0030; sem ela, seguir em frente.
if (regErro) console.log('  (sem registro de exclusão para fechar)');

if (WITH_USERS) {
  for (const m of orfaos) {
    const { error } = await db.auth.admin.deleteUser(m.user_id);
    if (error) console.error(`  ERRO ao apagar a conta ${m.email}: ${error.message}`);
    else console.log(`  conta ${m.email} apagada.`);
  }
}

console.log('\nPronto.');
