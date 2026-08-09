import type {
  CompanyRecordCounts,
  DeletionRequestLog,
  DeletionSchedule,
  PrivacyRepository,
} from '../privacy.repository';

/**
 * Implementação para testes e para o modo dev (sem Supabase). Guarda o estado
 * em memória; a exportação devolve só o que este repositório conhece, porque
 * no modo dev os dados vivem espalhados pelos outros repositórios in-memory.
 */
export class InMemoryPrivacyRepository implements PrivacyRepository {
  private accountDeletions = new Map<string, DeletionSchedule>();
  /** Exposto para os testes conferirem o que foi registrado. */
  readonly log: DeletionRequestLog[] = [];
  private cancelled: string[] = [];

  async getAccountDeletion(userId: string): Promise<DeletionSchedule | null> {
    return this.accountDeletions.get(userId) ?? null;
  }

  async setAccountDeletion(userId: string, schedule: DeletionSchedule | null): Promise<void> {
    if (schedule) this.accountDeletions.set(userId, schedule);
    else this.accountDeletions.delete(userId);
  }

  async countCompanyRecords(_companyId: string): Promise<CompanyRecordCounts> {
    return { members: 0, movements: 0, recurringCosts: 0, contacts: 0, activities: 0, events: 0 };
  }

  async exportCompany(companyId: string): Promise<Record<string, unknown>> {
    return { companyId, aviso: 'Exportação completa disponível apenas com o banco configurado.' };
  }

  async logRequest(entry: DeletionRequestLog): Promise<void> {
    this.log.push(entry);
  }

  async cancelOpenRequests(subjectType: 'company' | 'account', subjectId: string): Promise<void> {
    this.cancelled.push(`${subjectType}:${subjectId}`);
  }

  /** Só para os testes: os pedidos que foram cancelados. */
  cancelledKeys(): string[] {
    return [...this.cancelled];
  }
}
