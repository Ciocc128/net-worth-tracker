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

- [ ] 0 · `refactor: share the no-subcategory sentinel between cost centers and expenses`
- [ ] 1 · `feat: add pure cashflow breakdown util with subcategory nesting`
- [ ] 2 · `fix: build assistant cashflow context from a single type-aware aggregator`
- [ ] 3 · `feat: render the full expense category and subcategory breakdown in the assistant prompt`
- [ ] 4 · `feat: tell the assistant its subcategory breakdown is exhaustive`
- [ ] 5 · `docs: record the assistant subcategory breakdown conventions`

---

## Verifica end-to-end (Step 6)

| # | Prova | Esito |
|---|---|---|
| 1 | Test mirati (`expenseBreakdown`, `assistantPromptBundle`, `assistantMonthContextService`) | — |
| 2 | Suite completa + `npx tsc --noEmit` | — |
| 3 | Domanda originale verbatim su Anno 2025 → mai "N/D" | — |
| 4 | Quadratura: Σ categorie === uscite totali | — |
| 5 | Tono: domanda generica **non** deve produrre l'elenco completo | — |
| 6 | Ripetere 3-5 su Mese e Storico | — |

---

## Note emerse durante il lavoro

_(da compilare)_
