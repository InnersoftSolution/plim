import type { CategoryType } from '@plim/shared';

/** Categoria de movimentação, escopada por empresa. */
export interface Category {
  id: string;
  companyId: string;
  name: string;
  color: string | null;
  icon: string | null;
  type: CategoryType;
  archived: boolean;
  createdAt: Date;
}
