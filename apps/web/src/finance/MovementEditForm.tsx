import { useEffect, useState, type FormEvent } from 'react';
import type { Category, Company, CompanyMember, Contact, ContactType, Expense, ExpenseSplitMode, UpdateMovementInput } from '@plim/shared';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { DateField } from '../components/ui/DateField';
import { messageForError } from '../company/companyApi';
import { financeApi, maskMoneyBRL, maskedMoneyToCents } from './financeApi';
import { categoryApi } from './categoryApi';
import { contactApi } from './contactApi';
import { CategoriaSelect, TagsInput } from './CategoryFields';
import { ContatoSelect } from './ContactFields';
import './wizard.css';

/**
 * Edição de uma movimentação já registrada (despesa, aporte ou entrada).
 * Manda ao backend só os campos que mudaram; o back recalcula o rateio quando
 * valor/divisão/pagador mudam e barra a edição estrutural se já houver acertos.
 */
export function MovementEditForm({
  company,
  members,
  expense,
  onSaved,
  onClose,
}: {
  company: Company;
  members: CompanyMember[];
  expense: Expense;
  /** Chamado após salvar (recarrega os números). */
  onSaved: () => void;
  /** Fecha o modal. */
  onClose: () => void;
}) {
  const isRevenue = expense.kind === 'revenue';
  const isAporte = expense.kind === 'contribution';
  const hasShares = expense.shares.length > 0; // aporte reembolsável ou despesa dividida
  const label = isRevenue ? 'entrada' : isAporte ? 'aporte' : 'despesa';

  const [description, setDescription] = useState(expense.description);
  const [amount, setAmount] = useState(
    maskMoneyBRL((expense.amountCents / 100).toFixed(2).replace('.', ',')),
  );
  const [date, setDate] = useState(expense.spentOn);
  const [paidBy, setPaidBy] = useState(expense.paidByMemberId);
  const [splitMode, setSplitMode] = useState<ExpenseSplitMode>(
    expense.splitMode === 'custom' ? 'equity' : expense.splitMode,
  );
  const [source, setSource] = useState(expense.source ?? '');
  const [account, setAccount] = useState(expense.account ?? '');
  const [note, setNote] = useState(expense.note ?? '');
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(expense.categoryId ?? null);
  const [tags, setTags] = useState<string[]>(expense.tags ?? []);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactId, setContactId] = useState<string | null>(expense.contactId ?? null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isAporte) return; // aporte não usa categoria nem contato
    categoryApi.list(company.id).then(setCategories).catch(() => setCategories([]));
    contactApi.list(company.id).then(setContacts).catch(() => setContacts([]));
  }, [company.id, isAporte]);

  async function createCategoryInline(name: string, color: string): Promise<Category | null> {
    const created = await categoryApi.create(company.id, { name, color });
    setCategories((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created;
  }

  async function createContactInline(name: string, type: ContactType): Promise<Contact | null> {
    const created = await contactApi.create(company.id, { name, type });
    setContacts((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created;
  }

  // Custom split não é editável por aqui (a UI só oferece proporcional/igual).
  const customBlocked = expense.splitMode === 'custom';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    const amountCents = maskedMoneyToCents(amount);
    if (description.trim().length < 1) return setError(`Descreva a ${label}.`);
    if (amountCents == null) return setError('Informe um valor válido, maior que zero.');
    if (!paidBy && !isRevenue) return setError('Escolha quem pagou.');

    // Só envia o que mudou (o backend aceita patch parcial).
    const patch: UpdateMovementInput = {};
    if (description.trim() !== expense.description) patch.description = description.trim();
    if (amountCents !== expense.amountCents) patch.amountCents = amountCents;
    if (date !== expense.spentOn) patch.spentOn = date;
    const noteVal = note.trim() || null;
    if (noteVal !== (expense.note ?? null)) patch.note = noteVal;
    if (isRevenue) {
      const srcVal = source.trim() || null;
      const accVal = account.trim() || null;
      if (srcVal !== (expense.source ?? null)) patch.source = srcVal;
      if (accVal !== (expense.account ?? null)) patch.account = accVal;
    } else {
      if (paidBy !== expense.paidByMemberId) patch.paidByMemberId = paidBy;
      if (!customBlocked && splitMode !== expense.splitMode) patch.splitMode = splitMode;
    }
    if (!isAporte) {
      if (categoryId !== (expense.categoryId ?? null)) patch.categoryId = categoryId;
      if (contactId !== (expense.contactId ?? null)) patch.contactId = contactId;
      const tagsChanged =
        tags.length !== (expense.tags ?? []).length ||
        tags.some((t, i) => t !== (expense.tags ?? [])[i]);
      if (tagsChanged) patch.tags = tags;
    }

    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      await financeApi.updateMovement(company.id, expense.id, patch);
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <div className="mw">
        <div className="rc-success">
          <span className="rc-success__icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <h3 className="rc-success__title">Movimentação atualizada</h3>
          <p className="rc-success__msg">As alterações foram salvas e os números já refletem os novos valores.</p>
        </div>
        <div className="mw-actions">
          <Button block onClick={onClose}>
            Voltar ao financeiro
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form className="mw" onSubmit={handleSubmit} noValidate>
      <p className="mw-hint" style={{ marginTop: 0 }}>
        Corrija os dados desta {label}. Ao mudar o valor ou a divisão, o Plim recalcula sozinho a parte
        de cada sócio.
      </p>
      {error && <div className="form-error">{error}</div>}
      <div className="mw-form">
        <Input
          label={isRevenue ? 'Descrição da entrada' : `Nome da ${label}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          autoFocus
        />
        {!isAporte && (
          <>
            <CategoriaSelect
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
              onCreate={createCategoryInline}
              movementType={isRevenue ? 'receita' : 'despesa'}
            />
            <ContatoSelect
              contacts={contacts}
              value={contactId}
              onChange={setContactId}
              onCreate={createContactInline}
              label={isRevenue ? 'Recebido de quem (opcional)' : 'Pago para quem (opcional)'}
            />
            <TagsInput value={tags} onChange={setTags} />
          </>
        )}
        <div className="rc-grid">
          <Input
            label={`Valor (${company.currencyCode ?? 'BRL'})`}
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(maskMoneyBRL(e.target.value))}
          />
          <div className="field">
            <label className="field__label">{isRevenue ? 'Data do recebimento' : 'Data'}</label>
            <DateField value={date} onChange={setDate} />
          </div>
        </div>

        {!isRevenue && (
          <div className="rc-grid">
            <Select
              label={isAporte ? 'Quem aportou' : 'Quem pagou'}
              value={paidBy}
              onChange={setPaidBy}
              options={members.map((m) => ({ value: m.id, label: m.fullName }))}
            />
            {hasShares && !customBlocked && (
              <Select
                label="Como dividir entre os sócios"
                value={splitMode}
                onChange={(v) => setSplitMode(v as ExpenseSplitMode)}
                options={[
                  { value: 'equity', label: 'Pela participação de cada sócio' },
                  { value: 'equal', label: 'Partes iguais' },
                ]}
              />
            )}
          </div>
        )}

        {isRevenue && (
          <div className="rc-grid">
            <Input
              label="Origem (opcional)"
              placeholder="Ex.: Asaas, cliente, Pix"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
            <Input
              label="Conta que recebeu (opcional)"
              placeholder="Ex.: conta da empresa"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            />
          </div>
        )}

        <div className="field">
          <label className="field__label">Observação (opcional)</label>
          <textarea
            className="field__input rc-textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            rows={2}
          />
        </div>
      </div>

      {customBlocked && (
        <p className="mw-hint">
          Esta {label} tem divisão personalizada. Aqui você edita os outros campos; para mudar as partes,
          exclua e cadastre de novo.
        </p>
      )}

      <div className="mw-actions">
        <Button type="submit" block disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar alterações'}
        </Button>
      </div>
    </form>
  );
}
