import type {
  AdminCompanyDetail,
  AdminCompanyRow,
  AdminDashboardStats,
  AdminMe,
  AdminRole,
  AdminUserDetail,
  AdminUserRow,
} from '@plim/shared';
import type { AdminRepository } from '../repositories/admin.repository';
import { DomainError, NotFoundError } from '../lib/errors';

/**
 * Painel Administrativo interno (equipe do Plim).
 *
 * REGRA DE OURO DO ADMIN: a permissão é validada AQUI, no servidor, em toda
 * chamada — o front esconder o menu é cortesia, nunca segurança. Usuário
 * comum recebe 403 NOT_ADMIN, sem vazar se a rota existe ou o que contém.
 */
export class AdminService {
  constructor(private readonly repo: AdminRepository) {}

  /**
   * Autorização central: só admin interno ATIVO passa.
   * Modo dev (sem autenticação, actingUserId nulo): libera como super_admin,
   * coerente com o restante da API em desenvolvimento.
   */
  private async assertAdmin(actingUserId?: string | null): Promise<AdminRole> {
    if (actingUserId == null) return 'super_admin'; // modo dev
    const admin = await this.repo.findAdminByUserId(actingUserId);
    if (!admin || admin.status !== 'active') {
      throw new DomainError('NOT_ADMIN', 'Acesso restrito à equipe do Plim.', 403);
    }
    return admin.role;
  }

  async me(actingUserId?: string | null): Promise<AdminMe> {
    const role = await this.assertAdmin(actingUserId);
    return { role };
  }

  async dashboard(actingUserId?: string | null): Promise<AdminDashboardStats> {
    await this.assertAdmin(actingUserId);
    return this.repo.dashboardStats();
  }

  async listCompanies(actingUserId?: string | null): Promise<AdminCompanyRow[]> {
    await this.assertAdmin(actingUserId);
    return this.repo.listCompanies();
  }

  async companyDetail(companyId: string, actingUserId?: string | null): Promise<AdminCompanyDetail> {
    await this.assertAdmin(actingUserId);
    const detail = await this.repo.getCompanyDetail(companyId);
    if (!detail) throw new NotFoundError('COMPANY_NOT_FOUND', 'Empresa não encontrada.');
    return detail;
  }

  async listUsers(actingUserId?: string | null): Promise<AdminUserRow[]> {
    await this.assertAdmin(actingUserId);
    return this.repo.listUsers();
  }

  async userDetail(userId: string, actingUserId?: string | null): Promise<AdminUserDetail> {
    await this.assertAdmin(actingUserId);
    const detail = await this.repo.getUserDetail(userId);
    if (!detail) throw new NotFoundError('USER_NOT_FOUND', 'Usuário não encontrado.');
    return detail;
  }

  /**
   * Reset de senha SEGURO: dispara o e-mail de redefinição pelo provedor de
   * auth. A API nunca vê, define ou armazena senha (RP de segurança do PRD).
   */
  async sendPasswordReset(userId: string, actingUserId?: string | null): Promise<{ sentTo: string }> {
    await this.assertAdmin(actingUserId);
    const user = await this.repo.getUserDetail(userId);
    if (!user) throw new NotFoundError('USER_NOT_FOUND', 'Usuário não encontrado.');
    if (!user.email) throw new DomainError('USER_WITHOUT_EMAIL', 'Usuário sem e-mail cadastrado.');
    await this.repo.sendPasswordReset(user.email);
    return { sentTo: user.email };
  }
}
