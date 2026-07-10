/** Progresso de um passo manual da jornada de uma empresa. */
export interface JourneyProgressEntry {
  stepId: string;
  completedAt: Date;
}

/**
 * Acesso a dados do progresso da jornada. Só passos MANUAIS são persistidos
 * (passos automáticos são derivados dos dados da empresa, não ficam aqui).
 */
export interface JourneyRepository {
  listProgress(companyId: string): Promise<JourneyProgressEntry[]>;
  /** Marca (done=true) ou desmarca (done=false) um passo manual. */
  setStep(companyId: string, stepId: string, done: boolean): Promise<void>;
}
