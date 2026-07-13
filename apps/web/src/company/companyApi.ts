import type {
  AddMemberInput,
  Company,
  CompanyMember,
  CreateCompanyInput,
  InsightsResponse,
  UpdateCompanyInput,
  UpdateMemberInput,
} from '@plim/shared';
import { apiFetch, ApiError } from '../lib/api';

interface CreateCompanyResult {
  company: Company;
  ownerMember: CompanyMember;
}

/** Identidade do dono virá do token quando o Supabase entrar; por ora, da sessão. */
interface Owner {
  fullName: string;
  email: string;
}

export const companyApi = {
  listMyCompanies(): Promise<Company[]> {
    return apiFetch<Company[]>('/companies');
  },

  getInsights(companyId: string): Promise<InsightsResponse> {
    return apiFetch<InsightsResponse>(`/companies/${companyId}/insights`);
  },

  createCompany(input: CreateCompanyInput, owner: Owner): Promise<CreateCompanyResult> {
    return apiFetch<CreateCompanyResult>('/companies', {
      method: 'POST',
      body: JSON.stringify({ ...input, owner }),
    });
  },

  /** Atualização parcial (save/resume do onboarding). */
  updateCompany(companyId: string, patch: UpdateCompanyInput): Promise<Company> {
    return apiFetch<Company>(`/companies/${companyId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  completeOnboarding(companyId: string): Promise<Company> {
    return apiFetch<Company>(`/companies/${companyId}/complete-onboarding`, {
      method: 'POST',
    });
  },

  listMembers(companyId: string): Promise<CompanyMember[]> {
    return apiFetch<CompanyMember[]>(`/companies/${companyId}/members`);
  },

  addMember(companyId: string, input: AddMemberInput): Promise<CompanyMember> {
    return apiFetch<CompanyMember>(`/companies/${companyId}/members`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  setMemberEquity(
    companyId: string,
    memberId: string,
    equityPercent: number | null,
  ): Promise<CompanyMember> {
    return apiFetch<CompanyMember>(`/companies/${companyId}/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ equityPercent }),
    });
  },

  updateMember(
    companyId: string,
    memberId: string,
    input: UpdateMemberInput,
  ): Promise<CompanyMember> {
    return apiFetch<CompanyMember>(`/companies/${companyId}/members/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  inviteMember(companyId: string, memberId: string): Promise<CompanyMember> {
    return apiFetch<CompanyMember>(`/companies/${companyId}/members/${memberId}/invite`, {
      method: 'POST',
    });
  },
};

/** Traduz códigos estáveis do back em mensagens amigáveis (pt-BR). */
const MESSAGES: Record<string, string> = {
  EQUITY_SUM_EXCEEDED: 'A soma das participações passaria de 100%. Ajuste os percentuais.',
  MEMBER_ALREADY_EXISTS: 'Esse e-mail já faz parte da sociedade.',
  MEMBER_NOT_FOUND: 'Sócio não encontrado.',
  MEMBER_WITHOUT_EMAIL: 'Cadastre o e-mail do sócio antes de convidar.',
  MEMBER_ALREADY_ACTIVE: 'Esse sócio já entrou no Plim.',
  INVITE_NOT_CONFIGURED: 'Envio de convite indisponível neste ambiente.',
  COMPANY_NOT_FOUND: 'Empresa não encontrada.',
  VALIDATION_ERROR: 'Confira os dados informados.',
  NETWORK_ERROR: 'Sem conexão com o servidor. Tente novamente.',
};

export function messageForError(err: unknown): string {
  if (err instanceof ApiError) {
    return MESSAGES[err.code] ?? err.message ?? 'Algo deu errado.';
  }
  return 'Algo deu errado. Tente novamente.';
}

/** Logo da empresa (identidade visual). Base64 no corpo; API valida e armazena. */
export const logoApi = {
  upload(companyId: string, dataBase64: string, contentType: string): Promise<Company> {
    return apiFetch<Company>(`/companies/${companyId}/logo`, {
      method: 'POST',
      body: JSON.stringify({ dataBase64, contentType }),
    });
  },
  remove(companyId: string): Promise<Company> {
    return apiFetch<Company>(`/companies/${companyId}/logo`, { method: 'DELETE' });
  },
};
