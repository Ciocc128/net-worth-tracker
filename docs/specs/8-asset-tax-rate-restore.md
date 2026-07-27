# Reintroduzione dell'Aliquota Fiscale per gli Asset a Ledger — Spec

> Status: **SPEC — pronta per implementazione** (2026-07-27). Riferimento fedele: `components/assets/AssetDialog.tsx`, `lib/services/assetService.ts`.

## Obiettivo

Con la migrazione al ledger delle operazioni (Registro operazioni), l'AssetDialog ha giustamente reso il PMC un valore derivato (read-only). Ma il campo **"Aliquota Fiscale (%)"** viveva nello stesso blocco "Tracciamento Cost Basis" ed è stato nascosto insieme al PMC: oggi per **tutti** i tipi a ledger (stock/etf/bond/crypto/commodity) l'aliquota non è più impostabile né in creazione né in modifica. Va reintrodotta come **campo autonomo** (un'unica aliquota per asset, usata sia per plusvalenze che per dividendi/cedole — decisione utente 2026-07-27).

## Diagnosi (causa radice)

- Il campo esiste ancora, sia nel modello (`types/assets.ts:128` `Asset.taxRate`, `:171` `AssetFormData.taxRate`) sia nel form (`AssetDialog.tsx:2293-2319`, con lo shortcut *"Titoli di Stato italiani (BTP, CCT, BOT): imposta 12,5%"*). Ma il blocco che lo contiene è gated:

```tsx
// AssetDialog.tsx:2215-2218
{newAsset_showCostBasis && !isLedgerEdit && !isLedgerCreate && (
```

  con `isLedgerEdit`/`isLedgerCreate` veri per ogni tipo in `LEDGER_ASSET_TYPES` → il campo è **irraggiungibile** per praticamente tutti gli asset investiti. Il blocco mescola due cose di natura diversa: `averageCost` (legittimamente derivato dal ledger) e `taxRate` (metadato fiscale puro, che col ledger non c'entra nulla).
- **Regressione non intenzionale** della Fase C del ledger: nessuna spec/AGENTS.md dichiara `taxRate` deprecato; anzi il layer di persistenza lo tratta come campo vivo — `updateAssetMetadata` (`assetService.ts:327-346`) lo scrive e lo cancella (`undefined → deleteField()` a riga 340; AGENTS.md: *"keeps taxRate clearing only"*). Anche zod (`AssetDialog.tsx:368`) e i normalizzatori (righe 250, 299) sono intatti. **Manca solo la UI.**
- In creazione ledger (`AssetDialog.tsx:1105`) `taxRate` è sempre `undefined` (campo mai renderizzato) → nessun nuovo asset può avere un'aliquota.

### Danno concreto attuale

| Consumatore | Comportamento senza `taxRate` |
|---|---|
| `lib/server/dividendProcessor.ts:413-414` | dividendi/cedole tassati al **26% di default** — un BTP a ledger non può avere il suo 12,5% |
| `lib/services/couponScheduling.ts:41-45` (`resolveCouponTaxRate`) | idem per la cedola successiva e il premio finale |
| `lib/services/assetService.ts:787-795` (`calculateEstimatedTaxes`) | **nessun fallback**: tasse stimate = 0 → il blocco "Impatto Fiscale" di Panoramica/Patrimonio ignora l'asset |
| `components/assets/TaxCalculatorModal.tsx:105/118/181/310` | simulatore di vendita con "Aliquota fiscale: 0%" e tasse 0 |
| `components/assets/AssetCard.tsx:316-319` | riga "Aliquota: X%" assente |

## Decisioni fissate (do NOT relitigate)

1. **Un solo campo `taxRate`** per asset, usato sia per le plusvalenze sia per dividendi/cedole (decisione utente). Nessun `dividendTaxRate` separato, nessuna migrazione dati.
2. **Il PMC resta derivato dal ledger** (read-only in edit, posizione iniziale in create). Questo fix riguarda solo `taxRate`.
3. **Il ledger non modella la fiscalità**: `assetTransactionUtils.ts`, `TransactionDialog`, `AssetMovementsDialog` non acquisiscono campi fiscali. L'aliquota sta sull'asset.
4. I fallback al 26% nei consumatori (dividendProcessor, couponScheduling) **restano**: sono il default corretto per l'Italia quando l'aliquota non è specificata.
5. Fix incluso: un `taxRate` pari a **0** è legittimo e deve sopravvivere a un giro di edit (oggi `asset.taxRate || undefined` lo cancella).

## Modifiche per file

### `components/assets/AssetDialog.tsx` (unico file di codice)

1. **Scorporare `taxRate` dal blocco Cost Basis** (righe 2293-2319, incluso lo shortcut BTP 12,5% delle righe 2310-2318, riutilizzato tale e quale):
   - **Non-ledger** (cash/realestate esclusi come oggi): il campo resta dov'è, dentro il blocco Cost Basis — per questi tipi non cambia nulla.
   - **Ledger edit**: renderizzare il campo (editabile) dentro/accanto al blocco read-only Quantità/PMC (righe 1459-1494). Il submit passa già da `updateAssetMetadata` (righe 1064-1070: la destrutturazione toglie solo `quantity`/`averageCost`, `taxRate` viaggia già nel payload).
   - **Ledger create**: renderizzare il campo nel blocco "Posizione iniziale (primo acquisto)" (righe 1496-1560). In `onSubmit` (riga 1105) smettere di perdere il valore: `createAsset(ownerId, { ...formData, quantity: 0, averageCost: undefined })` lo trasporta già una volta che il campo è renderizzato e registrato.
   - La condizione di visibilità del campo diventa `newAsset_showCostBasis` **da sola** (esclude cash/realestate/pensionFund, che non hanno plusvalenze), senza `!isLedgerEdit && !isLedgerCreate`. Se il gate viene implementato spostando il JSX, mantenere un'unica istanza del campo (estrarre un piccolo sotto-componente locale, non duplicare l'input in tre rami).
2. **Bug del valore 0** — riga 741: `taxRate: asset.taxRate || undefined` → `taxRate: asset.taxRate ?? undefined`. Senza questo, un'aliquota 0 salvata viene cancellata (`deleteField`) al primo giro di edit. Stesso audit sugli altri usi di `|| undefined` per `taxRate` nel file (righe ~250, ~299: lì il normalizzatore converte NaN/'' → undefined, comportamento corretto da conservare per il campo vuoto; distinguere "vuoto" da "0").
3. Commento **Why** sul campo: perché l'aliquota è un metadato dell'asset e non del ledger, e perché copre sia plusvalenze che dividendi.

### Nessun altro file

- `lib/services/assetService.ts`: già pronto (`updateAssetMetadata` scrive/cancella `taxRate`). Non toccare `updateAsset` per i tipi a ledger (AGENTS.md: il suo `averageCost === undefined → deleteField()` cancellerebbe il PMC).
- `types/assets.ts`, zod, normalizzatori: intatti.

## Impatti sul resto dell'app

- Appena l'aliquota è di nuovo impostabile: "Impatto Fiscale" (Panoramica + Patrimonio) torna a valorizzarsi per gli asset a ledger (`flags.hasCostBasisTracking` già considera `taxRate > 0` — `dashboardOverviewService.ts:405-407`); il TaxCalculatorModal mostra l'aliquota reale; il cron dividendi usa il 12,5% sui BTP dal **prossimo** processamento (i dividendi già registrati non vengono ricalcolati — accettato, sono record storici).
- `lib/utils/allocationUtils.ts:967-968`: i piani di prelievo continuano deliberatamente a NON modellare il capital-gain — invariato.
- Invalidation: il flusso esistente di AssetDialog (assets.all + dashboard.overview) copre già l'aggiornamento dell'Impatto Fiscale — non regredire.

## Test

- La logica è quasi tutta form-side; i punti testabili:
  - se si estrae il sotto-componente/il resolver di visibilità, test mirato sul gate: ledger edit → visibile+editabile; ledger create → visibile; cash/realestate/pensionFund → nascosto.
  - regressione `?? undefined`: round-trip con `taxRate: 0` non deve produrre `deleteField`.
- Verifica manuale: (1) edit di un ETF a ledger → campo Aliquota visibile accanto a Quantità/PMC read-only → imposta 26 → salva → AssetCard mostra "Aliquota: 26%", Impatto Fiscale in Panoramica si aggiorna; (2) crea un BTP (bond, ledger) → nella Posizione iniziale usa lo shortcut 12,5% → salva → TaxCalculatorModal mostra 12,5%; (3) imposta aliquota 0 → salva → riapri edit → è ancora 0 (non vuoto); (4) svuota il campo → salva → l'aliquota sparisce (deleteField) e le tasse stimate tornano 0.
- Gate: `npx tsc --noEmit` + `npx vitest run` (suite toccate) + `npm run build`.

## Prompt di implementazione

> *Sonnet 5, effort medio.* Un solo file di codice; la persistenza esiste già. Il rischio è tutto nel gating del form e nel bug `|| undefined`.

```text
Implementa la spec "Reintroduzione dell'Aliquota Fiscale per gli Asset a Ledger".

Leggi PRIMA di scrivere codice:
- docs/specs/8-asset-tax-rate-restore.md (INTEGRALE — le Decisioni fissate non si rilitigano)
- AGENTS.md → sezione Asset Trade Ledger (updateAssetMetadata vs updateAsset, "keeps taxRate clearing only") + regola useWatch/getValues (React Compiler)
- CLAUDE.md, COMMENTS.md (APPLICALA), DEVELOPMENT_GUIDELINES.md (APPLICALA), DESIGN.md (posizionamento del campo nel form)

Scope ESATTO:
- components/assets/AssetDialog.tsx (scorporo taxRate dal blocco Cost Basis; campo visibile in ledger edit accanto a Quantità/PMC read-only e in ledger create nella Posizione iniziale; gate = newAsset_showCostBasis da solo; fix `|| undefined` → `?? undefined` alla riga ~741; shortcut BTP 12,5% riusato)
- eventuale test mirato nuovo in __tests__/

NON toccare: lib/services/assetService.ts, types/assets.ts, assetTransactionUtils.ts, TransactionDialog, AssetMovementsDialog, dividendProcessor, couponScheduling (i fallback 26% restano).

Gate: npx tsc --noEmit + npx vitest run (suite toccate) + npm run build.
Al termine FERMATI: aggiorna SESSION_NOTES.md, riassumi COSA hai fatto e COME testarlo a mano (i 4 scenari della sezione Test), ATTENDI conferma.
Branch: fix/asset-tax-rate-restore. Conventional Commits.
```
