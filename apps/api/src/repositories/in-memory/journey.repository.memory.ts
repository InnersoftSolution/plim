import type { JourneyProgressEntry, JourneyRepository } from '../journey.repository';

export class InMemoryJourneyRepository implements JourneyRepository {
  /** chave: `${companyId}:${stepId}` → completedAt */
  private progress = new Map<string, Date>();

  async listProgress(companyId: string): Promise<JourneyProgressEntry[]> {
    const prefix = `${companyId}:`;
    return [...this.progress.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, completedAt]) => ({ stepId: key.slice(prefix.length), completedAt }));
  }

  async setStep(companyId: string, stepId: string, done: boolean): Promise<void> {
    const key = `${companyId}:${stepId}`;
    if (done) this.progress.set(key, new Date());
    else this.progress.delete(key);
  }
}
