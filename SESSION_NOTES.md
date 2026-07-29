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
- [x] `582cab5` · `docs: record the assistant subcategory breakdown conventions`

Fuori piano, emersi dalla verifica e dal confronto con l'utente:

- [x] `bd5d550` · `docs: separate the two cashflow changes in the assistant known issue`
- [x] `e460d17` · `fix: stop the assistant truncating mid-sentence, and say so when it does`
- [x] `c6d4103` · `feat: double the assistant token budgets`

I due commit "cablaggio" e "rendering" del piano sono **uno solo** (`cb1749b`): la forma del bundle e il suo serializzatore non compilano separatamente, quindi dividerli avrebbe prodotto un commit rosso.

---

## Verifica end-to-end (Step 6)

| # | Prova | Esito |
|---|---|---|
| 1 | Test mirati (`expenseBreakdown` 30, `assistantPromptBundle` 13, `assistantMonthContextService` 18) | ✅ verdi |
| 2 | Suite completa **82 file / 1457 test** + `npx tsc --noEmit` | ✅ puliti |
| 3 | Blocco dati renderizzato su bundle realistico (anno 2025, 247 transazioni) | ✅ Casa con tutte e 7 le sottocategorie, incluse Elettricità / Gas / Bonifica / Rifiuti / Internet |
| 4 | Quadratura sullo stesso bundle | ✅ totale −24.932 € = Σ categorie = Σ per tipo |
| 5 | Prova reale nell'app sui dati dell'utente | ✅ il breakdown funziona — l'assistente cita "Elettrodomestici (−€2.461, 18 transazioni) dentro Casa [fixed]", "Condominio (−€1.689, 5 transazioni)", la spesa isolata da −€919. **Ma la risposta si è troncata a metà parola** → vedi sotto |
| 6 | Tono: domanda generica **non** deve produrre l'elenco completo | ⏳ da fare |
| 7 | Ripetere 5-6 su Mese e Storico | ⏳ da fare |

Costo misurato del blocco dati sull'esempio realistico: **2.270 caratteri** (~800 token) per un anno con 11 sottocategorie attive — ben sotto la stima prudenziale di ~2.100 token del piano.

---

## Note emerse durante il lavoro

**`-0` nel prompt.** `-totalExpensesAbs` con totale zero produce `-0`, che `Intl.NumberFormat` rende come `-0 €`. Intercettato dai test del layer puro; risolto con `asNegative()`.

**NBSP nelle asserzioni.** `Intl.NumberFormat` inserisce U+00A0 prima di `€`; i test del prompt lo normalizzano in `render()` invece di incorporare un carattere invisibile nelle stringhe attese.

**Raggruppamento migliaia italiano.** `it-IT` non raggruppa a 4 cifre (`3000 €`, non `3.000 €`) ma sì da 5 (`1.234.567 €`). Comportamento ICU corretto, preesistente.

**Troncamento a metà frase in chat (emerso dalla prova reale, corretto).** `max_tokens` è un budget per **thinking + testo insieme**: con `thinking: { type: 'adaptive' }` il modello decide quanto ragionare e quel che spende lì sparisce dalla risposta. Il blocco dati più ricco gli ha dato più materiale su cui ragionare, e i 3000 token della chat non bastavano più. Due correzioni:
1. Tetti alzati — chat 3000 → **12000**, chat+web 5000 → **16000**, analisi strutturate 7000 → **18000** (prima 6000/8000/9000, poi raddoppiati su richiesta). L'headroom è economico ma non gratuito: i token non usati non si pagano, però un budget più ampio lascia ragionare più a lungo il thinking adattivo, e quello si paga e allunga la latenza. Nessun `maxDuration` sulla route → vale il default Vercel di 300s, ampio per questi valori.
2. **Il troncamento ora si dichiara.** Il loop dello stream non leggeva mai `stop_reason`, quindi una risposta tagliata era indistinguibile da una finita. Ora `streamAssistantResponse` legge il `message_delta` terminale e appende `TRUNCATION_NOTICE`. Stesso principio della valvola sulle sottocategorie: un limite o non esiste, o si annuncia.

**Da valutare separatamente — le spese singole ricorrenti saturano la loro sezione.** Alzando `topIndividualLimit` a 10 per l'anno, la sezione `SPESE SINGOLE PIU' GRANDI` si riempie di rate di mutuo identiche (9 righe su 10 nell'esempio realistico), che non sono outlier e occupano gli slot degli outlier veri. Non è stato toccato perché deduplicare *silenziosamente* ricreerebbe esattamente il difetto appena corretto: la sezione si chiama "più grandi" e filtrarla senza dirlo la renderebbe una risposta falsa a "quali sono le mie 10 spese più grandi?". La correzione onesta è raggruppare le ricorrenze dichiarandole (`Mutuo: -810 € × 12 nel periodo, totale -9.720 €`), ma è una scelta di prodotto fuori dal piano approvato.

---

## Riepilogo

### Cosa

Un solo aggregatore puro, `buildCashflowBreakdown` in **`lib/utils/expenseBreakdown.ts`**, che sostituisce i due che il context service dell'Assistente usava (`aggregateCashflow` + `buildExpenseBreakdown`, entrambi cancellati). Produce in un unico passaggio: albero **categoria → sottocategoria** senza cap, spese **per tipo** (Fisse / Variabili / Debiti + `Non classificate` per le righe legacy senza `type`), **entrate per categoria**, e le spese singole più grandi con data, sottocategoria e nota. Cablato in tutti e 5 i builder di periodo, con `topIndividualLimit` che scala col periodo (5 mese / 8 trimestre / 10 anno·YTD / 15 storico).

Il prompt (`formatBundleForPrompt`) rende le nuove sezioni con la quota di ciascuna categoria sulle uscite; `ASSISTANT_SYSTEM_CORE` dichiara al modello che il blocco è esaustivo e che una voce assente significa *spesa zero*, non *dato mancante*. Tetti di parole 450/500/550 → 600/700/750.

Emerso dalla verifica sul campo e corretto: budget token (chat 12000, chat+web 16000, strutturate 18000) e lettura di `stop_reason` per dichiarare le risposte troncate.

Copertura: `__tests__/expenseBreakdown.test.ts` (30) e `__tests__/assistantPromptBundle.test.ts` (13) nuovi, `assistantMonthContextService.test.ts` esteso. Suite 82 file / 1457 test verdi, `tsc` pulito.

### Perché

Perché l'assistente rispondeva "N/D" su sottocategorie che erano in Firestore da sempre — e aveva ragione, dato ciò che riceveva. **Un cap che non si dichiara, per un LLM, è indistinguibile dall'assenza del dato**: il modello non può sapere se una voce manca dai dati o dal mondo, e le regole di integrità gli impongono di non speculare. Sembrava un limite del modello, era un bug di serializzazione.

L'aggregatore è **uno solo** per una ragione precisa: i due precedenti attraversavano lo stesso array con classificatori diversi, e nulla garantiva che i risultati quadrassero. Con totali e breakdown che escono dallo stesso `for`, su righe adiacenti, `Σ categorie === totale uscite` è una proprietà del codice, non di un test che qualcuno si è ricordato di scrivere. Conta perché una risposta in cui il modello somma le righe e trova un altro numero non segnala lo scarto: lo racconta.

La classificazione **per `type` invece che per segno** è arrivata di conseguenza: era lo stesso identico bug chiuso nella pipeline email il 2026-07-01, e l'Assistente era l'ultima superficie in disaccordo con la pagina Cashflow.

### Nota

- **La stessa lezione è ricomparsa due volte in una sessione.** Prima il cap sulle categorie, poi `stop_reason` mai letto: in entrambi i casi un limite silenzioso veniva interpretato come "non c'è altro da dire". La regola sta in AGENTS.md → *A Silent Cap in a Context Builder Becomes a Hallucinated "N/D"*, e vale per ogni nuovo `slice()` diretto a un prompt.
- **`max_tokens` è un budget per thinking *e* testo.** Con `thinking: adaptive` ogni token di ragionamento è tolto alla risposta. Va rivisto ogni volta che si allarga il blocco dati o si alza un tetto di parole — è esattamente ciò che è successo qui.
- **Cosa cambia per l'utente**: il `transactionCount` scende (non conta più i trasferimenti, che comunque non erano nei totali). I totali di cashflow **non** cambiano se i rimborsi sono registrati come `type: 'income'` — che è il caso di questo account.
- **Convenzione di segno divergente e voluta**: qui le spese sono negative, in `costCenterUtils` e nell'email sono positive. Motivo nel commento sopra le interfacce in `types/expenses.ts` — nel prompt questi numeri stanno sotto `Uscite: -X €`, e due segni per lo stesso concetto nella stessa pagina di dati fanno sbagliare i confronti al modello.
- **Trappole di formattazione** che i test hanno intercettato: `-0` renderizzato come `-0 €` (risolto con `asNegative()`), NBSP prima di `€` in ogni asserzione sulle valute, e `it-IT` che non raggruppa le migliaia a 4 cifre (`3000 €`, non `3.000 €`).
- **Rimane aperto** il rumore delle spese ricorrenti nella sezione delle spese singole (vedi nota sopra) e due prove della checklist: che una domanda generica non produca l'elenco completo, e la ripetizione su Mese e Storico.
