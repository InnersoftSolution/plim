-- 0010 — Jornada "Acertos": pagamentos entre sócios (quitação total/parcial)
-- Os acertos continuam DERIVADOS das despesas; o que persiste é o pagamento.
create table if not exists public.settlement_payments (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies (id) on delete cascade,
  from_member_id uuid not null references public.company_members (id) on delete restrict,
  to_member_id   uuid not null references public.company_members (id) on delete restrict,
  amount_cents   integer not null check (amount_cents > 0),
  paid_on        date not null default current_date,
  method         text,                                  -- pix | transfer | cash | other
  note           text,
  status         text not null default 'confirmed',    -- confirmed | cancelled
  created_at     timestamptz not null default now()
);
create index if not exists settlement_payments_company_id_idx on public.settlement_payments (company_id);

alter table public.settlement_payments enable row level security;
drop policy if exists "settlement_payments: members read" on public.settlement_payments;
create policy "settlement_payments: members read" on public.settlement_payments
  for select using (public.is_company_member(company_id));
