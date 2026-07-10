-- 0009 — Jornada "Custo recorrente": assinaturas/ferramentas que se repetem
create table if not exists public.recurring_costs (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies (id) on delete cascade,
  name              text not null check (char_length(name) between 1 and 80),
  category          text not null,           -- tools | infrastructure | accounting | marketing | legal | operations | other
  amount_cents      integer not null check (amount_cents > 0),
  currency_code     text,
  frequency         text not null,           -- monthly | annual | weekly | quarterly | other
  paid_by_member_id uuid not null references public.company_members (id) on delete restrict,
  next_charge_on    date,
  note              text,
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists recurring_costs_company_id_idx on public.recurring_costs (company_id);

alter table public.recurring_costs enable row level security;
drop policy if exists "recurring_costs: members read" on public.recurring_costs;
create policy "recurring_costs: members read" on public.recurring_costs
  for select using (public.is_company_member(company_id));
