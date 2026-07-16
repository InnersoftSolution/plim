import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryCompanyRepository } from '../repositories/in-memory/company.repository.memory';
import { CompanyService } from './company.service';
import { InMemoryInviteSender, type InviteSender } from '../lib/invite-sender';
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

describe('CompanyService: convites de sócio', () => {
  let repo: InMemoryCompanyRepository;
  let invites: InMemoryInviteSender;
  let service: CompanyService;
  let companyId: string;

  beforeEach(async () => {
    repo = new InMemoryCompanyRepository();
    invites = new InMemoryInviteSender();
    service = new CompanyService(repo, undefined, invites);
    const { company } = await service.createCompany(
      { name: 'OkiDoki' },
      { id: 'u-owner', fullName: 'Rafaelle Weran', email: 'rafaelle@plim.work' },
    );
    companyId = company.id;
  });

  it('cadastrar sócio com e-mail envia convite na hora e marca "invited"', async () => {
    const member = await service.addMember(
      companyId,
      { fullName: 'Vanessa Lima', email: 'vanessa@plim.work', equityPercent: null },
      'u-owner',
    );
    expect(member.invitationStatus).toBe('invited');
    expect(invites.sent).toHaveLength(1);
    expect(invites.sent[0]).toMatchObject({
      email: 'vanessa@plim.work',
      companyName: 'OkiDoki',
      inviterName: 'Rafaelle Weran',
    });
  });

  it('cadastrar sócio sem e-mail não envia convite', async () => {
    const member = await service.addMember(
      companyId,
      { fullName: 'Sem Email', email: null, equityPercent: null },
      'u-owner',
    );
    expect(member.invitationStatus).toBe('not_invited');
    expect(invites.sent).toHaveLength(0);
  });

  it('reenvia o convite de um sócio já cadastrado', async () => {
    const m = await service.addMember(
      companyId,
      { fullName: 'Vanessa Lima', email: 'vanessa@plim.work', equityPercent: null },
      'u-owner',
    );
    const again = await service.inviteMember(companyId, m.id, 'u-owner');
    expect(again.invitationStatus).toBe('invited');
    expect(invites.sent).toHaveLength(2);
  });

  it('convidar sócio sem e-mail orienta a cadastrar o e-mail antes', async () => {
    const m = await service.addMember(
      companyId,
      { fullName: 'Sem Email', email: null, equityPercent: null },
      'u-owner',
    );
    await expect(service.inviteMember(companyId, m.id, 'u-owner')).rejects.toMatchObject({
      code: 'MEMBER_WITHOUT_EMAIL',
    });
  });

  it('pessoa já cadastrada no Plim também fica como convidada (vínculo no login)', async () => {
    invites.registered.add('ja-tem-conta@plim.work');
    const member = await service.addMember(
      companyId,
      { fullName: 'Quem Já Tem Conta', email: 'ja-tem-conta@plim.work', equityPercent: null },
      'u-owner',
    );
    expect(member.invitationStatus).toBe('invited');
    expect(invites.sent).toHaveLength(0); // nenhum e-mail novo, mas o vínculo vem no login
  });

  it('cadastrar com e-mail novo devolve inviteOutcome "sent"', async () => {
    const member = await service.addMember(
      companyId,
      { fullName: 'Vanessa Lima', email: 'vanessa@plim.work', equityPercent: null },
      'u-owner',
    );
    expect(member.inviteOutcome).toBe('sent');
  });

  it('cadastrar quem já tem conta devolve inviteOutcome "already_registered" (front avisa que é só entrar)', async () => {
    invites.registered.add('ja-tem-conta@plim.work');
    const member = await service.addMember(
      companyId,
      { fullName: 'Quem Já Tem Conta', email: 'ja-tem-conta@plim.work', equityPercent: null },
      'u-owner',
    );
    expect(member.inviteOutcome).toBe('already_registered');
  });

  it('envio que falha não derruba o cadastro: outcome "failed" e o erro é logado', async () => {
    const boom = new Error('SMTP fora do ar');
    const failing: InviteSender = {
      sendInvite: () => Promise.reject(boom),
    };
    const errors: unknown[] = [];
    const logger = { error: (obj: unknown) => errors.push(obj) };
    const svc = new CompanyService(repo, undefined, failing, logger);
    const member = await svc.addMember(
      companyId,
      { fullName: 'Falhou', email: 'falhou@plim.work', equityPercent: null },
      'u-owner',
    );
    expect(member.id).toBeTruthy(); // sócio criado mesmo com o envio falhando
    expect(member.invitationStatus).toBe('not_invited');
    expect(member.inviteOutcome).toBe('failed');
    expect(errors).toHaveLength(1); // não é mais silencioso: falha vai pro log
  });

  it('o dono da conta exclui um sócio definitivamente', async () => {
    const m = await service.addMember(
      companyId,
      { fullName: 'Vanessa Lima', email: 'vanessa@plim.work', equityPercent: 20 },
      'u-owner',
    );
    await service.removeMember(companyId, m.id, 'u-owner');
    const members = await service.listMembers(companyId, 'u-owner');
    expect(members.find((x) => x.id === m.id)).toBeUndefined();
  });

  it('sócio que não é dono da conta não consegue excluir', async () => {
    const m = await service.addMember(
      companyId,
      { fullName: 'Vanessa Lima', email: 'vanessa@plim.work', equityPercent: null },
      'u-owner',
    );
    // Vanessa entra no Plim (vira membro ativo, mas partner).
    await service.listMyCompanies('u-vanessa', 'vanessa@plim.work');
    const other = await service.addMember(
      companyId,
      { fullName: 'Outro Sócio', email: 'outro@plim.work', equityPercent: null },
      'u-owner',
    );
    await expect(service.removeMember(companyId, other.id, 'u-vanessa')).rejects.toMatchObject({
      code: 'NOT_ACCOUNT_OWNER',
    });
    expect(m.id).toBeTruthy();
  });

  it('o dono da conta não pode ser excluído', async () => {
    const members = await service.listMembers(companyId, 'u-owner');
    const owner = members.find((x) => x.role === 'account_owner')!;
    await expect(service.removeMember(companyId, owner.id, 'u-owner')).rejects.toMatchObject({
      code: 'OWNER_CANNOT_BE_REMOVED',
    });
  });

  it('vincula sozinho o sócio convidado no primeiro login (claim por e-mail)', async () => {
    await service.addMember(
      companyId,
      { fullName: 'Vanessa Lima', email: 'vanessa@plim.work', equityPercent: null },
      'u-owner',
    );
    // Vanessa entra pela primeira vez com a conta dela.
    const companies = await service.listMyCompanies('u-vanessa', 'vanessa@plim.work');
    expect(companies.map((c) => c.id)).toContain(companyId);
    const members = await service.listMembers(companyId, 'u-vanessa');
    const v = members.find((m) => m.email === 'vanessa@plim.work');
    expect(v).toMatchObject({ userId: 'u-vanessa', status: 'active', invitationStatus: 'accepted' });
  });
});

describe('CompanyService (multiempresa)', () => {
  let service: CompanyService;

  beforeEach(() => {
    service = new CompanyService(new InMemoryCompanyRepository());
  });

  const create = (name: string, id: string, email: string) =>
    service.createCompany({ name }, { id, fullName: 'Fulano', email });

  it('sempre permite a PRIMEIRA empresa, mesmo sem permissão de plano', async () => {
    const { company } = await create('primeira', 'u-comum', 'comum@exemplo.com');
    expect(company.name).toBe('primeira');
  });

  it('bloqueia a SEGUNDA empresa para quem não tem permissão', async () => {
    await create('primeira', 'u-comum', 'comum@exemplo.com');
    await expect(create('segunda', 'u-comum', 'comum@exemplo.com')).rejects.toMatchObject({
      code: 'PLAN_COMPANY_LIMIT',
    });
  });

  it('libera múltiplas empresas para o e-mail permitido (case-insensitive)', async () => {
    await create('A', 'u-raffa', 'RAFAELLE.Rodrigues@gmail.com');
    const { company } = await create('B', 'u-raffa', 'rafaelle.rodrigues@GMAIL.com');
    expect(company.name).toBe('B');
    const companies = await service.listMyCompanies('u-raffa', 'rafaelle.rodrigues@gmail.com');
    expect(companies).toHaveLength(2);
  });

  it('lembra a empresa ativa e só aceita empresa da qual o usuário é membro', async () => {
    const { company } = await create('A', 'u-raffa', 'rafaelle.rodrigues@gmail.com');
    expect(await service.getActiveCompanyId('u-raffa')).toBeNull();
    await service.setActiveCompany(company.id, 'u-raffa');
    expect(await service.getActiveCompanyId('u-raffa')).toBe(company.id);
  });

  it('recusa definir como ativa uma empresa de que não se é membro', async () => {
    const { company } = await create('A', 'u-raffa', 'rafaelle.rodrigues@gmail.com');
    await expect(service.setActiveCompany(company.id, 'u-estranho')).rejects.toMatchObject({
      code: 'NOT_A_MEMBER',
    });
  });
});
