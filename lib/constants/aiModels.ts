/**
 * Which provider and which model each AI surface calls, in ONE place.
 *
 * Why a constants file: the AI analysis modal used to print «Generato da Claude Sonnet 4.6» as
 * hand-written copy beside the report. A claim about the tool typed into the copy outlives the
 * tool the moment the route changes model — the same failure as the landing's «6 classi di
 * asset», which stayed on screen for ten days after the union grew to eight. Any surface that
 * NAMES the model reads it from here.
 *
 * Surface → { provider, model } (2026-09-28, doc/ai-open-models-wiki.md § 4): the app's
 * automations — the email comments and, from F3, TheBull's compilation — go through
 * `lib/server/llm` to an OPEN model on OpenRouter; the assistant and Rendimenti's report stay on
 * Anthropic, untouched (they are upstream's code, and switched off on the fork's account).
 *
 * WARNING (Checklist Comment): these routes are not all the same provider nor the same
 * generation, and that is a fact rather than an intention — the performance analysis runs on
 * Sonnet 4.6, the assistant on Sonnet 5, the emails on an open model. Changing one is a product
 * decision (cost and output change with it), so they are listed separately rather than collapsed
 * into one constant that would hide the divergence.
 */

export type LlmProvider = 'anthropic' | 'openrouter';

export interface AiModelRoute {
  provider: LlmProvider;
  /** The provider's own id: `claude-sonnet-5` on Anthropic, `z-ai/glm-5.3-flash` on OpenRouter. */
  model: string;
}

/**
 * Every AI surface of the app. The first three go through `lib/server/llm`; the last three call
 * the Anthropic SDK directly and read only their `model` (the SDK is their provider by code).
 *
 * The open model is PROVISIONAL (GLM 5.3 Flash, the first candidate of § 1 D8): the quick eval
 * (F2) picks the one that stays, the full eval (F6) the definitive one per task.
 */
export const AI_MODELS = {
  /** The comment of the periodic emails (monthly, quarterly, semiannual, yearly). */
  EMAIL_PERIODIC: { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' },
  /** The two sentences of the weekly budget email. */
  EMAIL_WEEKLY_BUDGET: { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' },
  /** TheBull's weekly macro page (F3): structured extraction, every item with its quote. */
  THEBULL_COMPILE: { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' },
  /** The performance report of Rendimenti → «Analizza con AI». */
  PERFORMANCE_ANALYSIS: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  /** The conversational assistant. */
  ASSISTANT: { provider: 'anthropic', model: 'claude-sonnet-5' },
  /** Structured extraction (assistant memory): a small, fast model on purpose. */
  MEMORY_EXTRACTION: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
} as const satisfies Record<string, AiModelRoute>;

export type AiSurface = keyof typeof AI_MODELS;

// The Anthropic-only surfaces keep their string constants: their callers pass them straight to
// the SDK, and leaving those files untouched keeps them identical to upstream's.
export const PERFORMANCE_ANALYSIS_MODEL = AI_MODELS.PERFORMANCE_ANALYSIS.model;
export const ASSISTANT_MODEL = AI_MODELS.ASSISTANT.model;
export const MEMORY_EXTRACTION_MODEL = AI_MODELS.MEMORY_EXTRACTION.model;
