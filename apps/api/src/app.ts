import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { DomainError } from './lib/errors';
import { healthRoutes } from './http/routes/health.routes';
import { companyRoutes } from './http/routes/company.routes';
import { meRoutes } from './http/routes/me.routes';
import { advisorRoutes } from './http/routes/advisor.routes';
import { journeyRoutes } from './http/routes/journey.routes';
import { financeRoutes } from './http/routes/finance.routes';
import { guideRoutes } from './http/routes/guide.routes';
import { recurringRoutes } from './http/routes/recurring.routes';
import { partnerRoutes } from './http/routes/partner.routes';
import { activityRoutes } from './http/routes/activity.routes';
import { checklistRoutes } from './http/routes/checklist.routes';
import { categoryRoutes } from './http/routes/category.routes';
import { contactRoutes } from './http/routes/contact.routes';
import { eventRoutes } from './http/routes/event.routes';
import { calendarRoutes } from './http/routes/calendar.routes';
import { adminRoutes } from './http/routes/admin.routes';
import { CompanyService } from './services/company.service';
import { AdvisorService } from './services/advisor.service';
import { JourneyService } from './services/journey.service';
import { FinanceService } from './services/finance.service';
import { PartnerService } from './services/partner.service';
import { RecurringService } from './services/recurring.service';
import { ActivityService } from './services/activity.service';
import { ChecklistService } from './services/checklist.service';
import { CategoryService } from './services/category.service';
import { ContactService } from './services/contact.service';
import { EventService } from './services/event.service';
import { CalendarService } from './services/calendar.service';
import { CalendarSyncService } from './services/calendar-sync.service';
import { AdminService } from './services/admin.service';
import type { CompanyRepository } from './repositories/company.repository';
import type { JourneyRepository } from './repositories/journey.repository';
import type { FinanceRepository } from './repositories/finance.repository';
import type { GuideRepository } from './repositories/guide.repository';
import type { PartnerRepository } from './repositories/partner.repository';
import type { RecurringRepository } from './repositories/recurring.repository';
import type { ActivityRepository } from './repositories/activity.repository';
import type { AdminRepository } from './repositories/admin.repository';
import { InMemoryCompanyRepository } from './repositories/in-memory/company.repository.memory';
import { InMemoryJourneyRepository } from './repositories/in-memory/journey.repository.memory';
import { InMemoryFinanceRepository } from './repositories/in-memory/finance.repository.memory';
import { InMemoryGuideRepository } from './repositories/in-memory/guide.repository.memory';
import { InMemoryPartnerRepository } from './repositories/in-memory/partner.repository.memory';
import { InMemoryRecurringRepository } from './repositories/in-memory/recurring.repository.memory';
import { InMemoryActivityRepository } from './repositories/in-memory/activity.repository.memory';
import { InMemoryChecklistRepository } from './repositories/in-memory/checklist.repository.memory';
import { InMemoryAdminRepository } from './repositories/in-memory/admin.repository.memory';
import { SupabaseCompanyRepository } from './repositories/supabase/company.repository.supabase';
import { SupabaseJourneyRepository } from './repositories/supabase/journey.repository.supabase';
import { SupabaseFinanceRepository } from './repositories/supabase/finance.repository.supabase';
import { SupabaseGuideRepository } from './repositories/supabase/guide.repository.supabase';
import { SupabasePartnerRepository } from './repositories/supabase/partner.repository.supabase';
import { SupabaseRecurringRepository } from './repositories/supabase/recurring.repository.supabase';
import { SupabaseActivityRepository } from './repositories/supabase/activity.repository.supabase';
import { SupabaseChecklistRepository } from './repositories/supabase/checklist.repository.supabase';
import type { ChecklistRepository } from './repositories/checklist.repository';
import type { CategoryRepository } from './repositories/category.repository';
import { InMemoryCategoryRepository } from './repositories/in-memory/category.repository.memory';
import { SupabaseCategoryRepository } from './repositories/supabase/category.repository.supabase';
import type { ContactRepository } from './repositories/contact.repository';
import { InMemoryContactRepository } from './repositories/in-memory/contact.repository.memory';
import { SupabaseContactRepository } from './repositories/supabase/contact.repository.supabase';
import type { EventRepository } from './repositories/event.repository';
import { InMemoryEventRepository } from './repositories/in-memory/event.repository.memory';
import { SupabaseEventRepository } from './repositories/supabase/event.repository.supabase';
import type { CalendarRepository } from './repositories/calendar.repository';
import { InMemoryCalendarRepository } from './repositories/in-memory/calendar.repository.memory';
import { SupabaseCalendarRepository } from './repositories/supabase/calendar.repository.supabase';
import { SupabaseAdminRepository } from './repositories/supabase/admin.repository.supabase';
import { env, isSupabaseConfigured, isLlmConfigured, isGoogleCalendarConfigured } from './config/env';
import { getSupabaseAdmin } from './lib/supabase';
import { parseKey } from './lib/crypto';
import { InMemoryLogoStorage, SupabaseLogoStorage } from './lib/logo-storage';
import { InMemoryInviteSender, SupabaseInviteSender } from './lib/invite-sender';
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
  const logoStorage = isSupabaseConfigured
    ? new SupabaseLogoStorage(getSupabaseAdmin())
    : new InMemoryLogoStorage();
  const inviteSender = isSupabaseConfigured
    ? new SupabaseInviteSender(getSupabaseAdmin())
    : new InMemoryInviteSender();
  const companyService = new CompanyService(repository, logoStorage, inviteSender, app.log);

  const journeyRepository: JourneyRepository = isSupabaseConfigured
    ? new SupabaseJourneyRepository(getSupabaseAdmin())
    : new InMemoryJourneyRepository();
  const journeyService = new JourneyService(companyService, journeyRepository);

  const financeRepository: FinanceRepository = isSupabaseConfigured
    ? new SupabaseFinanceRepository(getSupabaseAdmin())
    : new InMemoryFinanceRepository();

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

  // O financeiro conhece os recorrentes para materializar as cobranças do mês.
  const financeService = new FinanceService(companyService, financeRepository, recurringRepository);

  const activityRepository: ActivityRepository = isSupabaseConfigured
    ? new SupabaseActivityRepository(getSupabaseAdmin())
    : new InMemoryActivityRepository();
  const activityService = new ActivityService(companyService, activityRepository);

  const checklistRepository: ChecklistRepository = isSupabaseConfigured
    ? new SupabaseChecklistRepository(getSupabaseAdmin())
    : new InMemoryChecklistRepository();
  const checklistService = new ChecklistService(companyService, checklistRepository);

  const categoryRepository: CategoryRepository = isSupabaseConfigured
    ? new SupabaseCategoryRepository(getSupabaseAdmin())
    : new InMemoryCategoryRepository();
  const categoryService = new CategoryService(companyService, categoryRepository);

  const contactRepository: ContactRepository = isSupabaseConfigured
    ? new SupabaseContactRepository(getSupabaseAdmin())
    : new InMemoryContactRepository();
  const contactService = new ContactService(companyService, contactRepository);

  const eventRepository: EventRepository = isSupabaseConfigured
    ? new SupabaseEventRepository(getSupabaseAdmin())
    : new InMemoryEventRepository();

  // Integração Google Calendar (Plim -> Google, unidirecional). Só liga quando
  // as credenciais OAuth + chave de cifra estão configuradas. Sem isso, a
  // agenda funciona igual, só não espelha para fora.
  const calendarRepository: CalendarRepository = isSupabaseConfigured
    ? new SupabaseCalendarRepository(getSupabaseAdmin())
    : new InMemoryCalendarRepository();
  let calendarService: CalendarService | undefined;
  let calendarSyncService: CalendarSyncService | undefined;
  if (isGoogleCalendarConfigured) {
    calendarService = new CalendarService(calendarRepository, {
      oauth: {
        clientId: env.GOOGLE_OAUTH_CLIENT_ID!,
        clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET!,
        redirectUri: env.GOOGLE_OAUTH_REDIRECT_URI!,
      },
      tokenKey: parseKey(env.CALENDAR_TOKEN_KEY!),
      webOrigin: env.PLIM_WEB_ORIGIN!,
    });
    calendarSyncService = new CalendarSyncService(calendarRepository, calendarService);
  }
  const eventService = new EventService(
    companyService,
    eventRepository,
    calendarSyncService,
    app.log,
  );

  // Painel Administrativo interno (equipe do Plim): permissão validada no service.
  const adminRepository: AdminRepository = isSupabaseConfigured
    ? new SupabaseAdminRepository(getSupabaseAdmin())
    : new InMemoryAdminRepository();
  const adminService = new AdminService(adminRepository);

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
  app.log.info(
    isGoogleCalendarConfigured
      ? 'plim-api: Google Calendar ligado (sync Plim -> Google, unidirecional)'
      : 'plim-api: Google Calendar desligado — configure as env vars para ativar',
  );

  app.register(healthRoutes);
  app.register(companyRoutes, { service: companyService });
  app.register(meRoutes, { service: companyService });
  app.register(advisorRoutes, { service: advisorService });
  app.register(journeyRoutes, { service: journeyService });
  app.register(financeRoutes, { service: financeService });
  app.register(guideRoutes, { repo: guideRepository });
  app.register(partnerRoutes, { service: partnerService });
  app.register(recurringRoutes, { service: recurringService });
  app.register(activityRoutes, { service: activityService });
  app.register(checklistRoutes, { service: checklistService });
  app.register(categoryRoutes, { service: categoryService });
  app.register(contactRoutes, { service: contactService });
  app.register(eventRoutes, { service: eventService });
  if (calendarService) {
    app.register(calendarRoutes, { service: calendarService });
  }
  app.register(adminRoutes, { service: adminService });

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
