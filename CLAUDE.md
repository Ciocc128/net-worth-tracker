# CLAUDE.md - Net Worth Tracker (Lean)

## Project Overview
Next.js app for Italian investors: net worth, assets, cashflow, dividends, performance metrics and long-term planning on Firebase.

**This file is the INDEX.** Detailed conventions, patterns and gotchas live in **AGENTS.md**; the aesthetic spec is **DESIGN.md**. Keep entries here to "what it is + where it lives".

## Current Status
- Stack: Next.js 16, React 19, TypeScript 5, Tailwind v4, Firebase, Vitest, Framer Motion, Recharts, Yahoo Finance, Borsa Italiana scraping, Anthropic (Claude Sonnet 5)
- `tsc` clean; **79 files / 1406 tests** green
- Latest (2026-07-28): **correzione dei calcoli di Rendimenti** (audit di 12 finding, 5 fasi, una per branch). I numeri di Storico, IRR e dei grafici rolling sono cambiati: non è una regressione, è la correzione. Dettaglio dei pattern in AGENTS.md → *Rendimenti: the measurement window*.
  - **Finestra di misura**: il primo snapshot di un periodo è **sempre** la valutazione di partenza e la misura si apre il mese dopo. Sostituisce un `hasBaseline` indovinato dal tipo di periodo, che sul ramo senza baseline (cioè sempre per Storico) contava due volte i cash flow del primo mese e annualizzava n−1 rendimenti su n mesi. Storico: TWR 25,41% → **26,07%**; heatmap, Underwater e Max Drawdown invariati.
  - **IRR**: i versamenti entravano col segno di un incasso — 100k → 110k tutti versati (rendimento vero 0%) dava **+22%**. Segni corretti, timeline ancorata all'inizio periodo, fallback a bisezione. Sui dati reali **36,66% → 15,82%**, coerente con TWR 15,93%.
  - **Finestre rolling**: il limite superiore era il 1° del mese a mezzanotte e il filtro `date <= endDate` buttava via tutti i movimenti del mese di chiusura. Ora `endOfMonthBound`.
  - **Cache key**: firma l'intera serie di snapshot + risk-free rate + categoria dividendi (prima solo l'ultimo snapshot). Più `CACHE_MATH_VERSION`, la leva manuale per quando cambia la matematica a input invariati — **da bumpare a ogni modifica dei calcoli**.
  - **Coerenza**: filtro ±50% rimosso dalla volatilità (nascondeva i crolli veri alla metrica che deve riportarli), soglie minime di osservazioni, hero che sotto i 6 mesi dichiara il rendimento *di periodo*, grafico Evoluzione ridisegnato (area "Capitale immesso" sotto la linea del patrimonio), tooltip di ROI e CAGR che dichiarano entrambe le formule.

## Architecture Snapshot
- App Router; protected pages under `app/dashboard/*`
- Service layer `lib/services/*`; shared pure utilities `lib/utils/*`; server-only logic `lib/server/*`
- React Query for caching/invalidation
- Italy timezone helpers in `lib/utils/dateHelpers.ts` (`getItalyMonth/Year`, day bounds, `endOfMonthBound`)
- Convention: extract logic into pure, tested `lib/utils`/`lib/services` functions; keep Firestore-coupled code thin

## Key Features (Active)
- **Shared account (delegated access)**: a second user gets full co-owner read/write. **viewer** (logged-in user) decoupled from **owner** (`ownerId`) via `useActiveAccount()`. Grants in `account-access/{ownerUid}`; enforcement in `firestore.rules` + `assertCanAccessAccount`. Theme stays per-viewer. Switcher in both `Sidebar` and `SecondaryMenuDrawer` (portrait has no sidebar). AGENTS.md → *Shared Account*.
- **Demo mode**: public landing `app/page.tsx` + auto-login; `useDemoMode()` gates every mutation. AGENTS.md → *Public Landing Page Hero*.
- **Panoramica (Overview)**: Bento Asimmetrico hero `[2fr_1fr]` — patrimonio dominante + chip variazione/ATH + sparkline con period selector + digest "Guidato da", accanto a Sintesi Patrimoniale (con progress dell'obiettivo). Poi Cashflow KPI e grafici deferred. `useDashboardOverview()` → `GET /api/dashboard/overview`. AGENTS.md → *Panoramica* + *Dashboard Data Isolation*.
- **Portfolio (Patrimonio)**: tutti i tipi asset; hero gemella di Panoramica; tabella ordinabile, delete 2-click, colonne Δ dietro "Andamento"; conti correnti in card separate. Prezzi auto (Yahoo / Borsa Italiana); tint `--chart-3` sulle righe a prezzo manuale via `requiresManualPricing`.
- **AssetDialog**: create in 2 step (tipo → form filtrato), edit riusa la stessa logica di visibilità. Per i tipi a ledger mostra qty/PMC in sola lettura (submit via `updateAssetMetadata`). Select classe per gli ETF; alias `displayTicker` opzionale; `leverageRatio` per gli ETF a leva.
- **Asset trade ledger (Registro operazioni)**: BUY/SELL/ADJUSTMENT per asset con regolamento cash opzionale (net-worth-neutral). `TransactionDialog` (+ anteprima plusvalenza) e `AssetMovementsDialog` (P&L/Rendimento/XIRR). Scritture solo via Admin API; l'asset doc resta autoritativo (replay completo). Alimenta anche "Capitale investito"/"Plusvalenze" su Rendimenti e il total return su Dividendi. AGENTS.md → *Asset Trade Ledger*.
- **Cashflow**: tab Tracciamento / Dividendi / Budget / (opz.) Centri di Costo. **Transfers** = tipo a sé, net-zero ovunque, riconciliazione atomica dei due saldi. **Tracciamento** = IA single-answer: `CashflowHero` (Risparmio Netto + un verdetto + top-5 spese) → toolbar filtri → `TransactionFeed` condiviso.
- **Budget**: opt-in, ceiling complessivo + budget di entrata + periodo mensile|annuale, con Forecast / Insights / Alerts. Pure `lib/utils/budgetUtils.ts`.
- **Cost Centers**: 6° tab opzionale (`costCentersEnabled`); spese per progetto, asse periodo + lista ordinata + budget/proiezione/lifecycle per centro; breakdown per sotto-categoria con esclusioni di sola sessione.
- **Expense CSV Import**: Impostazioni → Spese. Layer puro di parse/validate/plan con preview obbligatoria prima di ogni scrittura; `importBatchId` condiviso per l'undo in un tap. I `transfer` sono rifiutati e i saldi non vengono mai toccati. AGENTS.md → *Expense CSV Import*.
- **Analisi** (`/dashboard/analisi`): period selector deep-linked in querystring + KPI trio + anomalie + Sankey con `DrillBreadcrumb`; il resto dietro un Collapsible "Dettaglio". NOTA `cashflowHistoryStartYear` è condiviso (Cashflow/Storico/Assistant/overview) — non rinominarlo. AGENTS.md → *Analisi*.
- **Dividends**: IA Trade-Republic con asse periodo in-memory → hero net income + KPI + affidabilità + leaderboard payer; Tabella/Calendario. `DividendStats` = blocco server YOC/DPS/total-return, ledger-based (posizioni chiuse incluse col badge "Chiusa"). **BTP Italia**: cedola FOI additiva, la successiva resta **provvisoria** finché l'utente non annuncia il tasso.
- **Rendimenti (Performance)**: IA single-answer — `PerformanceHero` (TWR dominante + verdetto + delta benchmark + chip drawdown + vital signs) → strip di consistenza → Collapsible con i `MetricSection` → grafici in cluster "Andamento"/"Rischio". **Base configurabile** (di default fuori fondi pensione e asset `excluded`), dichiarata sotto l'hero. **Drawdown su indice TWR**: Max Drawdown / Durata / Recupero / Underwater concatenano gli stessi rendimenti mensili della heatmap. Regole di finestra, IRR, soglie e grafico Evoluzione: AGENTS.md → *Rendimenti: the measurement window*.
- **Benchmark comparison**: growth-of-100 + tabella rischio/rendimento su 6 portafogli modello; Sharpe/Sortino sulla media di periodo del tasso BCE. **Env: `FRED_API_KEY`**.
- **Allocazione**: IA a due zone — Decisione (`AllocationHero` + `RebalanceBandControl` + `ActionPlanner` Ribilancia/Versa/Preleva) poi divisore "Dettaglio" → composizione + esposizione. **`Asset.allocationRole` (`tradable`|`frozen`|`excluded`) è partizionato PRIMA di `compareAllocations`**: `frozen` resta nel denominatore ma mai in un piano, `excluded` esce dalla pagina (per questo il totale è più piccolo del net worth). **Leva**: `leverageRatio` espande l'asset nella sua esposizione nozionale; i piani risolvono un QP per strumento. AGENTS.md → *Allocation*.
- **Storico (History)**: hero (patrimonio + CAGR) → Evoluzione → Raddoppi → Composizione (banda "Previdenza" dedicata) → Driver. Include **Valore per Strumento**: lettura per strumento di un mese da `MonthlySnapshot.byAsset` (mai ricalcolata) + trend cross-mese con attribuzione prezzo/quantità.
- **Fondo Pensione (Previdenza)**: asset a valutazione manuale (`pensionFund`), `allocationRole: 'frozen'` di default. Versamenti in tre nature (TFR/Volontario/Datoriale) da `/dashboard/pension`; solo il Volontario esce da un conto cash. **Multi-persona**: ogni fondo si collega a un `FamilyMember` (RAL + eleggibilità) e il recap fiscale gira **una volta per membro**. **Rendimento del fondo**: TWR di mercato separato dal contributo datoriale (retribuzione, non rendimento) e dal risparmio IRPEF. Integrato in Allocazione (look-through), Storico (banda), Rendimenti (fuori dalla base) e FIRE (capitale bloccato opzionale). AGENTS.md → *Fondo Pensione*.
- **FIRE + Coast FIRE + What If + Monte Carlo**: FIRE Number con proiezione Bear/Base/Bull; Coast FIRE sconta il numero a oggi con pensioni statali opzionali e scaglioni IRPEF editabili; What If simula eventi di vita ri-eseguendo `fireService` due volte; Monte Carlo con hero di probabilità.
- **Goal-Based Investing**: trajectory-led (ritmo mensile richiesto + data proiettata + verdetto); allocazione goal-driven opzionale.
- **Assistente AI**: asse periodo unico + scheda reattiva; streaming SSE, 5 modalità, web search gated, memoria proattiva. `claude-sonnet-5`, no prompt caching by design. Flag `NEXT_PUBLIC_ASSISTANT_AI_ENABLED`; bloccato in demo.
- **Hall of Fame**: record e classifiche con switcher periodo+categoria.
- **Multi-theme**: 6 temi persistiti in `userPreferences/{userId}` + localStorage; grafici theme-aware via `useChartColors` (`--chart-1..5`).
- **Email periodiche**: mensile/trimestrale/semestrale/annuale + **email budget settimanale** (domenica) — inviata ogni settimana ma con cifre month-to-date e year-to-date, orizzonte dichiarato esplicitamente in ogni caption. Env: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ANTHROPIC_API_KEY`.
- **PDF export** e analisi AI della performance.

## Testing
- Vitest. Comandi: `npx vitest run <file>`, `npm test -- <file>`, `npx tsc --noEmit`. Rilancia `tsc` **dopo** aver scritto i test, non solo dopo il codice.
- Test mirati su utility/servizi puri + regressione auth sulle API private. Nuovi test in `__tests__/`; preferisci funzioni pure a codice Firestore-coupled.
- **Dev/test senza dati di produzione**: Firebase Emulator Suite — `npm run emulators` + `npm run emulators:seed` + `npm run dev:emulator` (offline, richiede una JDK). Guida: SETUP.md → Step 6.

## Data & Integrations
- Firestore client + admin
- Yahoo Finance (prezzi, storico ETF benchmark) · Borsa Italiana scraping (bond italiani, dividendi)
- Frankfurter API (FX) · FRED API (ECBDFR, tasso BCE; `FRED_API_KEY`)
- Anthropic (`claude-sonnet-5` analisi + assistente; `claude-haiku-4-5` estrazione memoria)

## Known Issues (Active)
- **FX** dipende da Frankfurter; fallback cache 24h. Asset non-EUR pre-migrazione senza `currentPriceEur` mostrano il prezzo nativo come EUR fino al primo aggiornamento.
- **Demo account**: richiede setup Firebase manuale (utente + dati finti realistici + tre env var).
- **Security review 2026-06-10**: tutti gli 8 finding chiusi. Caveat: `firebase-admin` pinnato a `^13.6.0` (il bump a @14 tira `jose@6` puro-ESM → `ERR_REQUIRE_ESM` su Vercel), quindi gli 8 advisory moderati su `uuid` restano aperti.
- **Shared account setup**: l'ospite dev'essere in `REGISTRATION_WHITELIST` e **registrarsi prima** di poter essere aggiunto (la risoluzione email→uid 404 su un utente inesistente); `firestore.rules` va deployato.
- **YOC/Current Yield** escludono gli asset venduti (voluto) e sono scoped all'holding corrente via `holdingStartDate` — un rebuy legacy senza stamp resta scoperto finché non viene ri-aggiunto.
- **Rendimenti pre-`byAsset`: denominatore corretto, numeratore no.** Il backfill di `performanceBase.ts` toglie lo scalino di base sui mesi storici senza breakdown per strumento (2023-01 → 2025-10 sull'account reale), ma in quei mesi la **variazione** degli asset esclusi resta dentro il rendimento misurato: rivalutazione della casa e, in modo sistematico, la quota capitale di ogni rata di mutuo che fa salire l'equity. Non ricostruibile — quegli snapshot non hanno il dettaglio per strumento.
- **Artefatto di bucket mensile del TWR (per design, non un bug di formula)**: il TWR neutralizza una spesa solo se il calo di patrimonio e il cash flow cadono nello **stesso mese**. Un acquisto grosso pagato dal portafoglio è quindi neutro (l'auto di 03-04/2024 sull'account reale, ~21k: scendono insieme area e linea nel grafico Evoluzione, rendimento esatto). **L'insidia è il caso opposto**: registrare un acquisto sia come spesa sia come **asset** lascia il patrimonio invariato mentre il cash flow scende, e la formula produce un guadagno fantasma `(V + spesa)/V − 1` — vale anche per ogni rata di mutuo se l'immobile sta *dentro* la base. Registrare i saldi nel mese di competenza. AGENTS.md → *History and Snapshot Baselines*.
- **`computeBalanceScore` degrada semanticamente con una leva target non ancora raggiunta**: valuta il drift sulle percentuali target grezze, quindi con Σtarget > 100 e leva attuale ~1 il deficit di leva stesso conta come disallineamento. La direzione resta sensata, manca la consapevolezza della leva.

## Key Files
- **Overview**: `app/dashboard/page.tsx`, `app/api/dashboard/overview/route.ts`, `lib/services/dashboardOverviewService.ts`, `lib/hooks/useDashboardOverview.ts`, `components/dashboard/*`, `lib/utils/{dashboardOverviewUtils,sparklinePeriod}.ts`
- **Shared account**: `contexts/ActiveAccountContext.tsx`, `lib/services/accountAccessService.ts`, `app/api/account/members/route.ts`, `lib/server/apiAuth.ts`, `firestore.rules`, `components/settings/AccountSharingSection.tsx`; collection `account-access/{ownerUid}`
- **Primitive condivise**: `components/ui/{composition-list,composition-bar,segmented-pill,drill-breadcrumb,responsive-modal}.tsx`, `lib/utils/compositionShading.ts`
- **Shared utils**: `lib/utils/formatters.ts`, `lib/utils/metricColors.ts` (`getMetricValueColor`), `lib/utils/assetPricing.ts` (`requiresManualPricing` — unica fonte sul pricing manuale), `lib/utils/firestoreData.ts` (`removeUndefinedDeep`), `lib/utils/dateHelpers.ts` (`endOfMonthBound`)
- **Rendimenti — base e drawdown**: `lib/utils/performanceBase.ts` (`resolvePerformanceExclusions`/`resolvePerformanceBaseOptions`/`toPerformanceBaseSnapshots` col backfill + `resolveHasBaseline`), `lib/utils/drawdownSeries.ts` (`buildTwrIndex`/`computeDrawdownSeries`/`findMaxDrawdown`). I due call site (service e pagina) devono passare le STESSE opzioni.
- **Rendimenti — finestra e calcoli**: `lib/services/performanceService.ts` (`resolveNominalPeriodStart`/`selectSnapshotsForMetrics`, `monthsElapsed` vs `calculateMonthsDifference`, `calculateIRR`, `MIN_RETURNS_FOR_VOLATILITY`, `CACHE_MATH_VERSION`), `lib/utils/cashFlowMap.ts` (`buildCashFlowMap`/`monthKey` — unica indicizzazione mensile, mai ricostruirla inline), `lib/utils/performanceSummary.ts` (`resolveHeroReturn`), `lib/utils/benchmarkPeriodReturn.ts`. Cache `performance-cache/{userId}`. Tests `__tests__/{performanceBaseline,performanceRolling,performanceService,performanceSummary,performanceBase,drawdownSeries,cashFlowMap}.test.ts`
- **Yields**: `lib/utils/yieldOnCost.ts` (`computeDividendYieldMetrics` — unica fonte, per-share, current-cost, sold-excluded, holding-start-scoped), consumata da Rendimenti e da `app/api/dividends/stats/route.ts`
- **Assets**: `lib/services/assetService.ts` (`createAsset` riuso ISIN + stamp `holdingStartDate`), `components/assets/*`, `types/assets.ts`, `lib/utils/{assetDisplay,assetDisplayClass}.ts`
- **Asset trade ledger**: engine `lib/utils/assetTransactionUtils.ts` + `types/assetTransactions.ts`; server `lib/server/{assetTransactionUseCase,tradeFxService}.ts` + `app/api/asset-transactions/*`; client `lib/services/assetTransactionService.ts` + `lib/hooks/useAssetTransactions.ts`; UI `components/assets/{TransactionDialog,AssetMovementsDialog}.tsx`. Collections `assetTransactions`/`assetTransactionsMeta`
- **Fondo pensione**: `types/pension.ts` + `pensionFundDetails`/`FamilyMember` (`types/assets.ts`); pure `lib/utils/{pensionDeduction,pensionContributions,pensionReturn,pensionFire,pensionFamilyMembers}.ts`; `lib/services/pensionContributionService.ts`; UI `components/pension/*` + `app/dashboard/pension/page.tsx`. Collection `pensionContributions`
- **Allocazione / esposizione**: `app/dashboard/allocation/page.tsx`, `components/allocation/*`, `lib/utils/{allocationUtils,leverageAwareAllocationUtils,assetExposureUtils}.ts`, `lib/services/assetAllocationService.ts`, `lib/hooks/useActionColors.ts`; `lib/server/portfolioExposureService.ts`, `exposure-cache/{userId}`
- **Cashflow / budget / centri di costo**: `app/dashboard/cashflow/page.tsx`, `components/cashflow/*`, `lib/utils/{budgetUtils,costCenterUtils,cashflowTimeSeries,trackingSummary,expenseImport}.ts`, `lib/services/{budgetService,costCenterService,cashBalanceReconciliation,expenseImportService}.ts`
- **Dividendi**: `components/dividends/*`, `lib/utils/{dividendAnalytics,couponUtils}.ts`, `lib/services/couponScheduling.ts`, `types/dividend.ts`
- **Storico / snapshot**: `app/dashboard/history/page.tsx`, `components/history/*`, `lib/utils/snapshotAssetBreakdown.ts`, `lib/services/{chartService,snapshotService}.ts`; collection `monthly-snapshots`
- **Benchmark**: `lib/constants/benchmarks.ts`, `app/api/benchmarks/*`, `lib/server/ecbRatesService.ts`; cache `benchmark-cache/*`, `fx-rate-cache/usd-eur`, `ecb-rate-cache/deposit-rate`
- **FIRE / goals**: `components/fire-simulations/*`, `lib/services/{fireService,whatIfService,goalService}.ts`, `lib/utils/goalTrajectory.ts`, `components/goals/*`
- **Assistant**: `app/dashboard/assistant/page.tsx`, `components/assistant/*`, `app/api/ai/assistant/*`, `lib/server/assistant/*`
- **Settings / layout**: `app/dashboard/settings/page.tsx`, `lib/services/assetAllocationService.ts`, `components/layout/*`, `lib/constants/navigation.ts`
- **Server use case / email**: `lib/server/{assetAdminRepository,dividendUseCase,dividendProcessor,monthlyEmailService,weeklyBudgetEmailService,emailPeriodComparison}.ts`, `app/api/cron/monthly-snapshot/route.ts` (fasi 2-6)

## Design Context
Spec estetica autoritativa: **DESIGN.md** (Apple + Linear/Vercel + Trade Republic; form-follows-function) — mantenuta a mano, **mai rigenerarla**; il suo frontmatter YAML è lo strato normativo letto dal detector impeccable, `.impeccable/design.json` è solo il sidecar di estensioni. Prompt di review in `docs/{critique,audit}-prompts.md`. Utenti: investitori italiani self-directed che vogliono capire la propria posizione in fretta e con fiducia. Principi: (1) prima il dato, poi la decorazione; (2) motion con uno scopo; (3) la densità è una feature; (4) la precisione costruisce fiducia; (5) la personalità sta nei dettagli.

**Last updated**: 2026-07-28 — correzione dei calcoli di Rendimenti in 5 fasi (finestra di misura, IRR, finestre rolling, cache key + `CACHE_MATH_VERSION`, coerenza delle metriche di rischio). Storia precedente: `git log`.
