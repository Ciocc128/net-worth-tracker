# Cashflow — meccanica delle spese condivisa

> **Quando aprire questa guida** — questa guida copre le regole comuni a tutte le tab
> Cashflow (Tracciamento, Analisi, Budget, Dividendi, Divisione) e ai Centri di Costo — segno,
> ricorrenze, import, raggruppamento, drill-down, Sankey. Aprila quando tocchi
> `lib/utils/{expenseGrouping,expenseTypeTransition,recurrenceDates,expenseImport,cashflowSankey}.ts`,
> `lib/services/expenseImportService.ts`, `handleEntitySelect` in `AnalisiTab.tsx` o i loro
> consumatori. In `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa.
> Moduli e file: § *Files*, sotto.

## Files

Moved here from `CLAUDE.md` → *Key Files* on 2026-09-19.

- **Cashflow services**: services `lib/services/{budgetService,costCenterService,cashBalanceReconciliation,expenseImportService}.ts`, `lib/utils/expenseImport.ts`; the settlement rule `lib/utils/cashSettlement.ts` (pure) + `lib/server/cashSettlement.ts` (the server half, run by `/api/portfolio/snapshot`), «Collega la serie» in `components/expenses/LinkSeriesDialog.tsx`

## Expense Grouping: key by id, label by name (`lib/utils/expenseGrouping.ts`)
- **Category names are NOT unique and never will be** — the product deliberately allows "Casa" as both a *Spese Fisse*
  and a *Spese Variabili* category, so anything keyed on `categoryName` merges them.
- **The one rule: group by `getCategoryKey`/`getSubCategoryKey`, display via `resolveDisplayLabels`.** `getCategoryKey` =
  `categoryId || trimmed name || UNCATEGORIZED_LABEL`; `getSubCategoryKey` maps missing/blank to `NO_SUBCATEGORY_KEY`, a
  key like any other — which is what lets callers drop their `=== 'Altro'` special cases.
- **`resolveDisplayLabels` qualifies ONLY where the rendered surface actually collides**: ambiguity is measured over the
  set of KEYS per name, not a row count. `selectExpensesForDrillDown` matches the type **EXACTLY** — `type !== 'income'` would lump
  fixed+variable+debt together and let transfers through.

## Expense Sign Convention and Type Changes
- Income positive, expenses negative, net savings = `sum(income) + sum(expenses)`; crossing the boundary flips the sign.
- **Classification is ALWAYS by `type`, never by the sign of `amount`** (`transfer` skipped, `income` income, everything
  else spending via `Math.abs`) — by sign, a refund counts as income. Fixtures must carry an explicit `type`.
- **`ExpenseDialog` type change is shape-aware across all five types**: `editBalanceEffects` (lib/utils/cashSettlement.ts)
  gives back the OLD shape's applied effect and applies the new one, both legs of a transfer included, in one transaction.
  `updateExpense` re-derives the sign from the incoming type and nulls `transferCashAssetId` when it leaves transfer.
  **That control lives in EDIT mode only** — creation picks the type in step 1 (AGENTS.md § Two-Step Create Dialogs), so the
  reconciliation paths above are reachable exclusively from a saved row.
- **A transfer IS its two accounts** (2026-09-13): `expenseSchema`'s last `superRefine` refuses a `transfer` without
  origin and destination or with the same account twice, with the error under each Select (the `__none__` sentinel
  counts as empty); the two labels carried an asterisk the schema did not honour, so a transfer saved without accounts
  moved no money and said nothing. Without any cash account the dialog says so in place of the pickers.
- **A linked row moves its account ON ITS OWN DATE** (2026-09-19, `lib/utils/cashSettlement.ts`). Until then a series
  moved its account ONCE, for its first row, the day it was saved, and the other occurrences never — a mortgage entered
  in January for the whole year left the account eleven instalments too high by December — and a single row dated in
  the future moved the account the day it was typed. Now: the expense form creates through `createExpenseSettledOnDate`,
  which puts the account on EVERY occurrence and writes the ones dated after today (Italian day, `settlesLater`)
  `balancePending: true`; the rows already happened (a series started in the past included) move the account at save,
  in ONE transaction (`applyBalanceEffects`), with the sign of their type. `settleDueBalances`
  (`lib/server/cashSettlement.ts`) settles the rest on their day and deletes the flag; it runs at the top of
  `/api/portfolio/snapshot`, so the daily cron and «Crea snapshot» photograph the balances AFTER the day's instalments,
  whichever of the two `0 18 * * *` crons runs first. Idempotent: each row is re-read in the transaction and settled only
  while still pending. **The flag's ABSENCE means applied**, so every row written before the rule (it moved its account at
  save) needs no migration and is never applied twice. An edit is ONE set of effects (`editBalanceEffects`: the old row's
  APPLIED effect given back, the new one applied unless its new date is still to come) — it replaced the four
  `reconcile*Edit` functions; every delete, a single row or a whole series, gives back only what was applied
  (`reverseAppliedBalances`). `createExpense` keeps the old contract (first row only, nothing pending) for the caller
  that settles its own transfer — a voluntary pension contribution. Pinned by `__tests__/cashSettlement.test.ts`,
  `__tests__/cashBalanceReconciliation.test.ts` and `e2e/cashflow.accounts.spec.ts` (every row linked, today's debited
  at save, the next one waiting).
- **The rule in one breath** (the stub's wording, moved here from `AGENTS.md` on 2026-09-20): every occurrence carries
  `linkedCashAssetId` and moves the account ON ITS OWN DATE (`lib/utils/cashSettlement.ts`, 2026-09-19): a row after
  today is `balancePending` until `settleDueBalances` runs in `/api/portfolio/snapshot`; a flag ABSENT means applied
  (older rows moved at save); edits and deletes move only what was applied. A `transfer` IS its two accounts: the schema
  refuses one without origin and destination, or with the same account twice (`e2e/cashflow.accounts.spec.ts`).
- **«Collega la serie a un conto»** (`LinkSeriesDialog`, from a series row's detail on the feed): a series written before
  the rule carries its account on the first row only; `linkSeriesToCashAccount` puts the chosen account on the
  occurrences still to come that have not moved one (`selectLinkableOccurrences`) and leaves them pending. The past is
  never touched — its effect is in today's balance — and an occurrence linked AND applied is never re-pointed.
- **The BATCH paths refuse to cross the transfer boundary** (`crossesTransferBoundary`): `updateExpensesType`,
  `moveExpensesToCategory`, `moveExpensesFromSubCategory` throw `TransferBoundaryError` when expenses exist, since each
  row would need its own destination account.
- Changing the type always invalidates the category (categories are type-scoped) — `resolveEquivalentCategory` re-points
  to the same-named one under the new type.

## Recurring Series (`lib/utils/recurrenceDates.ts`)
- **A recurring expense is not a rule, it is N documents.** `createRecurringExpenses` materialises the whole series as
  real future-dated rows sharing a `recurringParentId`, which is why Cashflow, Analisi, Budget and the assistant know
  nothing about recurrence — and why the form states how many rows it is about to write, and over which span.
- **`canTypeRecur` is the single source on which types may recur** (`fixed`/`variable`/`debt`). `income` is a product
  decision; **`transfer` is structural** — the settlement would handle its two legs per occurrence
  (`balanceEffectsOf`), but the form, the series writers and `createRecurringExpenses`' negative sign were never widened
  to it; a monthly card payment is one transfer a month, typed on the day. Widening the set
  also breaks `createRecurringExpenses`' unconditional `-Math.abs(amount)`.
- **Both ceilings in `MAX_RECURRENCE_OCCURRENCES` (360 monthly / 40 yearly) exist to stay under 500**: the series is
  created in ONE `writeBatch` and `deleteRecurringExpenses` removes it in one too. Raising either past 500 means
  chunking both.
- **`new Date(y, m, 31)` rolls February forward into March** — the clamp must cap the day against the real length of
  the TARGET month before constructing the Date, never fix up an already-overflowed one.
- **An absent `recurringFrequency` means monthly, never unknown** (rows predate the cadence): read it through
  `resolveRecurrenceFrequency`. A yearly series' MONTH is not stored — it is the month of the row's own date, which
  every occurrence shares by construction, and `describeRecurrence` is the only place that turns that into words.
- **`recurringCount` is form-only and must never reach Firestore**: `updateExpense` spreads whatever it is handed, so
  the edit path passes it as `undefined` explicitly. The toggle itself is **creation-only** — the length of a saved
  series is not editable from one of its rows.

## Expense CSV Import (`lib/utils/expenseImport.ts`, `lib/services/expenseImportService.ts`)
- Impostazioni → Spese. A pure parse → validate → plan layer with a MANDATORY preview before any write; every row of
  one import shares an `importBatchId`, which is what the one-tap undo deletes by. Category identity is **(name,
  type)**, never the name alone. `transfer` rows are rejected and cash balances are never touched by an import.

## Cashflow Drill-Down: One Landing Path
- **There is ONE drill destination and ONE transaction list**: every entity entry point on Analisi (a category row, a
  Fuori scala row, a Spese maggiori row, a Sankey node, `EntitySearch`, a Confronto row) lands through
  `handleEntitySelect` in `AnalisiTab.tsx`, which resolves labels exactly like a URL-restored focus and opens the
  Scheda tile. A new entry point calls that handler only.

## Sankey: node identity is the node id (`lib/utils/cashflowSankey.ts`)
- **d3-sankey resolves link endpoints through a `Map` of ids**, so a duplicate id keeps the LAST node and orphans the
  earlier one as a zero-value ghost. Ids are built from **ids**, never display names.
- **The type belongs inside the category id** (`cat:{tipo}:{chiave}`), because without that prefix an income and an
  expense category of the same name close a cycle through Budget and `computeNodeDepths` throws `"circular link"`,
  blanking the chart. **Ids are opaque**: `index` is the only sanctioned way to ask what a node is.

## Ruoli 50/30/20: Necessità · Desideri · Risparmi (`lib/utils/spendingRoles.ts`)
- **Opt-in** (`settings.spendingRolesEnabled`, Impostazioni › Preferenze › Cashflow, the five write places) and meant
  for Analisi's Sankey only: category icons stay neutral and there is no 50/30/20 tile. Session A (2026-09-15) shipped
  the field, the dialog and the pure layer; session B the Flusso view, its reading and the role tokens
  (doc/guide/cashflow-analisi.md, doc/guide/temi.md).
- **The role lives on the category, never on the row**: `ExpenseCategory.spendingRole`, with an optional per-subcategory
  override (`ExpenseSubCategory.spendingRole`, WiFi = need inside a want-classified Abbonamenti). Rows carry
  `categoryId`, so a reclassification is retroactive on every period with no bulk update. **`resolveSpendingRole` is the
  ONE resolution**: override → category → `null` («Da classificare»); a missing category and a non-spending one (income,
  transfer — a role left behind by a type change) are `null` too.
- **Risparmi is not a category total**: `summarizeSpendingRoles` gives savings = saving-classified rows + the period's
  surplus. When spending exceeds income the surplus is 0 and the gap becomes `deficit`, drawn on the income side as
  «Coperto dal patrimonio» — a Sankey has no negative width. Invariant, tested: `income + deficit = need + want +
  unclassified + saving + surplus`. Amounts are absolute, the row's own type decides income vs spending, transfers skip.
- **Clearing a role must delete the field**: «Da classificare» is the absence of `spendingRole`, and
  `removeUndefinedDeep` would drop the key and keep the old role. `updateCategory` writes `deleteField()` when the key is
  present with `undefined`; the key absent means "not edited". **The dialog writes the role only when it showed it**
  (setting on), so a category saved with the setting off keeps its classification; a category moved to income or
  transfer sheds its roles.
- **The legacy «Fondo Pensione» expense category is empty** on the owner's account (mirror, 2026-09-15: zero rows on
  both the variable and the income category; Previdenza's contributions are transfers) — no double count to clean.

## Per-page blind spots

- **A row that comes due moves its account in the evening, not at midnight** (2026-09-19): the settlement runs with the snapshot at 18:00 UTC (20:00 in Italy), so until then Patrimonio shows the balance without the day's instalment while Tracciamento already counts it as happened. A row entered TODAY with a past or today's date moves the account at save — including a series started in the past: if the balance typed from the bank already reflects those rows, leave the account empty or they are debited twice. A credit card is a cash account allowed below zero (doc/guide/patrimonio.md); its monthly payment is one transfer typed on the day, since a transfer cannot recur.
- **A running year is the WHOLE calendar year on Tracciamento and Analisi**, so its figures include what is only scheduled; each verdict declares it with amount and horizon, each such row is chipped «In calendario» and drops its sign colour. **«Da inizio anno» (YTD) is the other window** (`Period.kind = 'ytd'`, Analisi's fourth `PeriodMode`): it runs to the END of today's month, not to today, so it carries scheduled rows too. **On «Anno corrente» the delta compares twelve months against twelve** (`resolveComparisonScope` → `fullYear`), biased downward as the year runs; YTD keeps `sameMonths`, and Tracciamento's verdict and a category's Scheda still say «stessi mesi». Not extended to Panoramica, Storico, Budget or Centri di Costo. DESIGN → *The Scheduled-Is-Not-Spent Rule*. (moved from `CLAUDE.md` → Known Issues on 2026-09-19)
