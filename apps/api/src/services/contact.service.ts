import type {
  Contact as ContactDto,
  CreateContactInput,
  UpdateContactInput,
} from '@plim/shared';
import type { Contact } from '../domain/contact';
import type { ContactRepository } from '../repositories/contact.repository';
import type { CompanyService } from './company.service';
import { DomainError, NotFoundError } from '../lib/errors';

function toDto(c: Contact): ContactDto {
  return {
    id: c.id,
    companyId: c.companyId,
    name: c.name,
    type: c.type,
    document: c.document,
    email: c.email,
    phone: c.phone,
    note: c.note,
    archived: c.archived,
  };
}

/**
 * Contatos (fornecedores/clientes) por empresa: quem recebeu um pagamento
 * (despesa) ou de quem o dinheiro veio (entrada). Sem seed: cada empresa
 * cadastra os seus, direto na movimentação ou na tela de gestão.
 */
export class ContactService {
  constructor(
    private readonly companyService: CompanyService,
    private readonly repo: ContactRepository,
  ) {}

  async list(companyId: string, actingUserId?: string | null): Promise<ContactDto[]> {
    await this.companyService.getOverview(companyId, actingUserId);
    return (await this.repo.listByCompany(companyId)).map(toDto);
  }

  async create(
    companyId: string,
    input: CreateContactInput,
    actingUserId?: string | null,
  ): Promise<ContactDto> {
    await this.companyService.getOverview(companyId, actingUserId);
    try {
      const contact = await this.repo.create({
        companyId,
        name: input.name,
        type: input.type,
        document: input.document ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        note: input.note ?? null,
        archived: false,
      });
      return toDto(contact);
    } catch (err) {
      if (err instanceof Error && err.message === 'DUPLICATE_CONTACT') {
        throw new DomainError('DUPLICATE_CONTACT', 'Já existe um contato com esse nome.', 409);
      }
      throw err;
    }
  }

  async update(
    companyId: string,
    contactId: string,
    input: UpdateContactInput,
    actingUserId?: string | null,
  ): Promise<ContactDto> {
    await this.companyService.getOverview(companyId, actingUserId);
    const existing = await this.repo.findById(companyId, contactId);
    if (!existing) throw new NotFoundError('CONTACT_NOT_FOUND', 'Contato não encontrado.');
    try {
      const updated = await this.repo.update(contactId, {
        name: input.name,
        type: input.type,
        document: input.document,
        email: input.email,
        phone: input.phone,
        note: input.note,
        archived: input.archived,
      });
      return toDto(updated);
    } catch (err) {
      if (err instanceof Error && err.message === 'DUPLICATE_CONTACT') {
        throw new DomainError('DUPLICATE_CONTACT', 'Já existe um contato com esse nome.', 409);
      }
      throw err;
    }
  }

  async remove(companyId: string, contactId: string, actingUserId?: string | null): Promise<void> {
    await this.companyService.getOverview(companyId, actingUserId);
    const existing = await this.repo.findById(companyId, contactId);
    if (!existing) throw new NotFoundError('CONTACT_NOT_FOUND', 'Contato não encontrado.');
    // Movimentações que usam o contato ficam com contact_id nulo (FK set null).
    await this.repo.delete(contactId);
  }
}
