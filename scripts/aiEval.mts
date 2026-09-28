/**
 * The AI eval (doc/ai-open-models-wiki.md § 7): which model writes the email comments.
 * F2 (quick eval) picks the PROVISIONAL model on today's emails; F6 re-runs it with the Wiki.
 *
 * Five steps, one subcommand each, all reading and writing ONE directory outside git
 * (`--dir`, default `scratchpad/ai-eval`, gitignored): the bundles are the owner's real figures.
 *
 *   npm run ai:eval:freeze -- --dir <d> [--write]   emulators (the mirror): choose the periods by
 *                                                    rule and print them; --write freezes them
 *   npm run ai:eval -- estimate --dir <d>            the cost of a run, before any money is spent
 *   npm run ai:eval -- run --dir <d> [--models a,b]  PAID: every candidate × every bundle
 *   npm run ai:eval -- blind --dir <d>               the owner's blind page + its separate key
 *   npm run ai:eval -- score --dir <d> --votes <f>   aggregates, the § 7 rule, the spec table
 *
 * A frozen bundle is the EXACT request production sends — system, user and output budget — built
 * by the app's own builders (`buildEmailAiPrompt`, `buildWeeklyBudgetPrompt`), so the eval
 * measures the prompt the cron will send, not a copy of it.
 *
 * `run` calls the production OpenRouter adapter (`createOpenRouterAdapter`), so every request
 * carries the privacy of § 4.3 (`zdr`, `data_collection: deny`, no `:free`) and the reasoning
 * ceiling of `lib/server/llm/budget.ts` — fixed for every model, owner's call: F2 measures how
 * much each one reasons, it does not tune it. The one exception is Sonnet 5, the `medium`
 * reference of § 7: its request asks `effort: medium` instead of a token ceiling (OpenRouter
 * takes one or the other), inside the same `max_tokens`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomInt } from 'node:crypto';
import { runEvalChecks, failedChecks, type EvalBundleContract } from '../lib/utils/aiEvalChecks';
import { pickWinner, scoreModels, type EvalRole, type EvalRun, type EvalVote } from '../lib/utils/aiEvalScore';

// ─── Candidates (§ 7.1, read on 2026-09-28 — owner's roster) ────────────────────────────────

interface Candidate {
  id: string;
  label: string;
  role: EvalRole;
  /** Replaces the reasoning token ceiling with an effort level (Sonnet 5 `medium`). */
  reasoningEffort?: 'low' | 'medium' | 'high';
}

const CANDIDATES: Candidate[] = [
  { id: 'z-ai/glm-5.3-flash', label: 'GLM 5.3 Flash', role: 'candidate' },
  { id: 'minimax/minimax-m3', label: 'MiniMax-M3', role: 'candidate' },
  { id: 'xiaomi/mimo-v2.6-pro', label: 'MiMo-V2.6-Pro', role: 'candidate' },
  { id: 'xiaomi/mimo-v2.6-flash', label: 'MiMo-V2.6-Flash', role: 'control' },
  { id: 'deepseek/deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash', role: 'control' },
  // Added after the owner's votes (2026-09-28): closed OpenAI models with ZDR endpoints on Azure,
  // run on the seven periodic bundles only (the weekly email will not be used).
  { id: 'openai/gpt-5.6-luna', label: 'GPT-5.6 Luna', role: 'candidate' },
  { id: 'openai/gpt-6-luna', label: 'GPT-6 Luna', role: 'candidate' },
  { id: 'anthropic/claude-sonnet-5', label: 'Sonnet 5 medium', role: 'reference', reasoningEffort: 'medium' },
  { id: 'anthropic/claude-haiku-4.5', label: 'Haiku 4.5', role: 'reference' },
];

// ─── Files ──────────────────────────────────────────────────────────────────────────────────

interface FrozenBundle {
  id: string;
  label: string;
  /** Why the rule picked it: «mese con la crescita più alta», … */
  reason: string;
  contract: EvalBundleContract;
  system: string;
  user: string;
  maxTokens: number;
  reasoningMaxTokens: number;
}

interface RunRecord extends EvalRun {
  label: string;
  provider: string | null;
  text: string | null;
  error?: string;
  at: string;
}

const args = process.argv.slice(2);
const command = args[0];
const flag = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};
const DIR = resolve(flag('dir') ?? process.env.AI_EVAL_DIR ?? 'scratchpad/ai-eval');
const BUNDLES_DIR = join(DIR, 'bundles');
const RESULTS = join(DIR, 'results.jsonl');

function loadBundles(): FrozenBundle[] {
  const index = join(DIR, 'bundles.json');
  if (!existsSync(index)) throw new Error(`No frozen bundles in ${DIR}: run ai:eval:freeze -- --write first.`);
  const ids: string[] = JSON.parse(readFileSync(index, 'utf8'));
  return ids.map((id) => JSON.parse(readFileSync(join(BUNDLES_DIR, `${id}.json`), 'utf8')));
}

function loadResults(): RunRecord[] {
  if (!existsSync(RESULTS)) return [];
  return readFileSync(RESULTS, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/** The LAST record per model × bundle: a re-run replaces an earlier attempt. */
function latestResults(): RunRecord[] {
  const byKey = new Map<string, RunRecord>();
  for (const record of loadResults()) byKey.set(`${record.model}|${record.bundleId}`, record);
  return [...byKey.values()];
}

const usd = (value: number | null | undefined, digits = 4) => (value == null ? '—' : `${value.toFixed(digits)} $`);

// ─── freeze ─────────────────────────────────────────────────────────────────────────────────

async function freeze(): Promise<void> {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('freeze reads the EMULATORS only: run it through `npm run ai:eval:freeze`.');
  }
  const write = args.includes('--write');
  const UID = flag('uid') ?? process.env.MIRROR_UID ?? 'prod-mirror';

  const { buildPeriodEmailData, buildEmailAiPrompt, resolveEmailPeriodRange, emailAiOutputBudget } = await import(
    '../lib/server/monthlyEmailService'
  );
  type EmailPeriodType = import('../lib/server/monthlyEmailService').EmailPeriodType;
  type MonthlyEmailData = import('../lib/server/monthlyEmailService').MonthlyEmailData;
  const { buildPeriodComparison } = await import('../lib/server/emailPeriodComparison');
  const { buildWeeklyBudgetData, buildWeeklyBudgetPrompt } = await import('../lib/server/weeklyBudgetEmailService');
  const { getAssistantMemoryDocument } = await import('../lib/server/assistant/store');
  const { buildAssistantPeriodRangeContext } = await import('../lib/services/assistantMonthContextService');
  const { EMAIL_PERIODIC_WORD_LIMITS } = await import('../lib/server/assistant/prompts');
  const { getItalyMonthYear } = await import('../lib/utils/dateHelpers');

  const memory = await getAssistantMemoryDocument(UID);
  const memoryItems = memory.items.filter((item) => item.status === 'active');
  const now = new Date();
  const { year: thisYear, month: thisMonth } = getItalyMonthYear(now);
  const monthName = (year: number, month: number) =>
    new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 15));

  // ── Every completed month with a snapshot: the pool the rules choose from ──────────────
  const months: Array<{ year: number; month: number; data: MonthlyEmailData; overs: number }> = [];
  for (let back = 1; back <= 24; back++) {
    const date = new Date(thisYear, thisMonth - 1 - back, 15);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const data = await buildPeriodEmailData(UID, year, month, 'monthly');
    // A month with no previous snapshot measures the whole net worth as its «change»: not a month.
    if (!data || data.previousNetWorth <= 0) continue;
    const overs = (data.budgetAlerts ?? []).filter((alert) => alert.threshold >= 100 && alert.thresholdCrossed).length;
    months.push({ year, month, data, overs });
  }
  if (months.length === 0) throw new Error(`No monthly snapshot for ${UID}: seed the mirror first.`);

  const chosen: Array<{ year: number; month: number; periodType: EmailPeriodType; reason: string }> = [];
  const taken = (year: number, month: number) => chosen.some((c) => c.periodType === 'monthly' && c.year === year && c.month === month);
  const eur = (value: number) => `${value >= 0 ? '+' : '−'}${Math.round(Math.abs(value)).toLocaleString('it-IT')} €`;
  const pick = (candidates: typeof months, reason: string) => {
    const hit = candidates.find((m) => !taken(m.year, m.month));
    if (hit) {
      const facts = `Δ ${eur(hit.data.netWorthDelta)}, ${hit.overs} budget sforati`;
      chosen.push({ year: hit.year, month: hit.month, periodType: 'monthly', reason: `${reason} (${facts})` });
    }
  };
  pick([...months].sort((a, b) => b.data.netWorthDelta - a.data.netWorthDelta), 'mese buono: la variazione del patrimonio più alta');
  pick([...months].sort((a, b) => a.data.netWorthDelta - b.data.netWorthDelta), 'mese cattivo: la variazione del patrimonio più bassa');
  pick(
    [...months].filter((m) => m.overs > 0).sort((a, b) => b.overs - a.overs || b.year * 12 + b.month - (a.year * 12 + a.month)),
    'mese con più budget sforati'
  );
  pick(months.filter((m) => m.year === 2026 && m.month === 8), 'agosto 2026: il mese del collaudo di F1 e F1b');
  pick(months, 'un altro mese recente');

  // The most recent completed quarter and year (the cron's own choice of window).
  const lastQuarterEnd = (() => {
    const endMonth = Math.floor((thisMonth - 1) / 3) * 3;
    return endMonth === 0 ? { year: thisYear - 1, month: 12 } : { year: thisYear, month: endMonth };
  })();
  chosen.push({ ...lastQuarterEnd, periodType: 'quarterly', reason: 'l’ultimo trimestre concluso' });
  chosen.push({ year: thisYear - 1, month: 12, periodType: 'yearly', reason: 'l’ultimo anno concluso' });

  const periodBundles: FrozenBundle[] = [];
  for (const { year, month, periodType, reason } of chosen) {
    const data =
      periodType === 'monthly'
        ? months.find((m) => m.year === year && m.month === month)!.data
        : await buildPeriodEmailData(UID, year, month, periodType);
    if (!data) {
      console.warn(`skipped ${periodType} ${month}/${year}: no snapshot`);
      continue;
    }
    const comparison = await buildPeriodComparison(UID, data);
    const bundle = await buildAssistantPeriodRangeContext(UID, resolveEmailPeriodRange(data), memory.preferences.includeDummySnapshots);
    const { system, userContent } = buildEmailAiPrompt(data, comparison, bundle, memory.preferences, memoryItems);
    const budget = emailAiOutputBudget(periodType);
    const id = `${periodType}-${year}-${String(month).padStart(2, '0')}`;
    const label =
      periodType === 'monthly' ? monthName(year, month) : periodType === 'yearly' ? `anno ${year}` : `trimestre ${Math.ceil(month / 3)} ${year}`;
    periodBundles.push({
      id,
      label,
      reason,
      contract: { kind: 'periodic', wordLimit: EMAIL_PERIODIC_WORD_LIMITS[periodType], comparisonsMerged: comparison.previousEqualsYoy },
      system,
      user: userContent,
      maxTokens: budget.maxTokens,
      reasoningMaxTokens: budget.reasoningMaxTokens,
    });
  }

  // ── Weekly: three Sundays of this year, at the cron's hour ─────────────────────────────
  const sundays: Array<{ date: Date; data: NonNullable<Awaited<ReturnType<typeof buildWeeklyBudgetData>>> }> = [];
  for (let date = new Date(thisYear, 0, 1, 18); date <= now; date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 18)) {
    if (date.getDay() !== 0) continue;
    const data = await buildWeeklyBudgetData(UID, date);
    if (data) sundays.push({ date, data });
  }
  const weeklyChosen: Array<{ date: Date; data: (typeof sundays)[number]['data']; reason: string }> = [];
  const overCount = (s: (typeof sundays)[number]) => s.data.rows.filter((row) => row.status === 'over').length + (s.data.overall?.status === 'over' ? 1 : 0);
  const pickSunday = (list: typeof sundays, reason: string) => {
    const hit = list.find((s) => !weeklyChosen.some((w) => w.date.getTime() === s.date.getTime()));
    if (hit) weeklyChosen.push({ ...hit, reason });
  };
  pickSunday([...sundays].reverse(), 'l’ultima domenica');
  pickSunday([...sundays].sort((a, b) => overCount(b) - overCount(a)), 'la domenica con più budget oltre il limite');
  pickSunday([...sundays].sort((a, b) => overCount(a) - overCount(b) || a.data.atRiskCount - b.data.atRiskCount), 'una domenica tranquilla');

  const weeklyBundles: FrozenBundle[] = weeklyChosen.map(({ date, data, reason }) => {
    const { system, user, maxTokens, reasoningMaxTokens, wordLimit } = buildWeeklyBudgetPrompt(data);
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return {
      id: `weekly-${iso}`,
      label: `settimanale di domenica ${date.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}`,
      reason: `${reason} (${overCount({ date, data })} oltre il limite, ${data.atRiskCount} a rischio)`,
      contract: { kind: 'weekly', wordLimit },
      system,
      user,
      maxTokens,
      reasoningMaxTokens: reasoningMaxTokens ?? 0,
    };
  });

  const all = [...periodBundles, ...weeklyBundles];
  console.log(`\nAccount ${UID} · ${months.length} mesi con snapshot · ${sundays.length} domeniche con budget\n`);
  console.table(
    all.map((b) => ({
      id: b.id,
      periodo: b.label,
      perché: b.reason,
      'token in ~': Math.round((b.system.length + b.user.length) / 3.1),
      max_tokens: b.maxTokens,
      ragionamento: b.reasoningMaxTokens,
      parole: b.contract.wordLimit,
    }))
  );

  if (!write) {
    console.log('\nNothing written: re-run with --write to freeze these bundles.');
    return;
  }
  mkdirSync(BUNDLES_DIR, { recursive: true });
  for (const bundle of all) writeFileSync(join(BUNDLES_DIR, `${bundle.id}.json`), JSON.stringify(bundle, null, 2));
  writeFileSync(join(DIR, 'bundles.json'), JSON.stringify(all.map((b) => b.id), null, 2));
  console.log(`\nFrozen ${all.length} bundles in ${BUNDLES_DIR}`);
}

// ─── Prices (OpenRouter, the ZDR endpoints only) ────────────────────────────────────────────

interface Pricing {
  /** $/token: the model's list price, what OpenRouter's default routing lands near. */
  input: number;
  output: number;
  /** $/token: the dearest ZDR endpoint — the ceiling of what a run can cost. */
  maxInput: number;
  maxOutput: number;
  zdrEndpoints: number;
}

async function fetchPricing(): Promise<Record<string, Pricing>> {
  const [models, zdr] = await Promise.all([
    fetch('https://openrouter.ai/api/v1/models').then((r) => r.json()),
    fetch('https://openrouter.ai/api/v1/endpoints/zdr').then((r) => r.json()),
  ]);
  const result: Record<string, Pricing> = {};
  for (const candidate of CANDIDATES) {
    const listed = (models.data as Array<{ id: string; pricing: { prompt: string; completion: string } }>).find((m) => m.id === candidate.id);
    const endpoints = (zdr.data as Array<{ model_id: string; pricing: { prompt: string; completion: string } }>).filter(
      (e) => e.model_id === candidate.id
    );
    if (!listed || endpoints.length === 0) {
      throw new Error(`${candidate.id}: ${!listed ? 'not on OpenRouter' : 'no ZDR endpoint'} — the roster must change (§ 7.1).`);
    }
    result[candidate.id] = {
      input: Number(listed.pricing.prompt),
      output: Number(listed.pricing.completion),
      maxInput: Math.max(...endpoints.map((e) => Number(e.pricing.prompt))),
      maxOutput: Math.max(...endpoints.map((e) => Number(e.pricing.completion))),
      zdrEndpoints: endpoints.length,
    };
  }
  return result;
}

// ─── estimate ───────────────────────────────────────────────────────────────────────────────

/** Italian prompts with figures, on GLM's tokenizer: F1 measured 13% more than 3,5 chars/token. */
const CHARS_PER_TOKEN = 3.1;
/** Italian prose (lib/server/llm/budget.ts). */
const TOKENS_PER_WORD = 1.8;

async function estimate(): Promise<void> {
  const bundles = loadBundles();
  const pricing = await fetchPricing();
  const rows = CANDIDATES.map((candidate) => {
    const price = pricing[candidate.id];
    let expected = 0;
    let worst = 0;
    for (const bundle of bundles) {
      const input = (bundle.system.length + bundle.user.length) / CHARS_PER_TOKEN;
      const text = bundle.contract.wordLimit * TOKENS_PER_WORD;
      // Expected: the text plus half the reasoning ceiling; worst: every max_tokens spent, dearest host.
      expected += input * price.input + (text + bundle.reasoningMaxTokens / 2) * price.output;
      worst += input * price.maxInput + bundle.maxTokens * price.maxOutput;
    }
    return { candidate, expected, worst, zdr: price.zdrEndpoints };
  });
  console.table(
    rows.map(({ candidate, expected, worst, zdr }) => ({
      modello: candidate.label,
      ruolo: candidate.role,
      'endpoint ZDR': zdr,
      [`atteso (${bundles.length} bundle)`]: usd(expected),
      'caso peggiore': usd(worst),
    }))
  );
  const total = rows.reduce((sum, row) => sum + row.expected, 0);
  const worstTotal = rows.reduce((sum, row) => sum + row.worst, 0);
  console.log(`\nGiro completo: atteso ${usd(total, 3)}, caso peggiore ${usd(worstTotal, 3)} (+5,5% sulla ricarica OpenRouter).`);
}

// ─── run ────────────────────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set (npm run ai:eval reads .env.local).');
  const { createOpenRouterAdapter } = await import('../lib/server/llm/openrouter');

  const bundles = loadBundles();
  const only = flag('models')?.split(',');
  const onlyBundles = flag('bundles')?.split(',');
  const force = args.includes('--force');
  const candidates = CANDIDATES.filter((c) => !only || only.includes(c.id) || only.includes(c.label));
  const done = new Set(latestResults().filter((r) => r.outcome !== 'error').map((r) => `${r.model}|${r.bundleId}`));

  async function runOne(candidate: Candidate, bundle: FrozenBundle): Promise<void> {
    let provider: string | null = null;
    // The production adapter, with a fetch that reads which host answered and, for an effort
    // reference, swaps the token ceiling for the effort level.
    const adapter = createOpenRouterAdapter({
      fetchImpl: async (input, init) => {
        let body = init?.body;
        if (candidate.reasoningEffort && typeof body === 'string') {
          const parsed = JSON.parse(body);
          parsed.reasoning = { exclude: true, effort: candidate.reasoningEffort };
          body = JSON.stringify(parsed);
        }
        const response = await fetch(input, { ...init, body });
        if (response.ok) {
          provider = ((await response.clone().json()) as { provider?: string }).provider ?? null;
        }
        return response;
      },
    });
    const started = Date.now();
    const base = { model: candidate.id, bundleId: bundle.id, label: candidate.label, at: new Date().toISOString() };
    let record: RunRecord;
    try {
      const response = await adapter.generateText(
        candidate.id,
        { system: bundle.system, user: bundle.user, maxTokens: bundle.maxTokens, reasoningMaxTokens: bundle.reasoningMaxTokens },
        apiKey!
      );
      const text = response.value?.trim() ?? '';
      // The layer's own acceptance rule (lib/server/llm/index.ts): truncated first, then empty.
      const outcome = response.truncated ? 'truncated' : text ? 'ok' : 'empty';
      record = {
        ...base,
        outcome,
        input: response.usage?.input ?? null,
        output: response.usage?.output ?? null,
        reasoning: response.usage?.reasoning ?? null,
        cost: response.usage?.cost ?? null,
        latencyMs: Date.now() - started,
        provider,
        text: text || null,
        checks: outcome === 'ok' ? runEvalChecks(text, `${bundle.system}\n${bundle.user}`, bundle.contract) : undefined,
      };
    } catch (error) {
      record = {
        ...base,
        outcome: 'error',
        input: null,
        output: null,
        reasoning: null,
        cost: null,
        latencyMs: Date.now() - started,
        provider,
        text: null,
        error: (error as Error).message.slice(0, 400),
      };
    }
    appendFileSync(RESULTS, `${JSON.stringify(record)}\n`);
    const failed = record.checks ? failedChecks(record.checks) : [];
    console.log(
      `${candidate.label.padEnd(20)} ${bundle.id.padEnd(22)} ${record.outcome.padEnd(9)} in ${record.input ?? '—'} · out ${record.output ?? '—'} · ragion. ${record.reasoning ?? '—'} · ${usd(record.cost, 5)} · ${(record.latencyMs / 1000).toFixed(0)} s${failed.length ? ` · ✗ ${failed.join(', ')}` : ''}${record.error ? ` · ${record.error}` : ''}`
    );
  }

  mkdirSync(DIR, { recursive: true });
  // Models in parallel, each model's bundles in sequence: one request at a time per provider.
  await Promise.all(
    candidates.map(async (candidate) => {
      for (const bundle of bundles) {
        if (onlyBundles && !onlyBundles.includes(bundle.id)) continue;
        if (!force && done.has(`${candidate.id}|${bundle.id}`)) continue;
        await runOne(candidate, bundle);
      }
    })
  );
  const spent = loadResults().reduce((sum, record) => sum + (record.cost ?? 0), 0);
  console.log(`\nSpesa cumulata in ${RESULTS}: ${usd(spent, 4)}`);
}

// ─── blind ──────────────────────────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Just enough markdown for a comment: headings, bold, italics, lists, paragraphs. */
function renderMarkdown(markdown: string): string {
  const inline = (text: string) =>
    escapeHtml(text)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  const html: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  const closeList = () => {
    if (list) html.push(`</${list}>`);
    list = null;
  };
  for (const line of markdown.split('\n')) {
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (heading) {
      closeList();
      html.push(`<h4>${inline(heading[2])}</h4>`);
    } else if (bullet || numbered) {
      const kind = bullet ? 'ul' : 'ol';
      if (list !== kind) {
        closeList();
        html.push(`<${kind}>`);
        list = kind;
      }
      html.push(`<li>${inline((bullet ?? numbered)![1])}</li>`);
    } else if (line.trim() === '') {
      closeList();
    } else {
      closeList();
      html.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return html.join('\n');
}

function blind(): void {
  const bundles = loadBundles();
  const results = latestResults().filter((record) => record.outcome === 'ok' && record.text);
  const letters = 'ABCDEFGHIJ';
  const key: Record<string, Record<string, string>> = {};
  const sections: string[] = [];

  for (const bundle of bundles) {
    const texts = results.filter((record) => record.bundleId === bundle.id);
    if (texts.length === 0) continue;
    // Fisher–Yates with a crypto source: the order must not leak the roster's order.
    const shuffled = [...texts];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    key[bundle.id] = Object.fromEntries(shuffled.map((record, index) => [letters[index], record.model]));
    const cards = shuffled
      .map(
        (record, index) => `
        <article class="card" data-bundle="${bundle.id}" data-letter="${letters[index]}">
          <header><span class="letter">${letters[index]}</span></header>
          <div class="md">${renderMarkdown(record.text!)}</div>
          <footer>
            ${(['utilita', 'tono'] as const)
              .map(
                (axis) => `<fieldset><legend>${axis === 'utilita' ? 'Utilità' : 'Tono'}</legend>${[1, 2, 3, 4, 5]
                  .map(
                    (score) =>
                      `<label><input type="radio" name="${bundle.id}-${letters[index]}-${axis}" value="${score}" data-axis="${axis}">${score}</label>`
                  )
                  .join('')}</fieldset>`
              )
              .join('')}
          </footer>
        </article>`
      )
      .join('');
    sections.push(`
      <section>
        <h2>${escapeHtml(bundle.label)}</h2>
        <p class="scope">${bundle.contract.kind === 'weekly' ? 'Email budget settimanale' : 'Email periodica'} · limite ${bundle.contract.wordLimit} parole · ${texts.length} versioni</p>
        <div class="cards">${cards}</div>
      </section>`);
  }

  const page = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Giudizio alla cieca</title>
<style>
  :root { --bg:#f7f7f5; --fg:#1b1b1b; --muted:#6b6b6b; --card:#fff; --line:#e3e3df; --accent:#3d5a1e; }
  @media (prefers-color-scheme: dark) { :root { --bg:#141414; --fg:#ececec; --muted:#9a9a9a; --card:#1e1e1e; --line:#333; --accent:#b5d77a; } }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.55 system-ui, sans-serif; }
  main { max-width:1500px; margin:0 auto; padding:24px 16px 120px; }
  h1 { font-size:22px; margin:0 0 4px; } h2 { font-size:18px; margin:40px 0 2px; } h4 { margin:14px 0 4px; font-size:15px; }
  .scope, .intro { color:var(--muted); margin:0 0 12px; }
  .cards { display:grid; grid-template-columns:repeat(auto-fill, minmax(340px, 1fr)); gap:16px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px; display:flex; flex-direction:column; }
  .letter { font-weight:700; font-size:20px; color:var(--accent); }
  .md { flex:1; } .md p { margin:6px 0; } .md ul, .md ol { padding-left:20px; margin:6px 0; }
  footer { display:flex; gap:12px; flex-wrap:wrap; border-top:1px solid var(--line); margin-top:12px; padding-top:10px; }
  fieldset { border:0; padding:0; margin:0; display:flex; gap:6px; align-items:center; }
  legend { float:left; margin-right:6px; color:var(--muted); font-size:13px; }
  label { display:inline-flex; align-items:center; gap:2px; min-width:44px; min-height:44px; justify-content:center; cursor:pointer; }
  .bar { position:fixed; left:0; right:0; bottom:0; background:var(--card); border-top:1px solid var(--line); padding:12px 16px; display:flex; gap:16px; align-items:center; justify-content:center; }
  button { font:inherit; padding:10px 18px; border-radius:999px; border:1px solid var(--accent); background:var(--accent); color:var(--bg); cursor:pointer; }
</style></head>
<body><main>
  <h1>Giudizio alla cieca</h1>
  <p class="intro">Per ogni periodo, le versioni in ordine casuale. Voto 1–5 su utilità e tono. I voti restano in questo browser; «Esporta voti» scarica il file per lo scoring. La chiave lettera → modello non è in questa pagina.</p>
  ${sections.join('\n')}
</main>
<div class="bar"><span id="count"></span><button id="export" type="button">Esporta voti</button></div>
<script>
  const STORE = 'ai-eval-votes';
  let votes = {};
  try { votes = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) {}
  const inputs = [...document.querySelectorAll('input[type=radio]')];
  const total = document.querySelectorAll('.card').length * 2;
  function sync() {
    let n = 0;
    for (const input of inputs) {
      const card = input.closest('.card');
      const v = ((votes[card.dataset.bundle] || {})[card.dataset.letter] || {})[input.dataset.axis];
      input.checked = String(v) === input.value;
      if (input.checked) n++;
    }
    document.getElementById('count').textContent = n + ' voti su ' + total;
  }
  for (const input of inputs) input.addEventListener('change', () => {
    const card = input.closest('.card');
    votes[card.dataset.bundle] = votes[card.dataset.bundle] || {};
    votes[card.dataset.bundle][card.dataset.letter] = votes[card.dataset.bundle][card.dataset.letter] || {};
    votes[card.dataset.bundle][card.dataset.letter][input.dataset.axis] = Number(input.value);
    try { localStorage.setItem(STORE, JSON.stringify(votes)); } catch (e) {}
    sync();
  });
  document.getElementById('export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(votes, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'votes.json'; a.click();
  });
  sync();
</script>
</body></html>`;

  writeFileSync(join(DIR, 'blind.html'), page);
  writeFileSync(join(DIR, 'key.json'), JSON.stringify(key, null, 2));
  const cards = Object.values(key).reduce((sum, byLetter) => sum + Object.keys(byLetter).length, 0);
  console.log(`${cards} commenti su ${Object.keys(key).length} periodi → ${join(DIR, 'blind.html')} (chiave: key.json, a parte)`);
}

// ─── score ──────────────────────────────────────────────────────────────────────────────────

function score(): void {
  const bundles = loadBundles();
  // The checks are re-run on the stored texts: a fix to a check never needs a paid run.
  const results = latestResults().map((record) => {
    const bundle = bundles.find((b) => b.id === record.bundleId);
    return record.outcome === 'ok' && record.text && bundle
      ? { ...record, checks: runEvalChecks(record.text, `${bundle.system}\n${bundle.user}`, bundle.contract) }
      : record;
  });
  const votesFile = flag('votes') ?? join(DIR, 'votes.json');
  const key: Record<string, Record<string, string>> = existsSync(join(DIR, 'key.json'))
    ? JSON.parse(readFileSync(join(DIR, 'key.json'), 'utf8'))
    : {};
  const byLetter: Record<string, Record<string, Partial<EvalVote>>> = existsSync(votesFile) ? JSON.parse(readFileSync(votesFile, 'utf8')) : {};

  // Letters back to models; a half-voted card (one axis only) is left out.
  const votes: Record<string, Record<string, EvalVote>> = {};
  for (const [bundleId, letters] of Object.entries(byLetter)) {
    for (const [letter, vote] of Object.entries(letters)) {
      const model = key[bundleId]?.[letter];
      if (!model || typeof vote.utilita !== 'number' || typeof vote.tono !== 'number') continue;
      (votes[bundleId] ??= {})[model] = { utilita: vote.utilita, tono: vote.tono };
    }
  }

  const scores = scoreModels(
    CANDIDATES.map((c) => ({ model: c.id, role: c.role })),
    results.filter((r) => bundles.some((b) => b.id === r.bundleId)),
    votes
  );
  const verdict = pickWinner(scores);
  const label = (id: string) => CANDIDATES.find((c) => c.id === id)?.label ?? id;
  const n = (value: number | null, digits = 0) => (value == null ? '—' : value.toLocaleString('it-IT', { maximumFractionDigits: digits, minimumFractionDigits: digits }));
  const role = { candidate: 'candidato', control: 'controllo', reference: 'riferimento' } as const;

  const lines = [
    '| Modello | Ruolo | Esiti ok | Troncati | Esecuzioni fallite | Cifre · parole · forma · promesse · italiano | Cifre non nel prompt | Token in · out · ragion. (media) | Costo vero / email | Utilità · tono |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...scores.map(
      (s) =>
        `| ${label(s.model)} | ${role[s.role]} | ${s.ok}/${s.runs} | ${s.truncated} | ${s.failedRuns} | ${s.failuresByCheck.figures} · ${s.failuresByCheck.words} · ${s.failuresByCheck.form} · ${s.failuresByCheck.promises} · ${s.failuresByCheck.italian} | ${s.unverifiedFigures} | ${n(s.meanInput)} · ${n(s.meanOutput)} · ${n(s.meanReasoning)} | ${s.meanCost == null ? '—' : `${n(s.meanCost, 4)} $`} | ${n(s.meanUtilita, 1)} · ${n(s.meanTono, 1)} |`
    ),
  ];
  console.log(`\n${lines.join('\n')}\n`);
  console.log(`Miglior riferimento: ${verdict.bestReference ? `${label(verdict.bestReference.model)} (voto ${n(verdict.bestReference.meanVote, 2)}, ${verdict.bestReference.failedRuns} esecuzioni fallite)` : '—'}`);
  for (const [model, reason] of Object.entries(verdict.reasons)) console.log(`- ${label(model)}: ${reason}`);
  console.log(`\nVincitore: ${verdict.winner ? `${label(verdict.winner)} (${verdict.winner})` : 'nessuno'}`);

  // The details of every failed check, so a false positive can be told from a real slip.
  console.log('\nControlli falliti, per esteso:');
  for (const record of results) {
    const failed = record.checks ? failedChecks(record.checks) : [];
    if (record.outcome !== 'ok') console.log(`- ${label(record.model)} · ${record.bundleId}: ${record.outcome}${record.error ? ` (${record.error})` : ''}`);
    for (const id of failed) console.log(`- ${label(record.model)} · ${record.bundleId} · ${id}: ${record.checks![id].details.join(' | ')}`);
  }
  writeFileSync(join(DIR, 'score.md'), `${lines.join('\n')}\n`);
}

// ─── main ───────────────────────────────────────────────────────────────────────────────────

const commands: Record<string, () => unknown> = { freeze, estimate, run, blind, score };
if (!command || !commands[command]) {
  console.error(`usage: aiEval.mts <${Object.keys(commands).join('|')}> [--dir <d>]`);
  process.exit(1);
}
await commands[command]();
process.exit(0);
