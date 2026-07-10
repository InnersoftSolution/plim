import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';

/**
 * Cliente Supabase ADMIN (service role) — uso exclusivo do servidor.
 * Faz duas coisas:
 *  1) valida o JWT do usuário (auth.getUser);
 *  2) acessa o Postgres com privilégio total (a API é quem aplica as regras).
 * Nunca exponha a service role key ao front.
 */
let client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase não configurado: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.');
  }
  if (!client) {
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}
