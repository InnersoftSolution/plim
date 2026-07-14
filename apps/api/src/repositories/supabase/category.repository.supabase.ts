import type { SupabaseClient } from '@supabase/supabase-js';
import type { CategoryType } from '@plim/shared';
import type { Category } from '../../domain/category';
import type { CategoryPatch, CategoryRepository } from '../category.repository';

interface Row {
  id: string;
  company_id: string;
  name: string;
  color: string | null;
  icon: string | null;
  type: string;
  archived: boolean;
  created_at: string;
}

function toCategory(row: Row): Category {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    color: row.color,
    icon: row.icon,
    type: row.type as CategoryType,
    archived: row.archived,
    createdAt: new Date(row.created_at),
  };
}

export class SupabaseCategoryRepository implements CategoryRepository {
  constructor(private readonly db: SupabaseClient) {}

  async listByCompany(companyId: string): Promise<Category[]> {
    const { data, error } = await this.db
      .from('categories')
      .select('*')
      .eq('company_id', companyId)
      .order('name', { ascending: true })
      .returns<Row[]>();
    if (error) throw new Error(`Falha ao listar categorias: ${error.message}`);
    return (data ?? []).map(toCategory);
  }

  async findById(companyId: string, categoryId: string): Promise<Category | null> {
    const { data, error } = await this.db
      .from('categories')
      .select('*')
      .eq('company_id', companyId)
      .eq('id', categoryId)
      .maybeSingle<Row>();
    if (error) throw new Error(`Falha ao buscar categoria: ${error.message}`);
    return data ? toCategory(data) : null;
  }

  async create(data: Omit<Category, 'id' | 'createdAt'>): Promise<Category> {
    const { data: row, error } = await this.db
      .from('categories')
      .insert({
        company_id: data.companyId,
        name: data.name,
        color: data.color,
        icon: data.icon,
        type: data.type,
        archived: data.archived,
      })
      .select('*')
      .single<Row>();
    if (error || !row) {
      // 23505 = unique_violation (nome duplicado na empresa).
      if ((error as { code?: string } | null)?.code === '23505') throw new Error('DUPLICATE_CATEGORY');
      throw new Error(`Falha ao criar categoria: ${error?.message}`);
    }
    return toCategory(row);
  }

  async createMany(data: Omit<Category, 'id' | 'createdAt'>[]): Promise<Category[]> {
    if (data.length === 0) return [];
    const { data: rows, error } = await this.db
      .from('categories')
      .insert(
        data.map((d) => ({
          company_id: d.companyId,
          name: d.name,
          color: d.color,
          icon: d.icon,
          type: d.type,
          archived: d.archived,
        })),
      )
      .select('*')
      .returns<Row[]>();
    if (error) throw new Error(`Falha ao criar categorias: ${error.message}`);
    return (rows ?? []).map(toCategory);
  }

  async update(categoryId: string, patch: CategoryPatch): Promise<Category> {
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.color !== undefined) row.color = patch.color;
    if (patch.icon !== undefined) row.icon = patch.icon;
    if (patch.type !== undefined) row.type = patch.type;
    if (patch.archived !== undefined) row.archived = patch.archived;
    const { data, error } = await this.db
      .from('categories')
      .update(row)
      .eq('id', categoryId)
      .select('*')
      .single<Row>();
    if (error || !data) {
      if ((error as { code?: string } | null)?.code === '23505') throw new Error('DUPLICATE_CATEGORY');
      throw new Error(`Falha ao atualizar categoria: ${error?.message}`);
    }
    return toCategory(data);
  }

  async delete(categoryId: string): Promise<void> {
    const { error } = await this.db.from('categories').delete().eq('id', categoryId);
    if (error) throw new Error(`Falha ao excluir categoria: ${error.message}`);
  }
}
