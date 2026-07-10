import { z } from 'zod';

/** Severidade visual do insight (define cor/ícone no front). */
export const insightSeveritySchema = z.enum(['positive', 'info', 'attention']);
export type InsightSeverity = z.infer<typeof insightSeveritySchema>;

/** Área a que o insight se refere. */
export const insightCategorySchema = z.enum(['sociedade', 'financeiro', 'jornada', 'modelo']);
export type InsightCategory = z.infer<typeof insightCategorySchema>;

/**
 * Um insight do copiloto. Gerado de forma DETERMINÍSTICA no backend
 * (números nunca vêm do LLM). `actionLabel`/`actionHref` são opcionais
 * e sugerem o próximo passo.
 */
export const insightSchema = z.object({
  id: z.string(),
  category: insightCategorySchema,
  severity: insightSeveritySchema,
  title: z.string(),
  message: z.string(),
  actionLabel: z.string().nullable(),
  actionHref: z.string().nullable(),
});
export type Insight = z.infer<typeof insightSchema>;

/**
 * Resposta do endpoint de insights: a lista determinística + uma "leitura"
 * opcional do copiloto (texto do LLM, só quando a IA está configurada).
 */
export const insightsResponseSchema = z.object({
  insights: z.array(insightSchema),
  summary: z.string().nullable(),
});
export type InsightsResponse = z.infer<typeof insightsResponseSchema>;
