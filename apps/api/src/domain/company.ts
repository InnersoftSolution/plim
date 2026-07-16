import type {
  BusinessModelType,
  BusinessStage,
  HasFormalRegistration,
  InvitationStatus,
  LegalStructure,
  LegalStructureStatus,
  MemberRole,
  OnboardingStatus,
  OnboardingStep,
} from '@plim/shared';

export interface Company {
  id: string;
  name: string;
  isNameTemporary: boolean;
  description: string | null;
  /** Segmento principal (industry). */
  industry: string | null;
  industryOther: string | null;
  /** Modelo de negócio (texto livre; catálogo é só sugestão). */
  businessModel: string | null;
  /** Tipo de negócio (cards do onboarding: products/services/technology/…). */
  businessModelType: BusinessModelType | null;
  businessStage: BusinessStage | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  currencyCode: string | null;
  logoUrl: string | null;
  /** Formalização: registro formal (CNPJ/equivalente), natureza jurídica e status. */
  hasFormalRegistration: HasFormalRegistration | null;
  registrationCountry: string | null;
  /** Número de registro (CNPJ no BR) — só dígitos. */
  registrationNumber: string | null;
  legalStructure: LegalStructure | null;
  legalStructureStatus: LegalStructureStatus | null;
  phone: string | null;
  email: string | null;
  cep: string | null;
  street: string | null;
  streetNumber: string | null;
  complement: string | null;
  neighborhood: string | null;
  onboardingStatus: OnboardingStatus;
  onboardingStep: OnboardingStep | null;
  /** Usuário (auth) dono da conta. Nulo no modo dev sem autenticação. */
  ownerId: string | null;
  createdAt: Date;
}

/** Campos editáveis da empresa (save/resume do onboarding). */
export type CompanyUpdate = Partial<
  Pick<
    Company,
    | 'name'
    | 'isNameTemporary'
    | 'description'
    | 'industry'
    | 'industryOther'
    | 'businessModel'
    | 'businessStage'
    | 'countryCode'
    | 'region'
    | 'city'
    | 'businessModelType'
    | 'currencyCode'
    | 'logoUrl'
    | 'hasFormalRegistration'
    | 'registrationCountry'
    | 'registrationNumber'
    | 'legalStructure'
    | 'legalStructureStatus'
    | 'phone'
    | 'email'
    | 'cep'
    | 'street'
    | 'streetNumber'
    | 'complement'
    | 'neighborhood'
    | 'onboardingStatus'
    | 'onboardingStep'
  >
>;

/**
 * Campos editáveis de um sócio (tela Sociedade + ciclo de convite).
 * system_role/role não entra. userId/status/invitationStatus são atualizados
 * apenas pelo próprio sistema (convite enviado, vínculo no login).
 */
export type MemberUpdate = Partial<
  Pick<
    CompanyMember,
    'fullName' | 'email' | 'functionalRole' | 'equityPercent' | 'notes' | 'userId' | 'status' | 'invitationStatus'
  >
>;

export interface CompanyMember {
  id: string;
  companyId: string;
  /** Usuário (auth) vinculado a este sócio. Nulo enquanto for só um convite. */
  userId: string | null;
  fullName: string;
  email: string | null;
  /** Papel FUNCIONAL (o que a pessoa faz). Distinto do papel no sistema. */
  functionalRole: string | null;
  /** Papel no SISTEMA (permissão). */
  role: MemberRole;
  /** Participação societária (ownership) 0–100, 2 casas. Nula enquanto não definida. */
  equityPercent: number | null;
  notes: string | null;
  status: 'invited' | 'active';
  invitationStatus: InvitationStatus;
}

/**
 * Desfecho do envio de convite, informado ao front para dar a mensagem certa:
 * - 'sent': e-mail saiu, a pessoa recebe o link para entrar.
 * - 'already_registered': a pessoa já tem conta; NÃO sai e-mail, é só ela entrar.
 * - 'failed': o envio falhou (SMTP, rate limit); nada saiu, dá para reenviar.
 * É transitório (não persiste): só acompanha a resposta da ação de convidar.
 */
export type MemberInviteOutcome = 'sent' | 'already_registered' | 'failed';

/** Sócio retornado por uma ação de convite, com o desfecho do envio anexado. */
export type CompanyMemberWithInvite = CompanyMember & { inviteOutcome?: MemberInviteOutcome };
