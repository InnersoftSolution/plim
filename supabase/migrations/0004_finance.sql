-- plim — Fase 2 (Financeiro): despesas e rateio entre sócios.
-- Dinheiro SEMPRE em centavos inteiros. Rodar no SQL Editor ou `supabase db push`.

-- ── despesas ─────────────────────────────────────────────
create table public.expenses (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies (id) on delete cascade,
  description       text not null check (char_length(description) between 1 and 120),
  amount_cents      integer not null check (amount_cents > 0),
  currency_code     text,
  paid_by_member_id uuid not null references public.company_members (id) on delete restrict,
  spent_on          date not null default current_date,
  split_mode        text not null default 'equity',
  created_at        timestamptz not null default now()
);
create index expenses_company_id_idx on public.expenses (company_id);

-- ── partes do rateio (soma = amount_cents; garantido pela API) ──
create table public.expense_shares (
  id          uuid primary key default gen_random_uuid(),
  expense_id  uuid not null references public.expenses (id) on delete cascade,
  member_id   uuid not null references public.company_members (id) on delete cascade,
  share_cents integer not null check (share_cents >= 0),
  unique (expense_id, member_id)
);
create index expense_shares_expense_id_idx on public.expense_shares (expense_id);

-- ── RLS (2ª linha de defesa): membros leem; só a service role (API) escreve ──
alter table public.expenses enable row level security;
create policy "expenses: members read" on public.expenses
  for select using (public.is_company_member(company_id));

alter table public.expense_shares enable row level security;
create policy "expense_shares: members read" on public.expense_shares
  for select using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_shares.expense_id and public.is_company_member(e.company_id)
    )
  );
