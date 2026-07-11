import { randomUUID } from 'node:crypto';
import type {
  AdminCompanyDetail,
  AdminCompanyRow,
  AdminDashboardStats,
  AdminRole,
  AdminUserDetail,
  AdminUserRow,
} from '@plim/shared';
import type { AdminUserRecord } from '../../domain/admin';
import type { AdminRepository } from '../admin.repository';

/**
 * Implementação em memória (dev/testes). Os agregados do painel vêm do
 * Postgres em produção; aqui devolvemos coleções vazias/zeradas — o que os
 * testes exercitam é a REGRA (permissão) no AdminService, não a consulta.
 */
export class InMemoryAdminRepository implements AdminRepository {
  private admins = new Map<string, AdminUserRecord>();
  private resetsSent: string[] = [];
  private userEmails = new Map<string, string>();

  /** Helpers de teste/dev */
  addAdmin(userId: string, role: AdminRole, status: 'active' | 'inactive' = 'active'): AdminUserRecord {
    const record: AdminUserRecord = {
      id: randomUUID(),
      userId,
      role,
      status,
      createdAt: new Date().toISOString(),
    };
    this.admins.set(userId, record);
    return record;
  }

  addUserEmail(userId: string, email: string): void {
    this.userEmails.set(userId, email);
  }

  get sentResets(): readonly string[] {
    return this.resetsSent;
  }

  async findAdminByUserId(userId: string): Promise<AdminUserRecord | null> {
    return this.admins.get(userId) ?? null;
  }

  async dashboardStats(): Promise<AdminDashboardStats> {
    return {
      companiesTotal: 0,
      companiesActive: 0,
      companiesIncomplete: 0,
      usersTotal: this.userEmails.size,
      expensesTotal: 0,
      activitiesTotal: 0,
      plan: 'beta',
    };
  }

  async listCompanies(): Promise<AdminCompanyRow[]> {
    return [];
  }

  async getCompanyDetail(_companyId: string): Promise<AdminCompanyDetail | null> {
    return null;
  }

  async listUsers(): Promise<AdminUserRow[]> {
    return [...this.userEmails.entries()].map(([id, email]) => ({
      id,
      fullName: null,
      email,
      createdAt: new Date().toISOString(),
      lastSignInAt: null,
      companiesCount: 0,
      adminRole: this.admins.get(id)?.status === 'active' ? this.admins.get(id)!.role : null,
    }));
  }

  async getUserDetail(userId: string): Promise<AdminUserDetail | null> {
    const email = this.userEmails.get(userId);
    if (!email) return null;
    const admin = this.admins.get(userId);
    return {
      id: userId,
      fullName: null,
      email,
      createdAt: new Date().toISOString(),
      lastSignInAt: null,
      adminRole: admin?.status === 'active' ? admin.role : null,
      memberships: [],
    };
  }

  async sendPasswordReset(email: string): Promise<void> {
    this.resetsSent.push(email);
  }
}
