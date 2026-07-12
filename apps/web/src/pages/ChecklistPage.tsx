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
import { IconPlus } from './dashIcons';
import './dashboard.css';
import './checklist.css';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ready'; companyId: string; view: ChecklistView };

const statusMeta: Record<ChecklistStatus, { label: string; cls: string }> = {
  not_started: { label: 'Nao iniciado', cls: 'is-not-started' },
  in_progress: { label: 'Em andamento', cls: 'is-in-progress' },
  completed: { label: 'Concluido', cls: 'is-completed' },
  skipped: { label: 'Fazer depois', cls: 'is-skipped' },
  not_applicable: { label: 'Nao se aplica', cls: 'is-na' },
};

/**
 * Checklist da empresa. Orienta os proximos passos para estruturar o negocio,
 * sem bloquear. Alguns itens se concluem sozinhos quando o dado real aparece.
 */
export function ChecklistPage() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [formOpen, setFormOpen] = useState(false);
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
    // Atualiza otimista e recarrega para refletir progresso e regras automaticas.
    await checklistApi.setStatus(state.companyId, itemId, status);
    await load();
  }

  if (state.status === 'loading') return <div className="dash-loading">Carregando checklist...</div>;
  if (state.status === 'error')
    return (
      <div className="dash-error">
        <p>{state.message}</p>
        <Button onClick={() => void load()}>Tentar de novo</Button>
      </div>
    );
  if (state.status === 'empty')
    return (
      <div className="dash-error">
        <p>Cadastre sua empresa para ver o checklist.</p>
        <Button onClick={() => navigate('/onboarding')}>Cadastrar empresa</Button>
      </div>
    );

  const { view, companyId } = state;

  return (
    <div className="chk">
      <header className="chk-head">
        <h1>Checklist da empresa</h1>
        <p>
          Organize os proximos passos para transformar sua ideia em uma empresa mais estruturada. Voce pode
          concluir os itens no seu ritmo.
        </p>
      </header>

      <ProgressBlock view={view} />

      <div className="chk-actions">
        <Button variant="ghost" onClick={() => setFormOpen(true)}>
          <IconPlus /> Adicionar item ao checklist
        </Button>
      </div>

      {checklistPhaseCatalog.map((phase) => {
        const items = view.items.filter((i) => i.phase === phase.id);
        if (items.length === 0) return null;
        return <PhaseSection key={phase.id} phaseId={phase.id} items={items} onChange={changeStatus} onGo={navigate} />;
      })}

      {formOpen && (
        <CustomItemModal
          companyId={companyId}
          onClose={() => setFormOpen(false)}
          onCreated={async () => {
            setFormOpen(false);
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
      <div className="chk-progress__top">
        <div>
          <strong>Estruturacao da empresa</strong>
          <span className="chk-progress__count">
            {completed} de {total} itens concluidos
          </span>
        </div>
        <span className="chk-progress__pct">{percent}%</span>
      </div>
      <div className="chk-bar">
        <div className="chk-bar__fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="chk-progress__hint">Quanto mais itens voce organiza, mais claro fica o caminho da empresa.</p>
    </section>
  );
}

function PhaseSection({
  phaseId,
  items,
  onChange,
  onGo,
}: {
  phaseId: ChecklistPhase;
  items: CompanyChecklistItem[];
  onChange: (itemId: string, status: ChecklistStatus) => void;
  onGo: (route: string) => void;
}) {
  const phase = checklistPhaseCatalog.find((p) => p.id === phaseId)!;
  const done = items.filter((i) => i.status === 'completed').length;
  return (
    <section className="chk-phase">
      <div className="chk-phase__head">
        <h2>{phase.label}</h2>
        <span className="chk-phase__count">
          {done}/{items.length}
        </span>
      </div>
      <p className="chk-phase__help">{phase.help}</p>
      <div className="chk-items">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} onChange={onChange} onGo={onGo} />
        ))}
      </div>
    </section>
  );
}

function ItemCard({
  item,
  onChange,
  onGo,
}: {
  item: CompanyChecklistItem;
  onChange: (itemId: string, status: ChecklistStatus) => void;
  onGo: (route: string) => void;
}) {
  const meta = statusMeta[item.status];
  const isDone = item.status === 'completed';
  const isParked = item.status === 'skipped' || item.status === 'not_applicable';
  return (
    <article className={'chk-card ' + meta.cls}>
      <div className="chk-card__main">
        <div className="chk-card__title">
          <span>{item.title}</span>
          <span className={'chk-badge ' + meta.cls}>{meta.label}</span>
        </div>
        {item.description && <p className="chk-card__desc">{item.description}</p>}
      </div>
      <div className="chk-card__foot">
        {item.actionRoute && !isDone && (
          <Button variant="ghost" onClick={() => onGo(item.actionRoute!)}>
            {item.actionLabel ?? 'Abrir'}
          </Button>
        )}
        {!isDone && !item.isAuto && (
          <button type="button" className="chk-link" onClick={() => onChange(item.id, 'completed')}>
            Marcar como feito
          </button>
        )}
        {!isParked && !isDone && (
          <button type="button" className="chk-link chk-link--muted" onClick={() => onChange(item.id, 'skipped')}>
            Fazer depois
          </button>
        )}
        {!isParked && (
          <button
            type="button"
            className="chk-link chk-link--muted"
            onClick={() => onChange(item.id, 'not_applicable')}
          >
            Nao se aplica
          </button>
        )}
        {(isDone || isParked) && !item.isAuto && (
          <button type="button" className="chk-link chk-link--muted" onClick={() => onChange(item.id, 'not_started')}>
            Reabrir
          </button>
        )}
        {(isParked && item.isAuto) && (
          <button type="button" className="chk-link chk-link--muted" onClick={() => onChange(item.id, 'not_started')}>
            Reabrir
          </button>
        )}
      </div>
    </article>
  );
}

function CustomItemModal({
  companyId,
  onClose,
  onCreated,
}: {
  companyId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [phase, setPhase] = useState<ChecklistPhase>('routine');
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
    <Modal title="Adicionar item ao checklist" onClose={onClose}>
      {error && <div className="form-error">{error}</div>}
      <Input label="Titulo" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Falar com fornecedor" autoFocus />
      <Input label="Descricao (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      <Select label="Fase" value={phase} onChange={(e) => setPhase(e.target.value as ChecklistPhase)}>
        {checklistPhaseCatalog.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </Select>
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
