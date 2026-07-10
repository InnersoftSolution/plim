-- Jornada "Contas a pagar": despesa pode estar paga ou a pagar (com vencimento).
-- Só as pagas entram nos cálculos; as a pagar são lembretes até serem quitadas.
alter table public.expenses
  add column if not exists payment_status text not null default 'paid'
    check (payment_status in ('paid', 'unpaid')),
  add column if not exists due_date date;

-- Índice para buscar contas a pagar por vencimento (lembretes na Home/Movimentações).
create index if not exists expenses_due_idx
  on public.expenses (company_id, due_date)
  where payment_status = 'unpaid';
