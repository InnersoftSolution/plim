import type { CreatePartnerLeadInput, PartnerLead } from '@plim/shared';
import type { PartnerRepository } from '../repositories/partner.repository';
import type { CompanyService } from './company.service';

/**
 * Indicação de profissionais parceiros. Autorização reusa getOverview
 * (só membro da empresa pede/vê leads). Sem IA — captura determinística.
 */
export class PartnerService {
  constructor(
    private readonly companyService: CompanyService,
    private readonly repo: PartnerRepository,
  ) {}

  async createLead(
    companyId: string,
    input: CreatePartnerLeadInput,
    actingUserId?: string | null,
  ): Promise<PartnerLead> {
    await this.companyService.getOverview(companyId, actingUserId);
    return this.repo.createLead({
      companyId,
      userId: actingUserId ?? null,
      category: input.category,
      note: input.note ?? null,
    });
  }

  async listLeads(companyId: string, actingUserId?: string | null): Promise<PartnerLead[]> {
    await this.companyService.getOverview(companyId, actingUserId);
    return this.repo.listLeads(companyId);
  }
}
