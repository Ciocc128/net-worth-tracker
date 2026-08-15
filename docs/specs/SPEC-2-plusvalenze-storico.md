# SPEC-2 — Plusvalenze realizzate (ledger) nel grafico "Risparmio vs Crescita Investimenti"

**Stato**: NON SI IMPLEMENTA (deciso 2026-08-15, dopo un'implementazione completa + collaudo
guidato verde, poi scartata) · **Dipendenze**: SPEC-1 (usa `aggregateRealizedByYear` spostata nel
motore, comunque implementata e in produzione) · **Pagine toccate**: Storico (nessuna, non
implementata)

## Perché si è deciso di non farla

Implementata e verificata end-to-end (collaudo guidato su emulatore, tutte le fasi verdi), poi
scartata su richiesta esplicita del proprietario del prodotto: per un investitore che vende quasi
solo per necessità, una serie "plusvalenze realizzate per anno" è quasi sempre assente o vicina
allo zero — rumore su un grafico che DESIGN.md vuole "dati prima, decorazione mai", senza
aggiungere nulla che serva a capire l'andamento del patrimonio. Il residuo `investmentGrowth`
già in pagina include TUTTA la performance di mercato (realizzata + non realizzata); isolare la
quota realizzata ha valore per il tracking fiscale (evento tassabile vs plusvalenza su carta), non
per la lettura "come sta andando il mio patrimonio" che è lo scopo di questa card. Nessun codice
di questa spec è rimasto nel repo: branch e modifiche sono stati scartati per intero.

**Non blocca nient'altro**: nessun'altra spec del piano (`README.md`) dipende da SPEC-2 — la
dipendenza va nell'altra direzione (SPEC-2 dipendeva da SPEC-1, non viceversa), e il filone 4A→4B→4C→4D
(Assistente) è indipendente. Non implementarla non richiede alcun aggiustamento alle spec successive.

## Decisione di fondo (già presa, non rimetterla in discussione)

I grafici "Risparmio vs investimenti" e "Lavoro & Investimenti" **restano basati sul residuo**
`investmentGrowth = ΔNetWorth − risparmioNetto`: è l'unica base che copre l'intero patrimonio
(cash, immobili, fondo pensione inclusi) e l'intera storia. Il ledger NON può sostituirlo:
copre solo 5 tipi di asset (`LEDGER_ASSET_TYPES`, `types/assetTransactions.ts:17-22`) e parte dal
giorno della migrazione (`assertDateWithinBounds` vieta trade prima di `meta.baselineDate`).
Questa spec aggiunge una serie **additiva**: le **plusvalenze realizzate per anno** dal ledger,
che rendono leggibile una parte del residuo senza toccarne il calcolo.

## Stato attuale (verificato)

- Card "Risparmio vs Crescita Investimenti": `app/dashboard/history/page.tsx:1107-1268`
  (BarChart annuale `:1192-1206`, mensile `:1234-1247`; toggle Annuale/Mensile `:1128-1172`).
- Dati: `lib/services/chartService.ts` → `prepareSavingsVsInvestmentData` (`:417-509`, annuale),
  `...Monthly` (`:528-600`), `...AllMonths` (`:613-691`). Formula del residuo a `:498/588/678`.
- La pagina Storico **non importa nulla del ledger** oggi (`page.tsx:1-93`).
- Precedente da copiare: `app/dashboard/performance/page.tsx:83-84, 691-697` usa
  `useAssetTransactions(ownerId)` + `useAssetLedgerMeta(ownerId)` + `aggregateRealizedByYear(ledgerTrades)`.
- `aggregateRealizedByYear` → dopo SPEC-1 vive in `lib/utils/assetTransactionUtils.ts` e ritorna
  `{ byYear: Record<number, number>, skippedAssets: number }` (raggruppa per `assetId` prima del fold).

## Implementazione

### 1. Dati

- In `app/dashboard/history/page.tsx` aggiungere `useAssetTransactions(ownerId)` e
  `useAssetLedgerMeta(ownerId)` (lazy non necessario: la pagina carica già tutto lo storico).
- `useMemo`: `realizedByYear = aggregateRealizedByYear(ledgerTrades)` quando `meta` esiste;
  `meta === null` (migrazione mai eseguita) → la serie non esiste, il grafico resta identico a oggi.

### 2. Grafico — SOLO vista annuale

- Nella vista **annuale** aggiungere la serie "Plusvalenze realizzate" come **barra separata,
  MAI impilata** sulle altre due: i realized possono essere negativi e AGENTS vieta stack con
  componenti negative (il segmento negativo si disegna verso il basso e lo stack non torna più).
- **Onestà sui buchi**: per gli anni **precedenti all'anno di `meta.baselineDate`** il valore è
  **assente** (nessuna barra), mai `0` — stessa regola `number | null` di `comparisonDeltas`
  ("un valore sotto il floor è inconoscibile, non zero"). L'anno della migrazione è parziale:
  la caption lo dichiara.
- Caption sotto il grafico (eyebrow/nota in muted): `"Plusvalenze realizzate dal ledger, dal
  {mese anno di baselineDate}. Non incluse nelle altre barre."` — regola AGENTS: una finestra
  diversa da quella del grafico si dichiara sempre.
- `skippedAssets > 0` → aggiungere alla caption `"{n} asset esclusi per storico non valido"`
  (stesso comportamento di `RealizedGainsSection`).
- Vista **mensile: fuori scope** (il motore aggrega per anno fiscale; il per-mese richiederebbe
  gli effects per data — eventuale follow-up, non farlo qui).
- Tooltip: aggiornare per la terza serie; ricordare i TRE props separati (`contentStyle`,
  `labelStyle`, `itemStyle`) con i token `var(--card)`/`var(--border)`/`var(--card-foreground)`.
- Colori: `useChartColors()` per la nuova serie (slot non in conflitto con le due esistenti);
  `fill` sul `<Bar>` (la `Legend` legge quello, non i `<Cell>`); tick con `CHART_TICK_STYLE`
  (Mono Mandate) se non già presenti su questo grafico — verificare.
- Legenda/label accessibile: il grafico ha `role="img"` + `aria-label`? Se sì, la label deve
  citare anche la nuova serie (il `role="img"` nasconde la `<Legend>` agli screen reader).

### 3. Cosa NON toccare

- Le tre funzioni `prepareSavingsVsInvestment*` e la loro formula del residuo.
- La card "Lavoro & Investimenti" (il ledger non sa nulla di stipendi/spese: nessun beneficio).
- Nessuna modifica a `chartService.ts` se la fusione per anno può avvenire nel `useMemo` della
  pagina (merge di `savingsData` con `realizedByYear` per chiave anno). Se serve una funzione di
  merge, farla **pura e testata** in `lib/utils/` (convenzione: dati time-bucketed in pure layer).

### 4. Test e verifica

- Se nasce la funzione pura di merge: test dedicato (anni senza ledger → `null`, anno migrazione
  parziale, realized negativo, `skippedAssets` propagato).
- `npx tsc --noEmit` + `TZ=Europe/Rome npx vitest run` (suite d'area: `chartService` se toccato,
  `assetTransactionUtils`).
- Verifica visiva a mano su emulatore (seed esistente) — il collaudo guidato di WORKFLOW.md copre
  il caso "meta assente" e il caso con vendite reali.

---

## Prompt per l'implementazione

> Implementa la specifica `docs/specs/SPEC-2-plusvalenze-storico.md`: nella card "Risparmio vs
> Crescita Investimenti" di Storico (vista annuale), aggiungi la serie additiva "Plusvalenze
> realizzate" dal ledger via `aggregateRealizedByYear`, come barra separata mai impilata, con
> valori assenti (non zero) prima della baseline di migrazione e caption che dichiara finestra e
> asset saltati. Non toccare la formula del residuo né la card "Lavoro & Investimenti". Segui la
> specifica alla lettera. Al termine proponi il collaudo guidato secondo WORKFLOW.md.
>
> Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
> - Leggi AGENTS.md (pattern, convenzioni, gotcha)
> - Leggi CLAUDE.md (stato corrente, known issues)
> - Leggi WORKFLOW.md
> - Leggi COMMENTS.md e APPLICALA mentre scrivi codice
> - Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
>
> Crea SESSION_NOTES.md per tracciare il lavoro.

**Modello consigliato**: Sonnet 5, effort **high**. Feature additiva e ben delimitata; la parte
delicata (Recharts + regole di onestà sui buchi) è tutta scritta nella specifica.
