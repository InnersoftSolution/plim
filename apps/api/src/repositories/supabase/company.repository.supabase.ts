import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BusinessModelType,
  BusinessStage,
  HasFormalRegistration,
  InvitationStatus,
  LegalStructure,
  LegalStructureStatus,
  OnboardingStatus,
  OnboardingStep,
} from '@plim/shared';
import type { Company, CompanyMember, CompanyUpdate, MemberUpdate } from '../../domain/company';
import type { CompanyRepository } from '../company.repository';

/** Linhas como vêm do Postgres (snake_case). */
interface CompanyRow {
  id: string;
  name: string;
  is_name_temporary: boolean;
  description: string | null;
  industry: string | null;
  industry_other: string | null;
  business_model: string | null;
  business_model_type: string | null;
  business_stage: BusinessStage | null;
  country_code: string | null;
  region: string | null;
  city: string | null;
  currency_code: string | null;
  logo_url: string | null;
  has_formal_registration: string | null;
  registration_country: string | null;
  registration_number: string | null;
  legal_structure: string | null;
  legal_structure_status: string | null;
  phone: string | null;
  email: string | null;
  cep: string | null;
  street: string | null;
  street_number: string | null;
  complement: string | null;
  neighborhood: string | null;
  onboarding_status: OnboardingStatus;
  onboarding_step: OnboardingStep | null;
  owner_id: string | null;
  created_at: string;
}
interface MemberRow {
  id: string;
  company_id: string;
  user_id: string | null;
  full_name: string;
  email: string | null;
  functional_role: string | null;
  role: 'account_owner' | 'partner';
  equity_percent: number | string | null;
  notes: string | null;
  status: 'invited' | 'active';
  invitation_status: InvitationStatus;
}

function toCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    name: row.name,
    isNameTemporary: row.is_name_temporary,
    description: row.description,
    industry: row.industry,
    industryOther: row.industry_other,
    businessModel: row.business_model,
    businessModelType: row.business_model_type as BusinessModelType | null,
    businessStage: row.business_stage,
    countryCode: row.country_code,
    region: row.region,
    city: row.city,
    currencyCode: row.currency_code,
    logoUrl: row.logo_url,
    hasFormalRegistration: row.has_formal_registration as HasFormalRegistration | null,
    registrationCountry: row.registration_country,
    registrationNumber: row.registration_number,
    legalStructure: row.legal_structure as LegalStructure | null,
    legalStructureStatus: row.legal_structure_status as LegalStructureStatus | null,
    phone: row.phone,
    email: row.email,
    cep: row.cep,
    street: row.street,
    streetNumber: row.street_number,
    complement: row.complement,
    neighborhood: row.neighborhood,
    onboardingStatus: row.onboarding_status,
    onboardingStep: row.onboarding_step,
    ownerId: row.owner_id,
    createdAt: new Date(row.created_at),
  };
}

function toMember(row: MemberRow): CompanyMember {
  return {
    id: row.id,
    companyId: row.company_id,
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    functionalRole: row.functional_role,
    role: row.role,
    equityPercent: row.equity_percent == null ? null : Number(row.equity_percent),
    notes: row.notes,
    status: row.status,
    invitationStatus: row.invitation_status,
  };
}

/** Mapeia o patch camelCase → colunas snake_case, só com o que veio. */
function companyPatchToRow(patch: CompanyUpdate): Record<string, unknown> {
  const map: Record<keyof CompanyUpdate, string> = {
    name: 'name',
    isNameTemporary: 'is_name_temporary',
    description: 'description',
    industry: 'industry',
    industryOther: 'industry_other',
    businessModel: 'business_model',
    businessModelType: 'business_model_type',
    businessStage: 'business_stage',
    countryCode: 'country_code',
    region: 'region',
    city: 'city',
    currencyCode: 'currency_code',
    logoUrl: 'logo_url',
    hasFormalRegistration: 'has_formal_registration',
    registrationCountry: 'registration_country',
    registrationNumber: 'registration_number',
    legalStructure: 'legal_structure',
    legalStructureStatus: 'legal_structure_status',
    phone: 'phone',
    email: 'email',
    cep: 'cep',
    street: 'street',
    streetNumber: 'street_number',
    complement: 'complement',
    neighborhood: 'neighborhood',
    onboardingStatus: 'onboarding_status',
    onboardingStep: 'onboarding_step',
  };
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const column = map[key as keyof CompanyUpdate];
    if (column) row[column] = value;
  }
  return row;
}

/**
 * Acesso a dados via Postgres do Supabase (service role).
 * Implementa a mesma interface do repositório in-memory — serviços e rotas
 * não mudam. As regras de negócio continuam no CompanyService.
 */
export class SupabaseCompanyRepository implements CompanyRepository {
  constructor(private readonly db: SupabaseClient) {}

  async createCompany(data: Omit<Company, 'id' | 'createdAt'>): Promise<Company> {
    const { data: row, error } = await this.db
      .from('companies')
      .insert({
        name: data.name,
        is_name_temporary: data.isNameTemporary,
        description: data.description,
        industry: data.industry,
        industry_other: data.industryOther,
        business_model: data.businessModel,
        business_stage: data.businessStage,
        country_code: data.countryCode,
        region: data.region,
        city: data.city,
        currency_code: data.currencyCode,
        onboarding_status: data.onboardingStatus,
        onboarding_step: data.onboardingStep,
        owner_id: data.ownerId,
      })
      .select()
      .single<CompanyRow>();
    if (error || !row) throw new Error(`Falha ao criar empresa: ${error?.message}`);
    return toCompany(row);
  }

  async updateCompany(companyId: string, patch: CompanyUpdate): Promise<Company> {
    const { data: row, error } = await this.db
      .from('companies')
      .update(companyPatchToRow(patch))
      .eq('id', companyId)
      .select()
      .single<CompanyRow>();
    if (error || !row) throw new Error(`Falha ao atualizar empresa: ${error?.message}`);
    return toCompany(row);
  }

  async findCompanyById(id: string): Promise<Company | null> {
    const { data: row, error } = await this.db
      .from('companies')
      .select()
      .eq('id', id)
      .maybeSingle<CompanyRow>();
    if (error) throw new Error(`Falha ao buscar empresa: ${error.message}`);
    return row ? toCompany(row) : null;
  }

  async listCompaniesByUserId(userId: string): Promise<Company[]> {
    // Empresas via vínculo em company_members (resource aninhado do PostgREST).
    const { data: rows, error } = await this.db
      .from('company_members')
      .select('company:companies(*)')
      .eq('user_id', userId)
      .returns<{ company: CompanyRow | null }[]>();
    if (error) throw new Error(`Falha ao listar empresas do usuário: ${error.message}`);
    return (rows ?? [])
      .map((r) => r.company)
      .filter((c): c is CompanyRow => c !== null)
      .map(toCompany);
  }

  async listAllCompanies(): Promise<Company[]> {
    const { data: rows, error } = await this.db.from('companies').select().returns<CompanyRow[]>();
    if (error) throw new Error(`Falha ao listar empresas: ${error.message}`);
    return (rows ?? []).map(toCompany);
  }

  async addMember(data: Omit<CompanyMember, 'id'>): Promise<CompanyMember> {
    const { data: row, error } = await this.db
      .from('company_members')
      .insert({
        company_id: data.companyId,
        user_id: data.userId,
        full_name: data.fullName,
        email: data.email,
        functional_role: data.functionalRole,
        role: data.role,
        equity_percent: data.equityPercent,
        notes: data.notes,
        status: data.status,
        invitation_status: data.invitationStatus,
      })
      .select()
      .single<MemberRow>();
    if (error || !row) throw new Error(`Falha ao adicionar sócio: ${error?.message}`);
    return toMember(row);
  }

  async listMembers(companyId: string): Promise<CompanyMember[]> {
    const { data: rows, error } = await this.db
      .from('company_members')
      .select()
      .eq('company_id', companyId)
      .order('created_at', { ascending: true })
      .returns<MemberRow[]>();
    if (error) throw new Error(`Falha ao listar sócios: ${error.message}`);
    return (rows ?? []).map(toMember);
  }

  async findMemberById(companyId: string, memberId: string): Promise<CompanyMember | null> {
    const { data: row, error } = await this.db
      .from('company_members')
      .select()
      .eq('company_id', companyId)
      .eq('id', memberId)
      .maybeSingle<MemberRow>();
    if (error) throw new Error(`Falha ao buscar sócio: ${error.message}`);
    return row ? toMember(row) : null;
  }

  async findMemberByEmail(companyId: string, email: string): Promise<CompanyMember | null> {
    const { data: row, error } = await this.db
      .from('company_members')
      .select()
      .eq('company_id', companyId)
      .eq('email', email)
      .maybeSingle<MemberRow>();
    if (error) throw new Error(`Falha ao buscar sócio por e-mail: ${error.message}`);
    return row ? toMember(row) : null;
  }

  async findMemberByUserId(companyId: string, userId: string): Promise<CompanyMember | null> {
    const { data: row, error } = await this.db
      .from('company_members')
      .select()
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .maybeSingle<MemberRow>();
    if (error) throw new Error(`Falha ao buscar vínculo: ${error.message}`);
    return row ? toMember(row) : null;
  }

  async updateMemberEquity(memberId: string, equityPercent: number | null): Promise<CompanyMember> {
    const { data: row, error } = await this.db
      .from('company_members')
      .update({ equity_percent: equityPercent })
      .eq('id', memberId)
      .select()
      .single<MemberRow>();
    if (error || !row) throw new Error(`Falha ao atualizar participação: ${error?.message}`);
    return toMember(row);
  }

  async updateMember(memberId: string, patch: MemberUpdate): Promise<CompanyMember> {
    const map: Record<keyof MemberUpdate, string> = {
      fullName: 'full_name',
      email: 'email',
      functionalRole: 'functional_role',
      equityPercent: 'equity_percent',
      notes: 'notes',
      userId: 'user_id',
      status: 'status',
      invitationStatus: 'invitation_status',
    };
    const row: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      const column = map[key as keyof MemberUpdate];
      if (column) row[column] = value;
    }
    const { data: updated, error } = await this.db
      .from('company_members')
      .update(row)
      .eq('id', memberId)
      .select()
      .single<MemberRow>();
    if (error || !updated) throw new Error(`Falha ao atualizar sócio: ${error?.message}`);
    return toMember(updated);
  }

  async listUnclaimedMembersByEmail(email: string): Promise<CompanyMember[]> {
    const { data: rows, error } = await this.db
      .from('company_members')
      .select()
      .eq('email', email)
      .is('user_id', null);
    if (error) throw new Error(`Falha ao buscar convites pendentes: ${error.message}`);
    return ((rows ?? []) as MemberRow[]).map(toMember);
  }
}
