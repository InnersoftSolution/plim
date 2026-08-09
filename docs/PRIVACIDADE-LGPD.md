# Privacidade e exclusão de dados (LGPD)

Como o Plim atende os direitos do titular previstos na Lei 13.709/2018, e onde
cada peça mora no código.

## O que existe hoje

| Direito (LGPD) | No produto | Onde |
| --- | --- | --- |
| Acesso e portabilidade (art. 18, II e V) | Botão "Baixar dados" em Configurações: arquivo JSON com tudo o que o Plim guarda da empresa | `GET /companies/:id/export` |
| Eliminação (art. 18, VI) | "Excluir empresa" e "Excluir minha conta", com carência | `POST/DELETE /companies/:id/deletion`, `POST/DELETE /me/deletion` |
| Revogação e reversão | Cancelar o pedido dentro da carência | mesmos endpoints, verbo `DELETE` |
| Comprovação do atendimento (art. 37) | Tabela `deletion_requests` | migração `0030` |

## Duas exclusões diferentes

**Empresa.** Apaga a empresa e todo o histórico dela, para todos os sócios.
Só o dono da conta (`account_owner`) pode pedir, e precisa digitar o nome da
empresa por extenso.

**Conta.** Encerra o acesso da pessoa. Fica **bloqueada** enquanto ela for dona
de uma empresa com outros sócios ativos: apagar dado de terceiro não pode ser
decisão de uma pessoa só. A saída é transferir a titularidade
(`POST /companies/:id/transfer-ownership`) ou excluir aquela empresa antes.
Empresas onde a pessoa está sozinha são agendadas junto com a conta, no mesmo
prazo, porque sem dono ninguém mais acessaria aqueles dados.

## Carência de 30 dias

O pedido **agenda**, não apaga. O prazo está em `DELETION_GRACE_DAYS`
(`packages/shared/src/contracts/privacidade.ts`), único lugar que o define.

Durante a carência a empresa continua funcionando e **todos os sócios veem a
faixa de aviso** no topo do app (`DeletionBanner`). É proposital: esconder a
empresa durante o prazo faria os outros descobrirem a perda depois que ela já
tivesse acontecido, sem chance de reagir.

## O expurgo definitivo

Quem apaga de verdade é o script, nunca a API:

```bash
node scripts/purge-deletions.mjs --dry-run
```

```bash
npm run purge:deletions
```

Precisa de `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no ambiente.
**Enquanto ninguém rodar o script, nada é apagado**: os pedidos ficam
acumulados esperando, o que é seguro mas não cumpre o prazo prometido ao
titular. Por isso ele roda como cron.

### O cron na Railway

Serviço separado da API, no mesmo projeto e no mesmo repositório:

| Campo (Settings do serviço) | Valor |
| --- | --- |
| Config as code | `railway.cron.json` |
| Cron Schedule | `0 6 * * *` (3h da manhã em Brasília, UTC−3) |
| Variables | `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` |

O `railway.cron.json` existe justamente para o serviço de cron não herdar o
`railway.json` da API: sem healthcheck, porque não sobe servidor, e
`restartPolicyType: NEVER`, porque é tarefa que roda e termina. Sem isso a
Railway ficaria reiniciando o expurgo em laço.

O script termina com código 1 quando alguma exclusão falha, então a execução
aparece vermelha no painel. Uma rodada normal sem nada vencido termina em 0 e
imprime "0 empresa(s) e 0 conta(s)".

O script apaga a linha em `companies` e deixa o `on delete cascade` levar o
resto (movimentações, rateios, custos recorrentes, contatos, atividades,
agenda, sócios, checklist, jornada). Contas são removidas do Supabase Auth, o
que derruba o `profile` em cascata.

Trava de segurança: se a pessoa ainda for dona de uma empresa viva, a conta é
**pulada** com aviso no log, em vez de deixar uma empresa órfã.

## O que fica guardado depois do expurgo

Apenas `deletion_requests`: tipo do pedido, id e rótulo do titular, quem pediu,
motivo (se informado), data do pedido, data marcada e data de conclusão.

Essa tabela **não tem chave estrangeira de propósito** — precisa sobreviver ao
que ela documenta. Não contém dado da empresa nem financeiro: é o mínimo para
comprovar que o direito de eliminação foi cumprido.

Nunca entram na exportação: `user_calendar_connections` (tokens do Google,
cifrados) e qualquer chave. São dados da pessoa, não da empresa, e material
sensível não vai para um arquivo que se baixa.

## Pendências conhecidas

- **Aviso por e-mail.** Os outros sócios só veem a faixa dentro do app. O ideal
  é notificar por e-mail quando a exclusão é pedida e quando falta pouco.
- **Retenção legal.** A tela já informa que dados exigidos por lei podem ser
  mantidos pelo prazo legal, mas hoje o expurgo apaga tudo. Se o Plim passar a
  emitir documento fiscal, será preciso separar o que a lei obriga a conservar.

## Onde está no código

```
supabase/migrations/0030_exclusao_lgpd.sql   colunas + deletion_requests
packages/shared/src/contracts/privacidade.ts contratos e o prazo
apps/api/src/services/privacy.service.ts     TODAS as regras
apps/api/src/http/routes/privacy.routes.ts   rotas
apps/api/src/repositories/privacy.repository.ts  + in-memory e supabase
apps/web/src/company/CompanyPrivacyPanel.tsx jornada da empresa
apps/web/src/company/AccountPrivacyPanel.tsx jornada da conta + transferência
apps/web/src/company/DeletionBanner.tsx      faixa no topo do app
scripts/purge-deletions.mjs                  expurgo definitivo
railway.cron.json                            config do servico de cron
```
