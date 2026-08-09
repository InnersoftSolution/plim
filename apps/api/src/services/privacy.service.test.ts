import { beforeEach, describe, expect, it } from 'vitest';
import { ACCOUNT_DELETION_CONFIRM_TEXT, DELETION_GRACE_DAYS } from '@plim/shared';
import { InMemoryCompanyRepository } from '../repositories/in-memory/company.repository.memory';
import { InMemoryPrivacyRepository } from '../repositories/in-memory/privacy.repository.memory';
import { CompanyService } from './company.service';
import { PrivacyService } from './privacy.service';

/** Data fixa: a carência é conferida em dias, então o relógio não pode andar. */
const AGORA = new Date('2026-08-08T12:00:00.000Z');

const DONA = { id: 'u-dona', fullName: 'Rafaelle', email: 'dona@plim.work' };
const SOCIO = { id: 'u-socio', fullName: 'Sócio', email: 'socio@plim.work' };

describe('PrivacyService', () => {
  let companyRepo: InMemoryCompanyRepository;
  let privacyRepo: InMemoryPrivacyRepository;
  let companies: CompanyService;
  let privacy: PrivacyService;
  let companyId: string;

  beforeEach(async () => {
    companyRepo = new InMemoryCompanyRepository();
    privacyRepo = new InMemoryPrivacyRepository();
    companies = new CompanyService(companyRepo);
    privacy = new PrivacyService(companyRepo, privacyRepo, () => AGORA);
    const { company } = await companies.createCompany({ name: 'Startup Teste' }, DONA);
    companyId = company.id;
  });

  /** Sócio com conta vinculada (aceitou o convite). */
  async function adicionaSocioComConta() {
    const member = await companies.addMember(
      companyId,
      { fullName: 'Sócio', email: SOCIO.email, equityPercent: null },
      DONA.id,
    );
    return companyRepo.updateMember(member.id, { userId: SOCIO.id, status: 'active' });
  }

  describe('exclusão da empresa', () => {
    it('agenda com a carência de 30 dias quando o nome confere', async () => {
      const preview = await privacy.requestCompanyDeletion(
        companyId,
        { confirmName: 'Startup Teste' },
        DONA,
      );
      expect(preview.deletion).not.toBeNull();
      expect(preview.deletion!.daysLeft).toBe(DELETION_GRACE_DAYS);
      expect(preview.graceDays).toBe(DELETION_GRACE_DAYS);
      expect(new Date(preview.deletion!.scheduledFor).toISOString()).toBe(
        new Date(AGORA.getTime() + DELETION_GRACE_DAYS * 86_400_000).toISOString(),
      );
    });

    it('registra o pedido para comprovar o cumprimento', async () => {
      await privacy.requestCompanyDeletion(companyId, { confirmName: 'Startup Teste' }, DONA);
      expect(privacyRepo.log).toHaveLength(1);
      expect(privacyRepo.log[0]).toMatchObject({
        subjectType: 'company',
        subjectId: companyId,
        subjectLabel: 'Startup Teste',
        requestedByEmail: DONA.email,
      });
    });

    it('aceita o nome com espaços sobrando e caixa diferente', async () => {
      const preview = await privacy.requestCompanyDeletion(
        companyId,
        { confirmName: '  startup   TESTE ' },
        DONA,
      );
      expect(preview.deletion).not.toBeNull();
    });

    it('recusa quando o nome digitado não confere', async () => {
      await expect(
        privacy.requestCompanyDeletion(companyId, { confirmName: 'Outra Empresa' }, DONA),
      ).rejects.toMatchObject({ code: 'CONFIRM_NAME_MISMATCH' });
    });

    it('só o dono da conta pode excluir', async () => {
      await adicionaSocioComConta();
      await expect(
        privacy.requestCompanyDeletion(companyId, { confirmName: 'Startup Teste' }, SOCIO),
      ).rejects.toMatchObject({ code: 'NOT_ACCOUNT_OWNER', httpStatus: 403 });
    });

    it('quem não é da empresa nem enxerga a pré-visualização', async () => {
      await expect(
        privacy.getCompanyDeletionPreview(companyId, { id: 'u-estranho' }),
      ).rejects.toMatchObject({ code: 'NOT_A_MEMBER', httpStatus: 403 });
    });

    it('o sócio vê o aviso e de quem partiu o pedido', async () => {
      await adicionaSocioComConta();
      await privacy.requestCompanyDeletion(companyId, { confirmName: 'Startup Teste' }, DONA);
      const preview = await privacy.getCompanyDeletionPreview(companyId, SOCIO);
      expect(preview.deletion?.requestedByName).toBe('Rafaelle');
      expect(preview.canDelete).toBe(false);
    });

    it('não agenda duas vezes', async () => {
      await privacy.requestCompanyDeletion(companyId, { confirmName: 'Startup Teste' }, DONA);
      await expect(
        privacy.requestCompanyDeletion(companyId, { confirmName: 'Startup Teste' }, DONA),
      ).rejects.toMatchObject({ code: 'DELETION_ALREADY_SCHEDULED' });
    });

    it('cancelar limpa o agendamento e fecha o registro', async () => {
      await privacy.requestCompanyDeletion(companyId, { confirmName: 'Startup Teste' }, DONA);
      const preview = await privacy.cancelCompanyDeletion(companyId, DONA);
      expect(preview.deletion).toBeNull();
      expect(privacyRepo.cancelledKeys()).toContain(`company:${companyId}`);
    });

    it('cancelar sem pedido em aberto é erro claro', async () => {
      await expect(privacy.cancelCompanyDeletion(companyId, DONA)).rejects.toMatchObject({
        code: 'NO_DELETION_SCHEDULED',
      });
    });
  });

  describe('exclusão da conta', () => {
    it('bloqueia enquanto a pessoa for dona de empresa com outros sócios', async () => {
      await adicionaSocioComConta();
      const preview = await privacy.getAccountDeletionPreview(DONA);
      expect(preview.blockers).toHaveLength(1);
      expect(preview.blockers[0]).toMatchObject({
        kind: 'owns_company_with_partners',
        companyId,
        companyName: 'Startup Teste',
        otherMembers: 1,
      });
      await expect(
        privacy.requestAccountDeletion({ confirmText: ACCOUNT_DELETION_CONFIRM_TEXT }, DONA),
      ).rejects.toMatchObject({ code: 'ACCOUNT_DELETION_BLOCKED' });
    });

    it('convite nunca aceito não trava a saída', async () => {
      await companies.addMember(
        companyId,
        { fullName: 'Convidado', email: 'convidado@plim.work', equityPercent: null },
        DONA.id,
      );
      const preview = await privacy.getAccountDeletionPreview(DONA);
      expect(preview.blockers).toHaveLength(0);
      expect(preview.companiesToDelete).toHaveLength(1);
    });

    it('empresa onde a pessoa está sozinha é agendada junto com a conta', async () => {
      const preview = await privacy.requestAccountDeletion(
        { confirmText: ACCOUNT_DELETION_CONFIRM_TEXT },
        DONA,
      );
      expect(preview.deletion?.daysLeft).toBe(DELETION_GRACE_DAYS);
      const company = await companyRepo.findCompanyById(companyId);
      expect(company?.deletionScheduledFor?.toISOString()).toBe(preview.deletion!.scheduledFor);
      // Um registro para a conta e outro para a empresa que morre junto.
      expect(privacyRepo.log.map((l) => l.subjectType)).toEqual(['account', 'company']);
    });

    it('recusa quando o texto de confirmação não confere', async () => {
      await expect(
        privacy.requestAccountDeletion({ confirmText: 'excluir' }, DONA),
      ).rejects.toMatchObject({ code: 'CONFIRM_TEXT_MISMATCH' });
    });

    it('cancelar desfaz também a empresa agendada junto', async () => {
      await privacy.requestAccountDeletion({ confirmText: ACCOUNT_DELETION_CONFIRM_TEXT }, DONA);
      const preview = await privacy.cancelAccountDeletion(DONA);
      expect(preview.deletion).toBeNull();
      const company = await companyRepo.findCompanyById(companyId);
      expect(company?.deletionScheduledFor).toBeNull();
      expect(privacyRepo.cancelledKeys()).toEqual(
        expect.arrayContaining([`account:${DONA.id}`, `company:${companyId}`]),
      );
    });

    it('empresa de outra pessoa não é agendada por tabela', async () => {
      await adicionaSocioComConta();
      // O sócio não é dono: ele apenas sai da empresa, que continua de pé.
      const preview = await privacy.getAccountDeletionPreview(SOCIO);
      expect(preview.blockers).toHaveLength(0);
      expect(preview.companiesToDelete).toHaveLength(0);
      expect(preview.companiesToLeave).toEqual([{ id: companyId, name: 'Startup Teste' }]);
    });

    it('exige autenticação', async () => {
      await expect(privacy.getAccountDeletionPreview({ id: null })).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
        httpStatus: 401,
      });
    });
  });

  describe('transferência de titularidade', () => {
    it('troca os papéis e libera a saída do dono anterior', async () => {
      const socio = await adicionaSocioComConta();
      const members = await companies.transferOwnership(companyId, socio.id, DONA.id);
      expect(members.find((m) => m.id === socio.id)?.role).toBe('account_owner');
      expect(members.find((m) => m.userId === DONA.id)?.role).toBe('partner');

      const company = await companyRepo.findCompanyById(companyId);
      expect(company?.ownerId).toBe(SOCIO.id);

      const preview = await privacy.getAccountDeletionPreview(DONA);
      expect(preview.blockers).toHaveLength(0);
    });

    it('só o dono transfere', async () => {
      const socio = await adicionaSocioComConta();
      await expect(
        companies.transferOwnership(companyId, socio.id, SOCIO.id),
      ).rejects.toMatchObject({ code: 'NOT_ACCOUNT_OWNER', httpStatus: 403 });
    });

    it('recusa sócio que ainda não entrou no Plim', async () => {
      const convidado = await companies.addMember(
        companyId,
        { fullName: 'Convidado', email: 'convidado@plim.work', equityPercent: null },
        DONA.id,
      );
      await expect(
        companies.transferOwnership(companyId, convidado.id, DONA.id),
      ).rejects.toMatchObject({ code: 'MEMBER_WITHOUT_ACCOUNT' });
    });
  });
});
