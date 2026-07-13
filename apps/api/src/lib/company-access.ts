import { env } from '../config/env';

/**
 * Camada de permissão de PLANO. Hoje a regra é simples (e-mail liberado nesta
 * fase de lançamento), mas fica CENTRALIZADA aqui de propósito: amanhã esta
 * mesma função passa a olhar plano da conta, assinatura ativa e limite de
 * empresas, sem espalhar `if` pelo resto do código.
 */

/** Liberado por padrão nesta fase: a fundadora. */
const DEFAULT_ALLOWED = ['rafaelle.rodrigues@gmail.com'];

/** E-mails liberados (default + PLIM_MULTI_COMPANY_EMAILS), sempre minúsculos. */
function allowedEmails(): Set<string> {
  const extra = (env.PLIM_MULTI_COMPANY_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED, ...extra]);
}

/**
 * O usuário pode ter mais de uma empresa?
 * Comparação de e-mail é case-insensitive por definição.
 */
export function canCreateMultipleCompanies(user: { email?: string | null }): boolean {
  const email = user.email?.trim().toLowerCase();
  if (!email) return false;
  return allowedEmails().has(email);
}
