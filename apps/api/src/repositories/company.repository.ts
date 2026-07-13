import type { Company, CompanyMember, CompanyUpdate, MemberUpdate } from '../domain/company';

/**
 * Contrato de acesso a dados de empresas/sócios.
 * Implementações: in-memory (testes/dev) e Postgres (produção, próxima fase).
 */
export interface CompanyRepository {
  createCompany(data: Omit<Company, 'id' | 'createdAt'>): Promise<Company>;
  /** Atualização parcial dos campos da empresa (save/resume do onboarding). */
  updateCompany(companyId: string, patch: CompanyUpdate): Promise<Company>;
  findCompanyById(id: string): Promise<Company | null>;
  /** Empresas em que o usuário é membro (dono ou sócio com vínculo). */
  listCompaniesByUserId(userId: string): Promise<Company[]>;
  /** Todas as empresas — uso só no modo dev (sem autenticação). */
  listAllCompanies(): Promise<Company[]>;
  addMember(data: Omit<CompanyMember, 'id'>): Promise<CompanyMember>;
  listMembers(companyId: string): Promise<CompanyMember[]>;
  findMemberById(companyId: string, memberId: string): Promise<CompanyMember | null>;
  findMemberByEmail(companyId: string, email: string): Promise<CompanyMember | null>;
  findMemberByUserId(companyId: string, userId: string): Promise<CompanyMember | null>;
  updateMemberEquity(memberId: string, equityPercent: number | null): Promise<CompanyMember>;
  /** Edição parcial de um sócio (nome, e-mail, papel funcional, participação, notas). */
  updateMember(memberId: string, patch: MemberUpdate): Promise<CompanyMember>;
  /**
   * Sócios convidados ainda sem conta vinculada (user_id nulo) com este e-mail,
   * em QUALQUER empresa. Usado no login para vincular a pessoa automaticamente.
   */
  listUnclaimedMembersByEmail(email: string): Promise<CompanyMember[]>;
}
