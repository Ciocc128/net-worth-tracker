# Etichette per Asset senza Ticker nei Grafici (Fallback al Nome) — Spec

> Status: **SPEC — pronta per implementazione** (2026-07-27). Riferimento fedele: `lib/utils/assetDisplay.ts`, `lib/services/chartService.ts`.

## Obiettivo

Gli asset senza ticker — conti correnti, immobili, fondi pensione (il form nasconde ticker e alias per questi tipi) — entrano nel grafico "Distribuzione per Asset" di Panoramica con **etichetta vuota**: la barra c'è, la legenda mostra una riga senza testo, e con due o più asset senza ticker si generano key React duplicate. Il fix aggiunge il fallback a `asset.name` **nel resolver centrale** `getAssetDisplayTicker` (decisione utente: nessun nuovo campo alias per i tipi senza ticker), e ripulisce i fallback inline replicati nei consumatori.

## Diagnosi (causa radice)

- `lib/services/chartService.ts:73-119` (`prepareAssetDistributionData`): calcola `name: asset.name` e `ticker: getAssetDisplayTicker(asset)`, poi **butta via il name** — l'etichetta finale è `name: asset.ticker` (righe 100-101). Per un conto corrente `ticker === ''` e `displayTicker` assente → etichetta `''`.
- `lib/utils/assetDisplay.ts:21-24` — il resolver risolve `displayTicker → ticker` ma **non ha fallback su `name`**; la sua interfaccia `DisplayTickerSource` (righe 12-15) non contempla `name`.
- Flusso: `dashboardOverviewService.ts:386-387` → cache materializzata → `app/dashboard/page.tsx:176-200` → `OverviewChartsSection.tsx:49-51` (`toSegments`: `key: item.name`, `label: item.name`). Con etichetta vuota: segmento senza titolo, riga di legenda vuota (filtro ≥5% alle righe 210/264), e **key React duplicate** con ≥2 asset senza ticker (`CompositionBar` usa `key={seg.key}` = `''`; la legenda mobile `key={item.name}`; quella desktop usa `${item.name}-${i}` ed è salva).
- Il grafico "Distribuzione per Asset Class" non è affetto (etichette da `getAssetClassName`).
- I consumatori si difendono da soli, in ordine sparso: il fallback `|| asset.name` (o simili) è **replicato in 7 punti con 4 forme diverse** — `AssetCard.tsx:143`, `AssetManagementTab.tsx:675`, `AssetMovementsDialog.tsx:170`, `GoalsHero.tsx:289`, `allocationUtils.ts:853`, `InstrumentTradeList.tsx:27`, `DividendDialog.tsx:321` — esattamente l'anti-pattern che la spec dell'alias voleva eliminare (*"Resolve via getAssetDisplayTicker; never inline `?? ticker`"*, `types/assets.ts:114`).
- Violazione diretta della convenzione: `components/assets/AssetPriceHistoryTable.tsx:237` fa `{asset.displayTicker ?? asset.ticker}` inline.
- Consumatori senza alcuna difesa oltre a chartService: `lib/services/pdfDataService.ts:180`, `components/pdf/sections/PortfolioSection.tsx:90/176` (usano `asset.ticker` grezzo).

## Decisioni fissate (do NOT relitigate)

1. **Il fallback vive nel resolver centrale**, una volta sola: `displayTicker → ticker → name`. Nessun campo alias nuovo per cash/realestate/pensionFund (decisione utente 2026-07-27).
2. `DisplayTickerSource` si estende con `name?: string` **opzionale**: i call site che oggi passano oggetti senza `name` restano validi (structural typing); dove `name` è disponibile va passato.
3. I fallback inline nei 7 consumatori si **rimuovono** dove diventano ridondanti (delegano al resolver), in un unico sweep — non si lascia la doppia difesa.
4. Ultimo gradino del fallback: se anche `name` manca/vuoto (oggetti legacy tipo `byAsset` degli snapshot), il resolver ritorna `ticker` com'è oggi (stringa vuota) — nessun placeholder inventato. I punti UI che possono ricevere stringa vuota da dati storici usano gli accorgimenti già esistenti (es. `MonthlyAssetBreakdownSection` risolve l'asset vivo per `assetId`).

## Modifiche per file

### 1. `lib/utils/assetDisplay.ts`

```ts
export interface DisplayTickerSource {
  ticker: string;
  displayTicker?: string | null;
  /** Human name, used as last-resort label for tickerless assets (cash/realestate/pensionFund). */
  name?: string;
}

export function getAssetDisplayTicker(asset: DisplayTickerSource): string {
  const alias = asset.displayTicker?.trim();
  if (alias) return alias;
  const ticker = asset.ticker?.trim();
  if (ticker) return ticker;
  return asset.name?.trim() ?? asset.ticker;
}
```

Aggiornare il commento Design in testa al file (il resolver ora garantisce un'etichetta anche per asset senza ticker).

### 2. `lib/services/chartService.ts` (`prepareAssetDistributionData`, righe 73-119)

- Passare l'asset intero (contiene già `name`) al resolver — con il fix del punto 1 l'etichetta esce giusta senza altro codice. Rimuovere la doppia proprietà `name`/`ticker` intermedia se ridondante.
- Nota: il dato arriva alla UI attraverso la **cache materializzata** dell'overview (`dashboard-summary`): l'etichetta corretta appare al primo refresh della cache dopo il deploy — accettato, nessun bust manuale.

### 3. Sweep consumatori (rimozione fallback inline ridondanti)

- `components/assets/AssetCard.tsx:143`, `components/assets/AssetManagementTab.tsx:675`, `components/assets/AssetMovementsDialog.tsx:170`, `components/goals/GoalsHero.tsx:289`, `lib/utils/allocationUtils.ts:853`, `components/allocation/InstrumentTradeList.tsx:27`, `components/dividends/DividendDialog.tsx:321` → delegare al resolver (verificare caso per caso: alcuni mostrano *name + ticker* insieme, lì il fallback inline ha un ruolo diverso e va lasciato — decidere leggendo il contesto, non a regex).
- `components/assets/AssetPriceHistoryTable.tsx:237`: sostituire l'inline `displayTicker ?? ticker` con il resolver (fix della violazione di convenzione).
- `lib/services/pdfDataService.ts:180` + `components/pdf/sections/PortfolioSection.tsx:90/176`: usare il resolver (il PDF oggi stampa ticker grezzo/vuoto).
- Intenzionalmente NON toccati (come da convenzione alias esistente): `CreateManualSnapshotModal`, `DividendTrackingTab` (log di scraping), `BenchmarkComparisonSection`, `ExposureSection`, `snapshotService.ts:83-95` (`byAsset[].ticker` resta il ticker raw: è un dato storico, non un'etichetta).

### 4. `components/dashboard/OverviewChartsSection.tsx` (difesa key)

- `CompositionBar`/legenda mobile: chiavi da `item.name` a `${item.name}-${i}` (come già fa la legenda desktop). Difesa in profondità contro futuri nomi duplicati (due asset possono chiamarsi uguale).

## Impatti sul resto dell'app

- Tutti i punti che oggi mostrano stringa vuota per asset senza ticker inizieranno a mostrare il **nome**: Patrimonio, Movimenti, piani di Allocazione, Goal, PDF. È il comportamento desiderato ovunque; l'unico rischio è un nome lungo dove ci si aspettava un ticker corto (es. barre strette) — i componenti troncano già con ellissi via CSS (verificare visivamente i due grafici di Panoramica).
- La cache `dashboard-summary` e `performance-cache` non cambiano struttura: nessuna invalidazione manuale necessaria.
- Test esistente `__tests__/assetDisplay.test.ts` da estendere, non riscrivere.

## Test

- `__tests__/assetDisplay.test.ts`: alias presente → alias; alias vuoto/whitespace → ticker; ticker vuoto → name; tutto vuoto → stringa vuota (ticker); name con whitespace.
- Verifica manuale: (1) Panoramica → "Distribuzione per Asset" con ≥2 conti correnti → entrambe le barre etichettate col nome del conto, nessun warning React in console; (2) immobile e fondo pensione etichettati; (3) ETF con alias → mostra ancora l'alias (nessuna regressione); (4) export PDF → sezione portfolio con nomi al posto dei vuoti.
- Gate: `npx tsc --noEmit` + `npx vitest run __tests__/assetDisplay.test.ts` (+ suite toccate) + `npm run build`.

## Prompt di implementazione

> *Sonnet 5, effort basso/medio.* Un resolver + sweep meccanico ma da fare con giudizio (alcuni fallback inline mostrano name+ticker insieme e vanno lasciati).

```text
Implementa la spec "Etichette per Asset senza Ticker nei Grafici (Fallback al Nome)".

Leggi PRIMA di scrivere codice:
- docs/specs/9-asset-chart-labels.md (INTEGRALE — le Decisioni fissate non si rilitigano)
- AGENTS.md → sezione Ticker Display Alias (convenzione "never inline ?? ticker", lista dei punti intenzionalmente non toccati)
- CLAUDE.md, COMMENTS.md (APPLICALA), DEVELOPMENT_GUIDELINES.md (APPLICALA)

Scope ESATTO:
- lib/utils/assetDisplay.ts (fallback name + estensione DisplayTickerSource + commento Design)
- lib/services/chartService.ts (prepareAssetDistributionData)
- components/dashboard/OverviewChartsSection.tsx (key con indice)
- Sweep: AssetCard, AssetManagementTab, AssetMovementsDialog, GoalsHero, allocationUtils, InstrumentTradeList, DividendDialog (rimuovi i fallback inline SOLO dove ridondanti — leggi il contesto), AssetPriceHistoryTable.tsx:237 (fix violazione), pdfDataService + PortfolioSection (usa il resolver)
- __tests__/assetDisplay.test.ts (estendi)

NON toccare: snapshotService (byAsset[].ticker resta raw), CreateManualSnapshotModal, DividendTrackingTab, BenchmarkComparisonSection, ExposureSection, AssetDialog (nessun campo alias nuovo).

Gate: npx tsc --noEmit + npx vitest run (assetDisplay + suite toccate) + npm run build.
Al termine FERMATI: aggiorna SESSION_NOTES.md, riassumi COSA hai fatto e COME testarlo a mano (i 4 scenari della sezione Test), ATTENDI conferma.
Branch: fix/asset-chart-labels. Conventional Commits.
```
