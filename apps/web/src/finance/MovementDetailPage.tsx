import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { CompanyMember, Expense, SettlementPayment } from '@plim/shared';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { companyApi, messageForError } from '../company/companyApi';
import { useActiveCompany } from '../company/ActiveCompanyContext';
import { financeApi, formatMoney } from './financeApi';
import './movementdetail.css';

/**
 * Página de detalhe de uma movimentação.
 *
 * Era um modal, e virou página por três motivos concretos: tem URL própria (dá
 * para mandar o link para a sócia e o voltar do navegador funciona), no celular
 * ocupa a tela inteira em vez de rolagem dentro de rolagem, e cabe a ação
 * principal sem espremer.
 *
 * A ação principal é "quem já me pagou". A pergunta que traz a pessoa aqui é
 * essa, e antes ela só podia ser respondida no momento do cadastro ou na tela
 * de Acertos, que trabalha com saldo entre pessoas e não com esta movimentação.
 */
export function MovementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { company } = useActiveCompany();

  const [movement, setMovement] = useState<Expense | null>(null);
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [payments, setPayments] = useState<SettlementPayment[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyMember, setBusyMember] = useState<string | null>(null);
  const [undoing, setUndoing] = useState<SettlementPayment | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [mov, mem, pays] = await Promise.all([
        financeApi.getMovement(company.id, id),
        companyApi.listMembers(company.id),
        financeApi.listSettlementPayments(company.id),
      ]);
      setMovement(mov);
      setMembers(mem);
      setPayments(pays.filter((p) => p.expenseId === id && p.status === 'confirmed'));
      setError('');
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setLoading(false);
    }
  }, [company.id, id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="dash-muted">carregando movimentação…</p>;
  if (error) return <ErroDaPagina message={error} />;
  if (!movement) return <ErroDaPagina message="Movimentação não encontrada." />;

  const nameOf = (memberId: string) =>
    members.find((m) => m.id === memberId)?.fullName ?? 'Sócio';
  const isExpense = movement.kind === 'expense';
  const isRevenue = movement.kind === 'revenue';
  const isAporte = movement.kind === 'contribution';
  const toPay = isExpense && movement.paymentStatus === 'unpaid';
  const confirmed = movement.confirmationStatus === 'confirmed';
  const payerName = nameOf(movement.paidByMemberId);

  /** Partes de quem NÃO pagou: é sobre elas que existe dívida. */
  const devedores = movement.shares.filter(
    (s) => s.memberId !== movement.paidByMemberId && s.shareCents > 0,
  );
  const acertoDe = (memberId: string) =>
    payments.find((p) => p.fromMemberId === memberId) ?? null;

  /**
   * O que aconteceu com o dinheiro, em frases. Substitui as seis linhas de
   * "Entrou nos cálculos? Sim" que descreviam o motor, não o fato.
   */
  const frases: string[] = [];
  if (toPay) {
    frases.push(
      `Ainda não foi paga: está registrada como conta a pagar${
        movement.dueDate ? `, com vencimento em ${formatDate(movement.dueDate)}` : ''
      }.`,
      'Enquanto não for paga, não entra no total gasto nem gera acerto entre os sócios.',
    );
  } else if (!confirmed) {
    frases.push(
      `Está aguardando ${payerName} confirmar que fez esse pagamento.`,
      'Até a confirmação, ela não entra nos números da empresa.',
    );
  } else if (isRevenue) {
    frases.push(
      'Entrou no caixa da empresa e soma no total recebido.',
      'Entrada é da empresa, então não divide entre os sócios.',
    );
  } else if (isAporte) {
    frases.push(
      `${payerName} colocou esse dinheiro no negócio.`,
      'Aporte é capital, não gasto: não soma no total gasto nem na média mensal.',
    );
  } else {
    frases.push(`${payerName} pagou e o valor entrou no total gasto da empresa.`);
    if (devedores.length > 0) {
      frases.push(
        `A parte de ${devedores.map((s) => nameOf(s.memberId)).join(', ')} ficou como dívida com ${payerName}.`,
      );
    } else {
      frases.push('A parte que cabia coincide com quem pagou, então não há nada a acertar.');
    }
  }

  async function marcarAcerto(memberId: string, shareCents: number) {
    if (!movement) return;
    setBusyMember(memberId);
    setError('');
    try {
      await financeApi.createSettlementPayment(company.id, {
        fromMemberId: memberId,
        toMemberId: movement.paidByMemberId,
        amountCents: shareCents,
        expenseId: movement.id,
      });
      await load();
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setBusyMember(null);
    }
  }

  async function desfazerAcerto(pagamento: SettlementPayment) {
    setBusyMember(pagamento.fromMemberId);
    setError('');
    try {
      await financeApi.removeSettlementPayment(company.id, pagamento.id);
      setUndoing(null);
      await load();
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setBusyMember(null);
    }
  }

  async function excluirMovimentacao() {
    if (!movement) return;
    try {
      await financeApi.removeExpense(company.id, movement.id);
      navigate('/financeiro');
    } catch (err) {
      setError(messageForError(err));
      setDeleting(false);
    }
  }

  return (
    <div className="movp">
      <Link to="/financeiro" className="movp-back">
        ← Voltar para Movimentações
      </Link>

      {/* 1) o essencial: o que é, quanto e quando */}
      <header className="movp-head">
        <div className="movp-head__chips">
          <span className={`movp-chip movp-chip--${isRevenue ? 'in' : isAporte ? 'aporte' : 'out'}`}>
            {isRevenue ? 'Entrada' : isAporte ? 'Aporte' : toPay ? 'Conta a pagar' : 'Despesa'}
          </span>
          {isExpense && (
            <span className={'movp-chip movp-chip--' + (toPay ? 'warn' : 'ok')}>
              {toPay ? 'Em aberto' : 'Paga'}
            </span>
          )}
          {!confirmed && <span className="movp-chip movp-chip--warn">Aguardando confirmação</span>}
        </div>
        <h1 className="movp-title">{movement.description}</h1>
        <p className={'movp-amount' + (isRevenue ? ' is-in' : '')} data-financial>
          {formatMoney(movement.amountCents)}
        </p>
        <p className="movp-date">
          {toPay && movement.dueDate
            ? `Vence em ${formatDate(movement.dueDate)}`
            : formatDate(movement.spentOn)}
          {' · '}
          {isRevenue ? 'recebido por' : 'pago por'} {payerName}
        </p>
      </header>

      {error && <div className="form-error">{error}</div>}

      {/* 2) o que isso fez com o dinheiro, em frases */}
      <section className="movp-card">
        <h2 className="movp-card__title">O que aconteceu</h2>
        <ul className="movp-facts">
          {frases.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </section>

      {/* 3) o coração da tela: quem deve o quê, com a ação em cada linha */}
      {isExpense && devedores.length > 0 && (
        <section className="movp-card">
          <h2 className="movp-card__title">Quem deve o quê</h2>
          <p className="movp-card__sub">
            {payerName} pagou o total. Marque quem já acertou a parte.
          </p>

          <div className="movp-people">
            <div className="movp-person is-payer">
              <span className="movp-person__name">
                {payerName}
                <span className="movp-person__tag">pagou o total</span>
              </span>
              <span className="movp-person__value" data-financial>
                {formatMoney(
                  movement.shares.find((s) => s.memberId === movement.paidByMemberId)?.shareCents ?? 0,
                )}
              </span>
            </div>

            {devedores.map((s) => {
              const acerto = acertoDe(s.memberId);
              const ocupado = busyMember === s.memberId;
              return (
                <div className={'movp-person' + (acerto ? ' is-settled' : '')} key={s.memberId}>
                  <span className="movp-person__name">
                    {nameOf(s.memberId)}
                    {acerto ? (
                      <span className="movp-person__tag is-ok">já acertou</span>
                    ) : (
                      /* Sem etiqueta, "quem já pagou" e "quem falta" só se
                         distinguiam pela cor da linha: fraco para quem enxerga
                         mal cor e invisível na leitura em voz alta.
                         Conta em aberto ainda não gerou dívida: ali a parte é
                         só previsão. */
                      <span className="movp-person__tag is-due">
                        {toPay ? 'parte prevista' : 'falta pagar'}
                      </span>
                    )}
                  </span>
                  <span className="movp-person__right">
                    <span className="movp-person__value" data-financial>
                      {formatMoney(s.shareCents)}
                    </span>
                    {toPay ? null : acerto ? (
                      <button
                        type="button"
                        className="movp-action"
                        disabled={ocupado}
                        onClick={() => setUndoing(acerto)}
                      >
                        desfazer
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="movp-action is-primary"
                        disabled={ocupado}
                        onClick={() => marcarAcerto(s.memberId, s.shareCents)}
                      >
                        {ocupado ? 'salvando…' : 'já me pagou'}
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          {toPay && (
            <p className="movp-note">
              Marque a conta como paga para poder registrar quem acertou a parte dela.
            </p>
          )}
        </section>
      )}

      {/* 4) o resto dos dados, sem competir com o que importa */}
      <section className="movp-card">
        <h2 className="movp-card__title">Detalhes</h2>
        <dl className="movp-rows">
          <Linha k="Data" v={formatDate(movement.spentOn)} />
          {movement.categoryId && <Linha k="Categoria" v="—" hidden />}
          <Linha
            k={isRevenue ? 'Recebido por' : 'Pago por'}
            v={payerName}
          />
          {movement.createdByMemberId && movement.createdByMemberId !== movement.paidByMemberId && (
            <Linha k="Registrado por" v={nameOf(movement.createdByMemberId)} />
          )}
          {isExpense && (
            <Linha
              k="Forma de divisão"
              v={
                movement.splitMode === 'equal'
                  ? 'Igualmente'
                  : movement.splitMode === 'custom'
                    ? 'Personalizada'
                    : 'Por participação'
              }
            />
          )}
          {movement.tags.length > 0 && <Linha k="Tags" v={movement.tags.join(', ')} />}
          {movement.note && <Linha k="Observação" v={movement.note} />}
        </dl>
      </section>

      {/* 5) ações, no fim: destino da leitura, não competição com ela */}
      <div className="movp-actions">
        <Button onClick={() => navigate(`/financeiro/movimentacao/${movement.id}/editar`)}>
          Editar movimentação
        </Button>
        <button type="button" className="movp-danger" onClick={() => setDeleting(true)}>
          Excluir
        </button>
      </div>

      <ConfirmDialog
        open={deleting}
        title="Excluir movimentação?"
        message={
          <>
            <strong>{movement.description}</strong> de{' '}
            {formatMoney(movement.amountCents)} será apagada, junto com os acertos ligados a
            ela. Os saldos entre os sócios são recalculados. Não tem como desfazer.
          </>
        }
        onConfirm={excluirMovimentacao}
        onCancel={() => setDeleting(false)}
      />

      <ConfirmDialog
        open={undoing != null}
        title="Desfazer o acerto?"
        confirmLabel="Desfazer"
        danger={undoing?.isAuto === false}
        message={
          undoing?.isAuto === false ? (
            <>
              Esse acerto foi lançado à parte, em Acertos, de{' '}
              {formatMoney(undoing.amountCents)}. Ele representa dinheiro que mudou de mão,
              então só apague se tiver sido registrado por engano.
            </>
          ) : (
            <>
              {undoing && nameOf(undoing.fromMemberId)} volta a dever{' '}
              {undoing && formatMoney(undoing.amountCents)} a {payerName}.
            </>
          )
        }
        onConfirm={() => undoing && desfazerAcerto(undoing)}
        onCancel={() => setUndoing(null)}
      />
    </div>
  );
}

function Linha({ k, v, hidden }: { k: string; v: string; hidden?: boolean }) {
  if (hidden) return null;
  return (
    <div className="movp-row">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

function ErroDaPagina({ message }: { message: string }) {
  return (
    <div className="movp">
      <Link to="/financeiro" className="movp-back">
        ← Voltar para Movimentações
      </Link>
      <p className="dash-muted">{message}</p>
    </div>
  );
}

/** "04/04/2025" a partir de YYYY-MM-DD, sem passar por fuso. */
function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
