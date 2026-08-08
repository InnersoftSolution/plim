import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { CalendarService } from '../../services/calendar.service';
import { authenticate } from '../auth';
import { DomainError } from '../../lib/errors';
import { env } from '../../config/env';

const callbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

/** Cookie de curta duração que amarra o fluxo OAuth ao navegador de origem. */
const OAUTH_COOKIE = 'plim_gcal_oauth';
const OAUTH_COOKIE_MAX_AGE = 10 * 60; // 10 min, igual ao TTL do state

/**
 * Integração Google Calendar (unidirecional). O `service` só é passado quando a
 * integração está configurada; senão estas rotas nem são registradas e o front
 * mostra o card "em breve".
 *
 * Atenção ao /callback: é o único endpoint SEM autenticação Bearer, porque o
 * Google redireciona o navegador direto para cá. A confiança vem do `state`
 * assinado (HMAC), que carrega o user_id de quem iniciou a conexão.
 */
export async function calendarRoutes(
  app: FastifyInstance,
  opts: { service: CalendarService },
): Promise<void> {
  const { service } = opts;

  // Estado da conexão do usuário atual (autenticado).
  app.get('/me/calendar/google', { preHandler: authenticate }, async (request) => {
    const userId = request.user?.id;
    if (!userId) throw new DomainError('UNAUTHENTICATED', 'Autenticação obrigatória.', 401);
    return service.getConnection(userId);
  });

  // Passo 1: devolve a URL de consentimento (o front navega para ela) e grava o
  // cookie de vínculo. SameSite=Lax para o cookie voltar no redirect do Google;
  // httpOnly para o JS não ler; Secure só em produção (o fluxo real é HTTPS).
  app.get('/calendar/google/connect', { preHandler: authenticate }, async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) throw new DomainError('UNAUTHENTICATED', 'Autenticação obrigatória.', 401);
    const { url, nonce } = service.startConnect(userId);
    reply.setCookie(OAUTH_COOKIE, nonce, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      maxAge: OAUTH_COOKIE_MAX_AGE,
    });
    return { url };
  });

  // Passo 2: o Google chama de volta aqui. Sem Bearer; confia no state assinado
  // E no cookie de vínculo (precisa bater com o nonce do state). Limpa o cookie.
  app.get('/calendar/google/callback', async (request, reply) => {
    const query = callbackQuerySchema.parse(request.query);
    const cookieNonce = request.cookies[OAUTH_COOKIE] ?? null;
    const redirectTo = await service.handleCallback(query, cookieNonce);
    reply.clearCookie(OAUTH_COOKIE, { path: '/' });
    return reply.redirect(redirectTo);
  });

  // Desconectar (autenticado).
  app.post('/calendar/google/disconnect', { preHandler: authenticate }, async (request) => {
    const userId = request.user?.id;
    if (!userId) throw new DomainError('UNAUTHENTICATED', 'Autenticação obrigatória.', 401);
    return service.disconnect(userId);
  });
}
