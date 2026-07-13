-- 0020 - Campos estruturados por item do checklist. Itens de registro
-- (dominio, redes sociais, e-mail, conta bancaria...) guardam a informacao
-- certa em campos proprios (jsonb), nao em texto livre. Ex:
-- {"url": "plim.work", "registrar": "GoDaddy"}
alter table public.company_checklist_items add column if not exists data jsonb;
