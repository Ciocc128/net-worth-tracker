/**
 * The Anthropic adapter: the calls the email comments made before the provider layer, kept as
 * they were for whoever runs upstream with an Anthropic key (doc/ai-open-models-wiki.md § 4.1).
 *
 * Text keeps adaptive thinking at `high` effort, as the emails had. Structured extraction is a
 * FORCED tool call, the pattern `lib/server/assistant/memoryExtraction.ts` uses: the tool's
 * `input_schema` is the JSON Schema, and thinking is off because the API refuses it together
 * with a forced `tool_choice`.
 *
 * The one behaviour that did not come across is the periodic email's web search: the layer has
 * no tools, and the macro context is the Wiki's job from F5 (§ 5.4).
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { AdapterResponse, LlmAdapter, LlmUsage } from './types';

// Lazy import, so no module-level client exists where the key is absent (the same pattern as
// memoryExtraction and the assistant's stream route).
async function createClient(apiKey: string): Promise<Anthropic> {
  const { default: AnthropicClient } = await import('@anthropic-ai/sdk');
  return new AnthropicClient({ apiKey });
}

function usageOf(message: Anthropic.Message): LlmUsage {
  return { input: message.usage.input_tokens, output: message.usage.output_tokens };
}

export const anthropicAdapter: LlmAdapter = {
  async generateText(model, { system, user, maxTokens }, apiKey): Promise<AdapterResponse<string>> {
    const client = await createClient(apiKey);
    const message = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' },
      messages: [{ role: 'user', content: user }],
    });
    // Only the text blocks: thinking blocks are the model's scratchpad, not the comment.
    const text = message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
    return {
      value: text,
      truncated: message.stop_reason === 'max_tokens',
      model: message.model,
      usage: usageOf(message),
    };
  },

  async extractJson(model, { system, user, jsonSchema, name, maxTokens }, apiKey): Promise<AdapterResponse<unknown>> {
    const client = await createClient(apiKey);
    const message = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      tools: [{ name, input_schema: jsonSchema as Anthropic.Tool.InputSchema }],
      tool_choice: { type: 'tool', name },
      messages: [{ role: 'user', content: user }],
    });
    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use' && block.name === name
    );
    return {
      value: toolUse?.input,
      truncated: message.stop_reason === 'max_tokens',
      model: message.model,
      usage: usageOf(message),
    };
  },
};
