import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryCompanyRepository } from '../repositories/in-memory/company.repository.memory';
import { InMemoryCategoryRepository } from '../repositories/in-memory/category.repository.memory';
import { CompanyService } from './company.service';
import { CategoryService } from './category.service';

describe('CategoryService', () => {
  let companyService: CompanyService;
  let categories: CategoryService;
  let companyId: string;

  beforeEach(async () => {
    companyService = new CompanyService(new InMemoryCompanyRepository());
    categories = new CategoryService(companyService, new InMemoryCategoryRepository());
    const { company } = await companyService.createCompany(
      { name: 'plim' },
      { id: 'u1', fullName: 'Dona', email: 'dona@plim.work' },
    );
    companyId = company.id;
  });

  it('primeira listagem cria o seed inicial de categorias', async () => {
    const list = await categories.list(companyId, 'u1');
    expect(list.length).toBeGreaterThanOrEqual(8);
    expect(list.map((c) => c.name)).toContain('Tecnologia');
    expect(list.map((c) => c.name)).toContain('Outros');
  });

  it('não duplica o seed em listagens seguintes', async () => {
    const first = await categories.list(companyId, 'u1');
    const second = await categories.list(companyId, 'u1');
    expect(second.length).toBe(first.length);
  });

  it('cria categoria nova e recusa nome duplicado (case-insensitive)', async () => {
    const created = await categories.create(companyId, { name: 'Adobe', color: '#000' }, 'u1');
    expect(created.name).toBe('Adobe');
    await expect(categories.create(companyId, { name: 'adobe' }, 'u1')).rejects.toMatchObject({
      code: 'DUPLICATE_CATEGORY',
    });
  });

  it('arquivar categoria via update mantém no repositório', async () => {
    const created = await categories.create(companyId, { name: 'Marketing X' }, 'u1');
    const updated = await categories.update(companyId, created.id, { archived: true }, 'u1');
    expect(updated.archived).toBe(true);
  });

  it('categoria de outra empresa não é acessível (não é membro)', async () => {
    const created = await categories.create(companyId, { name: 'Privada' }, 'u1');
    await expect(
      categories.update(companyId, created.id, { name: 'Nova' }, 'u-estranho'),
    ).rejects.toMatchObject({ code: 'NOT_A_MEMBER' });
  });

  it('excluir categoria inexistente devolve CATEGORY_NOT_FOUND', async () => {
    await expect(
      categories.remove(companyId, '00000000-0000-0000-0000-000000000000', 'u1'),
    ).rejects.toMatchObject({ code: 'CATEGORY_NOT_FOUND' });
  });
});
