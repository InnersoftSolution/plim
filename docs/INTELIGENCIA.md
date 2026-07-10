# Plim — Núcleo Inteligente (Copiloto do Fundador)

> Versão 0.1 — 14 jun 2026 (proposta / documento vivo)
> Regra de ouro herdada: **toda regra vive no backend.** Aqui ela ganha um par:
> **o LLM raciocina e aconselha; o código calcula e decide.**

## 1. A ideia

O que diferencia o Plim de "mais um sistema de cadastro" é ser um **copiloto
estratégico** para quem está montando uma empresa. Depois que o fundador entra os
dados (sócios, participações, modelo de negócio, despesas, jornada), o Plim não só
*mostra* — ele **interpreta, sugere o próximo passo e responde perguntas de
estratégia** com base na situação real daquela empresa.

Exemplos do que o copiloto entrega:

- **Diagnóstico da sociedade:** "Vocês têm 100% alocado, mas 2 sócios sem vesting
  definido — isso costuma virar problema na primeira rodada."
- **Próximo passo da jornada:** "Sua marca ainda não foi verificada no INPI.
  Antes de imprimir cartão, vale checar — leva 5 min."
- **Leitura financeira:** "70% das despesas deste mês são de um sócio só; o
  rateio por equity diz que ele deveria arcar com 40%. Quer registrar um acerto?"
- **Estratégia por modelo de negócio:** "Como SaaS em estágio inicial, seus 3
  focos costumam ser: definir ICP, validar preço e medir churn. Comece por…"

## 2. O princípio que não pode ser violado

> **Número nunca sai do LLM. Número sai do código.**

Toda conta — soma de equity, rateio, saldo de cada sócio, total de caixa — é
calculada pelos **serviços determinísticos** que já existem (`CompanyService` etc.).
O LLM **recebe os números já calculados** como contexto e só faz o que ele faz bem:
**explicar, priorizar, sugerir e conversar**. Isso garante:

- Confiança: a parte financeira é auditável e testável (não "alucina" valor).
- Segurança: o LLM aconselha, **não executa** ação irreversível (mover dinheiro,
  apagar dados) — quem decide é o usuário, quem aplica a regra é o backend.
- Custo: o trabalho pesado de cálculo não gasta token.

E como tudo mais no Plim: **a IA roda no backend.** A chave da API
(`ANTHROPIC_API_KEY`) vive só no `apps/api`, nunca no front. O front só mostra o
texto/insight que a API devolveu.

## 3. "Treinar" o Plim — o que isso significa de verdade

O pedido foi "poder treinar ele para dar estratégia no futuro". Importante alinhar:
**no MVP (e por muito tempo) não é fine-tuning de modelo.** Treinar um modelo por
empresa é caro, lento e desnecessário. O que deixa o Plim "mais inteligente com o
tempo" são **quatro alavancas**, em ordem de impacto:

1. **Contexto da empresa (o mais importante).** Antes de cada resposta, montamos um
   retrato atual: sócios, %, modelo de negócio, etapa da jornada, despesas
   recentes, pendências. O LLM responde *sobre aquela empresa*, não em abstrato.
2. **Base de conhecimento (RAG).** Uma biblioteca curada de playbooks de startup
   no contexto brasileiro (sociedade, vesting, CNPJ/MEI/LTDA, INPI, modelos de
   negócio, captação). O copiloto **busca** os trechos relevantes e responde
   ancorado neles — em vez de "achismo". É aqui que você "treina": **escrevendo e
   melhorando essa base.**
3. **Memória por empresa.** A cada interação importante (decisão tomada, conselho
   dado, marco atingido) guardamos um resumo. Nas próximas vezes o copiloto
   "lembra" — fica contextual e coerente ao longo do tempo.
4. **Avaliações (feedback loop).** 👍/👎 nas respostas + um conjunto de casos de
   teste ("golden set") para medir qualidade quando mudamos prompt/base/modelo.
   Isso, sim, é o "treino" contínuo do sistema — sem tocar no modelo.

Fine-tuning fica como **fase futura e opcional**, só se as 4 alavancas acima
saturarem.

## 4. Arquitetura (mesmo padrão em camadas)

O núcleo inteligente entra como **mais um módulo do backend**, seguindo o mesmo
padrão rotas → serviços → repositórios, com duas abstrações novas trocáveis
(como já fizemos com `AuthService` e `CompanyRepository`):

```
apps/api/src/
├── services/
│   ├── company.service.ts          (já existe — cálculo/regra: a VERDADE)
│   └── advisor.service.ts          ★ orquestra o copiloto (regra de quando/como aconselhar)
├── ai/
│   ├── llm.provider.ts             interface LlmProvider (troca de fornecedor/modelo, testável)
│   ├── anthropic.provider.ts       implementação com @anthropic-ai/sdk (Claude)
│   ├── context-builder.ts          monta o "retrato da empresa" a partir dos serviços
│   ├── insights.ts                 sinais determinísticos (regras) que viram sugestões
│   └── prompts/                    system prompts versionados (texto, em arquivo)
├── repositories/
│   ├── knowledge.repository.ts     base de conhecimento (RAG) — busca de trechos
│   └── advisor-memory.repository.ts memória por empresa
```

Fluxo de uma resposta do copiloto:

```
front  →  POST /api/companies/:id/advisor/ask   { pergunta }
            │  (com JWT — herdado da auth Supabase)
            ▼
   AdvisorService
     1. autoriza (é membro? — regra existente)
     2. ContextBuilder → números/estado REAIS via CompanyService (determinístico)
     3. KnowledgeRepository → busca trechos relevantes (RAG)
     4. AdvisorMemoryRepository → resumo do histórico da empresa
     5. LlmProvider.complete(systemPrompt + contexto + base + pergunta)
     6. valida/saneia a saída (structured output), guarda memória + log/auditoria
            ▼
   resposta (texto + sugestões acionáveis) → front só apresenta
```

Por que `LlmProvider` é uma interface: deixa o fornecedor/modelo **trocável e
testável** (mock nos testes, sem chamar a API de verdade), do mesmo jeito que o
repositório in-memory permitiu testar regra sem banco.

## 5. O que dá pra mostrar logo após o onboarding (Fase 1)

Boa parte do valor inicial **nem precisa de LLM** — são **sinais determinísticos**
(`insights.ts`) que o LLM só "traduz" para uma frase amigável. Exemplos com os
dados que já temos:

| Sinal (calculado em código) | Vira o insight… |
|---|---|
| Soma de equity < 100% | "Faltam X% de participação para distribuir." |
| Sócio com % nulo | "N sócio(s) ainda sem participação definida." |
| Nenhuma despesa registrada | "Comece registrando a primeira despesa para o rateio funcionar." |
| Modelo de negócio definido | Dicas específicas daquele modelo (catálogo + LLM). |
| Etapa da jornada pendente | "Próximo passo sugerido: verificar a marca no INPI." |

O LLM entra para **explicar, priorizar e personalizar o tom** — não para inventar
os números.

## 6. Modelos da Claude (estratégia por camada)

Projeto é TypeScript → SDK oficial **`@anthropic-ai/sdk`**. Tiramos proveito de
**prompt caching** (a base de conhecimento e o system prompt são estáveis → ~90%
mais baratos a partir da 2ª chamada), **structured outputs** (resposta em JSON
validável quando precisamos de campos), e **adaptive thinking + effort** (deixa o
modelo pensar mais só quando vale a pena).

| Camada | Modelo | Por quê |
|---|---|---|
| Estratégia profunda / análises críticas | `claude-opus-4-8` | Mais capaz; usar com `effort: "high"` |
| Copiloto do dia a dia (perguntas, sugestões) | `claude-sonnet-4-6` | Melhor equilíbrio custo/inteligência |
| Classificação barata / gerar frase de um sinal | `claude-haiku-4-5` | Rápido e barato para tarefas simples |

Começar no **Sonnet 4.6** para o copiloto e **Haiku 4.5** para os sinais; subir
para **Opus 4.8** nas análises que realmente exigem. Modelo é configurável por
ambiente, nunca "chumbado".

Boas práticas técnicas adotadas:
- **Chave só no backend** (`ANTHROPIC_API_KEY` no `apps/api/.env`).
- **Streaming** nas respostas longas (evita timeout e melhora a percepção de UX).
- **Prompt caching** no bloco estável (system prompt + base) → custo baixo.
- **Structured outputs** quando a resposta precisa virar dado (ex.: lista de
  sugestões com `{titulo, acao, prioridade}`).
- **Token counting** antes de chamadas grandes para controlar custo.

## 7. Segurança, privacidade e custo (padrão empresa de software)

- **O LLM aconselha, não age.** Nada de mover dinheiro, apagar ou convidar sócio
  por conta própria. Ele propõe; o usuário confirma; o backend aplica a regra.
- **Minimizar dado pessoal** enviado ao modelo: mandar o necessário (números,
  estado), não dumps com e-mails/CPF quando não preciso.
- **Disclaimer:** o copiloto **não substitui** contador/advogado — orienta e
  organiza. Deixar isso claro na UI.
- **Auditoria:** registrar cada chamada (empresa, quem perguntou, modelo, tokens,
  custo) — para depurar, medir e controlar gasto.
- **Limites:** rate limit por empresa/usuário e teto de custo, para não estourar
  conta nem virar vetor de abuso.
- **RLS continua** como segunda linha: memória e base por empresa também
  protegidas no banco.

## 8. Roadmap em fases

- **Fase 1 — Insights determinísticos + voz da IA.** `insights.ts` gera os sinais;
  LLM transforma em frases e prioriza. Endpoint `GET /companies/:id/insights`.
  Entrega valor já no pós-onboarding, com custo baixo e zero "alucinação" de número.
- **Fase 2 — Copiloto conversacional (RAG).** `POST /companies/:id/advisor/ask`
  com base de conhecimento curada (playbooks BR) + contexto da empresa. 👍/👎.
- **Fase 3 — Memória + proativo.** Memória por empresa; insights proativos (um job
  diário analisa e destaca o que mudou); "golden set" de avaliação.
- **Fase 4 — (opcional) Fine-tuning / agentes.** Só se as fases anteriores
  saturarem. Possível uso de Managed Agents para fluxos longos e autônomos.

## 9. Decisões em aberto (para Rafaelle)

1. **Onde mora a base de conhecimento (RAG)?** Postgres do Supabase com busca
   vetorial (extensão `pgvector`) é o caminho natural — fica tudo num lugar só.
2. **Tom do copiloto:** seguir o brandbook (minúsculas, amigável, direto, sem
   jargão). Definir 3–4 exemplos de resposta "no tom Plim" para guiar o prompt.
3. **Idioma e contexto:** 100% pt-BR, realidade do fundador brasileiro (CNPJ,
   INPI, MEI/LTDA, Simples).
4. **Por onde começar a codar:** sugiro **Fase 1** — rápida, barata, e já mostra
   o Plim "pensando" logo depois do onboarding.

---

> Próximo passo sugerido: implementar a **Fase 1** — `LlmProvider` (interface +
> impl. Anthropic) + `insights.ts` + endpoint `GET /companies/:id/insights`, com
> testes do serviço usando um `LlmProvider` mockado (sem gastar token).
