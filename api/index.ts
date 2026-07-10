import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../apps/api/src/app';

/**
 * Entrypoint serverless da Vercel.
 *
 * A Vercel liga esta função só quando chega uma requisição (modelo serverless);
 * não existe processo Node ligado 24h aqui. Em dev/local, a API continua
 * subindo pelo caminho normal (apps/api/src/server.ts → app.listen).
 *
 * Reaproveitamos a instância do Fastify entre invocações "quentes" para não
 * reconstruir o app (rotas + serviços) a cada request.
 */
let ready: Promise<FastifyInstance> | null = null;

function getApp(): Promise<FastifyInstance> {
  if (!ready) {
    const app = buildApp();
    ready = app.ready().then(() => app);
  }
  return ready;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // O front chama /api/... (mesma origem). As rotas do Fastify NÃO têm esse
  // prefixo, então removemos aqui — igual ao proxy do Vite em desenvolvimento.
  if (req.url && req.url.startsWith('/api')) {
    req.url = req.url.slice(4) || '/';
  }
  const app = await getApp();
  app.server.emit('request', req, res);
}
