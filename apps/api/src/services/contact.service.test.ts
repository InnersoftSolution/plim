import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryCompanyRepository } from '../repositories/in-memory/company.repository.memory';
import { InMemoryContactRepository } from '../repositories/in-memory/contact.repository.memory';
import { CompanyService } from './company.service';
import { ContactService } from './contact.service';

describe('ContactService', () => {
  let companyService: CompanyService;
  let contacts: ContactService;
  let companyId: string;

  beforeEach(async () => {
    companyService = new CompanyService(new InMemoryCompanyRepository());
    contacts = new ContactService(companyService, new InMemoryContactRepository());
    const { company } = await companyService.createCompany(
      { name: 'plim' },
      { id: 'u1', fullName: 'Dona', email: 'dona@plim.work' },
    );
    companyId = company.id;
  });

  it('cria contato (empresa e pessoa física) e lista ordenado por nome', async () => {
    await contacts.create(companyId, { name: 'Zeta Serviços', type: 'empresa', document: '12.345.678/0001-00' }, 'u1');
    await contacts.create(companyId, { name: 'Ana Prestadora', type: 'pessoa' }, 'u1');
    const list = await contacts.list(companyId, 'u1');
    expect(list.map((c) => c.name)).toEqual(['Ana Prestadora', 'Zeta Serviços']);
    expect(list[1]!.document).toBe('12.345.678/0001-00');
    expect(list[0]!.type).toBe('pessoa');
  });

  it('recusa nome duplicado (case-insensitive)', async () => {
    await contacts.create(companyId, { name: 'Adobe', type: 'empresa' }, 'u1');
    await expect(contacts.create(companyId, { name: 'adobe', type: 'empresa' }, 'u1')).rejects.toMatchObject({
      code: 'DUPLICATE_CONTACT',
    });
  });

  it('atualiza dados e arquiva', async () => {
    const created = await contacts.create(companyId, { name: 'Fornecedor X', type: 'empresa' }, 'u1');
    const updated = await contacts.update(
      companyId,
      created.id,
      { email: 'contato@x.com', archived: true },
      'u1',
    );
    expect(updated.email).toBe('contato@x.com');
    expect(updated.archived).toBe(true);
  });

  it('quem não é membro não acessa contatos', async () => {
    await expect(contacts.list(companyId, 'u-estranho')).rejects.toMatchObject({ code: 'NOT_A_MEMBER' });
  });

  it('excluir contato inexistente devolve CONTACT_NOT_FOUND', async () => {
    await expect(
      contacts.remove(companyId, '00000000-0000-0000-0000-000000000000', 'u1'),
    ).rejects.toMatchObject({ code: 'CONTACT_NOT_FOUND' });
  });
});
