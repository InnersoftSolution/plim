-- plim — Fase 1 (Fundação): novos campos de empresa, sócio e perfil.
-- Aditiva (mantém os nomes atuais). Rodar no SQL Editor ou via `supabase db push`.

-- ── empresas ─────────────────────────────────────────────
alter table public.companies
  add column if not exists is_name_temporary boolean not null default false,
  add column if not exists industry          text,
  add column if not exists industry_other    text,
  add column if not exists business_stage    text,
  add column if not exists country_code      text,
  add column if not exists region            text,
  add column if not exists city              text,
  add column if not exists currency_code     text,
  add column if not exists onboarding_status text not null default 'in_progress',
  add column if not exists onboarding_step   text;

-- Empresas criadas antes deste recurso já estão prontas → marca como concluídas.
update public.companies set onboarding_status = 'completed';

-- ── sócios ───────────────────────────────────────────────
alter table public.company_members
  add column if not exists functional_role   text,
  add column if not exists notes             text,
  add column if not exists invitation_status text not null default 'not_invited';

-- E-mail passa a ser opcional nesta fase.
alter table public.company_members alter column email drop not null;

-- Sócios existentes com login (o dono) já contam como aceitos.
update public.company_members set invitation_status = 'accepted' where user_id is not null;

-- ── perfis ───────────────────────────────────────────────
alter table public.profiles
  add column if not exists avatar_url       text,
  add column if not exists preferred_locale text;
