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
- [ ] Implementazione spec 6 (classe asset)
- [ ] Implementazione spec 10 (Rendimenti, fasi 1→5)

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

Attendo conferma prima di procedere con la prossima spec (6 — classe asset).
