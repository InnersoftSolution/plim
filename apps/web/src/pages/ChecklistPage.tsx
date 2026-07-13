import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  checklistPhaseCatalog,
  type ChecklistPhase,
  type ChecklistStatus,
  type ChecklistView,
  type CompanyChecklistItem,
  type CompanyMember,
} from '@plim/shared';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { companyApi, messageForError } from '../company/companyApi';
import { useActiveCompany } from '../company/ActiveCompanyContext';
import { checklistApi } from '../company/checklistApi';
import { formFor, hrefFor, type ChecklistForm } from '../company/checklistGuides';
import './dashboard.css';
import './checklist.css';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ready'; companyId: string; view: ChecklistView; members: CompanyMember[] };

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
  const { company: activeCompany } = useActiveCompany();

  const load = useCallback(async () => {
    try {
      const companyId = activeCompany.id;
      const [viewLoaded, members] = await Promise.all([
        checklistApi.get(companyId),
        companyApi.listMembers(companyId),
      ]);
      let view = viewLoaded;
      // Migracao suave: item que ficou "em andamento" mas ja tem resposta salva
      // conta como feito (regra atual: salvou conteudo, concluiu).
      // (Papel de cada sócio fica de fora: lá "em andamento" significa que ainda
      // falta sócio sem papel definido, mesmo com conteúdo salvo.)
      const stale = view.items.filter(
        (i) =>
          !i.isAuto &&
          i.templateKey !== 'partner_roles' &&
          i.status === 'in_progress' &&
          (!!i.note || (!!i.data && Object.values(i.data).some((v) => v.trim().length > 0))),
      );
      if (stale.length > 0) {
        await Promise.all(stale.map((i) => checklistApi.setStatus(companyId, i.id, 'completed')));
        view = await checklistApi.get(companyId);
      }
      setState({ status: 'ready', companyId, view, members });
    } catch (err) {
      setState({ status: 'error', message: messageForError(err) });
    }
  }, [activeCompany]);

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
    entry: { note: string | null; data: Record<string, string> | null; status?: ChecklistStatus },
  ) {
    if (state.status !== 'ready') return;
    const patch: { note: string | null; data: Record<string, string> | null; status?: ChecklistStatus } = {
      note: entry.note,
      data: entry.data,
    };
    if (entry.status) {
      // O painel sabe o status certo (ex: papel de cada sócio só conclui
      // quando todos os sócios estão definidos).
      if (entry.status !== item.status) patch.status = entry.status;
    } else {
      // Inteligencia deterministica: se a informacao existe, o item esta feito.
      // Salvar qualquer conteudo (campos estruturados ou texto) conclui o item;
      // apagar tudo e salvar reabre. O circulo continua valendo para ajuste manual.
      const hasData = !!entry.data && Object.values(entry.data).some((v) => v.trim().length > 0);
      const hasContent = hasData || !!entry.note;
      if ((item.status === 'not_started' || item.status === 'in_progress') && hasContent) {
        patch.status = 'completed';
      } else if (item.status === 'completed' && !hasContent) {
        patch.status = 'not_started';
      }
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

  const { view, companyId, members } = state;

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
                  members={members}
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
  members,
  expanded,
  onToggle,
  onChange,
  onSave,
  onGo,
}: {
  item: CompanyChecklistItem;
  members: CompanyMember[];
  expanded: boolean;
  onToggle: () => void;
  onChange: (itemId: string, status: ChecklistStatus) => void;
  onSave: (
    item: CompanyChecklistItem,
    entry: { note: string | null; data: Record<string, string> | null; status?: ChecklistStatus },
  ) => Promise<void>;
  onGo: (route: string) => void;
}) {
  const done = item.status === 'completed';
  const parked = item.status === 'skipped' || item.status === 'not_applicable';
  const form = formFor(item.templateKey);
  // Itens automáticos vivem dos dados reais; não têm anotação/guia manual.
  const canNote = !item.isAuto;
  // Papel de cada sócio ganha o mini-organizador (um card por sócio).
  const isRolesItem = item.templateKey === 'partner_roles' && members.length > 0;
  // Prévia discreta na linha fechada: valores registrados ou anotação.
  // Papel de cada sócio guarda os valores por id; a prévia mostra o nome.
  const preview = item.data
    ? item.templateKey === 'partner_roles'
      ? members
          .filter((m) => item.data![m.id])
          .map((m) => {
            const summary = roleEntrySummary(parseRoleEntry(item.data![m.id], ''));
            return summary ? `${m.fullName.split(' ')[0]}: ${summary}` : '';
          })
          .filter(Boolean)
          .join(' · ') || item.note
      : Object.values(item.data).filter(Boolean).join(' · ') || item.note
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

          {item.actionRoute && !done && !isRolesItem && (
            <div className="chk-row__go">
              <button type="button" className="chk-action" onClick={() => onGo(item.actionRoute!)}>
                {item.actionLabel ?? 'Abrir'}
              </button>
            </div>
          )}

          {canNote &&
            (isRolesItem ? (
              <PartnerRolesPanel item={item} form={form} members={members} onSave={onSave} onGo={onGo} />
            ) : (
              <ItemPanel item={item} form={form} onSave={onSave} />
            ))}

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
/* ── "Papel de cada sócio": mini-organizador de responsabilidades ──────
 * Cada sócio vira um card com papel na empresa, áreas de responsabilidade
 * e observação. Tudo guardado no data do item como JSON por sócio. */

const PAPEL_SUGGESTIONS = ['Cofundador', 'Sócio', 'Investidor', 'Consultor', 'Ainda indefinido'];
const AREA_SUGGESTIONS = [
  'Produto',
  'Tecnologia',
  'Design',
  'Operação',
  'Financeiro',
  'Legal',
  'Vendas',
  'Marketing',
  'Atendimento',
  'Estratégia',
  'Um pouco de tudo',
];

interface PartnerRoleEntry {
  role: string;
  areas: string[];
  note: string;
}

/** Lê o registro salvo (JSON) aceitando o formato antigo de texto simples. */
function parseRoleEntry(raw: string | undefined, fallbackRole: string): PartnerRoleEntry {
  if (raw) {
    if (raw.startsWith('{')) {
      try {
        const p = JSON.parse(raw) as Partial<PartnerRoleEntry>;
        return {
          role: typeof p.role === 'string' ? p.role : '',
          areas: Array.isArray(p.areas) ? p.areas.filter((a): a is string => typeof a === 'string') : [],
          note: typeof p.note === 'string' ? p.note : '',
        };
      } catch {
        /* texto antigo que por acaso começa com { */
      }
    }
    return { role: raw, areas: [], note: '' };
  }
  return { role: fallbackRole, areas: [], note: '' };
}

function serializeRoleEntry(entry: PartnerRoleEntry): string | null {
  const role = entry.role.trim();
  const note = entry.note.trim();
  if (!role && entry.areas.length === 0 && !note) return null;
  return JSON.stringify({ role, areas: entry.areas, note });
}

/** Definido = tem papel de verdade ou pelo menos uma área de responsabilidade. */
function roleEntryDefined(entry: PartnerRoleEntry): boolean {
  const role = entry.role.trim();
  return (role.length > 0 && role.toLowerCase() !== 'ainda indefinido') || entry.areas.length > 0;
}

/** Resumo curto do card para a prévia da linha fechada. */
function roleEntrySummary(entry: PartnerRoleEntry): string {
  const areas = entry.areas.join(', ');
  if (entry.role.trim() && areas) return `${entry.role.trim()} (${areas})`;
  return entry.role.trim() || areas || entry.note.trim();
}

function initialsFor(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]![0] ?? '' : '';
  return (first + last).toUpperCase();
}

/**
 * Mini-organizador de responsabilidades do item "Papel de cada sócio".
 * Um card por sócio: papel na empresa + áreas de responsabilidade + observação.
 * Papel e responsabilidade são coisas separadas: dá para ser Cofundadora E
 * cuidar de Produto e Estratégia. O item só conclui quando todo sócio está
 * definido; enquanto isso fica "em andamento", sem bloquear nada.
 */
function PartnerRolesPanel({
  item,
  form,
  members,
  onSave,
  onGo,
}: {
  item: CompanyChecklistItem;
  form: ChecklistForm | null;
  members: CompanyMember[];
  onSave: (
    item: CompanyChecklistItem,
    entry: { note: string | null; data: Record<string, string> | null; status?: ChecklistStatus },
  ) => Promise<void>;
  onGo: (route: string) => void;
}) {
  // Pré-preenche com o papel do cadastro de Sócios quando ainda não há registro.
  const [values, setValues] = useState<Record<string, PartnerRoleEntry>>(() => {
    const base: Record<string, PartnerRoleEntry> = {};
    for (const m of members) base[m.id] = parseRoleEntry(item.data?.[m.id], m.functionalRole ?? '');
    return base;
  });
  const [saving, setSaving] = useState(false);

  const savedData = item.data ?? {};
  const dirty = members.some(
    (m) => (serializeRoleEntry(values[m.id]!) ?? '') !== (savedData[m.id] ?? ''),
  );
  const savedState = !dirty && Object.keys(savedData).length > 0;

  function patchEntry(memberId: string, patch: Partial<PartnerRoleEntry>) {
    setValues((cur) => ({ ...cur, [memberId]: { ...cur[memberId]!, ...patch } }));
  }

  function toggleArea(memberId: string, area: string) {
    setValues((cur) => {
      const entry = cur[memberId]!;
      const areas = entry.areas.includes(area)
        ? entry.areas.filter((a) => a !== area)
        : [...entry.areas, area];
      return { ...cur, [memberId]: { ...entry, areas } };
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const data: Record<string, string> = {};
      for (const m of members) {
        const raw = serializeRoleEntry(values[m.id]!);
        if (raw) data[m.id] = raw;
      }
      const hasAny = Object.keys(data).length > 0;
      const allDefined = members.every((m) => roleEntryDefined(values[m.id]!));
      const status: ChecklistStatus =
        hasAny && allDefined ? 'completed' : hasAny ? 'in_progress' : 'not_started';
      await onSave(item, { note: item.note, data: hasAny ? data : null, status });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="chk-guide">
      {form?.intro && <p className="chk-guide__intro">{form.intro}</p>}

      <div className="chk-partners">
        {members.map((m) => {
          const entry = values[m.id]!;
          const defined = roleEntryDefined(entry);
          return (
            <div className={'chk-partner' + (defined ? ' is-defined' : '')} key={m.id}>
              <div className="chk-partner__head">
                <span className="chk-partner__avatar" aria-hidden="true">
                  {initialsFor(m.fullName)}
                </span>
                <div className="chk-partner__id">
                  <strong className="chk-partner__name">{m.fullName}</strong>
                  <span className={'chk-partner__status' + (defined ? ' is-ok' : '')}>
                    {defined ? (
                      <>
                        <CheckIcon /> Responsabilidade definida
                      </>
                    ) : (
                      'Papel ainda não definido'
                    )}
                  </span>
                </div>
              </div>

              <label className="chk-field">
                <span className="chk-field__label">Papel na empresa</span>
                <input
                  className="chk-field__input"
                  type="text"
                  value={entry.role}
                  maxLength={40}
                  placeholder="ex: Cofundadora"
                  onChange={(e) => patchEntry(m.id, { role: e.target.value })}
                />
              </label>
              {!entry.role.trim() && (
                <div className="chk-partner__chips">
                  {PAPEL_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="chk-chip"
                      onClick={() => patchEntry(m.id, { role: s })}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              <div className="chk-partner__areas">
                <span className="chk-field__label">Responsabilidades principais</span>
                <div className="chk-partner__chips">
                  {AREA_SUGGESTIONS.map((a) => {
                    const on = entry.areas.includes(a);
                    return (
                      <button
                        key={a}
                        type="button"
                        className={'chk-chip' + (on ? ' is-on' : '')}
                        aria-pressed={on}
                        onClick={() => toggleArea(m.id, a)}
                      >
                        {a}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="chk-field">
                <span className="chk-field__label">Observação (opcional)</span>
                <input
                  className="chk-field__input"
                  type="text"
                  value={entry.note}
                  maxLength={80}
                  placeholder="ex: cuida da visão do produto e organização geral"
                  onChange={(e) => patchEntry(m.id, { note: e.target.value })}
                />
              </label>
            </div>
          );
        })}
      </div>

      <p className="chk-partners__later">Você pode ajustar isso depois conforme a empresa evoluir.</p>

      <div className="chk-guide__foot">
        {item.actionRoute && (
          <button type="button" className="chk-link" onClick={() => onGo(item.actionRoute!)}>
            {item.actionLabel ?? 'Ver sócios'}
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
            'Salvar responsabilidades'
          )}
        </button>
      </div>
    </div>
  );
}

function ItemPanel({
  item,
  form,
  onSave,
}: {
  item: CompanyChecklistItem;
  form: ChecklistForm | null;
  onSave: (
    item: CompanyChecklistItem,
    entry: { note: string | null; data: Record<string, string> | null; status?: ChecklistStatus },
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
