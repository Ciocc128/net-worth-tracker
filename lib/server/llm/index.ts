import 'server-only';

/**
 * The provider layer (doc/ai-open-models-wiki.md § 4): the app's automations call a SURFACE, and
 * `AI_MODELS` says which provider and which model answer it. Two operations only — the surfaces
 * that remain in the app need no streaming and no tools.
 *
 * Both return `null` on ANY failure — missing key, network, HTTP status, truncated output, a value
 * zod rejects — and log why. Callers treat AI as optional by construction: an email is sent with
 * or without its comment.
 *
 * Every call that reaches a provider logs one `[ai-usage]` line, whatever its outcome: that line
 * is the consumption history on Vercel, and a rejected answer was paid for all the same.
 */

import { AI_MODELS, type AiModelRoute, type AiSurface, type LlmProvider } from '@/lib/constants/aiModels';
import { anthropicAdapter } from './anthropic';
import { openRouterAdapter } from './openrouter';
import type { AdapterResponse, ExtractStructuredRequest, GenerateTextRequest, LlmAdapter, LlmResult, LlmUsage } from './types';

export type { ExtractStructuredRequest, GenerateTextRequest, LlmResult, LlmUsage } from './types';

const ADAPTERS: Record<LlmProvider, LlmAdapter> = {
  anthropic: anthropicAdapter,
  openrouter: openRouterAdapter,
};

const API_KEY_ENV: Record<LlmProvider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

const DEFAULT_EXTRACTION_MAX_TOKENS = 4096;

type Outcome = 'ok' | 'empty' | 'truncated' | 'rejected' | 'error';

/** Whether the key the provider needs is in the environment. Read on every call, never cached. */
export function isProviderConfigured(provider: LlmProvider): boolean {
  return Boolean(process.env[API_KEY_ENV[provider]]);
}

/** Whether a surface can answer: its provider's key is set. */
export function isSurfaceConfigured(surface: AiSurface): boolean {
  return isProviderConfigured(AI_MODELS[surface].provider);
}

function logUsage(
  surface: AiSurface,
  route: AiModelRoute,
  usage: LlmUsage | null,
  outcome: Outcome
): void {
  console.info('[ai-usage]', {
    surface,
    provider: route.provider,
    model: route.model,
    input: usage?.input ?? null,
    output: usage?.output ?? null,
    ...(usage?.cost !== undefined ? { cost: usage.cost } : {}),
    ...(usage?.reasoning !== undefined ? { reasoning: usage.reasoning } : {}),
    outcome,
  });
}

/**
 * The shared frame of both operations: key guard, the adapter call, the usage line, and the
 * acceptance rule `accept` applies to the answer (undefined = rejected).
 */
async function run<V, R>(
  surface: AiSurface,
  call: (adapter: LlmAdapter, model: string, apiKey: string) => Promise<AdapterResponse<V>>,
  accept: (value: V | undefined) => { outcome: Outcome; result?: R }
): Promise<{ result: R; response: AdapterResponse<V> } | null> {
  const route = AI_MODELS[surface];
  const apiKey = process.env[API_KEY_ENV[route.provider]];
  if (!apiKey) {
    console.warn(`[ai] ${surface} skipped: ${API_KEY_ENV[route.provider]} is not set`);
    return null;
  }

  let response: AdapterResponse<V>;
  try {
    response = await call(ADAPTERS[route.provider], route.model, apiKey);
  } catch (error) {
    logUsage(surface, route, null, 'error');
    console.error(`[ai] ${surface} failed on ${route.provider}/${route.model}:`, error);
    return null;
  }

  // A truncated answer is rejected whatever its content: a comment cut mid-sentence, or JSON
  // missing its tail, is not something to show.
  const { outcome, result } = response.truncated ? { outcome: 'truncated' as const } : accept(response.value);
  logUsage(surface, route, response.usage, outcome);
  if (outcome !== 'ok' || result === undefined) {
    console.warn(`[ai] ${surface} discarded: ${outcome}`);
    return null;
  }
  return { result, response };
}

/** Free text: the email comments. */
export async function generateText(surface: AiSurface, request: GenerateTextRequest): Promise<LlmResult | null> {
  const route = AI_MODELS[surface];
  const done = await run(
    surface,
    (adapter, model, apiKey) => adapter.generateText(model, request, apiKey),
    (value: string | undefined) => {
      const text = value?.trim();
      return text ? { outcome: 'ok', result: text } : { outcome: 'empty' };
    }
  );
  if (!done) return null;
  return {
    text: done.result,
    provider: route.provider,
    model: done.response.model,
    usage: done.response.usage,
  };
}

/**
 * A value of a known shape: TheBull's compilation from F3. The model is told `jsonSchema`; the
 * app accepts only what `schema` parses — anything else is null, never a partial value.
 */
export async function extractStructured<T>(
  surface: AiSurface,
  { system, user, schema, jsonSchema, name = 'structured_output', maxTokens = DEFAULT_EXTRACTION_MAX_TOKENS, reasoningMaxTokens }: ExtractStructuredRequest<T>
): Promise<T | null> {
  const done = await run(
    surface,
    (adapter, model, apiKey) => adapter.extractJson(model, { system, user, jsonSchema, name, maxTokens, reasoningMaxTokens }, apiKey),
    (value: unknown) => {
      if (value === undefined) return { outcome: 'empty' };
      const parsed = schema.safeParse(value);
      return parsed.success ? { outcome: 'ok', result: parsed.data } : { outcome: 'rejected' };
    }
  );
  return done ? done.result : null;
}
