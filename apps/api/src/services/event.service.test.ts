import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryCompanyRepository } from '../repositories/in-memory/company.repository.memory';
import { InMemoryEventRepository } from '../repositories/in-memory/event.repository.memory';
import { CompanyService } from './company.service';
import { EventService } from './event.service';

describe('EventService', () => {
  let companyService: CompanyService;
  let events: EventService;
  let companyId: string;
  let ownerMemberId: string;
  let socioMemberId: string;

  beforeEach(async () => {
    companyService = new CompanyService(new InMemoryCompanyRepository());
    events = new EventService(companyService, new InMemoryEventRepository());
    const { company } = await companyService.createCompany(
      { name: 'plim' },
      { id: 'u1', fullName: 'Dona', email: 'dona@plim.work' },
    );
    companyId = company.id;
    const members = await companyService.listMembers(companyId, 'u1');
    ownerMemberId = members[0]!.id;
    const socio = await companyService.addMember(
      companyId,
      { fullName: 'Sócio Dois', email: null, equityPercent: null },
      'u1',
    );
    socioMemberId = socio.id;
  });

  it('cria compromisso e lista ordenado por data de início', async () => {
    await events.create(
      companyId,
      { title: 'Reunião de fechamento', kind: 'reuniao', startsAt: '2026-08-10T14:00:00.000Z', allDay: false },
      'u1',
    );
    await events.create(
      companyId,
      { title: 'Prazo do contrato', kind: 'prazo', startsAt: '2026-08-01T09:00:00.000Z', allDay: true },
      'u1',
    );
    const list = await events.list(companyId, 'u1');
    expect(list.map((e) => e.title)).toEqual(['Prazo do contrato', 'Reunião de fechamento']);
    expect(list[0]!.allDay).toBe(true);
    expect(list[0]!.kind).toBe('prazo');
  });

  it('guarda quem criou e só participantes que são sócios da empresa', async () => {
    const created = await events.create(
      companyId,
      {
        title: 'Alinhamento',
        kind: 'reuniao',
        startsAt: '2026-08-05T13:00:00.000Z',
        allDay: false,
        participantMemberIds: [socioMemberId, '00000000-0000-0000-0000-000000000000'],
      },
      'u1',
    );
    expect(created.createdByMemberId).toBe(ownerMemberId);
    expect(created.participantMemberIds).toEqual([socioMemberId]); // id estranho é descartado
  });

  it('recusa quando todos os participantes informados são inválidos', async () => {
    await expect(
      events.create(
        companyId,
        {
          title: 'X',
          kind: 'reuniao',
          startsAt: '2026-08-05T13:00:00.000Z',
          allDay: false,
          participantMemberIds: ['00000000-0000-0000-0000-000000000000'],
        },
        'u1',
      ),
    ).rejects.toMatchObject({ code: 'INVALID_PARTICIPANTS' });
  });

  it('atualiza data, participantes e fim do compromisso', async () => {
    const created = await events.create(
      companyId,
      { title: 'Reunião', kind: 'reuniao', startsAt: '2026-08-05T13:00:00.000Z', allDay: false },
      'u1',
    );
    const updated = await events.update(
      companyId,
      created.id,
      {
        startsAt: '2026-08-06T15:00:00.000Z',
        endsAt: '2026-08-06T16:00:00.000Z',
        participantMemberIds: [ownerMemberId, socioMemberId],
      },
      'u1',
    );
    expect(updated.startsAt).toBe('2026-08-06T15:00:00.000Z');
    expect(updated.endsAt).toBe('2026-08-06T16:00:00.000Z');
    expect(updated.participantMemberIds).toEqual([ownerMemberId, socioMemberId]);
  });

  it('recusa fim antes do início na edição', async () => {
    const created = await events.create(
      companyId,
      { title: 'Reunião', kind: 'reuniao', startsAt: '2026-08-05T13:00:00.000Z', allDay: false },
      'u1',
    );
    await expect(
      events.update(companyId, created.id, { endsAt: '2026-08-05T12:00:00.000Z' }, 'u1'),
    ).rejects.toMatchObject({ code: 'INVALID_RANGE' });
  });

  it('quem não é membro não acessa a agenda', async () => {
    await expect(events.list(companyId, 'u-estranho')).rejects.toMatchObject({ code: 'NOT_A_MEMBER' });
  });

  it('excluir compromisso inexistente devolve EVENT_NOT_FOUND', async () => {
    await expect(
      events.remove(companyId, '00000000-0000-0000-0000-000000000000', 'u1'),
    ).rejects.toMatchObject({ code: 'EVENT_NOT_FOUND' });
  });
});
