-- 0035: custo recorrente pago pelo caixa da empresa.
--
-- O cadastro sempre exigiu um sócio como pagador previsto, mas empresas que
-- pagam as contas com a própria receita (caso da MYCLINIC360, que paga tudo
-- pelo Asaas) não têm um sócio pagador: dizer "pago por Fulana" na tela era
-- mentira, e marcar a cobrança como paga geraria um acerto que não existe.
--
-- A coluna é um marcador por cima do pagador previsto, não um substituto:
-- paid_by_member_id continua NOT NULL como fallback histórico, e quando
-- paid_by_company é true as telas mostram "caixa da empresa" e o pagamento
-- nasce sem sócio pagador (mesma semântica do paidByCompany das despesas:
-- paga + zero expense_payments = ninguém deve nada a ninguém).
alter table recurring_costs
  add column if not exists paid_by_company boolean not null default false;

comment on column recurring_costs.paid_by_company is
  'true = a cobrança sai do caixa da empresa; o paid_by_member_id vira só um registro histórico e o pagamento não gera acerto entre sócios.';
