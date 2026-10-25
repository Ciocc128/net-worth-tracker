# Andamento del mese (dossier)

> Card Todoist «FEAT: Spending trend line this month vs mean month last 12 months» (Backlog → Spec pronta il
> 2026-10-25). Analisi e decisioni prese con il proprietario il 2026-10-25 sullo schizzo «oggi / proposta»
> (WORKFLOW.md regola 8): pagina pubblicata «Andamento del mese», https://claude.ai/artifact/QY4k1PDmQvxXVM5ACNrkoT.
> Nessun codice ancora: questo dossier è la specifica della task di implementazione AM1.

## 1. In breve

Un tile nuovo in Cashflow › Tracciamento, **«Andamento del mese»**: la spesa del mese **cumulata giorno per giorno**
come area che sfuma (lo stile di Storico › Evoluzione), a confronto con UNA linea tratteggiata scelta da una pillola:
la **media dei mesi chiusi** (fino a 12, predefinita), il **mese scorso** o lo **stesso mese dell'anno prima**. La
lettura dice quanto hai speso a oggi e quanto in più o in meno del confronto agli stessi giorni. Esiste solo quando
il periodo scelto è un mese. Nessuna lettura nuova dal database.

## 2. Stato di partenza

- Tracciamento (`components/cashflow/ExpenseTrackingTab.tsx`, doc/guide/cashflow-tracciamento.md) a 1440: riga 1
  Cashflow del periodo (5 colonne, alto due righe) · Spese per categoria (4) · Entrate (3); riga 2 Risparmio (7);
  riga 3 Movimenti (12).
- Cashflow del periodo confronta già il mese in corso con **gli stessi giorni del mese prima**
  (`currentComparisonWindow` / `previousComparisonWindow`, didascalia «vs 1–25 set») e proietta la fine del mese
  **al ritmo attuale** (`projectMonthEndWithScheduled`). Nessuna superficie mostra come si è distribuita la spesa
  dentro il mese, né un confronto con un mese «tipico».
- La finestra letta dalla scheda (`trackingWindow`, `lib/utils/expenseWindows.ts`) è il periodo più i 12 mesi prima
  (`TRACKING_LOOKBACK_MONTHS = 12`): contiene già il mese scorso, i 12 mesi della media e lo stesso mese dell'anno
  prima.
- Il grafico di riferimento per lo stile è `components/history/tiles/EvoluzioneTile.tsx`: `AreaChart` dalla porta
  `@/components/ui/charts/recharts`, `--hero-series` con sfumatura dal 35% al 2%, `CartesianGrid strokeDasharray="3 3"`
  solo orizzontale, assi senza linee né tacche (`CHART_TICK_STYLE`), `useChartMotion`.

## 3. Obiettivo e perimetro

**Obiettivo**: rispondere a «sto spendendo più o meno del solito, a questo punto del mese?» con una figura che mostra
il ritmo dentro il mese, accanto al confronto che già esiste sulle cifre.

**Incluso**
- Il tile in Tracciamento, per un periodo `{ kind: 'month' }`, corrente o passato (anche futuro: vedi § 5.6).
- Tre confronti, uno alla volta; la scelta ricordata sul dispositivo.
- La composizione mobile (390, 768, tablet orizzontale) secondo DESIGN.md → Small-Screen Composition.

**Escluso**
- Anno, «da inizio anno», intervallo personalizzato: il tile non c'è (D-AM2).
- Un filtro «solo variabili» (punto aperto § 9).
- Panoramica, Budget, email e PDF: nessun cambiamento.
- Il verdetto di Tracciamento e la striscia: invariati.

## 4. Casi d'uso

1. **Metà mese, storico lungo.** Il 25 ottobre apro Tracciamento: l'area di ottobre arriva a oggi, la media dei 12
   mesi chiusi è tratteggiata; leggo «Al 25 ottobre hai speso 1182 €, 7 € in più della media…».
2. **Il confronto che mi serve.** Tocco «Settembre» o «Ottobre 2025»: la linea e la lettura cambiano; riaprendo la
   pagina sul dispositivo ritrovo la stessa scelta.
3. **Storico corto.** Uso l'app da agosto: la pillola dice «Media 2 mesi»; «Ottobre 2025» è spenta e dice perché.
4. **Primo mese.** Nessun mese prima: c'è solo l'area, e la lettura «Nessun mese prima da confrontare».
5. **Spese in calendario.** Una rata datata il 28: dopo oggi la linea prosegue tratteggiata a gradini fino al totale
   del mese che il trio stampa; nessuna estrapolazione.
6. **Mese passato.** Scelgo settembre: l'area è intera, il confronto è relativo a settembre (media dei mesi chiusi
   prima di settembre, agosto, settembre 2025).
7. **Telefono.** A 390 trovo una riga chiusa «Andamento · giorno per giorno» dopo Entrate; aprendola vedo il tile.

## 5. Regole di calcolo

Tutte le cifre nascono in un modulo puro nuovo, `lib/utils/spendingTrend.ts`; le frasi in
`lib/utils/cashflowNarrative.ts`. Giorno e mese di una riga si leggono nel calendario italiano
(`getItalyYear` / `getItalyMonth` / giorno italiano, come i bucket mensili della scheda).

### 5.1 Cosa conta (D-AM5)
- Le stesse righe e lo stesso segno di «Spese» del trio: `isSpending` (fisse, variabili, debiti) con `Math.abs`
  (`summarizePeriodCashflow`); le righe commissione (`isFeeRow`) contano perché sono spese; le righe «Fuori dal
  budget» contano (le ignora solo Budget, `countsTowardBudget`); trasferimenti ed entrate esclusi.
- Identità obbligatorie, coperte dai test: **valore a oggi = `settleTotals(totals, scheduled).expenses`**; **valore
  all'ultimo giorno = `totals.expenses`** del periodo.

### 5.2 La serie cumulata
- `cumulativeByDay(rows, year, month)` → array di lunghezza `daysInMonth`, `c[d-1]` = somma delle spese con giorno ≤ d.
- Lettura di un mese di confronto a un giorno `d`: `c[min(d, daysInMonth) - 1]` — un mese più corto resta piatto sul
  suo totale dopo l'ultimo giorno (D-AM7). È la stessa regola di `previousComparisonWindow` (il 31 ottobre contro i 30
  giorni di settembre), quindi col mese scorso la differenza del tile coincide con quella del trio.

### 5.3 Il mese scelto e il calendario (D-AM6)
- Mese corrente: area piena dal giorno 1 a oggi (righe con giorno ≤ oggi, `isScheduledRow` falso); da domani alla fine
  del mese una linea tratteggiata **a gradini** (`type="stepAfter"`) con le sole righe in calendario, senza area.
  Nessuna proiezione al ritmo attuale (resta in Cashflow del periodo).
- Mese passato: area piena su tutto il mese.

### 5.4 I tre confronti (D-AM3, D-AM4)
- **Inizio dello storico** `firstMonth`: il mese della prima riga di qualsiasi tipo (spesa, entrata o trasferimento)
  nella finestra letta. La finestra parte 12 mesi prima del periodo, quindi una riga più vecchia non serve.
- **Media**: i mesi chiusi `M` con `firstMonth ≤ M < periodo`, al più gli ultimi 12. `media[d] = Σ lettura(M, d) / N`.
  Un mese senza righe dopo `firstMonth` conta come zero. Disponibile con **N ≥ 2**; etichetta «Media 12 mesi» o
  «Media N mesi».
- **Mese scorso**: il mese prima del periodo, disponibile se `≥ firstMonth`. Etichetta: il nome del mese
  («Settembre»; con l'anno solo se diverso da quello del periodo: «Dicembre 2025»).
- **Un anno fa**: lo stesso mese dell'anno prima, disponibile se `≥ firstMonth`. Etichetta «Ottobre 2025».
- Un confronto non disponibile resta nella pillola, spento, con il motivo come nome accessibile e titolo («Servono
  almeno 2 mesi chiusi», «Nessun movimento a ottobre 2025»).
- **Predefinito**: la scelta ricordata se disponibile, altrimenti Media, altrimenti Mese scorso, altrimenti Un anno
  fa, altrimenti nessuno (solo l'area). La scelta si salva solo quando l'utente tocca la pillola
  (`localStorage`, chiave `cashflow.andamento.confronto`, valori `media | precedente | annoPrima`; letture e
  scritture in try/catch, come `cashflow.movimenti.vista`). Un confronto spento non cancella la scelta salvata.

### 5.5 La lettura del tile (D-AM8)
Le cifre sono calcolate non arrotondate e stampate con `formatCurrencyEUR` a euro interi; la differenza è giudicata
sulla cifra stampata (`printedDelta`): «0 €» stampa «come {confronto}».
- Mese corrente, con confronto: «Al {g} {mese} hai speso {S}, {|Δ|} in più / in meno {della media degli ultimi N
  mesi | di settembre | di ottobre 2025} agli stessi giorni. {La media chiude il mese a | Settembre ha chiuso a |
  Ottobre 2025 ha chiuso a} {T}.» — `T` = totale intero del confronto (per la media: la media dei totali interi).
- Mese passato: «A settembre hai speso {S}, {|Δ|} in più / in meno {…} sull'intero mese.» — senza la seconda frase;
  qui Δ confronta i mesi INTERI (il totale del periodo contro il totale del confronto, per la media la media dei
  totali), perché un mese chiuso si giudica intero e un mese più corto non perde i giorni che l'asse non mostra.
- Senza confronto: «Al {g} {mese} hai speso {S}. Nessun mese prima da confrontare.» (mese passato: «A settembre hai
  speso {S}. …»).
- Nessuna spesa a oggi: `S` = 0 € con la stessa frase.
- Il colore della differenza: `positive` se in meno, `destructive` se in più, nessuno a 0 € (DESIGN.md, colori del
  segno; mai l'ambra, che vuol dire avviso).
- Il verdetto della pagina non cita il tile.

### 5.6 Periodi
- `{ kind: 'month' }` passato o corrente: § 5.3. Un mese futuro (solo calendario): nessuna area, il tratteggio dal
  giorno 1, la lettura «A {mese} ci sono già {S} di spese in calendario.» con il confronto della media (mesi chiusi
  prima di oggi) quando disponibile; nessuna differenza stampata.
- Ogni altro `kind`: il tile non è montato e la riga mobile non esiste (`TRACKING_SECTIONS` filtrato sul periodo).

## 6. Interfaccia

### 6.1 Posto a 1440 (D-AM1)
- Riga 2: «Andamento del mese» in 7 colonne accanto a Cashflow del periodo; Risparmio scende in riga 3 a 12 colonne,
  Movimenti in riga 4. Con un periodo non mensile la griglia torna quella di oggi (Risparmio a 7 colonne in riga 2).
- Tile: eyebrow «Andamento del mese» (`<h3>`), la pillola nella testa (`SegmentedPill`), la lettura (`Narrative`
  via `NarrativeText`, cifre in mono), il grafico, la legenda `SeriesLegend` («Ottobre 2026» · «Già in calendario»
  · il confronto).

### 6.2 Il grafico (D-AM11)
- `AreaChart` (o `ComposedChart`) dalla porta recharts; la serie del mese `--hero-series` con il gradiente di
  Evoluzione (`stopOpacity` 0.35 → 0.02), `strokeWidth={2}`; il calendario `stroke="var(--hero-series)"` tratteggiato,
  `stepAfter`, senza area, opacità ridotta; il confronto una `Line` tratteggiata senza area in uno slot di
  `useChartColors()` distinto da `--hero-series` (la scelta dello slot e il contrasto in tutti i quattordici blocchi di
  tema si verificano con `__tests__/chartPaletteDistinctness.test.ts` come riferimento; doc/guide/temi.md).
- Asse X: i giorni 1 … fine mese, tacche 1 · 8 · 15 · 22 · ultimo; asse Y in euro compatti, `CHART_TICK_STYLE`, griglia
  orizzontale tratteggiata, nessuna linea d'asse. Una linea verticale tratteggiata a oggi (solo nel mese corrente).
- Hover (desktop, `(pointer: fine)`): `Tooltip` con giorno, «Speso» o «Con il calendario» e il valore del confronto;
  il cursore come Evoluzione. Al tocco nessun overlay (la lettura basta).
- `useChartMotion` (riduci movimento rispettato); cambiando confronto la linea si ridisegna senza cambiare la scala
  Y quando il massimo resta sotto la tacca corrente.
- Accessibilità: il grafico ha `aria-label` che ripete la lettura; la pillola è un gruppo con nome «Confronta con».

### 6.3 Composizione mobile (D-AM9; DESIGN.md → Small-Screen Composition)
- 390: una riga chiusa `trk-andamento` in `TRACKING_SECTIONS`, in ordine DOM dopo `trk-entrate` e prima di
  `trk-risparmio`; aside «giorno per giorno» (parole, nessuna cifra). Striscia, verdetto, taglio e scope invariati;
  nessun blocco sollevato. Grafico a `min-h-[160px]`.
- 768: la riga nella griglia a due colonne come le altre (`tabletComposition.ts`).
- Tablet orizzontale: nell'indice, risposta chiusa in `describeTrackingClosedAnswers` — «{|Δ|} sotto/sopra la
  media» (o il nome del confronto scelto), nel colore del segno; `null` senza confronto.
- La memoria `mobile-sections:cashflow:tracking` accetta il nuovo id; chiusa per predefinito.

## 7. Piano

Una sola task, **AM1** (impl, Sonnet 5.5 salvo diversa indicazione sulla card):
1. `lib/utils/spendingTrend.ts` + `__tests__/spendingTrend.test.ts` (§ 5, valori di § 10).
2. Le frasi in `cashflowNarrative.ts` (+ test), la risposta chiusa.
3. `components/cashflow/tiles/AndamentoTile.tsx`, la griglia e `TRACKING_SECTIONS` in `ExpenseTrackingTab.tsx`,
   `tabletComposition.ts`.
4. E2E: `e2e/cashflow.tracciamento.spec.ts` (tile presente con un mese, assente con un anno, pillola ricordata dopo
   il reload, confronto spento), `e2e/mobile-composition.cashflow.mobile.spec.ts` (riga chiusa dopo Entrate),
   `e2e/cashflow.tablet.spec.ts` (indice).
5. Sul Mac, nella stessa PR: `test:e2e` delle spec toccate, `mobile:census` + `mobile:budget` (la riga nuova sta
   sotto la piega; se un tetto si alza, voce con `raisedBy` in doc/guide/prima-schermata-misure.md), `perf:budget`
   (un grafico in più nel chunk lazy di Tracciamento).
6. Guida: § nuova in doc/guide/cashflow-tracciamento.md (Files, regole, Composizione mobile), riga in CLAUDE.md.

## 8. Decisioni

Prese dal proprietario il 2026-10-25 («mi torna tutto», con lo stile del grafico chiesto in aggiunta).

| ID | Decisione | Alternative scartate e motivo |
|----|-----------|-------------------------------|
| D-AM1 | Un tile nuovo «Andamento del mese» in Tracciamento, riga 2 accanto a Cashflow del periodo; Risparmio scende a 12 colonne. | Dentro Cashflow del periodo con interruttore Mesi/Giorni: il confronto finisce dietro un tocco e cambia il tile principale. Budget: è opzionale, chi non ha un tetto non lo vedrebbe. Panoramica: possibile seguito, non ora. |
| D-AM2 | Solo con un periodo di un mese. | Cumulata mese per mese sull'anno: altra domanda, in parte coperta da Analisi › Confronto. |
| D-AM3 | Tre confronti, uno alla volta in una pillola, predefinita la media; scelta ricordata sul dispositivo. | Tre linee insieme: illeggibili a 390. Mese scorso predefinito: lo dice già il trio («vs 1–25 set»). |
| D-AM4 | La media prende i mesi chiusi dal primo mese con un movimento, al più 12, nominata «Media N mesi»; mesi vuoti dopo l'inizio contano zero; servono 2 mesi; confronti senza dati spenti col motivo; al primo mese solo l'area. | Escludere i mesi vuoti: nasconderebbe un mese in cui davvero non hai speso o non hai registrato. |
| D-AM5 | Le stesse spese di «Spese» del trio: commissioni e «Fuori dal budget» incluse, trasferimenti esclusi. | Filtro «solo variabili»: rimandato (§ 9). |
| D-AM6 | Area piena fino a oggi, poi tratteggio a gradini con le sole righe in calendario; nessuna proiezione al ritmo attuale. | Proseguire al ritmo attuale: due proiezioni in due tile diversi. |
| D-AM7 | Asse per giorno del mese; un mese di confronto più corto resta piatto sul suo totale. | Normalizzare sulla frazione di mese: più preciso a febbraio, ma «al 25» non si legge più. |
| D-AM8 | La lettura «Al 25 ottobre hai speso S, Δ in più/in meno di {confronto} agli stessi giorni. {Confronto} chiude a T.»; differenza nel colore del segno; verdetto della pagina invariato. | Una frase nel verdetto: aggiunge cifre sopra la piega a 390. |
| D-AM9 | 390 riga chiusa «Andamento · giorno per giorno» dopo Entrate; 768 riga; tablet orizzontale nell'indice con risposta; misure Mac nella stessa PR. | Una cella nella striscia: la striscia è il trio del periodo, e il confronto sarebbe una quarta cifra fuori dal verdetto. |
| D-AM10 | Nessuna lettura nuova: basta la finestra di Tracciamento (periodo + 12 mesi). | Una lettura dedicata dello storico: inutile, e un costo in più a ogni apertura. |
| D-AM11 | Lo stile di Storico › Evoluzione: il mese è un'area che sfuma in `--hero-series`; il confronto una linea tratteggiata senza area; il calendario tratteggiato senza area. | Due aree sovrapposte: a 390 si impastano. |

## 9. Punti aperti

- **Filtro «solo variabili»** (scalini di affitto e rate fuori dal confronto): non in AM1; da riprendere dopo l'uso,
  se gli scalini disturbano.
- **Panoramica**: una versione piccola nel tile Cashflow della Panoramica, se il tile si rivela utile.

## 10. Criteri di accettazione

Valori di riferimento (test di `spendingTrend` e `cashflowNarrative`); oggi = 25/10/2026, periodo ottobre 2026.

**Fixture A** — righe:
- Agosto 2026: 01/08 affitto 900 (fissa), 05/08 dentista 300 (variabile).
- Settembre 2026: 01/09 900 (fissa), 18/09 250 (variabile), 30/09 100 (variabile).
- Ottobre 2026: 01/10 900 (fissa), 10/10 140 (variabile), 12/10 30 (variabile, «Fuori dal budget»), 15/10
  trasferimento 500, 20/10 60 (variabile) con commissione 2 (riga fee), 25/10 50 (variabile), 28/10 rata 320
  (debito, in calendario).
- Nessuna riga prima di agosto 2026.

Attesi:
1. Ottobre a oggi = 900 + 140 + 30 + 60 + 2 + 50 = **1182 €** = `settleTotals(...).expenses`; all'ultimo giorno
   **1502 €** = `totals.expenses`; il trasferimento non conta; il tratteggio sale di 320 il 28.
2. Settembre al 25 = **1150 €**, al 31 (piatto) = **1250 €**. Δ mese scorso = **+32 €** («32 € in più di
   settembre»), uguale al delta del trio sulle stesse finestre.
3. Media: N = **2** (agosto, settembre), etichetta «Media 2 mesi»; al 25 = (1200 + 1150) / 2 = **1175 €**; Δ =
   **+7 €**; «La media chiude il mese a **1225 €**» ((1200 + 1250) / 2).
4. «Ottobre 2025» spenta («Nessun movimento a ottobre 2025»); predefinito Media.
5. Lettura: «Al 25 ottobre hai speso 1182 €, 7 € in più della media degli ultimi 2 mesi agli stessi giorni. La media
   chiude il mese a 1225 €.»

**Fixture B** — come A, più 01/06/2026 802 € (variabile), nessuna riga a luglio:
6. N = **4** (giugno 802, luglio 0, agosto 1200, settembre 1150 al 25); media al 25 = 3152 / 4 = **788 €**; Δ =
   **+394 €**; etichetta «Media 4 mesi».

**Fixture C** — solo le righe di settembre e ottobre di A:
7. Media spenta («Servono almeno 2 mesi chiusi»); predefinito **Settembre**; lettura con «32 € in più di settembre».

**Fixture D** — solo le righe di ottobre di A:
8. Tutti i confronti spenti; lettura «Al 25 ottobre hai speso 1182 €. Nessun mese prima da confrontare.»

**Fixture E** — periodo febbraio 2027, oggi 15/03/2027, gennaio 2027 con 01/01 900 e 29/01 100, febbraio con 01/02 900:
9. Asse 1…28; la linea di gennaio al 28 vale 900 € (il 29 è oltre l'asse); la lettura del mese passato confronta i
   mesi interi: «A febbraio hai speso 900 €, 100 € in meno di gennaio sull'intero mese.»

**Interfaccia**
10. A 1440 il tile è in riga 2 accanto a Cashflow del periodo con un mese; con «Quest'anno» non c'è e Risparmio è a 7
    colonne in riga 2.
11. La pillola ricorda la scelta dopo un reload; un confronto spento non è cliccabile e ha il motivo come nome.
12. A 390 la riga «Andamento» è chiusa, dopo Entrate; la prima schermata (`mobile:census`) non cambia e
    `mobile:budget` è verde.
13. In tutti i temi il confronto è distinguibile dalla serie del mese (slot verificato, doc/guide/temi.md).
