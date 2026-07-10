/**
 * Empacota a API (Fastify + rotas + serviços + @plim/shared) num único JS
 * pronto para produção no Railway: .api-bundle/server.mjs (ver railway.json).
 * Dependências de runtime ficam externas (resolvidas do node_modules).
 */
import { build } from 'esbuild';

await build({
  entryPoints: ['apps/api/src/server.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: ['fastify', 'zod', '@supabase/supabase-js', '@anthropic-ai/sdk', 'dotenv'],
  outfile: '.api-bundle/server.mjs',
});

console.log('API empacotada em .api-bundle/server.mjs (Railway)');
