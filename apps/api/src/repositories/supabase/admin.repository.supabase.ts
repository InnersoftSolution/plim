import type { SupabaseClient } from '@supabase/supabase-js';
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

/** Hoje todo mundo é Beta — cobrança ainda não configurada (fase 1). */
const CURRENT_PLAN = 'beta' as const;

interface AdminUserRow_DB {
  id: string;
  user_id: string;
  role: AdminRole;
  status: 'active' | 'inactive';
  created_at: string;
}

/**
 * Consultas agregadas do painel usando a service role (ignora RLS de
 * propósito: o admin enxerga o produto inteiro). A porta de entrada é
 * SEMPRE o AdminService, que valida a permissão antes de qualquer leitura.
 */
export class SupabaseAdminRepository implements AdminRepository {
  constructor(private readonly db: SupabaseClient) {}

  async findAdminByUserId(userId: string): Promise<AdminUserRecord | null> {
    const { data, error } = await this.db
      .from('admin_users')
      .select('id, user_id, role, status, created_at')
      .eq('user_id', userId)
      .maybeSingle<AdminUserRow_DB>();
    if (error) throw new Error(`admin_users: ${error.message}`);
    if (!data) return null;
    return {
      id: data.id,
      userId: data.user_id,
      role: data.role,
      status: data.status,
      createdAt: data.created_at,
    };
  }

  private async count(table: string, filter?: (q: any) => any): Promise<number> {
    let query = this.db.from(table).select('id', { count: 'exact', head: true });
    if (filter) query = filter(query);
    const { count, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    return count ?? 0;
  }

  async dashboardStats(): Promise<AdminDashboardStats> {
    const [companiesTotal, companiesActive, usersTotal, expensesTotal, activitiesTotal] = await Promise.all([
      this.count('companies'),
      this.count('companies', (q) => q.eq('onboarding_status', 'completed')),
      this.count('profiles'),
      this.count('expenses'),
      this.count('activities'),
    ]);
    return {
      companiesTotal,
      companiesActive,
      companiesIncomplete: companiesTotal - companiesActive,
      usersTotal,
      expensesTotal,
      activitiesTotal,
      plan: CURRENT_PLAN,
    };
  }

  async listCompanies(): Promise<AdminCompanyRow[]> {
    const [companiesRes, membersRes, expensesRes] = await Promise.all([
      this.db
        .from('companies')
        .select('id, name, created_at, onboarding_status, country_code, currency_code, business_stage')
        .order('created_at', { ascending: false }),
      this.db.from('company_members').select('company_id, full_name, email, role'),
      this.db.from('expenses').select('company_id'),
    ]);
    if (companiesRes.error) throw new Error(`companies: ${companiesRes.error.message}`);
    if (membersRes.error) throw new Error(`company_members: ${membersRes.error.message}`);
    if (expensesRes.error) throw new Error(`expenses: ${expensesRes.error.message}`);

    const membersByCompany = new Map<string, Array<{ full_name: string; email: string; role: string }>>();
    for (const m of membersRes.data ?? []) {
      const list = membersByCompany.get(m.company_id) ?? [];
      list.push(m);
      membersByCompany.set(m.company_id, list);
    }
    const expensesByCompany = new Map<string, number>();
    for (const e of expensesRes.data ?? []) {
      expensesByCompany.set(e.company_id, (expensesByCompany.get(e.company_id) ?? 0) + 1);
    }

    return (companiesRes.data ?? []).map((c) => {
      const members = membersByCompany.get(c.id) ?? [];
      const owner = members.find((m) => m.role === 'account_owner') ?? null;
      return {
        id: c.id,
        name: c.name,
        createdAt: c.created_at,
        onboardingStatus: c.onboarding_status ?? 'in_progress',
        countryCode: c.country_code,
        currencyCode: c.currency_code,
        businessStage: c.business_stage,
        ownerName: owner?.full_name ?? null,
        ownerEmail: owner?.email ?? null,
        membersCount: members.length,
        expensesCount: expensesByCompany.get(c.id) ?? 0,
        plan: CURRENT_PLAN,
      };
    });
  }

  async getCompanyDetail(companyId: string): Promise<AdminCompanyDetail | null> {
    const { data: company, error } = await this.db
      .from('companies')
      .select(
        'id, name, description, country_code, region, city, currency_code, business_stage, registration_number, legal_structure, onboarding_status, created_at',
      )
      .eq('id', companyId)
      .maybeSingle();
    if (error) throw new Error(`companies: ${error.message}`);
    if (!company) return null;

    const today = new Date().toISOString().slice(0, 10);
    const [membersRes, expensesCount, recurringCount, activitiesRes] = await Promise.all([
      this.db
        .from('company_members')
        .select('id, full_name, email, functional_role, role, equity_percent, status, invitation_status')
        .eq('company_id', companyId),
      this.count('expenses', (q) => q.eq('company_id', companyId)),
      this.count('recurring_costs', (q) => q.eq('company_id', companyId)),
      this.db.from('activities').select('status, due_date').eq('company_id', companyId),
    ]);
    if (membersRes.error) throw new Error(`company_members: ${membersRes.error.message}`);
    if (activitiesRes.error) throw new Error(`activities: ${activitiesRes.error.message}`);

    const members = membersRes.data ?? [];
    const owner = members.find((m) => m.role === 'account_owner') ?? null;
    const activities = activitiesRes.data ?? [];
    const activitiesOverdue = activities.filter(
      (a) => a.due_date && a.due_date < today && a.status !== 'done' && a.status !== 'cancelled',
    ).length;

    return {
      id: company.id,
      name: company.name,
      description: company.description,
      countryCode: company.country_code,
      region: company.region,
      city: company.city,
      currencyCode: company.currency_code,
      businessStage: company.business_stage,
      registrationNumber: company.registration_number,
      legalStructure: company.legal_structure,
      onboardingStatus: company.onboarding_status ?? 'in_progress',
      createdAt: company.created_at,
      owner: owner ? { fullName: owner.full_name, email: owner.email } : null,
      members: members.map((m) => ({
        id: m.id,
        fullName: m.full_name,
        email: m.email,
        functionalRole: m.functional_role,
        role: m.role,
        equityPercent: m.equity_percent === null ? null : Number(m.equity_percent),
        status: m.status,
        invitationStatus: m.invitation_status,
      })),
      usage: {
        expensesCount,
        recurringCount,
        activitiesCount: activities.length,
        activitiesOverdue,
      },
      billing: { plan: CURRENT_PLAN, subscriptionStatus: 'not_configured' },
    };
  }

  async listUsers(): Promise<AdminUserRow[]> {
    // perPage alto cobre o estágio atual; paginação real fica para quando doer.
    const [usersRes, membershipsRes, adminsRes] = await Promise.all([
      this.db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      this.db.from('company_members').select('user_id').not('user_id', 'is', null),
      this.db.from('admin_users').select('user_id, role, status'),
    ]);
    if (usersRes.error) throw new Error(`auth users: ${usersRes.error.message}`);
    if (membershipsRes.error) throw new Error(`company_members: ${membershipsRes.error.message}`);
    if (adminsRes.error) throw new Error(`admin_users: ${adminsRes.error.message}`);

    const companiesByUser = new Map<string, number>();
    for (const m of membershipsRes.data ?? []) {
      if (m.user_id) companiesByUser.set(m.user_id, (companiesByUser.get(m.user_id) ?? 0) + 1);
    }
    const adminByUser = new Map<string, AdminRole>();
    for (const a of adminsRes.data ?? []) {
      if (a.status === 'active') adminByUser.set(a.user_id, a.role as AdminRole);
    }

    return usersRes.data.users.map((u) => {
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
      return {
        id: u.id,
        fullName: (meta.full_name as string | undefined) ?? null,
        email: u.email ?? null,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
        companiesCount: companiesByUser.get(u.id) ?? 0,
        adminRole: adminByUser.get(u.id) ?? null,
      };
    });
  }

  async getUserDetail(userId: string): Promise<AdminUserDetail | null> {
    const userRes = await this.db.auth.admin.getUserById(userId);
    if (userRes.error || !userRes.data.user) return null;
    const u = userRes.data.user;

    const [membershipsRes, adminRow] = await Promise.all([
      this.db
        .from('company_members')
        .select('company_id, role, functional_role, companies(name)')
        .eq('user_id', userId),
      this.findAdminByUserId(userId),
    ]);
    if (membershipsRes.error) throw new Error(`company_members: ${membershipsRes.error.message}`);

    const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
    return {
      id: u.id,
      fullName: (meta.full_name as string | undefined) ?? null,
      email: u.email ?? null,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      adminRole: adminRow?.status === 'active' ? adminRow.role : null,
      memberships: (membershipsRes.data ?? []).map((m) => {
        const company = m.companies as unknown as { name: string } | null;
        return {
          companyId: m.company_id,
          companyName: company?.name ?? '—',
          role: m.role,
          functionalRole: m.functional_role,
          isAccountOwner: m.role === 'account_owner',
        };
      }),
    };
  }

  async sendPasswordReset(email: string): Promise<void> {
    const appUrl = process.env.APP_URL ?? 'https://app.plim.work';
    const { error } = await this.db.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/auth/callback`,
    });
    if (error) throw new Error(`reset de senha: ${error.message}`);
  }
}
