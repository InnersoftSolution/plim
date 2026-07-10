import type { FastifyReply, FastifyRequest } from 'fastify';
import { isSupabaseConfigured } from '../config/env';
import { getSupabaseAdmin } from '../lib/supabase';
import { DomainError } from '../lib/errors';

export interface AuthedUser {
  id: string;
  fullName: string;
  email: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthedUser | null;
  }
}

/**
 * preHandler de autenticação.
 *  - Supabase ligado: exige Bearer token válido e popula request.user.
 *  - Supabase desligado (dev): request.user = null; rotas usam o owner do corpo.
 */
export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  request.user = null;

  const header = request.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (!isSupabaseConfigured) {
    return; // modo dev
  }

  if (!token) {
    throw new DomainError('UNAUTHENTICATED', 'Autenticação obrigatória.', 401);
  }

  const { data, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !data.user) {
    throw new DomainError('UNAUTHENTICATED', 'Sessão inválida ou expirada.', 401);
  }

  const u = data.user;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  request.user = {
    id: u.id,
    fullName:
      (meta.full_name as string | undefined) ??
      (meta.name as string | undefined) ??
      u.email?.split('@')[0] ??
      'pessoa',
    email: u.email ?? '',
  };
}
