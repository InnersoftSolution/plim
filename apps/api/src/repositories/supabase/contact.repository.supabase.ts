import type { SupabaseClient } from '@supabase/supabase-js';
import type { ContactType } from '@plim/shared';
import type { Contact } from '../../domain/contact';
import type { ContactPatch, ContactRepository } from '../contact.repository';

interface Row {
  id: string;
  company_id: string;
  name: string;
  type: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  note: string | null;
  archived: boolean;
  created_at: string;
}

function toContact(row: Row): Contact {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    type: row.type as ContactType,
    document: row.document,
    email: row.email,
    phone: row.phone,
    note: row.note,
    archived: row.archived,
    createdAt: new Date(row.created_at),
  };
}

export class SupabaseContactRepository implements ContactRepository {
  constructor(private readonly db: SupabaseClient) {}

  async listByCompany(companyId: string): Promise<Contact[]> {
    const { data, error } = await this.db
      .from('contacts')
      .select('*')
      .eq('company_id', companyId)
      .order('name', { ascending: true })
      .returns<Row[]>();
    if (error) throw new Error(`Falha ao listar contatos: ${error.message}`);
    return (data ?? []).map(toContact);
  }

  async findById(companyId: string, contactId: string): Promise<Contact | null> {
    const { data, error } = await this.db
      .from('contacts')
      .select('*')
      .eq('company_id', companyId)
      .eq('id', contactId)
      .maybeSingle<Row>();
    if (error) throw new Error(`Falha ao buscar contato: ${error.message}`);
    return data ? toContact(data) : null;
  }

  async create(data: Omit<Contact, 'id' | 'createdAt'>): Promise<Contact> {
    const { data: row, error } = await this.db
      .from('contacts')
      .insert({
        company_id: data.companyId,
        name: data.name,
        type: data.type,
        document: data.document,
        email: data.email,
        phone: data.phone,
        note: data.note,
        archived: data.archived,
      })
      .select('*')
      .single<Row>();
    if (error || !row) {
      // 23505 = unique_violation (nome duplicado na empresa).
      if ((error as { code?: string } | null)?.code === '23505') throw new Error('DUPLICATE_CONTACT');
      throw new Error(`Falha ao criar contato: ${error?.message}`);
    }
    return toContact(row);
  }

  async update(contactId: string, patch: ContactPatch): Promise<Contact> {
    const row: Record<string, unknown> = {};
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.type !== undefined) row.type = patch.type;
    if (patch.document !== undefined) row.document = patch.document;
    if (patch.email !== undefined) row.email = patch.email;
    if (patch.phone !== undefined) row.phone = patch.phone;
    if (patch.note !== undefined) row.note = patch.note;
    if (patch.archived !== undefined) row.archived = patch.archived;
    const { data, error } = await this.db
      .from('contacts')
      .update(row)
      .eq('id', contactId)
      .select('*')
      .single<Row>();
    if (error || !data) {
      if ((error as { code?: string } | null)?.code === '23505') throw new Error('DUPLICATE_CONTACT');
      throw new Error(`Falha ao atualizar contato: ${error?.message}`);
    }
    return toContact(data);
  }

  async delete(contactId: string): Promise<void> {
    const { error } = await this.db.from('contacts').delete().eq('id', contactId);
    if (error) throw new Error(`Falha ao excluir contato: ${error.message}`);
  }
}
