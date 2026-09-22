-- OkiDoki: a sociedade virou 33,34 / 33,33 / 33,33, mas a única conta em
-- aberto (Coworking Space - ELEPHANT, R$ 99,00, vence 20/09/2026) ainda
-- estava prevista pela sociedade antiga (40 / 40 / 20).
--
-- A partir do deploy, mudar a participação realinha as contas em aberto
-- sozinho. Este script só corrige a conta que já existia antes disso.
-- Despesa paga não é tocada: o passado fica como está.
--
-- Rodar no SQL Editor do Supabase. Idempotente.

update expense_shares
set share_cents = 3300
where expense_id = '20b43025-bb8e-4ec7-bd86-bb8d24ce47ce'
  and member_id in (
    select id from company_members
    where company_id = '10b46ecd-961a-46d2-a734-30cd9d393cc2'
  );

-- Conferência: as três partes têm que somar 9900.
select m.full_name, s.share_cents
from expense_shares s
join company_members m on m.id = s.member_id
where s.expense_id = '20b43025-bb8e-4ec7-bd86-bb8d24ce47ce'
order by m.full_name;
