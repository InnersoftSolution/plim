import type { FastifyInstance } from 'fastify';
import {
  createContributionSchema,
  createExpenseSchema,
  createRevenueSchema,
  createSettlementPaymentSchema,
  payExpenseSchema,
  updateMovementSchema,
} from '@plim/shared';
import { z } from 'zod';
import type { FinanceService } from '../../services/finance.service';
import { authenticate } from '../auth';

const companyParamsSchema = z.object({ companyId: z.string().uuid() });

/**
 * Camada HTTP do financeiro. Valida entrada e delega ao FinanceService.
 * Autorização (ser membro) é aplicada no serviço, via getOverview.
 */
export async function financeRoutes(app: FastifyInstance, opts: { service: FinanceService }): Promise<void> {
  const { service } = opts;

  app.addHook('preHandler', authenticate);

  app.post('/companies/:companyId/expenses', async (request, reply) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    const input = createExpenseSchema.parse(request.body);
    const expense = await service.createExpense(companyId, input, request.user?.id ?? null);
    return reply.status(201).send(expense);
  });

  app.post('/companies/:companyId/contributions', async (request, reply) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    const input = createContributionSchema.parse(request.body);
    const contribution = await service.createContribution(companyId, input, request.user?.id ?? null);
    return reply.status(201).send(contribution);
  });

  app.post('/companies/:companyId/revenues', async (request, reply) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    const input = createRevenueSchema.parse(request.body);
    const revenue = await service.createRevenue(companyId, input, request.user?.id ?? null);
    return reply.status(201).send(revenue);
  });

  app.get('/companies/:companyId/expenses', async (request) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    return service.listExpenses(companyId, request.user?.id ?? null);
  });

  // Confirmação de pagamento pelo sócio pagador.
  const movParamsSchema = z.object({ companyId: z.string().uuid(), expenseId: z.string().uuid() });
  app.post('/companies/:companyId/expenses/:expenseId/confirm', async (request) => {
    const { companyId, expenseId } = movParamsSchema.parse(request.params);
    return service.setConfirmation(companyId, expenseId, 'confirmed', request.user?.id ?? null);
  });
  app.post('/companies/:companyId/expenses/:expenseId/refuse', async (request) => {
    const { companyId, expenseId } = movParamsSchema.parse(request.params);
    return service.setConfirmation(companyId, expenseId, 'refused', request.user?.id ?? null);
  });

  // Marcar conta a pagar como paga.
  app.post('/companies/:companyId/expenses/:expenseId/pay', async (request) => {
    const { companyId, expenseId } = movParamsSchema.parse(request.params);
    const { paidOn } = payExpenseSchema.parse(request.body ?? {});
    return service.payExpense(companyId, expenseId, paidOn, request.user?.id ?? null);
  });

  // Edição de uma movimentação já registrada.
  app.patch('/companies/:companyId/expenses/:expenseId', async (request) => {
    const { companyId, expenseId } = movParamsSchema.parse(request.params);
    const input = updateMovementSchema.parse(request.body);
    return service.updateExpense(companyId, expenseId, input, request.user?.id ?? null);
  });

  // Exclusão definitiva (irreversível; o front confirma antes).
  app.delete('/companies/:companyId/expenses/:expenseId', async (request, reply) => {
    const { companyId, expenseId } = movParamsSchema.parse(request.params);
    await service.removeExpense(companyId, expenseId, request.user?.id ?? null);
    return reply.status(204).send();
  });

  app.get('/companies/:companyId/balances', async (request) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    return service.getBalances(companyId, request.user?.id ?? null);
  });

  app.get('/companies/:companyId/settlements', async (request) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    return service.getSettlements(companyId, request.user?.id ?? null);
  });

  app.get('/companies/:companyId/movement-settlements', async (request) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    return service.getMovementSettlements(companyId, request.user?.id ?? null);
  });

  app.post('/companies/:companyId/settlement-payments', async (request, reply) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    const input = createSettlementPaymentSchema.parse(request.body);
    const payment = await service.createSettlementPayment(companyId, input, request.user?.id ?? null);
    return reply.status(201).send(payment);
  });

  app.get('/companies/:companyId/settlement-payments', async (request) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    return service.listSettlementPayments(companyId, request.user?.id ?? null);
  });
}
