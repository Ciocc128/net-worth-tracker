# AI Agent Guidelines — Net Worth Tracker

Conventions and recurring pitfalls. **Rules only**: the archaeology of how each one was
learned lives in `git log` and in the session notes, not here.

Companion documents — do not duplicate their content into this file:

| File | Owns |
| --- | --- |
| `CLAUDE.md` | Architecture snapshot, feature index, **Known Issues** (open debt) |
| `DESIGN.md` | The aesthetic spec (normative frontmatter + narrative). Never regenerate it |
| `PRODUCT.md` | Users, positioning, accessibility posture |
| `SETUP.md` | Env vars, Firebase, emulators, Playwright, local-verification troubleshooting |
| `WORKFLOW.md` | Standing session rules + the guided-verification protocol (portable across repos) |
| `COMMENTS.md` · `DEVELOPMENT_GUIDELINES.md` | How to write code and comments here |
| `docs/impeccable-artifacts.md` | How the design-system artifacts and their detector fit together |
| `docs/{critique,audit}-prompts.md` | Per-page review prompts |

---

## 1. Conventions

### Italian Localization
- All user-facing text in Italian, all code comments in English.
- `formatCurrency()` for EUR, `formatDate()` for `DD/MM/YYYY`, `Sottocategoria` (no hyphen),
  `Buongiorno Giuseppe` (no comma).
- Kept in English on purpose: `Hall of Fame`, `FIRE e Simulazioni`, `Cashflow`, `Assistente AI`,
  and the standard metric names (`Time-Weighted Return`, `Money-Weighted Return (IRR)`,
  `Sharpe Ratio`, `YOC`, `Max Drawdown`). `Recovery Time` → `Tempo di Recupero`,
  `Current Yield` → `Rendimento Corrente`.
- **Curly apostrophes break `.tsx`**: an edit can introduce `’` instead of `'`, and TypeScript
  throws `TS1127: Invalid character`. Fix by delimiting the string with double quotes. Check after
  any session that edits Italian prose in TypeScript.
- **JSX eats the space next to an inline tag or a wrapped expression.** `Da {fn(x)} il valore`
  renders as `Da Lug 2026il valore` once Prettier breaks the line — JSX trims the leading
  whitespace of a text node that starts on a new line. Always write `{' '}` on both sides of a
  `<strong>`/`<em>`/expression. Invisible in the source; only the browser shows it.
- **Italian `Intl` output breaks naive string matching.** CLDR gives `minimumGroupingDigits = 2`, so
  four-digit amounts print **ungrouped** (`1821,01 €` but `29.800,00 €`), and the `€` is preceded by
  a **non-breaking space**. Anchor matchers accordingly (`/^821,01[\s ]*€$/`); never
  hand-concatenate `amount + ' €'`.

### Firebase Dates and Timezone
- `toDate()` for conversion; `getItalyMonth()` / `getItalyYear()` / `getItalyMonthYear()` for domain
  grouping. Never `Date.getMonth()` / `getFullYear()`.
- Server-side "today" day window (cron): `getItalyDayBoundsUtc()`. `new Date().setHours(0,0,0,0)` is
  UTC midnight on Vercel and misclassifies dates near the boundary.
- An inclusive upper bound on a month is `endOfMonthBound(year, month)`. The 1st at midnight
  silently drops everything recorded later that day — in practice the entire closing month.
- `<input type="date">` defaults: `getItalyDateIso()`. `toISOString().split('T')[0]` is UTC, so from
  22:00 Italian time the form proposes yesterday.

### Tailwind Breakpoints and Responsive Layout
- `desktop:` = 1440px, never `lg:`. Dialog-internal layouts use `sm:`. Bottom page wrappers on
  portrait mobile: `max-desktop:portrait:pb-20`. Currency in compact KPI grids: `text-lg desktop:text-2xl`.
- **NEVER mix arbitrary `min-[px]:` with named breakpoints on the same property.** Named breakpoints
  compile to **rem** media queries and v4 emits them *after* the px ones, so
  `sm:grid-cols-2 min-[960px]:grid-cols-3` renders 2 columns at every width ≥ 640px. For a
  breakpoint between `tablet:`(768) and `desktop:`(1440), use a **container query**
  (`@container` + `@[640px]:` / `@[960px]:` — all px, ordered correctly).
- **Container queries when one component renders at several widths.** A viewport breakpoint keys off
  the screen, not the component's box. Mark the wrapper `@container` and use `@2xl:` against the
  component's own width (`CashflowWidget`/`CashflowKpiCarousel`). Mixing axes is fine and often
  necessary: column count = container query, device affordances (drawer vs inline) = viewport.
- **Per-cell `@container` for monetary values**: large amounts overflow a fixed `text-2xl` in a
  narrow grid cell. Make each cell its own `@container` and scale the value font to the CELL width
  (`text-base @[150px]:text-lg @[190px]:text-xl @[240px]:text-2xl` + `min-w-0 break-words`).
- Adding `sm:grid-cols-2` to a 3-item row strands the third card on a half-width row. Prefer
  full-width stack → `desktop:grid-cols-3`. Reserve `sm:grid-cols-2` for content where two columns
  genuinely help (Bear/Base/Bull cards).
- `items-end` on a form grid is only safe when every cell is label + input. One cell with hint text
  makes the hint the new "bottom" — use `items-start` there.
- **Center one flex child without collapsing a `w-full` sibling: `self-center`, not `items-center`**
  (`items-center` shrinks every child to content width). `self-*` acts on the CROSS axis.
- **Horizontal page scroll on mobile**: an implicit-`auto`-track grid expands to its widest child.
  Add explicit `grid-cols-1` and `min-w-0` on flex/grid children (they default to `min-width:auto`).
- `overflow-x-hidden` on an ancestor CLIPS a descendant's `overflow-x:auto` (new BFC). Fix the real
  overflow source; reserve it for decorative elements with no scrollable descendants.
- **One scroll container per region.** A scrollable region nested inside another captures the wheel
  and content below becomes unreachable (desktop-only symptom). A partial fix that removes the inner
  `max-h` still fails while two scroll ancestors remain.

### shadcn Card and Dialog Surface
- `Card` (new-york) has `py-6` built in; `CardContent` adds `px-6` only. No manual `pt-6` needed.
- **`CardHeader` is `flex flex-col`** — a `flex justify-between` row inside it makes any `flex-1`
  grandchild act on the vertical axis, so `truncate` stops working and `shrink-0` siblings get pushed
  off-screen. Use a plain `<div className="px-4 py-3 flex items-start gap-2">` instead.
- **`ResponsiveModal`** (`components/ui/responsive-modal.tsx`) is the convergence target for
  form-style modals: centered `Dialog` on desktop, vaul `Drawer` ≤768px, one API. Default width is
  `max-w-4xl` (override via `dialogClassName`); the caller resolves the footer layout per breakpoint;
  it handles the required `Description` itself. Small confirms and the 2-step `AssetDialog` may stay
  plain `Dialog`s.
- **`DialogDescription`/`DrawerDescription` is required** in every `DialogContent`/`DrawerContent`
  (`sr-only` when it should not show). Never silence the warning with `aria-describedby={undefined}`.

### Layout and Color Tokens
- Never hardcode structural colors in shell components — `bg-background`, `text-foreground`,
  `border-border`.
- **Sign colors are tokens: `text-positive` / `text-destructive`**, chips `bg-positive/10`.
  Resolved via `getMetricValueColor()` (`lib/utils/metricColors.ts`) for gain/loss, income/expense,
  deltas, variation chips and fiscal gains. Raw `text-green-*`/`text-red-*` stay literal across the
  six themes and put two different "negatives" on one screen. Two gotchas: **drop `dark:` variants**
  (the token swaps itself via the cascade), and `getMetricValueColor()` returns **neutral** for the
  `currency` format by design — signed-currency values take `signChipClass`/`signTextClass`
  (`metricColors.ts`) directly. Legacy `text-emerald-*` remains in `ExpenseTrackingTab`,
  `MobileExpenseRow`, `CashflowKpiCarousel`; migrate when touching them.
  `--positive` / `--destructive` are also declared as raw CSS vars, so `var(--positive)` works in
  inline `style` and SVG `stroke`/`fill`.
- **`--warning` (amber)**: `bg-warning text-warning-foreground border-warning-border`. In light mode
  `--warning` is near-white, so text on a `bg-warning` fill MUST use `text-warning-foreground`.
  Standalone amber text on a plain card is a different case: Panoramica's cost/tax figures use
  `text-warning-foreground`, while `PerformanceHero`'s "fragile" verdict and the Risparmio KPI's
  10-19% band deliberately keep raw `text-amber-600 dark:text-amber-400`. Check for an actual
  `bg-warning` fill before converting.
- **A chart slot is not a text colour.** `--chart-1..5` are tuned for ~3:1 against a plot area;
  `text-[var(--chart-3)]` measured **1.02:1** on one theme. The semantic amber is
  `--warning-foreground`. Only remaining exception: `ExpenseTable.tsx`'s category chips.
- `text-blue-600` / `text-purple-600` / `text-orange-600` have no semantic meaning here;
  `text-purple-600` is flagged by the impeccable detector as `ai-color-palette`.
- **Sidebar tokens**: `--sidebar-accent` is a background, `--sidebar-accent-foreground` is text ON
  it, `--sidebar-primary` is an accent on the plain sidebar background. For hover on inactive items
  use `hover:text-sidebar-foreground` — `--sidebar-accent-foreground` is dark and disappears there.
- **Inline `style` blocks Tailwind hover variants** — an inline `color`/`opacity` always wins.
  Migrate to classes before adding `hover:`/`focus:`.
- **`color-mix()` for tints of a runtime colour**: `color-mix(in srgb, ${color} 40%, transparent)`
  for a border, `10%` for a fill, applied via inline `style` because the value is dynamic.
- Config arrays with semantic per-item colors carry only `label`/`icon`; resolve the colour inside
  the component from `useChartColors()` by index.
- **CSS custom properties never reach the emails or the PDF** (both render outside the DOM), so the
  sign hexes there are permanently out of sync. CLAUDE.md → Known Issues.

---

## 2. Data and State Patterns

### React Query and Derived State
- Invalidate all related caches after a mutation. **Asset mutations need a dual invalidation**:
  `queryKeys.assets.all` AND `queryKeys.dashboard.overview` — the Patrimonio hero reads the overview.
- Use `useMemo` for derived state; never `useEffect + setState`. Normalize date-like API values at
  the hook boundary with `toDate()`.
- Never remove tabs from `mountedTabs`. Keep per-scope active-tab state explicitly instead of one
  shared sub-tab value.
- **`forceMount` tabs that derive from a sibling's data MUST use React Query.** A mount-time
  `useEffect` loader runs once and never re-fires, so the tab goes stale until a full reload
  (`CostCentersTab`). Invalidate **unconditionally** on expense save/delete — an edit can remove a
  cost center as easily as add one.
- **Shared key prefix covers list + detail**: `['cost-centers', uid]` is a prefix of
  `['cost-centers', uid, centerId, 'expenses']`, so one invalidation refreshes both.
- **`initialData` on a query with a global `staleTime` silently disables its fetch** — it writes into
  the cache stamped as freshly fetched, and this project sets `staleTime: 5min` +
  `refetchOnWindowFocus: false`. The seeded query then never fetches, never reaches `isError`, and
  never sees a co-owner's change. **Use `placeholderData`.**
- **Lazy-load gating for expensive panels**: `enabled: !!userId && isOpen`.
- **Use `isLoading`, not `isPending`** on a disabled query (`enabled: !!ownerId`) — `isPending`
  stays true forever and the skeleton never lifts.
- **An async view must gate on EVERY query it reads**, not only the ones that drive the empty state.
  Queries defaulting to `[]` short-circuit into "nothing tracked yet" on a cold load.
- **State that belongs to a subject must be stored WITH its subject, not reset by an effect.** A
  component that stays mounted while its subject changes (the same JSX position, a new entity) needs
  its local state invalidated — and the synchronous reset in an effect is banned by
  `react-hooks/set-state-in-effect`. Store the subject alongside the value
  (`useState<{ scopeKey, year } | null>`) and derive the effective value: when the stored key stops
  matching, the default takes over on its own, with no effect and no extra render. Applied to the
  expanded year row in `EntityDossier`.
- **A failed fetch is not an empty set.** Route `isError` to an explicit `role="alert"` notice
  BEFORE the empty-state check, in every view.

### Dialog Form Reset
- The reset `useEffect` must include `open` in its deps (otherwise a second create keeps stale
  values) and start with `if (!open) return`.
- The new-record branch must enumerate **every** field, including optional ones, and call
  `replaceTiers([])` — `reset()` does not clear field arrays.
- **`useWatch()` for render, `getValues()` for handlers — never `watch()`.** `watch()` is
  incompatible with the React Compiler and makes it skip the whole component.
- `React.ElementType` is the field type for a Lucide icon stored in a typed array.
- A submit button outside the `<form>` connects via `<button type="submit" form="my-form-id">`.

### Firestore Writes
- `updateDoc` only touches fields present in the object, and `removeUndefinedDeep`
  (`lib/utils/firestoreData.ts`, aliased as `removeUndefinedFields`) strips `undefined` — so
  clearing an optional field needs an explicit `deleteField()`. It recurses into arrays and plain
  objects while preserving `Date`/`Timestamp`/`FieldValue`; never reintroduce a shallow version.
- `deleteField()` is **not allowed with `setDoc()` without `merge:true`**.
- **Which clear-guard to use depends on whether partial callers exist.** `averageCost`, `taxRate`,
  `displayTicker`: only `AssetDialog` calls them with a complete form, so a bare
  `=== undefined → deleteField()` is safe. `leverageRatio` also rides on plain `updateAsset`, which
  price-update callers hit without the key — it needs the `'leverageRatio' in updates` guard, or a
  price refresh wipes the leverage. Check for partial callers before copying either.
- **`runTransaction`: ALL `tx.get()` before ANY write.** A `get→update` loop violates it on the
  second doc and is invisible when the function is mocked away. Aggregate deltas per docId before
  the transaction so a ref is never read and written twice. Template:
  `__tests__/updateCashAssetBalancesAtomic.test.ts` — a fake `runTransaction` whose `tx.get` throws
  once a write happened, never a mock of the function itself. **Fire success toasts AFTER the
  reconcile returns.**
- Firestore rejects `undefined` inside an array element. `assetAllocationService.ts` builds its
  `docData` by hand (so `removeUndefinedDeep` never runs): array fields need a whitelisting
  serializer with conditional spreads (`serializeFamilyMembers`, `serializeCoastFirePensions`).
- **Max 3 `.where()` calls** on a chain that will be unit-tested — a 4th breaks the mock chain
  (`.where is not a function`). Filter post-fetch instead.
- Equality-only queries with an in-memory sort need no composite index (`assetTransactions`,
  `pensionContributions`, `deleteExpensesByImportBatch`). Adding an `orderBy` makes indexes mandatory.

### Settings — the FIVE places
- A new setting must be added to all five or it silently disappears: the type (`types/assets.ts`),
  the read mapping in `assetAllocationService.getSettings`, **BOTH** write chains in `setSettings`
  (the `targets` branch uses `setDoc` with no merge, the other uses `merge: true`), and the
  state/load/save/dirty-snapshot wiring in `app/dashboard/settings/page.tsx`. Guarded by
  `__tests__/settingsRoundTrip.test.ts`. Fixing only the read side reproduces the identical symptom.
- **A user-clearable field needs a different shape per branch**: `delete docData.x` in the no-merge
  branch, `deleteField()` in the merge branch — and the guard must be `'x' in settings`, not
  `x !== undefined`, so the page can distinguish "clear this" from "not part of this update".
- **Store a boolean explicitly, never derive it** from the presence of other fields — disabling it
  has no effect on reload. Use `?? derivedFallback` on load for backwards compatibility.
- All feature toggles live in `AssetAllocationSettings`, never in `UserPreferences`.
- **One Save button validates the whole page**: `handleSave` returns early when the allocation
  targets do not total 100, so a preference on another tab cannot be saved while they are invalid.
- Dirty-state snapshot keys must contain **only persisted fields** — pure UI state in the key creates
  a false dirty indicator on every click — and the baseline must be captured *after* the Firestore
  state is applied. An array field needs both keys normalized identically (order-independent,
  numbers rounded) by one shared function.
- The Settings page manages its own local state, but `AssetDialog` reads `['settings', ownerId]` via
  React Query — `handleSave` must `invalidateQueries` that key or new family members take 5 minutes
  to appear.
- `cashflowHistoryStartYear` is shared (Cashflow / Storico / Assistant / overview). Never rename it
  page-specifically; pass it through.

### Caching
- **Per-user pre-computed cache** (`performance-cache/{userId}`): the key encodes **every** input
  that determines the result — a hash of the WHOLE snapshot series (not just the last one), the
  metrics base signature, the risk-free rate, the dividend category. Round to the euro. TTL fallback
  (6h) covers inputs outside the key; `forceRefresh` bypasses the read and rewrites; reads and writes
  are `try/catch` and fire-and-forget. `Date` ↔ `Timestamp` conversion is field-by-field with
  explicit types, never a JSON round-trip.
- **A changed FORMULA is the one input no signature can see — that is `CACHE_MATH_VERSION`**
  (`performanceService.ts`, currently `v5`). Bump it on any change to what the pipeline computes from
  unchanged inputs, and only then; a test pins the current prefix. When verifying a calculation
  change by hand, press **Aggiorna** (`forceRefresh`) at least once before concluding anything.
- **Global shared cache** (benchmark, FX, ECB): natural key as doc id, no `userId`, rule
  `read: isAuthenticated(); write: false`, TTL as `cachedAt` compared server-side. Client
  `staleTime` = server TTL minus headroom.
- **Sparse external series must be expanded to a full monthly array before caching** — keep the last
  observation per `YYYY-MM` in a `Map`, then iterate with `Date.UTC` emitting the last seen value.
- **Schema evolution without a key bump**: add the new field as **optional** so old docs degrade
  gracefully, and pair it with an explicit force-refresh path (`?force=true` bypasses the read but
  still writes back; the hook exposes `refresh()` backed by a `useRef` flag). Wire "Aggiorna" buttons
  to `refresh()`, never to bare `refetch()` — that re-hits the endpoint and receives the same doc.
- Firestore rule for a per-user cache: `isOwner(userId)` with the doc id == userId.

### Server Layer and API Authorization
- Route = auth → validate → fetch → ownership check → delegate → return. No Firestore queries or
  business logic in the handler body. `lib/server/assetAdminRepository.ts` is the canonical Admin
  asset fetch.
- Every Admin SDK route authenticates server-side and binds to `decodedToken.uid`; Firestore rules do
  not protect Admin SDK calls. Enforce record-level ownership after loading the document.
- **Owner-scoped routes authorize with `assertCanAccessAccount(decodedToken, ownerUserId)`**, never
  a fallback to `decodedToken.uid`. Viewer-scoped routes (sharing management) just read the token uid.
- Client calls go through `authenticatedFetch()`. Server-owned materialized docs are mutated only via
  a private authenticated route, never from the client SDK.
- Cron routes authenticate with `CRON_SECRET`; `/api/portfolio/snapshot` must keep accepting
  `cronSecret` for internal orchestration.
- **Validation**: `lib/server/validation.ts` (`server-only`) owns the reusable schemas and
  `parseOr400`. Apply it in every new handler; never cast with `as { … }` first. `z.coerce.date()` is
  required for date fields (JSON carries ISO strings). Inputs that originate from **Firestore** must
  also be validated at the service entry point — client-side zod can be bypassed by writing directly
  to Firestore (`scrapeDividendsByIsin`, `getBondPriceByIsin`, plus `encodeURIComponent`).
- **`.superRefine()` returns a ZodEffects with no `.partial()`/`.omit()`**: build a base `z.object`,
  refine it for create, and `base.omit({…}).partial().superRefine()` for update.
- **Rate limiting** (`lib/server/rateLimit.ts`, `server-only`): sliding window on a module-level Map,
  applied **after** auth (the limit is per-uid). `${userId}:stream` 30/h, `${userId}:analyze` 10/h.
  Per-instance, so a cold start resets the window — a documented trade-off. Tests importing it need
  `vi.mock('server-only', () => ({}))` plus a `checkRateLimit` mock.
- **Registration policy** (`lib/server/registrationPolicy.ts`, `server-only`) reads
  `REGISTRATION_WHITELIST` — no `NEXT_PUBLIC_` prefix, so the email list never reaches the bundle.
  `lib/constants/appConfig.ts` must stay client-safe: only the two boolean flags.
- **Do NOT bump `firebase-admin` past 13.x.** `@14 → jwks-rsa@4 → jose@6` is pure ESM and Vercel's
  Lambda runtime `require()`s it → `ERR_REQUIRE_ESM` on every Admin route. A Node-22 forward fix was
  tried and still failed.

### Shared Account / Delegated Access
- **Viewer vs owner.** `useAuth().user` is the *viewer* (identity behind the token, profile, theme,
  sharing management) and never changes. `useActiveAccount().ownerId` is whose data is displayed.
  Data-scoped hooks and pages pass `ownerId`; keep `user.uid` only for viewer-scoped uses (theme,
  profile, PDF author, `useDemoMode`, sharing UI).
- **Grant model**: `account-access/{ownerUid}` = `{ ownerUid, ownerEmail, ownerDisplayName,
  memberUids[], members[] }`. `memberUids` is what the rules and the `array-contains` discovery query
  read; the rest is denormalized for display (a member cannot read `users/{ownerUid}`).
- **Three enforcement layers, kept in sync**: (1) `firestore.rules` — `canAccess(ownerUid)` on every
  data collection, `create` uses `canAccess(request.resource.data.userId)`, `userPreferences` stays
  `isOwner` (theme is per-viewer), `account-access` is client-readable but **write:false**;
  (2) `assertCanAccessAccount` on Admin routes; (3) the client substituting `ownerId`.
  **Rules changes are inert until deployed** (`firebase deploy --only firestore:rules`).
- Membership goes only through `POST/GET/DELETE /api/account/members`, where the owner is always
  `decodedToken.uid`. The member must have registered first (`adminAuth.getUserByEmail`).
- **Switching gotcha**: React Query keys namespace by the id passed in, but manual `useEffect`
  loaders (settings, history, performance, allocation, hall of fame) must include `ownerId` in their
  deps. `useActiveAccount()` exposes `loading`, NOT `isLoading`.
- The account switcher must exist in BOTH the Sidebar and the `SecondaryMenuDrawer` — in portrait the
  Sidebar is unreachable, so the drawer is a delegate's only way to switch. `getAccountLabel`
  (`lib/utils/userDisplayUtils.ts`) is shared so the two can never disagree.

### Demo Mode
- `useDemoMode()` compares `user.uid` to `NEXT_PUBLIC_DEMO_USER_ID`; false if either is absent.
- Disable pattern: `disabled={isDemo || …}` with a single merged `title`/`aria-label` ternary
  (duplicate JSX `title` = `TS17001`). Header buttons outside an `{isDemo ? … : …}` conditional are
  still rendered and must be disabled explicitly.
- Prefer `aria-label={isDemo ? 'Azione — non disponibile in modalità demo' : 'Azione'}` over `title`.

### Dynamic Imports and Module Hygiene
- `next/dynamic` with named exports unwraps via `.then(m => ({ default: m.Named }))`; `ssr: false`
  for client-only dialogs; pass the props type parameter.
- **Components must be at module level.** A component defined inside a render body is a new type
  every render, so React remounts it (`AnimatePresence` enter never plays, `useEffect([])` re-fires)
  — and the React Compiler throws "Cannot create components during render". Pass parent state as
  props (`SortHead`, `MobileHistoricalView`, `TransactionDetailIcon`, `LegendItems`).
- **All hooks must precede any conditional early return**, including "derived" `useMemo`s. Guard
  undefined data inside the hook body.
- Pure `lib/utils` modules reach `calculateAssetValue` in one of two established ways — check the
  precedent, do not pick by instinct: **injected** as a `valueOf` param (`allocationUtils`,
  `pensionFire` — Firebase-free and mockless) or **imported directly** with the test file mocking
  `@/lib/firebase/config` + `firebase/firestore` + `authFetch` +
  `dashboardOverviewInvalidation` (`dashboardOverviewUtils`, `assetExposureUtils`).
- Functions that call `new Date()` internally are untestable — pass `now: Date` explicitly.
- **shadcn vendored surface policy**: `components/ui/**` is ignored by knip. Standard shadcn API
  (`DialogTrigger`, `SelectGroup`, the `sidebar.tsx` family, `--destructive-foreground`, the whole
  `--sidebar-*` octet) stays even at zero references — the next `npx shadcn add` would regenerate it.
  Only **custom additions made in this repo** get deleted when they reach zero references.
- **CSS custom property liveness — the 5-check sweep.** A dead entry in `globals.css` produces no
  build error; grep is the only signal. A token is live if ANY holds: (1) `var(--name` in
  `.ts/.tsx/.css`; (2) if mapped via `@theme`, the **generated utility name** appears (`bg-X`,
  `text-X/10`) — grep the utility, not the variable; (3) `getPropertyValue('--name')`; (4) an
  internal chain (a mapping and its raw token have independent liveness); (5) the vendored-surface
  contract above. A confirmed-dead token must be removed from **every** theme block in one commit.

---

## 3. Domain Rules

### Expense Grouping: key by id, label by name (`lib/utils/expenseGrouping.ts`)
- **Category names are NOT unique and never will be.** `createCategory` is a bare `addDoc`, and the
  product deliberately allows "Casa" as a *Spese Fisse* category AND as a *Spese Variabili* one.
  Anything keyed on `categoryName` merges them; any node identity built from it collides.
- **The one rule: group by `getCategoryKey`/`getSubCategoryKey`, display via `resolveDisplayLabels`.**
  `getCategoryKey` = `categoryId || trimmed name || UNCATEGORIZED_LABEL` (the name fallback keeps
  legacy rows visible). `getSubCategoryKey` maps missing/blank to `NO_SUBCATEGORY_KEY`, a key like
  any other — which is what lets callers delete their `=== 'Altro'` special cases.
- **`resolveDisplayLabels` qualifies ONLY where the rendered surface actually collides.** Ambiguity
  is measured over the set of KEYS per name, not a row count. Call it once per surface, keyed by node
  id where ids carry the type. Two categories sharing name AND type get the same label — accepted;
  clicks still resolve through the key, and a positional counter would be unstable noise.
- `selectExpensesForDrillDown` matches the type **EXACTLY**. The predicate it replaced tested
  `type !== 'income'`, lumping fixed+variable+debt together and letting transfers through.
- **Not retrofitted, deliberately** (already correct, own tests): `lib/utils/expenseBreakdown.ts`,
  `costCenterUtils.buildSubCategoryComposition`.

### Expense Sign Convention and Type Changes
- Income is stored positive, expenses negative, net savings = `sum(income) + sum(expenses)`.
  Moving a record across the boundary flips the sign.
- **Classification is ALWAYS by `type`, never by the sign of `amount`.** `transfer` → skipped,
  `income` → income, everything else → spending via `Math.abs`. Classifying by sign miscounts a
  refund (a spending row with a positive amount) as income. Test fixtures must therefore carry an
  explicit `type` — one derived from the sign bakes in the assumption under test.
- **`ExpenseDialog` type change — all five types, shape-aware.** `onSubmit` picks among four
  branches: `transfer→transfer` (`reconcileTransferEdit`), `single→single` (`reconcileSingleEdit`),
  and the two cross-shape edits (`reconcileTransferToSingleEdit` / `reconcileSingleToTransferEdit`),
  which reverse the OLD shape's effect and apply the new one in a single delta-map transaction.
  `updateExpense` re-derives the stored sign from the incoming type and nulls `transferCashAssetId`
  when the row leaves the transfer type.
- **The BATCH paths refuse to cross the transfer boundary** (`crossesTransferBoundary`,
  `lib/utils/expenseTypeTransition.ts`): `updateExpensesType`, `moveExpensesToCategory`,
  `moveExpensesFromSubCategory` throw `TransferBoundaryError` when expenses exist — each row would
  need its own destination account. The UI prevents it upstream (disabled type options, filtered
  destinations). `needsSignFlip` lives there too and is positive-side-based (`income`/`transfer`).
- Changing the type always invalidates the category (categories are type-scoped);
  `resolveEquivalentCategory` re-points to the same-named one under the new type.
- `recurringDay` must be cleared with `deleteField()` — `removeUndefinedDeep` strips `undefined`.

### Cashflow Drill-Down: One Landing Path
- **There is ONE drill destination and ONE transaction list.** Every entity entry point on Analisi —
  composition row, Sankey node (`onEntityClick`), `EntitySearch` pick, anomaly chip, Confronto delta
  row — lands through `handleEntitySelect` in `AnalisiTab.tsx`, which resolves labels exactly like a
  URL-restored focus (`resolveFocusLabels`) and opens the drill at level 2/3. Adding a new entry
  point means calling that handler, nothing else.
- The aggregation modules (`cashflowComposition` vs `cashflowSankey`) stay separate — different
  shapes for different questions — but both key through `expenseGrouping`.

### Sankey: node identity is the node id (`lib/utils/cashflowSankey.ts`)
- **d3-sankey resolves link endpoints through a `Map` of ids.** A duplicate id keeps the LAST node:
  the earlier one is orphaned as a zero-value ghost while the survivor absorbs both branches. Ids must
  be built from **ids**, never display names.
- Id scheme: `budget` · `savings` · `type:{tipo}` · `cat:{tipo}:{chiave}` ·
  `sub:{tipo}:{chiave}:{sottochiave}`. **The type belongs inside the category id** — one category
  document can back rows of two types. The `kind` prefix is what keeps an income and an expense
  category with the same name apart; without it they close a cycle through Budget and
  `computeNodeDepths` throws `"circular link"`, blanking the chart.
- **Ids are opaque — nothing parses or splits them.** Every view returns `{ nodes, links, index }`
  where `index: Map<string, SankeyNodeDescriptor>` is the only sanctioned way to ask what a node is.
  `index.size === nodes.length` is an invariant of construction.
- **`SankeyNode.label` is required and there is no `|| node.id` fallback** — a forgotten label would
  render `cat:fixed:aB3xK9` to the user.
- Subcategory totals hang off their own category object, never a flat name-keyed side map.
- The component's drill state is a single `TypeDrillState | null`; category/subcategory clicks leave
  via `onEntityClick`. The palettes live in the module, not the component, so the "never pass
  `useChartColors()` to Nivo" rule is enforced structurally.

### Analisi — entity-first (`components/cashflow/AnalisiTab.tsx`)
- **The page is entity-first**: the user's questions are about entities ("quanto ho speso di
  condominio quest'anno vs l'anno scorso?"), not about periods.
- **`EntityDossier` is the drill destination** (levels 2/3): period-scoped hero + share, run-rate
  chips, the **per-year table** (newest first, YTD row compared "stessi mesi", signed Δ€/Δ% with the
  sign semantics inverted for spending), and a 24-month `ComposedChart` (bars = entity, dashed muted
  line = same month previous year). **The multi-year blocks deliberately IGNORE the period axis** —
  the period is a cursor over the entity's timeline, not a cage — and each block declares its own
  horizon in a caption. The dossier is never empty: a period with no rows says so and points at the
  blocks below.
- **Each year row expands into its per-subcategory deltas** ("how much of Casa's +820 € is
  condominio?"), newest row open by default. The two windows compared are the row's own, derived by
  `resolveYearRowWindows`, which is what makes `Σ(subcategory delta) === row.delta` true by
  construction. Only at category level — at subcategory level there is nothing left to decompose.
  Rows with a single subcategory bucket are not expandable (the nested list would restate the row).
- **The focus SURVIVES period changes** (no `resetDrillDown()` in the period handlers) and is exited
  only via breadcrumb/Indietro. The category colour is DERIVED at render from the current composition
  (`focusColor`), never stored in drill state — a URL-restored focus never clicked a slice.
- **Focus in the URL**: `?focusType&focusCat&focusSub`, three FLAT params (no composite string — a
  name-fallback key IS a name and can contain any delimiter), additive to the period params.
  `readFocusFromSearchParams` validates the type against the enum; `resolveFocusLabels` resolves
  labels from the floored-history composition → taxonomy (zero-spend entities are legitimate
  focuses) → drops the focus. Cold-load application is DEFERRED behind the `loading` gate.
- **`lib/utils/comparisonDeltas.ts` is the single source of the same-months rule — scope included.**
  `resolveComparisonScope(periodMode, selectedMonth, todayMonth)` maps page state to the window for
  BOTH consumers (the KPI pacing rows and `ConfrontoAnnualeSection`): it marks the running calendar
  month `inProgress` (the caption appends "(mese in corso)") and returns **null for a month that has
  not started yet**. `computeTotalsPacing` feeds the pacing rows and the Confronto subtitle;
  `buildCategoryComparison` (union of A∪B keys, `status: 'new'|'gone'`, sorted by |Δ|) feeds the
  delta ranking. `baselineLabel` is produced by the module so call sites cannot rebuild and drift it.
  The comparison year is user-selectable (default Y−1); comparing against `historyStartYear` itself
  renders an honesty caption.
- **Honesty rules that must not be relaxed**: `EntityMonthPoint.prevYearValue` is `number | null` —
  a baseline month below the floor is UNKNOWABLE, not zero, and renders as a gap; the 24-month trend
  block is ALWAYS rendered with an inline empty message (rolling-chart rule); the sibling composition
  card renders its level-1 list while the other side is focused; ONE scroll owner
  (`scrollToFocusCard`) lives in the landing path; `ExpenseList` totals are labelled "Totale netto"
  (signed) because the hero above is gross-by-magnitude; the URL year param clamps to past years;
  `AnomalieBlock` declares the analyzed month.
- Categories and subcategories are keyed by **id**, labelled with the type only where they collide.
- The page is the only one with a Sankey; "Anno Corrente / Anno / Storico" is a period selector on
  the same view, not three views.
- Pure layer: `lib/utils/{comparisonDeltas,expenseEntityStats,entitySearch,cashflowComposition,
  cashflowSankey,cashflowTimeSeries}.ts`.

### Cashflow KPIs and Tracciamento
- *Risparmio Netto* (€) and *Rapporto* (`income/|expenses|`) encode the same relationship in
  different units and are kept separate **on purpose** (saved amount vs coverage health) — do not
  "deduplicate". `KpiCell.info` renders a `Popover` (not a `Tooltip`) so it opens on tap; never pass
  it to the `categorie` cell, which is already a `<button>`.
- **Tracciamento leads with `CashflowHero`** — dominant Risparmio Netto + one verdict + Entrate/Spese
  strip + top-5 — NOT the four co-equal KPIs of the dashboard widget. The verdict is a pure fold in
  `lib/utils/trackingSummary.ts` (`summarizeCashflowHealth`). Only the `PeriodPicker` sits at page
  top; the other filters live in a toolbar inside the list Card.
- **`TransactionFeed` is the canonical movements list**, shared by desktop and mobile
  (`surface="flat"` inside a Card, `"card"` standalone). Desktop keeps the dense `ExpenseTable`
  behind a Feed/Tabella toggle.
- **Feed delete = drawer-confirm, not 2-click.** The parent's `deleteSingleExpense` MUST branch on
  `type === 'transfer'` and call `reconcileTransferDelete` (both legs), like `ExpenseTable` does.
- `expenseStats === null` (no data) ≠ `0` (real zero): empty state for null, `€0,00` only for a
  confirmed zero.

### Budget (`lib/utils/budgetUtils.ts`, `lib/hooks/useBudgetConfig.ts`)
- **Opt-in**: budgets are created explicitly. `reconcileBudgetItems` only refreshes denormalized
  names and drops orphans — it never auto-creates one per category.
- `BudgetItem` fields are all required, fixtures included: `amount`, `period`, `kind`, `order`.
  `monthlyAmount` was renamed to `amount` with a read-migration in `budgetService.normalizeItem` and
  its two server twins.
- **Period semantics** (`getPeriodActual`): monthly = current-month spend; annual = year-to-date.
  Annual budgets never enter `validateBudgetAllocation` (different unit). The **overall** budget is a
  ceiling on ALL month spending, not just budgeted categories; `validateBudgetAllocation` sums only
  monthly expense *category* budgets (subcategories excluded, to avoid double-counting).
- **Auto-save is paused while the allocation is invalid** (Σ category > overall): edits stay on
  screen, status says so, persistence resumes when valid.
- **Forecast blend**: early in the month the projection shrinks toward the previous-year monthly pace;
  `MIN_FORECAST_DAYS` gates "at risk". A front-loaded month still projecting high is not a bug.
- **Insights labels must state horizon AND scope.** `categoriesAtRisk` are **end-of-month
  projections**, not money spent (eyebrow + `~projected su budget`), and every metric in the card is
  computed only over **budgeted expense items**. If you add a row here, label its window and its
  perimeter or it will be misread.
- **GOTCHA**: never reconcile items against `categories` while `categories.length === 0` (they load
  async) — every category budget is dropped as an orphan and a later edit can persist the empty set.
  Load raw saved items first; gate the reconcile effect on `categories.length > 0`.

### Centri di Costo (`CostCentersTab`, `CostCenterDetail`, `lib/utils/{costCenterUtils,costCenterColors}.ts`)
- **One period axis, owned by the list, rendered in BOTH views** (distinct `layoutId`s). Generalise:
  *a view that displays a period must be able to change it, or must name the window on every figure
  that uses a different one.*
- **Three blocks legitimately keep their own window and each names it in its eyebrow**: budget
  (`budgetPeriod`), forecast (always YTD), chart (own 12-months/all toggle) — behind a
  `border-t border-border/40` chapter separator with an explicit line saying they do not follow the
  axis.
- **A lifecycle threshold must be fed an UNSCOPED date.** `computeCenterStats(…).lastActivityDate` is
  period-scoped, and `null` maps to `'dormant'` without ever reaching the 90-day threshold — so on
  «Mese» every quiet center claimed to be inactive. Use `resolveLastActivityDate(expenses)`.
  Generalise: *when a period selector narrows a stat, any downstream rule with its own absolute time
  horizon must be recomputed unscoped.*
- **A helper that maps "no data" and "stale data" to the same state cannot carry a label that asserts
  a duration** — branch on `lastActivityDate === null` for the wording.
- **The query returns TWO numbers per center**: `spending` (drives every figure) and `linkedCount`
  (the raw list length). `deleteCostCenter` unlinks *whatever is linked*, income included — **any
  count next to a destructive action must come from the same query the mutation will run.**
- **Delete unlinks, it does not delete**: `costCenterId`/`costCenterName` are nulled in 400-op
  batches and the expenses survive. That is good news the UI has to deliver — the armed button names
  the count in its label and `aria-label`, an `sr-only` live region announces arm **and** disarm, and
  the toast states the outcome.
- **The row carries rank and share separately**: bar width = `spend / largest center`, the `%` =
  `spend / period total`. Archived rows rank among themselves with their own `maxSpend`.
- **A period-over-period delta must compare windows of the SAME elapsed length** —
  `isWithinElapsedExtent` trims the predecessor to the same day-of-month/day-of-year, or on the 3rd
  of the month every center reads as collapsing. Two accepted edge behaviours: no chip when the
  matched predecessor is zero, and a complete short month compared against a truncated longer one.
  Note `filterExpensesByPeriod`'s `rolling12` branch applies only a LOWER bound.
- Shared typography lives in `components/cashflow/costCenterStyles.ts`
  (`EYEBROW_CLASS`, `CHAPTER_TITLE_CLASS`, `CHART_TICK_STYLE`) so the two views cannot drift.
- The three components have **no test of their own** — only the pure layer is covered.

### Expense CSV Import (`lib/utils/expenseImport.ts`, `lib/services/expenseImportService.ts`)
- **Category identity is `(name, type)`**, shared between plan and commit through the exported
  `categoryMatchKey` so the two can never disagree on the target document. Same-named different-type
  categories resolve side by side; an untyped row INHERITS the single namesake's type and is rejected
  as ambiguous when namesakes of two types exist; same-name-same-type duplicates attach to the
  OLDEST document, disclosed via `ImportPlan.notices` which the preview renders.
- **Resolve newly-created ids from the write call's own return value**, not a second
  `getAllCategories`: `commitImportPlan` takes the same `existingCategories` array the plan was built
  from, `createCategory` returns the new id, subcategory ids are generated locally.
- **`transfer` rows are rejected at parse time** — a transfer needs origin/destination account ids a
  historical CSV cannot supply, and a same-account no-op would corrupt the totals it is excluded from.
- **Undo deletes only `Expense` docs**, not the categories the import created (they are usually
  wanted). The wizard's `idle→preview→committing→done` phase is local state and does not survive
  unmount, so "Annulla import" is only reachable in the same view session.

### History and Snapshot Baselines
- Month queries must include the full last day. Annual deltas use December of the previous year as
  baseline. Monthly heatmaps stay month-over-month.
- Patrimonio `Anno Corrente` tables include the previous month as a **hidden** calculation baseline;
  when only one month is visible, both `Mese Prec. %` and `YTD %` reuse it instead of showing `-`.
- `MonthlySnapshot` fields are built in `POST /api/portfolio/snapshot` — the only creator besides the
  cron. **A snapshot is a frozen photo**: adding an asset never updates an existing one, so a Storico
  chart "missing" an asset you just added is a stale current-month snapshot, not a bug.
- **The snapshot cron runs DAILY — the name lies.** `/api/cron/monthly-snapshot` is `0 18 * * *` with
  no day-of-month guard: storage granularity is monthly (`{userId}-{year}-{month}`, overwritten)
  while the write frequency is daily.
- **Reuse `byAsset.totalValue` for historical per-instrument value — never recompute.** Each snapshot
  freezes `{assetId, ticker, name, quantity, price, totalValue}` with `totalValue` already through
  `calculateAssetValue()`. Aggregate in a tested pure layer keyed by `assetId`
  (`lib/utils/snapshotAssetBreakdown.ts`). **Gotcha**: `byAsset` is a newer field, so any month picker
  built on it must filter to non-empty `byAsset` — the resulting gaps are correct.
- **`byAsset.price` is RAW NATIVE CURRENCY.** For any USD/GBp/real-estate holding
  `totalValue ≠ quantity × price`. For a per-unit EUR figure use the effective unit value
  `u = totalValue / quantity`. Price/quantity attribution: both months present →
  `priceEffect = q_prev·(u_curr−u_prev)`, `quantityEffect = (q_curr−q_prev)·u_curr` (sum = Δ exactly);
  a full open/close puts the whole change on quantity.
- **TWR neutralises a cash flow only when the net-worth drop and the flow land in the SAME monthly
  snapshot.** A late-month event whose balance is updated the following month splits across two
  buckets and the legs do not cancel. Fix is data entry (record the balance in the month it belongs
  to), never re-bucketing cash flows or excluding cash. CLAUDE.md → Known Issues has the mirror case.
- **Two CAGR formulas, intentionally different.** Storico hero = `(endNW/startNW)^(12/months) − 1`
  (raw wealth growth); Rendimenti = `(endNW/(startNW+netCashFlow))^(1/years) − 1` (investment
  return). Storico > Rendimenti while the user is contributing.
- `prepareSavingsVsInvestmentData*()` decomposes growth into `netSavings` + `investmentGrowth`;
  `prepareMonthlyLaborMetricsData()` is the single source for *Lavoro & Investimenti*. Month counts
  use `netWorthGrowth`, and zero-change months are excluded from the +/− counters.

### Rendimenti — measurement base (`lib/utils/performanceBase.ts`, `drawdownSeries.ts`)
- **Any exclusion read from `byAsset` MUST be backfilled across the pre-`byAsset` months, or it
  becomes a phantom crash.** For snapshots with no breakdown, subtract a **constant `E₀`** = the
  excluded total of the earliest snapshot that HAS one: constant ⇒ it cancels in
  `(V_end − CF)/V_start`, so the join delta is `E₀ − E₀ = 0` and there is **zero artifact by
  construction**. A snapshot that has `byAsset` but does not list the asset is genuine evidence of
  absence → subtract 0, never backfill.
- **Documented approximation**: the backfill fixes the DENOMINATOR of historical months, not the
  numerator — those months still contain the excluded assets' own movements. Not reconstructible.
- **The base is user-configurable and TWO call sites must stay in sync.**
  `resolvePerformanceExclusions(assets, options)` is the single source, fed by
  `resolvePerformanceBaseOptions(settings)` (`performanceIncludesPensionFunds` /
  `performanceIncludesExcludedAssets`, both default `false`). Consumers: `getAllPerformanceData` and
  `app/dashboard/performance/page.tsx`'s `cachedSnapshots` (chart/heatmap/CUSTOM range). Diverge and
  a custom period silently disagrees with the pre-computed periods. `buildCacheKey` embeds a base
  signature — without it, flipping a setting keeps serving the old base for 6 hours.
- **Drawdown runs on a geometric TWR index, never on `netWorth − cumulativeCashFlow`.**
  `buildTwrIndex` chains the SAME monthly return the heatmap shows, so the Underwater chart is
  literally the compounding of the heatmap. `computeDrawdownSeries` keeps the FIRST point as the
  initial peak deliberately. Duration and Recovery are one shared `measureDrawdownSpan` differing
  only in the anchor.
- `describePerformanceBase` renders the base under the hero with a link to Settings — Rendimenti and
  Storico measure different capital on purpose, and the page says so.

### Rendimenti — the measurement window (`lib/services/performanceService.ts`)
- **The first snapshot of a period is ALWAYS the starting valuation, never a measured month — the
  window opens on the 1st of the month AFTER it.** A snapshot is an end-of-month photograph. This
  also fixes gaps for free: with `[Dec, Mar]` the window opens in January.
- **`resolveHasBaseline(snapshots, nominalPeriodStart)` is the ONE answer to "is that first month
  before the period?"** — data-driven, never inferred from the period type. It is a *presentation*
  question, so the service does not branch on it; the page does.
- **The page must NEVER re-derive the window from `new Date()`.** `metrics.nominalPeriodStart`
  travels in the payload and `selectSnapshotsForMetrics(snapshots, metrics)` re-selects exactly what
  the service measured.
- **`monthsElapsed(from, to)` vs `calculateMonthsDifference(end, start)`: distance vs coverage.**
  Jan→Mar is 2 elapsed, 3 covered; the inclusive one is literally `monthsElapsed + 1`. Annualization
  always uses the elapsed count (n snapshots ⇒ n−1 returns).
- **IRR signs are the INVESTOR's stream**: `−startNW`, `−contribution`, `+endNW`. Newton-Raphson
  first, **bisection fallback** over [−99,99%, +100000%]; `null` means "no rate explains this
  stream", not "the solver gave up".
- **No silent filters inside a single metric.** Volatility must not drop extreme monthly returns —
  the removed value is either an untracked movement (which stays visible in the heatmap, making the
  risk metric contradict the risk chart) or a real crash. Floors instead: volatility/Sharpe need ≥ 3
  monthly returns, the positive-month share ≥ 3 months, else `null` and the card says why.
- **`buildCashFlowMap`/`monthKey` (`lib/utils/cashFlowMap.ts`) is the only monthly indexing of cash
  flows** — TWR, volatility, heatmap, Evoluzione and `drawdownSeries` must read the SAME series.
  Flows in the same month are **summed**. One function formats the key for both sides of the lookup.
- **Below 6 months the hero states the PERIOD return, not an annualized one** (`resolveHeroReturn`):
  +4% over two months annualizes to "+26% a year", a forecast dressed as a measurement. Only the
  displayed figure changes — the verdict and the benchmark delta stay annualized.
- **ROI and CAGR correct for cash flows in two DIFFERENT ways and are not convertible** (ROI
  subtracts them from the gain, CAGR adds them to the denominator). Both tooltips state both formulas.
- **`computeReturnConsistency` counts months of investment RETURN**, cash-flow-isolated — its
  positive-month count intentionally differs from Storico's net-worth-growth counters.
- **`summarizePerformance` is band-free**: tone from the SIGN of TWR-minus-risk-free refined by the
  Sharpe band (≥2 strong, ≥1 solid, ≥0 fragile, else weak); Sharpe null → excess-return sign.
- **Benchmark**: the hero delta is async (TWR renders immediately, the chip pops in) and compares in
  the benchmark's NATIVE basis, so a EUR-toggled table can legitimately differ by FX.
  `benchmarkPeriodReturn.ts` (`buildIndexedSeries`/`annualizeTWR`/`computeBenchmarkAnnualizedReturn`)
  is the single source for indexing + annualization — never re-inline it. Each benchmark's final
  value comes from **its own** last available month, not the portfolio's, or a still-incomplete
  current month renders every cell as "–".
- **Portfolio vs benchmark month-count asymmetry**: the portfolio has N−1 return observations for N
  calendar months (first snapshot is baseline), the benchmark has N. Display "X/Y" with the actual
  denominator (`returns.length`).
- **Metric sections are collapsed by default** behind "Mostra tutte le metriche"; the hero carries
  the essentials. Header actions are a module-level `HeaderActions` rendered twice (desktop slot
  `hidden desktop:flex`, plus a stacked bar below the header) — `PageHeader`'s mobile slot is too
  cramped for three text buttons.

### Dividends and Coupons
- **A coupon's cashflow expense is created only by the daily cron on payment date, never at
  asset-save time.** `createDividendWithOptionalExpense` gates on `!isAutoGenerated`; cron Phase 2
  (`runExpenseCreation`) is the single source, idempotent via `expenseId`. Corollary:
  `deleteUpcomingCouponsForAsset`/`deleteUpcomingFinalPremiumForAsset` must batch-delete the linked
  expense, or re-saving orphans duplicate Cashflow entries.
- **The coupon cron is self-healing, not exact-day.** Phases 2 and 3 query
  `[today − COUPON_CATCHUP_LOOKBACK_DAYS (370), todayEnd]`. Phase 2 creates the expense when a
  dividend is due today OR is a past auto-generated coupon/finalPremium without an `expenseId`
  (equity/manual dividends are never back-dated). Phase 3 walks `getFollowingCouponDate` forward from
  the last paid coupon so a missed run cannot stop the chain. Window built with
  `getItalyDayBoundsUtc()`.
- **Adding a `DividendType` is a six-file fan-out**, and nothing enforces it: `types/dividend.ts`,
  `DividendTable`, `DividendDetailsDialog`, `DividendTrackingTab`, `DividendDialog`, plus the
  `byType` initializer in `dividendService.ts`. A missing one renders an unlabelled row rather than
  failing to compile.
- **A coupon's tax rate is the asset's own `taxRate`**, not a constant — 12,5% for government bonds,
  26% for corporate. `BondDetails` lives nested in the asset document
  (`couponRate`, `couponFrequency`, `issueDate`, `maturityDate`, `nominalValue?`), and the gross is
  `(couponRate/100/periodsPerYear) × nominalValue × quantity` with `nominalValue` defaulting to 1.
  Exactly ONE upcoming auto-generated coupon is stored per bond at a time — every asset save cleans
  up and recreates it.
- **YOC and Current Yield share one pure function** — `computeDividendYieldMetrics`
  (`lib/utils/yieldOnCost.ts`), used by Rendimenti (selected period) and `/api/dividends/stats` (TTM).
  Definition is **prospective, per-share**: `annualizedDPS = Σ(grossEur/div.quantity)` annualized;
  per-asset YOC = `DPS ÷ current averageCost`, Current Yield = `DPS ÷ current price`; portfolio
  weighted by current holdings. Only `quantity > 0` contributes, so sold assets leave the yield
  metrics (but stay in the dividend history). Never reintroduce an inline YOC in either route.
- **YOC, Current Yield and per-asset Total Return are scoped to the CURRENT holding.** `createAsset`
  re-links by ISIN, so a rebought instrument reuses its `assetId`; dividends paid before
  `Asset.holdingStartDate` are dropped, with `deriveHoldingStartDates` as a monthly-granularity
  fallback for legacy rebuys. **DPS growth is deliberately NOT scoped** — it is a security-level
  payout history.
- **Received metrics filter on `paymentDate`, not `exDate`.** `getAllDividends` includes upcoming
  ones. Timezone gotcha: use `setHours(23,59,59,999)` for a `paymentDate <=` upper bound, or a
  `…T00:00:00Z` dividend reads as future and vanishes.
- **Inflation-linked coupons (BTP Italia) are additive and resolved in the shared pure layer.**
  `resolveCoupon`/`buildCouponNote` (`lib/utils/couponUtils.ts`) are the SINGLE source for both the
  client scheduler and cron Phase 3. Gross per unit =
  `(couponRate/100/periodsPerYear + max(0, periodRate)/100) * nominalValue` — the announced FOI rate
  is **already per-period** and a deflation announcement is floored to 0. Unknown when the cron
  materializes the coupon, so it is stored **provisional**; the user announces it and the coupon is
  re-materialized via the existing cleanup+recreate POST.
- **Persist a bondDetails-only change with `updateAssetBondDetails`, never `updateAsset`** (which
  maps an absent `averageCost`/`taxRate` to `deleteField()`), and pass the COMPLETE object —
  `updateDoc` replaces the whole map. `announcedInflationRates` are matched by year+month.
- **`dividends/stats` fetches ALL trades unfiltered by the route's `assetId`/date params**, matching
  the existing `paidDividends`/`dividendGrowthData` precedent: a closed position's realized P&L must
  be visible whatever period is selected elsewhere.

### Asset Pricing, FX and Assets
- **"Does this asset have a market price?" is ONE rule in ONE place** (`lib/utils/assetPricing.ts`).
  `hasMarketPrice(type, subCategory)` is false for `realestate`, `cash`, `pensionFund` and
  `subCategory === 'Private Equity'`; `requiresManualPricing(asset)` adds the explicit
  `autoUpdatePrice === false` opt-out. Dependency-free so client and server both import it.
  **A new hand-valued `AssetType` goes into `MANUALLY_VALUED_TYPES` and nowhere else.**
  The `--chart-3` row tint means "no market quote", NOT "illiquid" — do not re-key it to `isLiquid`.
- The same predicate drives the `useTotal` heuristic: a manually valued asset has unit price 1, so
  deltas must be computed on `totalValue`.
- **`suggestIsLiquid` (`lib/utils/assetLiquidity.ts`) is the single liquidity-default predicate** —
  illiquid for `type === 'realestate'`, `type === 'pensionFund'`, `subCategory === 'Private Equity'`,
  keyed on the TYPE so a REIT **ETF** stays liquid. Three call sites in lock-step: the create-mode
  effect (guarded by `isLiquidTouched`), the edit-mode legacy fallback, and
  `calculateLiquidNetWorth`/`calculateIlliquidNetWorth`'s read-time fallback.
- `autoUpdatePrice` is defended at the boundary instead: `buildAssetFormDataFromValues` clamps it to
  `false` when `hasMarketPrice()` is false. **That clamp is the only defense — never remove it.**
- **GBp (pence) ≠ GBP**: normalize `price / 100` before any FX call, or values inflate 100×.
  **Never call Frankfurter from the browser** — all FX is server-side via `/api/prices/quote`.
  `priceUpdater.ts` always overwrites `currency` from the quote after normalization.
- `quantity = 0` marks a sold asset (valid in history logic). Cash balance lives in `quantity`, not
  price. Borsa Italiana bond prices are `% of par`; `resolveBondPrice` =
  `rawPrice * (nominalValue / 100)`, with the `nominalValue <= 1` passthrough intentional.
- **Patrimonio history tables** show only `includeInHistoryTables === true`; Anno Corrente is
  `quantity > 0`, Storico includes sold with a "Venduto" badge. Set `restrictToPassedAssets={true}`
  when pre-filtering, or the snapshot scan re-adds excluded assets as `isDeleted`.
- **Patrimonio Δ columns are price variations over time windows, not profit/loss.** `Δ Inizio`'s base
  is always `firstEntry.value` — do NOT reintroduce the `averageCost` base, which made it mirror G/P.
  All three deltas showing the same value is normal for a recently added asset. They are toggle-gated
  by "Andamento" (10 columns → 13): **any table whose column set changes at runtime must derive its
  group-header `colSpan` from the same flag.**
- **A cash *account picker* requires `type === 'cash' && assetClass === 'cash'`** — a money-market ETF
  can carry `assetClass: 'cash'` for allocation purposes. Applies to the settlement account, the
  ledger first buy, `ExpenseDialog`'s payment account, the pension contribution origin, and the
  server twin `assertCashSettlementAsset`. Do NOT extend the stricter filter to aggregate-liquidity
  computations, which intentionally count a cash-class ETF.
- **`getAssetDisplayTicker` (`lib/utils/assetDisplay.ts`) is the ONLY place that resolves the
  alias→ticker fallback** — never inline `displayTicker ?? ticker`. It stays type-agnostic (some call
  sites carry no `type`), so the `pensionFund` exclusion lives at the render sites
  (`asset.ticker && asset.type !== 'pensionFund'`): a converted fund can carry a stale ticker the
  pension form never exposes again. A frozen `MonthlySnapshot.byAsset` entry never carries the alias
  — resolve it from LIVE assets by `assetId`, with the raw ticker as fallback for deleted ones.

### Stamp Duty (imposta di bollo)
- `calculateStampDuty(assets, rate, checkingAccountSubCategory?)` (`assetService.ts`) drives the
  "Costo Annuale Portfolio" card together with the TER; the breakdown shows both only when both
  are > 0. Settings: `stampDutyEnabled`, `stampDutyRate`, `checkingAccountSubCategory`
  (`AssetAllocationSettings`); per-asset opt-out: `Asset.stampDutyExempt`.
- **Exclusions are data, never hardcoded categories**: only `quantity === 0` (sold) and
  `stampDutyExempt === true` are dropped. A pension fund or a property is exempted by the flag on
  the document, not by a special case in the function.
- Assets matching `checkingAccountSubCategory` are charged **only above €5.000** (strictly greater).
  The `'__none__'` sentinel means "no threshold applied" and is treated as `undefined` in the
  calculation — the usual Radix-Select sentinel rule.

### FIRE, What If and Goals
- FIRE annual expenses use the last completed year; `includePrimaryResidence` must flow through both
  the React Query key and the query function. Historical FIRE runway is a rolling 12-month expense
  window (first point needs 12 snapshots; missing months count as 0).
- **What If = perturbation + diff, no new projection math**: every v1 life event is an immediate
  year-0 perturbation of net worth / annual savings / annual expenses, then `fireService` is re-run on
  baseline vs adjusted and diffed. Do NOT add timed mid-projection cash events.
- **Job-loss hit = lost income × months/12.** `WhatIfScenario.lostAnnualIncome` (sum of the selected
  sources) drives `netWorthDelta`, exact for partial loss. **Keep the pure layer category-agnostic** —
  the selection and its sum live in the UI, the service receives a number. Falls back to total income
  when absent.
- **The per-source income breakdown must share the period AND the annualisation factor of
  `getAnnualCashflowData`**: `buildIncomeSourceBreakdown(expenses, factor)` is fed the same fetched
  expenses and the same factor. A second Firestore query would let the sources stop summing to the
  period's income.
- **Config-first collapse: decide ONCE after the form has settled.** A panel that must be "collapsed
  if already configured" cannot key on the transient `hasUnsavedChanges` (true for the first renders,
  before temp state is seeded from settings) — use a `useRef` seeded-flag set when
  `!isLoadingSettings && !hasUnsavedChanges`, and gate the temp-sync effect on `!isLoadingSettings`
  (not `if (settings)`), so it settles even when `getSettings` returns `null`.
- **Goal trajectory is annuity math in a tested pure layer** (`lib/utils/goalTrajectory.ts`), never a
  `useMemo` in the card. The verdict compares the *projected value at the deadline* against the
  target with a 1% tolerance, not contribution ≥ requiredMonthly (float flapping).
  `requiredMonthlyContribution` clamps months to ≥ 1. `expectedAnnualReturn` is derived from the
  goal's `recommendedAllocation` — indicative assumptions, label them as such, never as advice.
  `allocateContributionAcrossGoals` reuses the same `gap × priority` weighting as
  `deriveTargetAllocationFromGoals`.
- Every optional goal field MUST be added to the `cleanGoals` allowlist in `saveGoalData` — the
  function rebuilds each goal from an explicit field list and silently drops anything missing.
- **A goal's user-picked `color` is legitimate identity** (dot, bar, projection line); verdict and
  priority chips go through the tokens in `components/goals/goalVerdictMeta.tsx`.
- **Coast FIRE persistence gotcha**: nested pension rows must be serialized without `undefined`
  fields, or persistence silently fails on refresh.

### Asset Trade Ledger
**Engine** (`lib/utils/assetTransactionUtils.ts`, pure and Firebase-free)
- ALL trade money-math lives here (replay, PMC, realized P&L, XIRR, total return, invested capital);
  the service/route layer is a thin atomic writer. `LEDGER_ASSET_TYPES` = stock/etf/bond/crypto/
  commodity. A new `AssetTransactionType` must update the replay switch, the zod schema AND
  `TransactionDialog`.
- **Native PMC excludes fees; fees and FX live only on the EUR side.** `averageCost` is the weighted
  average of native `pricePerUnit` — exactly today's semantics, so every existing consumer keeps
  working. A sell never moves the native PMC; on close, quantity and `costBasisEur` clamp to 0
  (`EPSILON = 1e-9`) while the last native PMC is retained.
- **The migration baseline (`isBaseline` BUY) NEVER stamps `holdingStartDate`**, and
  `replayTransactions` returning `holdingStartDate: undefined` means **leave the asset doc
  untouched** — never `deleteField()`. Stamping it would zero YOC for the whole existing portfolio.
- **Replay ordering is deterministic and internal**: date → same-day rank (baseline < buy < sell <
  adjustment) → `createdAt` → `id`. Every function sorts internally. Invalid histories throw
  `LedgerValidationError` with an Italian `userMessage` the route forwards verbatim in a 422; this
  same replay IS the pre-write validation, so an edit that makes a *later* sell over-sell is caught.
- **The per-asset XIRR is date-exact and SEPARATE from `performanceService.calculateIRR`**
  (monthly-bucketed) — keep both. It returns a FRACTION; `null` renders as "–", never 0. An
  `adjustment` produces no XIRR flow and no cash delta, so it slightly distorts XIRR (accepted v1).
- **`replayTransactions` replays ONE asset; cross-asset aggregation is the caller's job.**
  `computeInvestedCapital` sums all trades regardless of asset; `aggregateRealizedByYear` must group
  by `assetId` FIRST, because realized P&L is PMC-dependent per position.

**Service, API, migration** (`lib/server/assetTransactionUseCase.ts`)
- **Writes are Admin-API-only**: a trade must atomically rewrite the asset's derived fields from a
  full replay, and only the Admin SDK can `tx.get(query)` inside a transaction. Reads stay client-SDK.
  Auth = `assertCanAccessAccount`. Errors mapped by `app/api/asset-transactions/errorResponse.ts`.
- All reads before any writes; cash deltas aggregated per docId (a self-edit nets to 0 and is
  skipped). `resolveTradePriceEur` (network) resolves BEFORE the transaction. Derived fields are
  written DIRECTLY in-tx, not via `updateAsset`. Cleared optional trade fields use `FieldValue.delete()`.
- **Migration is idempotent**: meta doc present → done; else one baseline BUY per eligible asset with
  deterministic id `baseline-${assetId}`, batched ≤400, **meta doc written LAST**, zero writes to the
  asset docs. Triggered once per ownerId by `useAssetLedgerMeta`. Mutation hooks invalidate a TRIPLE:
  `assetTransactions.all` + `assets.all` + `dashboard.overview`.
- **`updateAssetMetadata` closes the `deleteField()` trap**: ledger-type edits must go through it,
  never `updateAsset`, which would wipe the PMC.
- `resolveTradePriceEur` (`lib/server/tradeFxService.ts`): EUR passthrough → Frankfurter historical →
  24h FX cache → `TradeFxUnavailableError`. Baseline uses the asset's own EUR/native ratio.
- **Testing the atomic write**: the in-memory Admin fake is built inside the `vi.mock` factory, which
  is hoisted above top-level consts — reference `vi.hoisted(...)` state, never a plain const.

**UI** (`components/assets/{TransactionDialog,AssetMovementsDialog}.tsx`)
- `resolveBondPrice` is exported from `AssetDialog.tsx` and REUSED — a trade's `pricePerUnit` must
  mean exactly what `averageCost` means. No import cycle: `AssetDialog` opens the trade dialogs
  through an `onRegisterTrade?(asset)` callback.
- **The realized-P&L preview runs the SAME pure engine as the server**: replay
  `[...existing, draftSell]` minus replay(existing). `priceEur` is server-resolved, so the client
  ESTIMATES it — hence "stimato"; the toast fires only after the server responds.
- Create for a ledger type writes the asset at quantity 0 then posts the first BUY (non-atomic by
  design: on buy failure the asset survives at qty 0, recoverable). The opening BUY carries the
  purchase price while `currentPrice` is fetched live, so a fresh position shows real G/P.
- **Vitals `Rendimento totale` is ledger-only and excludes dividends, permanently** — a deliberate v1
  boundary, stated in the Popover.
- **Fase B edit limit inherited by the UI**: clearing an already-set settlement account or fee on
  EDIT is not supported (JSON cannot carry explicit `undefined`); remove the whole operation instead.

**Rendimenti / Dividendi surfaces**
- **"Capitale investito" uses the page's OWN period bounds** (`metrics.startDate`/`endDate`), and is
  deliberately a DIFFERENT number from "Contributi Netti" — the tooltip says so. "Plusvalenze
  Realizzate" is the opposite: NOT period-scoped, because a realized sale belongs to its fiscal year.
- **`totalReturnAssets` has two paths.** LEDGER (asset has ≥1 trade doc): `replayTransactions` +
  `computeAssetTotalReturn`, the only path that can represent a closed or partially sold position;
  inclusion test is `state.investedEur > 0`. STATIC fallback: price-vs-PMC, gated on
  `averageCost > 0 && quantity > 0 && netDividends > 0`.
- **`capitalGainAbsolute` means something different on each path, by design**: static =
  `currentValue − costBasis` (unrealized only), ledger = `realizedPnlEur + unrealizedPnlEur`. Both
  preserve `totalReturnPercentage = capitalGainPercentage + dividendReturnPercentage`, which the UI
  relies on — change one formula and re-derive the other.
- **`capitalGainPercentage`'s denominator is a product decision**: static = cost of the currently held
  quantity, ledger = `investedEur` (all capital ever committed) for BOTH open and closed states, so
  the metric's meaning does not flip the instant a position closes. The rigorous time-weighted answer
  for a partial-sell history is the per-asset XIRR, not this card.
- **`dividendReturnPercentage` is UNIFIED across both paths** (`computeDividendReturnPercentage`):
  per-payment `net ÷ cost-basis-at-payment-time` using `Dividend.costPerShare`, never a flat
  `netDividends / investedEur` ratio — the flat version loses the anti-dilution property.
  `costPerShare` is stamped in NATIVE currency despite its type comment, so the helper's
  `fallbackAverageCost` must also be native (`state.averageCost`).
- `realizedPnlEur`/`isClosed` on `TotalReturnAsset` are additive-only (undefined on the static path).
- **When a second computation path lands next to an existing card, audit the STATIC COPY**, not just
  the numbers — a description saying "plusvalenza non realizzata" became actively wrong for closed
  positions while compiling and rendering fine.
- Small server-side mirrors are duplicated per file rather than imported when the real implementation
  lives in a client-only module (`getAssetTransactionsAdmin`'s doc conversion,
  `resolveLedgerAssetValueEur`) — this repo's established pattern, chosen over module cycles.

### Allocation — `allocationRole` and where the filter must live
- **`Asset.allocationRole` is ONE field with THREE values**, answering *"is this invested wealth?"* ×
  *"can I trade it?"*:
  - `tradable` (default) — in the denominator, in the plans.
  - `frozen` — IS invested wealth, cannot be moved. **In the denominator, never in the plans.** Drop
    a bond-heavy pension fund out of the totals and the page reports the free portfolio's mix as if
    it were your real exposure; counting it also makes the plans *compensate*, routing money to the
    sleeves you CAN move. That compensation is the entire value of the role.
  - `excluded` — not an investment (the home you live in). **Out of the page entirely, denominator
    included.** A house against a 5% realestate target pegs the class permanently off-target and
    emits a `VENDI` nobody can execute.
- **Legacy read-fallback: `excludeFromAllocation: true` → `excluded`, never `frozen`**
  (`resolveAllocationRole`). Never write `excludeFromAllocation` again.
- **No role is ever inferred at read time.** The `realestate → excluded` / `Private Equity → frozen` /
  `pensionFund → frozen` suggestion is a FORM default for NEW assets in `AssetDialog`, one ternary
  branch in the existing touched-flag effect — do not give it its own effect, and do not "improve" it
  into a read fallback.
- **`allocationRole` is orthogonal to its two neighbours**, and the dialog copy for all three names
  the calculation it drives *and* what it leaves alone: `isLiquid` → only the liquid/illiquid split;
  `isPrimaryResidence` → only the FIRE net worth; `allocationRole` → only Allocazione. Everywhere
  else all three roles count identically toward net worth.
- **THE RULE: partition upstream of `compareAllocations`, never downstream.** Filtering the *output*
  is wrong twice: every other class's `targetValue = target% × totalValue` would be measured against
  the wrong base, and it breaks the Σ(current − target) = 0 invariant the balance score halves.
  `compareAllocations` now partitions internally too, so it is correct either way — which silently
  aligned the PDF's allocation section with the page.
- **Do NOT push the filter into `calculateCurrentAllocation`**: it also serves
  `/api/portfolio/snapshot`, and the monthly snapshot must keep freezing the WHOLE portfolio.
  `calculateCurrentAllocation` stays MARKET-only (Storico, snapshots, Monte Carlo).
- **Consequence kept on screen**: the Allocazione headline excludes `excluded`, so it is SMALLER than
  the Panoramica net worth, and the gap is stated. `frozen` and `excluded` get **separate** captions
  in `AllocationHero` — one is inside the number, the other outside; merging them is the easy, wrong
  thing.
- **The orphaned target is the trap this feature sets, hardest at sub-category level.** Flag the house
  and `bySubCategory['realestate:Prima casa'].currentValue` drops to 0 while its 70% target survives,
  so the contribution split pours new money into a bucket that can only hold the excluded house.
  Two obligations for any target-driven surface: `findOrphanedTargets(...)` (a target is orphaned when
  it has a positive target, ~zero allocatable value AND excluded value behind it — the class rule is
  *conditional*: a class is not orphaned if any sub-target is still reachable) and
  `stripOrphanedSubTargets`, which must REMOVE them from the map handed to `ActionPlanner` **and**
  `AllocationBreakdown`, not merely warn. Survivors renormalize for free.
- **An empty target is not an orphaned target.** An unfunded sub-category MUST keep receiving money —
  that is what Versa is for. The distinguishing condition is *excluded value behind it*, never
  "current value is zero".

### Allocation — the two plans and the leverage engine
- **"Versa" and "Preleva" are ONE tree with the sign flipped**: both return `PlanNode[]` (class →
  sub-category → instrument, `amount` always positive) and render through `PlanRow.tsx`.
- `splitFromSurplus` mirrors `splitTowardTarget` and drains what sits ABOVE target first. Two
  constraints the contribution side has no analogue for: `take ≤ capacity` per item (clamp +
  iterative overflow redistribution) and `Σtake ≤ Σcapacity`. The invariant every caller relies on:
  **Σamount === min(requested, Σcapacity)** at every level.
- **`currentValue` and `capacity` are DIFFERENT inputs to `splitFromSurplus`**, and that split is the
  trick: the surplus is measured on `currentValue` (a frozen fund really does push its class above
  target), the take is capped at the TRADABLE slice. `capacity` defaults to `currentValue`.
- `buildRebalancePlan` caps the SELL side at `tradableByClass` and never the BUY side. A capped move
  keeps `requestedAmount` alongside the executable `amount` and sets `limitedByFrozen`; a 100%-frozen
  class renders "Non negoziabile", not "−0 €".
- **Capacity comes from the HOLDINGS**, so an empty holdings list means zero sellable — deliberate:
  the honest answer to "what do I sell?" when we do not know what is held is "nothing".
- **The "neutral targets" trick**: below the class level the right rule is pro-rata by current value;
  passing a synthetic `targetPercentage = value / bucketTotal × 100` makes BOTH split functions
  degenerate to exactly that, with no branch. Do not replace it with a second algorithm.
- **THE ASYMMETRY is the design**: *you can be told to buy something you do not own; you can never be
  told to sell it.* Versa's sub-category buckets come from the configured TARGETS (an empty targeted
  bucket must stay visible) and its instrument level honours specific-asset targets; Preleva's come
  from the HOLDINGS (`bySubCategory` lists only targeted subs, so splitting across those alone would
  strand every euro in an untargeted one) and its instrument level is strictly what is held.
- **Neither plan may ever name a `frozen` holding.** Versa additionally drops a sub-category whose
  value is *entirely* frozen; its weight leaves the split and the class's allotment renormalizes onto
  what you CAN buy. An **unfunded** target is a different thing and must stay.
- **A composite asset yields one holding per component** (`buildHoldings`, weighted by
  `composition[].percentage`), each carrying the parent's `tradable` flag — that is what lets a frozen
  60/40 fund contribute to both sleeves. `valueOf` is injected so `allocationUtils.ts` stays testable
  without mocking Firebase.
- **The instrument row shows `avrai X €` / `restano X €`, never a percentage** — an instrument's share
  of its own sub-category reads "100%" whenever it is the only one there.
- **The balance score is band-INDEPENDENT — do not "fix" it to read the action.**
  `computeBalanceScore` reads the raw signed `difference`. Σ(current−target)=0 holds only for
  unlevered targets; with Σtarget > 100 the drifts do not cancel, so the score decomposes:
  `leverageGapPp = Σd`, `misallocationPct = (Σ|d| − |Σd|)/2`, `score = 100 − misallocation − |gap|`.
  Only the verdict, the plan and the COMPRA/VENDI/OK chips react to the rebalance band
  (`applyRebalanceBand`); pairing a stable score with a band-reactive verdict is the point.
  Still open: a class held WITHOUT a target entry never enters `byAssetClass`, so its weight is
  invisible to the score (CLAUDE.md → Known Issues).
- **Leverage** (`lib/utils/{assetExposureUtils,leverageAwareAllocationUtils}.ts`):
  `expandAssetExposure` must NOT special-case `pensionFund` — a fund with `composition` looks through
  leg by leg like any composite, and one without falls back correctly because `TYPE_TO_CLASS` stamps
  `assetClass` at creation. The class residual is solved against the post-trade **MARKET** base:
  `classCoeff[c][i] = exposurePerEuro[c][i]` (no `instrumentLeverage` term) and
  `classConst[c] = currentNotional[c] − tf[c]·marketAfterTrade`. Scaling either by the *notional*
  total re-multiplies by the current leverage and is wrong whenever current ≠ target leverage.
  The *leverage* term keeps `instrumentLeverage` as its coefficient.
- **`AllocationResult.totalValue` is the NOTIONAL total** (== market at leverage 1, so every existing
  reader is unchanged). `marketValue`/`notionalValue`/`leverageRatio`/`hasLeveragedExposure` are
  REQUIRED on the type on purpose: `tsc` then forces the band re-classifier to copy all four through.
- **The whole leverage UI is a `hasLeveragedExposure` fork, not a rewrite** — at leverage 1 the render
  is byte-identical. Extend the leverage branch, do not refactor the shared path. The planner is wired
  per-PANEL (each owns its amount input); the page computes `LeveragePlanInputs` once and each panel
  renders a flat `InstrumentTrade[]` through `InstrumentTradeList`, deliberately NOT the `PlanRow` tree.
- `CompositionBar` separates width from label via `CompositionBarSegment.displayPct` (width = notional
  share summing to 100; label = the leveraged %). Optional, defaults to `pct`.
- **`ActionPlanner` owns the Card; `RebalancePanel`/`ContributionPanel` are bodyless.** Switching tabs
  unmounts the inactive panel, so the Versa amount resets (acceptable for a planner).
- `ASSET_CLASS_CHART_INDEX` mirrors History's `acColors` (`equity:0…commodity:5`) so a class is the
  same hue on Allocazione and Storico. If you re-key one, re-key both.
- **Widening `AssetClass` only breaks the Records actually typed `Record<AssetClass, …>`** — grep
  first. The one that costs time is the zod `z.enum([...])` in `AssetDialog.tsx`, which surfaces as
  indirect assignability errors on `reset()`/`setValue()` call sites that never name the enum.
  Several Records only LOOK exhaustive (`Record<string, string>`): patch them anyway.

### Fondo Pensione
**Data model** (`types/pension.ts`, `lib/utils/pensionDeduction.ts`)
- **`pensionFund` is an `AssetType`, never an `AssetClass`, and never a ledger type.** Its value is
  statement-driven — held in `quantity` **at price 1**, like cash — and incremented by
  `pensionContributions`. `TYPE_TO_CLASS['pensionFund'] = 'equity'` is a fallback for a fund whose
  `composition` is still empty, not a claim about the asset; any `assetClass`-keyed default effect
  must exclude the type explicitly.
- **The `AssetType` union is enumerated in TWO places in `AssetDialog.tsx`** — `TYPE_TO_CLASS`
  (one clear error) and `assetSchema`'s `z.enum` (three indirect ones). Update both in one edit.
- **Two tax mechanisms, only one reads history.** ORDINARY deduction is stateless per year
  (`min(contributions, ceiling)`, ceilings via `getPensionDeductionCeiling` — a future law change is
  one branch there, never a literal at a call site). EXTRA-DEDUCIBILITÀ is a multi-year fold over
  `enrollmentYear..targetYear-1` maintaining a bank (accrual first 5 years → drawdown years 6..25,
  annual cap = half the ceiling → expiry).
- **CORRECTNESS TRAP — `isFirstEmploymentPost2007` ON without a full contribution history inflates
  the plafond.** The fold treats missing years as 0 contributed, i.e. maximum unused ceiling. OFF is
  the correct setting whenever the past is not tracked. The real fix would be an explicit "starting
  plafond" input, never back-filled years.
- **`taxOf` is injected, so the engine imports nothing** — no Firebase, and specifically not
  `calculateProgressiveTax` from `fireService.ts`. Keep it that way, or every future consumer's test
  has to mock Firebase.
- **The IRPEF ceiling is per TAXPAYER, not per account.** `AssetAllocationSettings.familyMembers:
  FamilyMember[]` + `Asset.pensionFundDetails.familyMemberId`; `computePensionTaxRecap` runs once per
  member with `contributions` pre-filtered to that member's fund ids
  (`lib/utils/pensionFamilyMembers.ts::groupFundsByFamilyMember`, with an `unassigned` bucket). The
  pure tax engines needed ZERO changes — the fix is entirely in what the caller passes.
  **The `enrollmentYear` fallback must be computed from the MEMBER-FILTERED `deductibleByYear`**, or
  one person's contribution-year history leaks into another's plafond fold.

**Contributions** (`lib/services/pensionContributionService.ts`, `lib/utils/pensionContributions.ts`)
- **Client SDK, not an Admin route** — there is no multi-doc replay to serialise; the only two-balance
  step (a voluntary contribution) is already atomic inside `reconcileTransferCreate`. That is the
  discriminator against the trade ledger.
- **Two write-side guards, both before anything is written**: the origin must be a real cash account
  (`updateCashAssetBalance` writes `quantity` directly, so a wrong origin subtracts euros from an
  ETF's share count) and `assertFundValueLivesInQuantity` must confirm the destination is a
  `pensionFund` priced at 1 — inverting value and price still renders the right total until the first
  contribution *multiplies* it (200 € onto `quantity 1 × price 29.800` displayed 5.989.800 €).
  **Write-side only**: `deletePensionContribution` has no guard, so a user can undo out of a broken
  state.
- **The orphan transfer is the dangerous failure.** A failed reconcile deletes the just-created
  `Expense` (otherwise deleting it by hand later moves the balances a second time, in the wrong
  direction); symmetrically a failed contribution write reverses the value effect. Compensations go
  through the `compensate` helper: best-effort, logged, never rethrown.
- **`CONTRIBUTION_SOURCES` is listed explicitly, never derived from `DEDUCTIBLE_PENSION_NATURES`** —
  a future non-deductible nature would be silently rejected at runtime while type-checking fine.
- **`taxYear` is validated as ±1 year from `date`** (the year-end straddle), and both roll-ups group
  by `taxYear`, NEVER by `date.getFullYear()` — `taxYear` decides which ceiling is consumed.
- **Invariant: contributions never touch spending or savings, by construction.** TFR/employer create
  no `Expense` at all; voluntary creates a `type: 'transfer'` one, already net-zero everywhere. If a
  future nature needs a non-transfer `Expense`, every cashflow consumer must be re-audited.
- `sourceCashAssetId` is optional even for `voluntary` (payroll withholding) — the service branches
  on `source !== 'voluntary' || !sourceCashAssetId` for the standalone-credit path.
- **The periodic statement (NAV overwrite) is NOT a contribution** — it stays a plain `updateAsset`.
  Editing a contribution is out of scope: delete + re-enter, which is lossless.
- **Workflow order matters and is easy to get backwards: register the month's contributions FIRST,
  then overwrite "Valore attuale" with the statement.** The statement already includes those
  contributions; the opposite order double-counts them. Stated in the UI copy of
  `PensionContributionDialog` and `PensionOverview`.
- **Converting a pre-existing fund is a type EDIT, never delete + recreate** — `MonthlySnapshot.byAsset`
  is keyed by `assetId`. The submit branch reads the **stored** type
  (`ledgerEditFlow = !!asset && isLedgerAssetType(asset.type)`) so the converting edit goes through
  `updateAssetMetadata` and the value survives. The conversion also deletes the asset's ledger trades
  (`deleteAllAssetTransactionsForAsset`) so the orphan baseline stops being summed into "Capitale
  investito" — fixing the data instead of filtering every consumer. **Latent risk worth remembering**:
  `quantity` is replay-derived for ledger types, so anything that ever replayed such an asset again
  after conversion would rewrite the value back to the baseline and wipe every contribution.

**Return** (`lib/utils/pensionReturn.ts`)
- **Three causes of growth, three numbers — never one blended percentage.** The employer share is
  *compensation*: folding it into the TWR would print +15/20% a year, comparable to nothing. It
  leaves the TWR and returns in `personalReturn = (marketGain + employer) / (startValue + voluntary +
  tfr)`. TFR is deferred salary → denominator, never numerator. The IRPEF saving stays in its own
  per-taxpayer/per-tax-year card.
- **The window starts where the data is trustworthy, not where the snapshots start.**
  `resolvePensionReturnStart` prefers `pensionReturnStartMonth`, else the first recorded
  contribution, else `null` (no card). Fewer than two value points → an explicit "serve un secondo
  mese" note.
- **A contribution is attributed to the month its VALUE MOVED (`createdAt`), not its accounting
  date** — `valueEffectMonth`. A contribution dated 30 June but recorded 26 July enters July's
  snapshot. `resolvePensionReturnStart` deliberately still uses `date`: "since when is this tracked"
  and "when did the value move" are different questions.
- **The series ends at the fund's LIVE value, not the current month's snapshot**
  (`overlayLivePensionValue`): the asset rises immediately while the snapshot waits for the cron, so
  between a contribution and that evening the TWR dropped by exactly the amount paid in. Do NOT add a
  page caveat instead — a permanent note for a transient state costs every visit and still leaves a
  wrong number on screen. Storico and Rendimenti deliberately stay snapshot-based.
- **`isPensionReturnMeasurable(result)` = `!isCoverageSuspicious && !hasNoMovement` is ONE predicate
  with two consumers** (the summary card and the decomposition guard). While they were two
  expressions they diverged, and the collapsible printed «Guadagno di mercato» under a card that had
  just explained it was not one. *When two places must agree on whether data is trustworthy, the
  agreement is a named function.* An annualized return above 20% means missing contributions, not a
  brilliant fund; when neither the value moved nor a contribution was recorded, the decomposition is
  omitted entirely rather than rendered as five rows of zeros.

**Page** (`app/dashboard/pension/page.tsx`, `components/pension/*`)
- Three chapters separated by `border-t border-border/40`: *Il fondo oggi* (hero
  `desktop:grid-cols-[2fr_1fr]` + return summary, decomposition behind a `Collapsible`),
  *Anno fiscale {Y}*, *Storico versamenti {Y}*.
- **The year axis governs chapters 2-3 only, never the fund value or the return** — the value is a
  running total and the return has its own trust-derived window. `resolveActivePensionYear` (pure)
  reconciles the selection with the derived axis so no effect has to sync them.
- **The dominant number is the IRPEF saving**, the one answer only this page produces — not "Valore
  attuale", which is already dominant on two other pages.
- **A conditional child in a `[2fr_1fr]` grid leaves a dead column** — the companion is unconditional
  (`PensionReturnPendingCard`), so the chapter keeps its structural promise and the empty slot
  explains itself.
- Every chapter degrades to `PensionErrorNotice` instead of zeros; the copy agrees in number
  (`fundNoun()`); dates are `font-mono tabular-nums`; the primary action lives in `PageHeader`'s
  `actions` slot.
- **Zod messages must be attached to the TYPE check, not only the constraint**:
  `valueAsNumber: true` turns an empty input into `NaN`, which fails `z.number()` itself, so a
  message given only to `.positive()` leaves zod's English default in an all-Italian form. Use
  `z.number({ error: '…' }).positive('…')`.

**Integrations**
- Allocazione needed **zero** new exclusion logic: `frozen` is the default role and the engine is
  role-based, not type-based. `PensionAllocationCards`' "Portafoglio + previdenza" card needs the
  FULL unfiltered asset list — a fund the user set to `excluded` is invisible to the page's own set.
- **Storico reverses the split `calculateCurrentAllocation` already applied**, using the fund's
  CURRENT `composition` (composition-at-snapshot-time is not persisted) — a documented approximation.
  `prepareAssetClassHistoryData`'s `pensionAssets` param is optional and additive.
- **`performanceBase.ts` reads `byAsset`, never `byAssetClass`** — it needs the value removed from
  `totalNetWorth`, and `byAsset` already carries it as one clean per-asset total.
- **The exclusion is applied in TWO places** because the Rendimenti page has two independent
  snapshot-fetch paths (`getAllPerformanceData` and the page's `cachedSnapshots`). Missing it in one
  makes a Custom range disagree with the pre-computed periods one row above.
- **FIRE's lock-in toggle subtracts from BOTH `currentNetWorth` and `illiquidNetWorth`**, both derived
  from the same `pensionLockedValue`, or the breakdown rows stop adding up.
- `PensionFundDetails.enrollmentDate`/`firstEmploymentDate`/`isFirstEmploymentPost2007` were removed
  from the FORM but kept on the type (other documents may still carry them; nothing reads them).

### Assistant
**Context service** (`lib/services/assistantMonthContextService.ts`)
- Runs server-side — `adminDb` directly, never the client SDK. All 5 period builders return
  `AssistantMonthContextBundle`; `selector.month`: `>0` monthly, `0` year, `-1` YTD, `-2` history;
  quarterly is `{ year, month: quarter * 3, quarter }`.
- **Every mode must map to its own builder in `stream/route.ts`** — a mode with a prompt builder but
  no branch silently falls through to the monthly builder and gets answered on one month of data.
  `GET /api/ai/assistant/context` still has no quarter branch (no UI pins a quarter).
- **One aggregator, not two**: every cashflow figure comes from a single
  `buildCashflowBreakdown(expenses, …)` call per builder (`lib/utils/expenseBreakdown.ts`), so
  `Σ expensesByCategory[].total === cashflow.totalExpenses` holds structurally. Do not reintroduce a
  second pass — an LLM that sums the rows and lands elsewhere narrates the gap rather than flagging it.
- `topIndividualLimit` scales with the period (5 / 8 / 10 / 15). `transactionCount` **excludes
  transfers**; `expenseTransactionCount` counts only spending. Rows with no `type` land in an explicit
  `unclassified` bucket. When >30% of spending has no subcategory, the builders push a `dataQuality`
  note.
- `fetchSettings` returns only the fields a builder needs — do not expand it to the full settings.
  Adding a required bundle field means updating ALL 5 builders and any test fixture.

**Prompt builders** (`lib/server/assistant/prompts.ts`)
- Every builder returns `{ system, userContent }`. `system` is byte-identical across users and
  requests of that mode (`ASSISTANT_SYSTEM_CORE` + the mode's static format contract);
  **never interpolate per-request data into `system`.** Mode-specific conditionals are written
  generically; the concrete per-request note lives in `userContent`.
- **`cache_control` is deliberately NOT used** in the assistant/email call sites: cache writes cost
  1.25× and only pay off within the 5-minute TTL, and this app's traffic is sporadic single-user
  requests. The split already isolates what would need the marker if that changes.
  `memoryExtraction.ts` runs on `claude-haiku-4-5` and keeps its own.
- Always include `--- ALLOCAZIONE CORRENTE ---` before the movers section, or Claude hallucinates
  "unclassified" gaps. `formatBundleForPrompt` destructures named fields only — a new bundle field is
  silently missing unless explicitly added.
- **`--- SPESE PER CATEGORIA E SOTTOCATEGORIA ---` is exhaustive by contract**, with
  `--- SPESE PER TIPO ---` and `--- ENTRATE PER CATEGORIA ---` as companions (dividends excluded so
  the rows reconcile with "Entrate"). `--- CATEGORIE DI SPESA CONFIGURATE ---` is NOT redundant: it
  lists what *exists*, including unused categories, so the assistant can answer "in che categoria
  segno questa spesa?".
- `--- ALLOCAZIONE TARGET vs CORRENTE ---` renders when `bundle.targetAllocation` is non-null AND
  `currentSnapshot.byAssetClass` exists; sub-categories show their **portfolio-level** target
  (`subTargetPct / 100 * assetClassTarget`) so every comparison is on one scale.
  `buildTargetAllocation` normalizes `subTargets`, which can be a legacy `number` (% of asset class)
  or a `SubCategoryTarget` object — both become a plain number so prompt builders need no branch.
- **`share()` vs `pct()`**: `pct()` always prepends `+` because it renders a *change*; reusing it for
  a proportion prints "+18,2% delle uscite", which reads as growth.
- **A silent cap in a context builder becomes a hallucinated "N/D".** An LLM cannot distinguish
  *absent from the data I was sent* from *absent from the world*, and the data-integrity rules then
  correctly forbid speculation — so a truncated block converts into a confident refusal that looks
  like a model limitation. **Rule: a cap either does not exist, or is stated in the text the model
  reads** (`MAX_SUBCATEGORY_ROWS_IN_PROMPT = 150` announces itself). Corollary: once a block is
  exhaustive, the system prompt must say so, and must tell the model that a missing item means *no
  spending recorded*, not *no data*.
- `monthlyEmailService`'s `buildEmailAiPrompt` reuses `ASSISTANT_SYSTEM_CORE` plus its own
  `EMAIL_PERIODIC_FORMAT_CONTRACT` — extend the shared core, do not duplicate the guardrail text.
- **Check the installed `@anthropic-ai/sdk` version before adding `thinking: {type:'adaptive'}` or
  `output_config.effort`** — older type defs reject both with a `tsc` overload error.

**Streaming, threads, memory**
- `deleteAssistantThread` must delete the `messages` subcollection in ≤400-doc batches first (the
  Admin SDK does not cascade). Load `getAssistantThreadDetail` BEFORE `appendAssistantMessage`.
  `buildMessagesArray()` filters to `user`/`assistant` (Anthropic rejects `system`); caps 20 chat / 6
  structured.
- Never clear `streamingMessages` in a `useEffect([selectedThreadId])` — the SSE `meta` event sets the
  id mid-stream and wipes the buffer. Clear only in the user's click handler.
- Post-stream invalidation must use a local `resolvedThreadId` updated synchronously from `meta`,
  never the closure value captured at submit time.
- `handleStreamSubmit` takes optional `promptOverride`/`modeOverride` (state updates are async).
  A button `onClick` passes a `MouseEvent` first — wrap as `onClick={() => onSubmit()}`.
- `scrollIntoView` during streaming must be `'instant'`. Use `renderedMessages` as the base when
  building `streamingMessages`.
- **`max_tokens` budgets thinking AND text together** (chat 12000, chat+web 16000, structured 18000).
  Re-check them whenever the data block grows or a word ceiling rises. Headroom is cheap but not free:
  a bigger budget also lets adaptive thinking reason longer, which is billed.
- **Read `stop_reason` from the terminal `message_delta`** and append `TRUNCATION_NOTICE` — same
  principle as the prompt valve: a limit either does not exist or announces itself.
- Memory: only `status === 'active'` items are injected via `formatMemoryForPrompt()`; the fetch is
  `.catch(() => null)` (never blocks the stream); `extractAndSaveMemory` is fire-and-forget after
  `appendAssistantMessage`; the Anthropic client is lazily imported (a module-level `new Anthropic()`
  breaks test environments). `hasDummySnapshots` is overlaid by the route, never persisted.
  Goal-completion suggestions must come from the bundle, not from assistant prose.
- **One period axis, `Libera` = `chat`** (`AssistantPeriodSelector`); the optional period for a free
  question is the co-located `chatContextType` selector, not a separate strip. `liveMode` drives the
  scheda preview when no thread is active; an SSE `context` event always wins over the fetched bundle.
  Default month = last COMPLETED month, or the composer renders disabled on a month with no snapshot.
- The SSE `status` event is emitted server-side and must be handled client-side to drive the
  "Sto cercando sul web…" badge; reset it on submit and in `finally`.
- Web search: toggle ON → always active in chat; OFF → keyword detection (`webSearchPolicy.ts`).
  Structured modes use the toggle only.
- Context panel: the bundle lives in React state, so on reload repopulate via
  `GET /api/ai/assistant/context` gated on thread loaded + pinned period +
  `streamingMessages.length === 0` + `contextBundle === null`. Never persist the bundle.
- `lastSentPromptRef` is updated only after `response.ok`, not on click.
- `MARKDOWN_COMPONENTS` must be module-level or ReactMarkdown re-mounts on every chunk.
  `remark-gfm` is required for tables; override `table/th/td` explicitly (`th` needs `text-left`).
- Behaviour controls have one home: the memory toggle lives in `AssistantPreferencesPopover`, not in
  `AssistantMemoryPanel`, which manages stored items only.
- **Do not use `DropdownMenu` for panels containing `Select` or `Switch`** — it closes on any click
  inside. Use `Popover`. The mobile thread `Sheet` is controlled (`open`/`onOpenChange`) and must be
  closed explicitly in the `onSelect` handler.

### Periodic Emails (`lib/server/monthlyEmailService.ts`, `weeklyBudgetEmailService.ts`)
- **Four period types** (`monthly | quarterly | semiannual | yearly`), each with its own toggle but a
  shared recipient list. Semi-annual closes 30 Jun / 31 Dec. Cron phases are independent, so 31 Dec
  can send Q4 + H2 + yearly — intentional. Adding a type touches: the union, `MonthlyEmailData`, the
  date helpers, `buildPeriodEmailData`, the label helpers, `buildAndSend*`, the cron phase, the send
  route, the settings 3-place + toggle + test-send button.
- **The weekly budget email is a SEPARATE module** and **nothing in it is weekly**: it is *sent* on
  Sunday, but its numbers are month-to-date and year-to-date and its projections land at end of
  month. Leaving a horizon implicit produced a real production error ("proietta 3665€ a fine anno"
  for a monthly ceiling). `buildCommentContext` (pure, exported, tested) states the day-of-month,
  tags the overall as a MENSILE ceiling with an A FINE MESE projection, gives each row its own window
  and forbids "fine anno"/"settimana" for monthly budgets. **When you add a figure here or to its
  prompt, name its window.**
- Over-budget rows carry `overspendExpenses` (actual overruns only, `ratio > 1`, never forecast-only),
  sourced from `getPeriodExpensesForItem` so the listed rows always reconcile with the row's `spent`.
  Category budgets only. Always run user notes through `escapeHtml`.
- **Comparison data is deterministic, AI only interprets** (`emailPeriodComparison.ts`): every delta
  is computed in code. **Net worth = end-of-period snapshots (point-in-time); income/expenses/savings
  = flows over the window** — two different semantics, made explicit in the caption. Cashflow deltas
  are `null` → "N/D" when a baseline period has no transactions.
- **The email AI comment is a DEDICATED Anthropic call**, not the assistant pipeline (chat mode with
  a null bundle injects a misleading "nessun dato disponibile", and there is no `semiannual_analysis`
  mode). It reuses `formatMemoryForPrompt` + `buildResponseStyleInstruction`. AI failure and
  comparison failure are both non-blocking; signals only in logs.
- **The yearly report is the existing `yearly` email extended**, not a separate send: `expensesByType`
  renders for all periods, "Top 10 Entrate" only for yearly, `topIndividualLimit` is 10 there and 5
  elsewhere.
- **The Hall of Fame mention is deterministic and fed to the AI** (monthly/yearly only), ranked with
  the shared pure layer `lib/utils/hallOfFameRecords.ts` — the SAME definition as the in-app page.
  Rank needs only net-worth deltas, so expenses are passed empty. Any failure → the badge is omitted.
- Benign function-level circular import between the two modules (neither uses the other at module
  load); use `import type` where possible. Expense field is `notes`, not `note`.
- `simpleMarkdownToHtml` order: strip `<details>/<summary>` first, `**bold**` before `*italic*`,
  collapse blank `<li>` gaps before the `<ul>` wrap regex.

### Panoramica and Dashboard Data Isolation
- Overview data flows through `GET /api/dashboard/overview` + `useDashboardOverview()` — no page-level
  fan-out queries, and no full-history expense queries (that belongs to Storico/Cashflow).
  `DashboardOverviewPayload` stays lean. `dashboardOverviewSummaries/{userId}` is server-owned: the
  client never reads it, and every overview-relevant mutation invalidates it explicitly (plus a short
  TTL fallback).
- **Both overview endpoints are owner-scoped**: the read route and `POST …/invalidate` authorize with
  `assertCanAccessAccount(decodedToken, ownerId)` and must NOT fall back to `decodedToken.uid`.
- **`DASHBOARD_OVERVIEW_SOURCE_VERSION` invalidates hardcoded `sourceVersion: N` literals in test
  fixtures too** — grep for `sourceVersion:` in tests whenever it changes, or a test silently
  exercises the recompute path instead of the cached one.
- Pure helpers live in `lib/utils/dashboardOverviewUtils.ts` and are called from the server service
  with already-fetched data. **Do not import `lib/services/goalService.ts` from a server-only file**
  — it top-level-imports the client Firebase SDK. `pickFeaturedGoalProgress` reimplements the small
  piece it needs and is gated on `goalBasedInvestingEnabled`.
- **Hero number overflow is a length-driven step-down**, not a container query: `heroValueClass` keys
  off the formatted string's length (>13 chars → `text-[32px] desktop:text-[40px]`). The hero card's
  width does not vary; the string does.
- **Every sparkline period always ends at the LIVE value, by design.** `filterSparklineByPeriod`
  returns baseline + N points, so "6M" spans seven labels. A separate `sparkline12mFixed` feeds the
  "Ultimi 12 mesi" line so switching periods never removes that context.
- **Hero variation chips use a CSS grid, not `flex flex-wrap`** — a grid sizes its columns together
  across rows, so chips of different text length share a width with no JS measurement. **Patrimonio's
  hero carries the identical block and reads the same payload: change both or neither.**
- Count-up lives in `OverviewAnimatedCurrency` leaf nodes, never in the page component.
  `OverviewChartsSection` is `React.memo` and schedules chart mount via `requestIdleCallback`
  (`{timeout: 800}`) once `heroSettled` — never a fixed timeout as the primary strategy; on mobile and
  reduced-motion `chartRenderReady` starts true.

### Cross-Component Metric Consistency
- When a figure shown in a chart or table must match a KPI exactly, **pass the pre-computed value as a
  prop** — do not recompute from chart data. The most common drift source is the annualization
  denominator (chart points = n−1, `metrics.numberOfMonths` = n): ~0.4pp at 14% TWR. De-annualize for
  "total growth" as `(1 + TWR/100)^(months/12) − 1`.
- **Two different quantities may NOT share a name.** Rendimenti shows `Capitale investito` (trade
  ledger) and, in the Evoluzione chart, `Capitale immesso` (net cash flow) — different sources,
  different questions. Naming them alike invites an "inconsistency" report and a fix that breaks one.

### Shared Constants and Fixed Hooks
- **Rule of Three**: a map used in 3+ files lives in `lib/constants/<domain>.ts`. Already there:
  `MONTH_NAMES`, the Hall of Fame section labels/key arrays, `dividendTypeLabels`/
  `dividendTypeBadgeColor`. The canonical symptom of a duplicated `Record<Type, string>` is one copy
  missing its `dark:` variants — illegible badges in dark mode, and TypeScript compiles fine. Audit
  ALL copies and reconcile before centralising.
- **Declare N fixed hook instances with `enabled: false` for the inactive ones — never loop over
  hooks.** Adding a benchmark: add to `BENCHMARKS[]`, add a fixed `useBenchmarkReturns`, add it to
  `hookResults` and the dependency memos.
- **Yahoo module asymmetry**: ETFs use `topHoldings` → `sectorWeightings` with snake_case keys that
  match `SECTOR_LABELS` directly; individual stocks use `assetProfile` → a title-case `sector` string
  that must go through a translation map. The two modules are mutually exclusive per asset type.
  Fetch both batches concurrently, and make the cache key encode BOTH ETF and stock tickers.

---

## 4. UI Patterns

### Motion
- Shared variants live in `lib/utils/motionVariants.ts`. `useReducedMotion()` is called once per
  component and used inline (`prefersReducedMotion ? 0 : duration`) — do not add separate CSS
  `prefers-reduced-motion` queries when Framer Motion is already in play. `<MotionConfig
  reducedMotion="user">` sits at the layout root.
- **Page transitions use `template.tsx`, NOT `layout.tsx` + `AnimatePresence`** — `template.tsx`
  re-mounts on every navigation. Remove page-level `motion.div variants` wrappers once it is in place
  (compounded opacity: t²).
- Long data-dense pages use scroll-gated chapter reveals (`whileInView="visible"`,
  `viewport={{ once: true, margin: "-80px" }}`) — `animate="visible"` fires every section at mount.
- `useCountUp` always with `once: true` (else React Query cache hits re-trigger it, and
  `fromPrevious: true` alone causes a first-load flash). It must be called **before** any conditional
  early return, unconditionally for both branches of a mode switch. **It has no `enabled` option** —
  gate the display in JSX instead.
- Do not wrap shadcn `TableRow` with `motion()` — use `motion.tr`. Use `motion.create(Component)`,
  never the deprecated `motion(Component)`.
- **`layout="position"`, not bare `layout`, when a Framer parent wraps a Radix `CollapsibleContent`** —
  bare `layout` scales the parent to animate the height change and stretches the trigger text.
- **Collapsible technique, by content shape:**
  - Nested lists / rows that expand into sub-rows → pure CSS
    `grid-rows-[0fr] → grid-rows-[1fr]` on a wrapper with an `overflow-hidden` child, plus `inert`
    on the closed wrapper (content stays mounted for the transition to size). Framer
    `AnimatePresence` + `height:'auto'` + `opacity` left revealed rows **stuck at opacity 0** — the
    symptom looks like missing data, not an animation bug. Note the mounted content still has a
    bounding box, so a browser test must scope through `aria-controls`, not text.
  - Tall or unpredictable sections → Radix `<Collapsible>` with a CSS transition.
  - Small predictable content → `AnimatePresence` + `height: 'auto'` + `overflow: hidden`.
  - Full-width content inside a flex row → put the `AnimatePresence` block OUTSIDE the row.
- **Chevrons**: with Radix, `CollapsibleTrigger asChild` propagates `data-state`, so
  `group-data-[state=open]:rotate-180 transition-transform duration-200 motion-reduce:transition-none`
  on the icon needs no React state. With manual `useState`, use `${open ? 'rotate-180' : ''}`.
  **Always render the chevron on an expandable row** — the affordance is invisible without it.
- `AnimatePresence mode="wait"` + `key={stateValue}` for content that fully swaps;
  `AnimatePresence initial={false}` for lists where items are added/removed. List exit animations
  need `exit={{ opacity: 0, height: 0, marginBottom: 0 }}` + `overflow: hidden`.
- **An auto-dismiss timer must live in its OWN `useEffect([visible])`**, never in the effect that
  also depends on data props: a React Query refetch cancels the pending timer, the re-run hits the
  guard and returns early without re-arming, and the badge sticks until a manual refresh.
- **`react-hooks/set-state-in-effect`**: a synchronous `setState` in an effect body trips the lint.
  Defer with `setTimeout(…, 0)` (returning the cleanup) or drop the call when a sibling handler
  already covers the transition. The classic `mounted` guard is therefore banned — for client-only
  state that differs between SSR and hydration use
  `useSyncExternalStore(neverChanges, () => true, () => false)`, which declares the split in the
  signature. `suppressHydrationWarning` would hide the warning and leave the wrong option highlighted.
- **`react-hooks/preserve-manual-memoization` ("Compilation Skipped")**: the compiler refuses to
  optimize the whole component when a dep array is *more specific* than what it infers (manual
  `[overview?.expenseStats]` vs inferred `overview`). Align the dep to the inferred value.
- **Loading skeleton over spinner** on any page that invests in count-up and chart scheduling: a
  structural skeleton (`animate-pulse bg-muted rounded`) replicating the post-load layout, with the
  same grid columns and spacing. Import `PageContainer` inside the skeleton file (or wrap at the call
  site), or the content shifts on load. After writing a skeleton, verify it is actually wired up —
  TypeScript does not catch an unused component.
- Mobile CPU budget is ~3-5× tighter: do not render heavy off-screen components while a mount-time
  `useCountUp` runs. Validate motion in a production build, not `next dev`.
- Async tab count: `useState<boolean|null>(null)` + an `h-10 animate-pulse` placeholder, mounting the
  real `TabsList` only after settings arrive — avoids a column-count reflow flash.
- One-time guide strips go OUTSIDE the `key={selectedPeriod}` reset div so they do not replay.
  Do not key KPI sections by period; values should jump silently on a period switch.

### Recharts
- **`useChartColors()` is mandatory for every series** — never hardcode `#8884d8` & co. Read CSS vars
  after paint via the hook and pass `chartColors[0..4]` as props.
- **Never pass `useChartColors()` to a Nivo/react-spring component.** `@react-spring/web` cannot
  interpolate hex→oklch (the format the hook returns) and throws
  `createStringInterpolator2: arity … must be equal` on load; `animate={false}` does not help. Sankey
  node colors stay hardcoded hex. Only Recharts is react-spring-free.
- **Three separate tooltip style props, none inherited**: `contentStyle`, `labelStyle`, `itemStyle`.
  Omitting `itemStyle` leaves value rows at Recharts' hardcoded colour — invisible on dark. Define
  all three as module-level `as const` objects using `var(--card)` / `var(--border)` /
  `var(--card-foreground)`; never a literal like `#111827`.
- **Axis ticks and legends are numbers, so the Mono Mandate covers them — and a Tailwind class cannot
  reach them.** Pass `tick={CHART_TICK_STYLE}` (`{ fontSize: 11, fontFamily: 'var(--font-geist-mono)',
  fill: 'var(--muted-foreground)' }`, canonical copy in `components/cashflow/costCenterStyles.ts`) on
  every axis, with `tickFormatter={(v) => cachedFormatCurrencyEUR(v, true)}`. `<Legend>` needs
  `wrapperStyle={{ fontSize: 12, color: 'var(--muted-foreground)' }}`.
- **`<Legend content=>` needs a module-level component** — an inline arrow makes a new ref every
  render and the legend flickers on unrelated state.
- `Legend` reads `<Bar fill>`, not `<Cell>` — always set `fill` on the `<Bar>` even when cells
  override it. Do not set a global text `color` in the tooltip style for line/area/bar charts.
- **`formatter`'s first param is `ValueType | undefined`** — never type it `number`. Coerce with
  `Number(value ?? 0)` (bars) or `value != null ? … : '—'` (nullable lines with `connectNulls={false}`).
  `itemSorter={(item) => -(item.value as number)}` orders multi-series tooltip rows by value so they
  mirror the on-screen stacking.
- Defaults: `Bar`/`Pie` `animationDuration={600}`, `Line`/`Area` `800`, both `ease-out`; `Pie` also
  needs `animationBegin={0}`; decorative stacked backgrounds keep `isAnimationActive={false}`.
- **Accessibility goes on the chart, not a wrapper.** Recharts 3.x puts `tabIndex=0` +
  `role="application"` on its own `<svg>`; wrapping that in a `role="img"` div leaves a tabbable node
  inside a subtree declared presentational. Pass `role="img"` + `aria-label` +
  `accessibilityLayer={false}` to the chart itself — and remember `role="img"` also hides the
  `<Legend>`, so the label must carry the colour→name mapping.
- **Sizing**: a sparkline on large numbers needs `<YAxis hide domain={['auto','auto']} />`.
  `ResponsiveContainer` logs `width(-1)/height(-1)` on mount before `ResizeObserver` fires — bypass it
  with explicit `width`/`height` for fixed-size charts. Inside a flex row with a sibling legend, wrap
  the chart in a fixed-size `div` (`flexShrink: 0`) and give the legend `flex-1`; suppress the
  internal `<Legend>` if the parent renders its own.
- A minimal chart with a tooltip and no `<XAxis dataKey>` shows the point index (0,1,2…) as the
  header — render `<XAxis dataKey="label" hide />`; `labelFormatter` cannot fix it.
- **Never stack bands whose components can go NEGATIVE** — Recharts draws a negative segment
  *downward*, so the stack stops meeting the total. The shape with no such failure mode is **one area
  under a line** (area = money put in, line = what it is worth, the GAP is the return); the numeric
  decomposition moves into the tooltip.
- **`ComposedChart` with a signable line**: `domain={[(dataMin) => Math.min(0, dataMin), 'auto']}`
  keeps the 0 baseline for the bars while extending below zero only when the line dips.
  `domain={['auto','auto']}` would lift the bar baseline off zero.
- **100%-stacked composition: pre-normalise the rows, do NOT also use `stackOffset="expand"`** (it
  re-normalises to 0-1 and breaks a `[0,100]` YAxis). Guard the 0/0 bucket.
- **Dark-mode area gradients** need stop opacities of at least `0.65 / 0.45 / 0.18` plus
  `strokeWidth={2}`; the usual `0.4/0.2/0.05` makes mid-luminance colours nearly invisible.
- **Rolling charts always render**, with an inline empty-state message when data is insufficient —
  silent disappearance violates system-status visibility.
- **Time-bucketed chart data belongs in a tested pure layer** (`lib/utils/cashflowTimeSeries.ts`:
  `buildTimeBuckets`, `buildCategoryTimeSeries`, `buildTypeTimeSeries`). `buildTypeTimeSeries` groups
  by `Expense.type` in a FIXED canonical order (no top-N — the domain is small and stable) and drops
  zero-spend types so a no-debt user gets no flat line.
- `SavingsRateTrendSection` accepts `scopeYear?: number | null`: when set, the month window is LOCKED
  to that calendar year and the section hides its own range toggle; when null the toggle is OWNED by
  the section. `selectedMonth` does NOT narrow it. `XAxis interval="preserveStartEnd"` thins ticks.
- Server-cached chart data has colors baked into the React Query cache — **remap at render time in
  the page component for EVERY chart array** (the Overview once remapped `assetData` but not
  `assetClassData`). Positional remap (`chartColors[i]`) is only safe with no cross-page colour
  identity: asset-class data must remap via `ASSET_CLASS_CHART_INDEX[d.assetClass]`.
- **`sticky` inside a div-scroll wrapper**: `sticky bottom-0` on `<tfoot>` overlaps rows when the
  scroll container is the `<div>` — remove it. A sticky `<thead>` needs a fully opaque token
  (`bg-card` inside a Card, `bg-background` on a page), never an alpha background.

### Composition Primitives
- **`CompositionList` bar width = `value / maxValue`, never `percentage`.** Width encodes RANK,
  `percentage` encodes SHARE and is rendered separately as the trailing label. Using `percentage` as
  width makes every bar look short whenever nothing dominates — the exact empty-card problem the
  ranked-bar redesign replaced pie charts to fix. The same trap is documented in `composition-list.tsx`.
- **Subcategory shading must never parse a resolved chart colour** — `useChartColors()` returns oklch
  strings, so hex-parsing silently falls back to a hardcoded colour. Use `barOpacity` from
  `computeShadeOpacities(count)` (`lib/utils/compositionShading.ts`), which works on any CSS syntax.
- `CompositionBar`/`CompositionList` need no `revealedCharts`/`animateOnMount` tracking: their
  entrance is a Framer `initial`/`animate` on a component instance that never unmounts, so `initial`
  naturally does not replay. That tracking was Recharts-specific.
- **`SegmentedPill`** (`components/ui/segmented-pill.tsx`) is the generic `role="tablist"` pill with
  real roving-tabindex (Arrow/Home/End). Use it for any page-local period/view/range toggle rather
  than hand-rolling `role="tab"` again — a hand-rolled one easily omits the keyboard nav that
  `role="tab"` implies. **`DrillBreadcrumb`** is the shared clickable breadcrumb.

### Color Theme System
- **Parallel theming**: next-themes owns `.dark` on `<html>`; the custom system owns `data-theme`.
  Fully independent — never conflate them. CSS: `[data-theme="name"]` for light,
  `.dark[data-theme="name"]` for dark; the default theme uses `:root` / `.dark`.
- `ColorThemeContext` manages `data-theme` + localStorage + Firestore sync and must live inside
  `AuthProvider`. Rule for `userPreferences/{userId}`: `isOwner(userId)` — the doc ID *is* the userId,
  so no field check.
- **`useChartColors` timing**: `useEffect + useState + requestAnimationFrame`, NOT `useMemo` —
  `getComputedStyle` during render runs before next-themes has updated the DOM and yields stale
  colours on a theme switch.
- **oklch luminance filter**: L > 0.82 in light or L < 0.30 in dark falls back to the static palette.
  Themes with chart colours at extreme luminance will always fall back — fix them at the CSS level.
- **Dark theme chroma gotcha**: below ~0.015 chroma everything looks identically gray. Verify
  `--card`, `--background`, `--muted` have chroma ≥ 0.020 **and** that the hue matches the theme.
- **Action/semantic colors that must follow the theme: clamp lightness, do not index-fallback.**
  `useActionColors` maps COMPRA/VENDI/OK to `--chart-*` slots and clamps only the oklch L channel
  (light: L>0.72→0.62; dark: L<0.48→0.60), preserving hue and chroma. Do NOT reuse `useChartColors`:
  its same-index fallback loses the theme hue and can collapse two states onto one colour.
  `--warning`/`--positive`/`--destructive` are identical across all six themes, so they cannot carry
  theme personality. Resolve **once per section** and pass the colour down — never per row.
- **Sign tokens must be verified per theme, and the two behave differently.** `--positive` is declared
  twice (`:root`, `.dark`) and no theme overrides it, so one value fixes all twelve combinations;
  `--destructive` is declared **twelve times** (cyberpunk's is orange) and must be measured per theme.
  Never assume a token change lands globally without counting its declarations.
- **A user-chosen identity colour is a SLOT, not a hex.** Store `'chart-1'..'chart-8'` and resolve via
  `resolveCostCenterColor(stored, id, palette)`. Three rules: **migrate without a backfill**
  (`LEGACY_HEX_SLOTS` maps each old hex to the slot at the same position, so identity is preserved and
  the stored hex survives until the next save); **derive the no-colour fallback from the document id**
  (FNV-1a), never from the row's rank, which repaints half the list on every period switch; and
  **only indices 0-4 are theme-aware** — `useChartColors` pads 5-9 from the static palette, so do not
  describe an 8-slot picker as fully theme-aware (CLAUDE.md → Known Issues).
- **Adding a theme**: CSS blocks `[data-theme="name"]` + `.dark[data-theme="name"]`, the `ColorTheme`
  union in `userPreferencesService.ts`, the swatch in `settings/page.tsx`, grid columns, `tsc`.
- **View Transition circle-reveal**: remove `disableTransitionOnChange` from `ThemeProvider` or the
  animation is blocked; set `--vt-cx`/`--vt-cy`/`--vt-r` inline before `document.startViewTransition`.

### Navigation
- **Single source for nav arrays**: `lib/constants/navigation.ts` (`primaryNav`, `analysisNav`,
  `planningNav`, `secondaryHrefs`, the last derived from the other two). Sidebar, BottomNavigation and
  SecondaryMenuDrawer all import from it — never redeclare inline.
- **Sidebar active state for `/dashboard` must be `pathname === item.href`**, never `startsWith` —
  which would keep Panoramica highlighted on every sub-route. All other routes can use prefix matching.
- Icon-collapsed sidebar: `collapsible="icon"`, content hidden via `group-data-[state=collapsed]:hidden`,
  state persisted by shadcn's `useSidebar()`.
- **Bottom nav is portrait-only** (`max-desktop:portrait:flex max-desktop:landscape:hidden`), so an
  in-page button duplicating the FAB must be hidden **only in portrait** — in landscape the FAB is
  gone and it is the only add affordance. It reads `--sidebar-*` vars via inline `PILL_STYLE`; the
  active pill is a Tailwind arbitrary value. `--sidebar-primary`/`--sidebar-accent` are NOT used here.
- Secondary drawer groups: **Statistiche** (read-only views, incl. Assistente AI), **Pianificazione**
  (action-bearing tools: Allocazione, FIRE), **Preferenze**.
- **Cross-hierarchy communication uses a custom DOM event** (`window.dispatchEvent(new
  CustomEvent('cashflow:add-expense'))`) — the FAB has no shared ancestor with `ExpenseTrackingTab`,
  and prop drilling would thread callbacks through unrelated layers.
- **`PageTabBar` is for icon section-tabs** (Variant A: active label + icon-only inactive, width
  animated by `motion.button layout="size"`); `SegmentedPill` is for value toggles (Variant B: all
  labels visible). Never force icons onto a period selector, and never use a `Select` for tab
  navigation (2 taps, hidden options). Async-gated tabs build the array in render from a
  module-level base.

### Hierarchy, Density and Disclosure
- **Trade Republic metric hierarchy**: the section's primary metric is a Hero Dominant Value Block
  (`text-4xl font-bold font-mono` + a `text-xs uppercase tracking-widest` eyebrow); every other
  metric is a flat row (`flex items-center justify-between px-6 py-3.5` inside `divide-y`), never a
  card-in-card grid. `MetricSection` is a single `<Card className="overflow-hidden">`. No progress
  bars, no side stripes.
- `MetricCard`: `subtitle` renders RIGHT (`shrink-0`, short strings only), `description` renders LEFT
  (`min-w-0 flex-1`, room to wrap). Long content in `subtitle` overflows.
- **Navigation-focused items → flat `divide-y` list** inside one bordered card (the parent supplies
  the structure). **Content-dense items → card grid.** Allocation rows are affordances; asset cards
  are information blocks.
- **Side-by-side `text-2xl`+ values overflow on mobile.** Stack instead: primary value full width,
  secondary as a smaller coloured line below with the percentage as an inline `<span>`.
- **A card header with a destructive icon button uses `flex items-start justify-between`**, never
  `flex-col` + `sm:flex-row`, which wastes a row on mobile and breaks the grouping.
- **Never give a "Custom" state a permanent slot in a period selector** — it looks disabled until
  active. Render a `rounded-full` chip with the range below the selector only when active, with a `×`
  to reset. A selector that must work across multiple return paths uses plain `<button role="tab">` +
  a module-level Framer `layoutId`, not shadcn `<Tabs>` (which requires `<TabsContent>`).
- Collapsible methodology blocks: shadcn `Collapsible`, default closed, trigger wrapped around
  `CardHeader` via `asChild` for a large target. `cn` is NOT auto-imported in page files.
- Dev/internal sections in settings are isolated with `border-t border-border pt-6` + a
  `text-xs uppercase tracking-widest` eyebrow — never co-located in a functional product tab.
- **A cardified mobile view needs its own reading note.** A matrix that collapses to per-row cards has
  no rows and columns any more: split the help copy (`hidden desktop:block` / `desktop:hidden`) and
  label each card's axes explicitly.
- **Prefer rendering large local subtrees as pure render helpers or top-level components**, not nested
  JSX definitions inside a page component — otherwise a simple row selection remounts the whole table.

### Public Landing Page (`app/page.tsx`)
- **The hero must speak the product's own data-first language, not generic-SaaS marketing.** Pattern:
  `desktop:grid-cols-[1.05fr_0.95fr]` — pitch copy left, a faithful **Panoramica preview** right
  (dominant net-worth number in `font-mono text-[44px] desktop:text-[54px] tracking-[-0.03em]`,
  variation chip, the real `NetWorthSparkline`, flat `divide-y` breakdown). Do NOT regress it to a
  centered headline + feature-card grid.
- **Label illustrative data**: the preview uses hard-coded constants and carries a "Dati dimostrativi"
  caption. Keep the sparkline's last point consistent with the headline number.
- **Zero-Chroma on the public page too**: never accent the headline or icons with
  `text-primary`/`bg-primary/10` — in the default theme `--primary ≈ --foreground`, so the "accent" is
  invisible there and only colours on the five personality themes. The only colour is the data.
- **Features are a flat `divide-y` list, not a card grid** — six identical icon+title+description
  cards is the AI-slop tell. Two columns on desktop, hairline borders, trailing borders dropped.
- The right column stacks two previews built from **real shipped components** (the second reuses
  `SavingsRingChart`). Prefer reusing a component with sample props over re-implementing a look-alike.
  The proof strip describes the *product* (e.g. "100% open source"), never fabricated financials.
- The count-up is a small local rAF (the public page has no React Query), and its reduced-motion
  branch must render the final value directly in JSX rather than `setState` in an effect.
- The landing navbar and the login/register headers all drop in `<ThemePicker />` — same toggle, same
  placement idiom across the whole unauthenticated surface.

### Accessibility
- **`title` is not an accessible name.** VoiceOver on iOS ignores it, it needs a ~1s hover, and it
  never fires on touch. Use `aria-label` for icon-only buttons; use a Radix `<Popover>` for
  informational content users should be able to *access*. **A `title` added by a STATE CHANGE is
  never shown at all** — the browser opens the tooltip on pointer *enter*, so an attribute that
  appears while the cursor is already resting there does nothing. Put the consequence in visible copy.
- **Touch targets ≥ 44×44px.** `h-6 w-6` is below threshold; use `h-8 w-8` in dense lists, `h-10 w-10`
  for primary and destructive actions, `min-h-[36px]` for tab filters. shadcn `size="icon"` defaults
  to 36px — override it on touch-critical controls.
- **Actions hidden with `opacity-0` are unreachable on keyboard AND invisible on touch.** Use
  `[@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:group-hover:opacity-100
  [@media(pointer:fine)]:group-focus-within:opacity-100`.
- **A non-interactive element with `onClick` needs `role="button"`, `tabIndex={0}`, `aria-label`, an
  Enter/Space `onKeyDown` and a focus ring — better still, use a native `<button>`** and get all of
  it for free.
- **Tabs**: `role="tab"` + `aria-selected` inside a `role="tablist"` with an `aria-label`; for a real
  tab/panel relationship also wire `id` + `aria-controls` to a `role="tabpanel"` with matching
  `aria-labelledby`. An active state with no tab in the tablist (a CUSTOM range) needs a
  `role="status" aria-live="polite"` `sr-only` description instead.
- **A toggle that shows a panel needs `aria-expanded` and `aria-haspopup`**, plus a document-level
  Escape handler added and removed inside `useEffect([isOpen])`.
- **`aria-live` regions**: streaming content needs `aria-live="polite" aria-atomic="false"` and an
  `aria-label`. **Emptying a live region announces nothing** — a two-click confirm must announce the
  *disarm* explicitly, not just the arm.
- **Data tables**: every `<thead>` `<th>` needs `scope="col"`, and row-header cells must be
  `<th scope="row">`.
- **Calendar grids need explicit ARIA rows**: `role="grid"` outer, `role="row"` per week (the flat
  42-cell array must be sliced), `role="columnheader"` in the header, `role="gridcell"` per date.
  `role="gridcell"` on a `<button>` is acceptable when the button IS the whole cell. Build the cell's
  `aria-label` in the parent (which already has the data) and make the prop non-optional.
- **`role="radiogroup"` for ephemeral type pickers** (N cards that immediately navigate):
  `role="radio"` + `aria-checked={false}` on each, because clicking navigates away.
  **`role="group"` + `aria-labelledby`** for a label describing a group of buttons — a `<label>`
  without `htmlFor` is associated with nothing.
- **A progress bar's ARIA goes on the TRACK container**, not the fill: `role="progressbar"`,
  `aria-valuenow/min/max`, `aria-label`.
- **Colour-swatch buttons**: never label a swatch with its hex (screen readers spell it out) and,
  once the palette is theme-resolved, never with a hue name either (a slot renders differently per
  theme). Name the **position**: `Colore ${i+1} di ${n}` + `aria-pressed` + a `(selezionato)` suffix.
  A selection signalled only by `border-foreground` needs an explicit `focus-visible` ring.
- `type="button"` on every non-submit `<button>`. `aria-label` on icon-only `SelectTrigger`s.
- **Two-click confirm: no timer, and not `onBlur` alone.** A 3-second auto-disarm is a WCAG 2.2.1
  time limit; Safari does not focus a `<button>` on tap, so a focus-based release never fires there
  and the armed state stays hot indefinitely. Use a document `pointerdown` listener with a
  `ref.contains(target)` guard, plus Escape, plus `onBlur`. **Disarm BEFORE delegating** — on success
  the parent usually unmounts, so nothing resets the flag on failure and the next single click fires
  the destructive action with no confirmation.
- **Form error text needs the sign token too.** `text-red-500` fails AA in both modes on a dialog
  surface AND diverges from `--destructive` on the non-default themes — the Sign-Color Token Rule
  covers value colouring, error text needs the token for the same two reasons.
- **`<Button asChild>` inside `<Link>`**, never `<Button>` — that nesting emits `<a><button>`.
- **KNOWN GAP**: `PageTabBar`'s inactive tabs have no accessible name below 1440px
  (`{showLabel && <span>{label}</span>}` with no `aria-label` fallback). Affects Settings, Cashflow
  and FIRE for screen-reader users. When fixing, add `aria-label={label}` unconditionally.

---

## 5. Testing and Workflow

> Session rules — one branch and one commit per session, no commit without explicit approval, the
> guided-verification protocol — live in **WORKFLOW.md**.

### Commands
- `npm test -- <file>` / `npx vitest run <file>` for targeted tests; **`npx tsc --noEmit` before any
  PR**, and re-run it AFTER writing the tests, not only after the code.
- **Run the suite under `TZ=Europe/Rome` too.** Every date fixture here is stamped at noon with an
  explicit offset, twelve hours clear of the DST edge — so a whole class of timezone bug is
  structurally invisible to it. Production dates are **local midnight** (`ExpenseDialog` stores
  `new Date(dateString + 'T00:00:00')`) and the pure layer runs in the user's own browser. That is
  how `dayOfYear` hid an off-by-one for months. Compute day-of-year from calendar fields in UTC
  (`Date.UTC(y,m,d) - Date.UTC(y,0,0)`) and add at least one fixture built the way the dialog builds
  one.
- Area suites to run alongside a change:

| Area | Suites |
| --- | --- |
| Overview / materialized summary | `apiAuthRoutes`, `dashboardOverviewService` |
| Rendimenti | `performanceService` (+ `performanceBase`, `drawdownSeries`, `cashFlowMap`) |
| Storico | `chartService` · **FIRE/Goals** `fireService`, `goalService` |
| Assistant | `assistantRoutes`, `assistantWebSearchPolicy`, `assistantMonthContextService` |
| Dividendi / cron | `dividendUseCase`, `dividendProcessor` · **Email** `monthlyEmailService` |
| Asset / bond | `assetDialogHelpers`, `couponUtils` · **Budget** `budgetUtils` |
| Centri di costo | `costCenterUtils`, `costCenterColors` |
| Analisi | `expenseGrouping`, `cashflowSankey`, `cashflowComposition`, `comparisonDeltas`, `expenseEntityStats`, `entitySearch` |
| Transfers / cash | `cashBalanceReconciliation`, `updateCashAssetBalancesAtomic`, `transferFeature` |
| Allocazione | `allocationUtils` · **Ledger** `assetTransactionUtils`, `assetTransactionsRoutes`, `assetTransactionWriteTx` |
| Fondo pensione | `pensionDeduction`, `pensionContributions`, `pensionReturn`, `pensionContributionService`, `performanceBase`, `pensionFire`, `pensionFamilyMembers` + the transfer trio |

Touching `types/assets.ts`'s `AssetType` also means `assetDialogHelpers` + `allocationUtils` + the
three ledger suites.

- `npx knip` uses the root `knip.json`: `components/ui/**` and `public/sw.js` are ignored,
  `firebase-tools` is an ignored dependency (shelled out by a script, invisible to static analysis),
  and `ignoreExportsUsedInFile: true` means remaining EXPORT_ONLY findings are deliberate prop surface.
- Emulators, Playwright, production-build verification and the environment traps around them:
  **SETUP.md → Steps 6-7 and "Local verification troubleshooting"**.

### Emulator Exercise Scripts
- The unit suites mock Firestore away, so a collection whose value is in the *wiring* gets a
  companion emulator exercise (`npm run emulators:pension`, `emulators:pension-p3`). They cover what
  the mocks hide: the rules actually permitting the writes, real `Timestamp` values surviving
  `removeUndefinedDeep`, the real atomic transaction, the real sign convention.
- **Write them as `.mts`** — a `.ts` script is CJS under tsx and has no top-level await. **Drive the
  mutations through the app's services** (client SDK, rule-evaluated) and do the script's own
  reads/fixture edits with the Admin SDK: from an `.mts` file the client SDK's submodules resolve
  inconsistently against the app's CJS modules, so a `doc()` imported there rejects a `db` built here
  (`Expected first argument to doc() to be a CollectionReference…`) — and sign-in works, which makes
  it look unrelated. Expect (and silence) `[dashboardOverviewInvalidation]` warnings: it POSTs a
  relative URL and there is no Next server.
- Prefer verifying with **two independent paths** rather than one: `exercisePensionPerformanceAndFire`
  computes the expected figure itself from the same real snapshots and asserts it matches what the
  service produces on its own — a same-code-path comparison would be circular.

### Reference Fork
- The leverage/allocation specs cite a fork that is **not** in this repo:
  `git remote add ciocc https://github.com/Ciocc128/net-worth-tracker.git && git fetch ciocc main`
  (read-only, never pushed) makes `git show ciocc/main:<path>` work. Read the actual reference diff
  rather than re-deriving logic from the spec prose.

### Test Patterns
- `new Date(year, monthIndex, day)` in tests (not ISO strings); `toBeCloseTo()` for floats; fake
  timers for time-sensitive branches. Keep fixtures aligned with the current required types.
- Mock `@/lib/firebase/config` at the boundary for any test that transitively imports it.
- Materialized-summary tests: keep `updatedAt`/`computedAt` inside the 5-minute TTL to hit the cached
  branch; older dates force a live recompute and need fuller Admin SDK mocks.

### Browser-Driven E2E (Playwright)
- **What belongs here**: only what needs a real layout — the `desktop:` switch at 1440px, a
  collapsible, a state flash, computed font sizes, bounding boxes, overflow. The arithmetic stays
  with Vitest; a browser test that re-checks a number a pure function already proves is a slow
  duplicate. jsdom has no layout engine, so `@testing-library/react` would answer none of it while
  adding React Query / context / `next/link` mocks to every test.
- **Two limits the suite cannot cover**, stated so nobody trusts it further than it goes: a race
  between concurrent queries is **not reproducible locally** (the Firestore Web SDK multiplexes every
  target onto ONE webchannel, so they cannot be delayed relative to one another — measured, and CDP
  latency is uniform so it does not help); and an **error branch is not reachable by cutting the
  network** (the SDK treats an unreachable backend as offline and retries, so the query stays in
  loading). Those invariants are guarded by the code, not by a spec.
- **`workers: 1`, non-negotiable** — the specs share emulator accounts.
- **Give the suite its OWN fixture, not another script's end state.** Three accounts: the base one,
  `test-user-degraded` (re-seedable scenarios `suspicious|idle|fresh`) and `test-user-analisi`. The
  Analisi fixture dates EVERY expense to January so year-to-date windows contain them whatever month
  the suite runs in, and every asserted number stays exact all year; the base seed's current-month
  expenses would pollute them. Pick fixture numbers that make the assertion meaningful.
- **Re-seeding an account mid-suite logs it out**: `auth.updateUser(uid, { password })` revokes the
  refresh tokens and invalidates the parked `storageState`. Split the seed — account creation once
  from `global-setup`, data-only for per-test scenarios.
- **`storageState` does NOT capture IndexedDB unless you ask for it**, and the Firebase Web SDK's
  session lives there. The file looks perfectly valid and every spec silently lands on `/login`.
  Pass `{ path, indexedDB: true }`.
- **Prove the test can fail before trusting it.** The 1440px assertions were re-run at 1200px, where
  they must fail. A layout test that has never been seen red is indistinguishable from one asserting
  nothing.
- **`page.addInitScript` runs BEFORE `document.documentElement` exists** — observing it throws, the
  init script dies on that line, and the spec passes because it observed *nothing*. **Observe
  `document`** with `subtree: true`. This exact failure mode survived a session despite the rule above.
- **`innerText` applies `text-transform`; `textContent` does not.** A marker taken from an uppercase
  eyebrow never matches `body.innerText`, and a falsification run using such a string stays green —
  which reads as "the detector is broken" and sends you debugging the wrong thing.
- **Responsive DOM duplicates make `.first()` a trap.** A surface duplicated per breakpoint resolves
  to two nodes and the DOM-first one is usually the HIDDEN mobile copy, so `.first()` fails on
  "hidden" — which reads as a missing element. Filter on visibility: `.filter({ visible: true })`.
- **A collapsed CSS-grid region is still "visible" to Playwright** (its children keep a bounding box
  even though the wrapper clips them). Scope through the toggle's `aria-controls` id, and assert the
  collapse by measuring the region's height, not by text visibility.
- **`CompositionList` clickable rows are `<button role="listitem">` — the explicit role WINS.** Locate
  them with `getByRole('listitem', { name: … })`; their accessible name is `"{name}, {value}, {share}%"`.
- **`PageTabBar` renders no accessible name for inactive tabs below 1440px** (see the a11y KNOWN GAP)
  — drive those tab bars at a viewport ≥ 1440px.
- **A `fill()` right after `goto(…, { waitUntil: 'domcontentloaded' })` can be silently wiped**:
  hydration reconciles a controlled input back to its initial React state. Use `waitUntil: 'load'` +
  an explicit wait, and verify with `.inputValue()` before proceeding.
- **Firestore emulator REST calls need `Authorization: Bearer owner`** — an unauthenticated request
  is filtered to an empty result by the rules engine rather than erroring, which looks exactly like
  "no documents exist". Use it to inspect or surgically delete test data instead of wiping
  `.emulator-data/`.

---

## 6. Quick-Fix Reference

- **Wrong month near midnight** → Italy timezone helpers, never `Date.getMonth()`.
- **Settings toggle resets on reload** → update `getSettings()` and BOTH branches of `setSettings()`.
- **Admin SDK auth gap** → verify the Firebase ID token server-side; Admin bypasses Firestore rules.
- **Radix Select runtime error** → never an empty string as a value; use `__all__` / `__none__` /
  `__create_new__`.
- **Radix Select clears a programmatically-set value** whose item never mounted: setting a controlled
  Select from an effect while the content is CLOSED fires `onValueChange('')`, because the items live
  in an unmounted portal and Radix's "selected item removed" cleanup finds no match. A naive handler
  then writes `''` into the form AND arms the touched-flag, so the select renders blank forever. Two
  parts, both required: **ignore empty-string callbacks** (`if (!value) return`) and **give
  `SelectValue` explicit children** looked up from the options array.
- **Radix Tabs `forceMount` leaves blank space** → `data-[state=inactive]:hidden` on `TabsContent`.
- **Radix `CollapsibleTrigger` nested-button hydration error** → `asChild` AND a
  `<button type="button">` child; a `<div>`/`<span>` child is a P1 keyboard-a11y bug.
- **Firestore transaction crash** → all `tx.get()` before any write (*Firestore Writes*).
- **MultiSelect can't scroll on tablet** (inside a Drawer) → pass `forceDrawer`: it only renders the
  nested Drawer below 640px, and a Radix Popover nested in a vaul Drawer fights focus-trapping.
- **`SearchableCombobox` shows "Add" on an exact match** → compute `hasExactMatch` and render the
  create-option only when false.
- **`getAvailablePercentage(assetId, assignments, excludeGoalId)` already includes the goal's own
  slice** — it returns the TOTAL cap. Do NOT add `existingAssignment.percentage` on top.
- **JSON date fields in a request body arrive as ISO strings**; `string <=/>= Date` is always false.
  Wrap `new Date(body.field)` before any comparison.
- **JSX comment as a sibling in a ternary branch** → `TS1005`/`TS1382` far from the comment. Wrap in a
  fragment or move the comment inside the element.
- **`AnimatePresence` dialog body collapses to blank** → `absolute inset-0` needs an explicit-pixel
  parent. Use `div.flex-1.overflow-y-auto.min-h-0` as the scroll container, plain padding on the
  `motion.div` children, and move the sticky footer outside `AnimatePresence` as a `shrink-0` sibling.
- **iOS safe area on sticky composers** → `style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}`
  (a CSS property, not a Tailwind class). Do not also add BottomNav clearance if the wrapper uses
  `bottom-N`.
- **`useMediaQuery` initializes from the real `matchMedia`**, not `false` — reverting to
  `useState(false)` is only correct if it is added to a public SSR page.
- **Deriving a text colour by string-replacing a bg class** is an anti-pattern: the derived string is
  never statically visible to Tailwind's scanner. Extract a dedicated `progressTextColor(...)`.
- **A domain rule copy-pasted into a 3rd file will diverge, and the divergent copy is the one users
  see** (`assetPricing.ts` is the worked example).

### Audit habits
- **"Keep" verdicts need the same grep as "Delete" verdicts.** A wrong Delete breaks the build
  immediately; a wrong Keep burns a whole commit polishing a component with zero importers. Grep
  `<ComponentName` for every surface in a census.
- **A doc comment naming a caller is a claim, not evidence — grep it.** Comments are the
  least-refreshed layer in the repo. When the grep contradicts the comment, fix the comment in the
  same commit, or the next audit re-derives the same wrong map. The same applies to docstrings at the
  top of a page/component: when you finish a feature, grep the touched files' docstrings, not just
  the `.md` files.
- **Knip marks a dead chain's intermediate links "live"** because the orphan still imports them.
  Trace the call graph inward before deleting, verify each link independently (one may have picked up
  a legitimate second caller), and delete the whole chain in ONE commit.
- **A function that always returns `[]` keeps its whole downstream pipeline "live" for knip** — the
  import graph cannot see that the map is empty on every invocation. When a "live" symbol's only
  callers are capture/fetch helpers, read the function that decides *what* gets captured.
- **Naming-collision trap**: `PDFSection` (unused) vs `PDFSectionData` (live) differ by one suffix.
  Re-run the verification grep with the exact identifier and read the match lines, not the count.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
