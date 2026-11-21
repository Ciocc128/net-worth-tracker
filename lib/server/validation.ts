import 'server-only';
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { ASSET_CLASS_SEQUENCE } from '@/lib/utils/allocationUtils';
import type { AssetClass } from '@/types/assets';
import { ASSISTANT_PROMPT_MAX_LENGTH } from '@/lib/constants/assistantPrompts';

/**
 * Server-side input validation schemas (SEC-3).
 *
 * These schemas are the authoritative runtime gate for untrusted data arriving
 * at API boundaries. Client-side Zod schemas in forms are a UX convenience only
 * — they can be bypassed by writing directly to Firestore or crafting raw HTTP
 * requests. Validate here regardless of what the client-side already checked.
 *
 * WARNING: If you add a new schema for a sensitive field, also apply it at every
 * call site (route handler AND service layer for inputs that originate from
 * Firestore rather than the HTTP request).
 */

/** ISIN: 2 country letters + 9 alphanumeric + 1 check digit. */
export const isinSchema = z
  .string()
  .regex(/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/, 'Invalid ISIN format');

/** Yahoo Finance ticker: letters, digits, and the symbols Yahoo uses (., -, ^, =). */
export const tickerSchema = z
  .string()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9.^=\-]+$/, 'Invalid ticker format');

/**
 * An ISO date string, coerced to a Date. The `string` first: `z.coerce.date()` alone turns `null`
 * into 1970-01-01 and a number into a timestamp, and a missing date must be a 400, not an epoch.
 */
const isoDateSchema = z.string().min(1).pipe(z.coerce.date());

/**
 * POST /api/portfolio/snapshot — the automatic writer (doc/snapshot-integri/README.md RI6). STRICT:
 * a `year`/`month` (or any other key) is a 400, never silently dropped — a caller naming March 2024
 * must not get the current month rewritten and a 200. The target is always the current month.
 */
export const snapshotRequestSchema = z
  .object({
    userId: z.string().min(1),
    cronSecret: z.string().optional(),
  })
  .strict();

const finiteNumber = z.number().finite();
const snapshotYearSchema = z.number().int().min(1900).max(2100);
const snapshotMonthSchema = z.number().int().min(1).max(12);

/**
 * POST /api/portfolio/snapshot/manual (doc/snapshot-integri/README.md RI7, A5). Strict: the
 * percentages (`assetAllocation`) and `createdAt` the dialog used to send are refused — the builder
 * derives the first and stamps the second. A net worth below zero is legal (loans). The coherence
 * of the sums and the future month are the route's checks (RI8), after this one.
 */
export const manualSnapshotSchema = z
  .object({
    userId: z.string().min(1),
    year: snapshotYearSchema,
    month: snapshotMonthSchema,
    totalNetWorth: finiteNumber,
    liquidNetWorth: finiteNumber,
    illiquidNetWorth: finiteNumber,
    byAssetClass: z.partialRecord(z.enum(ASSET_CLASS_SEQUENCE as [AssetClass, ...AssetClass[]]), finiteNumber),
    byAsset: z
      .array(
        z
          .object({
            assetId: z.string().min(1).max(200),
            ticker: z.string().max(200),
            name: z.string().max(200),
            quantity: finiteNumber,
            price: finiteNumber,
            totalValue: finiteNumber,
          })
          .strict()
      )
      .max(500)
      .optional(),
    replace: z.boolean().optional(),
  })
  .strict();

/** POST /api/portfolio/snapshot/restore (RI10): the month whose previous version comes back. */
export const snapshotRestoreSchema = z
  .object({
    userId: z.string().min(1),
    year: snapshotYearSchema,
    month: snapshotMonthSchema,
  })
  .strict();

// ─── A5: the five routes that read their body unchecked (doc/snapshot-integri/README.md § 5.9) ──

const accountOnlySchema = z.object({ userId: z.string().min(1) }).strict();

/** POST /api/hall-of-fame/recalculate. */
export const hallOfFameRecalculateSchema = accountOnlySchema;
/** POST /api/prices/update. */
export const pricesUpdateSchema = accountOnlySchema;
/** DELETE /api/assets/[assetId]: the body; the path's id is `assetIdParamSchema`. */
export const assetDeleteSchema = z.object({ userId: z.string().min(1), ledger: z.enum(['keep', 'delete']).optional() }).strict();
/** The `[assetId]` of a path: non-empty, at most 200 characters, never a path. */
export const assetIdParamSchema = z.string().min(1).max(200).regex(/^[^/]+$/, 'Invalid asset id');

const shortId = z.string().min(1).max(200);
const assistantText = z.string().max(2000);

/** `AssistantPreferences` (types/assistant.ts), every key optional: a PATCH sends only what changed. */
const assistantPreferencesSchema = z
  .object({
    responseStyle: z.enum(['balanced', 'concise', 'deep']),
    includeMacroContext: z.boolean(),
    memoryEnabled: z.boolean(),
    includeDummySnapshots: z.boolean(),
  })
  .partial()
  .strict();

/** The edit of a memory item from the panel: the text, the category, the status. */
const assistantMemoryItemPatchSchema = z
  .object({
    id: shortId,
    text: assistantText.min(1),
    category: z.enum(['goal', 'preference', 'risk', 'fact']),
    status: z.enum(['active', 'completed', 'archived']).optional(),
  })
  .strict();

const assistantGoalEvaluationSchema = z
  .object({
    matched: z.boolean(),
    metricValue: z.number().finite().nullable(),
    targetValue: z.number().finite(),
    unit: z.enum(['eur', 'percent']),
    evaluatedAgainst: z.enum(['cash', 'liquid_net_worth', 'total_net_worth', 'asset_class_value', 'sub_category_value', 'asset_class_percentage']),
    evaluatedPeriod: z.object({ year: snapshotYearSchema, month: snapshotMonthSchema }).strict().optional(),
    deadlinePassed: z.boolean().optional(),
    summary: assistantText,
  })
  .strict();

const assistantMemorySuggestionSchema = z
  .object({
    id: shortId,
    itemId: shortId,
    type: z.literal('complete_goal'),
    status: z.enum(['pending', 'ignored', 'accepted']),
    evidenceSummary: assistantText,
    evaluation: assistantGoalEvaluationSchema,
  })
  .strict();

/** PATCH /api/ai/assistant/memory. */
export const assistantMemoryPatchSchema = z
  .object({
    userId: z.string().min(1),
    action: z.enum(['acceptSuggestion', 'ignoreSuggestion', 'reactivateGoal']).optional(),
    suggestionId: shortId.optional(),
    itemId: shortId.optional(),
    preferences: assistantPreferencesSchema.optional(),
    item: assistantMemoryItemPatchSchema.optional(),
    suggestion: assistantMemorySuggestionSchema.optional(),
  })
  .strict();

/** DELETE /api/ai/assistant/memory. */
export const assistantMemoryDeleteSchema = z
  .object({
    userId: z.string().min(1),
    itemId: shortId.optional(),
    resetAll: z.boolean().optional(),
  })
  .strict();

/** The stream prompt's cap (D-SN11; kept by F04's limits of A3, RU11 / D-SI16), shared with the composer. */
export { ASSISTANT_PROMPT_MAX_LENGTH };

/** POST /api/ai/assistant/stream. */
export const assistantStreamRequestSchema = z
  .object({
    userId: z.string().min(1),
    mode: z.enum(['month_analysis', 'year_analysis', 'ytd_analysis', 'history_analysis', 'chat']),
    prompt: z
      .string()
      .max(ASSISTANT_PROMPT_MAX_LENGTH)
      .refine((value) => value.trim().length > 0, 'Il messaggio è vuoto'),
    threadId: shortId.optional(),
    month: z.object({ year: snapshotYearSchema, month: snapshotMonthSchema }).strict().optional(),
    year: snapshotYearSchema.optional(),
    chatContext: z.enum(['none', 'month', 'year', 'ytd', 'history']).optional(),
    // Partial: the route lays it over the defaults (`getDefaultAssistantPreferences`).
    preferences: assistantPreferencesSchema.optional(),
  })
  .strict();

const nullableMetric = finiteNumber.nullable();

/**
 * POST /api/ai/analyze-performance (doc/sicurezza/S2-utenti-ammessi.md RU10, A3): `metrics` keeps
 * ONLY the 22 fields `buildAnalysisPrompt` reads, every other key dropped (the client sends the
 * whole `PerformanceMetrics`, `cashFlows` included). No free string longer than 20 characters can
 * reach the prompt. Not strict on purpose: the extra keys of a real `PerformanceMetrics` are dropped,
 * not refused.
 */
export const performanceAnalysisRequestSchema = z.object({
  userId: z.string().min(1),
  timePeriod: z.enum(['YTD', '1Y', '3Y', '5Y', 'ALL', 'ROLLING_12M', 'CUSTOM']),
  metrics: z.object({
    roi: nullableMetric,
    cagr: nullableMetric,
    timeWeightedReturn: nullableMetric,
    moneyWeightedReturn: nullableMetric,
    volatility: nullableMetric,
    sharpeRatio: nullableMetric,
    maxDrawdown: nullableMetric,
    drawdownDuration: nullableMetric,
    recoveryTime: nullableMetric,
    yocGross: nullableMetric,
    yocNet: nullableMetric,
    currentYield: nullableMetric,
    currentYieldNet: nullableMetric,
    startNetWorth: finiteNumber,
    endNetWorth: finiteNumber,
    netCashFlow: finiteNumber,
    numberOfMonths: finiteNumber,
    measuredFlowMonths: finiteNumber,
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    maxDrawdownDate: z.string().max(20).optional(),
    flowSource: z.enum(['cashflow', 'portfolio', 'mixed']),
  }),
});

export type PerformanceAnalysisRequest = z.infer<typeof performanceAnalysisRequestSchema>;

/**
 * POST /api/dividends/sync-expenses: the account and the category, nothing else
 * (doc/sicurezza/README.md RS1). Not strict on purpose: a tab of the previous build still sends
 * `dividends`, `categoryName`, `subCategoryName` — they are dropped here, never read.
 */
export const dividendSyncRequestSchema = z.object({
  userId: z.string().min(1),
  categoryId: z.string().min(1),
  subCategoryId: z.string().optional().nullable(),
});

/** Covers the server-relevant subset of DividendFormData fields. */
export const dividendDataSchema = z.object({
  assetId: z.string().min(1),
  // Dates arrive as ISO strings in JSON (a Date the client could not build serializes as null).
  exDate: isoDateSchema,
  paymentDate: isoDateSchema,
  dividendPerShare: z.number().finite(),
  quantity: z.number().finite(),
  grossAmount: z.number().finite(),
  taxAmount: z.number().finite(),
  netAmount: z.number().finite(),
  currency: z.string().min(1).max(10),
  dividendType: z.enum([
    'ordinary',
    'extraordinary',
    'interim',
    'final',
    'coupon',
    'finalPremium',
  ]),
  notes: z.string().optional(),
  isAutoGenerated: z.boolean(),
  // Inflation-linked provisional coupon flag (fixed-only, awaiting the announced FOI rate).
  isProvisional: z.boolean().optional(),
  // Optional ISIN present on some dividend payloads (bond coupons); validate if provided.
  assetIsin: isinSchema.optional(),
  // Server-set cost basis snapshot — validated if present in the payload.
  costPerShare: z.number().finite().optional(),
});

/**
 * Asset trade-ledger schemas (Registro operazioni asset).
 *
 * These are the HTTP-boundary gate. Semantic checks that need Firestore data (asset exists and is
 * a ledger type, date not in the future, linked asset is `cash`, no-negative-position replay with
 * the baseline first) live in the use-case layer, NOT here.
 */
const assetTransactionTypeSchema = z.enum(['buy', 'sell', 'adjustment']);

/**
 * Base object shape, without cross-field refinements. Extracted so the update schema can build on
 * it with `.partial()`/`.omit()`: those methods live on ZodObject, and adding a `.superRefine()`
 * turns the schema into a ZodEffects that no longer exposes them.
 */
const assetTransactionBaseSchema = z.object({
  assetId: z.string().min(1),
  type: assetTransactionTypeSchema,
  // Dates arrive as ISO strings in JSON (a Date the client could not build serializes as null).
  date: isoDateSchema,
  quantity: z.number().finite().min(0),
  pricePerUnit: z.number().finite().min(0),
  fees: z.number().finite().min(0).optional(),
  linkedCashAssetId: z.string().min(1).optional(),
  // SELL only: the capital-gains tax the broker withheld, EUR. 0 is a value (no tax due).
  withheldTaxEur: z.number().finite().min(0).optional(),
  // BTP€i: the indexation coefficient behind pricePerUnit (metadata for the edit form; > 0).
  indexationCoefficient: z.number().finite().positive().optional(),
  note: z.string().max(500).optional(),
});

/** Cross-field rules shared by create and update. `type`/`quantity` may be absent on an update. */
function refineAssetTransaction(
  data: {
    type?: 'buy' | 'sell' | 'adjustment';
    quantity?: number;
    fees?: number;
    linkedCashAssetId?: string;
    withheldTaxEur?: number;
  },
  ctx: z.RefinementCtx
): void {
  // buy/sell need a strictly positive quantity; adjustment allows 0 (position-close correction).
  if (data.type !== undefined && data.type !== 'adjustment' && data.quantity !== undefined && data.quantity <= 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['quantity'],
      message: 'La quantità deve essere maggiore di zero per acquisti e vendite.',
    });
  }
  // An absolute reset moves no money: fees and a linked cash settlement make no sense on it.
  if (data.type === 'adjustment' && data.fees !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fees'],
      message: 'Una rettifica non prevede commissioni.',
    });
  }
  if (data.type === 'adjustment' && data.linkedCashAssetId !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['linkedCashAssetId'],
      message: 'Una rettifica non movimenta liquidità.',
    });
  }
  // A withheld tax exists only on a sale. `type` absent (a partial update) is judged by the use
  // case, which knows the stored type and drops the field from a trade that is not a sell.
  if (data.type !== undefined && data.type !== 'sell' && data.withheldTaxEur !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['withheldTaxEur'],
      message: 'Le tasse trattenute si indicano solo su una vendita.',
    });
  }
}

export const assetTransactionDataSchema = assetTransactionBaseSchema.superRefine(refineAssetTransaction);

/** PUT payload: every field optional, and a trade can never be moved to another asset. */
export const assetTransactionUpdateSchema = assetTransactionBaseSchema
  .omit({ assetId: true })
  .partial()
  .superRefine(refineAssetTransaction);

/**
 * GET /api/ai/assistant/threads?after= — the cursor of the next page is a thread id: never empty
 * (`.doc('')` throws) and never a path (a slash would address a subcollection).
 */
export const assistantThreadCursorSchema = z
  .string()
  .min(1)
  .max(1500)
  .regex(/^[^/]+$/, 'Invalid thread cursor');

/**
 * GET /api/ai/assistant/context?includeDummy= — the test-snapshot preference the page already
 * holds, as a query string: the two literals and nothing else, so a typo is a 400 and never a
 * silent `false`.
 */
export const assistantIncludeDummySchema = z.enum(['true', 'false']);

/**
 * POST /api/performance/yields — the dividend windows of the periods Rendimenti shows (five
 * pre-computed, or one custom range, or the PDF's one).
 */
export const performanceYieldsRequestSchema = z.object({
  userId: z.string().min(1),
  periods: z
    .array(
      z.object({
        key: z.string().min(1).max(32),
        startDate: isoDateSchema,
        dividendEndDate: isoDateSchema,
        numberOfMonths: z.number().int().min(0).max(1200),
      })
    )
    .min(1)
    .max(8),
});

/**
 * Goal-Based Investing: the assistant's ```goal-proposal payload IS the body of
 * POST /api/goals, so there is one schema for both.
 *
 * It is defined in `lib/utils/goalProposal.ts` rather than here because the proposal
 * card validates the same payload in the browser before rendering, and this module is
 * `server-only`. Re-exported so route handlers still reach their schemas from one place.
 */
export { goalProposalSchema } from '@/lib/utils/goalProposal';

/**
 * Parse helper: runs safeParse and returns either the typed data or a
 * ready-to-return 400 NextResponse with flattened zod error details.
 */
export function parseOr400<T>(
  schema: z.ZodType<T>,
  data: unknown
): { ok: true; data: T } | { ok: false; response: NextResponse } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return {
    ok: false,
    response: NextResponse.json(
      { error: 'Invalid request', details: result.error.flatten() },
      { status: 400 }
    ),
  };
}
