import { z } from 'zod';

/**
 * Tipo de passo:
 * - `auto`: o sistema detecta sozinho (a partir dos dados já existentes).
 * - `manual`: o fundador marca quando concluir.
 */
export const journeyStepKindSchema = z.enum(['auto', 'manual']);
export type JourneyStepKind = z.infer<typeof journeyStepKindSchema>;

/**
 * Catálogo canônico da jornada de quem está abrindo a empresa (contexto BR).
 * É a fonte da verdade dos passos; o progresso por empresa vem à parte.
 */
export const journeyStepCatalog = [
  {
    id: 'criar-empresa',
    title: 'Criar a empresa no plim',
    description: 'Você já deu o primeiro passo: a empresa está cadastrada por aqui.',
    kind: 'auto',
    helpHref: null,
  },
  {
    id: 'definir-sociedade',
    title: 'Definir sócios e participações',
    description: 'Quem são os sócios e quanto cada um tem — somando 100%.',
    kind: 'auto',
    helpHref: null,
  },
  {
    id: 'verificar-marca',
    title: 'Verificar a marca no INPI',
    description: 'Cheque se o nome da sua empresa está livre para registro de marca.',
    kind: 'manual',
    helpHref: 'https://busca.inpi.gov.br/pePI/',
  },
  {
    id: 'registrar-dominio',
    title: 'Registrar o domínio',
    description: 'Garanta o endereço do seu site (.com.br) antes que alguém pegue.',
    kind: 'manual',
    helpHref: 'https://registro.br/',
  },
  {
    id: 'garantir-redes',
    title: 'Garantir as redes sociais',
    description: 'Reserve o @ da empresa nas redes onde seu público está.',
    kind: 'manual',
    helpHref: null,
  },
  {
    id: 'abrir-cnpj',
    title: 'Abrir o CNPJ',
    description: 'Formalize a empresa (MEI, LTDA…) conforme o seu caso.',
    kind: 'manual',
    helpHref: 'https://www.gov.br/empresas-e-negocios/pt-br',
  },
  {
    id: 'conta-pj',
    title: 'Abrir a conta PJ',
    description: 'Separe as finanças da empresa das pessoais com uma conta jurídica.',
    kind: 'manual',
    helpHref: null,
  },
  {
    id: 'organizar-financas',
    title: 'Organizar as finanças',
    description: 'Comece a registrar despesas e aportes para o rateio funcionar.',
    kind: 'manual',
    helpHref: null,
  },
] as const;

export type JourneyStepId = (typeof journeyStepCatalog)[number]['id'];

/** Um passo da jornada já com o progresso da empresa aplicado. */
export const journeyStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  kind: journeyStepKindSchema,
  helpHref: z.string().nullable(),
  done: z.boolean(),
  completedAt: z.string().nullable(),
});
export type JourneyStep = z.infer<typeof journeyStepSchema>;

export const journeyResponseSchema = z.object({
  steps: z.array(journeyStepSchema),
  doneCount: z.number(),
  total: z.number(),
  percent: z.number(),
});
export type JourneyResponse = z.infer<typeof journeyResponseSchema>;

export const setJourneyStepSchema = z.object({ done: z.boolean() });
export type SetJourneyStepInput = z.infer<typeof setJourneyStepSchema>;
