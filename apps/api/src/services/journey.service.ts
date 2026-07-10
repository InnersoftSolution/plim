import { journeyStepCatalog, type JourneyResponse } from '@plim/shared';
import type { Company, CompanyMember } from '../domain/company';
import type { JourneyRepository } from '../repositories/journey.repository';
import type { CompanyService } from './company.service';
import { DomainError, NotFoundError } from '../lib/errors';

/**
 * Regras da jornada guiada. Passos `auto` são derivados dos dados da empresa
 * (o sistema "já sabe"); passos `manual` o fundador marca. Autorização e número
 * vêm sempre daqui — o front só apresenta.
 */
export class JourneyService {
  constructor(
    private readonly companyService: CompanyService,
    private readonly repo: JourneyRepository,
  ) {}

  async getJourney(companyId: string, actingUserId?: string | null): Promise<JourneyResponse> {
    const { company, members } = await this.companyService.getOverview(companyId, actingUserId);
    const progress = await this.repo.listProgress(companyId);
    const completedAtByStep = new Map(progress.map((p) => [p.stepId, p.completedAt]));

    const steps = journeyStepCatalog.map((step) => {
      if (step.kind === 'auto') {
        return {
          id: step.id,
          title: step.title,
          description: step.description,
          kind: step.kind,
          helpHref: step.helpHref ?? null,
          done: this.isAutoStepDone(step.id, company, members),
          completedAt: null,
        };
      }
      const completedAt = completedAtByStep.get(step.id) ?? null;
      return {
        id: step.id,
        title: step.title,
        description: step.description,
        kind: step.kind,
        helpHref: step.helpHref ?? null,
        done: completedAt != null,
        completedAt: completedAt ? completedAt.toISOString() : null,
      };
    });

    const doneCount = steps.filter((s) => s.done).length;
    const total = steps.length;
    const percent = total === 0 ? 0 : Math.round((doneCount / total) * 100);
    return { steps, doneCount, total, percent };
  }

  async setStep(
    companyId: string,
    stepId: string,
    done: boolean,
    actingUserId?: string | null,
  ): Promise<JourneyResponse> {
    // Autoriza (membro) reusando a regra existente.
    await this.companyService.getOverview(companyId, actingUserId);

    const step = journeyStepCatalog.find((s) => s.id === stepId);
    if (!step) {
      throw new NotFoundError('JOURNEY_STEP_NOT_FOUND', 'Passo da jornada não encontrado.');
    }
    if (step.kind === 'auto') {
      throw new DomainError('JOURNEY_STEP_AUTO', 'Esse passo é detectado automaticamente.');
    }

    await this.repo.setStep(companyId, stepId, done);
    return this.getJourney(companyId, actingUserId);
  }

  /** Passos automáticos: derivados do estado atual da empresa. */
  private isAutoStepDone(stepId: string, _company: Company, members: CompanyMember[]): boolean {
    switch (stepId) {
      case 'criar-empresa':
        return true; // se chegou aqui, a empresa existe
      case 'definir-sociedade': {
        if (members.length === 0) return false;
        if (members.some((m) => m.equityPercent == null)) return false;
        const totalHundredths = members.reduce((sum, m) => sum + Math.round((m.equityPercent ?? 0) * 100), 0);
        return totalHundredths === 100 * 100;
      }
      default:
        return false;
    }
  }
}
