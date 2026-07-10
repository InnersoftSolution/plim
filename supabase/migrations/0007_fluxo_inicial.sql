-- 0007 — Fluxo inicial (PRD): formalização, tipo de negócio, conteúdo configurável e parceiros

-- 1) companies: novos campos + renomeações
alter table public.companies
  add column if not exists business_model_type    text,
  add column if not exists has_formal_registration text,
  add column if not exists registration_country    text,
  add column if not exists legal_structure_status  text;

-- cnpj → registration_number (genérico por país; no BR é o CNPJ)
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'companies' and column_name = 'cnpj') then
    alter table public.companies rename column cnpj to registration_number;
  end if;
end $$;

-- legal_type → legal_structure (novos valores: mei/me/simples/ltda/slu/other/unknown)
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'companies' and column_name = 'legal_type') then
    alter table public.companies rename column legal_type to legal_structure;
  end if;
end $$;

-- dados existentes: quem tem registro ganha país BR + formalização "yes"
update public.companies
   set registration_country = coalesce(registration_country, 'BR'),
       has_formal_registration = coalesce(has_formal_registration, 'yes')
 where registration_number is not null;

-- valores antigos de legal_structure que saíram do catálogo
update public.companies set legal_structure = 'unknown'
 where legal_structure in ('nao_definido', 'ei', 'sa');

-- estágio: "structuring" vira "validating" (decisão de 2 jul 2026)
update public.companies set business_stage = 'validating'
 where business_stage = 'structuring';

-- 2) Conteúdo de orientação configurável (nunca hardcoded — PRD §13/§20)
create table if not exists public.guide_contents (
  id         uuid primary key default gen_random_uuid(),
  topic      text not null,
  key        text not null,
  title      text not null,
  short      text,
  body       text not null,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (topic, key)
);
alter table public.guide_contents enable row level security;
drop policy if exists "guide_contents: read" on public.guide_contents;
create policy "guide_contents: read" on public.guide_contents
  for select to authenticated using (true);

insert into public.guide_contents (topic, key, title, short, body, sort_order) values
  ('legal_structure', 'mei', 'MEI — Microempreendedor Individual',
   'O formato mais simples e barato para quem começa sozinho.',
   E'Pra quem: uma pessoa só, sem sócios, com faturamento pequeno (permite no máximo 1 funcionário).\nFaturamento: até cerca de R$ 81 mil por ano.\nAtenção: nem toda atividade pode ser MEI e não aceita sócios. Ao passar do limite, migra para ME. Confirme com um contador.', 1),
  ('legal_structure', 'me', 'ME — Microempresa',
   'Para quem cresceu além do MEI ou tem atividade que o MEI não cobre.',
   E'Pra quem: negócios com faturamento maior que o teto do MEI ou atividades fora da lista do MEI. Pode ter sócios.\nFaturamento: até cerca de R$ 360 mil por ano.\nAtenção: exige contador e mais obrigações que o MEI. Confirme o enquadramento com um profissional.', 2),
  ('legal_structure', 'simples', 'Simples Nacional',
   'Regime de impostos simplificado que reúne tributos numa guia só.',
   E'Pra quem: micro e pequenas empresas (ME/EPP) que se enquadram nos limites.\nFaturamento: até R$ 4,8 milhões por ano.\nAtenção: o Simples é um REGIME TRIBUTÁRIO (como pagar impostos), não um tipo de empresa — normalmente se combina com ME, LTDA ou SLU. Um contador confirma se compensa no seu caso.', 3),
  ('legal_structure', 'ltda', 'LTDA — Sociedade Limitada',
   'O formato mais comum quando há sócios.',
   E'Pra quem: dois ou mais sócios; cada um responde pelo valor das suas cotas.\nFaturamento: sem teto fixo; o regime tributário vai conforme o porte.\nAtenção: o contrato social define as regras entre os sócios — vale caprichar nele. Confirme os detalhes com um contador.', 4),
  ('legal_structure', 'slu', 'SLU — Sociedade Limitada Unipessoal',
   'Um dono só, com o patrimônio pessoal protegido.',
   E'Pra quem: quem empreende sozinho e quer separar os bens pessoais dos da empresa.\nFaturamento: sem teto fixo; regime tributário conforme o porte.\nAtenção: responsabilidade limitada ao capital da empresa — um bom padrão para quem está solo. Confirme com um contador.', 5),
  ('legal_structure', 'disclaimer', 'Antes de decidir', null,
   'Este conteúdo é uma orientação inicial e não substitui um contador. A escolha do tipo de empresa depende de faturamento previsto, número de sócios e atividade — confirme com um profissional. O Plim pode indicar um parceiro para essa etapa.', 99)
on conflict (topic, key) do nothing;

-- 3) Parceiros indicados (estrutura futura) + leads (captura real de interesse)
create table if not exists public.partner_categories (
  id    text primary key,           -- accounting, legal, design, development, marketing, product, branding
  label text not null
);
insert into public.partner_categories (id, label) values
  ('accounting', 'Contador'), ('legal', 'Advogado'), ('design', 'Designer'),
  ('development', 'Desenvolvedor'), ('marketing', 'Marketing'),
  ('product', 'Consultor de produto'), ('branding', 'Consultor de marca')
on conflict (id) do nothing;

create table if not exists public.partners (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  category               text not null references public.partner_categories (id),
  description            text,
  country_code           text,
  region                 text,
  city                   text,
  contact_email          text,
  contact_phone          text,
  website_url            text,
  monthly_visibility_fee integer,   -- centavos
  status                 text not null default 'active',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
alter table public.partners enable row level security;
drop policy if exists "partners: read" on public.partners;
create policy "partners: read" on public.partners
  for select to authenticated using (status = 'active');

create table if not exists public.partner_leads (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies (id) on delete cascade,
  requested_by uuid,
  category     text not null references public.partner_categories (id),
  note         text,
  status       text not null default 'open',   -- open | contacted | closed
  created_at   timestamptz not null default now()
);
create index if not exists partner_leads_company_id_idx on public.partner_leads (company_id);
alter table public.partner_leads enable row level security;
drop policy if exists "partner_leads: members read" on public.partner_leads;
create policy "partner_leads: members read" on public.partner_leads
  for select using (public.is_company_member(company_id));
