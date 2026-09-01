-- Custo recorrente aponta para a categoria DA EMPRESA (tabela categories), e
-- não só para a lista fixa do enum `category`.
--
-- Por quê: a cobrança gerada por um recorrente nascia sem categoria, porque o
-- enum ('tools', 'infrastructure'…) não conversa com as categorias que a
-- empresa cadastrou ('Tecnologia', 'Servidor/Infra'…). Resultado: "Sem
-- categoria" na lista de contas a pagar, mesmo o custo tendo categoria.
-- Com esta coluna, o custo diz de qual categoria ele é, e toda cobrança que ele
-- gerar nasce com ela: se é Tecnologia, é Tecnologia até o fim.
--
-- A coluna antiga continua onde está: cadastro velho segue funcionando, e a
-- tela mostra a categoria da empresa quando existe, senão a do enum.
alter table recurring_costs
  add column if not exists category_id uuid references categories(id) on delete set null;

comment on column recurring_costs.category_id is
  'Categoria da empresa (categories). A cobrança gerada herda. Null = usa o enum category.';

create index if not exists recurring_costs_category_id_idx
  on recurring_costs (category_id);
