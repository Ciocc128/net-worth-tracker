# Session Notes — Dead-code audit, sessione 4/6

Branch: `chore/dead-code-04-utils-types`
Spec: `docs/dead-code/04-export-morti-utils-types-e-policy-ui.md`

## Riepilogo

- **Cosa**: applicata la spec 04 dell'audit codice morto — codificata la
  policy shadcn/ui (cancella solo le aggiunte custom di questo repo, la
  superficie standard del template resta anche se knip la flagga),
  cancellati export morti e de-esportati simboli usati solo internamente in
  `lib/utils`, `lib/constants` e `types/*`, rimossi due match block morti in
  `firestore.rules` (`/price-history`, `/portfolios`), aggiunto `knip.json`
  alla root per i futuri audit.
- **Perché**: chiudere il debito di codice morto rimasto dai redesign di
  Rendimenti/Allocazione e dalla feature price-history già rimossa, e
  stabilire una policy scritta e uniforme per `components/ui/**` (due batch
  precedenti dell'audit avevano dato raccomandazioni incoerenti su cosa
  fare della superficie shadcn non importata).
- **Nota**: nessuna logica applicativa toccata — solo cancellazioni a zero
  riferimenti e rimozione di `export`, protette da `tsc` dopo ogni sezione.
  Lo schema di `BenchmarkCacheDoc` è stato preservato come commento presso
  lo scrittore Admin SDK prima di cancellare il tipo. Il deploy di
  `firestore.rules` resta uno step manuale post-merge (vedi sotto).
  Verificati manualmente post-implementazione: avatar/AlertDialog/empty
  state Hall of Fame invariati; il comportamento "cachedAt non aggiornato
  per tutti i benchmark" e "Nessun dato disponibile" su Hall of Fame sono
  preesistenti (TTL cache 7gg e assenza di anni in calo, rispettivamente),
  non regressioni di questa sessione.

## Piano

- [x] A. Policy shadcn/ui: cancella `AlertDialogMedia`, `AvatarBadge`/`AvatarGroup`/`AvatarGroupCount`, `TrophyEmptyIcon`
- [x] B. lib/utils + lib/constants: cancella + de-esporta
- [x] C. types/: cancella + de-esporta + firestore.rules match block morti
- [x] D. knip.json

## Log

### A. Policy shadcn/ui (`c239e56`)
Re-verificati con grep tutti e tre i simboli prima della cancellazione (zero
riferimenti fuori da `components/ui/*` stesso). Cancellati:
- `AlertDialogMedia` (`alert-dialog.tsx`) — la classe CSS in `AlertDialogTitle`
  che referenzia `data-slot=alert-dialog-media` è superficie standard shadcn,
  lasciata invariata (selettore innocuo anche senza consumer).
- `AvatarBadge`, `AvatarGroup`, `AvatarGroupCount` (`avatar.tsx`)
- `TrophyEmptyIcon` (`empty-state.tsx`)

Superficie standard shadcn (`AlertDialogTrigger/Overlay/Portal`, `AvatarImage`,
`sidebar.tsx`, ecc.) NON toccata, come da policy.

### B. lib/utils + lib/constants (`6ea24ce`)
Re-verificati con grep tutti i simboli. Cancellati:
- `motionVariants.ts`: `sectionRefreshPulse`, `drillDownShell`,
  `contextualSheetPanel`, `contextualDialogSurface`
- `period.ts`: righe 25-26 (re-export morto di `MONTH_NAMES`)

De-esportati (13 simboli/costanti, codice invariato): `budgetUtils.ts`
(`MIN_FORECAST_DAYS`), `costCenterUtils.ts` (`MAX_COMPOSITION_CATEGORIES`,
`MAX_COMPARISON_CENTERS`), `expenseImport.ts` (`TEMPLATE_HEADERS`),
`goalTrajectory.ts` (`GOAL_PRIORITY_WEIGHTS`), `leverageAwareAllocationUtils.ts`
(`LEVERAGE_TIEBREAKER_WEIGHT`), `pensionDeduction.ts` (6 costanti),
`lib/constants/colors.ts` (`ASSET_CLASS_COLORS`), `types/assetTransactions.ts`
(`LEDGER_ASSET_TYPES`), più i tipi `CategorySeries`, `FundFamilyMemberGroup`,
`ContributionsByNature`, `PerformanceTone`, `YieldOnCostAssetMetrics`.

**Nota fuori perimetro (segnalata, non toccata)**: `GOAL_PRIORITY_WEIGHTS` in
`lib/utils/goalTrajectory.ts` ha una copia privata duplicata in
`lib/services/goalService.ts:246`. Consolidamento = Rule of Three, non
codice morto — da valutare in una sessione futura, non in questo audit.

### C. types/ + firestore.rules (`d4001e9`)
Re-verificati con grep tutti i simboli. Cancellati:
- `types/assets.ts`: `PriceHistory`
- `types/assistant.ts`: `AssistantWebContextMode`, `AssistantMonthContext`
  (forma legacy superseded da `AssistantMonthContextBundle`)
- `types/benchmarks.ts`: `BenchmarkCacheDoc` — schema del documento
  `benchmark-cache/{benchmarkId}` spostato in un commento presso lo
  scrittore Admin SDK (`app/api/benchmarks/returns/route.ts`, vicino a
  `cacheRef.set(...)`) PRIMA della cancellazione, così la forma del doc
  resta documentata in-repo. Con lui è morto anche l'import `Timestamp`
  da `firebase-admin/firestore` in `types/benchmarks.ts` (unico uso).
- `types/budget.ts`: `BudgetViewMode`
- `types/costCenters.ts`: `CostCenterStats`, `CostCenterMonthlyData`,
  `CostCenterColor`
- `firestore.rules`: match block morti `/price-history` e `/portfolios`
  (collezioni mai scritte da nessun percorso di codice, leftover della
  feature price-history già rimossa)

De-esportati: `SubCategoryConfig`, `PortfolioSource`, `WithdrawalAdjustment`,
`SimulationPath` (`types/assets.ts`); `BenchmarkComponent`
(`types/benchmarks.ts`); `BudgetScope`, `BudgetAlertLevel` (`types/budget.ts`);
`CostCenterComparisonBucket` (`types/costCenters.ts`);
`DashboardOverviewVariation` (`types/dashboardOverview.ts`); `ExposureSource`
(`types/exposure.ts`); `WhatIfCoastBaseline` (`types/whatIf.ts`).

Nessuno dei simboli de-esportati è risultato non-referenziato nel proprio
file dopo il de-export (nessuna promozione a CANCELLA necessaria).

### D. knip.json (`601cf06`)
Creato alla root con `ignore: ["components/ui/**", "public/sw.js"]`,
`ignoreDependencies: ["firebase-tools"]`, `ignoreExportsUsedInFile: true`.

## Validazione finale

- `npx tsc --noEmit`: pulito dopo ogni sezione (A, B, C, D)
- Suite d'area (`budgetUtils`, `allocationUtils`, `pensionDeduction`,
  `pensionContributions`, `pensionFamilyMembers`, `performanceSummary`,
  `cashFlowMap`): **215/215 test verdi**
- `npx vitest run` completa: **80 file / 1409 test verdi**
- `npm run build`: completato con successo (50 pagine generate, TS pulito)
- `npx knip`: output pulito rispetto ai finding di questa spec. Residuano
  3 unused export **non di competenza di questa sessione**:
  - `useColorTheme` (`.storybook/mocks/ColorThemeContext.tsx`) — falso
    positivo noto (whitelist README: consumato via alias `viteFinal`)
  - `useCreateAssistantThread` (`lib/hooks/useAssistantThreads.ts`)
  - `buildAssistantQuarterContext` (`lib/services/assistantMonthContextService.ts`)

  Questi ultimi due non compaiono nella spec 04 — probabile codice aggiunto
  dopo l'audit del 2026-07-28 o competenza di un'altra spec. Da verificare
  in una sessione successiva, NON toccati qui (niente refactor opportunistici
  fuori spec).

## Step manuale post-merge (⚠️ da fare a mano)

**Deploy `firestore.rules`**: le regole sono state modificate (rimossi i
match block `/price-history` e `/portfolios`). Le regole restano inerti
finché non deployate:

```
firebase deploy --only firestore:rules
```
