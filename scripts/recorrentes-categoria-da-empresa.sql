-- ============================================================================
-- Custo recorrente com a categoria DA EMPRESA (e a cobrança herdando ela)
--
-- RODE ESTE SCRIPT ANTES DE SUBIR O CÓDIGO NOVO: ele cria a coluna que a
-- versão nova usa para gravar a categoria do custo.
--
-- Onde: Supabase → SQL Editor → cole tudo → Run.
-- É seguro rodar duas vezes (tudo é "if not exists" / condicional).
-- ============================================================================

-- 1) A coluna nova ---------------------------------------------------------
alter table recurring_costs
  add column if not exists category_id uuid references categories(id) on delete set null;

comment on column recurring_costs.category_id is
  'Categoria da empresa (categories). A cobrança gerada herda. Null = usa o enum category.';

create index if not exists recurring_costs_category_id_idx
  on recurring_costs (category_id);

-- 2) Categoria de cada custo que já existe ---------------------------------
-- Traduz a lista fixa antiga para a categoria equivalente da empresa, casando
-- pelo nome. Custo que não achar par fica sem categoria e você escolhe na tela.
update recurring_costs rc
set category_id = c.id
from categories c
where c.company_id = rc.company_id
  and c.archived = false
  and rc.category_id is null
  and lower(c.name) = lower(
    case rc.category
      when 'tools' then 'Assinaturas/SaaS'
      when 'infrastructure' then 'Servidor/Infra'
      when 'accounting' then 'Contabilidade'
      when 'marketing' then 'Marketing'
      when 'legal' then 'Advocacia'
      when 'operations' then 'Serviços terceirizados'
      else 'Outros'
    end
  );

-- 3) As contas a pagar que já nasceram sem categoria ------------------------
-- Só as que ainda estão em aberto e vieram de um recorrente: elas passam a
-- mostrar a categoria do custo, em vez de "Sem categoria".
update expenses e
set category_id = rc.category_id
from recurring_costs rc
where e.recurring_cost_id = rc.id
  and e.category_id is null
  and rc.category_id is not null
  and e.payment_status = 'unpaid';

-- 3b) O Jil é Tecnologia ---------------------------------------------------
-- A lista antiga dizia "Infraestrutura", que traduz para Servidor/Infra. Você
-- falou que ele é Tecnologia, então corrige aqui (e as contas em aberto dele
-- vão junto). Se não quiser, é só apagar este bloco.
update recurring_costs rc
set category_id = c.id
from categories c
where c.company_id = rc.company_id
  and c.archived = false
  and lower(c.name) = 'tecnologia'
  and rc.name ilike '%Jil%';

update expenses e
set category_id = rc.category_id
from recurring_costs rc
where e.recurring_cost_id = rc.id
  and rc.name ilike '%Jil%'
  and rc.category_id is not null
  and e.payment_status = 'unpaid';

-- 4) Confira o resultado ---------------------------------------------------
select rc.name as custo,
       rc.category as lista_antiga,
       coalesce(c.name, '— sem categoria —') as categoria_da_empresa
from recurring_costs rc
left join categories c on c.id = rc.category_id
where rc.active
order by rc.name;
