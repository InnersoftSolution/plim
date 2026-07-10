import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente Supabase do front — usado SOMENTE para autenticação (login, sessão).
 * Dados de negócio nunca passam por aqui: vão pela API (regra de ouro).
 * Só é criado se as variáveis estiverem definidas (modo supabase).
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em apps/web/.env.local.',
    );
  }
  return supabase;
}
