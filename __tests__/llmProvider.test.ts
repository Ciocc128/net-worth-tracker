/**
 * The provider layer (lib/server/llm): the two operations, the two adapters and the rule that
 * the model is untrusted input — any answer the app cannot use is null, never a partial value.
 * `fetch` (OpenRouter) and the Anthropic SDK are simulated; nothing leaves the process.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('server-only', () => ({}));

const { anthropicCreate } = vi.hoisted(() => ({ anthropicCreate: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: anthropicCreate };
  },
}));

import { extractStructured, generateText, isSurfaceConfigured } from '@/lib/server/llm';
import { createOpenRouterAdapter } from '@/lib/server/llm/openrouter';
import { AI_MODELS } from '@/lib/constants/aiModels';
import { outputBudget, TEXT_MARGIN, TOKENS_PER_WORD } from '@/lib/server/llm/budget';

describe('outputBudget — derived from the contract, not from a model', () => {
  it('adds the text’s room (word limit × tokens per word × margin) to the reasoning ceiling', () => {
    expect(TOKENS_PER_WORD * TEXT_MARGIN).toBe(3.6);
    expect(outputBudget({ wordLimit: 500, reasoningTokens: 4000 })).toEqual({ maxTokens: 5800, reasoningMaxTokens: 4000 });
    expect(outputBudget({ wordLimit: 45, reasoningTokens: 1500 })).toEqual({ maxTokens: 1662, reasoningMaxTokens: 1500 });
  });
});

const fetchMock = vi.fn();
let infoSpy: { mock: { calls: unknown[][] } };

function completion(
  content: string | null,
  { finish = 'stop', usage = { prompt_tokens: 5200, completion_tokens: 900, cost: 0.0012 } } = {}
) {
  return new Response(
    JSON.stringify({ model: 'z-ai/glm-5.3-flash', choices: [{ finish_reason: finish, message: { content } }], usage }),
    { status: 200 }
  );
}

function sentBody(call = 0) {
  return JSON.parse(fetchMock.mock.calls[call][1].body);
}

/** The `[ai-usage]` payloads logged so far. */
function usageLines(): Array<Record<string, unknown>> {
  return infoSpy.mock.calls
    .filter((args) => args[0] === '[ai-usage]')
    .map((args) => args[1] as Record<string, unknown>);
}

const REQUEST = { system: 'Sei un assistente.', user: 'Commenta il mese.', maxTokens: 6000 };

const itemSchema = z.object({ items: z.array(z.object({ label: z.string(), quote: z.string() })) });
const ITEM_JSON_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { label: { type: 'string' }, quote: { type: 'string' } },
        required: ['label', 'quote'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

beforeEach(() => {
  fetchMock.mockReset();
  anthropicCreate.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  process.env.OPENROUTER_API_KEY = 'or-test';
  process.env.ANTHROPIC_API_KEY = 'ant-test';
});

afterEach(() => {
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('routes', () => {
  it('sends the automations to OpenRouter and keeps the in-app surfaces on Anthropic', () => {
    expect(AI_MODELS.EMAIL_PERIODIC.provider).toBe('openrouter');
    expect(AI_MODELS.EMAIL_WEEKLY_BUDGET.provider).toBe('openrouter');
    expect(AI_MODELS.THEBULL_COMPILE.provider).toBe('openrouter');
    expect(AI_MODELS.PERFORMANCE_ANALYSIS.provider).toBe('anthropic');
    expect(AI_MODELS.ASSISTANT.provider).toBe('anthropic');
    expect(AI_MODELS.MEMORY_EXTRACTION.provider).toBe('anthropic');
  });

  it('never routes a surface to a free variant', () => {
    for (const route of Object.values(AI_MODELS)) expect(route.model).not.toMatch(/:free$/);
  });

  it('a surface is configured exactly when its provider has a key', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(isSurfaceConfigured('EMAIL_PERIODIC')).toBe(true);
    expect(isSurfaceConfigured('PERFORMANCE_ANALYSIS')).toBe(false);
  });
});

describe('generateText on OpenRouter', () => {
  it('without OPENROUTER_API_KEY returns null and calls nobody', async () => {
    delete process.env.OPENROUTER_API_KEY;
    expect(await generateText('EMAIL_PERIODIC', REQUEST)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(usageLines()).toHaveLength(0);
  });

  it('sends the route, both turns, the budget and the privacy filter; returns the trimmed text', async () => {
    fetchMock.mockResolvedValue(completion('  Il mese è andato bene.  '));
    const result = await generateText('EMAIL_PERIODIC', REQUEST);

    expect(result).toEqual({
      text: 'Il mese è andato bene.',
      provider: 'openrouter',
      model: 'z-ai/glm-5.3-flash',
      usage: { input: 5200, output: 900, cost: 0.0012 },
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer or-test');
    const body = sentBody();
    expect(body.model).toBe(AI_MODELS.EMAIL_PERIODIC.model);
    expect(body.messages).toEqual([
      { role: 'system', content: 'Sei un assistente.' },
      { role: 'user', content: 'Commenta il mese.' },
    ]);
    expect(body.max_tokens).toBe(6000);
    // Sol since 2026-10-07: no quantization allow-list (GLM's fp4 filter stays on the weekly email),
    // and an effort level in place of the reasoning ceiling.
    expect(body.provider).toEqual({ data_collection: 'deny', zdr: true });
    expect(body.reasoning).toEqual({ exclude: true, effort: 'high' });
    expect(body.response_format).toBeUndefined();
  });

  it('logs one [ai-usage] line with surface, model, tokens and cost', async () => {
    fetchMock.mockResolvedValue(completion('Testo.'));
    await generateText('EMAIL_WEEKLY_BUDGET', { ...REQUEST, maxTokens: 400 });
    expect(usageLines()).toEqual([
      {
        surface: 'EMAIL_WEEKLY_BUDGET',
        provider: 'openrouter',
        model: 'z-ai/glm-5.3-flash',
        input: 5200,
        output: 900,
        cost: 0.0012,
        outcome: 'ok',
      },
    ]);
  });

  it('gives the reasoning its own ceiling, and logs how much of the output was reasoning', async () => {
    fetchMock.mockResolvedValue(
      completion('Testo.', { usage: { prompt_tokens: 6492, completion_tokens: 5450, cost: 0.0037, completion_tokens_details: { reasoning_tokens: 4520 } } as never })
    );
    const result = await generateText('EMAIL_WEEKLY_BUDGET', { ...REQUEST, ...outputBudget({ wordLimit: 500, reasoningTokens: 4000 }) });
    const body = sentBody();
    expect(body.max_tokens).toBe(5800);
    expect(body.reasoning).toEqual({ exclude: true, max_tokens: 4000 });
    // The budget is a request field of the layer, not of OpenRouter's body.
    expect(body.reasoningMaxTokens).toBeUndefined();
    expect(result?.usage).toEqual({ input: 6492, output: 5450, cost: 0.0037, reasoning: 4520 });
    expect(usageLines()[0]).toMatchObject({ reasoning: 4520, outcome: 'ok' });
  });

  it('rejects a truncated answer, and still logs what it cost', async () => {
    fetchMock.mockResolvedValue(completion('Il mese è andato', { finish: 'length' }));
    expect(await generateText('EMAIL_PERIODIC', REQUEST)).toBeNull();
    expect(usageLines()[0]).toMatchObject({ outcome: 'truncated', input: 5200, output: 900 });
  });

  it('rejects an empty or missing content', async () => {
    fetchMock.mockResolvedValueOnce(completion('   ')).mockResolvedValueOnce(completion(null));
    expect(await generateText('EMAIL_PERIODIC', REQUEST)).toBeNull();
    expect(await generateText('EMAIL_PERIODIC', REQUEST)).toBeNull();
    expect(usageLines().map((line) => line.outcome)).toEqual(['empty', 'empty']);
  });

  it('a non-retryable HTTP status is null after ONE call', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":{"message":"bad model"}}', { status: 400 }));
    expect(await generateText('EMAIL_PERIODIC', REQUEST)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(usageLines()[0]).toMatchObject({ outcome: 'error', input: null, output: null });
  });

  it('a body of the wrong shape is null, not a crash', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ choices: [] }), { status: 200 }));
    expect(await generateText('EMAIL_PERIODIC', REQUEST)).toBeNull();
  });

  it('a network failure is null', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    expect(await generateText('EMAIL_PERIODIC', REQUEST)).toBeNull();
  });

  it('usage is optional in the answer: the text still arrives, the log says null', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'Ok.' } }] }), { status: 200 })
    );
    const result = await generateText('EMAIL_PERIODIC', REQUEST);
    expect(result?.text).toBe('Ok.');
    expect(result?.model).toBe(AI_MODELS.EMAIL_PERIODIC.model);
    expect(usageLines()[0]).toMatchObject({ input: null, output: null, outcome: 'ok' });
  });
});

describe('the OpenRouter adapter', () => {
  const adapterFetch = vi.fn();
  const adapter = createOpenRouterAdapter({ fetchImpl: adapterFetch, retryDelayMs: 0 });

  beforeEach(() => adapterFetch.mockReset());

  it('retries ONCE on a retryable status, then answers', async () => {
    adapterFetch.mockResolvedValueOnce(new Response('busy', { status: 429 })).mockResolvedValueOnce(completion('Ok.'));
    const response = await adapter.generateText('z-ai/glm-5.3-flash', REQUEST, 'k');
    expect(response.value).toBe('Ok.');
    expect(adapterFetch).toHaveBeenCalledTimes(2);
  });

  it('gives up after the second retryable status', async () => {
    adapterFetch.mockResolvedValue(new Response('down', { status: 503 }));
    await expect(adapter.generateText('z-ai/glm-5.3-flash', REQUEST, 'k')).rejects.toThrow('HTTP 503');
    expect(adapterFetch).toHaveBeenCalledTimes(2);
  });

  it('sends a route\'s quantizations as the provider allow-list, and nothing when the route has none', async () => {
    adapterFetch.mockImplementation(async () => completion('Ok.'));
    await adapter.generateText('z-ai/glm-5.3-flash', REQUEST, 'k', { quantizations: ['fp8'] });
    await adapter.generateText('z-ai/glm-5.3-flash', REQUEST, 'k');
    const [first, second] = adapterFetch.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(first.provider).toEqual({ data_collection: 'deny', zdr: true, quantizations: ['fp8'] });
    expect(second.provider).toEqual({ data_collection: 'deny', zdr: true });
  });

  it('times out on the request’s own timeout, else on the adapter’s, and never sends it to the provider', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    try {
      adapterFetch.mockImplementation(async () => completion('Ok.'));
      await adapter.generateText('deepseek/deepseek-v4.1-flash', { ...REQUEST, timeoutMs: 150_000 }, 'k');
      await adapter.generateText('deepseek/deepseek-v4.1-flash', REQUEST, 'k');
      expect(timeout.mock.calls.map((call) => call[0])).toEqual([150_000, 120_000]);
      expect(JSON.parse(adapterFetch.mock.calls[0][1].body)).not.toHaveProperty('timeoutMs');
    } finally {
      timeout.mockRestore();
    }
  });

  it('refuses a :free model before sending anything', async () => {
    await expect(adapter.generateText('qwen/qwen3.8-27b:free', REQUEST, 'k')).rejects.toThrow(':free');
    expect(adapterFetch).not.toHaveBeenCalled();
  });
});

describe('extractStructured on OpenRouter', () => {
  const REQ = { system: 'Estrai.', user: 'Newsletter…', schema: itemSchema, jsonSchema: ITEM_JSON_SCHEMA, name: 'macro_week' };
  const VALID = { items: [{ label: 'BCE', quote: 'La BCE ha tagliato i tassi.' }] };

  it('asks for strict JSON Schema output from providers that honour it, and returns the validated value', async () => {
    fetchMock.mockResolvedValue(completion(JSON.stringify(VALID)));
    expect(await extractStructured('THEBULL_COMPILE', REQ)).toEqual(VALID);
    const body = sentBody();
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'macro_week', strict: true, schema: ITEM_JSON_SCHEMA },
    });
    expect(body.provider).toEqual({ data_collection: 'deny', zdr: true, require_parameters: true });
    expect(body.max_tokens).toBe(4096);
  });

  it('switches the reasoning off on a route that says so, even when the caller sets a ceiling', async () => {
    fetchMock.mockResolvedValue(completion(JSON.stringify(VALID)));
    await extractStructured('THEBULL_COMPILE', { ...REQ, maxTokens: 8000, reasoningMaxTokens: 2000 });
    const body = sentBody();
    expect(body.model).toBe('deepseek/deepseek-v4.1-flash');
    // DeepSeek ignores reasoning.max_tokens and truncates: the ceiling must not reach it.
    expect(body.reasoning).toEqual({ enabled: false });
    expect(body.max_tokens).toBe(8000);
    expect(body.reasoningMaxTokens).toBeUndefined();
  });

  it('accepts JSON wrapped in a markdown fence', async () => {
    fetchMock.mockResolvedValue(completion('```json\n' + JSON.stringify(VALID) + '\n```'));
    expect(await extractStructured('THEBULL_COMPILE', REQ)).toEqual(VALID);
  });

  it('a value zod rejects is null — never a partial value', async () => {
    fetchMock.mockResolvedValue(completion(JSON.stringify({ items: [{ label: 'BCE' }] })));
    expect(await extractStructured('THEBULL_COMPILE', REQ)).toBeNull();
    expect(usageLines()[0]).toMatchObject({ surface: 'THEBULL_COMPILE', outcome: 'rejected' });
  });

  it('text that is not JSON is null', async () => {
    fetchMock.mockResolvedValue(completion('Ecco i dati: BCE giù.'));
    expect(await extractStructured('THEBULL_COMPILE', REQ)).toBeNull();
    expect(usageLines()[0]).toMatchObject({ outcome: 'empty' });
  });
});

describe('the Anthropic adapter (surfaces routed to anthropic)', () => {
  function message(content: unknown[], stop_reason = 'end_turn') {
    return { model: 'claude-haiku-4-5-20251001', content, stop_reason, usage: { input_tokens: 300, output_tokens: 40 } };
  }

  it('without ANTHROPIC_API_KEY returns null and calls nobody', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(
      await extractStructured('MEMORY_EXTRACTION', { system: 's', user: 'u', schema: itemSchema, jsonSchema: ITEM_JSON_SCHEMA })
    ).toBeNull();
    expect(anthropicCreate).not.toHaveBeenCalled();
  });

  it('extracts through a FORCED tool call and validates its input', async () => {
    const valid = { items: [{ label: 'a', quote: 'b' }] };
    anthropicCreate.mockResolvedValue(message([{ type: 'tool_use', name: 'memory', input: valid }], 'tool_use'));
    const value = await extractStructured('MEMORY_EXTRACTION', {
      system: 's',
      user: 'u',
      schema: itemSchema,
      jsonSchema: ITEM_JSON_SCHEMA,
      name: 'memory',
    });
    expect(value).toEqual(valid);
    const params = anthropicCreate.mock.calls[0][0];
    expect(params.model).toBe(AI_MODELS.MEMORY_EXTRACTION.model);
    expect(params.tool_choice).toEqual({ type: 'tool', name: 'memory' });
    expect(params.tools[0].input_schema).toBe(ITEM_JSON_SCHEMA);
    expect(params.thinking).toBeUndefined();
    expect(usageLines()[0]).toEqual({
      surface: 'MEMORY_EXTRACTION',
      provider: 'anthropic',
      model: AI_MODELS.MEMORY_EXTRACTION.model,
      input: 300,
      output: 40,
      outcome: 'ok',
    });
  });

  it('a tool input zod rejects is null', async () => {
    anthropicCreate.mockResolvedValue(message([{ type: 'tool_use', name: 'structured_output', input: { items: 'x' } }]));
    expect(
      await extractStructured('MEMORY_EXTRACTION', { system: 's', user: 'u', schema: itemSchema, jsonSchema: ITEM_JSON_SCHEMA })
    ).toBeNull();
  });

  it('generates text with adaptive thinking, keeping only the text blocks', async () => {
    anthropicCreate.mockResolvedValue(
      message([
        { type: 'thinking', thinking: 'ragiono…' },
        { type: 'text', text: 'Primo. ' },
        { type: 'text', text: 'Secondo.' },
      ])
    );
    const result = await generateText('ASSISTANT', REQUEST);
    expect(result?.text).toBe('Primo. Secondo.');
    expect(result?.provider).toBe('anthropic');
    const params = anthropicCreate.mock.calls[0][0];
    expect(params.thinking).toEqual({ type: 'adaptive' });
    expect(params.output_config).toEqual({ effort: 'high' });
    expect(params.max_tokens).toBe(6000);
    expect(params.system).toBe('Sei un assistente.');
  });

  it('a max_tokens stop is null, as on OpenRouter', async () => {
    anthropicCreate.mockResolvedValue(message([{ type: 'text', text: 'Il mese è' }], 'max_tokens'));
    expect(await generateText('ASSISTANT', REQUEST)).toBeNull();
  });

  it('an SDK error is null', async () => {
    anthropicCreate.mockRejectedValue(new Error('overloaded'));
    expect(await generateText('ASSISTANT', REQUEST)).toBeNull();
  });
});
