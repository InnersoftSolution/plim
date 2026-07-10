import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryCompanyRepository } from '../repositories/in-memory/company.repository.memory';
import { InMemoryJourneyRepository } from '../repositories/in-memory/journey.repository.memory';
import { CompanyService } from './company.service';
import { JourneyService } from './journey.service';

describe('JourneyService', () => {
  let companyService: CompanyService;
  let journey: JourneyService;
  let companyId: string;
  let ownerMemberId: string;

  beforeEach(async () => {
    const companyRepo = new InMemoryCompanyRepository();
    companyService = new CompanyService(companyRepo);
    journey = new JourneyService(companyService, new InMemoryJourneyRepository());
    const { company, ownerMember } = await companyService.createCompany(
      { name: 'plim' },
      { id: 'u1', fullName: 'Dona', email: 'dona@plim.work' },
    );
    companyId = company.id;
    ownerMemberId = ownerMember.id;
  });

  it('marca "criar-empresa" como concluído automaticamente', async () => {
    const { steps } = await journey.getJourney(companyId, 'u1');
    expect(steps.find((s) => s.id === 'criar-empresa')?.done).toBe(true);
  });

  it('detecta "definir-sociedade" só quando o equity soma 100%', async () => {
    let { steps } = await journey.getJourney(companyId, 'u1');
    expect(steps.find((s) => s.id === 'definir-sociedade')?.done).toBe(false);

    await companyService.setMemberEquity(companyId, ownerMemberId, 100, 'u1');
    ({ steps } = await journey.getJourney(companyId, 'u1'));
    expect(steps.find((s) => s.id === 'definir-sociedade')?.done).toBe(true);
  });

  it('marca e desmarca um passo manual', async () => {
    let res = await journey.setStep(companyId, 'verificar-marca', true, 'u1');
    expect(res.steps.find((s) => s.id === 'verificar-marca')?.done).toBe(true);

    res = await journey.setStep(companyId, 'verificar-marca', false, 'u1');
    expect(res.steps.find((s) => s.id === 'verificar-marca')?.done).toBe(false);
  });

  it('não deixa marcar manualmente um passo automático', async () => {
    await expect(journey.setStep(companyId, 'criar-empresa', true, 'u1')).rejects.toMatchObject({
      code: 'JOURNEY_STEP_AUTO',
    });
  });

  it('rejeita passo inexistente', async () => {
    await expect(journey.setStep(companyId, 'passo-fake', true, 'u1')).rejects.toMatchObject({
      code: 'JOURNEY_STEP_NOT_FOUND',
    });
  });

  it('barra quem não é membro', async () => {
    await expect(journey.getJourney(companyId, 'intruso')).rejects.toMatchObject({
      code: 'NOT_A_MEMBER',
    });
  });

  it('calcula contagem e percentual', async () => {
    const res = await journey.getJourney(companyId, 'u1');
    expect(res.total).toBe(8);
    expect(res.doneCount).toBeGreaterThanOrEqual(1); // criar-empresa
    expect(res.percent).toBe(Math.round((res.doneCount / res.total) * 100));
  });
});
