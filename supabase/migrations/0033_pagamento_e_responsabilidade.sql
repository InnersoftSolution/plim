-- 0033 — Pagamento e responsabilidade viram duas contas separadas
--
-- Até aqui uma movimentação tinha UM pagador (expenses.paid_by_member_id), que
-- por definição pagou 100% do valor. Isso não cabe a vida real:
--
--   a) duas sócias podem pagar direto ao fornecedor, cada uma a sua parte.
--      Nesse caso a despesa está quitada e NÃO existe acerto nenhum, mas o
--      modelo antigo obriga a eleger uma pagadora e inventa uma dívida;
--   b) um sócio pode entrar depois e assumir parte das despesas antigas. Aí a
--      responsabilidade muda, mas quem pagou o fornecedor não muda nunca.
--
-- A partir daqui:
--   PAGAMENTO       = quem tirou do bolso (expense_payments). Histórico, imutável.
--   RESPONSABILIDADE = de quem é o custo (expense_shares). Decisão, revisável.
--   A diferença entre os dois é o que gera acerto entre sócios.
--
-- Ver docs/PAGAMENTO-E-RESPONSABILIDADE.md.
--
-- Esta migração é ADITIVA e preserva os saldos atuais: cada despesa já paga
-- ganha exatamente uma linha de pagamento, com o pagador de hoje pagando o
-- valor cheio. Rodar duas vezes não duplica nada.

-- ── 1. Pagamentos da movimentação ────────────────────────
create table if not exists public.expense_payments (
  id           uuid primary key default gen_random_uuid(),
  expense_id   uuid not null references public.expenses (id) on delete cascade,
  -- restrict de propósito: apagar um sócio não pode apagar o registro de que
  -- ele colocou dinheiro. O histórico financeiro é imutável (RN1).
  member_id    uuid not null references public.company_members (id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  paid_on      date not null default current_date,
  created_at   timestamptz not null default now()
);

-- Sem unique (expense_id, member_id): a mesma pessoa pode pagar duas parcelas
-- da mesma conta, em datas diferentes. Quem garante que a soma fecha com o
-- valor total é a API, não o banco, porque despesa parcial é estado válido.
create index if not exists expense_payments_expense_id_idx
  on public.expense_payments (expense_id);
create index if not exists expense_payments_member_id_idx
  on public.expense_payments (member_id);

alter table public.expense_payments enable row level security;
drop policy if exists "expense_payments: members read" on public.expense_payments;
create policy "expense_payments: members read" on public.expense_payments
  for select using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_payments.expense_id and public.is_company_member(e.company_id)
    )
  );

-- ── 2. Backfill: o pagador de hoje pagou o valor cheio ───
--
-- Só movimentação que divide entre sócios (despesa e aporte) e que já foi
-- paga. Conta a pagar (payment_status = 'unpaid') fica sem linha de pagamento
-- de propósito: soma de pagamentos igual a zero é exatamente o que significa
-- "ainda não saiu dinheiro". Receita não tem pagador entre sócios.
--
-- O `not exists` torna a migração idempotente.
insert into public.expense_payments (expense_id, member_id, amount_cents, paid_on)
select e.id, e.paid_by_member_id, e.amount_cents, e.spent_on
  from public.expenses e
 where coalesce(e.kind, 'expense') in ('expense', 'contribution')
   and coalesce(e.payment_status, 'paid') = 'paid'
   and not exists (
     select 1 from public.expense_payments p where p.expense_id = e.id
   );

-- ── 3. Responsabilidade explícita nas partes ─────────────
--
-- participates = false guarda a DECISÃO de que aquele sócio ficou de fora
-- desta despesa, com share_cents = 0. É diferente de não existir linha: o
-- primeiro é escolha registrada, o segundo é ausência de informação.
--
-- rule diz de onde veio o número, para a tela conseguir explicar:
--   equity    = proporcional à participação societária
--   equal     = partes iguais
--   manual    = valor digitado à mão
--   inherited = herdado ao entrar na sociedade (jornada do sócio novo)
alter table public.expense_shares
  add column if not exists participates boolean not null default true,
  add column if not exists rule text;

alter table public.expense_shares
  drop constraint if exists expense_shares_rule_check;
alter table public.expense_shares
  add constraint expense_shares_rule_check
  check (rule is null or rule in ('equity', 'equal', 'manual', 'inherited'));

-- Coerência: quem não participa tem parte zero. Vale nos dois sentidos, então
-- a API não consegue gravar um "não participa" pagando alguma coisa.
alter table public.expense_shares
  drop constraint if exists expense_shares_participates_check;
alter table public.expense_shares
  add constraint expense_shares_participates_check
  check (participates or share_cents = 0);

-- Backfill do `rule`: o que já existe veio do split_mode da movimentação.
-- 'custom' vira 'manual', que é o mesmo fato com o nome que a tela usa.
update public.expense_shares s
   set rule = case e.split_mode when 'custom' then 'manual' else e.split_mode end
  from public.expenses e
 where e.id = s.expense_id
   and s.rule is null;

-- ── 4. Status de pagamento ganha o meio do caminho ───────
--
-- 'partial' = já saiu dinheiro, mas não o valor cheio. Antes isso não existia:
-- ou a conta estava paga, ou estava em aberto.
--
-- ATENÇÃO: nenhuma linha nasce 'partial' nesta migração, e nenhum código de
-- hoje produz esse valor. O tratamento (entrar nos totais pelo valor pago, e
-- não pelo valor cheio) chega na fatia B. Até lá o valor existe no domínio e
-- não aparece em dado nenhum.
alter table public.expenses
  drop constraint if exists expenses_payment_status_check;
alter table public.expenses
  add constraint expenses_payment_status_check
  check (payment_status in ('paid', 'partial', 'unpaid'));

-- ── 5. paid_by_member_id continua, por enquanto ──────────
--
-- A coluna vira derivada (o maior pagador da movimentação) e serve só para não
-- quebrar as consultas que já existem. Sai do código na fatia G. Fica sem
-- default e sem trigger de propósito: quem mantém os dois lados coerentes é a
-- API, num lugar só, e não duas regras escondidas em camadas diferentes.
comment on column public.expenses.paid_by_member_id is
  'DEPRECADO desde 0033: use expense_payments. Mantido como o maior pagador, para compatibilidade. Remoção prevista na fatia G.';

comment on table public.expense_payments is
  'Quem colocou dinheiro na movimentação. Histórico imutável: entrada ou saída de sócio nunca reescreve estas linhas.';
comment on column public.expense_shares.participates is
  'false = este sócio não participa desta despesa (decisão registrada, com parte zero).';
comment on column public.expense_shares.rule is
  'De onde veio a parte: equity, equal, manual ou inherited (herdada ao entrar na sociedade).';
