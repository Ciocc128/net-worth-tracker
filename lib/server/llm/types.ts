/**
 * The contract between `lib/server/llm/index.ts` and its provider adapters.
 *
 * An adapter only TRANSPORTS: it sends the request, and it throws on anything that is not a
 * readable answer (network, HTTP status, a body of the wrong shape). Deciding what the app
 * accepts — a truncated text, a value zod rejects — is the index's job, so the rule is written
 * once for every provider.
 */

import type { z } from 'zod';
import type { LlmProvider } from '@/lib/constants/aiModels';

export interface LlmUsage {
  input: number;
  output: number;
  /** In dollars, when the provider reports it (OpenRouter does; Anthropic does not). */
  cost?: number;
}

export interface LlmResult {
  text: string;
  provider: LlmProvider;
  /** The model that answered, as the provider names it (OpenRouter may resolve an alias). */
  model: string;
  usage: LlmUsage | null;
}

export interface GenerateTextRequest {
  system: string;
  user: string;
  /** The whole output budget: on a reasoning model it covers the reasoning AND the text. */
  maxTokens: number;
}

export interface ExtractStructuredRequest<T> {
  system: string;
  user: string;
  /** What the app accepts: the model's output is untrusted input, validated by zod. */
  schema: z.ZodType<T>;
  /**
   * What the model is told to produce. On OpenRouter it runs in strict mode, so every object
   * lists all its properties in `required` and sets `additionalProperties: false`.
   */
  jsonSchema: Record<string, unknown>;
  /** Tool (Anthropic) or schema (OpenRouter) name: `[a-zA-Z0-9_-]`, at most 64 characters. */
  name?: string;
  maxTokens?: number;
}

export interface AdapterResponse<V> {
  /** The text, or the parsed JSON value; `undefined` when the answer carried none. */
  value: V | undefined;
  /** The output budget ran out before the answer ended. */
  truncated: boolean;
  model: string;
  usage: LlmUsage | null;
}

export interface LlmAdapter {
  generateText(model: string, request: GenerateTextRequest, apiKey: string): Promise<AdapterResponse<string>>;
  extractJson(
    model: string,
    request: {
      system: string;
      user: string;
      jsonSchema: Record<string, unknown>;
      name: string;
      maxTokens: number;
    },
    apiKey: string
  ): Promise<AdapterResponse<unknown>>;
}
