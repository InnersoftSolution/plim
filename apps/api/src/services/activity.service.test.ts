import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryCompanyRepository } from '../repositories/in-memory/company.repository.memory';
import { InMemoryActivityRepository } from '../repositories/in-memory/activity.repository.memory';
import { CompanyService } from './company.service';
import { ActivityService } from './activity.service';

describe('ActivityService', () => {
  let companyService: CompanyService;
  let activities: ActivityService;
  let companyId: string;
  let ownerId: string;
  let partnerId: string;

  beforeEach(async () => {
    const companyRepo = new InMemoryCompanyRepository();
    companyService = new CompanyService(companyRepo);
    activities = new ActivityService(companyService, new InMemoryActivityRepository());
    const { company, ownerMember } = await companyService.createCompany(
      { name: 'plim' },
      { id: 'u1', fullName: 'Dona', email: 'dona@plim.work' },
    );
    companyId = company.id;
    ownerId = ownerMember.id;
    const partner = await companyService.addMember(
      companyId,
      { fullName: 'Sócio', email: 'socio@plim.work', equityPercent: null },
      'u1',
    );
    partnerId = partner.id;
  });

  it('cria atividade com responsável, área e prioridade', async () => {
    const a = await activities.createActivity(
      companyId,
      { title: 'Criar landing', responsibleMemberId: partnerId, area: 'marketing', priority: 'high' },
      'u1',
    );
    expect(a.title).toBe('Criar landing');
    expect(a.responsibleMemberId).toBe(partnerId);
    expect(a.area).toBe('marketing');
    expect(a.priority).toBe('high');
    expect(a.status).toBe('todo');
    expect(a.createdBy).toBe(ownerId);
  });

  it('permite criar sem responsável (RP002)', async () => {
    const a = await activities.createActivity(
      companyId,
      { title: 'Sem dono', area: 'outros', priority: 'medium' },
      'u1',
    );
    expect(a.responsibleMemberId).toBeNull();
  });

  it('recusa responsável que não é sócio', async () => {
    await expect(
      activities.createActivity(
        companyId,
        { title: 'X', responsibleMemberId: '00000000-0000-0000-0000-000000000000', area: 'outros', priority: 'low' },
        'u1',
      ),
    ).rejects.toMatchObject({ code: 'MEMBER_NOT_FOUND' });
  });

  it('associa a atividade à semana (segunda-feira) do prazo', async () => {
    // 2026-07-08 é uma quarta → semana começa 2026-07-06 (segunda).
    const a = await activities.createActivity(
      companyId,
      { title: 'Prazo', area: 'outros', priority: 'low', dueDate: '2026-07-08' },
      'u1',
    );
    expect(a.weekStartDate).toBe('2026-07-06');
  });

  it('marca atrasada quando prazo passou e não está concluída (RP003)', async () => {
    await activities.createActivity(
      companyId,
      { title: 'Atrasada', area: 'outros', priority: 'high', dueDate: '2020-01-01' },
      'u1',
    );
    const list = await activities.listActivities(companyId, 'u1');
    expect(list[0]!.isOverdue).toBe(true);
  });

  it('não marca atrasada quando concluída (RP004)', async () => {
    const a = await activities.createActivity(
      companyId,
      { title: 'Feita', area: 'outros', priority: 'high', dueDate: '2020-01-01' },
      'u1',
    );
    const done = await activities.changeStatus(companyId, a.id, { status: 'done' }, 'u1');
    expect(done.status).toBe('done');
    expect(done.completedAt).not.toBeNull();
    expect(done.isOverdue).toBe(false);
  });

  it('guarda motivo ao bloquear e limpa ao desbloquear', async () => {
    const a = await activities.createActivity(companyId, { title: 'B', area: 'outros', priority: 'low' }, 'u1');
    const blocked = await activities.changeStatus(
      companyId,
      a.id,
      { status: 'blocked', blockedReason: 'Aguardando contador' },
      'u1',
    );
    expect(blocked.blockedReason).toBe('Aguardando contador');
    const back = await activities.changeStatus(companyId, a.id, { status: 'in_progress' }, 'u1');
    expect(back.blockedReason).toBeNull();
  });

  it('preenche cancelled_at ao cancelar (RP005)', async () => {
    const a = await activities.createActivity(companyId, { title: 'C', area: 'outros', priority: 'low' }, 'u1');
    const cancelled = await activities.changeStatus(companyId, a.id, { status: 'cancelled' }, 'u1');
    expect(cancelled.cancelledAt).not.toBeNull();
  });

  it('gerencia checklist (add, marcar, remover)', async () => {
    const a = await activities.createActivity(
      companyId,
      { title: 'CL', area: 'outros', priority: 'low', checklist: [{ title: 'Passo 1' }] },
      'u1',
    );
    expect(a.checklist).toHaveLength(1);
    const item = a.checklist[0]!;
    const done = await activities.setChecklistItem(companyId, a.id, item.id, true, 'u1');
    expect(done.checklist[0]!.isCompleted).toBe(true);
    const removed = await activities.removeChecklistItem(companyId, a.id, item.id, 'u1');
    expect(removed.checklist).toHaveLength(0);
  });

  it('não vaza atividade de outra empresa', async () => {
    const other = await companyService.createCompany(
      { name: 'outra' },
      { id: 'u9', fullName: 'Outro', email: 'outro@x.com' },
    );
    const a = await activities.createActivity(
      other.company.id,
      { title: 'secreta', area: 'outros', priority: 'low' },
      'u9',
    );
    await expect(
      activities.changeStatus(companyId, a.id, { status: 'done' }, 'u1'),
    ).rejects.toMatchObject({ code: 'ACTIVITY_NOT_FOUND' });
  });
});
