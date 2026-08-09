import type {
  AccountDeletionPreview,
  CompanyDeletionPreview,
  CompanyMember,
} from '@plim/shared';
import { apiFetch } from '../lib/api';

/**
 * Privacidade (LGPD): exportar os dados e pedir a exclusão.
 * Nenhuma regra aqui: quem pode, qual o prazo e o que trava a exclusão vem
 * pronto do backend. O front só chama e apresenta.
 */
export const privacyApi = {
  /* ── empresa ── */
  getCompanyDeletion(companyId: string): Promise<CompanyDeletionPreview> {
    return apiFetch<CompanyDeletionPreview>(`/companies/${companyId}/deletion`);
  },
  requestCompanyDeletion(
    companyId: string,
    input: { confirmName: string; reason?: string | null },
  ): Promise<CompanyDeletionPreview> {
    return apiFetch<CompanyDeletionPreview>(`/companies/${companyId}/deletion`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  cancelCompanyDeletion(companyId: string): Promise<CompanyDeletionPreview> {
    return apiFetch<CompanyDeletionPreview>(`/companies/${companyId}/deletion`, {
      method: 'DELETE',
    });
  },
  transferOwnership(companyId: string, memberId: string): Promise<CompanyMember[]> {
    return apiFetch<CompanyMember[]>(`/companies/${companyId}/transfer-ownership`, {
      method: 'POST',
      body: JSON.stringify({ memberId }),
    });
  },

  /* ── conta ── */
  getAccountDeletion(): Promise<AccountDeletionPreview> {
    return apiFetch<AccountDeletionPreview>('/me/deletion');
  },
  requestAccountDeletion(input: {
    confirmText: string;
    reason?: string | null;
  }): Promise<AccountDeletionPreview> {
    return apiFetch<AccountDeletionPreview>('/me/deletion', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
  cancelAccountDeletion(): Promise<AccountDeletionPreview> {
    return apiFetch<AccountDeletionPreview>('/me/deletion', { method: 'DELETE' });
  },
};

/**
 * Baixa a cópia dos dados da empresa como arquivo JSON.
 * Passa pelo apiFetch de propósito (leva o token e trata sessão expirada) e o
 * arquivo é montado aqui no navegador, em vez de abrir a URL direto.
 */
export async function downloadCompanyData(companyId: string, companyName: string): Promise<void> {
  const data = await apiFetch<unknown>(`/companies/${companyId}/export`);
  const slug =
    companyName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'empresa';
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `plim-${slug}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** "12 de agosto de 2026" — data por extenso, do jeito que se lê em português. */
export function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
