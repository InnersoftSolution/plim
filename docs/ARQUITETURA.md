# Plim — Arquitetura do Sistema

> Versão 1.0 — 12 jun 2026
> Regra de ouro: **toda regra de negócio vive no backend. O front-end nunca decide nada — só apresenta.**

## 1. Visão geral

O Plim é um monorepo com três pacotes:

```
Plim/
├── apps/
│   ├── web/        → Front-end (React 19 + TypeScript + Vite)
│   └── api/        → Backend (Node + TypeScript + Fastify)
├── packages/
│   └── shared/     → Contratos compartilhados (schemas Zod, tipos)
└── docs/           → Análise, arquitetura, decisões
```

```
┌─────────────────────────────┐
│  apps/web (front-end)       │  React 19 + Vite
│  - telas, formulários, UX   │  ✗ NUNCA: regra de negócio,
│  - validação de FORMATO     │    cálculo de rateio, autorização
└──────────────┬──────────────┘
               │ HTTPS / JSON — contratos do packages/shared
┌──────────────▼──────────────┐
│  apps/api (backend)         │  Fastify + Zod
│  ┌───────────────────────┐  │
│  │ http/ (rotas)         │  │  contrato HTTP, auth, validação Zod
│  ├───────────────────────┤  │
│  │ services/ (serviços)  │  │  ★ TODAS as regras de negócio
│  ├───────────────────────┤  │
│  │ repositories/         │  │  acesso a dados, transações
│  └───────────────────────┘  │
└──────────────┬──────────────┘
               │
┌──────────────▼──────────────┐
│  PostgreSQL (via Supabase)  │  migrations versionadas + RLS
│  Storage (comprovantes)     │  como defesa em profundidade
└─────────────────────────────┘
```

## 2. As camadas do backend

A API segue **rotas → serviços → repositórios**. A dependência aponta sempre para baixo; nenhuma camada inferior conhece a superior.

### 2.1 `http/` — Rotas (controllers)
- Define os endpoints e o contrato HTTP (status codes, formato de resposta).
- Valida **entrada** com schemas Zod (do `packages/shared`).
- Autentica o usuário e extrai o contexto (quem é, de qual empresa).
- **Não contém regra de negócio.** Apenas traduz HTTP ↔ serviço.

### 2.2 `services/` — Serviços (regras de negócio) ★
É aqui que mora o Plim de verdade. Exemplos de regras que SÓ existem aqui:
- Soma dos percentuais societários de uma empresa não pode passar de 100%.
- A soma dos splits de uma despesa deve ser igual ao valor da despesa.
- Rateio padrão segue o % da sociedade; rateio personalizado é validado.
- Saldo entre sócios é sempre calculado no servidor — nunca confiado do cliente.
- Apenas `account_owner` altera percentuais; toda alteração gera auditoria.
- Valores monetários em **centavos (inteiros)** — nunca float.

Serviços são funções/classes puras e testáveis: recebem dados + repositórios, devolvem resultado ou lançam `DomainError`.

### 2.3 `repositories/` — Repositórios (dados)
- Única camada que conhece o banco. SQL/queries ficam aqui.
- Cada repositório tem uma **interface**; a implementação real (Postgres) e a de teste (in-memory) são intercambiáveis — é assim que testamos serviços sem banco.

### 2.4 `domain/` — Entidades e tipos do domínio
Tipos puros (Company, Member, Expense…) e invariantes simples. Sem dependência de framework.

## 3. O papel do front-end

O `apps/web` é deliberadamente "burro":
- Renderiza telas com os componentes do design system (Figma → tokens CSS).
- Valida **formato** nos formulários (e-mail válido, campo obrigatório) — só para UX. O backend revalida tudo.
- Chama a API e exibe o que ela responder. Nunca calcula rateio, saldo ou permissão localmente.
- Se o front "souber" uma regra (ex.: esconder um botão), isso é cortesia visual — a API nega a operação de qualquer forma.

## 4. Contratos compartilhados (`packages/shared`)

Schemas Zod definem o contrato de cada endpoint **uma única vez** e são usados:
- no backend, para validar a entrada de verdade;
- no front, para tipar requisições/respostas e validar formato nos formulários.

Isso elimina divergência entre o que o front envia e o que a API espera.

## 5. Segurança

| Tema | Regra |
|---|---|
| Autenticação | Supabase Auth (e-mail/senha + Google). A API valida o JWT em toda requisição. |
| Autorização | Multi-tenant por linha: todo recurso pertence a uma empresa; toda query filtra pela associação do usuário (`company_members`). Checada no **serviço**, não no front. |
| Secrets | Apenas no servidor (`.env` da API). No front, somente chaves públicas (`VITE_*`). |
| RLS | Policies no Postgres como **segunda** linha de defesa — a primeira é a API. |
| Senhas/tokens | Hash forte via Supabase; sessão em cookie httpOnly ou bearer token de curta duração. |
| Rate limiting | Nos endpoints de auth e convites. |
| Auditoria | Alterações societárias e financeiras geram registro imutável (`audit_log`). |
| LGPD | Dados mínimos, consentimento no cadastro, exclusão de conta. |

## 6. Banco de dados

- PostgreSQL (provisionado via Supabase).
- **Migrations versionadas** no repositório (`apps/api/migrations/`) — o schema do banco é código revisável.
- Dinheiro: colunas `*_cents` inteiras. Percentuais: `numeric(5,2)`.
- Tabelas principais: `profiles`, `companies`, `company_members`, `company_invites`, `journey_steps`, `expenses`, `expense_splits`, `settlements`, `audit_log`, `business_models`.

## 7. Testes e qualidade

| Camada | Tipo de teste | Ferramenta |
|---|---|---|
| services/ | unidade (regras de negócio, sem banco — repositório in-memory) | Vitest |
| http/ | integração (endpoint completo) | Vitest + injeção do Fastify |
| web/ | componente (telas críticas) | Vitest + Testing Library |

Regras: nenhuma regra de negócio entra sem teste de unidade. `npm run typecheck` e `npm test` devem passar antes de qualquer entrega.

## 8. Convenções

- Código e identificadores em **inglês**; documentação e textos de UI em **português**.
- TypeScript estrito (`strict: true`) em todos os pacotes.
- Erros de domínio: classe `DomainError` com `code` estável (ex.: `EQUITY_SUM_EXCEEDED`) — a rota traduz para HTTP (422, 403…); o front traduz para mensagem amigável.
- API REST com JSON; rotas no plural (`/companies/:id/members`).
- Commits pequenos com mensagem no imperativo.

## 9. Como rodar

```bash
npm install            # instala tudo (workspaces)
npm run dev:api        # API em http://localhost:3333
npm run dev:web        # Web em http://localhost:5173
npm test               # todos os testes
npm run typecheck      # checagem de tipos
```

## 10. Evolução prevista

1. **Fase atual** — fundação: estrutura, contratos, serviço de empresa/sócios com regras de equity (repositório in-memory).
2. Supabase real: Postgres + migrations + Auth (e-mail/Google) + Storage.
3. Módulo financeiro: despesas, rateio, saldos, limites de aporte.
4. Jornada guiada e catálogo de modelos de negócio.
5. App mobile consumindo a mesma API.
