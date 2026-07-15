import type { Contact } from '../domain/contact';

/** Campos editáveis de um contato (só o que vier definido). */
export interface ContactPatch {
  name?: string;
  type?: Contact['type'];
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  note?: string | null;
  archived?: boolean;
}

/** Acesso a dados dos contatos. Implementações: in-memory e Supabase. */
export interface ContactRepository {
  listByCompany(companyId: string): Promise<Contact[]>;
  findById(companyId: string, contactId: string): Promise<Contact | null>;
  create(data: Omit<Contact, 'id' | 'createdAt'>): Promise<Contact>;
  update(contactId: string, patch: ContactPatch): Promise<Contact>;
  delete(contactId: string): Promise<void>;
}
