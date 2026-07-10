import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app';

describe('rotas de empresa (integração)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health responde ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
  });

  it('cria empresa com owner e adiciona sócio', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/companies',
      payload: {
        name: 'plim',
        owner: { fullName: 'Rafaelle Weran', email: 'rafaelle@plim.work' },
      },
    });
    expect(create.statusCode).toBe(201);
    const { company } = create.json();

    const add = await app.inject({
      method: 'POST',
      url: `/companies/${company.id}/members`,
      payload: { fullName: 'Maria Silva', email: 'maria@plim.work', equityPercent: 35 },
    });
    expect(add.statusCode).toBe(201);

    const list = await app.inject({ method: 'GET', url: `/companies/${company.id}/members` });
    expect(list.json()).toHaveLength(2);
  });

  it('devolve 422 com código estável quando equity passa de 100%', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/companies',
      payload: { name: 'plim', owner: { fullName: 'Rafaelle', email: 'r@plim.work' } },
    });
    const { company } = create.json();

    await app.inject({
      method: 'POST',
      url: `/companies/${company.id}/members`,
      payload: { fullName: 'Maria', email: 'maria@plim.work', equityPercent: 70 },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/companies/${company.id}/members`,
      payload: { fullName: 'João', email: 'joao@plim.work', equityPercent: 31 },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ error: 'EQUITY_SUM_EXCEEDED' });
  });

  it('devolve 400 para corpo inválido', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/companies',
      payload: { name: 'p' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
  });
});
