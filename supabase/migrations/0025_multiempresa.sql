-- Multiempresa: lembrar a última empresa acessada pelo usuário.
-- Um mesmo usuário pode ser membro de várias empresas (via company_members).
-- Este campo guarda qual delas ele escolheu por último, para reabrir nela
-- no próximo login. Nulo = nunca escolheu (o front cai na primeira).
alter table public.profiles
  add column if not exists last_active_company_id uuid
    references public.companies (id) on delete set null;
