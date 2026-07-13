import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  businessModelTypeCatalog,
  businessStageCatalog,
  countryCatalog,
  currencyCatalog,
  functionalRoleCatalog,
  hasFormalRegistrationCatalog,
  industryCatalog,
  legalStructureCatalog,
  onlyDigits,
  isValidCnpj,
  formatCnpj,
  type BusinessModelType,
  type BusinessStage,
  type Company,
  type CompanyMember,
  type HasFormalRegistration,
  type LegalStructure,
  type OnboardingStep,
  type UpdateCompanyInput,
} from '@plim/shared';
import { useAuth } from '../../auth/AuthContext';
import { Logo } from '../../components/Logo';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { companyApi, messageForError } from '../../company/companyApi';
import { rememberActiveCompany } from '../../company/ActiveCompanyContext';
import './onboarding.css';

type Step = 'welcome' | 'resume' | OnboardingStep;
const STEP_ORDER: OnboardingStep[] = [
  'basic',
  'business_type',
  'location',
  'stage',
  'members',
  'formalization',
  'legal_structure',
  'review',
];

export function OnboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [booting, setBooting] = useState(true);
  const [step, setStep] = useState<Step>('welcome');
  const [company, setCompany] = useState<Company | null>(null);
  const [members, setMembers] = useState<CompanyMember[]>([]);
  // Modo edição: chegou via /onboarding?step=... para mexer numa empresa já criada.
  const [editing, setEditing] = useState(false);
  const [skipping, setSkipping] = useState(false);

  const owner = { fullName: user?.fullName ?? '', email: user?.email ?? '' };
  const firstName = owner.fullName.split(' ')[0] || 'por aqui';

  // Retoma/edita: ?step= leva direto à etapa da empresa existente; senão, retoma
  // o onboarding em andamento; senão, começa do welcome.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // ?nova=1: criar OUTRA empresa. Começa do zero (welcome), sem retomar a
        // empresa existente nem carregá-la.
        if (searchParams.get('nova') === '1') {
          if (active) setBooting(false);
          return;
        }
        const requested = searchParams.get('step') as OnboardingStep | null;
        const targetStep = requested && STEP_ORDER.includes(requested) ? requested : null;
        const companies = await companyApi.listMyCompanies();
        const inProgress = companies.find((c) => c.onboardingStatus === 'in_progress');
        const target = targetStep ? companies[0] : inProgress;
        if (target) {
          const mem = await companyApi.listMembers(target.id);
          if (!active) return;
          setCompany(target);
          setMembers(mem);
          if (targetStep) {
            setStep(targetStep);
            setEditing(true);
          } else {
            // Onboarding em andamento: pergunta se quer continuar de onde parou (PRD §3).
            setStep('resume');
          }
        }
      } catch {
        /* sem retomada: começa do welcome */
      } finally {
        if (active) setBooting(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [searchParams]);

  async function goToDashboard() {
    // A empresa que o usuário acabou de mexer vira a ativa (abre nela no painel).
    if (company) await rememberActiveCompany(company.id);
    navigate('/dashboard');
  }

  /**
   * Pular o onboarding. Se ainda não existe empresa, cria um espaço provisório
   * (nome editável depois) para o usuário entrar no app, em vez de mandá-lo a um
   * painel que não funciona sem empresa. Se já existe, vai direto para o painel.
   */
  async function skipOnboarding() {
    if (skipping) return;
    setSkipping(true);
    try {
      let id = company?.id ?? null;
      if (!id) {
        const provisionalName =
          firstName && firstName !== 'por aqui' ? `Empresa de ${firstName}` : 'Minha empresa';
        const { company: created } = await companyApi.createCompany(
          { name: provisionalName, isNameTemporary: true },
          owner,
        );
        id = created.id;
      }
      await rememberActiveCompany(id);
      navigate('/dashboard');
    } catch {
      setSkipping(false); // não trava: deixa o usuário tentar de novo
    }
  }

  // ── orquestração de cada etapa (persiste no back, avança a etapa) ──
  // No modo edição, ao salvar volta direto pro painel (não re-anda o fluxo).
  async function submitBasic(fields: BasicFields) {
    if (company) {
      const updated = await companyApi.updateCompany(company.id, {
        ...fields,
        ...(editing ? {} : { onboardingStep: 'business_type' }),
      });
      setCompany(updated);
    } else {
      const { company: created, ownerMember } = await companyApi.createCompany(fields, owner);
      const updated = await companyApi.updateCompany(created.id, { onboardingStep: 'business_type' });
      setCompany(updated);
      setMembers([ownerMember]);
    }
    if (editing) return goToDashboard();
    setStep('business_type');
  }

  async function submitBusinessType(businessModelType: BusinessModelType | null) {
    if (!company) return;
    const updated = await companyApi.updateCompany(company.id, {
      businessModelType,
      ...(editing ? {} : { onboardingStep: 'location' }),
    });
    setCompany(updated);
    if (editing) return goToDashboard();
    setStep('location');
  }

  async function submitLocation(fields: LocationFields) {
    if (!company) return;
    const updated = await companyApi.updateCompany(company.id, {
      ...fields,
      ...(editing ? {} : { onboardingStep: 'stage' }),
    });
    setCompany(updated);
    if (editing) return goToDashboard();
    setStep('stage');
  }

  async function submitStage(businessStage: BusinessStage) {
    if (!company) return;
    const updated = await companyApi.updateCompany(company.id, {
      businessStage,
      ...(editing ? {} : { onboardingStep: 'members' }),
    });
    setCompany(updated);
    if (editing) return goToDashboard();
    setStep('members');
  }

  // Sócios → formalização (PRD Tela 8).
  async function goToFormalization() {
    if (!company) return;
    const updated = await companyApi.updateCompany(company.id, { onboardingStep: 'formalization' });
    setCompany(updated);
    setStep('formalization');
  }

  async function submitFormalization(fields: FormalizationFields) {
    if (!company) return;
    const updated = await companyApi.updateCompany(company.id, {
      ...fields,
      ...(editing ? {} : { onboardingStep: 'legal_structure' }),
    });
    setCompany(updated);
    if (editing) return goToDashboard();
    setStep('legal_structure');
  }

  async function submitLegalStructure(fields: LegalStructureFields) {
    if (!company) return;
    const updated = await companyApi.updateCompany(company.id, {
      ...fields,
      ...(editing ? {} : { onboardingStep: 'review' }),
    });
    setCompany(updated);
    if (editing) return goToDashboard();
    setStep('review');
  }

  async function goToReview() {
    if (!company) return;
    const updated = await companyApi.updateCompany(company.id, { onboardingStep: 'review' });
    setCompany(updated);
    setStep('review');
  }

  async function finish() {
    if (!company) return;
    await companyApi.completeOnboarding(company.id);
    goToDashboard();
  }

  return (
    <main className="ob-page">
      <span className="ob-brand" aria-hidden="true">
        <Logo height={30} />
      </span>

      <section className="ob-card" aria-label="Configuração inicial">
        {step !== 'welcome' && step !== 'resume' && <StepDots current={step} />}

        {booting ? (
          <p className="dash-muted">carregando…</p>
        ) : step === 'welcome' ? (
          <WelcomeStep
            firstName={firstName}
            onStart={() => setStep('basic')}
            onSkip={skipOnboarding}
            onBack={goToDashboard}
            showBack={!!company}
            skipping={skipping}
          />
        ) : step === 'resume' ? (
          <ResumePrompt
            firstName={firstName}
            onContinue={() => setStep(company?.onboardingStep ?? 'basic')}
            onHome={goToDashboard}
          />
        ) : step === 'basic' ? (
          <BasicStep company={company} onSubmit={submitBasic} onSkip={skipOnboarding} skipping={skipping} />
        ) : step === 'business_type' ? (
          <BusinessTypeStep
            company={company}
            onSubmit={submitBusinessType}
            onBack={editing ? goToDashboard : () => setStep('basic')}
          />
        ) : step === 'location' ? (
          <LocationStep
            company={company}
            onSubmit={submitLocation}
            onBack={editing ? goToDashboard : () => setStep('business_type')}
          />
        ) : step === 'stage' ? (
          <StageStep
            company={company}
            onSubmit={submitStage}
            onBack={editing ? goToDashboard : () => setStep('location')}
          />
        ) : step === 'members' ? (
          <MembersStep
            companyId={company!.id}
            members={members}
            editing={editing}
            onMembersChange={setMembers}
            onContinue={editing ? goToDashboard : goToFormalization}
            onBack={editing ? goToDashboard : () => setStep('stage')}
          />
        ) : step === 'formalization' ? (
          <FormalizationStep
            company={company}
            onSubmit={submitFormalization}
            onBack={editing ? goToDashboard : () => setStep('members')}
          />
        ) : step === 'legal_structure' ? (
          <LegalStructureStep
            company={company}
            onSubmit={submitLegalStructure}
            onBack={editing ? goToDashboard : () => setStep('formalization')}
          />
        ) : (
          <ReviewStep
            company={company!}
            members={members}
            onFinish={finish}
            onEdit={() => setStep('basic')}
          />
        )}
      </section>
    </main>
  );
}

/* ── Retomada (PRD §3): "Quer continuar de onde parou?" ── */
function ResumePrompt({
  firstName,
  onContinue,
  onHome,
}: {
  firstName: string;
  onContinue: () => void;
  onHome: () => void;
}) {
  return (
    <>
      <div className="ob-head">
        <h1>Quer continuar de onde parou, {firstName}?</h1>
        <p>
          Você já começou a organizar sua empresa. Podemos seguir daqui, ou você vai para a Home e
          termina depois, o Plim guarda seu progresso.
        </p>
      </div>
      <div className="ob-actions">
        <Button block onClick={onContinue}>
          Continuar cadastro
        </Button>
        <button type="button" className="ob-skip" onClick={onHome}>
          Ir para a Home
        </button>
      </div>
    </>
  );
}

/* ── Tela 3: tipo de negócio (business_model_type) ── */
function BusinessTypeStep({
  company,
  onSubmit,
  onBack,
}: {
  company: Company | null;
  onSubmit: (type: BusinessModelType | null) => Promise<void>;
  onBack: () => void;
}) {
  const [type, setType] = useState<BusinessModelType | ''>(company?.businessModelType ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    setError('');
    setSaving(true);
    try {
      await onSubmit(type || null);
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="ob-head">
        <h1>Que tipo de negócio você está criando?</h1>
        <p>Isso ajuda o Plim a adaptar as recomendações e os próximos passos. Dá para mudar depois.</p>
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="ob-cards">
        {businessModelTypeCatalog.map((t) => (
          <button
            type="button"
            key={t.id}
            className={'ob-card-option' + (type === t.id ? ' ob-card-option--active' : '')}
            onClick={() => setType(t.id)}
          >
            <span className="ob-card-option__title">{t.label}</span>
            <span className="ob-card-option__desc">{t.description}</span>
          </button>
        ))}
      </div>
      <div className="ob-actions">
        <Button block onClick={handleContinue} disabled={saving}>
          {saving ? 'Salvando…' : 'Continuar'}
        </Button>
        <button type="button" className="ob-skip" onClick={onBack} disabled={saving}>
          ← Voltar
        </button>
      </div>
    </>
  );
}

/* ── Tela 8: formalização (has_formal_registration + CNPJ condicional) ── */
type FormalizationFields = Pick<
  UpdateCompanyInput,
  'hasFormalRegistration' | 'registrationNumber' | 'registrationCountry'
>;

function FormalizationStep({
  company,
  onSubmit,
  onBack,
}: {
  company: Company | null;
  onSubmit: (fields: FormalizationFields) => Promise<void>;
  onBack: () => void;
}) {
  const [choice, setChoice] = useState<HasFormalRegistration | ''>(
    company?.hasFormalRegistration ?? '',
  );
  const [cnpj, setCnpj] = useState(
    company?.registrationNumber ? formatCnpj(company.registrationNumber) : '',
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    setError('');
    const digits = onlyDigits(cnpj);
    if (choice === 'yes' && digits && !isValidCnpj(digits)) {
      setError('CNPJ inválido, confira os números (ou deixe em branco para preencher depois).');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        hasFormalRegistration: choice || null,
        registrationNumber: choice === 'yes' && digits ? digits : null,
        registrationCountry: choice === 'yes' ? 'BR' : null,
      });
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="ob-head">
        <h1>Sua empresa já está formalizada?</h1>
        <p>
          Isso ajuda o Plim a entender se você já tem registro ou ainda precisa organizar essa etapa.
          Sem pressa, pode escolher depois.
        </p>
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="ob-cards">
        {hasFormalRegistrationCatalog.map((o) => (
          <button
            type="button"
            key={o.id}
            className={'ob-card-option' + (choice === o.id ? ' ob-card-option--active' : '')}
            onClick={() => setChoice(o.id)}
          >
            <span className="ob-card-option__title">{o.label}</span>
            <span className="ob-card-option__desc">{o.description}</span>
          </button>
        ))}
      </div>
      {choice === 'yes' && (
        <div style={{ marginTop: 12 }}>
          <Input
            label="CNPJ (pode preencher depois)"
            placeholder="00.000.000/0000-00"
            inputMode="numeric"
            value={cnpj}
            onChange={(e) => setCnpj(formatCnpj(e.target.value))}
          />
        </div>
      )}
      <div className="ob-actions">
        <Button block onClick={handleContinue} disabled={saving}>
          {saving ? 'Salvando…' : 'Continuar'}
        </Button>
        <button type="button" className="ob-skip" onClick={onBack} disabled={saving}>
          ← Voltar
        </button>
      </div>
    </>
  );
}

/* ── Tela 9: natureza jurídica (opcional; orientação, não aconselhamento) ── */
type LegalStructureFields = Pick<UpdateCompanyInput, 'legalStructure' | 'legalStructureStatus'>;

function LegalStructureStep({
  company,
  onSubmit,
  onBack,
}: {
  company: Company | null;
  onSubmit: (fields: LegalStructureFields) => Promise<void>;
  onBack: () => void;
}) {
  const initial =
    company?.legalStructureStatus === 'needs_accountant'
      ? 'needs_accountant'
      : company?.legalStructure ?? '';
  const [choice, setChoice] = useState<LegalStructure | 'needs_accountant' | ''>(initial);
  // Se a pessoa já indicou ter CNPJ, a empresa JÁ existe: perguntamos a
  // natureza jurídica atual, não "o que pretende abrir".
  const alreadyRegistered = company?.hasFormalRegistration === 'yes';
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    setError('');
    setSaving(true);
    try {
      if (choice === 'needs_accountant') {
        await onSubmit({ legalStructure: null, legalStructureStatus: 'needs_accountant' });
      } else if (!choice || choice === 'unknown') {
        await onSubmit({
          legalStructure: (choice || null) as LegalStructure | null,
          legalStructureStatus: choice ? 'undecided' : null,
        });
      } else {
        await onSubmit({ legalStructure: choice, legalStructureStatus: 'defined' });
      }
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="ob-head">
        <h1>
          {alreadyRegistered
            ? 'Qual a natureza jurídica da sua empresa?'
            : 'Você já sabe qual tipo de empresa pretende abrir?'}
        </h1>
        <p>
          {alreadyRegistered
            ? 'Você indicou que já tem CNPJ. Selecione o tipo de registro atual da sua empresa, na dúvida, confirme com seu contador.'
            : 'Se ainda não sabe, tudo bem, o Plim registra essa pendência e pode indicar um contador parceiro para te ajudar a decidir.'}
        </p>
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="ob-chips">
        {legalStructureCatalog.map((l) => (
          <button
            type="button"
            key={l.id}
            className={'ob-chip' + (choice === l.id ? ' ob-chip--active' : '')}
            onClick={() => setChoice((prev) => (prev === l.id ? '' : l.id))}
          >
            {l.label}
          </button>
        ))}
        <button
          type="button"
          className={'ob-chip' + (choice === 'needs_accountant' ? ' ob-chip--active' : '')}
          onClick={() =>
            setChoice((prev) => (prev === 'needs_accountant' ? '' : 'needs_accountant'))
          }
        >
          {alreadyRegistered ? 'Preciso confirmar com meu contador' : 'Preciso falar com um contador'}
        </button>
      </div>
      <p className="ob-disclaimer">
        {alreadyRegistered
          ? 'Essa informação ajuda o Plim a organizar sua empresa. Na dúvida sobre o enquadramento atual, confirme com seu contador.'
          : 'Essa informação ajuda você a se organizar. Para decidir o melhor tipo de empresa, confirme com um contador, o Plim pode indicar um parceiro.'}
      </p>
      <div className="ob-actions">
        <Button block onClick={handleContinue} disabled={saving}>
          {saving ? 'Salvando…' : 'Continuar'}
        </Button>
        <button type="button" className="ob-skip" onClick={onBack} disabled={saving}>
          ← Voltar
        </button>
      </div>
    </>
  );
}

function StepDots({ current }: { current: OnboardingStep }) {
  const idx = STEP_ORDER.indexOf(current);
  return (
    <div className="ob-steps" aria-hidden="true">
      {STEP_ORDER.map((s, i) => (
        <span
          key={s}
          className={
            'ob-steps__dot' +
            (i < idx ? ' ob-steps__dot--done' : i === idx ? ' ob-steps__dot--active' : '')
          }
        />
      ))}
    </div>
  );
}

function WelcomeStep({
  firstName,
  onStart,
  onSkip,
  onBack,
  showBack,
  skipping,
}: {
  firstName: string;
  onStart: () => void;
  onSkip: () => void;
  onBack: () => void;
  showBack: boolean;
  skipping: boolean;
}) {
  return (
    <>
      {showBack && (
        <button type="button" className="ob-back" onClick={onBack}>
          <span aria-hidden="true">←</span> Voltar
        </button>
      )}
      <div className="ob-head">
        <h1>
          Bem-vindo ao plim, {firstName}
          <span className="ob-accent">.</span>
        </h1>
        <p>
          Vamos criar o espaço da sua empresa. Você pode começar com o básico e completar depois,
          nada é obrigatório agora.
        </p>
      </div>
      <div className="ob-nudge">
        <span className="ob-nudge__icon" aria-hidden="true">
          ✨
        </span>
        <span>Leva uns 2 minutos. Dá pra pular campos e voltar quando quiser.</span>
      </div>
      <div className="ob-actions">
        <Button block onClick={onStart} disabled={skipping}>
          Vamos começar
        </Button>
        <button type="button" className="ob-skip" onClick={onSkip} disabled={skipping}>
          {skipping ? 'Abrindo…' : 'Pular por enquanto'}
        </button>
      </div>
    </>
  );
}

interface BasicFields {
  name: string;
  isNameTemporary: boolean;
  description?: string;
  industry?: string;
  industryOther?: string;
}

function BasicStep({
  company,
  onSubmit,
  onSkip,
  skipping,
}: {
  company: Company | null;
  onSubmit: (fields: BasicFields) => Promise<void>;
  onSkip: () => void;
  skipping: boolean;
}) {
  const [name, setName] = useState(company?.name ?? '');
  const [isNameTemporary, setIsNameTemporary] = useState(company?.isNameTemporary ?? false);
  const [description, setDescription] = useState(company?.description ?? '');
  const [industry, setIndustry] = useState(company?.industry ?? '');
  const [industryOther, setIndustryOther] = useState(company?.industryOther ?? '');
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const isOther = industry === 'outro';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    if (name.trim().length < 2) {
      setError('Dê um nome (pode ser provisório).');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        isNameTemporary,
        description: description.trim() || undefined,
        industry: industry || undefined,
        industryOther: isOther ? industryOther.trim() || undefined : undefined,
      });
    } catch (err) {
      setFormError(messageForError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="ob-head">
        <h1>Qual negócio você está criando?</h1>
        <p>O básico para começar. Você refina depois.</p>
      </div>
      <form className="ob-form" onSubmit={handleSubmit} noValidate>
        {formError && <div className="form-error">{formError}</div>}
        <Input
          label="Nome da empresa ou projeto"
          placeholder="Ex.: Plim, Minha Clínica, Agência Aurora"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={error}
          autoFocus
        />
        <label className="ob-check">
          <input
            type="checkbox"
            checked={isNameTemporary}
            onChange={(e) => setIsNameTemporary(e.target.checked)}
          />
          Este nome ainda é provisório
        </label>
        <div className="field">
          <label className="field__label">Conte brevemente o que sua empresa faz (opcional)</label>
          <textarea
            className="ob-textarea"
            placeholder="Ex.: Uma plataforma para startups organizarem sócios, gastos e decisões."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
          />
        </div>
        <div className="field">
          <label className="field__label">Segmento principal (opcional)</label>
          <div className="ob-chips">
            {industryCatalog.map((s) => (
              <button
                type="button"
                key={s.id}
                className={'ob-chip' + (industry === s.id ? ' ob-chip--active' : '')}
                onClick={() => setIndustry((prev) => (prev === s.id ? '' : s.id))}
              >
                {s.label}
              </button>
            ))}
          </div>
          {isOther && (
            <div style={{ marginTop: 10 }}>
              <Input
                label="Qual segmento?"
                placeholder="Descreva o segmento"
                value={industryOther}
                onChange={(e) => setIndustryOther(e.target.value)}
              />
            </div>
          )}
        </div>
        <div className="ob-actions">
          <Button type="submit" block disabled={saving || skipping}>
            {saving ? 'Salvando…' : 'Continuar'}
          </Button>
          <button type="button" className="ob-skip" onClick={onSkip} disabled={saving || skipping}>
            {skipping ? 'Abrindo…' : 'Pular por agora'}
          </button>
        </div>
      </form>
    </>
  );
}

interface LocationFields {
  countryCode: string;
  region?: string;
  city?: string;
  currencyCode: string;
}

function LocationStep({
  company,
  onSubmit,
  onBack,
}: {
  company: Company | null;
  onSubmit: (fields: LocationFields) => Promise<void>;
  onBack: () => void;
}) {
  const [countryCode, setCountryCode] = useState(company?.countryCode ?? '');
  const [region, setRegion] = useState(company?.region ?? '');
  const [city, setCity] = useState(company?.city ?? '');
  const [currencyCode, setCurrencyCode] = useState(company?.currencyCode ?? '');
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const country = countryCatalog.find((c) => c.code === countryCode);
  const regionLabel = country?.regionLabel ?? 'Estado/Região';

  function handleCountry(code: string) {
    setCountryCode(code);
    const cat = countryCatalog.find((c) => c.code === code);
    if (cat?.currencyCode) setCurrencyCode(cat.currencyCode); // sugere a moeda
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    if (!countryCode) {
      setError('Escolha o país.');
      return;
    }
    if (!currencyCode) {
      setError('Escolha a moeda.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onSubmit({
        countryCode,
        region: region.trim() || undefined,
        city: city.trim() || undefined,
        currencyCode,
      });
    } catch (err) {
      setFormError(messageForError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="ob-head">
        <h1>Onde esse negócio está começando?</h1>
        <p>Define a moeda usada nas finanças mais pra frente.</p>
      </div>
      <form className="ob-form" onSubmit={handleSubmit} noValidate>
        {formError && <div className="form-error">{formError}</div>}
        <Select
          label="País"
          value={countryCode}
          onChange={handleCountry}
          options={countryCatalog.map((c) => ({ value: c.code, label: c.label }))}
          placeholder="Selecione…"
          error={!countryCode ? error : undefined}
        />
        <div className="ob-row">
          <Input
            label={`${regionLabel} (opcional)`}
            placeholder={regionLabel}
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          />
          <Input
            label="Cidade (opcional)"
            placeholder="Cidade"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </div>
        <Select
          label="Moeda principal"
          value={currencyCode}
          onChange={setCurrencyCode}
          options={currencyCatalog.map((c) => ({ value: c.code, label: `${c.label} (${c.symbol})` }))}
          placeholder="Selecione…"
          error={countryCode && !currencyCode ? error : undefined}
        />
        <div className="ob-actions">
          <Button type="submit" block disabled={saving}>
            {saving ? 'Salvando…' : 'Continuar'}
          </Button>
          <button type="button" className="ob-skip" onClick={onBack} disabled={saving}>
            ← Voltar
          </button>
        </div>
      </form>
    </>
  );
}

function StageStep({
  company,
  onSubmit,
  onBack,
}: {
  company: Company | null;
  onSubmit: (stage: BusinessStage) => Promise<void>;
  onBack: () => void;
}) {
  const [stage, setStage] = useState<BusinessStage | ''>(company?.businessStage ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    if (!stage) {
      setError('Escolha o momento atual.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await onSubmit(stage);
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="ob-head">
        <h1>Em qual momento seu negócio está?</h1>
        <p>Vamos usar isso para personalizar suas próximas etapas.</p>
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="ob-cards">
        {businessStageCatalog.map((s) => (
          <button
            type="button"
            key={s.id}
            className={'ob-card-option' + (stage === s.id ? ' ob-card-option--active' : '')}
            onClick={() => setStage(s.id)}
          >
            <span className="ob-card-option__title">{s.label}</span>
            <span className="ob-card-option__desc">{s.description}</span>
          </button>
        ))}
      </div>
      <div className="ob-actions">
        <Button block onClick={handleContinue} disabled={saving}>
          {saving ? 'Salvando…' : 'Continuar'}
        </Button>
        <button type="button" className="ob-skip" onClick={onBack} disabled={saving}>
          ← Voltar
        </button>
      </div>
    </>
  );
}

function MembersStep({
  companyId,
  members,
  editing,
  onMembersChange,
  onContinue,
  onBack,
}: {
  companyId: string;
  members: CompanyMember[];
  editing: boolean;
  onMembersChange: (m: CompanyMember[]) => void;
  onContinue: () => Promise<void> | void;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<null | 'yes' | 'later'>(editing ? 'yes' : null);
  const [advancing, setAdvancing] = useState(false);
  const [settingSolo, setSettingSolo] = useState(false);
  const partners = members.filter((m) => m.role === 'partner');
  const owner = members.find((m) => m.role === 'account_owner');
  const totalEquity = members.reduce((sum, m) => sum + (m.equityPercent ?? 0), 0);
  const remaining = Math.max(0, Math.round((100 - totalEquity) * 100) / 100);
  // Sozinho e sem nada definido: mostra o bloco orientador em vez de formulário seco.
  const soloUndefined = members.length <= 1 && totalEquity === 0;

  async function handleContinue() {
    setAdvancing(true);
    try {
      await onContinue();
    } finally {
      setAdvancing(false);
    }
  }

  function replaceMember(updated: CompanyMember) {
    onMembersChange(members.map((m) => (m.id === updated.id ? updated : m)));
  }

  /** Atalho pra quem está solo: fica com 100% e segue o jogo. */
  async function setSolo100() {
    if (!owner) return;
    setSettingSolo(true);
    try {
      const updated = await companyApi.setMemberEquity(companyId, owner.id, 100);
      replaceMember(updated);
    } finally {
      setSettingSolo(false);
    }
  }

  return (
    <>
      <div className="ob-head">
        <h1>{editing ? 'Sócios e participação' : 'Você está criando com outras pessoas?'}</h1>
        <p>
          {editing
            ? 'Adicione as pessoas envolvidas no negócio e, se já souber, informe a participação de cada uma. Você pode completar isso depois.'
            : 'Pode cadastrar sócios agora ou deixar para depois.'}
        </p>
      </div>

      {mode === null && (
        <>
          <div className="ob-cards">
            <button type="button" className="ob-card-option" onClick={() => setMode('yes')}>
              <span className="ob-card-option__title">Sim, tenho sócios</span>
              <span className="ob-card-option__desc">Vou cadastrar quem está comigo.</span>
            </button>
            <button type="button" className="ob-card-option" onClick={() => setMode('later')}>
              <span className="ob-card-option__title">Ainda não / quero adicionar depois</span>
              <span className="ob-card-option__desc">Sigo sozinho por enquanto.</span>
            </button>
          </div>
          <div className="ob-actions">
            <button type="button" className="ob-skip" onClick={onBack}>
              ← Voltar
            </button>
          </div>
        </>
      )}

      {mode !== null && (
        <>
          <div className="ob-members">
            {members.map((m) => (
              <EditableMemberRow key={m.id} member={m} companyId={companyId} onUpdated={replaceMember} />
            ))}
          </div>

          {/* participação em linguagem humana + barra de progresso */}
          <div className="ob-equity">
            <div className="ob-equity__row">
              <span>Participação definida</span>
              <strong data-financial>{formatPct(totalEquity)}</strong>
            </div>
            <div className="ob-equity__bar" aria-hidden="true">
              <div
                className={'ob-equity__fill' + (remaining === 0 ? ' ob-equity__fill--full' : '')}
                style={{ width: `${Math.min(100, totalEquity)}%` }}
              />
            </div>
            <span className={'ob-equity__hint' + (remaining === 0 ? ' ob-equity__hint--ok' : '')}>
              {remaining === 0
                ? 'Participação completa, 100% distribuídos.'
                : `Ainda falta distribuir: ${formatPct(remaining)}`}
            </span>
          </div>

          {/* sozinho e sem % definida: orienta em vez de cobrar */}
          {soloUndefined && (
            <div className="ob-solo">
              <span className="ob-solo__title">Você está sozinho por enquanto?</span>
              <p>Se você ainda não tem sócios, pode definir 100% para você ou decidir isso depois.</p>
              <div className="ob-solo__actions">
                <Button variant="secondary" onClick={setSolo100} disabled={settingSolo}>
                  {settingSolo ? 'Salvando…' : 'Definir 100% para mim'}
                </Button>
                {mode !== 'yes' && (
                  <Button variant="secondary" onClick={() => setMode('yes')}>
                    Adicionar sócio
                  </Button>
                )}
                <button type="button" className="ob-skip" onClick={handleContinue} disabled={advancing}>
                  Decidir depois
                </button>
              </div>
            </div>
          )}

          {mode === 'yes' && (
            <>
              <p className="ob-add__intro">
                Adicione sócios, cofundadores ou pessoas que participam da criação do negócio.
              </p>
              <AddPartnerForm
                companyId={companyId}
                existingEmails={members.map((m) => m.email).filter((e): e is string => e != null)}
                onAdded={(member) => onMembersChange([...members, member])}
              />
            </>
          )}

          {/* contexto discreto: o motivo por trás da pergunta */}
          <div className="ob-why">
            <span className="ob-why__title">Por que isso importa?</span>
            <p>
              A participação ajuda o Plim a calcular como despesas compartilhadas e acertos entre
              sócios devem ser distribuídos. Se vocês ainda não decidiram isso, tudo bem, o Plim
              vai lembrar depois.
            </p>
          </div>

          <div className="ob-actions">
            <Button block onClick={handleContinue} disabled={advancing}>
              {advancing
                ? 'Salvando…'
                : editing
                  ? 'Salvar e continuar'
                  : partners.length > 0
                    ? 'Continuar'
                    : 'Seguir sem sócios'}
            </Button>
            <button type="button" className="ob-skip" onClick={onBack} disabled={advancing}>
              {editing ? 'Voltar ao painel' : '← Voltar'}
            </button>
          </div>
        </>
      )}
    </>
  );
}

/** Linha de sócio com participação editável (salva no back ao sair do campo). */
function EditableMemberRow({
  member,
  companyId,
  onUpdated,
}: {
  member: CompanyMember;
  companyId: string;
  onUpdated: (m: CompanyMember) => void;
}) {
  const [draft, setDraft] = useState(member.equityPercent != null ? String(member.equityPercent) : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function commit() {
    const parsed = parsePercent(draft);
    if (parsed === 'invalid') {
      setError('0 a 100');
      return;
    }
    setError('');
    if (parsed === (member.equityPercent ?? null)) return; // sem mudança
    setSaving(true);
    try {
      const updated = await companyApi.setMemberEquity(companyId, member.id, parsed);
      onUpdated(updated);
    } catch (err) {
      setDraft(member.equityPercent != null ? String(member.equityPercent) : '');
      setError(messageForError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ob-member">
      <span className="ob-member__avatar">{initials(member.fullName)}</span>
      <div className="ob-member__info">
        <span className="ob-member__name">
          {member.fullName} {member.role === 'account_owner' && <span className="ob-tag">você</span>}
        </span>
        <span className="ob-member__meta">
          {[member.functionalRole, member.email].filter(Boolean).join(' · ') ||
            (member.role === 'account_owner' ? 'Responsável pela conta' : 'Sócio')}
        </span>
        {error && <span className="field__error">{error}</span>}
      </div>
      <input
        className="ob-member__pct-input"
        inputMode="decimal"
        placeholder="—"
        aria-label={`Participação de ${member.fullName} (%)`}
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
      />
    </div>
  );
}

function AddPartnerForm({
  companyId,
  existingEmails,
  onAdded,
}: {
  companyId: string;
  existingEmails: string[];
  onAdded: (m: CompanyMember) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [functionalRole, setFunctionalRole] = useState('');
  const [email, setEmail] = useState('');
  const [pct, setPct] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(event: FormEvent) {
    event.preventDefault();
    setFormError('');
    const localErrors: Record<string, string> = {};
    if (fullName.trim().length < 2) localErrors.fullName = 'Informe o nome.';
    const parsed = parsePercent(pct);
    if (parsed === 'invalid') localErrors.equityPercent = '0 a 100';
    const trimmedEmail = email.trim().toLowerCase();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) localErrors.email = 'E-mail inválido';
    if (trimmedEmail && existingEmails.includes(trimmedEmail)) localErrors.email = 'Já está na sociedade';
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const member = await companyApi.addMember(companyId, {
        fullName: fullName.trim(),
        email: trimmedEmail || null,
        functionalRole: functionalRole || null,
        equityPercent: parsed === 'invalid' ? null : parsed,
        notes: null,
      });
      onAdded(member);
      setFullName('');
      setFunctionalRole('');
      setEmail('');
      setPct('');
    } catch (err) {
      setFormError(messageForError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="ob-add" onSubmit={handleAdd} noValidate>
      {formError && <div className="form-error">{formError}</div>}
      <Input
        label="Nome do sócio"
        placeholder="Nome completo"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        error={errors.fullName}
      />
      <Select
        label="Papel na empresa (opcional)"
        value={functionalRole}
        onChange={setFunctionalRole}
        options={functionalRoleCatalog.map((r) => ({ value: r, label: r }))}
        placeholder="Selecione…"
      />
      <div className="ob-add__grid">
        <Input
          label="E-mail (opcional)"
          type="email"
          placeholder="socio@empresa.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          hint="Você poderá enviar um convite depois."
        />
        <Input
          label="Participação %"
          inputMode="decimal"
          placeholder="0"
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          error={errors.equityPercent}
          hint="Ainda não sabe? Deixe em branco e complete depois."
        />
      </div>
      <Button type="submit" variant="secondary" block disabled={submitting}>
        {submitting ? 'Adicionando…' : '+ Adicionar sócio'}
      </Button>
    </form>
  );
}

function ReviewStep({
  company,
  members,
  onFinish,
  onEdit,
}: {
  company: Company;
  members: CompanyMember[];
  onFinish: () => Promise<void>;
  onEdit: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const partners = members.filter((m) => m.role === 'partner');
  const allocated = members.reduce((sum, m) => sum + (m.equityPercent ?? 0), 0);
  const country = countryCatalog.find((c) => c.code === company.countryCode);
  const stage = businessStageCatalog.find((s) => s.id === company.businessStage);
  const industryLabel =
    company.industry === 'outro'
      ? company.industryOther ?? 'Outro'
      : industryCatalog.find((s) => s.id === company.industry)?.label ?? null;
  const typeLabel = businessModelTypeCatalog.find((t) => t.id === company.businessModelType)?.label ?? null;
  const formalizationLabel =
    hasFormalRegistrationCatalog.find((o) => o.id === company.hasFormalRegistration)?.label ?? null;
  const legalLabel =
    company.legalStructureStatus === 'needs_accountant'
      ? 'Vai falar com um contador'
      : legalStructureCatalog.find((l) => l.id === company.legalStructure)?.label ?? null;

  async function handleFinish() {
    setError('');
    setSaving(true);
    try {
      await onFinish();
    } catch (err) {
      setError(messageForError(err));
      setSaving(false);
    }
  }

  return (
    <>
      <div className="ob-head">
        <h1>Tudo certo para começar</h1>
        <p>Criamos o espaço da sua empresa. Você pode completar ou alterar quando quiser.</p>
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="ob-review">
        <Row label="Empresa" value={company.name + (company.isNameTemporary ? ' (provisório)' : '')} />
        {company.description && <Row label="Descrição" value={company.description} />}
        <Row label="Tipo de negócio" value={typeLabel} />
        <Row label="Segmento" value={industryLabel} />
        <Row label="País" value={country?.label ?? null} />
        <Row label="Cidade/região" value={[company.city, company.region].filter(Boolean).join(' · ') || null} />
        <Row label="Moeda" value={company.currencyCode} />
        <Row label="Estágio" value={stage?.label ?? null} />
        <Row label="Formalização" value={formalizationLabel} />
        <Row label="Natureza jurídica" value={legalLabel} />
        <Row label="Sócios cadastrados" value={String(partners.length)} />
        <Row label="Participação definida" value={`${formatPct(allocated)} de 100%`} />
      </div>
      <div className="ob-actions">
        <Button block onClick={handleFinish} disabled={saving}>
          {saving ? 'Finalizando…' : 'Ir para o painel'}
        </Button>
        <button type="button" className="ob-skip" onClick={onEdit} disabled={saving}>
          Voltar e editar
        </button>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="ob-review__row">
      <span className="ob-review__label">{label}</span>
      <span className={'ob-review__value' + (value ? '' : ' ob-review__value--muted')}>
        {value || 'a definir'}
      </span>
    </div>
  );
}

/* ── helpers ─────────────────────────────── */

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]![0] ?? '' : '';
  return (first + last).toUpperCase();
}

function formatPct(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

function parsePercent(raw: string): number | null | 'invalid' {
  const trimmed = raw.trim().replace(',', '.');
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || n > 100) return 'invalid';
  return Math.round(n * 100) / 100;
}
