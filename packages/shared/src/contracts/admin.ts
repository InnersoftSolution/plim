import { z } from 'zod';

/**
 * Painel Administrativo interno (equipe do Plim/Inner).
 * NÃO confundir com papéis dentro de uma empresa (account_owner/partner):
 * admin aqui é quem opera o PRODUTO, não quem usa uma empresa.
 *
 * Leitura em primeiro lugar: nesta fase o admin é essencialmente read-only
 * (dashboard, empresas, usuários) + uma ação segura (reset de senha por e-mail).
 */

export const adminRoleSchema = z.enum(['super_admin', 'admin', 'support']);
export type AdminRole = z.infer<typeof adminRoleSchema>;

export const adminRoleCatalog: ReadonlyArray<{ id: AdminRole; label: string }> = [
  { id: 'super_admin', label: 'Super admin' },
  { id: 'admin', label: 'Admin' },
  { id: 'support', label: 'Suporte' },
];

/** Plano conceitual desta fase: todo mundo é Beta (cobrança ainda não existe). */
export const planIdSchema = z.enum(['beta', 'free', 'pro', 'business']);
export type PlanId = z.infer<typeof planIdSchema>;

export const planCatalog: ReadonlyArray<{ id: PlanId; label: string }> = [
  { id: 'beta', label: 'Beta' },
  { id: 'free', label: 'Free' },
  { id: 'pro', label: 'Pro' },
  { id: 'business', label: 'Business' },
];

/** GET /admin/me — quem sou eu no painel (403 se não for admin ativo). */
export interface AdminMe {
  role: AdminRole;
}

/** GET /admin/dashboard — visão geral do produto. */
export interface AdminDashboardStats {
  companiesTotal: number;
  /** onboarding concluído */
  companiesActive: number;
  /** onboarding em andamento/pendente */
  companiesIncomplete: number;
  usersTotal: number;
  expensesTotal: number;
  activitiesTotal: number;
  /** nesta fase, todas as empresas contam como Beta */
  plan: PlanId;
}

/** Linha da listagem GET /admin/companies. */
export interface AdminCompanyRow {
  id: string;
  name: string;
  createdAt: string;
  onboardingStatus: string;
  countryCode: string | null;
  currencyCode: string | null;
  businessStage: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  membersCount: number;
  expensesCount: number;
  plan: PlanId;
}

export interface AdminCompanyMember {
  id: string;
  fullName: string;
  email: string | null;
  functionalRole: string | null;
  role: string;
  equityPercent: number | null;
  status: string;
  invitationStatus: string;
}

/** GET /admin/companies/:id — detalhe completo para suporte. */
export interface AdminCompanyDetail {
  id: string;
  name: string;
  description: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  currencyCode: string | null;
  businessStage: string | null;
  registrationNumber: string | null;
  legalStructure: string | null;
  onboardingStatus: string;
  createdAt: string;
  owner: { fullName: string; email: string | null } | null;
  members: AdminCompanyMember[];
  usage: {
    expensesCount: number;
    recurringCount: number;
    activitiesCount: number;
    activitiesOverdue: number;
  };
  billing: {
    plan: PlanId;
    /** cobrança ainda não configurada nesta fase */
    subscriptionStatus: 'not_configured';
  };
}

/** Linha da listagem GET /admin/users. */
export interface AdminUserRow {
  id: string;
  fullName: string | null;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  companiesCount: number;
  adminRole: AdminRole | null;
}

/** GET /admin/users/:id — detalhe do usuário (NUNCA inclui senha). */
export interface AdminUserDetail {
  id: string;
  fullName: string | null;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  adminRole: AdminRole | null;
  memberships: Array<{
    companyId: string;
    companyName: string;
    role: string;
    functionalRole: string | null;
    isAccountOwner: boolean;
  }>;
}
