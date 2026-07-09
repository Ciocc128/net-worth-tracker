# Session Notes — Leveraged ETF support in Allocation engine

Branch: `feature/leveraged-etf-support`

## Goal
Complete leveraged-ETF support in the portfolio allocation engine: introduce a
calculation basis that separates **market value** (actual €, what you hold/can trade)
from **notional value** (market value × leverage, actual risk exposure), and use the
new basis for (1) the target-allocation comparison and (2) the Versa/Ribilancia
(contribution/rebalance) engine.

## State at session start

Already committed on this branch (before this session):
- `f4d3321` feat(utils): support leveraged ETF exposure calculation
  - `types/assets.ts`: `AssetType` gains `'leveragedEtf'`, `Asset.leverageRatio`,
    `AssetComposition.percentage` can be >100%/<100% for leveraged legs.
  - `lib/utils/assetExposureUtils.ts` (NEW): `expandAssetExposure(asset)` →
    `ExposureComponent[]` with `marketValue` (from `calculateAssetValue`) and
    `notionalValue` (`marketValue * compositionPct/100 * leverageRatio`).
    `calculatePortfolioLeverage(assets)` = Σnotional / Σmarket.
- `625466a` feat(ui): add leveraged ETFs support across the interface
  - `AssetDialog.tsx`: full `leveragedEtf` type support (form field, TYPE_TO_CLASS,
    field visibility, leverageRatio validation `> 1`).
  - `calculateCurrentAllocation` (assetAllocationService.ts) switched to sum
    **notional** value per asset class/subcategory (`comp.notionalValue ?? comp.marketValue`).
  - `snapshotService.ts`: `MonthlySnapshot.portfolioLeverageRatio` computed as
    Σ(notional byAssetClass) / totalNetWorth (market) at snapshot time.
  - Tests added: `assetAllocationService.test.ts`, `compareAllocations.test.ts`,
    updated `assetExposure.test.ts`, `snapshotService.test.ts`.
- `30566d7` add new type for migration to new calculation of asset allocation base
  on notional value — types only: `AllocationBucketMap`, `AllocationBasisSnapshot`,
  `CurrentAllocationSnapshot` (separate `market`/`notional` `AllocationBasisSnapshot`
  + `metadata.{marketValue,notionalValue,leverageRatio,hasLeveragedExposure}`),
  `AllocationBasis = 'market' | 'notional'`.

**Uncommitted (working tree) at session start** — `lib/services/assetAllocationService.ts`:
- `calculateCurrentAllocationSnapshot(assets, assetClasses)`: builds the full
  `CurrentAllocationSnapshot` (market + notional totals/byAssetClass/bySubCategory/
  bySpecificAsset, computed independently and self-consistently — i.e. `market.totalValue`
  sums market legs, `notional.totalValue` sums notional legs).
- `toLegacyAllocationResult(snapshot, basis)`: **INCOMPLETE** — only fills
  `currentValue`/`currentPercentage`; `targetPercentage`/`targetValue`/`difference`/
  `differenceValue`/`action` are hardcoded to 0/`'OK'`. Not wired into `compareAllocations`
  or the allocation page yet. Not used anywhere, not tested.

## Key finding: existing `compareAllocations` mixes bases inconsistently

`compareAllocations` → `calculateCurrentAllocation` today sums **notional** value per
asset class, but the percentage denominator (`current.totalValue`) is
`calculateTotalValue(assets)` — the **market**-value total. Result: `currentPercentage`
per class is notional-numerator / market-denominator, so percentages across classes can
sum to >100% whenever any leveraged position exists (confirmed by the existing
`compareAllocations.test.ts` fixture: VT + 1.5x NTSG → equity 95%, bonds 30%, sums 125%).
This is the exact inconsistency the new `CurrentAllocationSnapshot` type (self-consistent
market OR notional basis, each totalling its own 100%) is meant to replace — this matches
commit 30566d7's message ("migration to new calculation of asset allocation base on
notional value").

## Open design decision (asked user, see chat)

Which basis should drive (a) the target-allocation comparison % and (b) the
Versa/Ribilancia € amounts, now that the two are cleanly separated? Recommended:
self-consistent **notional** basis end-to-end (current%, target%, diff, rebalance/
contribution amounts) — economically correct for risk-exposure targets, and the € gap
closes correctly as long as rebalancing trades happen via unleveraged instruments
(standard assumption — you don't rebalance drift by buying more leveraged product).
`market` basis stays available in the snapshot for display/metadata (e.g. "Leva
portafoglio: 1.2x", real € invested vs notional exposure).

This is a behavior change from the current hybrid (existing `compareAllocations.test.ts`
will need its expectations rewritten to reflect the new coherent notional totals).

## Decisions locked in (user, this session)
1. **Basis**: notional everywhere, self-consistent (current%, target%, diff, Versa/Ribilancia
   all computed on the notional total; percentages always sum to 100% of it). `market` stays
   available in `CurrentAllocationSnapshot` as metadata, not used by the default comparison.
2. **Instrument-aware Versa/Ribilancia**: must NOT assume trades happen via unleveraged
   instruments — reason about the actual holdings (including leveraged/composite ones) and
   try to hit the notional target while keeping the portfolio's leverage close to a
   **user-set target leverage ratio** (new optional Settings field, not derived from current
   holdings). Exposure-target accuracy is always the dominant objective; leverage is a soft
   tie-breaker (weighted low), never traded off against a meaningfully better target fit.
3. **Scope**: leverage-aware instrument selection applies at the ASSET-CLASS level only for
   v1 (sub-category/specific-asset keep the existing simple proportional split, unchanged).
4. **Algorithm**: small constrained optimizer (not a greedy heuristic) — target-gap term
   dominant, leverage term low-weight tie-breaker, box + budget constraints (no shorting
   beyond held market value; Versa has no sells).

## Bug found & fixed: `expandAssetExposure` ignored leverage without explicit `composition`
A single-asset-class leveraged ETF (e.g. a plain 2x S&P500, no "Asset Composto" toggle) hit
the `!asset.composition` branch, which returned `notionalValue: marketValue` — leverage was
silently dropped. Root cause surfaced while discussing NTSG (multi-class leveraged ETF) with
the user: composite leveraged ETFs work correctly (composition % + leverage per leg), but the
single-class case needed the SAME leverage applied to the implicit 100%-of-own-class leg.
Fixed in `lib/utils/assetExposureUtils.ts`: leverage now multiplies the implicit leg too.
Covered by a new test case in `assetExposure.test.ts`.

## Progress log

### Cosa: fix `expandAssetExposure` (leverage on the implicit single-class leg) — Task #1
**Perché**: single-class leveraged ETFs (no `composition`) were silently getting
`notionalValue === marketValue`, i.e. leverage had zero effect on the allocation engine for
the most common leveraged-ETF shape (a plain 2x/3x single-index ETF).
**Nota**: multi-class leveraged ETFs (NTSG-style, `composition` + `leverageRatio`) were
already correct — this only affected the no-`composition` path. Test added:
"expands a single-class leveraged ETF applying leverageRatio without any composition".

### Cosa: `targetLeverageRatio?: number` added to `AssetAllocationSettings` — Task #2
**Perché**: needed as the reference point for the leverage-aware optimizer's soft
tie-breaker term (user chose "explicit target in Settings" over "derive from current
holdings", so the reference is stable and user-controlled, not a moving target that shifts
whenever they buy/sell a leveraged instrument).
**Nota**: 3-place rule applied (types/assets.ts, `getSettings`, both `setSettings` merge
branches). Uses the simple "if defined, write" pattern (same as `stampDutyRate`) — not
user-clearable via a dedicated `deleteField()` path like `defaultDebitCashAssetId`, since
most optional numeric settings in this file follow that simpler convention. Settings UI
field still TODO (Task #5) — service layer only so far.

### Cosa: `compareAllocations` rewired onto `calculateCurrentAllocationSnapshot` +
completed `toLegacyAllocationResult` — Task #3
**Perché**: the previous `compareAllocations` (via `calculateCurrentAllocation`) summed
**notional** value per asset class but divided by the **market**-value total
(`calculateTotalValue`), so current percentages could sum to >100% whenever any leveraged
position existed — an inconsistent hybrid. `toLegacyAllocationResult` existed but was a stub
(target fields hardcoded to 0/'OK'); completed it by porting the full target-comparison logic
(cash fixed-amount handling, ±2pp threshold, sub-category + specific-asset levels) from the
old `compareAllocations`, parameterized by the chosen basis snapshot. `compareAllocations`
now just calls `calculateCurrentAllocationSnapshot(assets, ALL_ASSET_CLASSES)` +
`toLegacyAllocationResult(snapshot, 'notional', targets, assets)`.
**Nota**: this is a real behavior change, not a pure refactor — `totalValue` returned by
`compareAllocations` is now the notional total (was market total before). Target percentages
across classes should now be authored to sum to ~100% of notional exposure (a target like
"80% equity / 45% bonds" from the old hybrid no longer has the same meaning). Rewrote
`compareAllocations.test.ts`'s VT+NTSG fixture accordingly (targets 55/45 instead of 80/45).
The specific-asset level intentionally still uses plain `calculateAssetValue` (market value,
not notional) via `findMatchingAssets` — unchanged from before, since specific-asset targets
are individual non-composite stocks where market≈notional anyway; flagged as an existing
simplification, not something this session changed.
`calculateCurrentAllocation` (older, simpler function) is left untouched — still used as-is
by `snapshotService.ts`, `app/api/portfolio/snapshot/route.ts`, `chartService.ts`,
`MonteCarloTab.tsx`, none of which need the market/notional split.

### Cosa: instrument-aware Versa/Ribilancia optimizer — `lib/utils/leverageAwareAllocationUtils.ts`
(Task #4)
**Perché**: the existing `allocationUtils.ts` engine works at asset-CLASS level only and
implicitly assumes any € recommendation is executed via a plain (1x, single-class)
instrument — wrong once leveraged/composite ETFs are actually held, since buying €1 of one
can move several classes' notional exposure at once, by more than €1 combined. Per the
brainstorm: the new engine must reason over the ACTUAL held instruments (not assume
unleveraged trades) and use `targetLeverageRatio` as a soft tie-breaker, never sacrificing a
materially better exposure fit for a better leverage fit.
**Come**: `buildInstrumentExposures(assets)` turns each holding into an "exposure-per-euro"
vector via `expandAssetExposure`. Given the budget constraint (Σtrade = amount for Versa,
0 for Ribilancia — both fix the post-trade market total), the per-class notional gap AND the
resulting leverage ratio are both AFFINE in the trade vector, so minimizing their squared
error is a convex QP: Σ_class (targetGap)² [weight 1, €²] + `LEVERAGE_TIEBREAKER_WEIGHT`(0.1)
× (leverage gap, euro-scaled to be comparable)², subject to a box (no shorting beyond held
value; Versa never sells) + the budget equality. Solved via projected gradient descent with
monotone backtracking (halve step until objective doesn't increase — always converges for a
convex smooth objective, no eigenvalue/Lipschitz estimate needed) and a bisection projection
onto `{Σx=budget, lo≤x≤hi}` (classic "water-filling" / continuous-knapsack projection).
**Nota — bug caught by the tests, not by review**: first draft of `buildInstrumentExposures`
called `calculateAssetValue(asset)` directly for `marketValue` AND ALSO called
`expandAssetExposure(asset)` (which calls `calculateAssetValue` again internally) — silently
duplicated the computation and broke `mockReturnValueOnce` sequencing in tests (2 calls/asset
instead of 1). Fixed by deriving `marketValue` as the sum of `expandAssetExposure`'s own
component market values instead of a second direct call. Worth remembering: any new code
that both calls `expandAssetExposure(asset)` AND needs the asset's total market value should
derive it from the components, never call `calculateAssetValue` a second time.
**Nota — degenerate single-class test as a clean tie-breaker probe**: when a target has only
ONE asset class, any split of a contribution across instruments touching only that class hits
the notional target exactly regardless of split (target-gap term is identically zero) — this
makes it an easy, hand-verifiable scenario to isolate and test the leverage tie-breaker in
`__tests__/leverageAwareAllocationUtils.test.ts` ("uses the leverage tie-breaker...").
9/9 tests passing. Scope: asset-class level only (decision #3); sub-category/specific-asset
still use the simple proportional engine in `allocationUtils.ts`, unchanged.

### Cosa: wired the optimizer into the Allocation UI + Settings field — Task #5
**Perché**: Task #4's optimizer was a pure module with no caller; this closes the loop the
user asked for ("usare la nuova implementazione ... per il motore di Versa/Ribilancia").
**Come**:
- `assetAllocationService.ts`: exported `ALL_ASSET_CLASSES` (was a private const) for reuse.
- `app/dashboard/allocation/page.tsx`: now keeps `assets` and `settings.targetLeverageRatio`
  in state, and memoizes a `calculateCurrentAllocationSnapshot(assets, ALL_ASSET_CLASSES)`
  (notional + market split) passed down through `ActionPlanner`.
- `ActionPlanner.tsx`: derives `targetPercentageByAssetClass` once (from `byAssetClass`) and
  forwards `assets`/notional+market totals/`targetLeverageRatio` to both panels.
- `RebalancePanel.tsx` / `ContributionPanel.tsx`: each now ALSO calls
  `planInstrumentRebalance`/`planInstrumentContribution` and renders a "Quali strumenti"
  sub-section (ticker + € amount) below the existing class-level (and, for Versa,
  sub-category) numbers.
- `app/dashboard/settings/page.tsx`: added the `targetLeverageRatio` optional number field
  (new "Leva Portafoglio" card, placed after "Costi Portfolio" in the Allocazione tab) —
  state, load, both dirty-baseline snapshot keys (`generalSnapshotKey`/`generalBaselineKey`,
  same group as `stampDutyRate`), and the save payload. Empty input = `undefined` = optimizer
  ignores the leverage term (matches `riskFreeRate`'s existing optional-number UX pattern,
  not the toggle+field pattern used for `stampDutyEnabled/Rate`, since there is no separate
  boolean here — presence of a value IS the "enabled" state).
**Nota — deliberate choice: additive, not a replacement**: the existing class-level (and
sub-category, for Versa) numbers were left in place; the instrument list is a NEW section
underneath, not a replacement of the tested/working class-level UI. Reason: the leverage-aware
engine is asset-class-level only (scope decision #3), so it has nothing to say about
sub-category splits — replacing the whole panel would have silently dropped that depth for
users without leveraged ETFs. The two sections are consistent by construction: the instrument
trades are computed FROM the same class-level target percentages already shown above them.

## Wrap-up
- `npx tsc --noEmit`: clean.
- `npx vitest run`: 991/991 passing across 57 files (includes the rewritten
  `compareAllocations.test.ts`, updated `assetExposure.test.ts`, and the new
  `leverageAwareAllocationUtils.test.ts`).
- `npm run build` (production, Turbopack): compiled successfully, including
  `/dashboard/allocation` and `/dashboard/settings`.
- Not done this session (flagged, not started): no interactive/browser verification (no
  Firebase-authenticated session available in this environment) — the build + full test
  suite are the verification that exists. If picking this back up, sanity-check the
  Allocazione page live with a leveraged-ETF holding before considering this fully shipped.
- Files touched: see `git status` — `types/assets.ts`, `lib/services/assetAllocationService.ts`,
  `lib/utils/assetExposureUtils.ts`, `lib/utils/leverageAwareAllocationUtils.ts` (new),
  `app/dashboard/allocation/page.tsx`, `app/dashboard/settings/page.tsx`,
  `components/allocation/{ActionPlanner,RebalancePanel,ContributionPanel}.tsx`, plus tests.
