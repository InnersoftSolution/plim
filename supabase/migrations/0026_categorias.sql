-- 0026 - Categorias e tags de movimentacoes (Core)
-- Cada empresa tem suas categorias (Tecnologia, Assinaturas, Servidor...).
-- A movimentacao ganha uma categoria principal (opcional) e tags livres.
-- Aditivo e seguro: cria tabela nova + colunas nullable; nao altera dados.

-- ── categorias por empresa ───────────────────────────────
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  color       text,
  icon        text,
  -- Em que tipo de movimentacao a categoria aparece.
  type        text not null default 'ambos' check (type in ('despesa', 'receita', 'ambos')),
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists categories_company_id_idx on public.categories (company_id);
-- Nao duplicar nome (case-insensitive) dentro da mesma empresa.
create unique index if not exists categories_company_name_uidx
  on public.categories (company_id, lower(name));

alter table public.categories enable row level security;
create policy "categories: members read" on public.categories
  for select using (public.is_company_member(company_id));

-- ── movimentacao: categoria principal + tags livres ──────
-- on delete set null: apagar/limpar categoria nao apaga a movimentacao.
alter table public.expenses
  add column if not exists category_id uuid references public.categories (id) on delete set null;
alter table public.expenses
  add column if not exists tags text[] not null default '{}';
create index if not exists expenses_category_id_idx on public.expenses (category_id);
