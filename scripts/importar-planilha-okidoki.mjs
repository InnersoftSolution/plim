#!/usr/bin/env node
/**
 * Importa os 18 lançamentos da planilha OKI_DOKI_Apuracao_Socias (13/08/2026)
 * para a OkiDoki, no modelo de pagamento e responsabilidade separados.
 *
 * Os dados estão EMBUTIDOS aqui de propósito, revisados linha a linha com a
 * Rafaelle, em vez de ler o xlsx em tempo de execução: o que este arquivo diz
 * é exatamente o que entra no banco, e o commit vira a trilha de auditoria.
 *
 * Decisões tomadas na revisão:
 *  - Marketing (R$ 780): a planilha dizia 312/312/156 pagos por cada uma, mas
 *    a Rafaelle corrigiu: a GABI pagou os R$ 780 ao fornecedor e as outras
 *    devolveram a parte. Entra como pagamento integral da Gabi com os acertos
 *    de Rafaelle (R$ 312) e Vanessa (R$ 156) já registrados. Se a parte da
 *    Vanessa não tiver sido paga, é um "desfazer" na tela da movimentação.
 *  - Cotas 40/40/20 (equity), idênticas às colunas da planilha; conferido que
 *    todas fecham no centavo com o valor total.
 *  - O encontro Gabi×Rafaelle (logomarca × parcelas BR China) NÃO é importado:
 *    ele emerge sozinho do cálculo por par a partir dos pagamentos cruzados.
 *  - Categorias novas criadas: "Manutenção da empresa" e "Identidade visual".
 *
 * Uso (o padrão é simulação, não escreve nada):
 *   node scripts/importar-planilha-okidoki.mjs
 *   node scripts/importar-planilha-okidoki.mjs --confirm
 *
 * Recusa rodar se a empresa já tiver movimentações: este import pressupõe o
 * financeiro zerado (scripts/zerar-financeiro.mjs).
 */
import { createClient } from '@supabase/supabase-js';

const confirmar = process.argv.includes('--confirm');
const COMPANY = '10b46ecd-961a-46d2-a734-30cd9d393cc2'; // OkiDoki atual

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/* ── sócias (resolvidas por nome no banco) ─────────────── */
const { data: membros } = await db
  .from('company_members')
  .select('id, full_name')
  .eq('company_id', COMPANY);
const acha = (apelido) => {
  const m = membros.find((x) => x.full_name.toLowerCase().includes(apelido));
  if (!m) {
    console.error(`Sócia "${apelido}" não encontrada na empresa.`);
    process.exit(1);
  }
  return m.id;
};
const GABI = acha('gabrielli');
const RAFA = acha('rafaelle');
const VANE = acha('vanessa');
const nome = (id) => membros.find((m) => m.id === id).full_name.split(' ')[0];

/* ── lançamentos (centavos; G/R/V = Gabi, Rafaelle, Vanessa) ── */
const CAT = {
  manutencao: 'Manutenção da empresa', // criada se não existir
  juridico: 'Juridico',
  identidade: 'Identidade visual', // criada se não existir
  marketing: 'Marketing',
  brchina: 'Consultoria Importação',
};

/** Mensalidade de R$ 99: cotas 39,60/39,60/19,80, alternando a pagadora. */
const mensalidade = (data, pagadora) => ({
  data,
  cat: CAT.manutencao,
  desc: 'Mensalidade de manutenção da empresa',
  total: 9900,
  pagos: { [pagadora]: 9900 },
  cotas: { [GABI]: 3960, [RAFA]: 3960, [VANE]: 1980 },
  acertos: [],
});

/** Parcela BR China: cotas 399,90/399,90/199,95. */
const brchina = (n, data, pagos) => ({
  data,
  cat: CAT.brchina,
  desc: `Consultoria BR China - parcela ${n}/4`,
  total: 99975,
  pagos,
  cotas: { [GABI]: 39990, [RAFA]: 39990, [VANE]: 19995 },
  acertos: [],
});

const LANCAMENTOS = [
  mensalidade('2025-07-01', GABI),
  mensalidade('2025-08-01', RAFA),
  mensalidade('2025-09-01', GABI),
  mensalidade('2025-10-01', RAFA),
  mensalidade('2025-11-01', GABI),
  mensalidade('2025-12-01', RAFA),
  mensalidade('2026-01-01', GABI),
  mensalidade('2026-02-01', RAFA),
  mensalidade('2026-03-01', GABI),
  mensalidade('2026-04-01', RAFA),
  mensalidade('2026-05-01', GABI),
  {
    data: '2025-04-01',
    cat: CAT.juridico,
    desc: 'Advogado: abertura, registro de marca e contrato societário',
    total: 320000,
    pagos: { [GABI]: 160000, [RAFA]: 160000 },
    cotas: { [GABI]: 128000, [RAFA]: 128000, [VANE]: 64000 },
    acertos: [],
  },
  {
    data: '2025-04-01',
    cat: CAT.identidade,
    desc: 'Identidade visual (logomarca)',
    total: 150000,
    pagos: { [RAFA]: 150000 },
    cotas: { [GABI]: 60000, [RAFA]: 60000, [VANE]: 30000 },
    // A cota da Gabi foi "quitada via parcelas BR China": isso emerge do
    // cálculo por par (as parcelas 2 e 3 abaixo), não se registra aqui.
    acertos: [],
  },
  {
    data: '2026-05-01',
    cat: CAT.marketing,
    desc: 'Marketing',
    total: 78000,
    // Correção da Rafaelle sobre a planilha: a Gabi pagou tudo ao fornecedor.
    pagos: { [GABI]: 78000 },
    cotas: { [GABI]: 31200, [RAFA]: 31200, [VANE]: 15600 },
    // As outras devolveram a parte para a Gabi (a da Vanessa segundo a
    // planilha; se não for verdade, desfazer na tela vira pendência).
    acertos: [
      { de: RAFA, para: GABI, cents: 31200 },
      { de: VANE, para: GABI, cents: 15600 },
    ],
  },
  brchina(1, '2026-05-01', { [GABI]: 39990, [RAFA]: 39990, [VANE]: 19995 }),
  brchina(2, '2026-06-01', { [GABI]: 79980, [VANE]: 19995 }),
  brchina(3, '2026-07-01', { [GABI]: 79980, [VANE]: 19995 }),
  brchina(4, '2026-08-01', { [GABI]: 39990, [RAFA]: 39990, [VANE]: 19995 }),
];

/* ── conferências antes de qualquer escrita ────────────── */
let falhou = false;
for (const l of LANCAMENTOS) {
  const somaPagos = Object.values(l.pagos).reduce((s, c) => s + c, 0);
  const somaCotas = Object.values(l.cotas).reduce((s, c) => s + c, 0);
  if (somaPagos !== l.total) {
    console.error(`ERRO: pagamentos de "${l.desc}" (${l.data}) somam ${brl(somaPagos)}, valor é ${brl(l.total)}`);
    falhou = true;
  }
  if (somaCotas !== l.total) {
    console.error(`ERRO: cotas de "${l.desc}" (${l.data}) somam ${brl(somaCotas)}, valor é ${brl(l.total)}`);
    falhou = true;
  }
}
if (falhou) process.exit(1);

const { count: jaTem } = await db
  .from('expenses')
  .select('id', { count: 'exact', head: true })
  .eq('company_id', COMPANY);
if (jaTem > 0) {
  console.error(`A empresa já tem ${jaTem} movimentações. Este import pressupõe o financeiro zerado.`);
  process.exit(1);
}

/* ── prévia ────────────────────────────────────────────── */
const totalGeral = LANCAMENTOS.reduce((s, l) => s + l.total, 0);
console.log(`\n${LANCAMENTOS.length} lançamentos, somando ${brl(totalGeral)}:\n`);
for (const l of LANCAMENTOS) {
  const pg = Object.entries(l.pagos).map(([id, c]) => `${nome(id)} ${brl(c)}`).join(' + ');
  console.log(`  ${l.data}  ${l.desc}  ${brl(l.total)}`);
  console.log(`            pagou: ${pg}${l.acertos.length ? `  | acertos: ${l.acertos.map((a) => `${nome(a.de)}→${nome(a.para)} ${brl(a.cents)}`).join(', ')}` : ''}`);
}
const desembolso = {};
for (const l of LANCAMENTOS) for (const [id, c] of Object.entries(l.pagos)) desembolso[id] = (desembolso[id] ?? 0) + c;
console.log('\nDesembolso ao fornecedor por sócia:');
for (const [id, c] of Object.entries(desembolso)) console.log(`  ${nome(id)}: ${brl(c)}`);
console.log(
  '\nObs.: difere do Painel da planilha só pela correção do Marketing (Gabi pagou\n' +
    'os R$ 780,00 e as outras devolveram a parte). Os SALDOS finais batem com o\n' +
    'Painel: Gabi +R$ 678,20, Rafaelle +R$ 479,60, Vanessa -R$ 1.157,80.',
);

if (!confirmar) {
  console.log('\n--- SIMULAÇÃO. Nada foi gravado. Rode com --confirm para importar. ---');
  process.exit(0);
}

/* ── categorias (cria as que faltam) ───────────────────── */
const { data: cats } = await db.from('categories').select('id, name').eq('company_id', COMPANY);
const catId = async (nomeCat) => {
  const achada = cats.find((c) => c.name.toLowerCase() === nomeCat.toLowerCase());
  if (achada) return achada.id;
  const { data, error } = await db
    .from('categories')
    .insert({ company_id: COMPANY, name: nomeCat, type: 'despesa' })
    .select('id')
    .single();
  if (error) {
    console.error(`Falha ao criar categoria "${nomeCat}": ${error.message}`);
    process.exit(1);
  }
  cats.push({ id: data.id, name: nomeCat });
  return data.id;
};

/* ── grava ─────────────────────────────────────────────── */
for (const l of LANCAMENTOS) {
  const pagosArr = Object.entries(l.pagos);
  const maiorPagador = pagosArr.reduce((m, p) => (p[1] > m[1] ? p : m))[0];
  const { data: exp, error: e1 } = await db
    .from('expenses')
    .insert({
      company_id: COMPANY,
      kind: 'expense',
      description: l.desc,
      amount_cents: l.total,
      currency_code: 'BRL',
      paid_by_member_id: maiorPagador,
      spent_on: l.data,
      split_mode: 'equity',
      payment_status: 'paid',
      confirmation_status: 'confirmed',
      category_id: await catId(l.cat),
      note: null,
    })
    .select('id')
    .single();
  if (e1) {
    console.error(`Falha em "${l.desc}": ${e1.message}`);
    process.exit(1);
  }
  const { error: e2 } = await db.from('expense_shares').insert(
    Object.entries(l.cotas).map(([member_id, share_cents]) => ({
      expense_id: exp.id,
      member_id,
      share_cents,
      participates: true,
      rule: 'equity',
    })),
  );
  if (e2) {
    console.error(`Falha no rateio de "${l.desc}": ${e2.message}`);
    process.exit(1);
  }
  const { error: e3 } = await db.from('expense_payments').insert(
    pagosArr.map(([member_id, amount_cents]) => ({
      expense_id: exp.id,
      member_id,
      amount_cents,
      paid_on: l.data,
    })),
  );
  if (e3) {
    console.error(`Falha nos pagamentos de "${l.desc}": ${e3.message}`);
    process.exit(1);
  }
  for (const a of l.acertos) {
    const { error: e4 } = await db.from('settlement_payments').insert({
      company_id: COMPANY,
      from_member_id: a.de,
      to_member_id: a.para,
      amount_cents: a.cents,
      paid_on: l.data,
      status: 'confirmed',
      expense_id: exp.id,
      is_auto: true,
      note: `Acerto registrado junto com a despesa "${l.desc}".`,
    });
    if (e4) {
      console.error(`Falha no acerto de "${l.desc}": ${e4.message}`);
      process.exit(1);
    }
  }
  console.log(`  ok: ${l.data} ${l.desc}`);
}

const { count: conf } = await db
  .from('expenses')
  .select('id', { count: 'exact', head: true })
  .eq('company_id', COMPANY);
console.log(`\nImportação concluída: ${conf} movimentações no banco.`);
console.log('Confira em app.plim.work: Movimentações e Acertos.');
