# Spec — Modelli open, Wiki personale e contesto macro di TheBull

> **Per chi implementa (agente).** Specifica di disegno, non ancora ATE: le decisioni del §1 sono
> chiuse, i dettagli marcati **[da decidere]** si chiudono con lo strumento interattivo (WORKFLOW.md
> regola 5) all'inizio della fase che li tocca. Ogni fase è una sessione, un branch, un commit.
>
> Base analizzata: `origin/main` @ `10af705e` (2026-09-27). Lingua: conversazione in italiano;
> codice, identificatori e commenti in inglese; UI in italiano.

---

## 0. Letture obbligatorie

1. `WORKFLOW.md` §1.
2. `doc/guide/email-pdf.md` (contratto di formato delle email, verdetto prima e commento AI dopo) e
   `doc/guide/assistente.md` (guardrail, perché servono anche al vault §6).
3. `lib/constants/aiModels.ts` (perché le costanti restano distinte).
4. `lib/server/assistant/prompts.ts` (`ASSISTANT_SYSTEM_CORE`, `buildEmailPeriodicFormatContract`) e
   `lib/services/assistantMonthContextService.ts` (i builder del contesto, riusati dall'export §6.1).

---

## 1. Decisioni del proprietario (2026-09-28)

**Punto di partenza:** le funzioni AI non sono mai state accese — nessuna `ANTHROPIC_API_KEY`,
nessuno storico di consumo. Non si migra: si sceglie con che cosa accenderle.

| # | Decisione |
| --- | --- |
| D1 | **Due canali distinti.** Le **domande** le fa il proprietario a Claude Code con il suo **abbonamento**, sul vault (§6): costo API zero. Le **automazioni** dell'app (senza il proprietario davanti) usano una chiave API con un **modello open**. L'abbonamento non alimenta mai il server. |
| D2 | Dentro l'app restano AI **solo il commento delle email** (periodiche + budget settimanale) e la **compilazione di TheBull**. L'**Assistente in app** e **Rendimenti › «Analizza con AI»** restano spenti; l'estrazione della memoria, che serve solo all'Assistente, con loro. |
| D3 | Ordine: **provider → eval rapido → Wiki → eval completo** (§3). L'eval rapido sceglie il modello provvisorio sulle email di oggi; quello completo misura il compito vero, con la Wiki nel prompt e la compilazione di TheBull (§7). |
| D4 | La Wiki è un **vault Obsidian in un repo GitHub privato separato** — mai questa repo, che è il fork di un progetto pubblico. Nessun costo Firestore. |
| D5 | La newsletter domenicale di **TheBull** arriva con un **Google Apps Script** nell'account Gmail del proprietario: niente OAuth nell'app. |
| D6 | La pagina settimanale macro la compila **il server con un modello open**. Le pagine **Principi** si compilano **in sessione Claude Code**. |
| D7 | I dati dell'app arrivano al vault per **export markdown** (§6.1); un **server MCP in sola lettura** è una fase facoltativa successiva (§6.3). |
| D8 | Gateway: **OpenRouter**, costo contato a parte (§4.3). I candidati si **preselezionano su Artificial Analysis** (§7.1) e li decide l'eval. Rosa di F2, riletta il 2026-09-28 (§7.1): candidati **GLM 5.3 Flash**, **MiniMax-M3**, **MiMo-V2.6-Pro**; controlli dichiarati **MiMo-V2.6-Flash** e **DeepSeek V4.1 Flash**; riferimenti **Sonnet 5 `medium`** e **Haiku 4.5** (serviti anche da OpenRouter: una sola chiave). **Qwen3.8-Flash-Next** escluso: nessun endpoint ZDR. Dopo i voti, su richiesta del proprietario, **GPT-5.6 Luna** e **GPT-6 Luna** (chiusi, con ZDR). **Esito di F2: GLM 5.3 Flash** (§7.2). **TheBull dal 2026-10-05: DeepSeek V4.1 Flash** con il ragionamento spento, dopo la sonda (§7.3). **Email periodiche dal 2026-10-06: DeepSeek V4.1 Flash con il ragionamento**, dopo F6b (§7.6). |

Fuori perimetro: più utenti sulla Wiki (è del solo proprietario; account condiviso e demo non la
vedono), database vettoriali ed embedding, self-hosting dei modelli, ridistribuzione dei contenuti di
TheBull, il port dell'Assistente in app su un altro provider.

---

## 2. Stato attuale e misura

Cinque chiamate, tutte `@anthropic-ai/sdk`, tutte inerti senza chiave:

| Superficie | File | Modello | Destino (D2) |
| --- | --- | --- | --- |
| Email periodiche | `lib/server/monthlyEmailService.ts` (`generateEmailAiComment`) | Sonnet 5 | **resta**, su provider open |
| Email budget settimanale | `lib/server/weeklyBudgetEmailService.ts` | Sonnet 5 | **resta**, su provider open |
| Assistente (5 modalità) | `lib/server/assistant/anthropicStream.ts` | Sonnet 5 | spento |
| Estrazione memoria | `lib/server/assistant/memoryExtraction.ts` | Haiku 4.5 | spento con l'Assistente |
| Rendimenti › «Analizza con AI» | `app/api/ai/analyze-performance/route.ts` | Sonnet 4.6 | spento |

**Misura del 2026-09-28** sul mirror dell'account reale (`npm run ai:estimate`, stima a 3,5
caratteri/token, nessuna generazione):

| Superficie | Token di input | Tetto `max_tokens` | Limite di parole del contratto |
| --- | --- | --- | --- |
| Email mensile · trimestrale · semestrale · annuale | 5.133 · 5.407 · 5.511 · 4.205 | 6k · 8k · 8k · 10k | 500 · 700 · 700 · 900 |
| Email budget settimanale | ~533 | 400 | 45 |
| Assistente, quattro analisi | 4.205 – 4.918 | 18k | 600 – 750 |
| Assistente, chat col mese | 4.154 | 12k | — |

**Stima a priori** (output = limite di parole × ~1,8 token/parola + margine di thinking), mese tipo
con 1 email mensile, 4 settimanali, ⅓ di trimestrale e — per confronto — 30 turni di Assistente:

| | Sonnet 5 | Haiku 4.5 | GLM 5.3 Flash |
| --- | --- | --- | --- |
| Email, tutte | ~0,08 $ | ~0,04 $ | < 0,01 $ |
| Assistente, 30 turni | ~1,65 $ | ~0,85 $ | ~0,09 $ |

Con D1–D2 l'Assistente esce dal conto: la spesa API diventa **email + TheBull, pochi centesimi al
mese** con un modello open.

`includeMacroContext` è spento sull'account reale: oggi le email **non hanno alcun contesto macro**.
La Wiki (§5) lo aggiunge; la ricerca web non entra nel nuovo disegno.

---

## 3. Fasi

| Fase | Contenuto |
| --- | --- |
| **F0 — Misura** ✔ | `scripts/estimateAiTokens.mts`, `npm run ai:estimate`. |
| **F1 — Provider** ✔ | `lib/server/llm/` con due operazioni (§4), adattatore OpenRouter, le due email ci passano sopra; Assistente e Rendimenti nascosti quando non c'è un provider per loro. |
| **F1b — Email allineate all'app** ✔ | Prima di F2 (§4.4): verdetto, tile e prompt leggono il Driver dello Storico, l'Allocazione sulla base allocata (regola 5/25), mercato e acquisti per classe, le operazioni e il TWR di Rendimenti. Budget di uscita dal contratto, con il ragionamento a parte (§4.5). |
| **F2 — Eval rapido** ✔ | Sulle email di oggi, senza Wiki (§7, primo giro): scarta chi non regge l'italiano o inventa cifre e sceglie il **modello provvisorio** di produzione — **GLM 5.3 Flash**, 2026-09-28 (§7.2). |
| **F3 — Vault e TheBull** | Repo privato `finance-wiki` con lo schema (✔ 2026-09-28), struttura (§5.1), operazioni (§5.5), ingestione e compilazione (✔ codice 2026-09-28, §5.2–5.3), Apps Script, endpoint di ingestione, compilazione col modello provvisorio, **recupero delle newsletter passate** (§5.2). Il 2026-09-28 GLM ha fallito 9 compilazioni su 13; dopo la sonda la compilazione passa a DeepSeek V4.1 Flash (2026-10-05, §7.3) e le 9 settimane si ricompilano. |
| **F4 — Il vault interrogabile** | Export dei dati (✔ 2026-09-30, §6.1), `CLAUDE.md` del vault (✔ § 3.1 «I dati»), prime pagine Principi in sessione per intervista (✔ `allocazione-e-leva`, 2026-09-30; restano costi e fiscalità, comportamento, FIRE e obiettivi, liquidità e risparmio). Da qui il canale dell'abbonamento è completo. |
| **F5 — La Wiki nelle email** ✔ | Blocco macro per periodo e digest dei Principi nei prompt delle email (§5.4, 2026-10-05), e nella stessa sessione le spese per ruolo 50/30/20 nelle email. |
| **F6 — Eval completo** ✔ | Due compiti (§7, secondo giro): email con la Wiki, compilazione di TheBull (§ 7.4). Poi **F6b** (§ 7.5–7.6, 2026-10-06): dati blindati, contratto narrativo e un prompt di sistema solo per l'email; modello definitivo delle email **DeepSeek V4.1 Flash con il ragionamento**, TheBull confermato su DeepSeek spento. |
| **F7 — MCP (facoltativa)** | Server MCP in sola lettura (§6.3), solo se l'export risulta troppo vecchio nell'uso. |

---

## 4. Layer provider (F1)

### 4.1 Interfaccia

`lib/server/llm/`, con le sole due operazioni che servono alle superfici rimaste — niente streaming:

```ts
generateText(surface, { system, user, maxTokens }): Promise<LlmResult | null>
extractStructured<T>(surface, { system, user, schema: z.ZodType<T>, jsonSchema }): Promise<T | null>
```

`aiModels.ts` passa da «superficie → id modello» a «superficie → `{ provider, model }`» e guadagna la
voce `THEBULL_COMPILE`. Adattatori: `openrouter` (API OpenAI-compatibile) e `anthropic` (quello di
oggi, conservato per chi usa upstream con una chiave Anthropic). Ogni chiamata registra
`console.info('[ai-usage]', { surface, model, input, output })` nei log di Vercel.

Il modello è input non fidato: `extractStructured` valida con zod e restituisce `null` su qualunque
scarto, come fa oggi `memoryExtraction.ts`. Un fallimento non blocca mai l'invio dell'email (regola
già in vigore).

**Deciso in F1 (2026-09-28): `fetch` diretto**, nessuna dipendenza nuova — una sola rotta
(`/chat/completions`), la risposta passa comunque per zod. Retry uno solo su 408/429/5xx, timeout 120 s.
Nel corpo di ogni richiesta `provider: { data_collection: 'deny', zdr: true }` (§4.3); uno slug `:free`
è rifiutato prima dell'invio. Una risposta troncata (`finish_reason: length`) è uno scarto come le altre.
Le email hanno perso la ricerca web (il layer non ha strumenti): il contesto macro arriva con F5.

### 4.2 Assistente e Rendimenti spenti

`NEXT_PUBLIC_ASSISTANT_AI_ENABLED=false` nasconde già l'Assistente. **Deciso in F1 (2026-09-28):
il pulsante di Rendimenti sparisce quando manca `ANTHROPIC_API_KEY`** — nessun flag nuovo: il server
legge la chiave in `app/dashboard/performance/layout.tsx` e la pagina (client) la riceve da un context.
Il codice di entrambi resta su Anthropic, intatto (è anche il codice di upstream).

### 4.3 Costi di OpenRouter (letti il 2026-09-28, da riverificare)

- Prezzo dei token = quello del provider, senza ricarico.
- **5,5 %** su ogni ricarica con carta (minimo 0,80 $): una ricarica minima basta per mesi.
- Tier Business all'8 %: inferenza vincolata a UE/USA. Alternativa gratuita: filtrare i provider.
- BYOK: primo milione di richieste al mese gratuito, poi 5 %.
- **Privacy:** solo provider che non trattengono né addestrano sui dati (filtro di OpenRouter); mai
  le varianti `:free`; mai le API dirette dei laboratori per i dati del portafoglio.

### 4.4 Il collaudo di F1 e l'allineamento delle email (F1b)

**Collaudo del 2026-09-28**, sul mirror, email mensile di agosto 2026, `z-ai/glm-5.3-flash`:
una chiamata, `outcome: ok`, **5.785 token in / 729 out, 0,00123 $**, 17 s. Il testo ha 390 parole, le
sei sezioni del contratto e 36 cifre in € o %, **tutte presenti nel prompt**. Il filtro `zdr: true` trova
un provider. I token reali superano del 13 % la stima di F0: il tokenizer di GLM, sull'italiano, rende
meno dei 3,5 caratteri/token usati da `ai:estimate`. Rendimenti senza chiave Anthropic: pulsante
assente a 1440 e 390, presente con una chiave finta (Playwright).

**Cosa ha trovato il proprietario leggendo il commento:** il modello non ha inventato nulla, ma il
bundle gli ha dato una lettura che l'app non dà più. Misure di agosto 2026 fatte con i moduli delle pagine:

| Domanda | Email (oggi) | App |
| --- | --- | --- |
| Peso delle azioni rispetto al target | 44,7 % contro 70 %: la base è il patrimonio intero e i target sono quelli grezzi delle Impostazioni (`formatBundleForPrompt`) | **69,6 % contro 70 %** su `tradable + frozen`, con la leva e i target effettivi (`compareAllocations`; prezzi di oggi) |
| Mercato del mese | **+507 €** = Δ − risparmio (`marketEffectOf`, `formatMarketEffectForPrompt`) | **−1.063 €** misurato; +2.177 € sono contributi pensione, −608 € «altro» (`growthDrivers`, il Driver dello Storico) |
| Azioni del mese | +4.332 € di differenza tra snapshot (`computeAssetClassPerformers`, «VARIAZIONI ALLOCAZIONE») | strumenti semplici +4.520 €, di cui **3.702 € di acquisti** e 819 € di mercato (`tradeAwarePriceEffect`) |
| Liquidità −5.119 € | «la vacanza pagata da cassa» (inferenza del modello, in assenza del registro) | ha pagato 4.892 € di rate del PAC: sei acquisti, **nessuno nel prompt** |
| Rendimento del periodo | assente | TWR sulla base di Rendimenti (`resolvePerformanceBase`), già nel PDF (#324) |

Due di questi errori non sono dell'AI: `marketEffectOf` alimenta anche il **verdetto deterministico**
e la ripartizione della tile Patrimonio, e «Andamento per classe» è deterministico.

**F1b — decisioni del proprietario (2026-09-28):** una sessione dedicata, **prima di F2**, che
porta nelle email (verdetto, tile e prompt) le quattro regole dell'app:

1. **Allocazione sulla base**: ruoli (`excluded` fuori), leva, target effettivi, sotto-allocazione con i
   compositi divisi. `compareAllocations` vive in `assetAllocationService.ts`, che importa l'SDK
   client: va estratto in un modulo puro.
2. **Mercato misurato**: il driver dello Storico (mercato, contributi pensione, mutuo, tasse, altro) al
   posto del residuo, nel verdetto, nella tile e nel prompt. Chiude anche l'asimmetria nota del
   blocco di mercato del prompt, che oggi non netta le tasse (doc/guide/email-pdf.md).
3. **Classi e operazioni**: «Andamento per classe» e le variazioni nel prompt separano mercato e
   acquisti (`tradeAwarePriceEffect`, come `computeTopMovers` della Panoramica); le operazioni del
   periodo entrano nel prompt.
4. **Rendimento del periodo**: il TWR sulla base di Rendimenti, come il PDF.

**F1b fatto (2026-09-28).** Le quattro regole sono nell'email tramite `lib/utils/emailPortfolio.ts`, che compone i
moduli delle pagine (doc/guide/email-pdf.md § Periodic Emails). Scelte del proprietario in sessione: allocazione sul
`byAsset` di fine periodo con i ruoli di OGGI; banda **5/25** nell'email; «Versamenti al fondo pensione» come nel
registro dello Storico; la frase del verdetto è quella del Driver; operazioni nel prompt per strumento (tetto 15
dichiarato); senza `byAsset` il mercato è dichiarato residuo e «Andamento per classe» sparisce; l'Assistente resta
com'è (`formatBundleForPrompt(…, { omitAllocation: true })` solo per l'email).

**Collaudo sul mirror riseminato (2026-09-28), agosto 2026:** email e Storico danno lo stesso Driver (+762 € mercato,
−255 € altre) perché in produzione `pensionReturnStartMonth` è ora 2026-08 (impostato dal proprietario): con un mese ≤
luglio escono esattamente i −1.063 / +2.177 / −608 misurati al mattino. Azioni 69,4 % a fine agosto (69,6 % oggi)
contro 70 %; azioni semplici 3.702 € di acquisti e 819 € di mercato; sei BUY per 4.891 €; TWR +0,5 % nel mese. Due
generazioni con `z-ai/glm-5.3-flash` (autorizzate): la prima col tetto unico 6.000 ne ha spesi **5.450** (a un passo dal
troncamento, 0,0037 $); la seconda con il budget del §4.5 **858** token, `reasoning: 0`, 0,0014 $, 439 parole, 49/49
cifre nel prompt, le sei sezioni. Il modello ha letto in entrambe «18° mese per crescita… su 18» come una serie: la
frase del piazzamento ora dice il lato della classifica (`describeHallOfFameStanding`, verdetto e prompt).

### 4.5 Budget di uscita (F1b, 2026-09-28)

Un tetto `max_tokens` non si paga: si paga il generato. Si paga invece, e si butta, una risposta **troncata**. Su un
modello che ragiona il tetto copre ragionamento **e** testo, quindi (`lib/server/llm/budget.ts`): il ragionamento ha un
tetto suo (`reasoning.max_tokens`: mensile 4.000, trimestrale e semestrale 6.000, annuale 8.000, settimanale 1.500), il
testo lo spazio del limite di parole × 1,8 × 2, e `max_tokens` è la somma. Niente è tarato su un modello: F2 può
sceglierne un altro. Il log `[ai-usage]` registra `reasoning`, e **F2 lo misura per candidato** (il costo vero è
prezzo di uscita × ragionamento + testo); lì si rivede il budget. **F2 l'ha misurato** (§7.2): il budget resta com'è.
GLM 5.3 Flash ragiona in media **64 token** su un tetto mensile di 4.000; solo MiniMax-M3 lo sfonda (4.767 su 4.000 in una
mensile) e ha troncato due settimanali su tre (tetto 1.500): il difetto è suo, non del budget. I controlli di F2 leggono anche i punti
percentuali («p.p.»).

---

## 5. Il vault e TheBull (F3, F5)

### 5.1 Struttura

Repo GitHub **privato** `Ciocc128/finance-wiki` (creato il 2026-09-28, con lo schema in `CLAUDE.md`), aperto in
Obsidian con il plugin Obsidian Git. Schema ispirato alla «LLM Wiki» di Karpathy: le fonti grezze non si toccano, le
pagine sono compilate da un LLM e riviste dal proprietario.

```
CLAUDE.md                      ← le regole per chi interroga il vault (§6.2)
raw/
  thebull/2026-09-28.md        ← testo della newsletter, scritto dall'ingestione (mai modificato)
  sources/<slug>.md|.pdf       ← articoli, documenti, note del proprietario
dati/
  2026-09.md                   ← export dell'app (§6.1), mai scritto a mano
  portafoglio.md               ← istantanea corrente, riscritta a ogni export
wiki/
  index.md                     ← una riga per pagina: slug, titolo, a cosa serve
  principi/_digest.md          ← ≤ 3.000 token: ciò che entra nei prompt delle email
  principi/<tema>.md           ← allocazione-e-leva, costi-e-fiscalita, comportamento, fire, …
  macro/settimane/2026-W39.md  ← una pagina per settimana (frontmatter: settimana, fonte, date)
  macro/mesi/2026-09.md        ← riassunto del mese, rigenerato a ogni settimana del mese
  macro/temi/<tema>.md         ← tassi, inflazione, azionario, cambio EUR-USD, materie prime
  analisi/<data>-<slug>.md     ← risposte tenute: la domanda, la risposta, le fonti (§5.5)
log.md                         ← una riga per ingestione, compilazione, export
```

Chi scrive cosa: il server scrive `raw/thebull/`, `wiki/macro/settimane/`, `wiki/macro/mesi/`, `dati/` e
`log.md`; `wiki/macro/temi/`, `wiki/principi/`, `wiki/analisi/` e `CLAUDE.md` li scrive solo il proprietario o
una sua sessione Claude Code. **I temi non li scrive il server** (decisione del 2026-09-28): riscrivere cinque
pagine a settimana con un modello piccolo accumula «falsa coerenza»; li aggiorna il lint mensile (§5.5),
dalle settimane del mese, col modello dell'abbonamento. Ogni pagina compilata
porta nel frontmatter le fonti da cui deriva. La copia grezza di TheBull resta nel repo privato: uso
personale, mai esposta in UI, demo o export.

### 5.2 Ingestione

TheBull arriva da `newsletter@thebull.it` la domenica mattina (~08:30 ora di Roma), template Mailchimp fisso:
`#<numero> - GG/MM/AAAA` in testa, poi sezioni `** TITOLO` + una riga di trattini. Al 2026-09-27 è al **n. 23**:
l'archivio intero sono circa 23 email.

1. **Apps Script** nell'account Gmail (`scripts/wiki/thebullIngest.gs`, la configurazione nella sua testata):
   `ingestLatest` ogni domenica alle 10 cerca `from:newsletter@thebull.it -label:wiki-ingested newer_than:7d`,
   prende `getPlainBody()` e fa `POST /api/wiki/ingest` con `Authorization: Bearer <WIKI_INGEST_SECRET>` e il corpo
   `{ source: 'thebull', receivedAt, subject, text }`. Etichetta il messaggio `wiki-ingested` solo dopo un 200
   (`duplicate`, oppure `ignored`: un'email dello stesso mittente che non è un numero, come la conferma d'iscrizione
   del 4 luglio 2026) o un 201 (ingerito, compilato o `pending`); ogni altro esito lo lascia per la volta dopo, e 401,
   404 e 503 fermano il giro (segreto, deploy o vault da sistemare: il primo `startBackfill`, lanciato prima del
   deploy, ha risposto 404 a ogni email).
   `startBackfill`, lanciata **una volta a mano**, fa lo stesso per **tutto l'archivio** (dalla più vecchia), a lotti
   di 4,5 minuti con un trigger ogni 10 minuti che si toglie da solo a fine archivio.
2. **Endpoint** `app/api/wiki/ingest/route.ts`: segreto a tempo costante (401), vault non configurato (503), corpo
   zod (400), testo oltre 200.000 caratteri (413); idempotente sulla **data del numero** (`duplicate`, 200). Il testo
   passa per `cleanTheBullText` **prima** di essere scritto (decisione del 2026-09-28): via sponsor, promozione
   dell'Academy, social, footer e **ogni riga con l'id dell'iscritto** (i link Mailchimp `e=…`); il resto resta nel
   formato del template, così **lo stesso parser legge l'email e il grezzo salvato**. Dopo, il grezzo è immutabile;
   il frontmatter dice fonte, numero, data, oggetto, ricezione e versione del filtro.
3. Nella stessa richiesta: **compilazione** (§5.3) e **un solo commit** (Git Data API: grezzo, settimana, il suo
   `.json`, il mese, `log.md`), ricostruito una volta sulla testa nuova se il proprietario ha fatto push nel
   frattempo. Se la compilazione fallisce il grezzo si committa lo stesso con `pending 0/3` in `log.md`; la fase 9 del
   cron giornaliero delle 18 (nessun cron nuovo) ritenta, **tre volte, poi `failed`**; `npm run wiki:compile --
   <AAAA-MM-GG>` ricompila a comando, `-- --dry-run <file>` prova una newsletter locale senza scrivere. Il lint
   mensile elenca le `failed`.

### 5.3 Compilazione (modello open)

**Il modello legge una sola sezione**, «Il punto della settimana» (~8k caratteri su ~16k). Tabella dei rendimenti
degli indici, letture consigliate ed episodi li legge il **codice** (`lib/utils/thebullParse.ts`): le loro cifre non
passano mai da un modello, e lo sponsor non gli arriva. Senza il marcatore «Il punto» (un numero vecchio?) il punto
sono le sezioni che il template non nomina.

Una chiamata `extractStructured` (`THEBULL_COMPILE`, schema rigido) restituisce tre liste, **ogni voce con la frase
copiata dal testo** (decisione del 2026-09-28):

| Lista | Contenuto | Tetto nel prompt |
| --- | --- | --- |
| `fatti` | area, paese, sintesi: ciò che è accaduto o misurato nella settimana | 20 |
| `tesi` | area, sintesi: le interpretazioni dell'autore, marcate come opinione | 8 |
| `spunti` | sintesi: i consigli per chi investe — il lint mensile propone quali promuovere a Principio | 5 |

**Il codice** (`verifyExtraction`) tiene una voce solo se la citazione è nel testo (spazi, apostrofi e virgolette
normalizzati) e ogni numero della sintesi sta nella citazione; una citazione già usata è un `doppione`. Una settimana
senza fatti, o con più di un terzo delle voci fallite, è rifiutata (`pending`), mai pubblicata magra. Il server rende
il markdown (`lib/utils/wikiMacro.ts`) con le voci scartate in fondo; il mese si ricostruisce dai `.json` delle sue
settimane, scelte per **data** del numero. **Nessun numero del portafoglio** entra in questa chiamata.

**Modello** (2026-10-05, §7.3): `deepseek/deepseek-v4.1-flash` con `reasoning: { enabled: false }` — la rotta lo dice
(`AiModelRoute.reasoning: 'off'`), perché DeepSeek ignora il tetto al ragionamento e con un tetto tronca.

Primo giro reale (n. 23, 2026-09-27, GLM 5.3 Flash): 16 fatti, 8 tesi, 3 spunti, 2 scartate (un «dal 1981» dedotto
da «da allora»), **0,002 $**. Il primo prompt, senza tetti, dava 27/24/4 con doppioni: i tetti e la regola del
doppione vengono da lì.

**Collaudo del 2026-09-28** (WORKFLOW.md § 2), sulla route vera, GLM vero e GitHub vero, su un branch usa-e-getta del
vault (`collaudo-f3`, poi cancellato), con una newsletter-esca: token che legge il vault e non scrive altrove (B);
ingest → un commit con i cinque file, doppione → 200 senza commit, modello irraggiungibile → grezzo + `pending 0/3`,
tre ritentativi → `failed` e il cron non lo tocca più, ricompilazione a mano → `ok (manuale)` col mese a due settimane
(C, 17/17); segreto sbagliato e header assente → 401, nessun commit (E, con la C come controllo positivo); il n. 23 vero
ingerito e rivisto dal proprietario in Obsidian (F). Resta fuori, per costruzione: l'Apps Script e l'HTTP reale da
Gmail, che arrivano con il deploy.

### 5.4 Lettura nelle email (F5) ✔ 2026-10-05

Recupero **deterministico per data**, mai una ricerca (`lib/utils/emailWiki.ts`, `lib/server/wiki/wikiReader.ts`):
l'email mensile riceve `wiki/macro/mesi/<mese>.md`, le trimestrali, semestrali e annuali le pagine dei mesi della
finestra, tutte `wiki/principi/_digest.md`. Il digest e le regole chiudono il **blocco di sistema**, le pagine macro
chiudono il **messaggio**, DOPO i dati del periodo (che restano la sola fonte delle cifre del portafoglio); non entrano
in `buildEmailDataSections`, quindi `dati/` del vault resta il solo blocco dati. Le pagine arrivano senza frontmatter,
titolo, preambolo ed elenco delle settimane, con i link di Obsidian ridotti a testo e i titoli scalati sotto
«## Macro di <mese>».

**Decisioni del proprietario (2026-10-05):**

| # | Decisione |
| --- | --- |
| W1 | **Token:** le email riusano `WIKI_GITHUB_TOKEN`. Un token in sola lettura accanto a quello in scrittura, nello stesso runtime, non proteggerebbe nulla. |
| W2 | **Nessuna cache né `ETag`:** un'email fa da 2 (mensile) a 13 (annuale) letture contro le 5.000/ora di GitHub, e una funzione Vercel non tiene memoria tra due esecuzioni del cron. |
| W3 | **Profondità:** pagine intere fino al trimestre; da semestrale in su, per mese e **per codice**, i 2 fatti più recenti per area, le 8 tesi più recenti e la tabella degli indici (`MACRO_DEPTH`, `reduceMacroMonthPage`). Mai un riassunto scritto da un modello. |
| W4 | **Chi:** solo l'utente `WIKI_EXPORT_UID`, lo stesso proprietario dell'export F4: il digest è personale. Le email degli altri utenti restano come prima e non leggono il vault. |
| W5 | **Le regole**, presenti solo con il blocco che governano (senza macro niente regole macro, senza digest niente regole sui Principi): i fatti sono accaduti, le tesi sono opinioni dell'autore; il macro spiega il MERCATO, mai entrate e spese; nessuna cifra del portafoglio dal macro e nessuna cifra macro presentata come del portafoglio, citata con il suo soggetto; i Principi orientano il GIUDIZIO, non i NUMERI; un'osservazione che poggia su un principio lo nomina; se i dati contraddicono un principio, lo si dice. |
| W6 | **Contratto:** la sezione 2 aggiunge «se ricevi il contesto macro, collega il mercato del periodo a uno o due fatti del periodo, citandoli» (condizionale, così il contratto resta identico per tipo di periodo). |
| W7 | **Assenza:** un mese senza pagina è nominato («Nessuna pagina macro per luglio 2026»); nessuna pagina, o il vault che non risponde, toglie blocco e regole: il prompt non promette nulla. Ogni lettura fallita vale «manca», mai un errore dell'email. |
| W8 | **Spese per ruolo** (stessa sessione): con `spendingRolesEnabled` il footer della tile «Spese per categoria» e il blocco del prompt dividono le USCITE per ruolo (Necessità · Desideri · Da classificare · Risparmi, `summarizeSpendingByRole`) al posto dei tipi; Risparmi sono le righe classificate risparmio, mai l'avanzo; una riga senza tipo va in «Da classificare». Solo sul percorso email: l'Assistente (di upstream, spento) non lo vede. Lo stesso blocco arriva in `dati/` del vault, che è il blocco dati dell'email. |

**Misura sul mirror (2026-10-05, branch usa-e-getta `collaudo-f5` del vault):**

| Email | Ingresso senza Wiki (stima) | Con la Wiki (stima) | Token veri (GLM 5.3 Flash) | Uscita · ragionamento | Costo |
| --- | --- | --- | --- | --- | --- |
| Settembre 2026 | 6.296 | 9.715 (macro 2.934, sistema 484) | **10.953** | 1.017 · 226 | 0,0012 $ |
| Q3 2026 | 6.461 | 16.753 (macro 9.808) | **19.063** | 1.427 · 98 | 0,0020 $ |
| H1 2026 (nessuna pagina) | 6.379 | 6.724 (solo Principi) | — | — | — |
| Anno 2026, 4 mesi con pagina | — | macro 4.328 ridotta · 10.892 intera | — | — | — |

Il tokenizer vero conta ~13% in più della stima a 3,5 caratteri/token. Un'annuale con 12 mesi di pagine starà intorno
a 13k token di macro ridotta (~33k intera), quindi ~22k in tutto, poco sopra il trimestrale di oggi (19k). `outputBudget` **non cambia**: il ragionamento resta a 98–226 token su tetti di 4.000–6.000.

**Collaudo** (WORKFLOW § 2): parole-esca nel digest («ornitorinco», una regola) e nella pagina di settembre
(«fenicottero», un fatto con il 3,7%) sul branch `collaudo-f5`, poi cancellato. Il digest arriva solo nel sistema, la
pagina solo nel messaggio, i ruoli al posto dei tipi (B, C, D sul percorso vero `generateEmailAiComment`); un altro
utente non legge il vault, il proprietario sì, con lo stesso vault (E). Il Q3 **nomina** la regola-esca come principio.
**Per F6:** lo stesso Q3 ha citato il fatto-esca come «Bloomberg Euro momentum su +3,7%», fondendolo con il nome di
altri fatti: cifra macro e non del portafoglio, ma con un soggetto inventato. È il controllo «ogni fatto macro citato
esiste nella pagina macro» del secondo giro (§7).

### 5.5 Le tre operazioni della Wiki (modello di Karpathy)

Riferimento: il [gist «LLM Wiki»](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) —
tre livelli (fonti immutabili, pagine compilate, uno schema che dice come lavorarci) e tre operazioni.
Lo schema è il `CLAUDE.md` del vault; qui solo il disegno, le regole operative stanno lì.

| Operazione | Chi | Cosa |
| --- | --- | --- |
| **Ingest** di TheBull | server + modello open, ogni domenica | Grezzo → settimana → mese (§5.2–5.3): una pipeline a schema rigido, senza discussione |
| **Ingest** di una fonte | sessione Claude Code | La fonte in `raw/sources/`; la sessione ne **discute** 3–5 punti col proprietario prima di scrivere, poi aggiorna `principi/`, `_digest.md`, `index.md`, `log.md`; una contraddizione con un principio va in «In tensione», non sovrascrive |
| **Query** | sessione Claude Code | `index.md` prima, poi le pagine; numeri solo da `dati/`; la risposta che merita si **archivia** in `wiki/analisi/` dopo il sì del proprietario |
| **Lint** mensile | sessione Claude Code | Aggiorna i **temi** dalle settimane del mese; elenca contraddizioni, analisi superate da un export più recente, orfane e link rotti, pagine senza `fonti`, righe `failed`; applica solo ciò che il proprietario approva |

Ogni pagina di `wiki/` porta `tipo`, `aggiornato` e `fonti` nel frontmatter: la provenienza si
traccia dal primo ingest, perché una wiki che non sa da dove viene un'affermazione non si può più
correggere.

---

## 6. Il vault interrogabile con l'abbonamento (F4, F7)

Il proprietario apre il vault in Claude Code — in locale, o da telefono con Claude Code sul web
(il vault è un repo GitHub) — e fa le sue domande lì. Nessuna chiamata API, nessun codice di chat da
mantenere nell'app.

### 6.1 Export dei dati

`dati/<AAAA-MM>.md` e `dati/portafoglio.md`, scritti dal server in un commit con una riga in `log.md`. Nessun LLM:
sono numeri dell'app, non riassunti.

- **Da dove (decisione del 2026-09-30):** dal **blocco dati dell'email mensile** (`buildEmailDataSections`, estratto
  da `buildEmailAiPrompt` senza cambiare il prompt), non dai builder dell'Assistente nominati prima: dopo F1b quelli
  leggono ancora l'allocazione sul patrimonio intero e il mercato come residuo. Così vault, email e modello
  dell'email leggono **una** versione di ogni mese. Resa in markdown da `lib/utils/vaultMarkdown.ts`.
- **Quando:** l'ultimo giorno del mese, fase 10 del cron giornaliero (solo con `WIKI_EXPORT_UID`: il vault è di una
  persona); e **a comando**, `npm run vault:export -- [AAAA-MM [AAAA-MM]]` (`--dry-run` stampa senza scrivere). Niente
  pulsante in Impostazioni.
- **Storico:** dal 2026-01 (scelta del proprietario). Primo export il 2026-09-30: nove mesi e il portafoglio,
  commit `4a58d60` del vault.
- **`portafoglio.md`:** l'ultimo snapshot per strumento (classe come la chip di Strumenti, i compositi con ogni
  gamba; gli strumenti a zero contati, non elencati) più composizione e allocazione dell'email per quel mese.
- La data di generazione nel frontmatter e nel testo; `parziale: true` per un mese ancora in corso (l'ultimo giorno
  del mese non lo è, come per l'email).

### 6.2 `CLAUDE.md` del vault

Scritto il 2026-09-28 insieme allo scheletro (F3): schema delle pagine, chi scrive cosa, le tre
operazioni (§5.5), il formato di `index.md` e `log.md`. F4 lo rilegge quando arrivano `dati/` e i primi
Principi. Le regole di `ASSISTANT_SYSTEM_CORE` adattate: i numeri si prendono **solo** da `dati/` e si citano
con il file da cui vengono; il contesto macro solo da `wiki/macro/`; ogni giudizio che poggia su un
principio cita la pagina; quando i dati smentiscono un principio, lo si dice; un dato assente si dice
assente, non si stima. Più il flusso di manutenzione dei Principi: una fonte in `raw/sources/` → la
sessione aggiorna le pagine pertinenti, segnala le contraddizioni, rigenera `_digest.md`, scrive in
`log.md`; il proprietario rivede il diff prima del commit.

### 6.3 MCP in sola lettura (facoltativa)

Solo se l'export si rivela troppo vecchio nell'uso: un server MCP con strumenti in sola lettura
(`get_month`, `get_portfolio`, `get_history`) sopra gli stessi builder, per Claude Code in locale.
Da telefono resta l'export.

### 6.4 Privacy

I dati del portafoglio finiscono in un repo GitHub privato e nelle conversazioni con Claude.
Verificare nelle impostazioni di claude.ai l'opzione sull'uso delle chat per l'addestramento.

---

## 7. Eval (F2 e F6)

Due giri con lo stesso script (`scripts/aiEval.mts`), gli stessi controlli e lo stesso giudizio.
Il primo sceglie un modello **provvisorio** per partire; il secondo misura il compito **vero** e
sceglie quello definitivo. Il cambio di modello tra i due non costa nulla di irreversibile: i grezzi
in `raw/` non si toccano mai, e le pagine macro si ricompilano.

| | Eval rapido (F2) | Eval completo (F6) |
| --- | --- | --- |
| Compiti | commento dell'email, come oggi | commento dell'email **con** blocco macro e digest dei Principi; **compilazione di TheBull** |
| Ingressi | 8–12 bundle dal mirror | gli stessi mesi, ora con la loro pagina macro; 6–8 newsletter reali |
| Candidati | tutti quelli del D8 + i riferimenti | i migliori del primo giro + i riferimenti |
| Esito | il modello provvisorio | il modello definitivo, per ciascuno dei due compiti |

- **Ingressi:** bundle di email reali dal mirror (un mese buono, uno cattivo, uno con budget
  sforati, un trimestre, un anno), congelati in JSON **fuori da git**; le newsletter sono i grezzi
  del vault.
- **Candidati:** quelli del D8 (in F2: GLM 5.3 Flash, MiniMax-M3, MiMo-V2.6-Pro; controlli MiMo-V2.6-Flash e
  DeepSeek V4.1 Flash); riferimenti Sonnet 5 `medium` e Haiku 4.5. Prima di ogni giro si rilegge la classifica
  (§7.1): un candidato deprecato o superato si sostituisce, con l'OK del proprietario.
- **Controlli automatici, email:** ogni cifra in euro o percentuale nel testo esiste nel bundle
  (tolleranza di arrotondamento); limite di parole e sezioni del contratto rispettati; nessuna
  promessa di blocchi assenti; solo italiano. **Nel secondo giro, in più:** ogni fatto macro citato
  esiste nella pagina macro fornita; ogni principio citato esiste nel digest; nessun numero del
  portafoglio preso dalla pagina macro o viceversa.
- **Controlli automatici, TheBull:** ogni voce estratta supera zod e la sua frase di citazione
  compare davvero nella newsletter; nessuna cifra assente dal testo.
- **Giudizio del proprietario, alla cieca:** versioni in ordine casuale, voto 1–5 su utilità e tono
  (nel secondo giro anche: «il collegamento tra macro, principi e portafoglio è sensato?»). Vince il
  modello open più economico che non perde nei controlli automatici e sta entro mezzo punto dal
  migliore dei riferimenti. «Non perde» = non più esecuzioni fallite del riferimento **più pulito** (quello
  con meno fallite, che può non essere il più votato: lettura severa, fissata alla chiusura di F2); un'esecuzione
  fallisce se tronca, va in errore o ha un controllo rosso (`lib/utils/aiEvalScore.ts`). **Lezione di F2 per F6:**
  a questi prezzi (millesimi di dollaro per email) «il più economico» decide poco; il voto del proprietario
  pesa di più, perché solo lui sa se un'ipotesi sulla sua vita è giusta (§7.2).
- **Costo:** ogni giro pochi centesimi; si chiede l'OK prima di lanciarlo.

### 7.1 Preselezione su Artificial Analysis

[artificialanalysis.ai](https://artificialanalysis.ai/leaderboards/models) confronta i modelli su
un indice di intelligenza (v4.3), prezzo per milione di token, velocità e **non-allucinazione**
(quanto spesso il modello, quando non sa, lo ammette invece di inventare). La pagina è resa in
JavaScript: i dati si leggono dal JSON incorporato (`price1mInputTokens`, `price1mOutputTokens`,
`intelligenceIndex`, `omniscienceNonHallucination`, `isOpenWeights`, `deprecated`), non dal testo.

**Criteri minimi per entrare nell'eval:** open weights; non deprecato; indice ≥ quello di Sonnet 5
`medium`; non-allucinazione ≥ 0,5 (sotto, solo come controllo dichiarato); servito su OpenRouter da
provider che non trattengono né addestrano sui dati. Tra quelli che passano, i più economici per
email.

**Limite:** l'indice misura ragionamento, codice e compiti da agente, **non la prosa in italiano**.
La classifica restringe il campo; decide l'eval.

Lettura del 2026-09-28 (costo di un'email = 5.200 token in + 2.500 out, stima):

| Modello | Open | Indice | $/M in · out | 1 email | Non-alluc. |
| --- | --- | --- | --- | --- | --- |
| GLM 5.3 Flash | sì | 41,8 | 0,15 · 0,50 | ~0,002 $ | 0,72 |
| Qwen3.8-Flash-Next | sì | 39,8 | 0,15 · 0,47 | ~0,002 $ | 0,55 |
| MiMo-V2.6-Flash | sì | 37,9 | 0,14 · 0,28 | ~0,0014 $ | 0,46 |
| MiMo-V2.6-Pro | sì | 46,3 | 0,43 · 0,87 | ~0,004 $ | 0,59 |
| DeepSeek V4.1 Flash (reasoning) | sì | 39,5 | 0,30 · 1,20 | ~0,005 $ | 0,04 |
| Sonnet 5 `medium` (rif.) | no | 28,1 | 2 · 10 | ~0,035 $ | 0,30 |
| Haiku 4.5 (rif.) | no | 16,9 | 1 · 5 | ~0,018 $ | 0,73 |

Qwen3-235B, candidato della prima stesura, risulta deprecato.

**Riletta prima del giro di F2 (2026-09-28)**, dal JSON della classifica e dagli endpoint ZDR di OpenRouter
(`/api/v1/endpoints/zdr`): **Qwen3.8-Flash-Next esce** (nessun endpoint ZDR, quindi il vincolo di privacy del §4.3 lo
esclude); entrano **MiniMax-M3** e **MiMo-V2.6-Pro** come candidati; MiMo-V2.6-Flash (non-allucinazione 0,46) e
DeepSeek V4.1 Flash (0,04) restano **controlli dichiarati**, misurati e mai scelti. Dopo i voti il proprietario ha
chiesto di provare **GPT-5.6 Luna** e **GPT-6 Luna**: chiusi (non open weights, quindi fuori dai criteri minimi), ma
serviti con ZDR da Azure, anche nella regione UE; sono entrati come eccezione dichiarata, sui soli periodici.

### 7.2 Risultati di F2 (2026-09-28)

**Giro:** 10 bundle congelati dal mirror (7 periodici: un mese buono, uno cattivo, uno con budget sforati, due mesi
recenti, un trimestre, un anno; 3 settimanali), 7 modelli + i due Luna sui soli periodici. **Spesa: 0,545 $** in tutto,
ritentativi compresi. Il proprietario ha votato alla cieca i **soli periodici**: l'email settimanale non la userà.

| Modello | Ruolo | Esiti ok | Fallite | Cifre · parole · forma | Cifre non nel prompt | Token in · out · ragion. (media) | Costo / email | Voto del proprietario (U · T) | Voto di Claude (U · T) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **GLM 5.3 Flash** | candidato | 10/10 | 2 | 1 · 1 · 0 | 1 | 4.584 · 748 · 64 | **0,0010 $** | 3,4 · 3,7 | 4,6 · 4,6 |
| MiniMax-M3 | candidato | 8/10 (2 troncate) | 7 | 5 · 0 · 0 | 9 | 4.722 · 3.286 · 2.478 | 0,0052 $ | 3,6 · 3,9 | 4,6 · 5,0 |
| MiMo-V2.6-Pro | candidato | 6/10 | 6 | 2 · 1 · 0 | 4 | 5.171 · 1.272 · 361 | 0,0031 $ | 4,3 · 3,8 | 4,5 · 4,5 |
| MiMo-V2.6-Flash | controllo | 8/10 | 5 | 2 · 0 · 1 | 4 | 4.863 · 857 · 60 | 0,0009 $ | 3,0 · 2,8 | 3,8 · 4,0 |
| DeepSeek V4.1 Flash | controllo | 10/10 | 2 | 2 · 0 · 0 | 4 | 4.682 · 1.086 · 360 | 0,0025 $ | 3,9 · 3,9 | 4,6 · 4,9 |
| GPT-5.6 Luna | candidato (eccezione) | 7/7 | 0 | 0 · 0 · 0 | 0 | 6.051 · 1.241 · 276 | 0,0026 $ | letto, non votato | 4,9 · 4,7 |
| GPT-6 Luna | candidato (eccezione) | 7/7 | 1 | 0 · 0 · 1 | 0 | 6.051 · 1.374 · 567 | 0,0013 $ | letto, non votato | 4,4 · 5,0 |
| Sonnet 5 `medium` | riferimento | 10/10 | 3 | 1 · 2 · 0 | 1 | 6.843 · 1.087 · 0 | 0,0246 $ | 3,4 · 3,6 | 4,6 · 4,9 |
| Haiku 4.5 | riferimento | 10/10 | 7 | 7 · 1 · 2 | 19 | 5.157 · 2.142 · 1.318 | 0,0159 $ | 3,9 · 3,9 | 3,4 · 3,4 |

Voti medi 1–5 sui 7 periodici; «Fallite» su tutte le esecuzioni del modello (un troncamento, un errore o un controllo
rosso); il costo è quello fatturato, medio per email. Nessuna colonna «promesse» o «italiano»: nessun modello ne ha
fallito uno.

**Regola del §7 sui voti del proprietario:** il miglior riferimento è Haiku (3,86), la soglia di voto 3,36, quella
sulle fallite 3 (Sonnet, il più pulito). MiniMax-M3 e MiMo-V2.6-Pro perdono nei controlli; GLM passa ed è il più
economico. **Sui voti di Claude** il miglior riferimento è Sonnet, e vince ancora GLM. **Scelta del proprietario:
GLM 5.3 Flash** per `EMAIL_PERIODIC` ed `EMAIL_WEEKLY_BUDGET`, provvisorio fino a F6.

**Osservazioni:**

- **Tutti calcolano cifre proprie, riferimenti compresi**: percentuali e somme che il prompt non contiene. Molte sono
  giuste (una quota calcolata correttamente), alcune no: DeepSeek sbaglia due percentuali nello stesso trimestrale,
  Haiku ne produce 19 non verificabili. Il controllo le segnala tutte; la differenza tra giusta e sbagliata la fa la
  lettura.
- **Narratore contro analista.** GLM, DeepSeek e MiniMax *interpretano*: fanno ipotesi sulle cause e le dichiarano
  («è una mia lettura», «verifica tu se…»). I due Luna *riconciliano* i blocchi senza errori ma senza dire nulla che il
  prompt non dica già. Il proprietario, rileggendo tutto in chiaro, ha preferito gli insight: un'ipotesi dichiarata e
  verificabile vale più di una parafrasi corretta.
- **Il giudice sbaglia dove il proprietario sa.** La griglia di Claude (`rubric.md`, fuori git) aveva fissato come
  «lettura giusta» di un trimestre un buco di registrazione; era invece un cambio di vita reale, che GLM aveva colto
  come ipotesi. Il voto automatico è affidabile sugli errori di aritmetica e di logica, non sul contesto personale.
  Per F6, dove la Wiki porta proprio quel contesto, conta il voto del proprietario.
- **I due voti divergono di circa un punto** (Claude più generoso), tranne su Haiku, che il proprietario premia più di
  Claude; sui periodi lunghi (anno, trimestre) lo scarto cresce.
- **Affidabilità del servizio:** MiMo-V2.6-Pro ha un solo host ZDR (metà delle richieste in 429 o timeout);
  MiMo-V2.6-Flash due timeout a 120 s; MiniMax-M3 tronca le settimanali sfondando il tetto di ragionamento.
- **Dati e strumenti fuori da git** (`scratchpad/ai-eval/`): bundle, esecuzioni, chiave, voti, note del giudice e
  `review.html`, la pagina che mostra ogni email con costo, controlli e i due voti; restano per F6.

### 7.3 La sonda di TheBull e la scelta del 2026-10-05

**Perché:** il 2026-09-28 GLM 5.3 Flash ha fallito 9 compilazioni su 13 (timeout a 120 s, risposte scartate, una
settimana rifiutata dalla verifica delle citazioni). **Sonda** (script usa-e-getta fuori dal repo, 2026-09-30 → 10-04):
le stesse tre newsletter compilate a secco tre volte al giorno, 300 s di timeout e nessun ritentativo; 13 timeout del
01–02/10 esclusi, dovuti allo sleep del Mac. Poi un **giro di qualità** (2026-10-05, 0,06 $) sulle 10 settimane da
recuperare, con i testi salvati e letti affiancati.

| Variante | Sonda ok | Qualità ok | Latenza mediana · peggiore | Costo / settimana | Cifre tenute nella sintesi |
| --- | --- | --- | --- | --- | --- |
| **DeepSeek V4.1 Flash, ragionamento spento** | **40/40** | **10/10** | 11–13 s · 44 s | 0,0020–0,0027 $ | **100%** |
| GPT-6 Luna (Azure) | 38/40 (2 vuote) | 10/10 | 20 s · 166 s | 0,0024 $ | 85% |
| GLM 5.3 Flash senza fp4 | 34/41 | 6/10 | 19–34 s · 220 s | 0,0016 $ | 100% |
| GLM 5.3 Flash (rotta di allora) | 33/41 | — | 32 s · 259 s | 0,0018 $ | — |

- **Nessuna dipendenza dall'orario** dopo la correzione dello sleep: i fallimenti di GLM vengono dai provider (JSON
  rotto da Phala e NextBit, area fuori elenco, 429), non dall'ora.
- **DeepSeek copia, Luna parafrasa, GLM racconta.** Luna toglie le cifre dal 15% delle sintesi dei fatti («crescita in
  rallentamento» al posto di «4%, in discesa dal 6,2%»); GLM è il più ricco di nomi e collegamenti ma a volte aggiunge
  un giudizio o scrive frasi confuse; DeepSeek tiene una voce per frase e tutte le cifre.
- **La non-allucinazione 0,04 di DeepSeek** (§7.1) qui pesa poco: ogni voce cita una frase che il codice ritrova, e una
  cifra della sintesi assente dalla citazione fa scartare la voce. Sulle email, senza citazioni, pesa di più.
- **Scelta del proprietario:** `THEBULL_COMPILE` su DeepSeek V4.1 Flash con il ragionamento spento; le email restano
  su GLM 5.3 Flash, solo su host fp8/bf16/fp16 (`AiModelRoute.quantizations`: sulla sonda gli host fp4 rispondevano
  con poche voci e citazioni rotte). Entrambe provvisorie fino a F6, dove DeepSeek entra tra i candidati delle email
  (nei voti alla cieca di F2: 3,9 · 3,9 contro 3,4 · 3,7 di GLM), con il ragionamento acceso e spento.


### 7.4 Risultati di F6 (2026-10-05 → 10-06)

**Giro:** 4 bundle con la Wiki (luglio, agosto, settembre, Q3 2026), cinque open per 2 tentativi e i riferimenti Sonnet
5.5 e Haiku 4.5 scritti con l'abbonamento; il proprietario ha votato alla cieca un'email per modello e periodo su
utilità, tono e collegamento (i voti in `scratchpad/ai-eval/f6/votes.json`). Poi la vista in chiaro, email per email,
con la griglia di Claude (`f6-in-chiaro.html`, fuori da git): accuratezza sui dati, contratto, insight, collegamento;
un **errore grave** è un'affermazione sbagliata sui dati che orienterebbe male una decisione.

| Modello | Voto del proprietario (U · T · C) | Lettura di Claude (A · Co · I · Col) | Errori gravi (4 votate / 8) | Costo / email |
| --- | --- | --- | --- | --- |
| GLM-5.3 | 3,50 · 4,25 · 4,25 = **4,00** | 2,00 · 4,00 · 3,75 · 3,75 = 3,38 | 9 / — | 0,0120 $ |
| GLM 5.3 Flash | 3,25 · 3,75 · 4,50 = 3,83 | 3,00 · 4,50 · 4,00 · 3,75 = 3,81 | 3 / 6 | 0,0022 $ |
| Sonnet 5.5 (rif.) | 3,75 · 3,25 · 3,75 = 3,58 | 4,75 · 4,75 · 3,75 · 4,50 = **4,44** | 0 / — | — |
| DeepSeek spento | 3,50 · 3,50 · 3,75 = 3,58 | 3,50 · 4,50 · 3,50 · 3,75 = 3,81 | 1 / 3 | 0,0010 $ |
| DeepSeek acceso | 3,50 · 3,25 · 3,75 = 3,50 | 3,50 · 4,50 · 3,75 · 4,00 = 4,00 | **0 / 2** | 0,0013 $ |
| GPT-6 Luna | 3,00 · 3,25 · 3,00 = 3,08 | 4,75 · 3,75 · 2,00 · 2,50 = 3,25 | 0 / — | 0,0010 $ |
| Haiku 4.5 (rif.) | 2,50 · 3,50 · 2,75 = 2,92 | 1,25 · 3,00 · 2,00 · 2,50 = 2,19 | 15 / — | — |

- **La regola del § 7 avrebbe scelto GPT-6 Luna** (il più economico entro mezzo punto da Sonnet): un modello chiuso,
  penultimo nei voti. Non legge il collegamento, l'asse nuovo di F6. Va riscritta con l'esito di F6b.
- **Due voti, due cose.** Il proprietario premia il racconto e il collegamento; la griglia di Claude la correttezza sui
  dati, dove i due GLM sono i più fragili (flussi «andati alle obbligazioni», «luglio +24 €», la Hall of Fame letta come
  una serie, «gli acquisti azzerano il risparmio»). Gli errori che contano non sono quelli che il controllo automatico
  segna: le cifre «rosse» sono quasi tutte somme giuste.
- **Quasi ogni errore grave nasce da un buco del blocco dati**, non dal modello: il ticker senza la classe, nessun totale
  degli acquisti, la Hall of Fame senza la fascia, il confronto senza il valore di partenza, le categorie scese a zero
  invisibili (nessun modello ha visto che a settembre i Viaggi passavano da 968 € a zero), il 50/30/20 sulle uscite.
- **E la forma schematica la chiedeva il prompt**: sei sezioni fisse, «elenchi puntati per le liste», «1-2 osservazioni
  pratiche», «probabilmente» a ogni ipotesi. Le email votate meglio (GLM Flash su agosto e Q3, DeepSeek acceso sul Q3)
  sono quelle che più se ne allontanano.
- **TheBull resta su DeepSeek V4.1 Flash spento** (8/8 settimane ok nel giro di F6, oltre alla sonda del § 7.3).

### 7.5 F6b: dati blindati e contratto narrativo (decisioni del 2026-10-06)

Il proprietario: «i dati devono essere veri, ma le email non le voglio asciutte, asettiche e prudenti, né schematiche:
coese, che ti prendono mentre le leggi, che fanno capire i collegamenti tra i numeri e quello che succede nel mondo
reale, e che uniscono i dati tirando fuori insight che un numero da solo non mostra».

| # | Decisione |
| --- | --- |
| N1 | **Dati blindati**, per tutti i modelli: la classe (e il fattore, le gambe, la leva) su ogni operazione; i totali di acquisti e vendite; la Hall of Fame con la sua fascia; ogni confronto con il valore di partenza; una categoria a zero nel periodo prima è «nessuna spesa», non N/D; le categorie scese a zero elencate. |
| N2 | **50/30/20 sulle entrate**, come il Flusso: Risparmi = righe di risparmio + avanzo; con le uscite oltre le entrate la base sono le uscite e il deficit è nominato. Nel prompt e nel piè della tile (la card del proprietario del 2026-10-06). |
| N3 | **L'email ha un suo prompt di sistema** (`EMAIL_SYSTEM_CORE`): ruolo di lettera, vocabolario condiviso, regole di verità (nessuna somma, la classe dal blocco, gli acquisti non sono spese, la Hall of Fame è una classifica), ipotesi dichiarate una volta e poi argomentate, calibrazione su un mese inventato. Non eredita più `ASSISTANT_SYSTEM_CORE`. |
| N4 | **Contratto narrativo**: prosa, 3-5 titoletti evocativi scritti dal modello, niente elenchi; sette punti in ordine, la persona prima del mondo — la tesi, la vita dietro i numeri, il ponte del risparmio, dove sono andati i soldi contro i principi, il mondo dentro il portafoglio, il filo, le mosse solo se servono. |
| N5 | **Parole:** 450 (mensile) · 650 (trimestrale, semestrale) · 800 (annuale). |
| N6 | **Rosa di F6b:** GLM 5.3 Flash, GLM-5.3, DeepSeek V4.1 Flash acceso e spento, GPT-6 Luna; nessun riferimento in abbonamento. |
| N7 | **Voto:** utilità, «ti prende?» e collegamenti; la verità dei dati la legge Claude, email per email. |

### 7.6 Risultati di F6b e scelta definitiva (2026-10-06)

**Giro:** i 4 bundle ricongelati sul mirror con i dati blindati e il contratto narrativo, cinque open per 2 tentativi,
**0,17 $**, 40 risposte su 40. Su richiesta del proprietario, nessun voto alla cieca: una pagina in chiaro su **luglio,
settembre e il Q3** (`scratchpad/ai-eval/f6b/f6b-in-chiaro.html`, fuori da git) con costo, controlli, errori, testo e
lettura di Claude; il secondo tentativo letto per gli errori.

| Modello | Lettura di Claude (A · P · C · U) | Errori gravi (6 email) | $ / email | Latenza media · max | Token usati (peggiore) |
| --- | --- | --- | --- | --- | --- |
| **DeepSeek V4.1 Flash** | 4,67 · 4,33 · 4,67 · 4,33 = **4,50** | **1** | 0,0029 $ | 35 s · 81 s | 95% |
| GLM 5.3 Flash | 3,00 · 4,00 · 4,00 · 3,33 = 3,58 | 3 | 0,0025 $ | 41 s · 62 s | 67% |
| GLM-5.3 | 2,67 · 4,33 · 4,00 · 3,33 = 3,58 | 9 | 0,0116 $ | 31 s · 79 s | 74% |
| GPT-6 Luna | 5,00 · 3,00 · 3,00 · 3,00 = 3,50 | 0 | 0,0019 $ | 18 s · 23 s | 47% |
| DeepSeek V4.1 Flash spento | 2,33 · 3,33 · 2,67 · 3,00 = 2,83 | 8 | 0,0026 $ | 14 s · 26 s | 24% |

A = accuratezza sui dati, P = «ti prende», C = collegamenti, U = utilità.

- **I dati blindati funzionano**: GLM 5.3 Flash scende da 6 errori gravi su 8 email (F6) a 3 su 6; nessun modello
  sbaglia più la classe di uno strumento, i totali degli acquisti o la Hall of Fame; i Viaggi a zero di settembre li
  nomina ogni modello almeno in un tentativo (in F6 nessuno).
- **Il contratto narrativo funziona** per tutti tranne DeepSeek spento, che ignora lunghezza e titoletti (fino a 852
  parole su 650). Tutti tranne DeepSeek acceso sforano le 450 parole della mensile.
- **Il ragionamento conta**: lo stesso DeepSeek fa 1 errore grave ragionando e 8 senza. Il tetto di ragionamento però
  non lo governa: lo ignora (6.784 token sul Q3 con un tetto di 6.000, 95% di `max_tokens`).

**Scelta del proprietario:** `EMAIL_PERIODIC` → **DeepSeek V4.1 Flash con il ragionamento acceso**, definitivo; la
mensile torna a **500 parole**; il budget si alza «tanto è economico» — il limite vero è il tempo, non il costo:
`max_tokens` 7.800 · 12.340 · 12.340 · 13.880, un timeout di 150 s per il commento (`EMAIL_AI_TIMEOUT_MS`, a ~100 token/s)
e le quattro email periodiche in parallelo nel cron. `EMAIL_WEEKLY_BUDGET` resta su GLM 5.3 Flash (il proprietario non la
usa; il suo budget da 1.500 token non reggerebbe il ragionamento di DeepSeek). `THEBULL_COMPILE` resta definitivo su
DeepSeek spento (§ 7.3, F6): il modello non cambia, nessuna pagina macro da ricompilare.

**TheBull con il ragionamento acceso, la prova del dubbio** (2026-10-06, su richiesta del proprietario): la sonda l'aveva
scartato per il troncamento sotto 8.000 token, prima di sapere che DeepSeek ignora il tetto di ragionamento. Le stesse 8
settimane a secco (`npm run ai:eval -- thebull --reasoning on --max-tokens 24000`), accanto allo spento:

| | Spento (8.000 token) | Acceso (24.000 token) |
| --- | --- | --- |
| Riuscite | **8/8** | 5/8 (3 timeout a 120 s, il limite dell'endpoint) |
| Latenza media · massima | 17 s · 29 s | 92 s · 120 s |
| Ragionamento | 0 | 5.034–17.695 token |
| Costo delle 8 settimane | 0,011 $ | 0,058 $ |
| Cifre tenute nella sintesi | 93% (106/114) | 100% (70/70) |

Lette affiancate, le voci dell'acceso sono più ricche (le tesi attribuite ai loro autori, qualche data in più) ma mettono
giudizi tra i fatti («la mossa è stata inutile», «il mercato perde la pazienza»), proprio la distinzione su cui poggiano
le regole macro delle email. **TheBull resta su DeepSeek spento.**

**Come si è deciso, al posto della regola del § 7** (che avrebbe scelto GPT-6 Luna, un modello chiuso e penultimo nei
voti di F6): la lettura di Claude, email per email, separa gli errori veri sui dati dalle cifre «rosse» del controllo
automatico (quasi tutte somme giuste); il proprietario sceglie vedendo tutto. In un prossimo giro: prima il cancello
degli errori gravi, poi il voto del proprietario; il costo solo a parità.

### 7.7 La gara sintetica: Sol, DeepSeek, GLM Flash (2026-10-07)

**Perché:** il proprietario ha provato [Optima](https://artificialanalysis.ai/optima) di Artificial Analysis. Il suo agente ha
riscritto il compito in 47 prompt mensili da circa 500 token, contro i 4.000–10.000 di quello vero. I giudici LLM a
coppie hanno messo prima **GPT-6.1 Sol (high)** (73% di vittorie), poi GLM 5.3 Flash (66%), DeepSeek V4.1 Flash (38%) e
GPT-6 Luna (22%). Su prompt così corti nessuno sbaglia le cifre, quindi la prova misura lo stile e non la verità dei dati
che ha deciso F6b. Il proprietario ha chiesto una gara a tre sul compito vero, con il nostro script e i crediti OpenRouter.

**Ingressi:** 20 bundle **sintetici** (`npm run ai:eval:synth -- --dir <d>`, `scripts/aiEvalSynth.mts` e
`scripts/aiEvalSynthScenarios.ts`): la richiesta esatta di produzione, con `buildEmailAiPrompt`, il contratto F6b e il
budget di uscita, costruita su una persona e su dati inventati. Le pagine macro e il digest dei Principi sono inventati e
resi con il renderer del vault. Sono 8 mensili, 5 trimestrali, 3 semestrali e 4 annuali, e ogni scenario porta 3-4
trappole scritte (`traps`, mai mandate ai modelli). Nessun dato reale: i bundle possono uscire dalla macchina.

**Rosa:** `--round gara`: GPT-6.1 Sol con effort high (chiuso, eccezione dichiarata come Luna in F2; `estimate` verifica
che abbia un endpoint ZDR), DeepSeek V4.1 Flash con il ragionamento (in produzione) e GLM 5.3 Flash sugli host
fp8/bf16/fp16.

**Come si decide:** come in F6b (§ 7.6), prima il cancello degli errori gravi, letti da Claude email per email a partire
dalle trappole, poi il voto del proprietario; il costo conta solo a parità.

---

## 8. File

### Già nel repo

| File | Cosa |
| --- | --- |
| `scripts/estimateAiTokens.mts` | F0: token di input per superficie dai builder reali, sugli emulatori. |
| `package.json` | `npm run ai:estimate`; F2: `ai:eval:freeze` (sugli emulatori) e `ai:eval`. |
| `doc/ai-open-models-wiki.md` | Questa specifica. |
| `scripts/aiEval.mts` | F2: `freeze` · `estimate` · `run` · `blind` · `score`, tutto in una cartella fuori da git. |
| `scripts/aiEvalSynth.mts`, `scripts/aiEvalSynthScenarios.ts` | § 7.7: i 20 bundle sintetici (`npm run ai:eval:synth`). |
| `lib/utils/aiEvalChecks.ts` | F2: i controlli automatici (cifre €/%/p.p. contro il prompt, parole, forma, promesse, italiano). |
| `lib/utils/aiEvalScore.ts` | F2: aggregati per modello e regola del §7. |
| `lib/server/weeklyBudgetEmailService.ts` | F2: `buildWeeklyBudgetPrompt` estratto, così l'eval congela il prompt vero. |

### Previsti

| Fase | File |
| --- | --- |
| F1 | `lib/server/llm/{index,openrouter,anthropic}.ts`, `lib/constants/aiModels.ts`, le due email, il pulsante di Rendimenti |
| F6 | `scripts/aiEval.mts` con i controlli del secondo giro (fatti macro, principi) |
| F3 ✔ | `app/api/wiki/ingest/route.ts`, `lib/server/wiki/{githubVault,thebullCompiler}.ts`, `lib/utils/{thebullParse,wikiMacro}.ts`, la fase 9 del cron, `scripts/wikiCompile.mts` (`npm run wiki:compile`), l'Apps Script `scripts/wiki/thebullIngest.gs`; test su una newsletter sintetica (`__tests__/thebullFixture.ts`); guida in `doc/guide/email-pdf.md` |
| F4 ✔ | `lib/server/wiki/vaultExport.ts`, `lib/utils/vaultMarkdown.ts`, `buildEmailDataSections`/`buildEmailPortfolioSections` in `monthlyEmailService.ts`, la fase 10 del cron, `scripts/vaultExport.mts` (`npm run vault:export`), `CLAUDE.md` del vault |
| F5 ✔ | `lib/utils/emailWiki.ts`, `lib/server/wiki/wikiReader.ts`, `buildEmailAiPrompt` e `generateEmailAiComment` in `monthlyEmailService.ts`, il contratto e `formatBundleForPrompt({ spendingRoles })` in `prompts.ts`, `summarizeSpendingByRole` in `spendingRoles.ts`; test `__tests__/{emailWiki,wikiReader}.test.ts` (pagine rese da `renderMonthPage`, `__tests__/emailWikiFixture.ts`). L'email budget settimanale resta senza Wiki: il proprietario non la usa (F2). |
| Ogni fase | `doc/guide/email-pdf.md`, `CLAUDE.md` (Current Status, Data & Integrations), `SETUP.md` (`OPENROUTER_API_KEY`, `WIKI_INGEST_SECRET`, `WIKI_GITHUB_TOKEN`, `WIKI_GITHUB_REPO`) |

---

## 9. Rischi

- **Italiano dei modelli open:** il rischio principale per le email; l'eval lo misura.
- **Newsletter che cambia formato:** la compilazione con citazione per ogni voce fallisce in modo
  visibile (zod) invece di inventare.
- **Export vecchio:** la data in testa ai file lo rende evidente; se pesa, F7.
- **Token GitHub nel runtime:** fine-grained, un solo repo, scadenza impostata.
- **Principi che diventano dogma:** i guardrail del §5.4 e del §6.2 obbligano a dire quando i dati li
  smentiscono.
- **Limiti dell'abbonamento:** le domande sul vault consumano la quota dell'abbonamento, non soldi;
  un vault piccolo e un `index.md` ben tenuto la risparmiano.
