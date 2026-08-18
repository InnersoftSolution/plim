import type { FastifyInstance } from 'fastify';
import {
  createContributionSchema,
  createExpenseSchema,
  createRepeatedExpenseSchema,
  createRevenueSchema,
  createSettlementPaymentSchema,
  inheritanceInputSchema,
  payExpenseSchema,
  updateMovementSchema,
} from '@plim/shared';
import { z } from 'zod';
import type { FinanceService } from '../../services/finance.service';
import { authenticate } from '../auth';

const companyParamsSchema = z.object({ companyId: z.string().uuid() });
const movParamsSchema = z.object({ companyId: z.string().uuid(), expenseId: z.string().uuid() });
const paymentParamsSchema = z.object({ companyId: z.string().uuid(), paymentId: z.string().uuid() });

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

  /**
   * Despesa que se repetiu num período encerrado: cria uma movimentação por
   * competência. Devolve a lista criada, para o front dizer quantas entraram.
   */
  app.post('/companies/:companyId/expenses/repeated', async (request, reply) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    const input = createRepeatedExpenseSchema.parse(request.body);
    const created = await service.createRepeatedExpense(companyId, input, request.user?.id ?? null);
    return reply.status(201).send(created);
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

  /** Detalhe de uma movimentação (página própria, com URL). */
  app.get('/companies/:companyId/expenses/:expenseId', async (request) => {
    const { companyId, expenseId } = movParamsSchema.parse(request.params);
    return service.getMovement(companyId, expenseId, request.user?.id ?? null);
  });

  app.get('/companies/:companyId/expenses', async (request) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    return service.listExpenses(companyId, request.user?.id ?? null);
  });

  // Confirmação de pagamento pelo sócio pagador.
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
    const { paidOn, paidByMemberId } = payExpenseSchema.parse(request.body ?? {});
    return service.payExpense(companyId, expenseId, paidOn, request.user?.id ?? null, paidByMemberId ?? null);
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

  /**
   * Jornada do sócio novo: o que fazer com as despesas anteriores à entrada
   * dele. A prévia não escreve nada; quem escreve é /aplicar, depois que a
   * pessoa vê a conta e confirma.
   */
  app.post('/companies/:companyId/heranca/previa', async (request) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    const input = inheritanceInputSchema.parse(request.body);
    return service.previewInheritance(companyId, input, request.user?.id ?? null);
  });

  app.post('/companies/:companyId/heranca/aplicar', async (request) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    const input = inheritanceInputSchema.parse(request.body);
    return service.applyInheritance(companyId, input, request.user?.id ?? null);
  });

  app.get('/companies/:companyId/settlement-payments', async (request) => {
    const { companyId } = companyParamsSchema.parse(request.params);
    return service.listSettlementPayments(companyId, request.user?.id ?? null);
  });

  /** Desfaz um acerto (par do "marcar que acertou"; o front confirma antes). */
  app.delete('/companies/:companyId/settlement-payments/:paymentId', async (request, reply) => {
    const { companyId, paymentId } = paymentParamsSchema.parse(request.params);
    await service.removeSettlementPayment(companyId, paymentId, request.user?.id ?? null);
    return reply.status(204).send();
  });
}
