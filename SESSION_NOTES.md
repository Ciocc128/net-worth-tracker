# Session Notes — Dead Code Audit, Session 1/6

Spec: `docs/dead-code/01-file-orfani-hook-e-dipendenze.md`
Branch: `chore/dead-code-01-orfani` (base: `chore/dead-code-cleanup`)

## What was done

One conventional commit per section, each preceded by a fresh grep-verify
(`--hidden` for `.storybook`) per the shared protocol in
`docs/dead-code/README.md`, and followed by `npx tsc --noEmit`.

| Commit | Section | Summary |
|--------|---------|---------|
| `fddda4b` | A | Deleted `ExpenseCard.tsx`, `GoalSummaryCards.tsx`, `SuccessRateCard.tsx` (zero importers). Fixed stale checklist comment in `ExpenseTrackingTab.tsx:95` to point at `CompactExpenseRow.tsx` (where the badge/dot-color mapping actually lives now) instead of the deleted `ExpenseCard.tsx`. |
| `0eb78f6` | B | Deleted `useAllExpenses` (exact duplicate of `useExpenses`), `useDelayedLoading` (zero consumers since it was written), `useExpenseStats` (superseded by `/api/dashboard/overview`) + full collateral chain: `getExpenseStats`/`getMonthlyExpenseSummary`/`getExpensesByMonth` in `expenseService.ts`, `ExpenseStats`/`MonthlyExpenseSummary` types, `queryKeys.expenses.stats` + its invalidation call in `app/dashboard/settings/page.tsx`. Reworded the `useAllExpenses` anti-pattern note in `AGENTS.md:463` to keep the principle without naming the deleted symbol. |
| `1b7a45a` | C | Deleted `SettingsPageSkeleton.tsx` (Option A, as recommended — zero importers, orphan by design per its own creation commit, and keeping it around next to a deleted `useDelayedLoading` would reintroduce the flash the hook prevented). Updated `docs/audit-prompts.md` (2 spots) and `docs/critique-prompts.md` (1 spot) that listed it as part of the Settings/skeleton component surface. |
| `ed00705` | D | Deleted `.storybook/mocks/firebase.ts` (never aliased in `.storybook/main.ts`) and `__mocks__/firebase-config.ts` (zero references; Vitest's root auto-mock only applies to `node_modules` package names). Verified with `npm run build-storybook` (succeeded) and the full vitest suite. |
| `6b01b74` | E | Deleted `components/ui/carousel.tsx` (zero importers — not to be confused with the unrelated `CashflowKpiCarousel`) and ran `npm uninstall embla-carousel-react` (its only importer was the deleted file). |
| `d76046f` | F | `npm uninstall @storybook/react baseline-browser-mapping dotenv png-to-ico`. Moved `@types/canvas-confetti` from `dependencies` to `devDependencies` (it was misplaced; only `tsc` consumes it). `npm install` to realign the lockfile. Verified `firebase-tools` binary still resolves (`npx firebase --version`) and `npm run build` still passes. |
| `d4ba6f3` | G | Deleted the 5 unreferenced Next.js starter SVGs in `public/` and 5 unreferenced files in `public/favicon/` (kept only `favicon-48x48.png`, the one actually used by login/register pages). Confirmed no web manifest exists anywhere in the repo (`Glob **/*manifest*` → only `node_modules`/`.next` internals). Fixed the collateral 404 bug in `app/layout.tsx:53-58`: the `icons.icon` array referenced `/favicon-16x16.png` and `/favicon-32x32.png` at the site root, but those files only ever lived under `/favicon/` — removed the two dead entries and kept the App Router icon conventions (`favicon.ico`, `icon.svg`, `apple-icon.png`). |

## Validation

- `npx tsc --noEmit`: clean after every section and at the end.
- `npx vitest run`: **79 files / 1406 tests**, unchanged from the documented
  baseline in `CLAUDE.md` (no test coverage was tied to any of the deleted
  code).
- `npm run build`: succeeds, same route manifest as before.
- `npm run build-storybook`: succeeds (Section D check).
- `npx knip`: none of this session's deletions still appear. Remaining knip
  output (`PDFChart.tsx`/`PDFSection.tsx`, `firebase-tools`, `@react-pdf/types`,
  `public/sw.js`, the long unused-exports list) belongs to spec 02/03/04 or the
  shared whitelist — out of scope here, left untouched.

## Not done in this session (by design)

- No browser smoke test was run (no dev server available in this
  environment). Risk is low: every deletion in this spec is a static
  import-graph removal covered by `tsc` + the full test suite + a successful
  production build; the one behavior-adjacent change (favicon `<link>` fix in
  Section G) is a pure link-tag correction with no logic involved.
- No refactors beyond what the spec specifies — no opportunistic cleanup.

## Next

Per `docs/dead-code/README.md`, the next session is spec 02 (`chore/dead-code-02-*`,
medium risk / Sonnet 5 / high effort), which should branch from `main` (or from
this branch once merged) rather than stack on top of this one.
