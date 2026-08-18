-- ── 0034: trilha de auditoria ─────────────────────────────
--
-- "Quem cadastrou isso?" não pode depender de memória. Cada ação relevante
-- vira um evento imutável: quem fez (sócio), o quê (ação + entidade) e
-- quando. A tabela é só-escrita pela API; nada aqui é editado ou apagado
-- por fluxo de usuário.
--
-- actor_member_id nulo = ação de sistema (importação por script, cron).

create table if not exists public.audit_events (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies (id) on delete cascade,
  -- set null: o evento sobrevive à saída do sócio (o nome vai no summary)
  actor_member_id  uuid references public.company_members (id) on delete set null,
  action           text not null,
  entity_type      text not null,
  entity_id        uuid,
  -- frase pronta para a tela: "registrou a despesa "X" de R$ 1.000,00"
  summary          text not null,
  created_at       timestamptz not null default now()
);

comment on table public.audit_events is
  'Trilha de auditoria: quem fez o quê, imutável. Escrita só pela API.';

-- Consulta típica 1: histórico de UMA movimentação (detalhe na tela).
create index if not exists audit_events_entity_idx
  on public.audit_events (company_id, entity_type, entity_id, created_at desc);

-- Consulta típica 2: linha do tempo da empresa.
create index if not exists audit_events_company_idx
  on public.audit_events (company_id, created_at desc);

-- Mesma postura das outras tabelas: RLS ligado, acesso só pela service role.
alter table public.audit_events enable row level security;
