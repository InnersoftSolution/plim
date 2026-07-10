import type { SupabaseClient } from '@supabase/supabase-js';
import type { PartnerCategory, PartnerLead } from '@plim/shared';
import type { CreatePartnerLeadData, PartnerRepository } from '../partner.repository';

interface LeadRow {
  id: string;
  company_id: string;
  category: PartnerCategory;
  note: string | null;
  status: 'open' | 'contacted' | 'closed';
  created_at: string;
}

function toLead(row: LeadRow): PartnerLead {
  return {
    id: row.id,
    companyId: row.company_id,
    category: row.category,
    note: row.note,
    status: row.status,
    createdAt: row.created_at,
  };
}

export class SupabasePartnerRepository implements PartnerRepository {
  constructor(private readonly db: SupabaseClient) {}

  async createLead(data: CreatePartnerLeadData): Promise<PartnerLead> {
    const { data: row, error } = await this.db
      .from('partner_leads')
      .insert({
        company_id: data.companyId,
        requested_by: data.userId,
        category: data.category,
        note: data.note,
      })
      .select()
      .single<LeadRow>();
    if (error || !row) throw new Error(`Falha ao registrar interesse: ${error?.message}`);
    return toLead(row);
  }

  async listLeads(companyId: string): Promise<PartnerLead[]> {
    const { data: rows, error } = await this.db
      .from('partner_leads')
      .select()
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .returns<LeadRow[]>();
    if (error) throw new Error(`Falha ao listar pedidos: ${error.message}`);
    return (rows ?? []).map(toLead);
  }
}
