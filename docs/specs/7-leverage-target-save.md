# Salvataggio Allocazione Target ≥ 100% (Leva) — Spec

> Status: **SPEC — pronta per implementazione** (2026-07-27). Riferimento fedele: `app/dashboard/settings/page.tsx`.

## Obiettivo

La feature "Allocazione a Leva" (L0→L2) prevede che un totale target **sopra** 100% sia legittimo (= leva target; 100% = nessuna leva) e che solo un totale **sotto** 100% sia invalido. La UI di Impostazioni lo mostra già correttamente (chip "Leva target X,XX×", badge verde, riga "Residuo da allocare" quando manca), ma il **salvataggio rifiuta ancora qualunque totale diverso da 100%**. Il fix allinea `handleSave` alla regola già dichiarata dal render.

## Diagnosi (causa radice)

Svista del commit L2 `990cc56` (*"Target total validation is now >= 100 … removed the per-class max=100 cap"*): il diff ha aggiornato **solo** la variabile di render, non il guard nel salvataggio.

- **Il blocco** — `app/dashboard/settings/page.tsx:1059-1065`, dentro `handleSave` (verificato a mano il 2026-07-27):

```ts
const total = calculateTotal();
if (Math.abs(total - 100) > 0.01) {
  toast.error(`Il totale deve essere 100%. Attualmente è ${formatPercentage(total)}`);
  return;
}
```

- **La regola giusta, già nel file** — riga 1591 (definita *dopo* `handleSave` e non usata da esso):

```ts
// total of EXACTLY 100 means "no leverage" and anything ABOVE 100 is a legitimate target leverage
const isValidTotal = total >= 100 - 0.01;
const derivedTargetLeverage = total > 0 ? total / 100 : 1;
```

- Il warning per il caso sotto-100 che l'utente chiede **esiste già**: righe 2490-2497 mostrano "Residuo da allocare {|100 − total|}" e l'hero diventa `text-destructive` quando `!isValidTotal`.
- Nessun'altra barriera: il bottone Salva è `disabled={isDemo || saving}` (riga 1631); né `setSettings` (`lib/services/assetAllocationService.ts:140`) né `firestore.rules` validano il totale.
- La pipeline a valle è **già leverage-aware**: `deriveTargetLeverageRatio` (`assetAllocationService.ts:715`) = `Σ target / 100` senza clamp; `toLegacyAllocationResult` documenta pesi che sommano > 100; `splitFromSurplus` e i planner normalizzano su `Σ targetPercentage` calcolato al volo; `composition-bar` separa larghezza da label (`displayPct`); il QP solver leverage-aware è il percorso previsto.

## Decisioni fissate (do NOT relitigate)

1. **Regola di salvataggio**: blocco solo se `total < 100 - 0.01`. Totale ≥ 100 si salva sempre; sopra 100 la leva target derivata è `total / 100` (già calcolata e mostrata).
2. **Restano a 100 esatto** (percentuali *interne al padre*, non toccate dalla leva):
   - somma sotto-categorie di una classe — `settings/page.tsx:1072`;
   - somma asset specifici in una sotto-categoria — `validateSpecificAssets` (`assetAllocationService.ts:926-956`).
3. `computeBalanceScore` (`lib/utils/allocationUtils.ts:250`) **non si tocca** in questo fix: con Σtarget > 100 e leva corrente ~1 lo score degrada semanticamente (il deficit di leva conta come misallocazione) ma non crasha e resta direzionalmente sensato. Documentarlo come limite noto (commento **Why** sul punto, + riga in CLAUDE.md → Known Issues).

## Modifiche per file

### `app/dashboard/settings/page.tsx` (unico file di codice)

1. **`handleSave` (righe 1059-1065)**: sostituire il guard con la regola leverage-aware. Il messaggio d'errore deve parlare la nuova lingua:
   ```ts
   const total = calculateTotal();
   // Leverage-aware: 100 = no leverage, above 100 = target leverage (spec 7). Only < 100 is invalid.
   if (total < 100 - 0.01) {
     toast.error(`Il totale deve essere almeno 100%. Attualmente è ${formatPercentage(total)} — residuo da allocare ${formatPercentage(100 - total)}.`);
     return;
   }
   ```
   Riusare la stessa tolleranza `0.01` e, se possibile, la stessa espressione di `isValidTotal` (estrarre una piccola helper locale o spostare il calcolo prima di `handleSave` per non avere due copie della regola).
2. **Copy stantia**:
   - riga 3002 ("Note e dettagli tecnici"): *"Il totale delle allocazioni delle asset class deve essere esattamente 100%"* → riscrivere: almeno 100%; oltre 100% = leva target.
   - commento di intestazione del file (righe 14-21): *"Asset classes must sum to 100%"* → aggiornare.
3. **Input `max="100"` residui** (righe 1832, 2548, 2780, 2905): verificarli uno a uno — quelli che riguardano percentuali di sotto-categorie/asset specifici (interne al padre) restano; se qualcuno è un target top-level di classe, rimuovere il cap (il cap top-level principale è già stato rimosso alla riga 2657).

### `CLAUDE.md`

- Known Issues: una riga sul limite semantico di `computeBalanceScore` con leva target non ancora raggiunta.

## Impatti sul resto dell'app

- **Nessun cambio dati**: `AssetAllocationSettings` accetta già qualunque somma; nessuna migrazione.
- Salvando > 100, Allocazione mostra da subito leva target e piani coerenti (già testati in `__tests__/{assetExposure,compareAllocations,leverageAwareAllocationUtils}.test.ts`).
- Il `BalanceScoreGauge` può peggiorare per utenti che salvano una leva target prima di comprare gli ETF a leva: comportamento accettato (decisione 3).
- Non c'è validazione server: un totale < 100 può ancora arrivare a Firestore da client vecchi/manipolati — invariato rispetto a oggi, fuori scope.

## Test

- Non esiste una suite per `handleSave` (componente pagina, Firestore-coupled) — la regola va verificata a mano; se nel refactor si estrae la helper di validazione (`isTargetTotalValid(total)`), aggiungerle 4 casi in un test mirato: 99,98 → invalido; 99,995 → valido (tolleranza); 100 → valido; 150 → valido.
- Verifica manuale: (1) target 60/30/20 (=110) → salvataggio ok, chip "Leva target 1,10×", nessun toast d'errore; ricarica pagina → valori persistiti; (2) target 90 totale → toast di errore con residuo, nessuna scrittura; (3) sotto-categorie a 80 → errore sotto-categorie invariato; (4) Allocazione → i piani Ribilancia/Versa riflettono la leva target.
- Gate: `npx tsc --noEmit` + `npx vitest run` (suite toccate, se estratta la helper) + `npm run build`.

## Prompt di implementazione

> *Sonnet 5, effort medio.* Fix chirurgico: un guard, due copy, audit dei `max="100"` residui. Nessuna migrazione.

```text
Implementa la spec "Salvataggio Allocazione Target ≥ 100% (Leva)".

Leggi PRIMA di scrivere codice:
- docs/specs/7-leverage-target-save.md (INTEGRALE — le Decisioni fissate non si rilitigano)
- AGENTS.md → sezione Allocazione a Leva (L0/L1/L2, fix D5) per il contesto della feature
- CLAUDE.md, COMMENTS.md (APPLICALA), DEVELOPMENT_GUIDELINES.md (APPLICALA)

Scope ESATTO:
- app/dashboard/settings/page.tsx (guard in handleSave righe ~1059-1065; copy riga ~3002 e header ~14-21; audit input max="100" alle righe ~1832, 2548, 2780, 2905 con la regola: cap solo su percentuali interne al padre)
- CLAUDE.md (Known Issues: limite computeBalanceScore con leva target non raggiunta)

NON toccare: la validazione delle sotto-categorie (riga ~1072), validateSpecificAssets in assetAllocationService.ts, computeBalanceScore, firestore.rules.

Gate: npx tsc --noEmit + npm run build (+ vitest sulle suite toccate se estrai una helper di validazione).
Al termine FERMATI: aggiorna SESSION_NOTES.md, riassumi COSA hai fatto e COME testarlo a mano (i 4 scenari della sezione Test), ATTENDI conferma.
Branch: fix/leverage-target-save. Conventional Commits.
```
