import { z } from 'zod';
import {
  businessModelTypeSchema,
  businessStageSchema,
  hasFormalRegistrationSchema,
  invitationStatusSchema,
  legalStructureSchema,
  legalStructureStatusSchema,
  onboardingStatusSchema,
  onboardingStepSchema,
} from './catalogs';
import { isValidCnpj, onlyDigits } from '../validators';

/**
 * Registro formal (CNPJ no Brasil; equivalente em outros países).
 * Guarda só dígitos; quando parecer CNPJ (14 dígitos), exige dígito verificador.
 * A validação estrita por país acontece no serviço quando registrationCountry='BR'.
 */
const registrationNumberField = z
  .string()
  .trim()
  .transform(onlyDigits)
  .refine((v) => v.length !== 14 || isValidCnpj(v), 'CNPJ inválido')
  .nullable()
  .optional();

export const memberRoleSchema = z.enum(['account_owner', 'partner']);
export type MemberRole = z.infer<typeof memberRoleSchema>;

/**
 * Catálogo de modelos de negócio — sugestões mostradas no onboarding.
 * É um guia para o usuário; o campo aceita texto livre (opção "Outro"),
 * então o back valida apenas o formato (string curta), não a lista.
 */
export const businessModelCatalog = [
  { id: 'saas', label: 'SaaS / Assinatura' },
  { id: 'marketplace', label: 'Marketplace' },
  { id: 'ecommerce', label: 'E-commerce' },
  { id: 'app', label: 'Aplicativo' },
  { id: 'servicos', label: 'Serviços / Consultoria' },
  { id: 'conteudo', label: 'Conteúdo / Mídia' },
] as const;

export const createCompanySchema = z.object({
  name: z.string().trim().min(2, 'Nome muito curto').max(120),
  isNameTemporary: z.boolean().optional(),
  description: z.string().trim().max(500).optional(),
  // Segmento (industry). "outro" libera texto livre em industryOther.
  industry: z.string().trim().max(60).optional(),
  industryOther: z.string().trim().max(60).optional(),
  // Modelo de negócio: texto livre (catálogo é só sugestão). Opcional no início.
  businessModel: z.string().trim().min(2, 'Muito curto').max(60).optional(),
});
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

/**
 * Atualização parcial da empresa (save/resume do onboarding). Todos os campos
 * opcionais — o serviço aplica só o que vier. O front avança etapa a etapa.
 */
export const updateCompanySchema = z.object({
  name: z.string().trim().min(2, 'Nome muito curto').max(120).optional(),
  isNameTemporary: z.boolean().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  industry: z.string().trim().max(60).nullable().optional(),
  industryOther: z.string().trim().max(60).nullable().optional(),
  businessModel: z.string().trim().max(60).nullable().optional(),
  businessModelType: businessModelTypeSchema.nullable().optional(),
  businessStage: businessStageSchema.nullable().optional(),
  countryCode: z.string().trim().max(10).nullable().optional(),
  region: z.string().trim().max(80).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  currencyCode: z.string().trim().max(10).nullable().optional(),
  // Formalização e registro (PRD fluxo inicial §8/§9/§21).
  hasFormalRegistration: hasFormalRegistrationSchema.nullable().optional(),
  registrationCountry: z.string().trim().max(10).nullable().optional(),
  registrationNumber: registrationNumberField,
  legalStructure: legalStructureSchema.nullable().optional(),
  legalStructureStatus: legalStructureStatusSchema.nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  email: z.string().trim().toLowerCase().email('E-mail inválido').nullable().optional(),
  cep: z.string().trim().max(9).nullable().optional(),
  street: z.string().trim().max(120).nullable().optional(),
  streetNumber: z.string().trim().max(20).nullable().optional(),
  complement: z.string().trim().max(60).nullable().optional(),
  neighborhood: z.string().trim().max(80).nullable().optional(),
  onboardingStep: onboardingStepSchema.nullable().optional(),
});
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

/** Definição/edição do percentual de um sócio já existente (ex.: o próprio dono). */
export const setMemberEquitySchema = z.object({
  equityPercent: z.number().min(0).max(100).multipleOf(0.01).nullable(),
});
export type SetMemberEquityInput = z.infer<typeof setMemberEquitySchema>;

/**
 * Edição de um sócio existente (tela Sociedade). Todos os campos opcionais —
 * o serviço aplica só o que vier. Papel no sistema (system_role) NÃO é editável
 * aqui no MVP; nome/e-mail/papel funcional/participação/observação sim.
 */
export const updateMemberSchema = z.object({
  fullName: z.string().trim().min(2, 'Nome muito curto').max(120).optional(),
  email: z.string().trim().toLowerCase().email('E-mail inválido').nullable().optional(),
  functionalRole: z.string().trim().max(40).nullable().optional(),
  equityPercent: z.number().min(0).max(100).multipleOf(0.01).nullable().optional(),
  notes: z.string().trim().max(300).nullable().optional(),
});
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

export const addMemberSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  // E-mail opcional nesta fase; se vier, precisa ser válido.
  email: z.string().trim().toLowerCase().email('E-mail inválido').nullable().default(null),
  // Papel FUNCIONAL (o que a pessoa faz) — distinto do papel no sistema. Texto livre.
  functionalRole: z.string().trim().max(40).nullable().optional(),
  // Percentual societário: opcional no início; quando informado, 0–100 com 2 casas.
  equityPercent: z
    .number()
    .min(0)
    .max(100)
    .multipleOf(0.01)
    .nullable()
    .default(null),
  notes: z.string().trim().max(300).nullable().optional(),
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;

export const companyMemberSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  /** Conta (auth) vinculada. Nula enquanto o sócio ainda não entrou no Plim. */
  userId: z.string().uuid().nullable().default(null),
  fullName: z.string(),
  email: z.string().email().nullable(),
  functionalRole: z.string().nullable(),
  /** Papel no SISTEMA (permissão). */
  role: memberRoleSchema,
  /** Participação societária (ownership). */
  equityPercent: z.number().nullable(),
  notes: z.string().nullable(),
  status: z.enum(['invited', 'active']),
  invitationStatus: invitationStatusSchema,
});
export type CompanyMember = z.infer<typeof companyMemberSchema>;

export const companySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  isNameTemporary: z.boolean(),
  description: z.string().nullable(),
  industry: z.string().nullable(),
  industryOther: z.string().nullable(),
  businessModel: z.string().nullable(),
  businessModelType: businessModelTypeSchema.nullable(),
  businessStage: businessStageSchema.nullable(),
  countryCode: z.string().nullable(),
  region: z.string().nullable(),
  city: z.string().nullable(),
  currencyCode: z.string().nullable(),
  hasFormalRegistration: hasFormalRegistrationSchema.nullable(),
  registrationCountry: z.string().nullable(),
  registrationNumber: z.string().nullable(),
  legalStructure: legalStructureSchema.nullable(),
  legalStructureStatus: legalStructureStatusSchema.nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  cep: z.string().nullable(),
  street: z.string().nullable(),
  streetNumber: z.string().nullable(),
  complement: z.string().nullable(),
  neighborhood: z.string().nullable(),
  logoUrl: z.string().nullable().default(null),
  onboardingStatus: onboardingStatusSchema,
  onboardingStep: onboardingStepSchema.nullable(),
  createdAt: z.string().datetime(),
});
export type Company = z.infer<typeof companySchema>;

/** Upload de logo (Entrega 2 do checklist): imagem pequena em base64. */
export const uploadLogoSchema = z.object({
  dataBase64: z.string().min(1),
  contentType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
});
export type UploadLogoInput = z.infer<typeof uploadLogoSchema>;
