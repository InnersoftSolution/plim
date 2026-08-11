-- 0032 - Marca quais acertos foram criados JUNTO com a movimentacao
--
-- Existem dois tipos de acerto e eles nao podem ser tratados igual:
--
--  a) AUTOMATICO: nasceu do "fulano ja me pagou" marcado no registro da
--     movimentacao. Nao e um pagamento com valor proprio, e a afirmacao de que
--     a pessoa quitou A PARTE DELA. Se o valor da movimentacao muda, a parte
--     muda, e esse acerto tem que acompanhar.
--  b) MANUAL: alguem registrou em Acertos que transferiu um valor especifico.
--     Isso e dinheiro que mudou de mao de verdade. Mudar o valor da despesa
--     NAO pode reescrever esse historico.
--
-- Sem essa coluna a API so sabia recusar a edicao ("remova os acertos antes"),
-- o que obrigava a pessoa a desfazer o historico para corrigir um numero.
--
-- Aditivo e seguro: coluna com default. O backfill so marca as linhas que
-- reconhecidamente vieram do fluxo automatico (a nota que a API escreve).

alter table public.settlement_payments
  add column if not exists is_auto boolean not null default false;

-- Backfill dos que ja existem: a API sempre gravou essa nota ao criar o acerto
-- junto da movimentacao. Quem nao bate continua manual (default false), que e
-- o lado seguro: na duvida, nao mexer no historico.
update public.settlement_payments
   set is_auto = true
 where expense_id is not null
   and is_auto = false
   and note like 'Acerto registrado junto com a despesa %';

create index if not exists settlement_payments_auto_idx
  on public.settlement_payments (expense_id)
  where is_auto = true;
