import Anthropic from '@anthropic-ai/sdk';
import type { LlmCompletionInput, LlmProvider } from './llm.provider';

/**
 * Implementação real sobre a API da Claude (@anthropic-ai/sdk).
 * - Chave SÓ no backend (ANTHROPIC_API_KEY).
 * - Modelo barato por padrão (Haiku 4.5) — configurável por PLIM_ADVISOR_MODEL.
 * - Prompt caching no bloco `system` (estável) → ~90% mais barato após a 1ª chamada.
 */
export class AnthropicLlmProvider implements LlmProvider {
  readonly available = true;
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string = 'claude-haiku-4-5',
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async complete({ system, prompt, maxTokens = 400 }: LlmCompletionInput): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: prompt }],
    });

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();
  }
}
