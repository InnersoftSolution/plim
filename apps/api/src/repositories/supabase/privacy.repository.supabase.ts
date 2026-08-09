import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CompanyRecordCounts,
  DeletionRequestLog,
  DeletionSchedule,
  PrivacyRepository,
} from '../privacy.repository';

/**
 * Tabelas que guardam dados DA EMPRESA, todas com a coluna company_id.
 * Esta lista é a definição prática de "os dados da empresa": alimenta tanto a
 * exportação quanto a conferência do expurgo. Tabela nova com company_id
 * precisa entrar aqui, senão sai de fora da portabilidade.
 *
 * Fora da lista de propósito: user_calendar_connections (é da PESSOA, não da
 * empresa, e guarda token cifrado do Google — nunca vai para um arquivo que o
 * usuário baixa).
 */
const COMPANY_TABLES = [
  'company_members',
  'company_journey_steps',
  'company_checklist_items',
  'categories',
  'contacts',
  'expenses',
  'recurring_costs',
  'settlement_payments',
  'activities',
  'events',
  'event_calendar_sync',
  'partner_leads',
] as const;

export class SupabasePrivacyRepository implements PrivacyRepository {
  constructor(private readonly db: SupabaseClient) {}

  async getAccountDeletion(userId: string): Promise<DeletionSchedule | null> {
    const { data, error } = await this.db
      .from('profiles')
      .select('deletion_requested_at, deletion_scheduled_for')
      .eq('id', userId)
      .maybeSingle<{ deletion_requested_at: string | null; deletion_scheduled_for: string | null }>();
    if (error) throw new Error(`Falha ao ler o pedido de exclusão da conta: ${error.message}`);
    if (!data?.deletion_requested_at || !data.deletion_scheduled_for) return null;
    return {
      requestedAt: new Date(data.deletion_requested_at),
      scheduledFor: new Date(data.deletion_scheduled_for),
    };
  }

  async setAccountDeletion(userId: string, schedule: DeletionSchedule | null): Promise<void> {
    const { error } = await this.db
      .from('profiles')
      .update({
        deletion_requested_at: schedule?.requestedAt.toISOString() ?? null,
        deletion_scheduled_for: schedule?.scheduledFor.toISOString() ?? null,
      })
      .eq('id', userId);
    if (error) throw new Error(`Falha ao agendar a exclusão da conta: ${error.message}`);
  }

  async countCompanyRecords(companyId: string): Promise<CompanyRecordCounts> {
    const count = async (table: string): Promise<number> => {
      const { count: total, error } = await this.db
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId);
      if (error) throw new Error(`Falha ao contar ${table}: ${error.message}`);
      return total ?? 0;
    };
    const [members, movements, recurringCosts, contacts, activities, events] = await Promise.all([
      count('company_members'),
      count('expenses'),
      count('recurring_costs'),
      count('contacts'),
      count('activities'),
      count('events'),
    ]);
    return { members, movements, recurringCosts, contacts, activities, events };
  }

  async exportCompany(companyId: string): Promise<Record<string, unknown>> {
    const { data: company, error: companyError } = await this.db
      .from('companies')
      .select()
      .eq('id', companyId)
      .maybeSingle();
    if (companyError) throw new Error(`Falha ao exportar a empresa: ${companyError.message}`);

    const tables = await Promise.all(
      COMPANY_TABLES.map(async (table) => {
        const { data, error } = await this.db.from(table).select().eq('company_id', companyId);
        if (error) throw new Error(`Falha ao exportar ${table}: ${error.message}`);
        return [table, data ?? []] as const;
      }),
    );
    const dados = Object.fromEntries(tables) as Record<string, Record<string, unknown>[]>;

    // Rateios ficam pendurados na movimentação, não na empresa: buscamos pelos
    // ids das despesas para o arquivo sair com a divisão entre os sócios.
    const expenseIds = (dados.expenses ?? []).map((e) => e.id as string);
    if (expenseIds.length > 0) {
      const { data, error } = await this.db.from('expense_shares').select().in('expense_id', expenseIds);
      if (error) throw new Error(`Falha ao exportar rateios: ${error.message}`);
      dados.expense_shares = data ?? [];
    } else {
      dados.expense_shares = [];
    }

    return {
      geradoEm: new Date().toISOString(),
      origem: 'Plim',
      formato: 'Cópia integral dos dados desta empresa (LGPD art. 18, V).',
      empresa: company ?? null,
      dados,
    };
  }

  async logRequest(entry: DeletionRequestLog): Promise<void> {
    const { error } = await this.db.from('deletion_requests').insert({
      subject_type: entry.subjectType,
      subject_id: entry.subjectId,
      subject_label: entry.subjectLabel,
      requested_by_user_id: entry.requestedByUserId,
      requested_by_email: entry.requestedByEmail,
      reason: entry.reason,
      scheduled_for: entry.scheduledFor.toISOString(),
    });
    if (error) throw new Error(`Falha ao registrar o pedido de exclusão: ${error.message}`);
  }

  async cancelOpenRequests(subjectType: 'company' | 'account', subjectId: string): Promise<void> {
    const { error } = await this.db
      .from('deletion_requests')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('subject_type', subjectType)
      .eq('subject_id', subjectId)
      .eq('status', 'scheduled');
    if (error) throw new Error(`Falha ao cancelar o pedido de exclusão: ${error.message}`);
  }
}
