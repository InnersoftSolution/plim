# plim

Tudo começa com um plim. Sistema para quem está tirando uma ideia do papel: sócios, participações, despesas, aportes e um guia de jornada.

## Estrutura

| Pasta | O que é |
|---|---|
| `apps/web` | Front-end — React 19 + TypeScript + Vite. Só telas e UX. |
| `apps/api` | Backend — Node + Fastify. **Todas as regras de negócio.** |
| `packages/shared` | Contratos (schemas Zod) usados pelo front e pela API. |
| `docs/` | [Análise de sistema](docs/ANALISE-SISTEMA.md) · [Arquitetura](docs/ARQUITETURA.md) |

## Rodando

```bash
npm install
npm run dev:api   # http://localhost:3333
npm run dev:web   # http://localhost:5173
npm test
```

## Design

- Design system no Figma: páginas Cover, Foundations e Components.
- Tokens fonte: `design-system/*.json` → `apps/web/src/styles/tokens.css`.
