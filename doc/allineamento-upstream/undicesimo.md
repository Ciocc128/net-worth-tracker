# Allineamento a upstream del 18/10/2026 — undicesimo riallineamento (R11, dossier)

> Analisi in sola lettura del 18/10/2026, primo passo del piano `doc/contributi-upstream/README.md` (§ 5, riga R11;
> D-CU3). Il decimo riallineamento è in `README.md` di questa cartella: modello, regole comuni e rischi silenziosi
> S1–S3 restano validi e non si ripetono. Le decisioni D-R11-1…D-R11-5 (§ 5) sono **proposte**: valgono quando il
> proprietario le conferma. Questo dossier non cambia codice.

Confronto: `Ciocc128/net-worth-tracker:main` (`21992f3c`, dopo la PR #121) contro
`GiuseppeDM98/net-worth-tracker:main` (`9a5b318e`, PR #476 del 17/10). Merge-base `a66f822f` (#470), il taglio di T5.
Misure con `git merge-tree` e con una prova di merge su una copia (risolta a macchina, buttata via, § 8).

## 1. Obiettivo

Portare nel fork le tre PR di funzionalità che upstream ha rilasciato dopo il decimo riallineamento, senza perdere
la logica del fork sugli Obiettivi nel FIRE (O1–O2), sul nome «Traguardi» (D-AL5) e sui lettori che lasciano fuori i
debiti (T4). È la condizione per M1–M5 e per qualunque PR verso upstream (D-CU3).

## 2. Perimetro

**Incluso** — upstream da `a66f822f` a `9a5b318e`: 9 commit, di cui 3 di funzionalità, 84 file (+2711 / −306).

| PR upstream | Commit | Cosa porta | Peso sul fork |
|---|---|---|---|
| #471 | `952fe509` | «Fuori dal budget» su una spesa (`Expense.excludeFromBudget`, un solo cancello `countsTowardBudget`); la barra del browser segue il tema (`ThemeColorSync`, `themeColor.ts`); **«Intestatario» sugli asset** (`ownerMemberId`, tile Intestatari in Panoramica e Patrimonio, filtro in Strumenti); **in Allocazione un prestito segue ciò che finanzia** (`resolveAllocationRoleWithin`: Immobili e Liquidità netti dei debiti); la casa con mutuo netta in «Asset principali» | Medio: il significato dei prestiti in Allocazione (§ 4, R11-S2) |
| #473 | `b08dff8a` | La «fetta» di un asset in quote o in percentuale (`lib/utils/assetSlice.ts`); intestatari per quota (`ownerShares`); **quote degli obiettivi in quote** (`GoalAssetAssignment` diventa un'unione, `assignmentFraction`) | **Alto**: gli Obiettivi nel FIRE del fork leggono la percentuale (§ 4, R11-S1) |
| #475 | `231e71c0` | Quote degli intestatari anche in percentuale, con un interruttore nel form | Basso |
| #472, #474, #476 | merge | Rilasci `develop` → `main` | Nessuno |

**Escluso**: nulla di upstream resta fuori. Restano fuori, come sempre, le superfici solo del fork elencate in
`doc/guide/fork-scelte-ui.md` e nel § 1 di `doc/contributi-upstream/README.md`; la composizione mobile delle superfici
del fork è M1–M5, non questa tappa (D-UP4).

## 3. Conflitti misurati

**15 file in conflitto, 17 blocchi.** Di questi, 9 sono documentazione.

| File | Blocchi | Risoluzione proposta |
|---|---|---|
| `components/goals/AssetAssignmentDialog.tsx` | 2 | Gli import di tutte e due (il fork tiene `isLoanAsset`, T4: un prestito non si assegna). La riga di lettura di upstream (`describeModalStatus(status, IDLE_READING)`) con la parola del fork: «traguardo» (D-AL5) |
| `lib/utils/goalsNarrative.ts` + `__tests__/goalsNarrative.test.ts` | 1 + 1 | La frase di upstream («in percentuale o in quote…») con «traguardi» al posto di «obiettivi»; il test con `inUnits: null` di upstream |
| `components/assets/StrumentiTile.tsx` | 1 | La struttura di upstream (filtro Intestatario a ogni larghezza) con il `TOGGLE_ON_CLASS` del fork sui due bottoni |
| `components/expenses/ExpenseTable.tsx` | 1 | Tutti e due gli import (`categoryIconStyle` del fork, `EXPENSE_BUDGET_EXCLUSION_CHIP` di upstream) |
| `lib/utils/exposureRequests.ts` + test | modifica / cancellazione | **Restano cancellati** (D-UP1). La modifica di upstream esclude i prestiti dalla base dell'Esposizione: nel fork lo fa già `resolveAllocationRole` (T4), nulla da portare |
| `CLAUDE.md`, `AGENTS.md`, `DESIGN.md`, `README.md`, `Draft Release Temp.md`, `doc/guide/{allocazione,fire-obiettivi,prima-schermata-misure}.md` | 9 | Testo di upstream più le righe «Solo fork»; `Draft Release Temp.md` tiene il lato del fork come in T4. In `fire-obiettivi.md` «Traguardi» |

**Fusi senza conflitto ma da correggere** (la prova di merge li mostra a `tsc`):
- `lib/utils/allocationUtils.ts`: l'import `isLoanAsset` compare due volte (quello di T4 e quello di upstream). Uno va tolto.
- `lib/utils/datedFlows.ts:193`: `resolveGoalFlows` legge `assignment.percentage`, che una quota in quote non ha (R11-S1).

Con queste tre correzioni a macchina `tsc` è pulito e Vitest dà **318 file / 7149 test, uno rosso**: AQ42 di
`monteCarloDefaultsArchive` per il limite di 5 s (legge file grandi; verde da solo, non dipende dal merge).

## 4. Conflitti silenziosi

**R11-S1 — Le quote in quote e gli Obiettivi nel FIRE (O1–O2).**
- Upstream converte ogni quota in una frazione dell'asset con `assignmentFraction(assignment, asset)`, che vuole la
  `quantity`. Il fork ha un solo lettore suo: `resolveGoalFlows` (`lib/utils/datedFlows.ts:166`), chiamato da
  `useFireDatedFlows` e da `goalFireEffect`. Il suo `ResolveGoalFlowsContext` dà solo `assetValue`.
- `tsc` lo segnala, quindi non si perde in silenzio. Il rischio è la correzione facile e sbagliata: leggere 0 per una
  quota in quote, o trattare le quote come percentuale.
- Da fare: il contesto riceve la frazione (`assetFraction(assignment) → number`, costruita con `assignmentFraction`
  sugli asset del chiamante), e `outside = valore × frazione × (1 − dentro)`. La frazione **non si taglia a 1**, come in
  `calculateGoalProgress` di upstream: una quota cresciuta oltre l'asset è dichiarata nel tile Assegnazioni, non
  corretta di nascosto. `goalUncertainty` (O2) legge il valore attuale da `calculateGoalProgress`, che upstream ha già
  convertito: va solo coperto da un test.

**R11-S2 — In Allocazione i prestiti diventano netti; i lettori del fork no.**
- Upstream: `partitionByAllocationRole` e `buildHoldings` usano `resolveAllocationRoleWithin`. Un mutuo prende il ruolo
  della sua casa, un prestito personale è Liquidità negativa. Quindi Bilanciamento mostra Immobili e Liquidità
  **netti** dei debiti, e un piano non compra né vende mai un debito.
- Il fork (T4): `resolveAllocationRole` restituisce `excluded` per ogni prestito, e lo leggono `fireCapital`,
  `monteCarloWeights`, l'ottimizzatore (`buildStandaloneCandidates`, la base di `ObiettiviDialog` e
  `IdealCompositionDialog`), `modelPortfolio`, `accumulationPlanSchema`, `idealAllocationEditor` ed `exposureEngine`.
- Dopo il merge, git non dice nulla e la pagina cambia così:
  - **Bilanciamento** e tutto ciò che passa da `compareAllocations` diventano netti. Lo eredita anche il **PAC**
    (Accumulo, Questo mese, Calendario, anteprima del dialog), che misura le classi con `compareAllocations`.
  - **Ottimizzatore e portafoglio modello** restano lordi: i loro «pesi di oggi» sono sulla base degli strumenti
    investibili.
  - **FIRE, Monte Carlo ed Esposizione** restano senza debiti.
- La differenza si vede solo con un prestito su un immobile **dentro** l'allocazione, o con un prestito personale. Con
  il mutuo su una casa esclusa (prima casa) i numeri restano identici. Che sia il caso del conto di Giorgio è
  un'inferenza, non verificata: va guardato sul mirror (§ 7).
- Scelta proposta in D-R11-2.

**R11-S3 — «Fuori dal budget» e le email del fork.**
- Il cancello `countsTowardBudget` vive in `budgetUtils`. L'email settimanale del budget del fork (GLM) e gli avvisi
  di budget dell'email mensile passano da lì e lo ereditano. L'email settimanale legge le spese con
  `{ ...(e as Expense) }`, quindi il campo arriva.
- Restano invece con la riga, come vuole la regola di upstream («ogni altro totale tiene la riga»): il blocco dati
  dell'email mensile, il 50/30/20 (`summarizeSpendingByRole`), Analisi, FIRE e l'import CSV del fork.
- Nessuna correzione nel codice: serve un test che lo fissi sull'email settimanale.

**R11-S4 — Parole: «Traguardi» (D-AL5).** Upstream aggiunge due frasi per l'utente con «obiettivo/obiettivi» negli
Obiettivi del FIRE (la lettura del dialog di assegnazione e il piede di Assegnazioni). Vanno scritte con «traguardo» e
«traguardi». La frase in `lib/server/assistant/prompts.ts` è per il modello, non per l'utente: resta com'è.

**Minori:**
- La versione del riepilogo della Panoramica sale a 24. Le schede salvate si ricalcolano da sole alla prima lettura e
  nulla viene scritto a mano.
- `perf/mobile-budget.json` e `doc/guide/prima-schermata-misure.md`: upstream allarga due voci a 390, per la riga
  chiusa Intestatari. Il fork ha tetti suoi, quindi va rifatta la misura (`mobile:census` + `mobile:budget` sul Mac).
- `perf/budget.json`: nuovo codice in Patrimonio, Panoramica e Allocazione. Si rimisura con `perf:build` +
  `perf:budget`; un tetto alzato va con `raisedBy` e una riga nel registro di `velocita.md`, come in T2–T5.
- `ThemeColorSync` legge `--background` risolto: i due blocchi Lime Frost lo definiscono (`app/globals.css`, righe 887
  e 1059). `themeColor.test.ts` è verde nella prova.
- **Nessuna migrazione** scrive su Firestore in queste PR: intestatari, quote e «fuori dal budget» sono campi
  facoltativi, e la loro assenza vuol dire quello che voleva dire prima. Diversamente da T4, non serve la prova sul
  mirror prima del merge, ma basta un giro.

## 5. Decisioni (proposte, da confermare)

**D-R11-1 — Quote degli obiettivi in quote.**
- **Proposta:** prenderle intere, con `resolveGoalFlows` che legge la frazione di upstream (R11-S1) e le parole
  «traguardo/traguardi» (R11-S4).
- Scartata: tenere solo la percentuale nel fork. Upstream ha cambiato il tipo salvato, quindi ogni tappa successiva
  andrebbe in conflitto sullo stesso punto, e U1–U3 verso upstream partirebbero da un tipo diverso dal suo.

**D-R11-2 — Prestiti in Allocazione.**
- **Proposta:** prendere la lettura netta di upstream per Bilanciamento e per il PAC, che la eredita da
  `compareAllocations`. Ottimizzatore, portafoglio modello, FIRE, Monte Carlo ed Esposizione continuano a lasciare
  fuori i debiti (T4). Il motivo:
  - un peso di strumento non può essere negativo e un debito non si compra;
  - il mutuo è già nel FIRE come flusso datato (S2 del decimo), e netto anche nel capitale sarebbe contato due volte.
- La differenza tra le due basi si dichiara in una frase nel tile Portafoglio modello, solo quando esiste: «I pesi di
  oggi non contano i debiti: Bilanciamento li sottrae alla classe che finanziano». Va anche in
  `doc/guide/ottimizzatore.md` § Per-page blind spots.
- Scartata (a): portare l'ottimizzatore e il modello sulla base netta. Una classe sotto zero non ha un peso, e il
  risolutore dovrebbe imparare a gestire un ingresso negativo. Non è un merge.
- Scartata (b): togliere la lettura netta anche da Bilanciamento e restare come in T4. Il fork si staccherebbe da
  upstream proprio su `allocationUtils.ts`, il file che U1–U3 devono portare a upstream.

**D-R11-3 — Intestatari degli asset.**
- **Proposta:** prenderli interi, come sono in upstream. Le superfici del fork (FIRE, PAC, ottimizzatore, Esposizione)
  restano sull'intero nucleo familiare e non leggono `ownerMemberId` né `ownerShares`.
- Scartata: un FIRE o un PAC per persona. È una funzione nuova, non un riallineamento: se interessa, diventa una card
  in Backlog.

**D-R11-4 — «Fuori dal budget».**
- **Proposta:** prenderlo intero. Il cancello vale per Budget e per le due email di budget del fork; ogni altro totale,
  il 50/30/20 compreso, tiene la riga (R11-S3).
- Scartata: togliere la riga anche dal 50/30/20 e dal blocco dati dell'email mensile. Andrebbe contro la regola di
  upstream: la spesa poi rimborsata è spesa vera in ogni totale tranne il tetto del budget.

**D-R11-5 — Granularità.**
- **Proposta:** **una tappa sola** (R11-T1), cioè un merge di `9a5b318e` (#476) con una PR in bozza. I conflitti sono
  pochi (17 blocchi) e le tre PR toccano gli stessi file (`types/assets.ts`, `AssetDialog`, `assetOwnership.ts`).
- Scartata: tre tappe, una per PR. Tre PR e tre giri sul Mac per circa 15 file, e la #475 rifà a metà la #473: si
  risolverebbero due volte gli stessi blocchi di `AssetDialog`.

## 6. Tappa R11-T1 — merge di upstream fino a `9a5b318e` (#476)

Per il thread impl, su Sonnet 5.5 (regola del progetto) salvo diversa scelta di Giorgio. Valgono le regole comuni del
decimo (`README.md` § 7): merge commit e mai rebase; nessun push verso upstream; `fork-scelte-ui.md` § 1 per ogni file;
una riga «Latest upstream» in CLAUDE.md; una riga nella lista dei riallineamenti in testa a `fork-scelte-ui.md`.

1. **Il merge.** Branch da `origin/main`, `git fetch --unshallow origin` se il clone è shallow, remote `upstream` di sola
   lettura, poi `git merge 9a5b318e`. Si risolvono i 15 file del § 3 e le due correzioni a `tsc`.
2. **R11-S1.** `resolveGoalFlows` legge la frazione di upstream; `useFireDatedFlows` e `goalFireEffect` passano gli asset.
   Test in `__tests__/datedFlows.test.ts` e `__tests__/goalFire.test.ts` con i valori del § 9.
3. **R11-S2.** Nessun cambio ai lettori del fork. Ci vanno:
   - un test che fissa le due basi (Bilanciamento netto, ottimizzatore e FIRE senza debiti);
   - la frase nel tile Portafoglio modello, con la sua funzione pura in `weightOptimizerNarrative.ts` e il suo test;
   - la riga in `ottimizzatore.md`.
4. **R11-S3.** Un test sull'email settimanale del budget: una riga «fuori dal budget» non pesa sul tetto.
5. **R11-S4.** Le due frasi con «traguardo/traguardi», e i test di `goalsNarrative` aggiornati.
6. **Misure.** `perf:build` + `perf:budget` nel cloud. I tetti alzati vanno con `raisedBy` e una riga nel registro di
   `velocita.md`.
7. **Test nel cloud:**
   - `npm install`;
   - `npx tsc --noEmit`;
   - Vitest completo sotto `TZ=Europe/Rome` e `TZ=UTC`;
   - `npx eslint app components lib types e2e scripts __tests__`.
8. **Sul Mac di Giorgio, prima del merge** (emulatori su):
   - le spec toccate da upstream: `assets.rows`, `mobile-composition.patrimonio.mobile`, `overview.mobile`,
     `overview.tablet`, `shell.boot`, `shell.boot.mobile`;
   - le spec del fork: `allocation`, `allocation.mobile`, `fire`, `fork-features`;
   - poi `npm run test:e2e` intero e `npm run mobile:census` + `mobile:budget`.

**Rischio:** basso-medio. Pochi conflitti, nessuna scrittura in produzione. Il rischio vero è R11-S2, perché cambia i
numeri di Bilanciamento e del PAC a chi ha un prestito dentro l'allocazione.

## 7. Punti aperti

- **I numeri di Giorgio (R11-S2).** Se il conto ha un prestito personale o un immobile con mutuo dentro l'allocazione,
  Bilanciamento e la rata del PAC cambiano dopo il merge. Si vede nel giro sul mirror: prima e dopo, le percentuali di
  Immobili e Liquidità e la rata del mese. Se cambiano, la scelta D-R11-2 va riletta con i numeri davanti.
- **Gli intestatari nel conto di Giorgio.** Il tile Intestatari compare solo con almeno un membro della famiglia nelle
  impostazioni. Il fondo pensione di un membro della Previdenza conta già come suo (lo dice la PR #471).
  Nessuna azione: si guarda nel giro.

## 8. Come rifare le misure

```
git remote add upstream https://github.com/GiuseppeDM98/net-worth-tracker.git && git remote set-url --push upstream DISABLED
git fetch --unshallow origin; git fetch upstream
git merge-base origin/main upstream/main                       # a66f822f
git merge-tree --write-tree --name-only origin/main upstream/main   # 15 file
```
La prova del § 3: in una worktree, `git merge --no-commit upstream/main`; per ogni blocco in conflitto il lato di
upstream; i due file cancellati restano cancellati; poi le tre correzioni e `npx tsc --noEmit` e Vitest. È una misura,
non la risoluzione: il lato di upstream perde i pezzi del fork che il § 3 dice di tenere.

## 9. Criteri di accettazione

Valori di riferimento inventati e tondi (WORKFLOW.md § 1 regola 7).

**Obiettivi nel FIRE (R11-S1).** Prendiamo un traguardo «Alla scadenza lo spendo» da 20.000 €. Gli è assegnato un ETF
che vale 10.000 € per 100 quote ed è **fuori** dal capitale FIRE (dentro = 0).

| Quota assegnata | Quantità dell'ETF | Valore dell'ETF | Frazione | Fuori dal capitale | Uscita nel FIRE |
|---|---|---|---|---|---|
| 40% | 100 | 10.000 € | 0,40 | 4.000 € | 16.000 € |
| 40 quote | 100 | 10.000 € | 0,40 | 4.000 € | 16.000 € |
| 40% | 50 (dopo una vendita) | 5.000 € | 0,40 | 2.000 € | 18.000 € |
| 40 quote | 50 (dopo una vendita) | 5.000 € | 0,80 | 4.000 € | 16.000 € |
| 40 quote | 20 (dopo una vendita) | 2.000 € | 2,00 (dichiarata «da riassegnare») | 4.000 € | 16.000 € |

Con l'ETF **dentro** il capitale (dentro = 1) l'uscita è 20.000 € in ogni riga.

**Prestiti (R11-S2).** Conto con un ETF da 100.000 € (`tradable`), una liquidità da 20.000 € e un prestito personale da
−5.000 €.
- Bilanciamento: Liquidità **15.000 €** su una base di **115.000 €**.
- Pesi di oggi dell'ottimizzatore: base **120.000 €**, ETF 83,3% e liquidità fuori dai candidati, come oggi.
- Esposizione: base senza il prestito.
- Capitale FIRE: identico a prima del merge.

Con un mutuo da −120.000 € su una casa da 200.000 € **esclusa** dall'allocazione, ogni cifra di Bilanciamento, PAC,
ottimizzatore e FIRE è identica a prima del merge.

**Budget (R11-S3).** Mese con spese da 1.000 € e 200 €, la seconda «fuori dal budget», e un tetto di 1.100 €.
- Budget e email settimanale: speso 1.000 €, sotto il tetto.
- Email mensile, Analisi e 50/30/20: spese 1.200 €.

**Parole (R11-S4).** Nessuna stringa per l'utente sotto `components/goals` e in `goalsNarrative.ts` contiene
«obiettiv»; resta quella in `lib/server/assistant/prompts.ts`.

**Generale.**
- `tsc` pulito, eslint senza errori, Vitest verde sotto `Europe/Rome` e `UTC`, `perf:budget` verde.
- Sul Mac: Playwright completo verde, salvo i rossi intermittenti già noti in CLAUDE.md, e `mobile:budget` verde.
