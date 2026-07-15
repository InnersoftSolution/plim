import type { Contact, CreateContactInput, UpdateContactInput } from '@plim/shared';
import { apiFetch } from '../lib/api';

export const contactApi = {
  list(companyId: string): Promise<Contact[]> {
    return apiFetch<Contact[]>(`/companies/${companyId}/contacts`);
  },

  create(companyId: string, input: CreateContactInput): Promise<Contact> {
    return apiFetch<Contact>(`/companies/${companyId}/contacts`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  update(companyId: string, contactId: string, input: UpdateContactInput): Promise<Contact> {
    return apiFetch<Contact>(`/companies/${companyId}/contacts/${contactId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  remove(companyId: string, contactId: string): Promise<void> {
    return apiFetch<void>(`/companies/${companyId}/contacts/${contactId}`, { method: 'DELETE' });
  },
};
