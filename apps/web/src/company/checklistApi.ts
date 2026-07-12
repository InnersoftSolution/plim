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

  update(
    companyId: string,
    itemId: string,
    patch: { status?: ChecklistStatus; note?: string | null },
  ): Promise<CompanyChecklistItem> {
    return apiFetch<CompanyChecklistItem>(`/companies/${companyId}/checklist/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  setStatus(companyId: string, itemId: string, status: ChecklistStatus): Promise<CompanyChecklistItem> {
    return this.update(companyId, itemId, { status });
  },

  saveNote(companyId: string, itemId: string, note: string | null): Promise<CompanyChecklistItem> {
    return this.update(companyId, itemId, { note });
  },

  createCustom(companyId: string, input: CreateChecklistItemInput): Promise<CompanyChecklistItem> {
    return apiFetch<CompanyChecklistItem>(`/companies/${companyId}/checklist`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
};
