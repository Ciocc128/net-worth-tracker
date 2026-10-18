# Contributi verso upstream e composizione «light» delle superfici del fork (dossier)

> Analisi del 18/10/2026, chiesta dal proprietario: «ora va capito come strutturare le PR verso upstream per portare da
> lui le nuove feature che abbiamo fatto e capire delle nuove feature quali componenti lasciare nella nuova versione light
> del mobile e quali togliere». Un solo dossier per le due domande, perché ciò che va verso upstream deve già uscire
> nella forma per telefono e tablet.
> Questo dossier non cambia codice e non apre nulla verso upstream: niente PR, issue o commenti. Le decisioni D-CU1–D-CU12
> (§ 7) le ha prese il proprietario lo stesso giorno («ok mi torna»).

Confronto: `Ciocc128/net-worth-tracker:main` (`34a3a71`, dopo la PR #120) contro `GiuseppeDM98/net-worth-tracker:main`
(`9a5b318e`, PR #476 del 17/10) e `develop` (`c54a6159`).

## 1. In breve

- Il fork ha **400 commit** che upstream non ha: circa **75.000 righe** (42.000 di codice, 20.000 di test, 13.000 di
  documentazione e dati) su 579 file, di cui 254 solo nel fork. Portarle tutte non è realistico e non serve: upstream
  rifà da sé i disegni grandi (l'issue #402 sull'Esposizione è diventata la sua PERF-00, a tre viste invece di cinque).
- La proposta divide le feature in **tre gruppi** (§ 3):
  1. **PAC e ottimizzatore**, che upstream conosce già dall'issue #420: tre PR in fila;
  2. **Simulazioni e FIRE** (Monte Carlo a sette classi, ipotesi reali in euro, flussi datati, «Il mio piano», Proiezione,
     Dopo il FIRE): prima un'issue nuova con la mappa, poi le PR solo se upstream dice sì;
  3. **piccole correzioni** generali, una PR ciascuna, da verificare prima su `upstream/develop`.
- Restano **solo nel fork**: email e AI su OpenRouter, Wiki e TheBull, l'Esposizione a cinque viste con le tabelle curate e
  «Coperto dal cambio in EUR», Lime Frost e le scelte di resa (scrub dello Storico, banda del mese corrente, etichette
  mai tagliate), «Traguardi».
- **Prima di qualunque PR** servono tre passi nel fork (§ 5): l'undicesimo riallineamento (upstream ha già 9 commit nuovi,
  #471–#475, 15 file in conflitto); la **composizione per telefono e tablet delle superfici del fork**, che chiude il
  D-UP4 rimasto aperto e risponde alla seconda domanda (§ 6); l'aggiornamento dell'issue #420, che Giorgio deve ancora
  pubblicare.
- **Mobile «light»**: la regola di upstream è «il telefono mostra meno, mai altro» (DESIGN.md → The First-Screen Rule).
  Quindi nessun tile del fork sparisce del tutto: sotto `desktop:` ogni superficie ha un verdetto, al massimo quattro
  cifre nella striscia, UN tile aperto e il resto in righe chiuse. Si tolgono dal primo schermo «Il mio piano» e «Ipotesi
  usate», che oggi stanno sopra il verdetto, e si rifanno come liste gli editor larghi (§ 6).

## 2. Stato di partenza

### 2.1 Upstream oggi

- `main` = `develop` + la release del 17/10: dopo `a66f822f` (#470, il punto del decimo riallineamento) sono arrivati
  #471–#475: esclusione dal budget, **intestatari degli asset**, quote per persona in unità o percentuale, **quote degli
  obiettivi in unità**, prestiti netti in Allocazione, `theme-color`. Una prova di merge (`git merge-tree`) dà **15 file
  in conflitto**, tra cui `goalsNarrative.ts` e `AssetAssignmentDialog.tsx`, che toccano gli obiettivi nel FIRE del fork
  (O1–O2).
- Upstream lavora a **serie di spec** (PERF-00…14, MOB-01…09) e su `develop`; ogni pagina è composta per telefono e tablet,
  con un budget del primo schermo (`npm run mobile:budget`, tolleranza zero) e uno di peso (`npm run perf:budget`).
- La sua Esposizione ha **tre viste** (Titoli · Settori · Emittenti), legge **solo Yahoo** e dice «non letto», mai una
  stima (doc/guide/allocazione.md di upstream, § Esposizione). Non ha Geografia né Valuta.
- Il suo Monte Carlo ha quattro classi su una normale a media aritmetica, scenari scritti a mano nella scheda
  (`monteCarloScenarios`); il FIRE ha tre tassi per scenario scritti a mano (`fireProjectionScenarios`).

### 2.2 Come upstream ha accolto i contributi del fork finora

| Contributo | Esito |
|---|---|
| #319 «i flussi seguono la base», #323 copertura previdenza, #326 G/P in euro contro euro | #319 reimplementata da upstream sulla sua base, #323 e #326 unite «with changes» (doc/guide/{rendimenti,previdenza,patrimonio}.md di upstream) |
| #391 `fix/leveraged-plan` | Unita così com'era |
| #400, #401, #403 (ruoli 50/30/20, Flusso al telefono, chip di classe composito) | Rifatte da upstream in un commit solo (#405, `17b92183`), con Giorgio come `Co-authored-by` e un elenco di correzioni |
| #402 Esposizione | Diventata la spec PERF-00, scritta e implementata da upstream con un altro disegno |
| Issue #420 PAC e ottimizzatore | Aperta il 30/09, nessuna risposta al 02/10; il testo aggiornato (`/mnt/project-files/upstream-420/aggiornamento-issue-420.md`) non è ancora pubblicato |

Da qui il **protocollo di upstream**, scritto nel suo AGENTS.md (§ Commands, «An accepted PR merged "with changes"»):
- applica il diff di una PR, non i suoi commit: un commit solo, l'autore come `Co-authored-by`;
- non prende mai i pezzi di `CLAUDE.md` e le bozze della PR;
- un contributo arriva **prima** di una spec che riscrive gli stessi file (chi contribuisce è quello che farebbe il rebase);
- cerca per primi **cinque difetti** trovati nelle PR del fork del 27/09:
  1. una frase o una cifra nata in un componente invece che in un `*Narrative.ts`/`*Summary.ts`;
  2. un overflow verificato su `document` invece che su `main`;
  3. un'assenza verificata senza un'ancora positiva;
  4. un hook che gira con la sua feature spenta;
  5. una scrittura che non invalida la chiave che il suo lettore legge.

## 3. Inventario: cosa ha il fork che upstream non ha

Righe aggiunte (codice + test, senza doc) misurate con `git diff --numstat upstream/main origin/main` per area.

| Area | Dossier | Righe | Dipende da | Valore per upstream | Proposta |
|---|---|---|---|---|---|
| **PAC, scheda Accumulo** (piano, Questo mese, Classi del piano, Registra, Rivedi, Riattiva, Piani conclusi, gruppi di strumenti, nota sul Piano) | doc/pac-ottimizzatore, doc/allineamento AL1–AL3, AL17 | ~8.800 | niente del fork | Alto: «cosa compro questo mese» manca | **Gruppo 1** |
| **Portafoglio modello e ottimizzatore** (solver ad active set, criteri del modello, strumenti da valutare, modello ↔ piano) | doc/pac-ottimizzatore, AL4–AL5 | ~8.400 | PAC; la geografia legge le tabelle curate | Alto | **Gruppo 1**, senza geografia |
| «Con vendite mirate» (tetto di tasse) | doc/weight-optimizer-targeted-ate.md | (dentro il precedente) | ottimizzatore | Medio | **Gruppo 1**, PR a parte |
| **Monte Carlo a sette classi** (lognormale su CAGR, correlazioni, leva, ipotesi reali in euro, incertezza sul parametro, ancore BCE dal cron, copertura del cambio, archivio dei dati) | doc/montecarlo | ~7.500 | — | Alto ma cambia il modello | **Gruppo 2**, issue prima |
| **FIRE sulle ipotesi** (L1–L3, K1, EF1, C1, NF1, CG-A) | doc/fire-ipotesi | ~12.500 con i punti sotto | Monte Carlo (Impostazioni › Simulazioni) | Alto, cambia ogni cifra del FIRE | **Gruppo 2** |
| Flussi datati, «Il mio piano», What If «Quando», «Aggiungi al piano» (F1–F3, H1–H2, WP) | doc/fire-ipotesi | (sopra) | FIRE sulle ipotesi | Alto | **Gruppo 2** |
| Proiezione (sesta scheda), Dopo il FIRE, Spesa sostenibile, Età obiettivo | doc/montecarlo § 11–13, doc/fire-ipotesi | ~2.300 + (sopra) | Monte Carlo, FIRE | Alto | **Gruppo 2** |
| Obiettivi nel FIRE e incertezza (O1–O2) | doc/fire-ipotesi § 13 | (sopra) | flussi datati; scontra le quote degli obiettivi di #473 | Medio | **Gruppo 2**, ultimo |
| Esposizione a cinque viste, tabelle curate, Emittenti dal resolver, `currencyHedge` (AL20) | fork-scelte-ui.md § 1 | ~2.500 | motore del fork | Contro il principio di upstream («solo Yahoo, mai una stima») | **Resta nel fork** |
| Email e AI: rotte OpenRouter, GPT-6.1 Sol, Wiki F3–F5, TheBull, valutazioni AI | doc/ai-open-models-wiki.md | ~9.500 | il vault privato | Personale | **Resta nel fork** |
| Lime Frost, banda del mese corrente, scrub dello Storico, etichette mai tagliate, «Traguardi» | fork-scelte-ui.md § 1–2 | ~1.100 | — | Gusto del proprietario; upstream ha ritirato lo scrub di proposito | **Resta nel fork** |
| «Analizza con AI» nascosto senza chiave; metà portafoglio delle email con le regole delle pagine; 50/30/20 nelle email; guardia sulla prima operazione | — | piccoli | — | Correzioni generali | **Gruppo 3**, da verificare |

Non vanno in nessun gruppo `.claude/settings.json`, `AgentationToolbar`, la chiave di cache `v{n}-fork` e gli script del
mirror già presenti in upstream.

## 4. Regole di ogni contributo

- **RC1 · Base.** Ogni PR nasce da `upstream/develop` aggiornato, su un branch `pr/<nome>` del fork, con un commit solo. La
  PR verso upstream la apre Giorgio, o un thread solo su sua richiesta esplicita nel thread (istruzioni di progetto).
- **RC2 · Lo stato di oggi, non la storia.** Si porta la feature com'è sul main del fork, con le rifiniture già dentro
  (AL1–AL6 non esistono come PR a sé). Il codice si riscrive sulla base di upstream; non si fa cherry-pick dei commit del
  fork, che sono intrecciati con i riallineamenti.
- **RC3 · Il corpo non cita file del fork.** Il testo per GitHub si prepara in `doc/contributi-upstream/<id>.md` nel fork
  (come doc/patrimonio-pmc-eur-pr.md), in inglese come l'issue #420. Le guide di upstream (`doc/guide/<tema>.md`, AGENTS.md
  § 3) si aggiornano nella sua forma; CLAUDE.md di upstream no.
- **RC4 · Già composta.** Ogni superficie nuova arriva composta per telefono e tablet (DESIGN.md → Small-Screen
  Composition), con la sua `§ Composizione mobile` nella guida, la voce in `perf/mobile-budget.json` e una spec
  `*.mobile.spec.ts`. È il motivo per cui la composizione si fa prima nel fork (§ 5, passo M).
- **RC5 · I cinque difetti.** Prima di proporre la PR si controllano i cinque difetti del § 2.2, file per file.
- **RC6 · Verifiche.** Sulla base di upstream: `tsc`, eslint, Vitest sotto `Europe/Rome` e `TZ=UTC`, `perf:budget`; sul
  Mac le E2E dell'area, le `.mobile` e `mobile:budget`. Cifre dei test inventate e tonde (WORKFLOW.md § 1 regola 7).
- **RC7 · Firestore.** Una collezione nuova arriva con la sua regola in `firestore.rules` e il test delle regole; il corpo
  della PR dice che va pubblicata a mano.
- **RC8 · Una alla volta.** Una sola PR aperta verso upstream. Quando upstream la integra, al riallineamento successivo il
  fork prende la versione di upstream e cancella la propria: da quel momento la fonte è upstream.

## 5. Piano e ordine

| Passo | Cosa | Dove | Thread |
|---|---|---|---|
| **R11** | Undicesimo riallineamento: upstream fino a #476 (15 conflitti; attenzione a quote degli obiettivi e intestatari contro O1–O2) | fork | impl, Sonnet |
| **M1–M5** | Composizione per telefono e tablet delle superfici del fork (§ 6) | fork | spec breve per superficie, poi impl |
| **I420** | Giorgio pubblica l'aggiornamento dell'issue #420, rivisto con le tre PR del § 5.1 | upstream (Giorgio) | — |
| **U1–U3** | Gruppo 1, in fila (§ 5.1) | `pr/*` su `upstream/develop` | impl |
| **C1–C4** | Gruppo 3, una alla volta tra una U e l'altra, solo se la verifica su `upstream/develop` conferma il difetto | `pr/*` | impl breve |
| **I-SIM** | Issue «Simulazioni e FIRE in euro reali» con la mappa del § 5.2 e le domande | upstream (Giorgio) | il testo lo prepara un thread |
| **S1–S6** | Gruppo 2, solo dopo il sì di upstream e nella forma che chiede | `pr/*` | impl |

L'ordine risponde a tre vincoli: upstream rifà a modo suo ciò che non ha chiesto (#402), quindi il PAC, già annunciato,
va per primo; una PR deve arrivare composta (RC4), quindi M precede U; il gruppo 2 riscrive il FIRE, quindi aspetta un sì.

### 5.1 Gruppo 1 — PAC e ottimizzatore (issue #420)

- **U1 «Accumulo: a monthly accumulation plan».** La scheda Accumulo con il piano: verdetto, Questo mese con «Registra»
  (le due prop opzionali di `TransactionDialog`), Classi del piano, Piani conclusi con «Riattiva», «Rivedi il piano»,
  gruppi di strumenti nel piano, la riga del PAC nel verdetto di Bilanciamento e la nota sul Piano. Collezione
  `accumulationPlans` con la sua regola. Senza portafoglio modello: «Parti da» offre i target di Allocazione.
- **U2 «Model portfolio and weight optimizer».** `modelPortfolios/{ownerId}` con la regola, il solver ad active set, i
  criteri del modello nella scheda («Prova» / «Salva i criteri»), gli strumenti da valutare a 0 quote, «Parti da» il
  modello, «Usa i pesi del piano», il confronto piano ↔ modello. **Senza il criterio di geografia** (D-CU5).
- **U3 «Targeted sales».** «Con vendite mirate» con il tetto di tasse e le vendite parziali, sullo stesso solver.

### 5.2 Gruppo 2 — Simulazioni e FIRE (dopo l'issue)

Proposta di sequenza da mettere nell'issue, ognuna utile da sola:
- **S1** Ipotesi di mercato in Impostazioni › Simulazioni e Monte Carlo a sette classi: lognormale, correlazioni, euro reali
  (T1, T2, Q1). Prerequisito: le licenze dei dati in `data/montecarlo/` verificate (punto aperto P3).
- **S2** Leva, incertezza sul parametro, copertura del cambio (T3, Q2, Q4).
- **S3** Ancore BCE aggiornate dal cron, archivio dei dati (Q3, Q5): un cron e un documento Firestore nuovi.
- **S4** Il FIRE legge le ipotesi: rendimento dal portafoglio target, Fisher, un capitale, una spesa, costi, fondo di
  emergenza (L1–L3, K1, EF1, C1, NF1, CG-A).
- **S5** Flussi datati e «Il mio piano», What If «Quando» (F1–F3, H1–H2).
- **S6** Proiezione, Dopo il FIRE, Spesa sostenibile, Età obiettivo; poi gli obiettivi nel FIRE (O1–O2), riscritti sulle
  quote degli obiettivi di upstream.

### 5.3 Gruppo 3 — piccole correzioni

Ognuna parte solo se la verifica su `upstream/develop` mostra lo stesso difetto:
- **C1** «Analizza con AI» compare solo se il server ha la chiave (`PerformanceAiAvailability`).
- **C2** La metà portafoglio dell'email periodica misurata con le regole delle pagine (`emailPortfolio.ts`, F1b).
- **C3** Le email dividono la spesa per ruolo 50/30/20 quando `spendingRolesEnabled` è acceso.
- **C4** La guardia sulla prima operazione con il suo rimedio (apertura `isBaseline`), dopo la card FIX nel fork.

## 6. Composizione «light» delle superfici del fork

### 6.1 La regola

Sotto `desktop:` (1440) una pagina mostra: titolo del verdetto, prima frase, una striscia di al massimo quattro cifre,
UN tile aperto, poi «Il resto della pagina» con le righe chiuse nell'ordine del DOM. A 768 due colonne, in orizzontale la
scena con l'indice e le risposte delle righe chiuse. Il primo schermo a 390 tiene al massimo cinque cifre fuori dal
verdetto. «Togliere» quindi vuol dire una di tre cose:
- **fuori dal primo schermo**: il tile diventa una riga chiusa;
- **una cifra in meno**: un dato già nella striscia non si ripete nel tile (The Lifted-Figure Rule);
- **un'altra forma per lo stesso contenuto**: una tabella larga diventa una lista, come il Sankey diventa barra e righe.

Nessun tile del fork sparisce dal telefono (D-CU7).

### 6.2 Superficie per superficie

| Superficie | Tile aperto | Striscia (≤ 4) | Righe chiuse, in ordine | Cosa si toglie o cambia sotto `desktop:` |
|---|---|---|---|---|
| **M1 · Allocazione › Accumulo**, con un piano | Questo mese, con «Registra» | Rata del mese · Rate fatte (k di N) · Classe più lontana dal target (pp) | Classi del piano · Portafoglio modello · Criteri del modello · Piani conclusi (se ci sono) | Il grafico di Classi del piano a 120px. Il Calendario diventa una lista per mese. Nel modale del piano, l'anteprima laterale (`PlanDraftSidePanel`) diventa una riga chiusa «Anteprima» in fondo al passo |
| Allocazione › Accumulo, senza piano | AccumuloVuoto | nessuna | Portafoglio modello · Criteri del modello · Piani conclusi | — |
| **M2 · FIRE › Proiezione** | Tappe | Mediana a N anni · Probabilità della soglia | Ventaglio · Scenari a confronto · Parametri | Il Ventaglio a 120px quando è aperto. I pesi in Parametri restano un campo per riga |
| **M3 · FIRE › «Il mio piano»** | — (sta sopra le schede) | — | **Una riga chiusa sola** sopra le schede: «Il mio piano», con la risposta («44 anni → 55, 30.000 € l'anno, SWR 3,5%»); dentro i quattro tile (Tu · Spesa e prelievo · Flussi nel tempo · Pensioni) e «Salva il piano» | Il blocco aperto esce dal primo schermo (D-CU8) |
| **M3 · «Ipotesi usate»** (sopra ogni verdetto FIRE) | — | — | — | Diventa una riga sotto la striscia, come la riga di scope: «Ipotesi: Base 4,1% reale, costi 0,3%»; i quattro chip nel popover. Oggi sta sopra il verdetto e lo spinge giù (D-CU9) |
| **M4 · Calcolatore**: Età obiettivo, Sensibilità | Traguardo (di upstream) | quella di upstream | dopo Scenari: **Età obiettivo** · **Sensibilità**, righe chiuse con il loro aside | Oggi sono tile piani dopo la scena (D-UP4): diventano righe (D-CU10) |
| **M4 · Dopo il FIRE**: Spesa sostenibile | Probabilità (di upstream) | + cella «Spesa al 90%» che apre Spesa sostenibile | Spesa sostenibile · Scenari · Parametri | Il tile piano diventa la prima riga (D-CU10) |
| **M5 · Allocazione › Esposizione** a cinque viste | — (è una riga) | — | — | La pillola delle viste scorre in orizzontale (`SegmentedPill`), come già fa a 390 |
| Impostazioni › Simulazioni | — | — | — | Impostazioni non è composta in upstream. La matrice delle correlazioni diventa una lista delle 21 coppie, le modificate in alto |

Le righe chiuse hanno un aside in parole (mai una cifra) e, in orizzontale, una risposta con al massimo una cifra
(The Closed-Row Rule): i testi si scrivono nei `*Narrative.ts` della superficie, come per le pagine di upstream. Le cifre
della striscia si leggono dai riassunti già esistenti (`buildAccumuloVerdict`, `summarizeProjection`,
`sustainableWithdrawal`), mai ricalcolate.

### 6.3 Cosa serve per chiudere ogni M

Le specifiche di M1–M5, superficie per superficie, sono in [`composizione-mobile.md`](composizione-mobile.md) (18/10/2026,
con le decisioni D-CU13–D-CU20, prese dal proprietario lo stesso giorno).

- Il controller `useMobileSections` della superficie, gli id e gli aside nei suoi `*Summary.ts`/`*Narrative.ts`.
- La `§ Composizione mobile` nella guida dell'area (`accumulo.md`, `fire-proiezione.md`, `fire.md`, `fire-monte-carlo.md`).
- Le voci in `perf/mobile-budget.json` sulla fixture del censimento (`census@example.com` va estesa con un piano PAC e un
  modello) e le spec `.mobile` e `.tablet`, sul Mac.

## 7. Decisioni (prese dal proprietario il 18/10/2026)

| ID | Decisione | Alternative scartate e motivo |
|---|---|---|
| **D-CU1** | Tre gruppi: PAC e ottimizzatore, Simulazioni e FIRE, piccole correzioni. Restano nel fork AI/email/Wiki, Esposizione a cinque viste con `currencyHedge`, Lime Frost e le scelte di resa, «Traguardi» | *Portare tutto*: 75.000 righe, e upstream rifà i disegni che non ha chiesto (#402). *Solo il PAC*: il Monte Carlo e il FIRE sono il valore più generale, ma vanno chiesti prima |
| **D-CU2** | Una PR per capacità, su `upstream/develop`, un commit, branch `pr/<nome>`, lo stato di oggi riscritto sulla base di upstream (RC1, RC2) | *Cherry-pick dei commit del fork*: 400 commit intrecciati con dieci riallineamenti. *Una PR grande*: upstream la spezzerebbe o la rifarebbe |
| **D-CU3** | Ordine R11 → M1–M5 → issue #420 aggiornata → U1 → U2 → U3, le C in mezzo, l'issue Simulazioni dopo U1 | *Prima le Simulazioni*: senza issue, e riscrivono il FIRE. *Prima le PR, il mobile dopo*: upstream non accetta una pagina non composta (RC4) |
| **D-CU4** | Una sola PR aperta verso upstream; dopo l'integrazione il fork prende la versione di upstream e cancella la propria (RC8) | *Tenere la versione del fork*: due versioni della stessa feature da mantenere a ogni riallineamento |
| **D-CU5** | U2 senza il criterio di geografia: legge le tabelle curate del fork, che upstream ha scelto di non avere | *Portare le tabelle curate*: contro «solo Yahoo, mai una stima» di PERF-00. *Geografia da Yahoo*: il motore di upstream non ha una vista Geografia |
| **D-CU6** | «Criteri del modello» viaggia con U2, che introduce la parola; «Traguardi» resta nel fork | *Proporre anche «Traguardi»*: rinomina una parola di upstream su tutto il FIRE senza un guadagno per lui |
| **D-CU7** | Sul telefono nessun tile del fork sparisce: si sposta in una riga chiusa, perde una cifra ripetuta o cambia forma (§ 6.1) | *Nascondere gli strumenti di modifica sotto `desktop:`*: Giorgio usa il telefono spesso, e «Registra» e «Rivedi» sono gesti mensili |
| **D-CU8** | «Il mio piano» sotto `desktop:` è una riga chiusa sopra le schede, con la risposta in parole e cifre del piano | *Lasciarlo aperto*: spinge il verdetto fuori dal primo schermo. *Spostarlo in Impostazioni*: H1 lo vuole in testa al FIRE |
| **D-CU9** | «Ipotesi usate» sotto `desktop:` è una riga sotto la striscia, i chip nel popover | *Sopra il verdetto come oggi*: viola The First-Screen Rule. *Dentro «Il perché»*: le ipotesi cambiano il senso di ogni cifra, non possono stare dietro un tocco (The Binding-Clause Rule) |
| **D-CU10** | Età obiettivo, Sensibilità e Spesa sostenibile diventano righe chiuse; Spesa sostenibile ha anche una cella nella striscia di Dopo il FIRE | *Tile piani dopo la scena* (oggi, D-UP4): fuori dal sistema delle righe, senza memoria né risposta in orizzontale |
| **D-CU11** | Accumulo con piano: tile aperto Questo mese; striscia Rata del mese · Rate fatte · Classe più lontana | *Portafoglio modello aperto*: risponde a «come dovrei essere», non a «cosa faccio questo mese» |
| **D-CU12** | Proiezione: tile aperto Tappe; striscia Mediana a N anni · Probabilità della soglia | *Ventaglio aperto*: è un grafico, e sotto `desktop:` il grafico cede a 120px; Tappe risponde in parole e cifre |

## 8. Punti aperti

- **P1** Le risposte di upstream all'issue #420: scheda o pagina per Accumulo, collezione Firestore nuova, taglio e ordine
  delle PR, base `develop`.
- **P2** Se upstream preferisce scrivere lui le Simulazioni come una sua spec (come PERF-00): in quel caso il contributo è
  il dossier, non il codice.
- **P3** Le licenze dei dati in `data/montecarlo/` (testfolio, Damodaran, AQR, BCE, FRED) per una repo pubblica. La
  riscrittura su `claude/impl-q5-licenze-fonti-mjqguv` ha stato non verificato.
- **P4** Se upstream accetta un cron e un documento Firestore nuovi per le ancore BCE (S3).
- **P5** Le C1–C3 vanno verificate su `upstream/develop`: upstream può averle già corrette in altro modo.
- **P6** Chi apre le PR verso upstream: Giorgio a mano, o un thread su sua richiesta.

## 9. Criteri di accettazione

- **Del dossier**: D-CU1–D-CU12 confermate (18/10); le card Todoist seguono il § 5 (R11, M1–M5, U1–U3, C1–C4, I-SIM).
- **Di ogni M**: a 390 il primo schermo ha il verdetto, al massimo quattro cifre nella striscia, il tile aperto e la prima
  riga chiusa sopra la pillola; `npm run mobile:budget` verde con le voci nuove; le spec `.mobile` e `.tablet` della
  superficie verdi sul Mac; a 1440 la pagina è identica a oggi (nessuna regressione in `e2e/allocation.spec.ts`,
  `e2e/fire.spec.ts`).
- **Di ogni U, S e C**: il branch `pr/<nome>` si applica su `upstream/develop` aggiornato; `tsc`, eslint e Vitest verdi
  in entrambi i fusi su quella base; E2E dell'area verdi sul Mac; il corpo in `doc/contributi-upstream/<id>.md` non cita
  file del fork; i cinque difetti controllati e annotati nel corpo.
