-- 0011 — Observação opcional em despesas/aportes
alter table public.expenses
  add column if not exists note text;
