import { randomUUID } from 'node:crypto';
import type { PartnerLead } from '@plim/shared';
import type { CreatePartnerLeadData, PartnerRepository } from '../partner.repository';

export class InMemoryPartnerRepository implements PartnerRepository {
  private leads = new Map<string, PartnerLead>();

  async createLead(data: CreatePartnerLeadData): Promise<PartnerLead> {
    const lead: PartnerLead = {
      id: randomUUID(),
      companyId: data.companyId,
      category: data.category,
      note: data.note,
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    this.leads.set(lead.id, lead);
    return lead;
  }

  async listLeads(companyId: string): Promise<PartnerLead[]> {
    return [...this.leads.values()].filter((l) => l.companyId === companyId);
  }
}
