#!/usr/bin/env node
/**
 * Importa o que a planilha "MyClinic360 - Planilha Financeira (2026)" tem de
 * NOVO em relação ao que já está no Plim (versão lida em 25/08/2026).
 *
 * O import anterior (scripts/importar-planilha-myclinic.mjs) trouxe a aba
 * Custos_por_Etapa e deixou a aba OPERAÇÃO 2026 inteira de fora. É ela que
 * entra agora: receita do Asaas, custos fixos mensais, impostos, marketing e
 * o aporte da Dyely no EMBRAPII.
 *
 * Diferente do primeiro, este script é INCREMENTAL e roda com o financeiro
 * cheio: antes de gravar qualquer linha ele procura no banco uma movimentação
 * com a mesma data, o mesmo valor e descrição parecida. Achou, pula e avisa.
 * Rodar duas vezes não duplica nada.
 *
 * ── O que depende de decisão da Rafaelle ──────────────────────────────────
 * Os grupos abaixo estão DESLIGADOS até ela responder. Ligar é trocar para
 * true; o motivo de cada um está no comentário do grupo.
 *
 * Uso (o padrão é simulação, não escreve nada):
 *   node scripts/importar-operacao-myclinic.mjs
 *   node scripts/importar-operacao-myclinic.mjs --confirm
 */
import { createClient } from '@supabase/supabase-js';

const confirmar = process.argv.includes('--confirm');
const COMPANY = '7a477045-b5a2-45dc-ac19-db875c515f21'; // MYCLINIC360

/* ── grupos: ligue conforme as respostas ───────────────── */
const GRUPOS = {
  /** Receita do Asaas, abr a ago/26. Entrada não divide entre sócios, então
   *  não mexe em acerto nenhum: seguro. */
  receitas: true,
  /**
   * Os R$ 2.500 que a Dyely completou no pagamento do EMBRAPII.
   *
   * NÃO entra como aporte. Regra da MyClinic (Rafaelle, 25/08): aqui ninguém
   * "dá" dinheiro para a clínica. O que um sócio põe do bolso é conta dos
   * três, e os outros devolvem a parte deles. Aporte de verdade não se
   * devolve, e não é esse o caso. Vale só para esta empresa; nas outras a
   * regra normal do Plim continua.
   */
  complementoDyely: true,
  /**
   * Custos fixos, impostos e marketing de mai a ago/26, pagos pelo CAIXA DA
   * EMPRESA (Asaas), confirmado por ela em 25/08. Como o dinheiro é da
   * empresa, ninguém fica devendo nada a ninguém.
   */
  despesasOperacionais: true,
  /**
   * Antecipação de recebíveis do Asaas em agosto (R$ 19.168,15).
   * PENDENTE: antecipação costuma ser o MESMO dinheiro das vendas, adiantado.
   * Se as receitas mensais já contam essas vendas, lançar isso conta duas
   * vezes e infla o faturamento em quase 20 mil.
   */
  antecipacao: false,
  /**
   * Pagamento do projeto EMBRAPII (R$ 19.064,16 em agosto).
   * PENDENTE: é saída, confirmado pela própria planilha (é o que faz o
   * resultado de agosto fechar em R$ 4.378,88). Falta saber se já foi pago,
   * por quem, e como fica o rateio 50/30/20 que a planilha usa nessa linha,
   * diferente dos 51/29/20 do Plim.
   */
  embrapii: false,
  /**
   * Tráfego pago de abril (R$ 2.500) e a campanha do Meta (R$ 1.000).
   * PENDENTE: a campanha de R$ 1.000 existia no Plim como conta a pagar e
   * NÃO está mais lá (sumiu entre 18 e 25/08). Antes de recriar, é preciso
   * saber se foi apagada de propósito. O tráfego de R$ 2.500 de abril também
   * não bate com nada que já está cadastrado.
   */
  trafegoAbril: false,
};

// Para conferir um grupo sem editar o arquivo:
//   node scripts/importar-operacao-myclinic.mjs --grupo=despesasOperacionais
// (segue valendo a simulação; gravar continua exigindo --confirm)
for (const arg of process.argv.filter((a) => a.startsWith('--grupo='))) {
  const g = arg.slice('--grupo='.length);
  if (!(g in GRUPOS)) {
    console.error(`Grupo "${g}" não existe. Opções: ${Object.keys(GRUPOS).join(', ')}`);
    process.exit(1);
  }
  GRUPOS[g] = true;
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/* ── sócios ────────────────────────────────────────────── */
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

const CAT = {
  dev: 'Serviços terceirizados',
  contabilidade: 'Contabilidade',
  impostos: 'Impostos',
  marketing: 'Marketing',
  servidor: 'Servidor/Infra',
  saas: 'Assinaturas/SaaS',
  operacao: 'Outros',
};

/* ── lançamentos ───────────────────────────────────────────
 * Os valores vêm da aba OPERAÇÃO 2026, coluna por mês. A planilha só diz o
 * mês, não o dia: a data usada é o último dia do mês de competência, menos
 * agosto, que ainda está em curso (usa o dia da leitura, 25/08).
 */
const receita = (data, desc, cents) => ({ tipo: 'revenue', data, desc, cents, cat: null });
/** `de` = id do sócio que pagou, ou 'EMPRESA' quando saiu do caixa da empresa. */
const despesa = (data, cat, desc, cents, de) => ({ tipo: 'expense', data, cat, desc, cents, de });
const daEmpresa = (l) => l.de === 'EMPRESA';

const LANCAMENTOS = [];

if (GRUPOS.receitas) {
  LANCAMENTOS.push(
    receita('2026-04-30', 'Recebimentos do Asaas: abril/26', 259332),
    receita('2026-05-31', 'Recebimentos do Asaas: maio/26', 924031),
    receita('2026-06-30', 'Recebimentos do Asaas: junho/26', 725632),
    receita('2026-07-31', 'Recebimentos do Asaas: julho/26', 695595),
    receita('2026-08-25', 'Recebimentos do Asaas: agosto/26 (mês em curso)', 570338),
  );
}

if (GRUPOS.complementoDyely) {
  // Despesa paga pela Dyely e rateada: o Diego devolve 29% e a Rafaelle 20%.
  LANCAMENTOS.push(
    despesa(
      '2026-08-13',
      CAT.operacao,
      'EMBRAPII: complemento do pagamento 01 (a Dyely completou)',
      250000,
      DYELY,
    ),
  );
}

if (GRUPOS.despesasOperacionais) {
  // Saiu do caixa da empresa (Asaas): sem pagamento de sócio, sem dívida.
  const PAGADOR = 'EMPRESA';
  LANCAMENTOS.push(
    // Desenvolvedor Jil: mensal de maio em diante (os meses até mar/26 já
    // foram importados pela outra aba, lançados todos em 10/04).
    despesa('2026-05-31', CAT.dev, 'Jil Oliveira, sustentação + desenvolvimento: abr/26', 300000, PAGADOR),
    despesa('2026-06-30', CAT.dev, 'Jil Oliveira, sustentação + desenvolvimento: mai/26', 300000, PAGADOR),
    despesa('2026-07-31', CAT.dev, 'Jil Oliveira, sustentação + desenvolvimento: jun/26', 300000, PAGADOR),
    despesa('2026-08-25', CAT.dev, 'Jil Oliveira, sustentação + desenvolvimento: jul/26', 300000, PAGADOR),
    // Contador Marcos: R$ 167,50 até abril, R$ 300 de maio em diante.
    despesa('2026-01-31', CAT.contabilidade, 'Contador Marcos: janeiro/26', 16750, PAGADOR),
    despesa('2026-02-28', CAT.contabilidade, 'Contador Marcos: fevereiro/26', 16750, PAGADOR),
    despesa('2026-03-31', CAT.contabilidade, 'Contador Marcos: março/26', 16750, PAGADOR),
    despesa('2026-04-30', CAT.contabilidade, 'Contador Marcos: abril/26', 16750, PAGADOR),
    despesa('2026-05-31', CAT.contabilidade, 'Contador Marcos: maio/26', 30000, PAGADOR),
    despesa('2026-06-30', CAT.contabilidade, 'Contador Marcos: junho/26', 30000, PAGADOR),
    despesa('2026-07-31', CAT.contabilidade, 'Contador Marcos: julho/26', 30000, PAGADOR),
    despesa('2026-08-25', CAT.contabilidade, 'Contador Marcos: agosto/26', 30000, PAGADOR),
    // Coworking
    despesa('2026-05-31', CAT.operacao, 'Coworking: maio/26', 19200, PAGADOR),
    despesa('2026-06-30', CAT.operacao, 'Coworking: junho/26', 8800, PAGADOR),
    despesa('2026-07-31', CAT.operacao, 'Coworking: julho/26', 8800, PAGADOR),
    despesa('2026-08-25', CAT.operacao, 'Coworking: agosto/26', 8000, PAGADOR),
    // Google Workspace (suporte@myclinic360.com.br)
    despesa('2026-05-31', CAT.saas, 'Google Workspace (suporte@myclinic360): maio/26', 4826, PAGADOR),
    despesa('2026-06-30', CAT.saas, 'Google Workspace (suporte@myclinic360): junho/26', 4321, PAGADOR),
    despesa('2026-07-31', CAT.saas, 'Google Workspace (suporte@myclinic360): julho/26', 4826, PAGADOR),
    despesa('2026-08-25', CAT.saas, 'Google Workspace (suporte@myclinic360): agosto/26', 5849, PAGADOR),
    // Infra e impostos
    despesa('2026-08-25', CAT.servidor, 'Contabo stage: anual ago/26 a ago/27', 49000, PAGADOR),
    despesa('2026-03-20', CAT.impostos, 'DAS Simples Nacional: março/26', 1045, PAGADOR),
    despesa('2026-05-31', CAT.impostos, 'DAS Simples Nacional: maio/26', 38904, PAGADOR),
    despesa('2026-06-30', CAT.impostos, 'DAS Simples Nacional: junho/26', 16946, PAGADOR),
    // Marketing (o de abril já está no Plim, lançado em 13/04)
    despesa('2026-05-31', CAT.marketing, 'Agência 4Growth: maio/26', 170000, PAGADOR),
    despesa('2026-06-30', CAT.marketing, 'Agência 4Growth: junho/26', 85000, PAGADOR),
    despesa('2026-07-31', CAT.marketing, 'Agência 4Growth: julho/26', 85000, PAGADOR),
    despesa('2026-06-30', CAT.marketing, 'Tráfego pago: junho/26', 50000, PAGADOR),
    despesa('2026-07-31', CAT.marketing, 'Tráfego pago: julho/26', 75000, PAGADOR),
  );
}

if (GRUPOS.antecipacao) {
  LANCAMENTOS.push(receita('2026-08-13', 'Antecipação de recebíveis (Asaas)', 1916815));
}

if (GRUPOS.embrapii) {
  LANCAMENTOS.push(
    despesa('2026-08-13', CAT.operacao, 'EMBRAPII: pagamento 01 do projeto', 1906416, 'EMPRESA'),
  );
}

if (GRUPOS.trafegoAbril) {
  LANCAMENTOS.push(
    despesa('2026-04-30', CAT.marketing, 'Tráfego pago: abril/26', 250000, 'EMPRESA'),
  );
}

if (LANCAMENTOS.length === 0) {
  console.log('Nenhum grupo ligado. Ajuste GRUPOS no topo do arquivo.');
  process.exit(0);
}

/* ── o que já existe no banco ──────────────────────────── */
const { data: existentes, error: erroLeitura } = await db
  .from('expenses')
  .select('id, description, spent_on, amount_cents, kind')
  .eq('company_id', COMPANY);
if (erroLeitura) {
  console.error('Falha ao ler o que já existe:', erroLeitura.message);
  process.exit(1);
}

/** Normaliza para comparar descrição sem acento, caixa ou pontuação. */
const norm = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Duplicata = mesmo valor e mesmo mês de competência. A descrição não precisa
 * bater letra a letra (a planilha e o Plim escrevem diferente), mas o valor e
 * o mês juntos já são um sinal forte o bastante para pedir revisão humana.
 */
function jaExiste(l) {
  const mes = l.data.slice(0, 7);
  return existentes.find(
    (e) =>
      e.amount_cents === l.cents &&
      e.spent_on.slice(0, 7) === mes &&
      (e.kind === l.tipo || norm(e.description).includes(norm(l.desc).slice(0, 12))),
  );
}

/**
 * `--autoteste`: prova que o detector de duplicata funciona antes de gravar
 * qualquer coisa. Ele recebe lançamentos que SABIDAMENTE já estão no Plim
 * (vieram do import anterior, com outra redação) e precisa reconhecer todos.
 * Se algum passar batido, o anti-duplicata não é confiável e o script para.
 */
if (process.argv.includes('--autoteste')) {
  const conhecidos = [
    despesa('2026-04-13', CAT.marketing, 'Agência 4Growth: abril/26', 170000, DYELY),
    despesa('2026-04-10', CAT.dev, 'Jil Oliveira, sustentação + desenvolvimento: mar/26', 300000, DYELY),
    despesa('2026-03-23', CAT.marketing, 'SOW House: estúdio live', 150000, DYELY),
    despesa('2026-02-10', CAT.impostos, 'Certificado digital A1', 18968, DYELY),
    despesa('2026-03-01', CAT.operacao, 'Advogado Romulo: contrato social', 1000000, DYELY),
  ];
  let ok = true;
  for (const c of conhecidos) {
    const achou = jaExiste(c);
    console.log(`  ${achou ? 'detectou' : 'PASSOU BATIDO'}: ${c.data} ${brl(c.cents)} ${c.desc}`);
    if (!achou) ok = false;
  }
  console.log(ok ? '\nAnti-duplicata OK.' : '\nAnti-duplicata FALHOU: não rode com --confirm.');
  process.exit(ok ? 0 : 1);
}

const novos = [];
const pulados = [];
for (const l of LANCAMENTOS) {
  const igual = jaExiste(l);
  if (igual) pulados.push({ l, igual });
  else novos.push(l);
}

/* ── prévia ────────────────────────────────────────────── */
console.log(`\nPlanilha lida: ${LANCAMENTOS.length} lançamentos nos grupos ligados.`);
if (pulados.length) {
  console.log(`\n${pulados.length} JÁ ESTÃO no Plim (não serão gravados):`);
  for (const { l, igual } of pulados) {
    console.log(`  - ${l.data} ${brl(l.cents)} ${l.desc}`);
    console.log(`      já existe: ${igual.spent_on} "${igual.description}"`);
  }
}
console.log(`\n${novos.length} lançamentos NOVOS:`);
let entra = 0;
let sai = 0;
for (const l of novos) {
  const quem =
    l.tipo === 'revenue'
      ? 'entrada na conta da empresa'
      : daEmpresa(l)
        ? 'pago pelo caixa da empresa (ninguém fica devendo)'
        : l.tipo === 'contribution'
        ? `aporte de ${nome(l.de)}${l.reembolsavel ? ', reembolsável (os outros devem a cota)' : ''}`
        : `pago por ${nome(l.de)}`;
  console.log(`  ${l.data}  ${brl(l.cents).padStart(12)}  ${l.desc}`);
  console.log(`              ${quem}`);
  if (l.tipo === 'expense') sai += l.cents;
  else entra += l.cents;
}
console.log(`\nEntra: ${brl(entra)}  |  Sai: ${brl(sai)}`);

const geramAcerto = novos.filter(
  (l) => (l.tipo === 'expense' && !daEmpresa(l)) || (l.tipo === 'contribution' && l.reembolsavel),
);
if (geramAcerto.length) {
  const porSocio = {};
  for (const l of geramAcerto) {
    const cotas = cotasEquity(l.cents);
    for (const [id, c] of Object.entries(cotas)) {
      if (id === l.de) continue;
      porSocio[id] = (porSocio[id] ?? 0) + c;
    }
  }
  console.log('\nDívida que estas despesas criam entre sócios:');
  for (const [id, c] of Object.entries(porSocio)) console.log(`  ${nome(id)} passa a dever ${brl(c)}`);
}

if (!confirmar) {
  console.log('\n--- SIMULAÇÃO. Nada foi gravado. Rode com --confirm para importar. ---');
  process.exit(0);
}

/* ── categorias (cria as que faltam) ───────────────────── */
const { data: cats } = await db.from('categories').select('id, name').eq('company_id', COMPANY);
const catId = async (nomeCat) => {
  if (!nomeCat) return null;
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
for (const l of novos) {
  const ehReceita = l.tipo === 'revenue';
  const ehAporte = l.tipo === 'contribution';
  const empresaPagou = daEmpresa(l);
  // A coluna paid_by_member_id é FK obrigatória. Quando quem pagou foi a
  // empresa, ela vira só um vínculo: o que manda no acerto é a AUSÊNCIA de
  // pagamento de sócio, logo abaixo.
  const vinculo = ehReceita || empresaPagou ? DYELY : l.de;
  const { data: exp, error: e1 } = await db
    .from('expenses')
    .insert({
      company_id: COMPANY,
      kind: l.tipo,
      description: l.desc,
      amount_cents: l.cents,
      currency_code: 'BRL',
      paid_by_member_id: vinculo,
      spent_on: l.data,
      // Aporte comum não divide; aporte reembolsável divide como despesa.
      split_mode: ehReceita || (ehAporte && !l.reembolsavel) ? 'custom' : 'equity',
      payment_status: 'paid',
      confirmation_status: 'confirmed',
      category_id: await catId(l.cat),
      source: ehReceita ? 'Asaas' : null,
      account: ehReceita ? 'Conta da empresa' : null,
      note: null,
    })
    .select('id')
    .single();
  if (e1) {
    console.error(`Falha em "${l.desc}": ${e1.message}`);
    process.exit(1);
  }

  // Rateio: despesa sempre divide; aporte só quando é reembolsável. Receita
  // nunca divide (é dinheiro que chegou, não custo de ninguém).
  if (l.tipo === 'expense' || (ehAporte && l.reembolsavel)) {
    const { error: e2 } = await db.from('expense_shares').insert(
      Object.entries(cotasEquity(l.cents)).map(([member_id, share_cents]) => ({
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
  }

  // Pagamento de sócio: entrada não tem (o dinheiro chegou), e conta paga
  // pelo caixa da empresa também não (ninguém tirou do bolso). Sem pagamento
  // de sócio, a responsabilidade de cada um é zero e nada vira dívida.
  if (!ehReceita && !empresaPagou) {
    const { error: e3 } = await db.from('expense_payments').insert({
      expense_id: exp.id,
      member_id: l.de,
      amount_cents: l.cents,
      paid_on: l.data,
    });
    if (e3) {
      console.error(`Falha no pagamento de "${l.desc}": ${e3.message}`);
      process.exit(1);
    }
  }
  console.log(`  ok: ${l.data} ${l.desc}`);
}

const { count: total } = await db
  .from('expenses')
  .select('id', { count: 'exact', head: true })
  .eq('company_id', COMPANY);
console.log(`\nImportação concluída: ${total} movimentações no banco.`);
console.log('Confira em app.plim.work: Movimentações e Acertos.');
