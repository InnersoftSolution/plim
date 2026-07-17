import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { CalendarService } from '../../services/calendar.service';
import { authenticate } from '../auth';
import { DomainError } from '../../lib/errors';

const callbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

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

  // Passo 1: devolve a URL de consentimento (o front navega para ela).
  app.get('/calendar/google/connect', { preHandler: authenticate }, async (request) => {
    const userId = request.user?.id;
    if (!userId) throw new DomainError('UNAUTHENTICATED', 'Autenticação obrigatória.', 401);
    return { url: service.startConnect(userId) };
  });

  // Passo 2: o Google chama de volta aqui. Sem Bearer; confia no state assinado.
  app.get('/calendar/google/callback', async (request, reply) => {
    const query = callbackQuerySchema.parse(request.query);
    const redirectTo = await service.handleCallback(query);
    return reply.redirect(redirectTo);
  });

  // Desconectar (autenticado).
  app.post('/calendar/google/disconnect', { preHandler: authenticate }, async (request) => {
    const userId = request.user?.id;
    if (!userId) throw new DomainError('UNAUTHENTICATED', 'Autenticação obrigatória.', 401);
    return service.disconnect(userId);
  });
}
