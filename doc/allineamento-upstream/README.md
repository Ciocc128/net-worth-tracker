# Allineamento a upstream del 17/10/2026 — decimo riallineamento (dossier)

> Analisi in sola lettura del 17/10/2026, chiesta dal proprietario («upstream ha rilasciato su main, ora va considerato
> un allineamento alla sua nuova versione»). Le decisioni D-UP1–D-UP5 (§ 6) le ha prese il proprietario lo stesso
> giorno («procediamo con il tuo piano»); il codice arriva a tappe (§ 7), una PR in bozza per tappa.
> Questo dossier non cambia codice.
>
> **Undicesimo riallineamento** (18/10/2026, upstream fino a #476): [`undicesimo.md`](undicesimo.md).
Confronto: `Ciocc128/net-worth-tracker:main` (`d18415cd`, dopo la PR #112) contro
`GiuseppeDM98/net-worth-tracker:main` (`a66f822f`, PR #470 del 17/10).
I conflitti sono misurati con `git merge-tree` (una prova di merge che non scrive nulla).

## 1. In breve

- Il merge-base è `8f243946` (PR #406 di upstream, 27/09): è il **nono riallineamento**, l'ultimo fatto.
  Da allora upstream ha 75 commit (716 file, +54.468 / −22.419 righe) e il fork 250 commit (530 file).
- Un merge unico oggi produrrebbe **128 file in conflitto**: 116 di contenuto, 6 «modificato da una parte e
  cancellato dall'altra» e 6 «creato da tutte e due le parti» (tutti sull'Esposizione).
- Upstream ha fatto tre cose grandi:
  1. la serie **PERF-00…14** (28/09–08/10), con la nuova Esposizione, React Query su un solo binario, la cache
     salvata nel browser, il React Compiler, Impostazioni divise in sei viste, Next 16.4 e firebase-admin 14;
  2. i **debiti come asset `loan`** (#445, 10/10), con una migrazione che scrive su Firestore alla prima visita
     di Patrimonio;
  3. la serie **MOB-01…09** (10–17/10), che ricompone ogni pagina per telefono e tablet.
- La proposta è di procedere in **cinque tappe**, ognuna un merge di un commit di upstream già rilasciato,
  con la sua PR in bozza e i suoi test. Il punto più delicato non sono i conflitti visibili ma tre **conflitti
  silenziosi**, che git risolve senza avvisare (§ 5).
- Prima di toccare il codice servono **cinque decisioni** di Giorgio (§ 6).

## 2. Cosa ha cambiato upstream dal 27/09

| Blocco | PR upstream | Cosa cambia | Peso sul fork |
|---|---|---|---|
| PERF-00 Esposizione | #407–#408 | Esposizione riscritta da #402: tre viste, i profili Yahoo da una cache unica per ticker (`instrument-profile-cache`), gli euro pesati nel browser. Spariscono `portfolioExposureService.ts`, `/api/portfolio/exposure` e `exposure-cache` | **Alto**: il fork ha le sue cinque viste, le tabelle curate, AL6 «coperto dal cambio» e la geografia dell'ottimizzatore sullo stesso percorso |
| PERF-01…06 | #409–#422 | Benchmark e budget in repo (`perf/`), la shell prima dell'autenticazione, **un solo binario React Query** per ogni collezione, la **cache delle query salvata in IndexedDB per 24 ore**, Recharts in un solo chunk e il PDF caricato al clic, le spese lette per finestra (Tracciamento, Divisione, Budget, FIRE) | Medio: tocca hook e servizi che il fork ha esteso |
| PERF-07…14 e manutenzione | #423–#443 | Panoramica ricalcolata in un giro, Vercel in `fra1`, Rendimenti e Dividendi con una lettura sola, **React Compiler attivo** con un test che lo pretende ovunque, **Impostazioni in sei viste controllate con un reducer** (`settingsDraft.ts`), Next `^16.4.0`, firebase-admin `^14.5.0`, Node 24, la suite verde anche in UTC, Rendimenti e assistente su `claude-sonnet-5-5` | **Alto**: Impostazioni e FIRE |
| Debiti come asset `loan` | #445–#446 | Un debito diventa un asset `loan` di valore negativo. Una migrazione, alla prima visita di Patrimonio, sposta `outstandingDebt` di ogni immobile in un prestito e ripunta le rate. In più: commissione su qualsiasi riga, trasferimento su un immobile e cedola unica a scadenza | Medio sul testo, **alto sul significato** (§ 5) |
| MOB-01…09 | #447–#470 | Ogni pagina tranne Impostazioni e l'assistente è composta per telefono (verdetto · asse · striscia · IL tile aperto · righe chiuse) e per tablet (due colonne a 768, il «palco» in orizzontale). `doc/mobile/` e `doc/perf/` vengono ritirati, AGENTS.md scende a 921 righe e le regole vanno in DESIGN.md e nelle guide | **Alto**: ricompone Allocazione, i cinque tab FIRE, Storico, Patrimonio e Analisi, cioè le pagine dove il fork ha le sue epiche |
| Correzioni | #425, #455, #457, #458, #460 | Configurazione del thinking AI, fallback di Sonnet 5.5, voci «versamenti al fondo» e «debiti rimborsati» nello split del mese in Panoramica | Basso |

Upstream ora conta 240 file e 5507 test Vitest, più 63 spec Playwright (290 test).

## 3. Conflitti misurati

**Conflitti cumulativi** se il fork si fermasse a ciascun punto di upstream. Il conteggio è sul main del fork
di oggi: dopo ogni tappa risolta, la tappa dopo ne porta meno.

| Fino a | Data | File in conflitto |
|---|---|---|
| #408 (PERF-00) | 28/09 | 19 |
| #422 (PERF-06) | 01/10 | 52 |
| #443 (PERF-14, release) | 08/10 | 73 |
| #446 (debiti) | 10/10 | 74 |
| #470 (MOB-09, release) | 17/10 | 128 |

**File con più blocchi in conflitto**, tra parentesi le righe cambiate da fork e da upstream:
- `FireCalculatorTab.tsx` (629 / 286), 18 blocchi;
- `app/dashboard/settings/page.tsx` (383 / **4114**), 14 blocchi;
- `MonteCarloTab.tsx`, 11 blocchi;
- `CoastFireTab.tsx`, 11 blocchi;
- `WhatIfAnalysisTab.tsx`, 10 blocchi;
- `monthlyEmailService.ts` (895 / 96), 9 blocchi;
- `app/dashboard/allocation/page.tsx`, 9 blocchi;
- `GoalBasedInvestingTab.tsx`, 9 blocchi;
- `EsposizioneTile.tsx`, 8 blocchi;
- `allocazioneSummary.ts` e `allocazioneNarrative.ts`, 7 blocchi ciascuno.

**Modificato da una parte e cancellato dall'altra:**
- Cancellati dal fork e modificati da upstream: `CoastIpotesi.tsx`, `useCoastFireSettingsDraft.ts` (sostituiti
  da «Il mio piano»), `MilestoneTile.tsx` e `DistribuzioneTile.tsx` (ritirati dal fork). Si tiene la
  cancellazione.
- Cancellati da upstream e modificati dal fork: `portfolioExposureService.ts` e `app/api/portfolio/exposure/route.ts`.
  Dipende dalla decisione D-UP1.

**Creati da tutte e due le parti** (stesso percorso, contenuto diverso): `exposureEngine.ts`, `yahooSource.ts`,
`app/api/portfolio/instrument-profiles/route.ts` (stesso URL ma contratto diverso: il fork accetta `assetIds`
per i candidati dell'ottimizzatore), `__tests__/exposureEngine.test.ts` ed `e2e/allocation.mobile.spec.ts`.

**82 file modificati da tutte e due le parti si fondono senza conflitto.** Vanno riletti lo stesso, in
particolare `types/assets.ts`, `assetService.ts`, `mortgageSummary.ts`, `performanceService.ts`,
`firestore.rules`, `next.config.ts`, `fireSummary.ts` e `coastFireView.ts`.

## 4. Area per area: dove va in conflitto con le epiche del fork

Per ogni area: cosa succede al merge e la scelta proposta.

**Esposizione** (cinque viste, `doc/guide/fork-scelte-ui.md` § 1 «Esposizione engine (coming)», AL6)
- Al merge: tutti e cinque i file «creati da entrambi», più le due cancellazioni di upstream. Il fork
  potrebbe prendere il meccanismo di upstream solo riscrivendo le cinque viste, le tabelle curate, il
  `currencyHedge` e la lettura della geografia dell'ottimizzatore sul nuovo contratto.
- Proposta: tenere il **motore del fork per intero** (D-UP1). Da upstream si prendono solo `exposureSectors.ts`
  e quello che non tocca la pipeline.

**Allocazione** (Bilanciamento/Accumulo, AL1–AL6, PAC, ottimizzatore, modello)
- Al merge: `allocation/page.tsx` in conflitto in T1, T3 e T5. Il narrative e il summary hanno 7 blocchi
  ciascuno. In T5 MOB-07 ricompone la pagina con `useMobileSections`.
- Proposta: sopra la composizione mobile di upstream si rimettono le due schede, i tile del fork e la nota del
  PAC sul Piano. **Accumulo, come scheda, non è composto per telefono** (D-UP4).

**Impostazioni** (scheda Simulazioni, ipotesi Monte Carlo, IRPEF, Allocazione ideale riassunta)
- Al merge: il monolite di upstream diventa sei componenti `components/settings/tabs/*` più un reducer.
  Le 383 righe del fork non hanno più dove atterrare.
- Proposta: riscrivere la scheda del fork come **settima vista controllata** (`SimulazioniTab`) con la sua fetta
  in `settingsDraft.ts`. È un porting a mano, non una risoluzione di conflitto.

**FIRE** (L1–L3, K1, EF1, F1–F3, O1–O2, E1, S1, C1, H1–H2, NF1, CG-A, T4–T5 e la sesta scheda Proiezione)
- Al merge: tutti e cinque i tab in conflitto. Upstream ha cambiato le stesse schede due volte, prima per
  il compiler e le spese per finestra (T2–T3) e poi per la composizione mobile (T5).
- Proposta: tenere sempre la logica del fork (`fork-scelte-ui.md` § 1, le righe FIRE) e prendere da upstream
  solo la forma della pagina. La sesta scheda e il blocco «Il mio piano» restano senza composizione mobile
  (D-UP4).

**Monte Carlo** (Q1–Q5, motore a sette classi)
- Al merge: `MonteCarloTab.tsx` (11 blocchi), `monteCarloNarrative.ts` e `monteCarloSummary.ts`.
- Proposta: come da `fork-scelte-ui.md`, si tiene il lato del fork.

**Storico** (scrub)
- Al merge: `EvoluzioneTile`, `ComposizioneTile`, `DriverTile` e `growthDrivers.ts`. MOB-06 ricompone la pagina.
- Proposta: rimettere lo scrub sulla nuova composizione, come già fatto il 21/09.

**Analisi** (Sankey sottile, «Altre», 50/30/20)
- Al merge: `FlussoTile`, `AnalisiTab` e `CashflowSankeyChart`.
- Proposta: come il nono riallineamento, il livello puro di upstream con la resa del fork sopra.

**Email e AI** (GPT-6.1 Sol, Wiki F5, 50/30/20 nelle email)
- Al merge: `monthlyEmailService.ts` (9 blocchi), `emailNarrative.ts`, `aiModels.ts`, `assistant/prompts.ts`.
- Proposta: tenere le rotte del fork per le email e prendere da upstream il fallback di Sonnet 5.5 e i modelli
  di Rendimenti e assistente (D-UP2).

**Patrimonio** (AL6 nel form, chip composito, guardia sulla prima operazione)
- Al merge: `AssetDialog.tsx` (4 blocchi, upstream +597 righe per i prestiti), `AssetRow`, `StrumentiTile`.
- Proposta: il form di upstream con il campo «Coperto dal cambio in EUR» del fork.

**Lime Frost e temi**
- Al merge: `globals.css`, `useChartColors`, `useActionColors`, `actionColor.ts`, `temi.md`.
- Proposta: tenere i token del fork. Il nuovo `mutedForegroundContrast.test.ts` legge **tutti** i blocchi di
  `globals.css`: verificare che i due blocchi Lime Frost stiano sopra 4,5:1.

**Documentazione**
- Al merge: CLAUDE.md, AGENTS.md (upstream −1238 righe), README, DESIGN, WORKFLOW, SETUP e 12 guide.
- Proposta: la struttura snella di upstream, con le righe «Solo fork» e i dossier del fork. CLAUDE.md resta
  sotto i 20.000 caratteri e WORKFLOW.md tiene la regola 6 del fork.

**Dipendenze**
- Al merge: `package.json` e `package-lock.json`.
- Proposta: prendere Next 16.4, firebase-admin 14, React Query 5.104, il persister e il React Compiler. Si
  chiude il Known Issue del fork sui due pin. Il lockfile si rigenera con `npm install`, mai a mano.

**Thread «IMPL D1 Sostituisci vicino alla riga».** `AccumulationPlanDialog.tsx` esiste solo nel fork e upstream
non lo tocca, quindi D1 non va mai in conflitto testuale. Ma T1 e T5 toccano `allocation/page.tsx` e i tile di
Accumulo, e il React Compiler (T3) passerà anche sul dialog. Proposta: **T1 parte dopo il merge di D1**, così
nessuna tappa lavora in un'area mentre un altro thread la sta cambiando (regola delle istruzioni di progetto).

## 5. Conflitti silenziosi: git li fonde, l'app si rompe

**S1 — Il salvataggio di Impostazioni può cancellare i campi del fork.**
- Con `targets` presente, `setSettings` scrive il documento **senza merge**.
- Upstream ora ricostruisce il documento da `composeSettingsDocument(slices, current)`.
- Se il porting non porta nel reducer i campi del fork, il primo «Salva» in Impostazioni li azzera. I campi
  sono `monteCarloMarket`, `fireDatedFlows`, `fireEmergencyFund`, `idealAllocation`, le aliquote IRPEF,
  `plannedAnnualExpenses`, `coastFireRetirementAge` e il resto di H1.
- Cancello di T3: il test d'identità di upstream (`settingsDraft.test.ts`, fixture `storedSettings.ts`) esteso
  con **ogni** campo del fork, più `settingsRoundTrip.test.ts`.

**S2 — Il mutuo dei Flussi nel tempo si stacca dopo la migrazione dei debiti.**
- Il fork collega un flusso datato al mutuo con `source.propertyId` e legge le rate con
  `row.debtAssetId === property.id` (`lib/hooks/useFireDatedFlows.ts:79`).
- La migrazione di upstream ripunta le rate sul nuovo asset `loan`. Il flusso salvato di Giorgio troverebbe
  zero rate e il piano FIRE perderebbe il mutuo **senza errori**.
- Da fare in T4: risolvere il mutuo attraverso il prestito (`financedAssetId`) tenendo valido il `propertyId`
  salvato.
- Rileggere anche i lettori del fork che sommano gli asset: `fireCapital.ts`, `monteCarloWeights.ts`, i
  candidati di ottimizzatore, PAC e modello, l'Esposizione e gli Obiettivi. Un `loan` vale negativo e
  upstream lo esclude dall'allocazione: ogni lettore del fork deve escluderlo allo stesso modo
  (`isLoanAsset`).

**S3 — La migrazione dei prestiti scrive in produzione.**
- Parte da sola alla prima apertura di Patrimonio dopo il deploy: `lib/services/loanMigration.ts`.
- Non si annulla con un revert.
- T4 va quindi provata sul mirror (`mirror:seed`, sul Mac di Giorgio) prima del merge su main.

**Altri, minori:**
- `firestore.rules` si fonde perdendo la regola `exposure-cache`. È innocuo, perché la scrive solo l'Admin SDK.
  Va tenuta comunque se resta il motore del fork.
- `instrument-profile-cache` ha lo stesso nome di collezione nei due motori, con id e forme diverse. Con
  D-UP1 = motore del fork il problema non si pone. Con il motore di upstream servirebbe un nome nuovo o un
  campo di versione.
- `__tests__/reactCompilerCoverage.test.ts` fallirà sui componenti del fork. Misurato oggi sul main del fork
  con lo stesso plugin, nei file del fork vengono saltati **6 componenti nati nel fork**: `AccumuloTab`,
  `ClassDriftChart`, `ModelEditDialog`, `ObiettiviDialog`, `PortafoglioModelloTile` e `ProjectionTab`. Le cause
  sono `try … finally`, `eslint-disable` di una regola hooks e un `try` con valori condizionali. Vanno
  aggiunti i file condivisi che il fork ha cambiato, da rimisurare dopo il merge.
- `perfRoutes.test.ts` e `mobileSurfaces.test.ts` legano `perf/routes.json` e `perf/mobile-budget.json` alla
  navigazione. Le rotte sono le stesse (il fork non ha pagine nuove), ma vanno ricontrollate dopo il merge.
- `package.json` richiede Node `24.x` e `vercel.json` aggiunge `regions: ["fra1"]`. Due cose da verificare su
  Vercel per il deploy di Giorgio: la versione di Node del progetto, e che il Firestore di produzione sia in
  Europa (upstream dichiara `eur3`), altrimenti fra1 rallenta invece di accelerare.
- `CACHE_MATH_VERSION` è ancora `v8` in upstream, quindi il fork resta `v8-fork` e non c'è nulla da portare.

## 6. Decisioni (prese dal proprietario il 17/10/2026)

Tutte e cinque nella forma consigliata; le alternative scartate restano scritte con il motivo.

**D-UP1 — Esposizione.**
- **Tenere il motore del fork per intero** (**presa**): cinque viste, tabelle curate, AL6 e la geografia
  dell'ottimizzatore restano come sono. La PERF-00 di upstream viene presa solo nei pezzi esterni alla pipeline.
- Scartata: adottare il motore di upstream e riportarci sopra le cinque viste. È una riscrittura, non un
  merge. Se interessa, va in un'epica a parte con spec.

**D-UP2 — Modelli AI.**
- **Prendere da upstream Rendimenti e assistente su `claude-sonnet-5-5` e il suo fallback lato server; tenere
  le rotte del fork** (**presa**). Le rotte del fork sono email su GPT-6.1 Sol, email del budget su GLM e
  TheBull su DeepSeek.
- Scartata: tenere `claude-sonnet-4-6` e `claude-sonnet-5`. Costano di più e upstream li ha già superati.

**D-UP3 — Debiti come asset `loan`.**
- **Prenderli in T4, con l'adattamento S2 e la prova sul mirror prima del merge** (**presa**).
- Alternativa: rimandare T4. Ma ogni tappa successiva (T5) la contiene, quindi rimandarla blocca anche la
  composizione mobile.

**D-UP4 — Composizione mobile delle superfici del fork.**
- **Prendere la composizione di upstream sulle pagine condivise e lasciare in griglia semplice le superfici
  nate nel fork** (**presa**). Sono la scheda Accumulo, la scheda Proiezione, il blocco «Il mio piano» e la
  scheda Simulazioni. La loro composizione diventa una spec del fork a parte («MOB fork»).
- Scartata: comporle dentro il merge. Allungherebbe T5 e mescolerebbe disegno nuovo e risoluzione dei conflitti.

**D-UP5 — Granularità.**
- **Cinque tappe, una PR in bozza ciascuna, una alla volta** (**presa**).
- Scartata: un merge unico da 128 file. Non si può collaudare a pezzi e un errore non si isola.

## 7. Piano a tappe (task T1–T5)

Regole comuni a ogni tappa:
- Branch `merge/upstream-2026-10-NN-tX` da `origin/main`, con `git merge <commit upstream>` e merge commit,
  mai squash, mai rebase, mai push verso upstream. PR in bozza verso `Ciocc128:main` solo dopo l'ok di
  Giorgio al piano.
- Per ogni file in conflitto si consulta `doc/guide/fork-scelte-ui.md` § 1. A fine tappa si aggiunge una riga
  alla lista dei riallineamenti in testa a quel file, e CLAUDE.md riceve la riga «Latest upstream».
- I test minimi di ogni tappa sono questi:
  - `npm install` (le dipendenze cambiano);
  - `npx tsc --noEmit`;
  - Vitest completo sotto `TZ=Europe/Rome`, più `TZ=UTC` da T3 in poi, perché upstream ha sistemato le fixture;
  - `npx eslint app components lib types e2e scripts __tests__`;
  - Playwright completo sul Mac di Giorgio con gli emulatori (Java ≥ 21).
- Il thread di implementazione usa Sonnet 5.5 (regola del progetto), salvo diversa scelta di Giorgio.

### T1 — PERF-00, l'Esposizione (fino a #408)
- **Conflitti:** 19 file, tutti su Allocazione ed Esposizione, più la documentazione.
- **Lavoro:** applicare D-UP1, cioè tenere il motore, la rotta e il servizio del fork e ripristinare la regola
  `exposure-cache`; prendere da upstream i test che non dipendono dalla pipeline; tenere il contratto
  `assetIds` di `instrument-profiles`; risolvere i 7 blocchi di `allocazioneSummary.ts` e `allocazioneNarrative.ts`.
- **Rischio:** medio. Un'area sola, ben documentata.
- **Test pertinenti:** `exposureEngine`, `exposureCacheKey`, `instrumentProfiles`, `geoAreas`,
  `allocazioneSummary`, `allocazioneNarrative` ed `e2e/allocation*.spec.ts`. A mano: Esposizione nelle cinque
  viste e MFEH letto come EUR.
- **Prerequisito:** D1 già su main.

### T2 — PERF-01…06 (fino a #422)
- **Conflitti:** circa 33 file in più rispetto a T1 (52 cumulativi).
- **Lavoro:**
  - entrano in repo `perf/`, `perf:bench` e `perf:budget`;
  - gli hook del fork vanno sul binario unico di React Query, con le chiavi in `queryKeys.ts`. Accumulo e
    modello hanno già le loro chiavi; i dati persistiti richiedono il proprietario come primo segmento
    (`persistCache.test.ts`, `OWNER_KEYED_BUILDERS`);
  - l'adattamento dei lettori FIRE alle spese per finestra (`fireService.ts`).
- **Rischio:** medio. Un dato vecchio nella cache del browser resta mostrato per 24 ore se una scrittura del
  fork non invalida la chiave giusta.
- **Test pertinenti:** `persistCache`, `persistedQueryDefaults`, `queryPersistence`, `expenseWindows`,
  `fireCashflowInMemory`, `fireService`, `perfRoutes`. A mano: salvare il piano FIRE, ricaricare la pagina e
  rivedere il dato nuovo.

**Esito T2 (2026-10-17, branch `claude/impl-t2-upstream-cache-j3ahvz`):** merge di `a19a9fca` (#422) su main dopo T1.
- Conflitti risolti: 39 file (codice e documentazione). I componenti con la logica del fork (Allocazione, FIRE «Il mio piano», Impostazioni) sono la versione del fork con le letture portate sui binari condivisi (`useAssets`, `useSettings`, `useGoalData`, `useFreshness`); `exposureSectors.ts` e `useCoastFireSettingsDraft.ts` restano cancellati (D-UP1, H1).
- `getAnnualCashflowData` e `getFIREData` non esistono più: i lettori del fork passano da `useAnnualCashflow` (nuovo, la finestra recente delle spese in memoria) e dal `buildFIREData` del Calcolatore; la Proiezione, il What If, `useFireAssumptions`, il PAC e `AccumuloVuotoTile` non rileggono più tutte le spese.
- Chiavi grezze (`['settings', id]`, `['assets', id]`, `['goalData', id]`) sostituite dagli hook; `['goalData']` (cache separata, mai invalidata dal salvataggio degli Obiettivi) ora è `queryKeys.goals`. I dati del fork (`accumulationPlans`, `modelPortfolio`, Esposizione, profili) non entrano nella cache persistita.
- Il grafico a barre/linee di Analisi e Storico usa i token `--flow-in` / `--flow-out` anche nei file nuovi (vedi `fork-scelte-ui.md` § 1).
- `perf/budget.json`: dopo il merge 12 route sono sopra il tetto di upstream (il codice del fork pesa); tetti alzati con `raisedBy` e registro in `perf/README.md`.
- Test: `tsc` pulito, Vitest sotto `Europe/Rome` 283 file / 6384 test verdi, eslint 0 errori, `perf:budget` verde. **Da fare sul Mac prima del merge**: Playwright completo e giro a mano (salvare il piano FIRE, ricaricare, rivedere il dato nuovo; riaprire dopo un'ora).

### T3 — PERF-07…14, dipendenze, compiler, Impostazioni (fino a #443)
- **Conflitti:** circa 21 file in più (73 cumulativi), ma i più pesanti.
- **Lavoro:**
  - Impostazioni: `SimulazioniTab` come settima vista con la sua fetta nel reducer e le aliquote IRPEF;
    il riassunto di Allocazione ideale nella vista Allocazione (cancello S1);
  - React Compiler: riscrivere i componenti saltati (§ 5) secondo AGENTS.md § Motion, finché
    `reactCompilerCoverage` è verde;
  - Next 16.4, firebase-admin 14, Node 24 e fra1, con il Known Issue del fork chiuso in CLAUDE.md;
  - AI secondo D-UP2.
- **Rischio:** **alto**. È la tappa con la perdita di dati possibile (S1) e quella che cambia il runtime di Vercel.
- **Test pertinenti:** `settingsDraft` (esteso), `settingsRoundTrip`, `settingsNarrative`,
  `reactCompilerCoverage`, `mutedForegroundContrast`, `vercelConfig` ed `e2e/settings*.spec.ts`. A mano, sul
  mirror: salvare ogni scheda di Impostazioni e controllare che `monteCarloMarket`, i flussi datati e
  l'Allocazione ideale restino. **Anteprima Vercel della PR verde prima del merge.**

**Esito T3 (2026-10-17, branch `claude/impl-t3-upstream-compiler-boumzw`):** merge di `22020f2b` (#443) su main dopo T2.
- Impostazioni: la vista **Simulazioni** è la settima, con la sua fetta nel reducer (`SimulazioniSlice`: il mercato Monte Carlo con origine e migrazione, gli scaglioni IRPEF, le correzioni R5 delle correlazioni). Il compose scrive `monteCarloMarket` solo se la scheda ha una modifica o il documento è un v1 da convertire, gli scaglioni solo se modificati, e **porta dal documento letto un attimo prima** `withdrawalRate`, `plannedAnnualExpenses`, `fireEmergencyFund`, `fireCashToInvestPct`, `fireDatedFlows` e `idealAllocation`; `userAge` si legge per la formula ma non si scrive mai da qui (D-T5). La vista Allocazione mostra l'età di sola lettura con il rimando a «Il mio piano» e il riassunto di Allocazione ideale; Generale dichiara fondo di emergenza e flussi nel tempo.
- Cancello S1: `settingsDraft.test.ts` esteso (identità `compose ∘ slice` con ogni campo del fork, otto casi sulla perdita di dati) e `settingsRoundTrip.test.ts` compone un «Salva» pulito e lo passa al vero `setSettings` sul documento salvato: ipotesi di mercato, flussi datati, Allocazione ideale, fondo di emergenza, scaglioni sopravvivono.
- React Compiler: sette componenti del fork saltati e riscritti (`runGuarded` spostato in `lib/utils/runGuarded.ts` per i salvataggi di `ObiettiviDialog`, `ModelEditDialog`, `PortafoglioModelloTile`; il corpo delle simulazioni di `MonteCarloTab` e `ProjectionTab` in funzioni di modulo; `ClassDriftChart` con gli estremi dell'asse in una funzione di modulo; la dipendenza `today` di `AccumuloTab` al posto del `eslint-disable`). `reactCompilerCoverage` verde.
- Dipendenze: Next 16.4, firebase-admin 14 (con l'override `jwks-rsa`), Node 24, `fra1`; il Known Issue dei due pin è chiuso in CLAUDE.md. AI secondo D-UP2: Rendimenti e assistente su `claude-sonnet-5-5`, le rotte delle email del fork restano.
- Tema: il palette condiviso di upstream (`ChartColorsProvider`, `themePalette`) sostituisce gli hook locali; Lime Frost legge i token `--trade-*` prima dei `--chart-N`; `mutedForegroundContrast` conta quattordici blocchi.
- `perf/budget.json`: i tetti di upstream (#436) non reggono il codice del fork; alzati con `raisedBy` su sei route e sui condivisi, riga nel registro di `doc/guide/velocita.md`. Debito aperto: schede Accumulo e Proiezione in lazy.
- Test: `tsc` pulito, Vitest 298 file / 6589 test verdi sotto `TZ=Europe/Rome` e `TZ=UTC`, eslint 0 errori, `perf:build` + `perf:budget` verde. **Non eseguiti nel cloud, da fare sul Mac prima del merge**: Playwright completo con gli emulatori, il giro a mano sul mirror (salvare ogni scheda di Impostazioni e controllare che ipotesi di mercato, flussi datati e Allocazione ideale restino) e l'anteprima Vercel.

### T4 — Debiti come asset `loan` (fino a #446)
- **Conflitti:** in testo circa un file in più (74 cumulativi); molti nel significato.
- **Lavoro:**
  - S2: il mutuo dei Flussi nel tempo letto attraverso il prestito, con test sulla migrazione di un flusso
    salvato;
  - escludere `isLoanAsset` in tutti i lettori del fork;
  - il campo AL6 nel nuovo `AssetDialog`.
- **Rischio:** **alto**, perché la migrazione scrive in produzione (S3).
- **Test pertinenti:** `loanAssets`, `mortgageSummary`, `mortgageRepayment`, `datedFlows`, `datedFlowsEngines`,
  `fireCapital`, `weightOptimizer`, `modelPortfolio`, `e2e/cashflow.mortgage.spec.ts` ed
  `e2e/fork-features.spec.ts`.
- **Collaudo sul mirror obbligatorio prima del merge:** aprire Patrimonio, poi controllare che il mutuo del
  piano FIRE e il numero FIRE siano uguali a prima della migrazione.

### T5 — MOB-01…09, composizione per telefono e tablet (fino a #470, la release di oggi)
- **Conflitti:** circa 54 file in più (128 cumulativi): le pagine ricomposte e la documentazione.
- **Lavoro:**
  - pagina per pagina, la composizione di upstream con la logica del fork dentro: Allocazione con le due
    schede, FIRE con sei schede e «Il mio piano», Storico con lo scrub, Analisi con il Sankey sottile;
  - le superfici del fork in griglia semplice (D-UP4);
  - i due dossier `doc/perf` e `doc/mobile` ritirati come in upstream;
  - AGENTS, CLAUDE e DESIGN nella forma snella.
- **Rischio:** medio-alto. Molti file, ma è forma e non calcolo; i calcoli del fork restano nei moduli puri.
- **Test pertinenti:** `mobileSections`, `mobileSurfaces`, `tabletComposition`, `mobileBudget`, `verdictStrip`,
  i test narrative di ogni pagina, Playwright completo con i nuovi `*.mobile` e tablet, più `mobile:census`. A
  mano: giro sul mirror a 390, 768, 1024 e 1440 sulle pagine del fork.

**Ordine e attese.** Prima D1. Poi T1 → T2 → T3 → T4 → T5, ognuna su main prima della successiva, così che la
produzione salga per gradini collaudati. Dopo T5 il fork è allineato alla release di upstream del 17/10.

## 8. Come rifare le misure

```
git remote add upstream https://github.com/GiuseppeDM98/net-worth-tracker.git   # solo fetch
git fetch upstream main && git fetch origin main      # il clone del fork non deve essere shallow
git merge-base origin/main upstream/main              # 8f243946
git merge-tree --write-tree --name-only origin/main <commit upstream>   # conflitti senza scrivere nulla
```

## 9. T4 — debiti come asset `loan` (fatta, da provare sul mirror)

Merge di upstream fino a fdfeee0e (#446), quattro commit sopra il taglio di T3; conflitti in testo otto, risolti a mano:
`AssetRow`/`StrumentiTile` (la chip dello zero dice «Estinto» per un prestito, altrimenti `describeZeroQuantityChip`),
`growthDrivers` (il prestito salta il mercato, il resto dell'attribuzione del fork resta), `AssetDialog` (il campo AL6
`currencyHedge` e il `stampDutyExempt` del prestito), `storico.md`, `CLAUDE.md`, `Draft Release Temp.md` (tenuto il lato del fork) e
`exposureRequests.ts` (cancellato nel fork, resta cancellato).

- **S2 — il mutuo dei Flussi nel tempo.** `lib/utils/fireMortgages.ts`: `resolvePropertyMortgages` cerca le rate sulle
  passività di una proprietà (i prestiti con `financedAssetId` = proprietà, e la proprietà stessa finché non è migrata) e
  restituisce un piano per `propertyId`; due prestiti sulla stessa casa si sommano. `useFireDatedFlows` lo usa, e
  `debtAssetIdsOf` è l'elenco unico degli id letti (stessa chiave React Query della pagina Patrimonio). Il flusso salvato di
  Giorgio, con `source.propertyId`, trova le stesse rate prima e dopo la migrazione (`__tests__/fireMortgages.test.ts`).
- **Lettori del fork.** `resolveAllocationRole` legge un prestito sempre come `excluded` (anche se una modifica a mano gli
  lascia `tradable`): `fireCapital`, `monteCarloWeights`, candidati dell'ottimizzatore, PAC, modello ed Esposizione passano
  tutti da lì. Una proprietà lorda più il suo prestito (classe immobili, negativo) dà lo stesso «fuori dal capitale» e lo stesso
  patrimonio netto del vecchio debito sulla proprietà (test). Gli Obiettivi non offrono un prestito nell'assegnazione.
- **Tetti.** Sette route sopra il tetto di un KB o due (`perf/budget.json`, riga nel registro di `velocita.md`).
- **Test.** `tsc` pulito, eslint 0 errori, Vitest 300 file / 6637 test verdi sotto `Europe/Rome` e `TZ=UTC`, `perf:build` +
  `perf:budget` verde. **Non eseguiti nel cloud**: Playwright (`cashflow.mortgage`, `fork-features`, `assets.bond`, `cashflow.transfer-fee`)
  e la prova sul mirror, sul Mac di Giorgio.
- **Prova sul mirror (D-UP3), prima del merge.** Con gli emulatori su: (1) `npm run mirror:seed -- <email>` (lo lancia
  Giorgio); (2) prima di aprire Patrimonio, annotare dalla FIRE «Il mio piano» › Flussi nel tempo il mutuo collegato (rata,
  fine), il numero FIRE del Calcolatore e il patrimonio netto; (3) aprire Patrimonio sul branch: nasce un prestito «Mutuo
  {casa}» e la casa torna lorda; (4) riaprire la FIRE: **stessa rata e stessa fine del mutuo, stesso numero FIRE, stesso
  patrimonio netto**; (5) salvare il piano e ricaricare: il flusso resta collegato; (6) `npm run mirror:remove`.
  Esito atteso: nessuna riga «mutuo scollegato» tra i flussi esclusi, e le cinque viste di Esposizione senza il prestito.

## 10. T5 — MOB-01…09, composizione mobile e tablet (fatta, da provare con Playwright e sul mirror)

Merge di upstream fino a a66f822f (#470); circa 93 file in conflitto, risolti a mano.

- **Pagine condivise.** La composizione di upstream (verdetto · asse · striscia · tile principale aperto · «Il resto della
  pagina», rail di icone in orizzontale) è presa intera su Panoramica, Patrimonio, Cashflow, Analisi, Dividendi, Rendimenti,
  Storico, Previdenza, Hall of Fame, Allocazione e le sei schede FIRE, con la logica del fork dentro.
- **Il fork resta in griglia semplice (D-UP4).** Accumulo, Proiezione, «Il mio piano», Simulazioni; nel Calcolatore Età
  obiettivo e Sensibilità, nel Monte Carlo Spesa sostenibile sono tile piani dopo la scena. Distribuzione, Milestone e
  CoastIpotesi restano cancellati; la cella «Mediana» del Monte Carlo scorre al tile principale
  (`MONTE_CARLO_SECTION_IDS.probabilita`), perché la riga Distribuzione non esiste.
- **Allocazione.** Le due schede, il verdetto `pac` con `pacNote` e l'Esposizione del fork sotto la riga dell'Esposizione.
- **Decisioni di dettaglio.** Il chip «Evoluzione» tiene la didascalia `w-fit` del fork (il test di upstream è adattato);
  la risposta chiusa del Reddito FIRE è «copre le spese al N%» (`fireRedditoAnswer`); l'unione del verdetto PAC usa «. »;
  `emailNarrative` e `weeklyBudgetEmailService` ora devono mockare `@/lib/firebase/config`, perché `allocazioneNarrative`
  prende valori da `allocazioneSummary` come in upstream (la catena arriva a `assetService`).
- **Documentazione.** `doc/perf` e `doc/mobile` non sono più nell'albero; AGENTS, CLAUDE, DESIGN e le guide nella forma di upstream.
- **Tetti.** Tutte le route sopra il tetto di 1…11 KB (Allocazione 807 → 818, la più grande), condivisi 544 → 550: tetti
  alzati alla misura, riga nel registro di `velocita.md`; **da confermare dal proprietario**.
- **Test.** `tsc` pulito, eslint 0 errori, Vitest 315 file / 7098 test verdi sotto `Europe/Rome` e `TZ=UTC`, `perf:build` +
  `perf:budget` verde. **Non eseguiti nel cloud**: Playwright (vedi sotto) e `mobile:census`, sul Mac di Giorgio.
- **Da rilanciare sul Mac prima del merge** (emulatori su): `allocation`, `allocation.mobile`, `fire`, `fire.mobile`,
  `coast.mobile`, `history.mobile`, `analisi.mobile`, `overview.mobile`, `overview.tablet`, `patrimonio.tablet`,
  `cashflow.tablet`, `pension.mobile`, `settings.mobile`, i `mobile-composition.*`, poi `npm run test:e2e` intero e
  `npm run mobile:census`. A mano sul mirror: giro a 390, 768, 1024 e 1440 su Allocazione (due schede), le sei schede FIRE
  e le superfici del fork (Accumulo, Proiezione, «Il mio piano»).
