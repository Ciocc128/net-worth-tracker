# SESSION_NOTES — audit codice morto, sessione 5/6

**Spec**: `docs/dead-code/05-branch-morti-e-decisioni-di-prodotto.md`
**Branch**: `chore/dead-code-05-decisioni` (derivato da `chore/dead-code-cleanup`)
**Data**: 2026-07-28
**Esito**: tutti e 4 i blocchi implementati. `tsc` clean, 80 file / 1409 test verdi,
`npm run build` ok, `npx knip` pulito (resta solo il falso positivo whitelistato
`.storybook/mocks/ColorThemeContext.tsx`).

Su richiesta esplicita dell'utente durante la sessione, il lavoro è in **un solo commit**
invece di uno per blocco.

---

## Blocco A — `AssetDialog`, effetto "intelligent defaults" morto

**Decisione: Opzione A (behavior-preserving), come raccomandato dalla spec.**

Cancellato l'`useEffect` che derivava `isLiquid`/`autoUpdatePrice` dal tipo di asset
(`components/assets/AssetDialog.tsx`, ex righe 602-628, commento incluso). Era
irraggiungibile: le sue uniche azioni stanno dietro `watchIsLiquid === undefined` /
`watchAutoUpdatePrice === undefined`, ma entrambi i campi nascono `true` sia da
`defaultValues` sia dal `reset()` del ramo create. Zero cambiamenti di comportamento.

Al suo posto resta un commento che spiega perché non c'è un default per tipo e dove sta
la difesa vera.

**Non toccato (esplicitamente richiesto)**: il clamp di `buildAssetFormDataFromValues`
che forza `autoUpdatePrice: false` quando `hasMarketPrice()` è falso. Verificato prima e
dopo l'edit: intatto.

**Cosa NON è stato fatto e perché**: l'Opzione B (touched-flag alla
`allocationRoleTouched`, così la selezione del tipo ri-deriva i default) **non** è stata
applicata. Cambierebbe cosa viene persistito per i nuovi asset realestate / Private
Equity / pensionFund (`isLiquid: false` di default) — è una feature di prodotto, e la
spec chiede di farla in un branch separato dalla rimozione di dead code.

**Conseguenza lasciata aperta, ora documentata**: `isLiquid` non ha nessun clamp a valle
(`buildAssetFormDataFromValues` passa `data.isLiquid` così com'è), quindi un nuovo asset
illiquido resta persistito `isLiquid: true` finché l'utente non gira lo switch — che è
comunque sempre visibile. Annotato in CLAUDE.md → Known Issues e in AGENTS.md.

**Doc aggiornati**: AGENTS.md — la voce *`AssetDialog`'s `autoUpdatePrice` "intelligent
default" never fires* è stata riscritta in *`AssetDialog` has NO type-driven default for
`isLiquid`/`autoUpdatePrice` (the effect was removed)*, con il divieto esplicito di
rimuovere il clamp e la nota che il default type-aware è una scelta di prodotto.

## Blocco B — micro-rimozioni certe

| File | Rimosso |
|------|---------|
| `components/assets/AssetDialog.tsx` | `loadingTargets`/`setLoadingTargets` (stato scritto e mai letto: due `set` per ogni apertura del dialog = due re-render inutili di un form da ~1800 righe) |
| `components/history/CustomChartDot.tsx` | `baseRadius` e `iconSize`, calcolati e mai usati; il commento "Responsive Sizing Ratios" è stato trimmato di conseguenza. La riga su `iconOffset` diceva "Half of iconSize": riscritta per non puntare a un simbolo che non esiste più |
| `components/performance/HeroMetricBlock.tsx` | `import { useState }` mai usato (leftover pre-Popover) |

Ri-verificati con grep prima dell'edit: `watchIsLiquid`, `watchAutoUpdatePrice` e
`selectedSubCategory` restano usati altrove (switch del form, label prezzo, suggerimento
`allocationRole`) — nessuna cancellazione a cascata dovuta.

## Blocco C — `POST /api/ai/assistant/threads` (unità atomica)

**Decisione: rimozione dell'unità intera, come raccomandato dalla spec.**

Rimossi insieme, in quanto unica catena morta:
1. l'handler `POST` in `app/api/ai/assistant/threads/route.ts` (il `GET` resta: è vivo via
   `useAssistantThreads`);
2. `useCreateAssistantThread` in `lib/hooks/useAssistantThreads.ts` (unico chiamante HTTP
   dell'endpoint, a sua volta senza importatori) e l'import di `AssistantCreateThreadInput`
   che serviva solo a lui;
3. in `__tests__/assistantRoutes.test.ts`: l'import di `postThreadsRoute` e il test
   `creates a thread for the authenticated user`.

**Restano vivi e verificati uno per uno**: `createAssistantThread` in
`lib/server/assistant/store.ts` (la stream route crea i thread server-side quando manca
`body.threadId`), il tipo `AssistantCreateThreadInput` (firma di `createAssistantThread`),
`normalizeThread`/`authenticatedFetch`/`queryKeys`, e `createAssistantThreadMock` nel test
(serve ai casi della stream route).

Sulla route è rimasto un commento che dice **perché** questa risorsa è sola lettura, così
il prossimo lettore non la legge come una dimenticanza.

## Blocco D — `buildAssistantQuarterContext`

**Decisione: Opzione A (cablarlo), come raccomandato dalla spec.** È un bug di wiring,
non cruft: il builder trimestrale esisteva completo e coerente con gli altri quattro, e
`quarter_analysis` ha già il suo prompt builder cablato in `anthropicStream.ts`.

In `app/api/ai/assistant/stream/route.ts` il ramo `quarter_analysis` ora chiama
`buildAssistantQuarterContext`. Prima cadeva nell'`else if (body.month)` finale, cioè sul
builder **mensile**: baseline sbagliata (mese precedente invece di fine trimestre
precedente), un terzo del cashflow del periodo, e label "Marzo 2026" invece di "Q1 2026".

**Il trimestre è derivato, non trasmesso**: `AssistantStreamRequest` porta un selettore
mese (`{year, month}`) e nessun campo `quarter`, quindi il trimestre è quello a cui il
mese selezionato appartiene (`Math.ceil(month / 3)`). Scelta deliberata: nessun nuovo
campo sul contratto di rete per una modalità che oggi nessun client invia.

**Portata reale, misurata**: `quarter_analysis` non è raggiungibile dalla UI —
`AssistantPeriodSelector` espone Mese/Anno/YTD/Storico/Libera e basta. Quindi il fix non
cambia nulla di ciò che l'utente vede oggi; rende coerente la modalità per chiunque la
invii (o per quando le si darà un tab).

**Falsità trovata e corretta per strada**: il doc comment di `buildQuarterAnalysisPrompt`
(`lib/server/assistant/prompts.ts`) diceva "Used by the email service … quarter_analysis
is email-only". Non è vero: le email trimestrali passano da `monthlyEmailService` →
`buildEmailAiPrompt` + `EMAIL_PERIODIC_FORMAT_CONTRACT`, e l'unico chiamante del builder è
`anthropicStream.ts`. Commento riscritto sui fatti.

**Non cablato (deliberatamente)**: `GET /api/ai/assistant/context` non ha un ramo
quarter. Serve a ripopolare la scheda numerica di un thread con periodo pinnato dopo un
reload, e nessuna superficie pinna un trimestre. Aggiungerlo ora sarebbe codice morto
nuovo — esattamente ciò che questo audit sta togliendo. Annotato in AGENTS.md.

**Test**: aggiunta una regressione in `__tests__/assistantRoutes.test.ts` — una richiesta
`quarter_analysis` con `month: {year: 2026, month: 5}` deve chiamare
`buildAssistantQuarterContext('user-1', 2026, 2, false)` e **non** il builder mensile.
Il mock del modulo `assistantMonthContextService` è stato esteso col nuovo export.

**Doc aggiornati**: AGENTS.md → *Assistant Month Context Service* (regola generale: ogni
modalità deve avere il suo ramo nella stream route, altrimenti cade in silenzio su quello
mensile).

---

## Validazione

| Passo | Esito |
|-------|-------|
| `npx tsc --noEmit` (dopo ogni blocco) | clean |
| `npx vitest run __tests__/assistantRoutes.test.ts` | 9 → 9 test verdi (uno rimosso, uno aggiunto) |
| Suite d'area: `assistantRoutes` + `assistantWebSearchPolicy` + `assistantMonthContextService` | 30 test verdi |
| `npx vitest run` completa | **80 file / 1409 test verdi** (invariato) |
| `npm run build` | ✓ Compiled successfully |
| `npx knip` | nessun simbolo di questa spec; resta solo il falso positivo whitelistato `useColorTheme` in `.storybook/mocks/` |

**Smoke manuali NON eseguiti** (richiedono dev server + login Firebase reale, fuori dalla
portata di questa sessione automatica). Da fare prima del merge:
1. `AssetDialog`: creazione e modifica per ogni tipo, con e senza prezzo di mercato —
   verificare che gli switch "Liquido" e "Aggiorna prezzo automaticamente" si comportino
   come prima e che il tint da pricing manuale sia invariato in tabella;
2. Assistente: nuova conversazione (il thread deve nascere dalla stream route, ora che il
   `POST /threads` non esiste più) + apertura di una conversazione esistente dalla lista.
   La modalità `quarter_analysis` non ha superficie UI: non è smoke-abile dal browser.

## Nota per il merge

`chore/dead-code-04-utils-types` aveva lasciato in sospeso il **deploy manuale di
`firestore.rules`** (rimozione dei match block `/price-history` e `/portfolios`). Questa
sessione non tocca le rules, ma quel deploy resta da fare.
