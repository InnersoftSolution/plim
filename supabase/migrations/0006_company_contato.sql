-- 0006 — Contato da empresa (telefone + e-mail)
alter table public.companies
  add column if not exists phone text,
  add column if not exists email text;
