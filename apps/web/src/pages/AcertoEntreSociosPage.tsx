import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageLoading } from '../components/PageLoading';
import type { CompanyMember, MovementSettlement, Settlement } from '@plim/shared';
import { useActiveCompany } from '../company/ActiveCompanyContext';
import { companyApi, messageForError } from '../company/companyApi';
import { financeApi, formatMoney } from '../finance/financeApi';
import './acertoentre.css';

/**
 * O que uma pessoa deve para outra, despesa por despesa.
 *
 * A pergunta é uma só: "a Gabi pagou o quê, e eu não paguei a minha parte?".
 * A página responde isso e nada mais.
 *
 * O que ficou de fora, de propósito, depois de a Rafaelle olhar a primeira
 * versão e não entender o que estava vendo:
 *  - o que ela já pagou para a Gabi (é o que está resolvido, não o que falta);
 *  - as dívidas dela com OUTROS sócios (é outra conta, com outra pessoa);
 *  - o cálculo do saldo consolidado (explica o resumo, não esta pergunta).
 *
 * O total é o MESMO do resumo, porque agora as duas telas fazem a mesma conta
 * (por par de sócios). Quando a lista sozinha não fecha no total, o rodapé
 * mostra as linhas que fecham: o que o credor deve de volta e ajustes de
 * pagamentos antigos. Nada de número sem origem.
 */
export function AcertoEntreSociosPage() {
  const { deId, paraId } = useParams<{ deId: string; paraId: string }>();
  const { company } = useActiveCompany();

  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [movements, setMovements] = useState<MovementSettlement[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  /** Linha em que o "já paguei" está sendo salvo. */
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [mem, movs, sets] = await Promise.all([
        companyApi.listMembers(company.id),
        financeApi.getMovementSettlements(company.id),
        financeApi.getSettlements(company.id),
      ]);
      setMembers(mem);
      setMovements(movs);
      setSettlements(sets);
      setError('');
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setLoading(false);
    }
  }, [company.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <PageLoading />;
  if (!deId || !paraId) return <ErroDaPagina message="Endereço inválido." />;

  const nomeDe = (id: string) => members.find((m) => m.id === id)?.fullName ?? 'Sócio';
  const devedor = nomeDe(deId);
  const credor = nomeDe(paraId);

  /** Despesas que o CREDOR pagou e cuja parte do devedor segue em aberto. */
  const itensDoPar = (devedorId: string, credorId: string) =>
    movements
      .filter((m) => m.payerId === credorId)
      .flatMap((m) =>
        m.debts
          .filter((d) => d.debtorId === devedorId && d.remainingCents > 0)
          .map((d) => ({ mov: m, cents: d.remainingCents })),
      )
      .sort((a, b) => b.mov.spentOn.localeCompare(a.mov.spentOn));
  const emAberto = itensDoPar(deId, paraId);
  const somaItens = emAberto.reduce((soma, i) => soma + i.cents, 0);
  /** O que o credor deve DE VOLTA nas despesas que o devedor pagou. */
  const deVolta = itensDoPar(paraId, deId).reduce((soma, i) => soma + i.cents, 0);

  /**
   * O número oficial é o do resumo (mesma conta do backend). A lista explica:
   * itens em aberto, menos o que vem de volta, mais ajustes de pagamentos já
   * registrados (crédito de quem pagou além do devido, em dados antigos).
   */
  const acertoDoPar = settlements.find((st) => st.fromMemberId === deId && st.toMemberId === paraId);
  const acertoInverso = settlements.find((st) => st.fromMemberId === paraId && st.toMemberId === deId);
  const total = acertoDoPar?.amountCents ?? 0;
  const ajuste = total - (somaItens - deVolta);

  /** "Já paguei essa": quita a parte daquela despesa com aquele credor. */
  async function marcarPago(movementId: string, cents: number) {
    setBusy(movementId);
    setError('');
    try {
      await financeApi.createSettlementPayment(company.id, {
        fromMemberId: deId!,
        toMemberId: paraId!,
        amountCents: cents,
        expenseId: movementId,
      });
      await load();
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="ace">
      <Link to="/acertos" className="ace-back">
        ← Voltar para Acertos
      </Link>

      <header className="ace-head">
        <h1 className="ace-title">
          O que {devedor} deve a {credor}
        </h1>
        <p className="ace-amount" data-financial>
          {formatMoney(total)}
        </p>
        <p className="ace-sub">
          {emAberto.length > 0
            ? `${credor} pagou estas despesas, e a parte de ${devedor} ainda não foi acertada.`
            : total > 0
              ? 'Não há despesa em aberto: esse valor vem de pagamentos já registrados entre os dois. A conta está fechada logo abaixo.'
              : acertoInverso
                ? `Nada em aberto deste lado. Na verdade é ${credor} quem está devendo a ${devedor}.`
                : `Nada em aberto: ${devedor} já acertou tudo que ${credor} pagou.`}
        </p>
        {acertoInverso && (
          <Link className="ace-inverso" to={`/acertos/entre/${paraId}/${deId}`}>
            Ver o que {credor} deve a {devedor} ({formatMoney(acertoInverso.amountCents)})
          </Link>
        )}
      </header>

      {error && <div className="form-error">{error}</div>}

      {emAberto.length > 0 && (
        <ul className="ace-lista">
          {emAberto.map(({ mov, cents }) => (
            <li className="ace-item" key={`${mov.movementId}:${mov.payerId}`}>
              <Link to={`/financeiro/movimentacao/${mov.movementId}`} className="ace-item__info">
                <span className="ace-item__nome">{mov.description}</span>
                <span className="ace-item__meta">
                  {formatDateBr(mov.spentOn)} · {credor} pagou {formatMoney(mov.amountCents)}
                </span>
              </Link>
              <span className="ace-item__direita">
                <span className="ace-item__valor" data-financial>
                  {formatMoney(cents)}
                </span>
                <button
                  type="button"
                  className="ace-item__acao"
                  disabled={busy === mov.movementId}
                  onClick={() => marcarPago(mov.movementId, cents)}
                >
                  {busy === mov.movementId ? 'salvando…' : 'já paguei'}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Quando a lista sozinha não fecha no total, as linhas abaixo fecham:
          nada de número sem origem nesta tela. */}
      {(somaItens > 0 || total > 0) && (deVolta > 0 || ajuste !== 0) && (
        <div className="ace-fecho">
          <p className="ace-fecho__linha">
            <span>Despesas em aberto com {credor}</span>
            <strong data-financial>{formatMoney(somaItens)}</strong>
          </p>
          {deVolta > 0 && (
            <p className="ace-fecho__linha">
              <span>
                menos o que <Link to={`/acertos/entre/${paraId}/${deId}`}>{credor} deve a {devedor}</Link>
              </span>
              <strong data-financial>− {formatMoney(deVolta)}</strong>
            </p>
          )}
          {ajuste !== 0 && (
            <p className="ace-fecho__linha">
              <span>ajuste de pagamentos já registrados entre os dois</span>
              <strong data-financial>
                {ajuste > 0 ? '+ ' : '− '}
                {formatMoney(Math.abs(ajuste))}
              </strong>
            </p>
          )}
          <p className="ace-fecho__linha ace-fecho__linha--final">
            <span>Total a pagar</span>
            <strong data-financial>{formatMoney(total)}</strong>
          </p>
        </div>
      )}
    </div>
  );
}

function ErroDaPagina({ message }: { message: string }) {
  return (
    <div className="ace">
      <Link to="/acertos" className="ace-back">
        ← Voltar para Acertos
      </Link>
      <p className="dash-muted">{message}</p>
    </div>
  );
}

/** "04/04/2025" a partir de YYYY-MM-DD, sem passar por fuso. */
function formatDateBr(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
