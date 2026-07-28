# Spec 04 — Export morti: lib/utils, lib/constants, types/ + policy components/ui

**Rischio: basso** — de-export e piccole cancellazioni tsc-guardate, più UNA
decisione di policy (shadcn) da applicare in modo uniforme e da codificare in una
config knip perché i futuri audit non ripropongano lo stesso rumore.

Prerequisito: spec 02 già applicata (`types/pdf.ts` e `chartCapture` sono di sua
competenza — qui NON vanno toccati). Leggi `docs/dead-code/README.md`.

## A. Policy shadcn/ui (decisione, poi applicazione uniforme)

L'audit ha trovato ~546 LOC di superficie shadcn standard mai importata
(`DialogTrigger`, `SelectGroup`, la famiglia `sidebar.tsx`, ecc.). Due batch
dell'audit hanno dato raccomandazioni incoerenti (tieni i tipi, cancella i
componenti). **Policy adottata — applicala a tutto `components/ui/`:**

> **I file shadcn sono codice vendored: la superficie standard generata dal
> template resta com'è** (anche se non importata — è l'API della libreria e
> verrebbe ripristinata dal prossimo `npx shadcn add`). **Si cancellano solo le
> aggiunte custom di questo repo** a zero riferimenti.

**CANCELLA (aggiunte custom, zero riferimenti):**

| File | Simbolo (riga) | LOC | Nota |
|------|----------------|-----|------|
| `components/ui/alert-dialog.tsx` | `AlertDialogMedia` (131) | ~15 | Estensione "media" del template, non superficie classica |
| `components/ui/avatar.tsx` | `AvatarBadge` (57), `AvatarGroup` (73), `AvatarGroupCount` (86) | ~42 | Aggiunte extended-template; `Avatar`/`AvatarFallback` vivi (Sidebar, SecondaryMenuDrawer); `AvatarImage` è superficie standard → resta |
| `components/ui/empty-state.tsx` | `TrophyEmptyIcon` (149-174) | ~26 | Modulo interamente custom; gli altri 4 empty-icon + `EmptyState` vivi in 12 file. Se in sessione si preferisce cablarlo nell'empty state di Hall of Fame anziché cancellarlo, è una scelta legittima — ma non lasciarlo orfano |

**KEEP (superficie standard shadcn — NON toccare, anche se knip la flagga):**
`AlertDialogTrigger/Overlay/Portal`, `AvatarImage`, `badgeVariants` + `BadgeProps`,
`CardFooter`/`CardAction`, `CommandDialog`/`CommandShortcut`, `DialogClose/Trigger/
Overlay/Portal`, `DrawerOverlay/Portal`, l'intera famiglia flaggata di
`dropdown-menu.tsx` (8 simboli), `SelectGroup/Label/ScrollUpButton/ScrollDownButton`,
`SheetClose/Footer`, i 10 simboli di `sidebar.tsx`, `TableCaption`,
`CalendarProps`, `TextareaProps`.

**KEEP (prop-surface pubblica di componenti custom — API naturale per consumer
futuri tipizzati):** `AnimationConfig` (`multi-select.tsx:43`),
`SegmentedControlOption` (`segmented-control.tsx:4`), `SegmentedPillOption`
(`segmented-pill.tsx:22` — primitiva citata in CLAUDE.md), `PlanDirection`
(`components/allocation/PlanRow.tsx:21`).

## B. lib/utils + lib/constants

**CANCELLA:**

| File | Simbolo (riga) | LOC | Nota |
|------|----------------|-----|------|
| `lib/utils/motionVariants.ts` | `sectionRefreshPulse` (204) | ~12 | Orfanato dalla rimozione delle tabelle price-history + redesign Rendimenti (`42e2722`) |
| `lib/utils/motionVariants.ts` | `drillDownShell` (281), `contextualSheetPanel` (299), `contextualDialogSurface` (322) | ~62 | Orfanati dal redesign Allocazione (consumer rimossi a `36f08ae^`) |
| `lib/utils/period.ts` | righe 25-26: re-export `MONTH_NAMES` | 2 | ⚠️ Knip lo classificava EXPORT_ONLY ma è un puro re-export da `lib/constants/months.ts:3`: l'unica fix possibile è cancellare le righe. Il modulo e `months.ts` restano vivi |

**DE-ESPORTA (togli `export`, il codice resta):**

- `lib/utils/budgetUtils.ts`: `MIN_FORECAST_DAYS` (395) — il test la cita solo in
  un commento (`budgetUtils.test.ts:449`), non la importa
- `lib/utils/costCenterUtils.ts`: `MAX_COMPOSITION_CATEGORIES` (43),
  `MAX_COMPARISON_CENTERS` (46)
- `lib/utils/expenseImport.ts`: `TEMPLATE_HEADERS` (55)
- `lib/utils/goalTrajectory.ts`: `GOAL_PRIORITY_WEIGHTS` (46) — nota (fuori
  perimetro, solo da segnalare in SESSION_NOTES): `goalService.ts:246` ne tiene
  una copia privata duplicata; consolidamento = Rule of Three, non codice morto
- `lib/utils/leverageAwareAllocationUtils.ts`: `LEVERAGE_TIEBREAKER_WEIGHT` (57)
- `lib/utils/pensionDeduction.ts`: `PENSION_ACCRUAL_YEARS` (31),
  `PENSION_USAGE_YEARS` (33), `PENSION_BENEFIT_TAX_RATE_MAX` (174),
  `PENSION_BENEFIT_TAX_RATE_MIN` (175), `PENSION_BENEFIT_TAX_DECREASE_AFTER_YEAR`
  (177), `PENSION_BENEFIT_TAX_DECREASE_PER_YEAR` (178)
- `lib/constants/colors.ts`: `ASSET_CLASS_COLORS` (4)
- `types/assetTransactions.ts`: `LEDGER_ASSET_TYPES` (17) — i test importano
  `isLedgerAssetType`, non la costante
- Tipi utils: `CategorySeries` (`cashflowTimeSeries.ts:44`),
  `FundFamilyMemberGroup` (`pensionFamilyMembers.ts:16`), `ContributionsByNature`
  (`pensionReturn.ts:59`), `PerformanceTone` (`performanceSummary.ts:30`),
  `YieldOnCostAssetMetrics` (`yieldOnCost.ts:54`)

## C. types/ (simbolo per simbolo)

**CANCELLA (zero riferimenti ovunque):**

| File | Simbolo (riga) | Collaterali |
|------|----------------|-------------|
| `types/assets.ts` | `PriceHistory` (408) | **Cancella anche i match block morti in `firestore.rules`: `/price-history` e `/portfolios`** (collection mai toccate dal codice — leftover della feature price-history rimossa, cfr. AGENTS.md:739). Richiede deploy delle rules: `firebase deploy --only firestore:rules` (o annota il deploy come step manuale post-merge) |
| `types/assistant.ts` | `AssistantWebContextMode` (10), `AssistantMonthContext` (35, ~23 LOC) | `AssistantMonthContext` è la forma legacy superseded da `AssistantMonthContextBundle` (viva). Il warning comment alle righe 1-7 riguarda `AssistantMode`, non questa interfaccia: resta |
| `types/benchmarks.ts` | `BenchmarkCacheDoc` (32, ~9 LOC) | Con lui muore l'import `Timestamp` da `firebase-admin/firestore` (riga 1, unico uso). ⚠️ Era l'unica documentazione in-repo dello schema del documento `benchmark-cache/{benchmarkId}`: sposta la forma in un commento accanto allo scrittore admin (`lib/server/` benchmark writer) prima di cancellare |
| `types/budget.ts` | `BudgetViewMode` (62) | |
| `types/costCenters.ts` | `CostCenterStats` (122), `CostCenterMonthlyData` (131), `CostCenterColor` (152) | |
| `lib/hooks/usePeriodPicker.ts` | — | Già coperto in spec 03 (righe 193-194) |

**DE-ESPORTA:** `SubCategoryConfig` (`types/assets.ts:189`), `PortfolioSource`
(416), `WithdrawalAdjustment` (417), `SimulationPath` (451); `BenchmarkComponent`
(`types/benchmarks.ts:3`); `BudgetScope` (`types/budget.ts:17`),
`BudgetAlertLevel` (124); `CostCenterComparisonBucket` (`types/costCenters.ts:109`);
`DashboardOverviewVariation` (`types/dashboardOverview.ts:9`); `ExposureSource`
(`types/exposure.ts:4`); `WhatIfCoastBaseline` (`types/whatIf.ts:48`).

Nota sui file types/: se dopo un de-export il simbolo risulta non referenziato
NEMMENO nel proprio file, promuovilo a CANCELLA (il de-export era il verdetto
minimo garantito dall'audit).

## D. Config knip (chiude il cerchio per i futuri audit)

Crea `knip.json` alla root:

```json
{
  "$schema": "https://unpkg.com/knip@latest/schema.json",
  "ignore": ["components/ui/**", "public/sw.js"],
  "ignoreDependencies": ["firebase-tools"],
  "ignoreExportsUsedInFile": true
}
```

Razionale (mettilo in un commento di commit, knip.json non supporta commenti):
`components/ui/**` = policy shadcn vendored (sez. A); `public/sw.js` = vivo per
convenzione URL; `firebase-tools` = binario shellato da `scripts/emulators.mjs`;
`ignoreExportsUsedInFile` = dopo questa spec i soli EXPORT_ONLY rimasti sono
prop-surface deliberate. Esegui `npx knip` e verifica che l'output sia pulito
(o riporti solo residui delle spec non ancora applicate).

## Validazione finale

1. `npx tsc --noEmit` dopo ogni sezione
2. Suite d'area: `budgetUtils`, `allocationUtils`, `pensionDeduction` +
   `pensionContributions` + `pensionFamilyMembers`, `performanceSummary`,
   `cashFlowMap`; poi `npx vitest run` completa
3. `npm run build`
4. `npx knip` con la nuova config: output atteso pulito
5. Step manuale post-merge da annotare: deploy `firestore.rules`

## Prompt per la sessione di implementazione

```
Implementa la spec docs/dead-code/04-export-morti-utils-types-e-policy-ui.md
(audit codice morto, sessione 4 di 6; richiede la 02 già mergiata). Applica la
policy shadcn della sez. A ESATTAMENTE come scritta (cancella solo le aggiunte
custom elencate; la superficie standard resta anche se knip la flagga), poi le
tabelle CANCELLA/DE-ESPORTA di utils, constants e types, i match block morti di
firestore.rules (/price-history, /portfolios) e la config knip.json della sez. D.

Regole:
- Per ogni simbolo: grep di ri-verifica PRIMA dell'edit (protocollo in
  docs/dead-code/README.md); righe = àncore, non verità
- BenchmarkCacheDoc: prima sposta lo schema documentale in un commento presso lo
  scrittore admin, poi cancella
- NON toccare types/pdf.ts né chartCapture (spec 02)
- npx tsc --noEmit dopo ogni sezione; un commit per sezione; branch
  chore/dead-code-04-utils-types
- Alla fine: suite d'area della spec, vitest completa, npm run build, npx knip
- Annota in SESSION_NOTES lo step manuale: deploy firestore.rules

Contesto:
- Leggi docs/dead-code/README.md (protocollo condiviso e whitelist)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice

Crea SESSION_NOTES.md per tracciare il lavoro.
```

**Modello consigliato: Sonnet 5 · Effort: medium.** Azioni piccole e uniformi;
l'unico punto di giudizio (policy shadcn) è già deciso nella spec.
