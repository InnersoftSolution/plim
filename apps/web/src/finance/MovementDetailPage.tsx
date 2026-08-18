import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { AuditEvent, CompanyMember, Expense, SettlementPayment } from '@plim/shared';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { companyApi, messageForError } from '../company/companyApi';
import { useActiveCompany } from '../company/ActiveCompanyContext';
import { financeApi, formatMoney } from './financeApi';
import { acertosDaMovimentacao, totalPago } from './movimentacaoAcerto';
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
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyMember, setBusyMember] = useState<string | null>(null);
  const [undoing, setUndoing] = useState<SettlementPayment | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [mov, mem, pays, trail] = await Promise.all([
        financeApi.getMovement(company.id, id),
        companyApi.listMembers(company.id),
        financeApi.listSettlementPayments(company.id),
        // Auditoria é acessório: se falhar, a página vive sem o histórico.
        financeApi.listMovementAudit(company.id, id).catch(() => []),
      ]);
      setMovement(mov);
      setMembers(mem);
      setPayments(pays.filter((p) => p.expenseId === id && p.status === 'confirmed'));
      setAudit(trail);
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

  /**
   * PAGAMENTO: quem tirou dinheiro do bolso. Pode ser mais de uma pessoa, e não
   * se confunde com a responsabilidade pelo custo (as partes). Uma despesa pode
   * estar 100% paga ao fornecedor e ainda ter valor a acertar entre os sócios.
   */
  const pagoCents = totalPago(movement.payments);
  const faltaAoFornecedor = Math.max(0, movement.amountCents - pagoCents);
  const parcial = movement.paymentStatus === 'partial';
  const varios = movement.payments.length > 1;

  /** ACERTO: só as diferenças entre o que cada um pagou e o que lhe cabia. */
  const acertos = isExpense ? acertosDaMovimentacao(movement) : [];
  /** Acerto já registrado entre esse par (devedor → credor). */
  const acertoRegistrado = (devedorId: string, credorId: string) =>
    payments.find((p) => p.fromMemberId === devedorId && p.toMemberId === credorId) ?? null;
  /** Quem ainda tem valor em aberto, depois de descontar o que já foi pago. */
  const aindaDevem = acertos.filter((a) =>
    a.para.some((d) => !acertoRegistrado(a.devedorId, d.credorId)),
  );

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
    frases.push(
      varios
        ? `${movement.payments.map((p) => nameOf(p.memberId)).join(' e ')} pagaram, e o valor entrou no total gasto da empresa.`
        : `${payerName} pagou e o valor entrou no total gasto da empresa.`,
    );
    if (parcial) {
      frases.push(
        `Ainda faltam ${formatMoney(faltaAoFornecedor)} para quitar com o fornecedor. Esse pedaço é conta em aberto, não dívida entre sócios.`,
      );
    }
    if (aindaDevem.length > 0) {
      frases.push(
        `${aindaDevem.map((a) => nameOf(a.devedorId)).join(', ')} ${aindaDevem.length > 1 ? 'têm' : 'tem'} valor a regularizar com quem adiantou.`,
      );
    } else if (acertos.length > 0) {
      frases.push('Todo mundo já acertou a parte: não há nada em aberto entre os sócios.');
    } else {
      frases.push('Cada um pagou exatamente a parte que cabia: não há nada a acertar.');
    }
  }

  /**
   * Registra que o devedor acertou com AQUELE credor. O credor vem explícito
   * porque com mais de um pagador a dívida se reparte, e supor um destino só
   * criaria acerto no lugar errado.
   */
  async function marcarAcerto(devedorId: string, credorId: string, cents: number) {
    if (!movement) return;
    setBusyMember(devedorId + credorId);
    setError('');
    try {
      await financeApi.createSettlementPayment(company.id, {
        fromMemberId: devedorId,
        toMemberId: credorId,
        amountCents: cents,
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
    setBusyMember(pagamento.fromMemberId + pagamento.toMemberId);
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
            <span className={'movp-chip movp-chip--' + (toPay || parcial ? 'warn' : 'ok')}>
              {toPay ? 'Em aberto' : parcial ? 'Parcial' : 'Paga'}
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
          {isRevenue
            ? `recebido por ${payerName}`
            : varios
              ? `pago por ${movement.payments.length} sócios`
              : `pago por ${payerName}`}
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

      {/* 3) PAGAMENTO: quem colocou dinheiro. Fato consumado, não muda. */}
      {!isRevenue && movement.payments.length > 0 && (
        <section className="movp-card">
          <div className="movp-card__head">
            <h2 className="movp-card__title">Pagamento da despesa</h2>
            <span className={'movp-chip movp-chip--' + (parcial ? 'warn' : 'ok')}>
              {parcial ? 'Parcial' : 'Paga'}
            </span>
          </div>
          <p className="movp-card__sub">
            Quem tirou dinheiro do bolso. Isso é com o fornecedor, e não muda quando entra ou sai
            sócio.
          </p>

          <div className="movp-people">
            {movement.payments.map((p) => (
              <div className="movp-person is-payer" key={p.id}>
                <span className="movp-person__name">
                  {nameOf(p.memberId)}
                  <span className="movp-person__tag">pagou</span>
                </span>
                <span className="movp-person__value" data-financial>
                  {formatMoney(p.amountCents)}
                </span>
              </div>
            ))}
            {/* Total só quando ele acrescenta: com um pagador que pagou tudo,
                repetir o mesmo número duas vezes é ruído. */}
            {(varios || parcial) && (
              <div className="movp-person movp-person--total">
                <span className="movp-person__name">{parcial ? 'Já foi pago' : 'Total'}</span>
                <span className="movp-person__value" data-financial>
                  {formatMoney(pagoCents)}
                </span>
              </div>
            )}
          </div>

          {parcial && (
            <p className="movp-note">
              Faltam {formatMoney(faltaAoFornecedor)} para quitar com o fornecedor. Esse valor é
              conta em aberto, não entra no acerto entre os sócios.
            </p>
          )}
        </section>
      )}

      {/* 4) ACERTO: só as diferenças entre quem pagou e de quem é o custo. */}
      {isExpense && !toPay && (
        <section className="movp-card">
          <h2 className="movp-card__title">Acerto entre sócios</h2>
          {acertos.length === 0 ? (
            <p className="movp-card__sub">
              Cada um pagou exatamente a parte que cabia. Não há nada a acertar nesta movimentação.
            </p>
          ) : (
            <>
              <p className="movp-card__sub">
                A diferença entre o que cada um pagou e a parte que cabia a ele.
              </p>
              <div className="movp-acertos">
                {acertos.map((a) => {
                  // O que ainda falta: o já registrado sai da conta, senão a
                  // tela cobraria de novo quem já pagou.
                  const pendente = a.para
                    .filter((d) => !acertoRegistrado(a.devedorId, d.credorId))
                    .reduce((soma, d) => soma + d.cents, 0);
                  return (
                  <div className="movp-acerto" key={a.devedorId}>
                    <div className="movp-acerto__head">
                      <span className="movp-acerto__quem">{nameOf(a.devedorId)}</span>
                      <span
                        className={'movp-acerto__total' + (pendente === 0 ? ' is-ok' : '')}
                        data-financial
                      >
                        {pendente === 0
                          ? `${formatMoney(a.totalCents)} já acertados`
                          : `${formatMoney(pendente)} a regularizar`}
                      </span>
                    </div>
                    {a.para.map((destino) => {
                      const registrado = acertoRegistrado(a.devedorId, destino.credorId);
                      const ocupado = busyMember === a.devedorId + destino.credorId;
                      return (
                        <div
                          className={'movp-acerto__linha' + (registrado ? ' is-settled' : '')}
                          key={destino.credorId}
                        >
                          <span className="movp-acerto__para">
                            <span data-financial>{formatMoney(destino.cents)}</span> para{' '}
                            {nameOf(destino.credorId)}
                            {registrado && <span className="movp-person__tag is-ok">já acertou</span>}
                          </span>
                          {registrado ? (
                            <button
                              type="button"
                              className="movp-action"
                              disabled={ocupado}
                              onClick={() => setUndoing(registrado)}
                            >
                              desfazer
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="movp-action is-primary"
                              disabled={ocupado}
                              onClick={() =>
                                marcarAcerto(a.devedorId, destino.credorId, destino.cents)
                              }
                            >
                              {ocupado ? 'salvando…' : 'registrar acerto'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}

      {/* Conta a pagar: a divisão ainda é previsão, não dívida. */}
      {isExpense && toPay && movement.shares.length > 0 && (
        <section className="movp-card">
          <h2 className="movp-card__title">Parte prevista de cada sócio</h2>
          <p className="movp-card__sub">
            Ninguém pagou nada ainda. Marque a conta como paga para o acerto entre sócios existir.
          </p>
          <div className="movp-people">
            {movement.shares
              .filter((s) => s.shareCents > 0)
              .map((s) => (
                <div className="movp-person" key={s.memberId}>
                  <span className="movp-person__name">{nameOf(s.memberId)}</span>
                  <span className="movp-person__value" data-financial>
                    {formatMoney(s.shareCents)}
                  </span>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* 5) o resto dos dados, sem competir com o que importa */}
      <section className="movp-card">
        <h2 className="movp-card__title">Detalhes</h2>
        <dl className="movp-rows">
          <Linha k="Data" v={formatDate(movement.spentOn)} />
          {movement.categoryId && <Linha k="Categoria" v="—" hidden />}
          <Linha
            k={isRevenue ? 'Recebido por' : 'Pago por'}
            v={
              varios
                ? movement.payments.map((p) => nameOf(p.memberId)).join(', ')
                : payerName
            }
          />
          {/* Sempre visível: é a trilha de "quem colocou isso aqui". Sem
              criador registrado = veio de importação/script, e dizer isso
              evita a dúvida "será que o outro sócio duplicou?". */}
          <Linha
            k="Registrado por"
            v={
              movement.createdByMemberId
                ? nameOf(movement.createdByMemberId)
                : 'Importação da planilha'
            }
          />
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

      {/* Trilha de auditoria: cada ação sobre esta movimentação, com autor e
          hora. Movimentações antigas (de antes da trilha) só têm o
          "Registrado por" acima. */}
      {audit.length > 0 && (
        <section className="movp-card">
          <h2 className="movp-card__title">Histórico</h2>
          <ul className="movp-trail">
            {audit.map((ev) => (
              <li className="movp-trail__item" key={ev.id}>
                <span className={`movp-trail__dot movp-trail__dot--${ev.action}`} aria-hidden="true" />
                <span className="movp-trail__text">{ev.summary}</span>
                <time className="movp-trail__when" dateTime={ev.createdAt}>
                  {formatDateTime(ev.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 6) ações, no fim: destino da leitura, não competição com ela */}
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

/** Data e hora LOCAIS do evento de auditoria ("17/08/2026 14:32"). */
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
