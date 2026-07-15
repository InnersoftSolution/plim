import { useCallback, useEffect, useState } from 'react';
import { contactTypeCatalog, type Contact, type ContactType } from '@plim/shared';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useActiveCompany } from '../company/ActiveCompanyContext';
import { messageForError } from '../company/companyApi';
import { contactApi } from '../finance/contactApi';
import './dashboard.css';
import './categorias.css'; // reusa o visual de lista/linha da gestão de categorias
import '../finance/wizard.css'; // .rc-grid / .fin-split

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; contacts: Contact[] };

const typeLabel = (t: ContactType) =>
  contactTypeCatalog.find((c) => c.id === t)?.label ?? t;

/** Gestão de contatos (fornecedores/clientes): criar, editar dados, arquivar. */
export function ContatosPage() {
  const { company } = useActiveCompany();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<ContactType>('empresa');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const contacts = await contactApi.list(company.id);
      setState({ status: 'ready', contacts });
    } catch (err) {
      setState({ status: 'error', message: messageForError(err) });
    }
  }, [company.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createContact() {
    const name = newName.trim();
    if (name.length < 1) return setError('Dê um nome ao contato.');
    setBusy(true);
    setError('');
    try {
      await contactApi.create(company.id, { name, type: newType });
      setNewName('');
      await load();
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setBusy(false);
    }
  }

  async function patchContact(id: string, patch: Parameters<typeof contactApi.update>[2]) {
    try {
      await contactApi.update(company.id, id, patch);
      await load();
    } catch (err) {
      setError(messageForError(err));
    }
  }

  async function removeContact(id: string) {
    try {
      await contactApi.remove(company.id, id);
      await load();
    } catch (err) {
      setError(messageForError(err));
    }
  }

  if (state.status === 'loading') return <p className="dash-muted">carregando contatos…</p>;
  if (state.status === 'error') return <p className="dash-muted">{state.message}</p>;

  const active = state.contacts.filter((c) => !c.archived);
  const archived = state.contacts.filter((c) => c.archived);

  return (
    <div className="dash">
      <div>
        <h1 className="dash-page__title">Contatos</h1>
        <p className="dash-page__subtitle">
          Fornecedores e clientes das movimentações: para quem a empresa paga e de quem recebe.
          Contato arquivado some do cadastro de novas movimentações, mas continua no histórico.
        </p>
      </div>

      {error && <div className="form-error">{error}</div>}

      {/* criar novo */}
      <section className="dash-panel">
        <div className="dash-panel__head">
          <h2>Novo contato</h2>
        </div>
        <div className="fin-split" style={{ maxWidth: 320, marginBottom: 10 }}>
          {contactTypeCatalog.map((t) => (
            <button
              key={t.id}
              type="button"
              className={'fin-split__opt' + (newType === t.id ? ' fin-split__opt--active' : '')}
              onClick={() => setNewType(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="cat-new">
          <div className="cat-new__input">
            <Input
              label=""
              placeholder={newType === 'empresa' ? 'Ex.: Elephant Cowork, Adobe' : 'Ex.: João Contador'}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <Button onClick={() => void createContact()} disabled={busy}>
            {busy ? 'Criando…' : 'Criar'}
          </Button>
        </div>
      </section>

      {/* ativos */}
      <section className="dash-panel">
        <div className="dash-panel__head">
          <h2>Ativos ({active.length})</h2>
        </div>
        {active.length === 0 ? (
          <p className="dash-panel__hint">
            Nenhum contato ainda. Crie acima, ou direto no cadastro de uma movimentação.
          </p>
        ) : (
          <ul className="cat-list">
            {active.map((c) => (
              <ContactRow
                key={c.id}
                contact={c}
                onSave={(patch) => patchContact(c.id, patch)}
                onArchive={() => patchContact(c.id, { archived: true })}
                onUnarchive={() => patchContact(c.id, { archived: false })}
                onDelete={() => removeContact(c.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* arquivados */}
      {archived.length > 0 && (
        <section className="dash-panel">
          <div className="dash-panel__head">
            <h2>Arquivados ({archived.length})</h2>
          </div>
          <p className="dash-panel__hint">
            Não aparecem no cadastro de novas movimentações. Reative quando quiser voltar a usar.
          </p>
          <ul className="cat-list">
            {archived.map((c) => (
              <ContactRow
                key={c.id}
                contact={c}
                onSave={(patch) => patchContact(c.id, patch)}
                onArchive={() => patchContact(c.id, { archived: true })}
                onUnarchive={() => patchContact(c.id, { archived: false })}
                onDelete={() => removeContact(c.id)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ContactRow({
  contact,
  onSave,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  contact: Contact;
  onSave: (patch: {
    name?: string;
    type?: ContactType;
    document?: string | null;
    email?: string | null;
    phone?: string | null;
  }) => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [name, setName] = useState(contact.name);
  const [type, setType] = useState<ContactType>(contact.type);
  const [document, setDocument] = useState(contact.document ?? '');
  const [email, setEmail] = useState(contact.email ?? '');
  const [phone, setPhone] = useState(contact.phone ?? '');

  function save() {
    if (name.trim().length < 1) return;
    onSave({
      name: name.trim(),
      type,
      document: document.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
    });
    setEditing(false);
  }

  const meta = [typeLabel(contact.type), contact.document, contact.email, contact.phone]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className={'cat-row cat-row--contact' + (contact.archived ? ' cat-row--archived' : '')}>
      {editing ? (
        <div className="contact-edit">
          <div className="fin-split" style={{ maxWidth: 320 }}>
            {contactTypeCatalog.map((t) => (
              <button
                key={t.id}
                type="button"
                className={'fin-split__opt' + (type === t.id ? ' fin-split__opt--active' : '')}
                onClick={() => setType(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="rc-grid">
            <Input
              label={type === 'empresa' ? 'CNPJ (opcional)' : 'CPF (opcional)'}
              value={document}
              onChange={(e) => setDocument(e.target.value)}
            />
            <Input
              label="Telefone (opcional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <Input
            label="E-mail (opcional)"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="cat-row__actions" style={{ marginTop: 4 }}>
            <button type="button" className="cat-link" onClick={() => setEditing(false)}>
              Cancelar
            </button>
            <Button onClick={save}>Salvar</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="contact-info">
            <button type="button" className="cat-row__name" onClick={() => setEditing(true)}>
              {contact.name}
            </button>
            <span className="contact-meta">{meta}</span>
          </div>
          <div className="cat-row__actions">
            {confirmDel ? (
              <>
                <span className="cat-row__confirm">Excluir?</span>
                <button type="button" className="cat-link cat-link--danger" onClick={onDelete}>
                  Sim
                </button>
                <button type="button" className="cat-link" onClick={() => setConfirmDel(false)}>
                  Não
                </button>
              </>
            ) : (
              <>
                <button type="button" className="cat-link" onClick={() => setEditing(true)}>
                  Editar
                </button>
                {contact.archived ? (
                  <button type="button" className="cat-link" onClick={onUnarchive}>
                    Reativar
                  </button>
                ) : (
                  <button type="button" className="cat-link" onClick={onArchive}>
                    Arquivar
                  </button>
                )}
                <button
                  type="button"
                  className="cat-link cat-link--danger"
                  onClick={() => setConfirmDel(true)}
                >
                  Excluir
                </button>
              </>
            )}
          </div>
        </>
      )}
    </li>
  );
}
