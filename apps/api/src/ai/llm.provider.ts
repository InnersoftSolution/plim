/**
 * Abstração do modelo de linguagem — trocável e testável (mesma ideia de
 * AuthService/CompanyRepository). Os serviços dependem desta interface, não
 * do fornecedor. Nos testes usamos um mock; sem chave, usamos o Noop.
 *
 * Regra de ouro da IA: o LLM só RACIOCINA/ESCREVE. Número e regra vêm do código.
 */
export interface LlmCompletionInput {
  /** Instrução estável (cacheável). */
  system: string;
  /** Conteúdo variável da requisição. */
  prompt: string;
  /** Teto de saída; default baixo para controlar custo. */
  maxTokens?: number;
}

export interface LlmProvider {
  /** Se há provedor real configurado. Quando false, serviços caem no texto determinístico. */
  readonly available: boolean;
  complete(input: LlmCompletionInput): Promise<string>;
}

/** Provedor nulo: usado quando não há ANTHROPIC_API_KEY. Nunca chama API, custo zero. */
export class NoopLlmProvider implements LlmProvider {
  readonly available = false;
  async complete(): Promise<string> {
    throw new Error('LLM não configurado (NoopLlmProvider). Verifique disponibilidade com `available`.');
  }
}
