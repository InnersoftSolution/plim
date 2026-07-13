-- Acerto por origem: cada pagamento de acerto passa a apontar para a
-- movimentação (despesa ou aporte reembolsável) que gerou a dívida. Assim o
-- Plim mostra "Fulano deve X do aporte de 15.000" e quita a parte daquela
-- movimentação específica, em vez de um valor líquido achatado entre o par.
-- Nulo = pagamento antigo (registrado antes desta mudança), tratado no nível
-- do par para reconciliar com o saldo líquido.
alter table public.settlement_payments
  add column if not exists expense_id uuid references public.expenses (id) on delete cascade;

create index if not exists settlement_payments_expense_idx
  on public.settlement_payments (expense_id)
  where expense_id is not null;
