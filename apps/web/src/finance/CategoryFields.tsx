import { useState, type KeyboardEvent } from 'react';
import type { Category } from '@plim/shared';
import { Select } from '../components/ui/Select';
import './categoryFields.css';

/**
 * Seletor de categoria com criação inline. Usa o select nativo (busca por
 * digitação embutida, acessível e bom no mobile) + um "+ Criar categoria" que
 * abre um campo de nome e cor, salva e já seleciona.
 */
export function CategoriaSelect({
  categories,
  value,
  onChange,
  onCreate,
  movementType,
  label = 'Categoria',
}: {
  categories: Category[];
  value: string | null;
  onChange: (categoryId: string | null) => void;
  /** Cria a categoria no backend e devolve a criada (já selecionada). */
  onCreate: (name: string, color: string) => Promise<Category | null>;
  /** Filtra por tipo de movimentação; 'ambos' sempre aparece. */
  movementType: 'despesa' | 'receita';
  label?: string;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#5b6cff');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const visible = categories.filter(
    (c) =>
      !c.archived &&
      (c.type === 'ambos' || c.type === movementType || c.id === value),
  );

  async function submitNew() {
    const trimmed = name.trim();
    if (trimmed.length < 1) return setError('Dê um nome à categoria.');
    setBusy(true);
    setError('');
    try {
      const created = await onCreate(trimmed, color);
      if (created) {
        onChange(created.id);
        setCreating(false);
        setName('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu para criar a categoria.');
    } finally {
      setBusy(false);
    }
  }

  if (creating) {
    return (
      <div className="catf">
        <label className="field__label">Nova categoria</label>
        <div className="catf-new">
          <input
            type="color"
            className="catf-color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            aria-label="Cor da categoria"
          />
          <input
            className="field__input"
            placeholder="Ex.: Adobe, AWS, Contador"
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
        </div>
        {error && <span className="field__error">{error}</span>}
        <div className="catf-new__actions">
          <button type="button" className="catf-link" onClick={() => setCreating(false)} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="catf-btn" onClick={() => void submitNew()} disabled={busy}>
            {busy ? 'Criando…' : 'Criar e usar'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="catf">
      <Select
        label={label}
        value={value ?? ''}
        onChange={(v) => onChange(v || null)}
        placeholder="Sem categoria"
        options={visible.map((c) => ({
          value: c.id,
          label: (
            <>
              {c.name}
              {c.archived ? ' (arquivada)' : ''}
            </>
          ),
        }))}
      />
      <button type="button" className="catf-link catf-link--add" onClick={() => setCreating(true)}>
        + Criar categoria
      </button>
    </div>
  );
}

/** Campo de tags livres (chips). Enter ou vírgula adiciona; backspace remove. */
export function TagsInput({
  value,
  onChange,
  label = 'Tags (opcional)',
  placeholder = 'Ex.: Adobe, AWS',
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  label?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');

  function add(raw: string) {
    const tag = raw.trim().replace(/,+$/, '').trim();
    if (!tag) return;
    if (value.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    if (value.length >= 10) return;
    onChange([...value, tag]);
    setDraft('');
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="field catf-tags">
      <label className="field__label">{label}</label>
      <div className="catf-tags__box">
        {value.map((tag) => (
          <span className="catf-chip" key={tag}>
            {tag}
            <button
              type="button"
              className="catf-chip__x"
              aria-label={`Remover ${tag}`}
              onClick={() => onChange(value.filter((t) => t !== tag))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="catf-tags__input"
          value={draft}
          placeholder={value.length === 0 ? placeholder : ''}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => add(draft)}
        />
      </div>
    </div>
  );
}
