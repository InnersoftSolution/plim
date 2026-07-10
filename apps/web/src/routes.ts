/**
 * Destino de quem já está autenticado e cai numa tela de auth.
 * Hoje vai pro onboarding — a decisão "onboarding vs painel" será do backend
 * quando o Supabase rastrear se o usuário já tem empresa. Compartilhado entre
 * o guarda de rota e o LoginPage para que concordem (sem corrida de rota).
 */
export const POST_AUTH_REDIRECT = '/';
