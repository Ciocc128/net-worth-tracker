# SPEC-3 — Bot Telegram per il tracciamento spese (testo + vocali)

**Stato**: pronta per implementazione · **Dipendenze**: nessuna · **Aree toccate**: nuova route API, nuovo modulo server, SETUP.md/VERCEL_SETUP.md

## Obiettivo

Un bot Telegram con cui tracciare una spesa scrivendo o mandando un vocale
("35 euro di benzina ieri", "ho speso 100€ per un abbonamento…"). Il bot:

1. **Parsa** il messaggio con Claude (structured output) → tipo, categoria, sottocategoria, importo, data, nota.
2. **Salva subito** quando è sicuro, rispondendo con un riepilogo + bottone **↩️ Annulla**;
   quando è in dubbio propone e chiede **✅ Conferma / ✏️ Correggi / ❌ Annulla** con bottoni inline.
3. Può **proporre la creazione** di una categoria/sottocategoria nuova (sempre con conferma esplicita).
4. Può **assegnare la spesa a un centro di costo esistente** ("…e aggiungi al centro di costo Dacia Jogger").
5. Risponde a domande tipo *"in che categoria dovrebbe andare un abbonamento da 100€?"* senza scrivere nulla.
6. Per decidere la categoria consulta anche le **note delle spese passate** ("terme" → dove era finita l'ultima volta).
7. **Vocali**: trascrizione con OpenAI (`gpt-4o-mini-transcribe`), poi stesso flusso del testo.

Decisioni già prese: **nessun `linkedCashAssetId`** (la spesa nasce senza addebito su conto, come fa il
CSV import — i saldi si riconciliano dall'app); **transfer esclusi**; ricorrenti/rate/centri di costo fuori scope v1.

## Architettura

### Route e sicurezza

- Nuova route `app/api/telegram/webhook/route.ts` (POST). Struttura canonica: auth → validate → delegate.
- **Auth**: header `X-Telegram-Bot-Api-Secret-Token` confrontato in constant-time con
  `TELEGRAM_WEBHOOK_SECRET` — stessa tecnica di `verifyCronSecret` (`lib/server/apiAuth.ts`): SHA-256 +
  `timingSafeEqual`, e **secret mancante = accesso negato**, mai aperto. Header sbagliato → 401 senza corpo.
- **Chat non collegata** → risposta cortese "questo bot è privato" e stop: nessun dato, nessuna AI.
- **Rate limit**: `checkRateLimit(\`telegram:${chatId}\`, 30, 3_600_000)` (`lib/server/rateLimit.ts`).
- **Risposta rapida + lavoro dopo**: rispondere `200` subito e fare parsing/AI/scritture dentro
  `after()` di `next/server` (Next 16) — Telegram ritenta i webhook lenti e produrrebbe doppioni.
- **Idempotenza**: persistere `lastUpdateId` per chat; un `update_id <= lastUpdateId` si scarta in silenzio.
- Aggiornare `__tests__/apiAuthRoutes.test.ts` se enumera le route (verificare come tratta le due cron:
  il webhook appartiene alla stessa famiglia "secret, non Firebase-auth").

### Dati — una collection nuova: `telegramChats/{chatId}`

```ts
interface TelegramChatDoc {
  userId: string;            // owner dei dati — scritto A MANO in fase di setup (nessuna UI di linking v1)
  lastUpdateId?: number;
  pending?: {                // al più UNA azione pendente per chat
    kind: 'confirm_expense' | 'awaiting_correction';
    proposal: TelegramExpenseProposal;   // il parse strutturato completo
    newCategory?: { name: string; type: ExpenseType; subCategoryName?: string };
    botMessageId?: number;   // per editare il messaggio coi bottoni
    createdAt: Timestamp;
  } | null;
  lastExpense?: { expenseId: string; messageId: number; createdAt: Timestamp }; // per ↩️ Annulla
}
```

- **Solo Admin SDK**: la collection NON va aggiunta a `firestore.rules` (default deny per i client — verificare
  che le rules chiudano con deny; se esiste un match catch-all, aggiungere il blocco esplicito `read, write: false`).
- Setup documentato in SETUP.md: creare il doc `telegramChats/{chatId}` con `userId` dalla console
  Firebase (stesso spirito del setup manuale del demo account). Funziona anche per il co-owner
  dell'account condiviso: il suo chatId punta allo stesso `ownerId`.

### Scrittura spese (Admin) — `lib/server/telegram/telegramExpenseWriter.ts`

Il client SDK è inutilizzabile da un webhook (nessun utente firmato, rules `canAccess`). Precedente da
copiare: `lib/services/dividendIncomeService.ts:createExpenseFromDividend` (scrive con `adminDb`). Regole
NON negoziabili (sono la parte che il writer client fa da sé e qui va replicata):

1. **Sign convention applicata dal writer**: `amount = (type === 'income') ? +abs : −abs`
   (transfer escluso a monte). Classificazione SEMPRE per `type`, mai per segno.
2. **Denormalizzazione obbligatoria**: `categoryName`/`subCategoryName` copiati dal doc categoria al
   momento della scrittura; idem `costCenterId`/`costCenterName` quando il parse ha matchato un
   centro di costo (nome copiato dal doc del centro, mai dal testo dell'utente).
3. Dopo OGNI scrittura: `invalidateDashboardOverviewSummaryServer(userId, 'expense_created')`
   (`lib/services/dashboardOverviewInvalidation.server.ts`) — MAI la variante client.
4. `date`: default oggi in wall-clock italiano (`getItalyDateIso` → `Date`), il parser può proporre
   "ieri"/date esplicite; MAI `new Date()` nudo per il default di dominio.
5. Categorie: dedupe con `categoryMatchKey(name, type)` (`lib/utils/expenseImport.ts:206`) prima di
   creare — l'identità è **(nome, tipo)** e a parità vince il documento più vecchio. Creazione categoria
   + merge sottocategorie: replicare via Admin il pattern di `expenseImportService.ts:71-103`
   (id sottocategoria generato localmente, stile `genSubId`).

### Parsing AI — `lib/server/telegram/telegramParser.ts`

- Client Anthropic **lazy-import** (pattern `stream/route.ts:71`), modello `claude-sonnet-5`
  (volume basso, l'italiano colloquiale merita qualità; non usare haiku qui).
- **Structured output con tool use** (primo del repo — il pattern attuale "prompt + JSON.parse" di
  `memoryExtraction.ts` è il fallback, ma qui si usa `tools` + `input_schema` + `tool_choice` forzato):

```ts
interface TelegramParseResult {
  intent: 'track_expense' | 'ask_category' | 'correction' | 'other';
  confidence: 'high' | 'low';
  expense?: {
    type: 'fixed' | 'variable' | 'debt' | 'income';   // transfer NON ammesso dallo schema
    amountAbs: number;                                  // sempre positivo, il segno lo mette il writer
    categoryId?: string;                                // se matcha una esistente
    newCategory?: { name: string; type: ExpenseType };  // in alternativa a categoryId
    subCategoryId?: string;
    newSubCategoryName?: string;
    costCenterId?: string;                              // SOLO id di un centro di costo esistente
    dateIso: string;                                    // YYYY-MM-DD
    note: string;
  };
  answer?: string;          // per ask_category / other: la risposta testuale da inoltrare
  doubts?: string;          // cosa non è chiaro (mostrato nella richiesta di conferma)
}
```

- **Contesto nel prompt utente** (mai nel system, che resta byte-identico — regola AGENTS):
  - tassonomia completa `expenseCategories` dell'utente (id, nome, tipo, sottocategorie) — esaustiva,
    e il prompt DICE che è esaustiva (regola AGENTS sui cap silenziosi);
  - lista dei **centri di costo** esistenti (id + nome), letta via Admin SDK — il modello può SOLO
    matchare un id esistente, mai inventarne; se l'utente nomina un centro che non matcha nulla, il
    parse va a `confidence: 'low'` e la proposta di conferma lo dice ("centro di costo «X» non
    trovato — salvo senza centro?"). La creazione di centri di costo resta nell'app (hanno slot
    colore, budget e ciclo di vita);
  - **precedenti**: le ultime ~N=300 spese (finestra 12 mesi, query Admin `userId + date desc`, indice
    esistente) ridotte a righe `nota → categoria/sottocategoria` deduplicate, così "terme" ritrova dove
    era finita l'ultima volta. Firestore non ha full-text: il matching lo fa il modello leggendo la lista;
  - data odierna italiana e regole sui tipi (fixed/variable/debt/income, transfer vietato).
- `confidence: 'high'` richiede: categoria esistente matchata, importo e tipo non ambigui, nessuna
  creazione di categoria. Qualunque `newCategory`/`newSubCategoryName` → SEMPRE `low` (conferma obbligatoria).

### Flusso Telegram — `lib/server/telegram/telegramBot.ts`

API Bot via `fetch` diretto (nessuna dipendenza nuova: niente grammY/telegraf, il flusso è piccolo).
Helper: `sendMessage`, `editMessageText`, `answerCallbackQuery`, `getFile` + download
(`https://api.telegram.org/file/bot<token>/<file_path>`).

1. **Vocale** (`message.voice`): `getFile` → download OGG/Opus → OpenAI
   `POST /v1/audio/transcriptions` (`gpt-4o-mini-transcribe`, `language: 'it'`, via `fetch` multipart —
   niente SDK OpenAI, una sola chiamata non giustifica la dipendenza) → il testo entra nel flusso normale.
   Rispondere citando la trascrizione ("Ho sentito: …") così gli errori STT sono visibili.
2. **Testo** → `telegramParser`:
   - `track_expense` + `high` → scrivi subito → riepilogo (tipo, categoria/sotto, importo formattato,
     data, nota) + bottone inline `↩️ Annulla` → salva `lastExpense`.
   - `track_expense` + `low` → NON scrivere; salva `pending.confirm_expense` → messaggio "Ho capito
     così: … {doubts}" + bottoni `✅ Conferma` / `✏️ Correggi` / `❌ Annulla`. Se c'è `newCategory`:
     riga esplicita "⚠️ Creerei la categoria nuova «X» (tipo Y)".
   - `ask_category` → inoltra `answer` (nessuna scrittura).
   - `correction` con `pending.awaiting_correction` → ri-parse con proposta precedente + testo di
     correzione nel prompt → nuova proposta di conferma.
   - `other` → risposta breve con cosa sa fare il bot.
3. **Callback** (`callback_query`, sempre `answerCallbackQuery` subito):
   - `confirm` → eventuale creazione categoria (dedupe!) → scrittura spesa → edit del messaggio in riepilogo definitivo, pulizia `pending`.
   - `correct` → `pending.kind = 'awaiting_correction'`, il bot chiede "Dimmi cosa correggere".
   - `cancel` / `undo` → cancella `pending` o la spesa appena creata (delete del doc + invalidazione), edit del messaggio.
   - Callback su un `pending` scaduto/mancante → "proposta non più valida, riscrivimi la spesa".
4. `/start` → stato del collegamento + istruzioni d'uso in 3 righe.

### Env e configurazione

- Nuove env (server-only, `process.env` a use-site, MAI in `appConfig.ts`):
  `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `OPENAI_API_KEY`.
- Documentare in SETUP.md (blocco `.env.local` + tabella) e VERCEL_SETUP.md: creazione bot con
  BotFather, `setWebhook` con `secret_token` (comando curl pronto), creazione doc `telegramChats`.
- `export const maxDuration = 60` sulla route (vocale: download + STT + Claude). `vercel.json` non va toccato.

### Test

- **Layer puro testabile**: estrarre in `lib/utils/telegramPlanning.ts` (o simile) tutto ciò che non
  tocca rete/Firestore: costruzione del contesto precedenti (dedupe note→categoria), validazione del
  `TelegramParseResult` (zod), decisione high/low → azione, costruzione dei payload messaggio. Test Vitest su questo.
- Route: test di auth (secret giusto/sbagliato/assente → 200/401/401) sul modello dei test cron
  esistenti; idempotenza su `update_id` ripetuto; chat sconosciuta → nessuna scrittura.
- Writer: sign convention per i 4 tipi, denormalizzazione nomi, dedupe `categoryMatchKey`
  (mock Admin col pattern `vi.hoisted` di `assetTransactionWriteTx`).
- Collaudo guidato (WORKFLOW.md) su emulatore: il bot non è emulabile end-to-end, ma il webhook sì —
  `curl` con update finti (testo, callback, update duplicato) contro `next dev` + emulatore, verificando
  le spese scritte via REST Firestore con `Bearer owner`. I vocali si collaudano in produzione (fase separata del collaudo).

### Fuori scope v1 (dichiarati, non dimenticati)

Transfer; ricorrenti/rate; **creazione** di centri di costo via bot (l'assegnazione a centri
esistenti È in scope); addebito conto cash; UI di linking in Impostazioni;
modifica di spese esistenti via bot ("cancella l'ultima" c'è solo come ↩️ sul messaggio); foto/scontrini.

---

## Prompt per l'implementazione

> Implementa la specifica `docs/specs/SPEC-3-telegram-bot.md`: bot Telegram per tracciare spese via
> testo e vocali (trascrizione OpenAI), con webhook Next.js protetto da secret token, parsing Claude
> con tool use strutturato, conferme con bottoni inline, creazione categorie con conferma esplicita e
> dedupe (nome, tipo), assegnazione a centri di costo esistenti (mai creazione),
> scrittura spese via Admin SDK senza linkedCashAssetId, idempotenza su
> update_id e collection `telegramChats`. Segui la specifica alla lettera: sign convention, nomi
> denormalizzati, invalidazione server della dashboard e le regole di sicurezza non sono negoziabili.
> Estrai il layer puro testabile e scrivi i test indicati. Aggiorna SETUP.md e VERCEL_SETUP.md.
> Al termine proponi il collaudo guidato secondo WORKFLOW.md (webhook via curl su emulatore).
>
> Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
> - Leggi AGENTS.md (pattern, convenzioni, gotcha)
> - Leggi CLAUDE.md (stato corrente, known issues)
> - Leggi WORKFLOW.md
> - Leggi COMMENTS.md e APPLICALA mentre scrivi codice
> - Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
>
> Crea SESSION_NOTES.md per tracciare il lavoro.

**Modello consigliato**: Opus 5 (o Fable 5 se disponibile), effort **high**. È la spec più grande:
architettura nuova, sicurezza di un endpoint pubblico, primo structured-output del repo e scritture
Admin — vale il modello maggiore. Se la sessione si allunga, il punto di taglio naturale è: prima
tutto il flusso testo, poi i vocali (la sezione STT è isolata).
