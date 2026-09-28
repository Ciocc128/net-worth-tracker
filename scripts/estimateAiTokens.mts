/**
 * How many tokens each AI surface sends, built from the SAME prompt builders the app calls —
 * without generating a single token (doc/ai-open-models-wiki.md § 3, phase F0).
 *
 * Emulators only: it reads the account seeded there (by default the production mirror,
 * `npm run mirror:seed -- <email>`), builds every prompt the periodic emails and the assistant's
 * modes would send today, and measures it. With `--count` and ANTHROPIC_API_KEY set it asks
 * `messages.countTokens` (no generation); otherwise it estimates at CHARS_PER_TOKEN.
 *
 * What it cannot measure, and says so: output and thinking tokens (they exist only once a model
 * writes — read them in the Anthropic Console, per model and per day), the Rendimenti prompt
 * (built inside a route module, which may export nothing but its handlers) and the memory
 * extraction (a fixed, small prompt).
 *
 *   npm run ai:estimate                   # the mirror account, estimated
 *   npm run ai:estimate -- --count        # exact input counts via countTokens
 *   npm run ai:estimate -- --uid test-user-1
 */
import Anthropic from '@anthropic-ai/sdk';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('ai:estimate reads the EMULATORS only: run it through `npm run ai:estimate`.');
}

const { buildPeriodEmailData, buildEmailAiPrompt, resolveEmailPeriodRange, getMostRecentCompletedQuarterEnd, getMostRecentCompletedHalfYearEnd, getMostRecentCompletedYearEnd } =
  await import('../lib/server/monthlyEmailService');
type EmailPeriodType = import('../lib/server/monthlyEmailService').EmailPeriodType;
const { buildPeriodComparison } = await import('../lib/server/emailPeriodComparison');
const { buildWeeklyBudgetData, buildCommentContext } = await import('../lib/server/weeklyBudgetEmailService');
const { getAssistantMemoryDocument } = await import('../lib/server/assistant/store');
const {
  buildAssistantMonthContext,
  buildAssistantYearContext,
  buildAssistantYtdContext,
  buildAssistantHistoryContext,
  buildAssistantPeriodRangeContext,
} = await import('../lib/services/assistantMonthContextService');
const { buildMonthAnalysisPrompt, buildYearAnalysisPrompt, buildYtdAnalysisPrompt, buildHistoryAnalysisPrompt, buildChatPrompt } =
  await import('../lib/server/assistant/prompts');
const { resolveAssistantWebSearchPolicy } = await import('../lib/server/assistant/webSearchPolicy');
const { EMAIL_ANALYSIS_MODEL, ASSISTANT_MODEL } = await import('../lib/constants/aiModels');
const { getItalyMonthYear } = await import('../lib/utils/dateHelpers');

const args = process.argv.slice(2);
const uidFlag = args.indexOf('--uid');
const UID = uidFlag >= 0 ? args[uidFlag + 1] : process.env.MIRROR_UID || 'prod-mirror';
const EXACT = args.includes('--count');

/** Italian prose with figures runs close to 3,5 characters per token; an estimate, labelled as one. */
const CHARS_PER_TOKEN = 3.5;

/**
 * List prices in $ per million tokens (input, output), read on Artificial Analysis on 2026-09-28
 * (doc/ai-open-models-wiki.md § 7.1). Re-check before deciding anything: they move, and an open
 * model's price differs by host on OpenRouter.
 */
const PRICES: Array<{ label: string; input: number; output: number }> = [
  { label: 'Sonnet 5', input: 2, output: 10 },
  { label: 'Haiku 4.5', input: 1, output: 5 },
  { label: 'GLM 5.3 Flash', input: 0.15, output: 0.5 },
  { label: 'Qwen3.8-Flash-Next', input: 0.15, output: 0.47 },
  { label: 'MiMo-V2.6-Flash', input: 0.14, output: 0.28 },
  { label: 'DeepSeek V4.1 Flash', input: 0.3, output: 1.2 },
];
/** OpenRouter's fee on a card top-up; it applies to the open models only. */
const OPENROUTER_TOPUP_FEE = 0.055;

/** Fixed text of the weekly budget prompt around `buildCommentContext` (~250 tokens), approximated. */
const WEEKLY_BUDGET_TEMPLATE_CHARS = 900;

interface Row {
  surface: string;
  inputTokens: number;
  exact: boolean;
  maxTokens: number;
  webSearch: number;
  note?: string;
}

const anthropic = EXACT && process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
if (EXACT && !anthropic) console.warn('--count needs ANTHROPIC_API_KEY: falling back to the estimate.');

async function measure(model: string, system: string, user: string): Promise<{ tokens: number; exact: boolean }> {
  if (anthropic) {
    const result = await anthropic.messages.countTokens({ model, system, messages: [{ role: 'user', content: user }] });
    return { tokens: result.input_tokens, exact: true };
  }
  return { tokens: Math.round((system.length + user.length) / CHARS_PER_TOKEN), exact: false };
}

const rows: Row[] = [];
const skipped: string[] = [];
const now = new Date();
const { year: thisYear, month: thisMonth } = getItalyMonthYear(now);
const lastMonth = thisMonth === 1 ? { year: thisYear - 1, month: 12 } : { year: thisYear, month: thisMonth - 1 };

const memory = await getAssistantMemoryDocument(UID);
const preferences = memory.preferences;
const memoryItems = memory.items.filter((item) => item.status === 'active');

// ── Periodic emails: the most recent completed period of each type ─────────────────────────────
const EMAIL_MAX_TOKENS: Record<EmailPeriodType, number> = { monthly: 6000, quarterly: 8000, semiannual: 8000, yearly: 10000 };
const emailPeriods: Array<[EmailPeriodType, { year: number; month: number }]> = [
  ['monthly', lastMonth],
  ['quarterly', getMostRecentCompletedQuarterEnd(now)],
  ['semiannual', getMostRecentCompletedHalfYearEnd(now)],
  ['yearly', getMostRecentCompletedYearEnd(now)],
];
for (const [periodType, { year, month }] of emailPeriods) {
  const surface = `Email ${periodType} (${month}/${year})`;
  const emailData = await buildPeriodEmailData(UID, year, month, periodType);
  if (!emailData) {
    skipped.push(`${surface}: nessuno snapshot per il periodo`);
    continue;
  }
  const comparison = await buildPeriodComparison(UID, emailData);
  const bundle = await buildAssistantPeriodRangeContext(UID, resolveEmailPeriodRange(emailData), preferences.includeDummySnapshots);
  const { system, userContent } = buildEmailAiPrompt(emailData, comparison, bundle, preferences, memoryItems);
  const { tokens, exact } = await measure(EMAIL_ANALYSIS_MODEL, system, userContent);
  rows.push({ surface, inputTokens: tokens, exact, maxTokens: EMAIL_MAX_TOKENS[periodType], webSearch: preferences.includeMacroContext ? 3 : 0 });
}

// ── Weekly budget email ────────────────────────────────────────────────────────────────────────
const weekly = await buildWeeklyBudgetData(UID, now);
if (weekly) {
  const context = buildCommentContext(weekly);
  rows.push({
    surface: 'Email budget settimanale',
    inputTokens: Math.round((context.length + WEEKLY_BUDGET_TEMPLATE_CHARS) / CHARS_PER_TOKEN),
    exact: false,
    maxTokens: 400,
    webSearch: 0,
    note: 'template approssimato',
  });
} else {
  skipped.push('Email budget settimanale: nessun budget');
}

// ── Assistant: one first turn per mode (history adds 6–20 stored messages on later turns) ──────
const ASK = 'Analizza il periodo e dimmi cosa conta.';
// Caps and search budget mirror lib/server/assistant/anthropicStream.ts and webSearchPolicy.ts.
const chatSearches = resolveAssistantWebSearchPolicy('chat', ASK, preferences);
const structuredSearches = preferences.includeMacroContext ? 2 : 0;
const assistantModes: Array<[string, () => Promise<{ system: string; userContent: string }>, number, number]> = [
  ['Assistente · mese', async () => buildMonthAnalysisPrompt(await buildAssistantMonthContext(UID, lastMonth, preferences.includeDummySnapshots), ASK, preferences, memoryItems), 18000, structuredSearches],
  ['Assistente · anno', async () => buildYearAnalysisPrompt(await buildAssistantYearContext(UID, thisYear, preferences.includeDummySnapshots), ASK, preferences, memoryItems), 18000, structuredSearches],
  ['Assistente · YTD', async () => buildYtdAnalysisPrompt(await buildAssistantYtdContext(UID, preferences.includeDummySnapshots), ASK, preferences, memoryItems), 18000, structuredSearches],
  ['Assistente · storico (3 anni)', async () => buildHistoryAnalysisPrompt(await buildAssistantHistoryContext(UID, thisYear - 3, preferences.includeDummySnapshots), ASK, preferences, memoryItems), 18000, structuredSearches],
  ['Assistente · chat col mese', async () => buildChatPrompt(ASK, preferences, undefined, memoryItems, await buildAssistantMonthContext(UID, lastMonth, preferences.includeDummySnapshots)), chatSearches ? 16000 : 12000, chatSearches ? 3 : 0],
];
for (const [surface, build, maxTokens, webSearch] of assistantModes) {
  try {
    const { system, userContent } = await build();
    const { tokens, exact } = await measure(ASSISTANT_MODEL, system, userContent);
    rows.push({ surface, inputTokens: tokens, exact, maxTokens, webSearch });
  } catch (error) {
    skipped.push(`${surface}: ${(error as Error).message}`);
  }
}

// ── Report ─────────────────────────────────────────────────────────────────────────────────────
const usd = (value: number) => `${value.toFixed(4)} $`;
const inputCost = (tokens: number, price: number) => (tokens / 1e6) * price;

console.log(`\nAccount: ${UID} · ${EXACT && anthropic ? 'countTokens (esatto)' : `stima a ${CHARS_PER_TOKEN} caratteri/token`}\n`);
console.table(
  rows.map((row) => ({
    Superficie: row.surface,
    'Token input': `${row.inputTokens}${row.exact ? '' : ' ~'}`,
    'max_tokens (tetto output+thinking)': row.maxTokens,
    'web_search max': row.webSearch,
    ...Object.fromEntries(
      PRICES.map((price) => {
        const fee = price.label.includes('Sonnet') || price.label.includes('Haiku') ? 0 : OPENROUTER_TOPUP_FEE;
        const worstCase = (inputCost(row.inputTokens, price.input) + inputCost(row.maxTokens, price.output)) * (1 + fee);
        return [`${price.label} (input · caso peggiore)`, `${usd(inputCost(row.inputTokens, price.input))} · ${usd(worstCase)}`];
      })
    ),
    Note: row.note ?? '',
  }))
);
console.log(
  'Caso peggiore = input + max_tokens interamente spesi in output, commissione OpenRouter inclusa per i modelli open.\n' +
    'Ogni ricerca web costa 0,01 $ e i suoi risultati rientrano come token di INPUT (spesso migliaia): qui non sono contati.\n' +
    'Output e thinking reali: Console Anthropic, per modello e per giorno.\n' +
    'Non misurati qui: Rendimenti «Analizza con AI» (unico consumatore di Sonnet 4.6) ed estrazione memoria (unico di Haiku 4.5).'
);
if (skipped.length > 0) console.log(`\nSaltati:\n- ${skipped.join('\n- ')}`);
process.exit(0);
