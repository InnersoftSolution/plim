/**
 * Entrypoint serverless da Vercel (JavaScript puro).
 *
 * A API inteira (Fastify + rotas + serviços + @plim/shared) é empacotada
 * pelo esbuild durante o build (ver buildCommand no vercel.json) em
 * .api-bundle/app.mjs — chega aqui como JS pronto, sem TypeScript para a
 * Vercel compilar. Em dev/local nada muda: apps/api/src/server.ts.
 *
 * A instância do Fastify é reaproveitada entre invocações "quentes".
 */
import { buildApp } from '../.api-bundle/app.mjs';

let ready = null;

function getApp() {
  if (!ready) {
    const app = buildApp();
    ready = (async () => {
      await app.ready();
      return app;
    })();
  }
  return ready;
}

export default async function handler(req, res) {
  // O front chama /api/... (mesma origem). As rotas do Fastify não têm esse
  // prefixo, então removemos aqui — igual ao proxy do Vite em desenvolvimento.
  if (req.url && req.url.startsWith('/api')) {
    req.url = req.url.slice(4) || '/';
  }
  const app = await getApp();
  app.server.emit('request', req, res);
}
