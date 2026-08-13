import type { FastifyInstance } from 'fastify';

/**
 * O commit que está RODANDO, para saber qual versão da API respondeu.
 *
 * Sem isso, "deploy feito" era ato de fé: a Railway diz que subiu, o /health
 * diz ok, e ninguém prova que o código novo entrou (aconteceu em 12/08/2026,
 * quando um recálculo de acertos dependia da API nova e não havia como
 * conferir). A Railway injeta RAILWAY_GIT_COMMIT_SHA em todo deploy; fora dela
 * (local, testes), fica nulo.
 */
const commit = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null;

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // Raiz amigável: abrir localhost:3333 no navegador não deve parecer um erro.
  app.get('/', async () => ({
    service: 'plim-api',
    status: 'ok',
    message: 'API do Plim no ar.',
  }));
  app.get('/health', async () => ({ status: 'ok', service: 'plim-api', commit }));
}
