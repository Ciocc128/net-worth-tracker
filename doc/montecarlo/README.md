# Monte Carlo — sei classi, correlazioni e leva (epic `epic-montecarlo`)

> **Per chi implementa (agente).** Questo dossier è la specifica vincolante delle tre task dell'epic
> Monte Carlo. Le decisioni funzionali (§ 3) sono **chiuse**: non riaprirle, non aggiungere
> funzionalità. Dove dossier e codice sembrano in contrasto, fermati e chiedi nel thread (WORKFLOW.md
> § 1 regola 6c).
>
> Base di codice analizzata: commit `e505459` (03/10/2026, `main` del fork). Se `main` è avanzato,
> verifica che i simboli citati esistano ancora con la stessa firma prima di usarli.
>
> Lingua: conversazione in italiano; codice, identificatori e commenti in inglese; testo UI in italiano.
>
> **Ordine**: R0 (ricerca) → T1 → T2 → T3. Ogni task parte da sola da `main` dopo il merge della
> precedente; nessuna richiede codice non ancora scritto da una task successiva.

---

## 0. Letture obbligatorie prima di scrivere codice

1. `WORKFLOW.md` § 1 (regola 6 per i thread cloud) e § 2.
2. `doc/guide/fire.md` § FIRE, What If and Goals (pension lock come afflussi a valore di oggi, motore del
   Ventaglio, `deriveMonteCarloAllocation` normalizzatore unico, memoizzazione del fan).
3. `doc/guide/fire-monte-carlo.md` per intero (The Stale-Run Rule, una esecuzione = tre scenari, mediana
   dall'ultima riga dei percentili, nessun token di segno).
4. `doc/guide/impostazioni.md` § Settings — the FIVE places, e le regole del tile senza verdetto.
5. `doc/guide/allocazione.md` § Allocation — the two plans and the leverage engine (target come % del
   capitale investibile, `deriveTargetLeverageRatio`, nozionale vs mercato) — **solo per T3**.
6. `DESIGN.md`: The Declaration-Tile Rule, The Input Tile Rule, The Stale-Run Rule, The Narrative Honesty
   Rule, The Risk-vs-Fact Rule, The Sign-Color Token Rule, The Comma Rule, The Verdict-First Rule.

---

## 1. AFU

### 1.1 Obiettivo

Il Monte Carlo deve simulare **tutto** il capitale che dichiara di simulare, con parametri di mercato
che hanno una fonte e un significato espliciti, classi che si muovono insieme come nella realtà, e la
leva con il suo costo — così che «quanto è probabile?» abbia una risposta difendibile anche per un
portafoglio con ETF a leva.

### 1.2 Stato di partenza (verificato nel codice, 03/10/2026)

| Fatto | Dove |
| --- | --- |
| Rendimento e volatilità per **4** classi × 3 scenari, modificabili e salvati: la vecchia 1/3 «come scritta» è già fatta | `types/assets.ts:635`, `components/monte-carlo/tiles/ParametriTile.tsx:77`, `lib/services/assetAllocationService.ts:296` |
| Il capitale è il patrimonio **totale** (liquidità e crypto comprese), i pesi solo sulle 4 classi: la liquidità rende come il mix | `MonteCarloTab.tsx:173,229`, `lib/utils/monteCarloParams.ts:42` |
| Trend e Carry (gambe degli ETF compositi) ignorati | `monteCarloParams.ts:9` |
| La leva sparisce: i pesi vengono dal valore di **mercato** per composizione, `leverageRatio` ignorato | `assetAllocationService.ts:637` (`calculateCurrentAllocation`) |
| Estrazione **normale indipendente** per classe: nessuna correlazione; il campo «Rendimento» è una media aritmetica (7%/18% ⇒ crescita composta mediana ≈ 5,5%) | `monteCarloService.ts:98` e `:464` (righe del codice, non di questo file) |
| Il Ventaglio legge solo lo scenario **Base salvato**; le modifiche non salvate del tab non gli arrivano | `FireCalculatorTab.tsx:465` |
| Default scritti a mano, senza fonte | `getDefaultMonteCarloScenarios` |
| Il tab Monte Carlo non è seminato (due esecuzioni differiscono), il Ventaglio sì | `fire-monte-carlo.md` § blind spots |

### 1.3 Perimetro

**Incluso**
- Sei classi: Azioni, Obbligazioni, Materie prime, Liquidità, Trend, Carry (`AssetClass` di
  `types/assets.ts:22`, etichette di `lib/utils/assetDisplayClass.ts`). **Crypto e Immobili restano fuori
  dalla simulazione** (revisione del proprietario, 03/10/2026): il loro valore non entra nel capitale
  simulato e il tile Parametri lo dichiara (§ 5.1).
- Ipotesi di mercato salvate in **Impostazioni** (nuova tab), lette da **entrambi** i motori: Monte Carlo
  (decumulo) e Ventaglio del Calcolatore (accumulo).
- Rendimento inserito come **CAGR**, volatilità come deviazione standard dei rendimenti annui semplici;
  estrazione **lognormale multivariata**.
- Una **matrice di correlazione** unica (15 coppie), con correzione automatica alla più vicina valida.
- **Leva** costante ribilanciata ogni anno, pesi che sommano ≥ 100, costo = liquidità estratta + spread,
  rovina da leva contata a parte, confronto «senza leva» sugli stessi shock.

**Escluso**
- Il Calcolatore deterministico (`fireProjectionScenarios.growthRate`): resta un altro modello, un tasso.
- Bootstrap storico, code grasse (t di Student), correlazioni per scenario o stressate nell'Orso.
- Debito fisso con margin call: appartiene alla FEAT «Futures e margin account» (Backlog), che riuserà
  il motore di T3 cambiando solo la regola del debito (§ 7.4).
- What If, Coast FIRE, Obiettivi: non leggono parametri di mercato per classe.
- Crypto e Immobili: nessun parametro, nessun peso; il loro valore resta fuori dal capitale simulato.
  Oggi gli Immobili sono una delle quattro classi del Monte Carlo: T1 li toglie.

### 1.4 Casi d'uso

1. **Il portafoglio con molta liquidità.** 100.000 € in un ETF azionario e 100.000 € sul conto: oggi il
   Monte Carlo simula 200.000 € al 100% azioni; dopo T1 al 50% azioni e 50% liquidità.
2. **Chi ha letto un CAGR.** Scrive «Azioni 7%, volatilità 18%» da una fonte storica: dopo T1 la mediana
   composta simulata è 7%, non 5,5%; accanto legge «media aritmetica 8,5%» in sola lettura.
3. **Le classi insieme.** Nell'anno in cui le azioni perdono il 30%, le materie prime spesso le seguono e il
   Trend spesso guadagna: dopo T2 la dispersione del portafoglio misto riflette la diversificazione vera.
4. **Il portafoglio a leva.** Target di Allocazione che sommano 150% (ETF 1,5x): dopo T3 il Monte Carlo
   simula 1,5× con il costo del debito, dice quante simulazioni falliscono per rovina da leva e quanto
   farebbe lo stesso piano senza leva sugli stessi rendimenti.
5. **Il Ventaglio coerente.** Modificate le ipotesi in Impostazioni e salvato, il Ventaglio del
   Calcolatore e il Monte Carlo usano gli stessi numeri; nessuno dei due ne ha una copia propria.

### 1.5 Regole di calcolo

**R1 — Da CAGR e volatilità ai parametri lognormali** (per classe, per scenario; `g` = CAGR, `σa` =
volatilità, entrambi in decimali):

```
k  = σa² / (1+g)²
x  = (1 + √(1 + 4k)) / 2          // x = e^{s²}
s  = √(ln x)                      // dev. std del log-rendimento
m  = ln(1+g)                      // media del log-rendimento: mediana di (1+r) = 1+g
μa = (1+g)·√x − 1                 // media aritmetica, mostrata in sola lettura
```

Estrazione: `ln(1+r_i) = m_i + s_i · z_i`, con `z = L·ε`, `ε` normali standard indipendenti, `L` il
fattore di Cholesky della matrice di correlazione `C` (T2; prima di T2 `C = I`). La correlazione si
intende **sui log-rendimenti** (è quella che la ricerca R0 misura). Ogni `r_i > −100%` per costruzione.

**R2 — Migrazione dei valori salvati** (oggi medie aritmetiche `μ` di una normale con volatilità `σ`):
`x = 1 + σ²/(1+μ)²`, `g = (1+μ)/√x − 1`, `σa = σ`. Così media e varianza di `1+r` restano quelle di
prima e il piano salvato non cambia di significato. I parametri salvati degli Immobili (`realEstateReturn`,
`realEstateVolatility`) si scartano: la classe non esiste più nel Monte Carlo.

**RK — Capitale simulato**: `K` = valore delle sei classi negli asset (per gli asset compositi, le sole
gambe delle sei classi), al netto dei fondi pensione bloccati come oggi. Crypto e Immobili, e le gambe
composite di quelle classi, restano fuori da `K` in **entrambi** i motori.

**R3 — Rendimento del portafoglio senza leva** (pesi `w_i` in decimali, Σw = 1):
`1 + r_p = Σ w_i · (1 + r_i)`. Ribilanciamento annuale, come oggi.

**R4 — Rendimento con leva** (T3; pesi che sommano `W ≥ 1`, leva `L = W`; `c` = rendimento estratto della
Liquidità nell'anno + spread):
`1 + r_p = Σ w_i · (1 + r_i) − (W − 1) · (1 + c)`.
Se dopo il rendimento il capitale è `≤ 0` il percorso fallisce con causa **«leva»**; se va a zero dopo il
prelievo, con causa **«prelievi»** (come oggi).

**R5 — Correzione della matrice** (T2): se `C` non è semidefinita positiva, si sostituisce con la matrice
di correlazione più vicina in norma di Frobenius (algoritmo di Higham 2002, proiezioni alternate con
correzione di Dykstra), poi autovalori portati ad almeno `ε = 1e-6` e diagonale rinormalizzata a 1.
Si salva la matrice corretta a piena precisione; la UI mostra due decimali.

**R6 — Pesi seminati dai target** (T3): sul capitale `K` della simulazione (patrimonio al netto dei fondi
pensione bloccati, come oggi, RK): `w_c = (t_c · B + E_c) / K`, dove `t_c` è il target effettivo della classe
(% del capitale investibile, come in Allocazione; la liquidità a importo fisso entra come importo), `B`
il valore di mercato del capitale investibile (`allocationRole` ∈ {tradable, frozen}), `E_c` il
nozionale della classe negli asset `excluded` che fanno parte di `K`. **Importa il portafoglio di oggi**:
`w_c = Σ notional_c / K` con `expandAssetExposure` su tutti gli asset di `K`.
Target e nozionale di Crypto e Immobili non entrano: i target delle sei classi si riscalano per
`100 / (100 − t_crypto − t_immobili)`, così la leva relativa delle sei classi resta quella voluta.

### 1.6 Criteri di accettazione (valori di riferimento verificabili)

| # | Caso | Valore atteso |
| --- | --- | --- |
| A1 | R1 con g = 7%, σa = 18% | m = 0,067659; s = 0,164829; μa = 8,4634% |
| A2 | R1 con g = 3%, σa = 6% | m = 0,029559; s = 0,058105; μa = 3,1740% |
| A3 | R1 con g = 0%, σa = 60% (volatilità alta) | m = 0; s = 0,497655; μa = 13,1824% |
| A4 | R2 con μ = 7%, σ = 18% | g = 5,5174%; e R1(g, 18%) restituisce μa = 7,0000% |
| A5 | 200.000 estrazioni seminate, g = 7%, σa = 18% | mediana di r in 7% ± 0,2 pp; media in 8,46% ± 0,2 pp |
| A6 | Volatilità 0 su tutte le classi | ogni classe rende esattamente il suo CAGR; il test di coerenza del Ventaglio con `calculateFIREProjection` resta verde |
| A7 | 100.000 € azioni + 100.000 € liquidità | pesi seminati 50/50 (oggi 100/0) |
| A7b | A7 + 250.000 € immobili + 5.000 € crypto | capitale 200.000 €, pesi 50/50; riga «Fuori dalla simulazione: Immobili 250.000 €, Crypto 5.000 €» |
| A8 | Due classi, ρ = 0,5, 200.000 estrazioni seminate | correlazione campionaria dei log-rendimenti 0,50 ± 0,01 |
| A9 | `C` = [[1, 0,9, 0,9], [0,9, 1, −0,9], [0,9, −0,9, 1]] (autovalori −0,8; 1,9; 1,9) | corretta ≈ [[1, 0,5, 0,5], [0,5, 1, −0,5], [0,5, −0,5, 1]] ± 0,01, Cholesky riesce |
| A10 | Volatilità 0, Azioni 150%, Liquidità g = 2%, spread 1%, Azioni g = 7% | r_p = 1,5·1,07 − 0,5·1,03 − 1 = 9,0% |
| A11 | Un anno con Azioni −60%, leva 2,5, c = 4% | 1 + r_p = 2,5·0,40 − 1,5·1,04 = −0,56 ⇒ rovina «leva» in quell'anno |
| A12 | Leva 1 | risultato identico, float per float, al motore senza leva con lo stesso seme |
| A13 | Confronto senza leva | stesso seme, stessi `ε` per anno e percorso; la probabilità senza leva differisce solo per la leva |

---

## 2. Prerequisito R0 — Ricerca dei valori predefiniti (thread «ricerca»)

Non è codice. Consegna un file in Library (`/mnt/project-files/ricerca/montecarlo-default.md`) con, per
ognuna delle sei classi, **fonti aggiornate e citate** (mai a memoria):

1. Serie storica annuale scelta (indice, valuta EUR o USD dichiarata, periodo), CAGR nominale e
   deviazione standard dei rendimenti annui semplici sull'intero periodo → scenario **Base**.
2. **Orso** e **Toro** con una regola unica e dichiarata. Proposta da verificare sulle serie: 10° e 90°
   percentile del CAGR su finestre mobili di 30 anni, con la volatilità della stessa finestra; dove la
   serie è più corta di 60 anni (Trend, Carry) la regola si adatta e la ricerca lo scrive.
3. Inflazione per scenario con la stessa regola (serie HICP area euro o equivalente dichiarata).
4. Le 15 correlazioni dei **log-rendimenti annui** sul periodo comune più lungo, con il periodo usato
   per ogni coppia.
5. Lo spread della leva: costo di finanziamento oltre il tasso a breve, misurato su un broker al
   dettaglio europeo e sul costo implicito di un ETF a leva UCITS (swap spread + TER oltre il 1x).

T1 ha bisogno dei punti 1–3, T2 del punto 4, T3 del punto 5. Le cifre entrano nel codice in un solo
file, `lib/constants/monteCarloMarketDefaults.ts`, con la fonte e la data nel commento d'intestazione e
nel campo `source`.

---

## 3. Decisioni (prese con il proprietario il 03/10/2026)

| # | Decisione | Alternative scartate e motivo |
| --- | --- | --- |
| D1 | La vecchia 1/3 si **riscrive**: **sei classi** (Azioni, Obbligazioni, Materie prime, Liquidità, Trend, Carry), tutte con rendimento e volatilità per scenario; il capitale è la somma delle classi modellate. Trend e Carry sono classi a tutti gli effetti. **Revisione del 03/10/2026**: Crypto e Immobili tolti dalla feature, il loro valore resta fuori dal capitale simulato. | Chiuderla e spostare tutto nella 2/3 (la gonfia); aggiungere solo liquidità e crypto (lascia i motori divergenti). |
| D2 | Le ipotesi vivono in **Impostazioni**; il tile Parametri le **dichiara** con un link (The Declaration-Tile Rule). Entrambi i motori leggono il salvato. | Restare nel tile (48+ campi in un tile di risultato, mobile ingestibile); fonte in Impostazioni con ritocco locale (due stati da tenere coerenti). |
| D3 | Default da **medie storiche di lungo periodo con fonte** (R0); Orso e Toro con una regola dichiarata. | Stime prospettiche a 10 anni (orizzonte sbagliato per 30–50 anni di prelievi); tenere i numeri attuali (nessuna fonte). |
| D4 | Il rendimento si inserisce come **CAGR**; la media aritmetica si ricava e si mostra in sola lettura. I salvati si migrano con R2. | Media aritmetica (l'errore di oggi resta possibile); selettore per campo (raddoppia stati e test). |
| D5 | Distribuzione **lognormale** multivariata. | Normale (perdite oltre −100%, rotta con la leva); lognormale con code grasse (un parametro in più, aggiungibile dopo senza cambiare i dati); bootstrap (serie annuali per tutte le classi, scenari come finestre storiche). |
| D6 | **Una** matrice di correlazione per tutti gli scenari. | Una per scenario (45 numeri, default dell'Orso da inventare); unica con stress nell'Orso (rinviabile senza cambiare il formato). |
| D7 | Inserimento come **elenco per classe** (ogni coppia una volta); matrice non valida **corretta automaticamente** (R5) con le coppie cambiate evidenziate. | Blocco al salvataggio (correggere a mano è difficile); solo default in lettura. |
| D8 | I pesi si **seminano dai target effettivi di Allocazione** (somma > 100 = leva), con un pulsante **«Importa il portafoglio di oggi»** che carica il nozionale detenuto, leva compresa. Nessun campo «Leva» separato. | Dal portafoglio come default (scelta iniziale del proprietario, poi rivista); rapporto a mano (scelto e poi ritirato dal proprietario nella stessa sessione). |
| D9 | Costo del debito = rendimento **estratto della Liquidità** nell'anno + **spread** fisso (Impostazioni). | ECBDFR di oggi + spread (fisso per 50 anni); tasso a mano per scenario (nessun legame con i tassi). |
| D10 | Leva **costante ribilanciata ogni anno**; patrimonio ≤ 0 dopo il rendimento = **rovina da leva**, contata a parte. | Debito fisso con margin call (della FEAT margin account); troncare a −99% (ottimista). |
| D11 | Oltre ai footer e al Dettaglio, con leva > 1 il Base si **rilancia senza leva sugli stessi shock** e il verdetto lo dice. Il tab diventa **seminato**. | Solo footer e verdetto (non risponde a «la leva conviene?»); tile «Ipotesi» (ripete Impostazioni). |

**Scelte di default prese dall'agente** (dichiarate, il proprietario può rovesciarle):
- **Ridistribuzione tra le task.** La semantica dei parametri (CAGR, volatilità, lognormale, D4–D5) va
  in **T1** e non in T2: T1 ricostruisce comunque quei campi e la loro sede, e farlo due volte
  migrerebbe i dati due volte. T2 resta «correlazioni»; T3 «leva».
- **Una tab nuova di Impostazioni, «Simulazioni»**, settima, dopo «Dividendi». Le altre sei restano
  come sono.
- **Ventaglio e leva**: il Ventaglio proietta il portafoglio detenuto, quindi da T3 usa i pesi di
  «Importa il portafoglio di oggi» (nozionale, leva compresa), non i target. Usa solo lo scenario Base,
  come oggi.
- **Stesso seme per i tre scenari**: Orso, Base e Toro vedono gli stessi `ε`; la differenza tra scenari
  diventa solo di parametri.

### 3.1 Punti aperti

- I numeri predefiniti: li fissa R0. Finché R0 non è consegnata, T1 non parte (niente valori provvisori).
- La regola Orso/Toro esatta: proposta in § 2.2, da confermare quando R0 mostra le serie.

---

## 4. Modello dati (comune alle tre task)

### 4.1 Classi — `lib/constants/monteCarloClasses.ts` (nuovo, T1)

```ts
export const MONTE_CARLO_CLASSES = [
  'equity', 'bonds', 'commodity', 'cash', 'trendFollowing', 'carry',
] as const satisfies readonly AssetClass[];
export type MonteCarloClass = (typeof MONTE_CARLO_CLASSES)[number];
```

L'ordine è quello della matrice di correlazione (triangolo superiore riga per riga, 15 valori). Le
chiavi sono quelle di `AssetClass`: nessuna mappa `commodities` come oggi. `realestate` e `crypto` non
sono classi del Monte Carlo: un asset di quelle classi (o la gamba di un composito) resta fuori dal
capitale simulato.

### 4.2 Impostazioni — `types/assets.ts`

```ts
export interface MonteCarloClassParams { cagr: number; volatility: number } // percent
export interface MonteCarloMarketScenario {
  classes: Record<MonteCarloClass, MonteCarloClassParams>;
  inflationRate: number; // percent
}
export interface MonteCarloMarketSettings {
  version: 1;
  scenarios: { bear: MonteCarloMarketScenario; base: MonteCarloMarketScenario; bull: MonteCarloMarketScenario };
  correlations?: number[];   // T2: 15 values, upper triangle in MONTE_CARLO_CLASSES order; absent = defaults
  leverageSpread?: number;   // T3: percent; absent = default
}
// on AssetAllocationSettings:
monteCarloMarket?: MonteCarloMarketSettings;
```

- **Campo nuovo, non un'estensione di `monteCarloScenarios`**: il significato cambia (CAGR vs media) e
  un campo con due significati è il bug. `monteCarloScenarios` resta nel tipo, **si legge solo per
  migrare** (R2) e non si scrive più: upstream lo usa ancora (§ 9, rischi di merge).
- **Risoluzione unica** — `resolveMonteCarloMarket(settings): ResolvedMonteCarloMarket` in
  `lib/utils/monteCarloMarket.ts` (nuovo): `monteCarloMarket` se presente; altrimenti
  `monteCarloScenarios` migrato con R2 per le quattro classi storiche più i default per le altre
  quattro; altrimenti i default. Restituisce anche `origin: 'saved' | 'migrated' | 'default'` per la
  lettura del tile. **Ogni** consumatore passa di qui; nessuno legge i due campi direttamente.
- Le sedi (§ Settings — the FIVE places): tipo; `getSettings` (`monteCarloMarket: data.monteCarloMarket`);
  **entrambi** i rami di `setSettings` (`'monteCarloMarket' in settings` → `deleteField()` nel ramo merge,
  `delete docData.monteCarloMarket` nel ramo `targets`); la tab «Simulazioni» con stato/caricamento/
  snapshot dirty/salvataggio; il mapper di `lib/services/dashboardOverviewService.ts:148` (oggi rimappa
  `monteCarloScenarios` senza che nessuno lo legga: aggiungere il nuovo campo accanto); il fixture
  `STORED_SETTINGS` di `__tests__/settingsRoundTrip.test.ts`. Il mailer (`getSettingsAdmin`) non ne ha
  bisogno.
- **Validazione** — `lib/utils/monteCarloMarketValidation.ts`: CAGR in [−50, 100], volatilità in [0, 200],
  inflazione in [−5, 20], correlazioni in [−1, 1], spread in [0, 20]. Restituisce l'elenco dei campi
  fuori intervallo per nome («Trend, Toro: volatilità oltre 200%»), come
  `allocationTargetValidation.ts`.

### 4.3 Parametri dei motori — `types/assets.ts` e `lib/services/monteCarloService.ts`

I quattro gruppi di campi piatti (`equityPercentage`, `equityReturn`, `equityVolatility`, … su
`MonteCarloParams`, `MonteCarloScenarioParams`, `AccumulationSimulationParams`) diventano:

```ts
weights: Record<MonteCarloClass, number>;        // percent; T1-T2: Σ = 100; T3: Σ ≥ 100
market: { classes: Record<MonteCarloClass, MonteCarloClassParams>; inflationRate: number };
correlations?: number[];                         // T2; absent = identity
leverageSpread?: number;                         // T3
random?: () => number;                           // already on the accumulation engine; T3 adds it here
```

Un solo modulo puro prepara l'estrazione: `lib/utils/monteCarloDraw.ts` (nuovo, T1) con
`toLogNormal(params)` (R1), `buildDrawPlan(market, correlations)` (m, s, Cholesky una volta per
esecuzione) e `drawYear(plan, random): number[]` (sei rendimenti dell'anno). **Entrambi** i motori
chiamano `drawYear`; `randomNormal` resta solo come primitiva interna.

---

## 5. T1 — Classi complete e ipotesi di mercato in Impostazioni (ex 1/3)

### 5.1 Cosa vede l'utente

- **Impostazioni › Simulazioni** (nuova tab). Un tile «Ipotesi di mercato» con lettura in una riga
  («Sei classi, valori predefiniti da <fonte> fino al <anno>» / «modificate in 3 classi» / «migrate dai
  parametri salvati prima del <data>: rileggile»), un selettore Orso · Base · Toro (`segmented-pill`) e
  sotto, per lo scenario scelto, sei righe: classe · CAGR % · volatilità % · «media 8,5%» in sola lettura
  (μa di R1). Inflazione dello scenario sotto le righe. «Ripristina default» per scenario. Il salvataggio
  è il «Salva» unico della pagina, con il punto sulla tab quando ci sono modifiche.
- **FIRE › Monte Carlo › Parametri**: la griglia degli scenari sparisce. Al suo posto una
  dichiarazione (`DeclarationRow`): «Ipotesi di mercato: valori predefiniti» / «salvate il 03/10/2026»,
  con il link «Modifica in Impostazioni» (`/dashboard/settings?tab=simulazioni`). I pesi diventano sei
  campi (Σ = 100, come oggi la regola dei quattro). Sotto i pesi, una riga in sola lettura dichiara ciò che
  resta fuori: «Fuori dalla simulazione: Immobili 250.000 €, Crypto 5.000 €» (assente se non c'è nulla).
- Il campo del capitale e le sue scorciatoie «Totale / Liquido» restano, ma «Totale» diventa `K` (RK) e
  «Liquido» la sua parte liquida: il capitale coincide con quello che i pesi coprono.
- **Dettaglio › Come si calcola** (`EXPLAINER` di `monteCarloNarrative.ts:377`): «La simulazione» dice
  «un rendimento casuale da una lognormale con il CAGR e la volatilità dello scenario»; «I limiti» dice
  ancora «rendimenti indipendenti tra le classi» (fino a T2).

### 5.2 Dettagli tecnici

1. `lib/constants/monteCarloClasses.ts`, `lib/constants/monteCarloMarketDefaults.ts` (cifre di R0 punti
   1–3; correlazioni e spread arrivano in T2 e T3).
2. `lib/utils/monteCarloMarket.ts`: `resolveMonteCarloMarket`, `migrateLegacyScenarios` (R2),
   `describeMarketOrigin` per le due letture.
3. `lib/utils/monteCarloDraw.ts`: R1, `drawYear` con `C = I`.
4. `deriveMonteCarloAllocation` → `deriveMonteCarloWeights(byAssetClass)` su sei classi, stessa regola di
   arrotondamento (residuo sulla classe più piccola, anche a valore zero), `null` se tutto è zero. Resta
   **l'unico** normalizzatore, chiamato da `MonteCarloTab` e da `FireCalculatorTab`.
5. `monteCarloService.ts`: `runSingleSimulation` e `runAccumulationSimulation` leggono `weights` e
   `drawYear`. `getDefaultMarketParameters`/`getDefaultMonteCarloScenarios`/`buildParamsFromScenario`
   lasciano il posto a `resolveMonteCarloMarket` e a `buildScenarioParams(plan, market.scenarios[k])`.
6. `MonteCarloTab.tsx`: stato `scenarios` e `saveMutation` rimossi (la scrittura si sposta in
   Impostazioni); `MonteCarloRunInputs` confronta il mercato **risolto** nel `haveRunInputsChanged`,
   così un salvataggio in Impostazioni rende stantia l'ultima esecuzione (The Stale-Run Rule).
7. `FireCalculatorTab.tsx:465`: `settings?.monteCarloScenarios?.base` → `resolveMonteCarloMarket(settings).scenarios.base`.
   Il Ventaglio parte da `K` (RK), non più dal patrimonio FIRE intero: la sua lettura dice che Immobili e
   crypto sono fuori, e la linea deterministica del Calcolatore resta quella di oggi (altro modello, § 1.3).
8. Tab «Simulazioni» in `app/dashboard/settings/page.tsx` + `describeMonteCarloMarket` in
   `settingsNarrative.ts` (nessun verdetto: è Impostazioni).

### 5.3 File

**Nuovi**: `lib/constants/monteCarloClasses.ts`, `lib/constants/monteCarloMarketDefaults.ts`,
`lib/utils/monteCarloMarket.ts`, `lib/utils/monteCarloMarketValidation.ts`, `lib/utils/monteCarloDraw.ts`,
`components/settings/MonteCarloMarketTile.tsx`, test omonimi in `__tests__/`.
**Modificati**: `types/assets.ts`, `lib/services/monteCarloService.ts`, `lib/utils/monteCarloParams.ts`,
`lib/services/assetAllocationService.ts`, `lib/services/dashboardOverviewService.ts`,
`app/dashboard/settings/page.tsx`, `lib/utils/settingsNarrative.ts`,
`components/fire-simulations/{MonteCarloTab,FireCalculatorTab}.tsx`,
`components/monte-carlo/tiles/ParametriTile.tsx`, `components/monte-carlo/MonteCarloDettaglio.tsx`
(se legge le chiavi a quattro classi), `lib/utils/{monteCarloSummary,monteCarloNarrative}.ts`,
`lib/utils/fireSummary.ts` (se tipizza i parametri del fan), la landing se cita le quattro classi.

### 5.4 Test

- `monteCarloDraw.test.ts`: A1–A3, A5 (seme fisso), A6; nessun `r ≤ −100%` su 10⁶ estrazioni con σa = 200%.
- `monteCarloMarket.test.ts`: A4; le tre origini; un salvato parziale (classe mancante) si completa
  con il default della classe.
- `monteCarloParams.test.ts`: A7, A7b; residuo dell'arrotondamento su sei classi; Trend e Carry dalle gambe;
  un composito con una gamba immobiliare porta nel capitale solo le gambe delle sei classi.
- `monteCarloService.test.ts`: il test di coerenza a volatilità zero del Ventaglio resta verde **senza
  modificarlo nella sostanza** (cambia solo la forma dei parametri).
- `settingsRoundTrip.test.ts`: `monteCarloMarket` nel fixture, round-trip e cancellazione.
- `monteCarloMarketValidation.test.ts`: ogni limite, messaggio con classe e scenario.

---

## 6. T2 — Correlazioni tra le classi (ex 2/3)

### 6.1 Cosa vede l'utente

- **Impostazioni › Simulazioni**, secondo tile «Correlazioni». Lettura: «Valori predefiniti da <fonte>,
  <periodo>» / «modificate 4 coppie su 15». Sotto, un elenco per classe: «Azioni con…» apre cinque righe
  (le classi successive nell'ordine, così ogni coppia compare una volta); le classi che il portafoglio
  detiene vengono prima, le altre chiuse. Un campo per riga, da −1,00 a 1,00, passo 0,05.
- Se la matrice salvata non è valida, al «Salva» viene corretta (R5): le coppie cambiate restano
  evidenziate con «scritto 0,90 → usato 0,50» finché non si salva di nuovo o si chiude la pagina, e il
  toast dice «Correlazioni corrette: 3 coppie adattate per renderle coerenti».
- Monte Carlo: la riga della dichiarazione nel tile Parametri aggiunge «correlazioni predefinite» /
  «personalizzate». `EXPLAINER`: «I limiti» perde «rendimenti indipendenti tra le classi» e dice «classi
  correlate con una matrice unica per i tre scenari; le correlazioni nelle crisi tendono a salire e qui
  non salgono».

### 6.2 Dettagli tecnici

1. `lib/utils/correlationMatrix.ts` (nuovo, puro): `expandUpperTriangle(values, n)`,
   `isPositiveSemiDefinite(C)`, `nearestCorrelation(C)` (R5, iterazioni massime 200, tolleranza 1e-9),
   `cholesky(C)`. Serve un'autodecomposizione simmetrica: Jacobi ciclico su 6×6, scritto nel modulo,
   nessuna dipendenza nuova.
2. `buildDrawPlan` riceve la matrice risolta e calcola `L` **una volta** per esecuzione; `drawYear`
   moltiplica `L·ε` (36 moltiplicazioni l'anno: 10.000 percorsi × 3 scenari × 50 anni restano sotto il
   mezzo secondo; misuralo e scrivilo nella guida).
3. `resolveMonteCarloMarket` restituisce anche `correlations` (salvate o default) e `correlationOrigin`.
4. La correzione avviene **al salvataggio** in Impostazioni e di nuovo, silenziosa, in `buildDrawPlan`
   (difesa contro un documento scritto da altrove): una matrice non valida non deve mai far fallire
   un'esecuzione.

### 6.3 File

**Nuovi**: `lib/utils/correlationMatrix.ts`, `components/settings/MonteCarloCorrelationsTile.tsx`, test.
**Modificati**: `lib/constants/monteCarloMarketDefaults.ts` (R0 punto 4), `lib/utils/monteCarloDraw.ts`,
`lib/utils/monteCarloMarket.ts`, `lib/utils/monteCarloMarketValidation.ts`, `settingsNarrative.ts`,
`app/dashboard/settings/page.tsx`, `ParametriTile.tsx`, `monteCarloNarrative.ts`.

### 6.4 Test

- `correlationMatrix.test.ts`: A9; una matrice già valida esce invariata (± 1e-12); Cholesky ricompone
  `C`; la matrice dei default di R0 è valida così com'è (se non lo è, la ricerca va rivista, non corretta
  in silenzio).
- `monteCarloDraw.test.ts`: A8; con `C = I` le estrazioni sono identiche a quelle di T1 con lo stesso seme.

---

## 7. T3 — Portafoglio a leva nelle simulazioni (ex 3/3)

### 7.1 Cosa vede l'utente

- **Tile Parametri**: i sei pesi si seminano dai **target effettivi di Allocazione** (R6). Sopra i
  pesi, la somma: «Totale 150% · leva 1,5×»; sotto 100% l'esecuzione resta bloccata come oggi, sopra
  300% anche («leva oltre 3×»). Il pulsante **«Importa il portafoglio di oggi»** sostituisce i pesi con
  il nozionale detenuto e dice da dove vengono («dal portafoglio di oggi, leva 1,32×»); «Usa i target»
  torna al seme. Senza target configurati il seme è il portafoglio di oggi e la riga lo dice.
- **Impostazioni › Simulazioni › Ipotesi di mercato**: una riga «Spread della leva» (%, default da R0),
  con lettura «il debito costa la liquidità dell'anno più 1,0%».
- **Verdetto**, solo con leva > 1: «Con leva 1,5× il piano regge nell'87% delle simulazioni; senza leva,
  sugli stessi rendimenti, nel 94%.» Il tono resta quello della probabilità con leva
  (`resolveSuccessTone`); il confronto non ha tono (The Risk-vs-Fact Rule: nessun token di segno).
- **Probabilità**, footer: «Dei 1.300 fallimenti, 420 per rovina da leva (una perdita annua oltre il
  capitale), 880 per prelievi.» Senza fallimenti da leva la seconda frase sparisce.
- **Distribuzione › Esaurimento**: le barre distinguono le due cause (stessa barra, due segmenti, la
  leva nel colore dello slot dell'Orso — una causa, non un segno).
- **Dettaglio › Come si calcola**: un paragrafo «La leva» con R4 a parole e il fatto che il debito si
  ribilancia ogni anno, «come un ETF a leva; un conto a margine con debito fisso non è modellato».
- **Ventaglio**: con un portafoglio a leva i percorsi la includono (pesi importati); la rovina da leva
  nel registro del pensionamento conta come rovina.
- Il tab diventa **seminato**: due «Esegui» con gli stessi parametri danno lo stesso risultato. Il
  blind spot «paths are unseeded draws» di `fire-monte-carlo.md` si riscrive.

### 7.2 Dettagli tecnici

1. `runSingleSimulation` applica R4. **Il numero di estrazioni per percorso è fisso** (tutti gli anni
   dell'orizzonte, anche dopo il fallimento, come fa già il Ventaglio): è ciò che rende identici gli
   shock tra con e senza leva (A13) e tra i tre scenari.
2. `SingleSimulationResult.failureCause?: 'withdrawals' | 'leverage'`; `MonteCarloResults` aggiunge
   `leverageFailureCount`. `summarizeMonteCarloRun` le porta in `failureYearBins` per causa.
3. `MonteCarloTab.runScenarios`: con `Σweights > 100` esegue anche il Base con i pesi riscalati a 100
   (`w_i / W`) e `leverageSpread` irrilevante, stesso seme. Il risultato vive accanto a `results.base`
   come `unleveragedBase`; il riepilogo ne legge solo `successRate`.
4. `lib/utils/monteCarloWeights.ts` (nuovo, puro): `seedWeightsFromTargets(targets, assets, lockedIds)`
   (R6) e `weightsFromHoldings(assets, lockedIds)` (`expandAssetExposure`). Riusa
   `deriveTargetLeverageRatio`'s regola sulla liquidità a importo fisso; non ricalcola i target effettivi
   per conto suo: li prende dalla stessa funzione che usa Allocazione.
5. `FireCalculatorTab`: `deriveMonteCarloWeights(calculateCurrentAllocation(...))` →
   `weightsFromHoldings`. Il test di coerenza a volatilità zero resta su un portafoglio senza leva.
6. Seme: una costante `MONTE_CARLO_SEED` in `monteCarloParams.ts`, `createSeededRandom` di
   `lib/utils/seededRandom.ts`, un generatore nuovo per scenario a partire dallo stesso seme.

### 7.3 File

**Nuovi**: `lib/utils/monteCarloWeights.ts` + test.
**Modificati**: `types/assets.ts`, `lib/services/monteCarloService.ts`, `lib/utils/monteCarloDraw.ts`,
`lib/utils/{monteCarloSummary,monteCarloNarrative,monteCarloParams,monteCarloMarket}.ts`,
`lib/constants/monteCarloMarketDefaults.ts` (R0 punto 5), `components/fire-simulations/{MonteCarloTab,FireCalculatorTab}.tsx`,
`components/monte-carlo/tiles/{ParametriTile,ProbabilitaTile,DistribuzioneTile}.tsx`,
 `components/settings/MonteCarloMarketTile.tsx`, `settingsNarrative.ts`.

### 7.4 Coerenza con la FEAT «Futures e margin account»

R4 è l'unico punto in cui il debito entra. La FEAT potrà sostituire «leva costante» con «debito fisso in
euro e soglia di mantenimento» passando una regola del debito diversa allo stesso ciclo annuale; i dati
(pesi Σ ≥ 100, spread) restano validi. Questa epic non anticipa nulla di quella FEAT.

### 7.5 Test

- `monteCarloService.test.ts`: A10, A11, A12, A13; un percorso fallito per leva ha `failureCause:
  'leverage'` e l'anno giusto; stesso seme e stessi parametri ⇒ risultati identici.
- `monteCarloWeights.test.ts`: target 90/60 ⇒ Σ 150; liquidità a importo fisso; asset `excluded` dentro
  il capitale; fondo pensione bloccato fuori; un ETF 2x 100% azioni da 10.000 € ⇒ 20.000 € di nozionale.
- `monteCarloNarrative.test.ts`: le due frasi del verdetto (con e senza fallimenti da leva), il footer.

---

## 8. Documentazione da aggiornare (in ogni task, per la sua parte)

- `doc/guide/fire-monte-carlo.md`: regole nuove e blind spots (seme da T3, correlazioni fisse, rovina da
  leva).
- `doc/guide/fire.md` § FIRE, What If and Goals: `deriveMonteCarloAllocation` → sei classi; il Ventaglio
  legge il mercato risolto.
- `doc/guide/impostazioni.md`: la tab «Simulazioni», le sedi del nuovo campo.
- `doc/guide/fork-scelte-ui.md` e `CLAUDE.md` (riga «Solo fork» e «Latest»): il motore Monte Carlo del
  fork diverge da upstream.
- `Draft Release Temp.md` secondo WORKFLOW.md § Where things are recorded (cifre inventate e tonde).

---

## 9. Rischi

| Rischio | Mitigazione |
| --- | --- |
| **Merge con upstream**: `monteCarloService.ts`, `MonteCarloTab.tsx`, `ParametriTile.tsx` e `monteCarloScenarios` sono di upstream; un suo cambio lì farà conflitto. | Campo nuovo invece di riscrivere quello di upstream; logica nuova in moduli nuovi (`monteCarloDraw`, `monteCarloMarket`, `correlationMatrix`, `monteCarloWeights`); voce in `fork-scelte-ui.md`. |
| Il piano dell'utente cambia aspetto dopo T1 (cash ora modellata, lognormale). | R2 conserva il significato dei salvati; la lettura «migrate: rileggile» lo segnala una volta. |
| Default sbagliati o senza fonte. | R0 prima di T1; fonte e data nel file dei default e nella lettura del tile. |
| Prestazioni (8 classi, Cholesky, seconda esecuzione senza leva). | Cholesky una volta per esecuzione; misura in T2 e T3, scritta nella guida; il confronto si fa solo con leva > 1 e solo sul Base. |
| Seme fisso: l'utente può credere che il risultato sia «esatto». | Il Dettaglio dice che il seme è fisso, come già il Ventaglio («il seme è fisso, quindi la distribuzione non cambia tra un'apertura e l'altra»). |
| Leva nel Ventaglio diversa dai target nel Monte Carlo. | Scelta dichiarata in § 3 e nelle due letture («dal portafoglio di oggi» / «dai target»). |
| Nessuna spec Playwright copre il tab. | Fuori perimetro aggiungerla; la verifica a occhio è nel collaudo su anteprima Vercel. |

---

## 10. Ordine delle PR e criteri di fine

Ogni task è un thread «impl» con un branch da `main` e una PR in bozza verso `Ciocc128/net-worth-tracker:main`
(WORKFLOW.md § 1 regola 6). Alla fine di ogni task: `npx tsc --noEmit`,
`npx eslint app components lib types e2e scripts __tests__`, `TZ=Europe/Rome npx vitest run` verdi, guide di § 8
aggiornate.

| Ordine | Task | Prerequisito | Criterio di fine |
| --- | --- | --- | --- |
| 0 | R0 ricerca dei default | — | file in Library con fonti, periodo e cifre per i punti 1–5 |
| 1 | T1 classi complete e ipotesi in Impostazioni | R0 (punti 1–3) | A1–A7 verdi; tab «Simulazioni» salva e ricarica (hard refresh); Ventaglio e Monte Carlo leggono gli stessi numeri |
| 2 | T2 correlazioni | T1 unita, R0 (punto 4) | A8–A9 verdi; i default sono una matrice valida; tempi misurati |
| 3 | T3 leva | T2 unita, R0 (punto 5) | A10–A13 verdi; verdetto e footer con e senza leva; tab seminato |

**Collaudo**: dopo ciascuna PR, su anteprima Vercel, una fase per messaggio con l'esito scritto prima
(WORKFLOW.md § 2). Le verifiche sugli emulatori o sul mirror dei dati di produzione si fanno in un thread
sul computer del proprietario, non nel cloud.
