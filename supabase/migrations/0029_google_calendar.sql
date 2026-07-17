-- 0029 - Integracao Google Calendar (Fase 2/3)
-- Sincronizacao UNIDIRECIONAL: Plim -> Google Calendar. O Plim envia para a
-- agenda pessoal de cada participante que conectou a conta; NUNCA importa nem
-- le eventos pessoais do Google. Aditivo e seguro: tabelas novas + 1 coluna.
--
-- Tokens (access/refresh) sao guardados CIFRADOS pela API (AES-256-GCM). Nunca
-- vao para o frontend. Estas tabelas so sao escritas pelo service role.

-- 1) Conexao Google Calendar por usuario (auth.users). Uma por usuario/provider.
create table if not exists public.user_calendar_connections (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users (id) on delete cascade,
  provider                text not null default 'google' check (provider in ('google')),
  -- E-mail da conta Google conectada (so exibicao; nao e o login do Plim).
  provider_account_email  text,
  -- Tokens CIFRADOS (AES-256-GCM, base64). Nunca em texto claro, nunca no front.
  access_token_encrypted  text,
  refresh_token_encrypted text,
  token_expires_at        timestamptz,
  scope                   text,
  -- 'connected' | 'disconnected' | 'expired' | 'error'.
  status                  text not null default 'connected'
                            check (status in ('connected', 'disconnected', 'expired', 'error')),
  connected_at            timestamptz,
  disconnected_at         timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (user_id, provider)
);
create index if not exists user_calendar_connections_user_idx
  on public.user_calendar_connections (user_id);

alter table public.user_calendar_connections enable row level security;
-- O dono ve a propria conexao (a API usa service role e ignora RLS; a policy
-- e a rede de seguranca caso algum dia o front leia direto). Sem policy de
-- escrita: so o service role grava tokens.
drop policy if exists "calendar connections: owner reads" on public.user_calendar_connections;
create policy "calendar connections: owner reads" on public.user_calendar_connections
  for select using (user_id = auth.uid());

-- 2) Estado da sincronizacao de um evento do Plim para CADA participante.
-- Uma linha por (evento, participante). Guarda o id do evento externo (Google)
-- para poder atualizar/remover depois.
create table if not exists public.event_calendar_sync (
  id                        uuid primary key default gen_random_uuid(),
  event_id                  uuid not null references public.events (id) on delete cascade,
  company_id                uuid not null references public.companies (id) on delete cascade,
  -- Participante (member) e o usuario (auth) por tras dele, se ja vinculado.
  member_id                 uuid not null references public.company_members (id) on delete cascade,
  user_id                   uuid references auth.users (id) on delete set null,
  -- not_connected | pending | synced | failed | removed | disabled.
  sync_status               text not null default 'pending'
                              check (sync_status in ('not_connected', 'pending', 'synced', 'failed', 'removed', 'disabled')),
  external_calendar_provider text not null default 'google' check (external_calendar_provider in ('google')),
  -- Id do evento criado no Google Calendar do participante (para editar/remover).
  external_event_id         text,
  last_sync_at              timestamptz,
  sync_error                text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (event_id, member_id)
);
create index if not exists event_calendar_sync_event_idx on public.event_calendar_sync (event_id);
create index if not exists event_calendar_sync_company_idx on public.event_calendar_sync (company_id);

alter table public.event_calendar_sync enable row level security;
-- Membros da empresa podem ler o status de sincronizacao dos eventos dela.
drop policy if exists "event sync: members read" on public.event_calendar_sync;
create policy "event sync: members read" on public.event_calendar_sync
  for select using (public.is_company_member(company_id));

-- 3) Flag por evento: enviar para o Google Calendar dos participantes conectados?
-- Default false: sincronizar e uma escolha explicita de quem cria o evento.
alter table public.events
  add column if not exists sync_to_google boolean not null default false;
