-- 0018 - Checklist inteligente de estruturacao da empresa (Entrega 1)
-- Itens reais por empresa. Os "templates" (catalogo do Plim) vivem no codigo
-- por enquanto (services/checklist.catalog.ts); a tabela de templates gerida
-- pelo Admin fica para quando essa gestao existir de fato.

-- Logo da empresa (upload real vem na Entrega 2; coluna ja criada para a
-- regra automatica do item "Logo" funcionar assim que houver imagem).
alter table public.companies add column if not exists logo_url text;

create table if not exists public.company_checklist_items (
  id                            uuid primary key default gen_random_uuid(),
  company_id                    uuid not null references public.companies (id) on delete cascade,
  -- Liga ao catalogo (checklist.catalog.ts). Nulo em itens personalizados.
  template_key                  text,
  title                         text not null,
  description                   text,
  phase                         text not null,
  status                        text not null default 'not_started'
                                  check (status in ('not_started', 'in_progress', 'completed', 'skipped', 'not_applicable')),
  priority                      text not null default 'medium'
                                  check (priority in ('low', 'medium', 'high')),
  action_label                  text,
  action_route                  text,
  recommended_partner_category  text,
  is_custom                     boolean not null default false,
  is_system_generated           boolean not null default true,
  completed_at                  timestamptz,
  skipped_at                    timestamptz,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  -- Nao duplicar o mesmo item do catalogo para a mesma empresa.
  unique (company_id, template_key)
);

create index if not exists company_checklist_items_company_id_idx
  on public.company_checklist_items (company_id);

alter table public.company_checklist_items enable row level security;
create policy "checklist: members read" on public.company_checklist_items
  for select using (public.is_company_member(company_id));
