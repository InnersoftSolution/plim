-- Módulo Atividades: organiza o que cada sócio precisa fazer (Kanban leve +
-- plano da semana). Não impacta finanças (RP006). Sempre por empresa (RP001).

-- ── atividades ───────────────────────────────────────────
create table if not exists public.activities (
  id                     uuid primary key default gen_random_uuid(),
  company_id             uuid not null references public.companies (id) on delete cascade,
  title                  text not null check (char_length(title) between 1 and 160),
  description            text,
  responsible_member_id  uuid references public.company_members (id) on delete set null,
  area                   text not null default 'outros',
  status                 text not null default 'todo'
    check (status in ('todo', 'in_progress', 'blocked', 'done', 'cancelled')),
  priority               text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),
  due_date               date,
  week_start_date        date not null,
  created_by             uuid references public.company_members (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  completed_at           timestamptz,
  cancelled_at           timestamptz,
  blocked_reason         text
);
create index if not exists activities_company_idx on public.activities (company_id);
create index if not exists activities_week_idx on public.activities (company_id, week_start_date);

-- ── checklist interno da atividade ───────────────────────
create table if not exists public.activity_checklist_items (
  id           uuid primary key default gen_random_uuid(),
  activity_id  uuid not null references public.activities (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 200),
  is_completed boolean not null default false,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists activity_checklist_activity_idx on public.activity_checklist_items (activity_id);

-- ── RLS (2ª linha de defesa): membros leem; só a service role (API) escreve ──
alter table public.activities enable row level security;
create policy "activities: members read" on public.activities
  for select using (public.is_company_member(company_id));

alter table public.activity_checklist_items enable row level security;
create policy "activity_checklist: members read" on public.activity_checklist_items
  for select using (
    exists (
      select 1 from public.activities a
      where a.id = activity_checklist_items.activity_id and public.is_company_member(a.company_id)
    )
  );
