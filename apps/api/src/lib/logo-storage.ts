import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Porta de armazenamento da logo da empresa. A logo pertence a identidade
 * da empresa (bucket company-logos, publico para leitura); nao misturar com
 * comprovantes financeiros.
 */
export interface LogoStorage {
  /** Sobe/substitui a logo e devolve a URL publica. */
  upload(companyId: string, data: Buffer, contentType: string): Promise<string>;
  remove(companyId: string): Promise<void>;
}

const BUCKET = 'company-logos';
const extByType: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export class SupabaseLogoStorage implements LogoStorage {
  constructor(private readonly db: SupabaseClient) {}

  async upload(companyId: string, data: Buffer, contentType: string): Promise<string> {
    const ext = extByType[contentType] ?? 'png';
    const path = `${companyId}/logo.${ext}`;
    // Remove variantes antigas (trocar png por jpg nao pode deixar lixo).
    await this.remove(companyId);
    const { error } = await this.db.storage.from(BUCKET).upload(path, data, {
      contentType,
      upsert: true,
    });
    if (error) throw new Error(`upload da logo: ${error.message}`);
    const { data: pub } = this.db.storage.from(BUCKET).getPublicUrl(path);
    // Cache-buster: a URL muda a cada troca para o navegador nao segurar a antiga.
    return `${pub.publicUrl}?v=${Date.now()}`;
  }

  async remove(companyId: string): Promise<void> {
    const paths = Object.values(extByType).map((ext) => `${companyId}/logo.${ext}`);
    await this.db.storage.from(BUCKET).remove(paths);
  }
}

/** Dev/testes: guarda em memoria como data URL (sem infra externa). */
export class InMemoryLogoStorage implements LogoStorage {
  async upload(_companyId: string, data: Buffer, contentType: string): Promise<string> {
    return `data:${contentType};base64,${data.toString('base64')}`;
  }
  async remove(): Promise<void> {}
}
