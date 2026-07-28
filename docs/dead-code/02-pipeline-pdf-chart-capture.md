# Spec 02 — Pipeline PDF chart-capture (no-op) e dominio PDF

**✅ Implementata (2026-07-28)** — branch `chore/dead-code-02-pdf`, sezioni A-D
tutte completate con un commit convenzionale ciascuna. Validazione finale verde:
`tsc` pulito, suite completa 79 file / 1406 test, `npm run build` ok, `npx knip`
non segnala più nessuno dei simboli di questa spec. Smoke funzionale: nessun
account demo configurato in questo ambiente, quindi verificato rendendo
`<PDFDocument>` con dati sintetici per tutte e 7 le sezioni via
`@react-pdf/renderer` in Node — PDF valido prodotto. Scoperta oltre la spec:
`ChartImage`/`ChartCaptureOptions` in `types/pdf.ts` sono diventati orfani solo
in conseguenza della sezione A e sono stati rimossi nella stessa sessione.
Dettagli in `git log` sul branch.

**Rischio: medio** — si tocca una feature attiva (export PDF), ma la pipeline
rimossa è **già oggi un no-op funzionale**: nessun comportamento visibile cambia.
La verifica finale include uno smoke dell'export PDF.

Leggi prima `docs/dead-code/README.md` (protocollo condiviso).

## Il finding centrale (scoperto dalla discovery, NON da knip)

`lib/utils/pdfGenerator.tsx:15-25` — `getRequiredChartIds()` ritorna
**incondizionatamente `[]`**: il parametro `sections` non è mai letto e il corpo
contiene solo commenti ("History section now uses tables instead of charts").
Di conseguenza, a ogni export:

- `captureCharts([])` (`pdfGenerator.tsx:51-54`) produce una mappa vuota
  (il log stampa sempre "Capturing 0 charts...");
- `cleanupChartImages` (righe 113, 122) pulisce una mappa vuota;
- la prop `chartImages` attraversa `PDFDocument.tsx:93` → `HistorySection.tsx:57`
  (JSDoc riga 55: "currently unused but reserved") e
  `AllocationSection.tsx:37` (JSDoc riga 35: "currently unused in this section")
  senza che nessuno la renda;
- l'unico componente capace di renderla, `PDFChart.tsx`, è un orfano confermato
  (chiamante rimosso in `b5a1231` "Replace net worth chart with table in
  HistorySection", 2025-12-17).

Knip vedeva `chartCapture.ts` "vivo" perché importato — è la forma classica
"vivo solo tramite plumbing inutilizzato". Un batch dell'audit lo aveva marcato
da tenere; la verifica incrociata (lettura diretta del call site sempre-vuoto)
ha stabilito che il verdetto giusto è: **cancellare l'intera pipeline**.

## A. Rimozione della pipeline

1. `lib/utils/pdfGenerator.tsx`:
   - elimina `getRequiredChartIds` (righe 15-25);
   - elimina la chiamata `captureCharts` (righe ~51-54) e le due chiamate
     `cleanupChartImages` (righe ~113, ~122) col relativo try/finally se resta vuoto;
   - elimina gli import inutilizzati `ChartId`, `CHART_IDS` (righe 9-10) e
     l'import da `chartCapture`;
   - la costruzione di `PDFDocument` non deve più passare `chartImages`.
2. Cancella `lib/utils/chartCapture.ts` (162 LOC: `captureChart`, `captureCharts`,
   `cleanupChartImages`, `chartExists`).
3. Rimuovi la prop `chartImages`/`chartImage` dalla catena:
   `components/pdf/PDFDocument.tsx` (~riga 93), `components/pdf/sections/HistorySection.tsx`
   (prop + JSDoc righe ~55-57), `components/pdf/sections/AllocationSection.tsx`
   (prop + JSDoc righe ~35-37). Oggi ricevono sempre una mappa vuota: rimuovere
   la prop è behavior-preserving per costruzione.
4. Cancella i componenti orfani `components/pdf/primitives/PDFChart.tsx` (101 LOC)
   e `components/pdf/primitives/PDFSection.tsx` (123 LOC — container A4 mai
   adottato dalle sezioni; attenzione a NON confonderlo col tipo `PDFSectionData`
   che è vivo in `PDFDocument.tsx:13`, `pdfDataService.ts` e `types/pdf.ts:51`).
   Aggiorna il commento a `components/pdf/primitives/PDFTable.tsx:49` che cita
   PDFChart ("Same as PDFText/PDFChart for consistency").
5. `npm uninstall html2canvas` — unico importer era `chartCapture.ts:4`.
6. Opzionale (consigliato): rimuovi gli `id="chart-*"` vestigiali sui
   `ResponsiveContainer` di `app/dashboard/history/page.tsx` (righe ~656, 915,
   1018, 1430) — nessuno li interroga più; lasciarli suggerisce un aggancio che
   non esiste.

## B. `types/pdf.ts` (tutto il dominio tipi PDF in questa spec)

- **Cancella** `CHART_IDS` (righe 244-249) e `ChartId` (riga 251): gli unici
  riferimenti esterni erano i due import mai usati in `pdfGenerator.tsx:9-10`.
- **Cancella** `PDFGenerationResult` (riga ~269): tipo esportato mai importato.
- **De-esporta** (togli `export`, il codice resta): `AssetClassEvolutionPoint`
  (~132), `MonthlyTrendPoint` (~169), `FireHistoricalPoint` (~190) — usati solo
  dentro il dominio PDF. Se dopo le rimozioni della sez. A qualcuno di questi
  risultasse a zero riferimenti anche interni, cancellalo del tutto.

## C. `lib/services/pdfDataService.ts`

- Le sette `prepare*` (`preparePortfolioData`, `prepareAllocationData`,
  `prepareHistoryData`, `prepareCashflowData`, `prepareFireData`,
  `preparePerformanceData`, `prepareSummaryData`) sono **VIVE** internamente:
  il flusso attivo è `pdfGenerator.tsx:7` → `fetchPDFData` (riga 70) che le
  smista tutte (righe 89-139). Fix: **togli solo la keyword `export`**
  (EXPORT_ONLY), non cancellarle.
- `clearPDFDataCache` (riga ~693, 7 LOC): davvero morta → cancella.

## D. Dipendenza `@react-pdf/types`

Import di tipo (`Style`) in QUATTRO file: `PDFTable.tsx:5`, `PDFText.tsx:5` e i
due file che questa spec cancella (`PDFSection.tsx:5`, `PDFChart.tsx:5`). Il
pacchetto NON è in package.json — risolve solo come transitiva di
`@react-pdf/renderer` (fragile). Dopo le cancellazioni restano 2 importer:
`npm install -D @react-pdf/types@^2.11.1` (pinna la versione già nel lockfile).

## Validazione finale

1. `npx tsc --noEmit`
2. `npx vitest run` (non esistono suite PDF dedicate: la suite completa copre i
   confini)
3. `npm run build`
4. **Smoke funzionale obbligatorio**: genera un PDF dall'app (o in mancanza di
   dati reali, dall'account demo/emulator) e verifica che tutte le sezioni
   rendano come prima. La pipeline rimossa produceva già mappe vuote, quindi il
   PDF atteso è IDENTICO al pre-refactor.
5. `npx knip`: `PDFChart`, `PDFSection`, `chartCapture`, `html2canvas`,
   `@react-pdf/types` (unlisted) non devono più comparire.

## Prompt per la sessione di implementazione

```
Implementa la spec docs/dead-code/02-pipeline-pdf-chart-capture.md (audit codice
morto, sessione 2 di 6). Rimuovi la pipeline chart-capture no-op dall'export PDF
(getRequiredChartIds ritorna sempre [] — leggi la spec per la catena completa),
i primitives PDF orfani, html2canvas, e sistema types/pdf.ts + pdfDataService
come indicato. Aggiungi @react-pdf/types alle devDependencies.

Regole:
- Behavior-preserving: il PDF generato DEVE essere identico (la pipeline rimossa
  è già oggi un no-op) — smoke di export obbligatorio a fine sessione
- Prima di ogni cancellazione ri-esegui il grep di verifica (protocollo in
  docs/dead-code/README.md)
- ATTENZIONE: PDFSection (componente, morto) ≠ PDFSectionData (tipo, vivo)
- Un commit per sezione (A..D); branch chore/dead-code-02-pdf
- npx tsc --noEmit dopo ogni sezione; vitest + npm run build alla fine

Contesto:
- Leggi docs/dead-code/README.md (protocollo condiviso e whitelist)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice

Crea SESSION_NOTES.md per tracciare il lavoro.
```

**Modello consigliato: Sonnet 5 · Effort: high.** La chirurgia sulla catena di
prop attraversa 5 file di una feature attiva e c'è un'omonimia insidiosa
(PDFSection vs PDFSectionData): serve attenzione, non un modello maggiore.
