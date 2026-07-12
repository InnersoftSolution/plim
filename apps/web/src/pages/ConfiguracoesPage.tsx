import { useEffect, useState, type DragEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  businessStageCatalog,
  countryCatalog,
  currencyCatalog,
  formatCep,
  formatCnpj,
  formatPhone,
  isValidCnpj,
  legalStructureCatalog,
  onlyDigits,
  type Company,
  type CompanyMember,
  type GuideContent,
  type UpdateCompanyInput,
} from '@plim/shared';
import { apiFetch } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Drawer } from '../components/ui/Drawer';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { companyApi, logoApi, messageForError } from '../company/companyApi';
import { IconArrowRight, IconUsers } from './dashIcons';
import './dashboard.css';

function IconInfo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

const legalStructureLabel = (id: string | null): string =>
  legalStructureCatalog.find((l) => l.id === id)?.label ?? '—';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ready'; company: Company; members: CompanyMember[] };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? parts[parts.length - 1]![0] ?? '' : '';
  return (first + last).toUpperCase();
}

export function ConfiguracoesPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const companies = await companyApi.listMyCompanies();
        if (!active) return;
        if (companies.length === 0) return setState({ status: 'empty' });
        const company = companies[0]!;
        const members = await companyApi.listMembers(company.id);
        if (!active) return;
        setState({ status: 'ready', company, members });
      } catch (err) {
        if (active) setState({ status: 'error', message: messageForError(err) });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (state.status === 'loading') return <p className="dash-muted">carregando configurações…</p>;
  if (state.status === 'error') return <p className="dash-muted">{state.message}</p>;
  if (state.status === 'empty') return <p className="dash-muted">Crie sua empresa primeiro.</p>;

  const { company, members } = state;
  const partners = members.filter((m) => m.role === 'partner');
  const allocated = members.reduce((sum, m) => sum + (m.equityPercent ?? 0), 0);

  const checklist = [
    { label: 'Nome definitivo', done: !company.isNameTemporary, step: 'basic' },
    { label: 'Descrição da empresa', done: !!company.description, step: 'basic' },
    { label: 'Segmento', done: !!company.industry, step: 'basic' },
    { label: 'País e moeda', done: !!company.countryCode && !!company.currencyCode, step: 'location' },
    { label: 'Estágio do negócio', done: !!company.businessStage, step: 'stage' },
    { label: 'Sócios cadastrados', done: partners.length > 0, step: 'members' },
    { label: 'Participação em 100%', done: Math.round(allocated) === 100, step: 'members' },
  ];
  const doneCount = checklist.filter((i) => i.done).length;
  const configPct = Math.round((doneCount / checklist.length) * 100);

  const handleSaved = (updated: Company) =>
    setState({ status: 'ready', company: updated, members });

  return (
    <div className="dash">
      <div>
        <h1 className="dash-page__title">Dados da empresa</h1>
        <p className="dash-page__subtitle">
          Quanto mais o Plim souber da empresa, melhor ele orienta os próximos passos. Preencha o que
          já tiver — o resto pode ficar para depois.
        </p>
      </div>

      <LogoPanel company={company} onSaved={handleSaved} />

      <CompanyDataPanel company={company} onSaved={handleSaved} />

      <ContadoresPanel companyId={company.id} />

      <MembersPanel members={members} allocated={allocated} onManage={() => navigate('/socios')} />

      <section className="dash-panel">
        <div className="dash-panel__head">
          <h2>Configuração da empresa</h2>
          <span className="dash-field__label">
            {doneCount} de {checklist.length} · {configPct}%
          </span>
        </div>
        <div className="dash-hero__bar" style={{ background: 'var(--color-bg-elevated)', marginBottom: 16 }}>
          <div
            className={'dash-hero__bar-fill' + (configPct === 100 ? ' is-full' : '')}
            style={{
              width: `${configPct}%`,
              background: configPct === 100 ? 'var(--color-status-positive)' : 'var(--color-brand-primary)',
            }}
          />
        </div>
        <div className="dash-pending">
          {checklist.map((item) => (
            <div className="dash-pending__item" key={item.label}>
              <span
                className="dash-pending__prio"
                style={{ background: item.done ? 'var(--color-status-positive)' : 'var(--color-border-dark)' }}
              />
              <div className="dash-pending__body">
                <span className="dash-pending__title">{item.label}</span>
                <span className="dash-pending__desc">{item.done ? 'Concluído' : 'Pendente'}</span>
              </div>
              {!item.done && item.step === 'members' && (
                <button
                  className="dash-pending__cta"
                  onClick={() => navigate(`/onboarding?step=${item.step}`)}
                >
                  Completar <IconArrowRight />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ── grupo de campos (leitura) com divisória e título ── */
function ReadGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="dash-group">
      <div className="dash-group__title">{title}</div>
      <div className="dash-fields">{children}</div>
    </div>
  );
}
function ReadField({ label, value, emptyHint }: { label: string; value: string; emptyHint?: string }) {
  const isEmpty = !value || value === '—';
  return (
    <div className="dash-field">
      <span className="dash-field__label">{label}</span>
      {isEmpty && emptyHint ? (
        <span className="dash-field__value dash-field__value--empty">{emptyHint}</span>
      ) : (
        <span className="dash-field__value">{value}</span>
      )}
    </div>
  );
}

/** Contadores parceiros indicados pelo Plim + pedido de indicação (lead real). */
function ContadoresPanel({ companyId }: { companyId: string }) {
  const [requested, setRequested] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  // Se já existe pedido em aberto, mostra a confirmação direto (persistente).
  useEffect(() => {
    let active = true;
    apiFetch<{ category: string }[]>(`/companies/${companyId}/partner-leads`)
      .then((leads) => {
        if (active && leads.some((l) => l.category === 'accounting')) setRequested(true);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [companyId]);

  async function requestLead() {
    setSending(true);
    setError('');
    try {
      await apiFetch(`/companies/${companyId}/partner-leads`, {
        method: 'POST',
        body: JSON.stringify({ category: 'accounting' }),
      });
      setRequested(true);
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="dash-panel">
      <div className="dash-panel__head">
        <h2>Contadores indicados</h2>
      </div>
      <p className="dash-contador__intro">
        O Plim conecta você a contadores parceiros que ajudam a escolher o tipo de empresa, abrir o
        CNPJ e manter tudo em dia. Estamos reunindo os primeiros parceiros.
      </p>
      {error && <div className="form-error" style={{ marginBottom: 10 }}>{error}</div>}
      {requested ? (
        <div className="dash-contador__ok">
          Recebemos seu interesse. Assim que tivermos um contador parceiro, entramos em contato.
        </div>
      ) : (
        <button className="dash-contador__cta" onClick={requestLead} disabled={sending}>
          {sending ? 'Enviando…' : 'Quero indicação de um contador'}
        </button>
      )}
    </section>
  );
}

/** Painel dos dados da empresa: leitura em blocos → Editar → edição inline → salva. */
function CompanyDataPanel({ company, onSaved }: { company: Company; onSaved: (c: Company) => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [infoOpen, setInfoOpen] = useState(false);
  const [guides, setGuides] = useState<GuideContent[] | null>(null);

  // Conteúdo configurável (banco) — carrega quando o painel de ajuda abre.
  useEffect(() => {
    if (!infoOpen || guides) return;
    apiFetch<GuideContent[]>('/guides/legal_structure')
      .then(setGuides)
      .catch(() => setGuides([]));
  }, [infoOpen, guides]);

  const [legalStructure, setLegalStructure] = useState<string>(company.legalStructure ?? '');
  const [name, setName] = useState(company.name);
  const [description, setDescription] = useState(company.description ?? '');
  const [businessStage, setBusinessStage] = useState<string>(company.businessStage ?? '');
  const [countryCode, setCountryCode] = useState<string>(company.countryCode ?? '');
  const [city, setCity] = useState(company.city ?? '');
  const [currencyCode, setCurrencyCode] = useState<string>(company.currencyCode ?? '');
  const [cnpj, setCnpj] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [cep, setCep] = useState('');
  const [street, setStreet] = useState('');
  const [streetNumber, setStreetNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');

  const stage = businessStageCatalog.find((s) => s.id === company.businessStage);
  const country = countryCatalog.find((c) => c.code === company.countryCode);
  const currency = currencyCatalog.find((c) => c.code === company.currencyCode);

  function startEdit() {
    setLegalStructure(company.legalStructure ?? '');
    setName(company.name);
    setDescription(company.description ?? '');
    setBusinessStage(company.businessStage ?? '');
    setCountryCode(company.countryCode ?? '');
    setCity(company.city ?? '');
    setCurrencyCode(company.currencyCode ?? '');
    setCnpj(company.registrationNumber ? formatCnpj(company.registrationNumber) : '');
    setPhone(company.phone ? formatPhone(company.phone) : '');
    setEmail(company.email ?? '');
    setCep(company.cep ? formatCep(company.cep) : '');
    setStreet(company.street ?? '');
    setStreetNumber(company.streetNumber ?? '');
    setComplement(company.complement ?? '');
    setNeighborhood(company.neighborhood ?? '');
    setFormError('');
    setEditing(true);
  }

  async function save() {
    if (name.trim().length < 2) {
      setFormError('O nome precisa ter ao menos 2 caracteres.');
      return;
    }
    const cnpjDigits = onlyDigits(cnpj);
    if (cnpjDigits && !isValidCnpj(cnpjDigits)) {
      setFormError('CNPJ inválido — confira os números.');
      return;
    }
    if (email.trim() && !EMAIL_RE.test(email.trim())) {
      setFormError('E-mail inválido — confira o endereço.');
      return;
    }
    setFormError('');
    setSaving(true);
    try {
      const patch: UpdateCompanyInput = {
        name: name.trim(),
        legalStructure: (legalStructure || null) as UpdateCompanyInput['legalStructure'],
        legalStructureStatus: legalStructure && legalStructure !== 'unknown' ? 'defined' : legalStructure === 'unknown' ? 'undecided' : null,
        description: description.trim() ? description.trim() : null,
        businessStage: (businessStage || null) as UpdateCompanyInput['businessStage'],
        countryCode: countryCode || null,
        city: city.trim() ? city.trim() : null,
        currencyCode: currencyCode || null,
        registrationNumber: cnpjDigits ? cnpjDigits : null,
        registrationCountry: cnpjDigits ? 'BR' : null,
        phone: onlyDigits(phone) ? onlyDigits(phone) : null,
        email: email.trim() ? email.trim() : null,
        cep: onlyDigits(cep) ? onlyDigits(cep) : null,
        street: street.trim() ? street.trim() : null,
        streetNumber: streetNumber.trim() ? streetNumber.trim() : null,
        complement: complement.trim() ? complement.trim() : null,
        neighborhood: neighborhood.trim() ? neighborhood.trim() : null,
      };
      const updated = await companyApi.updateCompany(company.id, patch);
      onSaved(updated);
      setEditing(false);
    } catch (err) {
      setFormError(messageForError(err));
    } finally {
      setSaving(false);
    }
  }

  const infoDrawer = (
    <Drawer
      open={infoOpen}
      title="Tipos de empresa"
      subtitle="Orientação inicial em linguagem simples — confirme com um contador."
      onClose={() => setInfoOpen(false)}
    >
      <div className="lt-guide">
        {guides === null && <p className="lt-disclaimer">carregando orientação…</p>}
        {guides
          ?.filter((g) => g.key !== 'disclaimer')
          .map((g) => (
            <article className="lt-card" key={g.key}>
              <h3>{g.title}</h3>
              {g.short && <p className="lt-card__short">{g.short}</p>}
              {g.body.split('\n').map((line, i) => (
                <p className="lt-row__v" key={i} style={{ padding: '3px 0' }}>
                  {line}
                </p>
              ))}
            </article>
          ))}
        <div className="lt-video">Vídeos explicativos chegando em breve.</div>
        <p className="lt-disclaimer">
          {guides?.find((g) => g.key === 'disclaimer')?.body ??
            'Este conteúdo é uma orientação inicial e não substitui um contador.'}
        </p>
      </div>
    </Drawer>
  );

  if (!editing) {
    return (
      <section className="dash-panel">
        {infoDrawer}
        <div className="dash-panel__head">
          <h2>Dados da empresa</h2>
          <button className="dash-panel__action" onClick={startEdit}>
            Editar <IconArrowRight />
          </button>
        </div>

        <ReadGroup title="Identificação">
          <ReadField label="Nome" value={company.name} />
          <ReadField
            label="CNPJ"
            value={company.registrationNumber ? formatCnpj(company.registrationNumber) : '—'}
            emptyHint="Ainda sem CNPJ — normal nesse estágio. Registre aqui quando abrir a empresa."
          />
          <div className="dash-field">
            <span className="dash-field__label">
              Natureza jurídica
              <button
                type="button"
                className="dash-infobtn"
                onClick={() => setInfoOpen(true)}
                aria-label="Entenda os tipos de empresa"
              >
                <IconInfo />
              </button>
            </span>
            {company.legalStructure ? (
              <span className="dash-field__value">{legalStructureLabel(company.legalStructure)}</span>
            ) : (
              <span className="dash-field__value dash-field__value--empty">
                Ainda não definida — toque no ⓘ para entender os tipos (MEI, LTDA…).
              </span>
            )}
          </div>
          <ReadField label="Descrição" value={company.description || '—'} />
          <ReadField label="Estágio" value={stage?.label ?? '—'} />
          <ReadField label="Moeda" value={currency ? `${currency.code} (${currency.symbol})` : '—'} />
        </ReadGroup>

        <ReadGroup title="Contato">
          <ReadField
            label="Telefone"
            value={company.phone ? formatPhone(company.phone) : '—'}
            emptyHint="Adicione um telefone — facilita para clientes, bancos e fornecedores."
          />
          <ReadField
            label="E-mail"
            value={company.email || '—'}
            emptyHint="Um e-mail da empresa separa o contato pessoal do profissional."
          />
        </ReadGroup>

        <ReadGroup title="Endereço">
          <ReadField label="CEP" value={company.cep ? formatCep(company.cep) : '—'} />
          <ReadField label="País" value={country?.label ?? '—'} />
          <ReadField label="Cidade" value={company.city || '—'} />
          <ReadField label="Bairro" value={company.neighborhood || '—'} />
          <ReadField label="Logradouro" value={company.street || '—'} />
          <ReadField label="Número" value={company.streetNumber || '—'} />
          <ReadField label="Complemento" value={company.complement || '—'} />
        </ReadGroup>
      </section>
    );
  }

  return (
    <section className="dash-panel">
      {infoDrawer}
      <div className="dash-panel__head">
        <h2>Editar dados da empresa</h2>
      </div>
      {formError && (
        <div className="form-error" style={{ marginBottom: 16 }}>
          {formError}
        </div>
      )}

      <div className="dash-editgroup">
        <div className="dash-group__title">Identificação</div>
        <div className="dash-editform">
          <div className="dash-fields">
            <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} />
            <Input
              label="CNPJ"
              placeholder="00.000.000/0000-00"
              inputMode="numeric"
              value={cnpj}
              onChange={(e) => setCnpj(formatCnpj(e.target.value))}
            />
          </div>
          <Select
            label="Natureza jurídica"
            labelAccessory={
              <button
                type="button"
                className="dash-infobtn"
                onClick={() => setInfoOpen(true)}
                aria-label="Entenda os tipos de empresa"
              >
                <IconInfo /> entenda os tipos
              </button>
            }
            value={legalStructure}
            onChange={setLegalStructure}
            placeholder="Selecione (ou 'ainda não sei')"
            options={legalStructureCatalog.map((l) => ({ value: l.id, label: l.label }))}
          />
          <Input
            label="Descrição"
            placeholder="Em uma frase, o que a empresa faz"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="dash-fields">
            <Select
              label="Estágio"
              value={businessStage}
              onChange={setBusinessStage}
              placeholder="Selecione"
              options={businessStageCatalog.map((s) => ({ value: s.id, label: s.label }))}
            />
            <Select
              label="Moeda"
              value={currencyCode}
              onChange={setCurrencyCode}
              placeholder="Selecione"
              options={currencyCatalog.map((c) => ({ value: c.code, label: `${c.code} (${c.symbol})` }))}
            />
          </div>
        </div>
      </div>

      <div className="dash-editgroup">
        <div className="dash-group__title">Contato</div>
        <div className="dash-fields">
          <Input
            label="Telefone"
            placeholder="(00) 00000-0000"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
          />
          <Input
            label="E-mail"
            placeholder="contato@empresa.com"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>

      <div className="dash-editgroup">
        <div className="dash-group__title">Endereço</div>
        <div className="dash-fields">
          <Input
            label="CEP"
            placeholder="00000-000"
            inputMode="numeric"
            value={cep}
            onChange={(e) => setCep(formatCep(e.target.value))}
          />
          <Select
            label="País"
            value={countryCode}
            onChange={setCountryCode}
            placeholder="Selecione"
            options={countryCatalog.map((c) => ({ value: c.code, label: c.label }))}
          />
          <Input label="Cidade" value={city} onChange={(e) => setCity(e.target.value)} />
          <Input label="Bairro" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
          <Input
            label="Logradouro"
            placeholder="Rua, avenida…"
            value={street}
            onChange={(e) => setStreet(e.target.value)}
          />
          <Input label="Número" value={streetNumber} onChange={(e) => setStreetNumber(e.target.value)} />
          <Input
            label="Complemento"
            placeholder="Sala, andar…"
            value={complement}
            onChange={(e) => setComplement(e.target.value)}
          />
        </div>
      </div>

      <div className="dash-editactions">
        <Button onClick={save} disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar alterações'}
        </Button>
        <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </section>
  );
}

/** Painel dos sócios cadastrados (leitura), com atalho para gerenciar. */
function MembersPanel({
  members,
  allocated,
  onManage,
}: {
  members: CompanyMember[];
  allocated: number;
  onManage: () => void;
}) {
  return (
    <section className="dash-panel">
      <div className="dash-panel__head">
        <h2>Sócios</h2>
        <button className="dash-panel__action" onClick={onManage}>
          Gerenciar <IconArrowRight />
        </button>
      </div>
      {members.length === 0 ? (
        <div className="dash-emptyrow">
          <p>Nenhum sócio cadastrado ainda.</p>
        </div>
      ) : (
        <>
          <div className="dash-members">
            {members.map((m) => (
              <div className="dash-member" key={m.id}>
                <span className="dash-member__avatar">{initials(m.fullName)}</span>
                <div className="dash-member__info">
                  <span className="dash-member__name">{m.fullName}</span>
                  <span className="dash-member__meta">
                    {m.role === 'account_owner' ? 'Dono da conta' : 'Sócio'}
                    {m.functionalRole ? ` · ${m.functionalRole}` : ''}
                  </span>
                </div>
                <span className="dash-member__equity">
                  {m.equityPercent != null ? `${m.equityPercent}%` : '—'}
                </span>
              </div>
            ))}
          </div>
          <div className="dash-member__foot">
            <IconUsers />
            <span>
              {members.length} {members.length === 1 ? 'sócio' : 'sócios'} · {allocated}% da participação
              definida
            </span>
          </div>
        </>
      )}
    </section>
  );
}

/* ── Logo da empresa (identidade visual) ─────────────────────────────── */

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const LOGO_MAX_BYTES = 5 * 1024 * 1024;

function LogoPanel({ company, onSaved }: { company: Company; onSaved: (c: Company) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError('');
    if (!LOGO_TYPES.includes(file.type)) {
      setError('Formato não suportado. Use PNG, JPG ou WEBP.');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setError('A imagem passa de 5MB. Escolha uma versão menor.');
      return;
    }
    setBusy(true);
    try {
      const dataBase64 = await fileToBase64(file);
      const updated = await logoApi.upload(company.id, dataBase64, file.type);
      onSaved(updated);
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setError('');
    setBusy(true);
    try {
      const updated = await logoApi.remove(company.id);
      onSaved(updated);
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    void handleFile(e.dataTransfer.files?.[0]);
  }

  return (
    <section className="dash-panel">
      <div className="dash-panel__head">
        <h2>Logo da empresa</h2>
      </div>
      {error && <div className="form-error">{error}</div>}

      <label
        className={
          'logo-drop' + (dragging ? ' is-dragging' : '') + (busy ? ' is-busy' : '')
        }
        onDragOver={(e) => {
          e.preventDefault();
          if (!dragging) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          type="file"
          accept={LOGO_TYPES.join(',')}
          disabled={busy}
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {company.logoUrl ? (
          <img className="logo-drop__img" src={company.logoUrl} alt={`Logo de ${company.name}`} />
        ) : (
          <div className="logo-drop__placeholder" aria-hidden="true">
            {initials(company.name)}
          </div>
        )}
        <div className="logo-drop__body">
          <span className="logo-drop__cta">
            {busy
              ? 'Enviando...'
              : dragging
                ? 'Solte a imagem aqui'
                : company.logoUrl
                  ? 'Arraste uma nova imagem ou clique para trocar'
                  : 'Arraste uma imagem ou clique para escolher'}
          </span>
          <span className="logo-drop__hint">
            Tamanho ideal: quadrada, no mínimo 256x256px (512x512 fica ótima). PNG com fundo
            transparente é o que fica melhor. JPG ou WEBP também servem, até 5MB.
          </span>
        </div>
      </label>

      {company.logoUrl && !busy && (
        <button type="button" className="logo-drop__remove" onClick={() => void handleRemove()}>
          Remover logo
        </button>
      )}
    </section>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(',') + 1)); // tira o prefixo data:...;base64,
    };
    reader.onerror = () => reject(new Error('Nao consegui ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}
