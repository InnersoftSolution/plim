import type { z } from 'zod';

/**
 * Valida FORMATO no front (UX imediata). A validação de verdade
 * acontece sempre no backend — ver docs/ARQUITETURA.md.
 */
export function validateForm<S extends z.ZodTypeAny>(
  schema: S,
  data: unknown,
): { data: z.infer<S>; errors: null } | { data: null; errors: Record<string, string> } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { data: result.data, errors: null };
  }
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_form';
    if (!errors[key]) errors[key] = issue.message;
  }
  return { data: null, errors };
}
