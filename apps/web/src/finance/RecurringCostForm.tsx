import { useState, type FormEvent } from 'react';
import {
  recurringCategoryCatalog,
  recurringFrequencyCatalog,
  type Company,
  type CompanyMember,
  type RecurringCategory,
  type RecurringFrequency,
} from '@plim/shared';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { messageForError } from '../company/companyApi';
import { parseMoneyToCents, formatMoney } from './financeApi';
import { recurringApi } from './recurringApi';
import './wizard.css';

/**
 * Jornada "Custo recorrente" — orientação, não formulário frio.
 * Após salvar, mostra o estado de sucesso com "Ver dashboard" / "Adicionar outro".
 */
export function RecurringCostForm({
  company,
  members,
  onSaved,
  onClose,
}: {
  company: Company;
  members: CompanyMember[];
  /** Chamado após cada salvamento (pra Home recarregar os números). */
  onSaved: () => void;
  /** Fecha o modal ("Ver dashboard"). */
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<RecurringCategory | ''>('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<RecurringFrequency | ''>('monthly');
  const [paidBy, setPaidBy] = useState(members[0]?.id ?? '');
  const [nextCharge, setNextCharge] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedCents, setSavedCents] = useState<number | null>(null);

  function reset() {
    setName('');
    setCategory('');
    setAmount('');
    setFrequency('monthly');
    setNextCharge('');
    setNote('');
    setError('');
    setSavedCents(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const amountCents = parseMoneyToCents(amount);
    if (name.trim().length < 1) return setError('Dê um nome ao custo — ex.: "Adobe".');
    if (!category) return setError('Escolha uma categoria.');
    if (amountCents == null) return setError('Informe um valor válido, maior que zero.');
    if (!frequency) return setError('Escolha a frequência.');
    if (!paidBy) return setError('Escolha quem paga.');
    setSaving(true);
    try {
      await recurringApi.create(company.id, {
        name: name.trim(),
        category,
        amountCents,
        frequency,
        paidByMemberId: paidBy,
        nextChargeOn: nextCharge || null,
        note: note.trim() || null,
      });
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
            {frequency === 'once' ? 'Pagamento único registrado' : 'Custo recorrente cadastrado'}
          </h3>
          <p className="rc-success__msg">
            {frequency === 'once'
              ? 'Ficou salvo no histórico — sem afetar o custo mensal estimado.'
              : 'O Plim atualizou o custo mensal estimado da sua empresa.'}
          </p>
        </div>
        <div className="mw-actions">
          <Button block onClick={onClose}>
            Ver dashboard
          </Button>
          <button type="button" className="mw-back rc-again" onClick={reset}>
            Adicionar outro custo
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="mw" onSubmit={handleSubmit} noValidate>
      <p className="mw-hint" style={{ marginTop: 0 }}>
        Cadastre assinaturas, ferramentas e serviços que se repetem para entender quanto custa manter
        sua empresa funcionando. Só custos ativos entram na estimativa mensal.
      </p>
      {error && <div className="form-error">{error}</div>}
      <div className="mw-form">
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
            value={category}
            onChange={(v) => setCategory(v as RecurringCategory)}
            placeholder="Selecione"
            options={recurringCategoryCatalog.map((c) => ({ value: c.id, label: c.label }))}
          />
          <Input
            label={`Valor (${company.currencyCode ?? 'BRL'})`}
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="rc-grid">
          <Select
            label="Frequência"
            value={frequency}
            onChange={(v) => setFrequency(v as RecurringFrequency)}
            options={recurringFrequencyCatalog.map((f) => ({ value: f.id, label: f.label }))}
          />
          <Select
            label="Quem paga"
            value={paidBy}
            onChange={setPaidBy}
            options={members.map((m) => ({ value: m.id, label: m.fullName }))}
          />
        </div>
        <div className="field">
          <label className="field__label">
            {frequency === 'once' ? 'Data do pagamento (opcional)' : 'Próxima cobrança (opcional, mas recomendada)'}
          </label>
          <input
            type="date"
            className="field__input"
            value={nextCharge}
            onChange={(e) => setNextCharge(e.target.value)}
          />
        </div>
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
        parseMoneyToCents(amount) != null && (
          <p className="mw-hint">
            Na estimativa mensal, esse custo entra como{' '}
            {formatMoney(monthlyPreview(parseMoneyToCents(amount)!, frequency), company.currencyCode)}/mês.
          </p>
        )
      )}
      <div className="mw-actions">
        <Button type="submit" block disabled={saving}>
          {saving ? 'Salvando…' : frequency === 'once' ? 'Salvar pagamento único' : 'Salvar custo recorrente'}
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
