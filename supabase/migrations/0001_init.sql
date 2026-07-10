-- plim — esquema inicial (perfis, empresas, sócios)
-- Rodar no SQL Editor do Supabase ou via `supabase db push`.
-- A API (service role) é a dona das regras de negócio; o RLS abaixo é a
-- SEGUNDA linha de defesa, para qualquer acesso direto ao banco.

-- ── tipos ────────────────────────────────────────────────
create type public.member_role as enum ('account_owner', 'partner');
create type public.member_status as enum ('invited', 'active');

-- ── perfis (1:1 com auth.users) ──────────────────────────
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  email      text,
  created_at timestamptz not null default now()
);

-- Cria o perfil automaticamente quando um usuário se cadastra.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── empresas ─────────────────────────────────────────────
create table public.companies (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 2 and 120),
  description    text check (char_length(description) <= 500),
  business_model text check (char_length(business_model) <= 60),
  owner_id       uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);

-- ── sócios ───────────────────────────────────────────────
create table public.company_members (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies (id) on delete cascade,
  user_id        uuid references auth.users (id) on delete set null,
  full_name      text not null,
  email          text not null,
  role           public.member_role not null default 'partner',
  -- Participação 0–100 com 2 casas. A soma ≤ 100% é garantida pela API.
  equity_percent numeric(5, 2) check (equity_percent >= 0 and equity_percent <= 100),
  status         public.member_status not null default 'invited',
  created_at     timestamptz not null default now(),
  unique (company_id, email)
);

create index company_members_company_id_idx on public.company_members (company_id);
create index company_members_user_id_idx on public.company_members (user_id);

-- ── RLS (segunda linha de defesa) ────────────────────────
-- Função sem recursão para checar pertencimento (security definer ignora RLS).
create or replace function public.is_company_member(cid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.company_members m
    where m.company_id = cid and m.user_id = auth.uid()
  );
$$;

alter table public.profiles enable row level security;
create policy "profiles: self read"   on public.profiles for select using (auth.uid() = id);
create policy "profiles: self update" on public.profiles for update using (auth.uid() = id);

alter table public.companies enable row level security;
create policy "companies: members read" on public.companies
  for select using (owner_id = auth.uid() or public.is_company_member(id));

alter table public.company_members enable row level security;
create policy "members: company members read" on public.company_members
  for select using (public.is_company_member(company_id));

-- Sem policies de INSERT/UPDATE/DELETE: só a service role (a API) escreve.
