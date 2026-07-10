-- Atividades: data de início (além do prazo). Permite ver o período de cada
-- atividade por sócio: começa em X, termina em Y.
alter table public.activities
  add column if not exists start_date date;
