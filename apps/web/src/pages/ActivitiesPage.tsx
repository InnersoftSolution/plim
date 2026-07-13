import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  activityAreaCatalog,
  activityPriorityCatalog,
  activityStatusCatalog,
  type Activity,
  type ActivityArea,
  type ActivityPriority,
  type Company,
  type CompanyMember,
} from '@plim/shared';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { companyApi, messageForError } from '../company/companyApi';
import { useActiveCompany } from '../company/ActiveCompanyContext';
import { activityApi, currentWeekStart, weekRangeLabel } from '../activities/activityApi';
import { IconPlus } from './dashIcons';
import './dashboard.css';
import './activities.css';

/**
 * Módulo Atividades — Kanban leve + plano da semana. Guiado e simples:
 * "o que precisa ser feito esta semana, quem faz e em que status está".
 * Não impacta finanças (RP006).
 */

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ready'; company: Company; members: CompanyMember[]; activities: Activity[] };

const areaLabel = (id: string) => activityAreaCatalog.find((a) => a.id === id)?.label ?? id;
const priorityLabel = (id: string) => activityPriorityCatalog.find((p) => p.id === id)?.label ?? id;
const statusLabel = (id: string) => activityStatusCatalog.find((s) => s.id === id)?.label ?? id;

export function ActivitiesPage() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [thisWeek, setThisWeek] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState<Activity | null>(null);
  const [searchParams] = useSearchParams();
  const { company: activeCompany } = useActiveCompany();

  const load = useCallback(async () => {
    try {
      const [members, activities] = await Promise.all([
        companyApi.listMembers(activeCompany.id),
        activityApi.list(activeCompany.id),
      ]);
      setState({ status: 'ready', company: activeCompany, members, activities });
    } catch (err) {
      setState({ status: 'error', message: messageForError(err) });
    }
  }, [activeCompany]);

  useEffect(() => {
    void load();
  }, [load]);

  // Chegou de uma ação rápida (?nova=1): já abre o formulário.
  useEffect(() => {
    if (searchParams.get('nova') === '1') setFormOpen(true);
  }, [searchParams]);

  if (state.status === 'loading') return <p className="fin-muted">carregando atividades…</p>;
  if (state.status === 'error')
    return (
      <div className="act-error">
        <p>{state.message}</p>
        <Button onClick={() => void load()}>Tentar de novo</Button>
      </div>
    );
  if (state.status === 'empty') return <p className="fin-muted">Crie sua empresa primeiro.</p>;

  const { company, members, activities } = state;
  const nameOf = (id: string | null) => (id ? members.find((m) => m.id === id)?.fullName ?? 'Sócio' : null);
  const weekStart = currentWeekStart();

  // Detalhe sempre reflete a versão mais recente da lista.
  const detailLive = detail ? activities.find((a) => a.id === detail.id) ?? null : null;

  // Visão: só a semana atual (padrão) ou todas. Cancelado fica fora da lista.
  const visible = activities.filter((a) => {
    if (a.status === 'cancelled') return false;
    if (thisWeek && a.weekStartDate !== weekStart) return false;
    return true;
  });

  // Agrupado por sócio (cada sócio → tabela). "Sem responsável" fica por último.
  const groups: { id: string | null; name: string; items: Activity[] }[] = [
    ...members.map((m) => ({
      id: m.id,
      name: m.fullName,
      items: visible.filter((a) => a.responsibleMemberId === m.id),
    })),
    { id: null, name: 'Sem responsável', items: visible.filter((a) => !a.responsibleMemberId) },
  ].filter((g) => g.items.length > 0);

  // Resumo do plano da semana (sempre sobre a semana atual).
  const weekAll = activities.filter((a) => a.weekStartDate === weekStart && a.status !== 'cancelled');
  const summary = {
    total: weekAll.length,
    inProgress: weekAll.filter((a) => a.status === 'in_progress').length,
    overdue: weekAll.filter((a) => a.isOverdue).length,
    done: weekAll.filter((a) => a.status === 'done').length,
  };

  const nothingYet = activities.filter((a) => a.status !== 'cancelled').length === 0;

  return (
    <div className="act">
      {/* ── cabeçalho ── */}
      <div className="fin-head fin-head--row">
        <div>
          <h1>Atividades</h1>
          <p>Organize o que cada sócio precisa fazer e acompanhe o andamento da empresa semana a semana.</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <IconPlus /> Nova atividade
        </Button>
      </div>

      {/* ── plano da semana ── */}
      <section className="act-week">
        <div className="act-week__head">
          <div>
            <span className="act-week__title">Plano da semana</span>
            <span className="act-week__range">{weekRangeLabel(weekStart)}</span>
          </div>
          <label className="act-week__toggle">
            <input type="checkbox" checked={thisWeek} onChange={(e) => setThisWeek(e.target.checked)} />
            Só esta semana
          </label>
        </div>
        <p className="act-week__sub">Veja o que está planejado, em andamento, bloqueado ou concluído nesta semana.</p>
        {summary.total > 0 && (
          <div className="act-summary">
            <span className="act-summary__pill">{summary.total} {summary.total === 1 ? 'atividade' : 'atividades'}</span>
            <span className="act-summary__pill">{summary.inProgress} em andamento</span>
            {summary.overdue > 0 && <span className="act-summary__pill is-overdue">{summary.overdue} atrasada{summary.overdue === 1 ? '' : 's'}</span>}
            <span className="act-summary__pill is-done">{summary.done} concluída{summary.done === 1 ? '' : 's'}</span>
          </div>
        )}
      </section>

      {/* ── lista por sócio ── */}
      {nothingYet ? (
        <div className="fin-card fin-emptybox">
          <h2>Nenhuma atividade planejada ainda</h2>
          <p>Crie atividades para organizar o que cada sócio precisa fazer.</p>
          <Button onClick={() => setFormOpen(true)}>
            <IconPlus /> Criar primeira atividade
          </Button>
        </div>
      ) : groups.length === 0 ? (
        <div className="fin-card">
          <p className="act-col__empty" style={{ textAlign: 'left' }}>
            Nada nesta semana. Desmarque "Só esta semana" para ver todas as atividades.
          </p>
        </div>
      ) : (
        <div className="act-groups">
          {groups.map((g) => (
            <section className="act-group" key={g.id ?? 'none'}>
              <header className="act-group__head">
                <span className="act-group__avatar" aria-hidden="true">{initials(g.name)}</span>
                <span className="act-group__name">{g.name}</span>
                <span className="act-group__count">
                  {g.items.length} {g.items.length === 1 ? 'atividade' : 'atividades'}
                </span>
              </header>

              <div className="act-table">
                <div className="act-table__head" aria-hidden="true">
                  <span>Atividade</span>
                  <span>Início</span>
                  <span>Prazo</span>
                  <span>Status</span>
                </div>
                {g.items.map((a) => (
                  <button type="button" className="act-row" key={a.id} onClick={() => setDetail(a)}>
                    <span className="act-row__title" data-label="Atividade">
                      {a.title}
                      {a.isOverdue && <span className="act-badge act-badge--overdue">Atrasada</span>}
                    </span>
                    <span className="act-row__cell" data-label="Início">{fmtOrDash(a.startDate)}</span>
                    <span className={'act-row__cell' + (a.isOverdue ? ' is-overdue' : '')} data-label="Prazo">
                      {fmtOrDash(a.dueDate)}
                    </span>
                    <span className="act-row__cell" data-label="Status">
                      <span className={'act-status act-status--' + a.status}>{statusLabel(a.status)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* ── nova atividade ── */}
      <Modal
        open={formOpen}
        title="Nova atividade"
        subtitle="Defina o que precisa ser feito, quem será responsável e quando essa atividade deve ser concluída."
        onClose={() => setFormOpen(false)}
      >
        {formOpen && (
          <ActivityForm
            company={company}
            members={members}
            onCreated={() => {
              setFormOpen(false);
              void load();
            }}
          />
        )}
      </Modal>

      {/* ── detalhe ── */}
      <Modal open={detailLive != null} title="Detalhe da atividade" onClose={() => setDetail(null)}>
        {detailLive && (
          <ActivityDetail
            company={company}
            activity={detailLive}
            responsible={nameOf(detailLive.responsibleMemberId)}
            creator={nameOf(detailLive.createdBy)}
            onChanged={() => void load()}
            onClose={() => setDetail(null)}
          />
        )}
      </Modal>
    </div>
  );
}

/* ── formulário de criação ── */
function ActivityForm({
  company,
  members,
  onCreated,
}: {
  company: Company;
  members: CompanyMember[];
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [responsibleMemberId, setResponsibleMemberId] = useState('');
  const [area, setArea] = useState('outros');
  const [priority, setPriority] = useState('medium');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [checklist, setChecklist] = useState<string[]>([]);
  const [clDraft, setClDraft] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function addChecklist() {
    const t = clDraft.trim();
    if (!t) return;
    setChecklist((prev) => [...prev, t]);
    setClDraft('');
  }

  async function save() {
    if (title.trim().length < 1) {
      setError('Dê um título à atividade — ex.: "Criar página inicial do site".');
      return;
    }
    if (startDate && dueDate && startDate > dueDate) {
      setError('O prazo não pode ser antes da data de início.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await activityApi.create(company.id, {
        title: title.trim(),
        description: description.trim() || null,
        responsibleMemberId: responsibleMemberId || null,
        area: area as ActivityArea,
        priority: priority as ActivityPriority,
        startDate: startDate || null,
        dueDate: dueDate || null,
        checklist: checklist.map((t) => ({ title: t })),
      });
      onCreated();
    } catch (err) {
      setError(messageForError(err));
      setSaving(false);
    }
  }

  return (
    <div className="act-form">
      {error && <div className="form-error">{error}</div>}
      <Input
        label="Título da atividade"
        placeholder="Ex.: Criar página inicial do site"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />
      <div className="field">
        <label className="field__label">Descrição (opcional)</label>
        <textarea
          className="field__input rc-textarea"
          placeholder="Explique rapidamente o que precisa ser feito."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={1000}
          rows={2}
        />
      </div>
      <Select
        label="Responsável"
        hint="Escolha quem ficará responsável por acompanhar essa atividade."
        value={responsibleMemberId}
        onChange={setResponsibleMemberId}
        placeholder="Sem responsável por enquanto"
        options={members.map((m) => ({ value: m.id, label: m.fullName }))}
      />
      <div className="act-form__row">
        <Select
          label="Área"
          value={area}
          onChange={setArea}
          options={activityAreaCatalog.map((a) => ({ value: a.id, label: a.label }))}
        />
        <Select
          label="Prioridade"
          value={priority}
          onChange={setPriority}
          options={activityPriorityCatalog.map((p) => ({ value: p.id, label: p.label }))}
        />
      </div>
      <div className="act-form__row">
        <div className="field">
          <label className="field__label">Início</label>
          <input type="date" className="field__input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <span className="field__hint">Quando o trabalho começa.</span>
        </div>
        <div className="field">
          <label className="field__label">Prazo</label>
          <input type="date" className="field__input" value={dueDate} min={startDate || undefined} onChange={(e) => setDueDate(e.target.value)} />
          <span className="field__hint">Data de conclusão prevista.</span>
        </div>
      </div>

      {/* checklist */}
      <div className="field">
        <label className="field__label">Checklist (opcional)</label>
        {checklist.length > 0 && (
          <ul className="act-cllist">
            {checklist.map((t, i) => (
              <li key={i}>
                <span>{t}</span>
                <button type="button" onClick={() => setChecklist((p) => p.filter((_, j) => j !== i))} aria-label="Remover">×</button>
              </li>
            ))}
          </ul>
        )}
        <div className="act-cladd">
          <input
            className="field__input"
            placeholder="Ex.: Separar referências"
            value={clDraft}
            onChange={(e) => setClDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addChecklist();
              }
            }}
          />
          <Button variant="secondary" onClick={addChecklist}>Adicionar</Button>
        </div>
      </div>

      <Button block onClick={save} disabled={saving}>
        {saving ? 'Salvando…' : 'Criar atividade'}
      </Button>
    </div>
  );
}

/* ── detalhe ── */
function ActivityDetail({
  company,
  activity: a,
  responsible,
  creator,
  onChanged,
  onClose,
}: {
  company: Company;
  activity: Activity;
  responsible: string | null;
  creator: string | null;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [clDraft, setClDraft] = useState('');
  const [working, setWorking] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setWorking(true);
    try {
      await fn();
      onChanged();
    } finally {
      setWorking(false);
    }
  }

  const disabled = working;

  return (
    <div className="act-detail">
      <div className="act-detail__head">
        <span className={'act-prio act-prio--' + a.priority}>{priorityLabel(a.priority)}</span>
        <span className="act-detail__status">{statusLabel(a.status)}</span>
        {a.isOverdue && <span className="act-badge act-badge--overdue">Atrasada</span>}
      </div>
      <h3 className="act-detail__title">{a.title}</h3>
      {a.description && <p className="act-detail__desc">{a.description}</p>}

      {a.isOverdue && (
        <div className="act-detail__alert">
          Essa atividade passou do prazo. Atualize o status ou reagende para a próxima semana.
        </div>
      )}
      {!a.responsibleMemberId && (
        <div className="act-detail__alert act-detail__alert--soft">
          Esta atividade ainda não tem responsável. Defina quem vai acompanhar para não deixá-la perdida.
        </div>
      )}
      {a.status === 'blocked' && a.blockedReason && (
        <div className="act-detail__alert act-detail__alert--soft">Bloqueio: {a.blockedReason}</div>
      )}

      <div className="mw-review">
        <Row k="Responsável" v={responsible ?? '— sem responsável'} />
        <Row k="Área" v={areaLabel(a.area)} />
        <Row k="Prioridade" v={priorityLabel(a.priority)} />
        <Row k="Início" v={a.startDate ? formatDate(a.startDate) : 'não definido'} />
        <Row k="Prazo" v={a.dueDate ? formatDate(a.dueDate) : 'sem prazo'} />
        <Row k="Status" v={statusLabel(a.status)} />
        {creator && <Row k="Criado por" v={creator} />}
        <Row k="Criada em" v={formatDateTime(a.createdAt)} />
        <Row k="Última atualização" v={formatDateTime(a.updatedAt)} />
        {a.completedAt && <Row k="Concluída em" v={formatDateTime(a.completedAt)} />}
      </div>

      {/* checklist */}
      <div className="act-detail__section">
        <span className="movd-section__title">Checklist</span>
        {a.checklist.length === 0 ? (
          <p className="act-col__empty" style={{ textAlign: 'left' }}>Nenhum item ainda.</p>
        ) : (
          <ul className="act-cllist act-cllist--interactive">
            {a.checklist.map((c) => (
              <li key={c.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={c.isCompleted}
                    disabled={disabled}
                    onChange={() => run(() => activityApi.setChecklistItem(company.id, a.id, c.id, !c.isCompleted))}
                  />
                  <span className={c.isCompleted ? 'is-done' : ''}>{c.title}</span>
                </label>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => run(() => activityApi.removeChecklistItem(company.id, a.id, c.id))}
                  aria-label="Remover"
                >×</button>
              </li>
            ))}
          </ul>
        )}
        <div className="act-cladd">
          <input
            className="field__input"
            placeholder="Adicionar item…"
            value={clDraft}
            disabled={disabled}
            onChange={(e) => setClDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && clDraft.trim()) {
                e.preventDefault();
                const t = clDraft.trim();
                setClDraft('');
                void run(() => activityApi.addChecklistItem(company.id, a.id, t));
              }
            }}
          />
        </div>
      </div>

      {/* mudança de status */}
      <div className="act-detail__section">
        <span className="movd-section__title">Alterar status</span>
        <div className="act-statusbtns">
          {activityStatusCatalog.map((s) => (
            <button
              key={s.id}
              type="button"
              className={'act-statusbtn' + (a.status === s.id ? ' is-active' : '')}
              disabled={disabled || a.status === s.id}
              onClick={() => {
                let blockedReason: string | null = null;
                if (s.id === 'blocked') {
                  blockedReason = window.prompt('O que está bloqueando esta atividade? (opcional)') ?? null;
                }
                void run(() => activityApi.changeStatus(company.id, a.id, { status: s.id, blockedReason }));
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <Button block onClick={onClose}>Fechar</Button>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="mw-review__row">
      <span>{k}</span>
      <strong>{v}</strong>
    </div>
  );
}

/** Iniciais do sócio para o avatar do grupo (ex.: "Rafaelle Rodrigues" → "RR"). */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + last).toUpperCase();
}

/** Data curta (dd/mm) ou "—" quando ausente. */
function fmtOrDash(iso: string | null): string {
  if (!iso) return '—';
  const [, m, d] = iso.split('-');
  return d && m ? `${d}/${m}` : iso;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
