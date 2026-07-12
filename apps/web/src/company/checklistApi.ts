import type {
  ChecklistView,
  CreateChecklistItemInput,
  CompanyChecklistItem,
  ChecklistStatus,
} from '@plim/shared';
import { apiFetch } from '../lib/api';

export const checklistApi = {
  get(companyId: string): Promise<ChecklistView> {
    return apiFetch<ChecklistView>(`/companies/${companyId}/checklist`);
  },

  setStatus(companyId: string, itemId: string, status: ChecklistStatus): Promise<CompanyChecklistItem> {
    return apiFetch<CompanyChecklistItem>(`/companies/${companyId}/checklist/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  createCustom(companyId: string, input: CreateChecklistItemInput): Promise<CompanyChecklistItem> {
    return apiFetch<CompanyChecklistItem>(`/companies/${companyId}/checklist`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
};
