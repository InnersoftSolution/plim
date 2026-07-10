import type { AuthService } from './types';
import { demoAuthService } from './demoAuthService';
import { supabaseAuthService } from './supabaseAuthService';

/**
 * Ponto ÚNICO de troca de provedor de autenticação.
 * Controlado por VITE_AUTH_PROVIDER (.env): "supabase" usa o real; qualquer
 * outro valor (ou ausente) usa o demonstrativo. As telas não mudam.
 */
export const authService: AuthService =
  import.meta.env.VITE_AUTH_PROVIDER === 'supabase' ? supabaseAuthService : demoAuthService;
