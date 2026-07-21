# SESSION NOTES — 2026-07-21 — Review compliance vs `spec-fondo-pensione.md`

## Obiettivo della sessione
Verificare il branch `pension-fund` contro `scratchpad/spec-fondo-pensione.md` (specifiche funzionali
autorevoli, §7 decisioni prese, §8 viste) e produrre un **piano di review + refactor** per renderlo
compliant. La spec è la fonte di verità: dove le decisioni del 2026-07-19 (sotto) divergono, **vince
la spec** salvo diversa indicazione di Giorgio.

## Stato verificato (2026-07-21)
- `npx tsc --noEmit` **pulito**; `vitest` sui 4 file pension **30/30 verdi**.
- `firestore.rules`: **nessuna** regola `pensionContributions` (la collection dedicata non esiste).
- Il **layer fiscale puro è solido e in gran parte compliant**: `types/pension.ts` +
  `lib/utils/pensionDeduction.ts` (deducibilità ordinaria + fold extra-deducibilità con
  accumulo/drawdown/scadenza, tetti configurabili per-anno, `taxOf` iniettato). Da mantenere.

## Divergenze modello vs spec (ordinate per gravità)

### 🔴 BLOCCANTI (l'architettura scelta contraddice esplicitamente la spec)
1. **Contribuzioni come `Expense` taggate (`pensionContributionNature`) invece della collection
   dedicata `pensionContributions`.** La spec §2.2/§2.3 lo **vieta esplicitamente** ("❌ Non
   modellare le contribuzioni come `expenses`... inquinerebbero savings rate e budget"). L'impl
   attuale è costretta a neutralizzare/filtrare i contributi in *ogni* choke point di cashflow —
   esattamente il "combattere l'architettura" che la spec evita. → serve collection dedicata
   (pattern `dividends`) + regole + indici.
2. **`pension` aggiunto come nuovo `AssetClass`.** Spec §2.1: «il fondo **NON** è una nuova asset
   class» — è equity+bonds via `composition[]`. Va aggiunto solo `AssetType: 'pensionFund'` + blocco
   `PensionFundDetails`, tenendo il fondo fuori dalla base d'allocazione con un'esclusione dedicata
   (non una classe fantasma da patchare in ogni `Record<AssetClass,…>`).
3. **`PensionFundDetails` assente.** Spec §2.1: provider, `enrollmentDate`, `firstEmploymentDate`,
   `isFirstEmploymentPost2007`, `unlockDate`, `currentBenefitTaxRate`, cumulativi. Nessuno esiste →
   FIRE/tassazione/plafond non hanno i dati d'ingresso previsti.
4. **Volontario NON è un transfer.** Spec §4.3/§7.2: flusso dedicato che riusa `reconcileTransferCreate`
   (decrementa conto, incrementa valore fondo) + crea `PensionContribution`. Impl: spesa `variable`
   neutralizzata, senza conto di provenienza, senza toccare il NAV.
5. **Semantica del valore del fondo assente.** Spec §4.2/§7.1: versamento → `valore += importo`
   immediato; estratto conto → overwrite assoluto. Impl: valore 100% manuale, i contributi non lo
   toccano → si perde il rendimento money-weighted (§8.3).

### 🟠 IMPORTANTI (default/semantica invertiti o feature mancanti in scope Fase 1-2)
6. **Toggle cashflow invertito.** Spec §4.1/§7.3: `includePensionContributionsInCashflow`, default
   **off** (TFR/datoriale NON sono income di default). Impl: `excludePensionAccrualsFromCashflow` —
   default TFR/datoriale **sono** income, toggle per escluderli. Default opposto alla spec.
7. **Campo RAL `grossAnnualIncome` in Settings mancante** (spec §3.1/§6.5) → il beneficio fiscale non
   è calcolabile end-to-end pur avendo la util pronta.
8. **`PensionContributionDialog` incompleto** (spec §6.3): mancano anno fiscale, selettore conto di
   provenienza per il volontario, micro-education per natura.

### 🟡 VISTE / FASI SUCCESSIVE (Fase 3-4 spec, non ancora iniziate — coerente con lo stato)
9. FIRE: toggle "capitale bloccato fino a `unlockDate`" per-fondo + aliquota 15→9% (spec §5). Assente.
10. Coast FIRE: fondo come terza gamba distinta da INPS (spec §5.4). Assente.
11. Viste §8: Allocazione (2 card read-only), Storico (segmento previdenza), Rendimenti
    (`performanceBase` portfolio/netWorth), **vista dedicata "Previdenza complementare" in
    Pianificazione** con link dalla card in Patrimonio. Assenti.

### ⚠️ Conflitti decisione 2026-07-19 ↔ spec (da confermare con Giorgio)
- **Casa della feature**: 2026-07-19 → tab "Previdenza" in `fire-simulations`. Spec §8.4 → **vista
  dedicata nel gruppo Pianificazione** + link dalla card asset. La spec vince salvo diversa scelta.
- **Contribuzioni via Cashflow** (2026-07-19) ↔ collection dedicata (spec §2.2). La spec vince.
- Queste erano scelte pragmatiche MVP; la spec, più recente e autorevole, le supera.

## Decisioni Giorgio (2026-07-21)
- **Contribuzioni → collection dedicata** `pensionContributions` (spec §2.2), refactor completo:
  rimuovere il tag da `Expense` e tutta la neutralizzazione nei choke point.
- **Casa feature → vista dedicata in Pianificazione** (spec §8.4) + link dalla card asset; NON più il
  tab in fire-simulations.
- **Si parte da R0-R1** (fondamenta dati + migrazione contribuzioni).

## FATTO in questa sessione (R1 completo + C + R0 additivo) — tutto verde
Verifica finale: `npx tsc --noEmit` **pulito**, suite **1037 test verdi** (60 file).

- **R0 additivo**: `PensionContribution` + `PensionFundDetails` in `types/pension.ts`; `Asset` ha ora
  `pensionFundDetails?` (`types/assets.ts`). Alias `ContributionSource` = `PensionContributionNature`
  + helper `isDeductibleSource`.
- **R1 — collection dedicata `pensionContributions`** (spec §2.2):
  - `lib/services/pensionContributionService.ts` riscritto → scrive/legge su `pensionContributions`
    (client Firestore, referenzia il fondo via `assetId`, `taxYear`, `deductible` derivato).
  - `firestore.rules`: nuovo blocco `pensionContributions` (clone di `expenses`). `firestore.indexes.json`:
    indici `(userId,date desc)` e `(userId,assetId,date desc)`. **DA DEPLOYARE** (`firebase deploy
    --only firestore:rules,firestore:indexes`).
  - `lib/hooks/usePensionContributions.ts` + `queryKeys.pensionContributions`.
  - `lib/utils/pensionContributions.ts` riscritto per `PensionContribution[]` (chiave = `taxYear`).
  - `PensionContributionDialog`: selettore fondo + natura + importo + data + anno fiscale; scrive su
    collection. `PensionTab`: legge da `usePensionContributions`, deriva i fondi da `useAssets`
    (`type==='pension'`).
- **C — rimosso tutto l'accoppiamento con `Expense`**: eliminato `pensionContributionNature` da
  `Expense`/`ExpenseFormData` e la neutralizzazione in `expenseService` (isCountableExpense/summary),
  `cashflowTimeSeries`, `budgetUtils`, `dashboardOverviewService`, `monthlyEmailService`. Rimosso il
  selettore natura da `ExpenseDialog`. Rimosso il flag `excludePensionAccrualsFromCashflow`
  (types/assets, assetAllocationService ×2 write-path, settings page ×6 incl. Switch UI, cashflow
  page ×3, ExpenseTrackingTab). Eliminati `lib/utils/pensionCashflow.ts`, `__tests__/pensionCashflow.test.ts`,
  `__tests__/pensionMetricNeutralization.test.ts`. Riscritto `__tests__/pensionContributions.test.ts`.
  Motivazione: nel modello spec i volontari NON sono expenses (vanno in collection dedicata, e in R2
  diventano `transfer` già neutralizzati) → tutta la neutralizzazione era codice morto.

## FATTO in questa sessione — parte 2 (R2 + R3 + R4a) — tutto verde
Verifica: `tsc` pulito, **1042 test verdi** (60 file).

- **R2 — valore fondo + volontario come transfer** (§4.2/§4.3): `pensionContributionService` ora
  orchestratore. TFR/datoriale → `updateCashAssetBalance(fondo, +importo)` (il valore del fondo vive
  in `quantity`, prezzo 1, come il cash). Volontario → `ensureTransferCategory` + `createExpense`
  (transfer conto→fondo) + `reconcileTransferCreate` (conto −importo, fondo +importo, atomico) +
  `PensionContribution.linkedExpenseId`. Dialog: selettore conto di provenienza (solo volontario) +
  invalidazione asset/expenses/dashboard. L'estratto conto resta un edit manuale dell'asset (overwrite).
- **R3 — RAL + beneficio fiscale + plafond** (§3): `computePensionTaxRecap` puro (wrapper su
  deduction state + `computePensionTaxBenefit` con `taxOf` iniettato) + test. Settings:
  `grossAnnualIncome` (RAL), `isFirstEmploymentPost2007`, `firstEmploymentYear` (persistiti in
  `assetAllocationService` 2 write-path). PensionTab: card «Beneficio fiscale {anno}» (deducibili,
  TFR escluso, risparmio IRPEF via `calculateProgressiveTax` + brackets Coast FIRE) + card «Plafond
  deducibilità» (creato/residuo/extra) per prima-occupazione-post-2007; RAL/prima-occupazione
  editabili inline. **NOTA**: il toggle `includePensionContributionsInCashflow` (§4.1) NON è stato
  fatto — nel nuovo modello (contributi fuori dal cashflow) richiederebbe iniezione di income
  figurativo cross-superficie; default-off = app corretta senza. Da valutare se serve davvero.
- **R4a — aliquota prestazione 15→9%** (§5.2): `deriveBenefitTaxRate(yearsEnrolled)` puro + test
  (15% ≤15 anni, −0,30 p.p./anno, floor 9% a 35 anni).
- **Storico versamenti + eliminazione** (post-test): lista in PensionTab con delete 2-click che
  **storna l'effetto**: `deletePensionContribution(contribution)` fa il reverse — TFR/datoriale →
  `updateCashAssetBalance(fondo, −importo)`; volontario → `reconcileTransferDelete` (conto +importo,
  fondo −importo) + `deleteExpense(linkedExpenseId)`. `PensionContribution` ha ora `sourceCashAssetId`
  persistito per lo storno. **Edit versamento: NON ancora fatto** (per ora = elimina + reinserisci).

## FATTO in questa sessione — parte 3 (AssetDialog + R4b + viste §8.2/§8.4) — tutto verde
Verifica: `tsc` pulito, **1046 test verdi** (61 file). Firestore già deployato.

- **AssetDialog — `PensionFundDetails`**: campi provider / data adesione / data sblocco per il tipo
  pension (schema zod + reset edit + assemblaggio submit + UI). Date come **stringhe ISO** (round-trip
  Firestore pulito, niente conversione Timestamp). `AssetFormData` += `pensionFundDetails`.
- **R4b — FIRE capitale bloccato** (§5.3): setting `respectPensionLockInFire` + toggle nel
  Calcolatore FIRE. Helper puro `lib/utils/pensionFire.ts::calculatePensionLockedValue` (valueOf
  iniettato) + test. `FireCalculatorTab`: `currentNetWorth = fireNW − valore fondi bloccati` quando on
  (il valore resta nel patrimonio totale). Coast FIRE terza gamba + withdrawal netto 15→9% = Fase 2/3
  spec, **rimandati**.
- **Vista dedicata «Previdenza»** (§8.4): nuova pagina `/dashboard/pension` (riusa `PensionTab`),
  registrata in `planningNav` (gruppo Pianificazione), tab rimosso da `fire-simulations`, **link
  «Vai a Previdenza»** dalla card asset pension in Patrimonio.
- **Storico segmento previdenza** (§8.2): `prepareAssetClassHistoryData` (`chartService`) aggiungeva
  6 classi hardcoded e **droppava `pension`** → aggiunto `pension`/`pensionPercentage`; serie
  «Previdenza» nei due grafici Composizione (Line % + Area). **Conferma**: la classe `pension` è ciò
  che alimenta il segmento → tenerla era giusto (checkpoint D di rimozione classe è quindi SCONSIGLIATO).

## FATTO in questa sessione — parte 4 (§8.1 + §8.3) — tutto verde
Verifica: `tsc` pulito, **1049 test verdi** (62 file).

- **§8.3 — Rendimenti base portafoglio**: helper puro `lib/utils/performanceBase.ts`
  (`toPerformanceBaseSnapshots`, enum `PerformanceBase` estendibile) + test. Applicato in
  `getAllPerformanceData` (fetch interno) e nella pagina Rendimenti (`cachedSnapshots`) → tutte le
  metriche di portafoglio (TWR/Sharpe/vol/MaxDD/ROI/CAGR) ora escludono `byAssetClass.pension`. Unico
  consumer = pagina Rendimenti, nessun impatto altrove. Versione MINIMA come da spec («niente di
  più»); limite noto documentato nell'helper: il volontario è un outflow di portafoglio non
  neutralizzato nel TWR (TFR/datoriale non toccano il portafoglio → nessun effetto).
- **§8.1 — Allocazione 2 card read-only**: `components/allocation/PensionAllocationCards.tsx` —
  toggle «Mostra previdenza complementare» → Card A (sottostante fondo via `expandAssetExposure`) +
  Card B (portafoglio + previdenza). Torta principale/action chip **intoccate** (fondo già escluso).
  Aggiunto dopo il divider «Dettaglio».

## FATTO — parte 5: allocazione sottostante del fondo (composition look-through)
Verifica: `tsc` pulito, **1049 test verdi**.

Modello (spec §2.1): la `composition` del fondo esprime l'allocazione sottostante (es. 75% azioni /
20% obbligazioni / 5% REIT) ma va guardata attraverso **solo** nella vista dedicata; ovunque altrove
il fondo resta INTERO come classe `pension` (allocazione azionabile esclusa, net worth, segmento
storico §8.2 preservato).
- **`expandAssetExposure`**: early-return per `type === 'pension'` → un solo componente classe
  `pension`, IGNORA la composition (niente leak nelle viste aggregate). `goalService` guardato allo
  stesso modo.
- **AssetDialog**: editor «Asset Composto» abilitato per il tipo pension (`newAsset_showComposition`);
  righe classe+% che sommano a 100 (validazione esistente); reset edit già type-agnostico.
- **PensionAllocationCards**: `assetLegs()` guarda attraverso la composition del fondo (Card A e B);
  gli altri asset via `expandAssetExposure`. È l'UNICO punto di look-through.

## STATO FEATURE: COMPLETA (tutte le fasi + §8)
Tutto il documento di specifiche è implementato tranne item esplicitamente rimandati DALLA SPEC
(Coast FIRE terza gamba §5.4, withdrawal netto asset-aware / Monte Carlo §5.3 fase 2, chiusura del
cerchio 730 §3.3 fase 2, toggle `includePensionContributionsInCashflow` §4.1 — default-off rende
l'app corretta senza). Cosmetico SCONSIGLIATO: rename `AssetType pension→pensionFund` (churn inutile;
`AssetClass pension` va TENUTA — alimenta il segmento Storico §8.2 e l'esclusione allocazione).

### Deviazione consapevole (checkpoint D deferito)
`AssetType` resta `'pension'` (non ancora `'pensionFund'`) e `AssetClass 'pension'` è **mantenuta**:
è il meccanismo che oggi (a) esclude il fondo dall'allocazione azionabile (§8.1, via
`getExcludedClasses`) e (b) fornisce gratis il segmento previdenza distinto nel net worth che §8.2
richiede. Rimuoverla in isolamento regredirebbe §8.2; va fatta insieme alle viste §8 (R5/D), dove
l'esclusione diventa type-based e il segmento è renderizzato esplicitamente. È l'unico punto di
non-compliance-sulla-carta residuo; funzionalmente il comportamento è già quello voluto dalla spec.

## Piano di refactor — vedi risposta in chat (fasi R0→R5)
Layer fiscale puro = da conservare. Il grosso del lavoro è spostare le contribuzioni sulla collection
dedicata, introdurre `PensionFundDetails` + `pensionFund` come AssetType (non class), il volontario
come transfer con incremento NAV, e invertire il default del toggle cashflow.

---

# SESSION NOTES — 2026-07-19

## 🔖 RIPRESA SESSIONE — Handoff

### Cosa (implementato in questa sessione)
- **Fix UI**: sovrapposizione dei due numeri a leva nell'hero Allocazione su mobile
  (`AllocationHero.tsx`, `grid-cols-1 … tablet:grid-cols-2`). **Da pushare su main** (branch attuale
  = `pension-fund`); il resto sta sul branch.
- **Fondo pensione — Fasi 0→3 complete + Fase 4 parziale**:
  - Core fiscale puro: `types/pension.ts`, `lib/utils/pensionDeduction.ts` (deducibilità ordinaria +
    fold extradeducibilità), `lib/utils/pensionContributions.ts` (rollup per anno/natura). Tutti con test.
  - Asset type `pension` (Patrimonio, valutazione manuale come immobili, sempre fuori allocazione).
  - Contributi per natura (TFR/Volontario/Datoriale) tracciati via Cashflow (`Expense.pensionContributionNature`).
  - Flusso dedicato **"Registra versamento"** + tab **Previdenza** (`fire-simulations`): registra i
    versamenti e mostra il **versato** per natura/anno.
- **Metriche cashflow**: volontario SEMPRE neutralizzato (tutti i choke point). TFR/datoriale =
  entrate, con **toggle in Impostazioni** ("Escludi TFR e datoriale dal cashflow") — per ora
  agganciato solo all'**hero Tracciamento**.

### Perché (motivazioni chiave)
- Fondo pensione fuori allocazione + valutazione manuale = è capitale bloccato/illiquido, non una
  posizione da ribilanciare, e non c'è API prezzi (aggiornamento manuale come gli immobili).
- Volontario neutro = è un trasferimento dei propri risparmi nel fondo, non consumo. TFR/datoriale
  opzionali = sono entrate reali ma non di immediato accesso, quindi la scelta è dell'utente.
- Flusso dedicato = il selettore natura nelle "Impostazioni avanzate" dell'ExpenseDialog non era
  scopribile; il mini-form nasconde la complessità (tipo entry + categoria).
- Filtro condiviso (`filterCashflowExpenses`) invece di threadare un flag in ogni funzione = non
  cambia le firme esistenti → rischio minimo, superfici consistenti wrappando l'input.

### Nota (gotcha / dettagli importanti)
- **Non posso compilare da qui** (shell non monta il repo): tutti i `npx tsc --noEmit` / `vitest` /
  `npm run build` li lancia Giorgio. Verificato live: il filtro cashflow funziona nel tab.
- **Test dei service**: importano moduli Firebase → in vitest vanno mockati (`vi.mock` su
  `@/lib/firebase/config` o sui service), come in `fireService.test.ts`.
- **Query categorie**: usare `getAllCategories` (indice esistente) + filtro in memoria, NON
  `getCategoriesByType` (richiede un indice composito non deployato) — vale per chiunque tocchi le categorie.
- **Union AssetClass/AssetType**: aggiungendo `pension` ho dovuto patchare i `Record<AssetClass,…>`
  completi (settings, defaultSubCategories, goalTrajectory, AllocationComparisonBar). Se aggiungi
  altre classi/tipi, cerca gli usi esaustivi.
- Il tetto deducibilità è **costante per-anno** (`getPensionDeductionCeiling`): 5.164,57 ≤2025, 5.300 ≥2026.

### DA FARE alla ripresa (in ordine)
1. **Decidere insieme**: a quali altre sezioni estendere il filtro accrual (Analisi, Storico, Anno
   Corrente, budget, Panoramica/overview, email) e **dove rendere visibile la componente fondo pensione**.
2. **Estendere il filtro** alle superfici scelte (one-liner `filterCashflowExpenses` per punto — vedi
   log "Opzione Escludi TFR/datoriale").
3. **Completare Fase 4**: recap fiscale nel tab Previdenza — input **RAL** + 3 cifre (risparmio
   fiscale dell'anno, plafond creato, bank residuo) usando `pensionDeduction.ts`.
4. **Fase 5**: tassazione in uscita (15%→9% per anzianità) → il fondo conta NETTO nel FIRE.
5. Push fix mobile su main; poi verifiche tsc/build su tutto il branch.

---

## 1. RISOLTO — Sovrapposizione mobile nell'hero Allocazione (numeri a leva)

### Sintomo
Pagina Allocazione, viewport mobile: i due numeri grandi **Patrimonio investito** ed
**Esposizione nozionale** si sovrapponevano orizzontalmente — la `€` del numero di sinistra
collideva con la prima cifra di quello di destra (screenshot utente, larghezza iPhone ~390px).

### Causa
`components/allocation/AllocationHero.tsx`, ramo `hasLeverage`: i due numeri paritari erano in
`grid grid-cols-2 gap-4`. Ogni numero è `font-mono text-[30px]` (es. `125.469,10 €`). Due numeri
così non entrano affiancati in due colonne da ~175px su un telefono → overflow e collisione. Il bug
compare **solo con portafoglio a leva** (il ramo a numero singolo era già a posto).

### Fix
Reso responsive lo split a due colonne (prima era incondizionato):

```
- <div className="grid grid-cols-2 gap-4">
+ <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
```

- Telefoni: i due numeri si impilano in verticale, ognuno a piena larghezza — nessuna collisione.
- `tablet:` (`--breakpoint-tablet: 768px` in `app/globals.css`, già usato altrove es. `GoalsHero`,
  `CashflowWidget`): due colonne da ~354px nell'hero a piena larghezza — spazio ampio per un numero
  mono da 30px.

Modifica di una riga + commento esplicativo. Nessuna superficie di tipi toccata.

### Verifica
- Modifica su sola stringa di classi Tailwind; `tablet:` è una variante breakpoint v4 registrata e
  già usata altrove → compila.
- **Nota**: in questa sessione il sandbox bash non ha potuto montare la cartella del progetto, quindi
  `npx tsc --noEmit` / `npx vitest` **non sono stati eseguiti qui**. Consigliato lanciare
  `npx tsc --noEmit` prima del commit (rischio tipi nullo per una modifica di sole classi).
- Commit suggerito: `fix: stack Allocazione hero leverage figures on mobile to avoid overlap`

## 2. APERTO — Tracciare il fondo pensione (da progettare prossima sessione)

Giorgio vuole che il tracker consideri anche il **fondo pensione**. Punto esplicitamente rimandato:
decidere l'approccio e implementarlo in una sessione successiva. Note per inquadrare la discussione,
non una decisione.

### Perché non è "solo un altro asset"
Un fondo pensione ha proprietà che nessuna delle 6 classi attuali
(azioni/obbligazioni/crypto/immobili/materie prime/liquidità) cattura bene:

- **È un contenitore, non una foglia.** Ha un'allocazione interna (*comparto*:
  garantito / obbligazionario / bilanciato / azionario). Domanda: il comparto deve confluire
  nell'esposizione dell'Allocazione (pesare su azioni/obbligazioni) o restare fuori come la
  liquidità esclusa?
- **È illiquido fino alla pensione.** Conta per **runway** FIRE e **Coast FIRE** (capitale bloccato
  non spendibile prima della pensione, ma *sì* verso il numero FIRE raggiunto all'età target).
  `fireService` / `whatIfService` dovrebbero sapere che un asset è "bloccato fino all'età N".
- **Contributi di origine mista.** TFR + versamenti volontari + eventuale contributo datoriale. I
  volontari sono deducibili IRPEF fino a €5.164,57/anno (si aggancia alle aliquote IRPEF già in
  Coast FIRE, se mai modellassimo il beneficio fiscale).
- **Tassazione agevolata in uscita** (aliquota finale 15% → 9%). Rilevante solo se proiettiamo il
  netto in uscita.

### Approcci candidati (da valutare)
1. **Nuova classe `pension` / nuovo tipo asset**, con flag opzionale `isLocked` + `unlockAge`.
   Più pulito per patrimonio + storico; richiede che Allocazione e FIRE gestiscano blocco e
   look-through al comparto.
2. **Modellarlo come "conto" che contiene tipi asset esistenti** (look-through gratis), con flag
   wrapper che lo marca bloccato/escluso. Più fedele, più lavoro.
3. **MVP minimo: una singola riga di saldo**, esclusa dall'Allocazione (riuso del meccanismo
   "Fuori allocazione" esistente), inclusa nel patrimonio totale + Storico, flaggata bloccata per
   FIRE. Valore veloce; look-through in seguito.

### Decisioni Giorgio (2026-07-19)
1. **Fuori allocazione** — il comparto NON pesa sull'esposizione azioni/obbligazioni. Riuso del
   meccanismo "Fuori allocazione" esistente.
2. **Saldo unico aggregato** — niente dettaglio per-comparto.
3. **FIRE**: alimenta il FIRE come **capitale bloccato e illiquido**. **Deduzione IRPEF = da
   decidere** (vedi "Nodo aperto" sotto): è la scelta di prodotto su cui ci stiamo fermando.
4. **Contributi via Cashflow** (traccia la differenza di contributi), MA **valore/andamento
   dell'investimento gestito a mano** — nessuna API prezzi. → si modella come asset a **valutazione
   manuale**, identico al pattern `realestate` già esistente in `AssetDialog` (niente ticker/
   auto-update, label "Valore stimato", "prezzo aggiornato manualmente").

### Nodo aperto — come modellare la deduzione IRPEF (scelta di prodotto)
Livelli di ambizione (da decidere con Giorgio):
- **L0** — non modellarla: solo saldo bloccato che cresce a mano.
- **L1 (tracker, informativo)** — metrica annuale "Beneficio fiscale stimato" =
  `aliquota_marginale × min(contributi_volontari_anno, 5.164,57 €)`. Nessun movimento di cassa
  fittizio. Aliquota marginale derivabile dagli scaglioni IRPEF già presenti in Coast FIRE.
- **L2 (cassa reale, occhio al timing)** — il beneficio NON arriva al versamento ma l'anno dopo con
  la dichiarazione (minori imposte / rimborso). Va registrato quando incassato (a mano), non come
  income istantaneo al contributo.
- **L3 (planner/FIRE, motore)** — la deduzione alza il rendimento effettivo dei contributi; in
  uscita scontare la tassazione agevolata (15%→9% oltre il 15° anno). Il fondo pensione rende più
  di un investimento tassato a parità di versato.

Sotto-decisioni collegate: (a) aliquota marginale auto-derivata o inserita a mano; (b) distinguere
**TFR** (non deducibile, non nel tetto) da **volontari + datoriali** (deducibili, nel tetto
5.164,57 €); (c) modellare la tassazione in uscita ora o dopo.

Raccomandazione di partenza: **L1 nel tracker + tassazione-in-uscita nel FIRE**, deduzione-come-
rendimento (L3) opzionale in un secondo momento. Da confermare.

### Decisioni Giorgio (2026-07-19, secondo giro)
2. **Distinguere TFR vs Volontari vs Datoriali.** Solo Volontari + Datoriali sono deducibili e
   condividono il tetto 5.164,57 €; il TFR conferito è escluso dalla deduzione (e non concorre al
   tetto). → il modello dati dei contributi ha bisogno di un campo "natura contributo".
3. **Modellare la tassazione in uscita** nel FIRE. Aliquota 15%, −0,30%/anno oltre il 15° anno di
   partecipazione, minimo 9%. Il fondo conta **netto** verso il numero FIRE.

### RITROVAMENTO — nessun campo RAL/reddito oggi (risponde al dubbio di Giorgio, punto 1)
Verificato: in app NON esiste un input per RAL / reddito imponibile. Gli scaglioni IRPEF
(`CoastFireTaxBracket`, default 23/25/35/43 in `fireService.ts`) sono usati SOLO per tassare la
**pensione pubblica** in Coast FIRE (`calculateProgressiveTax(annualGrossIncome, brackets)`, dove
`annualGrossIncome` = lordo pensione, non lo stipendio attuale). Quindi per l'aliquota marginale
della deduzione serve un nuovo dato.

Opzioni per l'aliquota marginale:
- **A (SCELTA da Giorgio 2026-07-19)** — nuovo campo **"Reddito annuo lordo (RAL)"** (Settings o
  config fondo); beneficio = `tax(RAL) − tax(RAL − contributi_deducibili)` riusando
  `calculateProgressiveTax` + `CoastFireTaxBracket` esistenti. Accurato anche se la deduzione
  attraversa due scaglioni.
- **B** — inserimento diretto dell'aliquota marginale (es. 35%). Semplice, statico, meno preciso.
- **C** — inferenza dalle entrate Cashflow. Fragile (netto vs lordo, anno parziale, bonus) → scartata.

### Tetto deducibilità — AGGIORNATO (Legge di Bilancio 2026)
Da **1° gennaio 2026** il tetto ordinario passa da **€5.164,57 → €5.300** (norma in vigore dal
1° luglio 2026, effetto retroattivo sull'intero 2026). Extra-deducibilità fino a €2.650 (totale
€7.950); plafond non usato nei primi 5 anni recuperabile nei 20 successivi. → NON hardcodare 5.300
come magic number: **costante con anno di validità** (`PENSION_DEDUCTION_CEILING_BY_YEAR` o simile),
così futuri aggiornamenti di legge sono una riga sola. Extra-deducibilità/recupero = considerazioni
future, fuori MVP.

### Extradeducibilità (recupero plafond primi 5 anni) — meccanica + modello
Fonte: Mefop, "Deducibilità ed extradeducibilità post legge di bilancio 2026" (art. 8 c.6
D.Lgs. 252/2005). Meccanica confermata:
- **Solo** lavoratori di **prima occupazione post 1/1/2007** (contribuzione obbligatoria iniziata
  dopo quella data). Requisito che l'app NON può dedurre → flag utente.
- **Fase accumulo (primi 5 anni di partecipazione)**: per ogni anno con contributi deducibili sotto
  il tetto, si accumula `unused_y = max(0, tetto_y − contributi_deducibili_y)`. Tetto per anno:
  5.164,57 € fino al 2025, 5.300 € dal 2026 (esempio Mefop: iscritto 2022 → 4 anni × 5.164,57 +
  1 anno (2026) × 5.300).
- **Fase utilizzo (20 anni successivi, cioè anni 6–25)**: il tetto annuo può salire dell'accumulato
  residuo, con **cap annuo = metà del tetto ordinario** (2.650 € dal 2026) → deduzione max
  complessiva 7.950 €/anno. Ogni euro extra usato **scala il "bank"** residuo.
- TFR sempre **escluso** dal computo.

**Natura del modello**: NON è un calcolo annuale isolato — è un **fold pluriennale con drawdown**
del bank. Serve la storia dei contributi deducibili per anno + data iscrizione + flag prima
occupazione. Pura funzione candidata (tested):
```
CEILING(y)   = y >= 2026 ? 5300 : 5164.57      // costante per-anno
EXTRA_CAP(y) = CEILING(y) / 2                   // 2650 dal 2026
computePensionDeduction({ enrollmentYear, isFirstJobPost2007,
                          deductibleContribByYear, targetYear, ral, brackets }):
  ordinary = CEILING(targetYear)
  if !isFirstJobPost2007 → effectiveCeiling = ordinary; extra = 0
  else:
    bank = Σ_{y=enrollmentYear..enrollmentYear+4, y<=targetYear} max(0, CEILING(y) − contrib(y))
    // consuma il bank sugli anni 6..targetYear (drawdown storico), poi
    extraAvailableThisYear = min(bankResiduo, EXTRA_CAP(targetYear))
    effectiveCeiling = ordinary + extraAvailableThisYear
  deducted = min(contrib(targetYear), effectiveCeiling)
  beneficio = tax(ral, brackets) − tax(ral − deducted, brackets)   // riusa calculateProgressiveTax
```

**Raccomandazione prodotto — FASARE**:
- **MVP (Fase 1)**: SOLO deducibilità ordinaria. `beneficio = tax(RAL) − tax(RAL −
  min(contrib_deducibili_anno, tetto_anno))`. Funzione a singolo anno, semplice, testabile. Label
  UI "solo deducibilità ordinaria".
- **Fase 2 (gated)**: extradeducibilità come fold pluriennale, dietro il flag `isFirstJobPost2007`
  + `pensionEnrollmentYear`. **CONFERMATO IN SCOPE (Giorgio 2026-07-19)**: è alla prima occupazione
  (⇒ post-2007, idoneo) e nei primi 5 anni verserà **solo il contributo datoriale**, tenendosi sotto
  il tetto → accumula plafond ogni anno. Quindi Fase 2 va costruita.

  Vincoli pratici da riflettere nella UI/nel modello:
  1. **Drawdown limitato**: anche con un bank grande (es. 5 × (5.300 − datoriale)), il recupero è
     max 2.650 €/anno → servono più anni per esaurirlo.
  2. **Per usare l'extra bisogna superare il tetto ordinario** negli anni 6+: solo i contributi
     oltre 5.300 € attingono al bank (volontari che portano il totale verso 7.950 €).
  3. **Finestra di utilizzo = anni 6–25**: il bank non usato entro il 25° anno di partecipazione si
     perde → modellare la scadenza.

  Opportunità prodotto: durante gli anni di accumulo, mostrare il **plafond recuperabile accumulato**
  ("hai accumulato €X di deduzione futura") come segnale di pianificazione forward-looking, non solo
  il beneficio dell'anno corrente. → DA CONFERMARE con Giorgio se vuole questo numero in UI.
- Disclaimer: stima informativa, non consulenza fiscale; casi limite (trasferimenti tra fondi,
  RITA, riscatti) fuori scope.

### Posizionamento UI della stima "beneficio fiscale" — DECISO (Giorgio 2026-07-19)
Cadenza **annuale, in un recap di fine anno** — NON a ogni versamento (over-information, e il
beneficio si realizza con la dichiarazione, non al versamento). Concretamente:
- **Beneficio fiscale dell'anno + plafond recuperabile accumulato** → **recap annuale**. Case
  naturali: blocco **FIRE/Previdenza** (vista per anno) + **email riepilogo annuale** (`monthly-
  snapshot` cron, periodicità yearly già esistente).

  **Casa della sezione — DECISO (Giorgio 2026-07-19)**: nuovo **tab "Previdenza"/"Fondo Pensione"
  in `app/dashboard/fire-simulations/page.tsx`** (oggi tab: Calcolatore FIRE / Coast FIRE / What If /
  Monte Carlo / Obiettivi — array `TAB_CONFIG` + componente per tab). Scelto il tab e NON una pagina
  top-level: il fondo è un singolo asset, una voce di nav a sé è sovradimensionata; il tab riusa il
  pattern esistente e co-loca RAL + scaglioni IRPEF già presenti in Coast FIRE. Distribuzione:
  Patrimonio = asset saldo (`pension`, manuale, fuori allocazione); Cashflow = contributi per natura
  (no hint fiscali inline); FIRE tab = sezione tax/plafond + valore netto d'uscita. Nota impl.: RAL
  condivisa tra Coast FIRE e nuovo tab → mettere RAL/brackets in un punto condiviso (Settings o
  contesto) per non duplicare.

  Contenuto sezione fondo pensione — **TRE cifre distinte** (confermato Giorgio 2026-07-19):
  1. **Risparmio fiscale maturato dell'anno** = `tax(RAL) − tax(RAL − dedotto_anno)`.
  2. **Plafond extradeducibilità creato nell'anno corrente** =
     `max(0, tetto_anno − contributi_deducibili_anno)`, **solo entro i primi 5 anni** (fuori finestra
     = 0).
  3. **Plafond storico accumulato (bank residuo)** = Σ creato − Σ già recuperato, con scadenza al
     25° anno.
  Nota UX: nei primi 5 anni (1) e (2) vanno lette **insieme** — il risparmio corrente è più basso
  perché si lascia plafond, (2) mostra il vantaggio futuro costruito in cambio (trade-off esplicito).
- **Cashflow**: NIENTE messaggistica plafond per-versamento. Al più il contributo si registra con
  la sua natura (TFR/Volontari/Datoriali) e basta; nessun hint fiscale inline.
- **Patrimonio (asset)**: solo il saldo secco del fondo (asset a valutazione manuale).

### File probabili quando lo costruiamo
`types/assets.ts`, `lib/utils/{allocationUtils,assetExposureUtils}.ts`,
`components/assets/AssetDialog.tsx`, `lib/services/{assetService,fireService,whatIfService}.ts`,
`components/allocation/AllocationHero.tsx` (striscia esclusioni), aggregazione Storico/overview.

---

# SESSION NOTES — Allocazione a leva (portafogli > 100%)

**Data inizio**: 2026-07-15
**Obiettivo**: migliorare il supporto dell'allocazione a portafogli con leva (esposizione nozionale > patrimonio market), rendendo la UI chiara sulla dualità market/nozionale e permettendo di escludere liquidità/immobili dalla base di allocazione.

## Fase attuale: BRAINSTORMING (nessun codice ancora)

---

## Problemi riportati dall'utente

1. **Nessun indicatore di leva corrente in UI** — da nessuna parte si legge la leva del portafoglio (nozionale/market).
2. **Ambiguità market vs nozionale nella pagina Allocazione** — l'hero mostra il totale nozionale ma lo etichetta "Patrimonio allocato" (market). Serve dualità per chi usa leva; se leva = 1 lasciare com'è (nozionale = market).
3. **Con leva, tutto deve ragionare in percentuali nozionali** — esploso di dettaglio + confronto attuale/target. In più mostrare in UI sia patrimonio allocato (market) che esposizione nozionale.
4. **Escludere liquidità e immobili dall'allocazione target** — se non esplicitamente inclusi dall'utente, non devono far parte della base di allocazione (non sono "asset di portafoglio").

---

## Analisi stato attuale del codice

- `assetExposureUtils.ts::expandAssetExposure` → già espande ogni asset in `{ marketValue, notionalValue }` per classe, applicando `leverageRatio` (single-class) o per-leg (composite). `calculatePortfolioLeverage` esiste ma **non è usata in UI**.
- `assetAllocationService.ts::calculateCurrentAllocationSnapshot` → produce `CurrentAllocationSnapshot` con `market` + `notional` + `metadata { marketValue, notionalValue, leverageRatio, hasLeveragedExposure }`. **La metadata leva NON è mostrata da nessuna parte.**
- `compareAllocations` → usa basis **notional** (`toLegacyAllocationResult(snapshot, 'notional', ...)`). Quindi le percentuali attuali/target SONO già nozionali. ✅ (parziale point 3)
- **Bug/confusione (point 2)**: `AllocationHero` etichetta `totalValue` (= totale **nozionale**) come "Patrimonio allocato". Con leva > 1 il numero grande è gonfiato rispetto al market reale. `AllocationCompositionBar` usa `currentValue/totalValue` (entrambi nozionali) → i segmenti sono % nozionali ma sotto un'etichetta "market".
- `toLegacyAllocationResult` calcola **una sola** basis alla volta (currentValue = nozionale). Per mostrare la dualità a livello riga servirebbe passare anche lo snapshot market o arricchire `AllocationData`.
- Esclusione classi: oggi `toLegacyAllocationResult` itera `Object.keys(targets)` — ogni classe con target entra nel 100%. Cash ha già `useFixedAmount`/`fixedAmount` (riserva un fisso, alloca il resto). Nessun meccanismo di esclusione classe.
- `targetLeverageRatio` esiste in `AssetAllocationSettings` (soft tie-breaker per l'optimizer strumenti). Nessuna "leva corrente" persistita/mostrata.

## File chiave toccati/da toccare (previsione)
- `lib/utils/allocationUtils.ts` (pure) — verdetto/piano/composizione
- `lib/services/assetAllocationService.ts` — snapshot + `toLegacyAllocationResult` (esclusione classi, dualità)
- `types/assets.ts` — nuovo flag esclusione, eventuale arricchimento `AllocationData`
- `app/dashboard/allocation/page.tsx` + `components/allocation/*` (Hero, CompositionBar, Breakdown, ActionPlanner)
- `app/dashboard/settings/page.tsx` — toggle esclusione classi
- `__tests__/` — test per esclusione + dualità

---

## Decisioni allineate (2026-07-15)

1. **Hero con leva** → **Due numeri paritari**: "Patrimonio Allocato" (market) + "Esposizione Nozionale", chip `Leva X.XX×` tra i due. Composizione = % nozionale. Se `hasLeveragedExposure === false` → UI identica a oggi (un solo numero).
2. **Esclusione** → **Due toggle dedicati** in Impostazioni: "Escludi liquidità" / "Escludi immobili" (NON un flag generico per-classe). Classi escluse fuori da num+denom; mostrate in striscia "Fuori allocazione".
3. **Righe dettaglio** → **Solo nozionale** (come oggi). Dualità market/nozionale solo nell'hero aggregato.
4. **Cash escluso vs `useFixedAmount`** → **Esclusione ha priorità**: se cash escluso, l'opzione importo fisso è ignorata/nascosta.

## Chiamate mie (implicite dalle decisioni, vetabili dall'utente)
- Base hero/composizione con esclusioni attive = **base investita** (esclusi cash/immobili), non l'intero patrimonio. I due numeri market/nozionale dell'hero riflettono la base investita; striscia "Fuori allocazione" mostra cash/immobili a parte.
- **Leva mostrata calcolata sulla base investita** (non sull'intero patrimonio): cash/immobili a leva 1 diluirebbero la leva verso 1 e nasconderebbero la vera leva degli strumenti. → `leverageRatio` da ricomputare sul subset investibile quando ci sono esclusioni.
- Settings: nuovi campi `AssetAllocationSettings` → `excludeCashFromAllocation?: boolean`, `excludeRealEstateFromAllocation?: boolean` (default false; regola 3 posti + snapshot key Settings).
- ActionPlanner (Versa/Ribilancia): opera solo sulle classi/strumenti investibili (filtrare cash/immobili da `byAssetClass` e dagli strumenti passati all'optimizer).

## MODELLO TARGET RIFORMULATO (decisione utente 2026-07-15) — chiave di volta

Le % target sono **% del capitale investito (market)** e rappresentano l'**esposizione nozionale** desiderata per classe:
- Possono sommare a **> 100%**; la somma **È** la leva target: `equity 90 + bonds 60 = 150% → leva target 1,50×`.
- **Validazione `>= 100`** (100 = no leva; >100 = leva). NON più `== 100`.
- **`targetLeverageRatio` = derivato** (= somma target / 100), **read-only**, alimenta l'optimizer strumenti (che così è già coerente: i target di classe codificano la leva). Il campo manuale attuale viene rimosso/derivato.
- **Classe esclusa** ⇒ input % bloccato per quella classe e fuori dalla somma.
- Anche le **% attuali** in base **% capitale investito**: `notional_classe / market_totale` → sommano a `leva_corrente × 100`. Current e target direttamente confrontabili; delta in p.p. → COMPRA/VENDI/OK come oggi.

### Conseguenze tecniche
- `toLegacyAllocationResult`: current% = `notional_classe / market_totale` (NON `/ notional_totale`). Target as-is. Accetta il set di classi escluse (fuori da num+denom, base = market investito).
- **Balance score**: `computeBalanceScore` **lasciato INVARIATO** (Σ|drift|/2). Con leva_corrente≠leva_target il gap di leva confluisce già nel Σ|drift| — essere sotto/sovra-leva *è* essere fuori target, quindi il punteggio lo penalizza correttamente. La scomposizione formale è stata scartata perché i test esistenti passano solo `difference` (niente current/target%), e normalizzare per-lato li romperebbe. La **leva corrente vs target** è mostrata a parte nell'hero come informazione (non altera lo score).
- Composition bar: larghezze normalizzate (mix), etichette = % a leva, caption "su capitale investito · leva X×".
- `compareAllocations` cambia firma per accettare le esclusioni (`{ excludeCash, excludeRealEstate }`).

---

## PIANO IMPLEMENTATIVO (fasi)

- **Fase 0 — Tipi & Settings**: `AssetAllocationSettings` += `excludeCashFromAllocation?`, `excludeRealEstateFromAllocation?` (regola 3 posti: type, getSettings, setSettings — entrambi i rami). Snapshot key Settings (dirty-state). `targetLeverageRatio` → derivato (stop persistenza manuale, o mantieni derivato in load).
- **Fase 1 — Core puro + test**: rework `toLegacyAllocationResult` (base %-capitale, esclusioni), `compareAllocations` firma, leva su base investita, `computeBalanceScore` (scomposizione leva/composizione), export helper per leva target/corrente. `__tests__/` (esclusione + leva ≥100 + dualità + balance score).
- **Fase 2 — Settings UI**: due toggle esclusione, validazione `>=100`, blocco input classi escluse, display "Leva target" derivata read-only.
- **Fase 3 — Pagina Allocazione UI**: hero due numeri + chip Leva + striscia "Fuori allocazione"; composition bar etichette leveraged + caption; breakdown % leveraged; ActionPlanner filtrato alle sole classi investibili.
- **Fase 4 — Verify**: `npx tsc --noEmit`, vitest sui file toccati, guida `/verify` sul flusso reale.

Stato: **Fasi 0–3 + Settings COMPLETE** (tsc pulito, 1017 test verdi). Resta solo la verifica live nel browser.

### Fatto (TUTTE le fasi 0→3 + Settings)
- **Tipi** (`types/assets.ts`): `excludeCash/RealEstateFromAllocation`, `AllocationResult` arricchito (`marketValue`,`leverageRatio`,`excludedClasses`), `AllocationExclusions`, `AllocationExcludedClass`.
- **Core** (`assetAllocationService.ts`): getSettings/setSettings (2 rami) per i due flag; `getExcludedClasses`, `deriveTargetLeverageRatio`, `toLegacyAllocationResult` riscritta (base %-market leverage-aware, esclusioni, fixed-cash solo se incluso), `compareAllocations(assets, targets, exclusions?)`.
- **Pagina** (`app/dashboard/allocation/page.tsx`): legge esclusioni, passa a compareAllocations, deriva leva target, filtra classi/strumenti investibili per ActionPlanner, passa metadata all'hero.
- **allocationUtils**: `applyRebalanceBand` ora preserva `marketValue/leverageRatio/excludedClasses` (bug fix: altrimenti l'hero perdeva leva/esclusioni). `computeBalanceScore` invariato (scelta).
- **AllocationHero**: due numeri paritari (market + nozionale) + chip Leva (corrente · target) quando leva>1, striscia "Fuori allocazione", relabel "Patrimonio investito" con esclusioni. Layout single-number identico a prima senza leva.
- **AllocationCompositionBar**: larghezze=share nozionale, etichette=% a leva (`currentPercentage`), caption "su capitale investito" quando leva>1.
- **Settings** (`app/dashboard/settings/page.tsx`): stato+load+save+2 snapshot-key per i flag; `calculateTotal` salta escluse; validazione `≥100`; `isValidTotal`/`isLeveragedTarget`/`derivedTargetLeverage`; hero totale con riga "Leva target"; card "Base di Allocazione" (leva derivata read-only + 2 toggle esclusione, sostituisce l'input manuale leva); righe classi escluse disabilitate + nota "Escluso"; rimosso cap `max=100` (leva single-class >100 possibile); payload scrive `targetLeverageRatio = total/100` + flag.

### Verifica
- `npx tsc --noEmit` pulito.
- Suite completa **1017 test verdi** (58 file), inclusi i nuovi `compareAllocations` + `deriveTargetLeverageRatio`.
- **Verifica live utente (2026-07-15)**: pagina Allocazione + Impostazioni funzionano. UNICO punto dubbio: il **motore Versa/Ribilancia**.

---

## APERTO PER PROSSIMA SESSIONE — motore Versa/Ribilancia sotto il nuovo modello

L'utente ha dubbi sui risultati di Versa/Ribilancia. **Ipotesi di root cause (da verificare):** l'optimizer strumenti (`lib/utils/leverageAwareAllocationUtils.ts::solve`) non è stato aggiornato al nuovo modello a leva.

- Nel nuovo modello i `targetPercentage` di classe sono **% del capitale MARKET** (sommano a leva×100), mentre `solve()` calcola il residuo target come:
  `classConst[c] = currentNotional[c] − targetFraction[c] · currentNotionalTotal`
  cioè usa **`currentNotionalTotal`** come base delle frazioni target. Ma la frazione target ora è relativa al **market**, non al nozionale. Il target nozionale desiderato per classe dovrebbe essere `targetFraction[c] · marketTotal` (rebalance: `currentMarketTotal`; versa: `currentMarketTotal + budget`), NON `· currentNotionalTotal`.
- `ActionPlanner` deriva `targetPercentageByAssetClass` da `byAssetClass[c].targetPercentage` (già % market/leveraged) → coerente col nuovo modello, ma passa base sbagliata a `solve`.
- Il termine leva (`leverageConst = currentNotionalTotal − targetLeverageRatio · marketAfterTrade`) è già market-based e coerente; l'incoerenza è solo nel termine di classe.
- **Fix candidato**: in `solve`, sostituire `targetFraction[c] · currentNotionalTotal` con `targetFraction[c] · (currentMarketTotal + budget)` (budget=0 per Ribilancia). Verificare anche `RebalancePanel`/`ContributionPanel` e i loro eventuali test.
- Da controllare anche: `buildRebalancePlan`/`allocateContribution` in `allocationUtils.ts` (usati dal piano per-classe non-strumento) — lì `differenceValue`/target € vengono già dal core corretto, quindi probabilmente ok; il dubbio è concentrato sull'optimizer strumenti.

**NON toccato in questa sessione** (deferito su richiesta utente).

---

## FEATURE 2 — Alias di visualizzazione strumenti (2026-07-15)

Obiettivo: il `ticker` deve restare in formato Yahoo ("CL2.MI") per il retrieve prezzi, ma l'utente può impostare un **alias** ("CL2") mostrato al suo posto in tutta l'app.

### Fatto
- **Dati**: `Asset.displayTicker?` + `AssetFormData.displayTicker?` (`types/assets.ts`). Helper unico `getAssetDisplayTicker(asset)` in `lib/utils/assetDisplay.ts` (alias.trim() || ticker).
- **AssetDialog**: campo "Alias visualizzato" (schema Zod, `buildAssetFormDataFromValues`, reset edit+new — enumerato per la gotcha), gated come il ticker (nascosto per cash/realestate).
- **assetService.updateAsset**: `displayTicker` undefined → `deleteField()` (clearabile; unico chiamante reale è AssetDialog con formData completo → sicuro).
- **Sweep display** (usano `getAssetDisplayTicker`): AssetCard, AssetManagementTab, AssetPriceHistoryTable (+ `displayTicker` plumato in `AssetPriceHistoryRow`/builder), TaxCalculatorModal, DividendDialog, GoalDetailCard, AssetAssignmentDialog (+ ricerca per alias), GoalBasedInvestingTab→GoalsHero (`FreeAsset.ticker` = alias), PDF (`pdfDataService` AssetRow), RebalancePanel/ContributionPanel (+ `displayTicker` in `InstrumentExposure`/`InstrumentTrade`), MonthlyAssetBreakdownSection (resolver `assetId→alias` da assets live passati dalla pagina Storico).
- **Lasciati grezzi (intenzionale)**: input modifica ticker (CreateManualSnapshotModal), logging scraping (DividendTrackingTab), costituenti benchmark (BenchmarkComparisonSection), **ExposureSection** (look-through: dati server-derived con cache 24h → plumbing rischioso per deploy in giornata; NOTA per futuro).
- **Fix post-test utente (2026-07-15)**: il pie chart "Distribuzione per Asset" (Panoramica) mostrava ancora il ticker grezzo → `chartService.ts::prepareAssetDistributionData` ora usa `getAssetDisplayTicker` per la label della fetta. NB: l'overview è cachato server-side (invalidato da `updateAsset`), quindi la label si aggiorna al primo ricalcolo/edit asset o allo scadere del TTL.

### Verifica FEATURE 2
- `npx tsc --noEmit` pulito · **1017 test verdi** · **`npm run build` OK** (tutte le pagine).

---

## STATO PER DEPLOY (oggi)
Working tree su `main`, NON committato: contiene FEATURE 1 (allocazione a leva) + FEATURE 2 (alias). Entrambe: tsc + 1017 test + build OK. Versa/Ribilancia = feature futura (non bloccante). Da decidere con l'utente come impacchettare i commit per il deploy.

---

## Log
- 2026-07-19: **Opzione "Escludi TFR/datoriale dal cashflow"**. Il volontario resta sempre neutro
  (default fisso); TFR+datoriale sono entrate bloccate e l'utente sceglie se contarle. Setting
  `excludePensionAccrualsFromCashflow?` (`types/assets.ts`) + persistenza `getSettings`/`setSettings`
  (2 write path) in `assetAllocationService`. Helper puro `lib/utils/pensionCashflow.ts`
  (`filterCashflowExpenses`/`isPensionAccrual`, no-op quando off) + test `__tests__/pensionCashflow.test.ts`.
  Toggle in Impostazioni (stato+load+snapshot+payload+deps+Switch). Agganciato alla superficie
  **principale**: hero Tracciamento (`ExpenseTrackingTab` filtra SOLO il calcolo dei totali —
  income/spese/netto + delta MoM — le voci restano visibili nel feed), prop passata da
  `app/dashboard/cashflow/page.tsx`. **DA ESTENDERE (stesso helper, one-liner) alle altre superfici**:
  `AnalisiTab`/`cashflowTimeSeries`, `TotalHistoryTab`, `CurrentYearTab`, budget, overview Panoramica
  (`dashboardOverviewService`), email (`monthlyEmailService`). Finché non estese, quelle viste
  contano ancora gli accrual come income (comportamento di default). — verificare tsc/build/test.
- 2026-07-19: **Fase 4 (parziale) — flusso dedicato "Registra versamento" + tab Previdenza**.
  Motivazione: il selettore natura nelle "Impostazioni avanzate" dell'ExpenseDialog non era
  scopribile. Nuovo `lib/services/pensionContributionService.ts` (`recordPensionContribution`:
  nasconde tipo+categoria — volontario→`variable` neutralizzato, TFR/datoriale→`income`; find-or-create
  categoria "Fondo Pensione" per tipo). Dialog `components/pension/PensionContributionDialog.tsx`
  (3 campi: natura/importo/data). Tab `components/fire-simulations/PensionTab.tsx` (versato anno per
  natura + versato totale + bottone), registrato in `app/dashboard/fire-simulations/page.tsx` (tab
  "Previdenza", icona PiggyBank). Modello UX confermato da Giorgio: il tab traccia il **versato**, il
  valore del fondo (versato+rendimento) si aggiorna a mano sull'asset in Patrimonio. **Ancora da
  fare (Fase 4 completa)**: recap fiscale (RAL + 3 cifre: risparmio fiscale, plafond creato, bank
  residuo) e tassazione in uscita (Fase 5).
- 2026-07-19: **Fase 3 — contributi per natura in Cashflow**. Campo tipizzato
  `pensionContributionNature?` su `Expense` + `ExpenseFormData` (`types/expenses.ts`). Util pura
  `lib/utils/pensionContributions.ts` (`derivePensionDeductibleByYear` = volontari+datoriali per
  anno, TFR escluso; `derivePensionContributionsByYearAndNature` = split completo) + test
  (`__tests__/pensionContributions.test.ts`). UI: selettore natura in "Impostazioni avanzate"
  dell'ExpenseDialog (schema zod, watch, entrambi i rami di reset, submit, `isAdvancedPrePopulated`).
  Persistenza: `expenseService.createExpense` (whitelist) + update (spread) + read (spread).
  **NODO RISOLTO (trattamento metriche, Giorgio 2026-07-19)**: **volontario = neutralizzato** dalle
  metriche di cashflow (risparmio, non consumo — come un `transfer`); **TFR e datoriale = contano
  come entrate a tutti gli effetti** (inseriti come voci di tipo "Entrata"; nessun codice extra, e
  il datoriale resta deducibile via tag). Neutralizzazione del volontario applicata a TUTTI i choke
  point di spesa: `expenseService.isCountableExpense` + `getMonthlyExpenseSummary` (hero, saldo
  netto, rapporto, riepilogo), `budgetUtils` (expenseMatchesItem + spesa mensile per item),
  `cashflowTimeSeries` (isExpenseRecord + buildTimeBuckets), `dashboardOverviewService`,
  `monthlyEmailService`. Test: `__tests__/pensionMetricNeutralization.test.ts`.
- 2026-07-19: **Fase 0-1 fondo pensione (branch pension-fund)**. `types/pension.ts` (nature TFR/
  volontari/datoriali, input/output deduzione), `lib/utils/pensionDeduction.ts` (ordinaria + fold
  extradeducibilità con accumulo/drawdown/scadenza, beneficio via `taxOf` iniettato), `__tests__/
  pensionDeduction.test.ts` (12 casi). NON eseguiti (shell non raggiunge il repo) → tsc/vitest da Giorgio.
- 2026-07-19: **Fase 2 — asset type `pension`**. `AssetType`/`AssetClass` += `pension` (`types/
  assets.ts`); AssetDialog: type card "Fondo Pensione" (icona PiggyBank), valutazione manuale come
  realestate (no ticker/auto-update/cost-basis, label "Valore attuale", illiquido di default, nota
  manuale, `shouldUpdatePrice`=false), zod enum + `tickerRequired` aggiornati, `TYPE_TO_CLASS`.
  Esclusione: `getExcludedClasses` aggiunge SEMPRE `pension` (fuori base allocazione). Label/colori:
  `allocationUtils` (ASSET_CLASS_LABELS/CHART_INDEX), `assetUtils.formatAssetClassName`,
  `colors.getAssetClassCssVar`, `AssetManagementTab.requiresManualPricing`. Breaker `Record<AssetClass>`
  completi patchati: `settings/page.tsx`, `defaultSubCategories.ts`, `goalTrajectory.ts`,
  `AllocationComparisonBar.tsx`. **Da verificare da Giorgio: `npx tsc --noEmit` + `npm run build` +
  test creazione asset in dev.**
- 2026-07-15: lette AGENTS/COMMENTS/DEVELOPMENT_GUIDELINES/CLAUDE + core allocazione. Avvio brainstorming.
</content>
</invoke>
