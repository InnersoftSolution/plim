import {
  defaultCategorySeed,
  type Category as CategoryDto,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from '@plim/shared';
import type { Category } from '../domain/category';
import type { CategoryRepository } from '../repositories/category.repository';
import type { CompanyService } from './company.service';
import { DomainError, NotFoundError } from '../lib/errors';

function toDto(c: Category): CategoryDto {
  return {
    id: c.id,
    companyId: c.companyId,
    name: c.name,
    color: c.color,
    icon: c.icon,
    type: c.type,
    archived: c.archived,
  };
}

/**
 * Categorias de movimentação, por empresa. Na primeira leitura de uma empresa
 * sem categorias, cria o seed inicial (Tecnologia, Assinaturas, etc.) — assim
 * empresas antigas ganham as categorias comuns sem migração de dados.
 */
export class CategoryService {
  constructor(
    private readonly companyService: CompanyService,
    private readonly repo: CategoryRepository,
  ) {}

  async list(companyId: string, actingUserId?: string | null): Promise<CategoryDto[]> {
    await this.companyService.getOverview(companyId, actingUserId);
    let categories = await this.repo.listByCompany(companyId);
    if (categories.length === 0) {
      try {
        categories = await this.repo.createMany(
          defaultCategorySeed.map((s) => ({
            companyId,
            name: s.name,
            color: s.color,
            icon: null,
            type: 'ambos' as const,
            archived: false,
          })),
        );
      } catch {
        // Corrida entre duas abas seedando ao mesmo tempo: relê o que ficou.
        categories = await this.repo.listByCompany(companyId);
      }
    }
    return categories.map(toDto);
  }

  async create(
    companyId: string,
    input: CreateCategoryInput,
    actingUserId?: string | null,
  ): Promise<CategoryDto> {
    await this.companyService.getOverview(companyId, actingUserId);
    try {
      const category = await this.repo.create({
        companyId,
        name: input.name,
        color: input.color ?? null,
        icon: input.icon ?? null,
        type: input.type ?? 'ambos',
        archived: false,
      });
      return toDto(category);
    } catch (err) {
      if (err instanceof Error && err.message === 'DUPLICATE_CATEGORY') {
        throw new DomainError('DUPLICATE_CATEGORY', 'Já existe uma categoria com esse nome.', 409);
      }
      throw err;
    }
  }

  async update(
    companyId: string,
    categoryId: string,
    input: UpdateCategoryInput,
    actingUserId?: string | null,
  ): Promise<CategoryDto> {
    await this.companyService.getOverview(companyId, actingUserId);
    const existing = await this.repo.findById(companyId, categoryId);
    if (!existing) throw new NotFoundError('CATEGORY_NOT_FOUND', 'Categoria não encontrada.');
    try {
      const updated = await this.repo.update(categoryId, {
        name: input.name,
        color: input.color,
        icon: input.icon,
        type: input.type,
        archived: input.archived,
      });
      return toDto(updated);
    } catch (err) {
      if (err instanceof Error && err.message === 'DUPLICATE_CATEGORY') {
        throw new DomainError('DUPLICATE_CATEGORY', 'Já existe uma categoria com esse nome.', 409);
      }
      throw err;
    }
  }

  async remove(companyId: string, categoryId: string, actingUserId?: string | null): Promise<void> {
    await this.companyService.getOverview(companyId, actingUserId);
    const existing = await this.repo.findById(companyId, categoryId);
    if (!existing) throw new NotFoundError('CATEGORY_NOT_FOUND', 'Categoria não encontrada.');
    // Movimentações que usam a categoria ficam com category_id nulo (FK set null).
    await this.repo.delete(categoryId);
  }
}
