import { useCallback, useEffect, useState } from 'react';
import type { Category } from '@plim/shared';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useActiveCompany } from '../company/ActiveCompanyContext';
import { messageForError } from '../company/companyApi';
import { categoryApi } from '../finance/categoryApi';
import './dashboard.css';
import './categorias.css';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; categories: Category[] };

/** Gestão de categorias da empresa: criar, renomear, mudar cor, arquivar, excluir. */
export function CategoriasPage() {
  const { company } = useActiveCompany();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#5b6cff');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const categories = await categoryApi.list(company.id);
      setState({ status: 'ready', categories });
    } catch (err) {
      setState({ status: 'error', message: messageForError(err) });
    }
  }, [company.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createCategory() {
    const name = newName.trim();
    if (name.length < 1) return setError('Dê um nome à categoria.');
    setBusy(true);
    setError('');
    try {
      await categoryApi.create(company.id, { name, color: newColor });
      setNewName('');
      await load();
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setBusy(false);
    }
  }

  async function patchCategory(id: string, patch: Parameters<typeof categoryApi.update>[2]) {
    try {
      await categoryApi.update(company.id, id, patch);
      await load();
    } catch (err) {
      setError(messageForError(err));
    }
  }

  async function removeCategory(id: string) {
    try {
      await categoryApi.remove(company.id, id);
      await load();
    } catch (err) {
      setError(messageForError(err));
    }
  }

  if (state.status === 'loading') return <p className="dash-muted">carregando categorias…</p>;
  if (state.status === 'error') return <p className="dash-muted">{state.message}</p>;

  const active = state.categories.filter((c) => !c.archived);
  const archived = state.categories.filter((c) => c.archived);

  return (
    <div className="dash">
      <div>
        <h1 className="dash-page__title">Categorias</h1>
        <p className="dash-page__subtitle">
          Organize onde o dinheiro é gasto. Categoria arquivada some do cadastro de novas
          movimentações, mas continua nos relatórios do histórico.
        </p>
      </div>

      {error && <div className="form-error">{error}</div>}

      {/* criar nova */}
      <section className="dash-panel">
        <div className="dash-panel__head">
          <h2>Nova categoria</h2>
        </div>
        <div className="cat-new">
          <input
            type="color"
            className="cat-color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            aria-label="Cor da categoria"
          />
          <div className="cat-new__input">
            <Input
              label=""
              placeholder="Ex.: Tecnologia, Marketing, Contador"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <Button onClick={() => void createCategory()} disabled={busy}>
            {busy ? 'Criando…' : 'Criar'}
          </Button>
        </div>
      </section>

      {/* ativas */}
      <section className="dash-panel">
        <div className="dash-panel__head">
          <h2>Ativas ({active.length})</h2>
        </div>
        {active.length === 0 ? (
          <p className="dash-panel__hint">Nenhuma categoria ativa. Crie a primeira acima.</p>
        ) : (
          <ul className="cat-list">
            {active.map((c) => (
              <CategoryRow
                key={c.id}
                category={c}
                onRename={(name) => patchCategory(c.id, { name })}
                onColor={(color) => patchCategory(c.id, { color })}
                onArchive={() => patchCategory(c.id, { archived: true })}
                onUnarchive={() => patchCategory(c.id, { archived: false })}
                onDelete={() => removeCategory(c.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* arquivadas */}
      {archived.length > 0 && (
        <section className="dash-panel">
          <div className="dash-panel__head">
            <h2>Arquivadas ({archived.length})</h2>
          </div>
          <p className="dash-panel__hint">
            Não aparecem no cadastro de novas movimentações. Reative quando quiser voltar a usar.
          </p>
          <ul className="cat-list">
            {archived.map((c) => (
              <CategoryRow
                key={c.id}
                category={c}
                onRename={(name) => patchCategory(c.id, { name })}
                onColor={(color) => patchCategory(c.id, { color })}
                onArchive={() => patchCategory(c.id, { archived: true })}
                onUnarchive={() => patchCategory(c.id, { archived: false })}
                onDelete={() => removeCategory(c.id)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function CategoryRow({
  category,
  onRename,
  onColor,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  category: Category;
  onRename: (name: string) => void;
  onColor: (color: string) => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [confirmDel, setConfirmDel] = useState(false);

  return (
    <li className={'cat-row' + (category.archived ? ' cat-row--archived' : '')}>
      <input
        type="color"
        className="cat-color cat-color--sm"
        value={category.color ?? '#94a3b8'}
        onChange={(e) => onColor(e.target.value)}
        aria-label={`Cor de ${category.name}`}
      />
      {editing ? (
        <input
          className="cat-row__edit"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              onRename(name.trim());
              setEditing(false);
            } else if (e.key === 'Escape') {
              setName(category.name);
              setEditing(false);
            }
          }}
          onBlur={() => {
            if (name.trim() && name.trim() !== category.name) onRename(name.trim());
            setEditing(false);
          }}
        />
      ) : (
        <button type="button" className="cat-row__name" onClick={() => setEditing(true)}>
          {category.name}
        </button>
      )}
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
            {!editing && (
              <button type="button" className="cat-link" onClick={() => setEditing(true)}>
                Renomear
              </button>
            )}
            {category.archived ? (
              <button type="button" className="cat-link" onClick={onUnarchive}>
                Reativar
              </button>
            ) : (
              <button type="button" className="cat-link" onClick={onArchive}>
                Arquivar
              </button>
            )}
            <button type="button" className="cat-link cat-link--danger" onClick={() => setConfirmDel(true)}>
              Excluir
            </button>
          </>
        )}
      </div>
    </li>
  );
}
