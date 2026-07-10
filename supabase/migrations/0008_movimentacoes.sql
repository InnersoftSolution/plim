-- 0008 — Jornada "Adicionar movimentação": tipos de movimentação
-- expense = gasto (divide entre sócios) · contribution = aporte (não divide, não é gasto)
alter table public.expenses
  add column if not exists kind text not null default 'expense';
