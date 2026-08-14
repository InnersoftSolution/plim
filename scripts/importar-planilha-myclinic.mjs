#!/usr/bin/env node
/**
 * Importa os lançamentos da planilha "MyClinic360 - Planilha Financeira (2026)"
 * (aba Custos_por_Etapa, lida em 14/08/2026) para a MYCLINIC360, no modelo de
 * pagamento e responsabilidade separados.
 *
 * Os dados estão EMBUTIDOS aqui de propósito, revisados com a Rafaelle, em vez
 * de ler o xlsx em tempo de execução: o que este arquivo diz é exatamente o
 * que entra no banco, e o commit vira a trilha de auditoria.
 *
 * Decisões tomadas na revisão:
 *  - Participações 51/29/20 (Dyely/Diego/Rafaelle), como já estão no Plim. A
 *    planilha rateava 50/30/20; a Rafaelle confirmou que valem os 51/29/20,
 *    então as cotas aqui saem do split por equity e podem diferir em poucos
 *    reais das colunas da planilha.
 *  - Tudo que só a Dyely pagou é custo da sociedade rateado: os outros dois
 *    devem a cota a ela. Nas parcelas dos desenvolvedores, a Dyely também
 *    adiantou a cota do Diego ("DIEGO (DYELY PAGOU)").
 *  - Aditivo Diego Paiva: a planilha registrava a Dyely adiantando a cota da
 *    Rafaelle na fase 1 e a Rafaelle pagando R$ 400 na fase 2. A Rafaelle
 *    corrigiu: os R$ 400 dela eram a parte total dela nos R$ 2.000, então os
 *    pagamentos entram realocados (R$ 200 dela em cada fase) para que o Diego
 *    deva SOMENTE à Dyely, e nada à Rafaelle. O caixa de cada uma não muda
 *    (Dyely R$ 1.600, Rafaelle R$ 400).
 *  - Advogado Romulo (contrato social): R$ 10.000 pagos pela Dyely, sem data
 *    na planilha; a Rafaelle mandou usar março/2026 (01/03/2026).
 *  - Tráfego campanha (R$ 1.000, "Aguardando", saldo Meta) entra como conta a
 *    pagar, sem pagamento, com a Dyely como pagadora prevista.
 *  - Fora do import: DAS de R$ 10,45 pago pela conta da empresa no Asaas (não
 *    gera dívida entre sócios) e a aba OPERAÇÃO 2026 inteira.
 *
 * Uso (o padrão é simulação, não escreve nada):
 *   node scripts/importar-planilha-myclinic.mjs
 *   node scripts/importar-planilha-myclinic.mjs --confirm
 *
 * Recusa rodar se a empresa já tiver movimentações: este import pressupõe o
 * financeiro zerado (scripts/zerar-financeiro.mjs).
 */
import { createClient } from '@supabase/supabase-js';

const confirmar = process.argv.includes('--confirm');
const COMPANY = '7a477045-b5a2-45dc-ac19-db875c515f21'; // MYCLINIC360

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/* ── sócios (resolvidos por nome no banco) ─────────────── */
const { data: membros } = await db
  .from('company_members')
  .select('id, full_name, equity_percent')
  .eq('company_id', COMPANY);
const acha = (apelido) => {
  const m = membros.find((x) => x.full_name.toLowerCase().includes(apelido));
  if (!m) {
    console.error(`Sócio "${apelido}" não encontrado na empresa.`);
    process.exit(1);
  }
  return m.id;
};
const DYELY = acha('dyely');
const DIEGO = acha('diego');
const RAFA = acha('rafaelle');
const nome = (id) => membros.find((m) => m.id === id).full_name.split(' ')[0];

const pct = Object.fromEntries(membros.map((m) => [m.id, m.equity_percent]));
if (pct[DYELY] !== 51 || pct[DIEGO] !== 29 || pct[RAFA] !== 20) {
  console.error('Participações no banco não são 51/29/20. Confira antes de importar.');
  process.exit(1);
}

/** Split por equity com maior resto, na ordem Dyely, Diego, Rafaelle. */
const cotasEquity = (total) => {
  const ordem = [DYELY, DIEGO, RAFA];
  const exatos = ordem.map((id) => (total * pct[id]) / 100);
  const base = exatos.map(Math.floor);
  let sobra = total - base.reduce((s, c) => s + c, 0);
  const porResto = ordem
    .map((id, i) => ({ i, resto: exatos[i] - base[i] }))
    .sort((a, b) => b.resto - a.resto);
  for (const { i } of porResto) {
    if (sobra <= 0) break;
    base[i] += 1;
    sobra -= 1;
  }
  return { [DYELY]: base[0], [DIEGO]: base[1], [RAFA]: base[2] };
};

/* ── lançamentos (centavos; datas convertidas da planilha) ── */
const CAT = {
  tecnologia: 'Tecnologia',
  saas: 'Assinaturas/SaaS',
  servidor: 'Servidor/Infra',
  dev: 'Serviços terceirizados',
  advocacia: 'Advocacia',
  marketing: 'Marketing',
};

// pagos: lista { de, cents, on? } (on = data do pagamento quando difere da despesa)
const L = (data, cat, desc, total, pagos, extra = {}) => ({ data, cat, desc, total, pagos, ...extra });

const LANCAMENTOS = [
  L('2025-03-13', CAT.tecnologia, 'Registro de domínio myclinic360.com.br (2 anos)', 7600, [{ de: DYELY, cents: 7600 }]),
  L('2025-03-19', CAT.marketing, 'Criação da logomarca / identidade visual (WeDoLogos)', 69000, [{ de: DYELY, cents: 69000 }]),
  L('2025-04-08', CAT.tecnologia, 'Registro de domínio stagemyclinic360.com.br (2 anos)', 7600, [{ de: DYELY, cents: 7600 }]),
  L('2025-04-08', CAT.tecnologia, 'Registro de domínio appmyclinic360.com.br (2 anos)', 7600, [{ de: DYELY, cents: 7600 }]),
  L('2025-04-09', CAT.dev, 'Desenvolvedor Jil Oliveira: 1º pagamento (início do projeto)', 500000, [
    { de: DYELY, cents: 400000 }, // cota dela (2.500) + cota do Diego (1.500)
    { de: RAFA, cents: 100000 },
  ]),
  L('2025-05-29', CAT.dev, 'Desenvolvedor Jil Oliveira: 2º pagamento (metade do projeto)', 350000, [
    { de: DYELY, cents: 175000 },
    { de: DYELY, cents: 105000, on: '2025-06-29' }, // cota do Diego, paga um mês depois
    { de: RAFA, cents: 70000, on: '2025-06-29' },
  ]),
  L('2025-06-15', CAT.dev, 'Desenvolvedor adicional Diego Paiva: 1º pagamento', 100000, [
    { de: DYELY, cents: 80000 },
    { de: RAFA, cents: 20000 },
  ]),
  L('2025-06-15', CAT.servidor, 'Servidores Contabo, 1 ano (pagamento feito ao Jil)', 48100, [{ de: DYELY, cents: 48100 }]),
  L('2025-09-01', CAT.marketing, 'Impressão de 3.000 panfletos A4 para o congresso', 174000, [{ de: DYELY, cents: 174000 }]),
  L('2025-09-09', CAT.advocacia, 'Solicitação de registro de marca no INPI', 18000, [{ de: DYELY, cents: 18000 }]),
  L('2025-09-19', CAT.marketing, 'Conteúdo Instagram: 12 artes (cards feed + stories)', 48000, [{ de: DYELY, cents: 48000 }]),
  L('2025-09-19', CAT.marketing, 'Conteúdo Instagram: 12 copies', 20000, [{ de: DYELY, cents: 20000 }]),
  L('2025-10-22', CAT.dev, 'Desenvolvedor Jil Oliveira: 3º pagamento (fim do projeto)', 350000, [
    { de: DYELY, cents: 280000 },
    { de: RAFA, cents: 70000 },
  ]),
  L('2025-10-22', CAT.dev, 'Desenvolvedor adicional Diego Paiva: 2º pagamento', 100000, [
    { de: DYELY, cents: 80000 },
    { de: RAFA, cents: 20000 },
  ]),
  L('2025-11-09', CAT.saas, 'Framer, plano Basic Site mensal (CA$ 30,00)', 11100, [{ de: RAFA, cents: 11100 }]),
  L('2025-12-03', CAT.dev, 'Desenvolvedor Jil Oliveira: fase final + deploy de produção', 300000, [
    { de: DYELY, cents: 240000 },
    { de: RAFA, cents: 60000 },
  ]),
  L('2026-02-10', CAT.tecnologia, 'Certificado digital A1 (Certisign)', 18968, [{ de: DYELY, cents: 18968 }]),
  L('2026-03-01', CAT.advocacia, 'Advogado Romulo: elaboração do contrato social', 1000000, [{ de: DYELY, cents: 1000000 }]),
  L('2026-03-10', CAT.marketing, 'Tráfego para post no Instagram (lançamento 09/04)', 20000, [{ de: DYELY, cents: 20000 }]),
  L('2026-03-23', CAT.marketing, 'SOW House: estúdio live de lançamento (09/04)', 150000, [{ de: DYELY, cents: 150000 }]),
  L('2026-04-01', CAT.marketing, 'André, designer gráfico: artes para o lançamento', 27500, [{ de: DYELY, cents: 27500 }]),
  L('2026-04-09', CAT.marketing, 'Tráfego: campanha de anúncios do lançamento (saldo Meta)', 100000, [], { aPagar: DYELY }),
  L('2026-04-10', CAT.dev, 'Jil Oliveira, sustentação + desenvolvimento: dez/25', 100000, [{ de: DYELY, cents: 100000 }]),
  L('2026-04-10', CAT.dev, 'Jil Oliveira, sustentação + desenvolvimento: jan/26', 300000, [{ de: DYELY, cents: 300000 }]),
  L('2026-04-10', CAT.dev, 'Jil Oliveira, sustentação + desenvolvimento: fev/26', 300000, [{ de: DYELY, cents: 300000 }]),
  L('2026-04-10', CAT.dev, 'Jil Oliveira, sustentação + desenvolvimento: mar/26', 300000, [{ de: DYELY, cents: 300000 }]),
  L('2026-04-13', CAT.marketing, 'Agência 4Growth: tráfego pago para captação de leads', 170000, [{ de: DYELY, cents: 170000 }]),
];

/* ── conferências antes de qualquer escrita ────────────── */
let falhou = false;
for (const l of LANCAMENTOS) {
  const somaPagos = l.pagos.reduce((s, p) => s + p.cents, 0);
  if (!l.aPagar && somaPagos !== l.total) {
    console.error(`ERRO: pagamentos de "${l.desc}" somam ${brl(somaPagos)}, valor é ${brl(l.total)}`);
    falhou = true;
  }
  if (l.aPagar && l.pagos.length) {
    console.error(`ERRO: "${l.desc}" é conta a pagar mas tem pagamentos.`);
    falhou = true;
  }
  const cotas = cotasEquity(l.total);
  const somaCotas = Object.values(cotas).reduce((s, c) => s + c, 0);
  if (somaCotas !== l.total) {
    console.error(`ERRO: cotas de "${l.desc}" somam ${brl(somaCotas)}, valor é ${brl(l.total)}`);
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
  const pg = l.aPagar
    ? `CONTA A PAGAR (previsto: ${nome(l.aPagar)})`
    : 'pagou: ' + l.pagos.map((p) => `${nome(p.de)} ${brl(p.cents)}`).join(' + ');
  console.log(`  ${l.data}  ${l.desc}  ${brl(l.total)}`);
  console.log(`            ${pg}`);
}
const desembolso = {};
for (const l of LANCAMENTOS) for (const p of l.pagos) desembolso[p.de] = (desembolso[p.de] ?? 0) + p.cents;
console.log('\nDesembolso ao fornecedor por sócio:');
for (const [id, c] of Object.entries(desembolso)) console.log(`  ${nome(id)}: ${brl(c)}`);

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
  const maiorPagador = l.aPagar ?? l.pagos.reduce((m, p) => (p.cents > m.cents ? p : m)).de;
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
      payment_status: l.aPagar ? 'unpaid' : 'paid',
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
    Object.entries(cotasEquity(l.total)).map(([member_id, share_cents]) => ({
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
  if (l.pagos.length) {
    const { error: e3 } = await db.from('expense_payments').insert(
      l.pagos.map((p) => ({
        expense_id: exp.id,
        member_id: p.de,
        amount_cents: p.cents,
        paid_on: p.on ?? l.data,
      })),
    );
    if (e3) {
      console.error(`Falha nos pagamentos de "${l.desc}": ${e3.message}`);
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
