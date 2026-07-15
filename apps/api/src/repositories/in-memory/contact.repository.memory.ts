import { randomUUID } from 'node:crypto';
import type { Contact } from '../../domain/contact';
import type { ContactPatch, ContactRepository } from '../contact.repository';

export class InMemoryContactRepository implements ContactRepository {
  private contacts = new Map<string, Contact>();

  async listByCompany(companyId: string): Promise<Contact[]> {
    return [...this.contacts.values()]
      .filter((c) => c.companyId === companyId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async findById(companyId: string, contactId: string): Promise<Contact | null> {
    const c = this.contacts.get(contactId);
    return c && c.companyId === companyId ? c : null;
  }

  async create(data: Omit<Contact, 'id' | 'createdAt'>): Promise<Contact> {
    const dup = [...this.contacts.values()].some(
      (c) => c.companyId === data.companyId && c.name.toLowerCase() === data.name.toLowerCase(),
    );
    if (dup) throw new Error('DUPLICATE_CONTACT');
    const contact: Contact = { ...data, id: randomUUID(), createdAt: new Date() };
    this.contacts.set(contact.id, contact);
    return contact;
  }

  async update(contactId: string, patch: ContactPatch): Promise<Contact> {
    const c = this.contacts.get(contactId);
    if (!c) throw new Error(`Contato ${contactId} não encontrado`);
    const updated: Contact = { ...c, ...patch };
    this.contacts.set(contactId, updated);
    return updated;
  }

  async delete(contactId: string): Promise<void> {
    this.contacts.delete(contactId);
  }
}
