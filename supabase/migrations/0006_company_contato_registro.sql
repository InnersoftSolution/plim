-- 0006 — Contato (telefone/e-mail) e natureza jurídica da empresa
alter table public.companies
  add column if not exists phone      text,
  add column if not exists email      text,
  add column if not exists legal_type text;
