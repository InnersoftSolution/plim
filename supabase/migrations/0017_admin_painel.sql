-- 0017 — Painel Administrativo (fase 1)
-- Papéis administrativos INTERNOS do Plim (equipe Inner). Não confundir com
-- papéis dentro de uma empresa (account_owner/partner): admin aqui opera o
-- produto, não uma empresa.

create table if not exists public.admin_users (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique references auth.users (id) on delete cascade,
  role       text not null check (role in ('super_admin', 'admin', 'support')),
  status     text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Segurança: RLS ligado e NENHUMA policy. Só a service role (API) enxerga a
-- tabela — usuário comum não consegue nem saber quem é admin. A permissão de
-- acesso ao /admin é validada no servidor (AdminService), nunca no front.
alter table public.admin_users enable row level security;

comment on table public.admin_users is
  'Administradores internos do Plim (painel /admin). Acesso apenas via service role.';

-- Como criar o PRIMEIRO super_admin (rodar depois de criar sua conta no app):
--   insert into public.admin_users (user_id, role)
--   select id, 'super_admin' from auth.users where email = 'SEU_EMAIL_AQUI';
