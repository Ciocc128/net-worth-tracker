# Email periodiche e PDF export

> **Quando aprire questa guida** — chi tocca `lib/server/{monthlyEmailService,weeklyBudgetEmailService,emailHtml,emailPeriodComparison}.ts`, `lib/utils/{emailNarrative,pdfNarrative}.ts`, `lib/utils/pdfGenerator.tsx`, `lib/services/pdfDataService.ts`, `components/pdf/*`, `lib/constants/printTokens.ts`, il cron `app/api/cron/monthly-snapshot/route.ts`. Entrambe rendono fuori dal DOM: si verificano renderizzandole, e nessuna verifica è nella suite. In `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa. File: § *Files*, sotto.

## Files

Moved here from `CLAUDE.md` → *Key Files* on 2026-09-19.

- **Email · PDF · token fuori dal DOM**: `lib/constants/printTokens.ts` (l'unica sede di un hex fuori dal DOM); email `lib/utils/emailNarrative.ts` (parole), `lib/server/emailHtml.ts` (chrome, tabelle annidate), `lib/server/{monthlyEmailService,weeklyBudgetEmailService,emailPeriodComparison}.ts`; the AI comment's provider layer `lib/server/llm/{index,openrouter,anthropic,types,budget}.ts` + `lib/constants/aiModels.ts` (surface → provider and model), tests `__tests__/llmProvider.test.ts`; the model eval (F2, doc/ai-open-models-wiki.md § 7) `scripts/aiEval.mts` (`npm run ai:eval:freeze` on the emulators, `npm run ai:eval` for estimate · run · blind · score, data OUTSIDE git) + `lib/utils/{aiEvalChecks,aiEvalScore}.ts`, tests `__tests__/{aiEvalChecks,aiEvalScore}.test.ts`; the portfolio half of the periodic email `lib/utils/emailPortfolio.ts` (F1b: Driver, allocation, class moves, trades, TWR — composed from the pages' modules, `lib/utils/allocationComparison.ts` among them), tests `__tests__/{emailPortfolio,allocationComparison}.test.ts`; PDF `lib/utils/pdfNarrative.ts` (`pdfSafeText` = il confine WinAnsi), `components/pdf/primitives/*` (`PDF_RAMP`), `lib/utils/pdfGenerator.tsx` → `lib/services/pdfDataService.ts` → `components/pdf/{PDFDocument,sections/*}`, `lib/utils/pdfTimeFilters.ts`, `types/pdf.ts`; cron `app/api/cron/monthly-snapshot/route.ts` (phases 2-9), `lib/server/{assetAdminRepository,dividendUseCase,dividendProcessor}.ts`

## PDF Export (`lib/utils/pdfGenerator.tsx`, `lib/services/pdfDataService.ts`, `lib/utils/pdfTimeFilters.ts`)

- Seven configurable sections with a Total/Annual/Monthly filter. On Cashflow, **Export Totale applies
  `cashflowHistoryStartYear` as a floor** (fallback 2025); Storico, Rendimenti and FIRE stay unbounded — do not "fix"
  the asymmetry, the cashflow before the floor is bulk-imported noise. **The Cashflow section DECLARES that floor**
  in its scope line and in a note (`historyFloorYear` on `CashflowData`, set only for a Totale export): a reader told
  "Totale" otherwise reads the missing years as years without spending (DESIGN → *The Declared-Window Rule*).
- **The Rendimenti section measures the SAME base as the page** (2026-09-07, issue #324): `preparePerformanceData`
  receives the assets, reads the pension contributions and resolves `resolvePerformanceBase` — projected snapshots,
  pension and measured flows — before calling `calculatePerformanceForPeriod`; `PerformanceData.baseLabel`
  (`describeMeasurementBase`) sits on the section's scope line beside the window. Until then it ran on the RAW
  snapshots with no flow channel (the whole net worth, house included: +105% annualised against the page's +26% on one
  account) and told no one. Its words are named for what they are: the TWR «annualizzato», the ROI «sul capitale
  iniziale» (the note used to say «sul capitale versato», false), the CAGR beside the TWR and never as its annualised
  form; a «Capitale entrato nella base» row appears when the flows were measured.
- **A verdict over tiles** (2026-09-01): the cover is the report's verdict, not a frontispiece, and every section is
  eyebrow · scope · reading · figures. Words from `lib/utils/pdfNarrative.ts`, chrome from
  `components/pdf/primitives/PDFTile.tsx` (`PDFPage`, `PDFSection`, `PDFMetrics`, `PDFRankedRows`, `PDFNarrative`,
  `PDFNote`, `PDFHero`, `PDFVerdict`), colours from `printTokens`. The `#3B82F6` accent is gone from every page.
- **`PDF_RAMP` is DESIGN.md's ramp divided by 4/3**: react-pdf measures in POINTS (72/inch), the spec in CSS pixels
  (96/inch). A4 is 595×842pt on a 44pt margin, leaving a 507pt column.
- **There is no monospace and no typographic minus.** react-pdf ships only the standard PDF families unless font
  files are registered, and Geist arrives through `next/font/google` — so figures are Helvetica and their alignment
  comes from fixed-width right-aligned COLUMNS (a declared exception to the Mono Mandate, in `PDF_FONTS`). WinAnsi
  has no U+2212 and react-pdf drops what it cannot encode **silently**: the Allocazione gaps printed «620» where they
  meant «−620 €». `pdfSafeText` converts it at the boundary — every PDF text node goes through it.
- **Sub-tiles are a `--muted` fill with no border**: on white paper a 1px rule at 0.92 lightness is invisible, and a
  4%-ink fill survives a photocopy.
- **A section's reading must not mix two windows.** `HistoryData` carries `netWorthEvolution` (the filtered series the
  page tabulates) AND `totalGrowth` (measured between `oldestSnapshot` and `latestSnapshot`); they coincide today
  because `prepareHistoryData` receives already-filtered snapshots, but the first draft of the reading took its
  endpoints from one and its delta from the other and printed three numbers that could not all be true.
- **Verifying it means rendering it.** `renderToFile` from `@react-pdf/renderer` works under Vitest; inflating the
  content streams and collecting every `scn` operand is what proved no colour outside `printTokens` reaches the page,
  and reading the extracted text is what caught the missing minus signs. `tsc` catches neither. The text comes out as
  hex WinAnsi (`<53746f72>` = «Stor») inside kerned `TJ` arrays that split words, and the metric labels are printed
  uppercase: compare space-free and case-insensitively. **And render with the REAL data path too** (2026-09-07): a
  section rendered from hand-typed metrics passed every word while the owner's own export still ran
  `preparePerformanceData` without the ledger (26,05% against the page's 27,08%) — call `fetchPDFData` through the
  client SDK on the emulators (a `globalThis.fetch` shim prefixes the tour server's origin to the relative yield
  routes) and compare its metrics with `getAllPerformanceData`'s.

## Periodic Emails (`lib/server/monthlyEmailService.ts`, `weeklyBudgetEmailService.ts`)

- **A verdict over tiles, out of the DOM** (2026-09-01). Both messages open on a RULE-GENERATED
  verdict from `lib/utils/emailNarrative.ts` — never on the AI comment, whose generation is
  non-blocking and can simply be absent, which is why an email that opened on it opened on a number
  whenever Anthropic was unavailable. The comment is a tile on `--muted` in SECOND position. The
  verdict's headline is also the hidden **preheader**, so the inbox preview answers the question.
- **Every hex comes from `lib/constants/printTokens.ts`** and nothing else (DESIGN → *The Out-Of-DOM
  Token Rule*). The chrome — shell, verdict, tile, hero, KPI row, ranked rows, budget track,
  comparison table, alert rows — lives in `lib/server/emailHtml.ts`, and **every layout is a nested
  table**: Outlook on Windows renders through Word, so flex and grid do not exist there.
- **ONE template serves the four period types.** They differ only in labels (resolved from the
  period by `emailNarrative`) and in which tiles exist: Budget and the Hall of Fame standing are
  monthly, the income Top 10 is yearly, and **«Rispetto a un anno fa» is ABSENT on a yearly email**
  (`previousEqualsYoy`) because there the two baselines are the same window and every figure in it
  is already printed above (The One-Tile-One-Question Rule). The old «Confronti» table printed both
  columns unconditionally.
- **The class labels are the app's** (`ASSET_CLASS_LABELS` from `allocationUtils`): the local copy
  that used to live in `monthlyEmailService.ts` said «Crypto» and «Materie prime» where every screen
  says «Criptovalute» and «Materie Prime».
- **`signedPct` and `signedEur` are it-IT** (the Comma Rule reaches the email too): they printed
  `+6.8%` with a dot and `-498 €` with an ASCII hyphen until 2026-09-01.
- **A ranked list shows six rows and a residual.** The categories are ranked BY AMOUNT, so a
  catch-all category outranks real ones — that is correct, and the residual row is what keeps the
  shares reaching 100%.
- **Four period types** with independent cron phases, so 31 Dec can send Q4 + H2 + yearly (intentional). Adding one is a
  wide fan-out: the union, `MonthlyEmailData`, the date and label helpers, `buildPeriodEmailData`, `buildAndSend*`, the
  cron phase, the send route and the settings 3-place + toggle + test-send button.
- **Income targets have their own tile** (`Obiettivi di entrata`): «am I within my budgets?» and «did what I expected arrive?» are two questions, and only the first has a limit to breach. The budget track carries **today's mark on the row's own window** — day of month for a monthly budget, day of year for an annual one — drawn as a split table row, because out of the DOM there is no positioning to overlay it with.
- **The weekly budget email is a SEPARATE module and nothing in it is weekly**: it is *sent* on Sunday, but its numbers
  are month-to-date and year-to-date. `buildCommentContext` (pure, exported, tested) states the day-of-month, tags the
  overall as a MENSILE ceiling with an A FINE MESE projection and forbids "fine anno"/"settimana" for monthly budgets.
  **When you add a figure here or to its prompt, name its window.**
- Over-budget rows carry `overspendExpenses` (actual overruns only) sourced from `getPeriodExpensesForItem` so they
  reconcile with the row's `spent`. Always run user notes through `escapeHtml`.
- **Comparison data is deterministic, AI only interprets**: **net worth = end-of-period snapshots (point-in-time);
  income/expenses/savings = flows over the window**, made explicit in the caption. The Hall of Fame mention is likewise
  deterministic, ranked with `lib/utils/hallOfFameRecords.ts` — the SAME definition as the in-app page.
- **The email AI comment goes through the provider layer** (`lib/server/llm`, since 2026-09-28 — F1 of
  doc/ai-open-models-wiki.md), not the assistant pipeline: `generateText('EMAIL_PERIODIC' | 'EMAIL_WEEKLY_BUDGET', …)`,
  and `lib/constants/aiModels.ts` says which provider and model answer — today an OPEN model on OpenRouter
  (`OPENROUTER_API_KEY`): GLM 5.3 Flash, chosen by the quick eval (F2, 2026-09-28) and provisional until F6. The Anthropic adapter keeps the old call (adaptive thinking,
  `effort: high`) for whoever routes a surface back to it. AI and comparison failures are both non-blocking — and so
  is the context bundle, built inside the same `try`; without the provider's key the periodic email skips the bundle
  too (its Firestore reads would feed a call that cannot happen).
- **The layer returns `null` on ANY answer it cannot use**, and the email leaves without the tile: missing key,
  network, HTTP status (one retry on 408/429/5xx), a body of the wrong shape, empty text, and a **truncated** answer
  (`finish_reason: length` / `stop_reason: max_tokens`) — a change from before, when a comment cut mid-sentence was
  printed as it was. On a reasoning model the reasoning counts against `max_tokens`: the weekly email's 400 is tight,
  and a run of `truncated` in the logs is the sign to raise it.
- **Every call logs one `[ai-usage]` line** — `{ surface, provider, model, input, output, cost?, outcome }` — whatever
  its outcome, on Vercel's logs: it is the consumption history, and a rejected answer was paid for all the same.
- **Privacy is in every OpenRouter request**, not a setting: `provider: { data_collection: 'deny', zdr: true }`, and a
  `:free` model id is refused before anything is sent (free endpoints may log and train on prompts).
- **The portfolio half is measured with the PAGES' functions, never a second rule** (F1b, 2026-09-28, doc/ai-open-models-wiki.md
  § 4.4; `lib/utils/emailPortfolio.ts`, built by `buildEmailPortfolio` in `monthlyEmailService.ts`). Until then the email read
  the pre-ledger model: allocation on the whole net worth against the raw Settings targets (44,7% against 70% where
  Allocazione said 69,6%), «mercato» as `Δ − risparmio (+ tasse)` (+507 € where Storico measured −1.063 €),
  «Andamento per classe» as snapshot differences that read PAC instalments as growth, and no trades. Now, four rules:
  - **Driver**: Storico's `growthDrivers` over the window (`measureEmailDrivers`: every consecutive pair from the
    baseline to the period's snapshot, so a quarter adds up to its months), in the verdict (`describeDriverEngines` +
    `describeDriverRest`, Storico's own sentences), in the Patrimonio tile (`buildDriverLedger`: rows that add up to the
    euro) and in the prompt (`--- DA COSA VIENE LA VARIAZIONE ---`). Without `byAsset` on a pair the market is the
    residual and all three SAY so (`isMarketMeasured`); «Andamento per classe» then disappears (owner's call). The tax on
    the period's sales is the Driver's own part (`summarizePeriodSales`' estimate); the headline still follows the
    Panoramica's `resolveDeclineCause` / `resolveTaxedGrowth` on it, and the sale is told by `describeSales`.
  - **Allocation**: `assetsAtSnapshot` (the period-end `byAsset` with TODAY's roles, composition, leverage — roles are not
    historicised, owner's call) → `compareAllocations` → `applyRebalanceBand` with the **5/25 rule** (`EMAIL_REBALANCE_BAND`,
    owner's call for the email — the page's band is a session control, default ±2) → Allocazione's `summarizeClassGaps` /
    `activeClassGaps` / `offTargetGaps`, orphaned sub-targets stripped. The effective targets come from
    `resolveEffectiveTargets`, the page's own resolution (goal-driven, manual or default). A new «Allocazione» tile follows
    Composizione (which stays on the whole net worth — another question); the verdict names a class only when it leaves
    the band, in the page's words (`driftClause`).
  - **Class moves**: the Driver per instrument (`measureAssets`: market, money traded from the ledger via `tradedMoney`,
    pension paid in, value change) grouped by the Panoramica's bands (`sumByMarketBand`, shared with `computeTopMovers`:
    composites split, pension funds as «Previdenza»). The row's amount is the market; purchases, contributions and the
    rest ride in the caption, uncoloured. A market that prints as zero has no sign and no colour.
  - **Return**: Rendimenti's TWR on its base over the window (`resolvePerformanceBase` + `calculatePerformanceForPeriod`
    `CUSTOM`, the PDF's precedent #324), stated as the hero does (`resolveHeroReturn`: «nel mese»), with
    `describeMeasurementBase` in the Patrimonio footer and in the prompt.
  Every part is non-blocking: a failed read costs its tile and its prompt block, never the email.
- **The prompt BODY is the assistant's own block MINUS its allocation**: `buildEmailAiPrompt` = `formatBundleForPrompt(bundle,
  label, { omitAllocation: true })` + the email's own blocks (Driver, TWR, composition of the whole net worth, allocation
  vs target, class moves, trades per instrument, dividends, comparisons, category deltas, Hall of Fame, budget alerts,
  split). The option drops the bundle's four allocation blocks (ALLOCAZIONE CORRENTE, SOTTO-ALLOCAZIONE, TARGET vs
  CORRENTE, VARIAZIONI ALLOCAZIONE), which still measure on the whole net worth: the ASSISTANT keeps them (owner's call,
  2026-09-28 — it is off and upstream's; see the blind spots). Do not re-list what the bundle already carries, and do not add
  a second cashflow computation: `resolveEmailPeriodRange` hands the email's own window to the range builder.
- **The composition and the allocation are two blocks with two named bases**: the whole net worth by class, «NON si confrontano
  con i target», then the allocated base with the effective targets. One block with both read 44,7% against a 70% target.
- **The period's trades are in the prompt, one line per instrument** (`summarizeTradesByInstrument`, owner's call), capped
  at `MAX_TRADE_INSTRUMENTS` (15) with the omitted count and amount stated like `MAX_CATEGORY_DELTAS`. Without them the
  model explained a −5.119 € cash month as «la vacanza pagata da cassa»; it was six PAC purchases.
- **The Hall of Fame standing is ONE sentence, from its own side** (`describeHallOfFameStanding`, verdict and prompt alike,
  2026-09-28): «È il mese con la crescita più piccola tra i 18 mesi in crescita registrati», never «È il 18° mese migliore su
  18», which the model read twice as «18° mese consecutivo di crescita». The prompt adds that it is a ranking, not a streak.
- **Every email cap is stated in the prompt**: `MAX_CATEGORY_DELTAS` (12) is named in the section header together with
  how many categories were left out. The selection is by SPEND, not by size of variation — describe it as it is.
- **The output budget comes from the CONTRACT, never from a model** (`lib/server/llm/budget.ts`, 2026-09-28). `max_tokens`
  is a ceiling, not a price — a provider bills what it generates — and what wastes money is a TRUNCATED answer: paid in
  full, discarded, the email without its comment. On a reasoning model `max_tokens` covers the reasoning AND the text,
  and one August comment spent 5.450 of 6.000 on it. So the reasoning has its own ceiling (`reasoning.max_tokens` on
  OpenRouter: 4000/6000/6000/8000 per period, 1500 for the weekly email) and the text the room of the contract's word
  limit twice over (`words × 1,8 × 2`); `maxTokens` is their sum (5800 for the monthly). The `[ai-usage]` line logs
  `reasoning` when the provider reports it: that is where F2 measures what each candidate really costs, and where a
  budget gets revised. **There is no web search since 2026-09-28**: the layer has no tools, and the macro context arrives
  from the Wiki in F5 (doc/ai-open-models-wiki.md § 5.4); until then `includeMacroContext` only changes the prompt's
  wording (it was off on the owner's account anyway).

## The vault and TheBull (F3, doc/ai-open-models-wiki.md § 5)

Not an email yet — F5 puts its month pages in the periodic prompt — but the same cron and the same provider layer.

- **Files**: `lib/utils/thebullParse.ts` (the template read by code: cleaning rule, sections, index table, readings,
  episodes), `lib/utils/wikiMacro.ts` (extraction contract, the quote check, the pages, `log.md`),
  `lib/server/wiki/{githubVault,thebullCompiler}.ts`, `app/api/wiki/ingest/route.ts`, the cron's phase 9,
  `scripts/wikiCompile.mts` (`npm run wiki:compile`), the Apps Script `scripts/wiki/thebullIngest.gs`; tests
  `__tests__/{thebullParse,wikiMacro,thebullCompiler,githubVault,wikiIngestRoute}.test.ts` on a SYNTHETIC newsletter
  (`__tests__/thebullFixture.ts`) — a real issue never enters the repo: the text is TheBull's and its links carry the
  subscriber's id.
- **The model reads one section.** Only «Il punto della settimana» goes to `THEBULL_COMPILE`; the index table, the
  readings and the episodes are parsed, so their figures never pass through a model. The sponsor never reaches it.
- **Every item holds to a quote, by code.** The quote must be in the text (whitespace, apostrophes and quotes
  normalised) and every number of the summary must be in the quote — a year inferred from «da allora» is dropped. A
  quote already used is a `doppione`. A week with no fact, or with more than a third of its items failing their quote,
  is refused (`pending`), never published thin. The first real run (issue 23, 2026-09-27): 16 facts, 8 theses,
  3 hints, 2 dropped, 0,002 $.
- **The raw is cleaned BEFORE it is written, then immutable** (`THEBULL_CLEAN_VERSION`): sponsor, Academy promotion,
  social links, footer and every line with the subscriber's id go; the rest stays in the template's own format, so
  the SAME parser reads the email and the stored raw — the property the retry depends on (tested).
- **One commit per operation** (Git Data API), rebuilt once on a fresh head when the owner pushed from Obsidian in
  between. The raw is committed even when the model fails; `log.md` then says `pending 0/3`, the cron retries three
  times, then `failed`; `npm run wiki:compile -- <date>` recompiles by hand.
- **The month page is rebuilt from the weeks' `.json` records**, chosen by the issue's DATE (a week that straddles
  two months belongs to the month of its Sunday); quotes stay in the weeks, so the month stays short for F5.
- **Themes, principles and the lint are NOT the server's**: a Claude Code session writes them (the vault's
  `CLAUDE.md`, § 5.5 of the spec).

### The vault's `dati/` (F4, doc/ai-open-models-wiki.md § 6.1)

- **Files**: `lib/utils/vaultMarkdown.ts` (pure: the `--- TITLE ---` markers → headings, the frontmatter, the
  portfolio table), `lib/server/wiki/vaultExport.ts` (`exportToVault`, one commit + one `log.md` line), the cron's
  phase 10, `scripts/vaultExport.mts` (`npm run vault:export -- [YYYY-MM [YYYY-MM]] [--dry-run] [--email x]`); tests
  `__tests__/{vaultMarkdown,vaultExport}.test.ts`.
- **A month's file IS the monthly email's data block** (`buildEmailDataSections`, extracted from `buildEmailAiPrompt`
  with no change to the prompt): the vault, the email and the email's model read ONE version of a month, with F1b's
  rules. NOT the assistant's builders, which the spec first named: they still read allocation on the whole net worth
  and the market as a residual (owner's decision, 2026-09-30).
- **`dati/portafoglio.md`** is the latest real snapshot per instrument (class as the Strumenti chip names it, a
  composite with every leg; the instruments at zero counted, not listed) plus the email's composition and
  allocation blocks for that month.
- **Whose data**: `WIKI_EXPORT_UID` (the vault is one person's); without it the cron's phase 10 is off. The cron
  exports the month on its last day only; that evening the month is NOT `parziale` (the email's rule), before it is.
- A month without a snapshot is skipped and named in the log line (`ok · senza snapshot: …`), never written empty.

## Verifying a surface with no DOM

Moved here whole from `AGENTS.md` → *Commands* on 2026-09-20; the bullet «Verifying it means rendering it» above is the
PDF half seen from inside the section, this is the recipe for both surfaces.

- **A surface with no DOM is verified by RENDERING it** — `tsc` and Vitest see neither a dropped glyph nor an off-token
  colour. PDF: `renderToFile` from `@react-pdf/renderer` under Vitest, inflate the content streams with `zlib`, collect
  every `scn` operand (no colour outside `printTokens`), read the hex text runs (silently dropped characters). Emails:
  open the rendered HTML in Chromium (`chromium.launch()`, `file://`) at 390 / 600 / 1440 and assert
  `documentElement.scrollWidth === clientWidth`. Both are throwaway scripts run from INSIDE the repo (or `playwright`
  and the `@/` alias do not resolve); neither check lives in the suite. **A render with hand-built data proves the
  WORDS, not the data path** (2026-09-07: the Rendimenti section rendered 10/10 with typed-in metrics while the real
  export still ran the base without the ledger — 26,05% against the page's 27,08%): run `fetchPDFData` itself through
  the client SDK on the emulators, with `globalThis.fetch` prefixing the tour server's origin to the relative `/api/…`
  routes the services call, and compare with the page's payload.

- **A ranked row's amount is an inert colour unless it asks for one** (2026-09-22, seen in a render).
  `EmailRankedRow.trailingSign` colours the optional THIRD column, not the amount; a list that
  passes no `trailing` — «Spese in comune» is one — printed every amount in the plain foreground,
  so a person who came up short looked exactly like one who did not. The amount takes a sign only
  through **`amountSign`**, and only where the amount IS a gain or a loss: a ranked category total
  is a magnitude, and colouring it would assert a verdict the list has no baseline for.
- **«Spese in comune» leads with the BOOKED residual**, like the tile on the page, and carries the
  calendar in its caption («Con le spese ancora in calendario mancano 500 €»). The amount and the
  caption come from two different calls, so leading with the period's figure would make the row
  contradict its own second line — which is how the divergence was found. doc/guide/cashflow-divisione.md.
- **The recipe, run for real on 2026-09-22**: `npx tsx --conditions=react-server <script>.tmp.mts`
  from the repo root, calling `buildPeriodEmailData` itself on the emulators and handing the result
  to `generateEmailHtml`. Two things the script has to do or it will not start: `--conditions=react-server`
  (the `server-only` marker throws on a plain Node import) and the four `NEXT_PUBLIC_FIREBASE_*`
  variables (the module graph reaches the CLIENT SDK, which refuses an absent API key). The email
  also refuses to build without a monthly snapshot for its window (`realCurrentDocs.length === 0
  → null`), so a fixture about expenses needs one planted for the render and removed after.

## Per-page blind spots

- **The periodic email's allocation is the END of the period on TODAY's roles** (F1b, owner's call): roles, composition
  and leverage are not historicised, so an asset re-roled since then is measured with its new role, and a snapshot row
  whose asset was deleted is left out and declared («Fuori dal calcolo…»). An email of agosto regenerated in ottobre gives
  the same figures; the Allocazione page shows TODAY's values (69,6% against the email's 69,4% on the real account).
- **The email's band is 5/25, the page's is whatever the session picked** (default ±2): the same class can be «in linea» in
  the email and COMPRA on the page. Owner's call; the tile's footer names the band.
- **A pension fund before its start month is «altre variazioni»**: with `pensionReturnStartMonth` = 2026-08 the ten
  contributions of the real account (2.177 €, all effective in August) are not attributed in August and the fund's
  growth lands in «altre» — the Driver's rule, the same on Storico (market +762 € where a start month ≤ July gives
  −1.063 €). Not a bug of the email.
- **The in-app Assistant still reads the pre-ledger allocation** (`formatBundleForPrompt` without `omitAllocation`): whole net
  worth, raw targets, snapshot differences. It is off (D2) and upstream's; aligning it is a separate decision.
- **Nothing checks the comment's figures in production**: the checks — every €, % and p.p. figure against the prompt,
  word limit, the contract's sections, no promised block that is absent, Italian only — live in the EVAL
  (`lib/utils/aiEvalChecks.ts`, run by `scripts/aiEval.mts` over frozen bundles; F2, 2026-09-28), not on the cron's
  path. The one F1 had, a step of its collaudo, read only € and %. And a flagged figure is not a wrong one: every model
  computes shares and sums the prompt does not contain, most of them right (doc/ai-open-models-wiki.md § 7.2). A
  comment that slips in production reaches the inbox as written.

- **Fuori dal DOM restano tre punti ciechi**: le email non rispecchiano i cinque temi nominati (scelta — si leggono su una scheda bianca); «un hex sta solo in `printTokens`» è documentato ma **non applicato da un linter**; e `@react-pdf/renderer` scarta in SILENZIO ogni carattere fuori da WinAnsi (`pdfSafeText` copre U+2212; frecce, simboli ed emoji no). Le tre superfici si verificano solo renderizzandole, e **nessuna di quelle verifiche è nella suite**. doc/guide/email-pdf.md. (moved from `CLAUDE.md` → Known Issues on 2026-09-19)
