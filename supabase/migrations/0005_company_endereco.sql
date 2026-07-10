-- 0005 — CNPJ e endereço da empresa (editável na tela "Dados da empresa")
alter table public.companies
  add column if not exists cnpj          text,
  add column if not exists cep           text,
  add column if not exists street        text,
  add column if not exists street_number text,
  add column if not exists complement    text,
  add column if not exists neighborhood  text;
