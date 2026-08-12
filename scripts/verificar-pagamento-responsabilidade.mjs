#!/usr/bin/env node
/**
 * Confere a migração 0033 (pagamento e responsabilidade separados) SEM ESCREVER
 * NADA. Roda antes e depois da migração e compara.
 *
 * O risco da 0033 é silencioso: se o backfill errar, o saldo de todo mundo muda
 * de uma vez e ninguém percebe olhando a tela. Então o teste é este: calcular o
 * saldo dos sócios pelos DOIS caminhos e exigir que deem o mesmo número.
 *
 *   caminho antigo: quem pagou = expenses.paid_by_member_id (pagou 100%)
 *   caminho novo:   quem pagou = soma de expense_payments do sócio
 *
 * Também valida as invariantes que o resto do sistema assume:
 *   1. a soma das partes de cada movimentação é igual ao valor dela;
 *   2. a soma dos pagamentos nunca passa do valor da movimentação;
 *   3. a soma dos saldos líquidos é exatamente zero;
 *   4. quem está marcado como "não participa" tem parte zero;
 *   5. todo valor é inteiro (centavos, nunca float).
 *
 * Uso (somente leitura, não aceita --confirm porque não escreve):
 *   node scripts/verificar-pagamento-responsabilidade.mjs
 *   node scripts/verificar-pagamento-responsabilidade.mjs --empresa <uuid>
 *
 * Precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.
 * Sai com código 1 se alguma conferência falhar.
 */
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const arg = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : null;
};
const empresaFiltro = arg('--empresa');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const falhas = [];
const falha = (msg) => {
  falhas.push(msg);
  console.log(`  FALHOU: ${msg}`);
};

/**
 * As partes, com `participates` quando a coluna já existe. Rodando ANTES da
 * 0033 ela não existe, e aí o Supabase devolve erro em vez de ignorar: neste
 * caso repete a consulta sem a coluna, para o script servir de linha de base.
 */
async function partesDasMovimentacoes(expenseIds) {
  const comColuna = await db
    .from('expense_shares')
    .select('expense_id, member_id, share_cents, participates')
    .in('expense_id', expenseIds);
  if (!comColuna.error) return comColuna.data;
  if (!/participates|column|schema cache/i.test(comColuna.error.message)) throw comColuna.error;

  const { data, error } = await db
    .from('expense_shares')
    .select('expense_id, member_id, share_cents')
    .in('expense_id', expenseIds);
  if (error) throw error;
  return data.map((s) => ({ ...s, participates: null }));
}

/** A tabela nova pode ainda não existir (rodando ANTES da migração). */
async function pagamentosPorMovimentacao(expenseIds) {
  const { data, error } = await db
    .from('expense_payments')
    .select('expense_id, member_id, amount_cents')
    .in('expense_id', expenseIds);
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return null;
    throw error;
  }
  return data;
}

const { data: empresas, error: errEmpresas } = await db
  .from('companies')
  .select('id, name')
  .order('name');
if (errEmpresas) throw errEmpresas;

const alvo = empresaFiltro ? empresas.filter((c) => c.id === empresaFiltro) : empresas;
if (alvo.length === 0) {
  console.error('Nenhuma empresa encontrada com esse id.');
  process.exit(1);
}

let tabelaNovaExiste = true;

for (const empresa of alvo) {
  console.log(`\n═══ ${empresa.name} ═══`);

  const { data: members } = await db
    .from('company_members')
    .select('id, full_name')
    .eq('company_id', empresa.id);
  const nome = (id) => members.find((m) => m.id === id)?.full_name ?? '(sócio removido)';

  // Mesmo filtro do getBalances: confirmada, paga, e que divide entre sócios.
  const { data: todas } = await db
    .from('expenses')
    .select('id, description, kind, amount_cents, paid_by_member_id, payment_status, confirmation_status')
    .eq('company_id', empresa.id);

  if (!todas || todas.length === 0) {
    console.log('  Sem movimentações.');
    continue;
  }

  const shares = await partesDasMovimentacoes(todas.map((e) => e.id));

  const pagamentos = await pagamentosPorMovimentacao(todas.map((e) => e.id));
  if (pagamentos === null) tabelaNovaExiste = false;

  const { data: acertos } = await db
    .from('settlement_payments')
    .select('from_member_id, to_member_id, amount_cents, status')
    .eq('company_id', empresa.id);

  const partesDe = (id) => shares.filter((s) => s.expense_id === id);
  const pagamentosDe = (id) => (pagamentos ?? []).filter((p) => p.expense_id === id);

  /* ── 1, 2, 4 e 5: invariantes por movimentação ── */
  for (const e of todas) {
    const partes = partesDe(e.id);
    const somaPartes = partes.reduce((s, p) => s + p.share_cents, 0);
    // Movimentação sem partes é receita ou aporte não reembolsável: nada a conferir.
    if (partes.length > 0 && somaPartes !== e.amount_cents) {
      falha(
        `"${e.description}": partes somam ${brl(somaPartes)}, movimentação é ${brl(e.amount_cents)}`,
      );
    }
    for (const p of partes) {
      if (!Number.isInteger(p.share_cents)) falha(`"${e.description}": parte não inteira`);
      if (p.participates === false && p.share_cents !== 0) {
        falha(`"${e.description}": ${nome(p.member_id)} não participa mas tem parte de ${brl(p.share_cents)}`);
      }
    }
    if (pagamentos) {
      const somaPagos = pagamentosDe(e.id).reduce((s, p) => s + p.amount_cents, 0);
      if (somaPagos > e.amount_cents) {
        falha(
          `"${e.description}": pagamentos somam ${brl(somaPagos)}, acima do valor ${brl(e.amount_cents)}`,
        );
      }
      if (!Number.isInteger(somaPagos)) falha(`"${e.description}": pagamento não inteiro`);
    }
  }

  /* ── saldos pelos dois caminhos ── */
  const contam = todas.filter(
    (e) =>
      e.confirmation_status === 'confirmed' &&
      (e.payment_status ?? 'paid') === 'paid' &&
      ((e.kind ?? 'expense') === 'expense' ||
        ((e.kind ?? 'expense') === 'contribution' && partesDe(e.id).length > 0)),
  );
  const idsQueContam = new Set(contam.map((e) => e.id));
  const confirmados = (acertos ?? []).filter((a) => a.status === 'confirmed');

  console.log('\n  Sócio                  pagou (antigo)   pagou (novo)      deve       saldo');
  let somaSaldos = 0;
  for (const m of members) {
    const pagouAntigo = contam
      .filter((e) => e.paid_by_member_id === m.id)
      .reduce((s, e) => s + e.amount_cents, 0);
    const pagouNovo = pagamentos
      ? pagamentos
          .filter((p) => p.member_id === m.id && idsQueContam.has(p.expense_id))
          .reduce((s, p) => s + p.amount_cents, 0)
      : null;
    const deve = contam.reduce(
      (s, e) => s + (partesDe(e.id).find((p) => p.member_id === m.id)?.share_cents ?? 0),
      0,
    );
    const enviou = confirmados
      .filter((a) => a.from_member_id === m.id)
      .reduce((s, a) => s + a.amount_cents, 0);
    const recebeu = confirmados
      .filter((a) => a.to_member_id === m.id)
      .reduce((s, a) => s + a.amount_cents, 0);
    const saldo = (pagouNovo ?? pagouAntigo) - deve + enviou - recebeu;
    somaSaldos += saldo;

    console.log(
      `  ${m.full_name.padEnd(20)} ${brl(pagouAntigo).padStart(14)} ${(pagouNovo == null ? '(sem tabela)' : brl(pagouNovo)).padStart(14)} ${brl(deve).padStart(11)} ${brl(saldo).padStart(11)}`,
    );

    if (pagouNovo != null && pagouNovo !== pagouAntigo) {
      falha(
        `${m.full_name}: o backfill mudou o que essa pessoa pagou (${brl(pagouAntigo)} → ${brl(pagouNovo)})`,
      );
    }
  }

  /* ── 3: a soma dos saldos fecha em zero ── */
  if (somaSaldos !== 0) {
    falha(`a soma dos saldos deu ${brl(somaSaldos)}, e tem que ser exatamente R$ 0,00`);
  } else {
    console.log(`\n  Soma dos saldos: ${brl(0)} (correto)`);
  }
}

console.log('');
if (!tabelaNovaExiste) {
  console.log('A tabela expense_payments ainda não existe: você está rodando ANTES da 0033.');
  console.log('Guarde esta saída, rode a migração e rode de novo para comparar.');
}
if (falhas.length > 0) {
  console.log(`\n${falhas.length} conferência(s) falharam. NÃO siga para a próxima fatia.`);
  process.exit(1);
}
console.log('Todas as conferências passaram. Nada foi alterado (script somente leitura).');
