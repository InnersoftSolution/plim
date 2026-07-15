import type { ContactType } from '@plim/shared';

/** Contato (fornecedor/cliente), escopado por empresa. */
export interface Contact {
  id: string;
  companyId: string;
  name: string;
  type: ContactType;
  document: string | null;
  email: string | null;
  phone: string | null;
  note: string | null;
  archived: boolean;
  createdAt: Date;
}
