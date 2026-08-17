# AI Agent Guidelines — Net Worth Tracker

Conventions and recurring pitfalls. **Rules only**: how each one was learned lives in `git log`, and what each feature
*is* lives in CLAUDE.md — this file says only what an agent can get wrong.

Companion documents — do not duplicate their content into this file:

| File | Owns |
| --- | --- |
| `CLAUDE.md` | Architecture snapshot, feature index, **Known Issues** (open debt) |
| `DESIGN.md` | The aesthetic spec (normative frontmatter + narrative). Never regenerate it |
| `PRODUCT.md` | Users, positioning, accessibility posture |
| `SETUP.md` | Env vars, Firebase, emulators, Playwright, local-verification troubleshooting |
| `WORKFLOW.md` | Standing session rules + the guided-verification protocol (portable across repos) |
| `COMMENTS.md` · `DEVELOPMENT_GUIDELINES.md` | How to write code and comments here |
| `docs/{critique,audit}-prompts.md` | Per-page review prompts |

---

## 1. Conventions

### Italian Localization
- UI text Italian, code comments English. `formatCurrency()`, `formatDate()` (`DD/MM/YYYY`), `Sottocategoria` (no
  hyphen), `Buongiorno Giuseppe` (no comma). English on purpose: `Hall of Fame`, `FIRE e Simulazioni`, `Cashflow`,
  `Assistente AI` and the standard metric names; `Current Yield` → `Rendimento Corrente`.
- **Curly apostrophes break `.tsx`** (`TS1127`) — delimit with double quotes. **JSX eats the space next to an inline tag
  or wrapped expression** once Prettier breaks the line: write `{' '}` on both sides of `<strong>`/`{expr}`.
- **Italian `Intl` breaks naive matching**: four-digit amounts print ungrouped (`1821,01 €` but `29.800,00 €`) and the
  `€` carries a non-breaking space. Anchor as `/^821,01[\s ]*€$/`; never concatenate `amount + ' €'`.

### Firebase Dates and Timezone
- `toDate()` to convert; `getItalyMonth()`/`getItalyYear()`/`getItalyMonthYear()` for domain grouping, never
  `Date.getMonth()`/`getFullYear()`. Server "today" window (cron): `getItalyDayBoundsUtc()`.
- Inclusive month upper bound: `endOfMonthBound(year, month)` — the 1st at midnight drops the whole closing month.
  `<input type="date">` defaults take `getItalyDateIso()`, since `toISOString()` proposes yesterday from 22:00.

### Tailwind Breakpoints and Responsive Layout
- `desktop:` = 1440px, never `lg:`. Dialog-internal layouts use `sm:`; portrait wrappers `max-desktop:portrait:pb-20`.
- **NEVER mix arbitrary `min-[px]:` with named breakpoints on the same property** — named ones compile to rem and v4
  emits them last, so `sm:grid-cols-2 min-[960px]:grid-cols-3` renders 2 columns at every width ≥ 640px. Between
  `tablet:`(768) and `desktop:`(1440) use a container query (`@container` + `@[640px]:`, all px).
- **Container queries when one component renders at several widths**: column count = container query, drawer-vs-inline =
  viewport. Per-cell `@container` scales a monetary value to the CELL width, or large amounts overflow.
- **A grid item stretches to the row height, but a normal-flow child does not inherit it without its own `h-full`** —
  side-by-side cards of different content length need `h-full` on BOTH the grid-item wrapper and the card `div`.
- **`sticky` on a grid item needs `self-start`** — the default stretch makes the item as tall as the row, so a
  `sticky top-6` companion column has no room to travel and silently behaves as static (the Assistente hero's right
  column is the worked example).
- **Horizontal page scroll on mobile**: an implicit-`auto`-track grid expands to its widest child — add explicit
  `grid-cols-1` and `min-w-0` on flex/grid children (they default to `min-width:auto`). To center one flex child use
  `self-center`, not `items-center`, which shrinks every child to content width.
- **One scroll container per region**: a nested scrollable captures the wheel and content below becomes unreachable
  (desktop-only symptom). `overflow-x-hidden` on an ancestor also CLIPS a descendant's `overflow-x:auto`.

### shadcn Card and Dialog Surface
- **`CardHeader` is `flex flex-col`**, so a `flex justify-between` row inside it makes a `flex-1` grandchild act
  vertically (`truncate` dies, `shrink-0` siblings get pushed off-screen) — use a plain `<div className="px-4 py-3 flex
  items-start gap-2">`.
- **`ResponsiveModal`** is the convergence target for form modals (`max-w-4xl` default, footer resolved by the caller,
  `Description` handled internally); small confirms and the 2-step `AssetDialog` may stay plain `Dialog`s.
- **`DialogDescription`/`DrawerDescription` is required** in every `DialogContent`/`DrawerContent` (`sr-only` if it
  should not show); never silence the warning with `aria-describedby={undefined}`.

### Layout and Color Tokens
- Never hardcode structural colors in shell components — `bg-background`, `text-foreground`, `border-border`.
- **Sign colors are tokens: `text-positive`/`text-destructive`**, chips `bg-positive/10`, resolved via
  `getMetricValueColor()`. Two gotchas: **drop `dark:` variants** (the token swaps itself) and the function returns
  neutral for the `currency` format by design — signed currency uses `signChipClass`/`signTextClass`. Legacy
  `text-emerald-*` survives in `ExpenseTrackingTab`, `MobileExpenseRow`, `CashflowKpiCarousel`.
- **`--warning` is near-white in light mode**, so text on a `bg-warning` fill MUST be `text-warning-foreground`;
  standalone amber text is a different case (`PerformanceHero`'s "fragile" verdict keeps `text-amber-600`).
- **A chart slot is not a text colour** — `--chart-1..5` target ~3:1 against a plot area (`text-[var(--chart-3)]`
  measured 1.02:1 on one theme). The semantic amber is `--warning-foreground`; only `ExpenseTable`'s chips are exempt.
- **Sidebar tokens**: `--sidebar-accent` is a background, `--sidebar-accent-foreground` text ON it; hover on inactive
  items uses `hover:text-sidebar-foreground`. **Inline `style` blocks Tailwind hover variants**, so migrate to classes
  before adding `hover:`/`focus:`.
- **CSS custom properties never reach emails or the PDF** (both render outside the DOM) — the sign hexes there are
  permanently out of sync (CLAUDE.md → Known Issues).

---

## 2. Data and State Patterns

### React Query and Derived State
- Invalidate all related caches after a mutation; **asset mutations need a dual invalidation** (`queryKeys.assets.all` +
  `queryKeys.dashboard.overview` — the Patrimonio hero reads the overview).
- `useMemo` for derived state, never `useEffect + setState`. **`forceMount` tabs deriving from a sibling's data MUST use
  React Query** — a mount-time `useEffect` loader runs once and the tab goes stale until reload; invalidate
  **unconditionally** on expense save/delete.
- **`initialData` on a query with a global `staleTime` silently disables its fetch** (5min + `refetchOnWindowFocus:
  false` here): it never fetches, never reaches `isError`, never sees a co-owner's change. **Use `placeholderData`.**
- Lazy-gate expensive panels with `enabled: !!userId && isOpen`, and read **`isLoading`, not `isPending`**, on a disabled
  query — `isPending` stays true forever and the skeleton never lifts.
- **An async view must gate on EVERY query it reads**: queries defaulting to `[]` short-circuit into "nothing tracked
  yet" on a cold load. **A failed fetch is not an empty set** — route `isError` to a `role="alert"` notice first.
- **State belonging to a subject must be stored WITH its subject**, not reset by an effect (banned by
  `react-hooks/set-state-in-effect`): store `useState<{ scopeKey, value } | null>` and derive, so a stale key falls back
  to the default with no effect and no extra render.

### Dialog Form Reset
- The reset `useEffect` must include `open` in its deps and start with `if (!open) return`.
- The new-record branch must enumerate **every** field, optional ones included, and call `replaceTiers([])` — `reset()`
  does not clear field arrays.
- **`useWatch()` for render, `getValues()` for handlers — never `watch()`** (incompatible with the React Compiler, which
  then skips the whole component).

### Two-Step Create Dialogs (`AssetDialog`, `ExpenseDialog`)
> Both creation flows in the app now have this shape. Treat it as the default for a form whose fields
> depend on a discriminant, and keep the two implementations in step.
- **The picker exists because the type is not one field among many** — it decides which categories/classes exist, which
  accounts are asked for, and how many balances move. Step 1 turns *one form with N conditional shapes* into *N plain
  forms*; a discriminant that only re-labels things does NOT earn a step.
- **Create opens on step 1, edit skips straight to step 2** — changing the type of a saved record is a different act,
  with reconciliation consequences the in-form notice has to explain, so the `Select` stays there and only there.
- **`setStep(record ? 2 : 1)` belongs in the `open` effect**, not in `useState`'s initializer: without `open` in the deps
  the record prop stays null between opens and the second "new" reopens on the form.
- **Make the back-link callback OPTIONAL and let its absence select the `Select`** (`onBackToTypePicker?`). The two
  controls are then mutually exclusive by construction, instead of by a second boolean that can drift out of sync.
- **The picker is a module-level component**, and the type entry carries `Icon` as the COMPONENT, never a rendered node —
  the cards draw it at `h-5 w-5` and the dropdown at `h-3.5 w-3.5`.
- Step 1 selects through the same handler that re-points the category on a type change: the user can return to the
  picker with a category already chosen, and that category belongs to the type being left.

### Firestore Writes
- `updateDoc` only touches fields present in the object and `removeUndefinedDeep` strips `undefined`, so clearing an
  optional field needs `deleteField()` — which is **not allowed with `setDoc()` without `merge:true`**. Never
  reintroduce a shallow `removeUndefinedDeep`: it must recurse preserving `Date`/`Timestamp`/`FieldValue`.
- **The clear-guard depends on whether partial callers exist**: `averageCost`/`taxRate`/`displayTicker` are written only
  by `AssetDialog` with a complete form, so `=== undefined → deleteField()` is safe; `leverageRatio` also rides on plain
  `updateAsset` and needs the `'leverageRatio' in updates` guard, or a price refresh wipes it.
- **`runTransaction`: ALL `tx.get()` before ANY write** — a `get→update` loop breaks on the second doc and is invisible
  when the function is mocked. Aggregate deltas per docId first (template
  `__tests__/updateCashAssetBalancesAtomic.test.ts`), and fire success toasts AFTER the reconcile returns.
- Firestore rejects `undefined` inside an array element, and `assetAllocationService.ts` builds `docData` by hand, so its
  array fields need a whitelisting serializer with conditional spreads. **Max 3 `.where()` calls** on a chain that will
  be unit-tested; a 4th breaks the mock chain.

### Settings — the FIVE places
- A new setting must be added to all five or it silently disappears: the type (`types/assets.ts`), the read mapping in
  `assetAllocationService.getSettings`, **BOTH** write chains in `setSettings` (the `targets` branch uses `setDoc` with
  no merge), and the state/load/save/dirty-snapshot wiring — usually `settings/page.tsx`, but a FIRE-only toggle (e.g.
  `respectPensionLockInFire`) wires from `FireCalculatorTab.tsx` instead; the 5th place is "wherever the field's own
  save button lives", not always the Settings page. Guarded by `settingsRoundTrip`, whose `STORED_SETTINGS` fixture
  must carry the new field for the guard to actually cover it (adding the field to the type without adding it to the
  fixture leaves the round-trip green while the read mapping is still broken).
- **A user-clearable field needs a different shape per branch**: `delete docData.x` in the no-merge branch,
  `deleteField()` in the merge branch — and the guard is `'x' in settings`, not `x !== undefined`.
- **There is a SIXTH place for any setting the server (not just the client) needs to read**: the settings mapper in
  `lib/services/dashboardOverviewService.ts` re-lists the same fields from the admin doc, independently of
  `assetAllocationService.getSettings`. `settingsRoundTrip` does not cover it — check it by hand when a setting has (or
  will have) a server consumer.
- **Store a boolean explicitly, never derive it** from other fields (`?? derivedFallback` on load). All feature toggles
  live in `AssetAllocationSettings`, never in `UserPreferences`, and dirty-state snapshot keys contain **only persisted
  fields**, captured *after* the Firestore state is applied.
- **One Save button validates the whole page** — `handleSave` returns early when allocation targets do not total 100, and
  must `invalidateQueries(['settings', ownerId])`, which `AssetDialog` reads.
- `cashflowHistoryStartYear` is shared (Cashflow / Storico / Assistant / overview) — never rename it page-specifically.

### Auto-Calculated Targets (`lib/utils/equityBondsAutoTargets.ts`)
- **The Bull's formula prescribes an EQUITY share and says nothing about the other classes, so the other classes are
  funded out of Azioni**: `bonds = 100 − formula`, `equity = formula − other`. Charging them to the bond sleeve (the
  original behaviour) made the *defensive* allocation the shock absorber for every satellite and drove it to ~0%.
- **Derive the second member of a percentage pair from the ALREADY ROUNDED first one**, never from the raw input twice:
  77,015 rounded independently yields 54,52 + 22,99 = 100,01%, and that total is what the Save button validates.
  Generalise: *when two values must sum to a constant, round one and subtract; never round both.*
- **An effect that sums over an `AssetClass` union must list that same union in its deps.** The hand-written dep array
  silently went stale when `trendFollowing`/`carry` were added: they entered the sum but never re-triggered the effect.
- Equity floors at 0 when the other classes exceed the formula's share, and the overflow falls back on bonds —
  preserving the 100% total beats preserving the bond share, because a wrong total blocks Save.

### Caching
- **Per-user pre-computed cache** (`performance-cache/{userId}`): the key encodes **every** determining input — a hash of
  the WHOLE snapshot series, the base signature, the risk-free rate, the dividend category. TTL fallback (6h) covers what
  the key cannot; reads/writes are `try/catch` fire-and-forget; `Date` ↔ `Timestamp` is field-by-field, never JSON.
- **A changed FORMULA is the one input no signature can see — that is `CACHE_MATH_VERSION`** (`v5`), bumped on any change
  to what the pipeline computes from unchanged inputs. When verifying by hand, press **Aggiorna** (`forceRefresh`) first.
- **Global shared cache** (benchmark, FX, ECB): natural key as doc id, no `userId`, `read: isAuthenticated(); write:
  false`; client `staleTime` = server TTL minus headroom.
- **Schema evolution without a key bump**: add the field as optional and pair it with `?force=true`. Wire "Aggiorna" to
  `refresh()`, never to bare `refetch()`, which receives the same doc.

### Server Layer and API Authorization
- Route = auth → validate → fetch → ownership check → delegate → return; no Firestore queries or business logic in the
  handler body. Firestore rules do not protect Admin SDK calls, so enforce record-level ownership after loading the doc.
- **Owner-scoped routes authorize with `assertCanAccessAccount(decodedToken, ownerUserId)`**, never a fallback to
  `decodedToken.uid`; viewer-scoped routes (sharing management) just read the token uid.
- Server-owned materialized docs are mutated only via a private authenticated route; cron routes use `CRON_SECRET`, and
  `/api/portfolio/snapshot` must keep accepting `cronSecret`.
- **Validation**: `lib/server/validation.ts` owns the reusable schemas and `parseOr400` — never cast with `as { … }`
  first, use `z.coerce.date()` for dates, and validate **Firestore-originated** inputs at the service entry point too.
  Tests that touch a `server-only` module need `vi.mock('server-only', () => ({}))`.
- **`REGISTRATION_WHITELIST` has no `NEXT_PUBLIC_` prefix**, and `lib/constants/appConfig.ts` must stay client-safe.
- **Do NOT bump `firebase-admin` past 13.x** — `@14 → jwks-rsa@4 → jose@6` is pure ESM and Vercel's Lambda runtime
  `require()`s it (`ERR_REQUIRE_ESM` on every Admin route). A Node-22 forward fix was tried and still failed.

### Shared Account / Delegated Access
- **Viewer vs owner**: `useAuth().user` is the viewer and never changes; `useActiveAccount().ownerId` is whose data is
  displayed. Pass `ownerId` in data-scoped hooks and pages; keep `user.uid` only for theme, profile, PDF author,
  `useDemoMode` and the sharing UI.
- **Grant model**: `account-access/{ownerUid}` with `memberUids` read by the rules and the `array-contains` discovery
  query; the rest is denormalized because a member cannot read `users/{ownerUid}`.
- **Three enforcement layers, kept in sync**: `firestore.rules` (`canAccess(ownerUid)` per collection, `create` uses
  `canAccess(request.resource.data.userId)`, `userPreferences` stays `isOwner`, `account-access` is **write:false**),
  `assertCanAccessAccount` on Admin routes, and the client substituting `ownerId`. **Rules changes are inert until
  deployed.**
- **Switching gotcha**: React Query keys namespace by the id passed in, but manual `useEffect` loaders (settings, history,
  performance, allocation, hall of fame) must include `ownerId` in their deps. The switcher must exist in BOTH the
  Sidebar and the `SecondaryMenuDrawer`, since portrait has no Sidebar.

### Dynamic Imports and Module Hygiene
- **Components must be at module level** — one defined inside a render body is a new type every render, so React
  remounts it (`AnimatePresence` enter never plays, `useEffect([])` re-fires) and the React Compiler throws.
- Pure `lib/utils` modules reach `calculateAssetValue` in one of two established ways — check the precedent: **injected**
  as a `valueOf` param (`allocationUtils`, `pensionFire`) or **imported directly** with the test mocking
  `@/lib/firebase/config` + `firebase/firestore` + `authFetch` + `dashboardOverviewInvalidation`.
- Functions that call `new Date()` internally are untestable — pass `now: Date` explicitly. **shadcn vendored surface
  policy**: `components/ui/**` is knip-ignored and standard shadcn API stays even at zero references; only **custom
  additions made in this repo** get deleted.
- **CSS custom property liveness — the 5-check sweep.** A token is live if ANY holds: `var(--name` in `.ts/.tsx/.css`; if
  mapped via `@theme`, the **generated utility name** appears (grep `bg-X`, not the variable); `getPropertyValue`; an
  internal chain; the vendored-surface contract. A confirmed-dead token leaves **every** theme block in one commit.

---

## 3. Domain Rules

### Expense Grouping: key by id, label by name (`lib/utils/expenseGrouping.ts`)
- **Category names are NOT unique and never will be** — the product deliberately allows "Casa" as both a *Spese Fisse*
  and a *Spese Variabili* category, so anything keyed on `categoryName` merges them.
- **The one rule: group by `getCategoryKey`/`getSubCategoryKey`, display via `resolveDisplayLabels`.** `getCategoryKey` =
  `categoryId || trimmed name || UNCATEGORIZED_LABEL`; `getSubCategoryKey` maps missing/blank to `NO_SUBCATEGORY_KEY`, a
  key like any other — which is what lets callers drop their `=== 'Altro'` special cases.
- **`resolveDisplayLabels` qualifies ONLY where the rendered surface actually collides**: ambiguity is measured over the
  set of KEYS per name, not a row count. `selectExpensesForDrillDown` matches the type **EXACTLY** (its predecessor
  tested `type !== 'income'`, lumping fixed+variable+debt together and letting transfers through).

### Expense Sign Convention and Type Changes
- Income positive, expenses negative, net savings = `sum(income) + sum(expenses)`; crossing the boundary flips the sign.
- **Classification is ALWAYS by `type`, never by the sign of `amount`** (`transfer` skipped, `income` income, everything
  else spending via `Math.abs`) — by sign, a refund counts as income. Fixtures must carry an explicit `type`.
- **`ExpenseDialog` type change is shape-aware across all five types**: `reconcileTransferEdit`, `reconcileSingleEdit`
  and the two cross-shape edits, which reverse the OLD shape and apply the new one in one delta-map transaction.
  `updateExpense` re-derives the sign from the incoming type and nulls `transferCashAssetId` when it leaves transfer.
  **That control lives in EDIT mode only** — creation picks the type in step 1 (→ *Two-Step Create Dialogs*), so the
  reconciliation paths above are reachable exclusively from a saved row.
- **The BATCH paths refuse to cross the transfer boundary** (`crossesTransferBoundary`): `updateExpensesType`,
  `moveExpensesToCategory`, `moveExpensesFromSubCategory` throw `TransferBoundaryError` when expenses exist, since each
  row would need its own destination account.
- Changing the type always invalidates the category (categories are type-scoped) — `resolveEquivalentCategory` re-points
  to the same-named one under the new type.

### Cashflow Drill-Down: One Landing Path
- **There is ONE drill destination and ONE transaction list**: every entity entry point on Analisi (composition row,
  Sankey node, `EntitySearch`, anomaly chip, Confronto row) lands through `handleEntitySelect` in `AnalisiTab.tsx`, which
  resolves labels exactly like a URL-restored focus. A new entry point calls that handler only.

### Sankey: node identity is the node id (`lib/utils/cashflowSankey.ts`)
- **d3-sankey resolves link endpoints through a `Map` of ids**, so a duplicate id keeps the LAST node and orphans the
  earlier one as a zero-value ghost. Ids are built from **ids**, never display names.
- **The type belongs inside the category id** (`cat:{tipo}:{chiave}`), because without that prefix an income and an
  expense category of the same name close a cycle through Budget and `computeNodeDepths` throws `"circular link"`,
  blanking the chart. **Ids are opaque**: `index` is the only sanctioned way to ask what a node is.

### Analisi — entity-first (`components/cashflow/AnalisiTab.tsx`)
- **The multi-year blocks in `EntityDossier` deliberately IGNORE the period axis** — the period is a cursor over the
  entity's timeline, not a cage — and each block declares its own horizon in a caption.
- **Each year row expands into its per-subcategory deltas**, comparing the row's OWN windows via `resolveYearRowWindows`,
  which is what makes `Σ(subcategory delta) === row.delta` true by construction. Category level only.
- **The focus SURVIVES period changes** (no `resetDrillDown()` in the period handlers) and is exited only via
  breadcrumb/Indietro. The category colour is DERIVED at render, never stored in drill state. In the URL it is three
  FLAT params (`?focusType&focusCat&focusSub`), because a name-fallback key IS a name and can contain any delimiter.
- **`lib/utils/comparisonDeltas.ts` is the single source of the same-months rule, scope included**:
  `resolveComparisonScope` serves BOTH the KPI pacing rows and `ConfrontoAnnualeSection`, and returns **null for a month
  that has not started**. **Honesty rule**: `prevYearValue` is `number | null` — a baseline month below the history
  floor is UNKNOWABLE, not zero, and renders as a gap.

### Cashflow KPIs and Tracciamento
- *Risparmio Netto* (€) and *Rapporto* (`income/|expenses|`) encode the same relationship in different units and are kept
  separate **on purpose** — do not "deduplicate".
- **Feed delete = drawer-confirm, not 2-click**, and `deleteSingleExpense` MUST branch on `type === 'transfer'` to call
  `reconcileTransferDelete` (both legs), like `ExpenseTable` does. `expenseStats === null` (no data) ≠ `0`: empty state
  for null, `€0,00` only for a confirmed zero.

### Budget (`lib/utils/budgetUtils.ts`, `lib/hooks/useBudgetConfig.ts`)
- **Opt-in**: `reconcileBudgetItems` only refreshes denormalized names and drops orphans, never auto-creates.
  `BudgetItem` fields are all required, fixtures included: `amount`, `period`, `kind`, `order`.
- **Period semantics** (`getPeriodActual`): monthly = current-month spend, annual = year-to-date, and annual budgets never
  enter `validateBudgetAllocation`. The **overall** budget is a ceiling on ALL month spending, while the validator sums
  only monthly expense *category* budgets. **Auto-save is paused while the allocation is invalid.**
- **Insights labels must state horizon AND scope**: `categoriesAtRisk` are end-of-month projections, not money spent, and
  every metric is computed only over budgeted expense items.
- **GOTCHA**: never reconcile items against `categories` while `categories.length === 0` (they load async) — every
  category budget is dropped as an orphan and a later edit can persist the empty set.

### Centri di Costo (`CostCentersTab`, `CostCenterDetail`, `lib/utils/{costCenterUtils,costCenterColors}.ts`)
- **One period axis, owned by the list, rendered in BOTH views** (distinct `layoutId`s). Generalise: *a view that
  displays a period must be able to change it, or must name the window on every figure that uses a different one.*
  Budget, forecast (always YTD) and chart legitimately keep their own window and each names it in its eyebrow.
- **A lifecycle threshold must be fed an UNSCOPED date** — `computeCenterStats(…).lastActivityDate` is period-scoped and
  `null` maps to `'dormant'` without reaching the 90-day threshold, so use `resolveLastActivityDate(expenses)`.
  Generalise: *when a period selector narrows a stat, any downstream rule with its own absolute horizon is recomputed
  unscoped.*
- **The query returns TWO numbers per center**, `spending` and `linkedCount`, and `deleteCostCenter` unlinks *whatever is
  linked*, income included — **any count next to a destructive action must come from the same query the mutation runs.**
  **Delete unlinks, it does not delete**: the expenses survive, so the armed button names the count.
- **A period-over-period delta must compare windows of the SAME elapsed length** (`isWithinElapsedExtent`), or on the
  3rd of the month every center reads as collapsing.

### History and Snapshot Baselines
- Annual deltas use December of the previous year as baseline; Patrimonio `Anno Corrente` uses the previous month as a
  **hidden** baseline.
- **A snapshot is a frozen photo**: adding an asset never updates an existing one, so a Storico chart "missing" an asset
  you just added is a stale current-month snapshot, not a bug. **The snapshot cron runs DAILY — the name lies**
  (`0 18 * * *`, no day-of-month guard): storage granularity is monthly, write frequency daily.
- **Reuse `byAsset.totalValue` for historical per-instrument value — never recompute** (it already went through
  `calculateAssetValue()`); aggregate in `snapshotAssetBreakdown.ts`. **Gotcha**: `byAsset` is a newer field, so a month
  picker built on it must filter to non-empty `byAsset` — the resulting gaps are correct.
- **`byAsset.price` is RAW NATIVE CURRENCY**, so `totalValue ≠ quantity × price` for USD/GBp/real-estate; the per-unit EUR
  figure is `u = totalValue / quantity`, and attribution is `priceEffect = q_prev·(u_curr−u_prev)` + `quantityEffect =
  (q_curr−q_prev)·u_curr` (sum = Δ exactly).
- **TWR neutralises a cash flow only when the net-worth drop and the flow land in the SAME monthly snapshot** — the fix
  is data entry, never re-bucketing cash flows or excluding cash (CLAUDE.md → Known Issues has the mirror case).
- **Two CAGR formulas, intentionally different**: Storico hero = `(endNW/startNW)^(12/months) − 1` (wealth growth),
  Rendimenti = `(endNW/(startNW+netCashFlow))^(1/years) − 1` (investment return).

### Rendimenti — measurement base (`lib/utils/performanceBase.ts`, `drawdownSeries.ts`)
- **Any exclusion read from `byAsset` MUST be backfilled across the pre-`byAsset` months, or it becomes a phantom crash**:
  subtract a **constant `E₀`** (the excluded total of the earliest snapshot that HAS one), which cancels in `(V_end −
  CF)/V_start`. A snapshot that has `byAsset` but omits the asset is evidence of absence → subtract 0, never backfill.
  **Documented approximation**: the backfill fixes the DENOMINATOR of historical months, not the numerator.
- **The base is user-configurable and TWO call sites must stay in sync**: `resolvePerformanceExclusions` fed by
  `resolvePerformanceBaseOptions(settings)`, consumed by `getAllPerformanceData` AND the page's `cachedSnapshots`.
  Diverge and a custom period disagrees with the pre-computed ones; `buildCacheKey` must embed the base signature.
- **Drawdown runs on a geometric TWR index, never on `netWorth − cumulativeCashFlow`**: `buildTwrIndex` chains the SAME
  monthly return the heatmap shows.

### Rendimenti — the measurement window (`lib/services/performanceService.ts`)
- **The first snapshot of a period is ALWAYS the starting valuation, never a measured month — the window opens on the 1st
  of the month AFTER it.** A snapshot is an end-of-month photograph; this also fixes gaps for free.
- **`resolveHasBaseline(snapshots, nominalPeriodStart)` is the ONE answer to "is that first month before the period?"** —
  data-driven, never inferred from the period type. **The page must NEVER re-derive the window from `new Date()`**:
  `metrics.nominalPeriodStart` travels in the payload and `selectSnapshotsForMetrics` re-selects what the service used.
- **`monthsElapsed` vs `calculateMonthsDifference`: distance vs coverage.** Jan→Mar is 2 elapsed, 3 covered;
  annualization always uses the elapsed count. **IRR signs are the INVESTOR's stream** (`−startNW`, `+endNW`), and
  `null` means "no rate explains this stream", not "the solver gave up".
- **No silent filters inside a single metric.** Volatility must not drop extreme monthly returns — the removed value is
  either an untracked movement (still visible in the heatmap) or a real crash. Floors instead: volatility/Sharpe need
  ≥ 3 monthly returns, else `null` with a reason.
- **`buildCashFlowMap`/`monthKey` is the only monthly indexing of cash flows** — TWR, volatility, heatmap, Evoluzione and
  `drawdownSeries` read the SAME series, and flows in the same month are **summed**.
- **Below 6 months the hero states the PERIOD return, not an annualized one** (`resolveHeroReturn`): +4% over two months
  annualizes to "+26% a year", a forecast dressed as a measurement. Only the displayed figure changes. **ROI and CAGR
  correct for cash flows in two DIFFERENT ways and are not convertible**, so both tooltips state both formulas.
- **Benchmark**: the hero delta compares in the benchmark's NATIVE basis, so a EUR-toggled table can differ by FX.
  `benchmarkPeriodReturn.ts` is the single source for indexing + annualization — never re-inline it. Each benchmark's
  final value comes from **its own** last available month, or every cell renders "–".

### Dividends and Coupons
- **A coupon's cashflow expense is created only by the daily cron on payment date, never at asset-save time**
  (`createDividendWithOptionalExpense` gates on `!isAutoGenerated`; cron Phase 2 is idempotent via `expenseId`).
  Corollary: `deleteUpcomingCouponsForAsset`/`deleteUpcomingFinalPremiumForAsset` must batch-delete the linked expense.
- **The coupon cron is self-healing, not exact-day**: Phases 2-3 query a 370-day lookback and Phase 3 walks
  `getFollowingCouponDate` forward, so a missed run cannot stop the chain.
- **Adding a `DividendType` is a six-file fan-out** and nothing enforces it: `types/dividend.ts`, `DividendTable`,
  `DividendDetailsDialog`, `DividendTrackingTab`, `DividendDialog`, plus `dividendService.ts`'s `byType` initializer.
- **A coupon's tax rate is the asset's own `taxRate`** (12,5% government, 26% corporate), never a constant.
- **YOC and Current Yield share one pure function**, `computeDividendYieldMetrics`, prospective and per-share:
  `annualizedDPS = Σ(grossEur/div.quantity)` annualized, YOC = `DPS ÷ averageCost`, Current Yield = `DPS ÷ price`, only
  `quantity > 0` contributing. Never reintroduce an inline YOC in Rendimenti or `/api/dividends/stats`.
- **YOC, Current Yield and per-asset Total Return are scoped to the CURRENT holding** (`createAsset` re-links by ISIN, so
  dividends before `holdingStartDate` are dropped, with `deriveHoldingStartDates` for legacy rebuys). **DPS growth is
  deliberately NOT scoped** — it is a security-level payout history.
- **Received metrics filter on `paymentDate`, not `exDate`**; use `setHours(23,59,59,999)` for the upper bound, or a
  `…T00:00:00Z` dividend reads as future.
- **Inflation-linked coupons (BTP Italia) are additive**, resolved by `resolveCoupon`/`buildCouponNote` for both the
  client scheduler and cron Phase 3: the FOI rate is already per-period, deflation is floored to 0, and an unannounced
  coupon is stored **provisional**.
- **Persist a bondDetails-only change with `updateAssetBondDetails`, never `updateAsset`** (which `deleteField()`s an
  absent `averageCost`/`taxRate`), passing the COMPLETE object — `updateDoc` replaces the whole map.

### Asset Pricing, FX and Assets
- **"Does this asset have a market price?" is ONE rule in ONE place** (`lib/utils/assetPricing.ts`): `hasMarketPrice` is
  false for `realestate`, `cash`, `pensionFund`, `Private Equity`; `requiresManualPricing` adds the `autoUpdatePrice ===
  false` opt-out. **A new hand-valued `AssetType` goes into `MANUALLY_VALUED_TYPES` and nowhere else.** The `--chart-3`
  row tint means "no market quote", NOT "illiquid".
- **`suggestIsLiquid` is the single liquidity-default predicate**, keyed on the TYPE so a REIT **ETF** stays liquid; three
  call sites in lock-step (create-mode effect, edit-mode legacy fallback, liquid/illiquid net-worth read-time fallback).
- `buildAssetFormDataFromValues` clamps `autoUpdatePrice` to `false` when `hasMarketPrice()` is false. **That clamp is
  the only defense — never remove it.**
- **GBp (pence) ≠ GBP**: normalize `price / 100` before any FX call or values inflate 100×. **Never call Frankfurter from
  the browser** — all FX is server-side via `/api/prices/quote`. `quantity = 0` marks a sold asset, cash balance lives
  in `quantity`, and Borsa Italiana bond prices are `% of par` (`rawPrice * nominalValue / 100`).
- **Patrimonio Δ columns are price variations over time windows, not profit/loss** — `Δ Inizio`'s base is always
  `firstEntry.value`, never `averageCost`. **Any table whose column set changes at runtime must derive its group-header
  `colSpan` from the same flag.**
- **A cash *account picker* requires `type === 'cash' && assetClass === 'cash'`** (a money-market ETF can carry
  `assetClass: 'cash'`), for the settlement account, ledger first buy, `ExpenseDialog`'s payment account, the pension
  origin and `assertCashSettlementAsset`. Do NOT extend it to aggregate-liquidity computations.
- **`getAssetDisplayTicker` is the ONLY place resolving the alias→ticker fallback.**

### FIRE, What If and Goals
- **What If = perturbation + diff, no new projection math**: every v1 life event is a year-0 perturbation, then
  `fireService` is re-run on baseline vs adjusted and diffed. Do NOT add timed mid-projection cash events. **Keep the
  pure layer category-agnostic** — the selection of lost income sources and its sum live in the UI.
- **Config-first collapse: decide ONCE after the form has settled.** A "collapsed if already configured" panel cannot key
  on the transient `hasUnsavedChanges` — use a `useRef` seeded-flag set when `!isLoadingSettings && !hasUnsavedChanges`,
  and gate the temp-sync effect on `!isLoadingSettings` (not `if (settings)`).
- **Goal trajectory is annuity math in a tested pure layer** (`goalTrajectory.ts`), never a `useMemo` in the card; the
  verdict compares the *projected value at the deadline* against the target with a 1% tolerance, not contribution ≥
  requiredMonthly (float flapping). Coast FIRE's nested pension rows must be serialized without `undefined` fields.
- **The goal math that the SERVER also needs lives in `lib/utils/goalMath.ts`, re-exported by `goalService.ts`** —
  that service imports `doc/getDoc/setDoc` + `db` at top level, so server code can never import it. `goalMath` imports
  `calculateAssetValue` DIRECTLY (the second sanctioned route, precedent `dashboardOverviewUtils.ts`) rather than taking
  an injected `valueOf`: identical signatures are what let the re-export be literal and leave every client call site
  untouched.
- **`serializeGoalForFirestore` IS the persistence allowlist for `InvestmentGoal`**, and it is now the single copy —
  `saveGoalData` (client) and `POST /api/goals` (server) both go through it. A new optional field on the type is
  silently dropped on save until it is added there.
- **The goal document is rewritten WHOLE, never patched.** So the Admin append is a transaction (the FIRE page writes
  the same doc), the goals already stored and `assignments` pass through **verbatim** — re-serialising them could only
  lose something — and the colour is picked INSIDE the transaction (`pickNextGoalColor`), or two goals created
  concurrently come out the same hue.

### Asset Trade Ledger
**Engine** (`lib/utils/assetTransactionUtils.ts`, pure and Firebase-free)
- ALL trade money-math lives here (replay, PMC, realized P&L, XIRR, total return, invested capital); the service/route
  layer is a thin atomic writer. A new `AssetTransactionType` must update the replay switch, the zod schema AND
  `TransactionDialog`. **Native PMC excludes fees**, which live only on the EUR side, and a sell never moves it.
- **The migration baseline (`isBaseline` BUY) NEVER stamps `holdingStartDate`**, and `replayTransactions` returning
  `holdingStartDate: undefined` means **leave the asset doc untouched** — never `deleteField()`, which would zero YOC for
  the whole portfolio.
- **Replay ordering is deterministic and internal** (date → baseline < buy < sell < adjustment → `createdAt` → `id`), and
  this same replay IS the pre-write validation: invalid histories throw `LedgerValidationError` with an Italian
  `userMessage` forwarded verbatim in a 422.
- **The per-asset XIRR is date-exact and SEPARATE from `performanceService.calculateIRR`** — keep both; it returns a
  FRACTION, and `null` renders as "–", never 0. **`replayTransactions` replays ONE asset**, so
  `aggregateRealizedByYear` (lives in this engine, consumed by Rendimenti's `RealizedGainsSection.tsx`) must group by
  `assetId` FIRST: realized P&L is PMC-dependent per position.
- **Per-transaction derived data (a sell's own P&L %, PMC-at-trade) comes from `replayTransactionsWithEffects`**, never
  from re-running `replayTransactions` on every prefix (O(n²) — the trap `AssetMovementsDialog.tsx` fell into before
  this was added). One pass emits one `LedgerTransactionEffect` per transaction (baseline/buy/sell/adjustment), with the
  optional fields populated ONLY for `sell`, so a caller indexes by id with no holes. `replayTransactions(txs)` is just
  `.state` of the same call — identical semantics, unchanged.

**Service, API, migration** (`lib/server/assetTransactionUseCase.ts`)
- **Writes are Admin-API-only**: a trade atomically rewrites the asset's derived fields from a full replay, and only the
  Admin SDK can `tx.get(query)` in a transaction. Reads stay client-SDK; auth = `assertCanAccessAccount`.
- All reads before any writes; `resolveTradePriceEur` (network) resolves BEFORE the transaction; derived fields written
  DIRECTLY in-tx, not via `updateAsset`.
- **Migration is idempotent**: meta doc present → done; else one baseline BUY per eligible asset, batched ≤400, **meta
  doc written LAST**. Mutation hooks invalidate a TRIPLE: `assetTransactions.all` + `assets.all` + `dashboard.overview`.
- **`updateAssetMetadata` closes the `deleteField()` trap** — ledger-type edits go through it, never `updateAsset`.
  **Testing the atomic write**: the in-memory Admin fake is built inside the hoisted `vi.mock` factory, so reference
  `vi.hoisted(...)` state, never a plain const.

**UI and Rendimenti/Dividendi surfaces**
- `resolveBondPrice` is exported from `AssetDialog.tsx` and REUSED — a trade's `pricePerUnit` must mean exactly what
  `averageCost` means. **"Capitale investito" uses the page's OWN period bounds** and is deliberately a DIFFERENT number
  from "Contributi Netti"; "Plusvalenze Realizzate" is NOT period-scoped — a realized sale belongs to its fiscal year.
- **`totalReturnAssets` has two paths**: LEDGER (≥1 trade doc, the only one that can represent a closed or partially sold
  position) and a STATIC price-vs-PMC fallback. **`capitalGainAbsolute` means something different on each** (static =
  unrealized only, ledger = realized + unrealized), but both preserve `totalReturnPercentage = capitalGainPercentage +
  dividendReturnPercentage`, which the UI relies on — change one formula and re-derive the other. The ledger denominator
  is `investedEur` for BOTH open and closed states, so the meaning does not flip when a position closes.
- **`dividendReturnPercentage` is UNIFIED across both paths**: per-payment `net ÷ cost-basis-at-payment-time` using
  `Dividend.costPerShare`, never a flat ratio (which loses the anti-dilution property). `costPerShare` is stamped in
  NATIVE currency despite its type comment, so `fallbackAverageCost` must also be native.
- **When a second computation path lands next to an existing card, audit the STATIC COPY**, not just the numbers.

### Allocation — `allocationRole` and where the filter must live
- **`Asset.allocationRole` is ONE field with THREE values**: `tradable` (default, in denominator and plans); `frozen`
  (**in the denominator, never in the plans** — dropping a bond-heavy pension fund from the totals would report the free
  portfolio's mix as your real exposure, and counting it makes the plans *compensate*, which is the value of the role);
  `excluded` (**out of the page entirely, denominator included**, or a house pegs its class permanently off-target).
- **Legacy read-fallback: `excludeFromAllocation: true` → `excluded`, never `frozen`**; never write that field again.
- **No role is ever inferred at read time** — the `realestate → excluded` / `Private Equity → frozen` / `pensionFund →
  frozen` suggestion is a FORM default for NEW assets, one ternary in the existing touched-flag effect. The role is
  orthogonal to `isLiquid` (only the liquid/illiquid split) and `isPrimaryResidence` (only FIRE net worth).
- **THE RULE: partition upstream of `compareAllocations`, never downstream.** Filtering the *output* is wrong twice:
  every other class's `targetValue = target% × totalValue` measures against the wrong base, and it breaks the
  Σ(current − target) = 0 invariant the balance score halves.
- **Do NOT push the filter into `calculateCurrentAllocation`** — it also serves `/api/portfolio/snapshot`, which must keep
  freezing the WHOLE portfolio. **Consequence kept on screen**: the Allocazione headline excludes `excluded`, so it is
  SMALLER than the Panoramica net worth, and `frozen`/`excluded` get **separate** captions.
- **The orphaned target is the trap this feature sets**: flag the house and its 70% sub-target survives with zero
  allocatable value, so new money pours into a bucket that can only hold it. Any target-driven surface owes two things:
  `findOrphanedTargets` (positive target + ~zero allocatable value + excluded value behind it; a class is not orphaned if
  any sub-target is still reachable) and `stripOrphanedSubTargets`, which must REMOVE them from the map handed to
  `ActionPlanner` **and** `AllocationBreakdown`, not merely warn.
- **An empty target is not an orphaned target** — an unfunded sub-category MUST keep receiving money. The distinguishing
  condition is *excluded value behind it*, never "current value is zero".

### Allocation — the two plans and the leverage engine
- **"Versa" and "Preleva" are ONE tree with the sign flipped**: both return `PlanNode[]` (`amount` always positive).
- `splitFromSurplus` mirrors `splitTowardTarget` and drains what sits ABOVE target first, with two constraints the
  contribution side has no analogue for: `take ≤ capacity` per item and `Σtake ≤ Σcapacity`. The invariant every caller
  relies on: **Σamount === min(requested, Σcapacity)** at every level.
- **`currentValue` and `capacity` are DIFFERENT inputs to `splitFromSurplus`**: the surplus is measured on `currentValue`
  (a frozen fund really does push its class above target), the take is capped at the TRADABLE slice. `buildRebalancePlan`
  caps the SELL side at `tradableByClass` and never the BUY side.
- **The "neutral targets" trick**: passing a synthetic `targetPercentage = value / bucketTotal × 100` makes BOTH split
  functions degenerate to pro-rata below the class level, with no branch. Do not add a second algorithm.
- **THE ASYMMETRY is the design**: *you can be told to buy something you do not own; you can never be told to sell it.*
  Versa's sub-category buckets come from the configured TARGETS, Preleva's from the HOLDINGS (splitting across
  only-targeted subs would strand every euro in an untargeted one).
- **Neither plan may ever name a `frozen` holding**; Versa additionally drops a sub-category that is *entirely* frozen,
  renormalizing onto what you CAN buy. An **unfunded** target is a different thing and must stay. **A composite asset
  yields one holding per component**, each carrying the parent's `tradable` flag.
- **The balance score is band-INDEPENDENT — do not "fix" it to read the action.** With Σtarget > 100 the drifts do not
  cancel, so it decomposes: `leverageGapPp = Σd`, `misallocationPct = (Σ|d| − |Σd|)/2`, `score = 100 − misallocation −
  |gap|`. Only the verdict, plan and chips react to the band; a class held WITHOUT a target entry never enters
  `byAssetClass` (CLAUDE.md → Known Issues).
- **Leverage**: `expandAssetExposure` must NOT special-case `pensionFund`. The class residual is solved against the
  post-trade **MARKET** base — `classCoeff[c][i] = exposurePerEuro[c][i]` (no `instrumentLeverage` term), `classConst[c]
  = currentNotional[c] − tf[c]·marketAfterTrade` — because scaling by the *notional* total re-multiplies by the current
  leverage. The *leverage* term keeps `instrumentLeverage` as its coefficient.
- **`AllocationResult.totalValue` is the NOTIONAL total** (== market at leverage 1);
  `marketValue`/`notionalValue`/`leverageRatio`/`hasLeveragedExposure` are REQUIRED so `tsc` forces the band
  re-classifier to copy all four through. **The whole leverage UI is a `hasLeveragedExposure` fork, not a rewrite.**
- `ASSET_CLASS_CHART_INDEX` mirrors History's `acColors` so a class is the same hue on both pages — re-key one, re-key
  both.
- **Widening `AssetClass` only breaks the Records actually typed `Record<AssetClass, …>`** — grep first. The costly one is
  the zod `z.enum([...])` in `AssetDialog.tsx`, surfacing as indirect assignability errors on `reset()`/`setValue()`
  sites that never name the enum.

### Fondo Pensione
**Data model** (`types/pension.ts`, `lib/utils/pensionDeduction.ts`)
- **`pensionFund` is an `AssetType`, never an `AssetClass`, and never a ledger type.** Its value is statement-driven, held
  in `quantity` **at price 1**; `TYPE_TO_CLASS['pensionFund'] = 'equity'` is a fallback for an empty `composition`, so
  any `assetClass`-keyed default effect must exclude the type explicitly.
- **The `AssetType` union is enumerated in TWO places in `AssetDialog.tsx`** — `TYPE_TO_CLASS` and `assetSchema`'s
  `z.enum` (three indirect errors). Update both in one edit.
- **Two tax mechanisms, only one reads history.** ORDINARY deduction is stateless per year (ceilings via
  `getPensionDeductionCeiling` — a law change is one branch there, never a literal at a call site);
  EXTRA-DEDUCIBILITÀ is a multi-year fold maintaining a bank (accrual years 1-5 → drawdown 6-25 → expiry).
- **CORRECTNESS TRAP — `isFirstEmploymentPost2007` ON without a full contribution history inflates the plafond**, because
  the fold treats missing years as 0 contributed. OFF is correct whenever the past is not tracked.
- **The IRPEF ceiling is per TAXPAYER, not per account**: `computePensionTaxRecap` runs once per `FamilyMember` with
  contributions pre-filtered to that member's fund ids. **The `enrollmentYear` fallback must be computed from the
  MEMBER-FILTERED `deductibleByYear`**, or one person's history leaks into another's plafond.

**Contributions** (`lib/services/pensionContributionService.ts`)
- **Client SDK, not an Admin route** — there is no multi-doc replay to serialise, and the only two-balance step is already
  atomic inside `reconcileTransferCreate`. That is the discriminator against the trade ledger.
- **Two write-side guards, both before anything is written**: the origin must be a real cash account
  (`updateCashAssetBalance` writes `quantity` directly, so a wrong origin subtracts euros from an ETF's share count) and
  `assertFundValueLivesInQuantity` must confirm the destination is a `pensionFund` priced at 1. **Write-side only** —
  `deletePensionContribution` has no guard, so a user can undo out of a broken state.
- **The orphan transfer is the dangerous failure**: a failed reconcile deletes the just-created `Expense`, and a failed
  contribution write reverses the value effect, both through `compensate` (best-effort, logged, never rethrown).
- **`taxYear` is validated as ±1 year from `date`** and both roll-ups group by `taxYear`, NEVER `date.getFullYear()`.
  **Contributions never touch spending or savings, by construction** — TFR/employer create no `Expense`, voluntary
  creates a net-zero `transfer`. A nature needing a non-transfer `Expense` means re-auditing every consumer.
- **The periodic statement (NAV overwrite) is NOT a contribution** — plain `updateAsset`. **Register the month's
  contributions FIRST, then overwrite "Valore attuale"**: the statement already includes them.
- **Converting a pre-existing fund is a type EDIT, never delete + recreate** (`byAsset` is keyed by `assetId`): the submit
  branch reads the **stored** type so the edit goes through `updateAssetMetadata`, and the conversion deletes the asset's
  ledger trades. **Latent risk**: `quantity` is replay-derived, so replaying such an asset after conversion would wipe
  every contribution.

**Return** (`lib/utils/pensionReturn.ts`)
- **Three causes of growth, three numbers — never one blended percentage.** The employer share is *compensation* and
  leaves the TWR, returning in `personalReturn = (marketGain + employer) / (startValue + voluntary + tfr)`; TFR is
  deferred salary → denominator, never numerator; the IRPEF saving stays in its own per-taxpayer card.
- **The window starts where the data is trustworthy, not where the snapshots start** (`resolvePensionReturnStart`), and
  **a contribution is attributed to the month its VALUE MOVED (`createdAt`), not its accounting date**.
- **The series ends at the fund's LIVE value, not the current month's snapshot** (`overlayLivePensionValue`): the asset
  rises immediately while the snapshot waits for the cron, so the TWR would drop by exactly the amount paid in. Storico
  and Rendimenti stay snapshot-based.
- **`isPensionReturnMeasurable` = `!isCoverageSuspicious && !hasNoMovement` is ONE predicate with two consumers** — while
  they were two expressions they diverged. *When two places must agree on whether data is trustworthy, the agreement is a
  named function.* An annualized return above 20% means missing contributions, not a brilliant fund.

**Page and integrations**
- **The year axis governs chapters 2-3 only, never the fund value or the return**; `resolveActivePensionYear` (pure)
  reconciles the selection with the derived axis so no effect has to sync them. Every chapter degrades to
  `PensionErrorNotice` instead of zeros, and the copy agrees in number (`fundNoun()`).
- **Zod messages must be attached to the TYPE check, not only the constraint**: `valueAsNumber: true` turns an empty
  input into `NaN`, which fails `z.number()` itself — use `z.number({ error: '…' }).positive('…')`.
- `PensionAllocationCards` needs the FULL unfiltered asset list; **Storico reverses the split
  `calculateCurrentAllocation` applied**, using the fund's CURRENT `composition` (a documented approximation); **FIRE's
  lock-in toggle subtracts from BOTH `currentNetWorth` and `illiquidNetWorth`**.
- **`performanceBase.ts` reads `byAsset`, never `byAssetClass`**, and the exclusion is applied in TWO places because the
  Rendimenti page has two independent snapshot-fetch paths.

### Assistant
**Context service** (`lib/services/assistantMonthContextService.ts`)
- Runs server-side — `adminDb` directly, never the client SDK. `selector.month`: `>0` monthly, `0` year, `-1` YTD, `-2`
  history.
- **Every mode must map to its own builder in `stream/route.ts`** — a mode with a prompt builder but no branch silently
  falls through to the monthly builder and is answered on one month of data.
- **One aggregator, not two**: every cashflow figure comes from a single `buildCashflowBreakdown` call per builder, so
  `Σ expensesByCategory[].total === cashflow.totalExpenses` holds structurally. `transactionCount` **excludes
  transfers**, and adding a required bundle field means updating ALL 4 builders (month/year/ytd/history).
- **Removing an `AssistantMode` ripples past the WARNING checklist at the top of `types/assistant.ts`**: also grep for
  `Record<AssistantMode, …>` — `assistantFollowUps.ts`'s `CURATED_FOLLOW_UPS` is the one live site today, and `tsc` only
  catches it because the object literal must satisfy every key of the union.

**Prompt builders** (`lib/server/assistant/prompts.ts`)
- `system` is byte-identical across users and requests of that mode — **never interpolate per-request data into it**;
  mode-specific conditionals are written generically and the concrete note lives in `userContent`.
- **`cache_control` is deliberately NOT used** in the assistant/email call sites: cache writes cost 1.25× and only pay
  off within the 5-minute TTL, against sporadic single-user traffic.
- Always include `--- ALLOCAZIONE CORRENTE ---` before the movers section, or Claude hallucinates "unclassified" gaps.
  `formatBundleForPrompt` destructures named fields only — a new bundle field is silently missing unless added, and
  `--- CATEGORIE DI SPESA CONFIGURATE ---` is not redundant: it lists what *exists*, unused categories included.
- **A silent cap in a context builder becomes a hallucinated "N/D"** — an LLM cannot distinguish *absent from the data I
  was sent* from *absent from the world*, and the data-integrity rules then forbid speculation. **Rule: a cap either does
  not exist, or is stated in the text the model reads.** Once a block is exhaustive the system prompt must say so, and
  must tell the model that a missing item means *no spending recorded*, not *no data*. `buildEmailAiPrompt` reuses
  `ASSISTANT_SYSTEM_CORE`: extend the shared core, do not duplicate the guardrail text.

**Streaming, threads, memory**
- `deleteAssistantThread` must delete the `messages` subcollection in ≤400-doc batches first (no cascade in the Admin
  SDK). Never clear `streamingMessages` in a `useEffect([selectedThreadId])` — the SSE `meta` event sets the id
  mid-stream and wipes the buffer; post-stream invalidation uses a local `resolvedThreadId` updated from `meta`.
- **`max_tokens` budgets thinking AND text together** (chat 12000, chat+web 16000, structured 18000) — re-check whenever
  the data block grows. **Read `stop_reason` from the terminal `message_delta`** and append `TRUNCATION_NOTICE`: a limit
  either does not exist or announces itself.
- Memory: only `status === 'active'` items are injected; the fetch is `.catch(() => null)` and never blocks the stream;
  the Anthropic client is lazily imported (a module-level `new Anthropic()` breaks test environments). The context
  bundle lives in React state and is never persisted. `MARKDOWN_COMPONENTS` must be module-level or ReactMarkdown
  re-mounts on every chunk.
- **Do not use `DropdownMenu` for panels containing `Select` or `Switch`** — it closes on any click inside; use
  `Popover`. The mobile thread `Sheet` is controlled and must be closed explicitly in `onSelect`.
- **Merging a partial patch onto existing state: build the merge object with ONLY the fields present in the input**
  (conditional spread), never assign every field unconditionally from a `Partial<T>` — an absent field becomes an
  explicit `undefined` that wins `{...existing, ...patch}` and silently wipes it. `store.ts`'s `mergeMemoryItem`/
  `mergeMemorySuggestion` are the template; a PATCH carrying only `text` used to erase `sourceThreadId`/
  `evidenceSummary`/`lastEvaluationResult` this way — confirmed only on the real emulator, a fully-mocked `store.ts`
  (as in `assistantRoutes.test.ts`) cannot catch it, `__tests__/assistantMemoryStore.test.ts` can.
- **One `adminDb.runTransaction` per turn, not one write per mutation**: `extractAndSaveMemory` accumulates every new
  candidate/evaluation/suggestion into an `AssistantMemoryMutation[]` and applies it in one
  `applyAssistantMemoryMutations` call. A new memory-writing feature there pushes onto that array — never call
  `updateAssistantMemoryDocument` in a loop again, it also races against the panel's own PATCH.
- **A field only the GET path can compute (`hasDummySnapshots`, from a `monthly-snapshots` query) must be optional on
  the base `AssistantMemoryDocument` type**, required only on `AssistantMemoryResponse` — never a hardcoded `false`
  returned by a write helper that has no way to know the real value.

**Structured goals** (`goalEvaluation.ts` pure, `goalEvaluationService.ts` I/O, `memoryExtraction.ts` extraction)
- **Structure is NEVER parsed from text.** It arrives from a forced-tool-use Haiku call validated with zod; the
  Italian regex cascade that preceded it produced `undefined` for most real phrasings, so goals were never evaluated.
  A malformed payload discards the **structure**, not the goal — an un-trackable goal is a legitimate state the panel
  states out loud. `unit` is derived from `kind`, never asked of the model.
- **A tool schema's enum description must speak the UI's vocabulary**, or the model splits one sentence across two
  kinds: "liquidità" is the product's label for the `cash` class, and until the description said so the same goal
  landed on `cash_target` or `liquid_net_worth_target` at random.
- **Goals are always evaluated against the CURRENT month**, never the bundle the request happened to build —
  `evaluateActiveGoals` builds its own. It is called unconditionally after a chat turn (pass the freshly extracted
  items as `pendingItems` to stay within ONE transaction) and daily from the cron's phase 7.
- **`updatedAt` on a memory item marks the last CONTENT change** (text, category, structured goal, status), which is
  why `mergeMemoryItem` restores it when a patch only stamps an evaluation. The durable "Ignora" compares it against
  the ignored suggestion's `updatedAt`: bump it on every re-evaluation and every ignore expires on the next cron run.
- **The caller owns `structuredGoal`**: a goal patch that carries none clears it. The PATCH route restructures on
  creation, on a text edit, or when the goal has none — never on a status-only change — and on failure leaves the goal
  unstructured rather than keeping a structure that contradicts the new text.

**Goal-Based Investing in the bundle** (`goalMath.ts` + `lib/server/goalData.ts`, prompt section, `GoalProposalCard`)
- **`bundle.goals` is REQUIRED and nullable**: `null` means the feature is off or the user has no document, and the
  prompt says so in words. Absent ≠ off ≠ empty — a model cannot tell them apart, and the data-integrity rules then
  make it answer "N/D" about a feature the user simply does not use. The same reasoning gives the *enabled but no
  goals* case its own sentence.
- **`targetAllocationSource` exists because the app can stop using the manual targets.** With
  `goalDrivenAllocationEnabled` on, Allocazione overrides them with `deriveTargetAllocationFromGoals`; quoting the
  Settings ones would be right numbers about the wrong thing. `buildGoalFields` derives goals, targets and source in
  ONE pass for exactly that reason. It falls back to the manual targets when the derivation yields null, mirroring the
  page.
- **Carry the trajectory numbers, don't make the model compute them**: `requiredMonthlyContribution` and
  `projectedValueAtDeadline` were already computed and thrown away, and a model without them multiplies contribution ×
  months — arithmetic that ignores compounding and that the data rules forbid. They ship with `assumedAnnualReturn`
  and are labelled **projections**: a required pace without its return assumption cannot be audited. Present only for
  goals with BOTH a target and a deadline; absent otherwise, never zero.
- **THE PROPOSAL PROTOCOL: the AI never writes.** It emits ONE fenced ```goal-proposal block of pure JSON; the write
  happens only on the user's Conferma, through `POST /api/goals`. `lib/utils/goalProposal.ts` owns the ONE zod schema
  for both the block and the route body (client-safe, since the card validates before rendering; `validation.ts`
  re-exports it). In zod 4 use **`z.partialRecord`** for `recommendedAllocation` — `z.record` with an enum key demands
  every key and rejects an equity/bonds mix as incomplete.
- **Intercept the block on `pre`, not on `code`** (a card inside `<pre>` is invalid nesting), and a malformed payload
  MUST fall through to a normal code block — the user still sees what the model wrote. `GoalProposalCard` reads owner,
  demo mode and query client itself because `MARKDOWN_COMPONENTS` has to stay module-level.
- **`ASSISTANT_SYSTEM_CORE` is shared with `buildEmailAiPrompt`, which sends no goals block** — so the goals paragraph
  is written conditionally ("quando il messaggio contiene un blocco OBIETTIVI DI INVESTIMENTO…"). Extending that core
  unconditionally makes the emails talk about data they were never given.

### Periodic Emails (`lib/server/monthlyEmailService.ts`, `weeklyBudgetEmailService.ts`)
- **Four period types** with independent cron phases, so 31 Dec can send Q4 + H2 + yearly (intentional). Adding one is a
  wide fan-out: the union, `MonthlyEmailData`, the date and label helpers, `buildPeriodEmailData`, `buildAndSend*`, the
  cron phase, the send route and the settings 3-place + toggle + test-send button.
- **The weekly budget email is a SEPARATE module and nothing in it is weekly**: it is *sent* on Sunday, but its numbers
  are month-to-date and year-to-date. `buildCommentContext` (pure, exported, tested) states the day-of-month, tags the
  overall as a MENSILE ceiling with an A FINE MESE projection and forbids "fine anno"/"settimana" for monthly budgets.
  **When you add a figure here or to its prompt, name its window.**
- Over-budget rows carry `overspendExpenses` (actual overruns only) sourced from `getPeriodExpensesForItem` so they
  reconcile with the row's `spent`. Always run user notes through `escapeHtml`.
- **Comparison data is deterministic, AI only interprets**: **net worth = end-of-period snapshots (point-in-time);
  income/expenses/savings = flows over the window**, made explicit in the caption. The Hall of Fame mention is likewise
  deterministic, ranked with `lib/utils/hallOfFameRecords.ts` — the SAME definition as the in-app page.
- **The email AI comment is a DEDICATED Anthropic call**, not the assistant pipeline; AI and comparison failures are
  both non-blocking.

### Panoramica and Dashboard Data Isolation
- Overview data flows through `GET /api/dashboard/overview` + `useDashboardOverview()` — no page-level fan-out queries and
  no full-history expense queries. `dashboardOverviewSummaries/{userId}` is server-owned: the client never reads it, and
  every overview-relevant mutation invalidates it explicitly. **Both endpoints are owner-scoped.**
- **`DASHBOARD_OVERVIEW_SOURCE_VERSION` invalidates hardcoded `sourceVersion: N` literals in test fixtures too** — grep
  for `sourceVersion:` in tests whenever it changes.
- **Do not import `goalService.ts` from a server-only file** — it top-level-imports the client Firebase SDK. The math
  a server needs lives in `lib/utils/goalMath.ts` and the Admin reads/writes in `lib/server/goalData.ts`.
- **Hero number overflow is a length-driven step-down**, not a container query: `heroValueClass` keys off the formatted
  string's length (>13 chars → `text-[32px] desktop:text-[40px]`). The card's width does not vary; the string does.
- **Hero variation chips use a CSS grid, not `flex flex-wrap`**, so chips of different text length share a width with no
  JS measurement. **Patrimonio's hero carries the identical block and reads the same payload: change both or neither.**
- Count-up lives in `OverviewAnimatedCurrency` leaf nodes, never in the page component; `OverviewChartsSection` schedules
  chart mount via `requestIdleCallback` once `heroSettled`, never a fixed timeout.

### Shared Constants and Fixed Hooks
- **Rule of Three**: a map used in 3+ files lives in `lib/constants/<domain>.ts`. The canonical symptom of a duplicated
  `Record<Type, string>` is one copy missing its `dark:` variants — illegible in dark mode with a clean `tsc`.
- **Declare N fixed hook instances with `enabled: false` for the inactive ones — never loop over hooks.**
- **Yahoo module asymmetry**: ETFs use `topHoldings` → `sectorWeightings` (snake_case keys matching `SECTOR_LABELS`),
  stocks use `assetProfile` → a title-case `sector` needing a translation map; the cache key must encode BOTH.

---

## 4. UI Patterns

### Motion
- Shared variants live in `lib/utils/motionVariants.ts`; `useReducedMotion()` is called once per component and used
  inline, with `<MotionConfig reducedMotion="user">` at the layout root — no separate CSS media queries.
- **Page transitions use `template.tsx`, NOT `layout.tsx` + `AnimatePresence`** (it re-mounts on every navigation);
  remove page-level `motion.div variants` wrappers once it is in place (compounded opacity: t²).
- `useCountUp` always with `once: true`, called **before** any conditional early return and unconditionally for both
  branches of a mode switch; it has **no `enabled` option**, so gate the display in JSX. **`layout="position"`, not bare
  `layout`, when a Framer parent wraps a Radix `CollapsibleContent`** — bare `layout` stretches the trigger text.
- **Collapsible technique, by content shape:** nested rows expanding into sub-rows → pure CSS `grid-rows-[0fr] →
  grid-rows-[1fr]` with an `overflow-hidden` child and `inert` on the closed wrapper (Framer + `height:'auto'` left
  revealed rows **stuck at opacity 0**, which looks like missing data); tall or unpredictable sections → Radix
  `<Collapsible>` + CSS transition; small predictable content → `AnimatePresence` + `height:'auto'`. **Always render a
  chevron on an expandable row**; with Radix, `CollapsibleTrigger asChild` propagates `data-state`.
- **An auto-dismiss timer must live in its OWN `useEffect([visible])`** — in an effect that also depends on data props, a
  refetch cancels the timer, the re-run hits the guard without re-arming, and the badge sticks.
- **`react-hooks/set-state-in-effect`**: defer a synchronous `setState` with `setTimeout(…, 0)` (returning the cleanup).
  The classic `mounted` guard is therefore banned — use `useSyncExternalStore(neverChanges, () => true, () => false)`,
  which declares the SSR/hydration split in the signature.
- **`react-hooks/preserve-manual-memoization` ("Compilation Skipped")**: the compiler refuses to optimize the whole
  component when a dep array is *more specific* than what it infers — align the dep to the inferred value.
- **Loading skeleton over spinner** on any page investing in count-up and chart scheduling, with `PageContainer` imported
  inside it or wrapped at the call site. Verify it is wired up — `tsc` does not catch an unused component. Mobile CPU
  budget is ~3-5× tighter, so validate motion in a production build, not `next dev`.

### Recharts
- **`useChartColors()` is mandatory for every series** — read CSS vars after paint and pass `chartColors[0..4]` as props.
- **Never pass `useChartColors()` to a Nivo/react-spring component**: `@react-spring/web` cannot interpolate hex→oklch
  and throws on load. Sankey node colors stay hardcoded hex; only Recharts is react-spring-free.
- **Three separate tooltip style props, none inherited**: `contentStyle`, `labelStyle`, `itemStyle` — omitting
  `itemStyle` leaves value rows at Recharts' hardcoded colour, invisible on dark. Define all three as module-level `as
  const` objects using `var(--card)`/`var(--border)`/`var(--card-foreground)`.
- **Axis ticks and legends are numbers, so the Mono Mandate covers them — and a Tailwind class cannot reach them.** Pass
  `tick={CHART_TICK_STYLE}` (`fontSize: 11`, `fontFamily: 'var(--font-geist-mono)'`, `fill: 'var(--muted-foreground)'`,
  canonical copy in `costCenterStyles.ts`) on every axis; `<Legend>` needs a `wrapperStyle`.
- **`<Legend content=>` needs a module-level component** — an inline arrow makes a new ref every render and the legend
  flickers on unrelated state. `Legend` reads `<Bar fill>`, not `<Cell>`: always set `fill` on the `<Bar>`.
  **`formatter`'s first param is `ValueType | undefined`** — never type it `number`.
- **Accessibility goes on the chart, not a wrapper**: Recharts 3.x already puts `tabIndex=0` + `role="application"` on its
  `<svg>`, so pass `role="img"` + `aria-label` + `accessibilityLayer={false}` to the chart itself — and `role="img"` also
  hides the `<Legend>`, so the label must carry the colour→name mapping.
- **Never stack bands whose components can go NEGATIVE** — Recharts draws a negative segment downward, so the stack stops
  meeting the total. The shape with no such failure mode is **one area under a line**, decomposition in the tooltip.
  **100%-stacked composition: pre-normalise the rows, do NOT also use `stackOffset="expand"`.**
- **Rolling charts always render**, with an inline empty-state message when data is insufficient, and time-bucketed data
  belongs in a tested pure layer (`cashflowTimeSeries.ts`).
- Server-cached chart data has colors baked into the React Query cache — **remap at render time for EVERY chart array**.
  Positional remap (`chartColors[i]`) is only safe with no cross-page colour identity: asset-class data remaps via
  `ASSET_CLASS_CHART_INDEX[d.assetClass]`.
- A sticky `<thead>` needs a fully opaque token, never an alpha background.

### Color Theme System
- **Parallel theming**: next-themes owns `.dark`, the custom system owns `data-theme` — fully independent. CSS:
  `[data-theme="name"]` for light, `.dark[data-theme="name"]` for dark; `ColorThemeContext` lives inside `AuthProvider`.
- **`useChartColors` timing**: `useEffect + useState + requestAnimationFrame`, NOT `useMemo` — `getComputedStyle` during
  render runs before next-themes has updated the DOM and yields stale colours on a theme switch.
- **oklch luminance filter**: L > 0.82 in light or L < 0.30 in dark falls back to the static palette, so a theme with
  chart colours at extreme luminance always falls back — fix it at the CSS level. Below ~0.015 chroma everything looks
  identically gray, so `--card`/`--background`/`--muted` need chroma ≥ 0.020.
- **Action/semantic colors that must follow the theme: clamp lightness, do not index-fallback.** `useActionColors` clamps
  only the oklch L channel, preserving hue and chroma; `useChartColors`' same-index fallback would lose the theme hue and
  can collapse two states onto one colour. Resolve **once per section** and pass the colour down.
- **Sign tokens must be verified per theme**: `--positive` is declared twice and no theme overrides it, so one value fixes
  all twelve combinations, while `--destructive` is declared **twelve times** (cyberpunk's is orange) and must be
  measured per theme. Never assume a token change lands globally without counting its declarations.
- **A user-chosen identity colour is a SLOT, not a hex** (`'chart-1'..'chart-8'`, resolved by `resolveCostCenterColor`).
  Three rules: **migrate without a backfill** (`LEGACY_HEX_SLOTS` maps each old hex to the slot at the same position);
  **derive the no-colour fallback from the document id** (FNV-1a), never from the row's rank, which repaints half the
  list on every period switch; **only indices 0-4 are theme-aware** (CLAUDE.md → Known Issues).
- **Adding a theme**: CSS blocks `[data-theme="name"]` + `.dark[data-theme="name"]`, the `ColorTheme` union, the swatch
  in `settings/page.tsx`, grid columns, `tsc`.

### Navigation
- **Single source for nav arrays**: `lib/constants/navigation.ts` — Sidebar, BottomNavigation and SecondaryMenuDrawer all
  import from it, never redeclare inline.
- **Sidebar active state for `/dashboard` must be `pathname === item.href`**, never `startsWith`. **Bottom nav is
  portrait-only**, so an in-page button duplicating the FAB must be hidden **only in portrait** — in landscape the FAB
  is gone and it is the only add affordance.

### Hierarchy, Density and Disclosure
> The visual rules themselves are DESIGN.md's; only the implementation traps live here.
- `MetricCard`: `subtitle` renders RIGHT (`shrink-0`, short strings only), `description` LEFT (`min-w-0 flex-1`).
- **Never give a "Custom" state a permanent slot in a period selector** — it looks disabled until active; render a
  `rounded-full` chip below the selector only when active. A selector working across multiple return paths uses plain
  `<button role="tab">` + a module-level Framer `layoutId`, not shadcn `<Tabs>`.
- **A cardified mobile view needs its own reading note**: a matrix collapsing to per-row cards has no rows and columns,
  so split the help copy (`hidden desktop:block` / `desktop:hidden`) and label each card's axes explicitly.
- **Prefer rendering large local subtrees as pure render helpers or top-level components** — a nested JSX definition
  inside a page component means a simple row selection remounts the whole table. `cn` is NOT auto-imported in pages.

### Accessibility
- **`title` is not an accessible name** — VoiceOver on iOS ignores it and it never fires on touch. Use `aria-label` for
  icon-only buttons and a Radix `<Popover>` for informational content. **A `title` added by a STATE CHANGE is never shown
  at all** (the tooltip opens on pointer *enter*): put the consequence in visible copy.
- **Touch targets ≥ 44×44px**: `h-8 w-8` in dense lists, `h-10 w-10` for primary and destructive actions (shadcn
  `size="icon"` defaults to 36px). **Actions hidden with `opacity-0` are unreachable on keyboard AND invisible on
  touch** — gate them behind `[@media(pointer:fine)]:` variants.
- **A non-interactive element with `onClick` needs `role="button"`, `tabIndex={0}`, `aria-label`, an Enter/Space
  `onKeyDown` and a focus ring — better still, use a native `<button>`.**
- **Tabs**: `role="tab"` + `aria-selected` inside a `role="tablist"` with an `aria-label`; for a real tab/panel
  relationship also wire `id` + `aria-controls`. An active state with no tab in the tablist (a CUSTOM range) needs a
  `role="status" aria-live="polite"` `sr-only` description instead. **A toggle that shows a panel needs `aria-expanded`
  and `aria-haspopup`**, plus a document-level Escape handler added and removed inside `useEffect([isOpen])`.
- **`aria-live` regions**: streaming content needs `aria-live="polite" aria-atomic="false"` and an `aria-label`.
  **Emptying a live region announces nothing** — a two-click confirm must announce the *disarm* explicitly.
- **Data tables**: every `<thead>` `<th>` needs `scope="col"`, and row-header cells must be `<th scope="row">`.
  **Calendar grids need explicit ARIA rows**: `role="grid"`, `role="row"` per week (the flat 42-cell array must be
  sliced), `role="columnheader"`, `role="gridcell"` per date.
- **Colour-swatch buttons**: never label a swatch with its hex (screen readers spell it out) nor, once theme-resolved,
  with a hue name. Name the **position**: `Colore ${i+1} di ${n}` + `aria-pressed`. **`<Button asChild>` inside
  `<Link>`**, never `<Button>`, which emits `<a><button>`.
- **Two-click confirm: no timer, and not `onBlur` alone.** A 3-second auto-disarm is a WCAG 2.2.1 time limit, and Safari
  does not focus a `<button>` on tap. Use a document `pointerdown` listener with a `ref.contains(target)` guard, plus
  Escape, plus `onBlur`. **Disarm BEFORE delegating** — on success the parent usually unmounts, so nothing resets the
  flag on failure and the next single click fires the destructive action.
- **Form error text needs the sign token too**: `text-red-500` fails AA in both modes on a dialog surface AND diverges
  from `--destructive` on the non-default themes.
- **KNOWN GAP**: `PageTabBar`'s inactive tabs have no accessible name below 1440px, affecting Settings, Cashflow and FIRE
  for screen-reader users. When fixing, add `aria-label={label}` unconditionally.

---

## 5. Testing and Workflow

> Session rules — one branch and one commit per session, no commit without explicit approval, the
> guided-verification protocol — live in **WORKFLOW.md**.

### Commands
- `npm test -- <file>` / `npx vitest run <file>` for targeted tests; **`npx tsc --noEmit` before any PR**, re-run AFTER
  writing the tests, not only after the code.
- **Run the suite under `TZ=Europe/Rome` too.** Every date fixture is stamped at noon, twelve hours clear of the DST
  edge, so a whole class of timezone bug is structurally invisible to it — while production dates are **local midnight**
  and the pure layer runs in the user's browser. Compute day-of-year from calendar fields in UTC (`Date.UTC(y,m,d) -
  Date.UTC(y,0,0)`) and add at least one fixture built the way the dialog builds one. Area suites per change:

| Area | Suites |
| --- | --- |
| Overview / materialized summary | `apiAuthRoutes`, `dashboardOverviewService` |
| Rendimenti | `performanceService` (+ `performanceBase`, `drawdownSeries`, `cashFlowMap`) |
| Storico | `chartService` · **FIRE/Goals** `fireService`, `goalService`, `goalMath`, `goalProposal` |
| Assistant | `assistantRoutes`, `assistantWebSearchPolicy`, `assistantMonthContextService` · **Obiettivi** `assistantGoalEvaluation`, `assistantGoalEvaluationService`, `assistantMemoryExtraction`, `assistantMemoryStore` · **Goal-Based** `goalMath`, `goalProposal`, `apiAuthRoutes` |
| Dividendi / cron | `dividendUseCase`, `dividendProcessor` · **Email** `monthlyEmailService` |
| Asset / bond | `assetDialogHelpers`, `couponUtils` · **Budget** `budgetUtils` |
| Centri di costo | `costCenterUtils`, `costCenterColors` |
| Analisi | `expenseGrouping`, `cashflowSankey`, `cashflowComposition`, `comparisonDeltas`, `expenseEntityStats`, `entitySearch` |
| Transfers / cash | `cashBalanceReconciliation`, `updateCashAssetBalancesAtomic`, `transferFeature` |
| Allocazione | `allocationUtils` · **Ledger** `assetTransactionUtils`, `assetTransactionsRoutes`, `assetTransactionWriteTx` |
| Fondo pensione | `pensionDeduction`, `pensionContributions`, `pensionReturn`, `pensionContributionService`, `performanceBase`, `pensionFire`, `pensionFamilyMembers` + the transfer trio |

Touching `types/assets.ts`'s `AssetType` also means `assetDialogHelpers` + `allocationUtils` + the three ledger suites.

- `npx knip` uses the root `knip.json`: `components/ui/**` and `public/sw.js` ignored, `firebase-tools` an ignored
  dependency, and `ignoreExportsUsedInFile: true` means remaining EXPORT_ONLY findings are deliberate prop surface.
- Emulators, Playwright, production-build verification and their environment traps: **SETUP.md → Steps 6-7**.

### Emulator Exercise Scripts
A collection whose value is in the *wiring* gets one: the unit suites mock Firestore away, so only an exercise covers the
rules permitting the writes, real `Timestamp` values surviving `removeUndefinedDeep` and the real atomic transaction.
- **Write them as `.mts`** — a `.ts` script is CJS under tsx and has no top-level await, and neither does `npx tsx -e`
  (same failure, and a throwaway one-liner that dies this way leaves you reading the state you meant to change). **Drive the mutations through the
  app's services** (client SDK, rule-evaluated) and do the script's own reads/fixture edits with the Admin SDK: from an
  `.mts` file a `doc()` imported there rejects a `db` built here, and sign-in works, which makes it look unrelated.
- Prefer verifying with **two independent paths**: compute the expected figure in the script from the same real
  snapshots — a same-code-path comparison would be circular.
- **Stopping the emulators: send SIGINT to the `firebase` CLI process, not to the `scripts/emulators.mjs` wrapper.**
  The wrapper exits immediately, its children survive, and `--export-on-exit` never runs — `.emulator-data/` keeps the
  timestamp it had at startup and the session's data is lost on the next import. Check that timestamp before trusting
  the shutdown.

### Browser-Driven E2E (Playwright)
- **What belongs here**: only what needs a real layout — the `desktop:` switch at 1440px, a collapsible, a state flash,
  computed font sizes, bounding boxes, overflow. The arithmetic stays with Vitest.
- **Two limits the suite cannot cover**: a race between concurrent queries is **not reproducible locally** (the Firestore
  Web SDK multiplexes every target onto ONE webchannel), and an **error branch is not reachable by cutting the network**
  (the SDK treats an unreachable backend as offline and retries).
- **`workers: 1`, non-negotiable** — the specs share emulator accounts. **Give the suite its OWN fixture, not another
  script's end state**, with numbers that make the assertion meaningful (dating every Analisi expense to January keeps
  its figures exact whatever month the suite runs in).
- **Re-seeding an account mid-suite logs it out**: `auth.updateUser(uid, { password })` revokes the refresh tokens and
  invalidates the parked `storageState`. Split the seed — creation once from `global-setup`, data-only per test.
- **`storageState` does NOT capture IndexedDB unless you ask for it**, and the Firebase session lives there: the file
  looks valid and every spec silently lands on `/login`. Pass `{ path, indexedDB: true }`.
- **Prove the test can fail before trusting it** — the 1440px assertions were re-run at 1200px, where they must fail.
- **`page.addInitScript` runs BEFORE `document.documentElement` exists**: observing it throws, the init script dies on
  that line, and the spec passes because it observed *nothing*. **Observe `document`** with `subtree: true`.
- **`innerText` applies `text-transform`; `textContent` does not** — a marker taken from an uppercase eyebrow never
  matches `body.innerText`, and a falsification run using such a string stays green.
- **Responsive DOM duplicates make `.first()` a trap** (the DOM-first node is usually the HIDDEN mobile copy) — filter
  with `.filter({ visible: true })`. **A collapsed CSS-grid region is still "visible" to Playwright**: scope through the
  toggle's `aria-controls` id and assert the collapse by measuring height.
- **`CompositionList` clickable rows are `<button role="listitem">` — the explicit role WINS**; the accessible name is
  `"{name}, {value}, {share}%"`. `PageTabBar`'s inactive tabs need a viewport ≥ 1440px to be locatable.
- **A `fill()` right after `goto(…, { waitUntil: 'domcontentloaded' })` can be silently wiped** by hydration reconciling
  the input back to its initial React state — use `waitUntil: 'load'` and verify with `.inputValue()`.
- **Two `boundingBox()` calls sample two different FRAMES.** While the vaul drawer slides up, the second element reads as
  *higher* than the first and a one-column layout looks like two. Read every rect a single assertion compares in ONE
  `evaluate()`. Same rule for anything measured during an animation.
- **The emulator needs Java ≥ 21 and the system JVM here is 15** — prepend the portable Temurin at
  `%USERPROFILE%\.jdk\jdk-21.0.12+8-jre\bin` to `PATH` for the emulator terminal (SETUP.md → Step 6). Stopping the npm
  wrapper does **not** kill the JVM: the ports stay taken and the next start fails with "port taken", not with anything
  naming a stale process.
- **A throwaway session spec must match an existing project's `testMatch`** (`*.spec.ts` → `desktop`,
  `*.mobile.spec.ts` → `mobile`), assert against Firestore rather than the page, plant a decoy word that appears nowhere
  in the seed, delete the documents it created, and delete itself.

---

## 6. Quick-Fix Reference

- **A domain rule copy-pasted into a 3rd file will diverge, and the divergent copy is the one users see**
  (`assetPricing.ts` is the worked example).

### Audit habits
- **"Keep" verdicts need the same grep as "Delete" verdicts.** A wrong Delete breaks the build immediately; a wrong Keep
  burns a whole commit polishing a component with zero importers.
- **A doc comment naming a caller is a claim, not evidence — grep it**, and when the grep contradicts the comment fix the
  comment in the same commit. This covers page/component docstrings, not just the `.md` files.
- **Knip marks a dead chain's intermediate links "live"** because the orphan still imports them: trace the call graph
  inward, verify each link independently, and delete the whole chain in ONE commit. Likewise **a function that always
  returns `[]` keeps its whole downstream pipeline "live"** — read the function that decides *what* gets captured.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
