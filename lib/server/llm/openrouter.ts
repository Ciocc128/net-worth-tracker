/**
 * The OpenRouter adapter: one OpenAI-compatible route (`/chat/completions`) through a plain
 * `fetch` — no SDK (owner's decision, 2026-09-28): one endpoint does not earn a dependency, and
 * the answer goes through zod anyway.
 *
 * Privacy is part of every request, not a setting to remember (doc/ai-open-models-wiki.md
 * § 4.3): `data_collection: 'deny'` and `zdr: true` route only to providers that neither train
 * on the data nor retain it, and a `:free` variant is refused before anything is sent — free
 * endpoints are paid for with the prompts.
 */

import { z } from 'zod';
import type { AdapterResponse, LlmAdapter } from './types';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/** A monthly comment on a slow host can take a minute; past two, the cron has better uses. */
const TIMEOUT_MS = 120_000;

/** Statuses worth ONE retry: rate limit, timeout, and a provider that fell over upstream. */
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

// The answer is untrusted like the model's text: a body of the wrong shape throws here, and the
// index turns it into null.
const completionSchema = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullish(),
        message: z.object({ content: z.string().nullish() }),
      })
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number(),
      completion_tokens: z.number(),
      cost: z.number().optional(),
    })
    .optional(),
});

type Completion = z.infer<typeof completionSchema>;

interface OpenRouterOptions {
  fetchImpl?: typeof fetch;
  retryDelayMs?: number;
}

/** A structured answer occasionally arrives inside a markdown fence even in strict mode. */
function parseJsonContent(content: string): unknown {
  const unfenced = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(unfenced);
  } catch {
    return undefined;
  }
}

export function createOpenRouterAdapter({
  fetchImpl = (...args) => globalThis.fetch(...args),
  retryDelayMs = 2000,
}: OpenRouterOptions = {}): LlmAdapter {
  async function complete(
    model: string,
    apiKey: string,
    body: Record<string, unknown>
  ): Promise<AdapterResponse<string>> {
    if (model.endsWith(':free')) {
      throw new Error(`[openrouter] refused ${model}: free variants may log and train on prompts`);
    }

    const payload = JSON.stringify({
      model,
      ...body,
      // Reasoning tokens still count against max_tokens, but their text stays out of `content`.
      reasoning: { exclude: true },
      provider: {
        data_collection: 'deny',
        zdr: true,
        ...(body.response_format ? { require_parameters: true } : {}),
      },
    });

    for (let attempt = 0; ; attempt++) {
      const response = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'Net Worth Tracker',
        },
        body: payload,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!response.ok) {
        if (attempt === 0 && RETRYABLE_STATUSES.has(response.status)) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
          continue;
        }
        const detail = (await response.text().catch(() => '')).slice(0, 300);
        throw new Error(`[openrouter] HTTP ${response.status}: ${detail}`);
      }

      const completion: Completion = completionSchema.parse(await response.json());
      const choice = completion.choices[0];
      return {
        value: choice.message.content ?? undefined,
        truncated: choice.finish_reason === 'length',
        model: completion.model ?? model,
        usage: completion.usage
          ? {
              input: completion.usage.prompt_tokens,
              output: completion.usage.completion_tokens,
              ...(completion.usage.cost !== undefined ? { cost: completion.usage.cost } : {}),
            }
          : null,
      };
    }
  }

  return {
    generateText(model, { system, user, maxTokens }, apiKey) {
      return complete(model, apiKey, {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: maxTokens,
      });
    },

    async extractJson(model, { system, user, jsonSchema, name, maxTokens }, apiKey) {
      const response = await complete(model, apiKey, {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: maxTokens,
        response_format: {
          type: 'json_schema',
          json_schema: { name, strict: true, schema: jsonSchema },
        },
      });
      return {
        ...response,
        value: response.value === undefined ? undefined : parseJsonContent(response.value),
      };
    },
  };
}

export const openRouterAdapter = createOpenRouterAdapter();
