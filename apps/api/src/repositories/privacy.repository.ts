/**
 * Acesso a dados de privacidade: exclusão agendada da conta, registro dos
 * pedidos (auditoria LGPD), contagem do que será destruído e exportação.
 *
 * A exclusão agendada da EMPRESA não mora aqui: é coluna da própria empresa e
 * passa pelo CompanyRepository, para que toda tela que já carrega a empresa
 * enxergue o aviso sem uma chamada extra.
 */

/** Pedido de exclusão em aberto. */
export interface DeletionSchedule {
  requestedAt: Date;
  /** Quando o expurgo definitivo acontece. */
  scheduledFor: Date;
}

/** Volume do que some junto com a empresa. Serve para a pessoa medir o estrago. */
export interface CompanyRecordCounts {
  members: number;
  movements: number;
  recurringCosts: number;
  contacts: number;
  activities: number;
  events: number;
}

/** Uma linha do registro de auditoria. */
export interface DeletionRequestLog {
  subjectType: 'company' | 'account';
  subjectId: string;
  subjectLabel: string | null;
  requestedByUserId: string | null;
  requestedByEmail: string | null;
  reason: string | null;
  scheduledFor: Date;
}

export interface PrivacyRepository {
  /** Pedido de exclusão da conta em aberto, ou null. */
  getAccountDeletion(userId: string): Promise<DeletionSchedule | null>;
  /** Agenda (objeto) ou cancela (null) a exclusão da conta. */
  setAccountDeletion(userId: string, schedule: DeletionSchedule | null): Promise<void>;
  countCompanyRecords(companyId: string): Promise<CompanyRecordCounts>;
  /**
   * Cópia integral dos dados da empresa, em JSON legível (portabilidade,
   * LGPD art. 18, V). Nunca inclui segredo: tokens do Google e chaves ficam de
   * fora por não pertencerem à empresa e por serem material sensível.
   */
  exportCompany(companyId: string): Promise<Record<string, unknown>>;
  /** Registra o pedido. Este registro sobrevive ao expurgo (prova de cumprimento). */
  logRequest(entry: DeletionRequestLog): Promise<void>;
  /** Fecha os pedidos em aberto de um titular (cancelamento pela própria pessoa). */
  cancelOpenRequests(subjectType: 'company' | 'account', subjectId: string): Promise<void>;
}
