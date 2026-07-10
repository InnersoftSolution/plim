/**
 * Empacota a API (Fastify + rotas + serviços + @plim/shared) em JS pronto:
 *
 *  - .api-bundle/server.mjs → servidor completo (app.listen) para o Railway
 *  - .api-bundle/app.mjs    → só o buildApp, para a função serverless da Vercel
 *                             (legado da fase "tudo na Vercel"; ver api/index.mjs)
 *
 * Dependências de runtime ficam externas (resolvidas do node_modules).
 */
import { build } from 'esbuild';

const shared = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: ['fastify', 'zod', '@supabase/supabase-js', '@anthropic-ai/sdk', 'dotenv'],
};

await build({ ...shared, entryPoints: ['apps/api/src/server.ts'], outfile: '.api-bundle/server.mjs' });
await build({ ...shared, entryPoints: ['apps/api/src/app.ts'], outfile: '.api-bundle/app.mjs' });

console.log('API empacotada: .api-bundle/server.mjs (Railway) e .api-bundle/app.mjs (Vercel)');
