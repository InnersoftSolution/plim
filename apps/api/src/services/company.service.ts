import type {
  AddMemberInput,
  CreateCompanyInput,
  UpdateCompanyInput,
  UpdateMemberInput,
} from '@plim/shared';
import type { Company, CompanyMember, CompanyUpdate } from '../domain/company';
import type { CompanyRepository } from '../repositories/company.repository';
import { DomainError, NotFoundError } from '../lib/errors';
import type { LogoStorage } from '../lib/logo-storage';
import type { InviteSender } from '../lib/invite-sender';

/** Limite da logo: 5MB ja decodificados. */
const LOGO_MAX_BYTES = 5 * 1024 * 1024;

/** Quem está criando/agindo. `id` nulo no modo dev (sem autenticação real). */
export interface ActingOwner {
  id?: string | null;
  fullName: string;
  email: string;
}

/**
 * Regras de negócio de empresa e sociedade.
 * Estas regras existem SOMENTE aqui — o front apenas exibe o resultado.
 */
export class CompanyService {
  constructor(
    private readonly repo: CompanyRepository,
    private readonly logoStorage?: LogoStorage,
    private readonly inviteSender?: InviteSender,
  ) {}

  /**
   * Logo da empresa (identidade visual, nao comprovante). Valida membro,
   * tipo e tamanho; sobe no storage e grava a URL publica na empresa.
   */
  async setLogo(
    companyId: string,
    dataBase64: string,
    contentType: string,
    actingUserId?: string | null,
  ): Promise<Company> {
    if (!this.logoStorage) {
      throw new DomainError('LOGO_NOT_CONFIGURED', 'Upload de logo indisponivel neste ambiente.');
    }
    await this.assertMembership(companyId, actingUserId);
    const data = Buffer.from(dataBase64, 'base64');
    if (data.byteLength === 0) {
      throw new DomainError('LOGO_EMPTY', 'A imagem veio vazia. Tente escolher o arquivo de novo.');
    }
    if (data.byteLength > LOGO_MAX_BYTES) {
      throw new DomainError('LOGO_TOO_LARGE', 'A imagem passa de 5MB. Escolha uma versao menor.');
    }
    const logoUrl = await this.logoStorage.upload(companyId, data, contentType);
    return this.repo.updateCompany(companyId, { logoUrl });
  }

  async removeLogo(companyId: string, actingUserId?: string | null): Promise<Company> {
    if (!this.logoStorage) {
      throw new DomainError('LOGO_NOT_CONFIGURED', 'Upload de logo indisponivel neste ambiente.');
    }
    await this.assertMembership(companyId, actingUserId);
    await this.logoStorage.remove(companyId);
    return this.repo.updateCompany(companyId, { logoUrl: null });
  }

  async createCompany(
    input: CreateCompanyInput,
    owner: ActingOwner,
  ): Promise<{ company: Company; ownerMember: CompanyMember }> {
    const ownerId = owner.id ?? null;
    const company = await this.repo.createCompany({
      name: input.name,
      isNameTemporary: input.isNameTemporary ?? false,
      description: input.description ?? null,
      industry: input.industry ?? null,
      industryOther: input.industryOther ?? null,
      businessModel: input.businessModel ?? null,
      businessStage: null,
      countryCode: null,
      region: null,
      city: null,
      currencyCode: null,
      logoUrl: null,
      businessModelType: null,
      hasFormalRegistration: null,
      registrationCountry: null,
      registrationNumber: null,
      legalStructure: null,
      legalStructureStatus: null,
      phone: null,
      email: null,
      cep: null,
      street: null,
      streetNumber: null,
      complement: null,
      neighborhood: null,
      // Onboarding começa em andamento, na etapa básica (save/resume).
      onboardingStatus: 'in_progress',
      onboardingStep: 'basic',
      ownerId,
    });

    // Quem cria a empresa entra automaticamente como account_owner ativo.
    const ownerMember = await this.repo.addMember({
      companyId: company.id,
      userId: ownerId,
      fullName: owner.fullName,
      email: owner.email,
      functionalRole: null,
      role: 'account_owner',
      equityPercent: null,
      notes: null,
      status: 'active',
      invitationStatus: 'accepted', // o dono já tem login
    });

    return { company, ownerMember };
  }

  /** Atualização parcial da empresa (save/resume do onboarding). */
  async updateCompany(
    companyId: string,
    patch: UpdateCompanyInput,
    actingUserId?: string | null,
  ): Promise<Company> {
    await this.assertMembership(companyId, actingUserId);
    return this.repo.updateCompany(companyId, patch as CompanyUpdate);
  }

  /** Marca o onboarding como concluído (botão "Ir para o dashboard" na revisão). */
  async completeOnboarding(companyId: string, actingUserId?: string | null): Promise<Company> {
    await this.assertMembership(companyId, actingUserId);
    return this.repo.updateCompany(companyId, { onboardingStatus: 'completed' });
  }

  /**
   * Empresas do usuário autenticado. No modo dev (sem auth) devolve todas.
   * Com e-mail em mãos, VINCULA sozinho convites pendentes: um sócio
   * convidado entra e já encontra a empresa dele, sem passo extra.
   */
  async listMyCompanies(actingUserId?: string | null, actingEmail?: string | null): Promise<Company[]> {
    if (actingUserId == null) return this.repo.listAllCompanies();
    if (actingEmail) await this.claimMemberships(actingUserId, actingEmail);
    return this.repo.listCompaniesByUserId(actingUserId);
  }

  /** Liga convites pendentes (mesmo e-mail, sem conta vinculada) a este usuário. */
  private async claimMemberships(userId: string, email: string): Promise<void> {
    const pending = await this.repo.listUnclaimedMembersByEmail(email.toLowerCase());
    for (const m of pending) {
      await this.repo.updateMember(m.id, {
        userId,
        status: 'active',
        invitationStatus: 'accepted',
      });
    }
  }

  async addMember(companyId: string, input: AddMemberInput, actingUserId?: string | null): Promise<CompanyMember> {
    await this.assertMembership(companyId, actingUserId);

    // E-mail é opcional nesta fase; só checa duplicidade quando informado.
    if (input.email) {
      const existing = await this.repo.findMemberByEmail(companyId, input.email);
      if (existing) {
        throw new DomainError('MEMBER_ALREADY_EXISTS', 'Esse e-mail já faz parte da sociedade.');
      }
    }

    await this.assertEquitySumWithinLimit(companyId, input.equityPercent);

    const member = await this.repo.addMember({
      companyId,
      userId: null,
      fullName: input.fullName,
      email: input.email ?? null,
      functionalRole: input.functionalRole ?? null,
      role: 'partner',
      equityPercent: input.equityPercent,
      notes: input.notes ?? null,
      status: 'invited',
      invitationStatus: 'not_invited',
    });

    // Cadastrou com e-mail? O convite sai na hora. Se o envio falhar, o
    // cadastro NAO falha junto: fica "não convidado" e dá para reenviar.
    if (member.email && this.inviteSender) {
      try {
        return await this.sendMemberInvite(companyId, member, actingUserId);
      } catch {
        return member;
      }
    }
    return member;
  }

  /** Envia (ou reenvia) o convite de um sócio já cadastrado. */
  async inviteMember(
    companyId: string,
    memberId: string,
    actingUserId?: string | null,
  ): Promise<CompanyMember> {
    await this.assertMembership(companyId, actingUserId);
    const member = await this.repo.findMemberById(companyId, memberId);
    if (!member) throw new NotFoundError('MEMBER_NOT_FOUND', 'Sócio não encontrado.');
    if (!member.email) {
      throw new DomainError('MEMBER_WITHOUT_EMAIL', 'Cadastre o e-mail do sócio antes de convidar.');
    }
    if (member.userId) {
      throw new DomainError('MEMBER_ALREADY_ACTIVE', 'Esse sócio já entrou no Plim.');
    }
    if (!this.inviteSender) {
      throw new DomainError('INVITE_NOT_CONFIGURED', 'Envio de convite indisponível neste ambiente.');
    }
    return this.sendMemberInvite(companyId, member, actingUserId);
  }

  private async sendMemberInvite(
    companyId: string,
    member: CompanyMember,
    actingUserId?: string | null,
  ): Promise<CompanyMember> {
    const [company, inviter] = await Promise.all([
      this.repo.findCompanyById(companyId),
      actingUserId ? this.repo.findMemberByUserId(companyId, actingUserId) : null,
    ]);
    await this.inviteSender!.sendInvite({
      email: member.email!,
      fullName: member.fullName,
      companyName: company?.name ?? 'a empresa',
      inviterName: inviter?.fullName ?? 'Um sócio',
    });
    // "already_registered" também conta como convidado: o vínculo acontece
    // sozinho no próximo login dessa pessoa (claim por e-mail).
    return this.repo.updateMember(member.id, { invitationStatus: 'invited' });
  }

  /**
   * Exclusão definitiva de um sócio. Regras:
   *  - só o DONO DA CONTA (account_owner) pode excluir;
   *  - o dono da conta não pode ser excluído (a empresa ficaria órfã);
   *  - irreversível: o front confirma com a pessoa antes de chamar.
   */
  async removeMember(
    companyId: string,
    memberId: string,
    actingUserId?: string | null,
  ): Promise<void> {
    if (actingUserId != null) {
      const acting = await this.repo.findMemberByUserId(companyId, actingUserId);
      if (!acting) throw new DomainError('NOT_A_MEMBER', 'Você não faz parte desta empresa.', 403);
      if (acting.role !== 'account_owner') {
        throw new DomainError(
          'NOT_ACCOUNT_OWNER',
          'Só o dono da conta pode excluir sócios.',
          403,
        );
      }
    }
    const member = await this.repo.findMemberById(companyId, memberId);
    if (!member) throw new NotFoundError('MEMBER_NOT_FOUND', 'Sócio não encontrado.');
    if (member.role === 'account_owner') {
      throw new DomainError(
        'OWNER_CANNOT_BE_REMOVED',
        'O dono da conta não pode ser excluído da sociedade.',
      );
    }
    await this.repo.deleteMember(memberId);
  }

  async listMembers(companyId: string, actingUserId?: string | null): Promise<CompanyMember[]> {
    // Empresa + sócios em paralelo; a permissão é checada na própria lista
    // (evita uma query só para autorizar). Equivale a findMemberByUserId.
    const [company, members] = await Promise.all([
      this.repo.findCompanyById(companyId),
      this.repo.listMembers(companyId),
    ]);
    if (!company) {
      throw new NotFoundError('COMPANY_NOT_FOUND', 'Empresa não encontrada.');
    }
    if (actingUserId != null && !members.some((m) => m.userId === actingUserId)) {
      throw new DomainError('NOT_A_MEMBER', 'Você não faz parte desta empresa.', 403);
    }
    return members;
  }

  /** Empresa + sócios em uma chamada (com a mesma autorização de membro). */
  async getOverview(
    companyId: string,
    actingUserId?: string | null,
  ): Promise<{ company: Company; members: CompanyMember[] }> {
    // Uma rodada em paralelo (empresa + sócios). Como já temos os sócios, a
    // checagem de membro sai da lista — sem a query extra de findMemberByUserId
    // nem a busca duplicada da empresa. Corta ~metade das idas ao banco.
    const [company, members] = await Promise.all([
      this.repo.findCompanyById(companyId),
      this.repo.listMembers(companyId),
    ]);
    if (!company) {
      throw new NotFoundError('COMPANY_NOT_FOUND', 'Empresa não encontrada.');
    }
    if (actingUserId != null && !members.some((m) => m.userId === actingUserId)) {
      throw new DomainError('NOT_A_MEMBER', 'Você não faz parte desta empresa.', 403);
    }
    return { company, members };
  }

  /**
   * Define/atualiza o percentual de um sócio que já existe (ex.: o próprio dono).
   * Mantém a mesma invariante de soma, ignorando o valor atual do próprio membro.
   */
  async setMemberEquity(
    companyId: string,
    memberId: string,
    equityPercent: number | null,
    actingUserId?: string | null,
  ): Promise<CompanyMember> {
    await this.assertMembership(companyId, actingUserId);
    const member = await this.repo.findMemberById(companyId, memberId);
    if (!member) {
      throw new NotFoundError('MEMBER_NOT_FOUND', 'Sócio não encontrado.');
    }
    await this.assertEquitySumWithinLimit(companyId, equityPercent, memberId);
    return this.repo.updateMemberEquity(memberId, equityPercent);
  }

  /**
   * Edição de um sócio (tela Sociedade): nome, e-mail, papel funcional,
   * participação e observação. Valida soma de participação (ignorando o próprio)
   * e e-mail único na empresa. system_role não é editável aqui.
   */
  async updateMember(
    companyId: string,
    memberId: string,
    input: UpdateMemberInput,
    actingUserId?: string | null,
  ): Promise<CompanyMember> {
    await this.assertMembership(companyId, actingUserId);
    const member = await this.repo.findMemberById(companyId, memberId);
    if (!member) {
      throw new NotFoundError('MEMBER_NOT_FOUND', 'Sócio não encontrado.');
    }
    if (input.equityPercent !== undefined) {
      await this.assertEquitySumWithinLimit(companyId, input.equityPercent, memberId);
    }
    if (input.email) {
      const existing = await this.repo.findMemberByEmail(companyId, input.email);
      if (existing && existing.id !== memberId) {
        throw new DomainError('MEMBER_ALREADY_EXISTS', 'Esse e-mail já faz parte da sociedade.');
      }
    }
    return this.repo.updateMember(memberId, input);
  }

  /**
   * Autorização: a empresa existe e quem age é membro dela.
   * No modo dev (sem autenticação, actingUserId indefinido) só checa a existência.
   */
  private async assertMembership(companyId: string, actingUserId?: string | null): Promise<void> {
    // Empresa e vínculo em paralelo (2 idas ao banco viram 1 rodada).
    const [company, membership] = await Promise.all([
      this.repo.findCompanyById(companyId),
      actingUserId == null ? Promise.resolve(null) : this.repo.findMemberByUserId(companyId, actingUserId),
    ]);
    if (!company) {
      throw new NotFoundError('COMPANY_NOT_FOUND', 'Empresa não encontrada.');
    }
    if (actingUserId == null) return; // dev / sem auth
    if (!membership) {
      throw new DomainError('NOT_A_MEMBER', 'Você não faz parte desta empresa.', 403);
    }
  }

  /**
   * Invariante societária: a soma dos percentuais definidos nunca passa de 100.
   * Percentuais nulos (ainda não definidos) não entram na soma.
   * `excludeMemberId` deixa de fora o membro que está sendo atualizado.
   */
  private async assertEquitySumWithinLimit(
    companyId: string,
    incomingPercent: number | null,
    excludeMemberId?: string,
  ): Promise<void> {
    if (incomingPercent === null) return;
    const members = await this.repo.listMembers(companyId);
    const currentSum = members
      .filter((m) => m.id !== excludeMemberId)
      .reduce((sum, m) => sum + (m.equityPercent ?? 0), 0);
    // Soma em centésimos para evitar imprecisão de ponto flutuante.
    const totalHundredths = Math.round(currentSum * 100) + Math.round(incomingPercent * 100);
    if (totalHundredths > 100 * 100) {
      throw new DomainError(
        'EQUITY_SUM_EXCEEDED',
        `A soma das participações passaria de 100% (ficaria em ${totalHundredths / 100}%).`,
      );
    }
  }
}
