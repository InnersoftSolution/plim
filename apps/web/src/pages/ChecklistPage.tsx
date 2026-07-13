import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  checklistPhaseCatalog,
  type ChecklistPhase,
  type ChecklistStatus,
  type ChecklistView,
  type CompanyChecklistItem,
} from '@plim/shared';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { companyApi, messageForError } from '../company/companyApi';
import { checklistApi } from '../company/checklistApi';
import { formFor, hrefFor, type ChecklistForm } from '../company/checklistGuides';
import './dashboard.css';
import './checklist.css';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ready'; companyId: string; view: ChecklistView };

/**
 * Checklist da empresa. Orienta os próximos passos sem bloquear.
 * Lista agrupada no estilo do app Lembretes: círculo para concluir,
 * linha expande para detalhes e ações, e cada fase tem "+ Adicionar item".
 */
export function ChecklistPage() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [formPhase, setFormPhase] = useState<ChecklistPhase | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const companies = await companyApi.listMyCompanies();
      if (companies.length === 0) {
        setState({ status: 'empty' });
        return;
      }
      const companyId = companies[0]!.id;
      const view = await checklistApi.get(companyId);
      setState({ status: 'ready', companyId, view });
    } catch (err) {
      setState({ status: 'error', message: messageForError(err) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatus(itemId: string, status: ChecklistStatus) {
    if (state.status !== 'ready') return;
    await checklistApi.setStatus(state.companyId, itemId, status);
    await load();
  }

  async function saveEntry(
    item: CompanyChecklistItem,
    entry: { note: string | null; data: Record<string, string> | null },
  ) {
    if (state.status !== 'ready') return;
    const patch: { note: string | null; data: Record<string, string> | null; status?: ChecklistStatus } = {
      ...entry,
    };
    // Inteligencia deterministica: se a informacao existe, o item esta feito.
    // Campos estruturados preenchidos (ex: link do dominio) concluem sozinhos;
    // texto de reflexao marca "em andamento". Concluir na mao fica no circulo.
    if (item.status === 'not_started' || item.status === 'in_progress') {
      const hasData = !!entry.data && Object.values(entry.data).some((v) => v.trim().length > 0);
      if (hasData) patch.status = 'completed';
      else if (entry.note) patch.status = 'in_progress';
    }
    await checklistApi.update(state.companyId, item.id, patch);
    await load();
  }

  if (state.status === 'loading') return <div className="dash-muted">Carregando checklist...</div>;
  if (state.status === 'error')
    return (
      <div className="dash-error">
        <p className="dash-error__msg">{state.message}</p>
        <Button onClick={() => void load()}>Tentar de novo</Button>
      </div>
    );
  if (state.status === 'empty')
    return (
      <div className="dash-empty">
        <h2>Cadastre sua empresa</h2>
        <p>O checklist aparece assim que a empresa existir.</p>
        <Button onClick={() => navigate('/onboarding')}>Cadastrar empresa</Button>
      </div>
    );

  const { view, companyId } = state;

  return (
    <div className="chk">
      <header>
        <h1 className="dash-page__title">Checklist da empresa</h1>
        <p className="dash-page__subtitle">
          Organize os próximos passos no seu ritmo. O Plim sugere itens pelo estágio do negócio e
          conclui sozinho o que já estiver pronto.
        </p>
      </header>

      <ProgressBlock view={view} />

      {checklistPhaseCatalog.map((phase) => {
        const items = view.items.filter((i) => i.phase === phase.id);
        if (items.length === 0) return null;
        const done = items.filter((i) => i.status === 'completed').length;
        return (
          <section className="chk-phase" key={phase.id}>
            <div className="chk-phase__head">
              <div>
                <h2>{phase.label}</h2>
                <p>{phase.help}</p>
              </div>
              <span className="chk-phase__count">
                {done}/{items.length}
              </span>
            </div>
            <div className="chk-group">
              {items.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  expanded={expandedId === item.id}
                  onToggle={() => setExpandedId((cur) => (cur === item.id ? null : item.id))}
                  onChange={changeStatus}
                  onSave={saveEntry}
                  onGo={navigate}
                />
              ))}
              <button type="button" className="chk-add" onClick={() => setFormPhase(phase.id)}>
                <span className="chk-add__plus" aria-hidden="true">
                  +
                </span>
                Adicionar item
              </button>
            </div>
          </section>
        );
      })}

      {formPhase && (
        <CustomItemModal
          companyId={companyId}
          initialPhase={formPhase}
          onClose={() => setFormPhase(null)}
          onCreated={async () => {
            setFormPhase(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function ProgressBlock({ view }: { view: ChecklistView }) {
  const { completed, total, percent } = view.summary;
  return (
    <section className="chk-progress">
      <div className="chk-progress__ring" style={{ ['--pct' as string]: percent }}>
        <span>{percent}%</span>
      </div>
      <div className="chk-progress__body">
        <strong>Estruturação da empresa</strong>
        <span>
          {completed} de {total} itens concluídos
        </span>
        <p>Quanto mais itens você organiza, mais claro fica o caminho.</p>
      </div>
    </section>
  );
}

function ItemRow({
  item,
  expanded,
  onToggle,
  onChange,
  onSave,
  onGo,
}: {
  item: CompanyChecklistItem;
  expanded: boolean;
  onToggle: () => void;
  onChange: (itemId: string, status: ChecklistStatus) => void;
  onSave: (
    item: CompanyChecklistItem,
    entry: { note: string | null; data: Record<string, string> | null },
  ) => Promise<void>;
  onGo: (route: string) => void;
}) {
  const done = item.status === 'completed';
  const parked = item.status === 'skipped' || item.status === 'not_applicable';
  const form = formFor(item.templateKey);
  // Itens automáticos vivem dos dados reais; não têm anotação/guia manual.
  const canNote = !item.isAuto;
  // Prévia discreta na linha fechada: valores registrados ou anotação.
  const preview = item.data
    ? Object.values(item.data).filter(Boolean).join(' · ') || item.note
    : item.note;

  function handleCircle() {
    if (item.isAuto) return; // itens automáticos se resolvem sozinhos
    onChange(item.id, done ? 'not_started' : 'completed');
  }

  return (
    <div className={'chk-row' + (done ? ' is-done' : '') + (parked ? ' is-parked' : '')}>
      <div className="chk-row__main">
        <button
          type="button"
          className={'chk-circle' + (done ? ' is-checked' : '') + (item.isAuto ? ' is-auto' : '')}
          onClick={handleCircle}
          aria-label={done ? 'Reabrir item' : 'Marcar como feito'}
          title={item.isAuto ? 'Este item se conclui sozinho quando o dado existir' : undefined}
        >
          {done && <CheckIcon />}
        </button>
        <button type="button" className="chk-row__label" onClick={onToggle} aria-expanded={expanded}>
          <span className="chk-row__texts">
            <span className="chk-row__title">{item.title}</span>
            {!expanded && preview && <span className="chk-row__note">{preview}</span>}
          </span>
          {item.isAuto && !done && <span className="chk-tag chk-tag--auto">automático</span>}
          {item.status === 'in_progress' && <span className="chk-tag chk-tag--progress">em andamento</span>}
          {item.status === 'skipped' && <span className="chk-tag">fazer depois</span>}
          {item.status === 'not_applicable' && <span className="chk-tag">não se aplica</span>}
          <ChevronIcon className={'chk-row__chevron' + (expanded ? ' is-open' : '')} />
        </button>
      </div>
      {expanded && (
        <div className="chk-row__detail">
          {/* Contexto: só mostra a descrição do catálogo quando o guia não tem a sua própria. */}
          {item.description && !form?.intro && <p className="chk-row__lead">{item.description}</p>}

          {item.actionRoute && !done && (
            <div className="chk-row__go">
              <button type="button" className="chk-action" onClick={() => onGo(item.actionRoute!)}>
                {item.actionLabel ?? 'Abrir'}
              </button>
            </div>
          )}

          {canNote && <ItemPanel item={item} form={form} onSave={onSave} />}

          {/* Escape hatch discreto: claramente secundário. */}
          {!done && !parked && (
            <div className="chk-row__defer">
              <span className="chk-row__defer-lead">Não é para agora?</span>
              <button type="button" className="chk-link" onClick={() => onChange(item.id, 'skipped')}>
                Fazer depois
              </button>
              <span className="chk-row__defer-sep" aria-hidden="true">·</span>
              <button type="button" className="chk-link" onClick={() => onChange(item.id, 'not_applicable')}>
                Não se aplica
              </button>
            </div>
          )}
          {parked && (
            <div className="chk-row__defer">
              <button type="button" className="chk-link" onClick={() => onChange(item.id, 'not_started')}>
                Reabrir item
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Painel do item, ali mesmo na lista. Itens de registro (domínio, redes,
 * e-mail, conta...) mostram campos estruturados que guardam a informação
 * certa. Itens de pensamento mostram o roteiro (por que, perguntas, exemplo)
 * com campo de texto. Tudo salva sem trocar de página.
 */
function ItemPanel({
  item,
  form,
  onSave,
}: {
  item: CompanyChecklistItem;
  form: ChecklistForm | null;
  onSave: (
    item: CompanyChecklistItem,
    entry: { note: string | null; data: Record<string, string> | null },
  ) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>(item.data ?? {});
  const [text, setText] = useState(item.note ?? '');
  const [saving, setSaving] = useState(false);
  const fields = form?.fields;

  const savedData = item.data ?? {};
  const dirty = fields
    ? fields.some((f) => (values[f.key] ?? '').trim() !== (savedData[f.key] ?? ''))
    : text !== (item.note ?? '');
  const hasContent = fields ? Object.keys(savedData).length > 0 : !!item.note;
  const savedState = !dirty && hasContent;

  async function handleSave() {
    setSaving(true);
    try {
      if (fields) {
        const data: Record<string, string> = {};
        for (const f of fields) {
          const v = (values[f.key] ?? '').trim();
          if (v) data[f.key] = v;
        }
        await onSave(item, { note: item.note, data: Object.keys(data).length > 0 ? data : null });
      } else {
        const trimmed = text.trim();
        await onSave(item, { note: trimmed ? trimmed : null, data: null });
        setText(trimmed);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="chk-guide">
      {form?.intro && <p className="chk-guide__intro">{form.intro}</p>}
      {form?.questions && (
        <div className="chk-hints">
          <span className="chk-hints__lead">Para ajudar a pensar</span>
          <ul className="chk-hints__list">
            {form.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      {fields ? (
        <div className="chk-fields">
          {fields.map((f) => {
            const value = values[f.key] ?? '';
            return (
              <label className="chk-field" key={f.key}>
                <span className="chk-field__label">
                  {f.label}
                  {f.type === 'url' && value.trim() && (
                    <a href={hrefFor(value)} target="_blank" rel="noreferrer" className="chk-field__open">
                      abrir
                    </a>
                  )}
                </span>
                <input
                  className="chk-field__input"
                  type="text"
                  value={value}
                  placeholder={f.placeholder}
                  onChange={(e) => setValues((cur) => ({ ...cur, [f.key]: e.target.value }))}
                  inputMode={f.type === 'email' ? 'email' : f.type === 'url' ? 'url' : undefined}
                />
              </label>
            );
          })}
        </div>
      ) : (
        <textarea
          className="chk-note"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={form?.notePlaceholder ?? 'Anote aqui o que já foi feito ou combinado...'}
          rows={form?.questions ? 4 : 3}
        />
      )}

      <div className="chk-guide__foot">
        {form?.example && !fields && !text.trim() && (
          <button type="button" className="chk-link" onClick={() => setText(form.example!)}>
            Usar exemplo como base
          </button>
        )}
        <button
          type="button"
          className={'chk-action chk-action--save' + (savedState ? ' is-saved' : '')}
          onClick={handleSave}
          disabled={saving || !dirty}
        >
          {saving ? (
            'Salvando...'
          ) : savedState ? (
            <>
              <CheckIcon /> Salvo
            </>
          ) : (
            'Salvar'
          )}
        </button>
      </div>
    </div>
  );
}

function CustomItemModal({
  companyId,
  initialPhase,
  onClose,
  onCreated,
}: {
  companyId: string;
  initialPhase: ChecklistPhase;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [phase, setPhase] = useState<ChecklistPhase>(initialPhase);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const canSave = useMemo(() => title.trim().length >= 2, [title]);

  async function handleSave() {
    setError('');
    setSaving(true);
    try {
      await checklistApi.createCustom(companyId, {
        title: title.trim(),
        description: description.trim() || null,
        phase,
      });
      onCreated();
    } catch (err) {
      setError(messageForError(err));
      setSaving(false);
    }
  }

  return (
    <Modal open title="Adicionar item ao checklist" onClose={onClose}>
      {error && <div className="form-error">{error}</div>}
      <Input
        label="O que precisa ser organizado?"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Ex: Falar com fornecedor"
        autoFocus
      />
      <Input
        label="Detalhe (opcional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <Select
        label="Fase"
        value={phase}
        onChange={(value) => setPhase(value as ChecklistPhase)}
        options={checklistPhaseCatalog.map((p) => ({ value: p.id, label: p.label }))}
      />
      <div className="modal-actions">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={!canSave || saving}>
          {saving ? 'Salvando...' : 'Adicionar'}
        </Button>
      </div>
    </Modal>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
