import { useState } from 'react';
import type { Company, CompanyMember, ExpenseSplitMode } from '@plim/shared';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { DateField } from '../components/ui/DateField';
import { messageForError } from '../company/companyApi';
import { financeApi, formatMoney, maskMoneyBRL, maskedMoneyToCents } from './financeApi';
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

type MovementType = 'expense' | 'revenue' | 'recurring' | 'contribution' | 'loan' | 'reimbursement';

const TYPE_CARDS: {
  id: MovementType;
  label: string;
  description: string;
  impact: string;
  soon?: boolean;
}[] = [
  {
    id: 'revenue',
    label: 'Entrada de dinheiro',
    description: 'Dinheiro que a empresa recebeu (venda, cliente, assinatura...).',
    impact: 'Entra como receita e melhora o resultado, recebido menos gasto.',
  },
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
    impact: 'Registra o investimento de cada sócio, não vira gasto nem dívida entre sócios.',
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

/** Origens comuns de receita (chips de um toque; "+" abre origem própria). */
const REVENUE_SOURCES = ['Asaas', 'Mercado Livre', 'Stripe', 'Pix', 'Cliente direto', 'Boleto'];

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
  /** Aporte reembolsável: os sócios pagam a parte deles ao autor. */
  const [reimbursable, setReimbursable] = useState(false);
  /** Receita: origem do dinheiro (Asaas, Mercado Livre, custom...). */
  const [source, setSource] = useState('');
  const [customSource, setCustomSource] = useState(false);
  /** Receita: conta que recebeu (sócio, empresa ou conta própria via "+"). */
  const [account, setAccount] = useState('');
  const [customAccounts, setCustomAccounts] = useState<string[]>([]);
  const [addingAccount, setAddingAccount] = useState(false);
  const [newAccount, setNewAccount] = useState('');
  /** Sócios que já acertaram a parte deles com o pagador (despesa já paga). */
  const [settledIds, setSettledIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const stepIdx = step === 'recurring' ? -1 : STEPS.indexOf(step);
  const isExpense = type === 'expense';
  const isRevenue = type === 'revenue';
  const isUnpaid = isExpense && paymentStatus === 'unpaid';
  const amountCents = maskedMoneyToCents(amount);
  const memberName = members.find((m) => m.id === memberId)?.fullName ?? 'Sócio';
  const soloMember = members.length <= 1;
  // Divisão entre sócios: sempre na despesa; no aporte só quando reembolsável.
  const splitsAmongPartners = isExpense || (type === 'contribution' && reimbursable);
  // Soma das participações. Quando "por participação" e a soma não fecha 100%,
  // o Plim divide proporcional ao que está definido — precisa avisar (senão a
  // divisão sai diferente das porcentagens cadastradas, em silêncio).
  const equityTotal = members.reduce((s, m) => s + (m.equityPercent ?? 0), 0);
  const equityGap = Math.round((100 - equityTotal) * 100) / 100;
  const showEquityWarn =
    splitMode === 'equity' && members.length > 1 && Math.abs(equityGap) > 0.01;
  const equityWarn = showEquityWarn ? (
    <div className="mw-eqwarn">
      {equityTotal <= 0 ? (
        <>
          Nenhuma participação foi definida ainda, então o Plim está dividindo{' '}
          <strong>em partes iguais</strong>. Defina as participações em Sócios ou use "Igualmente".
        </>
      ) : equityGap > 0 ? (
        <>
          As participações somam <strong>{formatPct(equityTotal)}</strong> (faltam {formatPct(equityGap)} para
          100%). O Plim divide proporcional ao que está definido, então cada sócio com participação
          assume uma fatia maior. Para dividir exatamente pelas porcentagens, complete a sociedade em
          Sócios; ou escolha "Igualmente".
        </>
      ) : (
        <>
          As participações somam <strong>{formatPct(equityTotal)}</strong> (passou de 100%). Ajuste em
          Sócios para os acertos ficarem exatos.
        </>
      )}
    </div>
  ) : null;

  /** Linhas "Parte de fulano" com o toggle "está devendo / já me pagou". */
  function splitRows(payerId: string, allowSettle: boolean, payerLabel: string) {
    if (amountCents == null) return null;
    return previewSplit(amountCents, members, splitMode).map((s) => {
      const m = members.find((x) => x.id === s.memberId);
      const isPayer = s.memberId === payerId;
      const settled = settledIds.includes(s.memberId);
      const canSettle = allowSettle && !isPayer && s.cents > 0;
      return (
        <div className="mw-review__row" key={s.memberId}>
          <span>
            Parte de {m?.fullName ?? 'Sócio'}
            {isPayer && <span className="mw-payer"> · {payerLabel}</span>}
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
    });
  }

  /** Rótulo da conta escolhida (nome do sócio ou conta própria). */
  const accountMember = members.find((m) => m.id === account);
  const accountLabel = accountMember ? accountMember.fullName : account;

  function confirmAddAccount() {
    const v = newAccount.trim();
    if (!v) return;
    if (!customAccounts.includes(v) && !members.some((m) => m.fullName === v)) {
      setCustomAccounts((a) => [...a, v]);
    }
    setAccount(v);
    setNewAccount('');
    setAddingAccount(false);
  }

  function next(to: WizStep | 'recurring') {
    setError('');
    setStep(to);
  }

  function validateDetails(): boolean {
    if (description.trim().length < 1) {
      setError(
        isExpense
          ? 'Conte de onde veio o gasto, ex.: "Domínio do site".'
          : isRevenue
            ? 'Diga de onde veio a entrada, ex.: "Mensalidade de cliente".'
            : 'Dê um nome ao aporte, ex.: "Aporte inicial".',
      );
      return false;
    }
    if (amountCents == null) {
      setError('Informe um valor válido, ex.: 150,00.');
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
      } else if (type === 'revenue') {
        await financeApi.createRevenue(company.id, {
          description: description.trim(),
          amountCents: amountCents!,
          receivedByMemberId: accountMember ? accountMember.id : undefined,
          account: accountLabel.trim() || null,
          source: source.trim() || null,
          receivedOn: date,
          note: note.trim() || null,
        });
      } else {
        await financeApi.createContribution(company.id, {
          description: description.trim(),
          amountCents: amountCents!,
          memberId,
          contributedOn: date,
          note: note.trim() || null,
          reimbursable,
          splitMode: reimbursable ? (splitMode === 'equal' ? 'equal' : 'equity') : undefined,
          settledMemberIds:
            reimbursable && settledIds.length > 0
              ? settledIds.filter((id) => id !== memberId)
              : undefined,
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
            {isExpense ? 'Sobre esse gasto' : isRevenue ? 'Sobre essa entrada' : 'Sobre esse aporte'}
          </p>
          <div className="mw-form">
            <Input
              label={isExpense ? 'De onde veio o gasto' : isRevenue ? 'De onde veio a entrada' : 'Como quer chamar esse aporte'}
              placeholder={
                isExpense
                  ? 'Ex.: Servidor, domínio, contador…'
                  : isRevenue
                    ? 'Ex.: Mensalidade de cliente, venda…'
                    : 'Ex.: Aporte inicial'
              }
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              autoFocus
            />
            <Input
              label={`Valor (${company.currencyCode ?? 'BRL'})`}
              inputMode="decimal"
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(maskMoneyBRL(e.target.value))}
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
                <DateField
                  value={dueDate}
                  onChange={setDueDate}
                  placeholder="Escolha o vencimento"
                />
              </div>
            ) : (
              <div className="field">
                <label className="field__label">{isRevenue ? 'Quando entrou' : 'Quando foi'}</label>
                <DateField
                  value={date}
                  onChange={setDate}
                  max={new Date().toISOString().slice(0, 10)}
                />
              </div>
            )}
            {isRevenue && (
              <div className="field">
                <label className="field__label">De onde veio o dinheiro (origem)</label>
                <div className="mw-sources">
                  {REVENUE_SOURCES.map((s) => (
                    <button
                      type="button"
                      key={s}
                      className={'mw-chip' + (!customSource && source === s ? ' is-on' : '')}
                      onClick={() => {
                        setSource(s);
                        setCustomSource(false);
                      }}
                    >
                      {s}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={'mw-chip mw-chip--add' + (customSource ? ' is-on' : '')}
                    onClick={() => {
                      setCustomSource(true);
                      setSource('');
                    }}
                  >
                    + Outra
                  </button>
                </div>
                {customSource && (
                  <input
                    className="field__input"
                    style={{ marginTop: 8 }}
                    placeholder="Ex.: Hotmart, PagSeguro, loja física…"
                    value={source}
                    maxLength={60}
                    onChange={(e) => setSource(e.target.value)}
                    autoFocus
                  />
                )}
              </div>
            )}
            {isRevenue && (
              <div className="field">
                <label className="field__label">Entrou na conta de (opcional)</label>
                <div className="mw-accountrow">
                  <select
                    className="field__select"
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                  >
                    <option value="">Não informar</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.fullName}
                      </option>
                    ))}
                    <option value="Conta da empresa">Conta da empresa</option>
                    {customAccounts.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="mw-addbox"
                    onClick={() => setAddingAccount((v) => !v)}
                    aria-label="Adicionar uma conta"
                    title="Adicionar uma conta"
                  >
                    +
                  </button>
                </div>
                {addingAccount && (
                  <div className="mw-accountadd">
                    <input
                      className="field__input"
                      placeholder="Ex.: Conta da empresa, Nubank PJ…"
                      value={newAccount}
                      maxLength={60}
                      onChange={(e) => setNewAccount(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          confirmAddAccount();
                        }
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="mw-addconfirm"
                      onClick={confirmAddAccount}
                      disabled={!newAccount.trim()}
                    >
                      Adicionar
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="field">
              <label className="field__label">Observação (opcional)</label>
              <textarea
                className="field__input rc-textarea"
                placeholder={
                  isExpense
                    ? 'Ex.: renovação anual do domínio.'
                    : isRevenue
                      ? 'Ex.: assinatura mensal do cliente X.'
                      : 'Ex.: aporte combinado na reunião de junho.'
                }
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                rows={2}
              />
            </div>
          </div>
          <div className="mw-actions">
            <Button block onClick={() => validateDetails() && next(isRevenue || (soloMember && !isExpense) ? 'review' : 'people')}>
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
                {equityWarn}
                {amountCents != null && members.length > 1 && (
                  <div className="mw-review mw-splitpreview">
                    {splitRows(memberId, !isUnpaid, isUnpaid ? 'vai pagar' : 'pagou')}
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
              <div className="field">
                <label className="field__label">Os sócios vão te reembolsar?</label>
                <div className="fin-split">
                  <button
                    type="button"
                    className={'fin-split__opt' + (!reimbursable ? ' fin-split__opt--active' : '')}
                    onClick={() => setReimbursable(false)}
                  >
                    Não, é só meu
                  </button>
                  <button
                    type="button"
                    className={'fin-split__opt' + (reimbursable ? ' fin-split__opt--active' : '')}
                    onClick={() => setReimbursable(true)}
                    disabled={soloMember}
                  >
                    Sim, cada sócio paga a parte
                  </button>
                </div>
                {!reimbursable ? (
                  <p className="mw-hint">
                    Fica registrado como capital de {memberName}: não vira gasto nem gera dívida
                    entre os sócios.
                  </p>
                ) : (
                  <>
                    <p className="mw-hint">
                      Você adiantou por todos. Cada sócio passa a te dever a parte dele: entra nos
                      acertos, mas continua sendo capital (fora do total gasto).
                    </p>
                    {members.length > 1 && (
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
                    )}
                    {equityWarn}
                    {amountCents != null && members.length > 1 && (
                      <div className="mw-review mw-splitpreview">
                        {splitRows(memberId, true, 'aportou')}
                      </div>
                    )}
                    {members.length > 1 && (
                      <p className="mw-hint">
                        Alguém já te pagou a parte dela? Toque em "está devendo" para marcar como
                        acertado. O Plim registra o acerto junto com o aporte.
                      </p>
                    )}
                  </>
                )}
              </div>
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
              <strong>
                {isExpense ? 'Despesa' : isRevenue ? 'Entrada' : reimbursable ? 'Aporte reembolsável' : 'Aporte'}
              </strong>
            </div>
            <div className="mw-review__row">
              <span>{isExpense ? 'Gasto' : isRevenue ? 'Entrada' : 'Aporte'}</span>
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
            {isRevenue && source.trim() && (
              <div className="mw-review__row">
                <span>Origem</span>
                <strong>{source.trim()}</strong>
              </div>
            )}
            <div className="mw-review__row">
              <span>{isExpense ? 'Pago por' : isRevenue ? 'Entrou na conta de' : 'Aportado por'}</span>
              <strong>{isRevenue ? accountLabel.trim() || 'Não informado' : memberName}</strong>
            </div>
            {splitsAmongPartners && (
              <div className="mw-review__row">
                <span>Divisão</span>
                <strong>{splitMode === 'equity' ? 'Por participação' : 'Igualmente'}</strong>
              </div>
            )}
            {splitsAmongPartners &&
              amountCents != null &&
              members.length > 1 &&
              previewSplit(amountCents, members, splitMode).map((s) => {
                const m = members.find((x) => x.id === s.memberId);
                const isPayer = s.memberId === memberId;
                const status = isPayer
                  ? isExpense
                    ? isUnpaid
                      ? 'vai pagar'
                      : 'pagou'
                    : 'aportou'
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
                : isRevenue
                  ? 'Ao salvar, o Plim registra a entrada e melhora o resultado (recebido menos gasto). Não divide entre os sócios.'
                  : reimbursable
                    ? 'Ao salvar, o Plim registra o capital e cria o acerto: cada sócio te deve a parte dele. Não afeta o total gasto.'
                    : 'Ao salvar, o Plim registra o investimento, sem afetar o total gasto nem os acertos.'}
          </p>
          <div className="mw-actions">
            <Button block onClick={save} disabled={saving}>
              {saving
                ? 'Salvando…'
                : isUnpaid
                  ? 'Salvar conta a pagar'
                  : isExpense
                    ? 'Salvar despesa'
                    : isRevenue
                      ? 'Salvar entrada'
                      : 'Salvar aporte'}
            </Button>
            <button
              type="button"
              className="mw-back"
              onClick={() => next(isRevenue || (soloMember && !isExpense) ? 'details' : 'people')}
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

/** Porcentagem enxuta em pt-BR (80, 33,33). */
function formatPct(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

function formatDateBr(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}
