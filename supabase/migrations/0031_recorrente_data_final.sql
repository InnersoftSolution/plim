-- 0031 - Custo recorrente com data final ("até quando")
--
-- Contrato que acaba em marco, plano de 12 meses, ferramenta contratada por um
-- semestre: sem data final, a pessoa precisa lembrar de desativar na mao no dia
-- certo. Se esquecer, o Plim segue gerando conta a pagar de algo que nao existe
-- mais e o custo mensal estimado fica mentindo.
--
-- Nula = sem previsao de fim (comportamento de hoje, inalterado).
--
-- Aditivo e seguro: uma coluna nullable. Nao altera dado nenhum.

alter table public.recurring_costs
  add column if not exists ends_on date;

-- Coerencia basica: o fim nao pode vir antes do inicio da cobranca.
alter table public.recurring_costs
  drop constraint if exists recurring_costs_ends_after_start;
alter table public.recurring_costs
  add constraint recurring_costs_ends_after_start
  check (ends_on is null or next_charge_on is null or ends_on >= next_charge_on);
