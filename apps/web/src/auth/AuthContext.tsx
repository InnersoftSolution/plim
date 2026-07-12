import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LoginInput, SignupInput } from '@plim/shared';
import type { AuthUser, SignupResult } from './types';
import { authService } from './service';
import { clearApiCache } from '../lib/api';
import { clearAdminMeCache } from '../admin/useAdminMe';

interface AuthContextValue {
  user: AuthUser | null;
  /** True enquanto a sessão inicial ainda está sendo carregada. */
  loading: boolean;
  login(input: LoginInput): Promise<AuthUser>;
  loginWithGoogle(): Promise<void>;
  signup(input: SignupInput): Promise<SignupResult>;
  requestPasswordReset(email: string): Promise<void>;
  logout(): Promise<void>;
  updateName(fullName: string): Promise<void>;
  updatePassword(newPassword: string): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    // Carrega a sessão atual (assíncrono) e escuta mudanças (login/logout/refresh).
    authService.getSession().then((u) => {
      if (active) {
        setUser(u);
        setLoading(false);
      }
    });
    const unsubscribe = authService.onAuthStateChange((u) => {
      if (active) setUser(u);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const logged = await authService.login(input);
    setUser(logged);
    return logged;
  }, []);

  const loginWithGoogle = useCallback(() => authService.loginWithGoogle(), []);
  const signup = useCallback((input: SignupInput) => authService.signup(input), []);
  const requestPasswordReset = useCallback((email: string) => authService.requestPasswordReset(email), []);

  const logout = useCallback(async () => {
    await authService.logout();
    clearApiCache();
    clearAdminMeCache();
    setUser(null);
  }, []);

  const updateName = useCallback(async (fullName: string) => {
    const updated = await authService.updateName(fullName);
    setUser(updated);
  }, []);

  const updatePassword = useCallback((newPassword: string) => authService.updatePassword(newPassword), []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      loginWithGoogle,
      signup,
      requestPasswordReset,
      logout,
      updateName,
      updatePassword,
    }),
    [user, loading, login, loginWithGoogle, signup, requestPasswordReset, logout, updateName, updatePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
