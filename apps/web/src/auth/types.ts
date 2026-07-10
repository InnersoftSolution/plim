import type { LoginInput, SignupInput } from '@plim/shared';

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
}

export interface SignupResult {
  requiresEmailConfirmation: boolean;
}

/**
 * Contrato de autenticação do front.
 * Implementações: `demoAuthService` (UI sem backend) e `supabaseAuthService` (real).
 * As telas não mudam ao trocar a implementação — ver src/auth/service.ts.
 */
export interface AuthService {
  login(input: LoginInput): Promise<AuthUser>;
  /** OAuth redireciona o navegador; o usuário volta via /auth/callback. */
  loginWithGoogle(): Promise<void>;
  signup(input: SignupInput): Promise<SignupResult>;
  requestPasswordReset(email: string): Promise<void>;
  logout(): Promise<void>;
  /** Sessão atual (assíncrona — Supabase carrega/renova em background). */
  getSession(): Promise<AuthUser | null>;
  /** Token JWT para autenticar chamadas à API. Null se não logado. */
  getAccessToken(): Promise<string | null>;
  /** Notifica mudanças de sessão (login, logout, refresh). Retorna unsubscribe. */
  onAuthStateChange(callback: (user: AuthUser | null) => void): () => void;
}

export class AuthError extends Error {
  constructor(
    public readonly code: 'INVALID_CREDENTIALS' | 'EMAIL_ALREADY_REGISTERED' | 'UNKNOWN',
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
