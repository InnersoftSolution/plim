import type { GuideContent } from '@plim/shared';
import { guidesSeed } from '../../content/guides.seed';
import type { GuideRepository } from '../guide.repository';

export class InMemoryGuideRepository implements GuideRepository {
  private guides: GuideContent[] = [...guidesSeed];

  async listByTopic(topic: string): Promise<GuideContent[]> {
    return this.guides
      .filter((g) => g.topic === topic)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }
}
