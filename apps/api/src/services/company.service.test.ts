import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryCompanyRepository } from '../repositories/in-memory/company.repository.memory';
import { CompanyService } from './company.service';
import { DomainError } from '../lib/errors';

describe('CompanyService', () => {
  let service: CompanyService;
  let companyId: string;

  beforeEach(async () => {
    service = new CompanyService(new InMemoryCompanyRepository());
    const { company } = await service.createCompany(
      { name: 'plim' },
      { fullName: 'Rafaelle Weran', email: 'rafaelle@plim.work' },
    );
    companyId = company.id;
  });

  it('inclui quem cria a empresa como account_owner ativo', async () => {
    const members = await service.listMembers(companyId);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ role: 'account_owner', status: 'active' });
  });

  it('adiciona sócio como partner convidado', async () => {
    const member = await service.addMember(companyId, {
      fullName: 'Maria Silva',
      email: 'maria@plim.work',
      equityPercent: 35,
    });
    expect(member).toMatchObject({ role: 'partner', status: 'invited', equityPercent: 35 });
  });

  it('permite percentual nulo (ainda não definido)', async () => {
    const member = await service.addMember(companyId, {
      fullName: 'João Souza',
      email: 'joao@plim.work',
      equityPercent: null,
    });
    expect(member.equityPercent).toBeNull();
  });

  it('rejeita soma de participações acima de 100%', async () => {
    await service.addMember(companyId, {
      fullName: 'Maria Silva',
      email: 'maria@plim.work',
      equityPercent: 60,
    });
    await expect(
      service.addMember(companyId, {
        fullName: 'João Souza',
        email: 'joao@plim.work',
        equityPercent: 41,
      }),
    ).rejects.toMatchObject({ code: 'EQUITY_SUM_EXCEEDED' });
  });

  it('aceita soma de exatamente 100%', async () => {
    await service.addMember(companyId, {
      fullName: 'Maria Silva',
      email: 'maria@plim.work',
      equityPercent: 60,
    });
    const member = await service.addMember(companyId, {
      fullName: 'João Souza',
      email: 'joao@plim.work',
      equityPercent: 40,
    });
    expect(member.equityPercent).toBe(40);
  });

  it('não soma errado com percentuais quebrados (33.33 x3)', async () => {
    for (const [i, pct] of [33.33, 33.33, 33.33].entries()) {
      await service.addMember(companyId, {
        fullName: `Sócio ${i}`,
        email: `socio${i}@plim.work`,
        equityPercent: pct,
      });
    }
    const members = await service.listMembers(companyId);
    expect(members).toHaveLength(4); // owner + 3 sócios
  });

  it('rejeita e-mail repetido na mesma sociedade', async () => {
    await service.addMember(companyId, {
      fullName: 'Maria Silva',
      email: 'maria@plim.work',
      equityPercent: null,
    });
    await expect(
      service.addMember(companyId, {
        fullName: 'Maria Clone',
        email: 'maria@plim.work',
        equityPercent: null,
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('falha para empresa inexistente', async () => {
    await expect(
      service.listMembers('00000000-0000-0000-0000-000000000000'),
    ).rejects.toMatchObject({ code: 'COMPANY_NOT_FOUND' });
  });

  it('define o percentual do próprio dono', async () => {
    const [owner] = await service.listMembers(companyId);
    const updated = await service.setMemberEquity(companyId, owner!.id, 50);
    expect(updated.equityPercent).toBe(50);
  });

  it('ao reeditar o dono, não soma o valor antigo dele duas vezes', async () => {
    const [owner] = await service.listMembers(companyId);
    await service.setMemberEquity(companyId, owner!.id, 60);
    // Reeditar para 70 deve ser aceito (substitui, não acumula).
    const updated = await service.setMemberEquity(companyId, owner!.id, 70);
    expect(updated.equityPercent).toBe(70);
  });

  it('rejeita percentual do dono que estoura 100% somado aos sócios', async () => {
    const [owner] = await service.listMembers(companyId);
    await service.addMember(companyId, {
      fullName: 'Maria Silva',
      email: 'maria@plim.work',
      equityPercent: 70,
    });
    await expect(service.setMemberEquity(companyId, owner!.id, 40)).rejects.toMatchObject({
      code: 'EQUITY_SUM_EXCEEDED',
    });
  });

  it('falha ao definir percentual de sócio inexistente', async () => {
    await expect(
      service.setMemberEquity(companyId, '00000000-0000-0000-0000-000000000000', 10),
    ).rejects.toMatchObject({ code: 'MEMBER_NOT_FOUND' });
  });
});

describe('CompanyService — autorização por usuário', () => {
  let service: CompanyService;
  let companyId: string;

  beforeEach(async () => {
    service = new CompanyService(new InMemoryCompanyRepository());
    const { company } = await service.createCompany(
      { name: 'plim' },
      { id: 'user-owner', fullName: 'Dona', email: 'dona@plim.work' },
    );
    companyId = company.id;
  });

  it('o dono (membro) consegue adicionar sócio', async () => {
    const member = await service.addMember(
      companyId,
      { fullName: 'Maria', email: 'maria@plim.work', equityPercent: 10 },
      'user-owner',
    );
    expect(member.role).toBe('partner');
  });

  it('quem não é membro é barrado', async () => {
    await expect(
      service.addMember(
        companyId,
        { fullName: 'Intruso', email: 'intruso@plim.work', equityPercent: 10 },
        'user-estranho',
      ),
    ).rejects.toMatchObject({ code: 'NOT_A_MEMBER' });
  });

  it('sem actingUserId (modo dev) não aplica a checagem de membro', async () => {
    const members = await service.listMembers(companyId);
    expect(members).toHaveLength(1);
  });
});
