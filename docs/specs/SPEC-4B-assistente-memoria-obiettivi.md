# SPEC-4B — Assistente AI: memoria e obiettivi v2 (il completamento automatico che funziona)

**Stato**: implementata (2026-08-15, branch `feature/assistente-obiettivi-spec-4b`) · **Dipendenze**: SPEC-4A (base pulita, scritture consolidate) · **Ordine**: dopo 4A, prima di 4C

## Perché il completamento obiettivi "non ha mai funzionato" (diagnosi verificata)

1. **Il parser è una cascata di regex italiane** (`lib/server/assistant/goalEvaluation.ts:55-165`,
   `parseStructuredGoalFromText`): se la frase estratta da Haiku non combacia coi pattern,
   `structuredGoal` resta `undefined` e l'obiettivo **non viene mai valutato**. È il caso della
   maggior parte delle frasi reali.
2. **Bug dei decimali**: `normalizeGoalText` converte `,`→`.`, poi `parseNumericToken` (`:31-38`)
   strappa TUTTI i punti → `"1,5M"` diventa **15 milioni** invece di 1,5.
3. **`>=` contro lo snapshot del periodo selezionato** (`evaluateStructuredGoal:179-269` legge
   `bundle.currentSnapshot`): analizzi marzo 2023 e l'obiettivo viene valutato sul patrimonio di
   marzo 2023. Nessuna direzione (un obiettivo "ridurre a" risulterebbe già raggiunto), nessuna scadenza.
4. **In chat libera senza contesto non si valuta nulla** (`stream/route.ts:98` esce se
   `contextBundle` è null) e non esiste alcuna rivalutazione schedulata.
5. **"Ignora" non persiste**: id suggerimento deterministico `goal_suggestion_${itemId}`
   (`stream/route.ts:121`) + guardia che salta solo i `pending`
   (`buildGoalCompletionSuggestions:282-300`) → il suggerimento ignorato viene sovrascritto a
   `pending` alla valutazione successiva e il banner ritorna sempre.
6. **L'utente non vede perché non è scattato**: `structuredGoal` e `lastEvaluationResult` sono
   salvati ma mai renderizzati nel pannello memoria.

## Implementazione

### 1. Estrazione strutturata via tool use (via le regex)

- `lib/server/assistant/memoryExtraction.ts`: la chiamata Haiku (`claude-haiku-4-5-20251001`) passa
  a **tool use forzato** con un tool `save_memory_items` e `input_schema`:

```ts
items: Array<{
  category: 'goal' | 'preference' | 'risk' | 'fact';
  text: string;                       // ≤120 caratteri, italiano
  structuredGoal?: {                  // SOLO per category 'goal', se quantificabile
    kind: 'net_worth_target' | 'liquid_net_worth_target' | 'cash_target'
        | 'asset_class_value_target' | 'asset_class_percentage_target' | 'sub_category_value_target';
    targetValue: number;              // euro o percentuale — MAI stringhe; "1,5M" → 1500000
    direction: 'at_least' | 'at_most';
    assetClass?: AssetClass;          // per i kind asset_class_*
    subCategoryName?: string;         // per sub_category_value_target
    deadlineIso?: string;             // YYYY-MM-DD se l'utente ha detto una scadenza
  };
}>
```

  Prompt di sistema aggiornato con esempi dei casi che le regex sbagliavano ("1,5M", "un milione e
  mezzo", "porta la liquidità sotto il 10%"). Validazione zod del `tool_use.input` (mai fidarsi del
  modello), fallimento → `[]` come oggi.
- **Eliminare** `parseStructuredGoalFromText`, `normalizeGoalText`, `parseNumericToken` e le regex.
  Il chiamante in `store.ts:367` (auto-parse sugli item scritti a mano dal pannello) cambia così: un
  goal creato/modificato dal pannello SENZA `structuredGoal` viene strutturato con la STESSA chiamata
  Haiku (singolo item) dal route handler del PATCH — così anche i goal manuali diventano tracciabili.
- `types/assistant.ts`: aggiungere `direction` e `deadlineIso` a `AssistantStructuredGoal`
  (retro-compatibilità: i goal esistenti senza `direction` leggono `'at_least'`).

### 2. Valutazione contro OGGI, sempre

- Nuova funzione server `evaluateActiveGoals(userId)` che:
  - costruisce il contesto del **mese corrente** (riuso di `buildAssistantMonthContext` con selettore
    corrente — non lo snapshot del periodo che l'utente stava guardando);
  - valuta ogni goal attivo con `structuredGoal`: `at_least` → `metric >= target`,
    `at_most` → `metric <= target`; `deadlineIso` passata e non raggiunto → il testo del suggerimento
    lo dice ("scadenza superata"), la logica resta la stessa;
  - persiste `lastEvaluationAt`/`lastEvaluationResult` e i suggerimenti in **una** transazione
    (l'infrastruttura di 4A).
- Chiamarla da `extractAndSaveMemory` **incondizionatamente** (anche in chat senza bundle: il bundle
  per la valutazione se lo costruisce da sé), sempre fire-and-forget.
- **Rivalutazione schedulata**: nuova fase nel cron giornaliero esistente
  (`app/api/cron/monthly-snapshot/route.ts`, che già ha le fasi 2-6): per ogni utente con memoria
  attiva e almeno un goal strutturato attivo, `evaluateActiveGoals`. Così un obiettivo raggiunto
  "da solo" (mercato) emerge senza bisogno di aprire l'assistente. Non-bloccante, `try/catch` per
  utente, log — come le altre fasi.

### 3. "Ignora" durevole

- Id suggerimento: resta deterministico MA la guardia in `buildGoalCompletionSuggestions` salta
  l'emissione se esiste un suggerimento per quell'`itemId` con status `pending` **oppure `ignored`**.
- Un goal **modificato** dopo l'ignore (updatedAt dell'item > updatedAt del suggerimento ignorato)
  riabilita l'emissione: l'utente ha cambiato l'obiettivo, la vecchia decisione non vale più.
- `reactivateGoal` (`memory/route.ts:77-140`) resta la via esplicita per riaprire.
- Test: ignora → rivaluta → il banner NON torna; modifica il goal → torna.

### 4. Trasparenza nel pannello memoria

`components/assistant/AssistantMemoryItemRow.tsx` — per gli item `category === 'goal'`:
- chip con l'obiettivo strutturato (metrica, direzione, target formattato) quando esiste;
- ultima valutazione: valore attuale vs target + data (`lastEvaluationResult`/`lastEvaluationAt`),
  formato compatto in muted;
- stato "**non tracciabile automaticamente**" quando `structuredGoal` manca — così un goal che non
  si è strutturato non è più indistinguibile da uno al 97%.
- Mono Mandate sui numeri; sign token per sopra/sotto target; niente nuove superfici colore.

### 5. Test

- `assistantGoalEvaluation`: riscrivere sulla nuova valutazione — casi: at_least/at_most, decimali
  ("1,5M" → 1.500.000 via fixture del tool input), deadline passata, goal senza structuredGoal
  (mai valutato, mai suggerito), snapshot mancante → `null`.
- `memoryExtraction`: mock del client Anthropic (pattern lazy-import + `vi.hoisted`), validazione
  zod che scarta input malformati del modello.
- Ignore durevole (punto 3). Suite d'area: `assistantRoutes`, `assistantMonthContextService`.
- `npx tsc --noEmit` dopo i test; `TZ=Europe/Rome npx vitest run`.

## Fuori scope

L'accesso ai goal di Goal-Based Investing (SPEC-4C), il redesign (SPEC-4D), qualunque modifica al
formato del bundle di contesto.

---

## Esito dell'implementazione (2026-08-15)

Tutti i punti 1-5 implementati. Quattro cose che la spec non prevedeva e che sono servite:

1. **`updatedAt` di un memory item ora marca l'ultima modifica di CONTENUTO, non l'ultima
   scrittura** (`store.ts` → `mergeMemoryItem`). Senza questo la regola del punto 3 non regge: la
   rivalutazione giornaliera bumpava `updatedAt`, quindi ogni "Ignora" scadeva al giro di cron
   successivo e il banner tornava comunque. È l'invariante su cui poggia l'intera durabilità.
2. **`evaluateActiveGoals` accetta `pendingItems`**, gli item appena estratti e non ancora scritti.
   Serve a tenere il turno di chat dentro UNA sola transazione Firestore, come impone SPEC-4A:
   altrimenti sarebbero due (scrittura candidati + valutazione).
3. **Il chiamante è autorevole su `structuredGoal`**: `mergeMemoryItem` non lo ri-deriva più. Se la
   ristrutturazione Haiku di un goal modificato a mano fallisce, il goal resta **senza** struttura e
   il pannello lo dichiara "non tracciabile automaticamente", invece di conservare una struttura che
   contraddice il nuovo testo. Meglio visibilmente non tracciato che silenziosamente sbagliato.
   Corollario: la route PATCH ristruttura solo su creazione, su modifica del testo o su goal ancora
   privo di struttura — un semplice archivia/ripristina non spende una chiamata al modello.
4. **La descrizione di un enum nel tool schema deve parlare il vocabolario della UI.** Al collaudo,
   «portare **la liquidità** a 40k» finiva a volte su `liquid_net_worth_target` e a volte su
   `cash_target`: nel prodotto "Liquidità" è l'etichetta della classe `cash`, ma la descrizione del
   campo `kind` non lo diceva. Chiarita, tre esecuzioni consecutive da documento vuoto sono
   identiche. Vale per qualunque tool use futuro.

Scelte minori: `unit` non si chiede al modello (è una conseguenza di `kind`); una `structuredGoal`
malformata scarta la struttura ma **non** il goal; `periodLabel` rimosso da `AssistantStructuredGoal`
perché non aveva né lettori né scrittori.

**Collaudo guidato** (WORKFLOW.md): `tsc` pulito, 94 file / 1749 test verdi, tre asserzioni chiave
viste rosse rompendo il codice di proposito (direzione `at_most`, guardia dell'ignore durevole,
conservazione di `updatedAt`). Fasi A-E automatizzate sugli emulatori con parole civetta, tutte
verdi, incluse le chiamate Haiku reali (`1,5M` → 1.500.000, non più 15 milioni) e la coppia
positivo/negativo sul confine di delega. Controllo visivo del pannello memoria fatto dall'owner.

---

## Prompt per l'implementazione

> Implementa la specifica `docs/specs/SPEC-4B-assistente-memoria-obiettivi.md`: riscrittura della
> pipeline obiettivi dell'Assistente AI — estrazione strutturata con tool use su Haiku (schema con
> kind, targetValue numerico, direction, deadline; eliminazione totale del parser regex),
> valutazione sempre contro il mese corrente con direzione at_least/at_most, chiamata anche in chat
> senza bundle, nuova fase di rivalutazione nel cron giornaliero, "Ignora" durevole e trasparenza
> del goal strutturato + ultima valutazione nel pannello memoria. Segui la specifica alla lettera e
> riscrivi i test indicati. Al termine proponi il collaudo guidato secondo WORKFLOW.md.
>
> Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
> - Leggi AGENTS.md (pattern, convenzioni, gotcha)
> - Leggi CLAUDE.md (stato corrente, known issues)
> - Leggi WORKFLOW.md
> - Leggi COMMENTS.md e APPLICALA mentre scrivi codice
> - Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
>
> Crea SESSION_NOTES.md per tracciare il lavoro.

**Modello consigliato**: Opus 5 (o Fable 5), effort **high**. Riprogettazione di una pipeline
LLM-in-the-loop con schema, cron e persistenza: è la spec più concettuale del blocco assistente.
