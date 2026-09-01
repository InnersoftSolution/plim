import { useEffect, useState, type FormEvent } from 'react';
import {
  recurringCategoryCatalog,
  recurringFrequencyCatalog,
  type Category,
  type Company,
  type CompanyMember,
  type RecurringCategory,
  type RecurringCost,
  type RecurringFrequency,
  type RecurringSplitMode,
} from '@plim/shared';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { DateField } from '../components/ui/DateField';
import { messageForError } from '../company/companyApi';
import { centsToMaskedInput, maskedMoneyToCents, formatMoney } from './financeApi';
import { EMPRESA_PAGOU } from './PayersField';
import { categoryApi } from './categoryApi';
import { recurringApi } from './recurringApi';
import './wizard.css';
import { MoneyField } from './MoneyField';

/**
 * Jornada "Custo recorrente" — orientação, não formulário frio.
 * Após salvar, mostra o estado de sucesso com "Ver dashboard" / "Adicionar outro".
 */
export function RecurringCostForm({
  company,
  members,
  cost,
  onSaved,
  onClose,
}: {
  company: Company;
  members: CompanyMember[];
  /** Quando presente, o formulário edita este custo em vez de criar um novo. */
  cost?: RecurringCost | null;
  /** Chamado após cada salvamento (pra Home recarregar os números). */
  onSaved: () => void;
  /** Fecha o modal ("Ver dashboard"). */
  onClose: () => void;
}) {
  const isEditing = !!cost;
  const [name, setName] = useState(cost?.name ?? '');
  const [category, setCategory] = useState<RecurringCategory | ''>(cost?.category ?? '');
  /**
   * Categoria DA EMPRESA. É ela que a cobrança gerada herda: um custo de
   * Tecnologia gera conta de Tecnologia, mês após mês. A lista fixa antiga
   * (Ferramentas, Infraestrutura…) não conversava com as categorias da empresa,
   * e a conta nascia "Sem categoria".
   */
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState(cost?.categoryId ?? '');
  useEffect(() => {
    categoryApi
      .list(company.id)
      .then((cats) => setCategories(cats.filter((c) => !c.archived)))
      .catch(() => setCategories([]));
  }, [company.id]);
  const [amount, setAmount] = useState(
    cost ? centsToMaskedInput(cost.amountCents) : '',
  );
  const [frequency, setFrequency] = useState<RecurringFrequency | ''>(cost?.frequency ?? 'monthly');
  // O sentinela EMPRESA_PAGOU vive só no estado da tela: no payload ele vira
  // paidByCompany true + um sócio de registro, igual ao wizard de movimentação.
  // Custo novo nasce pago pela EMPRESA: é o caixa dela que banca as contas, e
  // sócio pagando do bolso é a exceção, não a regra (Rafaelle, 1 set).
  const [paidBy, setPaidBy] = useState(
    cost ? (cost.paidByCompany ? EMPRESA_PAGOU : cost.paidByMemberId) : EMPRESA_PAGOU,
  );
  const [splitMode, setSplitMode] = useState<RecurringSplitMode>(cost?.splitMode ?? 'equity');
  // Primeira cobrança já vem preenchida com hoje: o custo começa a cobrar de
  // imediato (vira conta a pagar dividida). O usuário pode adiar se quiser.
  const [nextCharge, setNextCharge] = useState(
    () => cost?.nextChargeOn ?? new Date().toISOString().slice(0, 10),
  );
  // "Até quando": vazio = sem previsão de fim. Contrato com prazo definido para
  // de cobrar sozinho no dia certo, sem depender de alguém lembrar de desativar.
  const [endsOn, setEndsOn] = useState(() => cost?.endsOn ?? '');
  const [note, setNote] = useState(cost?.note ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedCents, setSavedCents] = useState<number | null>(null);

  function reset() {
    setName('');
    setCategory('');
    setCategoryId('');
    setAmount('');
    setFrequency('monthly');
    setNextCharge(new Date().toISOString().slice(0, 10));
    setNote('');
    setError('');
    setSavedCents(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const amountCents = maskedMoneyToCents(amount);
    if (name.trim().length < 1) return setError('Dê um nome ao custo. Ex.: "Adobe".');
    if (!categoryId) return setError('Escolha uma categoria.');
    if (amountCents == null) return setError('Informe um valor válido, maior que zero.');
    if (!frequency) return setError('Escolha a frequência.');
    if (!paidBy) return setError('Escolha quem paga.');
    if (endsOn && nextCharge && endsOn < nextCharge) {
      return setError('A data final vem antes do início da cobrança. Ajuste o período.');
    }
    setSaving(true);
    try {
      const empresaPaga = paidBy === EMPRESA_PAGOU;
      const payload = {
        name: name.trim(),
        category: category || 'other',
        categoryId: categoryId || null,
        amountCents,
        frequency,
        paidByMemberId: empresaPaga ? members[0]!.id : paidBy,
        paidByCompany: empresaPaga,
        splitMode,
        nextChargeOn: nextCharge || null,
        endsOn: endsOn || null,
        note: note.trim() || null,
      };
      if (isEditing) await recurringApi.update(company.id, cost!.id, payload);
      else await recurringApi.create(company.id, payload);
      setSavedCents(amountCents);
      onSaved();
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setSaving(false);
    }
  }

  /* ── estado de sucesso ── */
  if (savedCents != null) {
    return (
      <div className="mw">
        <div className="rc-success">
          <span className="rc-success__icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <h3 className="rc-success__title">
            {isEditing
              ? 'Custo recorrente atualizado'
              : frequency === 'once'
                ? 'Pagamento único registrado'
                : 'Custo recorrente cadastrado'}
          </h3>
          <p className="rc-success__msg">
            {isEditing
              ? 'As alterações foram salvas. O custo mensal e as próximas cobranças já refletem os novos valores.'
              : frequency === 'once'
                ? 'Ficou salvo no histórico, sem afetar o custo mensal estimado.'
                : 'O custo mensal foi atualizado. Na data da cobrança, o Plim gera a conta a pagar já dividida entre os sócios.'}
          </p>
        </div>
        <div className="mw-actions">
          <Button block onClick={onClose}>
            Ver dashboard
          </Button>
          {!isEditing && (
            <Button variant="secondary" onClick={reset}>
              Adicionar outro
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <form className="mw" onSubmit={handleSubmit} noValidate>
      {/* O cabeçalho do modal já explica o que é um custo recorrente: repetir
          aqui só empurrava o formulário para fora da tela. */}
      {error && <div className="form-error">{error}</div>}
      <div className="mw-form">
        {/* 1. o que é */}
        <Input
          label="Nome do custo"
          placeholder="Ex.: Adobe, Google Workspace, contador, hospedagem…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <div className="rc-grid">
          <Select
            label="Categoria"
            value={categoryId}
            onChange={setCategoryId}
            placeholder={categories.length ? 'Selecione' : 'Carregando…'}
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
          />
          <MoneyField value={amount} onChange={setAmount} />
        </div>

        {/* 2. quando se repete: frequência e as duas datas moram juntas, porque
            respondem à mesma pergunta. Antes a frequência ficava colada em
            "quem paga", que é assunto de dinheiro, não de calendário. */}
        <section className="rc-sec">
          <h4 className="rc-sec__lab">Quando se repete</h4>
          <div className="rc-grid rc-grid--3">
            <Select
              label="Frequência"
              value={frequency}
              onChange={(v) => setFrequency(v as RecurringFrequency)}
              options={recurringFrequencyCatalog.map((f) => ({ value: f.id, label: f.label }))}
            />
            <div className="field">
              <label className="field__label">
                {frequency === 'once' ? 'Data do pagamento' : 'A partir de'}
              </label>
              <DateField
                value={nextCharge}
                onChange={setNextCharge}
                clearable={frequency === 'once'}
                compact
                placeholder={frequency === 'once' ? 'Sem data definida' : 'Escolha a data'}
              />
            </div>
            {frequency !== 'once' && (
              <div className="field">
                <label className="field__label">Até quando</label>
                <DateField
                  value={endsOn}
                  onChange={setEndsOn}
                  min={nextCharge || undefined}
                  clearable
                  compact
                  placeholder="Sem fim"
                />
              </div>
            )}
          </div>
        </section>

        {/* 3. quem paga e como se divide: uma pergunta só, dois campos. */}
        <section className="rc-sec">
          <h4 className="rc-sec__lab">Quem paga</h4>
          <div className="rc-grid">
            <Select
              label="Sai de onde"
              value={paidBy}
              onChange={setPaidBy}
              options={[
                {
                  value: EMPRESA_PAGOU,
                  label: 'A empresa (caixa)',
                  hint: 'sai do caixa: ninguém fica devendo',
                },
                ...members.map((m) => ({ value: m.id, label: m.fullName })),
              ]}
            />
            {members.length > 1 && frequency !== 'once' && (
              <Select
                label="Como dividir"
                value={splitMode}
                onChange={(v) => setSplitMode(v as RecurringSplitMode)}
                options={[
                  { value: 'equity', label: 'Pela participação' },
                  { value: 'equal', label: 'Partes iguais' },
                ]}
              />
            )}
          </div>
          {paidBy === EMPRESA_PAGOU && frequency !== 'once' && (
            <p className="mw-hint" style={{ margin: 0 }}>
              A conta sai do caixa da empresa. A cobrança gerada mostra a parte de cada sócio só como
              referência de custo, sem gerar dívida entre vocês.
            </p>
          )}
        </section>

        <div className="field">
          <label className="field__label">Observação (opcional)</label>
          <textarea
            className="field__input rc-textarea"
            placeholder="Ex.: plano mensal da Adobe usado para criação de artes."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            rows={2}
          />
        </div>
      </div>
      {frequency === 'once' ? (
        <p className="mw-hint">
          Pagamento único: fica registrado no histórico, mas <strong>não entra no custo mensal</strong> da
          empresa (não se repete).
        </p>
      ) : (
        frequency &&
        frequency !== 'monthly' &&
        maskedMoneyToCents(amount) != null && (
          <p className="mw-hint">
            Na estimativa mensal, esse custo entra como{' '}
            {formatMoney(monthlyPreview(maskedMoneyToCents(amount)!, frequency))}/mês.
          </p>
        )
      )}
      <div className="mw-actions">
        <Button type="submit" block disabled={saving}>
          {saving
            ? 'Salvando…'
            : isEditing
              ? 'Salvar alterações'
              : frequency === 'once'
                ? 'Salvar pagamento único'
                : 'Salvar custo recorrente'}
        </Button>
      </div>
    </form>
  );
}

/** Prévia do equivalente mensal (mesma regra do backend — só exibição). */
function monthlyPreview(amountCents: number, frequency: RecurringFrequency): number {
  switch (frequency) {
    case 'annual':
      return Math.round(amountCents / 12);
    case 'weekly':
      return Math.round((amountCents * 52) / 12);
    case 'quarterly':
      return Math.round(amountCents / 3);
    case 'once':
      return 0;
    default:
      return amountCents;
  }
}
