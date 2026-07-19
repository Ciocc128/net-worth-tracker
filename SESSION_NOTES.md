# SESSION NOTES — 2026-07-19

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
- 2026-07-15: lette AGENTS/COMMENTS/DEVELOPMENT_GUIDELINES/CLAUDE + core allocazione. Avvio brainstorming.
</content>
</invoke>
