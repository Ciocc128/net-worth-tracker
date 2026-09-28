/**
 * The output budget of a comment, derived from its CONTRACT, never from a model (2026-09-28).
 *
 * `max_tokens` is a ceiling, not a price: a provider bills the tokens it generates. What wastes
 * money is a TRUNCATED answer — paid in full, then discarded by the layer (`outcome: truncated`),
 * and the email leaves without its comment. On a reasoning model `max_tokens` covers the
 * reasoning AND the text, and the reasoning can use almost all of it: the F1b verification spent
 * 5.450 of 6.000 on one August comment (F1's run of the same email: 729). So:
 *
 *   - the reasoning gets its OWN ceiling (`reasoningMaxTokens`) — the one place spending can run;
 *   - the text gets room for the contract's word limit, twice over (`TEXT_MARGIN`), at
 *     `TOKENS_PER_WORD` — Italian prose, the estimate of doc/ai-open-models-wiki.md § 2;
 *   - `maxTokens` is their sum, so the text's share can never be eaten.
 *
 * Nothing here is tuned to a model: the eval of F2 may pick another one, and these ceilings stay
 * right as long as it writes Italian within the contract. How much each candidate reasons is in
 * the `[ai-usage]` line (`reasoning`), which is where a budget gets revised.
 */

/** Tokens per Italian word of prose (doc/ai-open-models-wiki.md § 2). */
export const TOKENS_PER_WORD = 1.8;

/** The text's room over its word limit: a comment at the limit uses half of it. */
export const TEXT_MARGIN = 2;

export interface OutputBudget {
  maxTokens: number;
  reasoningMaxTokens: number;
}

export function outputBudget(input: { wordLimit: number; reasoningTokens: number }): OutputBudget {
  const text = Math.ceil(input.wordLimit * TOKENS_PER_WORD * TEXT_MARGIN);
  return { maxTokens: input.reasoningTokens + text, reasoningMaxTokens: input.reasoningTokens };
}
