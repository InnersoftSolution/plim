# Plim — Documentação Técnica (visão geral viva)

> **Documento vivo.** É a fonte única de verdade técnica do Plim — deve ser
> **atualizado a cada avanço** (novo módulo, tabela, rota, decisão).
> Última atualização: **8 jul 2026**.

---

## 1. O que é o Plim
SaaS (da Inner) para quem está **começando uma empresa/startup** e precisa
organizar desde o início: sócios, participação societária, país/moeda, estágio
do negócio e, na sequência, o **financeiro** (gastos, aportes, rateio entre
sócios). Público: fundadores brasileiros. Tom: moderno, direto, sem jargão.

### 1.1 Princípio de produto — jornada guiada (NUNCA CRUD frio)
> **"O Plim não espera a empresa estar organizada. O Plim ajuda a empresa a se organizar."**

O Plim é um **agente orientador**, não um sistema de cadastro. Toda tela (nova ou
melhorada) deve responder **6 perguntas**:
1. Onde o usuário está agora?
2. O que essa informação significa?
3. Por que isso importa para a empresa?
4. O que está faltando?
5. Qual é o próximo passo recomendado?
6. Pode fazer agora ou continuar depois?

Regras práticas: título humano; texto curto com o objetivo da tela; dados
agrupados por contexto; mensagens que expliquem o **impacto** ("isso ajuda o
Plim a calcular os acertos"); pendências visíveis; próximo passo recomendado;
sempre permitir **pular/continuar depois** (nunca bloquear); linguagem simples
(sem tom de sistema contábil); Design System; preparado para multiempresa.
Estados vazios explicam o porquê e convidam à ação — nunca "Nenhum dado
cadastrado" seco.

---

## 2. As duas metades: Web e API
O Plim roda como **dois serviços separados** que conversam entre si. Essa
separação é a **regra de ouro** do projeto.

| | **Plim — Web** (porta 5173) | **Plim — API** (porta 3333) |
|---|---|---|
| É | Front-end (o que você vê no navegador) | Back-end (servidor, invisível) |
| Stack | React 19 + TypeScript + Vite | Node + Fastify + TypeScript |
| Faz | **Apresenta** telas e recebe cliques | **Decide e calcula**: valida, aplica regras, salva |

```
Você (navegador) → Plim Web (5173) → Plim API (3333) → Banco (Supabase)
                    mostra a tela      aplica as regras     guarda os dados
```

- O Web **nunca decide nada sozinho**: ao salvar, ele chama a API, que valida,
  calcula e responde. (No `apps/web/vite.config.ts` há um proxy: tudo que começa
  com `/api` vai para `localhost:3333`.)
- Analogia: **Web = vitrine/salão**; **API = cozinha** (onde ficam as regras e a
  "verdade"). Por isso as duas precisam estar no ar juntas — se a API cai, o Web
  abre mas mostra "algo deu errado".

### Regra de ouro (inegociável)
1. **Toda regra de negócio e segurança vive no backend.** O front só apresenta.
2. **Dinheiro em centavos inteiros** (nunca float). Formatação é só apresentação.
3. **RLS (Row Level Security) no banco** como 2ª linha de defesa.

---

## 3. Estrutura do repositório (monorepo)
```
Plim/
├── apps/
│   ├── web/          Front-end (React + Vite)
│   └── api/          Back-end (Fastify)
├── packages/
│   └── shared/       Contratos Zod compartilhados (front valida FORMATO, back valida de verdade)
├── supabase/
│   └── migrations/   SQL versionado do banco (0001…)
├── docs/             Esta e as demais documentações
└── .mcp.json         Figma Dev Mode MCP (design system)
```
Monorepo com **npm workspaces**. Scripts na raiz: `npm run dev:web`,
`npm run dev:api`, `npm test`, `npm run typecheck`.

---

## 4. Stack e ferramentas
- **Front:** React 19, TypeScript (strict), Vite 6, React Router 7.
- **Back:** Node, Fastify 5, Zod, tsx (dev), Vitest (testes).
- **Compartilhado:** Zod (schemas/tipos usados nos dois lados).
- **Banco + Auth:** Supabase — Postgres, Auth (JWT, e-mail/senha + Google), Storage (futuro), RLS.
- **IA (opcional):** `@anthropic-ai/sdk` (copiloto). **Desligada por padrão** (sem chave = custo zero).
- **Design:** tokens em `apps/web/src/styles/tokens.css` (paleta **Indigo** do Figma), fontes Plus Jakarta Sans + JetBrains Mono. Figma Dev Mode conectado via `.mcp.json`.

---

## 5. Arquitetura da API (camadas)
```
http/ (rotas)     → contrato HTTP, valida entrada (Zod), autentica (JWT)
services/         → ★ TODAS as regras de negócio (rateio, equity, autorização)
repositories/     → acesso a dados; 2 implementações da MESMA interface:
                    • in-memory  (dev/testes — sem infra, custo zero)
                    • supabase   (Postgres, produção)
```
- **Troca por ambiente** (`apps/api/src/config/env.ts`):
  - `isSupabaseConfigured` → usa Postgres + exige JWT; senão in-memory + owner no corpo (dev).
  - `isLlmConfigured` → liga a "leitura" do copiloto; senão só insights determinísticos.
  - Em **testes** (`NODE_ENV=test`) nunca usa infra real → isolamento e custo zero.
- **Autorização:** `authenticate` (preHandler) valida o JWT do Supabase e popula
  `request.user`. Os serviços checam **pertencimento** (`assertMembership` /
  `getOverview`) — só membro da empresa acessa os dados dela.
- **Erros:** classe `DomainError` com `code` estável (ex.: `EQUITY_SUM_EXCEEDED`);
  as rotas traduzem para HTTP e o front para mensagem amigável.

---

## 6. Banco de dados (Supabase / Postgres)
Migrations em `supabase/migrations/`. Estrutura **multiempresa** (dados isolados por empresa via RLS).

| Tabela | Papel | Campos-chave | Migration |
|---|---|---|---|
| `profiles` | Perfil do usuário (1:1 com auth.users) | full_name, email, avatar_url, preferred_locale | 0001 |
| `companies` | Empresa/startup | name, is_name_temporary, description, industry(+_other), business_stage, country_code, region, city, currency_code, onboarding_status, onboarding_step, owner_id | 0001 + 0003 |
| `company_members` | Sócios/membros | user_id, full_name, email, **functional_role** (o que faz), **role** (papel no sistema), **equity_percent** (participação), notes, status, invitation_status | 0001 + 0003 |
| `company_journey_steps` | Progresso da jornada guiada | step_id, completed_at | 0002 |
| `expenses` / `expense_shares` | Despesas + rateio (Fase 2) | amount_cents, paid_by_member_id, split_mode / share_cents | 0004 ✅ |

> **3 conceitos separados** nos sócios (nunca misturar): **papel funcional**
> (`functional_role`), **papel no sistema** (`role`: account_owner…), e
> **participação societária** (`equity_percent`).

**RLS:** função `is_company_member(company_id)` (security definer) + policies de
leitura para membros. Escrita só via **service role** (a API).

---

## 7. Módulos e status
| Módulo | Descrição | Status |
|---|---|---|
| **Navegação (app shell)** | Menu lateral com submenu: **Home · Empresa (▸ Dados da empresa · Sócios) · Movimentações · Acertos** (`components/AppShell.tsx`, layout route com `<Outlet/>`). Onboarding fica fora (tela cheia). | ✅ pronto |
| **Autenticação** | Login, cadastro, esqueci senha, Google, sessão persistente | ✅ pronto |
| **Onboarding** | Multi-step (empresa → local/moeda → estágio → sócios → revisão), **salva e retoma** | ✅ pronto |
| **Dashboard / Home** | Painel financeiro estilo Mosaic: cabeçalho + % config, 4 cards (total gasto, custo mensal, acertos, sociedade), ações rápidas, **modal de movimentação**, acertos, últimas movimentações, pendências | ✅ pronto (custo mensal = stub) |
| **Configurações** | Dados da empresa + checklist de configuração (saiu do painel) — `pages/ConfiguracoesPage.tsx` | ✅ pronto |
| **Acertos** | Acertos líquidos entre sócios + saldo por sócio — `pages/AcertosPage.tsx` | ✅ pronto |
| **Copiloto / insights** | Insights determinísticos + "leitura" opcional do LLM | ✅ (IA desligada = R$0) |
| **Financeiro (Fase 2)** | Despesas, rateio (equity/equal/custom), saldos e **acertos líquidos** | ✅ **pronto**: rateio + acertos + serviço + testes + banco (0004) + rotas + telas. **Falta (futuro)**: custos recorrentes, aportes, quitação de acerto |
| **Custos mensais (recorrentes)** | Assinaturas/ferramentas com valor, frequência e próxima cobrança | ❌ **stub** (card/seção com estado vazio); **precisa tabela nova + migração** |

---

## 8. Financeiro (Fase 2) — detalhe técnico
- **Motor de rateio** (`apps/api/src/services/rateio.ts`): `computeSplit(valorCentavos, pesos[])` divide garantindo **soma exata** (método do maior resto — nunca some/sobra 1 centavo).
- **`FinanceService`**: registra despesa (quem pagou, valor, data), calcula as
  partes por **equity / equal / custom**, e os **saldos** (pagou − parte devida).
  Invariante: a **soma dos saldos é sempre zero**.
- **Acertos líquidos** (`apps/api/src/services/settlements.ts`): `computeSettlements(saldos[])`
  simplifica dívidas cruzadas (RB006) num mínimo de transferências — "Fulano paga
  R$X para Beltrano" (método guloso maior devedor × maior credor; 6 testes). Rota:
  `GET /companies/:id/settlements`.
- **Persistência:** tabelas `expenses` + `expense_shares` no Postgres (migration
  `0004`, com RLS por sócio). Rotas: `POST/GET /companies/:id/expenses` e
  `GET …/balances`. Em teste roda in-memory (custo zero).
- **Tela** (`apps/web/src/pages/FinancePage.tsx`, rota `/financeiro`): formulário
  de despesa (descrição, valor em centavos, quem pagou, dividir por participação
  ou igualmente), saldos por sócio (verde = a receber, coral = a pagar) e lista
  de despesas com o rateio detalhado. Dinheiro sempre em **centavos inteiros**.
- Arquitetura completa em [`FASE-2-FINANCEIRO.md`](FASE-2-FINANCEIRO.md).

---

## 9. Como rodar

### Local (desenvolvimento)
- **Servidores:** o Plim tem 2 configs em `~/.claude/launch.json` (`plim-web` e
  `plim-api`). Subir os dois (via preview ou `npm run dev:web` / `npm run dev:api`).
- **Portas:** Web `5180` (fixa no `vite.config.ts`, `strictPort`), API `3333`.
  O front faz proxy `/api → 3333`. CityFurnace usa a 3000 — sem colisão.
- **Modo do banco:** com `apps/api/.env` preenchido (Supabase) → Postgres + JWT;
  sem preencher → in-memory (dev).

### Produção (desde 10 jul 2026)
```
usuário → plim-api.vercel.app ── Vercel: site React estático (CDN, grátis)
              └── /api/* ──proxy──→ Railway: Fastify 24h (~US$5/mês)
                                        └──→ Supabase (Postgres + Auth)
```
- **Deploy automático:** `git push` na `main` → Vercel rebuilda o site e o
  Railway rebuilda a API, cada um por conta própria (~2 min).
- **Vercel** (projeto `plim-api`, team `plimwork`): `vercel.json` na raiz define
  build do web e o rewrite `/api/(.*) → api-production-7e38f.up.railway.app` —
  proxy server-side, mesma origem, sem CORS.
- **Railway** (projeto `PLIM`, serviço `api`): `railway.json` define
  `npm install && npm run build:api` (bundle esbuild → `.api-bundle/server.mjs`),
  start `npm run start:api`, healthcheck `/health`. Variáveis: `PORT=3333`,
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (chaves novas `sb_...`).
- **Armadilhas já resolvidas (não repetir):** Root Directory na Vercel deve ser a
  raiz do repo (importado errado como `apps/api` = build sem o web); Railway
  injeta `NODE_ENV=""` (string vazia — o env schema trata); Fastify 5 exige
  Node ≥20 (`engines` no package.json raiz).

---

## 10. Testes
- **Vitest** na API. Rodar: `npm test`. Hoje: **52 testes** (empresa, jornada,
  copiloto, financeiro, rateio, acertos, rotas).
- Em teste, tudo roda **in-memory** (sem Supabase, sem IA) → rápido e **custo zero**.

---

## 11. Segurança e custo
- **Segurança:** JWT validado na API; autorização por pertencimento; RLS no banco;
  segredos só em `.env` (nunca no front nem no chat); `.gitignore` cobre `.env`.
- **Custo de IA:** núcleo 100% determinístico (R$0). A "leitura do copiloto"
  (opcional) usa Claude Haiku (~R$0,02 por atualização, com prompt caching).
  Ligar só preenchendo `ANTHROPIC_API_KEY`.

---

## 12. Roadmap
- **Fase 1 — Fundação:** ✅ concluída (usuário, empresa, sócios, onboarding, dashboard).
- **Fase 2 — Financeiro:** ✅ despesas + rateio + saldos + **acertos líquidos** + **Home financeira** (Mosaic). Próximo: **custos mensais recorrentes** (tabela nova), aportes e quitação de acerto.
- **Trilha de inteligência (paralela/opcional):** copiloto estratégico — ver [`INTELIGENCIA.md`](INTELIGENCIA.md).

---

## 13. Documentos relacionados
- [`ANALISE-SISTEMA.md`](ANALISE-SISTEMA.md) — análise de produto/requisitos.
- [`ARQUITETURA.md`](ARQUITETURA.md) — arquitetura (regra de ouro, camadas).
- [`INTELIGENCIA.md`](INTELIGENCIA.md) — núcleo inteligente / copiloto.
- [`FASE-2-FINANCEIRO.md`](FASE-2-FINANCEIRO.md) — arquitetura do financeiro.

---

### Registro de atualizações
- **10 jul 2026** — **🚀 PLIM EM PRODUÇÃO** — primeira publicação. Arquitetura
  separada: site na Vercel (estático/CDN), API no Railway (Fastify 24h via
  bundle esbuild), banco/auth no Supabase. URL: `plim-api.vercel.app`, com
  `/api/*` proxiado ao Railway (sem CORS). Deploy automático via push na `main`
  nos dois. Chaves do Supabase migradas para o formato novo (`sb_publishable_`/
  `sb_secret_`); a `service_role` legada vazada foi neutralizada. Migração
  `0016_atividade_inicio` (start_date) aplicada. Correções no caminho: porta do
  web fixada em 5180 (strictPort); typecheck desacoplado do build de produção
  (`build` = vite, `build:check` = tsc+vite); env schema tolera `NODE_ENV`/`PORT`
  vazios (Railway injeta `""`); `engines.node >=20` (Fastify 5).
- **10 jul 2026** — **Performance: metade das idas ao banco por request**. Diagnóstico: rota sem
  banco responde em 4ms, mas cada endpoint autenticado levava 450–680ms — tudo em queries ao Supabase.
  Causa: `getOverview` (roda em toda rota) fazia **4 idas ao banco em série** — `assertMembership`
  (empresa + vínculo) + `findCompanyById` **duplicado** + `listMembers`. Correção em
  `company.service.ts`: `getOverview` e `listMembers` agora buscam empresa + sócios **em paralelo**
  (`Promise.all`) e checam a permissão na **própria lista de sócios** (equivale a `findMemberByUserId`,
  confirmado nos repos) — sem query de auth extra nem busca duplicada; `assertMembership` também
  paraleliza as 2 queries. Medido: `/members` 450→247ms, `/partner-leads` 676→350ms, `/activities`
  687→348ms (~45–49% mais rápido em toda tela). Semântica de auth inalterada (87 testes verdes). O
  cache de GET (30s) já deixava navegação repetida instantânea (15ms); isso ataca a **primeira** carga.
- **9 jul 2026** — **Custo recorrente: frequência "Única vez"**: nova opção `once` no enum de
  frequência (`recurringFrequencyCatalog`) para pagamentos únicos. `monthlyEquivalentCents('once') = 0`
  → não entra no custo mensal nem na projeção. Coluna `frequency` é texto livre, **sem migração**.
  UI adapta os textos: no form o rótulo vira "Data do pagamento" + hint explicando que não entra no
  mensal, botão "Salvar pagamento único", sucesso próprio; na lista/detalhe de Movimentações o badge
  vira "Única vez" e o impacto "pagamento único"; o card "custos ativos por mês" exclui os `once` da
  contagem. Teste unitário added (87 no total).
- **9 jul 2026** — **Atividades: visão por sócio (substitui o Kanban)**: a pedido, o board de
  colunas deu lugar a uma **lista agrupada por sócio** — cada sócio (+ grupo "Sem responsável") é
  uma seção com avatar, contagem e uma **tabela: Atividade · Início · Prazo · Status** (status como
  badge colorido). Mobile-first: no mobile a tabela vira cartões empilhados (rótulo via
  `data-label`/`::before`); ≥641px vira grid com cabeçalho. Novo campo **`start_date`** na atividade
  (migração `0016_atividade_inicio.sql`) — data de início editável no formulário/detalhe, ao lado do
  prazo, com validação início ≤ prazo. Removido o código morto do kanban (colunas, colapso, card,
  select inline). Backend: `startDate` em shared/domain/service/repos. 86 testes verdes.
- **8 jul 2026** — **Atividades: UI mobile first [princípio novo, obrigatório]**: a partir de agora
  todo módulo nasce mobile first (breakpoints: mobile ≤640px, tablet 641–1024px, desktop >1024px).
  `activities.css` reescrito com base = mobile: **kanban vira lista agrupada por status** com grupos
  **colapsáveis** (vazios nascem fechados; chevron some ≥641px e o colapso é ignorado), header
  empilhado com botão "Nova atividade" full width, plano da semana compacto (badges quebram linha),
  áreas de toque ≥44px (select de status, toggles, botões), `:focus-visible` em tudo, padding de
  página no padrão `.dash`/`.fin` (a tela estava sem respiro lateral). Tablet = 2 colunas; desktop
  = kanban de 4 (min 220px/coluna). Sem mudança de lógica; sem scroll horizontal em nenhum breakpoint
  (verificado em 375/768/1280). Zero paleta nova — só tokens existentes.
- **8 jul 2026** — **Módulo Atividades [jornada nova]**: Kanban leve + **plano da semana**
  (segunda→domingo) para organizar o que cada sócio precisa fazer. **Não impacta finanças**
  (RP006). Backend: tabelas `activities` + `activity_checklist_items` (migration
  **`0015_atividades.sql`**, com RLS via `is_company_member`), `ActivityService`/`ActivityRepository`
  (in-memory + Supabase), rotas CRUD + `/status` + `/checklist` em
  `activity.routes.ts`, cálculo de `weekStartDate` (segunda) e derivação de **`isOverdue`** (RP003),
  timestamps `completed_at`/`cancelled_at` (RP004/RP005). Contrato em `packages/shared/src/contracts/activity.ts`
  (área/prioridade/status + catálogos; `CreateActivityInput` usa `z.input`). **+11 testes (86 no total)**.
  Front: rota `/atividades` + item de menu **Atividades**, board com colunas A fazer/Em andamento/
  Bloqueado/Concluído (cancelado fora), card com responsável/área/prazo/prioridade/badge de atraso +
  `<select>` "mover", modal **Nova atividade** (com checklist) e **detalhe** (checklist interativo,
  botões de status, motivo de bloqueio via prompt). **Home**: bloco **"Atividades da semana"**
  (resumo/empty) — carga resiliente (`.catch(()=>[])` p/ não derrubar a Home). **Pendências**:
  atrasadas (alta), sem plano na semana (média), sem responsável (média). ⚠️ Requer rodar migration
  `0015` no Supabase (sem ela, a página mostra erro e a Home usa fallback vazio).
- **8 jul 2026** — **Contas a pagar (vencimento) [jornada nova]**: a despesa agora tem
  **situação** `paid` / `unpaid`. "A pagar" exige **data de vencimento** e vira um lembrete —
  **NÃO entra** no total gasto/acertos/projeção até ser **marcada como paga** (`POST
  /companies/:id/expenses/:expenseId/pay`). Backend: colunas `payment_status` + `due_date`
  em `expenses` (migration **`0014_contas_a_pagar.sql`**), `getBalances` filtra `payment_status =
  'paid'`, `payExpense()` no serviço (barra pagar 2×), +4 testes (**76** no total). Front:
  wizard com toggle **Já paga / A pagar** e campo Vencimento; Movimentações com card **"A vencer"**,
  filtro **"A pagar"**, badges **A pagar / Vencida** e uma **seção de alerta fixa** no topo listando
  as contas a pagar com botão **"Marcar como paga"** inline (`apps/web/src/finance/due.ts` classifica
  vencidas/a vencer); na **Home**, alerta dedicado (`dash-recommend--warn`) para **vencidas** e
  **a vencer em 7 dias**, com link pro filtro. (As pendências genéricas não duplicam esse alerta.)
  ⚠️ Requer rodar migrations `0013` e `0014` no Supabase (ainda faltavam no banco).
- **6 jul 2026** — **Navegação mais rápida (cache de leitura no `apiFetch`)**: GETs agora usam
  cache com TTL de 30s + deduplicação de requisições simultâneas; mutações (POST/PATCH/DELETE)
  em `/companies/:id` **invalidam automaticamente** o cache daquela empresa (sem dado velho);
  logout chama `clearApiCache()` (não vaza entre contas). Medido: Home→Movimentações caiu de
  **6 requisições / ~855ms (waterfall serial companies→resto)** para **0 requisições / render
  instantâneo** com cache quente. Invalidação testada e2e: aporte novo apareceu na hora (8→9).
  Sem mudar nenhuma página — o cache é transparente na camada HTTP.
- **6 jul 2026** — **Detalhe da movimentação — refino (PRD)**: adicionada a linha **"Participou
  da projeção mensal?"** no impacto financeiro (despesa: sim/média de gastos; aporte: não;
  recorrente: sim se ativo) e uma seção **"Divisão entre sócios"** para despesa compartilhada —
  lista cada sócio com "cabe R$ X", destaca **quem pagou** (badge), e a frase orientadora "Essa
  despesa foi paga por X, mas parte dela cabia a Y. Por isso, ela entrou no cálculo de acertos".
  O resto (cabeçalho, resumo por tipo, dados, acerto relacionado + link, ações Editar/Cancelar
  preparadas) já existia. Verificado no preview: 3 seções, projeção "Sim", divisão teste(pagou)/
  Sócio Demo + frase.
- **6 jul 2026** — **Jornada de Projeção financeira** (Movimentações). O gráfico ganhou:
  **título "Evolução dos gastos"** + subtítulo, **legenda Real × Projeção** (swatch tracejado),
  **fórmula explicada** ("média dos meses com registro + R$ X de custos recorrentes ativos"),
  **nota adaptativa/cautelosa** (poucos dados → "projeção ainda é inicial"; só recorrentes / só
  despesas → textos específicos do PRD §8) e um bloco **"Como funciona a projeção?"**. Regras:
  despesas + custos recorrentes ATIVOS entram; aportes/acertos/recorrentes inativos não entram
  (no filtro Aportes o gráfico vira "Aportes por mês" sem projeção nem bloco). Estado vazio:
  "Sem dados suficientes para projetar". Tudo determinístico (R$0 de IA). Verificado no preview
  nos modos Todos e Aportes.
- **6 jul 2026** — **Linha de movimentação redesenhada** (estava "tudo junto" num texto corrido):
  agora cada item tem **ícone colorido por tipo** (despesa indigo/carteira · aporte verde/seta ·
  recorrente âmbar/repeat — bate o olho e reconhece), **badge do tipo** ao lado do nome, meta
  enxuto (frequência ou data · quem pagou) e o **impacto colorido à direita** ("no custo mensal"
  verde · "gerou acerto" rose · "sem acerto"/"não é gasto" neutro). Frequência (Mensal/Anual)
  fica clara na meta. Verificado no preview: 3 tipos com ícones/impactos corretos.
- **6 jul 2026** — **Navegação de sócios unificada em `/socios`**: card Sociedade da Home agora é
  clicável (StatCard ganhou `onClick`) → `/socios`; quick action "Adicionar sócio" → `/socios?add=1`
  (SociedadePage lê o query e já abre o modal, limpando o param); pendências de sociedade
  (equity-invalid/incomplete/no-partners) e o painel de sócios em Dados da empresa apontam pra
  `/socios`. Onboarding fica **só para primeiro cadastro** (empty state "Configurar empresa",
  "Continuar configuração", HomeRedirect permanecem). Verificado e2e: card → /socios, quick action
  → /socios com modal aberto.
- **6 jul 2026** — **Módulo Sociedade** (`/socios` deixou de ser placeholder →
  `pages/SociedadePage.tsx`). Backend: `updateMember` completo (nome/e-mail/papel funcional/
  participação/observação) — contrato `updateMemberSchema`, `MemberUpdate` no domínio, impls
  memory+supabase, serviço com validação de soma ≤100% e e-mail único, rota PATCH members
  agora aceita edição completa (compat com equityPercent). Tela (PRD): cabeçalho orientador,
  4 cards de resumo (sócios · definida · pendente · **status** completa/incompleta/inválida),
  **barra de progresso**, bloco "Por que isso importa?", lista de sócios com avatar/papel/
  participação e **Editar**, modal Adicionar/Editar (nome oblig., e-mail/papel/% opcionais,
  observação; owner com nota de que system_role não muda), bloco "sozinho" (Definir 100%/
  Adicionar/Decidir depois), pendências da sociedade (incompleta/só-owner/sem-participação).
  Sem exclusão destrutiva. Papel funcional × system_role separados. 67 testes. Verificado e2e:
  edição salva e recalcula status/barra/pendências; soma >100% barrada pelo backend com aviso.
- **6 jul 2026** — **Detalhe da movimentação reestruturado** (PRD): modal com (1) cabeçalho
  (badge de tipo + status + descrição + valor grande + data), (2) **bloco de impacto humano**
  colorido por tipo com as 2 frases do PRD, (3) dados financeiros (valor/moeda/data/quem
  pagou/categoria/divisão + entrou no total gasto? / entra no custo mensal? / gerou acerto?),
  (4) **acerto relacionado** — para despesa que gerou acerto lista "X deve Y para Z" + nota de
  que o consolidado está em Acertos + link "Ver acertos"; senão explica que não gerou, (5) ações
  Editar/Cancelar **preparadas visualmente** (disabled, "em breve" — cancelamento será por status,
  nunca delete) + Fechar funcional. Verificado no preview: despesa (acerto + link navegando),
  aporte (separado, sem acerto), custo recorrente (impacto no custo mensal).
- **6 jul 2026** — **Gráfico de evolução mensal na Central de Movimentações**
  (`finance/FinChart.tsx`, CSS puro — sem lib nova): 5 meses passados + mês atual em destaque +
  **projeção do próximo mês** (barra tracejada). Projeção determinística e EXPLICADA na legenda:
  média dos meses com registro + custos recorrentes ativos (R$0 de IA). O gráfico muda com o
  filtro: Todos/Despesas = gastos por mês com projeção; Aportes = aportes por mês (sem projeção);
  Recorrentes = sem gráfico. Mobile: valores só no mês atual e na projeção. Verificado no preview
  (jul 445 · ago* 745 = 444,90 + 300 de recorrentes; troca dinâmica no filtro Aportes).
- **6 jul 2026** — **Observação em despesas e aportes** (migration `0011`, `expenses += note`).
  Campo `note` opcional (máx. 300) em `createExpenseSchema`/`createContributionSchema`/`Expense`;
  wizard ganhou textarea "Observação (opcional)" no passo de dados (placeholder contextual por
  tipo), exibida na revisão só se preenchida; Central de Movimentações mostra a observação no
  detalhe quando existe. Testado e2e: despesa "Renovação do domínio" com observação → apareceu
  na revisão e no detalhe salvo.
- **6 jul 2026** — **Central de Movimentações** (reescrita da `/financeiro`): cabeçalho com
  botão "Adicionar movimentação" (abre o mesmo wizard da Home); **4 cards de resumo** (Total
  gasto — só despesas · Aportes registrados · Custos recorrentes ativos · Movimentações do mês);
  **filtros** (Todos · Despesas · Aportes · Custos recorrentes · Este mês); **lista unificada**
  com badges por tipo (Despesa indigo · Aporte verde · Recorrente âmbar) e meta explicativo
  ("gerou acerto" / "não gera acerto automático" / "entra no custo mensal"); **modal de detalhe**
  com "Entrou no total gasto?", "Gerou acerto?", rateio e explicação contextual por tipo; estado
  vazio orientador. O form inline antigo (ExpenseForm) foi removido — o wizard é o caminho único.
  A seção "Como cada sócio está" saiu da tela (vive em Acertos). Verificado no preview: cards,
  filtro Aportes, detalhe de aporte e de despesa, wizard abrindo.
- **6 jul 2026** — **Etapa "Sócios e participação" mais guiada** (PRD de 8 ajustes): subtítulo
  acolhedor ("pode completar depois"); total virou **"Participação definida: X%"** com **barra de
  progresso** (verde ao completar) + "Ainda falta distribuir: Y%"; **bloco "Você está sozinho por
  enquanto?"** quando só há o dono com 0% (Definir 100% para mim · Adicionar sócio · Decidir
  depois); intro humana antes do formulário; hint no campo % ("deixe em branco e complete
  depois"); bloco discreto **"Por que isso importa?"**; botão "Concluir" → **"Salvar e continuar"**.
  Regras inalteradas (soma ≤100 no backend; <100 permite seguir e vira pendência na Home).
  Verificado no preview: barra parcial 50% e completa 100% (verde).
- **3 jul 2026** — **Jornada 4: Acertos com pagamento** (migration `0010`, `settlement_payments`).
  Arquitetura: acertos seguem **derivados** (nunca desatualizam); o que persiste é o **pagamento**.
  Saldo = pagou − deve + pagamentos enviados − recebidos; parcial reduz, total quita, overpay é
  barrado (SETTLEMENT_OVERPAY). Rotas POST/GET `/companies/:id/settlement-payments` (5 testes
  novos, 67 total). Tela: status chips (Pendente/Parcialmente pago/Pago), "Ver detalhes" (valor
  original · já pago · saldo · explicação humana · movimentações que geram o acerto), modal
  "Registrar pagamento" (valor pré-preenchido, data, forma Pix/Transf/Dinheiro/Outro, observação)
  com aviso vivo parcial×quitação; seção "Pagamentos registrados" (histórico); estado vazio
  "Tudo certo entre os sócios". Testado e2e: parcial R$40 → chip parcial → quitação R$60 →
  histórico com 2 pagamentos → Home card "Acertos R$ 0,00". Comprovante (upload) fica p/ quando
  houver storage.
- **3 jul 2026** — **Jornada 3: Custo recorrente** (migration `0009`, tabela `recurring_costs`).
  Backend: `RecurringService` com **equivalente mensal no backend** (anual÷12, semanal×52÷12,
  trimestral÷3; "outro"=mensal), total só de ATIVOS; rotas POST/GET/PATCH
  `/companies/:id/recurring-costs` (7 testes novos, 62 total). Front: `RecurringCostForm`
  guiado (categoria, frequência, quem paga, próxima cobrança, observação) com **prévia viva**
  do equivalente mensal e **estado de sucesso** ("Ver dashboard" / "Adicionar outro custo").
  Entradas: card "Custo mensal" (saiu o "em breve") e o tipo no wizard de movimentação.
  Home: card mostra o total real + nº de ativos; nova seção **"Custos mensais"** com
  **desativar/reativar** (inativo sai da estimativa na hora); pendência 4.4 "Mapeie seus
  custos mensais" entra no motor e some sozinha ao cadastrar. Testado e2e: Adobe R$140
  mensal + Domínio R$120 anual → card R$150; desativar Adobe → R$10.
- **3 jul 2026** — **Jornada 2: Adicionar movimentação (wizard guiado)**. O modal da Home
  virou o **MovementWizard** (4 passos: tipo → dados → pessoas/divisão → revisão), cada tipo
  explicando **como afeta os cálculos**. Tipos: **Despesa** (funcional) e **Aporte** (novo,
  funcional) — Custo recorrente/Empréstimo/Reembolso visíveis como "em breve". **Aporte**
  (migration `0008`: expenses += kind): dinheiro que sócio coloca no negócio — **não divide
  entre sócios e não soma como gasto (RB002)**; endpoint `POST /companies/:id/contributions`;
  saldos/acertos filtram kind=expense (3 testes novos, 55 total). Home: card "Gasto" ignora
  aportes; linhas de movimentação ganham badge **Despesa/Aporte** (verde). ExpenseForm segue
  na página Movimentações.
- **3 jul 2026** — **Jornada 1: Pendências inteligentes na Home** (PRD). Novo motor
  `pages/pendencias.ts`: gera pendências na ordem de prioridade do PRD §6 (sociedade
  inválida/incompleta → 1ª movimentação → formalização → natureza jurídica → sócios →
  descrição → contato), cada uma com **título + descrição + motivo + ação principal +
  ação secundária + prioridade** (crítica/alta/média/baixa). Home ganhou o card
  **"Próximo passo recomendado"** (um por vez, o mais prioritário) e o painel de pendências
  mostra o motivo + **"Fazer depois"** (esconde temporariamente via localStorage
  `dismissed_until` — 7 dias; "Estou sozinho por enquanto" = 30 dias; estrutura pronta p/
  migrar ao banco). Sociedade >100% vira pendência **crítica**. Testado: 5 pendências
  corretas na conta de teste, dismiss muda o recomendado na hora e persiste após reload.
  Custo mensal fica de fora até a jornada de recorrências existir (sem beco sem saída).
- **3 jul 2026** — **Fluxo inicial (PRD) — Fase B (onboarding guiado)**: enum `onboardingStep`
  expandido; o fluxo virou **welcome → resume → básico → tipo de negócio → local → estágio →
  sócios → formalização → natureza jurídica → revisão** (8 dots). Novos passos:
  **BusinessTypeStep** (cards `business_model_type`), **FormalizationStep** (`has_formal_registration`
  + CNPJ condicional com validação), **LegalStructureStep** (chips do PRD + "Preciso falar com um
  contador" → `legal_structure_status`), e **ResumePrompt** ("Quer continuar de onde parou?" →
  Continuar cadastro · Ir para a Home). Cada passo salva incremental (save/resume) e permite pular.
  Revisão mostra os campos novos. Testado ponta a ponta: criou "Startup Teste" e persistiu
  business_model_type=technology, stage=validating, has_formal_registration=yes, legal_structure=ltda,
  status=completed. 52 testes, typecheck limpo.
- **2 jul 2026** — **Fluxo inicial (PRD) — Fase A (fundação)**: migration `0007` —
  companies ganha `business_model_type`, `has_formal_registration`, `registration_country`,
  `legal_structure_status`; renomeia `cnpj → registration_number` e `legal_type → legal_structure`
  (valores PRD: mei/me/simples/ltda/slu/other/unknown); estágio `structuring → validating`.
  **Conteúdo configurável**: tabela `guide_contents` (+seed) — textos de MEI/impostos saem do
  código (PRD §20); drawer "Tipos de empresa" agora busca `GET /guides/legal_structure`.
  **Parceiros**: tabelas `partner_categories`/`partners` (estrutura futura) + `partner_leads`;
  o botão "Quero indicação de um contador" agora **grava lead de verdade**
  (`POST /companies/:id/partner-leads`) e persiste entre visitas. Catálogos novos no shared
  (tipo de negócio, formalização, natureza jurídica) prontos para a Fase B (telas do onboarding).
- **2 jul 2026** — **Princípio "jornada guiada" adotado** (seção 1.1) e aplicado nas 4 telas:
  Home ganhou **"Próximo passo:"** dinâmico no subtítulo (participação → 1º gasto → acertos),
  cards com mensagem de impacto e nota de origem nos acertos; **Movimentações** (novo título)
  explica o que o Plim faz com cada gasto e o que é "pagou × cabe"; **Acertos** explica o
  cálculo e avisa que "marcar como pago" está chegando; **Dados da empresa** — campos vazios
  orientam em vez de "—" (CNPJ, natureza jurídica, telefone, e-mail) e subtítulo diz o porquê.
- **1 jul 2026** — Criado o documento. Fase 1 concluída; Fase 2 (financeiro) com
  fundação pronta (rateio + serviço + testes); paleta Indigo adotada; Figma MCP conectado.
- **1 jul 2026** — **App shell (menu lateral)**: home virou hub. Dashboard passou a
  viver dentro do menu (Painel · Finanças · Sócios · Jornada); Finanças/Sócios/Jornada
  com placeholder "em breve" até serem construídas.
- **1 jul 2026** — **Finanças completo**: migration `0004` aplicada, tela `/financeiro`
  no ar (despesa → rateio → saldos), testado de ponta a ponta (R$ 1.000 dividido 80/20
  → saldos +200/−200, soma zero). Finanças saiu do "em breve" no menu.
- **1 jul 2026** — **Home financeira (Mosaic)** conforme PRD do dashboard: cabeçalho
  com % de config, 4 cards (total gasto · custo mensal · acertos · sociedade), ações
  rápidas, **modal "Adicionar movimentação"**, últimas movimentações e pendências.
  Novo **acerto líquido** (`settlements.ts`, RB006, 6 testes) — "Charlie paga R$271
  para Rafaelle". Menu virou **Home · Sociedade · Movimentações · Acertos · Configurações**;
  o checklist "empresa 100%" saiu do painel e foi para **Configurações**. Ícones SVG no
  lugar de emojis. **Custo mensal** entra como stub (precisa tabela nova). 52 testes.
- **2 jul 2026** — **Edição inline em "Dados da empresa"**: o botão Editar abre um formulário
  na própria página (nome, descrição, estágio, país, cidade, moeda) que salva via
  `PATCH /companies/:id` e persiste, sem voltar ao onboarding. O onboarding segue só para o
  primeiro acesso.
- **2 jul 2026** — **CNPJ + endereço da empresa**: migration `0005` (companies += cnpj, cep,
  street, street_number, complement, neighborhood). Validador `isValidCnpj` (dígito verificador)
  + `formatCnpj`/`formatCep` no shared; `updateCompanySchema` normaliza CNPJ p/ dígitos e valida
  (regra no backend). Formulário inline ganhou CNPJ (com máscara) e o bloco Endereço. Testado:
  salvou/persistiu (CNPJ guardado só em dígitos, exibido formatado) e CNPJ inválido é barrado.
  **Falta (item 2)**: CPF do sócio + edição de sócios nessa tela.
- **2 jul 2026** — **Estado de erro do painel com retry**: fetch da Home extraído em
  `load` (useCallback); quando a API oscila, mostra o bloco `DashError` (ícone âmbar +
  "Tentar de novo") que refaz a busca sem recarregar a página. Testado derrubando/subindo
  a API. `.dash-quick` fixado em 3 colunas.
- **2 jul 2026** — **Menu hambúrguer no mobile**: abaixo de 720px a barra lateral vira um
  **drawer** que desliza da esquerda (com backdrop desfocado, botão X e fecha ao navegar);
  no topo, barra fixa com o hambúrguer + logo. Desktop mantém a barra lateral fixa.
- **2 jul 2026** — **Passo de UI/responsividade**: campos maiores (inputs/select 16px,
  min 48px — sem zoom no iOS, bons alvos de toque); formulário de movimentação em **coluna
  única** (deixa de ficar espremido); **modal vira bottom sheet no mobile**; cabeçalho da
  Home empilha (título + navegador de mês em linhas separadas); cards viram linha no mobile;
  menu lateral no mobile achata o grupo "Empresa" em **pills inline** (Home · Dados da empresa
  · Sócios · Movimentações · Acertos). Verificado em 375px e desktop.
- **2 jul 2026** — **Filtro de mês na Home**: navegador ‹ mês › + "Tudo"; card "Gasto em
  [mês]" e "Últimas movimentações ([mês])" filtram pelo período (acertos/sociedade seguem
  acumulados). Card "Custo mensal" virou CTA "+ cadastrar" (em breve); ações rápidas reduzidas
  a 3; seção "Custos mensais" saiu; saudação "olá, Rafaelle" no topo. `npm run dev` único na
  raiz (concurrently) sobe web+api juntos. Rota `/` amigável na API.
- **2 jul 2026** — **Reorganização do menu** (IA): banner "Agência Aurora" saiu da Home
  (agora abre em "Visão geral", só financeiro). Menu virou **Home · Empresa (▸ Dados da
  empresa · Sócios) · Movimentações · Acertos** com submenu expansível no `AppShell`.
  Rota `/configuracoes` → `/empresa/dados`. **Pendente:** tornar "Dados da empresa"
  editável e adicionar campos **CNPJ, endereço** (empresa) e **CPF** (sócios) — precisa
  migração + contratos + form de edição.
