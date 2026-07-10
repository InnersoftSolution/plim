import type { SupabaseClient } from '@supabase/supabase-js';
import type { JourneyProgressEntry, JourneyRepository } from '../journey.repository';

interface JourneyRow {
  step_id: string;
  completed_at: string;
}

export class SupabaseJourneyRepository implements JourneyRepository {
  constructor(private readonly db: SupabaseClient) {}

  async listProgress(companyId: string): Promise<JourneyProgressEntry[]> {
    const { data: rows, error } = await this.db
      .from('company_journey_steps')
      .select('step_id, completed_at')
      .eq('company_id', companyId)
      .returns<JourneyRow[]>();
    if (error) throw new Error(`Falha ao listar progresso da jornada: ${error.message}`);
    return (rows ?? []).map((r) => ({ stepId: r.step_id, completedAt: new Date(r.completed_at) }));
  }

  async setStep(companyId: string, stepId: string, done: boolean): Promise<void> {
    if (done) {
      const { error } = await this.db
        .from('company_journey_steps')
        .upsert(
          { company_id: companyId, step_id: stepId, completed_at: new Date().toISOString() },
          { onConflict: 'company_id,step_id' },
        );
      if (error) throw new Error(`Falha ao marcar passo: ${error.message}`);
    } else {
      const { error } = await this.db
        .from('company_journey_steps')
        .delete()
        .eq('company_id', companyId)
        .eq('step_id', stepId);
      if (error) throw new Error(`Falha ao desmarcar passo: ${error.message}`);
    }
  }
}
