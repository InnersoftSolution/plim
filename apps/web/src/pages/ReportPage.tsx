import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { CompanyMember, Expense, MemberBalance, Settlement } from '@plim/shared';
import { PageLoading } from '../components/PageLoading';
import { Button } from '../components/ui/Button';
import { useActiveCompany } from '../company/ActiveCompanyContext';
import { companyApi, messageForError } from '../company/companyApi';
import { financeApi, formatMoney } from '../finance/financeApi';
import { paidByCompany } from '../finance/due';
import './report.css';

/**
 * Relatórios: a saúde da empresa explicada, não só mostrada (pedido da
 * Rafaelle, 27 ago 2026, depois de "de onde vem esse −38 mil?").
 *
 * A página separa as TRÊS perguntas que o antigo "saldo atual" misturava:
 *   1. Quanto a empresa TEM?   → caixa: receita − o que o caixa pagou.
 *   2. Como vai o NEGÓCIO?     → resultado: entrou − saiu, no total e por mês.
 *   3. Quem deve a QUEM?       → acertos: o que cada sócio bancou além da
 *      própria parte, já com os pagamentos abatidos.
 * Misturá-las era o que fazia o número parecer errado: dinheiro que sócio pôs
 * do bolso vira saída sem entrada correspondente (aqui aporte não existe), e o
 * "saldo" despencava sem o caixa ter esse buraco.
 */

type Data = {
  members: CompanyMember[];
  expenses: Expense[];
  settlements: Settlement[];
  balances: MemberBalance[];
};
type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | ({ status: 'ready' } & Data);

export function ReportPage() {
  const { company } = useActiveCompany();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const [members, expenses, settlements, balances] = await Promise.all([
        companyApi.listMembers(company.id),
        financeApi.listExpenses(company.id),
        financeApi.getSettlements(company.id),
        financeApi.getBalances(company.id),
      ]);
      setState({ status: 'ready', members, expenses, settlements, balances });
    } catch (err) {
      setState({ status: 'error', message: messageForError(err) });
    }
  }, [company.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === 'loading') return <PageLoading label="montando o relatório…" />;
  if (state.status === 'error') {
    return (
      <div className="rep rep--center">
        <p>{state.message}</p>
        <Button onClick={() => void load()}>Tentar de novo</Button>
      </div>
    );
  }

  const { members, expenses, settlements, balances } = state;
  const nameOf = (id: string) => members.find((m) => m.id === id)?.fullName ?? 'Sócio';

  /* ── as somas base ── */
  const confirmada = (e: Expense) => e.confirmationStatus === 'confirmed';
  const receitas = expenses.filter((e) => e.kind === 'revenue' && confirmada(e));
  const despesasPagas = expenses.filter(
    (e) => e.kind === 'expense' && confirmada(e) && e.paymentStatus === 'paid',
  );
  const soma = (l: Expense[]) => l.reduce((t, e) => t + e.amountCents, 0);
  const receitaCents = soma(receitas);
  const saidaCents = soma(despesasPagas);
  const resultadoCents = receitaCents - saidaCents;

  /* 1) CAIXA: só o que passou pela conta da empresa. Despesa paga por sócio
     não saiu do caixa; despesa paga pelo caixa (sem pagamento de sócio) sim. */
  const pagasPeloCaixa = despesasPagas.filter((e) => paidByCompany(e));
  const caixaCents = receitaCents - soma(pagasPeloCaixa);

  /* 3) QUEM FINANCIOU: o que cada sócio tirou do próprio bolso. */
  const doBolso = new Map<string, number>();
  for (const e of despesasPagas) {
    for (const p of e.payments) {
      doBolso.set(p.memberId, (doBolso.get(p.memberId) ?? 0) + p.amountCents);
    }
  }
  const totalBolsoCents = [...doBolso.values()].reduce((a, b) => a + b, 0);

  /* 2) RESULTADO MÊS A MÊS, com a sequência atual de meses no azul. */
  const porMes = new Map<string, { in: number; out: number }>();
  for (const e of [...receitas, ...despesasPagas]) {
    const m = e.spentOn.slice(0, 7);
    const at = porMes.get(m) ?? { in: 0, out: 0 };
    if (e.kind === 'revenue') at.in += e.amountCents;
    else at.out += e.amountCents;
    porMes.set(m, at);
  }
  const meses = [...porMes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, v]) => ({ mes, ...v, res: v.in - v.out }));
  const ultimos = meses.slice(-12);
  let azulSeguidos = 0;
  for (let i = meses.length - 1; i >= 0; i--) {
    // Empate técnico não quebra a sequência: um mês que fecha a menos de 3% da
    // própria receita (caso real: agosto −621 sobre 24,8k, por causa do
    // EMBRAPII coberto pela antecipação) ainda é um mês que se pagou.
    const m = meses[i]!;
    if (m.res > 0 || (m.in > 0 && Math.abs(m.res) < m.in * 0.03)) azulSeguidos++;
    else break;
  }

  const maioresGastos = [...despesasPagas].sort((a, b) => b.amountCents - a.amountCents).slice(0, 5);
  const aReceber = settlements.reduce((t, s) => t + s.amountCents, 0);
  const jaAcertado = settlements.reduce((t, s) => t + (s.alreadyPaidCents ?? 0), 0);

  /** "setembro 2025": a coluna do mês tem espaço de sobra, e o nome inteiro se
   *  lê sem decifrar abreviação. */
  const rotuloMes = (m: string) => {
    const [ano, mm] = m.split('-');
    const nome = new Date(Number(ano), Number(mm) - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
    return `${nome} ${ano}`;
  };

  return (
    <div className="rep">
      <header className="rep-head">
        <h1>Relatórios</h1>
        <p>A saúde da empresa, explicada número a número.</p>
      </header>

      {/* ── 1. quanto a empresa tem ── */}
      <section className="rep-card" aria-label="Caixa da empresa">
        <h2>Quanto a empresa tem</h2>
        <div className="rep-big" data-financial>
          <span className={caixaCents < 0 ? 'is-neg' : 'is-pos'}>{formatMoney(caixaCents)}</span>
          <span className="rep-big__lab">caixa da empresa, pelo que está registrado</span>
        </div>
        <p className="rep-exp">
          É o dinheiro que passou pela conta da empresa: {formatMoney(receitaCents)} de receitas
          menos {formatMoney(soma(pagasPeloCaixa))} de contas que o próprio caixa pagou. O que os
          sócios pagaram do bolso não sai daqui, porque nunca esteve aqui.
        </p>
        {/* Nada de citar meio de recebimento aqui: cada empresa usa o seu, e o
            aviso tem que valer para todas. */}
        <p className="rep-note">
          Compare com o saldo real da conta da empresa. Se os números não baterem, é sinal de que
          falta registrar alguma coisa, quase sempre tarifas e taxas ou um recebimento que ainda não
          caiu. Registrando, o Plim espelha a conta.
        </p>
      </section>

      {/* ── 2. como vai o negócio ── */}
      <section className="rep-card" aria-label="Resultado do negócio">
        <h2>Como vai o negócio</h2>
        <div className="rep-big" data-financial>
          <span className={resultadoCents < 0 ? 'is-neg' : 'is-pos'}>{formatMoney(resultadoCents)}</span>
          <span className="rep-big__lab">
            resultado desde o início: {formatMoney(receitaCents)} recebidos − {formatMoney(saidaCents)} gastos
          </span>
        </div>
        {azulSeguidos >= 2 && (
          <p className="rep-good">
            A operação se paga há {azulSeguidos} meses: desde {rotuloMes(meses[meses.length - azulSeguidos]!.mes)},
            o que entra cobre o que sai. O vermelho acumulado vem da fase de construção, antes da
            receita existir.
          </p>
        )}
        <div className="rep-meses" role="table" aria-label="Resultado mês a mês">
          <div className="rep-meses__head" role="row">
            <span>Mês</span>
            <span>Entrou</span>
            <span>Saiu</span>
            <span>Resultado</span>
          </div>
          {ultimos.map((m) => (
            <div className="rep-meses__row" role="row" key={m.mes}>
              <span className="rep-meses__mes">{rotuloMes(m.mes)}</span>
              <span data-financial>{m.in ? formatMoney(m.in) : '·'}</span>
              <span data-financial>{m.out ? formatMoney(m.out) : '·'}</span>
              <span data-financial className={m.res < 0 ? 'is-neg' : 'is-pos'}>
                {m.res > 0 ? '+' : ''}{formatMoney(m.res)}
              </span>
            </div>
          ))}
        </div>
        <div className="rep-tops">
          <strong>Para onde foi o dinheiro (maiores gastos)</strong>
          {maioresGastos.map((e) => (
            <Link key={e.id} to={`/financeiro/movimentacao/${e.id}`} className="rep-tops__row">
              <span>{e.description}</span>
              <span data-financial>{formatMoney(e.amountCents)}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── 3. quem financiou e quem deve a quem ── */}
      <section className="rep-card" aria-label="Quem financiou e acertos">
        <h2>Quem bancou o começo</h2>
        <p className="rep-exp">
          Quando a receita não cobria os gastos, o dinheiro saiu do bolso dos sócios. Aqui não
          existe aporte: quem pôs, recebe de volta pelos acertos.
        </p>
        <div className="rep-fontes">
          {[...doBolso.entries()]
            .sort(([, a], [, b]) => b - a)
            .map(([id, cents]) => (
              <div className="rep-fontes__row" key={id}>
                <span>{nameOf(id)} pôs do bolso</span>
                <span data-financial>{formatMoney(cents)}</span>
              </div>
            ))}
          <div className="rep-fontes__row">
            <span>O caixa da empresa pagou direto</span>
            <span data-financial>{formatMoney(soma(pagasPeloCaixa))}</span>
          </div>
          <div className="rep-fontes__row rep-fontes__row--total">
            <span>Total que saiu ({formatMoney(totalBolsoCents)} dos sócios)</span>
            <span data-financial>{formatMoney(saidaCents)}</span>
          </div>
        </div>

        <h2 className="rep-sub">A conta de cada sócio</h2>
        <p className="rep-exp">
          Quem paga a própria parte não gera dívida: a cota de cada um morre na hora do
          pagamento. O que vira acerto é só a parte dos OUTROS que alguém adiantou. É por isso
          que quem pôs mais dinheiro não recebe tudo de volta: uma fatia do que pôs era a
          própria cota societária.
        </p>
        <div className="rep-socios">
          {balances
            .slice()
            .sort((x, y) => y.netCents - x.netCents)
            .map((b) => {
              const pct = members.find((m) => m.id === b.memberId)?.equityPercent;
              return (
                <div className="rep-socios__card" key={b.memberId}>
                  <strong>
                    {b.fullName}
                    {pct != null && <span className="rep-socios__pct">{pct}%</span>}
                  </strong>
                  <div className="rep-socios__linha">
                    <span>Pagou do bolso</span>
                    <span data-financial>{formatMoney(b.paidCents)}</span>
                  </div>
                  <div className="rep-socios__linha">
                    <span>A parte que lhe cabia</span>
                    <span data-financial>{formatMoney(b.owedCents)}</span>
                  </div>
                  <div
                    className={
                      'rep-socios__linha rep-socios__linha--net ' +
                      (b.netCents > 0 ? 'is-pos' : b.netCents < 0 ? 'is-neg' : '')
                    }
                  >
                    <span>{b.netCents > 0 ? 'Fica a receber' : b.netCents < 0 ? 'Fica devendo' : 'Em dia'}</span>
                    <span data-financial>{formatMoney(Math.abs(b.netCents))}</span>
                  </div>
                </div>
              );
            })}
        </div>
        {jaAcertado > 0 && (
          <p className="rep-exp">
            O "fica devendo" já desconta os pagamentos de acerto registrados: por isso ele pode
            diferir um pouco da conta seca de pagou menos cabia.
          </p>
        )}

        <h2 className="rep-sub">Quem deve a quem hoje</h2>
        {settlements.length === 0 ? (
          <p className="rep-exp">Ninguém deve nada a ninguém: tudo acertado.</p>
        ) : (
          <div className="rep-acertos">
            {settlements.map((s, i) => (
              <button
                type="button"
                key={`${s.fromMemberId}-${s.toMemberId}-${i}`}
                className="rep-acertos__row"
                onClick={() => navigate(`/acertos/entre/${s.fromMemberId}/${s.toMemberId}`)}
                title="Ver o extrato desse par"
              >
                <span>
                  <strong>{s.fromName}</strong> deve <b data-financial>{formatMoney(s.amountCents)}</b> para{' '}
                  <strong>{s.toName}</strong>
                </span>
                {(s.alreadyPaidCents ?? 0) > 0 && (
                  <span className="rep-acertos__paid">já abateu {formatMoney(s.alreadyPaidCents!)}</span>
                )}
              </button>
            ))}
            <p className="rep-exp">
              Somando, {formatMoney(aReceber)} ainda circulam entre os sócios
              {jaAcertado > 0 ? <>, com {formatMoney(jaAcertado)} já abatidos por pagamentos registrados</> : null}.
              Registrar um pagamento em <Link to="/acertos">Acertos</Link> desconta daqui na hora.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
