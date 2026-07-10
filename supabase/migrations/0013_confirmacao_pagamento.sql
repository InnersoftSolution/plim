-- 0013 — Confirmação de pagamento por outro sócio
-- Movimentação cadastrada em nome de outro pagador fica 'pending' até ele confirmar.
-- Só 'confirmed' entra nos cálculos (dados antigos ficam 'confirmed' pelo default).
alter table public.expenses
  add column if not exists confirmation_status  text not null default 'confirmed',
  add column if not exists created_by_member_id uuid references public.company_members (id) on delete set null;
