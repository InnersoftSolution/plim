import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAdminRepository } from '../repositories/in-memory/admin.repository.memory';
import { AdminService } from './admin.service';

describe('AdminService — permissão (validada no servidor, nunca no front)', () => {
  let repo: InMemoryAdminRepository;
  let service: AdminService;

  beforeEach(() => {
    repo = new InMemoryAdminRepository();
    service = new AdminService(repo);
  });

  it('usuário comum (sem registro em admin_users) recebe NOT_ADMIN 403', async () => {
    await expect(service.me('user-comum')).rejects.toMatchObject({ code: 'NOT_ADMIN', httpStatus: 403 });
    await expect(service.dashboard('user-comum')).rejects.toMatchObject({ code: 'NOT_ADMIN' });
    await expect(service.listCompanies('user-comum')).rejects.toMatchObject({ code: 'NOT_ADMIN' });
    await expect(service.listUsers('user-comum')).rejects.toMatchObject({ code: 'NOT_ADMIN' });
  });

  it('admin ATIVO acessa e recebe o próprio papel', async () => {
    repo.addAdmin('u-admin', 'super_admin');
    await expect(service.me('u-admin')).resolves.toEqual({ role: 'super_admin' });
    await expect(service.dashboard('u-admin')).resolves.toMatchObject({ plan: 'beta' });
  });

  it('admin INATIVO é negado como usuário comum', async () => {
    repo.addAdmin('u-ex-admin', 'admin', 'inactive');
    await expect(service.me('u-ex-admin')).rejects.toMatchObject({ code: 'NOT_ADMIN', httpStatus: 403 });
  });

  it('modo dev (sem autenticação) libera como super_admin', async () => {
    await expect(service.me(null)).resolves.toEqual({ role: 'super_admin' });
  });

  it('detalhe de empresa inexistente → 404', async () => {
    repo.addAdmin('u-admin', 'super_admin');
    await expect(service.companyDetail('11111111-1111-4111-8111-111111111111', 'u-admin')).rejects.toMatchObject({
      code: 'COMPANY_NOT_FOUND',
      httpStatus: 404,
    });
  });

  it('reset de senha dispara e-mail via provedor e devolve só o destino', async () => {
    repo.addAdmin('u-admin', 'super_admin');
    repo.addUserEmail('u-alvo', 'pessoa@empresa.com');
    const result = await service.sendPasswordReset('u-alvo', 'u-admin');
    expect(result).toEqual({ sentTo: 'pessoa@empresa.com' });
    expect(repo.sentResets).toEqual(['pessoa@empresa.com']);
  });

  it('reset de senha exige permissão de admin', async () => {
    repo.addUserEmail('u-alvo', 'pessoa@empresa.com');
    await expect(service.sendPasswordReset('u-alvo', 'user-comum')).rejects.toMatchObject({ code: 'NOT_ADMIN' });
    expect(repo.sentResets).toEqual([]);
  });
});
