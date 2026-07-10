# Plim — Fase 2: Financeiro (dashboard financeiro inicial)

> Versão 0.1 — 30 jun 2026 (documento vivo)
> Regra de ouro: **dinheiro em centavos inteiros; todo cálculo no backend; o
> front só apresenta.** A moeda é a da empresa (`currency_code`).

## 1. Objetivo
Permitir que a empresa registre **gastos iniciais e custos mensais**, **aportes**
dos sócios, e veja **quanto cada sócio deve a quem** (rateio + acertos) — tudo na
moeda da empresa. É a base do "sistema de gestão para sócios em fase inicial".

Fora de escopo por enquanto: gráficos avançados, relatórios, cobrança/assinatura,
integração bancária, documentos.

## 2. Princípios inegociáveis (dinheiro)
- **Centavos inteiros.** Todo valor é `amount_cents: integer`. Nunca float. Formatação
  (R$ 1.234,56) é só apresentação, no front.
- **Rateio soma exato.** A soma das partes de uma despesa **é igual ao total** —
  os centavos de arredondamento são distribuídos (método do maior resto), sem
  "sumir" nem "sobrar" 1 centavo.
- **Cálculo no serviço.** Rateio, saldos e acertos vivem no `FinanceService`
  (testável). O LLM nunca calcula dinheiro — no máximo comenta o resultado.

## 3. Módulos (ordem de construção)
1. **Despesas + rateio** — registrar despesa e dividir entre sócios.
2. **Aportes** — contribuições de cada sócio ao caixa.
3. **Saldos por sócio** — pagou × devia.
4. **Acertos** — sugestão de quem paga quem para zerar.
5. **Painel financeiro** — caixa, despesas do mês, saldos.

## 4. Modelo de dados
```
expenses
  id, company_id, description, amount_cents (int), currency_code,
  paid_by_member_id (quem pagou), spent_on (date),
  split_mode ('equity' | 'equal' | 'custom'), created_by, created_at

expense_shares   (parte de cada sócio numa despesa)
  id, expense_id, member_id, share_cents (int)

contributions (aportes)   [módulo 2]
  id, company_id, member_id, amount_cents, currency_code, contributed_on, created_at
```
- `spent_on`/valores por empresa; **RLS** como 2ª defesa (só membros leem; API escreve).
- `split_mode`:
  - **equity** (padrão): proporcional à participação de cada sócio.
  - **equal**: dividido igualmente entre os sócios.
  - **custom**: partes explícitas informadas (somam o total).

## 5. Rateio (o motor)
Função pura `computeSplit(amountCents, weights[]) → shares[]`:
- calcula `share_i = round(amount * peso_i / somaPesos)`;
- **corrige o resto**: distribui os centavos que faltam/sobram para os maiores
  restos, garantindo `Σ shares = amountCents`.
- `equity` → pesos = participação de cada sócio (normalizada);
- `equal` → pesos iguais;
- `custom` → as partes vêm prontas (o serviço só valida que somam o total).

## 6. Saldos e acertos
- **Saldo do sócio** = `Σ (o que ele pagou) − Σ (a parte dele nas despesas)` (em centavos).
  Positivo → tem a receber; negativo → deve.
- **Acertos** = a partir dos saldos, sugerir transferências (quem deve → quem tem
  a receber) que zeram todo mundo com o menor número de transações.

## 7. Arquitetura (mesmo padrão em camadas)
```
apps/api/src/
├── domain/finance.ts              Expense, ExpenseShare, Contribution
├── services/finance.service.ts    ★ regras: rateio, saldos, acertos
├── repositories/
│   ├── finance.repository.ts      interface
│   ├── in-memory/finance.repository.memory.ts
│   └── supabase/finance.repository.supabase.ts
└── http/routes/finance.routes.ts  GET/POST despesas, aportes, saldos
packages/shared/src/contracts/finance.ts   schemas Zod + tipos
```
Autorização reaproveita `CompanyService.getOverview` (ser membro). Migration
`supabase/migrations/0004_finance.sql` cria as tabelas + RLS.

## 8. Front
- `financeApi` (cliente) → despesas, aportes, saldos.
- Página `/financeiro` (ou seção no dashboard) com: registrar despesa (valor
  formatado na moeda), lista de despesas com o rateio, saldos por sócio.
- Dinheiro exibido em `JetBrains Mono` com as cores semânticas (verde = a receber,
  coral/âmbar = a pagar).

## 9. Custo
Núcleo determinístico = **R$ 0** (sem IA). A "leitura do copiloto" sobre o
financeiro (ex.: "70% das despesas do mês são de um sócio só") é opcional e
entra na trilha da inteligência, com o custo já documentado em `INTELIGENCIA.md`.

## 10. Decisões em aberto
1. **Onde mora o financeiro no front:** página dedicada `/financeiro` (recomendado)
   ou uma aba/seção do dashboard.
2. **Categorias de despesa:** livre agora, catálogo depois?
3. **Aportes vs despesas pagas:** tratar aporte (dinheiro no caixa) separado de
   "sócio pagou uma despesa" (já cobre parte da conta). O modelo acima separa os dois.

> Próximo passo: implementar o **motor de rateio** (`computeSplit`) + contrato de
> despesa + `FinanceService` com testes (centavos exatos), antes de banco/rotas/front.
