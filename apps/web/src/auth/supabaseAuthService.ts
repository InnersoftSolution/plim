import type { Session, User } from '@supabase/supabase-js';
import type { LoginInput, SignupInput } from '@plim/shared';
import { requireSupabase } from '../lib/supabase';
import { AuthError, type AuthService, type AuthUser, type SignupResult } from './types';

/**
 * Implementação real de autenticação sobre o Supabase Auth.
 * Só de auth: nome/e-mail vêm do token; dados de negócio vão pela API.
 */
function toAuthUser(user: User | null | undefined): AuthUser | null {
  if (!user) return null;
  const meta = user.user_metadata ?? {};
  const fullName =
    (meta.full_name as string | undefined) ??
    (meta.name as string | undefined) ??
    user.email?.split('@')[0] ??
    'pessoa';
  return { id: user.id, fullName, email: user.email ?? '' };
}

function sessionUser(session: Session | null): AuthUser | null {
  return toAuthUser(session?.user);
}

export const supabaseAuthService: AuthService = {
  async login(input: LoginInput): Promise<AuthUser> {
    const supabase = requireSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (error) {
      throw new AuthError('INVALID_CREDENTIALS', 'E-mail ou senha inválidos.');
    }
    const user = toAuthUser(data.user);
    if (!user) throw new AuthError('UNKNOWN', 'Não foi possível iniciar a sessão.');
    return user;
  },

  async loginWithGoogle(): Promise<void> {
    const supabase = requireSupabase();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw new AuthError('UNKNOWN', 'Não foi possível entrar com o Google.');
    // O navegador é redirecionado; o usuário volta via /auth/callback.
  },

  async signup(input: SignupInput): Promise<SignupResult> {
    const supabase = requireSupabase();
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { full_name: input.fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      if (error.message.toLowerCase().includes('already')) {
        throw new AuthError('EMAIL_ALREADY_REGISTERED', 'Esse e-mail já tem uma conta no plim.');
      }
      throw new AuthError('UNKNOWN', 'Não foi possível criar a conta. Tente novamente.');
    }
    // Sem sessão imediata = e-mail precisa ser confirmado.
    return { requiresEmailConfirmation: !data.session };
  },

  async requestPasswordReset(email: string): Promise<void> {
    const supabase = requireSupabase();
    // Resposta sempre genérica — o Supabase não revela se o e-mail existe.
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
  },

  async logout(): Promise<void> {
    const supabase = requireSupabase();
    await supabase.auth.signOut();
  },

  async getSession(): Promise<AuthUser | null> {
    const supabase = requireSupabase();
    const { data } = await supabase.auth.getSession();
    return sessionUser(data.session);
  },

  async getAccessToken(): Promise<string | null> {
    const supabase = requireSupabase();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  },

  async refreshSession(): Promise<string | null> {
    const supabase = requireSupabase();
    const { data, error } = await supabase.auth.refreshSession();
    if (error) return null;
    return data.session?.access_token ?? null;
  },

  onAuthStateChange(callback: (user: AuthUser | null) => void): () => void {
    const supabase = requireSupabase();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(sessionUser(session));
    });
    return () => data.subscription.unsubscribe();
  },

  async updateName(fullName: string): Promise<AuthUser> {
    const supabase = requireSupabase();
    const { data, error } = await supabase.auth.updateUser({ data: { full_name: fullName } });
    if (error) throw new AuthError('UNKNOWN', 'Não foi possível salvar seu nome. Tente de novo.');
    const user = toAuthUser(data.user);
    if (!user) throw new AuthError('UNKNOWN', 'Não foi possível atualizar o perfil.');
    return user;
  },

  async updatePassword(newPassword: string): Promise<void> {
    const supabase = requireSupabase();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      const msg = error.message.toLowerCase().includes('different')
        ? 'A nova senha precisa ser diferente da atual.'
        : 'Não foi possível alterar a senha. Tente de novo.';
      throw new AuthError('UNKNOWN', msg);
    }
  },
};
