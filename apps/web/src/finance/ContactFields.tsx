import { useState } from 'react';
import type { Contact, ContactType } from '@plim/shared';
import { Select } from '../components/ui/Select';
import './categoryFields.css'; // reusa o visual do seletor de categoria

/**
 * Seletor de contato (fornecedor/cliente) com criação inline: escolhe um
 * contato existente ou cria na hora com nome + tipo (empresa/pessoa física).
 * Os demais dados (CNPJ/CPF, e-mail...) se completam na gestão de contatos.
 */
export function ContatoSelect({
  contacts,
  value,
  onChange,
  onCreate,
  label,
}: {
  contacts: Contact[];
  value: string | null;
  onChange: (contactId: string | null) => void;
  /** Cria o contato no backend e devolve o criado (já selecionado). */
  onCreate: (name: string, type: ContactType) => Promise<Contact | null>;
  /** "Pago para quem (opcional)" na despesa; "Recebido de quem (opcional)" na entrada. */
  label: string;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<ContactType>('empresa');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const visible = contacts.filter((c) => !c.archived || c.id === value);
  const typeLabel = (t: ContactType) => (t === 'empresa' ? 'empresa' : 'pessoa física');

  async function submitNew() {
    const trimmed = name.trim();
    if (trimmed.length < 1) return setError('Dê um nome ao contato.');
    setBusy(true);
    setError('');
    try {
      const created = await onCreate(trimmed, type);
      if (created) {
        onChange(created.id);
        setCreating(false);
        setName('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu para criar o contato.');
    } finally {
      setBusy(false);
    }
  }

  if (creating) {
    return (
      <div className="catf">
        <label className="field__label">Novo contato</label>
        <div className="fin-split" style={{ marginBottom: 8 }}>
          <button
            type="button"
            className={'fin-split__opt' + (type === 'empresa' ? ' fin-split__opt--active' : '')}
            onClick={() => setType('empresa')}
          >
            Empresa
          </button>
          <button
            type="button"
            className={'fin-split__opt' + (type === 'pessoa' ? ' fin-split__opt--active' : '')}
            onClick={() => setType('pessoa')}
          >
            Pessoa física
          </button>
        </div>
        <input
          className="field__input"
          placeholder={type === 'empresa' ? 'Ex.: Elephant Cowork, Adobe' : 'Ex.: João Contador'}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void submitNew();
            }
          }}
          autoFocus
        />
        {error && <span className="field__error">{error}</span>}
        <div className="catf-new__actions">
          <button type="button" className="catf-link" onClick={() => setCreating(false)} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="catf-btn" onClick={() => void submitNew()} disabled={busy}>
            {busy ? 'Criando…' : 'Criar e usar'}
          </button>
        </div>
        <p className="mw-hint" style={{ marginTop: 6 }}>
          CNPJ/CPF, e-mail e telefone você completa depois, na gestão de contatos.
        </p>
      </div>
    );
  }

  return (
    <div className="catf">
      <Select
        label={label}
        value={value ?? ''}
        onChange={(v) => onChange(v || null)}
        placeholder="Não informar"
        options={visible.map((c) => ({
          value: c.id,
          label: (
            <>
              {c.name} · {typeLabel(c.type)}
              {c.archived ? ' (arquivado)' : ''}
            </>
          ),
        }))}
      />
      <button type="button" className="catf-link catf-link--add" onClick={() => setCreating(true)}>
        + Criar contato
      </button>
    </div>
  );
}
