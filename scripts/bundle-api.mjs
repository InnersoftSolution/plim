/**
 * Empacota a API (Fastify + rotas + serviços + @plim/shared) num único JS
 * pronto para produção no Railway: .api-bundle/server.mjs (ver railway.json).
 * Dependências de runtime ficam externas (resolvidas do node_modules).
 */
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

/**
 * Toda dependência de runtime fica EXTERNA (resolvida do node_modules), lida
 * direto do package.json da API para nunca mais esquecer uma. Embutir pacote
 * CommonJS num bundle ESM quebra em produção: os `require` internos viram
 * "Dynamic require ... is not supported" e o processo morre no start (foi o
 * que derrubou o deploy dos plugins do Fastify).
 * Exceção: @plim/shared é código-fonte do monorepo, sem build, então entra
 * no bundle.
 */
const apiPkg = JSON.parse(readFileSync('apps/api/package.json', 'utf8'));
const external = Object.keys(apiPkg.dependencies ?? {}).filter((dep) => dep !== '@plim/shared');

await build({
  entryPoints: ['apps/api/src/server.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external,
  outfile: '.api-bundle/server.mjs',
});

console.log('API empacotada em .api-bundle/server.mjs (Railway)');
