# Session Notes — Granularità categoria → sottocategoria per l'Assistente AI

**Data**: 2026-07-29
**Branch**: `fix/assistant-subcategory-breakdown`
**Piano**: `~/.claude/plans/ciao-in-questa-sessione-cozy-moler.md`

---

## Obiettivo

L'utente ha chiesto all'Assistente: *"nell'anno 2025 quanto ho speso in tutto per la casa, dettagliami le sottocategorie. Aggiungi poi spese per Elettricità, Gas, Bonifica, Rifiuti, Internet"*.

L'assistente ha risposto **correttamente rispetto ai dati che aveva**: totale Casa (-4.241 €, 27 transazioni) e "N/D" su tutto il resto. Non è un problema di prompt né di modello — è il context builder che scarta i dati.

Esito atteso: l'assistente risponde puntualmente su qualsiasi categoria/sottocategoria del periodo, e quando un dato manca davvero dice "nessuna spesa registrata" (vero) invece di "N/D" (falso).

---

## Diagnosi — 4 difetti, tutti in `buildExpenseBreakdown` (`lib/services/assistantMonthContextService.ts:332-363`)

1. **Aggrega solo per `categoryName`** — `subCategoryId`/`subCategoryName` vengono letti da Firestore e buttati via alla riga 339.
2. **`.slice(0, 5)` hardcoded**, identico per mese / trimestre / anno / YTD / storico 5 anni. Elettricità, Gas, Bonifica, Rifiuti, Internet erano fuori dal top-5 (Mutuo, Casa, Figlie, Cibo, Hobby) → invisibili.
3. **Classifica per segno** (`amount < 0`) invece che per `expense.type`. Stesso bug già corretto nella pipeline email il 2026-07-01 (AGENTS.md:636): un rimborso (riga di spesa con importo positivo) viene contato come entrata.
4. **Nessun breakdown delle entrate** per categoria — solo lo scalare `cashflow.totalIncome`.

### Causa profonda: il cap silenzioso

Un LLM non distingue "assente dai dati che ho ricevuto" da "assente dal mondo". Vedendo un blocco senza Bonifica ha detto "N/D" invece di "il dettaglio non arriva a quel livello". Il system prompt gli impone (giustamente) di non speculare — ha obbedito.

### Il pattern corretto esiste già nel repo

`lib/server/monthlyEmailService.ts:716` `aggregateExpenses()` classifica per `type`, non tronca le categorie, porta `subCategoryName` nelle singole spese e scala il limite col periodo. AGENTS.md:631 lo documenta come lezione appresa. L'Assistente è l'unica superficie rimasta che dissente da pagina Cashflow ed email.

---

## Decisioni (confermate dall'utente)

| Tema | Scelta |
|---|---|
| Ampiezza | **Completo** — sottocategorie + fix classificazione per `type` + entrate per categoria + spese per tipo + limite spese singole scalato per periodo |
| Cap | **Nessuno sui dati**; valvola di rendering a 150 righe che, se scatta, **si dichiara** nel testo |
| Lunghezza risposte | **Alzare i tetti** nei format contract (non esentare gli elenchi) |
| Serie mensile | **Fuori scope** — risponde a "quando?", non a "quanto per sottocategoria?" |

---

## Checklist commit

- [x] `11e0f84` · `refactor: share the no-subcategory sentinel between cost centers and expenses`
- [x] `fcbf408` · `feat: add pure cashflow breakdown util with subcategory nesting`
- [x] `cb1749b` · `fix: give the assistant the full expense breakdown, not a silent top five`
- [x] `9ad4741` · `feat: tell the assistant its subcategory breakdown is exhaustive`
- [ ] `docs: record the assistant subcategory breakdown conventions`

I due commit "cablaggio" e "rendering" del piano sono **uno solo** (`cb1749b`): la forma del bundle e il suo serializzatore non compilano separatamente, quindi dividerli avrebbe prodotto un commit rosso.

---

## Verifica end-to-end (Step 6)

| # | Prova | Esito |
|---|---|---|
| 1 | Test mirati (`expenseBreakdown` 30, `assistantPromptBundle` 13, `assistantMonthContextService` 18) | ✅ verdi |
| 2 | Suite completa **82 file / 1457 test** + `npx tsc --noEmit` | ✅ puliti |
| 3 | Blocco dati renderizzato su bundle realistico (anno 2025, 247 transazioni) | ✅ Casa con tutte e 7 le sottocategorie, incluse Elettricità / Gas / Bonifica / Rifiuti / Internet |
| 4 | Quadratura sullo stesso bundle | ✅ totale −24.932 € = Σ categorie = Σ per tipo |
| 5 | Domanda originale verbatim nell'app, modalità Anno 2025 | ⏳ da fare (dev server avviato) |
| 6 | Tono: domanda generica **non** deve produrre l'elenco completo | ⏳ da fare |
| 7 | Ripetere 5-6 su Mese e Storico | ⏳ da fare |

Costo misurato del blocco dati sull'esempio realistico: **2.270 caratteri** (~800 token) per un anno con 11 sottocategorie attive — ben sotto la stima prudenziale di ~2.100 token del piano.

---

## Note emerse durante il lavoro

**`-0` nel prompt.** `-totalExpensesAbs` con totale zero produce `-0`, che `Intl.NumberFormat` rende come `-0 €`. Intercettato dai test del layer puro; risolto con `asNegative()`.

**NBSP nelle asserzioni.** `Intl.NumberFormat` inserisce U+00A0 prima di `€`; i test del prompt lo normalizzano in `render()` invece di incorporare un carattere invisibile nelle stringhe attese.

**Raggruppamento migliaia italiano.** `it-IT` non raggruppa a 4 cifre (`3000 €`, non `3.000 €`) ma sì da 5 (`1.234.567 €`). Comportamento ICU corretto, preesistente.

**Da valutare separatamente — le spese singole ricorrenti saturano la loro sezione.** Alzando `topIndividualLimit` a 10 per l'anno, la sezione `SPESE SINGOLE PIU' GRANDI` si riempie di rate di mutuo identiche (9 righe su 10 nell'esempio realistico), che non sono outlier e occupano gli slot degli outlier veri. Non è stato toccato perché deduplicare *silenziosamente* ricreerebbe esattamente il difetto appena corretto: la sezione si chiama "più grandi" e filtrarla senza dirlo la renderebbe una risposta falsa a "quali sono le mie 10 spese più grandi?". La correzione onesta è raggruppare le ricorrenze dichiarandole (`Mutuo: -810 € × 12 nel periodo, totale -9.720 €`), ma è una scelta di prodotto fuori dal piano approvato.
