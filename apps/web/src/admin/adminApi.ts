import type {
  AdminCompanyDetail,
  AdminCompanyRow,
  AdminDashboardStats,
  AdminMe,
  AdminUserDetail,
  AdminUserRow,
} from '@plim/shared';
import { apiFetch } from '../lib/api';

/**
 * Cliente do Painel Administrativo interno. O front só APRESENTA:
 * a permissão real é validada na API em toda chamada (403 NOT_ADMIN).
 */
export const adminApi = {
  me(): Promise<AdminMe> {
    return apiFetch<AdminMe>('/admin/me');
  },
  dashboard(): Promise<AdminDashboardStats> {
    return apiFetch<AdminDashboardStats>('/admin/dashboard');
  },
  listCompanies(): Promise<AdminCompanyRow[]> {
    return apiFetch<AdminCompanyRow[]>('/admin/companies');
  },
  companyDetail(companyId: string): Promise<AdminCompanyDetail> {
    return apiFetch<AdminCompanyDetail>(`/admin/companies/${companyId}`);
  },
  listUsers(): Promise<AdminUserRow[]> {
    return apiFetch<AdminUserRow[]>('/admin/users');
  },
  userDetail(userId: string): Promise<AdminUserDetail> {
    return apiFetch<AdminUserDetail>(`/admin/users/${userId}`);
  },
  sendPasswordReset(userId: string): Promise<{ sentTo: string }> {
    return apiFetch<{ sentTo: string }>(`/admin/users/${userId}/reset-password`, { method: 'POST' });
  },
};
