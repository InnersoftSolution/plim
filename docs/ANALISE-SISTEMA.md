# Plim — Análise de Sistema

> Versão 1.0 — 12 jun 2026
> Documento vivo: evolui conforme as decisões do produto.

## 1. Visão do produto

O Plim é um **copiloto para quem está tirando uma ideia do papel**. Ele resolve duas dores de quem inicia uma startup:

1. **Falta de direção** — o grupo não sabe o que precisa fazer: registrar marca, criar logo, verificar disponibilidade de domínio e redes sociais, abrir CNPJ, acordo de sócios, escolher modelo de negócio.
2. **Desorganização financeira entre sócios** — um paga, os outros deveriam ratear; ninguém sabe quanto já foi gasto, quanto cada um pode aportar e quem deve a quem.

O produto une as duas dores: **guia de jornada + gestão de sociedade e despesas**.

Tagline: *"Tudo começa com um plim."*

## 2. Decisões registradas

| Decisão | Escolha | Data |
|---|---|---|
| Plataforma do MVP | **Web primeiro**, projetado desde já para mobile (design responsivo, API pronta para apps nativos no futuro) | 12 jun 2026 |
| Regra de rateio | Padrão pelo % da sociedade, **com opção de proporção personalizada por despesa** | 12 jun 2026 |
| Modelos de negócio | O sistema **sugere modelos de negócio existentes** (catálogo) e o fundador pode escolher um ou definir o seu livremente | 12 jun 2026 |
| Arquitetura | **Todas as camadas (front, back, banco)**; toda regra de negócio e segurança **no backend**, nunca no front | 12 jun 2026 |
| Qualidade | Sistema estruturado com padrão de empresa de software (testes, migrations, CI, auditoria) | 12 jun 2026 |
| Movimentação financeira | O sistema **registra e calcula**, mas não movimenta dinheiro no MVP | 12 jun 2026 |

## 3. Atores

| Ator | Papel |
|---|---|
| Fundador principal (`account_owner`) | Cria a empresa, cadastra sócios, define percentuais |
| Sócio (`partner`) | Participa da jornada, registra/visualiza despesas, confirma rateios |
| Convidado (futuro) | Contador, advogado, mentor — acesso de leitura ou por módulo |

## 4. Módulos

### 4.1 Sociedade (cap table simplificado)
- Cadastro da startup: nome, descrição da ideia, estágio.
- Cadastro de sócios com percentual de participação (soma ≤ 100%; percentuais podem ficar nulos no início — regra já adotada no onboarding atual).
- Convite por e-mail/link; sócio aceita e ganha acesso.
- Histórico de alterações de participação (auditoria).
- Futuro: vesting, registro do acordo de sócios.

### 4.2 Modelo de negócio
- Catálogo de modelos com explicação simples e exemplos brasileiros: SaaS/assinatura, marketplace, e-commerce, serviço/consultoria, freemium, licenciamento, franquia, publicidade/audiência, transacional (taxa por operação), hardware + serviço.
- O fundador escolhe um modelo **ou descreve o seu próprio** (campo livre).
- A escolha pode personalizar a jornada (ex.: e-commerce ganha etapas de logística e meios de pagamento).

### 4.3 Jornada guiada (checklist inteligente)
Trilha de etapas com "o quê, por quê e como":

- **Identidade**: nome, verificação de domínio (.com/.com.br), handles de Instagram, Facebook, LinkedIn, X, TikTok; logo/brandbook.
- **Legal**: registro de marca no INPI, natureza jurídica, abertura de CNPJ, acordo de sócios.
- **Validação**: proposta de valor, modelo de negócio, pesquisa com clientes, MVP.
- **Operação**: conta PJ, meios de pagamento, contabilidade.

Cada item tem: status (pendente / em andamento / feito), sócio responsável, prazo opcional, conteúdo de orientação. Diferencial de fase 2: **verificações automáticas** de domínio (WHOIS/Registro.br) e de handles de redes sociais.

### 4.4 Financeiro / Rateio
- Registro de despesas: quem pagou, valor, data, categoria, comprovante (imagem/PDF).
- Rateio: padrão pelo % da sociedade; **personalizável por despesa** (percentuais ou valores fixos por sócio, validados no backend).
- Saldo entre sócios: "Fulano deve R$ X a Beltrano" (estilo Splitwise com lógica societária).
- Limite de aporte por sócio: cada um declara até quanto pode contribuir; o sistema mostra orçamento total disponível e alerta ao se aproximar do teto.
- Acerto de contas: registro de reembolsos entre sócios (fase 2).
- Painel: total gasto, gasto por categoria, aportado por sócio vs. devido.

## 5. Requisitos funcionais priorizados

### MVP (fase 1)
- **RF01** Cadastro de usuário (e-mail/senha e Google) e da empresa
- **RF02** Cadastro de sócios com % de participação e convite por e-mail
- **RF03** Escolha de modelo de negócio (catálogo + opção livre)
- **RF04** Checklist de jornada pré-definido com status, responsável e orientações
- **RF05** Registro de despesas com comprovante
- **RF06** Rateio automático pelo % da sociedade ou proporção personalizada por despesa
- **RF07** Saldos entre sócios calculados no backend
- **RF08** Limite de aporte por sócio com alertas

### Fase 2
- **RF09** Verificação automática de domínio e redes sociais
- **RF10** Acerto de contas (reembolsos entre sócios)
- **RF11** Jornada personalizada pelo modelo de negócio
- **RF12** Relatórios e exportação (CSV/PDF para o contador)
- **RF13** Notificações (etapa atrasada, gasto acima do limite, convite pendente)
- **RF14** Histórico/auditoria visível de alterações societárias

### Fase 3
- App mobile (a API REST já nasce pronta para isso)
- Convidados (contador/advogado) com permissão de leitura
- Vesting e acordo de sócios assistido

## 6. Requisitos não funcionais

- **RNF01 — Regras no backend**: nenhuma regra de negócio, cálculo de rateio ou validação de autorização vive apenas no front. O front valida formato para UX; o backend é a fonte da verdade e revalida tudo.
- **RNF02 — Autorização por empresa**: todo recurso pertence a uma empresa; toda query filtra por associação do usuário autenticado (multi-tenant por linha). Nenhum `company_id` em `profiles` — relação via `company_members`.
- **RNF03 — Segurança**: senhas com hash forte (bcrypt/argon2), tokens de sessão httpOnly, rate limiting em endpoints de auth, secrets só no servidor (no front, apenas chaves públicas).
- **RNF04 — Dinheiro com precisão**: valores monetários em centavos (inteiros) ou `numeric` no banco; nunca float.
- **RNF05 — Auditoria**: alterações societárias e financeiras geram registro imutável (quem, quando, o quê).
- **RNF06 — Responsivo / mobile-ready**: layout mobile-first; API desenhada para ser consumida por app nativo futuramente.
- **RNF07 — Qualidade**: migrations versionadas, testes automatizados (unidade nas regras de negócio, integração na API, componente no front), lint e CI.
- **RNF08 — LGPD**: consentimento no cadastro, dados mínimos, possibilidade de exclusão de conta.

## 7. Arquitetura

```
┌────────────────────────────┐
│  Front-end (já iniciado)   │  React 19 + TypeScript + Vite
│  - telas, formulários, UX  │  React Router, RHF + Zod
│  - validação de formato    │  tokens de design (global.css)
└─────────────┬──────────────┘
              │ HTTPS / JSON (REST)
┌─────────────▼──────────────┐
│  Backend (API)             │  TypeScript (Node)
│  - autenticação/autorização│  camadas: rotas → serviços → repositórios
│  - TODAS as regras de      │  validação com Zod no contrato da API
│    negócio e cálculos      │  jobs (verificação de domínio, e-mails)
└─────────────┬──────────────┘
              │
┌─────────────▼──────────────┐
│  PostgreSQL                │  migrations versionadas
│  + storage de comprovantes │  RLS como defesa em profundidade
└────────────────────────────┘
```

**Recomendação de implementação do backend:** Supabase como infraestrutura (Postgres, Auth, Storage) **+ uma camada de API própria** (Node/TypeScript) onde vivem as regras de negócio. O front nunca grava direto nas tabelas de negócio; ele chama a API. O RLS do Supabase fica como segunda linha de defesa, não como única. Isso atende à decisão "tudo no back" e mantém o caminho já planejado no README (Supabase Auth com Google OAuth).

### Camadas do backend
1. **Rotas/controllers** — contrato HTTP, validação de entrada (Zod), autenticação.
2. **Serviços** — regras de negócio puras e testáveis (rateio, limites, percentuais, jornada).
3. **Repositórios** — acesso ao banco, transações.
4. **Infra** — e-mail, storage, verificadores externos (WHOIS, redes sociais).

## 8. Modelo de dados (alto nível)

```
profiles (pessoa)            companies (startup)
   │                            │ business_model_id → business_models (catálogo)
   └──< company_members >───────┤ business_model_custom (texto livre)
        - role (account_owner | partner)
        - equity_percent (nulo permitido; soma ≤ 100 validada no back)
        - contribution_limit (centavos, opcional)
        - status (invited | active)

companies ──< journey_steps      (template + customização, status, responsável, prazo)
companies ──< expenses           (pagador, valor_centavos, categoria, comprovante_url, data)
expenses  ──< expense_splits     (sócio, valor_devido_centavos, origem: equity | custom, quitado?)
companies ──< settlements        (de_sócio, para_sócio, valor_centavos, data)   [fase 2]
companies ──< audit_log          (ator, ação, payload, timestamp)
companies ──< company_invites    (e-mail, token, expiração, status)
```

Regras de integridade no backend:
- soma dos `equity_percent` de uma empresa ≤ 100;
- soma dos `expense_splits` de uma despesa = valor da despesa;
- saldo entre sócios = agregação de splits não quitados − settlements (sempre calculado no servidor);
- apenas `account_owner` altera percentuais; alteração gera entrada no `audit_log`.

## 9. Estado atual e plano

**Já existe** (front demonstrativo, dados em `localStorage`): login/cadastro/recuperação de senha, onboarding de empresa em 4 etapas (dados básicos, contato, sócios com percentuais, revisão) e dashboard com pendências.

**Plano de evolução:**
1. **Backend e banco** — criar a API, migrations (`profiles`, `companies`, `company_members`, `company_invites`), integrar Supabase Auth real e substituir o `demoAuthService` mantendo telas e guards.
2. **Sociedade real** — convites por e-mail, aceite, papéis e auditoria.
3. **Financeiro** — despesas, comprovantes, rateio (padrão e personalizado), saldos, limites de aporte.
4. **Jornada** — templates de checklist, status, responsáveis e conteúdos de orientação; catálogo de modelos de negócio.
5. **Fase 2** — verificações automáticas, acertos, relatórios, notificações.

## 10. Riscos e pontos de atenção

- **Dinheiro entre sócios é sensível** — clareza nos cálculos e histórico imutável geram confiança; não movimentar dinheiro no MVP evita complexidade regulatória.
- **Checklist genérico cansa** — personalização por modelo de negócio é o antídoto (fase 2).
- **Linguagem jurídica** — o produto dá *orientação*, não consultoria jurídica/contábil; deixar isso explícito nos textos.
- **Verificação de redes sociais** — APIs oficiais são restritivas; planejar fallback (verificação de URL pública) e degradação graciosa.
