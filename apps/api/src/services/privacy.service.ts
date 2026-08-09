import {
  ACCOUNT_DELETION_CONFIRM_TEXT,
  DELETION_GRACE_DAYS,
  type AccountDeletionBlocker,
  type AccountDeletionPreview,
  type CompanyDeletionPreview,
  type DeletionState,
  type RequestAccountDeletionInput,
  type RequestCompanyDeletionInput,
} from '@plim/shared';
import type { Company, CompanyMember } from '../domain/company';
import type { CompanyRepository } from '../repositories/company.repository';
import type { PrivacyRepository, DeletionSchedule } from '../repositories/privacy.repository';
import { DomainError, NotFoundError } from '../lib/errors';

/** Quem está pedindo. `id` nulo no modo dev (sem autenticação real). */
export interface ActingUser {
  id?: string | null;
  fullName?: string | null;
  email?: string | null;
}

/** Normaliza para comparar nome digitado x nome da empresa. */
function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

/** Dias inteiros que faltam para a data, nunca negativo. */
function daysUntil(target: Date, now: Date): number {
  const ms = target.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/**
 * Regras de privacidade e direito de eliminação (LGPD art. 18, VI).
 *
 * Duas exclusões, com pesos diferentes:
 *  - EMPRESA: destrói o histórico da sociedade inteira. Só o dono da conta pede.
 *  - CONTA: encerra o acesso da pessoa. Fica BLOQUEADA enquanto ela for dona de
 *    empresa com outros sócios, porque senão uma pessoa apagaria dado de
 *    terceiro. O caminho é transferir a titularidade ou excluir a empresa antes.
 *
 * Toda exclusão passa por CARÊNCIA de DELETION_GRACE_DAYS: o pedido agenda o
 * expurgo, fica visível e pode ser cancelado dentro do prazo. Nada some no
 * instante do clique. O expurgo definitivo é feito pelo scripts/purge-deletions.mjs.
 *
 * O front não decide nada disto: só mostra o que este serviço responde.
 */
export class PrivacyService {
  constructor(
    private readonly companyRepo: CompanyRepository,
    private readonly privacyRepo: PrivacyRepository,
    /** Injetável para os testes controlarem a data. */
    private readonly now: () => Date = () => new Date(),
  ) {}

  /* ── empresa ─────────────────────────────────────────── */

  /** O que a pessoa precisa ver antes de decidir excluir a empresa. */
  async getCompanyDeletionPreview(
    companyId: string,
    acting: ActingUser,
  ): Promise<CompanyDeletionPreview> {
    const { company, members } = await this.loadCompany(companyId, acting.id ?? null);
    const counts = await this.privacyRepo.countCompanyRecords(companyId);
    return {
      companyId: company.id,
      companyName: company.name,
      canDelete: this.isAccountOwner(members, acting.id ?? null),
      counts,
      deletion: this.toDeletionState(company, members),
      graceDays: DELETION_GRACE_DAYS,
    };
  }

  /** Cópia integral dos dados da empresa (portabilidade, art. 18, V). */
  async exportCompany(companyId: string, acting: ActingUser): Promise<Record<string, unknown>> {
    // Qualquer sócio pode baixar: os dados são da sociedade, não só do dono.
    await this.loadCompany(companyId, acting.id ?? null);
    return this.privacyRepo.exportCompany(companyId);
  }

  /**
   * Agenda a exclusão da empresa. Exige o nome digitado por extenso: um clique
   * acidental não pode marcar a destruição da contabilidade da sociedade.
   */
  async requestCompanyDeletion(
    companyId: string,
    input: RequestCompanyDeletionInput,
    acting: ActingUser,
  ): Promise<CompanyDeletionPreview> {
    const { company, members } = await this.loadCompany(companyId, acting.id ?? null);
    this.assertAccountOwner(members, acting.id ?? null, 'excluir a empresa');

    if (company.deletionScheduledFor) {
      throw new DomainError(
        'DELETION_ALREADY_SCHEDULED',
        'Esta empresa já tem uma exclusão agendada.',
      );
    }
    if (normalize(input.confirmName) !== normalize(company.name)) {
      throw new DomainError(
        'CONFIRM_NAME_MISMATCH',
        `O nome digitado não confere. Digite exatamente "${company.name}".`,
      );
    }

    const schedule = this.newSchedule();
    await this.companyRepo.updateCompany(companyId, {
      deletionRequestedAt: schedule.requestedAt,
      deletionScheduledFor: schedule.scheduledFor,
      deletionRequestedBy: acting.id ?? null,
    });
    await this.privacyRepo.logRequest({
      subjectType: 'company',
      subjectId: companyId,
      subjectLabel: company.name,
      requestedByUserId: acting.id ?? null,
      requestedByEmail: acting.email ?? null,
      reason: input.reason ?? null,
      scheduledFor: schedule.scheduledFor,
    });
    return this.getCompanyDeletionPreview(companyId, acting);
  }

  /** Desiste da exclusão dentro do prazo. Volta tudo ao normal. */
  async cancelCompanyDeletion(
    companyId: string,
    acting: ActingUser,
  ): Promise<CompanyDeletionPreview> {
    const { company, members } = await this.loadCompany(companyId, acting.id ?? null);
    this.assertAccountOwner(members, acting.id ?? null, 'cancelar a exclusão');
    if (!company.deletionScheduledFor) {
      throw new DomainError('NO_DELETION_SCHEDULED', 'Não há exclusão agendada para esta empresa.');
    }
    await this.companyRepo.updateCompany(companyId, {
      deletionRequestedAt: null,
      deletionScheduledFor: null,
      deletionRequestedBy: null,
    });
    await this.privacyRepo.cancelOpenRequests('company', companyId);
    return this.getCompanyDeletionPreview(companyId, acting);
  }

  /* ── conta ───────────────────────────────────────────── */

  /**
   * O que acontece se a pessoa excluir a conta: o que some junto, de onde ela
   * só sai, e o que a impede de seguir. Cada impedimento vem com a empresa
   * envolvida para o front oferecer a saída (transferir ou excluir).
   */
  async getAccountDeletionPreview(acting: ActingUser): Promise<AccountDeletionPreview> {
    const userId = acting.id ?? null;
    if (!userId) {
      throw new DomainError(
        'UNAUTHENTICATED',
        'É preciso estar autenticado para excluir a conta.',
        401,
      );
    }

    const companies = await this.companyRepo.listCompaniesByUserId(userId);
    const blockers: AccountDeletionBlocker[] = [];
    const companiesToDelete: { id: string; name: string }[] = [];
    const companiesToLeave: { id: string; name: string }[] = [];

    for (const company of companies) {
      const members = await this.companyRepo.listMembers(company.id);
      const isOwner = members.some((m) => m.userId === userId && m.role === 'account_owner');
      if (!isOwner) {
        companiesToLeave.push({ id: company.id, name: company.name });
        continue;
      }
      // Contam só as outras pessoas de verdade: convite nunca aceito não é
      // sócio ativo e não deve travar a saída de quem quer sair.
      const others = members.filter((m) => m.userId !== userId && m.status === 'active');
      if (others.length > 0) {
        blockers.push({
          kind: 'owns_company_with_partners',
          companyId: company.id,
          companyName: company.name,
          otherMembers: others.length,
        });
      } else {
        companiesToDelete.push({ id: company.id, name: company.name });
      }
    }

    const schedule = await this.privacyRepo.getAccountDeletion(userId);
    return {
      blockers,
      companiesToDelete,
      companiesToLeave,
      deletion: schedule ? this.scheduleToState(schedule, acting.fullName ?? null) : null,
      graceDays: DELETION_GRACE_DAYS,
    };
  }

  /**
   * Agenda a exclusão da conta. Só passa com zero impedimentos e com o texto de
   * confirmação digitado. As empresas onde a pessoa está sozinha são agendadas
   * junto, no mesmo prazo: sem dono, ninguém mais acessaria aqueles dados.
   */
  async requestAccountDeletion(
    input: RequestAccountDeletionInput,
    acting: ActingUser,
  ): Promise<AccountDeletionPreview> {
    const preview = await this.getAccountDeletionPreview(acting);
    const userId = acting.id!;

    if (preview.deletion) {
      throw new DomainError('DELETION_ALREADY_SCHEDULED', 'Sua conta já tem uma exclusão agendada.');
    }
    if (preview.blockers.length > 0) {
      throw new DomainError(
        'ACCOUNT_DELETION_BLOCKED',
        'Resolva as empresas em que você é o dono da conta antes de excluir seu acesso.',
      );
    }
    if (normalize(input.confirmText) !== normalize(ACCOUNT_DELETION_CONFIRM_TEXT)) {
      throw new DomainError(
        'CONFIRM_TEXT_MISMATCH',
        `O texto digitado não confere. Digite exatamente "${ACCOUNT_DELETION_CONFIRM_TEXT}".`,
      );
    }

    const schedule = this.newSchedule();
    await this.privacyRepo.setAccountDeletion(userId, schedule);
    await this.privacyRepo.logRequest({
      subjectType: 'account',
      subjectId: userId,
      subjectLabel: acting.email ?? null,
      requestedByUserId: userId,
      requestedByEmail: acting.email ?? null,
      reason: input.reason ?? null,
      scheduledFor: schedule.scheduledFor,
    });

    // Empresa sem mais ninguém morre junto com a conta, no mesmo prazo.
    for (const company of preview.companiesToDelete) {
      await this.companyRepo.updateCompany(company.id, {
        deletionRequestedAt: schedule.requestedAt,
        deletionScheduledFor: schedule.scheduledFor,
        deletionRequestedBy: userId,
      });
      await this.privacyRepo.logRequest({
        subjectType: 'company',
        subjectId: company.id,
        subjectLabel: company.name,
        requestedByUserId: userId,
        requestedByEmail: acting.email ?? null,
        reason: 'Exclusão da conta do único sócio.',
        scheduledFor: schedule.scheduledFor,
      });
    }

    return this.getAccountDeletionPreview(acting);
  }

  /** Desiste da exclusão da conta e das empresas agendadas junto com ela. */
  async cancelAccountDeletion(acting: ActingUser): Promise<AccountDeletionPreview> {
    const userId = acting.id ?? null;
    if (!userId) {
      throw new DomainError('UNAUTHENTICATED', 'É preciso estar autenticado.', 401);
    }
    const schedule = await this.privacyRepo.getAccountDeletion(userId);
    if (!schedule) {
      throw new DomainError('NO_DELETION_SCHEDULED', 'Não há exclusão agendada para sua conta.');
    }

    await this.privacyRepo.setAccountDeletion(userId, null);
    await this.privacyRepo.cancelOpenRequests('account', userId);

    // Desfaz também o agendamento das empresas que foram junto no mesmo pedido.
    const companies = await this.companyRepo.listCompaniesByUserId(userId);
    for (const company of companies) {
      if (company.deletionRequestedBy !== userId || !company.deletionScheduledFor) continue;
      await this.companyRepo.updateCompany(company.id, {
        deletionRequestedAt: null,
        deletionScheduledFor: null,
        deletionRequestedBy: null,
      });
      await this.privacyRepo.cancelOpenRequests('company', company.id);
    }

    return this.getAccountDeletionPreview(acting);
  }

  /* ── apoio ───────────────────────────────────────────── */

  private newSchedule(): DeletionSchedule {
    const requestedAt = this.now();
    const scheduledFor = new Date(requestedAt.getTime() + DELETION_GRACE_DAYS * 86_400_000);
    return { requestedAt, scheduledFor };
  }

  private scheduleToState(schedule: DeletionSchedule, requestedByName: string | null): DeletionState {
    return {
      requestedAt: schedule.requestedAt.toISOString(),
      scheduledFor: schedule.scheduledFor.toISOString(),
      daysLeft: daysUntil(schedule.scheduledFor, this.now()),
      requestedByName,
    };
  }

  private toDeletionState(company: Company, members: CompanyMember[]): DeletionState | null {
    if (!company.deletionRequestedAt || !company.deletionScheduledFor) return null;
    const requester = members.find((m) => m.userId === company.deletionRequestedBy) ?? null;
    return this.scheduleToState(
      { requestedAt: company.deletionRequestedAt, scheduledFor: company.deletionScheduledFor },
      requester?.fullName ?? null,
    );
  }

  private isAccountOwner(members: CompanyMember[], actingUserId: string | null): boolean {
    // Modo dev (sem auth): não há usuário para conferir, então libera.
    if (actingUserId == null) return true;
    return members.some((m) => m.userId === actingUserId && m.role === 'account_owner');
  }

  private assertAccountOwner(
    members: CompanyMember[],
    actingUserId: string | null,
    action: string,
  ): void {
    if (this.isAccountOwner(members, actingUserId)) return;
    throw new DomainError('NOT_ACCOUNT_OWNER', `Só o dono da conta pode ${action}.`, 403);
  }

  /** Empresa + sócios com a checagem de membro, igual ao resto da API. */
  private async loadCompany(
    companyId: string,
    actingUserId: string | null,
  ): Promise<{ company: Company; members: CompanyMember[] }> {
    const [company, members] = await Promise.all([
      this.companyRepo.findCompanyById(companyId),
      this.companyRepo.listMembers(companyId),
    ]);
    if (!company) throw new NotFoundError('COMPANY_NOT_FOUND', 'Empresa não encontrada.');
    if (actingUserId != null && !members.some((m) => m.userId === actingUserId)) {
      throw new DomainError('NOT_A_MEMBER', 'Você não faz parte desta empresa.', 403);
    }
    return { company, members };
  }
}
