# PERF-10 — Le route server leggono una volta: la chiave dell'Esposizione, le statistiche dividendi, le thread dell'assistente

> Stato: da fare · Priorità: 2 (la chiave dell'Esposizione è un bug che chiama Yahoo a ogni apertura) · Sforzo: S/M · Dipende da: PERF-07 (`Server-Timing`) · Sblocca: —

## 1. Il problema, misurato

Tre route lette il 2026-09-26, tutte verificate a riga:

**A. `/api/portfolio/exposure` non va MAI in cache.** La route calcola `expectedCacheKey = ${etfCount}-${etfTickers}-${round(total)}`
(`app/api/portfolio/exposure/route.ts:55`, tre segmenti, il totale calcolato inline) e confronta con `cached.cacheKey` (`:67`,
insieme a un TTL server di 24 h, `:11`); il servizio salva `${etfCount}-${etfTickers}-${stockTickers}-${round(totalPortfolioValue)}`
(`lib/server/portfolioExposureService.ts:336`, QUATTRO segmenti, il totale da `resolveAssetValueEur`) e la route lo persiste
così (`:83`). I due formati non coincidono mai → `computePortfolioExposure` a ogni apertura di Allocazione → **Yahoo
`quoteSummary` per ogni ETF e azione** (`:118`, `:147`), serialmente per rate limit. Anche a formati uguali, `round(total)`
nella chiave invalida a ogni movimento di prezzo. Benchmark: Allocazione 590 ms cold / 606 warm CON GLI EMULATORI — i
600 ms sono Yahoo vero, chiamato dal benchmark (l'unico caso in cui la misura locale ha toccato Internet). Il client ha
`staleTime` 20 min (`usePortfolioExposure.ts:52`): a caldo non richiama, a ogni reload sì.

**B. `/api/dividends/stats`: sette `await` in serie e D letta tre volte** (`app/api/dividends/stats/route.ts:106, 109, 112, 116,
123, 144, 173`): `calculateDividendStats` per il periodo (con le date legge per intervallo, `dividendService.ts:417-421`), di
nuovo per all-time (TUTTA D), `getUpcomingDividends`, A, S, T, poi `getAllDividends` (tutta D di nuovo). La tab Dividendi
chiama in più `/api/dividends` (D ancora, `cashflow/page.tsx:132-162`). Con `iad1` → Europa: sette viaggi ≈ 700 ms prima delle
statistiche.

**C. Assistente:** `listAssistantThreads` senza `limit` (`lib/server/assistant/store.ts:184-189`: cresce per sempre). Il
documento di memoria è letto due volte per apertura (route memory + `context/route.ts:52`): è una lettura piccola che gating
il builder (`includeDummySnapshots`), e i quattro builder devono restare identici fra loro (doc/guide/assistente.md) — resta
com'è, dichiarato in § 3.

## 2. Obiettivo misurabile

- A: seconda apertura di Allocazione → `Server-Timing: source=cache`, zero chiamate a Yahoo (log della route), `total` < 100 ms
  in locale. Test Vitest che la chiave della route e quella del servizio sono la STESSA funzione, e che un movimento di
  prezzo NON cambia la chiave (composizione uguale → chiave uguale).
- B: la route fa **un** `Promise.all` (D, A, S, T; l'upcoming derivato o in parallelo) e deriva periodo/all-time/upcoming in
  memoria; `Server-Timing` con `db` una volta; risposta identica (diff del JSON prima/dopo su fixture).
- C: thread con `limit(50)` + cursore (`startAfter`) esposto dalla route e usato dal client (`useInfiniteQuery` con «Mostra
  altre» nella lista): nessuna thread sparisce in silenzio.
- Benchmark: Allocazione warm senza Yahoo; Cashflow › Dividendi prima/dopo (`Server-Timing`).

## 3. Non-obiettivi

- Non si cambia cosa l'Esposizione calcola, né i settori/holding di Yahoo, né il TTL server (24 h) o client (20 min).
- Non si toccano i numeri delle statistiche dividendi: sono derivazioni dello stesso D.
- Non si tocca il protocollo dell'assistente né i builder di contesto («a new required bundle field means updating ALL 4
  builders»); la doppia lettura della memoria resta.

## 4. Design

**A. Una funzione, una chiave.** `buildExposureCacheKey(assets)` in un modulo puro `lib/utils/exposureCacheKey.ts`
(testabile senza Admin): ordina i ticker di ETF e azioni, conta, NIENTE totale (la composizione è l'input di Yahoo; il
totale non cambia settori né holding — quello che cambia è il peso in euro, che il servizio ricalcola dai valori correnti
SENZA Yahoo: separare «cosa chiede a Yahoo» da «come lo pesa»: `fetchHoldingsFromYahoo(tickers)` (cacheabile per ticker) e
`weighExposure(holdings, assets)` (pura)). La route chiama la stessa funzione per `expectedCacheKey`. Meglio ancora, la
cache per TICKER in una collezione condivisa (`exposure-holdings-cache/{ticker}`, `read: isAuthenticated(); write: false`
come benchmark/FX, AGENTS.md § Caching «Global shared cache»): l'ETF dell'utente A serve anche a B, e un asset nuovo costa
una chiamata sola. Da proporre al proprietario (strumento interattivo, consigliata «sì»).

**B. Un giro.** `Promise.all([getAllDividends, getUserAssetsAdmin, getUserSnapshotsAdmin, getAssetTransactionsAdmin])`; poi
`summarizeDividendStats(all, { startDate, endDate, assetId, now })` e `summarizeDividendStats(all, { now })` come funzioni PURE
sull'array già letto — `calculateDividendStats` oggi legge da solo E costruisce «oggi» con `setHours` sul server
(`dividendService.ts:430-431`): la funzione pura prende `now` (AGENTS.md: «Functions that call `new Date()` internally are
untestable»); la lettura resta nella route. `upcoming` dallo stesso array se `getUpcomingDividends` è un filtro per data
(leggere: se è una query `where paymentDate >= today` è lo stesso array filtrato in memoria). Le funzioni pure vivono in
`lib/utils/dividendAnalytics.ts`, dove già stanno le analisi dei dividendi; ricevuti e annunciati MAI in una cifra sola
(doc/guide/cashflow-dividendi.md).

**C.** `listAssistantThreads(userId, { limit = 50, after? })`; la route accetta `?after=<threadId>`; `useAssistantThreads`
diventa `useInfiniteQuery` e la lista mostra «Mostra altre» quando c'è una pagina dopo (senza UI il `limit` nasconderebbe
in silenzio la 51ª: non accettabile).

**`Server-Timing`** (PERF-07) su tutte e tre le route: è la misura di chiusura.

## 5. File da toccare

- `app/api/portfolio/exposure/route.ts`, `lib/server/portfolioExposureService.ts`, `lib/utils/exposureCacheKey.ts` (nuovo),
  `firestore.rules` (la collezione condivisa se scelta) + `firebase deploy --only firestore:rules` (AGENTS.md § 5: il login
  CLI stale dà 401 su `serviceusage`, non «please log in»).
- `app/api/dividends/stats/route.ts`, `lib/utils/dividendAnalytics.ts` (le funzioni pure con `now`), `lib/services/dividendService.ts`.
- `lib/server/assistant/store.ts`, `app/api/ai/assistant/threads/route.ts`, `lib/hooks/useAssistantThreads.ts`,
  `components/assistant/AssistantThreadList.tsx` («Mostra altre»).
- Test: `__tests__/exposureCacheKey.test.ts`, `__tests__/portfolioExposureService.test.ts` (la route va in cache: mock di
  Yahoo chiamato 0 volte alla seconda), `__tests__/dividendAnalytics.test.ts` (periodo/all-time/upcoming da un array, con `now`),
  `__tests__/apiAuthRoutes.test.ts` (le route: stessa risposta), `__tests__/assistantRoutes.test.ts` (limit e cursore).

## 6. Passi

1. A: test della chiave (rosso oggi: le due chiavi differiscono — è la prova del bug), funzione unica, test verde; la
   separazione fetch/pesatura; la cache per ticker se il proprietario la vuole.
2. B: funzioni pure + test con attesi presi dalla risposta della route vecchia su fixture; la route a un giro; diff.
3. C: limit + cursore + «Mostra altre».
4. `Server-Timing` sulle tre; benchmark Allocazione e Cashflow › Dividendi prima/dopo.

## 7. Test e falsificazione

- Chiave: `buildExposureCacheKey(assetsA) === buildExposureCacheKey(assetsA con prezzi diversi)`; ≠ con un ticker in più.
  Falsificazione: rimettere il totale nella chiave → rosso.
- Route Esposizione: seconda chiamata → mock Yahoo a 0 chiamate; falsificare rompendo il confronto → Yahoo chiamato.
- Statistiche: le funzioni pure riproducono gli attesi della route vecchia (fixture con 7 dividendi come il mirror);
  falsificare sommando ricevuti e annunciati → rosso; `now` a fine anno → l'upcoming cambia (prova che `now` è letto).
- Thread: 60 thread → 50 + cursore → 10; falsificare il cursore (`startAt` invece di `startAfter`) → 11.
- Suite: area Dividendi/cron, Allocazione, Assistant (AGENTS.md § 5); `e2e/allocation.spec.ts`; E2E Dividendi.

## 8. Collaudo guidato

- C: le quattro falsificazioni. D: `curl` delle tre route (200; per `/dividends/stats` e le thread anche il 403 su un altro
  utente con il proprio documento come controllo positivo — l'Esposizione non prende `userId`, usa il token: la coppia
  non si applica).
- F (mirror): 1) Allocazione › Esposizione apre in un attimo la seconda volta, stessi settori e holding; 2) Cashflow ›
  Dividendi: le statistiche identiche (ricevuti / annunciati separati); 3) Assistente: le thread ci sono tutte (6 < 50) e
  «Mostra altre» non appare; 4) «Aggiorna» dell'Esposizione (`force=true`) rifà Yahoo. Non coperto: rate limit di Yahoo in
  produzione.
- G: `npm run mirror:remove`.

## 9. Rischi e rollback

- La cache condivisa per ticker è una collezione nuova con rules: inerte finché non deployata (AGENTS.md); se il deploy
  delle rules non si fa in sessione, la spec resta sulla cache per utente e lo dice.
- Rollback per route (tre blocchi indipendenti).

## 10. Documentazione da aggiornare

- CLAUDE.md «Latest»; doc/guide/allocazione.md (la chiave, la cache per ticker), cashflow-dividendi.md (le funzioni pure
  della route, `now`), assistente.md (limit, cursore, «Mostra altre»); AGENTS.md § Caching (la collezione condivisa se
  nasce); `Draft Release Temp.md`; doc/perf/README.md.

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/perf/PERF-10-route-server-leggere-una-volta.md: (A) la chiave della cache
dell'Esposizione diventa UNA funzione pura senza il totale (oggi route e servizio la costruiscono diversa e la cache non
va mai a segno: Yahoo a ogni apertura), con la separazione fra ciò che si chiede a Yahoo e come lo si pesa; (B)
/api/dividends/stats legge D, A, S, T una volta in un Promise.all e deriva periodo, all-time e upcoming da funzioni pure
che prendono now; (C) le thread dell'assistente hanno limit e cursore con «Mostra altre» nella lista. Server-Timing su
tutte e tre. Benchmark di Allocazione e Dividendi prima/dopo.

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md, AGENTS.md (§ Caching, § Server Layer and API Authorization, § Firestore Queries and the Rules,
  § Dynamic Imports: le funzioni con new Date() dentro), CLAUDE.md
- Leggi doc/guide/allocazione.md, cashflow-dividendi.md, assistente.md, e2e-emulatori.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice
- Leggi doc/perf/README.md e la spec PERF-10 per intero; PERF-07 deve essere chiusa (il helper Server-Timing esiste)
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano; la cache per ticker condivisa me la
proponi con lo strumento interattivo (consigliata «sì») prima di scriverla.
Chiusura: il test della chiave scritto PRIMA del fix e visto rosso sul codice di oggi; le quattro falsificazioni di § 7
viste ROSSE; diff delle risposte prima/dopo su fixture; curl delle tre route; benchmark prima/dopo; suite d'area, tsc,
lint 0, Vitest in Europe/Rome, npm run test:e2e COMPLETO; giro guidato di 4 punti sul mirror, poi mirror:remove;
CLAUDE.md «Latest», le tre guide, AGENTS.md se nasce la collezione, Draft Release Temp.md (senza dati privati),
doc/perf/README.md; proponi il commit.
```

## 12. Modello ed effort

**Claude Opus 5.5, effort high.** Tre route indipendenti con logica chiara e test facili da falsificare; la parte di dominio
(ricevuti/annunciati mai in una cifra) è scritta nella guida. Sonnet 5 per (C) da solo; Opus per (A) e (B).
