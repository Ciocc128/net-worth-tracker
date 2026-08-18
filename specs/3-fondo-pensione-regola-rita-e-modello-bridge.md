# Spec 3 — Fondo pensione nel FIRE: regola RITA + modello bridge

> **Ordine**: 3 di 5. **Dipende dalla Spec 1** (il campo `respectPensionLockInFire` deve
> persistere). È prerequisito delle Spec 4-5 (che ne mostrano i risultati nel redesign).
> **Stato**: ✅ **Implementata** (2026-08-18) — branch `feature/fondo-pensione-rita-bridge`,
> collaudo guidato sugli emulatori 25/25 (bridge number verificato con formula PV indipendente)
> + suite Playwright esistente 25/25 come regressione.
> **Scopo**: il capitale dei fondi pensione smette di essere "sottratto per sempre" dal FIRE e
> viene modellato per quello che è: capitale che **arriva più tardi**, all'anno di sblocco.

## Stato attuale (verificato 2026-08-17)

- `lib/utils/pensionFire.ts` → `calculatePensionLockedValue(assets, atDate, valueOf)`: somma i
  fondi `type === 'pensionFund'` con `pensionFundDetails.unlockDate` parseabile e futura; un fondo
  senza unlockDate conta come NON bloccato.
- Il toggle (ora persistito, Spec 1) sottrae quel valore da `currentNetWorth` e da
  `illiquidNetWorth` (floored a 0) SOLO in `FireCalculatorTab.tsx` (~:151-161). Coast FIRE, What
  If e Monte Carlo lo ignorano completamente.
- Coast FIRE possiede già la macchina giusta: `buildCoastFIRERetirementNeeds`
  (`lib/services/fireService.ts` ~:959-1056) cammina all'indietro anno per anno scontando i
  bisogni del ponte tra pensionamento e partenza delle pensioni statali
  (`capital = (capital + needAtAge) / (1 + realReturn)`).
- Scenari Bear/Base/Bull: tassi fissi configurabili (`fireProjectionScenarios`), real return dello
  scenario = `growthRate − inflationRate` (~:1135-1137).
- Settings FIRE su `assetAllocationTargets/{userId}`; Coast ha già `userAge` e
  `coastFireRetirementAge`.

## Decisioni prese (Giuseppe, 2026-08-17)

1. **Regola RITA configurabile**: età pensione INPS configurabile (default **67**); sblocco del
   fondo = INPS − 5, oppure INPS − 10 se attiva l'ipotesi "disoccupato ≥ 24 mesi dopo il FIRE"
   (caso reale di Giuseppe: FIRE a 50 → sblocco a 57). `pensionFundDetails.unlockDate` resta come
   **override manuale per-fondo** e vince sulla regola.
2. **Modello bridge**: con il toggle attivo, FIRE e Coast FIRE modellano due fasi — prima dello
   sblocco servono solo gli asset liberi (il "ponte"), dallo sblocco il fondo rientra nel
   capitale. Il FIRE number diventa "capitale ponte + capitale post-sblocco".

## Modifiche richieste

### A) Nuovi settings (regola delle CINQUE posizioni, AGENTS.md)

Due campi su `AssetAllocationSettings`, ciascuno in TUTTE e cinque le posizioni (tipo, read
mapping `getSettings`, entrambi i rami di `setSettings`, wiring UI — qui in `FireCalculatorTab`) +
il mapper di `dashboardOverviewService` + `settingsRoundTrip.test.ts`:

- `pensionInpsRetirementAge?: number` — default applicativo **67**, input consentito 60-75.
- `pensionRitaLongUnemployment?: boolean` — default **false** (sblocco a INPS − 5; `true` →
  INPS − 10).

Guardia `!== undefined` su entrambi (scritti solo da `FireCalculatorTab` con form completo, non
clearable — stesso ragionamento di `includePrimaryResidenceInFIRE`).

### B) Nuova pure util `lib/utils/pensionUnlock.ts` — LA fonte unica dello sblocco

Regola AGENTS (*Quick-Fix Reference*): "does this fund count as locked at date X?" diventa UNA
regola in UN posto. Firma orientativa (l'implementatore può aggiustare, mantenendo purezza e
`now` esplicito — mai `new Date()` interno):

```ts
interface PensionUnlockSettings {
  userAge?: number;                    // già in settings (Coast FIRE)
  pensionInpsRetirementAge?: number;   // default 67
  pensionRitaLongUnemployment?: boolean;
}
resolveRitaUnlockAge(s): number            // inps − (longUnemployment ? 10 : 5)
resolvePensionUnlockDate(fund, s, now): Date | null
resolvePensionLockState(assets, s, now, valueOf): {
  funds: { fund; unlockDate: Date | null; value: number; isLocked: boolean }[];
  totalLockedToday: number;
  inflows: { yearsFromNow: number; amount: number }[];  // un inflow per anno di sblocco, aggregato
}
```

Precedenza di `resolvePensionUnlockDate`:
1. `pensionFundDetails.unlockDate` parseabile → quella (override manuale, comportamento odierno).
2. Altrimenti, se `userAge` è noto → `now + max(0, resolveRitaUnlockAge(s) − userAge)` anni
   (stesso giorno/mese di `now`).
3. Altrimenti → `null` = non modellabile = fondo trattato come NON bloccato (identico a oggi) e
   la UI lo dichiara ("imposta la tua età in Coast FIRE o una data di sblocco sul fondo").

`lib/utils/pensionFire.ts` viene rifattorizzato per consumare questa risoluzione (o deprecato a
favore di `resolvePensionLockState`), senza cambiare il comportamento quando i nuovi settings sono
assenti. Aggiornare l'altro call site: `scripts/exercisePensionPerformanceAndFire.mts`.

### C) Motore bridge — generalizzare la camminata di Coast FIRE

`buildCoastFIRERetirementNeeds` accetta un nuovo parametro opzionale
`capitalInflows?: { yearsFromRetirement: number; amount: number }[]` (importi già espressi in
valore all'anno di afflusso). Semantica: camminando all'indietro, all'anno di un inflow il
capitale richiesto si riduce di quell'importo (floored a 0) prima di continuare lo sconto.

**Invarianti da testare (non negoziabili):**
1. `capitalInflows` assente/vuoto → output **identico** a oggi (regressione).
2. Inflow di importo A a `yearsFromRetirement = 0` → capitale richiesto oggi ridotto esattamente
   di A (salvo floor a 0).
3. Inflow di importo A all'anno y → riduzione pari a `A / (1 + realReturn)^y` (salvo floor).

### D) FIRE (Calcolatore) — nuova semantica del toggle

Nuova pure function (in `fireService.ts` o modulo dedicato `lib/utils/fireBridge.ts`, tested):

```ts
calculateFireBridgeNumber({
  annualExpenses, withdrawalRate, realReturn,   // realReturn = scenario base (growth − inflation)
  yearsToUnlock, pensionValueToday, pensionGrowthRate,
}): { bridgeFireNumber; standardFireNumber; pensionValueAtUnlock }
```

- `standardFireNumber = annualExpenses / (withdrawalRate/100)` (invariato).
- `pensionValueAtUnlock = pensionValueToday · (1 + pensionGrowthRate)^yearsToUnlock`;
  **`pensionGrowthRate` = real return dello scenario** applicato anche al compartimento pensione —
  approssimazione documentata (v1 non modella i contributi futuri al fondo: TFR/datoriale/
  volontario post-oggi sono fuori scope, dichiarato nel copy e in un commento Design).
- `bridgeFireNumber` = capitale richiesto OGGI in asset liberi tale da coprire le spese fino allo
  sblocco e arrivare allo sblocco con `max(0, standardFireNumber − pensionValueAtUnlock)`:
  riusare la camminata generalizzata del punto C (inflow del fondo all'anno di sblocco), NON una
  seconda formula.
- Edge: `yearsToUnlock ≤ 0` o toggle off → `bridgeFireNumber === standardFireNumber` calcolato
  sul patrimonio pieno.

Con toggle ON, in `FireCalculatorTab`:
- `fireNumber` mostrato = `bridgeFireNumber`; `progressToFI` = asset liberi / bridgeFireNumber;
  il patrimonio "libero" resta l'attuale `currentNetWorth − totalLockedToday`.
- `calculateFIREProjection`: il fondo pensione è un compartimento separato che cresce al
  `growthRate` dello scenario e **si fonde nel portafoglio all'anno di sblocco** (gradino visibile
  nella serie); il check "FIRE raggiunto" usa il requisito bridge negli anni pre-sblocco e quello
  standard dopo. **Invariante**: toggle OFF → proiezione identica a oggi.
- UI minima (il redesign è Spec 4): sub-copy del toggle aggiornata alla nuova semantica; sotto il
  toggle i due nuovi controlli (età INPS, switch RITA −10) visibili solo a toggle attivo, con lo
  sblocco stimato dichiarato ("Sblocco stimato: {anno}, a {età} anni" o "data impostata sul
  fondo"); una riga nel blocco reddito passivo: "Fondo pensione: {X} € — rientra nel {anno}".

### E) Coast FIRE — il fondo entra nella camminata

- `calculateCoastFIREMetrics` / `calculateCoastFIREProjection`: quando il toggle è attivo, il
  fondo pensione esce dal capitale corrente e rientra come `capitalInflow` all'anno
  `max(0, etàSblocco − coastFireRetirementAge)` della camminata (gestisce da solo sia sblocco
  prima sia dopo il pensionamento Coast). La proiezione mostra il gradino all'anno di sblocco.
- Il toggle letto dai settings vale **per tutta la pagina**: Coast FIRE, What If (eredita dal
  re-run di `fireService`) e Monte Carlo devono rispettarlo — oggi solo il tab FIRE lo fa.

### F) Monte Carlo — supporto agli afflussi

`lib/services/monteCarloService.ts`: `runSingleSimulation`/`runMonteCarloSimulation` accettano
`capitalInflows?: { year: number; amount: number }[]`. Ordine definito e documentato: l'inflow si
aggiunge **all'inizio dell'anno**, poi si applica il rendimento di mercato, poi il prelievo.
Wiring nel tab: con toggle attivo, `initialPortfolio` di default esclude il fondo e viene aggiunto
un inflow all'anno di sblocco relativo all'orizzonte simulato; `ParametersForm` mostra una riga
informativa (sola lettura) che dichiara l'afflusso. Invariante: senza inflows → risultati
identici (stesso seed logico non esiste: verificare per struttura, non per valori casuali — es.
con volatilità 0 i percorsi sono deterministici e testabili esattamente).

## Cosa NON fare

- Niente birth-date: l'età viene da `userAge` (già in settings) — se manca, fallback al punto B3.
- Non modellare i contributi futuri al fondo (TFR/datoriale post-oggi): fuori scope v1,
  dichiarato.
- Non toccare la pagina Previdenza, `pensionReturn.ts`, né il trattamento `allocationRole:
  'frozen'` in Allocazione: qui si parla solo di FIRE.
- Nessun nuovo campo obbligatorio sui tipi esistenti se un opzionale basta.

## Test

- `__tests__/pensionUnlock.test.ts` (nuovo): precedenza override/regola/null, RITA −5 vs −10,
  età ≥ soglia → sbloccato ora, aggregazione inflows per anno.
- Invarianti C1-C3 sulla camminata generalizzata (estendere la suite `fireService`).
- `calculateFireBridgeNumber`: bridge = standard quando yearsToUnlock = 0; bridge < standard
  quando il fondo copre parte del post-sblocco; floor quando `pensionValueAtUnlock ≥
  standardFireNumber` (resta il PV delle spese del ponte).
- Regressione proiezioni: toggle OFF → output identici (snapshot dei numeri, non dei pixel).
- Monte Carlo con volatilità 0 e un inflow noto → percorso esatto atteso.
- `settingsRoundTrip` esteso ai 2 nuovi campi. Suites area (AGENTS): `fireService`, `pensionFire`,
  + trio transfer se toccato. `npx tsc --noEmit` dopo i test; suite anche con `TZ=Europe/Rome`.

## Verifica (collaudo guidato, WORKFLOW.md)

Sugli emulatori con lo scenario pensione (`npm run e2e:seed -- fresh` o seed base): calcolare in
uno script `.mts` usa-e-getta il bridge number atteso con una **formula indipendente** (sconto
diretto a somma di PV, non la camminata del servizio — due strade indipendenti, mai circolari) e
confrontarlo col valore esposto dalla pagina/servizio; fasi A (invarianza a toggle off), C
(comportamento nuovo a toggle on, esito atteso dichiarato PRIMA), F (ripristino, script
cancellato). Esito registrato in SESSION_NOTES.md.

## Criteri di accettazione

- [x] Con FIRE a 50, età 41→? (dati reali), INPS 67 e RITA −10: sblocco stimato a 57, FIRE
      number bridge < standard, gradino visibile nelle proiezioni FIRE e Coast all'anno di
      sblocco.
- [x] Toggle OFF → tutti i numeri identici a prima della spec (regressione provata).
- [x] Override `unlockDate` per-fondo vince sulla regola; fondo senza dati → non bloccato +
      avviso in UI.
- [x] Coast FIRE, What If e Monte Carlo rispettano il toggle (oggi solo il tab FIRE).
- [x] Nessun `new Date()` dentro le pure functions (sempre `now` esplicito).

---

## Implementazione consigliata

- **Modello**: `claude-fable-5` (in alternativa `claude-opus-5`) · **Effort**: high
  (matematica finanziaria con invarianti, refactor di una camminata esistente senza regressioni:
  è la spec più delicata delle cinque)

### Prompt di implementazione

```
Leggi TASSATIVAMENTE prima di ogni cosa: AGENTS.md (in particolare FIRE What If and Goals, Fondo
Pensione, Settings — the FIVE places), CLAUDE.md, WORKFLOW.md, COMMENTS.md,
DEVELOPMENT_GUIDELINES.md. Crea un branch dalla branch attiva (una branch per sessione, commit
solo dopo mia approvazione esplicita). Crea/aggiorna SESSION_NOTES.md.

Implementa ESATTAMENTE la specifica in specs/3-fondo-pensione-regola-rita-e-modello-bridge.md.
In sintesi: (A) due nuovi settings pensionInpsRetirementAge e pensionRitaLongUnemployment in
TUTTE e cinque le posizioni della regola AGENTS + settingsRoundTrip; (B) nuova pure util
lib/utils/pensionUnlock.ts, fonte unica della risoluzione dello sblocco (override unlockDate >
regola RITA da userAge > null = non bloccato), con now esplicito; (C)
buildCoastFIRERetirementNeeds generalizzata con capitalInflows e i 3 invarianti della spec
provati nei test; (D) calculateFireBridgeNumber e nuova semantica del toggle nel tab FIRE
(bridge number, proiezione con gradino allo sblocco, regressione a toggle off); (E) Coast FIRE
aggancia il fondo come inflow nella camminata; (F) Monte Carlo accetta capitalInflows con ordine
inflow → rendimento → prelievo, testato a volatilità 0.

Procedi test-first sugli invarianti (visti rossi), poi implementa; npx tsc --noEmit dopo i test e
suite anche con TZ=Europe/Rome. Chiudi con il collaudo guidato della spec sugli emulatori (mai
produzione): verifica del bridge number con una formula indipendente in uno script .mts
usa-e-getta, fasi con esito atteso dichiarato prima, ripristino finale. La UI in questa sessione
resta minima (sub-copy del toggle, i due controlli nuovi, la riga dello sblocco): il redesign
visivo è delle spec 4-5. Riassumi il diff e chiedi l'OK per il commit.
```
