-- 0027 - Contatos (fornecedores/clientes) nas movimentacoes (Fase 2)
-- Cada empresa tem seus contatos: empresa (PJ) ou pessoa fisica (PF).
-- A despesa ganha "pago para quem" e a entrada "recebido de quem".
-- Aditivo e seguro: tabela nova + coluna nullable; nao altera dados.

-- ── contatos por empresa ─────────────────────────────────
create table if not exists public.contacts (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  -- 'empresa' (PJ) ou 'pessoa' (PF).
  type        text not null default 'empresa' check (type in ('empresa', 'pessoa')),
  -- CNPJ ou CPF (formatacao livre; validacao fica na aplicacao).
  document    text,
  email       text,
  phone       text,
  note        text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists contacts_company_id_idx on public.contacts (company_id);
-- Nao duplicar nome (case-insensitive) dentro da mesma empresa.
create unique index if not exists contacts_company_name_uidx
  on public.contacts (company_id, lower(name));

alter table public.contacts enable row level security;
create policy "contacts: members read" on public.contacts
  for select using (public.is_company_member(company_id));

-- ── movimentacao: contato (pago para / recebido de) ──────
-- on delete set null: apagar o contato nao apaga a movimentacao.
alter table public.expenses
  add column if not exists contact_id uuid references public.contacts (id) on delete set null;
create index if not exists expenses_contact_id_idx on public.expenses (contact_id);
