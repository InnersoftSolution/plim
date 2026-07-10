import { z } from 'zod';

/**
 * Conteúdo de orientação CONFIGURÁVEL (PRD §13/§20): textos sobre formalização,
 * MEI, CNPJ, impostos etc. vivem no banco (guide_contents), nunca no código —
 * regras mudam e precisam ser revisáveis por especialistas sem deploy.
 * `topic` agrupa (ex.: 'legal_structure'); `key` identifica o item (ex.: 'mei').
 */
export const guideContentSchema = z.object({
  id: z.string().uuid(),
  topic: z.string(),
  key: z.string(),
  title: z.string(),
  /** Resumo de uma linha (aparece em destaque). */
  short: z.string().nullable(),
  /** Corpo em texto simples/markdown leve. */
  body: z.string(),
  sortOrder: z.number().int(),
});
export type GuideContent = z.infer<typeof guideContentSchema>;
