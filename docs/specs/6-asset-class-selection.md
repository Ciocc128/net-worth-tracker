# Selezione della Classe Asset per ETF + Classe Prevalente del Fondo Pensione — Spec

> Status: **SPEC — pronta per implementazione** (2026-07-27). Riferimento fedele: `components/assets/AssetDialog.tsx`, `lib/utils/assetPricing.ts`, `components/allocation/PensionAllocationCards.tsx`.

## Obiettivo

Con la struttura a 2 step di AssetDialog (type picker → form filtrato per tipo), una volta scelto il tipo non si può più scegliere la classe asset in creazione. Un ETF monetario come **XEON** oggi non è creabile correttamente: nasce forzatamente `equity`, e l'unica alternativa (crearlo come tipo "liquidità") gli spegne l'aggiornamento automatico del prezzo. Inoltre un fondo pensione mostra in tabella Patrimonio sempre "Azioni" (fallback `TYPE_TO_CLASS`), anche quando la sua composizione dice altro.

Dopo il fix:
1. Solo il tipo **ETF** espone il Select "Classe Asset" in creazione (default `equity`); per tutti gli altri tipi la classe resta derivata dal tipo.
2. In tabella Patrimonio, la classe mostrata per un **fondo pensione** è quella **prevalente** della sua composizione (es. 70% azioni / 30% obbligazioni → Azioni), come pura derivazione di display.
3. I punti dell'app che confondono "classe cash" con "conto corrente" vengono allineati, così un ETF classe cash si comporta da titolo dove deve (bollo, storico prezzi, picker conti) e da liquidità negli aggregati (comportamento già intenzionale).

## Diagnosi (causa radice)

- `components/assets/AssetDialog.tsx:855-859` — `handleTypeSelect` fa `setValue('assetClass', TYPE_TO_CLASS[type])` e avanza allo step 2: la classe è stampata e mai più modificabile in creazione. Il Select "Classe Asset" esiste **solo in edit** (righe 1289-1340). Il workaround attuale per XEON è creare l'ETF e poi rientrare in modifica per cambiargli la classe.
- `TYPE_TO_CLASS` (righe 317-331) mappa `etf → 'equity'` senza possibilità di override. Ma il modello dati prevede già ETF con classi diverse: `types/assets.ts:3-17` dice esplicitamente *"etf -> equity (usually) OR bonds (for bond ETFs) — determined by assetClass field"*. Il vincolo è **solo nella UI di creazione**.
- Il pricing automatico decide **solo sul `type`** (`lib/utils/assetPricing.ts` — `MANUALLY_VALUED_TYPES = {realestate, cash, pensionFund}`, `hasMarketPrice` riga 39): un ETF con `assetClass: 'cash'` mantiene l'auto-update. **`assetPricing.ts` non va toccato.**
- Bug speculare in **edit**: cambiare il tipo (`AssetDialog.tsx:1296`) **non** ri-deriva la classe — create forza, edit non tocca. Regole opposte nelle due modalità.
- Fondo pensione: la colonna/gruppo "Classe" in `AssetManagementTab.tsx` (righe 328, 360-367, 656, 877-906) legge esclusivamente `asset.assetClass`, mai `composition`. `TYPE_TO_CLASS['pensionFund'] = 'equity'` è dichiarato in AGENTS.md come *fallback per un fondo la cui composizione è ancora vuota, non un'affermazione sull'asset*.

### Le due convenzioni "è un conto" (impatto XEON)

Nel repo convivono due convenzioni. Fixare la UI senza allinearle introduce bug nuovi proprio nel caso XEON:

**Stretta (`type === 'cash' && assetClass === 'cash'`) — corretta, già usata da:** `AssetDialog.tsx:500`, `TransactionDialog.tsx:137`, `ExpenseDialog.tsx:1001`, `PensionContributionDialog.tsx:81`, `app/dashboard/assets/page.tsx:272/288/292`, `assertCashSettlementAsset` (`lib/server/assetTransactionUseCase.ts:174`).

**Larga (solo `assetClass === 'cash'`) — da allineare o dichiarare:**

| Call site | Comportamento con ETF classe cash | Azione |
|---|---|---|
| `lib/services/assetService.ts:926` `calculateStampDuty` | applica la regola dei conti correnti (34,20 € sopra 5.000 €) invece dello 0,2% sui titoli | **Allineare a convenzione stretta** (decisione utente: un ETF è un titolo, bollo 0,2%) |
| `lib/utils/assetPriceHistoryUtils.ts:200-221` | escluso dallo storico prezzi pur avendo quotazione Yahoo | **Allineare a convenzione stretta** |
| `app/dashboard/settings/page.tsx:339` picker conti per liquidità fissa | un ETF comparirebbe tra i "conti" | **Allineare a convenzione stretta** |
| `lib/services/dashboardOverviewService.ts:295` (`cashNetWorth` / bucket Sintesi Patrimoniale) e aggregati di liquidità (`assetClassHistoryUtils`, budget Settings) | XEON conta come liquidità | **NON toccare** — intenzionale per AGENTS.md → *"do not extend the stricter filter to aggregate liquidity calculations"* (hardening 2026-07-26) |

## Decisioni fissate (do NOT relitigate)

1. **Solo `etf` espone il Select classe in creazione** (decisione utente). Gli altri tipi restano `TYPE_TO_CLASS`. Non si aggiunge un Select per `stock`/`bond`/ecc.
2. **Il Select classe ETF offre tutte e 8 le classi** (`equity`, `bonds`, `cash`, `crypto`, `commodity`, `realestate`, `trendFollowing`, `carry`). Motivo: `trendFollowing`/`carry` sono nate proprio per ETF a leva (feature Allocazione a Leva) e il picker delle gambe di composizione in AssetDialog le offre già. AGENTS.md → *Leva L0* segnala solo che quei due slug non hanno colore/target dedicati in Settings — limitazione nota da citare nel tooltip/commento, non un divieto.
3. **La classe prevalente del fondo pensione è SOLO display** (tabella Patrimonio). Non si riscrive mai `asset.assetClass` a read-time (AGENTS.md → *no inferred roles at read-time*): gli aggregati (Allocazione, snapshot, Storico) usano già `composition` per il look-through e non cambiano.
4. **XEON = titolo per bollo/storico prezzi/picker conti; = liquidità negli aggregati** (decisione utente, coerente con AGENTS.md hardening 2026-07-26).
5. **`assetPricing.ts` non si tocca**: il pricing resta type-based. Nessun nuovo membro in `MANUALLY_VALUED_TYPES`.
6. In **edit**, cambiare tipo ri-deriva la classe da `TYPE_TO_CLASS` (allineando create/edit), tranne quando il tipo scelto è `etf` (la classe resta modificabile a mano).

## Modifiche per file

### 1. UI — `components/assets/AssetDialog.tsx`

- **Step 2, solo `selectedType === 'etf'`, solo create**: nuovo Select "Classe Asset" subito sotto il riepilogo del tipo scelto (o comunque in testa alla sezione anagrafica), popolato con le 8 classi (riuso dell'array `assetClasses` righe 469-478 e delle label esistenti), default `equity` (già impostato da `handleTypeSelect`). Deve usare `useWatch` per il render e `getValues`/`setValue` nei handler (AGENTS.md → React Compiler: mai `watch()`).
- **Edit**: in `onValueChange` del Select Tipo (riga 1296), ri-derivare `setValue('assetClass', TYPE_TO_CLASS[value])` quando il nuovo tipo non è `etf`; per `etf` lasciare la classe corrente (l'utente può cambiarla dal Select classe già presente in edit).
- **Attenzione agli effetti keyed sulla classe** (il Select li fa scattare, ed è il comportamento desiderato — verificarli, non spegnerli):
  - default `isLiquid`/`autoUpdatePrice` (righe 606-627): scegliendo classe `cash` per un ETF, `isLiquid` deve suggerire `true` ma `autoUpdatePrice` deve restare `true` (il clamp esiste già in `buildAssetFormDataFromValues` riga 267). NB: AGENTS.md segnala che il guard `watchAutoUpdatePrice === undefined` è **morto** (mai vero) — non costruire nuova logica su quel guard.
  - suggerimento `allocationRole` (righe 634-653): keyed su classe — con classe `cash` non deve suggerire `excluded`/`frozen`.
  - `availableSubCategories()`/`isSubCategoryEnabled()` (862-876): cambiano con la classe — corretto.
- Commento di tipo **Design** (COMMENTS.md) sul nuovo Select: perché solo ETF, e perché la classe per gli altri tipi resta derivata.

### 2. Layer puro — nuovo `lib/utils/assetDisplayClass.ts` (o estensione di `lib/utils/assetDisplay.ts`)

```ts
/**
 * Display-only prevailing class: the composition leg with the largest share,
 * falling back to asset.assetClass when composition is empty.
 * NEVER used to rewrite asset.assetClass (no inferred values at read-time).
 */
export function resolveDisplayAssetClass(
  asset: Pick<Asset, 'assetClass' | 'composition'>
): AssetClass
```

- Implementazione: riuso della logica `assetLegs`/`toClassSlices` oggi **privata** in `components/allocation/PensionAllocationCards.tsx:42-68` (già ordina le slice per valore decrescente → `slices[0].assetClass`). Estrarre la parte pura e far delegare `PensionAllocationCards` all'util (Rule of Three: terzo consumatore della stessa logica → si astrae).
- Vale per **qualsiasi asset con `composition`** (ETF composto incluso), non solo pensionFund: la funzione è generica; la tabella la usa per tutti.
- Test in `__tests__/assetDisplayClass.test.ts`: composizione 70/30 → classe prevalente; composizione vuota/assente → fallback `assetClass`; pareggio 50/50 → prima leg in ordine di inserimento (documentare la scelta); percentuali che non sommano 100.

### 3. UI tabella — `components/assets/AssetManagementTab.tsx`

- Badge di riga (righe 656, 689-698), header di gruppo (877-906), raggruppamento (360-367) e ordinamento colonna Classe (328): sostituire `asset.assetClass` con `resolveDisplayAssetClass(asset)`. Le utility colore/label esistenti (`getAssetClassCssVar`, `formatAssetClassName`) restano invariate — cambiano solo gli argomenti.
- NON toccare la card "Conti correnti" in `app/dashboard/assets/page.tsx:288` (già convenzione stretta: un ETF classe cash resta correttamente in tabella).

### 4. Allineamento convenzione stretta (decisione 4)

- `lib/services/assetService.ts:926` `calculateStampDuty`: la regola conto corrente (34,20 € sopra 5.000 €) si applica solo a `type === 'cash' && assetClass === 'cash'`; tutto il resto → 0,2%. Commento **Why** con il razionale fiscale.
- `lib/utils/assetPriceHistoryUtils.ts:200-221`: escludere dallo storico prezzi solo i veri conti (convenzione stretta), non gli ETF classe cash.
- `app/dashboard/settings/page.tsx:339`: il picker dei conti per la liquidità fissa filtra con la convenzione stretta.
- `lib/services/dashboardOverviewService.ts:295` e gli altri aggregati di liquidità: **invariati** — aggiungere (se assente) un commento Checklist che rimanda ad AGENTS.md hardening 2026-07-26.

## Impatti sul resto dell'app (cosa NON toccare)

- **Routing prezzi bond**: `lib/helpers/priceUpdater.ts:76-82` instrada su Borsa Italiana con `type === 'bond' && assetClass === 'bonds'` — il fix non tocca i bond; non introdurre un Select classe per i bond proprio per non rompere questo routing.
- **Snapshot storici immutabili**: `byAssetClass` è congelato negli snapshot. Cambiare la classe di un asset esistente (es. XEON creato come equity e corretto a cash) produce uno scalino nelle serie storiche di Allocazione/Storico dal mese del cambio. Comportamento accettato: documentarlo nella spec ma non "correggere" gli snapshot.
- **Allocazione/esposizione**: `calculateCurrentAllocation`, `expandAssetExposure`, `buildHoldings` sono composition-first con fallback `assetClass` — un ETF classe cash finisce nel bucket cash dell'Allocazione: è il comportamento desiderato per XEON. Nessuna modifica. Non aggiungere special-case `type === 'pensionFund'` in `expandAssetExposure` (divieto esplicito AGENTS.md).
- **Cash pickers / settlement**: già convenzione stretta lato client e server (`assertCashSettlementAsset`) — un ETF classe cash non è selezionabile come conto di regolamento. Corretto, invariato.
- **Invalidation**: ogni `onClose` dopo mutazione asset invalida `queryKeys.assets.all` **e** `queryKeys.dashboard.overview` (AGENTS.md) — il flusso esistente di AssetDialog già lo fa; non regredire.
- L'union `AssetType` è enumerata in due punti di AssetDialog (`TYPE_TO_CLASS` + `z.enum`) — questo fix non aggiunge tipi, ma se si toccano gli schema ricordare la checklist di `types/assets.ts:15-17`.

## Test

- `__tests__/assetDisplayClass.test.ts` (nuovo): matrice sopra.
- Aggiornare eventuali test di `calculateStampDuty` (o crearli): conto vero sopra/sotto 5.000 €; ETF classe cash → 0,2%; titolo normale → 0,2%.
- Verifica manuale: (1) crea XEON come ETF → nello step 2 scegli classe "Liquidità" → salva → in tabella appare con badge Liquidità, prezzo auto-aggiornato, NON tra le card Conti correnti; (2) fondo pensione con composizione 70 obbligazioni / 30 azioni → tabella mostra "Obbligazioni"; senza composizione → "Azioni" (fallback); (3) in edit, cambia tipo da stock a crypto → la classe segue; cambia tipo a etf → la classe resta e il Select è editabile.
- Gate: `npx tsc --noEmit` + `npx vitest run __tests__/assetDisplayClass.test.ts` (+ suite toccate) + `npm run build`.

## Prompt di implementazione

> *Sonnet 5, effort alto.* Feature UI + util pura + 3 allineamenti puntuali. Nessuna migrazione dati.

```text
Implementa la spec "Selezione della Classe Asset per ETF + Classe Prevalente del Fondo Pensione".

Leggi PRIMA di scrivere codice:
- docs/specs/6-asset-class-selection.md (INTEGRALE — le Decisioni fissate non si rilitigano)
- AGENTS.md → sezioni: AssetDialog, Ticker Display Alias, Asset Pricing, Fondo Pensione, hardening 2026-07-26 su assetClass 'cash', Leva L0 (array classi non allineati), regola "no inferred roles at read-time", regola useWatch/getValues (React Compiler)
- CLAUDE.md (stato corrente), COMMENTS.md (APPLICALA), DEVELOPMENT_GUIDELINES.md (APPLICALA), DESIGN.md (per il nuovo Select)

Scope ESATTO (nessun altro file):
- components/assets/AssetDialog.tsx (Select classe per ETF in create; ri-derivazione classe al cambio tipo in edit)
- lib/utils/assetDisplayClass.ts (nuovo: resolveDisplayAssetClass) + refactor di components/allocation/PensionAllocationCards.tsx per delegare la logica estratta
- components/assets/AssetManagementTab.tsx (badge/gruppi/sort su resolveDisplayAssetClass)
- lib/services/assetService.ts (calculateStampDuty a convenzione stretta)
- lib/utils/assetPriceHistoryUtils.ts (esclusione a convenzione stretta)
- app/dashboard/settings/page.tsx (picker conti liquidità a convenzione stretta)
- __tests__/assetDisplayClass.test.ts (nuovo) + test stamp duty

NON toccare: lib/utils/assetPricing.ts, lib/helpers/priceUpdater.ts, dashboardOverviewService.ts (aggregati liquidità larghi = intenzionali), expandAssetExposure, logica settlement/cash-picker, snapshot.

Gate: npx tsc --noEmit + npx vitest run (suite nuove e toccate) + npm run build.
Al termine FERMATI: aggiorna SESSION_NOTES.md, riassumi COSA hai fatto e COME testarlo a mano (i 3 scenari della sezione Test), ATTENDI conferma prima di ogni altra cosa.
Branch: feature/asset-class-selection. Conventional Commits.
```
