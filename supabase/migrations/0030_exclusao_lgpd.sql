-- 0030 - Exclusao de empresa e de conta com carencia (LGPD art. 18, VI)
--
-- Por que carencia: apagar a empresa destroi o historico financeiro de uma
-- sociedade inteira, incluindo dados dos outros socios. A pessoa pede a
-- exclusao, o Plim marca a data do expurgo (30 dias) e ate la o pedido pode ser
-- cancelado por quem pediu. Passado o prazo, o expurgo apaga de verdade
-- (scripts/purge-deletions.mjs).
--
-- Aditivo e seguro: so colunas nullable + tabela nova. Nao altera dado nenhum.

-- ── empresa: exclusao agendada ───────────────────────────
alter table public.companies
  add column if not exists deletion_requested_at  timestamptz,
  add column if not exists deletion_scheduled_for timestamptz,
  add column if not exists deletion_requested_by  uuid references auth.users (id) on delete set null;

-- Busca do expurgo: so as empresas com prazo vencido.
create index if not exists companies_deletion_scheduled_idx
  on public.companies (deletion_scheduled_for)
  where deletion_scheduled_for is not null;

-- ── conta (perfil): exclusao agendada ────────────────────
alter table public.profiles
  add column if not exists deletion_requested_at  timestamptz,
  add column if not exists deletion_scheduled_for timestamptz;

create index if not exists profiles_deletion_scheduled_idx
  on public.profiles (deletion_scheduled_for)
  where deletion_scheduled_for is not null;

-- ── registro dos pedidos de exclusao ─────────────────────
-- Prova de cumprimento do direito de eliminacao: o titular pediu, quando, e
-- quando foi atendido. NAO tem chave estrangeira de proposito: precisa
-- sobreviver ao expurgo da empresa e da conta que originaram o pedido.
-- Guarda o minimo necessario para comprovar (art. 37), nao os dados apagados.
create table if not exists public.deletion_requests (
  id                   uuid primary key default gen_random_uuid(),
  -- 'company' (empresa e todos os dados dela) ou 'account' (conta de acesso).
  subject_type         text not null check (subject_type in ('company', 'account')),
  subject_id           uuid not null,
  -- Rotulo so para leitura humana do registro (nome da empresa / e-mail).
  subject_label        text,
  requested_by_user_id uuid,
  requested_by_email   text,
  reason               text check (char_length(reason) <= 500),
  requested_at         timestamptz not null default now(),
  scheduled_for        timestamptz not null,
  status               text not null default 'scheduled'
    check (status in ('scheduled', 'cancelled', 'completed')),
  cancelled_at         timestamptz,
  completed_at         timestamptz
);
create index if not exists deletion_requests_subject_idx
  on public.deletion_requests (subject_type, subject_id, status);
create index if not exists deletion_requests_pending_idx
  on public.deletion_requests (scheduled_for)
  where status = 'scheduled';

-- Sem policy de leitura: este registro e interno (auditoria), acessivel apenas
-- pela service role da API. O titular ve o estado do proprio pedido pelos
-- campos deletion_* da empresa/perfil, nao por esta tabela.
alter table public.deletion_requests enable row level security;
