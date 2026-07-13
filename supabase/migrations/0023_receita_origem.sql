-- Origem da receita: de onde o dinheiro veio (Asaas, Mercado Livre, Stripe,
-- Pix, cliente direto...). Muitas vezes a entrada vem de um sistema, não de
-- uma pessoa; a origem deixa isso claro e permite relatórios por fonte.
-- Nulo para despesas/aportes (só a receita usa por enquanto).
alter table public.expenses
  add column if not exists source text;
