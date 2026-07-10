import type {
  CreateRecurringCostInput,
  RecurringCost,
  RecurringCostList,
  UpdateRecurringCostInput,
} from '@plim/shared';
import { apiFetch } from '../lib/api';

export const recurringApi = {
  list(companyId: string): Promise<RecurringCostList> {
    return apiFetch<RecurringCostList>(`/companies/${companyId}/recurring-costs`);
  },

  create(companyId: string, input: CreateRecurringCostInput): Promise<RecurringCost> {
    return apiFetch<RecurringCost>(`/companies/${companyId}/recurring-costs`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  update(companyId: string, costId: string, input: UpdateRecurringCostInput): Promise<RecurringCost> {
    return apiFetch<RecurringCost>(`/companies/${companyId}/recurring-costs/${costId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },
};
