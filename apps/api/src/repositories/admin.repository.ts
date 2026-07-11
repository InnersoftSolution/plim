import type {
  AdminCompanyDetail,
  AdminCompanyRow,
  AdminDashboardStats,
  AdminUserDetail,
  AdminUserRow,
} from '@plim/shared';
import type { AdminUserRecord } from '../domain/admin';

/**
 * Leituras agregadas do Painel Administrativo + a checagem de permissão.
 * O painel é read-only nesta fase; a única ação (reset de senha) é delegada
 * ao provedor de auth — a API nunca vê nem define senha.
 */
export interface AdminRepository {
  /** Quem é admin interno? null = usuário comum (sem acesso ao /admin). */
  findAdminByUserId(userId: string): Promise<AdminUserRecord | null>;

  dashboardStats(): Promise<AdminDashboardStats>;
  listCompanies(): Promise<AdminCompanyRow[]>;
  getCompanyDetail(companyId: string): Promise<AdminCompanyDetail | null>;
  listUsers(): Promise<AdminUserRow[]>;
  getUserDetail(userId: string): Promise<AdminUserDetail | null>;

  /** Dispara o e-mail de redefinição via provedor de auth (fluxo seguro). */
  sendPasswordReset(email: string): Promise<void>;
}
