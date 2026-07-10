/**
 * Empacota a API (Fastify + rotas + @plim/shared) num único JS para a
 * função serverless da Vercel consumir (ver api/index.mjs).
 * Dependências de runtime ficam externas (resolvidas do node_modules).
 */
import { build } from 'esbuild';

await build({
  entryPoints: ['apps/api/src/app.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: ['fastify', 'zod', '@supabase/supabase-js', '@anthropic-ai/sdk', 'dotenv'],
  outfile: '.api-bundle/app.mjs',
});

console.log('API empacotada em .api-bundle/app.mjs');
