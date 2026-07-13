-- Materialização de custos recorrentes (Entrega: financeiro carro-chefe).
-- 1) O custo recorrente ganha forma de divisão entre sócios.
-- 2) A despesa gerada guarda o vínculo com o custo e a competência da
--    cobrança; o índice único impede gerar a mesma cobrança duas vezes.

alter table public.recurring_costs
  add column if not exists split_mode text not null default 'equity';

alter table public.expenses
  add column if not exists recurring_cost_id uuid references public.recurring_costs (id) on delete set null;

alter table public.expenses
  add column if not exists recurring_charge_on date;

create unique index if not exists expenses_recurring_charge_uq
  on public.expenses (recurring_cost_id, recurring_charge_on)
  where recurring_cost_id is not null;
