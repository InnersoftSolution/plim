import { randomUUID } from 'node:crypto';
import type { Company, CompanyMember, CompanyUpdate, MemberUpdate } from '../../domain/company';
import type { CompanyRepository } from '../company.repository';

export class InMemoryCompanyRepository implements CompanyRepository {
  private companies = new Map<string, Company>();
  private members = new Map<string, CompanyMember>();

  async createCompany(data: Omit<Company, 'id' | 'createdAt'>): Promise<Company> {
    const company: Company = { ...data, id: randomUUID(), createdAt: new Date() };
    this.companies.set(company.id, company);
    return company;
  }

  async updateCompany(companyId: string, patch: CompanyUpdate): Promise<Company> {
    const current = this.companies.get(companyId);
    if (!current) throw new Error(`Empresa ${companyId} não encontrada`);
    const updated: Company = { ...current, ...patch };
    this.companies.set(companyId, updated);
    return updated;
  }

  async findCompanyById(id: string): Promise<Company | null> {
    return this.companies.get(id) ?? null;
  }

  async listCompaniesByUserId(userId: string): Promise<Company[]> {
    const companyIds = new Set(
      [...this.members.values()].filter((m) => m.userId === userId).map((m) => m.companyId),
    );
    return [...this.companies.values()].filter((c) => companyIds.has(c.id));
  }

  async listAllCompanies(): Promise<Company[]> {
    return [...this.companies.values()];
  }

  async addMember(data: Omit<CompanyMember, 'id'>): Promise<CompanyMember> {
    const member: CompanyMember = { ...data, id: randomUUID() };
    this.members.set(member.id, member);
    return member;
  }

  async listMembers(companyId: string): Promise<CompanyMember[]> {
    return [...this.members.values()].filter((m) => m.companyId === companyId);
  }

  async findMemberById(companyId: string, memberId: string): Promise<CompanyMember | null> {
    const member = this.members.get(memberId);
    return member && member.companyId === companyId ? member : null;
  }

  async findMemberByEmail(companyId: string, email: string): Promise<CompanyMember | null> {
    return (
      [...this.members.values()].find(
        (m) => m.companyId === companyId && m.email === email,
      ) ?? null
    );
  }

  async findMemberByUserId(companyId: string, userId: string): Promise<CompanyMember | null> {
    return (
      [...this.members.values()].find(
        (m) => m.companyId === companyId && m.userId === userId,
      ) ?? null
    );
  }

  async updateMemberEquity(memberId: string, equityPercent: number | null): Promise<CompanyMember> {
    const member = this.members.get(memberId);
    if (!member) throw new Error(`Membro ${memberId} não encontrado`);
    const updated: CompanyMember = { ...member, equityPercent };
    this.members.set(memberId, updated);
    return updated;
  }

  async updateMember(memberId: string, patch: MemberUpdate): Promise<CompanyMember> {
    const member = this.members.get(memberId);
    if (!member) throw new Error(`Membro ${memberId} não encontrado`);
    const updated: CompanyMember = { ...member, ...patch };
    this.members.set(memberId, updated);
    return updated;
  }

  async listUnclaimedMembersByEmail(email: string): Promise<CompanyMember[]> {
    return [...this.members.values()].filter((m) => m.email === email && m.userId === null);
  }
}
