# SPEC-4A — Assistente AI: bugfix e pulizia (prima delle nuove funzioni)

**Stato**: implementata (2026-08-15, branch `fix/assistente-bugfix-spec-4a`, PR #267) · **Dipendenze**: nessuna · **Ordine**: PRIMA di SPEC-4B/4C/4D

## Obiettivo

Chiudere i bug e il codice morto trovati nell'audit dell'assistente, SENZA toccare la pipeline di
valutazione obiettivi (quella viene riscritta in SPEC-4B: non sprecare lavoro lì). Ogni punto sotto è
stato verificato su codice con file:riga.

## Interventi (in ordine)

### 1. Rimuovere la modalità fantasma `quarter_analysis` (decisione presa: si elimina)

Costruita ma senza tab UI; se mai invocata produce thread etichettati "Libera" e un rebuild di
contesto sbagliato. Rimuovere:
- `types/assistant.ts:8` — il membro dell'union `AssistantMode` (e il campo `quarter` derivato in
  `stream/route.ts:229-234`).
- `lib/server/assistant/prompts.ts:664` — `buildQuarterAnalysisPrompt` + l'eventuale format contract dedicato.
- `lib/server/assistant/anthropicStream.ts:63-87` — il branch in `buildPrompt` + il word ceiling.
- `stream/route.ts` — il branch di selezione bundle e il titolo thread trimestrale.
- `lib/server/assistant/webSearchPolicy.ts` — l'entry della modalità.
- **ATTENZIONE — grep prima di cancellare** `buildAssistantQuarterContext`
  (`lib/services/assistantMonthContextService.ts:616`): le email trimestrali potrebbero usarlo
  (`monthlyEmailService` condivide `EMAIL_PERIODIC_FORMAT_CONTRACT` con `prompts.ts`). Se ha altri
  consumatori vivi, resta; se l'unico consumatore era la modalità assistant, si elimina con lei.
  Regola AGENTS: "Keep" e "Delete" richiedono lo stesso grep, e la catena morta si elimina intera in un commit.
- `components/assistant/AssistantContextCard.tsx:22-28` — la copia locale di `getPeriodLabel`
  duplica quella di `prompts.ts:85` (e diverge già: manca il branch quarter). Unificare su UNA
  funzione condivisa importabile dal client (spostarla in un modulo neutro, es. `lib/utils/`).

### 2. Modificare una memoria non deve cancellarne i metadati (bug reale)

`lib/server/assistant/store.ts:369-397`: il PATCH costruisce `baseItem` con
`sourceThreadId/evidenceSummary/lastEvaluationAt/lastEvaluationResult/completedAt: undefined` e poi
`{...items[i], ...baseItem}` — **gli `undefined` vincono** e, siccome l'intero array viene riscritto,
i metadati spariscono da Firestore. Fix: costruire l'oggetto merge SOLO con i campi effettivamente
passati (spread condizionali, stile `assetAllocationService`), mantenendo la semantica esistente per
`completedAt` quando lo status cambia esplicitamente. Test: PATCH di solo `text` su un item con
valutazioni → i metadati sopravvivono.

### 3. Una scrittura per turno, non ~10 (consolidamento `extractAndSaveMemory`)

`stream/route.ts:54-133`: oggi una `updateAssistantMemoryDocument` per candidato + due per obiettivo
attivo — ogni chiamata è un read-modify-write dell'INTERO documento, in corsa con i PATCH del pannello.
Fix minimo (senza toccare la logica di valutazione, che cambia in 4B): accumulare tutte le mutazioni
del turno e applicarle con UNA `adminDb.runTransaction` (tutte le letture prima delle scritture —
regola AGENTS sulle transazioni). Esporre in `store.ts` una `applyAssistantMemoryMutations(userId, mutations)`.

### 4. Dedupe memoria: due falle puntuali

`lib/server/assistant/memoryExtraction.ts`:
- **Dentro lo stesso batch**: `dedupeMemoryItems` confronta solo con gli item esistenti — due
  candidati quasi identici nella stessa risposta passano entrambi (`:74-101`). Fix: dedupare anche i
  candidati tra loro (stesso `isSimilarText`).
- I test devono coprire: batch con doppione interno; testo corto (≤2 parole) che oggi degrada a
  exact-match (`:58-60`) — documentare il comportamento nel test anche se il miglioramento semantico
  vero arriva con 4B.

### 5. `hasDummySnapshots` incoerente

`store.ts` hardcoda `hasDummySnapshots: false` in 5 punti (`:318, :341, :440, :455, :494`); solo
`memory/route.ts:31-41` lo calcola davvero. Fix: calcolarlo in un unico helper e usarlo ovunque il
valore viene restituito al client, oppure toglierlo dai payload che non possono conoscerlo (scegliere
la via più piccola e coerente; l'importante è che il client non riceva mai un `false` inventato).

### 6. Espressione di auth fuorviante

`context/route.ts:40-41`: `getApiAuthErrorResponse(await assertCanAccessAccount(...))` —
`assertCanAccessAccount` ritorna `Promise<void>`, quindi l'espressione valuta sempre
`getApiAuthErrorResponse(undefined)`. L'auth funziona solo grazie al throw→catch a `:99`. Riscrivere
nel pattern canonico delle altre route (chiamata semplice, catch di `ApiAuthError`).

### 7. Web search: gate per parola, non per substring

`webSearchPolicy.ts:51-53`: `.includes()` fa sì che `'pil'` matchi "pilastro"/"pilota" e ogni falso
positivo costa un turno da 16000 token con web search. Fix: matching a confini di parola
(`\b`, con normalizzazione accenti coerente con le keyword esistenti). Test: "pilastro" non attiva, "PIL" sì.

### 8. Pulizia minore

- `lib/server/assistant/goalEvaluation.ts:167-169` — `normalizeAssetClass` mai chiamata: eliminare.
- `lib/hooks/useAssistantMonthContext.ts` — esporta solo `useAssistantPeriodContext`: rinominare il
  file in `useAssistantPeriodContext.ts` e aggiornare gli import.
- Flag incoerente: `ANTHROPIC_API_KEY` assente → la pagina rende un EmptyState "non configurato" ma
  `stream/route.ts:155-162` risponde 500 JSON. Allineare la route a un 503 con messaggio coerente
  (o al medesimo shape d'errore che il client già gestisce): UNA superficie di errore, non due.

## Cosa NON toccare (va in 4B)

`parseStructuredGoalFromText` (regex, bug dei decimali incluso), `evaluateStructuredGoal`,
`buildGoalCompletionSuggestions` e la persistenza di "Ignora": è la pipeline che SPEC-4B riscrive.
L'unica eccezione è il consolidamento delle scritture (punto 3), che 4B erediterà.

## Test e verifica

- Suite d'area: `assistantRoutes`, `assistantWebSearchPolicy`, `assistantMonthContextService`,
  `assistantPromptBundle`, `assistantGoalEvaluation` (deve restare verde: la logica non cambia qui).
- `npx tsc --noEmit` DOPO i test; `TZ=Europe/Rome npx vitest run`; `npx knip` per confermare che la
  rimozione quarter non lascia orfani.
- Collaudo guidato: un giro completo dell'assistente su emulatore (turno con estrazione memoria,
  PATCH dal pannello, verifica su Firestore REST che i metadati sopravvivono).

---

## Prompt per l'implementazione

> Implementa la specifica `docs/specs/SPEC-4A-assistente-bugfix.md`: bugfix e pulizia
> dell'Assistente AI — rimozione completa della modalità quarter_analysis (con il grep obbligatorio
> su buildAssistantQuarterContext prima di decidere se eliminarlo), fix della perdita metadati nel
> PATCH memoria, consolidamento delle scritture memoria in una transazione per turno, dedupe
> intra-batch, hasDummySnapshots coerente, riscrittura dell'espressione di auth in context/route.ts,
> web search gate a confini di parola e pulizie minori. NON toccare la pipeline di valutazione
> obiettivi (goalEvaluation) oltre a quanto elencato: viene riscritta da una spec successiva. Segui
> la specifica alla lettera, punto per punto, coi test indicati. Al termine proponi il collaudo
> guidato secondo WORKFLOW.md.
>
> Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
> - Leggi AGENTS.md (pattern, convenzioni, gotcha)
> - Leggi CLAUDE.md (stato corrente, known issues)
> - Leggi WORKFLOW.md
> - Leggi COMMENTS.md e APPLICALA mentre scrivi codice
> - Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
>
> Crea SESSION_NOTES.md per tracciare il lavoro.

**Modello consigliato**: Sonnet 5, effort **high**. Interventi puntuali già diagnosticati con
file:riga; serve disciplina più che progettazione.
