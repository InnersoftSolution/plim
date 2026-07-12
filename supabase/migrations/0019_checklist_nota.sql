-- 0019 - Anotacao por item do checklist: o usuario registra a informacao
-- ali mesmo (ex: "Conta PJ no Inter", "dominio comprado na GoDaddy"),
-- sem precisar mudar de pagina.
alter table public.company_checklist_items add column if not exists note text;
