import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { DomainError } from './lib/errors';
import { healthRoutes } from './http/routes/health.routes';
import { companyRoutes } from './http/routes/company.routes';
import { advisorRoutes } from './http/routes/advisor.routes';
import { journeyRoutes } from './http/routes/journey.routes';
import { financeRoutes } from './http/routes/finance.routes';
import { guideRoutes } from './http/routes/guide.routes';
import { recurringRoutes } from './http/routes/recurring.routes';
import { partnerRoutes } from './http/routes/partner.routes';
import { activityRoutes } from './http/routes/activity.routes';
import { CompanyService } from './services/company.service';
import { AdvisorService } from './services/advisor.service';
import { JourneyService } from './services/journey.service';
import { FinanceService } from './services/finance.service';
import { PartnerService } from './services/partner.service';
import { RecurringService } from './services/recurring.service';
import { ActivityService } from './services/activity.service';
import type { CompanyRepository } from './repositories/company.repository';
import type { JourneyRepository } from './repositories/journey.repository';
import type { FinanceRepository } from './repositories/finance.repository';
import type { GuideRepository } from './repositories/guide.repository';
import type { PartnerRepository } from './repositories/partner.repository';
import type { RecurringRepository } from './repositories/recurring.repository';
import type { ActivityRepository } from './repositories/activity.repository';
import { InMemoryCompanyRepository } from './repositories/in-memory/company.repository.memory';
import { InMemoryJourneyRepository } from './repositories/in-memory/journey.repository.memory';
import { InMemoryFinanceRepository } from './repositories/in-memory/finance.repository.memory';
import { InMemoryGuideRepository } from './repositories/in-memory/guide.repository.memory';
import { InMemoryPartnerRepository } from './repositories/in-memory/partner.repository.memory';
import { InMemoryRecurringRepository } from './repositories/in-memory/recurring.repository.memory';
import { InMemoryActivityRepository } from './repositories/in-memory/activity.repository.memory';
import { SupabaseCompanyRepository } from './repositories/supabase/company.repository.supabase';
import { SupabaseJourneyRepository } from './repositories/supabase/journey.repository.supabase';
import { SupabaseFinanceRepository } from './repositories/supabase/finance.repository.supabase';
import { SupabaseGuideRepository } from './repositories/supabase/guide.repository.supabase';
import { SupabasePartnerRepository } from './repositories/supabase/partner.repository.supabase';
import { SupabaseRecurringRepository } from './repositories/supabase/recurring.repository.supabase';
import { SupabaseActivityRepository } from './repositories/supabase/activity.repository.supabase';
import { env, isSupabaseConfigured, isLlmConfigured } from './config/env';
import { getSupabaseAdmin } from './lib/supabase';
import type { LlmProvider } from './ai/llm.provider';
import { NoopLlmProvider } from './ai/llm.provider';
import { AnthropicLlmProvider } from './ai/anthropic.provider';

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  // Composição: Supabase configurado → Postgres; senão → in-memory (dev/testes).
  // Serviços e rotas não mudam ao trocar a implementação.
  const repository: CompanyRepository = isSupabaseConfigured
    ? new SupabaseCompanyRepository(getSupabaseAdmin())
    : new InMemoryCompanyRepository();
  const companyService = new CompanyService(repository);

  const journeyRepository: JourneyRepository = isSupabaseConfigured
    ? new SupabaseJourneyRepository(getSupabaseAdmin())
    : new InMemoryJourneyRepository();
  const journeyService = new JourneyService(companyService, journeyRepository);

  const financeRepository: FinanceRepository = isSupabaseConfigured
    ? new SupabaseFinanceRepository(getSupabaseAdmin())
    : new InMemoryFinanceRepository();
  const financeService = new FinanceService(companyService, financeRepository);

  const guideRepository: GuideRepository = isSupabaseConfigured
    ? new SupabaseGuideRepository(getSupabaseAdmin())
    : new InMemoryGuideRepository();

  const partnerRepository: PartnerRepository = isSupabaseConfigured
    ? new SupabasePartnerRepository(getSupabaseAdmin())
    : new InMemoryPartnerRepository();
  const partnerService = new PartnerService(companyService, partnerRepository);

  const recurringRepository: RecurringRepository = isSupabaseConfigured
    ? new SupabaseRecurringRepository(getSupabaseAdmin())
    : new InMemoryRecurringRepository();
  const recurringService = new RecurringService(companyService, recurringRepository);

  const activityRepository: ActivityRepository = isSupabaseConfigured
    ? new SupabaseActivityRepository(getSupabaseAdmin())
    : new InMemoryActivityRepository();
  const activityService = new ActivityService(companyService, activityRepository);

  // Copiloto: LLM real só quando há chave; senão, Noop (insights sem custo).
  const llm: LlmProvider = isLlmConfigured
    ? new AnthropicLlmProvider(env.ANTHROPIC_API_KEY!, env.PLIM_ADVISOR_MODEL)
    : new NoopLlmProvider();
  const advisorService = new AdvisorService(companyService, llm);

  if (isSupabaseConfigured) {
    app.log.info('plim-api: usando Postgres (Supabase) + autenticação JWT');
  } else {
    app.log.warn('plim-api: modo dev — repositório in-memory, sem autenticação');
  }
  app.log.info(
    isLlmConfigured
      ? `plim-api: copiloto com IA (${env.PLIM_ADVISOR_MODEL ?? 'claude-haiku-4-5'})`
      : 'plim-api: copiloto sem IA — apenas insights determinísticos',
  );

  app.register(healthRoutes);
  app.register(companyRoutes, { service: companyService });
  app.register(advisorRoutes, { service: advisorService });
  app.register(journeyRoutes, { service: journeyService });
  app.register(financeRoutes, { service: financeService });
  app.register(guideRoutes, { repo: guideRepository });
  app.register(partnerRoutes, { service: partnerService });
  app.register(recurringRoutes, { service: recurringService });
  app.register(activityRoutes, { service: activityService });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'VALIDATION_ERROR',
        issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    if (error instanceof DomainError) {
      return reply.status(error.httpStatus).send({ error: error.code, message: error.message });
    }
    // Erros do próprio Fastify (ex.: corpo inválido) já trazem statusCode 4xx.
    const framework = error as { statusCode?: number; code?: string; message?: string };
    if (typeof framework.statusCode === 'number' && framework.statusCode >= 400 && framework.statusCode < 500) {
      return reply
        .status(framework.statusCode)
        .send({ error: framework.code ?? 'BAD_REQUEST', message: framework.message ?? 'Requisição inválida.' });
    }
    app.log.error(error);
    return reply.status(500).send({ error: 'INTERNAL_ERROR' });
  });

  return app;
}
