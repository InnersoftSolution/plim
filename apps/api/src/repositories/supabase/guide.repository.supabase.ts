import type { SupabaseClient } from '@supabase/supabase-js';
import type { GuideContent } from '@plim/shared';
import type { GuideRepository } from '../guide.repository';

interface GuideRow {
  id: string;
  topic: string;
  key: string;
  title: string;
  short: string | null;
  body: string;
  sort_order: number;
}

export class SupabaseGuideRepository implements GuideRepository {
  constructor(private readonly db: SupabaseClient) {}

  async listByTopic(topic: string): Promise<GuideContent[]> {
    const { data: rows, error } = await this.db
      .from('guide_contents')
      .select()
      .eq('topic', topic)
      .order('sort_order', { ascending: true })
      .returns<GuideRow[]>();
    if (error) throw new Error(`Falha ao carregar guias: ${error.message}`);
    return (rows ?? []).map((r) => ({
      id: r.id,
      topic: r.topic,
      key: r.key,
      title: r.title,
      short: r.short,
      body: r.body,
      sortOrder: r.sort_order,
    }));
  }
}
