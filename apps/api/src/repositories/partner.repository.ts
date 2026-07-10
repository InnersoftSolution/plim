import type { PartnerCategory, PartnerLead } from '@plim/shared';

export interface CreatePartnerLeadData {
  companyId: string;
  userId: string | null;
  category: PartnerCategory;
  note: string | null;
}

/**
 * Leads de indicação de profissionais parceiros (PRD §14/§19).
 * Área separada de sócios. O marketplace (tabela partners) vem depois;
 * esta interface só cresce — não muda.
 */
export interface PartnerRepository {
  createLead(data: CreatePartnerLeadData): Promise<PartnerLead>;
  listLeads(companyId: string): Promise<PartnerLead[]>;
}
