# Rendimenti: il ROI divide per il capitale iniziale, e la tessera lo chiama «ROI del periodo»

> **Aperta il 2026-09-01 come [issue #324](https://github.com/GiuseppeDM98/net-worth-tracker/issues/324)**
> su upstream. Nel corpo inviato a GitHub questo blocco non c'è, e i rimandi a file che esistono
> solo in questo fork sono già sostituiti (`docs/performance-flows-pr.md` → `#319`).
> Nessun nome di strumento e nessun importo al centesimo: solo aggregati arrotondati.

Due cose, con la stessa radice — **quale capitale sta al denominatore** — e la seconda porta una
domanda di prodotto a cui solo il manutentore può rispondere.

## 1. Il ROI

`calculateROI` (`lib/services/performanceService.ts:99-108`):

```ts
const gain = endNW - startNW - netCashFlow;
return (gain / startNW) * 100;
```

Il numeratore è giusto: la variazione di capitale al netto del denaro entrato. **Il denominatore è
il capitale del primo mese, e basta.** È corretto solo se durante la finestra non entra niente.
Appena ci sono versamenti — cioè sempre, per un utente che sta accumulando — il capitale che ha
prodotto quel guadagno è molto più grande di quello che sta al denominatore, e il ROI esce gonfiato.
L'errore **cresce con la lunghezza della finestra** e con il rapporto versamenti/capitale iniziale,
quindi colpisce al massimo proprio la finestra «Storico», che parte dallo snapshot più vecchio.

### Il punto in cui fa più danno

`RendimentoTile` mostra il ROI come chip accanto al rendimento annualizzato, con didascalia
**«ROI del periodo»** (`components/performance/tiles/RendimentoTile.tsx:108-113`), e il commento
della prop lo descrive come *«The plain period return, never annualised»*
(`RendimentoTile.tsx:23-24`). È esattamente la lettura che l'utente fa: «l'annualizzato è quello
grande, questo è quanto ho reso in tutto il periodo». Ma il rendimento cumulato del periodo è
un'altra cosa, e i due numeri divergono di parecchio.

Stessa formula anche in `PerformanceDettaglio.tsx:198`, nella frase di
`describeReturnMetrics` (`lib/utils/performanceNarrative.ts:572-573` → *«ROI del 72,7% nel
periodo»*), nel prompt dell'analisi AI (`app/api/ai/analyze-performance/route.ts:232`) e nel PDF.

### La misura, su un account reale

23 snapshot mensili, ~22 mesi di storia, base «portafoglio gestito» (fondo pensione e immobili
esclusi). Importi arrotondati.

| finestra | capitale iniziale | versamenti | capitale finale | guadagno | **ROI (oggi)** | TWR cumulato | ROI su capitale medio |
|---|---|---|---|---|---|---|---|
| YTD (8 mesi) | ~65.000 € | ~35.000 € | ~107.000 € | ~7.400 € | **+11,50%** | +9,54% | +9,06% |
| 1 anno (11 mesi) | ~52.000 € | ~46.000 € | ~107.000 € | ~9.400 € | **+18,12%** | +13,61% | +12,57% |
| Storico (22 mesi) | ~20.000 € | ~72.000 € | ~107.000 € | ~14.500 € | **+72,69%** | +29,85% | +25,84% |

Su «Storico» il ROI dice **+72,69%** dove il rendimento cumulato del periodo è **+29,85%**: due
volte e mezzo. E nella stessa tessera, a fianco, l'annualizzato dice +15,31%. Tre numeri che
raccontano tre storie diverse dello stesso periodo, uno solo dei quali è sbagliato.

Da notare: il ROI non è nemmeno **confrontabile fra finestre**. Allungando il periodo il numero
cresce anche a rendimento identico, perché il denominatore torna indietro nel tempo mentre il
numeratore accumula.

### C'è già un precedente nello stesso file

`calculateCAGR`, venti righe più sotto, il problema lo tratta:

```
((End NW / (Start NW + Net Cash Flows))^(1/Years) - 1) * 100
```

I flussi entrano nel denominatore. `calculateROI` è l'unica delle metriche del modulo a non
farlo — anche `calculateMoneyWeightedReturn` (IRR) pesa i flussi per il tempo in cui sono rimasti
investiti.

### Le alternative

1. **La chip diventa il TWR cumulato.** È letteralmente quello che la didascalia promette
   («rendimento del periodo, non annualizzato»), il dato esiste già —
   `timeWeightedReturn` è annualizzato e `numberOfMonths` è nel payload, il cumulato è
   `(1 + twr)^(mesi/12) − 1` — e non introduce nessuna metrica nuova. **È la nostra preferita**:
   corregge il punto dove il numero viene letto di più, senza toccare la definizione di ROI.
2. **Il ROI passa al capitale medio investito (Dietz semplificato):** denominatore
   `startNW + netCashFlow / 2`. Un numero onesto e confrontabile fra finestre, ma non è più «il
   ROI» come lo si trova nei manuali: va rinominato («rendimento sul capitale medio investito»), o
   diventa un terzo nome per una cosa che TWR e IRR già coprono.
3. **Togliere il ROI.** IRR (`moneyWeightedReturn`) risponde già a «quanto ha reso il denaro come
   l'ho versato io», pesando ogni flusso per il tempo. Il ROI sparisce da tessera, Dettaglio,
   prompt AI e PDF. Meno numeri, nessuno ambiguo.
4. **Tenere formula e nome, cambiare le parole.** Didascalia «sul capitale iniziale» invece di «del
   periodo», e la frase del Dettaglio che dichiara che con versamenti importanti il numero non è
   confrontabile fra periodi. Il minimo indispensabile: rende il numero difendibile, ma lascia
   sulla tessera un numero che quasi nessuno leggerà nel modo giusto.

Le opzioni 1 e 4 sono compatibili fra loro (chip corretta + ROI dichiarato nel Dettaglio) e sono
probabilmente il compromesso migliore.

Nessuna delle quattro tocca il calcolo di TWR, volatilità, Sharpe, Max Drawdown o CAGR.

## 2. L'export PDF misura un altro perimetro (e un'altra finestra di flussi)

Indipendente dal punto 1, ma emerso dalla stessa verifica.

`getAllPerformanceData` proietta gli snapshot sulla base scelta dall'utente prima di misurare
(`lib/services/performanceService.ts:1440-1442`: `resolvePerformanceExclusions` →
`toPerformanceBaseSnapshots`, cioè fuori i fondi pensione e gli asset `allocationRole: 'excluded'`).

`preparePerformanceData` **no**: passa a `calculatePerformanceForPeriod` gli snapshot **grezzi**
(`lib/services/pdfDataService.ts:571-580`), e con `timeFilter='total'` il periodo è proprio `ALL`.
Il PDF misura quindi il **patrimonio intero**, casa e fondo pensione compresi, mentre la pagina
misura il **portafoglio gestito**. Stessa metrica, due numeri, nessuno dei due dichiara quale
perimetro sta usando.

Sullo stesso account di sopra:

| | ROI | CAGR | TWR annualizzato |
|---|---|---|---|
| PDF «Totale» | **+273,90%** | +103,85% | +105,28% |
| Pagina, finestra «Storico» | +72,69% | +8,29% | +15,31% |
| PDF «Annuale» | +14,69% | +22,70% | +22,78% |
| Pagina, finestra YTD | +11,50% | +11,42% | +14,65% |

Il +105% annualizzato non viene solo dal perimetro: viene soprattutto dai **flussi**. Su
quell'account lo storico del Cashflow parte da dicembre 2025, mentre gli snapshot partono da
ottobre 2024. La finestra `ALL` confronta quindi una variazione di capitale di 22 mesi con i flussi
di 8: **tutti i versamenti dei primi 14 mesi vengono letti come rendimento**. È lo stesso difetto di
accoppiamento base/flussi che la #319 corregge sulla pagina — e che il PDF non erediterebbe
comunque, perché non passa `portfolioFlows`.

### La domanda, prima della correzione

**Il recap del PDF deve parlare di patrimonio o di portafoglio?** Le due risposte portano a due fix
diversi:

- **portafoglio** (coerente con la pagina Rendimenti): passare a `preparePerformanceData` gli
  asset, proiettare la base con `toPerformanceBaseSnapshots` e — dopo la #319 — costruire i
  `portfolioFlows` come fa `getAllPerformanceData`. La sezione del PDF dice gli stessi numeri
  della pagina;
- **patrimonio** (il PDF è un consuntivo di tutto ciò che si possiede): allora il perimetro attuale
  è voluto, ma va **dichiarato** — oggi la sezione si intitola *«Performance Portafoglio»*
  (`components/pdf/sections/PerformanceSection.tsx:59`), che è la parola dell'altro perimetro — e
  resta comunque da chiudere il problema dei flussi, perché una finestra `ALL` più lunga della
  storia del Cashflow legge i versamenti come rendimento a qualunque perimetro.

## Come sono stati ottenuti i numeri

Riproducendo la pipeline vera fuori dall'app — `resolvePerformanceBaseOptions` →
`resolvePerformanceExclusions` → `toPerformanceBaseSnapshots` → `calculatePerformanceForPeriod`,
con `preFetchedExpenses` passato per evitare qualunque scrittura o cache — su un account reale
letto in sola lettura con l'Admin SDK. Le due righe «PDF» della tabella sono la stessa chiamata con
gli argomenti di `preparePerformanceData` (snapshot grezzi, nessun `portfolioFlows`).
