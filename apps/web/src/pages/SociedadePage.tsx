import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  functionalRoleCatalog,
  type Company,
  type CompanyMember,
} from '@plim/shared';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../auth/AuthContext';
import { companyApi, messageForError } from '../company/companyApi';
import { useActiveCompany } from '../company/ActiveCompanyContext';
import { IconPlus, IconUsers } from './dashIcons';
import './dashboard.css';
import './sociedade.css';

/**
 * Módulo Sociedade (PRD): não é CRUD — mostra a composição da empresa, quanto
 * já foi distribuído, o que falta e por que a participação importa nos cálculos.
 */

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ready'; company: Company; members: CompanyMember[] };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? '?';
  const b = parts.length > 1 ? parts[parts.length - 1]![0] ?? '' : '';
  return (a + b).toUpperCase();
}
function fmtPct(v: number): string {
  return `${(Math.round(v * 100) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

export function SociedadePage() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const { company: activeCompany } = useActiveCompany();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyMember | null>(null);
  const [soloBusy, setSoloBusy] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [removing, setRemoving] = useState<CompanyMember | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Chegou da Home com "Adicionar sócio" (?add=1): já abre o modal.
  useEffect(() => {
    if (searchParams.get('add') === '1') {
      setAddOpen(true);
      searchParams.delete('add');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const load = useCallback(async () => {
    try {
      const members = await companyApi.listMembers(activeCompany.id);
      setState({ status: 'ready', company: activeCompany, members });
    } catch (err) {
      setState({ status: 'error', message: messageForError(err) });
    }
  }, [activeCompany]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === 'loading') return <p className="dash-muted">carregando sociedade…</p>;
  if (state.status === 'error') return <p className="dash-muted">{state.message}</p>;
  if (state.status === 'empty') return <p className="dash-muted">Crie sua empresa primeiro.</p>;

  const { company, members } = state;
  const allocated = members.reduce((s, m) => s + (m.equityPercent ?? 0), 0);
  const remaining = Math.max(0, Math.round((100 - allocated) * 100) / 100);
  const invalid = allocated > 100.001;
  const owner = members.find((m) => m.role === 'account_owner');
  // Excluir sócio é ação só do dono da conta (a API valida de novo).
  const viewerIsOwner = user ? members.find((m) => m.userId === user.id)?.role === 'account_owner' : true;
  const soloUndefined = members.length <= 1 && allocated === 0;
  const undefinedMembers = members.filter((m) => m.equityPercent == null);

  const statusCfg = invalid
    ? { cls: 'invalid', label: 'Participação acima de 100%', text: 'A soma das participações ultrapassou 100%. Ajuste os percentuais para continuar.' }
    : remaining === 0
      ? { cls: 'ok', label: 'Sociedade completa', text: 'A participação total já soma 100%.' }
      : { cls: 'warn', label: 'Sociedade incompleta', text: 'Você pode continuar usando o Plim, mas os cálculos ficam mais precisos quando completar a distribuição.' };

  async function setSolo100() {
    if (!owner) return;
    setSoloBusy(true);
    try {
      await companyApi.setMemberEquity(company.id, owner.id, 100);
      await load();
    } finally {
      setSoloBusy(false);
    }
  }

  async function handleRemove() {
    if (!removing) return;
    setRemoveBusy(true);
    setRemoveError('');
    try {
      await companyApi.removeMember(company.id, removing.id);
      setNotice(`${removing.fullName} foi removido da sociedade.`);
      setRemoving(null);
      await load();
    } catch (err) {
      setRemoveError(messageForError(err));
    } finally {
      setRemoveBusy(false);
    }
  }

  async function handleInvite(m: CompanyMember) {
    setInvitingId(m.id);
    setNotice('');
    try {
      await companyApi.inviteMember(company.id, m.id);
      setNotice(`Convite enviado para ${m.email}. A pessoa recebe um e-mail para entrar no Plim.`);
      await load();
    } catch (err) {
      setNotice(messageForError(err));
    } finally {
      setInvitingId(null);
    }
  }

  return (
    <div className="dash soc">
      {/* cabeçalho orientador */}
      <div>
        <h1 className="dash-page__title">Sociedade</h1>
        <p className="dash-page__subtitle">
          Organize quem participa da empresa, qual é o papel de cada pessoa e como a participação
          está distribuída. Isso ajuda o Plim a calcular despesas compartilhadas e acertos entre
          sócios.
        </p>
      </div>

      {/* resumo */}
      <div className="dash-cards soc-cards">
        <div className="dash-stat">
          <div className="dash-stat__icon dash-stat__icon--indigo"><IconUsers /></div>
          <span className="dash-stat__label">Sócios cadastrados</span>
          <span className="dash-stat__value" data-financial>{members.length}</span>
          <span className="dash-stat__hint">Pessoas envolvidas na empresa.</span>
        </div>
        <div className="dash-stat">
          <span className="dash-stat__label">Participação definida</span>
          <span className="dash-stat__value" data-financial>{fmtPct(allocated)}</span>
          <span className="dash-stat__hint">Parte da sociedade já distribuída.</span>
        </div>
        <div className="dash-stat">
          <span className="dash-stat__label">Participação pendente</span>
          <span className="dash-stat__value" data-financial>{fmtPct(remaining)}</span>
          <span className="dash-stat__hint">Ainda falta distribuir.</span>
        </div>
        <div className={`dash-stat soc-status soc-status--${statusCfg.cls}`}>
          <span className="dash-stat__label">Status</span>
          <span className="soc-status__label">{statusCfg.label}</span>
          <span className="dash-stat__hint">{statusCfg.text}</span>
        </div>
      </div>

      {/* barra de progresso */}
      <div className="soc-progress">
        <div className="soc-progress__head">
          <span>Participação definida: <strong>{fmtPct(allocated)}</strong></span>
          <span className={'soc-progress__msg' + (invalid ? ' is-invalid' : remaining === 0 ? ' is-ok' : '')}>
            {invalid
              ? 'A soma passou de 100%. Revise os percentuais.'
              : allocated === 0
                ? 'Você ainda não distribuiu as participações.'
                : remaining === 0
                  ? 'Participação societária completa.'
                  : `Faltam ${fmtPct(remaining)} para distribuir.`}
          </span>
        </div>
        <div className="soc-bar">
          <div
            className={'soc-bar__fill' + (invalid ? ' is-invalid' : remaining === 0 ? ' is-ok' : '')}
            style={{ width: `${Math.min(100, allocated)}%` }}
          />
        </div>
      </div>

      {/* por que importa */}
      <div className="soc-why">
        <span className="soc-why__title">Por que isso importa?</span>
        <p>
          A participação societária ajuda o Plim a entender como despesas compartilhadas e acertos
          entre sócios devem ser calculados. Se vocês ainda não decidiram os percentuais, tudo bem:
          você pode deixar em aberto e completar depois.
        </p>
      </div>

      {/* bloco "sozinho" */}
      {soloUndefined && (
        <div className="soc-solo">
          <span className="soc-solo__title">Você está sozinho por enquanto?</span>
          <p>Se ainda não existem outros sócios, você pode definir 100% para você ou decidir depois.</p>
          <div className="soc-solo__actions">
            <Button variant="secondary" onClick={setSolo100} disabled={soloBusy}>
              {soloBusy ? 'Salvando…' : 'Definir 100% para mim'}
            </Button>
            <Button variant="secondary" onClick={() => setAddOpen(true)}>Adicionar sócio</Button>
          </div>
        </div>
      )}

      {/* lista de sócios */}
      <section>
        <div className="soc-listhead">
          <h2 className="dash-panel__head-title">Sócios da empresa</h2>
          <Button onClick={() => setAddOpen(true)}>
            <IconPlus /> Adicionar sócio
          </Button>
        </div>
        {notice && <div className="soc-notice">{notice}</div>}
        <div className="soc-members">
          {members.map((m) => (
            <div className="soc-member" key={m.id}>
              <span className="soc-member__avatar">{initials(m.fullName)}</span>
              <div className="soc-member__info">
                <span className="soc-member__name">
                  {m.fullName}
                  {m.role === 'account_owner' && <span className="soc-tag">Responsável pela conta</span>}
                  {m.role !== 'account_owner' && m.userId && (
                    <span className="soc-tag soc-tag--in">no Plim</span>
                  )}
                  {!m.userId && m.invitationStatus === 'invited' && (
                    <span className="soc-tag soc-tag--sent">convite enviado</span>
                  )}
                </span>
                <span className="soc-member__meta">
                  {[
                    m.functionalRole,
                    m.email,
                    m.role === 'account_owner' ? null : 'Sócio',
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Sem papel definido'}
                </span>
              </div>
              <div className="soc-member__right">
                {m.equityPercent != null ? (
                  <span className="soc-member__pct" data-financial>{fmtPct(m.equityPercent)}</span>
                ) : (
                  <span className="soc-member__pct soc-member__pct--empty">participação não definida</span>
                )}
                {!m.userId && m.email && (
                  <button
                    className="soc-member__edit soc-member__invite"
                    onClick={() => void handleInvite(m)}
                    disabled={invitingId === m.id}
                  >
                    {invitingId === m.id
                      ? 'Enviando...'
                      : m.invitationStatus === 'invited'
                        ? 'Reenviar convite'
                        : 'Enviar convite'}
                  </button>
                )}
                <button className="soc-member__edit" onClick={() => setEditing(m)}>
                  Editar
                </button>
                {viewerIsOwner && m.role !== 'account_owner' && (
                  <button
                    className="soc-member__edit soc-member__remove"
                    onClick={() => {
                      setRemoveError('');
                      setRemoving(m);
                    }}
                  >
                    Excluir
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* pendências da sociedade */}
      <SocPendencias
        invalid={invalid}
        remaining={remaining}
        onlyOwner={members.length <= 1}
        undefinedCount={undefinedMembers.length}
        onAdjust={() => document.querySelector('.soc-members')?.scrollIntoView({ behavior: 'smooth' })}
        onAddSocio={() => setAddOpen(true)}
        onSolo={setSolo100}
      />

      {/* modais */}
      <Modal
        open={addOpen}
        title="Adicionar sócio"
        subtitle="Adicione uma pessoa envolvida no negócio. Se ainda não souber o percentual ou o e-mail, você pode completar depois."
        onClose={() => setAddOpen(false)}
      >
        {addOpen && (
          <MemberForm
            company={company}
            existingEmails={members.map((m) => m.email).filter((e): e is string => e != null)}
            onDone={(created) => {
              setAddOpen(false);
              if (created?.email && created.invitationStatus === 'invited') {
                setNotice(`Sócio adicionado. Convite enviado para ${created.email}.`);
              } else if (created && !created.email) {
                setNotice('Sócio adicionado. Cadastre o e-mail quando quiser enviar o convite.');
              }
              void load();
            }}
          />
        )}
      </Modal>

      <Modal
        open={editing != null}
        title="Editar sócio"
        onClose={() => setEditing(null)}
      >
        {editing && (
          <MemberForm
            company={company}
            member={editing}
            existingEmails={members.filter((m) => m.id !== editing.id).map((m) => m.email).filter((e): e is string => e != null)}
            onDone={() => {
              setEditing(null);
              void load();
            }}
          />
        )}
      </Modal>

      <Modal
        open={removing != null}
        title="Excluir sócio"
        onClose={() => (removeBusy ? undefined : setRemoving(null))}
      >
        {removing && (
          <div className="soc-remove">
            {removeError && <div className="form-error">{removeError}</div>}
            <p className="soc-remove__text">
              Tem certeza que deseja excluir <strong>{removing.fullName}</strong> da sociedade?
            </p>
            <div className="soc-remove__warn">
              Essa ação é <strong>irreversível</strong>. O vínculo, a participação
              {removing.equityPercent != null ? ` de ${fmtPct(removing.equityPercent)}` : ''} e o
              convite dessa pessoa serão removidos da empresa.
            </div>
            <div className="soc-remove__actions">
              <button
                type="button"
                className="soc-remove__confirm"
                onClick={() => void handleRemove()}
                disabled={removeBusy}
              >
                {removeBusy ? 'Excluindo…' : 'Sim, excluir definitivamente'}
              </button>
              <Button variant="ghost" onClick={() => setRemoving(null)} disabled={removeBusy}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {invalid && (
        <p className="soc-invalidnote">
          ⚠ A soma passou de 100%. Ajuste as participações: o Plim precisa disso para calcular os
          acertos com segurança.
        </p>
      )}
      <div className="dash-continue">
        <Button variant="ghost" onClick={() => navigate('/dashboard')}>Voltar ao painel</Button>
      </div>
    </div>
  );
}

/* ── pendências da sociedade ── */
function SocPendencias({
  invalid,
  remaining,
  onlyOwner,
  undefinedCount,
  onAdjust,
  onAddSocio,
  onSolo,
}: {
  invalid: boolean;
  remaining: number;
  onlyOwner: boolean;
  undefinedCount: number;
  onAdjust: () => void;
  onAddSocio: () => void;
  onSolo: () => void;
}) {
  const items: { id: string; title: string; desc: string; action: string; onClick: () => void; secondary?: { label: string; onClick: () => void } }[] = [];
  if (!invalid && remaining > 0) {
    items.push({
      id: 'incomplete',
      title: `Ainda faltam ${fmtPct(remaining)} para distribuir.`,
      desc: 'Você pode continuar usando o Plim, mas completar a participação ajuda nos cálculos de despesas compartilhadas e acertos.',
      action: 'Ajustar participações',
      onClick: onAdjust,
    });
  }
  if (onlyOwner) {
    items.push({
      id: 'solo',
      title: 'Existem outras pessoas nesse negócio?',
      desc: 'Se existem sócios ou cofundadores, cadastre essas pessoas para organizar papéis, participações e futuros acertos.',
      action: 'Adicionar sócio',
      onClick: onAddSocio,
      secondary: { label: 'Estou sozinho por enquanto', onClick: onSolo },
    });
  }
  if (undefinedCount > 0) {
    items.push({
      id: 'undefined',
      title: 'Existem sócios sem participação definida.',
      desc: 'Quando vocês decidirem os percentuais, registre aqui para deixar os cálculos mais precisos.',
      action: 'Definir participação',
      onClick: onAdjust,
    });
  }
  if (items.length === 0) return null;

  return (
    <section className="dash-panel">
      <div className="dash-panel__head">
        <h2>Pendências da sociedade</h2>
      </div>
      <div className="dash-pending">
        {items.map((p) => (
          <div className="dash-pending__item" key={p.id}>
            <span className="dash-pending__prio dash-pending__prio--media" />
            <div className="dash-pending__body">
              <span className="dash-pending__title">{p.title}</span>
              <span className="dash-pending__desc">{p.desc}</span>
            </div>
            <div className="dash-pending__acts">
              <button className="dash-pending__cta" onClick={p.onClick}>{p.action}</button>
              {p.secondary && (
                <button className="dash-pending__later" onClick={p.secondary.onClick}>{p.secondary.label}</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── formulário: adicionar OU editar sócio ── */
function MemberForm({
  company,
  member,
  existingEmails,
  onDone,
}: {
  company: Company;
  member?: CompanyMember;
  existingEmails: string[];
  onDone: (created?: CompanyMember) => void;
}) {
  const isEdit = member != null;
  const isOwner = member?.role === 'account_owner';
  const [fullName, setFullName] = useState(member?.fullName ?? '');
  const [email, setEmail] = useState(member?.email ?? '');
  const [functionalRole, setFunctionalRole] = useState(member?.functionalRole ?? '');
  const [pct, setPct] = useState(member?.equityPercent != null ? String(member.equityPercent) : '');
  const [notes, setNotes] = useState(member?.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  function parsePct(raw: string): number | null | 'invalid' {
    const t = raw.trim().replace(',', '.');
    if (!t) return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0 || n > 100) return 'invalid';
    return Math.round(n * 100) / 100;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    const errs: Record<string, string> = {};
    if (fullName.trim().length < 2) errs.fullName = 'Informe o nome (mín. 2 letras).';
    const parsed = parsePct(pct);
    if (parsed === 'invalid') errs.pct = 'Use um número de 0 a 100.';
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) errs.email = 'E-mail inválido.';
    if (cleanEmail && existingEmails.includes(cleanEmail)) errs.email = 'Esse e-mail já está na sociedade.';
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      if (isEdit) {
        await companyApi.updateMember(company.id, member!.id, {
          fullName: fullName.trim(),
          email: cleanEmail || null,
          functionalRole: functionalRole || null,
          equityPercent: parsed === 'invalid' ? undefined : parsed,
          notes: notes.trim() || null,
        });
        onDone();
        return;
      }
      const created = await companyApi.addMember(company.id, {
        fullName: fullName.trim(),
        email: cleanEmail || null,
        functionalRole: functionalRole || null,
        equityPercent: parsed === 'invalid' ? null : parsed,
        notes: notes.trim() || null,
      });
      onDone(created);
    } catch (err) {
      setFormError(messageForError(err));
      setSaving(false);
    }
  }

  return (
    <form className="fin-form" onSubmit={handleSubmit} noValidate>
      {formError && <div className="form-error">{formError}</div>}
      {isOwner && (
        <p className="soc-ownernote">
          Este é o responsável pela conta. Você pode editar o papel e a participação; o papel no
          sistema não muda por aqui.
        </p>
      )}
      <Input
        label="Nome completo"
        placeholder="Ex.: Diego Silva"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        error={errors.fullName}
        autoFocus
      />
      <Input
        label="E-mail (opcional)"
        type="email"
        placeholder="socio@empresa.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
        hint="Com e-mail, o sócio recebe um convite para entrar no Plim."
      />
      <div className="rc-grid">
        <Select
          label="Papel na empresa (opcional)"
          value={functionalRole}
          onChange={setFunctionalRole}
          placeholder="Selecione…"
          options={functionalRoleCatalog.map((r) => ({ value: r, label: r }))}
        />
        <Input
          label="Participação %"
          inputMode="decimal"
          placeholder="0"
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          error={errors.pct}
          hint="Ainda não sabe? Deixe em branco e complete depois."
        />
      </div>
      <div className="field">
        <label className="field__label">Observação (opcional)</label>
        <textarea
          className="ob-textarea rc-textarea"
          placeholder="Ex.: responsável pelo desenvolvimento do produto."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={300}
          rows={2}
        />
      </div>
      <Button type="submit" block disabled={saving}>
        {saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Adicionar sócio'}
      </Button>
    </form>
  );
}
