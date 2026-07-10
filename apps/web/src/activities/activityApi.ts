import type {
  Activity,
  ChangeActivityStatusInput,
  CreateActivityInput,
  UpdateActivityInput,
} from '@plim/shared';
import { apiFetch } from '../lib/api';

export const activityApi = {
  list(companyId: string): Promise<Activity[]> {
    return apiFetch<Activity[]>(`/companies/${companyId}/activities`);
  },

  create(companyId: string, input: CreateActivityInput): Promise<Activity> {
    return apiFetch<Activity>(`/companies/${companyId}/activities`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  update(companyId: string, activityId: string, input: UpdateActivityInput): Promise<Activity> {
    return apiFetch<Activity>(`/companies/${companyId}/activities/${activityId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  changeStatus(companyId: string, activityId: string, input: ChangeActivityStatusInput): Promise<Activity> {
    return apiFetch<Activity>(`/companies/${companyId}/activities/${activityId}/status`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  addChecklistItem(companyId: string, activityId: string, title: string): Promise<Activity> {
    return apiFetch<Activity>(`/companies/${companyId}/activities/${activityId}/checklist`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
  },

  setChecklistItem(companyId: string, activityId: string, itemId: string, isCompleted: boolean): Promise<Activity> {
    return apiFetch<Activity>(`/companies/${companyId}/activities/${activityId}/checklist/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ isCompleted }),
    });
  },

  removeChecklistItem(companyId: string, activityId: string, itemId: string): Promise<Activity> {
    return apiFetch<Activity>(`/companies/${companyId}/activities/${activityId}/checklist/${itemId}`, {
      method: 'DELETE',
    });
  },
};

/* ── helpers de apresentação (deterministas) ── */

/** Segunda-feira (YYYY-MM-DD) da semana atual. */
export function currentWeekStart(): string {
  const d = new Date();
  const dow = d.getDay(); // 0=dom … 6=sáb
  const deltaToMonday = (dow + 6) % 7;
  d.setDate(d.getDate() - deltaToMonday);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Rótulo do período: "06 jul – 12 jul". */
export function weekRangeLabel(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  const start = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (dt: Date) => `${String(dt.getDate()).padStart(2, '0')} ${dt.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}`;
  return `${fmt(start)} – ${fmt(end)}`;
}

/** Prazo em linguagem humana relativa. */
export function dueLabel(dueDate: string | null): string {
  if (!dueDate) return 'sem prazo';
  const [y, m, d] = dueDate.split('-').map(Number);
  const due = Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((due - today) / 86_400_000);
  if (days < 0) return `atrasada ${-days} ${-days === 1 ? 'dia' : 'dias'}`;
  if (days === 0) return 'vence hoje';
  if (days === 1) return 'vence amanhã';
  if (days <= 6) return `vence em ${days} dias`;
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
