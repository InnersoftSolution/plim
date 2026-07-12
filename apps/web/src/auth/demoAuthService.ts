import type { LoginInput, SignupInput } from '@plim/shared';
import { AuthError, type AuthService, type AuthUser, type SignupResult } from './types';

const SESSION_KEY = 'plim.session';

/**
 * Serviço DEMONSTRATIVO — permite validar toda a experiência sem backend.
 * Comportamentos:
 *  - qualquer e-mail válido + senha logam; `erro@plim.com` ou senha "senha-incorreta" falham;
 *  - cadastro com `existente@plim.com` simula conflito;
 *  - recuperação de senha sempre responde de forma genérica (anti-enumeração).
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const listeners = new Set<(user: AuthUser | null) => void>();

function readSession(): AuthUser | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function saveSession(user: AuthUser): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  listeners.forEach((cb) => cb(user));
}

function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
  listeners.forEach((cb) => cb(null));
}

function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? 'pessoa';
  return local
    .split(/[._-]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

export const demoAuthService: AuthService = {
  async login(input: LoginInput): Promise<AuthUser> {
    await delay(300);
    if (input.email === 'erro@plim.com' || input.password === 'senha-incorreta') {
      throw new AuthError('INVALID_CREDENTIALS', 'E-mail ou senha inválidos.');
    }
    const user: AuthUser = {
      id: crypto.randomUUID(),
      fullName: nameFromEmail(input.email),
      email: input.email,
    };
    saveSession(user);
    return user;
  },

  async loginWithGoogle(): Promise<void> {
    await delay(400);
    saveSession({ id: crypto.randomUUID(), fullName: 'Conta Google (demo)', email: 'google.demo@plim.work' });
  },

  async signup(input: SignupInput): Promise<SignupResult> {
    await delay(400);
    if (input.email === 'existente@plim.com') {
      throw new AuthError('EMAIL_ALREADY_REGISTERED', 'Esse e-mail já tem uma conta no plim.');
    }
    return { requiresEmailConfirmation: true };
  },

  async requestPasswordReset(): Promise<void> {
    await delay(350);
  },

  async logout(): Promise<void> {
    clearSession();
  },

  async getSession(): Promise<AuthUser | null> {
    return readSession();
  },

  async getAccessToken(): Promise<string | null> {
    // Sem backend real no modo demo — a API usa o owner do corpo (fallback de dev).
    return null;
  },

  onAuthStateChange(callback: (user: AuthUser | null) => void): () => void {
    listeners.add(callback);
    return () => listeners.delete(callback);
  },

  async updateName(fullName: string): Promise<AuthUser> {
    await delay(250);
    const current = readSession() ?? { id: crypto.randomUUID(), email: 'demo@plim.work', fullName: '' };
    const user: AuthUser = { ...current, fullName };
    saveSession(user);
    return user;
  },

  async updatePassword(): Promise<void> {
    await delay(300);
  },
};
