-- Conta que recebeu a entrada: pode ser um sócio OU a conta da empresa OU uma
-- conta própria que o usuário cadastra na hora (por isso texto livre, não FK).
-- Nulo para gasto/aporte. Complementa a origem (de onde veio) com o destino
-- (em qual conta caiu).
alter table public.expenses
  add column if not exists account text;
