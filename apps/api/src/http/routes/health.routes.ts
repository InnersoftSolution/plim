import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // Raiz amigável: abrir localhost:3333 no navegador não deve parecer um erro.
  app.get('/', async () => ({
    service: 'plim-api',
    status: 'ok',
    message: 'API do Plim no ar. Use o app em http://localhost:5180.',
  }));
  app.get('/health', async () => ({ status: 'ok', service: 'plim-api' }));
}
