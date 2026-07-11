import type { AdminRole } from '@plim/shared';

/**
 * Registro de administrador interno do Plim (tabela admin_users).
 * Papel de PRODUTO (equipe Inner), independente de qualquer empresa.
 */
export interface AdminUserRecord {
  id: string;
  userId: string;
  role: AdminRole;
  status: 'active' | 'inactive';
  createdAt: string;
}
