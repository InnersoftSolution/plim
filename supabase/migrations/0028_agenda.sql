-- 0028 - Agenda de compromissos (Fase 1)
-- Compromissos criados DENTRO do Plim (reuniao, prazo, lembrete). Na Fase 3
-- podem ir para o Google Calendar de cada participante que conectar a conta
-- (sempre unidirecional: Plim -> Google). Esta migracao cobre so a agenda.
-- Aditivo e seguro: tabela nova; nao altera dados existentes.

create table if not exists public.events (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies (id) on delete cascade,
  title                 text not null check (char_length(title) between 1 and 140),
  description           text,
  -- 'reuniao' | 'prazo' | 'lembrete'.
  kind                  text not null default 'reuniao'
                          check (kind in ('reuniao', 'prazo', 'lembrete')),
  starts_at             timestamptz not null,
  ends_at               timestamptz,
  all_day               boolean not null default false,
  -- Local fisico ou link da reuniao (texto livre).
  location              text,
  -- Socios convidados (member.id). Guardado como array; nao ha join table.
  participant_member_ids uuid[] not null default '{}',
  -- Lembrete X minutos antes (null = sem lembrete).
  reminder_minutes      integer check (reminder_minutes is null or reminder_minutes >= 0),
  -- Quem criou (member.id). Nulo se o membro sumir depois.
  created_by_member_id  uuid references public.company_members (id) on delete set null,
  created_at            timestamptz not null default now(),
  -- Se houver fim, ele nao pode ser antes do inicio.
  constraint events_end_after_start check (ends_at is null or ends_at >= starts_at)
);
create index if not exists events_company_id_idx on public.events (company_id);
create index if not exists events_company_starts_idx on public.events (company_id, starts_at);

alter table public.events enable row level security;
-- drop antes de criar: 'create policy' nao aceita 'if not exists', entao
-- rodar a migracao duas vezes nao quebra mais.
drop policy if exists "events: members read" on public.events;
create policy "events: members read" on public.events
  for select using (public.is_company_member(company_id));
