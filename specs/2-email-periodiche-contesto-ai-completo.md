# Spec 2 — Email periodiche: contesto AI completo

> **Ordine**: 2 di 5. Nessuna dipendenza dalle altre spec (indipendente da 1, 3, 4, 5).
> **Stato**: ✅ **Implementata** (2026-08-17) — branch `feature/email-periodiche-contesto-ai`.
> Tre scostamenti consapevoli dal testo qui sotto, documentati in fondo (§ *Scostamenti in
> implementazione*): l'header dei delta categoria descrive l'ordinamento reale, il range builder
> serve tutti e quattro i periodi, e c'è una sezione solo-email in più per i dividendi.
> **Scopo**: il commento AI delle email mensili/trimestrali/semestrali/annuali riceve lo stesso
> contesto esaustivo dell'Assistente in-app, più i confronti deterministici che solo l'email ha.
> **Fuori scope**: l'email settimanale budget (`weeklyBudgetEmailService.ts`) — è deliberatamente
> stretta (solo budget, 400 token) e resta com'è; il layout HTML dell'email (invariato salvo il
> punto D4).

## Problema (evidenza: email reale "Riepilogo Luglio 2026")

Il commento AI è ben scritto ma passa metà del testo a dichiarare cosa non sa — e ogni volta ha
ragione, perché il prompt è affamato:

- *"Non ho il dettaglio per singolo asset"* → falso lato dati: `byAssetClass` e
  `assetClassPerformers` sono in `MonthlyEmailData` e renderizzati nell'HTML **della stessa
  email**, ma non entrano nel prompt.
- *"Il dato [entrate] non è scomposto per categoria"* → `allIncomeCategories` esiste, non è nel
  prompt.
- *"La componente di mercato ha sottratto circa €3.300 — stima residuale"* → è
  `netWorthDelta − risparmioNetto`, calcolabile deterministicamente a monte.

Il prompt attuale (`buildEmailAiPrompt`, `lib/server/monthlyEmailService.ts` ~:469-560) contiene
SOLO: NW corrente (solo il numero), entrate/uscite/risparmio totali, dividendi (totale+conteggio),
Hall of Fame, spese per tipo, confronti vs precedente/YoY su 4 metriche, delta per categoria
**cappati a 6 in silenzio** (`MAX_CATEGORY_DELTAS`, `emailPeriodComparison.ts` ~:90 — viola la
regola AGENTS "un cap o non esiste o è dichiarato"), top 5/10 spese singole senza data.

Aggravanti:

- `ASSISTANT_SYSTEM_CORE` (condiviso, `lib/server/assistant/prompts.ts` ~:450-510) promette
  blocchi che l'email non invia ("Il blocco SPESE PER CATEGORIA E SOTTOCATEGORIA è ESAUSTIVO",
  "CATEGORIE DI SPESA CONFIGURATE"): il guardrail parla di dati assenti.
- Le righe spesa senza tipo sono droppate dal blocco "Spese per Tipo" ma incluse in
  `totalExpenses` → percentuali che non sommano a 100 senza spiegazione.
- `preferences.includeMacroContext` NON è consultato per l'email: web search sempre offerta
  (diversamente dall'assistente).
- Il doc-comment sopra `generateEmailAiComment` (~:462-467) afferma che `cache_control` è
  applicato al system: il codice non lo fa (ed è giusto così, vedi AGENTS → *Prompt builders*).
  Il commento mente: va corretto.

## Decisioni prese (Giuseppe, 2026-08-17)

- **Bundle completo**: l'email AI riceve il bundle esaustivo dell'assistente (albero
  categoria→sottocategoria, entrate per categoria, allocazione corrente/target, obiettivi, note
  qualità dati) + confronti deterministici + effetto mercato precalcolato.
- **Lunghezza scalata per periodo**: ~500 parole mensile, ~700 trimestrale/semestrale, ~900
  annuale.

## Architettura richiesta

**Principio: un solo pipeline di contesto.** L'email non costruisce un secondo aggregatore: riusa
il context service dell'assistente, e vi aggiunge in coda le sezioni che solo l'email possiede.

### A) Builder di periodo nel context service

In `lib/services/assistantMonthContextService.ts` (gira server-side, `adminDb` — AGENTS →
*Assistant / Context service*):

1. Nuovo builder **`buildAssistantPeriodRangeContext(ownerId, { year, startMonth, endMonth, label })`**
   che produce un `AssistantMonthContextBundle` su una finestra di mesi arbitraria dello stesso
   anno, riusando la stessa pure layer (`buildCashflowBreakdown` di `lib/utils/expenseBreakdown.ts`
   — l'UNICO aggregatore, mai un secondo) e le stesse regole degli altri 4 builder:
   - Patrimonio: snapshot di fine `endMonth` vs snapshot del mese precedente a `startMonth`
     (stessa logica point-in-time del builder annuale); flussi = expenses della finestra.
   - `periodLabel` del bundle = etichetta esplicita della finestra ("Q3 2026", "2° Semestre 2026",
     "Luglio 2026", "Anno 2026") — ogni figura del bundle deve poter dichiarare la sua finestra.
   - Allocazione, obiettivi (`getGoalDataAdmin`), note qualità dati: identici agli altri builder.
     Il blocco obiettivi è **obbligatorio e nullable** come da AGENTS (assente ≠ off ≠ vuoto).
2. I casi mensile e annuale possono delegare ai builder esistenti (month / year) se il risultato è
   identico; il range builder serve trimestre e semestre. NON duplicare logica: se serve, estrarre
   helper condivisi interni al service.
3. Un nuovo campo obbligatorio del bundle NON va aggiunto (i 4 builder esistenti andrebbero
   aggiornati tutti — AGENTS): il range builder deve produrre il tipo esistente
   `AssistantMonthContextBundle` senza modifiche di tipo. Se una modifica di tipo risultasse
   davvero necessaria, fermarsi e segnalarlo invece di forzarla.

### B) Nuovo prompt email

In `lib/server/monthlyEmailService.ts`, `buildEmailAiPrompt` viene riscritta così:

1. **Corpo = `formatBundleForPrompt(bundle)`** (`lib/server/assistant/prompts.ts`) sul bundle del
   periodo — invariato, così ogni futuro campo del bundle arriva gratis anche alle email, e i
   guardrail di `ASSISTANT_SYSTEM_CORE` sui blocchi esaustivi diventano VERI anche qui.
2. **In coda, le sezioni solo-email** (deterministiche, già calcolate oggi):
   - `--- EFFETTO MERCATO (calcolato) ---`: una riga
     `Variazione di mercato/valutativa = Δ patrimonio − risparmio netto = {X} €`, con la nota che
     è una scomposizione strutturale (contiene anche eventuali movimenti non tracciati) — l'AI la
     USA, non la ricalcola e non la "stima".
   - `--- CONFRONTO COL PERIODO PRECEDENTE ({baselineLabel}) ---` e il blocco YoY (riuso di
     `formatComparisonForPrompt`, omesso quando `previousEqualsYoy` come oggi).
   - `--- VARIAZIONE SPESE PER CATEGORIA (prime {N} per variazione assoluta) ---`:
     `MAX_CATEGORY_DELTAS` sale a **12** e il cap è **dichiarato nell'header** e nella frase di
     chiusura ("le categorie oltre le prime {N} sono omesse"). Regola AGENTS: un cap o non esiste
     o è dichiarato nel testo che il modello legge.
   - `--- HALL OF FAME ---` (quando presente, mensile/annuale — come oggi).
   - `--- AVVISI BUDGET DEL MESE ---` (solo mensile): le stesse righe di `budgetAlerts` che l'HTML
     già mostra (`spent / budgetAmount`, %, sforamento previsto) — oggi l'AI non le vede affatto.
   - Le "spese più rilevanti" NON vanno duplicate: il bundle le contiene già (con data) in
     `--- SPESE SINGOLE PIÙ GRANDI ---`.
3. **Header del prompt**: conservare le righe attuali di contesto (stile risposta, memoria,
   "Stai redigendo il commento di riepilogo per: {label}", "le variazioni sono già calcolate: non
   ricalcolarle").

### C) Contratto di formato per periodo

`EMAIL_PERIODIC_FORMAT_CONTRACT` (`prompts.ts` ~:576-586) diventa una **funzione**
`buildEmailPeriodicFormatContract(periodType)`:

- Sezioni (in quest'ordine): **In sintesi** · **Patrimonio e investimenti** (nuova: allocazione,
  effetto mercato, obiettivi se presenti) · **Rispetto al periodo precedente** · **Confronto con
  l'anno precedente** · **Entrate e spese: di quanto e perché** · **Azioni o attenzioni**.
- Limite parole: `monthly` 500 · `quarterly` 700 · `semiannual` 700 · `yearly` 900.
- Il contratto dichiara che i blocchi categoria/sottocategoria ed entrate sono esaustivi e che una
  voce assente = nessuna spesa registrata (coerente col core).

### D) Parametri della chiamata e igiene

1. `max_tokens` scala col periodo (thinking adaptive incluso nel budget — AGENTS): `monthly` 6000,
   `quarterly`/`semiannual` 8000, `yearly` 10000. Continuare a leggere solo i blocchi text.
2. **`includeMacroContext` consultato**: `tools` (web_search, max_uses 3) offerti solo se la
   preferenza lo consente, allineato all'assistente. Default invariato se la preferenza è assente.
3. Correggere il doc-comment di `generateEmailAiComment` (niente `cache_control`, per scelta —
   il commento deve dire il vero e il perché, stile COMMENTS.md).
4. **HTML, unica modifica**: nella tabella "Spese per Tipo" aggiungere la riga "Non classificate"
   quando l'importo senza tipo è > 0, così le percentuali tornano a 100 anche a schermo. Nessun
   altro cambiamento all'HTML.
5. Failure dell'AI e del comparison restano non bloccanti (email inviata comunque); utente demo
   ancora saltato in ogni fase del cron.

## Cosa NON fare

- Non modificare `AssistantMonthContextBundle` (tipo) né i 4 builder esistenti (se non per
  estrarre helper condivisi senza cambiarne l'output).
- Non toccare la pipeline HTML deterministica (salvo D4) né `emailPeriodComparison.ts` oltre al
  cap dichiarato.
- Non toccare l'email settimanale budget.
- Non introdurre `cache_control` (scelta deliberata, AGENTS → *Prompt builders*).
- Non interpolare dati per-request nel `system` (deve restare byte-identico per modalità).

## Test

- **Nuovi** in `__tests__/assistantMonthContextService.test.ts`: il range builder — finestra Q3
  (luglio-settembre), riconciliazione strutturale `Σ expensesByCategory === totalExpenses`,
  etichetta finestra, patrimonio start/end corretti, mesi senza snapshot → note qualità dati.
- **Nuovi/aggiornati** per il prompt email (suite `monthlyEmailService`): esportare la funzione
  che costruisce lo `userContent` e asserire: presenza dei marker di sezione del bundle
  (`--- ALLOCAZIONE CORRENTE`, `--- SPESE PER CATEGORIA E SOTTOCATEGORIA`), riga EFFETTO MERCATO
  col valore atteso, cap dichiarato nell'header delta categorie, avvisi budget presenti solo per
  `monthly`, blocco YoY omesso quando `previousEqualsYoy`, limite parole giusto per ciascun
  `periodType`.
- Aggiornare i test esistenti che asseriscono sul vecchio prompt.
- `npx tsc --noEmit` dopo i test; suite anche sotto `TZ=Europe/Rome`.

## Verifica (collaudo guidato, WORKFLOW.md)

Sugli emulatori con seed: invocare la route di invio manuale
(`app/api/user/monthly-email/send/route.ts`) per un periodo con dati, con un log temporaneo (o un
ritorno di debug) che esponga lo `userContent` generato; confermare a occhio che il prompt
contenga i blocchi nuovi e i numeri del seed. Se `RESEND_API_KEY` non è configurata in locale,
va bene fermarsi alla verifica del prompt e dell'HTML generato (obbligo 4: si automatizza tutto
il possibile; l'invio reale lo prova Giuseppe con il pulsante di test-send alla prima occasione).

## Criteri di accettazione

- [x] Il prompt email contiene: albero spese categoria→sottocategoria esaustivo, entrate per
      categoria, allocazione corrente (+target/gap se configurati), obiettivi (o la frase di
      assenza), note qualità dati, effetto mercato precalcolato, confronti, delta categorie con
      cap dichiarato, avvisi budget (mensile), Hall of Fame.
- [x] Nessun cap silenzioso nel testo che il modello legge.
- [x] Limiti parole e `max_tokens` scalati per periodo; `includeMacroContext` rispettato.
- [x] HTML invariato salvo la riga "Non classificate"; AI failure ancora non bloccante.
- [x] Un solo aggregatore: nessun nuovo calcolo di cashflow fuori da `buildCashflowBreakdown`.

## Scostamenti in implementazione (2026-08-17)

1. **Header dei delta categoria**: la spec chiedeva `(prime {N} per variazione assoluta)`, ma la
   selezione in `buildPeriodComparison` è per **spesa del periodo** (`topExpenseCategories` è
   ordinata per importo corrente). Scrivere "per variazione assoluta" sarebbe stata
   un'affermazione falsa nel testo che il modello legge — cioè il difetto che questa spec
   esiste per rimuovere. Header e frase di chiusura descrivono l'ordinamento reale e dichiarano
   quante categorie restano fuori e per quanti euro.
2. **Il range builder serve tutti e quattro i periodi**, non solo trimestre e semestre (la spec lo
   permetteva). Un solo percorso invece di due, e la finestra del bundle è per costruzione la
   stessa su cui l'email calcola le proprie cifre.
3. **Una sezione solo-email in più**: `--- DIVIDENDI DEL PERIODO (registro dividendi) ---`. Il
   prompt precedente portava già quel totale, che viene dalla collection `dividends` e non dalle
   righe di cashflow del bundle: senza la riga l'informazione si perdeva, con la riga la fonte è
   dichiarata e le due cifre non si leggono come una contraddizione.

Fuori dalla spec ma nella stessa direzione: `periodLabel` non è diventato un campo del bundle (il
tipo è rimasto intatto). La finestra viaggia come prima nota di `dataQuality.notes` e come
parametro opzionale di `formatBundleForPrompt`.

---

## Implementazione consigliata

- **Modello**: `claude-opus-5` · **Effort**: high
  (refactor architetturale con molti vincoli espliciti e test-driven; la matematica è banale, la
  difficoltà è rispettare le convenzioni del repo — la spec le enumera)

### Prompt di implementazione

```
Leggi TASSATIVAMENTE prima di ogni cosa: AGENTS.md (in particolare le sezioni Assistant, Periodic
Emails, Prompt builders), CLAUDE.md, WORKFLOW.md, COMMENTS.md, DEVELOPMENT_GUIDELINES.md. Crea un
branch dalla branch attiva (una branch per sessione, commit solo dopo mia approvazione esplicita).
Crea/aggiorna SESSION_NOTES.md.

Implementa ESATTAMENTE la specifica in specs/2-email-periodiche-contesto-ai-completo.md. In
sintesi: (A) nuovo builder di periodo buildAssistantPeriodRangeContext in
lib/services/assistantMonthContextService.ts che riusa buildCashflowBreakdown e produce un
AssistantMonthContextBundle su finestre trimestrali/semestrali senza modificare il tipo;
(B) buildEmailAiPrompt in lib/server/monthlyEmailService.ts riscritta come
formatBundleForPrompt(bundle) + sezioni solo-email (effetto mercato precalcolato, confronti,
delta categorie con cap alzato a 12 e DICHIARATO, avvisi budget per il mensile, Hall of Fame);
(C) contratto di formato parametrico per periodo (500/700/700/900 parole) con la nuova sezione
"Patrimonio e investimenti"; (D) max_tokens scalato 6000/8000/8000/10000, includeMacroContext
consultato per la web search, doc-comment sul cache_control corretto, riga "Non classificate"
nell'HTML Spese per Tipo quando l'importo senza tipo è > 0.

Vincoli duri: un solo aggregatore (buildCashflowBreakdown), system prompt byte-identico senza
dati per-request, niente cache_control, nessun cap silenzioso nel testo del modello, HTML
altrimenti invariato, email settimanale budget intoccata, fallimenti AI non bloccanti. Scrivi
prima i test elencati nella spec (visti rossi dove sensato), poi il codice; npx tsc --noEmit dopo
i test e suite anche con TZ=Europe/Rome. Chiudi con il collaudo guidato sugli emulatori descritto
nella spec (verifica dello userContent generato dalla route di invio manuale). Riassumi il diff e
chiedi l'OK per il commit.
```
