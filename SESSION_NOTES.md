# Session Notes — Dead code audit, sessione 2/6 (Pipeline PDF chart-capture)

Spec: `docs/dead-code/02-pipeline-pdf-chart-capture.md`. Branch: `chore/dead-code-02-pdf`.

## Cosa

- **Sezione A — pipeline chart-capture**: eliminata `getRequiredChartIds()` (ritornava sempre `[]`) e le chiamate `captureCharts`/`cleanupChartImages` in `pdfGenerator.tsx`; cancellato `lib/utils/chartCapture.ts` (162 LOC); rimossa la prop `chartImages`/`chartImage` dalla catena `PDFDocument` → `HistorySection`/`AllocationSection`; cancellati i primitives orfani `PDFChart.tsx` (101 LOC) e `PDFSection.tsx` (123 LOC — non confuso con il tipo vivo `PDFSectionData`); aggiornato il commento in `PDFTable.tsx` che citava `PDFChart`; `npm uninstall html2canvas`; rimossi gli `id="chart-*"` vestigiali (che corrispondevano a `CHART_IDS`) sui 4 `ResponsiveContainer` in `app/dashboard/history/page.tsx` (net-worth-evolution, asset-class-evolution, liquidity, yoy-variation). Non toccati i due id `chart-savings-vs-investment*`, fuori perimetro (non in `CHART_IDS`).
- **Sezione B — `types/pdf.ts`**: cancellati `CHART_IDS`/`ChartId` e `PDFGenerationResult` (mai importato); de-esportati `AssetClassEvolutionPoint`/`MonthlyTrendPoint`/`FireHistoricalPoint`. **Scoperta oltre la spec**: la rimozione della sezione A ha reso `ChartImage`/`ChartCaptureOptions` completamente orfani (zero riferimenti residui in tutto il repo) — non erano nominati esplicitamente dalla spec (probabilmente perché al momento dell'audit erano ancora referenziati da `chartCapture.ts`), ma sono lo stesso dominio/stessa catena appena spenta: rimossi anche loro per non lasciare nuovo codice morto a fine sessione.
- **Sezione C — `pdfDataService.ts`**: tolta la keyword `export` dalle sette `prepare*` (restano usate solo da `fetchPDFData` nello stesso file); cancellata `clearPDFDataCache` (0 chiamanti).
- **Sezione D — dipendenza**: `@react-pdf/types@^2.11.1` aggiunta come devDependency esplicita (prima risolveva solo come transitiva fragile di `@react-pdf/renderer`); dopo le cancellazioni della sezione A restano 2 importer (`PDFTable.tsx`, `PDFText.tsx`).

Un commit per sezione (A→D), `npx tsc --noEmit` pulito dopo ognuna.

## Perché

`getRequiredChartIds()` ignorava il parametro `sections` e ritornava incondizionatamente `[]`: ogni export produceva già una mappa vuota di chart images, quindi l'intera pipeline (capture → cleanup → prop threading → `PDFChart`) era plumbing morto che raggiungeva zero renderer reali (l'unico consumer, `PDFChart.tsx`, era già un orfano dal dicembre 2025). Knip vedeva `chartCapture.ts` "vivo" solo perché importato da codice a sua volta mai eseguito — il caso classico di "vivo tramite plumbing inutilizzato" che richiede lettura diretta del call-site, non solo il grafo di import.

## Nota

- **Verifica finale**: `npx tsc --noEmit` ✅, `npx vitest run` → **79 file / 1406 test verdi** (invariato rispetto alla baseline CLAUDE.md), `npm run build` ✅ (50/50 pagine), `npx knip` → nessun residuo di `PDFChart`/`PDFSection`/`chartCapture`/`html2canvas`/`@react-pdf/types` (unlisted) nell'output.
- **Smoke funzionale**: nessun account demo configurato in questo ambiente (`NEXT_PUBLIC_DEMO_USER_ID` vuoto in `.env.local`) e nessun tool di automazione browser disponibile, quindi lo smoke prescritto dalla spec è stato eseguito rendendo `<PDFDocument>` — lo stesso componente attraversato da `pdfGenerator.tsx` — con dati sintetici per tutte e 7 le sezioni via `@react-pdf/renderer`'s `toBuffer()` in Node (script temporaneo, non committato, cancellato a fine sessione). Output: PDF valido (`%PDF-` header, 22990 byte). Comportamento atteso per costruzione: la pipeline rimossa produceva già mappe vuote, quindi l'output è identico al pre-refactor.
- Nessun doc (AGENTS.md/CLAUDE.md) menzionava `chartCapture`/`PDFChart`/`PDFSection`/`html2canvas` esplicitamente: solo `docs/dead-code/02-*.md` e l'indice README, aggiornati a valle di questa sessione.
