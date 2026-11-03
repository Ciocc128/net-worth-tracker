# Calendario delle spese (dossier)

> Card Todoist «FEAT: calendar spending heatmap» (Backlog, nessuna descrizione: la lettura della richiesta è di questo
> dossier). Schizzo «oggi / proposta» (WORKFLOW.md regola 8): pagina pubblicata «Calendario delle spese»,
> https://claude.ai/artifact/SFoZ326pL8upgjZe2rxaou. Decisioni D-CS1–D-CS8 **proposte il 2026-11-03, in attesa del
> proprietario**: finché § 8 non le dice prese, il resto del dossier descrive le opzioni raccomandate.

## 1. In breve

Un tile nuovo in Cashflow › Analisi, **«Calendario delle spese»**: ogni giorno del periodo è una cella colorata per
quanto hai speso quel giorno. Con un anno è la griglia a 53 settimane (colonne = settimane, righe = lunedì … domenica);
con un mese è il calendario del mese. Una lettura dice in quanti giorni hai speso, quale giorno della settimana pesa
di più e qual è stato il giorno più caro; toccando un giorno un popover accanto alla cella dice il totale e le voci.
Nessuna lettura nuova dal database.

## 2. Stato di partenza

- **Nessuna superficie mostra i singoli giorni.** Tracciamento ha «Andamento del mese» (la spesa cumulata giorno per
  giorno di UN mese contro un confronto, doc/andamento-spese/README.md), le barre «Ultimi 6 mesi» e Movimenti; Analisi
  ragiona per mese e per categoria (Il periodo, Fuori scala, Spese maggiori, Spese/Entrate per categoria, Scheda,
  Flusso; `ANALISI_SECTION_IDS` in `lib/utils/analisiSummary.ts`).
- **Analisi legge tutta la collezione** (`useExpenses`, doc/guide/cashflow-analisi.md): qualunque anno o mese
  dell'asse ha già le sue righe in memoria. L'asse ha quattro modi (`PeriodMode`: `ytd` · `current` · `year` ·
  `history`) più un mese (`AnalisiPeriod.month`); `current` è l'anno intero e porta ciò che è solo in calendario,
  `ytd` si ferma a fine del mese di oggi.
- **Un heatmap esiste già**: Rendimenti › Consistenza, `components/performance/MonthlyReturnsHeatmap.tsx` — tre
  gradini di intensità come UNA fonte (`HEATMAP_STEPS`) letta da cella e legenda, il riempimento inline in
  `color-mix` così che un cambio di periodo sfuma invece di saltare, `useRovingFocus` (la griglia è UNA fermata di
  Tab), celle alte 44px sotto `desktop:`. Il calendario ne riprende i meccanismi, non i colori (lì sono di segno).
- **Il colore delle spese** è `--flow-out` (barre del Cashflow, `CASHFLOW_SERIES_COLOR.expenses`): blu 232 in Lime
  Frost, blu tenue 255 in Graphite; mai il rosso, che in entrambi i temi vale solo per i giudizi
  (doc/guide/fork-scelte-ui.md § 2b, doc/guide/temi.md).
- **Cosa conta come spesa**: `isSpendingRow` (`lib/utils/tracciamentoSummary.ts`) — ogni tipo tranne entrate e
  trasferimenti, quindi fisse, variabili, debiti e righe commissione; «Fuori dal budget» conta (lo ignora solo
  Budget, `countsTowardBudget`).

## 3. Obiettivo e perimetro

**Obiettivo**: rispondere a «in quali giorni spendo, e c'è uno schema?» — i giorni pesanti, i fine settimana, i
mesi tranquilli — con una figura che nessun'altra superficie dà.

**Incluso**
- Il tile in Analisi per i modi `ytd`, `current`, `year` (griglia dell'anno) e per un mese scelto (calendario del
  mese).
- Una pillola «Tutte · Solo variabili», ricordata sul dispositivo.
- Il popover di un giorno.
- La composizione mobile (390, 768, tablet orizzontale) secondo DESIGN.md → Small-Screen Composition.

**Escluso**
- Il modo `history` (più anni): il tile non c'è (D-CS1).
- Tracciamento, Panoramica, Budget, email e PDF: nessun cambiamento.
- Il verdetto di Analisi e la sua striscia: invariati, non citano il tile.
- Le entrate: il calendario è delle sole spese.
- Il filtro per categoria o per la Scheda in focus (punto aperto § 9).

## 4. Casi d'uso

1. **L'anno a colpo d'occhio.** Apro Analisi su «Anno corrente»: vedo i primi del mese scuri (affitto), i sabati più
   pieni, agosto con una macchia (le ferie). Leggo «Nel 2026 hai speso in 209 giorni su 307; il sabato è il giorno
   più caro, in media 56 € contro 31 € degli altri giorni. Il giorno più caro è stato il 14 marzo, 1313,30 €.» (cifre di esempio)
2. **Cosa è successo quel giorno.** Tocco il 14 marzo: accanto alla cella «sabato 14 marzo · Speso 1313,30 €» con
   «Officina, tagliando 1240,00 €» e le altre voci, fino a cinque e «e altre N».
3. **Senza gli scalini fissi.** Tocco «Solo variabili»: affitto e rate escono, i colori si ricalcolano, la lettura
   dice «spese variabili». Riaprendo la pagina ritrovo la scelta.
4. **Un mese.** Scelgo ottobre nell'asse: il tile diventa il calendario di ottobre (7 colonne, celle con il numero
   del giorno).
5. **Il calendario.** Nell'«Anno corrente» una rata del 28 novembre e l'affitto del 1° dicembre sono celle con il
   bordo e il tratteggio; gli altri giorni futuri sono vuoti.
6. **Telefono.** A 390 trovo una riga chiusa «Calendario · giorno per giorno» prima di Flusso; aprendola vedo il
   mese di oggi (o l'ultimo del periodo) con ‹ › per scorrere i mesi del periodo.
7. **Anno senza spese.** Nessuna spesa nel periodo: la riga e il tile non ci sono (come il Flusso senza flussi).

## 5. Regole di calcolo

Tutte le cifre nascono in un modulo puro nuovo, `lib/utils/spendingCalendar.ts`; le frasi in
`lib/utils/analisiNarrative.ts`. Giorno, mese e giorno della settimana di una riga si leggono nel calendario italiano
(`dateHelpers.ts`, come i `DayResolver` di Analisi).

### 5.1 Cosa conta (D-CS2)
- «Tutte»: le righe di `isSpendingRow`, in valore assoluto (`Math.abs`, come il trio); commissioni e «Fuori dal
  budget» comprese. «Solo variabili»: `type === 'variable'`; una riga commissione (`isFeeRow`) ha il tipo della categoria commissioni
  scelta in Impostazioni (`lib/utils/expenseFee.ts`), quindi entra solo se quella categoria è variabile.
- Identità coperta dai test: con «Tutte», la somma delle celle del periodo = `summarizePeriodCashflow(...).expenses`
  dello stesso periodo.
- Le righe dopo oggi (`isScheduledRow`) non entrano né nella scala né nella lettura; disegnano solo il tratteggio
  (§ 5.4).

### 5.2 La griglia
- `buildSpendingCalendar(rows, period, today, filter)` → per ogni giorno del periodo `{ date, weekday, total,
  scheduled, rows }`; `weekday` 0 = lunedì.
- Anno: colonne = settimane ISO-like che iniziano il lunedì; la prima colonna può avere celle prima del 1° gennaio,
  che restano vuote e invisibili; etichette dei mesi sopra la colonna in cui il mese inizia; righe L · M · V · D
  etichettate (le altre senza testo).
- Mese: 7 colonne lun–dom, il 1° nella colonna del suo giorno.
- `ytd`: gennaio → fine del mese di oggi; `current` e `year`: l'anno intero.

### 5.3 La scala (D-CS3, D-CS4)
- Sui giorni passati con spesa > 0 del periodo mostrato (con il filtro attivo): soglie `q1, q2, q3` = quantili 25°,
  50°, 75° (indice `floor(f · n)` sulla lista ordinata, limitato a `n − 1`). Gradino 1 se `v ≤ q1`, 2 se `≤ q2`, 3 se
  `≤ q3`, 4 oltre. Con meno di 4 giorni di spesa le soglie possono coincidere: un gradino vuoto non compare in
  legenda.
- Riempimento: `color-mix(in oklab, var(--flow-out) {22 | 45 | 70 | 100}%, var(--card))`; giorno passato senza spesa
  `var(--muted)`; le intensità esatte si fissano con il contrasto misurato nei quattro blocchi del fork (Lime Frost e
  Graphite, chiaro e scuro) e il colore del numero del giorno nel calendario del mese passa all'inchiostro chiaro
  sul gradino 4 dove serve (§ 10, criterio 12).
- Una sola fonte delle soglie e delle intensità (`SPENDING_CALENDAR_STEPS`), letta da cella e legenda, come
  `HEATMAP_STEPS`.
- Legenda: «nessuna spesa» · «fino a {q1}» · «{q1}–{q2}» · «{q2}–{q3}» · «oltre {q3}» · «in calendario»; soglie in
  euro interi (`formatCurrencyEUR(…, true)`), perché sono confini, non spese.

### 5.4 I giorni futuri (D-CS5)
- Un giorno dopo oggi con righe in calendario: bordo 1,5px in `--flow-out` e tratteggio interno, nessun riempimento.
- Un giorno dopo oggi senza righe: bordo `--border`, vuoto, non interattivo.
- Oggi ha un anello in `--foreground`.

### 5.5 La lettura (D-CS7)
Cifre calcolate non arrotondate. Le medie sono stime e si stampano in euro interi; il giorno più caro è una spesa
vera e si stampa con i centesimi (la regola delle cifre confermata dal proprietario: centesimi sui valori reali come
le spese, euro interi su stime e confronti; ID in doc/unslop/README.md quando sarà scritta).
- Anno: «Nel {anno} hai speso in {G} giorni su {D}; {il/la} {giorno} è il giorno più caro, in media {m1} contro {m2}
  degli altri giorni. Il giorno più caro è stato il {g} {mese}, {S}.» — `D` = giorni passati del periodo, `m1` = somma
  del giorno della settimana / numero di quei giorni passati (giorni a zero compresi), `m2` = lo stesso sugli altri
  sei. Con «Solo variabili»: «hai fatto spese variabili in …».
- Se `m1` e `m2` stampati coincidono, la prima frase si ferma a «… su {D}.»
- Mese passato: «A {mese} hai speso in {G} giorni su {D}; il più caro è il {g}, {S}.» Mese corrente: «Al {g} {mese}
  hai speso {T} in {G} giorni; in calendario ci sono ancora {C}.» (seconda parte solo con `C > 0`; `T` e `C` con i
  centesimi). Mese futuro: «A {mese} ci sono già {C} di spese in calendario.»
- Nessun colore nella lettura: non giudica.

### 5.6 Il popover (D-CS6)
- Titolo «{giorno della settimana} {g} {mese}»; «Speso {T}» (passato) o «In calendario {T}» (futuro), centesimi;
  fino a 5 voci per importo decrescente (descrizione o categoria, importo con i centesimi) e «e altre N»; «Nessuna
  spesa.» su un giorno a zero. Le voci rispettano il filtro.
- Si apre accanto alla cella (Radix `Popover`, ancorato alla cella), si chiude con Esc o con un tocco fuori; il
  fuoco torna alla cella.

## 6. Interfaccia

### 6.1 Posto a 1440 (D-CS1)
- Un tile a 12 colonne dopo Spese/Entrate per categoria e prima della Scheda; con `history` o senza spese nel periodo
  non è montato.
- Tile: eyebrow «Calendario delle spese» (`<h3>`), la pillola «Tutte · Solo variabili» nella testa
  (`SegmentedPill`, chiave `localStorage` `analisi.calendario.filtro`, valori `all | variable`, try/catch come
  `cashflow.andamento.confronto`), la lettura (`NarrativeText`, cifre mono a peso normale), la griglia, la legenda.
- Celle di 14–18px a 1440 con 3px di spazio; nessun titolo nativo al passaggio del mouse oltre al nome accessibile.

### 6.2 Accessibilità
- La griglia è UNA fermata di Tab (`useRovingFocus`): frecce per giorno (←→) e settimana (↑↓) nell'anno, per giorno e
  settimana nel mese; Invio o spazio apre il popover.
- Ogni cella ha come nome «{g} {mese}: {T}» o «{g} {mese}: nessuna spesa» / «in calendario {T}».
- Il colore non è l'unica informazione: il popover e il nome accessibile dicono la cifra.

### 6.3 Movimento
- Cambiando periodo o filtro una cella sfuma al nuovo colore (`transition-colors`, riempimento inline come
  `heatmapCellStyle`); con «riduci movimento» nessuna transizione.

### 6.4 Composizione mobile (D-CS8; DESIGN.md → Small-Screen Composition)
- 390: riga chiusa `analisi-calendario` in `ANALISI_SECTIONS`, in ordine DOM dopo `analisi-entrate` e prima di
  `analisi-scheda`; aside «giorno per giorno» (parole, nessuna cifra). Aperta, un mese alla volta: il mese di oggi se
  sta nel periodo, altrimenti l'ultimo del periodo; ‹ › (44×44) scorrono dentro il periodo e si spengono ai suoi
  bordi; celle di almeno 44px di altezza con il numero del giorno; la scala resta quella del periodo intero, così due
  mesi si confrontano.
- 768: la riga nella griglia a due colonne come le altre (`tabletComposition.ts`); aperta mostra la griglia
  dell'anno se la cella è larga almeno quanto serve a celle di 10px, altrimenti il mese.
- Tablet orizzontale: nell'indice, risposta chiusa in `describeAnalisiClosedAnswers` — «il {giorno}» (il giorno della
  settimana più caro), `null` se la prima frase della lettura si ferma (medie uguali) o con un mese.
- Striscia, verdetto, taglio e scope di Analisi invariati; nessun blocco sollevato.

## 7. Piano

Una sola task, **CS1** (impl, Sonnet 5.5 salvo diversa indicazione sulla card):
1. `lib/utils/spendingCalendar.ts` + `__tests__/spendingCalendar.test.ts` (§ 5, valori di § 10).
2. Le frasi e la risposta chiusa in `analisiNarrative.ts` (+ test).
3. `components/cashflow/analisi/tiles/CalendarioTile.tsx` (griglia anno e mese, popover, pillola), la griglia e
   `ANALISI_SECTIONS` in `AnalisiTab.tsx`, `tabletComposition.ts`; il tile nel chunk lazy di Analisi.
4. E2E: `e2e/analisi.spec.ts` (tile con «Anno corrente» e con un mese, assente con «Storico», popover di un giorno,
   pillola ricordata dopo il reload), `e2e/analisi.mobile.spec.ts` (riga chiusa dopo Entrate, ‹ › ai bordi del periodo),
   la spec tablet di Analisi (indice); `seedAnalisiE2E.mts` se mancano giorni utili.
5. Sul Mac, nella stessa PR: `test:e2e` delle spec toccate, `mobile:census` + `mobile:budget` (la riga nuova sta sotto
   la piega), `perf:budget`.
6. Guida: § nuova in doc/guide/cashflow-analisi.md (Files, regole, Composizione mobile), riga in CLAUDE.md, la regola
   delle intensità in doc/guide/temi.md se cambia un token.

## 8. Decisioni

**Proposte il 2026-11-03 sullo schizzo, in attesa del proprietario.** Qui sotto la raccomandazione; le alternative
sono quelle dello schizzo.

| ID | Stato | Decisione proposta | Alternative scartate e motivo |
|----|-------|--------------------|-------------------------------|
| D-CS1 | Proposta | In Analisi: anno = griglia a 53 settimane, mese = calendario del mese; in «Storico» il tile non c'è. | Tracciamento, accanto ad Andamento: il ritmo del mese lo dice già Andamento, e la domanda «dove vanno i soldi» è di Analisi. Tutte e due: due tile per una domanda. |
| D-CS2 | Proposta | Le spese di «Spese» con una pillola «Tutte · Solo variabili», predefinita «Tutte», ricordata sul dispositivo. | Solo variabili: non somma come gli altri totali della pagina. Tutte senza pillola: affitto e rate dominano i primi del mese. |
| D-CS3 | Proposta | Quattro gradini per quartili dei giorni con spesa del periodo; legenda con le soglie in euro interi. | Gradini fissi in euro: giusti per un reddito, sbagliati per un altro. Lineare sul giorno più caro: una spesa grossa schiaccia tutto sul primo gradino (sezione 2 dello schizzo). |
| D-CS4 | Proposta | `--flow-out` a quattro intensità; giorno senza spese `--muted`; mai il rosso. | Il rosso: in Lime Frost e Graphite vale solo per i giudizi, e spendere non è un errore. |
| D-CS5 | Proposta | Giorno futuro con spese in calendario: bordo e tratteggio senza riempimento; gli altri futuri vuoti. | Riempiti più chiari: si confondono con il gradino 1. Non mostrati: l'«Anno corrente» porta il calendario per definizione. |
| D-CS6 | Proposta | Popover accanto alla cella: data, totale e fino a 5 voci con i centesimi, «e altre N». | Movimenti filtrato sul giorno: sta in un'altra scheda. Solo il titolo al passaggio: niente al tocco. |
| D-CS7 | Proposta | Due frasi: giorni con spesa e il giorno della settimana più caro (medie in euro interi); il giorno più caro (centesimi). | Una frase: perde lo schema per giorno della settimana, che è la risposta nuova. Nessuna lettura: ogni tile risponde in parole. |
| D-CS8 | Proposta | 390 riga chiusa «Calendario · giorno per giorno» prima della Scheda, aperta un mese alla volta con ‹ ›; 768 riga; tablet orizzontale nell'indice con «il sabato». | Anno in verticale (7 × 53): celle alte 14px, sotto un dito. Niente sul telefono: il tile sparisce dove si apre più spesso l'app. |

## 9. Punti aperti

- **Filtro per categoria o per la Scheda in focus**: con una categoria aperta nella Scheda il calendario potrebbe
  restringersi a lei. Non in CS1.
- **«Storico»**: gli ultimi 12 mesi invece di nessun tile, se serve dopo l'uso.
- **Tracciamento o Panoramica**: una versione del mese, se il tile si rivela utile.

## 10. Criteri di accettazione

Valori di riferimento (test di `spendingCalendar` e `analisiNarrative`); oggi = 03/11/2026 salvo dove detto.

**Fixture A** — periodo `year` 2026 (anno chiuso nel test con oggi = 15/01/2027), righe:
- 01/03 affitto 900 (fissa), 07/03 (sabato) spesa 40,50 (variabile), 07/03 bar 9,50 (variabile), 14/03 (sabato)
  officina 1240 (variabile), 14/03 ristorante 73,30 (variabile), 18/03 (mercoledì) farmacia 12 (variabile), 20/03
  trasferimento 500, 20/03 (venerdì) spesa 60 (variabile) con la sua commissione 2 (riga fee, categoria commissioni di tipo variabile),
  28/03 (sabato) rata 320 (debito).
- Nessun'altra riga nel 2026.

Attesi:
1. Celle a 2026-03-07 = **50,00 €**, 2026-03-14 = **1313,30 €**, 2026-03-20 = **62,00 €** (60 + 2; il trasferimento
   non conta). Somma delle celle = **2657,30 €** = `summarizePeriodCashflow(...).expenses`.
2. Giorni con spesa = **6** (1, 7, 14, 18, 20, 28 marzo) su **365**.
3. Valori ordinati 12 · 50 · 62 · 320 · 900 · 1313,30 → q1 = indice 1 = **50 €**, q2 = indice 3 = **320 €**, q3 =
   indice 4 = **900 €**; gradini: 18/03 → 1, 07/03 → 1, 20/03 → 2, 28/03 → 2, 01/03 → 3, 14/03 → 4.
4. Media del sabato = (50 + 1313,30 + 320) / 52 sabati = 32,37 → **32 €**; altri giorni = (900 + 12 + 62) / 313 =
   3,11 → **3 €**. Lettura: «Nel 2026 hai speso in 6 giorni su 365; il sabato è il giorno più caro, in media 32 €
   contro 3 € degli altri giorni. Il giorno più caro è stato il 14 marzo, 1313,30 €.» (il 2026 ha 52 sabati e 53
   giovedì: il conteggio dei giorni della settimana va testato, non assunto 52).
5. «Solo variabili»: cella 20/03 = **62,00 €** (la categoria commissioni è variabile), 01/03 e 28/03 a zero; giorni
   con spesa **4**.

**Fixture B** — come A, periodo `current` 2026, oggi = 20/03/2026:
6. 28/03 è tratteggiato (in calendario 320 €), esce dalla scala e dalla lettura; `D` = **79** (1 gennaio → 20 marzo).
7. Popover del 28/03: «sabato 28 marzo · In calendario 320,00 € · Rata 320,00 €».

**Fixture C** — periodo marzo 2026 (mese scelto), oggi = 15/01/2027:
8. Calendario a 7 colonne, il 1° marzo (domenica) nell'ultima colonna della prima riga.
9. Lettura: «A marzo hai speso in 6 giorni su 31; il più caro è il 14, 1313,30 €.»

**Fixture D** — periodo novembre 2026, oggi 03/11/2026, righe 01/11 affitto 900, 02/11 spesa 90,67, 28/11 rata 320:
10. «Al 3 novembre hai speso 990,67 € in 2 giorni; in calendario ci sono ancora 320,00 €.»

**Interfaccia**
11. A 1440 il tile è a 12 colonne tra le categorie e la Scheda con «Anno corrente», «Da inizio anno», un anno e un
    mese; con «Storico» non c'è; la pillola ricorda la scelta dopo un reload.
12. In Lime Frost e Graphite, chiaro e scuro, i quattro gradini si distinguono tra loro e dal `--muted` (contrasto
    misurato e scritto in doc/guide/temi.md), e il numero del giorno nel calendario del mese si legge su ogni gradino.
13. Tastiera: Tab entra nella griglia una volta, le frecce si muovono, Invio apre il popover, Esc lo chiude e il fuoco
    torna alla cella.
14. A 390 la riga «Calendario» è chiusa, dopo Entrate; aperta mostra il mese di oggi con ‹ › spente ai bordi del
    periodo; celle ≥ 44px; `mobile:census` invariato e `mobile:budget` verde.
