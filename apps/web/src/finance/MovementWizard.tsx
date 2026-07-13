import { useState } from 'react';
import type { Company, CompanyMember, ExpenseSplitMode } from '@plim/shared';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { messageForError } from '../company/companyApi';
import { financeApi, formatMoney, parseMoneyToCents } from './financeApi';
import { RecurringCostForm } from './RecurringCostForm';
import '../pages/finance.css'; // reusa .fin-split (toggle de divisão)
import './wizard.css';

/**
 * Jornada "Adicionar movimentação" — guiada, nunca formulário frio.
 * Passos: tipo → dados → pessoas/divisão → revisão → salvar.
 * Cada tipo explica como afeta os cálculos do Plim.
 */

/**
 * Prévia do rateio, espelho da regra do backend (método do maior resto):
 * a soma das partes fecha exatamente o valor. Só exibição; quem decide é a API.
 */
function previewSplit(
  amountCents: number,
  members: CompanyMember[],
  mode: ExpenseSplitMode,
): { memberId: string; cents: number }[] {
  const weights = members.map((m) => (mode === 'equal' ? 1 : Math.max(0, m.equityPercent ?? 0)));
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  const exact =
    totalWeight <= 0
      ? members.map(() => amountCents / members.length)
      : weights.map((w) => (amountCents * w) / totalWeight);
  const cents = exact.map((x) => Math.floor(x));
  let remaining = amountCents - cents.reduce((s, c) => s + c, 0);
  const byFrac = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; remaining > 0 && k < cents.length; k++, remaining--) cents[byFrac[k]!.i]! += 1;
  return members.map((m, i) => ({ memberId: m.id, cents: cents[i]! }));
}

type MovementType = 'expense' | 'recurring' | 'contribution' | 'loan' | 'reimbursement';

const TYPE_CARDS: {
  id: MovementType;
  label: string;
  description: string;
  impact: string;
  soon?: boolean;
}[] = [
  {
    id: 'expense',
    label: 'Despesa',
    description: 'Algo que foi pago para criar ou manter o negócio.',
    impact: 'Entra no total gasto e é dividida entre os sócios pelas participações.',
  },
  {
    id: 'contribution',
    label: 'Aporte',
    description: 'Dinheiro colocado por um sócio no negócio.',
    impact: 'Registra o investimento de cada sócio — não vira gasto nem dívida entre sócios.',
  },
  {
    id: 'recurring',
    label: 'Custo recorrente',
    description: 'Uma assinatura, ferramenta ou pagamento que se repete.',
    impact: 'Mostra quanto custa manter a empresa por mês.',
  },
  {
    id: 'loan',
    label: 'Empréstimo',
    description: 'Valor emprestado para a empresa devolver depois.',
    impact: 'Vai controlar o que a empresa deve devolver.',
    soon: true,
  },
  {
    id: 'reimbursement',
    label: 'Reembolso',
    description: 'Algo que a empresa precisa devolver para alguém.',
    impact: 'Vai acertar devoluções sem bagunçar os cálculos.',
    soon: true,
  },
];

type WizStep = 'type' | 'details' | 'people' | 'review';
const STEPS: WizStep[] = ['type', 'details', 'people', 'review'];

export function MovementWizard({
  company,
  members,
  onCreated,
  onRefresh,
  onClose,
}: {
  company: Company;
  members: CompanyMember[];
  /** Salvou despesa/aporte: recarrega e fecha. */
  onCreated: () => void;
  /** Recarrega os números sem fechar (custo recorrente: "adicionar outro"). */
  onRefresh: () => void;
  /** Fecha o modal ("Ver dashboard" do custo recorrente). */
  onClose: () => void;
}) {
  const [step, setStep] = useState<WizStep | 'recurring'>('type');
  const [type, setType] = useState<MovementType | ''>('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'unpaid'>('paid');
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [memberId, setMemberId] = useState(members[0]?.id ?? '');
  const [splitMode, setSplitMode] = useState<ExpenseSplitMode>('equity');
  /** Sócios que já acertaram a parte deles com o pagador (despesa já paga). */
  const [settledIds, setSettledIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const stepIdx = step === 'recurring' ? -1 : STEPS.indexOf(step);
  const isExpense = type === 'expense';
  const isUnpaid = isExpense && paymentStatus === 'unpaid';
  const amountCents = parseMoneyToCents(amount);
  const memberName = members.find((m) => m.id === memberId)?.fullName ?? 'Sócio';
  const soloMember = members.length <= 1;

  function next(to: WizStep | 'recurring') {
    setError('');
    setStep(to);
  }

  function validateDetails(): boolean {
    if (description.trim().length < 1) {
      setError(isExpense ? 'Conte de onde veio o gasto — ex.: "Domínio do site".' : 'Dê um nome ao aporte — ex.: "Aporte inicial".');
      return false;
    }
    if (amountCents == null) {
      setError('Informe um valor válido — ex.: 150,00.');
      return false;
    }
    if (isUnpaid && !dueDate) {
      setError('Informe a data de vencimento dessa conta a pagar.');
      return false;
    }
    return true;
  }

  async function save() {
    setError('');
    setSaving(true);
    try {
      if (type === 'expense') {
        await financeApi.createExpense(company.id, {
          description: description.trim(),
          amountCents: amountCents!,
          paidByMemberId: memberId,
          spentOn: paymentStatus === 'unpaid' ? undefined : date,
          splitMode,
          note: note.trim() || null,
          paymentStatus,
          dueDate: paymentStatus === 'unpaid' ? dueDate : null,
          settledMemberIds:
            paymentStatus === 'paid' && settledIds.length > 0
              ? settledIds.filter((id) => id !== memberId)
              : undefined,
        });
      } else {
        await financeApi.createContribution(company.id, {
          description: description.trim(),
          amountCents: amountCents!,
          memberId,
          contributedOn: date,
          note: note.trim() || null,
        });
      }
      onCreated();
    } catch (err) {
      setError(messageForError(err));
      setSaving(false);
    }
  }

  return (
    <div className="mw">
      {/* progresso */}
      <div className="mw-steps" aria-hidden="true">
        {STEPS.map((s, i) => (
          <span
            key={s}
            className={'mw-steps__dot' + (i < stepIdx ? ' is-done' : i === stepIdx ? ' is-active' : '')}
          />
        ))}
      </div>

      {error && <div className="form-error">{error}</div>}

      {/* ── 1: tipo ── */}
      {step === 'type' && (
        <>
          <p className="mw-lead">O que você quer registrar?</p>
          <div className="mw-cards">
            {TYPE_CARDS.map((t) => (
              <button
                type="button"
                key={t.id}
                className={'mw-card' + (type === t.id ? ' is-active' : '') + (t.soon ? ' is-soon' : '')}
                disabled={t.soon}
                onClick={() => setType(t.id)}
              >
                <span className="mw-card__label">
                  {t.label}
                  {t.soon && <span className="mw-card__soon">em breve</span>}
                </span>
                <span className="mw-card__desc">{t.description}</span>
                <span className="mw-card__impact">{t.impact}</span>
              </button>
            ))}
          </div>
          <div className="mw-actions">
            <Button block disabled={!type} onClick={() => next(type === 'recurring' ? 'recurring' : 'details')}>
              Continuar
            </Button>
          </div>
        </>
      )}

      {/* ── custo recorrente (formulário próprio, jornada 3) ── */}
      {step === 'recurring' && (
        <>
          <button type="button" className="mw-back" style={{ alignSelf: 'flex-start' }} onClick={() => next('type')}>
            ← Voltar
          </button>
          <RecurringCostForm company={company} members={members} onSaved={onRefresh} onClose={onClose} />
        </>
      )}

      {/* ── 2: dados ── */}
      {step === 'details' && (
        <>
          <p className="mw-lead">
            {isExpense ? 'Sobre esse gasto' : 'Sobre esse aporte'}
          </p>
          <div className="mw-form">
            <Input
              label={isExpense ? 'De onde veio o gasto' : 'Como quer chamar esse aporte'}
              placeholder={isExpense ? 'Ex.: Servidor, domínio, contador…' : 'Ex.: Aporte inicial'}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              autoFocus
            />
            <Input
              label={`Valor (${company.currencyCode ?? 'BRL'})`}
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {isExpense && (
              <div className="field">
                <label className="field__label">Essa despesa já foi paga?</label>
                <div className="fin-split">
                  <button
                    type="button"
                    className={'fin-split__opt' + (paymentStatus === 'paid' ? ' fin-split__opt--active' : '')}
                    onClick={() => setPaymentStatus('paid')}
                  >
                    Já paga
                  </button>
                  <button
                    type="button"
                    className={'fin-split__opt' + (paymentStatus === 'unpaid' ? ' fin-split__opt--active' : '')}
                    onClick={() => setPaymentStatus('unpaid')}
                  >
                    A pagar
                  </button>
                </div>
                <p className="mw-hint">
                  {paymentStatus === 'paid'
                    ? 'Já paga: entra no total gasto e nos acertos entre os sócios. No próximo passo você registra quem pagou e a parte de cada sócio.'
                    : 'A pagar: vira um lembrete com vencimento. Só entra nos cálculos quando você marcar como paga. No próximo passo você define quem vai pagar e a parte de cada sócio.'}
                </p>
              </div>
            )}
            {isUnpaid ? (
              <div className="field">
                <label className="field__label">Vencimento</label>
                <input
                  type="date"
                  className="field__input"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            ) : (
              <div className="field">
                <label className="field__label">Quando foi</label>
                <input
                  type="date"
                  className="field__input"
                  value={date}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            )}
            <div className="field">
              <label className="field__label">Observação (opcional)</label>
              <textarea
                className="field__input rc-textarea"
                placeholder={isExpense ? 'Ex.: renovação anual do domínio.' : 'Ex.: aporte combinado na reunião de junho.'}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                rows={2}
              />
            </div>
          </div>
          <div className="mw-actions">
            <Button block onClick={() => validateDetails() && next(soloMember && !isExpense ? 'review' : 'people')}>
              Continuar
            </Button>
            <button type="button" className="mw-back" onClick={() => next('type')}>
              ← Voltar
            </button>
          </div>
        </>
      )}

      {/* ── 3: pessoas / divisão ── */}
      {step === 'people' && (
        <>
          <p className="mw-lead">
            {isUnpaid ? 'Quem vai pagar e como dividir' : isExpense ? 'Quem pagou e como dividir' : 'Quem fez o aporte'}
          </p>
          <div className="mw-form">
            <Select
              label={isUnpaid ? 'Quem vai pagar' : isExpense ? 'Quem pagou' : 'Sócio que aportou'}
              value={memberId}
              onChange={setMemberId}
              options={members.map((m) => ({ value: m.id, label: m.fullName }))}
            />
            {isExpense && (
              <div className="field">
                <label className="field__label">Como dividir entre os sócios</label>
                <div className="fin-split">
                  <button
                    type="button"
                    className={'fin-split__opt' + (splitMode === 'equity' ? ' fin-split__opt--active' : '')}
                    onClick={() => setSplitMode('equity')}
                  >
                    Por participação
                  </button>
                  <button
                    type="button"
                    className={'fin-split__opt' + (splitMode === 'equal' ? ' fin-split__opt--active' : '')}
                    onClick={() => setSplitMode('equal')}
                  >
                    Igualmente
                  </button>
                </div>
                <p className="mw-hint">
                  {splitMode === 'equity'
                    ? 'Cada sócio assume a parte proporcional à participação dele. Se alguém pagou mais que a própria parte, o Plim calcula o acerto.'
                    : 'O valor é dividido em partes iguais entre todos os sócios, independente da participação.'}
                </p>
                {amountCents != null && members.length > 1 && (
                  <div className="mw-review mw-splitpreview">
                    {previewSplit(amountCents, members, splitMode).map((s) => {
                      const m = members.find((x) => x.id === s.memberId);
                      const isPayer = s.memberId === memberId;
                      const settled = settledIds.includes(s.memberId);
                      const canSettle = !isPayer && !isUnpaid && s.cents > 0;
                      return (
                        <div className="mw-review__row" key={s.memberId}>
                          <span>
                            Parte de {m?.fullName ?? 'Sócio'}
                            {isPayer && <span className="mw-payer"> · {isUnpaid ? 'vai pagar' : 'pagou'}</span>}
                          </span>
                          <span className="mw-splitright">
                            {canSettle && (
                              <button
                                type="button"
                                className={'mw-settle' + (settled ? ' mw-settle--on' : '')}
                                aria-pressed={settled}
                                onClick={() =>
                                  setSettledIds((ids) =>
                                    settled ? ids.filter((id) => id !== s.memberId) : [...ids, s.memberId],
                                  )
                                }
                              >
                                {settled ? 'já me pagou ✓' : 'está devendo'}
                              </button>
                            )}
                            <strong data-financial>{formatMoney(s.cents, company.currencyCode)}</strong>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {!isUnpaid && members.length > 1 && (
                  <p className="mw-hint">
                    Alguém já te passou a parte dela? Toque em "está devendo" para marcar como
                    acertado. O Plim registra o acerto junto com a despesa.
                  </p>
                )}
              </div>
            )}
            {!isExpense && (
              <p className="mw-hint">
                O aporte fica registrado como investimento de {memberName} — não vira gasto nem gera
                dívida entre os sócios.
              </p>
            )}
          </div>
          <div className="mw-actions">
            <Button block onClick={() => next('review')}>
              Continuar
            </Button>
            <button type="button" className="mw-back" onClick={() => next('details')}>
              ← Voltar
            </button>
          </div>
        </>
      )}

      {/* ── 4: revisão ── */}
      {step === 'review' && (
        <>
          <p className="mw-lead">Confere pra mim?</p>
          <div className="mw-review">
            <div className="mw-review__row">
              <span>Tipo</span>
              <strong>{isExpense ? 'Despesa' : 'Aporte'}</strong>
            </div>
            <div className="mw-review__row">
              <span>{isExpense ? 'Gasto' : 'Aporte'}</span>
              <strong>{description.trim() || '—'}</strong>
            </div>
            <div className="mw-review__row">
              <span>Valor</span>
              <strong data-financial>{amountCents != null ? formatMoney(amountCents, company.currencyCode) : '—'}</strong>
            </div>
            {isUnpaid ? (
              <>
                <div className="mw-review__row">
                  <span>Situação</span>
                  <strong>A pagar</strong>
                </div>
                <div className="mw-review__row">
                  <span>Vencimento</span>
                  <strong>{dueDate ? formatDateBr(dueDate) : '—'}</strong>
                </div>
              </>
            ) : (
              <div className="mw-review__row">
                <span>Quando</span>
                <strong>{formatDateBr(date)}</strong>
              </div>
            )}
            <div className="mw-review__row">
              <span>{isExpense ? 'Pago por' : 'Aportado por'}</span>
              <strong>{memberName}</strong>
            </div>
            {isExpense && (
              <div className="mw-review__row">
                <span>Divisão</span>
                <strong>{splitMode === 'equity' ? 'Por participação' : 'Igualmente'}</strong>
              </div>
            )}
            {isExpense &&
              amountCents != null &&
              members.length > 1 &&
              previewSplit(amountCents, members, splitMode).map((s) => {
                const m = members.find((x) => x.id === s.memberId);
                const isPayer = s.memberId === memberId;
                const status = isPayer
                  ? isUnpaid
                    ? 'vai pagar'
                    : 'pagou'
                  : isUnpaid || s.cents === 0
                    ? null
                    : settledIds.includes(s.memberId)
                      ? 'já acertou'
                      : 'está devendo';
                return (
                  <div className="mw-review__row mw-review__row--sub" key={s.memberId}>
                    <span>
                      Parte de {m?.fullName ?? 'Sócio'}
                      {status && (
                        <span className={status === 'está devendo' ? 'mw-owing' : 'mw-payer'}>
                          {' '}
                          · {status}
                        </span>
                      )}
                    </span>
                    <strong data-financial>{formatMoney(s.cents, company.currencyCode)}</strong>
                  </div>
                );
              })}
            {note.trim() && (
              <div className="mw-review__row">
                <span>Observação</span>
                <strong>{note.trim()}</strong>
              </div>
            )}
          </div>
          <p className="mw-hint">
            {isUnpaid
              ? 'Ao salvar, o Plim registra a conta a pagar e te lembra do vencimento. Ela entra nos cálculos quando você marcar como paga.'
              : isExpense
                ? 'Ao salvar, o Plim atualiza o total gasto e recalcula os acertos entre os sócios.'
                : 'Ao salvar, o Plim registra o investimento — sem afetar o total gasto nem os acertos.'}
          </p>
          <div className="mw-actions">
            <Button block onClick={save} disabled={saving}>
              {saving ? 'Salvando…' : isUnpaid ? 'Salvar conta a pagar' : isExpense ? 'Salvar despesa' : 'Salvar aporte'}
            </Button>
            <button
              type="button"
              className="mw-back"
              onClick={() => next(soloMember && !isExpense ? 'details' : 'people')}
              disabled={saving}
            >
              ← Voltar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function formatDateBr(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}
