import { randomUUID } from 'node:crypto';
import type { Category } from '../../domain/category';
import type { CategoryPatch, CategoryRepository } from '../category.repository';

export class InMemoryCategoryRepository implements CategoryRepository {
  private categories = new Map<string, Category>();

  async listByCompany(companyId: string): Promise<Category[]> {
    return [...this.categories.values()]
      .filter((c) => c.companyId === companyId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async findById(companyId: string, categoryId: string): Promise<Category | null> {
    const c = this.categories.get(categoryId);
    return c && c.companyId === companyId ? c : null;
  }

  async create(data: Omit<Category, 'id' | 'createdAt'>): Promise<Category> {
    const dup = [...this.categories.values()].some(
      (c) => c.companyId === data.companyId && c.name.toLowerCase() === data.name.toLowerCase(),
    );
    if (dup) throw new Error('DUPLICATE_CATEGORY');
    const category: Category = { ...data, id: randomUUID(), createdAt: new Date() };
    this.categories.set(category.id, category);
    return category;
  }

  async createMany(data: Omit<Category, 'id' | 'createdAt'>[]): Promise<Category[]> {
    const out: Category[] = [];
    for (const d of data) out.push(await this.create(d));
    return out;
  }

  async update(categoryId: string, patch: CategoryPatch): Promise<Category> {
    const c = this.categories.get(categoryId);
    if (!c) throw new Error(`Categoria ${categoryId} não encontrada`);
    const updated: Category = { ...c, ...patch };
    this.categories.set(categoryId, updated);
    return updated;
  }

  async delete(categoryId: string): Promise<void> {
    this.categories.delete(categoryId);
  }
}
