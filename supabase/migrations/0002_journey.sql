-- plim — progresso da jornada guiada (só passos manuais; os automáticos são derivados)
-- Rodar no SQL Editor do Supabase ou via `supabase db push`.

create table public.company_journey_steps (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies (id) on delete cascade,
  step_id      text not null,
  completed_at timestamptz not null default now(),
  unique (company_id, step_id)
);

create index company_journey_steps_company_id_idx on public.company_journey_steps (company_id);

-- RLS (segunda linha de defesa): membros leem; só a service role (API) escreve.
alter table public.company_journey_steps enable row level security;
create policy "journey: members read" on public.company_journey_steps
  for select using (public.is_company_member(company_id));
