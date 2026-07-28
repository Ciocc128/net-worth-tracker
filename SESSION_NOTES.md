# SESSION_NOTES — Analisi bug e scrittura spec (2026-07-27)

Sessione di **sola analisi e documentazione**: nessun file di codice modificato. Output: 5 spec sotto `docs/specs/` + questo file.

## Cosa è stato fatto

1. Analisi approfondita (3 agenti di esplorazione in parallelo) dei 4 bug segnalati + audit dei calcoli della pagina Rendimenti + caccia a bug adiacenti.
2. Decisioni di prodotto prese con l'utente (vincolanti, riportate nelle spec):
   - **Tassazione**: campo unico `taxRate` (niente aliquota dividendi separata).
   - **Etichette grafici**: fallback a `asset.name` nel resolver centrale; nessun campo alias per i tipi senza ticker.
   - **Rendimenti**: spec completa a fasi (tutti i 12 finding).
   - **XEON/bollo**: ETF classe cash = titolo (0,2%); convenzione stretta per bollo/storico prezzi/picker conti; aggregati di liquidità restano larghi (AGENTS.md hardening 2026-07-26).
3. Scritte le 5 spec, ognuna con diagnosi file:linea, decisioni fissate, modifiche per file, impatti, test, e prompt di implementazione finale con modello/effort consigliato.

## Le spec (ordine di implementazione consigliato)

| Spec | Bug | Modello/effort | Note |
|---|---|---|---|
| `docs/specs/7-leverage-target-save.md` | Allocazione >100% non salvabile | Sonnet 5, medio | Fix più piccolo e urgente: 1 guard + copy. Svista del commit L2 990cc56. |
| `docs/specs/8-asset-tax-rate-restore.md` | Aliquota fiscale irraggiungibile per asset a ledger | Sonnet 5, medio | Regressione Fase C ledger; persistenza già pronta, solo UI. Danno attuale: BTP tassati 26% dal cron. |
| `docs/specs/9-asset-chart-labels.md` | Conti correnti senza etichetta nei grafici Panoramica | Sonnet 5, basso/medio | Fallback name nel resolver + sweep 7 consumatori + fix key React duplicate. |
| `docs/specs/6-asset-class-selection.md` | Classe asset non scegliibile in create (XEON) + classe prevalente fondo pensione | Sonnet 5, alto | Include l'allineamento di 3 call site alla convenzione stretta (bollo 0,2%, storico prezzi, picker conti). |
| `docs/specs/10-performance-calculations.md` | 12 errori nei calcoli Rendimenti (A1–A12) | Fasi 1-2: Opus 5 alto; Fasi 3-5: Sonnet 5 alto | 5 fasi separate, una per branch. Fase 1 (baseline data-driven) è la più impattante: corregge TWR/ROI/CAGR di Storico. |

## Diagnosi in una riga per bug

1. **Classe asset (XEON)**: `handleTypeSelect` stampa `TYPE_TO_CLASS[type]` e in create la classe non è più modificabile; il pricing però è type-based, quindi ETF+classe cash funzionerebbe già — è un vincolo solo di UI.
2. **Leva**: `handleSave` (settings/page.tsx:1059-1065) ha ancora il guard `=== 100`; il commit L2 aggiornò solo la variabile di render.
3. **Aliquota**: il campo `taxRate` è finito dentro il blocco Cost Basis, nascosto per tutti i tipi a ledger; `updateAssetMetadata` lo sa già scrivere.
4. **Etichette**: `prepareAssetDistributionData` etichetta col ticker (vuoto per i conti) e scarta il nome; `getAssetDisplayTicker` non ha fallback su name.
5. **Rendimenti**: radice principale = `hasBaseline` euristico (indovinato dal tipo di periodo invece che dai dati) → tre errori a cascata su Storico/YTD/finestre corte; più cache key incompleta, rolling con l'ultimo mese di spese perso, IRR shiftato di un mese.

## Segnalazioni fuori scope (non spec-ate, da valutare)

- **Riferimenti a spec cancellate** — ✅ RISOLTO (2026-07-27, stessa sessione): eliminate TUTTE le citazioni alle spec archiviate (1-asset-transactions, 2-pension-fund, 3-leveraged-etf-allocation, 4-ticker-display-alias, 5-expense-csv-import, specs README, security-review-spec) dai commenti del codice e da CLAUDE.md — ~90 siti in ~45 file, solo commenti (+1 stringa di log in seedEmulator). Dove il commento si appoggiava alla spec (matrici di test, invarianti) la frase è stata riformulata per stare in piedi da sola. Decisione: niente file ARCHIVE.md — le spec restano recuperabili dalla git history (`git show 0186c0d^:docs/specs/...`, `git show 4fb7d33^:docs/security-review-spec.md`) e a implementazione conclusa la fonte di verità sono codice + AGENTS.md. Verifica: grep pulito, `tsc` verde. Rimosse in un secondo passaggio anche le 3 citazioni residue in AGENTS.md (riga 716 + due titoli di sezione): per coerenza con la pulizia, e non perdevano informazione.
- **`computeBalanceScore` con leva target non raggiunta**: degrada semanticamente (documentato in spec 7 come limite noto, da annotare in CLAUDE.md → Known Issues in fase di implementazione).
- **Guard `autoUpdatePrice === undefined` morto** in AssetDialog (AGENTS.md 848-853): non costruirci sopra; toccarlo solo se si rifattorizza il dialog.

## Stato

- [x] Analisi e diagnosi (2026-07-27)
- [x] 5 spec scritte
- [x] Implementazione spec 7 (leva) — 2026-07-27, branch `fix/leverage-target-save`
- [x] Implementazione spec 8 (aliquota) — 2026-07-27, branch `fix/asset-tax-rate-restore`
- [x] Implementazione spec 9 (etichette) — 2026-07-28, branch `fix/asset-chart-labels`
- [x] Implementazione spec 6 (classe asset) — 2026-07-28, branch `feature/asset-class-selection`
- [ ] Implementazione spec 10 (Rendimenti, fasi 1→5) — **fasi 1, 2 e 3 fatte** (2026-07-28, branch `fix/performance-calculations-phase-{1,2,3}`; 1 e 2 già in `fix/session-bugfixes`); fasi 4→5 da fare

Aggiornare questo file al termine di ogni implementazione (i prompt nelle spec lo richiedono).

## Implementazione spec 7 — Salvataggio Allocazione Target ≥ 100% (Leva) — 2026-07-27

Branch `fix/leverage-target-save`. Fix chirurgico, un solo file di codice + CLAUDE.md.

**Cosa è stato fatto** (`app/dashboard/settings/page.tsx`):
1. Estratta una helper di modulo `isTargetTotalValid(total) = total >= 100 - 0.01` (accanto a `roundToTwoDecimals`), condivisa da `handleSave` e dal render (`isValidTotal`) — prima erano due copie della stessa regola con `handleSave` rimasta indietro alla vecchia `=== 100`.
2. `handleSave`: il guard ora blocca solo `total < 100 - 0.01`; il toast d'errore riporta anche il residuo da allocare.
3. Copy aggiornata: header del file (commento "Asset classes must sum to...") e la riga in "Note e dettagli tecnici" ("almeno 100%, oltre = leva target").
4. Audit dei 4 `max="100"` residui (stampDutyRate, riskFreeRate, sub-categoria %, asset specifico %): tutti percentuali *interne al padre* (non target top-level di classe), quindi lasciati invariati — nessuna modifica lì. Il cap top-level era già stato rimosso alla riga ~2657 in un commit precedente.
5. `CLAUDE.md` → Known Issues: aggiunta la riga sul limite semantico di `computeBalanceScore` con leva target non ancora raggiunta.

Non toccato (come da scope): validazione sotto-categorie, `validateSpecificAssets`, `computeBalanceScore`, `firestore.rules`.

Nessuna helper pura estratta in `lib/utils`/`lib/services` (resta un const locale al componente, Firestore-coupled), quindi nessuna suite vitest nuova per lo scope della spec — `isTargetTotalValid` è comunque testabile a mano coi 4 casi sotto.

**Gate**: `npx tsc --noEmit` ✅ pulito. `npm run build` ✅ (Next.js 16.2.6, Turbopack) — compilazione e generazione pagine statiche ok.

**Come testare a mano** (i 4 scenari della spec):
1. Target 60/30/20 (=110) → Salva: nessun toast d'errore, chip "Leva target 1,10×" verde nella card di riepilogo. Ricarica la pagina → i valori restano 60/30/20.
2. Target con totale 90 → Salva: toast d'errore con il residuo da allocare (es. "...residuo da allocare 10,00%"), nessuna scrittura su Firestore (ricaricando la pagina i valori pre-tentativo restano quelli salvati in precedenza).
3. Sotto-categorie di una classe a 80 (invece di 100) → Salva: errore invariato "Il totale delle sotto-categorie ... deve essere 100%" (guard separato, non toccato).
4. Vai su Allocazione dopo aver salvato lo scenario 1 (110%) → i piani Ribilancia/Versa riflettono la leva target 1,10× (comportamento già coperto da `__tests__/{assetExposure,compareAllocations,leverageAwareAllocationUtils}.test.ts`, non ri-testato in questa sessione).

- **Cosa**: rimosso il guard di salvataggio in `handleSave` (`app/dashboard/settings/page.tsx`) che rifiutava qualunque totale target diverso da 100% esatto; ora blocca solo se `total < 100 - 0.01`, allineandolo alla regola già usata dal render (`isValidTotal`, chip "Leva target"). Estratta la regola in una helper di modulo `isTargetTotalValid(total)` condivisa da entrambi. Aggiornata la copy stantia (header file + "Note e dettagli tecnici") e documentato in CLAUDE.md il limite noto di `computeBalanceScore` con leva target non ancora raggiunta.
- **Perché**: la UI (chip, badge verde, "Residuo da allocare") trattava già un totale ≥100% come valido — 100% = nessuna leva, sopra 100% = leva target legittima — ma il salvataggio era rimasto alla vecchia regola `=== 100`, svista del commit L2 `990cc56` che aveva aggiornato solo la variabile di render e non `handleSave`. Risultato: un utente non poteva salvare un target di leva anche se la UI glielo mostrava come corretto.
- **Nota**: le sotto-categorie e gli asset specifici restano a 100% esatto per design (sono percentuali *interne al padre*, non toccate dalla leva) — i 4 input `max="100"` residui verificati uno per uno sono tutti di questo tipo (o percentuali non correlate come aliquota bollo/risk-free rate), quindi lasciati invariati. Non esiste validazione server-side sul totale (invariato rispetto a prima, fuori scope): un totale <100% può ancora arrivare a Firestore da client vecchi/manipolati.

## Implementazione spec 8 — Reintroduzione dell'Aliquota Fiscale per gli Asset a Ledger — 2026-07-27

Branch `fix/asset-tax-rate-restore`. Un solo file di codice (`components/assets/AssetDialog.tsx`) + un test nuovo.

**Cosa è stato fatto**:
1. **Scorporato `taxRate` dal blocco Cost Basis** in un render helper di modulo, `renderTaxRateField()` (definito nel componente, prima del `return`, non come componente annidato — evita il remount ad ogni render che avrebbe un `<TaxRateField />` dichiarato dentro il corpo del componente). Un'unica istanza del campo (Label + Input + errore + shortcut BTP 12,5% riusato tale e quale), chiamata in tre punti:
   - **Non-ledger**: resta dentro il blocco "Tracciamento Cost Basis" esistente (gated dal toggle `showCostBasis`, come prima — nessun cambiamento di comportamento per cash/realestate esclusi come oggi/gli altri tipi non a ledger).
   - **Ledger edit**: renderizzato dentro il riquadro read-only Quantità/PMC (`isLedgerEdit`), gate `newAsset_showCostBasis` da solo.
   - **Ledger create**: renderizzato nel blocco "Posizione iniziale (primo acquisto)" (`isLedgerCreate`), stesso gate.
2. **Fix bug valore 0** (riga ~741, ora `asset.taxRate ?? undefined` invece di `asset.taxRate || undefined`): un'aliquota 0 salvata non viene più cancellata al primo giro di edit.
3. **Fix dello stesso bug nel normalizzatore di submit** (riga ~250, `buildAssetFormDataFromValues`): `data.taxRate && !isNaN(...) && data.taxRate >= 0` aveva lo stesso problema (0 è falsy in JS) — ma qui era più grave perché è il path che scrive su Firestore. Sostituito con `data.taxRate !== undefined && !isNaN(data.taxRate) && data.taxRate >= 0`, che distingue correttamente "vuoto" (NaN da `valueAsNumber` su input vuoto) da "0". Riga ~299 (`scheduleCouponDividends`, passthrough diretto di `data.taxRate` a `couponScheduling.ts`) verificata e lasciata invariata: non ha il pattern `|| undefined`, il fallback 26% vive comunque in `couponScheduling.ts` (non toccato).
4. **Nessuna modifica** a `lib/services/assetService.ts` (già pronto: `updateAssetMetadata` scrive/cancella `taxRate` via `deleteField()`), `types/assets.ts`, `assetTransactionUtils.ts`, `TransactionDialog`, `AssetMovementsDialog`, `dividendProcessor`, `couponScheduling` (fallback 26% intatti). `AssetCard.tsx:316-319` verificato: legge già `asset.taxRate !== undefined && asset.taxRate >= 0` (distingue 0 correttamente), nessuna modifica necessaria — era davvero solo un problema di UI irraggiungibile, come diagnosticato nella spec.
5. Test nuovo in `__tests__/assetDialogHelpers.test.ts` (stesso pattern "local copy" già in uso nel file per le altre helper di `onSubmit`, che non sono importabili direttamente essendo `AssetDialog.tsx` un componente `'use client'` con dipendenze Firebase): `resolveTaxRateForPersist` con 6 casi (0 preservato, positivo preservato, 12.5 BTP preservato, NaN→undefined, undefined→undefined, negativo→undefined).

**Gate**: `npx tsc --noEmit` ✅ pulito. `npx vitest run` ✅ 75 file / **1318 test** (1312 + 6 nuovi). `npm run build` ✅ (Next.js 16.2.6, Turbopack).

**Come testare a mano** (i 4 scenari della spec):
1. **Edit di un ETF/stock/crypto/commodity a ledger** → apri il dialog di modifica → il campo "Aliquota Fiscale (%)" è visibile accanto a Quantità/PMC (read-only) → imposta 26 → salva → riapri l'AssetCard: la riga "Aliquota: 26%" appare → su Panoramica/Patrimonio il blocco "Impatto Fiscale" si valorizza per quell'asset.
2. **Crea un BTP** (type=bond, a ledger) → nel blocco "Posizione iniziale (primo acquisto)" usa il link "Titoli di Stato italiani (BTP, CCT, BOT): imposta 12,5%" → salva → apri il simulatore TaxCalculatorModal sull'asset: mostra "Aliquota fiscale: 12,5%" (non più 0%/26% di default).
3. **Imposta aliquota 0** su un asset a ledger → salva → riapri il dialog di modifica → il campo mostra ancora `0` (non vuoto) — verifica sia il fix di lettura (riga ~741) sia quello di scrittura (riga ~250).
4. **Svuota il campo** (cancella il valore, lascialo vuoto) → salva → riapri il dialog: il campo è vuoto (non 0) → l'aliquota è stata cancellata (`deleteField`) → le tasse stimate per quell'asset tornano a 0 nel blocco "Impatto Fiscale".

## Implementazione spec 9 — Etichette per Asset senza Ticker nei Grafici (Fallback al Nome) — 2026-07-28

Branch `fix/asset-chart-labels`.

**Cosa è stato fatto**:
1. **`lib/utils/assetDisplay.ts`**: `DisplayTickerSource` esteso con `name?: string` (opzionale, structural typing — i call site senza `name` restano validi). `getAssetDisplayTicker` ora è `displayTicker → ticker → name` (ultimo gradino: `ticker` grezzo se anche `name` manca/è vuoto — nessun placeholder inventato). Commento Design in testa al file aggiornato per menzionare il fallback su name per gli asset senza ticker (cash/realestate/pensionFund).
2. **`lib/services/chartService.ts`** (`prepareAssetDistributionData`): rimossa la proprietà `name` intermedia ridondante (l'output finale usava già solo `ticker`); l'array interno ora è `{ label: getAssetDisplayTicker(asset), value }` — passando l'asset intero il resolver vede già `name` grazie all'estensione del punto 1, nessun altro codice necessario.
3. **`components/dashboard/OverviewChartsSection.tsx`**: `toSegments` e la key della legenda mobile (riga ~213) passati da `key: item.name` a `key: ${item.name}-${i}` — difesa in profondità contro nomi duplicati (due asset possono chiamarsi uguale), allineato al pattern già in uso dalla legenda desktop.
4. **Sweep dei 7 fallback inline** (letti uno per uno, non a regex — alcuni erano già stati sistemati da lavoro precedente, quindi il diff reale è più piccolo di quanto la spec preventivasse):
   - `AssetCard.tsx`, `AssetManagementTab.tsx`, `AssetMovementsDialog.tsx`: già delegavano a `getAssetDisplayTicker(asset)` dentro un gate `asset.ticker && asset.type !== 'pensionFund'` — nessuna modifica, il gate su `asset.ticker` grezzo evita comunque la riga quando non c'è un vero ticker, quindi nessun rischio di doppione col nome mostrato sopra.
   - `pdfDataService.ts` e `components/pdf/sections/PortfolioSection.tsx`: `pdfDataService.ts` chiamava già `getAssetDisplayTicker(asset)` (probabilmente sistemato in una sessione precedente, la diagnosi della spec era superata); `PortfolioSection.tsx` legge `asset.ticker` ma da `AssetRow` — cioè il valore GIÀ risolto da `pdfDataService`, non l'`Asset.ticker` grezzo. Nessuna modifica in nessuno dei due file.
   - **`DividendDialog.tsx:321`**: rimosso il fallback ridondante `getAssetDisplayTicker(asset) || asset.name` → `getAssetDisplayTicker(asset)` (il resolver copre già il caso).
   - **`lib/utils/allocationUtils.ts` (`buildHoldings`)**: qui il fallback NON era ridondante da rimuovere e basta — `holdingLabel()` compone `"${label} (${ticker})"`, e con `ticker` ora sempre risolto a `name` per gli asset senza ticker si sarebbe prodotto un doppione tipo "Conto Corrente (Conto Corrente)" nei piani di Allocazione. Fix: `ticker` è impostato a `undefined` quando il valore risolto coincide con `asset.name` (nessun ticker/alias genuino da mostrare tra parentesi).
   - **`components/goals/GoalsHero.tsx` + `GoalBasedInvestingTab.tsx`**: stesso problema — `GoalsHero` mostra `a.name` e poi, se presente, `a.ticker` su una riga separata; `FreeAsset.ticker` era `getAssetDisplayTicker(asset)` senza guardia, quindi per un conto corrente sarebbe apparso il nome due volte. Fix nello stesso punto di `allocationUtils.ts`: il ticker passato a `FreeAsset` è `undefined` quando coincide col nome.
   - **`components/allocation/InstrumentTradeList.tsx`**: `tradeLabel` reimplementava lo stesso fallback a 3 livelli (`displayTicker || ticker || name`) già interamente risolto a monte da `buildInstrumentExposures` (che chiama già `getAssetDisplayTicker(asset)`); semplificato a `trade.displayTicker || trade.ticker` (il secondo `||` resta solo per il tipo opzionale del campo, mai realmente raggiunto a runtime).
5. **`components/assets/AssetPriceHistoryTable.tsx:237`**: fix della violazione di convenzione, `asset.displayTicker ?? asset.ticker` → `getAssetDisplayTicker(asset)`. Per evitare lo stesso doppione nome/nome (qui la riga sotto mostra sempre `asset.name`), la sottoriga col nome ora è condizionale: appare solo se `getAssetDisplayTicker(asset) !== asset.name`. **Nota**: questo componente non risulta importato da nessuna pagina (`grep` non trova `<AssetPriceHistoryTable` in `app/`o `components/`) — sembra codice non montato in produzione al momento, ma citato esplicitamente nello scope della spec e in AGENTS.md, quindi sistemato comunque.
6. **`__tests__/assetDisplay.test.ts`**: estesi 6 nuovi casi (nome quando ticker vuoto, nome quando ticker whitespace-only, trim del nome, entrambi vuoti → stringa vuota, ticker preferito su nome quando entrambi presenti).

**Non toccati** (come da scope): `snapshotService.ts`, `CreateManualSnapshotModal`, `DividendTrackingTab`, `BenchmarkComparisonSection`, `ExposureSection`, `AssetDialog.tsx` (nessun campo alias nuovo). Anche NON toccati, pur avendo `getAssetDisplayTicker` nel loro import, perché fuori dallo scope esatto elencato nel prompt e senza il pattern "nome + ticker sulla stessa vista" che richiederebbe una guardia: `app/api/dividends/stats/route.ts`, `components/goals/AssetAssignmentDialog.tsx`, `components/goals/GoalDetailCard.tsx`, `components/history/MonthlyAssetBreakdownSection.tsx`, `components/assets/TaxCalculatorModal.tsx`.

**Gate**: `npx tsc --noEmit` ✅ pulito. `npx vitest run` ✅ 75 file / **1323 test** (6 nuovi in `assetDisplay.test.ts`). `npm run build` ✅ (Next.js 16.2.6, Turbopack, tutte le pagine generate).

**Come testare a mano** (i 4 scenari della spec):
1. **Panoramica → grafico "Distribuzione per Asset"** con ≥2 conti correnti (o un conto + un immobile) → entrambe le barre/segmenti ora mostrano il nome dell'asset invece di una barra senza etichetta; apri la console del browser e verifica che non compaia nessun warning React "Encountered two children with the same key" anche con nomi duplicati.
2. **Un immobile e un fondo pensione** in portafoglio → nello stesso grafico, entrambi etichettati col loro nome (prima: etichetta vuota per entrambi).
3. **Un ETF con alias impostato** (`displayTicker`, es. "CL2" per "CL2.MI") → verifica che il grafico mostri ancora l'alias, non il nome — nessuna regressione sulla precedenza alias→ticker→nome.
4. **Export PDF** (Impostazioni o dovunque sia il trigger export) → sezione Portfolio: le righe di conti correnti/immobili/fondi pensione mostrano il nome nella colonna "Ticker" invece che una cella vuota.

Bonus (introdotto dal fix, non nella lista dei 4 scenari ma verificabile): apri **Allocazione → Ribilancia/Versa/Preleva** e **Obiettivi → "Asset con quota ancora libera da assegnare"** con un conto corrente coinvolto — il nome NON deve apparire due volte (es. niente "Conto Corrente (Conto Corrente)").

**Verifica manuale utente (2026-07-28)**: screenshot di Allocazione → Preleva con alias "AGGH" impostato su un ETF obbligazionario — l'alias appare correttamente tra parentesi (`... (AGGH)`), e "Casa" (immobile, senza ticker) appare una sola volta senza doppione. Conferma che sia il resolver sia il fix anti-doppione in `buildHoldings` funzionano come previsto sui dati reali.

- **Cosa**: `getAssetDisplayTicker` (`lib/utils/assetDisplay.ts`) ha ora un terzo gradino di fallback — `displayTicker → ticker → name` — così gli asset senza ticker (conti correnti, immobili, fondi pensione) non arrivano più con un'etichetta vuota al grafico "Distribuzione per Asset" di Panoramica (causa anche di key React duplicate con ≥2 asset del genere) e agli altri consumatori del resolver (PDF, Allocazione, Obiettivi). Sweep dei 7 call site con fallback inline storici: rimossi quelli ridondanti (`DividendDialog`, `InstrumentTradeList`), corretta la violazione di convenzione in `AssetPriceHistoryTable` (`displayTicker ?? ticker` inline), e riparati due punti (`allocationUtils.ts::buildHoldings`, `GoalsHero`/`GoalBasedInvestingTab`) dove il nuovo fallback avrebbe fatto comparire il nome due volte in viste che mostrano nome+ticker fianco a fianco.
- **Perché**: decisione utente (2026-07-27, in sede di spec) — il fallback vive UNA VOLTA SOLA nel resolver centrale, niente nuovo campo alias per i tipi che non lo espongono nel form (cash/realestate/pensionFund). Coerente con la convenzione già in AGENTS.md → *Ticker Display Alias*: "mai inline `displayTicker ?? ticker`, solo `getAssetDisplayTicker`".
- **Nota**: il gotcha vero non era il resolver in sé (banale da estendere) ma i call site che combinano nome+ticker nella stessa vista (`"${label} (${ticker})"` in `allocationUtils.ts`, riga nome + riga ticker separata in `GoalsHero`) — lì il fallback su `name` avrebbe introdotto un doppione visibile ("Conto Corrente (Conto Corrente)"), non uno spazio vuoto come prima. Corretto passando `ticker: undefined` quando il valore risolto coincide col nome, invece di stampare comunque il risultato del resolver. `AssetPriceHistoryTable.tsx` risulta codice non montato da nessuna pagina attuale (nessun `<AssetPriceHistoryTable` in `app/`/`components/`) ma è stato comunque sistemato perché esplicitamente in scope. `pdfDataService.ts` e `GoalsHero`/`AssetCard`/`AssetManagementTab`/`AssetMovementsDialog` erano già a posto da lavoro precedente — la diagnosi della spec (scritta guardando linee specifiche) era in parte superata, confermato leggendo il contesto invece di applicare il diff alla cieca.

## Implementazione spec 6 — Selezione della Classe Asset per ETF + Classe Prevalente del Fondo Pensione — 2026-07-28

Branch `feature/asset-class-selection` (creato per errore da `main` invece che da `fix/session-bugfixes` — rebase eseguito a posteriori per riallineare la base, nessun conflitto sostanziale oltre a quello sul file poi cancellato, vedi cleanup sotto).

**Cosa è stato fatto**:
1. **`components/assets/AssetDialog.tsx`**: nuovo Select "Classe Asset" nello step 2 del create, visibile **solo** quando `selectedType === 'etf'` (riusa l'array `assetClasses` esistente, le 8 classi, default `equity` già impostato da `handleTypeSelect`), posizionato subito sotto "Cambia tipo". In **edit**, `onValueChange` del Select Tipo ora ri-deriva `assetClass` da `TYPE_TO_CLASS` quando il nuovo tipo **non** è `etf`; per `etf` la classe resta quella corrente (modificabile dal Select classe già presente in edit). Verificati gli effetti keyed sulla classe (default `isLiquid`/`autoUpdatePrice`, suggerimento `allocationRole`, sub-categorie): già corretti per un ETF classe `cash`, nessuna modifica necessaria.
2. **`lib/utils/assetDisplayClass.ts`** (nuovo): `resolveDisplayAssetClass(asset)` ritorna la classe prevalente (leg di composizione con percentuale maggiore), fallback su `asset.assetClass` se `composition` è vuota/assente; pareggio → prima leg in ordine di inserimento (sort stabile). Mai scrive `asset.assetClass` — solo display. `assetClassLegs` estratta per riuso (Rule of Three: era `assetLegs`/`toClassSlices` privata in `PensionAllocationCards.tsx`, che ora delega, comportamento invariato).
3. **`components/assets/AssetManagementTab.tsx`**: badge di riga, header di gruppo (desktop+mobile, stessa `groupedAssets` map) e ordinamento colonna Classe ora usano `resolveDisplayAssetClass(asset)` invece di `asset.assetClass`. Non toccato il check `asset.assetClass === 'realestate'` per il debito residuo (logica di business, non display).
4. **Allineamento convenzione stretta** (`type === 'cash' && assetClass === 'cash'`, decisione 4 della spec): `calculateStampDuty` in `assetService.ts` (un ETF classe cash paga sempre 0,2%, mai la regola flat conto corrente); picker conti di default in `app/dashboard/settings/page.tsx`. Non toccato (per esplicita decisione spec): `dashboardOverviewService.ts`, `assetPricing.ts`, `priceUpdater.ts`, `expandAssetExposure`, settlement/cash-picker (già stretti), snapshot.
5. Test nuovi: `__tests__/assetDisplayClass.test.ts` (6 casi: 70/30, fallback, pareggio in entrambe le direzioni, percentuali non a 100, tre leg) e `__tests__/assetService.test.ts` (4 casi su `calculateStampDuty`: conto vero sopra/sotto 5.000€, ETF classe cash sempre 0,2%, titolo normale 0,2%, esclusione venduti/esenti).

**Cleanup scoperto durante il testing manuale, stessa sessione**: l'utente ha notato che il tab "Storico Prezzi" di Patrimonio non esiste più da tempo (sostituito dal toggle "Andamento" con le colonne Δ già in `AssetManagementTab.tsx`). Sweep esaustivo (repo-wide, non solo `app/`/`components/`: import diretti, `next/dynamic`, barrel file — nessuno nel repo —, config, doc) confermato zero consumatori reali per `components/assets/{AssetPriceHistoryTable,AssetClassHistoryTable}.tsx`, `lib/utils/{assetPriceHistoryUtils,assetClassHistoryUtils}.ts` e il loro test dedicato (`__tests__/assetHistoryUtils.test.ts`) — tutti e 5 cancellati, più i 4 tipi ormai orfani in `types/assets.ts` (`AssetHistoryDisplayMode`/`AssetHistoryDateFilter`/`AssetHistoryTransformOptions`/`AssetHistoryTotalRow`) e i riferimenti stantii in `docs/{critique,audit}-prompts.md`, `AGENTS.md`, `CLAUDE.md`. La spec 9 (sopra) aveva già segnalato che `AssetPriceHistoryTable.tsx` non risultava montato da nessuna pagina, ma l'aveva comunque corretto perché citato esplicitamente nello scope — conferma indipendente della stessa diagnosi.

**Gate** (ri-eseguito dopo il rebase su `fix/session-bugfixes`): `npx tsc --noEmit` ✅ pulito. `npx vitest run` ✅ **76 file / 1328 test**. `npm run build` ✅ (Next.js 16.2.6, Turbopack).

**Come testare a mano** (i 3 scenari della spec):
1. **XEON come ETF classe cash**: Patrimonio → Aggiungi asset → tipo ETF → nello step 2 scegli classe "Liquidità" nel nuovo Select → ticker XEON → salva. In tabella badge "Liquidità", prezzo auto-aggiornato (no tint manual-price), **non** tra le card "Conti correnti"; in Impostazioni non compare nel picker conti default; bollo sopra 5.000€ allo 0,2% (non 34,20€ fissi).
2. **Fondo pensione con composizione**: imposta 70% obbligazioni / 30% azioni → tabella mostra "Obbligazioni" (badge, gruppo, ordinamento). Rimuovi la composizione → torna al fallback "Azioni".
3. **Edit: cambio tipo**: Azione → Criptovaluta: la classe segue automaticamente. Poi → ETF: la classe **non** cambia automaticamente e resta modificabile a mano.

- **Cosa**: Select classe asset per ETF in creazione (default equity, 8 classi), ri-derivazione classe al cambio tipo in edit (tranne per ETF), classe prevalente per display su asset compositi (fondo pensione), allineamento di 3 call site alla convenzione stretta cash-account, più — scoperta durante il testing manuale — rimozione di 5 file di codice morto (tab "Storico Prezzi" mai rimontato dopo un redesign precedente).
- **Perché**: XEON (ETF monetario) nasceva forzatamente `equity` in creazione, con l'unica alternativa (crearlo come "liquidità") che ne spegneva l'aggiornamento automatico del prezzo; il fondo pensione mostrava sempre "Azioni" in tabella indipendentemente dalla composizione reale. Il codice morto è stato trovato mentre si verificava manualmente l'effetto del fix sullo storico prezzi — l'utente ha notato che il tab corrispondente non esiste più in UI.
- **Nota**: il branch è stato creato per errore da `main` anziché da `fix/session-bugfixes` (l'errore emerso solo al momento del merge, per la presenza di `docs/specs/6-asset-class-selection.md` già committato su `fix/session-bugfixes` dalla sessione di analisi) — corretto con un rebase a posteriori (`git rebase fix/session-bugfixes`), un solo conflitto reale (`AssetPriceHistoryTable.tsx`, modify/delete, risolto mantenendo la cancellazione). Verificare comunque la base di partenza di un branch di fix con `git log --oneline -3` prima di iniziare, quando esiste un branch di lavoro dedicato oltre a `main`.

Attendo conferma prima di procedere con la prossima spec (10 — Rendimenti).

## Implementazione spec 10 — FASE 1: baseline data-driven + doppio conteggio CF + off-by-one TWR — 2026-07-28

Branch `fix/performance-calculations-phase-1` (da `fix/session-bugfixes`). Finding coperti: **A1, A2, A3, A10**. Le fasi 2→5 restano da fare, una per branch.

**Cosa è stato fatto**:

1. **Una regola sola al posto del branch indovinato** (`lib/services/performanceService.ts`, `calculatePerformanceForPeriod`): il primo snapshot del periodo è **sempre** la valutazione di partenza, mai un mese misurato — la finestra si apre il **1° del mese successivo**. Prima il codice sceglieva tra due comportamenti in base a `hasBaseline = ['YTD','1Y','3Y','5Y','CUSTOM'].includes(timePeriod) && length >= 3`, e il ramo "senza baseline" (cioè **sempre** per Storico) sbagliava due volte: raccoglieva i cash flow dal 1° del primo mese pur avendo in `startNW` il valore di **fine** di quel mese (A2 — gli stessi risparmi sottratti due volte in ROI e CAGR), e annualizzava n−1 rendimenti su n mesi (A3). Con la regola unica spariscono entrambi, e il caso con baseline resta identico bit per bit (con serie mensili continue `sortedSnapshots[1]` **è** il mese dopo `sortedSnapshots[0]`).
   - Bonus non richiesto ma gratuito: con un **buco** nella serie (`[Dic, Mar]`) la finestra ora si apre a gennaio, non a marzo — prima i cash flow di gennaio/febbraio uscivano dal calcolo pur essendo dentro quel rendimento.
   - Nuovo guard: due snapshot nello stesso mese → `hasInsufficientData` con messaggio esplicito, invece di metriche annualizzate su zero anni.
2. **`resolveHasBaseline` in `lib/utils/performanceBase.ts`** (decisione 2 della spec): risposta unica e data-driven alla domanda "il primo snapshot precede il periodo richiesto?". Confronto su indice mensile assoluto, `null`/`undefined` (ALL) → `false`.
3. **`resolveNominalPeriodStart` + `selectSnapshotWindow` + `selectSnapshotsForMetrics`** (service): l'inizio **nominale** del periodo (quello che il selettore *significa*: gennaio per YTD, 11 mesi fa per 1Y, il mese scelto per CUSTOM, `null` per ALL) è ora esplicito, esposto nel payload come `PerformanceMetrics.nominalPeriodStart` e riusato da `getSnapshotsForPeriod`. La finestra di selezione è una sola funzione (periodo + **un solo** mese prima), con un `referenceDate` iniettabile così che una singola computazione usi un solo orologio.
4. **`app/dashboard/performance/page.tsx` (A10)**: `periodSnapshots` non ripassa più da `getSnapshotsForPeriod` con le date che il service aveva già spostato (round-trip che per CUSTOM tornava giusto *per caso*, sottraendo un mese a una `startDate` già avanzata) — ora `selectSnapshotsForMetrics(cachedSnapshots, metrics)` rilegge la finestra dal payload. Il flag baseline di grafico Evoluzione e Underwater viene da `resolveHasBaseline` (unico `useMemo`, condiviso), non più da una lista di periodi **senza** il `length >= 3` che il service invece applicava: con esattamente 2 snapshot le due parti leggevano serie diverse.
5. **Ramo `else` di `calculateTimeWeightedReturn`**: `calculateMonthsDifference` è inclusiva, quindi annualizzava n−1 rendimenti su n mesi anche quando `periodMonths` non veniva passato. Ora sottrae il mese della valutazione iniziale (e `totalMonths <= 0` → `null`). Unico call site che percorre quel ramo: le finestre rolling — quindi **rolling CAGR e Sharpe cambiano già ora**, in anticipo sulla fase 3 (che chiederà di passare `periodMonths: windowMonths` esplicito: dopo questo fix è lo stesso numero, la fase 3 lo renderà solo evidente).
6. **Cache key `v2-`** (`buildCacheKey`): invalidazione una tantum. Gli snapshot non cambiano, ma i numeri sì — senza il bump l'utente avrebbe letto valori pre-fix fino a 6 ore. La cache key completa resta lavoro della fase 2.
7. **`types/performance.ts`**: nuovo `PeriodMonth` + campo `nominalPeriodStart` in `PerformanceMetrics` (serializzato in Firestore come mappa annidata, `FirestorePerformanceMetrics` lo eredita via `Omit`). È l'unico file fuori dall'elenco della fase 1, ed è la conseguenza diretta di "esporre l'inizio nominale nel payload `metrics` se serve" (spec, fase 1).

**Non toccato** (fasi successive): cache key completa e `?? 2.5` (fase 2), convenzione di fine mese e CF delle finestre rolling (fase 3), IRR (fase 4), filtro ±50%, annualizzazione su periodi corti, tooltip ROI/CAGR, serie "Investimenti", copy del drawdown (fase 5). Invariato anche tutto `performanceBase.ts` sul lato **esclusioni** (base configurabile e backfill E₀ del fix "Max Drawdown fantasma").

**Gate**: `npx tsc --noEmit` ✅ pulito. `npx vitest run` ✅ **77 file / 1355 test** (nuova suite `__tests__/performanceBaseline.test.ts`, 26 test). `npm run build` ✅ (Next.js 16.2.6, Turbopack).

**Test**: nuova suite `__tests__/performanceBaseline.test.ts` — `resolveHasBaseline` (6), `resolveNominalPeriodStart` (5, incluso l'invariante "inizio nominale = limite inferiore della finestra + 1 mese"), Storico/ALL (4: apertura al mese dopo, CF non doppio, annualizzazione, Max Drawdown invariato), YTD con e senza dicembre (3), 3Y su 14 mesi di storico (1), CUSTOM (3, incluso il buco nella serie e lo stesso-mese), `selectSnapshotsForMetrics` (3, incluso il non-risalire oltre il mese di baseline), **invariante Heatmap ↔ Underwater ricostruito da zero e confrontato < 1e-9** (1). Le serie crescono di un 1% mensile esatto: qualunque periodo deve annualizzare a 1,01¹² − 1 = 12,6825%, che è il modo più diretto per far fallire un off-by-one.
4 test preesistenti in `__tests__/performanceService.test.ts` aggiornati: codificavano la convenzione inclusiva del ramo `else` ("TWR deve coincidere col CAGR sui mesi di calendario"), cioè esattamente il bias A3. Riscritti sulla convenzione corretta + 1 test nuovo sul caso degenere.

**QUALI numeri cambiano** (non è una regressione, è la correzione — stesso precedente del Max Drawdown fantasma):
- **Storico (ALL)**: `numberOfMonths` −1; il periodo mostrato in hero/card parte dal mese **dopo** il primo snapshot; i cash flow del primo mese escono da Contributi/Prelievi/Entrate/Uscite; **ROI e CAGR salgono** dell'ordine dei risparmi di quel mese; **TWR sale** per la sola annualizzazione (~+1pp su ~40 mesi con crescita regolare). La catena dei rendimenti mensili è **identica**: heatmap, Underwater, Max Drawdown, volatilità **non cambiano di un centesimo**.
- **Periodi con solo 2 snapshot** (YTD a gennaio/febbraio su storico corto): stessa correzione, effetto proporzionalmente più grande.
- **Rolling 12M/36M**: CAGR invariato, **TWR e Sharpe rolling cambiano** (annualizzazione su `windowMonths` invece di `windowMonths + 1`).
- **Delta vs benchmark**: più coerente, non meno — il benchmark viene indicizzato su `[startDate, endDate]` e annualizzato con `numberOfMonths`, quindi ora entrambi i lati contano gli **stessi** mesi (prima, su Storico, il benchmark includeva un mese in più del portafoglio).
- **Invariati per costruzione**: YTD/1Y/3Y/5Y con baseline presente e storico più lungo della finestra — cioè il caso normale dell'account reale su tutti i periodi tranne Storico.
- **Grafico Evoluzione e Underwater**: quando il primo snapshot è davvero dentro il periodo (YTD senza lo snapshot di dicembre, 1Y/3Y/5Y su storico più corto della finestra) quel mese **ricompare** nei grafici — prima veniva scartato perché il flag era dedotto dal tipo di periodo.

**Come verificarlo a mano sui dati reali**:
1. Prima di deployare, annota da Rendimenti → **Storico**: TWR, ROI, CAGR, Contributi Netti, "Periodo" (le due date sotto l'hero) e il numero di mesi nella card omonima.
2. Dopo il deploy, apri Rendimenti e premi **Aggiorna** (il bump `v2-` invalida comunque la cache, il pulsante evita l'attesa): il "Periodo" deve iniziare **un mese dopo** rispetto a prima, il conteggio mesi calare di 1, i Contributi Netti calare esattamente dei risparmi netti di quel primo mese (confrontabili in Cashflow → Analisi filtrando quel mese), e TWR/ROI/CAGR salire di conseguenza.
3. **Controllo che nulla si sia rotto**: sempre su Storico, **Max Drawdown, mese del minimo, Underwater e Heatmap devono essere identici a prima** — se cambiano, il fix ha toccato la catena dei rendimenti e va fermato.
4. **YTD/1Y/3Y/5Y**: tutti i numeri devono essere **identici** a prima del deploy (l'account ha storico più lungo di ogni finestra e lo snapshot di dicembre).
5. **Riconciliazione**: apri "Rischio" → il minimo della curva Underwater deve coincidere col Max Drawdown della card, e componendo i mesi della Heatmap dal picco al minimo si deve ritrovare la stessa percentuale (l'invariante è ora anche un test automatico).
6. **Periodo personalizzato**: scegline uno che inizia in un mese di cui esiste lo snapshot precedente → il grafico Evoluzione deve partire dal mese scelto (non da quello prima); poi uno che inizia nel primo mese di storia dell'account → il primo mese deve **esserci**.

- **Cosa**: il primo snapshot di un periodo è ora sempre e solo la valutazione di partenza, e `hasBaseline` non è più indovinato dal tipo di periodo ma calcolato dai dati (`resolveHasBaseline`), con l'inizio nominale del periodo esposto nel payload e la pagina che rilegge da lì la stessa finestra del service invece di ricostruirsela da `new Date()`.
- **Perché**: l'euristica sbagliava tutte le volte che il primo snapshot disponibile non era quello che il tipo di periodo lasciava supporre — sempre per Storico (nessuna baseline, quindi doppio conteggio dei cash flow del primo mese e annualizzazione su un mese di troppo), e ogni volta che lo storico è più corto della finestra o manca lo snapshot di dicembre (il primo mese vero scartato dai grafici come se fosse una baseline).
**Verifica manuale utente (2026-07-28)**: confronto affiancato deployata vs localhost su **Storico**. Volatilità (10,90%), Max Drawdown (−10,06% @ 04/25), Durata Drawdown (6m, 01/25–07/25) e Tempo di Recupero (3m, 04/25–07/25) **identici** — la catena dei rendimenti mensili non si è mossa, il fix del Max Drawdown fantasma è intatto. L'unica metrica che cambia è lo **Sharpe, 1,97 → 2,03**: risk-free e volatilità sono uguali, quindi tutto il delta viene dal TWR (25,41% → 26,07%, +0,66pp). Invertendo l'annualizzazione, quel salto corrisponde a una finestra che si accorcia da n+1 a n mesi con **n ≈ 43** — gennaio 2023 → luglio 2026, cioè esattamente lo storico dell'account. Conferma quantitativa, non solo qualitativa.

- **Nota**: la regola unificata rende il branch `hasBaseline` **inutile dentro il service** — lì la domanda non si pone più, il primo snapshot si comporta sempre allo stesso modo. `resolveHasBaseline` resta consumato dalla **pagina**, dove la domanda è genuina (quel mese va disegnato o no?). Il campo `nominalPeriodStart` è `null` per ALL by design, e il codice che lo consuma deve trattarlo come "nessuna baseline possibile", non come dato mancante. `CLAUDE.md` non è stato toccato: la dichiarazione dei numeri che cambiano è qui e nel commit, e ha senso aggiornare Current Status quando la spec 10 sarà completa (o su richiesta).

## Implementazione spec 10 — FASE 2: cache key completa — 2026-07-28

Branch `fix/performance-calculations-phase-2` (da `fix/session-bugfixes`, che nel frattempo contiene la fase 1). Finding coperto: **A9**. Un solo file di codice + un commento di tipo + test.

**Cosa è stato fatto** (`lib/services/performanceService.ts`):

1. **`buildCacheKey` prende ora un oggetto** `{ snapshots, baseOptions, riskFreeRate, dividendCategoryId }` invece di due posizionali, e la chiave include:
   - **`hashSnapshotSeries`**: FNV-1a a 32 bit su **tutta** la serie ordinata cronologicamente (`anno-mese:round(patrimonio)`). Prima la firma copriva solo l'**ultimo** snapshot: correggere un mese storico non invalidava niente, pur riscrivendo rendimenti mensili, drawdown e TWR. Arrotondato all'euro (i centesimi ballano a ogni riconversione FX e farebbero girare la chiave per nulla) e ordinato prima di digerire (la stessa storia in ordine diverso è la stessa storia). `Math.imul` per restare in interi a 32 bit — con `*` i double perderebbero i bit bassi.
   - **`riskFreeRate`**: muove ogni Sharpe e il verdetto dell'hero costruito su di esso.
   - **`dividendIncomeCategoryId`**: decide cosa è contributo e cosa è rendimento del portafoglio → riclassifica i cash flow, quindi cambia ROI, CAGR, TWR e IRR.
   - Restano `snapshots.length`, ultimo mese e ultimo valore: una collisione del hash a 32 bit dovrebbe coincidere con tutti quelli insieme.
2. **`settings?.riskFreeRate || 2.5` → `?? 2.5`**: un risk-free rate 0% impostato deliberatamente (Sharpe = rendimento grezzo su volatilità) non viene più mangiato dal default.
3. **Commento riscritto secondo DEVELOPMENT_GUIDELINES → Caching** ("Always define: what invalidates the cache, and what happens if stale data is served"): elenco esplicito di cosa invalida, e cosa costa una lettura stantia (niente si corrompe — il payload è solo una proiezione ricalcolabile di Firestore; il TTL di 6h limita ogni buco; "Aggiorna" bypassa sempre). Il vecchio commento **mentiva**: diceva che includere `totalNetWorth` copriva l'aggiornamento di uno snapshot esistente, mentre copriva solo l'ultimo. Documentato anche il residuo noto non risolto (vedi sotto).
4. `types/performance.ts`: aggiornato il commento di `PerformanceCacheDocument.cacheKey`, che descriveva la vecchia composizione.

**Residuo noto, dichiarato ma NON risolto** (fuori dallo scope elencato dalla spec per questa fase): i confini dei periodi dipendono da **oggi**, quindi alla prima visita dopo un cambio di mese la cache descrive ancora la finestra del mese precedente, finché non scade il TTL di 6h o non arriva un nuovo snapshot. Si chiuderebbe aggiungendo l'anno-mese corrente alla chiave (un token), al prezzo di un ricalcolo per tutti a ogni rollover di mese. Da valutare, non incluso qui.

**Gate**: `npx tsc --noEmit` ✅ pulito. `npx vitest run` ✅ **77 file / 1366 test** (11 nuovi su `buildCacheKey`). `npm run build` ✅.

**Test** (`__tests__/performanceService.test.ts`, nuovo describe `buildCacheKey` — la funzione è ora esportata per poterla testare): stabilità a input uguali, indifferenza all'ordine, **cambio di uno snapshot storico** (il caso che la vecchia chiave non vedeva), cambio dell'ultimo valore, snapshot aggiunto, `riskFreeRate` cambiato, **0% distinto dal default 2,5%**, categoria dividendi cambiata (e rimossa), le due esclusioni della base (anche l'una distinta dall'altra), storico vuoto, rumore sotto l'euro ignorato.

**Nota sul gate della fase 1**: la fase 1 riportava "`tsc` pulito" — vero quando l'ho eseguito, ma l'avevo lanciato **prima** di scrivere `__tests__/performanceBaseline.test.ts`, che conteneva un `ExpenseType` inesistente (`'expense'` invece di `'variable'`). L'errore è emerso al primo `tsc` di questa fase ed è corretto qui. Il test passava comunque e le sue asserzioni non cambiano (entrambi i valori finivano nel ramo "non income" dell'aggregazione). Lezione: rilanciare `tsc` **dopo** aver scritto i test, non solo dopo il codice.

**Come verificarlo a mano**:
1. **Risk-free rate**: Impostazioni → cambia il tasso privo di rischio (es. 3,94 → 3,00) → salva → torna su Rendimenti **senza** premere Aggiorna. Lo Sharpe deve cambiare **subito**; prima restava fermo fino a 6 ore.
2. **Categoria dividendi**: Impostazioni → cambia la categoria di reddito "dividendi" → Rendimenti si aggiorna subito (Contributi Netti e Proventi Finanziari si riclassificano).
3. **Snapshot storico**: correggi il valore di un mese passato (non l'ultimo) → Rendimenti ricalcola alla visita successiva; prima serviva premere Aggiorna o aspettare la scadenza.
4. **Nessun ricalcolo inutile**: apri e riapri Rendimenti senza toccare nulla → deve restare istantaneo (cache hit): se ricalcolasse ogni volta, la chiave sarebbe instabile.

- **Cosa**: la chiave della cache di Rendimenti ora impronta **tutti** gli input da cui dipendono i numeri (intera serie di snapshot via hash FNV-1a, base delle metriche, risk-free rate, categoria dividendi) invece del solo ultimo snapshot + base; `|| 2.5` → `?? 2.5` per non mangiare uno 0% legittimo.
- **Perché**: la chiave vecchia lasciava passare tre modifiche che riscrivono le metriche a snapshot "uguali" — cambio del tasso privo di rischio, cambio della categoria dividendi, correzione di uno snapshot storico — servendo per 6 ore numeri calcolati da input diversi da quelli attuali.
- **Nota**: le fasi 1 e 2 messe insieme cambiano la chiave due volte (formato + prefisso `v2`); l'effetto pratico è una singola invalidazione totale al deploy, cioè un ricalcolo per utente. Il prefisso `v2` resta come leva manuale per il caso "stessi input, matematica diversa", che nessuna firma degli input può cogliere.

## Implementazione spec 10 — FASE 3: finestre rolling 12M/36M — 2026-07-28

Branch `fix/performance-calculations-phase-3` (da `fix/session-bugfixes`, che contiene già le fasi 1 e 2 — mergiate in fast-forward locale su conferma dell'utente). Finding coperto: **A4** (tre incoerenze).

**Cosa è stato fatto**:

1. **`endOfMonthBound(year, month)` in `lib/utils/dateHelpers.ts`** (nuova, come da spec): ultimo istante di un mese di calendario, `new Date(year, month, 0, 23, 59, 59, 999)` — il giorno 0 del mese successivo È l'ultimo di questo, dicembre incluso, senza dover sapere quanti giorni ha febbraio quest'anno. Sostituisce le 4 copie inline in `performanceService.ts`. (`lib/services/fireService.ts` ha una `getMonthEndDate` privata identica: non toccata, fuori scope, candidata a delegare.)
2. **A4.1 — l'ultimo mese della finestra non si perde più**: `periodEndDate` era `new Date(y, m-1, 1)`, cioè il **1° del mese a mezzanotte**, e il filtro di `getCashFlowsFromExpenses` (`date <= endDate`) buttava via **tutti** i movimenti del mese di chiusura. Ora è `endOfMonthBound(...)`, la stessa convenzione che le metriche di periodo usavano già: erano due convenzioni diverse nello stesso file, una delle due sbagliata.
3. **A4.2 — TWR e CAGR sulla stessa base temporale**: `calculateTimeWeightedReturn(windowSnapshots, cashFlows)` non riceveva `periodMonths`, quindi annualizzava sui mesi dedotti dagli snapshot mentre il CAGR della stessa riga usava `windowMonths`. Ora `windowMonths` è passato esplicito. (Dopo il fix del ramo `else` in fase 1 il numero coincide già: il passaggio esplicito lo rende dichiarato invece che accidentale, ed è ciò che la spec chiedeva.)
4. **A4.3 — niente doppio conteggio del primo mese**: i cash flow partivano dal mese dello snapshot di apertura, il cui valore di **fine mese** li contiene già. Ora la finestra si apre il 1° del mese **successivo**, esattamente come `calculatePerformanceForPeriod` dopo la fase 1. Rinominato `startSnapshot` in `valuationSnapshot`, perché è quello che è.
5. **Conseguenza sul payload**: `periodStartDate` ora è il **primo mese misurato**, quindi `periodStartDate` → `periodEndDate` copre esattamente `windowMonths` mesi (prima ne copriva `windowMonths + 1`). Nessun consumatore lo legge (`page.tsx` usa solo `periodEndDate`, per il filtro di periodo e l'asse X); l'unico effetto visibile è il tooltip dei grafici rolling, che mostra la data completa e ora dice "31/12/2024" invece di "01/12/2024" — cioè la fine vera della finestra. Commentata anche l'assunzione "snapshot mensili contigui" su cui l'aritmetica degli indici si appoggiava già senza dirlo.
6. `types/performance.ts`: commento sulla convenzione delle due date di `RollingPeriodPerformance`.

**Gate**: `npx tsc --noEmit` pulito (rilanciato **dopo** aver scritto i test, lezione della fase 2). `npx vitest run` **78 file / 1375 test** (9 nuovi). `npm run build` ok.

**Test**: nuova suite `__tests__/performanceRolling.test.ts` (`calculateRollingPeriods` è ora esportata). Le serie sono costruite perché la risposta giusta sia **zero**, così un movimento perso o contato due volte non si nasconde dietro un arrotondamento: patrimonio fermo che sale solo per un versamento nell'**ultimo** mese → CAGR 0 (prima +10%); entrata nel mese della valutazione iniziale → CAGR 0 (se entrasse: −4,76%); versamento a metà finestra neutralizzato; crescita esatta dell'1% mensile → CAGR = TWR = 1,01^12 − 1 su 12 e su 36 mesi; Sharpe ricostruito a mano da (TWR − risk free) / volatilità con TWR annualizzato su `windowMonths`; conteggio delle finestre e ampiezza esatta delle due date.

**Osservazione emersa dai test, non risolta (candidata fase 5)**: una serie con rendimenti mensili *identici* produce volatilità ~1e-14 invece di 0 esatto (rumore in virgola mobile), quindi la guardia `volatility === 0` di `calculateSharpeRatio` non scatta e lo Sharpe esplode a ~2×10^14. Irraggiungibile su dati reali (nessun portafoglio è così regolare), ma è la stessa famiglia dei casi degeneri che la fase 5 deve chiudere (`monthlyReturns.length < 2` → richiedere almeno 3 osservazioni).

**QUALI numeri cambiano**: solo i due grafici rolling in "Andamento"/"Rischio" (CAGR Rolling 12M e Sharpe Rolling 12M, più la serie 36M dove usata).
- **CAGR rolling**: cambia in tutte le finestre che contengono movimenti nell'ultimo mese (praticamente tutte) e in quelle con movimenti nel primo. La direzione dipende dal segno dei flussi, ma è sistematicamente **più vicina al rendimento vero** — prima un mese di risparmi finiva nel rendimento invece che nei contributi, gonfiandolo.
- **Sharpe rolling**: cambia sia per il TWR ricalcolato sia per la volatilità, che ora vede i cash flow del mese di chiusura e non legge più un versamento come un balzo di mercato.
- **Non cambia nient'altro**: hero, metriche di periodo, heatmap, Underwater, Max Drawdown, benchmark.

**Come verificarlo a mano sui dati reali**:
1. Rendimenti → sezione **Andamento** → "CAGR Rolling 12M": confronta la curva con quella deployata. I punti devono muoversi (di poco, ma muoversi) e la linea deve restare più vicina al TWR di periodo.
2. Passa il mouse su un punto: il tooltip mostra ora la **fine** del mese (es. 31/12/2024) invece del 1°. È l'unica modifica visibile all'etichetta.
3. **Controllo mirato**: scegli un mese in cui hai avuto un versamento grosso e isolato. Nella finestra rolling che si **chiude** in quel mese, il CAGR deployato è gonfiato da quel versamento (che non vedeva); in locale deve scendere verso il rendimento reale.
4. Il numero di punti dei grafici rolling deve restare identico (nessuna finestra guadagnata o persa).

- **Cosa**: le finestre rolling ora seguono la stessa convenzione delle metriche di periodo — si aprono il mese dopo la valutazione iniziale, si chiudono all'ultimo istante del mese finale, e annualizzano TWR e CAGR sugli stessi `windowMonths`. Estratta `endOfMonthBound` in `dateHelpers.ts`, che sostituisce 4 copie inline.
- **Perché**: il limite superiore a mezzanotte del 1° del mese scartava l'intero ultimo mese di spese ed entrate di ogni finestra, il TWR annualizzava su un mese in più del CAGR che gli stava accanto nella stessa riga, e i cash flow del primo mese venivano contati due volte come nel bug A2 delle metriche di periodo.
- **Nota**: `periodStartDate` cambia significato (primo mese **misurato** invece del mese della valutazione), ma nessun consumatore lo legge — verificato con grep: `page.tsx` usa solo `periodEndDate`. Se un domani servisse mostrare "da → a" per una finestra rolling, ora le due date sono già coerenti con l'etichetta "12 mesi".
