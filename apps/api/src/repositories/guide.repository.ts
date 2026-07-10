import type { GuideContent } from '@plim/shared';

/** Conteúdo de orientação configurável (guide_contents). Somente leitura na API. */
export interface GuideRepository {
  listByTopic(topic: string): Promise<GuideContent[]>;
}
