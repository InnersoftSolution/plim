/**
 * Expurgo definitivo das exclusões cuja carência venceu (LGPD art. 18, VI).
 *
 * A API só AGENDA a exclusão: marca a data e deixa o pedido cancelável. Quem
 * apaga de verdade é este script, e só depois do prazo. Rodar periodicamente
 * (cron da Railway ou manualmente).
 *
 * Uso:
 *   node scripts/purge-deletions.mjs --dry-run   # só lista o que venceu
 *   node scripts/purge-deletions.mjs             # apaga de verdade
 *
 * Precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.
 *
 * O que ele apaga:
 *   - empresa vencida: a linha em companies. Todo o resto (movimentações,
 *     rateios, custos, contatos, atividades, agenda, sócios) cai junto pelo
 *     "on delete cascade" das chaves estrangeiras.
 *   - conta vencida: o usuário no Supabase Auth, o que derruba o profile em
 *     cascata.
 *
 * O que ele NUNCA apaga: a tabela deletion_requests. Ela é a prova de que o
 * pedido foi feito e cumprido, e por isso não tem chave estrangeira para nada.
 */
import { createClient } from '@supabase/supabase-js';

const DRY_RUN = process.argv.includes('--dry-run');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
const agora = new Date().toISOString();

/** Fecha o registro de auditoria do que foi efetivamente apagado. */
async function concluiRegistro(subjectType, subjectId) {
  const { error } = await db
    .from('deletion_requests')
    .update({ status: 'completed', completed_at: agora })
    .eq('subject_type', subjectType)
    .eq('subject_id', subjectId)
    .eq('status', 'scheduled');
  if (error) console.error(`  aviso: falha ao fechar o registro: ${error.message}`);
}

async function purgaEmpresas() {
  const { data, error } = await db
    .from('companies')
    .select('id, name, deletion_scheduled_for')
    .not('deletion_scheduled_for', 'is', null)
    .lte('deletion_scheduled_for', agora);
  if (error) throw new Error(`Falha ao listar empresas vencidas: ${error.message}`);

  if (!data?.length) {
    console.log('Empresas: nenhuma com prazo vencido.');
    return 0;
  }
  console.log(`Empresas com prazo vencido: ${data.length}`);
  for (const empresa of data) {
    console.log(`  - ${empresa.name} (${empresa.id}) venceu em ${empresa.deletion_scheduled_for}`);
    if (DRY_RUN) continue;
    const { error: delError } = await db.from('companies').delete().eq('id', empresa.id);
    if (delError) {
      console.error(`    ERRO ao apagar: ${delError.message}`);
      continue;
    }
    await concluiRegistro('company', empresa.id);
    console.log('    apagada.');
  }
  return data.length;
}

async function purgaContas() {
  const { data, error } = await db
    .from('profiles')
    .select('id, email, deletion_scheduled_for')
    .not('deletion_scheduled_for', 'is', null)
    .lte('deletion_scheduled_for', agora);
  if (error) throw new Error(`Falha ao listar contas vencidas: ${error.message}`);

  if (!data?.length) {
    console.log('Contas: nenhuma com prazo vencido.');
    return 0;
  }
  console.log(`Contas com prazo vencido: ${data.length}`);
  for (const perfil of data) {
    console.log(`  - ${perfil.email ?? perfil.id} venceu em ${perfil.deletion_scheduled_for}`);
    if (DRY_RUN) continue;

    // Trava de segurança: se a pessoa ainda for dona de alguma empresa que
    // continua viva, algo saiu do lugar (transferência desfeita, cancelamento
    // parcial). Melhor pular e deixar para conferência humana do que apagar a
    // conta e deixar uma empresa sem dono.
    const { data: donas, error: donasError } = await db
      .from('company_members')
      .select('company_id, companies!inner(deletion_scheduled_for)')
      .eq('user_id', perfil.id)
      .eq('role', 'account_owner')
      .is('companies.deletion_scheduled_for', null);
    if (donasError) {
      console.error(`    ERRO ao conferir empresas: ${donasError.message}`);
      continue;
    }
    if (donas?.length) {
      console.error(
        `    PULADA: ainda é dona de ${donas.length} empresa(s) ativa(s). Confira antes.`,
      );
      continue;
    }

    // Apagar o usuário do Auth derruba o profile em cascata.
    const { error: authError } = await db.auth.admin.deleteUser(perfil.id);
    if (authError) {
      console.error(`    ERRO ao apagar a conta: ${authError.message}`);
      continue;
    }
    await concluiRegistro('account', perfil.id);
    console.log('    apagada.');
  }
  return data.length;
}

console.log(DRY_RUN ? '— simulação (nada será apagado) —' : '— expurgo definitivo —');
// Empresas primeiro: a conta pode estar esperando a empresa dela sair.
const empresas = await purgaEmpresas();
const contas = await purgaContas();
console.log(
  DRY_RUN
    ? `Simulação concluída: ${empresas} empresa(s) e ${contas} conta(s) venceriam agora.`
    : 'Expurgo concluído.',
);
