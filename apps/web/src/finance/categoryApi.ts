import type { Category, CreateCategoryInput, UpdateCategoryInput } from '@plim/shared';
import { apiFetch } from '../lib/api';

export const categoryApi = {
  list(companyId: string): Promise<Category[]> {
    return apiFetch<Category[]>(`/companies/${companyId}/categories`);
  },

  create(companyId: string, input: CreateCategoryInput): Promise<Category> {
    return apiFetch<Category>(`/companies/${companyId}/categories`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  update(companyId: string, categoryId: string, input: UpdateCategoryInput): Promise<Category> {
    return apiFetch<Category>(`/companies/${companyId}/categories/${categoryId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  remove(companyId: string, categoryId: string): Promise<void> {
    return apiFetch<void>(`/companies/${companyId}/categories/${categoryId}`, { method: 'DELETE' });
  },
};
