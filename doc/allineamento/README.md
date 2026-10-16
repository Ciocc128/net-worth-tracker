# Allineamento dei flussi — review delle pagine (dossier)

> Scritto il 16/10/2026, dalla richiesta del proprietario: «un giro di review di tutte le attuali pagine […] i casi che
> uno vorrebbe prendere e poter incontrare […] tra il PAC e il calcolo dei pesi del portafoglio modello c'è ancora un
> po' di attrito nell'usabilità e nei flussi funzionali». Base di codice: `main` del fork a `ff6b52f2` (merge della PR
> #101). **Nessuna riga di codice cambia con questo dossier**: è l'analisi, con le decisioni (§ 8, prese dal
> proprietario lo stesso giorno) e i task che ne seguono (§ 7), da implementare in quattro onde.
>
> Il caso che l'ha aperto, lo stesso giorno: il PAC «PAC Soldi Value Betting» doveva comprare **MFEH** (iMGP DBi
> Managed Futures, classe EUR coperta) al posto di **DBMFE** tenendo le 138 quote di DBMFE nel 18% di Trend Following.
> Dall'app non si poteva fare (§ 4, C4); la revisione è stata scritta in produzione con `buildRevisedPlan` da uno
> script usa e getta, dopo un'anteprima approvata dal proprietario.

---

## 1. Metodo

- **Il conto vero, non un fixture**: `npm run mirror:seed` del 16/10/2026 sugli emulatori, server `dev:emulator`,
  Playwright a 1440 e 390 px su 24 viste (ogni pagina e ogni scheda) più i sei dialoghi del flusso PAC ↔ modello
  (Rivedi il piano ai passi 1–3, Ricalcola prima e dopo «Calcola», Modifica a mano, Modifica obiettivi, Calendario).
  Le immagini restano fuori dal repo (sono i dati del proprietario).
- **Ogni rilievo è controllato nel codice** prima di essere scritto, con il file e la riga. Un rilievo che la misura
  ha smentito non c'è (la colonna G/P di Patrimonio «tagliata» a 1440 era un artefatto dello screenshot: la tabella
  misura 1140 px su 1142 di contenitore).
- **I blind spot già dichiarati nelle guide non si ripetono**: chi li cerca li trova in fondo a ogni
  `doc/guide/<tema>.md`. Qui c'è solo ciò che nessuna guida dice, o che una guida dice ma il proprietario ha
  incontrato come attrito.

## 2. Il nodo: i pesi hanno quattro case

La domanda dell'utente è una sola: «dove deve stare il mio portafoglio, e cosa compro adesso?». L'app oggi la
risponde con **quattro sorgenti di pesi** che si parlano solo in parte.

| # | Sorgente | Dove si modifica | Chi la legge |
| --- | --- | --- | --- |
| S1 | **Target di Impostazioni** (classe → sottocategoria → strumento, `specificAssets`) | Impostazioni › Allocazione (il bottone «Modifica target» di Allocazione porta lì) | Bilanciamento (punteggio, Per classe, Piano: Versa · Ribilancia · Preleva), la traiettoria del PAC (D11), l'obiettivo «Classi» dell'ottimizzatore, i pesi del FIRE (Ventaglio, Monte Carlo, Proiezione: «Usa i target») |
| S2 | **Target derivati dagli Obiettivi** (Goal-Based Investing, FIRE › Obiettivi) | FIRE › Obiettivi | sostituiscono S1 a livello di classe quando attivi (`resolveEffectiveTargets`); l'intestazione di Allocazione dice «target dagli obiettivi» |
| S3 | **Portafoglio modello** (pesi per strumento, `modelPortfolios/{ownerId}`), nato dagli **obiettivi dell'allocazione ideale** (`settings.idealAllocation`) via l'ottimizzatore, o scritto a mano | Allocazione › Accumulo: «Ricalcola», «Modifica a mano», «Modifica obiettivi» | solo il PAC, e solo alla creazione o con «Parti da › Portafoglio modello» in revisione |
| S4 | **Posizioni del PAC** (copia di S3, poi vita propria; gruppi proxy con un solo strumento che compra) | editor del piano (crea, Rivedi) | «Questo mese», il calendario, la frase del PAC nel verdetto di Bilanciamento (PO3) |

**Cosa NON si parla** (misurato sul conto il 16/10):

1. **S4 → Bilanciamento.** Il verdetto di Bilanciamento dice «il piano di accumulo compra questo mese 4207 € in 7
   strumenti»; due righe sotto, il Piano › Ribilancia dice di **vendere 12.414 € di NTSG** e di **comprare 3609 € di
   DBMFE**. Il PAC non vende mai (D5) e compra MFEH. Sulla stessa scheda ci sono due istruzioni opposte, e nessuna dice
   dell'altra.
2. **S4 → S3.** Il conto ha un PAC attivo e **nessun portafoglio modello salvato** (letto in produzione): il piano è
   nato da «Ricalcola › Con vendite mirate» senza salvare il modello. Il tile Portafoglio modello dice «Nessun
   portafoglio modello» accanto a un piano che ne ha uno di fatto. Non esiste un gesto «salva i pesi del piano come
   modello» (`saveModelPortfolio` ha tre chiamanti: Ricalcola, Modifica a mano, il tile); il dossier PAC lo aveva
   escluso apposta (`doc/pac-ottimizzatore/README.md` § 3, «Il ritorno dei pesi dal PAC al portafoglio modello»).
3. **S3 → S4 dopo la creazione.** Cambiare gli obiettivi o il modello non dice niente al PAC aperto: nessun segnale
   «il piano diverge dal modello». Il percorso è Modifica obiettivi → Ricalcola → Salva come modello → Rivedi il
   piano → Parti da › Portafoglio modello: tre dialoghi in fila, nessuno che rimandi al successivo.
4. **S1 e S3 si modificano in due pagine.** L'ottimizzatore usa i target di classe di S1 come obiettivo «Classi»
   (essenziale), ma gli altri obiettivi stanno in Allocazione › Accumulo. Per spostare il Trend dal 20 al 18% si va in
   Impostazioni; per cambiare il fattore Momentum si resta in Accumulo.
5. **Lo strumento «equivalente» esiste solo nel PAC.** Il gruppo proxy (D6: più strumenti, un peso, uno solo che
   compra) è un concetto del PAC. Il modello, l'ottimizzatore, Versa/Ribilancia, Patrimonio e l'Esposizione non lo
   conoscono: per loro DBMFE e MFEH sono due strumenti senza relazione (§ 4, C4).

## 3. La parola «Obiettivi» ha tre significati

| Dove | Cosa vuol dire |
| --- | --- |
| FIRE › **Obiettivi** | i traguardi del Goal-Based Investing (una casa, un fondo emergenza), S2 |
| Intestazione di Allocazione, «target **dagli obiettivi**» | i target di classe derivati da quei traguardi, S2 |
| Allocazione › Accumulo › tile **Obiettivi** e «Modifica obiettivi» | i criteri dell'ottimizzatore (classi, leva, fattori, geografia, limiti), S3 |

Il proprietario che legge «target dagli obiettivi» in cima ad Accumulo, sopra il tile «Obiettivi», ha ragione a
pensare che siano la stessa cosa. Non lo sono.

## 4. I casi d'uso del PAC e del portafoglio modello

Esito: **sì** si fa dall'app in modo lineare · **in parte** si fa con passaggi che l'utente deve conoscere · **no**
non si fa dall'app.

| # | Caso | Esito | Percorso di oggi e attrito |
| --- | --- | --- | --- |
| C1 | Primo PAC, senza modello | sì | Crea piano → «Pesi di oggi» o «Ricalcola». |
| C2 | Disegno il portafoglio dagli obiettivi e lo salvo | sì | Ricalcola → Calcola → Salva come portafoglio modello. Il modale si intitola ancora «Composizione ideale» (`weightOptimizerNarrative.ts:286`). |
| C3 | Ho un PAC attivo e voglio che il modello sia quello del piano | **no** | Nessun gesto dal piano al modello. «Modifica a mano» parte dai pesi di OGGI (`seedModelFromToday`), non da quelli del piano. È lo stato del conto oggi. |
| C4 | **Sostituisco uno strumento con un equivalente** (DBMFE → MFEH coperto; un ETF più economico; un cambio di broker) tenendo il vecchio | **no** | In «Rivedi il piano» «Raggruppa» non c'è (`AccumulationPlanDialog.tsx:1081`, `!revise`) e neppure «Separa» (`:970`). Il nuovo strumento creato con «+ Nuovo asset» sparisce se si annulla la revisione: a 0 quote non è candidato (`:348-356`, valore > 0 o già nella bozza). Ricalcola non lo vede senza un modello salvato (candidati da valutare = strumenti del modello). Il Piano di Bilanciamento continua a comprare il vecchio. Patrimonio lo chiama «Azzerato». |
| C5 | Aggiungo uno strumento nuovo al piano durante una revisione | in parte | «+ Nuovo asset» funziona; se la revisione si annulla l'asset resta a 0 quote, orfano (vedi C4). |
| C6 | Valuto uno strumento che non ho | in parte | «Aggiungi strumento da valutare» è spento finché non esiste un modello salvato (`PortafoglioModelloTile.tsx:219`). Sul conto di oggi: spento. |
| C7 | Cambio gli obiettivi e voglio vederne l'effetto sul PAC | in parte | «Prova» nel modale degli obiettivi mostra il rapporto; il PAC si aggiorna solo con il percorso di § 2 punto 3. |
| C8 | Cambio un target di classe | in parte | In Impostazioni, un'altra pagina; cambia Bilanciamento, l'obiettivo Classi, la traiettoria del PAC e il FIRE in una volta, senza che Accumulo lo dica. |
| C9 | Il mese tipico: compro e registro | sì | «Registra» dalla riga, ricalibrazione proposta in riga (RP3, RP5). |
| C10 | Cambio i conti sorgente o la data della prossima rata di un piano attivo | **no** | In revisione conti sorgente e prima rata sono bloccati (`:707`, `:746`, `:819`). Si interrompe e si rifà. |
| C11 | Rimando o tolgo una vendita fuori piano già salvata | **no** | In revisione «le vendite già salvate si vedono ma non si tolgono» (`lockedSaleIds`). |
| C12 | **Ho interrotto il piano per errore** | **no** | «Interrompi» chiede due clic (armato), poi è definitivo: Piani conclusi non ha azioni, nessun «Riattiva». Il 16/10 è stato riattivato da uno script su Firestore. |
| C13 | Il Piano di Bilanciamento mentre il PAC è attivo | in parte | Solo il verdetto cambia (PO3). Versa, Ribilancia e Preleva ignorano il PAC: possono dire di vendere ciò che il PAC tiene e comprare ciò che il PAC non compra (§ 2 punto 1). |
| C14 | Leggo la rata del mese | in parte | Quattro cifre diverse per «la rata» sullo stesso piano: 4207 € nel tile (rata di ottobre), 4467,15 € al passo 1 di Rivedi (L/N), 4456,93 € nel pannello del passo 2, «5 rate da circa 4455 €» al passo 3 (media del calendario a quote intere). Ognuna è giusta per sé; nessuna dice quale sia. |

## 5. Difetti trovati

| # | Difetto | Prova |
| --- | --- | --- |
| R1 | Nel passo Target la **testa di un gruppo è il primo membro, non lo strumento che compra**: sul piano di oggi la riga «iMGP DBi Managed Futures · DBMFE» porta «34 quote» calcolate sul prezzo di MFEH, e MFEH sta sotto con «non riceve acquisti». Il piano scritto è giusto (`buyAssetId` = MFEH, il tile Questo mese mostra MFEH); sbaglia la tabella. Succede anche raggruppando dall'app: `confirmGroup` mette i membri nell'ordine della bozza. | `AccumulationPlanDialog.tsx:942` (`isHead = memberIndex === 0`), `:490` |
| R2 | Il **Calendario stampa le chiavi Firestore** delle classi: «equity −2,7 pp bonds +7,5 pp … trendFollowing −2,0 pp». La regola di AGENTS («a raw class key must never reach the screen») è violata. | `AccumulationCalendarDialog.tsx:176` |
| R3 | I bottoni di riga del Calendario sono **28 px anche sul telefono** (B4 non li ha presi). | `AccumulationCalendarDialog.tsx:208` (`h-7`) |
| R4 | La Panoramica scrive «Hai messo da parte il **−1926%** delle entrate finora» (77 € di entrate vissute, 1559 € di spese), accanto al tile Cashflow che dice «Messo da parte il 27%». Il tasso è stampato com'è, senza un limite oltre il quale si dice in euro. | `overviewNarrative.ts:335-341` |
| R5 | Un **target di sottocategoria al 100% dentro una classe allo 0%** è segnalato come «target senza asset ribilanciabili» e finisce nel verdetto («Il target Liquidità → Conti Correnti (100%) non è raggiungibile»). La sottocategoria non guarda il target della sua classe. | `allocationUtils.ts:822-838` |
| R6 | Uno strumento **creato vuoto per il PAC o da valutare** (D7) porta la chip «Azzerato» in Patrimonio, come uno venduto. MFEH oggi. | `StrumentiTile.tsx:428`, `AssetRow.tsx:283` |
| R7 | Il Calcolatore FIRE chiama «allocazione attuale» i pesi **target** del Ventaglio («57% su 1000 percorsi con l'allocazione attuale (70% azioni, …, 20% trend, 10% carry)»; oggi il portafoglio è al 69/27/8/17/7). | `fireNarrative.ts:401`, `:420`, `:429`; i pesi da `FireCalculatorTab.tsx:432` |
| R8 | Parole rimaste di prima di A2: «Il PAC può proporre i pesi…» in Impostazioni, «nella composizione ideale e nel passo Target del PAC» nel modale degli obiettivi, «Composizione ideale» come titolo del modale di «Ricalcola». | `settingsNarrative.ts:664`, `IdealAllocationTile.tsx:188`, `weightOptimizerNarrative.ts:283-286` |
| R9 | L'intestazione di Allocazione («112.574 € allocati · 5 classi · target dalle impostazioni» e «Modifica target») resta uguale anche sulla scheda Accumulo, dove i pesi vengono dal modello e dagli obiettivi. | `app/dashboard/allocation/page.tsx:392-418` |
| R10 | Il mirror di produzione **non copia `modelPortfolios`**: un giro guidato sul mirror mostra sempre «Nessun portafoglio modello». (Sul conto di oggi è vero comunque, per C3.) | `scripts/mirrorProdAccount.mts:34-35` |

## 6. Le altre pagine

Fuori da Allocazione il giro non ha trovato attriti di flusso dello stesso peso: le pagine rispondono ciascuna alla
sua domanda, e i blind spot noti sono scritti nelle guide. Quello che resta, oltre a R4, R6, R7:

- **Uno strumento con copertura del cambio non esiste come concetto.** MFEH è un ETF in classe EUR coperta. Oggi:
  l'Esposizione › Valute lo leggerà come dollari finché `instrumentProfiles.ts` non gli dà una riga con `hedgedTo`
  (il campo esiste, nessuno strumento lo usa: `doc/guide/allocazione.md` § `resolveCurrency`); Impostazioni ›
  Simulazioni ha l'interruttore «Copertura del cambio › Trend» (Q4) per classe, che non sa che il Trend del portafoglio
  è ormai in parte coperto. Un fatto dello strumento («è coperto in EUR») vive in due posti scritti a mano.
- **Cashflow**: il verdetto di Tracciamento giudica i giorni vissuti («entrate 77 €») e i tile il mese col calendario
  («2127 €»). È dichiarato nella guida (`doc/guide/cashflow-tracciamento.md`), ma sul 16 del mese, con lo stipendio
  «in calendario» al 27, il titolo «Ad ottobre hai speso più di quanto è entrato» e il tile «Risparmio 568 €» si
  leggono come una contraddizione. Lo stesso nella Panoramica (R4).
- **FIRE › Obiettivi** spento manda a «Abilita nelle Impostazioni», e in Impostazioni l'interruttore sta in un'altra
  scheda; la parola Obiettivi è quella di § 3.
- **Dividendi, Centri di Costo, Divisione**: stati vuoti corretti sul conto (nessun dividendo, centri archiviati,
  Divisione spenta — `?tab=split` ricade su Tracciamento senza dirlo, comportamento voluto per una scheda spenta).

## 7. Proposta di allineamento

Un principio, poi i task. **Il principio**: una decisione sui pesi si prende in un posto solo e gli altri la leggono.
Concretamente, il portafoglio modello (S3) diventa il «terzo livello» del conto — cosa voglio avere strumento per
strumento, e con quale strumento compro — e il PAC ne è l'esecuzione nel tempo, non una copia che si stacca.

### Onda 1 — difetti e parole (piccoli, indipendenti, nessuna decisione)

| Task | Contenuto |
| --- | --- |
| AL1 | R1: la testa di un gruppo è `buyAssetId`, ovunque si disegni un gruppo (passo Target, anteprima); `confirmGroup` mette il buy asset per primo. Test sul rendering della riga o una funzione pura `orderGroupMembers`. |
| AL2 | R2 + R3: Calendario con `ASSET_CLASS_LABELS` e bottoni `h-11 desktop:h-7`. |
| AL3 | R4: oltre una soglia (tasso < −100% o entrate vissute sotto una frazione delle spese) il verdetto dice gli euro («hai speso 1482 € più di quanto è entrato finora»), mai la percentuale. |
| AL4 | R5: una sottocategoria di una classe a target 0 non è orfana. |
| AL5 | R6: chip «Da comprare» (strumento in un PAC aperto o nel modello, mai posseduto) al posto di «Azzerato» per uno strumento senza operazioni di vendita. |
| AL6 | R7, R8, R9: le parole (allocazione **target**; «Ricalcola» e «Portafoglio modello» al posto di «Composizione ideale»; l'intestazione di Accumulo dice da dove vengono i suoi pesi). |
| AL7 | R10: `modelPortfolios` nel mirror. |

### Onda 2 — il PAC che si rivede davvero (D-AL1, D-AL2)

| Task | Contenuto |
| --- | --- |
| AL8 | **Raggruppa e Separa anche in revisione** (C4). Il motore lo regge già (`buildRevisedPlan` accetta qualsiasi posizione: è come è stata fatta la revisione del 16/10). La regola da scrivere: un gruppo nuovo o separato vale dal primo mese intatto `k`; le rate chiuse restano sulle posizioni di prima. |
| AL9 | **«Sostituisci lo strumento d'acquisto»** come gesto di una riga del passo Target (C4): sceglie o crea lo strumento nuovo e fa il gruppo «vecchio + nuovo, compra il nuovo» in un colpo. È il caso del 16/10 in un gesto. |
| AL10 | Uno strumento creato nell'editor resta nella bozza della sessione e, se la bozza si annulla, resta **candidato** (a 0 quote) alla prossima apertura dell'editor e di Ricalcola, invece di sparire (C5). |
| AL11 | In revisione: conti sorgente modificabili e vendite fuori piano rimandabili o tolte finché non eseguite (C10, C11). |
| AL12 | **«Riattiva»** su un piano interrotto da meno di N giorni, se nessun altro è aperto (C12, D12 intatta). |
| AL13 | Una sola «rata» (C14): il tile dice la rata del mese, l'editor dice la media e lo nomina («in media 4455 € al mese; ottobre 4207 €»). |

### Onda 3 — un posto per i pesi (D-AL3, D-AL4, D-AL5)

| Task | Contenuto |
| --- | --- |
| AL14 | **Dal PAC al modello** (C3): «Salva i pesi del piano come portafoglio modello», e alla creazione di un PAC da Ricalcola il modello si salva con lui (il caso del conto oggi non nasce più). |
| AL15 | **Il PAC sa se diverge dal modello** (§ 2 punto 3): una riga nel tile Questo mese, «Il piano differisce dal portafoglio modello su 3 strumenti», con «Rivedi dal modello» che apre la revisione già su «Parti da › Portafoglio modello». |
| AL16 | **Lo strumento equivalente diventa del conto, non del PAC** (§ 2 punto 5): il modello porta i gruppi (`ModelWeight` con `memberAssetIds` e `buyAssetId`), l'ottimizzatore li tratta come un candidato (lo fa già nel PAC, con l'avviso `proxy_mismatch`), il PAC li eredita. Versa e Ribilancia non cambiano (D-AL4): la sostituzione la dice la riga di AL17. |
| AL17 | **Bilanciamento con un PAC attivo** (C13): almeno una riga nel Piano che dice cosa fa già il PAC questo mese e che il Piano non lo considera; al massimo, il Piano con un PAC attivo propone solo ciò che il PAC non copre. |
| AL18 | **Gli obiettivi di classe dove stanno gli altri** (C8): il modale degli obiettivi mostra i target di classe di S1 in sola lettura con il collegamento, o li rende modificabili lì (D-AL5). |
| AL19 | **Le parole di § 3**: un nome per ciascuno dei tre «Obiettivi». |

### Onda 4 — lo strumento coperto (D-AL6)

| Task | Contenuto |
| --- | --- |
| AL20 | Un campo dello strumento («coperto in EUR») letto dall'Esposizione (al posto di una riga curata a mano con `hedgedTo`) e dalle Simulazioni (l'interruttore della classe propone «coperto» quando lo è la maggior parte della classe nel portafoglio). |

## 8. Decisioni per il proprietario

Tutte **prese dal proprietario il 16/10/2026**, nella sessione della review, sull'opzione consigliata.

| # | Stato | Decisione | Alternative scartate |
| --- | --- | --- | --- |
| D-AL1 | **Presa** | In «Rivedi il piano» si **raggruppa, si separa e si sostituisce lo strumento d'acquisto**, dal primo mese intatto `k` (AL8, AL9). | Solo «Sostituisci»; niente (si interrompe e si rifà). |
| D-AL2 | **Presa** | **«Riattiva»** in Piani conclusi su un piano interrotto da meno di **30 giorni**, se nessun altro piano è aperto (AL12). | Un «Annulla» solo subito dopo; niente. |
| D-AL3 | **Presa** | **Il portafoglio modello comanda** i pesi per strumento; il PAC ne è l'esecuzione nel tempo: si salva con il piano, il piano dice quando diverge, i gruppi di strumenti equivalenti vivono nel modello (AL14–AL16). | Copie indipendenti con il solo segnale di divergenza; come oggi. |
| D-AL4 | **Presa** | Con un PAC attivo il Piano di Bilanciamento **dice cosa fa il PAC** questo mese e che il Piano non ne tiene conto; i motori Versa/Ribilancia/Preleva non cambiano (AL17). | Il Piano propone solo ciò che il PAC non copre (motori di upstream toccati); come oggi. |
| D-AL5 | **Presa** | I target di classe si mostrano **in sola lettura** nel modale degli obiettivi, con il collegamento a Impostazioni: si scrivono in un posto solo (AL18). | Modificabili anche lì; come oggi. |
| D-AL6 | **Presa** | **«Coperto in EUR» è un campo dello strumento**, letto da Esposizione › Valute e proposto all'interruttore della classe in Simulazioni (AL20). | Solo la riga curata `hedgedTo`; niente. |
| D-AL7 | **Presa** | FIRE › Obiettivi diventa **«Traguardi»** (e l'intestazione di Allocazione «target dai traguardi»); gli obiettivi dell'ottimizzatore diventano **«Criteri del modello»** (AL19). | Solo i criteri; come oggi. |
| D-AL8 | **Presa** | Ordine **Onda 1 → 2 → 3 → 4**, in sei thread «impl» e sei PR (§ 9). | Onde 1 e 3 insieme. |

## 9. Task per i thread «impl»

Sei thread, in quest'ordine (D-AL8), ciascuno con un branch da `main` e una PR **in bozza** verso
`Ciocc128/net-worth-tracker:main` (WORKFLOW.md § 1 regola 6); il successivo parte dopo il merge del precedente. Ogni
thread crea la sua card Todoist «IMPL …». Dove questo dossier non decide, il thread sceglie l'opzione più vicina al
codice esistente e la scrive come **default dell'agente** nella riga «Esito» del suo task, qui sotto.

**Fine di ogni task**: `npx tsc --noEmit`, `npx eslint app components lib types e2e scripts __tests__`,
`TZ=Europe/Rome npx vitest run` verdi; le guide toccate aggiornate (`doc/guide/accumulo.md`,
`doc/guide/ottimizzatore.md`, `doc/guide/allocazione.md`, e le altre nominate nel task); `doc/guide/fork-scelte-ui.md`
quando il task tocca codice di upstream; `CLAUDE.md` (la riga «Latest»); `Draft Release Temp.md`; la riga «Esito» del
task qui sotto. Collaudo sull'anteprima Vercel, una fase per messaggio con l'esito scritto prima (WORKFLOW.md § 2);
ciò che serve del mirror lo fa un thread sul computer del proprietario.

**Il caso di prova di tutto il dossier** è il PAC del proprietario: un gruppo DBMFE (138 quote) + MFEH (0 quote,
compra MFEH) al 18%, nessun portafoglio modello salvato, tre vendite fuori piano al mese 1, nessuna rata eseguita.
I fixture dei test lo riproducono con nomi inventati.

### 9.1 IMPL-AL1 — Difetti e parole (Onda 1: AL1–AL7)

- **AL1** (R1): una funzione pura `orderGroupMembers(position)` mette `buyAssetId` per primo; la usano il passo Target
  (`AccumulationPlanDialog.tsx`, `isHead` = membro che compra, mai l'indice), l'anteprima e `confirmGroup` (che salva i
  membri già ordinati). Test: un gruppo `[vecchio, nuovo]` con `buyAssetId = nuovo` disegna la testa sul nuovo, con
  le quote calcolate sul suo prezzo, e il vecchio con «non riceve acquisti».
- **AL2** (R2, R3): il Calendario stampa `ASSET_CLASS_LABELS[classe]`, solo le classi con peso o target (come la
  tabella del passo 3); bottoni di riga `h-11 desktop:h-7`.
- **AL3** (R4): in `overviewNarrative.ts`, se le entrate vissute sono ≤ 0 o il tasso è sotto −100%, la clausola dice gli
  euro: «finora le spese superano le entrate di 1482 €» (con l'eventuale calendario detto come oggi), mai la
  percentuale. Test con i numeri del 16/10 (entrate 77 €, spese 1559 €, 2050 € in calendario).
- **AL4** (R5): `findOrphanedTargets` salta una sottocategoria la cui classe ha target ≤ 0. Test: Liquidità 0% con
  «Conti Correnti» al 100% e tutto il valore escluso → nessun orfano, nessuna frase nel verdetto.
- **AL5** (R6): uno strumento con quantità 0 e **nessuna operazione nel Registro** porta la chip «Mai comprato» al
  posto di «Azzerato» (Patrimonio › Strumenti e `AssetRow`); «Azzerato» resta per chi ha venduto tutto. Le parole in un
  modulo puro con il suo test.
- **AL6** (R7, R8, R9): «con l'allocazione target» in `fireNarrative.ts` (tre frasi); il modale di «Ricalcola» si
  intitola «Ricalcola il portafoglio modello»; `describeIdealAllocation` («Il PAC può proporre…») e il testo
  dell'interruttore in `IdealAllocationTile.tsx:188` nominano il portafoglio modello; l'intestazione della scheda
  Accumulo dice «pesi dal portafoglio modello» (o «dai pesi del piano» senza modello) e non mostra «Modifica target».
- **AL7** (R10): `modelPortfolios` fra i documenti per utente di `scripts/mirrorProdAccount.mts` (copiato e rimosso).

**Esito**: —

### 9.2 IMPL-AL2 — Rivedi il piano completo (Onda 2: AL8–AL11, D-AL1)

- **AL8 Raggruppa e Separa in revisione.** Tolti i `!revise` su «Raggruppa» e «Separa»
  (`AccumulationPlanDialog.tsx:970`, `:1081`). Regola: la struttura nuova vale dal primo mese intatto `k`; le rate
  1..k−1 restano sulle posizioni di allora (le loro righe portano `positionId` vecchi, e lo storico li legge così).
  `buildRevisedPlan` già accetta qualsiasi `positions` (la revisione del 16/10 è stata scritta così): test che un
  gruppo creato in revisione con rate chiuse prima di `k` lascia quelle rate deepEqual.
- **AL9 «Sostituisci».** Su una riga non raggruppata del passo Target (creazione e revisione), «Sostituisci»: si
  sceglie uno strumento acquistabile dal selettore di AL10 o se ne crea uno (`AssetDialog` `createEmpty`); la posizione
  diventa il gruppo `[nuovo, vecchio]`, `buyAssetId = nuovo`, stesso peso, `label` = nome del nuovo. Su un gruppo,
  «Sostituisci» cambia il membro che compra. Annullabile con «Separa». Test puro della trasformazione
  (`replaceBuyAsset(positions, positionId, newAssetId)`).
- **AL10 Strumenti senza valore raggiungibili.** Sotto la tabella del passo Target, «Aggiungi uno strumento»: un
  selettore degli strumenti `tradable`, non conti, non già nella bozza, **anche a 0 quote** (in testa quelli mai
  comprati). Uno strumento creato e poi abbandonato con la bozza si ritrova lì. Il seeder non cambia (le righe
  automatiche restano gli strumenti con valore).
- **AL11 Conti e vendite in revisione.** `PlanRevisionInput` aggiunge `sourceCashAssetIds` (modificabili in revisione)
  e `removedDisposalAssetIds` (vendite salvate, non eseguite, tolte); una vendita salvata non eseguita può anche
  spostarsi a un mese ≥ `k` (`monthIndex`). Una vendita eseguita resta com'è. La prima rata resta bloccata (è `k`).
  Test in `accumulationPlanUtils.test.ts` sul fixture F del dossier PAC (§ 8) con un conto aggiunto e una vendita
  tolta: `L` atteso scritto nel test con il conto.

**Esito**: —

### 9.3 IMPL-AL3 — Riattiva e una sola rata (Onda 2: AL12–AL13, D-AL2)

- **AL12 «Riattiva».** In Piani conclusi, su un piano `cancelled` con `closedAt` da meno di 30 giorni e nessun piano
  aperto (`selectOpenPlan` vuoto): bottone armato «Riattiva» → `reactivatePlan(planId)` in `runTransaction` (rilegge,
  ricontrolla le due condizioni, `status: 'active'`, toglie `closedAt`). Un piano `completed` non si riattiva. Le rate
  dei mesi passati tornano `late` per l'abbinamento, come già prima dell'interruzione. Test della condizione (pura) e
  del service simulato come negli altri test del PAC.
- **AL13 La rata.** Il tile dice «Rata di ottobre: 4207 €»; l'editor nomina la media e il primo mese insieme («in media
  4455 € al mese; la prima, ottobre, 4207 €») al passo 1 (ora L/N, che diventa «Liquidità per mese»), nel pannello del
  passo Target e nella sintesi del passo 3. Un solo modulo di parole in `accumulationNarrative.ts`.

**Esito**: —

### 9.4 IMPL-AL4 — Il modello comanda (Onda 3: AL14–AL16, D-AL3)

- **AL16 per primo — i gruppi nel modello.** `ModelWeight` aggiunge `memberAssetIds?: string[]` (assente = solo
  `assetId`); `assetId` resta lo strumento che compra. `toModelWeights` e il service accettano un gruppo (i membri
  devono essere `tradable`, non conti, distinti fra le righe). L'ottimizzatore dello strumento a sé tratta un gruppo come
  un candidato, come fa il PAC (profilo del buy asset, avviso `proxy_mismatch` invariato); il valore di oggi del gruppo
  è la somma dei membri. Il tile Portafoglio modello disegna il gruppo come nel passo Target (testa = chi compra). Un
  modello senza gruppi si legge e si salva come oggi.
- **AL14 Dal PAC al modello.** (a) Senza modello e con un piano attivo, il tile Portafoglio modello offre «Usa i pesi del
  piano» (`origin: 'manual'`, i gruppi del piano diventano gruppi del modello, lo snapshot del piano se c'è). (b) Il
  passo 3 dell'editor (attivazione e revisione) ha «Aggiorna anche il portafoglio modello», acceso di default quando i
  pesi differiscono dal modello o il modello non c'è; scrive nella stessa azione dell'attivazione o della revisione
  (se la scrittura del modello fallisce il piano resta scritto e la riga d'errore lo dice).
- **AL15 Divergenza.** Funzione pura `comparePlanToModel(plan, model)`: righe con scarto > 0,5 punti, strumenti nel
  piano e non nel modello e viceversa, gruppi diversi. Con almeno una differenza, il tile Questo mese ha una riga
  «Il piano differisce dal portafoglio modello su N strumenti» con «Rivedi dal modello», che apre la revisione già su
  «Parti da › Portafoglio modello». Test con il caso di prova (modello salvato dai pesi del piano → nessuna riga; un
  peso spostato di 1 punto → una).

**Esito**: —

### 9.5 IMPL-AL5 — Bilanciamento, criteri e nomi (Onda 3: AL17–AL19, D-AL4, D-AL5, D-AL7)

- **AL17** Con un PAC attivo, il Piano di Bilanciamento (tutte e tre le modalità) ha una riga sopra le mosse: «Il piano
  di accumulo compra questo mese 4207 € in 7 strumenti; questo piano non ne tiene conto.» con il collegamento alla
  scheda Accumulo; se il Piano compra uno strumento che il PAC ha sostituito (membro non acquirente di un gruppo), la
  riga lo dice («compra MFEH al posto di DBMFE»). I motori Versa/Ribilancia/Preleva non cambiano. Parole e condizione in
  `allocazioneNarrative.ts` / `allocazioneSummary.ts`, testate.
- **AL18** Il modale dei criteri mostra i target di classe in sola lettura (classe, %, leva che ne segue) con «Modifica
  in Impostazioni».
- **AL19** I nomi (D-AL7): FIRE › Obiettivi → **«Traguardi»** (scheda, verdetti, stato spento, l'interruttore in
  Impostazioni, l'intestazione di Allocazione «target dai traguardi»); i criteri dell'ottimizzatore → **«Criteri del
  modello»** (tile, «Modifica i criteri», titolo del modale, `describeIdealAllocation`). Identificatori, campi salvati e
  `?obiettivi=1` non cambiano. Le stringhe nei moduli di parole, mai nel JSX; i test che le fissano si aggiornano nella
  PR, dichiarandolo. È un rinomina di superficie di upstream: voce in `fork-scelte-ui.md`.

**Esito**: —

### 9.6 IMPL-AL6 — Lo strumento coperto (Onda 4: AL20, D-AL6)

- `Asset.currencyHedge?: 'EUR'` (assente = non coperto), nel modulo di `AssetDialog` per ETF e fondi
  («Coperto dal cambio in EUR»), scritto con `removeUndefinedDeep`.
- `resolveCurrency` (`lib/server/exposure/profileResolver.ts`): `asset.currencyHedge` vale come `hedgedTo` e vince sulla
  riga curata; la chiave della cache dell'Esposizione (`buildExposureCacheKey`) include il campo.
- Impostazioni › Simulazioni › Copertura del cambio: per ogni classe con interruttore, la quota di valore di mercato
  coperta nel portafoglio; sopra il 50% e con l'interruttore spento, una riga «Nel tuo portafoglio il Trend è coperto
  per il 46%» con «Imposta coperto». Mai da solo.
- Test: `profileResolver.test.ts` (uno strumento coperto senza riga curata legge EUR), la quota coperta per classe
  (pura). MFEH: il proprietario spunta il campo dopo il merge.

**Esito**: —

## 10. Prompt d'avvio dei thread

Da incollare in un thread nuovo del progetto, uno per volta, nell'ordine; il successivo dopo il merge della PR del
precedente.

```text
IMPL-AL1 — Allineamento, onda 1: difetti e parole.
Sei un thread «impl». Leggi WORKFLOW.md (§ 1 regola 6: thread cloud del progetto), CLAUDE.md e
doc/allineamento/README.md, poi implementa il task § 9.1 (AL1–AL7). Branch da main, PR in bozza verso
Ciocc128/net-worth-tracker:main, card Todoist «IMPL AL1 — difetti e parole». Fine e documentazione come
in § 9; scrivi la riga «Esito» del task. Poi collaudo sull'anteprima Vercel, una fase per messaggio.
```

```text
IMPL-AL2 — Allineamento, onda 2: Rivedi il piano completo.
Sei un thread «impl». Leggi WORKFLOW.md (§ 1 regola 6), CLAUDE.md, doc/allineamento/README.md e
doc/guide/accumulo.md, poi implementa il task § 9.2 (AL8–AL11, decisione D-AL1). Branch da main, PR in
bozza verso Ciocc128/net-worth-tracker:main, card Todoist «IMPL AL2 — Rivedi il piano completo». Fine e
documentazione come in § 9; scrivi la riga «Esito». Poi collaudo sull'anteprima Vercel, una fase per
messaggio: il caso da riprodurre è il gruppo DBMFE + MFEH del § 9.
```

```text
IMPL-AL3 — Allineamento, onda 2: Riattiva e una sola rata.
Sei un thread «impl». Leggi WORKFLOW.md (§ 1 regola 6), CLAUDE.md, doc/allineamento/README.md e
doc/guide/accumulo.md, poi implementa il task § 9.3 (AL12–AL13, decisione D-AL2). Branch da main, PR in
bozza verso Ciocc128/net-worth-tracker:main, card Todoist «IMPL AL3 — Riattiva e rata». Fine e
documentazione come in § 9; scrivi la riga «Esito». Poi collaudo sull'anteprima Vercel, una fase per messaggio.
```

```text
IMPL-AL4 — Allineamento, onda 3: il portafoglio modello comanda.
Sei un thread «impl». Leggi WORKFLOW.md (§ 1 regola 6), CLAUDE.md, doc/allineamento/README.md,
doc/guide/ottimizzatore.md e doc/guide/accumulo.md, poi implementa il task § 9.4 (AL16, poi AL14 e AL15;
decisione D-AL3). Branch da main, PR in bozza verso Ciocc128/net-worth-tracker:main, card Todoist
«IMPL AL4 — il modello comanda». Fine e documentazione come in § 9; scrivi la riga «Esito». Poi collaudo
sull'anteprima Vercel, una fase per messaggio.
```

```text
IMPL-AL5 — Allineamento, onda 3: Bilanciamento, criteri e nomi.
Sei un thread «impl». Leggi WORKFLOW.md (§ 1 regola 6), CLAUDE.md, doc/allineamento/README.md,
doc/guide/allocazione.md e doc/guide/fork-scelte-ui.md, poi implementa il task § 9.5 (AL17–AL19,
decisioni D-AL4, D-AL5, D-AL7). Branch da main, PR in bozza verso Ciocc128/net-worth-tracker:main, card
Todoist «IMPL AL5 — Bilanciamento, criteri e nomi». Fine e documentazione come in § 9; scrivi la riga
«Esito». Poi collaudo sull'anteprima Vercel, una fase per messaggio.
```

```text
IMPL-AL6 — Allineamento, onda 4: lo strumento coperto.
Sei un thread «impl». Leggi WORKFLOW.md (§ 1 regola 6), CLAUDE.md, doc/allineamento/README.md,
doc/guide/allocazione.md (§ Esposizione) e doc/guide/fire-monte-carlo.md (§ Q4), poi implementa il task
§ 9.6 (AL20, decisione D-AL6). Branch da main, PR in bozza verso Ciocc128/net-worth-tracker:main, card
Todoist «IMPL AL6 — strumento coperto». Fine e documentazione come in § 9; scrivi la riga «Esito». Poi
collaudo sull'anteprima Vercel, una fase per messaggio.
```

## 11. Cosa questa review non copre

- L'**Assistente AI** e le **email/PDF**: senza DOM o senza chiave sugli emulatori (WORKFLOW.md § 3).
- La **Divisione** e i **Dividendi** popolati: il conto non ne ha; i loro flussi si leggono sui fixture (`split@`,
  nessuno per i dividendi).
- Il **telefono** è stato fotografato (390 px, 24 viste) ma non percorso a mano nei dialoghi.
- L'**account condiviso**: la review è stata fatta da proprietario.
