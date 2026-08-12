# Pagamento e responsabilidade: duas contas diferentes

> Escrita em 11/08/2026, a partir dos cenários levantados pela Rafaelle.
>
> Status em 11/08/2026: fatias A a G feitas e verificadas localmente, fora do
> git. A migração 0033 já está aplicada no banco de produção. Falta a fatia H
> (subir o código) e o fim da fatia G, descrito no final deste documento.

## O princípio

Uma movimentação carrega **duas informações independentes**, que hoje o Plim
trata como uma só:

1. **Pagamento.** Quem tirou dinheiro do bolso e colocou na conta do
   fornecedor. É fato consumado, é histórico, e não muda nunca.
2. **Responsabilidade.** De quem é aquele custo, dentro da sociedade. É uma
   decisão dos sócios, e pode ser revista.

A diferença entre as duas é o que gera acerto entre sócios.

A frase que resume tudo, e que o sistema atual não sabe representar:

> Uma despesa pode estar 100% paga ao fornecedor e ainda existirem valores a
> acertar entre os sócios. São coisas diferentes.

## Os três cenários que precisam caber

### 1. Cada sócia pagou a sua parte, direto ao fornecedor

Despesa de R$ 2.000 na empresa X. Rafaelle pagou R$ 1.000 direto para a X,
Gabrielli pagou R$ 1.000 direto para a X. Responsabilidade 50/50.

| Sócia      | Pagou     | Responsável por | Diferença |
| ---------- | --------- | --------------- | --------- |
| Rafaelle   | R$ 1.000  | R$ 1.000        | R$ 0      |
| Gabrielli  | R$ 1.000  | R$ 1.000        | R$ 0      |

Status da despesa: **Paga**. Acerto entre sócias: **nenhum**.

Hoje isso é impossível de registrar: `expenses.paid_by_member_id` é uma FK
única, então só existe um pagador, que por definição pagou 100%. A saída de
hoje é mentir (uma pagou tudo, e o sistema inventa uma dívida que não existe)
ou partir o custo em duas despesas de R$ 1.000, o que faz o gasto com a
empresa X deixar de ser um evento único.

### 2. Uma sócia pagou tudo, a outra devolve depois

Despesa de R$ 2.000 na empresa Y. Rafaelle pagou os R$ 2.000. Responsabilidade
50/50.

| Sócia      | Pagou     | Responsável por | Diferença     |
| ---------- | --------- | --------------- | ------------- |
| Rafaelle   | R$ 2.000  | R$ 1.000        | +R$ 1.000     |
| Gabrielli  | R$ 0      | R$ 1.000        | −R$ 1.000     |

Status da despesa: **Paga**. Acerto: Gabrielli deve R$ 1.000 para Rafaelle.

Quando a Gabrielli transfere o dinheiro, isso é um acerto entre sócias,
registrado à parte em `settlement_payments`. **A transferência não substitui a
Rafaelle como pagadora da despesa.** O histórico continua dizendo que quem
pagou a empresa Y foi a Rafaelle.

### 3. Sócio novo assumindo despesas anteriores à entrada dele

Vanessa entra com 20% de participação. Os sócios decidem que ela assume as
despesas anteriores conforme a participação societária. Aplicando à despesa do
cenário 2:

| Sócia      | Pagou     | Responsável por | Diferença   |
| ---------- | --------- | --------------- | ----------- |
| Rafaelle   | R$ 2.000  | R$ 800          | +R$ 1.200   |
| Gabrielli  | R$ 0      | R$ 800          | −R$ 800     |
| Vanessa    | R$ 0      | R$ 400          | −R$ 400     |

Status da despesa: **Paga**, como sempre foi. Acertos: Gabrielli deve R$ 800 e
Vanessa deve R$ 400, ambas para a Rafaelle.

Mudou só a coluna de responsabilidade. A coluna de pagamento ficou intocada.

Se a Gabrielli já tivesse pago R$ 1.000 para a Rafaelle **antes** da entrada da
Vanessa, esse acerto continua válido e vira adiantamento: a Gabrielli passa a
ser credora de R$ 200.

## Regras de negócio

**RN1. O histórico de pagamento é imutável.** Entrada ou saída de sócio nunca
recalcula quem pagou uma despesa nem quanto cada um pagou. O que se recalcula
é só a responsabilidade.

**RN2. Uma movimentação guarda separadamente:** valor total, data, status de
pagamento, quem pagou, quanto cada um pagou, quem é responsável, quanto cada um
deve assumir, e os acertos feitos depois.

**RN3. A soma dos pagamentos define o status**, e não um campo digitado à mão:

- soma = valor total → **Paga**
- 0 < soma < valor total → **Parcial**
- soma = 0 → **Pendente**

**RN4. A soma das responsabilidades é sempre igual ao valor total**, mesmo com
despesa parcialmente paga. Responsabilidade se calcula sobre o valor cheio; o
que falta pagar ao fornecedor é outra conta, que aparece como conta em aberto.
O motor continua sendo o método do maior resto (`computeSplit`), então as
partes fecham no centavo.

**RN4a. Numa despesa parcial, o acerto só alcança o dinheiro que já saiu.** A
responsabilidade continua sendo sobre o valor cheio (RN4), mas só se pode
acertar entre sócios o que alguém de fato adiantou. Se a despesa é de R$ 2.000,
está 50/50 e só R$ 1.000 foram pagos, quem não pagou deve R$ 500, e não
R$ 1.000. O resto vira dívida entre sócios quando for pago ao fornecedor.

Sem esta regra o saldo dos sócios deixaria de somar zero, e os acertos passariam
a cobrar dívida que ninguém adiantou. O cálculo usa o mesmo método do maior
resto do rateio, então as partes efetivas somam exatamente o valor pago.

**RN5. Sócio que não participa sai da conta e o valor se redistribui** entre
quem sobrou, mantendo a soma no total exato. Não existe "parte órfã".

**RN6. Quem assume uma parte no passado paga para quem adiantou o dinheiro**,
não para a empresa. O credor é quem tirou do bolso.

**RN7. A pergunta é manual, a conta é automática.** Entrar com 20% não faz o
sistema aplicar 20% no passado sozinho. Alguém decide. Depois de decidido, o
sistema varre todas as despesas anteriores, recalcula a responsabilidade e gera
os acertos prontos, sem revisão despesa por despesa.

**RN8. O padrão é não participar.** Na dúvida, o sócio novo entra sem herdar
dívida nenhuma. Assumir passado é escolha explícita.

## Modelo de dados

### Nova tabela: `expense_payments`

Quem colocou dinheiro naquela movimentação.

```
id             uuid pk
expense_id     uuid not null → expenses (on delete cascade)
member_id      uuid not null → company_members (on delete restrict)
amount_cents   integer not null check (amount_cents > 0)
paid_on        date not null
created_at     timestamptz
```

Substitui `expenses.paid_by_member_id` como fonte da verdade. A coluna antiga
fica por um tempo, preenchida com o maior pagador, para não quebrar as
consultas existentes de uma vez.

`on delete restrict` no membro de propósito: apagar um sócio não pode apagar o
registro de que ele pagou.

### `expense_shares` ganha responsabilidade explícita

```
+ participates  boolean not null default true
+ rule          text     -- 'equity' | 'equal' | 'manual' | 'inherited'
```

`participates = false` mantém a linha com `share_cents = 0`, em vez de apagá-la.
Guardar o "não participa" é diferente de não ter registro nenhum: o primeiro é
uma decisão, o segundo é ausência de informação.

### `expenses`

O `payment_status` de hoje é um enum de dois valores (`paid` / `unpaid`) usado
pela jornada de contas a pagar. Passa a ser **derivado** da soma dos pagamentos,
com três valores (`paid` / `partial` / `unpaid`), e a coluna vira cache do
cálculo, recomputada a cada escrita. A regra de hoje (conta a pagar não entra
no total gasto até ser paga) é preservada: `unpaid` continua fora dos totais, e
`partial` entra pelo valor efetivamente pago.

### `settlement_payments`

Fica como está: é dinheiro que mudou de mão entre sócios, de verdade.

O que muda é o `is_auto`. Hoje registrar uma despesa grava acertos automáticos
"fulano me deve X". Com pagamento e responsabilidade separados, esse valor
passa a ser **calculado** da diferença entre as duas colunas, e não pré-gravado.
Os `is_auto` existentes em produção viram parte da migração.

## Cálculo dos acertos

O saldo de cada sócio passa de

```
paidCents = soma das despesas onde ele é O pagador
```

para

```
paidCents = soma de expense_payments.amount_cents dele
owedCents = soma de expense_shares.share_cents dele
netCents  = paidCents − owedCents + acertos enviados − acertos recebidos
```

O `computeSettlements` (casamento guloso de devedores e credores) continua
igual: recebe saldos que somam zero e devolve o menor número de transferências.

Tudo em centavos inteiros. A única divisão por 100 do sistema continua sendo a
formatação em `formatMoney`.

## Telas

### Detalhe da movimentação

Sai o bloco atual de "quem deve o quê", que mistura as duas contas (e junto sai
a etiqueta "falta pagar", que mostra pendência em despesa quitada). Entram dois
blocos, nesta ordem:

**Pagamento da despesa**

- status: Paga / Parcial / Pendente
- valor total
- quem pagou e quanto cada um pagou
- se parcial, quanto ainda falta pagar ao fornecedor

**Acerto entre sócios**

Só as diferenças. Quem está zerado não aparece.

```
Vanessa Pessoa          R$ 1.000 a regularizar
  R$ 500 → Rafaelle
  R$ 500 → Gabrielli
                              [ Registrar acerto ]
```

### Editar movimentação

A mudança que a tela precisa suportar: **informar mais de um pagador**, com o
valor que cada um colocou. Do tipo "a Gabrielli pagou R$ 1.000 direto para a
empresa e eu paguei os outros R$ 1.000".

O formulário ganha duas seções separadas:

- **Quem pagou**: lista de sócios com valor, botão de adicionar pagador,
  contador do que já foi informado contra o valor total. Um pagador só continua
  sendo o caminho rápido (preenche o total automaticamente).
- **Quem é responsável**: modo de divisão (participação, partes iguais, manual)
  e, por sócio, o valor com a opção "não participa desta despesa".

As duas seções somam para o mesmo total, mas de forma independente. A tela
mostra o resultado antes de salvar, em uma linha do tipo "ao salvar, a Gabrielli
passa a dever R$ 800 para a Rafaelle".

### Jornada do sócio novo

Ao entrar um sócio, se existirem despesas anteriores à data de entrada:

> Vanessa entrou em 10/08/2026. Existem 14 despesas anteriores à entrada dela,
> somando R$ 9.266. Como deseja tratá-las?
>
> 1. Não participa das despesas anteriores. *(padrão)*
> 2. Participa conforme a participação societária (20%).
> 3. Definir percentual ou valor manualmente.
> 4. Revisar despesa por despesa.

Escolhida a opção 2 ou 3, o sistema recalcula a responsabilidade de todas as
despesas do período e mostra a prévia do total a regularizar por credor **antes
de confirmar**. Confirmar é o único ponto que escreve.

## Migração dos dados atuais

1. Criar `expense_payments` e popular com uma linha por despesa:
   `member_id = paid_by_member_id`, `amount_cents = amount_cents`,
   `paid_on = spent_on`. Preserva exatamente os saldos que estão na tela hoje.
2. Adicionar `participates` (default `true`) e `rule` em `expense_shares`.
3. Recalcular `payment_status` a partir dos pagamentos.
4. Reconciliar os `settlement_payments` com `is_auto = true`: eles passam a ser
   derivados. Os manuais (`is_auto = false`) não são tocados, é dinheiro real.

Nada disso roda sozinho. Vai como script para a Rafaelle executar, com
simulação (`--dry-run`) antes, no mesmo formato de
`scripts/corrigir-valor-movimentacao.mjs`.

## Fatias de entrega

Cada fatia é testável sozinha e para em um estado consistente.

| # | Fatia | Entrega |
| - | ----- | ------- |
| A | Migração e contratos | `expense_payments`, colunas novas, schemas Zod, script de migração com simulação |
| B | Motor de cálculo | saldos a partir de pagamentos e responsabilidades, testes cobrindo os três cenários |
| C | API | criar, editar e ler movimentação com múltiplos pagadores e responsabilidade |
| D | Detalhe da movimentação | dois blocos separados, fim da etiqueta enganosa |
| E | Editar movimentação | múltiplos pagadores e "não participa" na tela |
| F | Jornada do sócio novo | as quatro opções, prévia e confirmação |
| G | Acertos | tela de acertos lendo do modelo novo, limpeza dos `is_auto` |
| H | Produção | scripts, migração e verificação |

## Riscos

**Saldo mudando na cara do usuário.** Se a migração errar, os números de todo
mundo mudam de uma vez. Mitigação: a fatia A tem simulação obrigatória e o
teste de que os saldos antes e depois são idênticos.

**Confusão entre as duas contas.** O produto inteiro depende de o usuário
entender que "paga" e "acertada" são coisas diferentes. Mitigação: nunca usar a
palavra "pendente" para acerto entre sócios, e nunca usar "deve" para conta com
fornecedor. Vocabulário separado, tela separada.

**Retrocompatibilidade do `paid_by_member_id`.** Enquanto as duas fontes
coexistirem, elas podem divergir. Mitigação: a coluna vira somente leitura
derivada, atualizada pela API a cada escrita, e sai do código na fatia G.

## O que ficou para depois da subida

Duas limpezas da fatia G ficaram de propósito para depois de o código rodar em
produção, porque hoje elas só adicionariam risco:

**A ponte de compatibilidade do repositório.** O `SupabaseFinanceRepository`
tenta ler `participates` e `rule` e, se o banco recusar, refaz a consulta sem
elas. Isso protege contra o código subir antes da migração, e o custo é uma
consulta extra só no caso quebrado. Sai quando a 0033 estiver aplicada em todo
ambiente que exista.

**A coluna `paid_by_member_id`.** Continua `not null` e ainda alimenta a
confirmação da movimentação e as consultas antigas; a API mantém ela com o
maior pagador. Tirar exige mexer em confirmação, listagem e nas telas que ainda
a leem, e isso é um refactor que merece a sua base já rodando no modelo novo.
