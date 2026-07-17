import 'dotenv/config';
import { z } from 'zod';

/** Trata string vazia (".env" com chave em branco) como ausente. */
const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const envSchema = z.object({
  // Vazio → default (o Railway injeta NODE_ENV="" e .default() só cobre undefined).
  NODE_ENV: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['development', 'test', 'production']).default('development'),
  ),
  PORT: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce.number().int().positive().default(3333),
  ),
  // Supabase (opcionais): quando presentes, a API usa Postgres + valida JWT.
  // Ausentes → modo dev com repositório in-memory e owner vindo do corpo.
  SUPABASE_URL: emptyToUndefined(z.string().url()),
  SUPABASE_SERVICE_ROLE_KEY: emptyToUndefined(z.string().min(1)),
  // IA (opcional): sem a chave, o copiloto usa só os insights determinísticos (custo zero).
  ANTHROPIC_API_KEY: emptyToUndefined(z.string().min(1)),
  PLIM_ADVISOR_MODEL: emptyToUndefined(z.string().min(1)),
  // Multiempresa (fase de lançamento): e-mails liberados a criar mais de uma
  // empresa, separados por vírgula. Futuro: dá lugar ao plano/assinatura.
  PLIM_MULTI_COMPANY_EMAILS: emptyToUndefined(z.string().min(1)),
  // Integração Google Calendar (opcional): sem estas chaves, o recurso fica
  // dormente (o front mostra "em breve"). Fluxo OAuth dedicado, só calendar.events.
  GOOGLE_OAUTH_CLIENT_ID: emptyToUndefined(z.string().min(1)),
  GOOGLE_OAUTH_CLIENT_SECRET: emptyToUndefined(z.string().min(1)),
  // URL da API que o Google chama de volta (.../calendar/google/callback).
  GOOGLE_OAUTH_REDIRECT_URI: emptyToUndefined(z.string().url()),
  // Para onde mandar o usuário depois de conectar (origem do app web).
  PLIM_WEB_ORIGIN: emptyToUndefined(z.string().url()),
  // Chave de 32 bytes (base64/hex) que cifra os tokens do Google no banco.
  CALENDAR_TOKEN_KEY: emptyToUndefined(z.string().min(1)),
});

export const env = envSchema.parse(process.env);

// Em testes, nunca usar infra real (Postgres/IA): isolamento e custo zero.
const isTest = env.NODE_ENV === 'test';

/** Supabase está configurado? Define qual repositório/auth a API usa. */
export const isSupabaseConfigured = !isTest && Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);

/** IA está configurada? Define se o copiloto adiciona a "leitura" do LLM. */
export const isLlmConfigured = !isTest && Boolean(env.ANTHROPIC_API_KEY);

/**
 * Google Calendar está configurado? Exige as credenciais OAuth, a redirect URI,
 * a origem do app e a chave de cifragem dos tokens. Sem tudo isso, a integração
 * fica desligada e o front mostra o card "em breve" (nunca quebra o app).
 */
export const isGoogleCalendarConfigured =
  !isTest &&
  Boolean(
    env.GOOGLE_OAUTH_CLIENT_ID &&
      env.GOOGLE_OAUTH_CLIENT_SECRET &&
      env.GOOGLE_OAUTH_REDIRECT_URI &&
      env.PLIM_WEB_ORIGIN &&
      env.CALENDAR_TOKEN_KEY,
  );
