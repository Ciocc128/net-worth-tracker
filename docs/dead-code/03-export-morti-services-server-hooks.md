# Spec 03 — Export morti: lib/services, lib/server, lib/hooks, lib/firebase

**Rischio: medio** — volume alto ma azioni binarie: **CANCELLA** (simbolo a zero
riferimenti ovunque, test inclusi) o **DE-ESPORTA** (simbolo usato SOLO nel suo
file: togli `export`, il codice resta). Ogni cancellazione è protetta da tsc.
Nessun calcolo cambia: **NON bumpare `CACHE_MATH_VERSION`**.

Prerequisito: spec 01 già applicata (la catena `expenseStats` in
`expenseService.ts` è già stata rimossa lì). Leggi `docs/dead-code/README.md`.

Convenzione righe: numeri rilevati il 2026-07-28 — trattali come àncore, ritrova
sempre il simbolo con grep prima di editare.

## A. lib/services — CANCELLA

| File | Simbolo (riga) | LOC | Collaterali / note |
|------|----------------|-----|--------------------|
| `assetAllocationService.ts` | `setTargets` (459) | ~9 | Fix anche il commento stale alle righe ~598-599 che afferma che la pagina consuma `calculateCurrentAllocationSnapshot` (falso) |
| `assetService.ts` | `getAssetsWithIsin` (94) | ~41 | **Orfana l'indice composito Firestore `assets(userId ASC, isin ASC)`** → rimuovi la voce da `firestore.indexes.json` nello stesso commit |
| `assetService.ts` | `updateAssetPrice` (391) | ~31 | Dopo le tre rimozioni, verifica che `invalidateDashboardOverviewSummary`/`getErrorMessage` restino usati dai sopravvissuti (lo sono) e pota gli import rimasti orfani |
| `assetService.ts` | `calculateGrossTotal` (834) | ~7 | |
| `expenseCategoryService.ts` | `getCategoriesByType` (95) | ~32 | AGENTS.md:812 nota che le mancava l'indice: nessun indice da rimuovere |
| `expenseCategoryService.ts` | `addSubCategory` (234) | ~34 | ⚠️ Omonimo di `addSubCategory` in `assetAllocationService` (vivo): grep con path, non solo per nome |
| `expenseCategoryService.ts` | `removeSubCategory` (269) | ~25 | |
| `expenseCategoryService.ts` | `updateSubCategory` (296) | ~40 | **Catena**: il suo unico callee `updateExpensesSubCategoryName` (`expenseService.ts:824`, ~30 LOC, unico call site era `expenseCategoryService.ts:313`) muore con lui + import a `expenseCategoryService.ts:40` |
| `expenseService.ts` | `getExpenseById` (153) | ~24 | |
| `expenseService.ts` | `calculateIncomeExpenseRatio` (724) | ~15 | |
| `snapshotService.ts` | `createSnapshot` (53) | ~83 | La creazione snapshot client-side è migrata a `app/api/portfolio/snapshot/route.ts` + cron |
| `snapshotService.ts` | `getSnapshotsInRange` (172) | ~36 | |
| `snapshotService.ts` | `getLatestSnapshot` (203) | ~23 | Dopo le tre: pota import orfani (`setDoc`, `Timestamp`, eventuali helper `calculate*` non più referenziati — gli helper restano vivi nei loro moduli) |
| `borsaItalianaScraperService.ts` | `calculateWithholdingTax` (335) + `calculateNetDividend` (345) | ~21 | Coppia duplicata da `dividendService`; entrambe le copie muoiono (vedi sotto) |
| `dividendService.ts` | `getDividendsByAssetGrouped` (484) | ~42 | **Catena**: orfana `interface DividendsByAsset` (`types/dividend.ts:201`, unico consumer) → cancella interfaccia + import a `dividendService.ts:9` (~10 LOC extra) |
| `dividendService.ts` | `calculateWithholdingTax` (596) | ~10 | |
| `currencyConversionService.ts` | `clearExchangeRateCache` (134) + `getCacheStatus` (142) | ~19 | `rateCache` resta usato dal path FX vivo |
| `dividendIncomeService.ts` | `unsyncDividendExpenses` (188) | ~35 | `syncDividendExpenses`/`deleteExpenseForDividend` restano VIVI |
| `dummySnapshotGenerator.ts` | `generateSingleDummySnapshot` (445) | ~17 | Morta e pure buggata (ignora year/month/params) — cancellare, non fixare |
| `yahooFinanceService.ts` | `validateTicker` (107) + `searchTicker` (123) | ~44 | Trimma anche le righe 9-10 dell'header comment che le citano; `yahoo-finance2` resta necessario al resto del file |

**Escluso deliberatamente da questa spec**:
`assistantMonthContextService.ts` → `buildAssistantQuarterContext` (staticamente
morto, ~107 LOC) è una **decisione di prodotto**, non una potatura: vedi spec 05.

## B. lib/server — CANCELLA

| File | Simbolo (riga) | LOC | Collaterali / note |
|------|----------------|-----|--------------------|
| `apiAuth.ts` | `assertSameUser` (54) + `assertResourceOwner` (119) | ~33 | `requireFirebaseAuth`/`assertCanAccessAccount`/`verifyCronSecret`/`getApiAuthErrorResponse` VIVI. Aggiorna il docblock a riga ~72 che cita `assertSameUser` + la prosa AGENTS.md:338/354 |
| `monthlyEmailService.ts` | `buildAndSendForCurrentMonth` (1689) | ~8 | Wrapper; il callee `buildAndSendForPeriod` resta vivo (2 route) |

## C. lib/hooks + lib/firebase — CANCELLA

| File | Simbolo | Note |
|------|---------|------|
| `useAssets.ts` | `useCreateAsset` (45), `useUpdateAsset` (64) | `useAssets`/`useDeleteAsset` restano. Pota gli import orfani `createAsset`, `updateAsset` (riga 16) e `AssetFormData` (riga 17) — le funzioni di servizio restano vive via `AssetDialog.tsx:46` |
| `usePeriodPicker.ts` | Righe 193-194: `export type { Period }` + `export { currentMonthPeriod, MONTH_NAMES_SHORT }` | Puri re-export morti: l'unico consumer (`components/ui/period-picker.tsx:26`) importa già da `@/lib/utils/period` direttamente. Cancella entrambe le righe (la 194 non era flaggata da knip ma è morta uguale — verificato) |

**Escluso**: `useAssistantThreads.ts` → `useCreateAssistantThread` è accoppiato
alla rimozione di `POST /api/ai/assistant/threads` → spec 05.

## D. DE-ESPORTA (togli `export`, il codice resta — usati solo nel proprio file)

- `assetAllocationService.ts`: `ALL_ASSET_CLASSES` (613),
  `calculateCurrentAllocationSnapshot` (623), `toLegacyAllocationResult` (744) +
  i tipi `AllocationBasisSnapshot` (586), `CurrentAllocationSnapshot` (601)
- `assetService.ts`: `calculateEstimatedTaxes` (786)
- `dummyDataService.ts`: `deleteDummySnapshots` (91), `deleteDummyExpenses` (119),
  `deleteDummyCategories` (151) — il modulo resta vivo (feature demo-data)
- `monteCarloService.ts`: `randomNormal` (27)
- `performanceService.ts`: `getCashFlowsForPeriod` (840) — nessun calcolo cambia
- `lib/server/assistant/prompts.ts`: `getPeriodLabel` (63)
- `lib/server/assistant/store.ts`: `getDefaultThreadTitle` (37)
- `lib/server/ecbRatesService.ts`: `buildMonthlyRatesFromFred` (20)
- `lib/server/validation.ts`: `assetTransactionTypeSchema` (74)
- `lib/server/weeklyBudgetEmailService.ts`: `generateWeeklyBudgetComment` (263) +
  tipi `BudgetRowStatus` (29), `OverspendExpense` (32), `WeeklyBudgetRow` (39)
- `lib/server/monthlyEmailService.ts`: tipo `AssetClassEntry` (48)
- `lib/server/emailPeriodComparison.ts`: tipo `CategoryDelta` (54)
- `lib/firebase/config.ts`: rimuovi solo `export default app` (riga 68) — la
  const `app` resta (inizializza auth/db); i named export sono vivi ovunque
- `lib/hooks/useAssistantMonthContext.ts`: `useAssistantMonthContext` (82),
  `useAssistantYearContext` (100), `useAssistantYtdContext` (118),
  `useAssistantHistoryContext` (137) — ⚠️ **SOLO de-export, MAI cancellare**:
  sono internals di `useAssistantPeriodContext` e per le rules-of-hooks devono
  restare chiamati incondizionatamente
- `lib/services/fireService.ts`: tipi `FIRESensitivityColumn` (90),
  `FIRESensitivityRow` (96), `CoastFIREScenarioMetrics` (141),
  `IncomeSourceSubCategory` (802)
- `lib/services/cashBalanceReconciliation.ts`: tipo `SingleDeleteParams` (46) —
  **prima verifica la gemella `SingleCreateParams` (35)**: se anche lei è a zero
  riferimenti esterni, trattale allo stesso modo per tenere il blocco simmetrico

## E. Collaterale Firestore

- `firestore.indexes.json`: rimuovi l'indice composito `assets(userId ASC, isin
  ASC)` (orfanato da `getAssetsWithIsin`). Non toccare gli altri indici in questa
  sessione; una mappatura completa indici→query è un follow-up separato.

## Validazione finale

1. `npx tsc --noEmit` dopo OGNI file toccato (i de-export possono rivelare
   import `import type` altrove — se succede, il verdetto era sbagliato: fermati
   e segnala)
2. Suite d'area (AGENTS.md → *Testing and Workflow*): `assetDialogHelpers`,
   `allocationUtils`, `dividendUseCase` + `dividendProcessor`,
   `monthlyEmailService`, `performanceService`, `assistantRoutes`,
   `apiAuthRoutes` + `dashboardOverviewService`
3. `npx vitest run` completa (1406 test) + `npm run build`
4. `npx knip`: gli export di questa spec non devono più comparire

## Prompt per la sessione di implementazione

```
Implementa la spec docs/dead-code/03-export-morti-services-server-hooks.md
(audit codice morto, sessione 3 di 6; richiede la 01 già mergiata). Applica le
tabelle CANCELLA (sez. A-C) e DE-ESPORTA (sez. D) esattamente come scritte,
incluse le catene collaterali (updateExpensesSubCategoryName, DividendsByAsset,
indice Firestore assets userId+isin) e gli aggiornamenti di prosa
(AGENTS.md:338/354, docblock apiAuth, commento stale assetAllocationService).

Regole:
- Per ogni simbolo: grep di ri-verifica PRIMA dell'edit (protocollo in
  docs/dead-code/README.md); i numeri di riga sono àncore, non verità
- CANCELLA = rimuovi dichiarazione + helper privati usati solo da lei + import
  orfani; DE-ESPORTA = togli solo la keyword export
- MAI cancellare i quattro hook di useAssistantMonthContext (solo de-export,
  rules-of-hooks)
- NON toccare buildAssistantQuarterContext e useCreateAssistantThread (spec 05)
- NON bumpare CACHE_MATH_VERSION (nessun calcolo cambia)
- npx tsc --noEmit dopo ogni file; un commit per sezione; branch
  chore/dead-code-03-exports
- Alla fine: suite d'area elencate nella spec, vitest completa, npm run build,
  npx knip di conferma

Contesto:
- Leggi docs/dead-code/README.md (protocollo condiviso e whitelist)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice

Crea SESSION_NOTES.md per tracciare il lavoro.
```

**Modello consigliato: Sonnet 5 · Effort: high.** Volume alto e diverse trappole
puntuali (omonimo `addSubCategory`, gemella `SingleCreateParams`, rules-of-hooks)
ma ogni azione è binaria e tsc-guardata. Se preferisci più margine sulle catene,
Opus 5 · medium è l'alternativa.
