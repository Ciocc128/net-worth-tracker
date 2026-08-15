# SPEC-4C — Assistente AI: accesso ai Goal-Based Investing (discuterli, consigliarli, proporli)

**Stato**: implementata (2026-08-15, branch `feature/assistente-goal-investing-spec-4c`, PR #269) · **Dipendenze**: SPEC-4A (e idealmente 4B) · **Ordine**: dopo 4B, prima di 4D

## Obiettivo

Oggi l'assistente è **cieco** sui goal di Goal-Based Investing (`goalBasedInvesting/{userId}`) — che
sono una cosa DIVERSA dagli "obiettivi" della memoria assistente (SPEC-4B). Tre capacità nuove:

1. **Vederli e discuterne**: goal, progressi, traiettorie e allocazioni consigliate entrano nel
   bundle di contesto.
2. **Coerenza coi target**: quando `goalDrivenAllocationEnabled` è attivo, l'assistente oggi ragiona
   sui target manuali che l'app stessa ha smesso di usare — va allineato.
3. **Proporre la creazione di un goal** con target di allocazione: l'assistente emette una card
   strutturata e il goal viene scritto **solo quando l'utente preme Conferma** (decisione presa:
   nessuna scrittura autonoma dell'AI).

## Stato attuale (verificato)

- `InvestmentGoal` (`types/goals.ts:14-26`): `name, targetAmount?, targetDate? (ISO), priority
  ('alta'|'media'|'bassa'), color (hex), monthlyContribution?, recommendedAllocation?
  (Partial<Record<AssetClass, number>>, somma 100), notes?`. Storage: doc unico
  `goalBasedInvesting/{userId}` → `{ goals[], assignments[], userId, updatedAt }` riscritto per
  intero (`goalService.saveGoalData:47-80`), id goal da `crypto.randomUUID()` (`GoalFormDialog.tsx:143`).
- **Vincolo AGENTS**: `goalService.ts` importa il client SDK a top-level → MAI importarlo da file
  server. Ma la matematica è separabile: `lib/utils/goalTrajectory.ts` è già puro e SDK-free, e
  `dashboardOverviewService.ts:149-166` ha già un lettore Admin **privato** (`getGoalDataForUser`).
- `fetchSettings` del context service (`assistantMonthContextService.ts:168-184`) legge solo 3 campi;
  `buildTargetAllocation` (`:282-306`) legge solo `settings.targets` e ignora
  `goalDrivenAllocationEnabled`, mentre `app/dashboard/allocation/page.tsx:152-171` li sovrascrive
  con `deriveTargetAllocationFromGoals` quando il flag è on.

## Implementazione

### 1. Estrazione della matematica pura (prerequisito tecnico)

- Nuovo `lib/utils/goalMath.ts` (SDK-free): spostarci da `goalService.ts` le funzioni pure che
  servono al server — almeno `calculateGoalProgress` e `deriveTargetAllocationFromGoals` (+ le
  costanti moltiplicatori priorità). `goalService.ts` le **ri-esporta** così nessun call site client
  cambia. I test esistenti di `goalService` seguono le funzioni (o restano e importano dal nuovo modulo).
- Nuovo `lib/server/goalData.ts`: `getGoalDataAdmin(userId)` — spostare/condividere il lettore
  privato di `dashboardOverviewService.ts` (che lo importa da qui, eliminando il duplicato).

### 2. Bundle di contesto: blocco goal

- `types/assistant.ts` — nuovo campo del bundle (obbligatorio, così `tsc` forza TUTTI i builder —
  regola AGENTS: un campo nuovo va aggiunto a tutti i 5 builder o sparisce in silenzio):

```ts
goals: {
  enabled: boolean;                       // goalBasedInvestingEnabled
  goalDrivenAllocationEnabled: boolean;
  items: Array<{
    name: string; targetAmount?: number; targetDateIso?: string;
    priority: 'alta' | 'media' | 'bassa';
    currentValue: number;                 // da calculateGoalProgress (composite inclusi)
    monthlyContribution?: number;
    recommendedAllocation?: Partial<Record<AssetClass, number>>;
    verdict?: string;                     // da goalTrajectory (buildGoalsVerdictSummary / computeGoalTrajectory)
  }>;
} | null;                                 // null = feature spenta o doc assente
```

- `assistantMonthContextService.ts`: i 5 builder popolano `goals` via `getGoalDataAdmin` +
  `goalMath`/`goalTrajectory` (il servizio gira server-side con `adminDb`, coerente col resto).
- **Target coerenti**: quando `goalDrivenAllocationEnabled && goals`, `buildTargetAllocation` usa
  `deriveTargetAllocationFromGoals(...)` al posto di `settings.targets`, e il bundle marca la
  provenienza (`targetAllocationSource: 'manual' | 'goal_driven'`) così il prompt può dirlo.

### 3. Prompt

- `formatBundleForPrompt` (`prompts.ts:132-334`): nuova sezione `--- OBIETTIVI DI INVESTIMENTO ---`
  (nomi, target, scadenza, progresso %, contributo mensile, allocazione consigliata, verdetto).
  Regole AGENTS da rispettare: la sezione o è esaustiva o dichiara il cap; `goals: null` → riga
  esplicita "Goal-Based Investing non attivo" (mai assenza silenziosa → il modello allucina "N/D").
- `ASSISTANT_SYSTEM_CORE`: paragrafo generico (mai dati per-request nel system!) su come trattare i
  goal: discuterli, consigliare un'allocazione per obiettivo in base a orizzonte/priorità, e il
  **protocollo di proposta**: quando l'utente chiede di creare un obiettivo, emettere UN blocco
  fenced ```goal-proposal contenente SOLO JSON valido con schema
  `{ name, targetAmount?, targetDateIso?, priority, monthlyContribution?, recommendedAllocation?, notes? }`
  (recommendedAllocation con somma 100), preceduto da una frase che lo introduce. Mai più di un
  blocco per risposta; mai emetterlo se l'utente non ha chiesto una creazione.
- Ricontrollare i `max_tokens`/word ceiling (regola AGENTS: si ri-verificano quando il data block cresce).

### 4. Card di proposta + conferma (client)

- `AssistantStreamingResponse`/`MARKDOWN_COMPONENTS`: il code block con language `goal-proposal`
  NON si renderizza come codice — si parsa (zod client-side; JSON invalido → fallback a blocco
  codice normale, mai crash) e si renderizza `GoalProposalCard` (nuovo componente
  `components/assistant/GoalProposalCard.tsx`): nome, target formattato, scadenza, priorità,
  allocazione proposta (lista classi + %), bottoni **Conferma** / **Ignora**.
- Conferma → POST alla nuova route (sotto) → toast + invalidazione query dei goal (le stesse chiavi
  usate dalla pagina FIRE) → la card passa allo stato "creato ✓" (persistito solo nello stato del
  messaggio in thread: al reload la card ri-parsa il blocco e mostra il bottone di nuovo — accettabile
  v1, il doppio submit è comunque innocuo perché crea un secondo goal visibile; se si vuole evitare,
  disabilitare quando un goal con lo stesso nome esiste già).
- **Demo mode**: mutazione bloccata client-side con `useDemoMode()` come ogni altra.

### 5. Route di scrittura `app/api/goals/route.ts` (POST)

- Pattern canonico: `requireFirebaseAuth` → zod (`parseOr400`; `recommendedAllocation` somma 100 ±
  tolleranza, `targetDateIso` con `z.coerce.date()`, priority enum) → `assertCanAccessAccount(token,
  body.userId)` → delega → return.
- Scrittura: `adminDb.runTransaction` su `goalBasedInvesting/{userId}` — **read-modify-write
  dell'intero array `goals`** (il doc si riscrive per intero, come fa il client; la transazione
  protegge dalla corsa con un salvataggio concorrente dalla pagina FIRE). Id `crypto.randomUUID()`,
  `color` scelto dal primo colore di `GOAL_COLORS` non ancora usato, strip degli `undefined`
  (il doc è costruito a mano → serializzatore con spread condizionali, regola AGENTS).
- Aggiungere la route a `__tests__/apiAuthRoutes.test.ts` (positivo/negativo: proprio account vs
  account altrui, stessa shape — regola WORKFLOW sul test di sicurezza in coppia).

### 6. Test

- `goalMath` (funzioni spostate: i test seguono), `assistantMonthContextService` (blocco goals nei 5
  builder, `null` quando spento, target goal-driven), `assistantPromptBundle` (sezione prompt,
  dichiarazioni di assenza), parsing client della card (zod, JSON rotto → fallback), route auth.
- `npx tsc --noEmit` dopo i test; `TZ=Europe/Rome npx vitest run`; suite d'area `fireService`/`goalService`.

## Scostamenti dalla spec in fase di implementazione

- **I builder di contesto sono 4, non 5** (`month`/`year`/`ytd`/`history`): la spec ne contava 5 includendo
  `quarter_analysis`, rimossa da SPEC-4A. Il campo `goals` è obbligatorio, quindi `tsc` li ha forzati tutti.
- **`targetDateIso` non usa `z.coerce.date()`**: il campo persistito `InvestmentGoal.targetDate` È una stringa
  `YYYY-MM-DD`, riletta con `new Date(...)` dalla traiettoria. Convertirla in `Date` per riconvertirla subito in
  stringa aggiungerebbe solo un giro UTC↔locale. Validata con regex più controllo di data reale.
- **`z.partialRecord`, non `z.record`**, per `recommendedAllocation`: in zod 4 un record con chiave enum pretende
  tutte le chiavi e rifiuterebbe un mix equity/bonds come incompleto.
- **Tre campi in più sull'item del bundle** rispetto all'elenco della spec — `requiredMonthlyContribution`,
  `projectedValueAtDeadline`, `assumedAnnualReturn` — aggiunti su richiesta del proprietario dopo che il collaudo
  ha mostrato il modello ricavarsi il gap a mano (`contributo × mesi`), conto che ignora i rendimenti e che le
  regole sui dati vietano. `computeGoalTrajectory` li calcolava già e li buttava via.

## Fuori scope

Modifica/completamento/cancellazione di goal via assistente (solo creazione); assegnazione asset ai
goal via assistente; qualunque redesign della pagina (SPEC-4D).

---

## Prompt per l'implementazione

> Implementa la specifica `docs/specs/SPEC-4C-assistente-goal-investing.md`: dare all'Assistente AI
> accesso ai goal di Goal-Based Investing — estrazione della matematica pura in lib/utils/goalMath.ts
> (SDK-free, ri-esportata da goalService), lettore Admin condiviso lib/server/goalData.ts, blocco
> `goals` obbligatorio nel bundle (tutti e 5 i builder), target allocation coerente col flag
> goal-driven, sezione prompt dedicata, protocollo del blocco ```goal-proposal e GoalProposalCard
> con Conferma che scrive via la nuova route POST /api/goals (auth canonica, zod, transazione
> Admin). Nessuna scrittura autonoma dell'AI: solo proposta + conferma. Segui la specifica alla
> lettera, test inclusi. Al termine proponi il collaudo guidato secondo WORKFLOW.md.
>
> Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
> - Leggi AGENTS.md (pattern, convenzioni, gotcha)
> - Leggi CLAUDE.md (stato corrente, known issues)
> - Leggi WORKFLOW.md
> - Leggi COMMENTS.md e APPLICALA mentre scrivi codice
> - Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
>
> Crea SESSION_NOTES.md per tracciare il lavoro.

**Modello consigliato**: Opus 5 (o Fable 5), effort **high**. Attraversa client, server, prompt e un
protocollo nuovo (card di proposta): serve giudizio architetturale su più superfici.
