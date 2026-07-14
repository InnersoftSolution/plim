import type { Category } from '../domain/category';

/** Campos editáveis de uma categoria (só o que vier definido). */
export interface CategoryPatch {
  name?: string;
  color?: string | null;
  icon?: string | null;
  type?: Category['type'];
  archived?: boolean;
}

/** Acesso a dados das categorias. Implementações: in-memory e Supabase. */
export interface CategoryRepository {
  listByCompany(companyId: string): Promise<Category[]>;
  findById(companyId: string, categoryId: string): Promise<Category | null>;
  create(data: Omit<Category, 'id' | 'createdAt'>): Promise<Category>;
  createMany(data: Omit<Category, 'id' | 'createdAt'>[]): Promise<Category[]>;
  update(categoryId: string, patch: CategoryPatch): Promise<Category>;
  delete(categoryId: string): Promise<void>;
}
