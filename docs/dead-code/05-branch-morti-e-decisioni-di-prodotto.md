# Spec 05 — Branch morti in file vivi e decisioni di prodotto

**Rischio: alto (relativo)** — è l'unica spec che tocca comportamento potenziale:
codice morto DENTRO componenti e route vive, più due decisioni dove "morto" e
"mai cablato" si confondono. Ogni item ha una raccomandazione esplicita; le
alternative restano documentate per la scelta dell'utente.

Leggi prima `docs/dead-code/README.md`. Nessuna dipendenza dalle altre spec.

## A. `AssetDialog` — effetto "intelligent defaults" interamente morto

`components/assets/AssetDialog.tsx:607-628`: l'`useEffect` che deriva i default
di `isLiquid`/`autoUpdatePrice` dal tipo di asset è morto al 100%. Le sue uniche
azioni sono dietro `if (watchIsLiquid === undefined)` (621) e
`if (watchAutoUpdatePrice === undefined)` (624), ma `defaultValues` setta
entrambi a `true` (532-533) e il reset del ramo create li risetta a `true`
(824-825): i guard non sono MAI soddisfatti. AGENTS.md:865-868 documenta la metà
`autoUpdatePrice` ("do not build new behavior on it without fixing it first").

Fatti chiave rilevati dall'audit:
- La metà `autoUpdatePrice` è **mitigata a valle**: `buildAssetFormDataFromValues`
  clampa a `false` quando `hasMarketPrice()` è falso (righe 269-271).
  **Il clamp NON va rimosso in nessuno scenario.**
- La metà `isLiquid` **NON è mitigata da nessuna parte** (riga 265 passa
  `data.isLiquid` com'è): un nuovo asset realestate/Private Equity/pensionFund
  viene persistito `isLiquid: true` a meno che l'utente non giri a mano lo switch
  (sempre visibile, righe 1761-1765); `calculateLiquidNetWorth`
  (`lib/services/assetService.ts:646-653`) onora il `true` esplicito.

**Raccomandazione: Opzione A (behavior-preserving)** — cancella l'intero effetto
607-628 (è irraggiungibile: zero cambiamenti di comportamento) e aggiorna
AGENTS.md:865-868 sostituendo la voce con una nota che l'effetto è stato rimosso
e che il clamp a 269-271 resta l'unica difesa.

**Opzione B (fix del comportamento inteso — è una FEATURE, non dead code):**
sostituisci i guard-undefined con il pattern touched-flag già usato per
`allocationRoleTouched` (righe 636 e 1783), così la selezione del tipo ri-deriva
entrambi i default finché l'utente non tocca gli switch. ⚠️ Cambia cosa viene
persistito per i nuovi asset realestate/PE/pensionFund (`isLiquid: false` di
default) — va scelta consapevolmente, testata su `assetDialogHelpers`, e
annunciata in CLAUDE.md. Se si sceglie B, farla in un branch separato dalla
rimozione di dead code.

## B. Micro-rimozioni certe (nessuna decisione, solo pulizia)

| File | Cosa | Evidenza |
|------|------|----------|
| `components/assets/AssetDialog.tsx:504` | `const [loadingTargets, setLoadingTargets] = useState(false)` scritto e mai letto (setter chiamati a 686/692, valore mai consumato — ogni set è un re-render inutile di un form enorme) | eslint no-unused-vars 504:10 |
| `components/history/CustomChartDot.tsx:54,57` | `baseRadius` e `iconSize` calcolati e mai usati (il render ha solo il ramo `hasNote`; l'else è `null` a 108, l'icona ha dimensioni hardcoded nel path a 101). Trimma anche le righe 46/48 del commento "Responsive Sizing Ratios" che li descrivono | eslint no-unused-vars 54:9, 57:9 |
| `components/performance/HeroMetricBlock.tsx:3` | `import { useState }` mai usato (leftover pre-Popover) | eslint no-unused-vars 3:10 |

## C. `POST /api/ai/assistant/threads` — metodo API morto (unità atomica)

Il POST (`app/api/ai/assistant/threads/route.ts:41`) non ha NESSUN chiamante
HTTP di produzione: l'unico era `useCreateAssistantThread`
(`lib/hooks/useAssistantThreads.ts:98`, fetch a 103), che nessuno importa
(`AssistantPageClient.tsx:50` usa solo `useAssistantThread`,
`useAssistantThreads`, `useDeleteAssistantThread`). La creazione thread reale
avviene server-side dentro la stream route
(`app/api/ai/assistant/stream/route.ts:259-267` chiama direttamente
`createAssistantThread()` quando `body.threadId` è assente): l'endpoint è
architetturalmente bypassato. Lo esercitano solo i test che importano l'handler.

**Raccomandazione: rimuovere l'unità intera:**
1. Handler `POST` dalla route (il `GET` resta — vivo via `useAssistantThreads`).
2. `useCreateAssistantThread` da `lib/hooks/useAssistantThreads.ts` (i helper
   condivisi `normalizeThread`/`authenticatedFetch`/`queryKeys` restano per gli
   hook vivi).
3. In `__tests__/assistantRoutes.test.ts`: import di `postThreadsRoute` (riga ~91)
   e il blocco di test relativo (riga ~295).
4. `createAssistantThread` in `lib/server` resta VIVO (usato dalla stream route).

Alternativa (solo se si pianifica una feature "crea thread vuoto" client-side):
tenere l'endpoint E aggiungergli un chiamante — mai lasciarlo orfano.

## D. `buildAssistantQuarterContext` — morto o mai cablato? (decisione)

`lib/services/assistantMonthContextService.ts:655` (~107 LOC): staticamente
morto, MA l'assistente HA una modalità `quarter_analysis`
(`lib/server/assistant/store.ts:42`, `buildQuarterAnalysisPrompt`) che oggi
**ricade sul context builder MENSILE** in
`app/api/ai/assistant/stream/route.ts:216-240`. La forma è quella di un builder
scritto per la modalità quarter e mai collegato: cancellarlo potrebbe buttare la
fix di un gap reale (analisi trimestrali che girano su un mese di contesto), non
rimuovere cruft. Le email trimestrali NON c'entrano (passano da
`monthlyEmailService`, non da questo servizio).

**Raccomandazione: Opzione A — cablarlo**: nel ramo `quarter_analysis` della
stream route usa `buildAssistantQuarterContext` al posto del builder mensile;
verifica la forma del bundle contro `formatBundleForPrompt` (AGENTS.md →
*Assistant Prompt Builder*) e la suite `assistantRoutes` +
`assistantMonthContextService`. È un bug-fix di wiring, piccolo e ad alto valore.

**Opzione B — cancellarlo** (~107 LOC; gli helper privati sono condivisi coi
builder vivi, zero collaterali) accettando esplicitamente che quarter_analysis
continui a girare su contesto mensile: in tal caso annota il gap in CLAUDE.md →
Known Issues.

Qualunque opzione si scelga, la scelta va scritta in SESSION_NOTES e CLAUDE.md.

## Validazione finale

1. `npx tsc --noEmit`
2. Suite d'area: `assetDialogHelpers` (per A/B), `assistantRoutes` +
   `assistantWebSearchPolicy` + `assistantMonthContextService` (per C/D),
   `chartService` (CustomChartDot è in components/history)
3. `npx vitest run` completa + `npm run build`
4. Smoke: creazione/modifica asset da AssetDialog (tutti i tipi con/senza prezzo
   di mercato); assistente — nuova conversazione (thread creato via stream) e, se
   scelta l'opzione D-A, una richiesta in modalità quarter_analysis
5. `npx knip`: i simboli di questa spec non devono più comparire

## Prompt per la sessione di implementazione

```
Implementa la spec docs/dead-code/05-branch-morti-e-decisioni-di-prodotto.md
(audit codice morto, sessione 5 di 6). Quattro blocchi: (A) rimozione
dell'effetto morto "intelligent defaults" in AssetDialog — applica l'Opzione A
behavior-preserving salvo mia diversa indicazione, e NON toccare il clamp di
buildAssetFormDataFromValues; (B) le tre micro-rimozioni certe; (C) rimozione
atomica di POST /api/ai/assistant/threads + useCreateAssistantThread + test
associati; (D) buildAssistantQuarterContext — applica l'Opzione A (cablarlo nel
ramo quarter_analysis della stream route) salvo mia diversa indicazione.

Regole:
- Rileggi le sezioni AGENTS.md citate dalla spec PRIMA di toccare AssetDialog
  (voce 865-868) e l'assistente (Assistant Prompt Builder, SSE Streaming State)
- Aggiorna AGENTS.md e CLAUDE.md dove la spec lo indica; ogni decisione va
  scritta in SESSION_NOTES.md
- Grep di ri-verifica prima di ogni edit (protocollo docs/dead-code/README.md)
- Un commit per blocco (A..D); branch chore/dead-code-05-decisioni
- npx tsc --noEmit dopo ogni blocco; suite d'area della spec, vitest completa,
  npm run build e smoke manuali alla fine

Contesto:
- Leggi docs/dead-code/README.md (protocollo condiviso e whitelist)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice

Crea SESSION_NOTES.md per tracciare il lavoro.
```

**Modello consigliato: Opus 5 · Effort: high.** È la spec col giudizio più fine:
un form React Hook Form da ~1800 righe con gotcha documentati, una route API e un
wiring dell'assistente. Il costo extra del modello si ripaga in regressioni
evitate. (Se le opzioni B venissero scelte per A o D, restare su Opus 5.)
