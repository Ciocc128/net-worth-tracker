# Monte Carlo — sette classi, correlazioni e leva (epic `epic-montecarlo`)

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
> **Ordine**: R0 (ricerca, consegnata il 03/10/2026, § 2) → T1 → T2 → T3 → T4 (Proiezione, § 11, aggiunta il 04/10/2026) → T5 («Dopo il FIRE», § 12, aggiunta il 05/10/2026) → T6 (soglia della Proiezione, Tappe prima, via la Distribuzione, § 13, aggiunta il 05/10/2026). Ogni task parte da sola da `main` dopo il merge della
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
- Sette classi: Azioni, Obbligazioni, **Oro**, Materie prime, Liquidità, Trend, Carry. Sei sono `AssetClass`
  di `types/assets.ts:22` (etichette di `lib/utils/assetDisplayClass.ts`); **Oro** è una classe del solo
  Monte Carlo, ricavata dalla sottocategoria oro delle materie prime (RG, § 1.5). **Crypto e Immobili
  restano fuori dalla simulazione** (revisione del proprietario, 03/10/2026): il loro valore non entra nel
  capitale simulato e il tile Parametri lo dichiara (§ 5.1).
- Ipotesi di mercato salvate in **Impostazioni** (nuova tab), lette da **entrambi** i motori: Monte Carlo
  (decumulo) e Ventaglio del Calcolatore (accumulo).
- Rendimento inserito come **CAGR**, volatilità come deviazione standard dei rendimenti annui semplici;
  estrazione **lognormale multivariata**.
- Una **matrice di correlazione** unica (21 coppie), con correzione automatica alla più vicina valida.
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
3. **Le classi insieme.** Nell'anno in cui le azioni perdono il 30%, le materie prime spesso le seguono, l'oro no, e il
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

**RK — Capitale simulato**: `K` = valore delle sei `AssetClass` modellate negli asset (Azioni,
Obbligazioni, Materie prime, Liquidità, Trend, Carry; per gli asset compositi, le sole gambe di queste
classi), al netto dei fondi pensione bloccati come oggi. L'Oro è una parte delle Materie prime (RG), non
aggiunge capitale. Crypto e Immobili, e le gambe
composite di quelle classi, restano fuori da `K` in **entrambi** i motori.

**RG — Oro e Materie prime** (revisione del 03/10/2026, R0 § 10.3): un valore della classe `commodity`
(asset o gamba composita) va nella classe Monte Carlo **Oro** se la sua sottocategoria è quella indicata
in Impostazioni › Simulazioni come «Sottocategoria dell'oro»; tutto il resto va in **Materie prime**. La
sottocategoria si sceglie tra quelle delle materie prime; il valore predefinito è la prima che
corrisponde a `/^(gold|oro)$/i` (la predefinita dell'app si chiama `Gold`,
`lib/constants/defaultSubCategories.ts:24`), altrimenti nessuna e tutto va in Materie prime, e la lettura
del tile lo dice. Per i target (R6) il target `commodity` si divide con i target di sottocategoria se
configurati, altrimenti con la quota d'oro detenuta oggi, altrimenti va tutto in Materie prime.

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

**R6 — Pesi seminati dai target** (T3; **dal 04/10/2026 le schede di FIRE e Simulazioni non usano più il termine `E_c`**: partono dal portafoglio, `w_c = t_c`, vedi `doc/fire-ipotesi/README.md` § 11, RK5; `seedWeightsFromTargets` resta per i suoi test): sul capitale `K` della simulazione (patrimonio al netto dei fondi
pensione bloccati, come oggi, RK): `w_c = (t_c · B + E_c) / K`, dove `t_c` è il target effettivo della classe
(% del capitale investibile, come in Allocazione; la liquidità a importo fisso entra come importo), `B`
il valore di mercato del capitale investibile (`allocationRole` ∈ {tradable, frozen}), `E_c` il
nozionale della classe negli asset `excluded` che fanno parte di `K`. **Importa il portafoglio di oggi**:
`w_c = Σ notional_c / K` con `expandAssetExposure` su tutti gli asset di `K`.
Target e nozionale di Crypto e Immobili non entrano: i target delle classi modellate si riscalano per
`100 / (100 − t_crypto − t_immobili)`, così la leva relativa delle classi modellate resta quella voluta.

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
| A7c | 20.000 € materie prime in sottocategoria `Gold` + 10.000 € in `Other Commodities` | Oro 20.000 €, Materie prime 10.000 €; senza sottocategoria dell'oro, Materie prime 30.000 € |
| A8 | Due classi, ρ = 0,5, 200.000 estrazioni seminate | correlazione campionaria dei log-rendimenti 0,50 ± 0,01 |
| A9 | `C` = [[1, 0,9, 0,9], [0,9, 1, −0,9], [0,9, −0,9, 1]] (autovalori −0,8; 1,9; 1,9) | corretta ≈ [[1, 0,5, 0,5], [0,5, 1, −0,5], [0,5, −0,5, 1]] ± 0,01, Cholesky riesce |
| A10 | Volatilità 0, Azioni 150%, Liquidità g = 2%, spread 1%, Azioni g = 7% | r_p = 1,5·1,07 − 0,5·1,03 − 1 = 9,0% |
| A11 | Un anno con Azioni −60%, leva 2,5, c = 4% | 1 + r_p = 2,5·0,40 − 1,5·1,04 = −0,56 ⇒ rovina «leva» in quell'anno |
| A12 | Leva 1 | risultato identico, float per float, al motore senza leva con lo stesso seme |
| A13 | Confronto senza leva | stesso seme, stessi `ε` per anno e percorso; la probabilità senza leva differisce solo per la leva |
| A14 | Default delle Azioni, scenario Base | 10,02% / 19,40%: la riga «Geometric Average 1928–2025» del file di Damodaran (F1 di R0) dà 10,0177% |
| A15 | Matrice delle correlazioni predefinita (§ 2.3) | semidefinita positiva così com'è, autovalore minimo 0,42 ± 0,01: R5 non la tocca |
| A16 | Regola Orso/Toro, ramo 2, Trend (g = 6,46%, σa = 7,90%) | `exp(m ± 1,2816·s/√30) − 1` = 4,64% e 8,32% (± 0,02 pp: R0 calcola da g e σa non arrotondati) |

---

## 2. Valori predefiniti (ricerca R0, consegnata il 03/10/2026)

La ricerca è in `/mnt/project-files/montecarlo/R0-valori-predefiniti.md` (fonti F1–F7 nel suo § 1, script in
`r0-dati/`). Le cifre entrano nel codice in un solo file, `lib/constants/monteCarloMarketDefaults.ts`, con
un `source` **per classe**: sigla della fonte, serie, periodo e data del dato (01/01/2026 per Damodaran,
03/10/2026 per gli altri download). Le scelte qui sotto le ha fatte il proprietario il 03/10/2026.

### 2.1 Valuta e inflazione

- Le serie sono in **USD**: non esistono serie pubbliche in EUR dal 1928 per tutte le classi. Contano i
  rendimenti **reali**, coerenti con un'inflazione USA. La lettura del tile in Impostazioni lo dichiara
  («valori storici in dollari»).
- **Un'unica inflazione, 3,04%, nei tre scenari** (CPI USA, CAGR 1928–2025). Lo scenario è definito dal
  rendimento reale: con prelievi indicizzati un'inflazione per scenario non cambia gli esiti, e con
  prelievi fissi un Orso con più inflazione risulterebbe **migliore** (R0 § 4). Il campo `inflationRate`
  resta per scenario e modificabile; i tre default sono uguali.

### 2.2 Regola Orso/Toro

Il 10°/90° percentile del CAGR **nominale** su 30 anni è stato scartato: le finestre nominali peggiori
sono quelle a bassa inflazione, e l'Orso delle azioni (9,63%) usciva quasi uguale al Base (10,02%). La
regola valida ha due rami:

1. **Serie di almeno 60 anni** (Azioni, Obbligazioni, Liquidità): CAGR **reale** (deflatore CPI USA) su
   tutte le finestre di 30 anni; Orso e Toro sono le finestre al 10° e 90° percentile (*nearest rank*, una
   finestra reale), con la volatilità dei rendimenti nominali di quella finestra. CAGR nominale dello
   scenario = (1 + reale) × (1 + π) − 1.
2. **Serie più corte di 60 anni** (Oro, Materie prime, Trend, Carry): percentile della lognormale del Base
   su 30 anni, `exp(m ± 1,2816 · s / √30) − 1` con m, s da R1; volatilità del Base invariata. Il risultato
   è monotono per costruzione.

### 2.3 Tabella dei default

CAGR / volatilità in percentuale (volatilità = deviazione standard dei rendimenti annui semplici, il `σa`
di R1). Spread della leva **2,0%**.

| Classe | Orso | Base | Toro | Fonte | Ramo |
| --- | --- | --- | --- | --- | --- |
| Azioni | 8,01 / 17,02 | 10,02 / 19,40 | 12,19 / 21,33 | S&P 500 1928–2025, Damodaran | 1 |
| Obbligazioni | 2,08 / 5,69 | 4,53 / 7,90 | 8,01 / 11,05 | Treasury 10 anni 1928–2025, Damodaran | 1 |
| Oro | 2,94 / 27,31 | 8,89 / 27,31 | 15,19 / 27,31 | Oro 1972–2025, Damodaran; confermato da GLDSIM | 2 |
| Materie prime | −1,98 / 22,46 | 2,98 / 22,46 | 8,19 / 22,46 | S&P GSCI (GSGSIM) 1980–2025, testfolio | 2 |
| Liquidità | 1,81 / 4,10 | 3,37 / 3,04 | 4,80 / 2,38 | T-bill 3 mesi 1928–2025, Damodaran | 1 |
| Trend | 4,64 / 7,90 | 6,46 / 7,90 | 8,32 / 7,90 | DBMFSIM 2000–2025, testfolio | 2 |
| Carry | 1,47 / 18,41 | 5,60 / 18,41 | 9,90 / 18,41 | UEQCSIM: CAGR 2015–2025 (indice UBS ufficiale) meno 1% annuo di costi; volatilità dal vivo 2025–2026 | 2 |

Note che il `source` deve riportare:
- **Trend** è una serie investibile (DBMFSIM), non il fattore accademico AQR lordo, scartato.
- **Carry** è una scelta di giudizio: rendimento e rischio vengono da due tratti diversi, perché la
  ricostruzione intera (10,43% / 11,10%) è dominata dal superciclo 2002–2008 e sottostima il rischio
  visto dal vivo (−27,6% tra ottobre 2025 e aprile 2026). L'1% di costi è la scelta del proprietario.
- **Materie prime** è il GSCI, che in 46 anni ha reso meno dell'inflazione: il default lo dice.
- **Spread**: 2,0% è il costo implicito di un ETF 2x UCITS oltre l'€STR (CL2, media 2020–2025). Lo spread di
  un broker non è stato misurato; resta modificabile in Impostazioni.

**Correlazioni** (T2): 21 coppie dei log-rendimenti annui, ciascuna sul **periodo comune più lungo della
coppia** (con Trend 2000–2025, con Carry 2002–2025, con Materie prime 1980–2025, con Oro 1972–2025, le altre
1928–2025); matrice semidefinita positiva, autovalore minimo 0,42. Fonte: `r0-dati/corr_v3.csv`. Triangolo
superiore nell'ordine di `MONTE_CARLO_CLASSES` (§ 4.1):

```
0.0224, -0.1676, 0.2441, -0.0043, -0.2708, -0.2868,      // Azioni con Obbl., Oro, Mat. prime, Liq., Trend, Carry
-0.0586, -0.1891, 0.2664, 0.1022, 0.2108,                // Obbligazioni con Oro … Carry
0.1615, -0.0072, 0.1658, -0.0069,                        // Oro con Mat. prime … Carry
0.1645, 0.1763, -0.2316,                                 // Materie prime con Liq., Trend, Carry
0.0817, 0.3524,                                          // Liquidità con Trend, Carry
-0.0008                                                  // Trend con Carry
```

Limite da dichiarare nel Dettaglio di T2: su dati **mensili** Materie prime–Carry vale circa −0,58 (contro
−0,23 annuale); il modello è annuale e usa il dato annuale.

## 3. Decisioni (prese con il proprietario il 03/10/2026)

| # | Decisione | Alternative scartate e motivo |
| --- | --- | --- |
| D1 | La vecchia 1/3 si **riscrive**: **sette classi** (Azioni, Obbligazioni, Oro, Materie prime, Liquidità, Trend, Carry), tutte con rendimento e volatilità per scenario; il capitale è la somma delle classi modellate. Trend e Carry sono classi a tutti gli effetti. **Revisioni del 03/10/2026**: Crypto e Immobili tolti dalla feature, il loro valore resta fuori dal capitale simulato; Oro separato dalle Materie prime (R0 § 10.3: in 25 anni l'oro fa 11,4% annuo e il GSCI 1,2%, correlazione 0,25, una classe sola non li rappresenta). | Chiuderla e spostare tutto nella 2/3 (la gonfia); aggiungere solo liquidità e crypto (lascia i motori divergenti). |
| D2 | Le ipotesi vivono in **Impostazioni**; il tile Parametri le **dichiara** con un link (The Declaration-Tile Rule). Entrambi i motori leggono il salvato. | Restare nel tile (48+ campi in un tile di risultato, mobile ingestibile); fonte in Impostazioni con ritocco locale (due stati da tenere coerenti). |
| D3 | Default da **medie storiche di lungo periodo con fonte** (R0, § 2); Orso e Toro con la regola in due rami sul CAGR **reale** (§ 2.2); un'unica inflazione al 3,04% (§ 2.1). | Stime prospettiche a 10 anni (orizzonte sbagliato per 30–50 anni di prelievi); tenere i numeri attuali (nessuna fonte). |
| D4 | Il rendimento si inserisce come **CAGR**; la media aritmetica si ricava e si mostra in sola lettura. I salvati si migrano con R2. | Media aritmetica (l'errore di oggi resta possibile); selettore per campo (raddoppia stati e test). |
| D5 | Distribuzione **lognormale** multivariata. | Normale (perdite oltre −100%, rotta con la leva); lognormale con code grasse (un parametro in più, aggiungibile dopo senza cambiare i dati); bootstrap (serie annuali per tutte le classi, scenari come finestre storiche). |
| D6 | **Una** matrice di correlazione per tutti gli scenari. | Una per scenario (63 numeri, default dell'Orso da inventare); unica con stress nell'Orso (rinviabile senza cambiare il formato). |
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

- Nessuno sulle cifre: R0 è consegnata e le sue scelte sono del proprietario (§ 2).
- Lo spread di un broker al dettaglio non è stato misurato (siti bloccati dal container): il default resta
  quello dell'ETF a leva, 2,0%. Una misura futura cambia solo `monteCarloMarketDefaults.ts`.

---

## 4. Modello dati (comune alle tre task)

### 4.1 Classi — `lib/constants/monteCarloClasses.ts` (nuovo, T1)

```ts
export const MONTE_CARLO_CLASSES = [
  'equity', 'bonds', 'gold', 'commodity', 'cash', 'trendFollowing', 'carry',
] as const;
export type MonteCarloClass = (typeof MONTE_CARLO_CLASSES)[number];
```

L'ordine è quello della matrice di correlazione (triangolo superiore riga per riga, 21 valori, § 2.3). Le
chiavi sono quelle di `AssetClass` più `gold`, che non è un `AssetClass` (RG): nessuna mappa
`commodities` come oggi. `realestate` e `crypto` non
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
  correlations?: number[];   // T2: 21 values, upper triangle in MONTE_CARLO_CLASSES order; absent = defaults
  leverageSpread?: number;   // T3: percent; absent = default
  goldSubCategory?: string | null; // RG: the commodity sub-category simulated as Oro; null = none; absent = /^(gold|oro)$/i
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
esecuzione) e `drawYear(plan, random): number[]` (sette rendimenti dell'anno). **Entrambi** i motori
chiamano `drawYear`; `randomNormal` resta solo come primitiva interna.

---

## 5. T1 — Classi complete e ipotesi di mercato in Impostazioni (ex 1/3)

### 5.1 Cosa vede l'utente

- **Impostazioni › Simulazioni** (nuova tab). Un tile «Ipotesi di mercato» con lettura in una riga
  («Sette classi, valori storici in dollari da <fonte> fino al <anno>» / «modificate in 3 classi» / «migrate dai
  parametri salvati prima del <data>: rileggile»), un selettore Orso · Base · Toro (`segmented-pill`) e
  sotto, per lo scenario scelto, sette righe: classe · CAGR % · volatilità % · «media 8,5%» in sola lettura
  (μa di R1). Inflazione dello scenario sotto le righe. Sotto il selettore, una riga «Sottocategoria dell'oro»
  (select tra le sottocategorie delle materie prime, più «Nessuna»; RG). «Ripristina default» per scenario. Il salvataggio
  è il «Salva» unico della pagina, con il punto sulla tab quando ci sono modifiche.
- **FIRE › Monte Carlo › Parametri**: la griglia degli scenari sparisce. Al suo posto una
  dichiarazione (`DeclarationRow`): «Ipotesi di mercato: valori predefiniti» / «salvate il 03/10/2026»,
  con il link «Modifica in Impostazioni» (`/dashboard/settings?tab=simulazioni`). I pesi diventano sette
  campi (Σ = 100, come oggi la regola dei quattro). Sotto i pesi, una riga in sola lettura dichiara ciò che
  resta fuori: «Fuori dalla simulazione: Immobili 250.000 €, Crypto 5.000 €» (assente se non c'è nulla).
- Il campo del capitale e le sue scorciatoie «Totale / Liquido» restano, ma «Totale» diventa `K` (RK) e
  «Liquido» la sua parte liquida: il capitale coincide con quello che i pesi coprono.
- **Dettaglio › Come si calcola** (`EXPLAINER` di `monteCarloNarrative.ts:377`): «La simulazione» dice
  «un rendimento casuale da una lognormale con il CAGR e la volatilità dello scenario»; «I limiti» dice
  ancora «rendimenti indipendenti tra le classi» (fino a T2).

### 5.2 Dettagli tecnici

1. `lib/constants/monteCarloClasses.ts`, `lib/constants/monteCarloMarketDefaults.ts` (tabella di § 2.3
   e il `source` per classe; correlazioni e spread arrivano in T2 e T3).
2. `lib/utils/monteCarloMarket.ts`: `resolveMonteCarloMarket`, `migrateLegacyScenarios` (R2),
   `describeMarketOrigin` per le due letture.
3. `lib/utils/monteCarloDraw.ts`: R1, `drawYear` con `C = I`.
4. `deriveMonteCarloAllocation` → `deriveMonteCarloWeights(byAssetClass)` sulle sette classi (RG per l'Oro), stessa regola di
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
- `monteCarloMarketDefaults.test.ts`: A14; A16 e lo stesso ricalcolo del ramo 2 per Oro, Materie prime e Carry
  (Orso e Toro tornano dai valori Base entro 0,02 pp); Orso < Base < Toro per ogni classe; tre inflazioni uguali.
- `monteCarloMarket.test.ts`: A4; le tre origini; un salvato parziale (classe mancante) si completa
  con il default della classe.
- `monteCarloParams.test.ts`: A7, A7b, A7c; residuo dell'arrotondamento su sette classi; Trend e Carry dalle
  gambe; un composito con una gamba immobiliare porta nel capitale solo le gambe delle classi modellate.
- `monteCarloService.test.ts`: il test di coerenza a volatilità zero del Ventaglio resta verde **senza
  modificarlo nella sostanza** (cambia solo la forma dei parametri).
- `settingsRoundTrip.test.ts`: `monteCarloMarket` nel fixture, round-trip e cancellazione.
- `monteCarloMarketValidation.test.ts`: ogni limite, messaggio con classe e scenario.

---

## 6. T2 — Correlazioni tra le classi (ex 2/3)

### 6.1 Cosa vede l'utente

- **Impostazioni › Simulazioni**, secondo tile «Correlazioni». Lettura: «Valori predefiniti da <fonte>,
  <periodo>» / «modificate 4 coppie su 21». Sotto, un elenco per classe: «Azioni con…» apre sei righe
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
   `cholesky(C)`. Serve un'autodecomposizione simmetrica: Jacobi ciclico su 7×7, scritto nel modulo,
   nessuna dipendenza nuova.
2. `buildDrawPlan` riceve la matrice risolta e calcola `L` **una volta** per esecuzione; `drawYear`
   moltiplica `L·ε` (49 moltiplicazioni l'anno: 10.000 percorsi × 3 scenari × 50 anni restano sotto il
   mezzo secondo; misuralo e scrivilo nella guida).
3. `resolveMonteCarloMarket` restituisce anche `correlations` (salvate o default) e `correlationOrigin`.
4. La correzione avviene **al salvataggio** in Impostazioni e di nuovo, silenziosa, in `buildDrawPlan`
   (difesa contro un documento scritto da altrove): una matrice non valida non deve mai far fallire
   un'esecuzione.

### 6.3 File

**Nuovi**: `lib/utils/correlationMatrix.ts`, `components/settings/MonteCarloCorrelationsTile.tsx`, test.
**Modificati**: `lib/constants/monteCarloMarketDefaults.ts` (correlazioni di § 2.3), `lib/utils/monteCarloDraw.ts`,
`lib/utils/monteCarloMarket.ts`, `lib/utils/monteCarloMarketValidation.ts`, `settingsNarrative.ts`,
`app/dashboard/settings/page.tsx`, `ParametriTile.tsx`, `monteCarloNarrative.ts`.

### 6.4 Test

- `correlationMatrix.test.ts`: A9; una matrice già valida esce invariata (± 1e-12); Cholesky ricompone
  `C`; la matrice dei default è valida così com'è (A15) (se non lo è, la ricerca va rivista, non corretta
  in silenzio).
- `monteCarloDraw.test.ts`: A8; con `C = I` le estrazioni sono identiche a quelle di T1 con lo stesso seme.

---

## 7. T3 — Portafoglio a leva nelle simulazioni (ex 3/3)

### 7.1 Cosa vede l'utente

- **Tile Parametri**: i sette pesi si seminano dai **target effettivi di Allocazione** (R6). Sopra i
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
`lib/constants/monteCarloMarketDefaults.ts` (spread 2,0%, § 2.3), `components/fire-simulations/{MonteCarloTab,FireCalculatorTab}.tsx`,
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
- `doc/guide/fire.md` § FIRE, What If and Goals: `deriveMonteCarloAllocation` → sette classi (RG); il Ventaglio
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
| Default sbagliati o senza fonte. | R0 consegnata prima di T1; `source` per classe nel file dei default e nella lettura del tile. |
| Sottocategoria dell'oro scritta in modo diverso (`Oro`, `ORO`, `Gold ETC`). | Scelta esplicita in Impostazioni (RG); il default cerca solo `gold`/`oro` e, se non trova, lo dice. |
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
| 0 | R0 ricerca dei default | — | **consegnata** il 03/10/2026, recepita in § 2 |
| 1 | T1 classi complete e ipotesi in Impostazioni | R0 | A1–A7c, A14, A16 verdi; tab «Simulazioni» salva e ricarica (hard refresh); Ventaglio e Monte Carlo leggono gli stessi numeri |
| 2 | T2 correlazioni | T1 unita | A8, A9, A15 verdi; i default sono una matrice valida; tempi misurati |
| 3 | T3 leva | T2 unita | A10–A13 verdi; verdetto e footer con e senza leva; tab seminato |
| 4 | T4 Proiezione (§ 11) | T3 unita, FIRE ipotesi L1–L3 unite | P1–P12 verdi; sesta scheda; tempi misurati nella guida |

**Collaudo**: dopo ciascuna PR, su anteprima Vercel, una fase per messaggio con l'esito scritto prima
(WORKFLOW.md § 2). Le verifiche sugli emulatori o sul mirror dei dati di produzione si fanno in un thread
sul computer del proprietario, non nel cloud.

---

## 11. T4 — Proiezione: quanto può valere il portafoglio tra N anni (spec del 04/10/2026)

> **Stato**: implementata il 04/10/2026 (guida `doc/guide/fire-proiezione.md`). Scostamenti dalla spec: il selettore degli scenari di Tappe è un `AsideToggle` (lo scope di tile del repo) e non un `segmented-pill`; `createDistribution` e la scheda condividono `lib/utils/valueHistogram.ts`; `snapshots` e `leverageZeroedCount` sono opzionali nel tipo del risultato (così i test e i chiamanti esistenti non cambiano).

> Origine: domanda di Giorgio nella conversazione di progetto (04/10/2026): «dato il capitale di partenza, con gli
> scenari delle varie classi, il ventaglio dei valori finali del portafoglio tra 20/30/50 anni, e con che
> probabilità». Primo pezzo della proposta **P7** dell'analisi
> `/mnt/project-files/fire-simulazioni/analisi-fire-simulazioni.md` (§ 2.4, § 5). Base di codice analizzata: commit
> `70a3231` (04/10/2026, `main` del fork, merge della PR #43, FIRE ipotesi L3). Le ipotesi della pagina sono quelle
> di `doc/fire-ipotesi/README.md` (RP1–RP7): questa task le **legge**, non ne scrive di nuove.
>
> Letture obbligatorie, oltre a § 0: `doc/fire-ipotesi/README.md` § 1.5 e § 4.1; `doc/guide/fire.md` § FIRE, What If
> and Goals (il motore del Ventaglio, `runAccumulationSimulation`); DESIGN.md: The Verdict-First Rule, The Stale-Run
> Rule, The Declaration-Tile Rule, The Input Tile Rule, The Risk-vs-Fact Rule, «The two capital figures of a verdict
> are on ONE basis», «The median of a run is the median of ALL its paths», The Comma Rule.

### 11.1 Obiettivo

Rispondere a «**quanto potrebbe valere il mio portafoglio tra N anni, e con che probabilità?**» con le stesse ipotesi
del resto della pagina (classi, correlazioni, leva, inflazione di Impostazioni › Simulazioni; pesi, capitale e
risparmio di FIRE ipotesi): il ventaglio dei valori anno per anno, i percentili a un orizzonte scelto e a tappe
fisse, la probabilità di superare una soglia. Oggi nessuna scheda lo dice: il Monte Carlo simula il decumulo «se
smetto oggi», il Ventaglio del Calcolatore dice **in che anno** si arriva al FIRE, non quanto vale il portafoglio a
20, 30 o 50 anni.

### 11.2 Stato di partenza (verificato nel codice, 04/10/2026)

| Fatto | Dove |
| --- | --- |
| Il motore dell'accumulo esiste: percorsi anno per anno con le sette classi, le correlazioni e la leva (R1–R4), afflussi dei fondi pensione, risparmio indicizzato (RP7), seme | `lib/services/monteCarloService.ts` (`runAccumulationSimulation`) |
| Con `withdrawalRate: 0` nessun percorso raggiunge il FIRE: il risparmio si versa ogni anno dell'orizzonte e i percentili sono quelli del capitale | `runAccumulationSimulation`, test `wrDecimal > 0` |
| Il motore floora a zero un anno a leva che brucia il capitale (il percorso non fallisce) e non conta questi anni | stesso file, `Math.max(0, rawGrowth)` |
| Il motore conserva **ogni** percorso (`paths`, un oggetto per anno): a 10.000 percorsi × 3 scenari × 60 anni sono 1,8 milioni di oggetti | stesso file |
| I percentili per anno sono *floor(n × p)*, quelli del Ventaglio | stesso file |
| Le ipotesi della pagina sono una lettura sola (`useFireAssumptions` → pesi RP4, capitale `K` RP5, spesa RP6, scenari RP1) | `lib/hooks/useFireAssumptions.ts`, `lib/utils/fireAssumptions.ts` |
| Il risparmio annuo del Calcolatore è `getAnnualCashflowData().annualSavings` (entrate − spese dell'ultimo anno intero, o dell'anno in corso annualizzato, mai negativo) | `lib/services/fireService.ts` (`getAnnualCashflowData`), `FireCalculatorTab.tsx` |
| Cinque schede in FIRE e Simulazioni | `app/dashboard/fire-simulations/page.tsx:38-44` |
| Il grafico a ventaglio del Monte Carlo disegna la linea tratteggiata dello zero (`--destructive`) | `components/monte-carlo/MonteCarloFanChart.tsx` |

### 11.3 Perimetro

**Incluso**
- Una **sesta scheda «Proiezione»** in FIRE e Simulazioni (V1), dopo «Monte Carlo», `?tab=proiezione`.
- Capitale di partenza `K` (RP5), versamenti annui indicizzati all'inflazione per un numero di anni scelto (V2),
  fondi pensione bloccati come afflussi allo sblocco al valore di oggi (come il Ventaglio).
- Tre scenari in una esecuzione sullo stesso seme (V6), cifre in euro di oggi con il nominale accanto (V3).
- Un orizzonte scelto (verdetto, distribuzione) e una tabella a tappe fisse (V4); la probabilità di superare una
  soglia e di finire sotto il capitale di partenza (V5).
- Leva con R4 e la quota di percorsi azzerati da un anno a leva (V7).

**Escluso**
- Prelievi e decumulo: restano del Monte Carlo. Accumulo **seguito** da decumulo con un anno di uscita scelto è il
  resto di P7, una task successiva che riuserà questa (§ 11.10).
- Tasse sulla plusvalenza alla vendita, TER, bollo e costi di transazione: il valore è **lordo** e la scheda lo
  dice (V8).
- Bootstrap storico (D3 di FIRE ipotesi), code grasse, correlazioni per scenario: come nel resto del Monte Carlo.
- Crypto e immobili: fuori da `K` come in tutte le schede (RP5), dichiarati nella riga «Ipotesi usate».
- Spec Playwright: nessuna, come per il Monte Carlo (§ 9); la verifica a occhio è nel collaudo.

### 11.4 Casi d'uso

1. **Solo il capitale di oggi.** 100.000 € al 100% azioni, versamenti a 0, scenario Base: tra 30 anni il portafoglio
   vale in euro di oggi 714.000 € in mediana, più di 213.000 € in nove simulazioni su dieci, più di 2,4 milioni in una
   su dieci (A1).
2. **Con i versamenti di oggi.** Il Calcolatore dice 12.000 € di risparmio l'anno: la scheda li semina, cresciuti con
   l'inflazione, per tutti gli anni dell'orizzonte; l'utente li ferma dopo 15 anni scrivendo «15» in «per quanti
   anni».
3. **Le tappe.** «Tra 20, 30 e 50 anni?»: la tabella Tappe dà per ciascuna 10°, 50° e 90° percentile e la probabilità
   di superare la soglia, senza cambiare l'orizzonte.
4. **Una soglia.** «Che probabilità ho di avere un milione (di oggi) tra 30 anni?»: l'utente scrive 1.000.000 nella
   soglia; di default la soglia è il numero FIRE di oggi (spesa del piano ÷ SWR), così la scheda dice anche «entro N
   anni il portafoglio copre il FIRE in X simulazioni su cento».
5. **A leva.** Target che sommano 150%: i percorsi includono il costo del debito (R4); se in un anno la perdita supera
   il capitale il percorso si azzera e riparte dai versamenti, e la scheda dice in quante simulazioni è successo.

### 11.5 Regole di calcolo

**RV1 — Il percorso** (per scenario, per percorso; anni `t = 1 … H`, `H` = orizzonte massimo, § 11.7):

```
V_0 = K + Σ afflussi con anno ≤ 0
V_t = (V_{t−1} + A_t) · max(0, 1 + r_p,t) + S_t
S_t = S · (1 + π)^(t−1)   se t ≤ N_v,   altrimenti 0        // RP7; N_v = anni di versamento
```

`A_t` = afflussi dei fondi pensione che si sbloccano nell'anno `t` (valore di oggi, come il Ventaglio); `r_p,t` = R3
o R4 con `drawYear` e il fattore di Cholesky della matrice di Impostazioni; `π` = inflazione dello scenario (RP3).
È l'ordine di `runAccumulationSimulation` (afflusso → rendimento → versamento) con `withdrawalRate: 0`.

**RV2 — Azzeramento da leva**: se `1 + r_p,t ≤ 0` il percorso vale `S_t` a fine anno (il capitale si azzera, il
versamento dell'anno entra). Il percorso è **contato** come azzerato (una volta, anche se capita in più anni).
Senza leva (`W ≤ 1`) non può accadere per costruzione (R1).

**RV3 — Euro di oggi**: `V_t^reale = V_t / (1 + π)^t`, con la `π` dello scenario. Percentili e probabilità si
calcolano sui valori reali; il nominale si mostra accanto (stesso percentile: la divisione è monotona, quindi il
percentile reale è il nominale diviso per lo stesso fattore).

**RV4 — Percentili**: 10°, 25°, 50°, 75°, 90° di **tutti** i percorsi all'anno `t` (azzerati compresi), indice
*floor(n × p)* sui valori ordinati, come il Ventaglio e il Monte Carlo.

**RV5 — Probabilità**: `P(V_t^reale ≥ X) = #{percorsi con V_t^reale ≥ X} / n`, con `X` la soglia in euro di oggi.
`P(V_t^reale < K)` = probabilità di finire sotto il capitale di partenza in potere d'acquisto. Con versamenti
la seconda resta su `K`, non su `K + versato` (lo dice il footer).

**RV6 — Soglia di default** (*sostituita da § 13, RN1–RN4, il 05/10/2026: la soglia di default è il numero FIRE del Calcolatore anno per anno*): il numero FIRE di oggi, `spesa del piano (RP6) ÷ SWR` (`settings.withdrawalRate`, 4%
se assente), in euro di oggi. Se la spesa non c'è (né Impostazioni né Cashflow), nessuna soglia di default: il
campo resta vuoto, la riga della probabilità sparisce e il tile Parametri dice «scrivi una soglia».

**RV7 — Seme**: `MONTE_CARLO_SEED`, un generatore nuovo per scenario (come il Monte Carlo, T3): Orso, Base e Toro
vedono gli stessi `ε`; due «Esegui» uguali danno le stesse cifre. Ogni percorso consuma `7 × 2 × H` uniformi
qualunque cosa accada, così cambiare orizzonte o soglia **non** cambia i percorsi se `H` resta lo stesso.

### 11.6 Cosa vede l'utente

Pagina a verdetto sopra una griglia di tile, come il Monte Carlo. Sopra il verdetto la riga «Ipotesi usate»
(`FireAssumptionsRow`, la stessa stringa delle altre schede, A18 di FIRE ipotesi).

- **Verdetto** (scenario Base, orizzonte scelto, euro di oggi): «Tra 30 anni il portafoglio vale 714.000 € di oggi
  in mediana; più di 213.000 € in nove simulazioni su dieci. Supera il numero FIRE di 800.000 € nel 45% delle
  simulazioni.» Con leva e percorsi azzerati, una frase in più: «Con leva 1,5× il 3% delle simulazioni azzera il
  capitale almeno una volta.» Tono: nessuno sulla cifra (è una proiezione, non un fatto: The Risk-vs-Fact Rule); il
  tono della probabilità della soglia segue `resolveSuccessTone` solo quando la soglia è il numero FIRE di default.
- **Ventaglio** (desktop 5 colonne): bande 10–90 e 25–75 e mediana in euro di oggi, anno 0 → `H`; la soglia come
  linea tratteggiata neutra (`--muted-foreground`), non la linea dello zero; l'orizzonte scelto marcato. Footer: «Euro
  di oggi, inflazione 3,0% (Impostazioni › Simulazioni). Valori lordi: niente tasse sulla vendita, TER né bollo.» (testo cambiato da P6: «Al netto di TER e bollo (0,36% l'anno); lordi della tassa sulla vendita.»)
- **Distribuzione a N anni** (4 colonne): istogramma dei valori reali all'orizzonte (`FinalValueBars`, la regola dei
  bin di `createDistribution`: larghezza uguale fino al 95° percentile, l'ultimo prende la coda), il bin della
  mediana evidenziato. Lettura: «Metà delle simulazioni tra 378.000 € e 1.351.000 €» (25°–75°).
- **Scenari a confronto** (3 colonne): per Orso, Base e Toro la mediana reale all'orizzonte e la probabilità della
  soglia («Orso 411.000 € · 22%»). Colori di `SCENARIO_SLOT`.
- **Tappe** (12 colonne): una riga per 10, 20, 30, 40, 50 anni (solo quelle ≤ `H`, più l'orizzonte scelto se non è
  tra queste), colonne: anno di calendario (ed età se nota), 10° · mediana · 90° in euro di oggi, nominale della
  mediana in piccolo, probabilità della soglia. Scenario Base; un selettore Orso · Base · Toro (`segmented-pill`)
  come scope del tile.
- **Parametri** (12 colonne, The Input Tile Rule): capitale (scorciatoie «Totale / Liquido» su `K` come il Monte
  Carlo), **versamento annuo** (seminato con `annualSavings` del Cashflow, «dal Cashflow 2025»), **per quanti anni**
  (default = orizzonte), **orizzonte** (default 30, da 1 a 60), **soglia** (default RV6, «il tuo numero FIRE»),
  simulazioni (1.000–50.000, default 10.000), i sette pesi con «Usa i target» / «Importa il portafoglio di oggi» e la
  somma con la leva (lo stesso blocco del Monte Carlo), la dichiarazione delle ipotesi di mercato con il link a
  Impostazioni, «Fuori dalla simulazione: …». Bottone «Esegui».
- **Dettaglio › Come si calcola**: RV1–RV5 a parole; «il seme è fisso, quindi le cifre non cambiano tra un'apertura e
  l'altra»; i limiti: lordo, correlazioni fisse, lognormale senza code grasse, fondo pensione al valore di oggi,
  versamenti cresciuti con l'inflazione e non con lo stipendio.

Mobile (1 colonna): verdetto → Ventaglio → Tappe → Distribuzione → Scenari → Parametri. Tablet: ogni tile a tutta
larghezza nell'ordine del telefono, come il Monte Carlo.

**Esecuzione** (The Stale-Run Rule, come il Monte Carlo): una volta da sola appena il piano seminato è pronto, poi
solo con «Esegui»; finché gli input differiscono dall'ultima esecuzione il footer di Parametri lo dice e le cifre
restano quelle. **Eccezione dichiarata**: cambiare **soglia** o **orizzonte** entro `H` non richiede una nuova
esecuzione — sono letture degli stessi percorsi (RV7) e si aggiornano subito.

### 11.7 Dettagli tecnici

1. **Motore** — `runAccumulationSimulation` riceve tre parametri opzionali, neutri per il Calcolatore e per i test
   esistenti (nessun cambio di comportamento se assenti):
   - `savingsYears?: number` — il versamento dell'anno `t` entra solo se `t ≤ savingsYears` (RV1); assente = tutti.
   - `collectPaths?: boolean` (default `true`) — con `false` `paths` resta vuoto e il motore tiene solo i valori
     degli anni in `snapshotYears`.
   - `snapshotYears?: number[]` — restituisce `snapshots: Record<number, Float64Array>` (valori **nominali** ordinati
     in modo crescente, uno per percorso) per quegli anni; più `leverageZeroedCount` (RV2: percorsi con almeno un
     anno `1 + r_p ≤ 0` entro `years`).
   Con `withdrawalRate: 0` non serve altro: niente obiettivo FIRE, il registro del pensionamento resta vuoto.
   **Nessun motore nuovo.**
2. **Orizzonte di calcolo** `H = max(50, orizzonte scelto)` (al massimo 60): una sola esecuzione serve verdetto,
   tappe e ventaglio; `snapshotYears` = tutti gli anni 1…H (60 `Float64Array` da 10.000 valori: 4,8 MB per
   scenario). Cambiare l'orizzonte entro `H` legge gli snapshot; oltre `H` (oltre 50 con un'esecuzione a 50) rende
   stantia l'esecuzione.
3. **Riepilogo puro** — `lib/utils/projectionSummary.ts` (nuovo): `summarizeProjection(results, { inflationRate,
   horizon, threshold, startingCapital, ctx })` → percentili reali e nominali per anno (RV3, RV4), probabilità (RV5),
   righe Tappe, bin della distribuzione (riusa la regola di `createDistribution`, da estrarre in un helper puro
   condiviso se oggi è privata del servizio), confronto scenari. `resolveProjectionThreshold(expenses, swr)` (RV6).
4. **Parole** — `lib/utils/projectionNarrative.ts` (nuovo): `buildProjectionVerdict`, `describe*` per ogni tile,
   `PROJECTION_EXPLAINER`. Elisione davanti alle percentuali con `startsWithVowel` («nell'11%»).
5. **Scheda** — `components/fire-simulations/ProjectionTab.tsx` (orchestratore, non calcola), tile in
   `components/projection/tiles/{VentaglioTile,DistribuzioneTile,ScenariTile,TappeTile,ParametriTile}.tsx`.
   **Riuso**: il blocco dei pesi del `ParametriTile` del Monte Carlo si estrae in un componente condiviso
   (`components/monte-carlo/WeightsFields.tsx`) usato da entrambi; `MonteCarloFanChart` riceve una prop opzionale
   `referenceLine?: { value: number; label: string }` e `zeroLine?: boolean` (default `true`, il Monte Carlo non
   cambia); `FinalValueBars` così com'è.
6. **Seme dei pesi e delle ipotesi**: `useFireAssumptions(lockedAssetIds, { withCashflow: true })` come il Monte
   Carlo; il risparmio da `getAnnualCashflowData` con la stessa chiave `['annualCashflowData', ownerId]` (cache
   condivisa).
7. **Pagina** — `app/dashboard/fire-simulations/page.tsx`: la sesta voce `{ value: 'proiezione', label: 'Proiezione',
   icon: TrendingUp }` dopo `montecarlo`. La scheda si monta solo quando è aperta (come le altre).
8. **Prestazioni**: misura e scrivi nella guida il tempo di 10.000 percorsi × 3 scenari × 50 anni con
   `collectPaths: false` (stima: come il Monte Carlo, ≈1,5–2 s); se supera 3 s, abbassa il default a 5.000.

### 11.8 Decisioni (prese con il proprietario il 04/10/2026)

| # | Decisione | Alternative scartate e motivo |
| --- | --- | --- |
| V1 | Una **sesta scheda «Proiezione»** dopo Monte Carlo: una scheda, una domanda. | Modalità del Monte Carlo (verdetto, probabilità e scenari parlano di prelievi: due domande in un tile); allungare il Ventaglio del Calcolatore (risponde a «quando», si ferma all'anno FIRE e a 40 anni). |
| V2 | **Versamenti seminati dal risparmio del Calcolatore** (Cashflow), indicizzati all'inflazione (RP7), modificabili, con «per quanti anni» (default = orizzonte); 0 = solo il capitale di oggi. | Solo il capitale di oggi (non risponde a chi versa); versamenti fino all'anno FIRE del percorso (lega la scheda al Calcolatore e cambia i percorsi da un piano all'altro). |
| V3 | **Euro di oggi** come cifra principale, il nominale accanto in piccolo. | Solo nominali (a 50 anni l'inflazione al 3,04% moltiplica per 4,5: cifre gonfiate); interruttore (due stati per ogni frase). |
| V4 | **Un orizzonte scelto** (default 30, da 1 a 60) per verdetto e distribuzione, più la tabella **Tappe** a 10/20/30/40/50 anni. | Un orizzonte solo (la domanda nomina tre orizzonti); solo tappe fisse (nessun verdetto su un anno preciso). |
| V5 | **Soglia** con default il numero FIRE di oggi (RV6), modificabile; più la probabilità di finire sotto il capitale di partenza in euro di oggi. | Nessuna soglia (manca «con che probabilità»); soglia senza default (scheda muta finché non si scrive). |
| V6 | **Tre scenari** in una esecuzione sullo stesso seme, Base nel verdetto, come il Monte Carlo. | Solo Base (la differenza tra scenari è la domanda «e se va male?»). |
| V7 | **Leva**: pesi dai target (RP4) ritoccabili; un anno che brucia il capitale **azzera** il percorso, che riparte dai versamenti, e la quota di percorsi azzerati è dichiarata (RV2). | Percorso fermo a zero per sempre (con versamenti in corso non è ciò che succede a chi continua a investire); ignorare la rovina (ottimista). |
| V8 | ~~Valore lordo: niente tassa sulla plusvalenza, TER, bollo~~ **Cambiata da P6 (doc/fire-ipotesi § 9, D-C6): valore netto di TER e bollo, lordo della tassa sulla plusvalenza**; dichiarato nel footer e nel Dettaglio. | Netto «se vendessi tutto» col profilo fiscale di `K` (una seconda cifra per ogni percentile; la vendita totale non è un piano). |

**Scelte di default prese dall'agente** (dichiarate, accettate dal proprietario con V1–V8 il 04/10/2026):
- **Nome della scheda** «Proiezione», `?tab=proiezione`, icona `TrendingUp`.
- **Soglia e orizzonte si leggono senza rieseguire** (§ 11.6): sono letture degli stessi percorsi.
- **`H` = 50 anni** (o l'orizzonte scelto se maggiore): la tabella Tappe arriva a 50 senza una seconda esecuzione.
- **La probabilità «sotto il capitale di partenza»** confronta con `K`, non con `K` più il versato: risponde a «perdo
  potere d'acquisto rispetto a oggi?»; il footer lo dice.

### 11.9 Criteri di accettazione (valori di riferimento verificabili)

Default di Impostazioni salvo dove indicato (Azioni Base g = 10,02%, σa = 19,40% ⇒ m = 0,0954920, s = 0,1724395 da
R1; inflazione 3,04%). Formule chiuse per una classe sola senza versamenti: percentile `p` reale all'anno `t` =
`K · exp(t·m + z_p·s·√t) / (1+π)^t`; `P(V_t^reale ≥ X) = 1 − Φ((ln(X·(1+π)^t / K) − t·m) / (s·√t))`.

| # | Caso | Valore atteso |
| --- | --- | --- |
| P1 | Formula chiusa, K = 100.000 €, Azioni 100%, Base, t = 30, nessun versamento | reali: 10° 212.960 €, 25° 377.839 €, 50° 714.453 €, 75° 1.350.954 €, 90° 2.396.896 €; nominale mediano 1.754.483 € |
| P2 | Come P1, t = 10 / 20 / 50 | mediana reale 192.601 € / 370.950 € / 2.650.266 €; 10° reale 95.754 € / 138.071 € / 555.451 € |
| P3 | Come P1, soglie reali | `P(≥ 500.000 €)` = 64,72%; `P(≥ 1.000.000 €)` = 36,09%; `P(< 100.000 €)` (sotto il capitale) = 1,87% |
| P4 | Come P1, tre scenari, soglia 800.000 € di oggi | mediana reale Orso 410.907 € / Base 714.453 € / Toro 1.283.657 €; `P(≥ soglia)` 21,60% / 45,23% / 67,94% |
| P5 | Simulazione seminata di P1 (200.000 percorsi) | ogni percentile entro ± 1,5% del valore di P1; `P(≥ 1.000.000 €)` entro ± 0,5 punti |
| P6 | Volatilità 0, Azioni 150%, Liquidità g = 2%, spread 1%, Azioni g = 7% (r_p = 9,0%, A10), K = 100.000 €, S = 10.000 €, π = 2%, `savingsYears` = 2 | nominale anno 1: 119.000 €; anno 2: 139.910 €; anno 3: 152.501,90 €; reale anno 3: 143.705,95 € |
| P7 | Un anno con Azioni −60%, leva 2,5, c = 4% (A11), S = 10.000 € | a fine anno il percorso vale 10.000 € (`S_t`), `leverageZeroedCount` = 1; senza versamenti vale 0 € |
| P8 | Coerenza: `collectPaths: false` e `true` con lo stesso seme | snapshot e percentili identici, float per float |
| P9 | Regressione: Calcolatore senza i parametri nuovi | i test di `runAccumulationSimulation` e il test di coerenza del Ventaglio verdi senza modifiche |
| P10 | RV6: spesa del piano 32.000 €, SWR 4% | soglia di default 800.000 €; senza spesa nessuna soglia e la riga della probabilità assente |
| P11 | Cambio di soglia o di orizzonte (≤ `H`) dopo un'esecuzione | cifre aggiornate senza nuova esecuzione e senza il footer «stantio»; orizzonte 55 dopo un'esecuzione a `H` = 50 ⇒ footer «stantio» |
| P12 | Riga «Ipotesi usate» | la stessa stringa delle altre schede (A18 di FIRE ipotesi) |

I valori P1–P4 e P6 sono calcolati in forma chiusa (Python, `statistics.NormalDist`); P5 si verifica nel test con il
seme fisso.

### 11.10 Coerenza con il resto di P7

La task successiva («smetto nell'anno X e poi prelevo») parte dai percorsi di questa (RV1 fino all'anno X) e
continua con il ciclo di prelievo del Monte Carlo sugli stessi shock (seme comune, numero fisso di estrazioni per
anno). Nulla qui la anticipa: `savingsYears` e gli snapshot restano validi.

### 11.11 File

**Nuovi**: `lib/utils/projectionSummary.ts`, `lib/utils/projectionNarrative.ts`,
`components/fire-simulations/ProjectionTab.tsx`, `components/projection/tiles/*.tsx`,
`components/monte-carlo/WeightsFields.tsx`, test `__tests__/{projectionSummary,projectionNarrative}.test.ts`.
**Modificati**: `lib/services/monteCarloService.ts` (tre parametri opzionali, § 11.7.1),
`components/monte-carlo/{MonteCarloFanChart,tiles/ParametriTile}.tsx`, `app/dashboard/fire-simulations/page.tsx`,
`__tests__/monteCarloService.test.ts` (P6–P9). Se `createDistribution` diventa un helper condiviso:
`lib/utils/valueHistogram.ts` (nuovo) e il servizio lo importa.

### 11.12 Test

- `monteCarloService.test.ts`: P5 (seme fisso), P6, P7, P8, P9.
- `projectionSummary.test.ts`: P1–P4 su snapshot costruiti a mano dove serve una cifra esatta (percentili e
  probabilità sono funzioni pure dei valori ordinati) e con la formula chiusa; RV3 (nominale ↔ reale); P10, P11.
- `projectionNarrative.test.ts`: il verdetto con e senza soglia, con leva e percorsi azzerati, l'elisione.

### 11.13 Documentazione e fine

- Nuova guida `doc/guide/fire-proiezione.md` (regole della scheda, blind spots: lordo, versamenti indicizzati
  all'inflazione e non allo stipendio, fondo pensione al valore di oggi, soglia e orizzonte letti senza rieseguire);
  `doc/guide/fire.md` (sei schede, il motore con i parametri nuovi); `fire-monte-carlo.md` (il blocco dei pesi
  condiviso); `CLAUDE.md` riga «FIRE»; `doc/guide/fork-scelte-ui.md`; `Draft Release Temp.md`.
- Fine: `npx tsc --noEmit`, `npx eslint app components lib types e2e scripts __tests__`, `TZ=Europe/Rome npx vitest
  run` verdi; tempi misurati nella guida. Collaudo su anteprima Vercel, una fase per messaggio (WORKFLOW.md § 2).

---

## 12. T5 — «Dopo il FIRE»: la scheda parte dal FIRE previsto (spec del 05/10/2026)

> **Stato**: spec scritta il 05/10/2026, decisioni DF1–DF9 prese con il proprietario lo stesso giorno (§ 12.8). **Implementata il 05/10/2026** (impl T5, una PR per le quattro card); i test del motore stanno in `__tests__/monteCarloStartYear.test.ts` (A-T1…A-T6) e quelli di `fireStart` in `__tests__/fireStart.test.ts` (A-T7…A-T9, A-T11), non in `monteCarloService.test.ts`/`fireService.test.ts` come previsto in § 12.13. Tempi misurati nella guida `doc/guide/fire-monte-carlo.md`: ≈ 3,2 s all'orizzonte di default di 45 anni (sopra i 3 s di § 12.7.7), nulla cambiato.
>
> Origine: quattro card «FEAT FIRE» nate dal Tour della pagina FIRE e Simulazioni (05/10/2026), passo 2 dell'ordine
> approvato (`/mnt/project-files/fire-simulazioni/ordine-feat-fire.md`): «Monte Carlo diventa «Dopo il FIRE», con
> partenza dal FIRE previsto», «Monte Carlo, Spesa sostenibile prima di Probabilità», «togliere la tessera
> Distribuzione dal Monte Carlo», «Monte Carlo in euro di oggi (ventaglio e distribuzione)». Una spec sola, una impl
> sola: toccano la stessa scheda. La card «simulazione unica in due fasi» (= P7) resta in Parcheggio (§ 12.10).
> Base di codice analizzata: commit `0fb1f46` (05/10/2026, `main` del fork, merge della PR #64, EF1 fondo di
> emergenza). Le ipotesi della pagina sono quelle di `doc/fire-ipotesi/README.md` (RP1–RP7, K1, EF1, §§ 9–14): questa
> task le **legge**, non ne scrive di nuove. **Nessuna matematica di mercato nuova**: il motore, il seme e le
> estrazioni sono quelli di T1–T3; cambia da quale anno parte il registro dei prelievi e in che unità si mostra.
>
> Letture obbligatorie, oltre a § 0: `doc/guide/fire-monte-carlo.md` per intero; `doc/guide/fire.md` § F1–F2 (flussi
> datati), § K1 (capitale); `doc/fire-ipotesi/README.md` § 12 (RF4, RF8) e § 13 (RO2, `useWhatIfBaseline`); § 11 di
> questo dossier (RV3, euro di oggi della Proiezione). DESIGN.md: The Verdict-First Rule, The Stale-Run Rule, The
> Input Tile Rule, The Declaration-Tile Rule, The Narrative Honesty Rule, «The two capital figures of a verdict are on
> ONE basis».

### 12.1 Obiettivo

Far rispondere la scheda alla domanda «**dopo il FIRE il capitale regge, e quanto posso prelevare?**» a partire
dall'anno in cui il Calcolatore dice che si arriva al FIRE, non da oggi. Oggi le due schede non si parlano: il
Calcolatore dice «FIRE nel 2031», il Monte Carlo simula «smetto oggi» con il capitale di oggi, quindi la sua
probabilità risponde a un piano che nessuno segue. Insieme: la tessera che risponde (Spesa sostenibile) viene per
prima, la Distribuzione (lettura da specialisti) esce, e tutte le cifre sono in euro di oggi come nella Proiezione.

### 12.2 Stato di partenza (verificato nel codice, 05/10/2026)

| Fatto | Dove |
| --- | --- |
| La scheda si chiama «Monte Carlo» (`value: 'montecarlo'`, icona `Dices`); il tab non è nell'URL (`useState`) | `app/dashboard/fire-simulations/page.tsx:41-48` |
| Il registro parte da oggi: capitale `K` della pagina (`assumptions.capital.total`), prelievo = spesa del piano in euro di oggi indicizzata `(1+π)^s` dall'anno 1 | `MonteCarloTab.tsx` (seme del form), `monteCarloService.ts` (`ledgerSchedule`, `runWithdrawalLedger`) |
| Pensioni statali datate da oggi (`fromYear`), fondo pensione bloccato come afflusso all'anno di sblocco al valore di oggi, flussi datati letti «se smetto oggi» (`needFor(0)`, i forfait dell'anno 0 nel capitale) | `monteCarloService.ts:88-110`, `MonteCarloTab.tsx:275-345` |
| Orizzonte di default 30 anni («fino a 70 anni» a 40 anni d'età); il registro del Calcolatore (Ventaglio) arriva a 90 anni | `MonteCarloTab.tsx:216`, `FireCalculatorTab.tsx:159-163` |
| L'anno FIRE del piano **salvato** è già calcolato fuori dal Calcolatore: `useWhatIfBaseline` assembla gli stessi input (capitale K, spesa, risparmio indicizzato, ponte, pensioni, tasse, flussi) e `calculateFIREProjection` dà `baseYearsToFIRE` e `yearlyData[].baseNetWorth` (nominale) | `lib/hooks/useWhatIfBaseline.ts`, `lib/services/whatIfService.ts` (`runBaseProjection`), `lib/services/fireService.ts:1685` |
| Il cammino deterministico tiene la base fiscale dello scenario Base ma non la restituisce | `fireService.ts` (`baseBasis` locale) |
| Le tabelle dei flussi sanno già leggere il bisogno per un ritiro all'anno `T` (`needFor(T)`), usate dal Ventaglio | `lib/utils/datedFlows.ts` (`buildFlowYearTables`) |
| Ventaglio, verdetto, Distribuzione, percentili del Dettaglio e sovrapposizione degli scenari sono in euro **nominali** («Valori nominali: il prelievo cresce con l'inflazione.»); la Spesa sostenibile è già in euro di oggi | `monteCarloNarrative.ts` (`describeProbabilitaFooter`), `SpesaSostenibileTile.tsx` |
| Griglia desktop: Probabilità 5 · Distribuzione 4 · Scenari 3, poi Spesa sostenibile 12, Parametri 12; telefono: Probabilità → Spesa sostenibile → Distribuzione → Scenari → Parametri | `MonteCarloTab.tsx:519-600` |
| Nessuna spec Playwright copre la scheda; `e2e/fire*.spec.ts` cercano «Ventaglio Monte Carlo», che è il Ventaglio del **Calcolatore** | `e2e/fire.spec.ts:65`, `e2e/fire.mobile.spec.ts:47` |
| Il nome «Monte Carlo» come scheda compare anche in: Proiezione (Dettaglio «Nessun prelievo: quello è il Monte Carlo.»), landing («Monte Carlo — in quante simulazioni il piano regge»), Impostazioni › Simulazioni («FIRE › Monte Carlo»), Parametri del Calcolatore («Usata da tutte le simulazioni (Calcolatore, Coast FIRE, What If, Monte Carlo)») | `projectionNarrative.ts:279`, `landingNarrative.ts:152`, `app/dashboard/settings/page.tsx:4192`, `FireParametri.tsx:258` |

### 12.3 Perimetro

**Incluso**
- Nome della scheda «Dopo il FIRE»; «Monte Carlo» resta come nome del **metodo** (DF1).
- Partenza di default dall'anno FIRE del Base sul piano salvato, con il commutatore «Da oggi» (DF2–DF4, RD1–RD5).
- Orizzonte di default fino a 90 anni d'età (DF5); i casi senza anno FIRE (DF6).
- Euro di oggi in tutte le cifre della scheda (DF7, RD6).
- Via la tessera Distribuzione con la sua vista «Esaurimento» (DF8); Spesa sostenibile prima tessera (DF9).
- I testi delle altre superfici che nominano la scheda (§ 12.2, ultima riga).

**Escluso**
- Simulazione in due fasi (accumulo stocastico fino al FIRE, poi prelievo): card in Parcheggio, = P7 (§ 12.10).
- Prelievi dinamici (P3), stress test (P9), bootstrap storico (D3 di FIRE ipotesi).
- La Proiezione: resta com'è (la coppia «Verso il FIRE / Dopo il FIRE» è del passo 6 dell'ordine).
- «Il mio piano» e le chip «Ipotesi usate» (passo 3): la riga `FireAssumptionsRow` resta quella di oggi.
- L'età obiettivo (E1) come anno di partenza: la card chiede il FIRE previsto (§ 12.9, punto aperto 1).
- Nessuna modifica a Orso/Toro, correlazioni, leva, costi, tasse: stesse regole, solo lette dall'anno FIRE.

### 12.4 Casi d'uso

1. **Il caso della card.** Il Calcolatore dice «FIRE nel 2031». Aprendo «Dopo il FIRE» la scheda dice: «Smettendo
   nel 2031 (a 45 anni) con 812.000 € di oggi, nel X% delle 10.000 simulazioni il capitale regge fino a 90 anni
   (2076)…»; la Spesa sostenibile, in cima, dice quanto si può prelevare l'anno in 9 casi su 10 da quel capitale.
2. **Se smetto oggi.** L'utente sceglie «Da oggi» in Parametri: la scheda torna esattamente a quella di oggi (stesso
   capitale, stesse pensioni, stessi flussi, stesse cifre a parità di orizzonte), salvo l'unità (euro di oggi).
3. **Già FIRE.** Il capitale di oggi copre già il fabbisogno: anno FIRE = oggi, il commutatore non serve e non c'è; la
   riga sotto «Quando smetto» dice «Sei già FIRE: la simulazione parte da oggi.»
4. **FIRE mai raggiunto.** Il Calcolatore non trova un anno FIRE entro 50 anni: la scheda parte da oggi e lo dice
   («Il Calcolatore non trova un anno FIRE entro il 2076: la simulazione parte da oggi.»).
5. **Fondo pensione bloccato.** Sblocco nel 2045, FIRE nel 2031: il fondo entra nel 2045 come oggi (al valore di oggi),
   cioè all'anno 14 del prelievo. Sblocco nel 2029, FIRE nel 2031: il fondo è già dentro il capitale al FIRE (il
   cammino del Calcolatore l'ha fuso nel 2029) e nessun afflusso arriva dopo.
6. **Pensione statale a 67 anni.** Età 40, FIRE a 45: la pensione toglie dal prelievo dall'anno 22 del prelievo
   (2053), non dall'anno 27 come «se smetto oggi».

### 12.5 Regole di calcolo

Notazione: `T` = anni da oggi all'anno FIRE (`baseYearsToFIRE` del cammino deterministico sul piano salvato, § 12.7.2);
`s = 1 … N` gli anni del prelievo; `π` l'inflazione dello scenario del run (Orso, Base o Toro; `π_b` quella del Base).

**RD1 — Anno di partenza.** Modalità «Dal FIRE»: `T = baseYearsToFIRE` quando è un intero ≥ 1. Con `T = 0` (già
FIRE), `null` (mai entro 50 anni) o piano non calcolabile (`hasBaseline` falso: capitale, spesa o SWR mancanti) la
scheda usa `T = 0` e dice perché (DF6). Modalità «Da oggi»: `T = 0`. Con `T = 0` ogni regola sotto si riduce
**esattamente** al motore di oggi (A-T1).

**RD2 — Capitale al FIRE.** `K_T = baseNetWorth_T / (1 + π_b)^T`, in euro di oggi: il capitale nominale del Base
all'anno `T` (risparmi indicizzati versati fino a `T` compreso, fondo bloccato fuso se lo sblocco è ≤ `T`, forfait dei
flussi fino a `T` compreso) deflazionato con l'inflazione del Base. Orso, Base e Toro partono **dallo stesso** `K_T`
e dallo stesso `T` (DF3): gli scenari differiscono solo dopo il FIRE. Il campo «Capitale iniziale» resta
modificabile; il valore scritto prende il posto di `K_T`.

**RD3 — Base fiscale al FIRE.** Con il profilo fiscale di `K`: `gainShare_T = 1 − basis_T / baseNetWorth_T`, dove
`basis_T` è la base del cammino del Base all'anno `T` (oggi + ogni euro versato + il fondo fuso + i forfait in
entrata, meno la quota venduta dai forfait in uscita). `basisToday` del run = `capitale scritto × (1 − gainShare_T)`,
la regola di oggi con la quota dell'anno `T` al posto di quella di oggi. Con `T = 0`: la quota di oggi, invariata.

**RD4 — Calendario ribasato.** Il run è espresso in euro di oggi con l'orologio dei prezzi che riparte da `T`: ogni
importo che il motore leggeva all'anno `y` da oggi lo legge all'anno `T + s` e lo divide per `(1 + π)^T`.
- Prelievo dell'anno `s`: `W · (1 + π)^s` (invariato: `W` è già in euro di oggi).
- Pensioni statali: attive se `fromYear ≤ T + s`, importo `annualNetToday · (1 + π)^s`.
- Fondo bloccato (afflusso `X` all'anno `u` da oggi): con `u > T` entra all'anno `s = u − T` per `X / (1 + π)^T`
  (il valore di oggi, come la convenzione del Monte Carlo); con `u ≤ T` è già in `K_T` e il motore lo ignora.
- Flussi datati: tabelle costruite su `T + N` anni con la `π` dello scenario; bisogno dell'anno `s` =
  `needFor(T)[T + s] / (1 + π)^T` (un flusso «dal FIRE» parte dall'anno FIRE, come nel Calcolatore); forfait
  `lumpIn/lumpOut[T + s] / (1 + π)^T`; i forfait degli anni `≤ T` sono già in `K_T` (nessun `start`).
- Le estrazioni non cambiano: ogni percorso consuma `7 × 2 × N` uniformi dal seme `MONTE_CARLO_SEED`, il mercato è
  lo stesso a qualunque `T` (le ipotesi sono stazionarie).

**RD5 — Orizzonte.** Default `N = clamp(90 − (età + T), 1, 60)` con l'età salvata; senza età `N = 30` (il default di
oggi). Modificabile da 1 a 60 come oggi. Il cambio di modalità ricalcola il default solo se l'utente non ha scritto
l'orizzonte a mano.

**RD6 — Euro di oggi.** Ogni valore del percorso all'anno `s` si mostra come `V_s / (1 + π)^s` con la `π` dello
scenario (in RD4 il percorso è già al netto di `(1+π)^T`). Percentili (10°, 25°, 50°, 75°, 90°, indice
*floor(n × p)*) e mediane si leggono sui valori nominali e si dividono per lo stesso fattore (la divisione è monotona,
RV3). **Le probabilità, il conteggio dei fallimenti, gli anni di esaurimento e la Spesa sostenibile non cambiano**:
la soglia di fallimento è zero in ogni unità.

### 12.6 Cosa vede l'utente

- **Nome**: la scheda si chiama «Dopo il FIRE» nella barra delle schede (icona `Dices` invariata), nel verdetto
  (`ariaLabel` «Verdetto su Dopo il FIRE») e nelle superfici di § 12.2 (ultima riga): Proiezione «Nessun prelievo:
  quello è Dopo il FIRE.»; landing «Dopo il FIRE — in quante simulazioni il piano regge»; Impostazioni «FIRE › Dopo il
  FIRE»; Calcolatore «(Calcolatore, Coast FIRE, What If, Dopo il FIRE)». «Monte Carlo» resta il nome del metodo:
  l'aside di Probabilità «scenario base · 10.000 simulazioni Monte Carlo · 45 anni», il titolo «Dettaglio · Monte
  Carlo» e le frasi tecniche di Impostazioni › Simulazioni (non cambiano).
- **Verdetto** (Base, euro di oggi). Titolo invariato nella forma: «Il piano regge nel 63% dei casi.» Frase: la
  partenza, poi la probabilità, poi la Spesa sostenibile (subito dopo, non in coda), poi leva, scenari e ponte come
  oggi: «Smettendo nel 2031 (a 45 anni) con 812.000 € di oggi, nel 63% delle 10.000 simulazioni il capitale regge
  fino a 90 anni (2076); nel caso mediano chiudi con 640.000 € di oggi, nel 10% peggiore i soldi finiscono entro il
  2058 (72 anni). Per restare al 90% potresti prelevare fino a 27.300 € l'anno di oggi…». Con `T = 0` la partenza
  diventa «Smettendo oggi con 700.000 €, …». Le cifre di questo esempio sono illustrative.
- **Griglia** (desktop 12 colonne): **Spesa sostenibile 12** (com'è oggi: eroe a sinistra, tabella 3 × 3 a destra) ·
  **Probabilità 8 | Scenari a confronto 4** · **Parametri 12**. Telefono e tablet: Spesa sostenibile → Probabilità →
  Scenari → Parametri. Lo scheletro (`SKELETON_CELLS`) segue.
- **Probabilità**: il ventaglio parte dall'anno FIRE (asse da `oggi + T` a `oggi + T + N`), in euro di oggi; il
  gradino del fondo bloccato solo se `u > T`. Footer: «Euro di oggi, inflazione 3,04% (Impostazioni › Simulazioni): il
  prelievo resta costante in potere d'acquisto.» al posto di «Valori nominali: …». La lettura dice ancora l'anno medio
  di esaurimento dei percorsi che falliscono (la sola traccia della vista «Esaurimento» che esce).
- **Scenari a confronto**: invariata (probabilità per scenario); la nota della mediana in euro di oggi.
- **Spesa sostenibile**: invariata nei numeri; «il X% del capitale» è di `K_T`.
- **Distribuzione**: **esce**, con la vista «Esaurimento» e il suo `AsideToggle`.
- **Parametri**: un primo campo **«Quando smetto»**, un selettore a due voci «Al FIRE (2031)» · «Oggi» (il
  `segmented-pill` del repo, ≥ 44px su touch), con sotto una riga in sola lettura:
  «Anno FIRE del Calcolatore, scenario Base, sul piano salvato. Capitale al FIRE: 812.000 € di oggi (943.000 € nel
  2031). Non conta che al FIRE si può arrivare con più o con meno: è la cifra del Base.» Senza anno FIRE il
  selettore non c'è e la riga dice perché (DF6). «Capitale iniziale» è seminato con `K_T` in modalità «Al FIRE»
  (scorciatoia «Al FIRE» al posto di «Totale / Liquido»), con il capitale di oggi in modalità «Oggi» (scorciatoie
  «Totale / Liquido» come oggi). Le righe di pensioni, fondo bloccato, tasse e flussi dicono gli anni **del prelievo**
  («dall'anno 22 (2053)»). «Anni di prelievo» seminato con RD5.
- **Dettaglio**: «Dettaglio · Monte Carlo». Sovrapposizione delle mediane e tabella dei percentili ogni 5 anni in
  euro di oggi, dall'anno FIRE; la tabella aggiunge in coda la colonna «Mediana nominale» (piccola, come le Tappe
  della Proiezione). La spiegazione dice la partenza dal FIRE e il limite di DF3.
- **Esecuzione** (The Stale-Run Rule): invariata. Cambiare «Quando smetto» è un input del piano: rende stantio
  l'ultimo run finché non si preme «Esegui». Il primo run automatico parte in modalità «Al FIRE».

### 12.7 Dettagli tecnici

1. **Motore** (`lib/services/monteCarloService.ts`) — un parametro opzionale `MonteCarloParams.startYear?: number`
   (default 0). `ledgerSchedule` applica RD4: pensioni a `T + s` divise per `(1+π)^T`, `capitalInflows` spostati di
   `T` (quelli con `year ≤ T` scartati) e divisi, `flowTablesFor(..., T + years)` con `needFor(T)` e i forfait letti
   da `T + 1`, nessun `start` se `T > 0`. `drawPathFactors` **non** cambia. `countSuccesses` legge lo stesso schedule,
   quindi S5 vale anche con `startYear`. Con `startYear` assente o 0 lo schedule è identico, float per float (A-T1).
2. **Anno e capitale al FIRE** — `lib/utils/fireStart.ts` (nuovo, puro): `resolveFireStart(projection, ctx)` →
   `{ kind: 'fire', years: T, calendarYear, ageAtFire, capitalNominal, capitalToday, gainShare } | { kind: 'today',
   reason: 'already' | 'never' | 'no-plan' }`. La scheda lo nutre con `useWhatIfBaseline()` (stesse query, cache
   condivisa) e la proiezione del Base del piano salvato, cioè la funzione privata `runBaseProjection` di
   `whatIfService.ts` esportata (o un `runBaselineProjection(baseline)` che la avvolge), così «prima» del What If,
   «Effetto sul FIRE» degli Obiettivi e «Dopo il FIRE» leggono lo stesso anno.
3. **Base fiscale** — `calculateFIREProjection` aggiunge a `FIREProjectionYearData` un campo opzionale
   `baseCostBasis?: number` (arrotondato all'euro), presente solo quando `honest.withdrawalTax` c'è; nessun altro
   cambiamento del cammino (i test esistenti restano verdi senza modifiche).
4. **Riepilogo** (`lib/utils/monteCarloSummary.ts`) — `MonteCarloContext` resta `{ startCalendarYear, currentAge }`:
   la scheda passa `oggi + T` ed `età + T`, così anni ed età di verdetto, ventaglio e righe sono già quelli del
   prelievo. Un `deflate(value, s, π)` puro per RD6, applicato in `summarizeMonteCarloRun` (percentili finali,
   mediana), `buildOverlaySeries`, `buildPercentileRows` (più `p50Nominal`) e nei percentili passati al ventaglio
   (`deflatePercentiles(percentiles, π)`). Escono `buildHistogram`, `histogram*`, `failureYearBins*`,
   `failureFirst/LastCalendarYear` e le funzioni di `monteCarloNarrative.ts` che li leggono (`describeDistribuzione*`,
   `describeEsaurimento*`, `DistributionView`). `createDistribution` (servizio) e `binYears` restano: li usano
   Proiezione e Calcolatore.
5. **Parole** (`lib/utils/monteCarloNarrative.ts`) — `buildMonteCarloVerdict` riceve `start: { calendarYear, age,
   capital } | null` e mette la frase S1 subito dopo la prima; `describeFireStartRow(start)` per la riga di
   Parametri (tre motivi di DF6); footer di Probabilità in euro di oggi.
6. **Scheda** — `components/fire-simulations/MonteCarloTab.tsx` (nome del file invariato): stato `startMode: 'fire' |
   'today'` nel form (`MonteCarloForm.startMode`), seme di capitale e orizzonte per modalità, `startYear` nei
   `params`; `haveRunInputsChanged` lo confronta già (è nei params). Griglia di § 12.6; via `DistribuzioneTile`,
   `FinalValueBars` (se nessun altro lo importa: la Proiezione ha la sua tessera) e lo stato `distributionView`.
   `ParametriTile` riceve il selettore e la riga. `app/dashboard/fire-simulations/page.tsx`: `label: 'Dopo il FIRE'`,
   `value: 'montecarlo'` invariato (non è nell'URL, nessun test lo cerca).
7. **Prestazioni**: `startYear` non aggiunge estrazioni; le tabelle dei flussi crescono di `T` anni (trascurabile).
   Il default fino a 90 anni allunga l'orizzonte (45 anni invece di 30 nell'esempio): misura nella guida il tempo dei
   tre scenari + Spesa sostenibile all'orizzonte di default del mirror; se supera 3 s, dillo nel thread prima di
   cambiare qualcosa.

### 12.8 Decisioni (prese con il proprietario il 05/10/2026)

| # | Decisione | Alternative scartate e motivo |
| --- | --- | --- |
| DF1 | La scheda si chiama **«Dopo il FIRE»**; «Monte Carlo» resta il nome del metodo (aside di Probabilità, titolo del Dettaglio, Impostazioni › Simulazioni). Il `value` interno `montecarlo`, i nomi dei file e degli identificatori non cambiano. | «Prelievo» (non dice da quando); tenere «Monte Carlo» (nome del metodo, che usa anche la Proiezione); rinominare `value` e file (churn senza effetto: il tab non è nell'URL). |
| DF2 | Di default parte dall'**anno FIRE del Base sul piano salvato** (`useWhatIfBaseline`, lo stesso «prima» del What If), con il selettore **«Al FIRE (anno) · Oggi»** in Parametri. | Anno scritto a mano (un input in più che il Calcolatore sa già); l'anteprima non salvata del Calcolatore (vive in un'altra scheda, che può non essere montata); l'età obiettivo E1 (la card chiede il FIRE previsto, § 12.9). |
| DF3 | **Capitale del Base all'anno FIRE** (RD2), lo stesso `K_T` e lo stesso `T` per Orso, Base e Toro; il limite è dichiarato nella riga di Parametri e nel Dettaglio. | Capitale e anno propri di ogni scenario (l'Orso può non arrivare al FIRE: tre domande in una tessera); simulazione in due fasi (card in Parcheggio, cambia il motore). |
| DF4 | **Calendario ribasato** (RD3–RD4): pensioni, fondo bloccato, flussi e base fiscale letti dall'anno FIRE. | Spostare solo le date mostrate (pensioni e flussi sbagliati di `T` anni); ignorare pensioni e flussi in modalità FIRE (piano diverso dal Calcolatore). |
| DF5 | **Orizzonte fino a 90 anni d'età** (RD5), come il registro del Calcolatore; 30 anni senza età. | 30 anni fissi (dal FIRE a 45 anni finisce a 75: meno prudente del Calcolatore); fino a 100 anni (nessuna scheda lo usa). Conseguenza dichiarata: anche in modalità «Oggi» l'orizzonte di default cambia, quindi la probabilità della fixture (63% a 30 anni) cambia per l'orizzonte, non per l'unità. |
| DF6 | **Senza anno FIRE parte da oggi e dice perché**: già FIRE («Sei già FIRE»), mai entro 50 anni («Il Calcolatore non trova un anno FIRE entro il 2076»), piano incompleto («Il Calcolatore non ha spesa o SWR»). Il selettore non c'è. | Partire dall'anno 50 (un capitale che non copre la spesa, probabilità senza senso); bloccare la scheda (la domanda «se smetto oggi» resta valida). |
| DF7 | **Euro di oggi** in ogni cifra (RD6); il nominale solo come colonna «Mediana nominale» nel Dettaglio. Probabilità invariate. | Nominale (oggi: due schede vicine, due unità); interruttore (due stati per ogni frase); nominale accanto a ogni cifra (raddoppia i numeri del verdetto). |
| DF8 | **Via la tessera Distribuzione** con la vista «Esaurimento»; resta l'anno medio di esaurimento nella lettura di Probabilità e i percentili ogni 5 anni nel Dettaglio. | Scenderla nel Dettaglio (ripete la tabella dei percentili all'ultimo anno); tenere solo «Esaurimento» (ripete l'anno medio di Probabilità). |
| DF9 | **Spesa sostenibile prima tessera**; griglia Spesa 12 · Probabilità 8 \| Scenari 4 · Parametri 12. Il titolo del verdetto resta la probabilità del piano scritto; la frase della spesa sostenibile sale subito dopo la prima. | Titolo sulla spesa sostenibile (il prelievo scritto sparisce dal titolo, che oggi ha il tono); Probabilità e Spesa affiancate 6 \| 6 (la tabella 3 × 3 non sta in 6 colonne sotto 1440px). |

**Scelte di default prese dall'agente** (dichiarate, accettate con DF1–DF9): il selettore sta in Parametri, non sopra il verdetto (The Input
Tile Rule: è un input del piano); il primo run automatico è «Al FIRE»; il valore scritto in «Capitale iniziale»
vince su `K_T` finché non si cambia modalità; icona invariata.

### 12.9 Punti aperti

1. **Età obiettivo come partenza.** Con un'età obiettivo salvata (E1) il proprietario potrebbe volere «smetto a 50
   anni» come terza voce del selettore. Non in questa task: si rivaluta con «Il mio piano» (passo 3).
2. **Nome della Proiezione** («Verso il FIRE»): passo 6 dell'ordine, dopo questa.
3. **Quanto è grossolana DF3**: dopo l'uso si decide se la card in Parcheggio (due fasi) torna in Backlog (§ 12.10).

### 12.10 Coerenza con P7 e con la card in Parcheggio

La versione fedele (ogni percorso arriva al FIRE con il suo capitale) è la simulazione in due fasi di § 11.10. Nulla
qui la anticipa né la ostacola: `startYear` resta valido per un registro che parte da un capitale per percorso, e le
estrazioni sono le stesse. Il prezzo della versione semplice è dichiarato in Parametri e nel Dettaglio.

### 12.11 Criteri di accettazione (valori di riferimento verificabili)

Casi del motore a volatilità zero (una classe, Azioni `g` = 5%, `π` = 2%, prelievo `W` = 40.000 € di oggi indicizzato,
nessuna tassa, nessun costo), `K` = 1.000.000 € nelle unità del run. Valori calcolati a mano (Python) con l'ordine del
registro: afflusso → rendimento → prelievo.

| # | Caso | Valore atteso |
| --- | --- | --- |
| A-T1 | Regressione: `startYear` assente e `startYear: 0`, stesso seme (S10, `monteCarloSeededRegression`) | identici float per float, leva compresa; S5 (`countSuccesses` = run fresco) verde |
| A-T2 | Volatilità zero, `startYear` 5, `N` = 3, nessuna pensione/afflusso/flusso | fine anno 1: 1.009.200,00 €; 2: 1.018.044,00 €; 3: 1.026.497,88 € (uguale a `startYear` 0) |
| A-T3 | RD6 sul caso A-T2 | anno 3 in euro di oggi: 967.291,88 € (= 1.026.497,88 / 1,02³); percentili reali = nominali / `(1+π)^s` |
| A-T4 | Come A-T2 con una pensione `fromYear` 7, 10.000 € netti di oggi | `startYear` 5: anno 2: 1.028.448,00 €; anno 3: 1.048.034,16 € (pensione attiva da `s` = 2, 10.404 € e 10.612,08 €); `startYear` 0: come A-T2 (pensione oltre l'orizzonte) |
| A-T5 | Come A-T2 con due afflussi del fondo da 50.000 € agli anni 6 e 4 da oggi | `startYear` 5: l'anno 6 entra a `s` = 1 per 45.286,54 € (= 50.000 / 1,02⁵), quello dell'anno 4 è ignorato; fine anno 1: 1.056.750,87 €; 2: 1.067.972,41 €; 3: 1.078.922,71 € |
| A-T6 | Flussi: un'uscita «dal FIRE» di 5.000 € l'anno per 2 anni, `startYear` 5 | il bisogno degli anni `s` = 1, 2 è `needFor(5)[6], [7]` diviso `1,02⁵`; nessun bisogno a `s` = 3; con `startYear` 0 identico ad oggi (`needFor(0)`) |
| A-T7 | RD2 su un cammino semplice: `K` = 500.000 €, risparmio 30.000 € indicizzato, spesa 30.000 €, SWR 4%, Base `g` = 5%, `π` = 2%, nessuna pensione, tassa o flusso | `baseYearsToFIRE` = 6; `baseNetWorth_6` = 883.981 € nominali; `K_T` = 784.950 € di oggi (fabbisogno 844.622 € nominali, 750.000 € di oggi) |
| A-T8 | RD1/DF6 | `T = 0` (già FIRE), `null` (mai) e `hasBaseline` falso ⇒ `kind: 'today'` con il motivo; il selettore assente, la riga di Parametri dice il motivo |
| A-T9 | RD3 | con tassa, `basisToday` del run = capitale scritto × `baseCostBasis_T / baseNetWorth_T`; senza tassa `baseCostBasis` assente e cammino identico ai test esistenti |
| A-T10 | RD6 non tocca le probabilità | con lo stesso seme e gli stessi input, `successRate`, `failureCount` e le nove cifre di Spesa sostenibile sono uguali prima e dopo il passaggio agli euro di oggi |
| A-T11 | RD5 | età 40, `T` = 5 ⇒ `N` = 45; età 40, «Oggi» ⇒ `N` = 50; senza età ⇒ 30; età 85, `T` = 10 ⇒ 1 |
| A-T12 | Nome | la barra delle schede dice «Dopo il FIRE»; nessuna superficie di § 12.2 chiama più la scheda «Monte Carlo» |

### 12.12 File

**Nuovi**: `lib/utils/fireStart.ts`, `__tests__/fireStart.test.ts`.
**Modificati**: `lib/services/monteCarloService.ts` (`startYear`), `lib/services/fireService.ts` (`baseCostBasis`),
`types/assets.ts` (i due campi opzionali), `lib/services/whatIfService.ts` (export della proiezione del Base),
`lib/utils/{monteCarloSummary,monteCarloNarrative}.ts`, `components/fire-simulations/MonteCarloTab.tsx`,
`components/monte-carlo/{MonteCarloDettaglio,ScenarioOverlayChart,tiles/ParametriTile,tiles/ProbabilitaTile}.tsx`,
`app/dashboard/fire-simulations/page.tsx`, `lib/utils/{projectionNarrative,landingNarrative}.ts`,
`app/dashboard/settings/page.tsx`, `components/fire-simulations/FireParametri.tsx`; test
`__tests__/{monteCarloService,monteCarloSummary,monteCarloNarrative,fireService}.test.ts`.
**Rimossi**: `components/monte-carlo/tiles/DistribuzioneTile.tsx`, `components/monte-carlo/FinalValueBars.tsx` (se
non più importato).

### 12.13 Test

- `monteCarloService.test.ts`: A-T1 (regressione seminata), A-T2, A-T4, A-T5, A-T6, S5 con `startYear`.
- `fireService.test.ts`: A-T7 (anno e capitale), A-T9 (`baseCostBasis` presente solo con la tassa).
- `fireStart.test.ts`: A-T7 in euro di oggi, A-T8, A-T11.
- `monteCarloSummary.test.ts`: A-T3, A-T10; il contesto spostato di `T` (anni ed età del verdetto).
- `monteCarloNarrative.test.ts`: verdetto con partenza al FIRE e da oggi, S1 dopo la prima frase, le tre righe di DF6,
  footer in euro di oggi.
- Nessuna spec Playwright nuova (la scheda non ne ha, § 9); collaudo su anteprima Vercel e sul mirror.

### 12.14 Documentazione e fine

- `doc/guide/fire-monte-carlo.md`: titolo «FIRE › Dopo il FIRE (Monte Carlo)», partenza, calendario ribasato, euro di
  oggi, griglia nuova, via Distribuzione ed Esaurimento, tempi misurati; blind spot di DF3. `doc/guide/fire.md` (nome
  della scheda, `startYear`, `baseCostBasis`), `doc/guide/fire-proiezione.md` (il testo che nomina la scheda),
  `CLAUDE.md` riga «FIRE» e «Latest», `doc/guide/fork-scelte-ui.md`, `Draft Release Temp.md`.
- Fine: `npx tsc --noEmit`, `npx eslint app components lib types e2e scripts __tests__`, `TZ=Europe/Rome npx vitest
  run` verdi. Collaudo una fase per messaggio (WORKFLOW.md § 2).

---

## 13. T6 — Proiezione: la soglia è il numero FIRE del Calcolatore, Tappe prima, via la Distribuzione (spec del 05/10/2026)

> **Stato**: spec scritta il 05/10/2026; decisioni DN1–DN5 prese con il proprietario lo stesso giorno (§ 13.8: DN1
> scelta da lui tra le tre opzioni della card, DN2–DN5 accettate come proposte). **Implementata il 05/10/2026** (branch
> `claude/impl-fire-proiezione-t6-xg1ymd`): una differenza dalla spec, dichiarata — la serie si cammina sempre a 60 anni
> (`resolveProjectionFireSeries(baseline, 60)`, stesse cifre di `H` per ogni anno ≤ `H`), così non si ricalcola cambiando
> l'orizzonte; la FIX dello stato premuto è il nuovo seme «Numero FIRE» con le classi di `AsideToggle` (il confronto in codice
> con «Dopo il FIRE» non ha trovato altre differenze: «Totale / Liquido», Prova e le intestazioni sono già gli stessi).
>
> Origine: passo 6 dell'ordine approvato (`/mnt/project-files/fire-simulazioni/ordine-feat-fire.md`), card Todoist
> della scheda Proiezione: «FIRE: soglia della Proiezione vs numero FIRE del Calcolatore (da verificare, soluzione da
> discutere)» (la card che chiede questa spec), «FEAT FIRE: Proiezione, tessera Tappe subito dopo il verdetto»,
> «FEAT FIRE: togliere la tessera Distribuzione dalla Proiezione», «FIX FIRE: riallineare la UI della Proiezione alle
> altre schede (stato «premuto» dei tasti)». Una spec, **una impl** per le quattro: toccano la stessa scheda.
> Base di codice analizzata: commit `6d72d70` (05/10/2026, `main` del fork, merge della PR #71, What If). Le ipotesi
> della pagina sono quelle di `doc/fire-ipotesi/README.md` (RP1–RP7, § 12 RF5, § 15 Base di calcolo): questa task le
> **legge**, non ne scrive di nuove. **Nessuna matematica nuova**: la soglia è una cifra che il Calcolatore calcola
> già, anno per anno.
>
> Letture obbligatorie, oltre a § 0: § 11 di questo dossier (RV1–RV7, V1–V8) e § 12.7.2 (`runBaselineProjection`);
> `doc/guide/fire-proiezione.md` per intero; `doc/guide/fire.md` § F1 (RF5 a un tasso, `flowsRealReturnRate`) e § H2
> (Base di calcolo, `fireBaseLedger`); `doc/fire-ipotesi/README.md` § 12 (RF5, RF10) e § 13 (RO2,
> `useWhatIfBaseline`). DESIGN.md: The Verdict-First Rule, The Stale-Run Rule, The Input Tile Rule, The Risk-vs-Fact
> Rule, The Narrative Honesty Rule.

### 13.1 Obiettivo

Che «**il tuo numero FIRE**» nella Proiezione sia **la stessa cifra** del Calcolatore. Oggi la soglia di default della
Proiezione è spesa ÷ SWR (RV6, nel Tour 720.000 €), mentre il Calcolatore dice 606.961 €: stesso nome, due cifre. Nello
stesso giro la tessera che risponde (Tappe) sale subito dopo il verdetto e la Distribuzione, che ripete il Ventaglio a
un anno solo, esce.

### 13.2 Stato di partenza (verificato nel codice, 05/10/2026)

| Fatto | Dove |
| --- | --- |
| La soglia di default è `spesa del piano ÷ SWR` (RV6), una retta in euro di oggi; il form la semina una volta come testo e la scheda la riconosce come «numero FIRE» solo se il testo è uguale a quella cifra (`threshold === defaultThreshold`) | `ProjectionTab.tsx:196-200, 228, 361`, `projectionSummary.ts` (`resolveProjectionThreshold`) |
| **La Proiezione conta già i flussi datati** nel capitale (F2, RF10: i forfait ogni anno, le spese e le entrate ricorrenti nel versamento finché si versa) e il fondo pensione bloccato come afflusso allo sblocco | `ProjectionTab.tsx:176-183, 270-290`, `doc/guide/fire-proiezione.md` § Dated flows |
| Il numero FIRE del Calcolatore è `R4` di `buildFireLedger`: spesa ÷ SWR, poi tassa sul prelievo, pensioni statali, fondo bloccato (ponte) e flussi datati (RF5), un passo dopo l'altro | `lib/utils/fireBaseLedger.ts`, `fireService.ts` (`resolveFireRequirement`) |
| Il Calcolatore ricalcola il requisito **ogni anno** del suo cammino (`baseFireNumber` di ogni riga, **nominale** dell'anno: spesa indicizzata `(1+π)^t`), ed è la linea «Target FIRE» del suo Ventaglio (`resolveFanFireTargets` = `[oggi, baseFireNumber_1…]`) | `fireService.ts` (`calculateFIREProjection`, `resolveFanFireTargets`), `FireFanChart.tsx` (linea tratteggiata `fireTarget`) |
| Il cammino del Base sul piano salvato esiste già fuori dal Calcolatore: `useWhatIfBaseline` + `runBaselineProjection` (lo usa «Dopo il FIRE», T5); oggi si ferma 5 anni dopo l'ultimo FIRE o a 50 anni (`WHAT_IF_HORIZON_YEARS`) | `lib/hooks/useWhatIfBaseline.ts`, `whatIfService.ts:302` |
| Il requisito di oggi del What If (`resolveFireMetrics`) è quello del Calcolatore: la stessa `resolveFireRequirement` con `yearsElapsed: 0` | `whatIfService.ts` (`resolveFireMetrics`) |
| Griglia: desktop Ventaglio 5 \| Distribuzione 4 \| Scenari 3 · Tappe 12 · Parametri 12; mobile Ventaglio → Tappe → Distribuzione → Scenari → Parametri | `ProjectionTab.tsx` (header e `order-*`) |
| La lettura del Ventaglio dice già «metà delle simulazioni sta tra X e Y» (25°–75°): è la stessa frase della Distribuzione | `projectionNarrative.ts` (`describeVentaglio`, `describeDistribuzione`) |
| Lo scope di Tappe è un `AsideToggle` (come il Traguardo del Calcolatore); i semi dei pesi hanno lo stato premuto pieno (`WeightsFields`, collaudo #62); «Totale / Liquido» sono `Button variant="outline"` come in «Dopo il FIRE» | `TappeTile.tsx`, `WeightsFields.tsx`, `components/{projection,monte-carlo}/tiles/ParametriTile.tsx` |
| Nessuna spec Playwright apre la Proiezione (le occorrenze in `e2e/fire.spec.ts` sono il toggle «Vista della proiezione» del Calcolatore) | `e2e/` |

**Esito della verifica chiesta dalla card**: la Proiezione conta i flussi datati alle loro date, quindi la retta a
spesa ÷ SWR confronta un capitale **con** i flussi con un fabbisogno **senza**. L'opzione 2 della card («rinominare»)
non basta: la soglia coerente è quella del Calcolatore, anno per anno (opzione 1). La cifra di 606.961 € è il requisito
di **oggi**, quella di 720.000 € il valore a flussi esauriti senza tassa e pensioni.

### 13.3 Perimetro

**Incluso**
- Soglia di default = numero FIRE del Calcolatore **anno per anno**, in euro di oggi (RN1–RN3); una soglia scritta a
  mano resta una retta («soglia», RN4).
- La linea della soglia nel Ventaglio diventa una serie; Tappe mostra la soglia di ogni riga; verdetto e Scenari
  leggono la soglia dell'orizzonte.
- Tappe subito dopo il verdetto, su ogni larghezza (DN3); via la tessera Distribuzione (DN2).
- Lo stato premuto del nuovo seme «Numero FIRE» con le classi di `AsideToggle`, e un confronto in codice dei
  controlli della scheda con «Dopo il FIRE» e Calcolatore (card FIX, § 13.7.6).

**Escluso**
- Nessun cambio al motore (`runAccumulationSimulation`), ai percorsi, al seme: le cifre di P1–P9 non cambiano.
- La soglia non segue i Parametri della Proiezione (capitale, versamento, pesi scritti qui): è il numero del
  Calcolatore sul piano (DN4, dichiarato).
- Il nome della scheda resta «Proiezione» (DN5); il glossario dei «numeri FIRE» tra le schede è il passo 9.
- Spec Playwright: nessuna, come in § 11.3.

### 13.4 Casi d'uso

1. **Con un mutuo che finisce.** Il piano ha una spesa ricorrente che si chiude tra 10 anni: oggi il numero FIRE è più
   alto, poi scende verso spesa ÷ SWR. La linea tratteggiata del Ventaglio scende; nella riga «10 anni» di Tappe la
   probabilità usa la soglia di quell'anno, scritta sotto la percentuale.
2. **Con un'eredità attesa.** Un forfait in entrata tra 5 anni abbassa il numero FIRE fino al quarto anno (arriverà
   dopo), poi la soglia torna a spesa ÷ SWR mentre il capitale sale dello stesso forfait: la linea salta insieme ai
   percorsi.
3. **Senza flussi, tassa, pensioni né fondo bloccato.** La soglia è la retta di prima (spesa ÷ SWR in euro di oggi):
   nessuna cifra cambia rispetto a T4.
4. **«Un milione di oggi».** L'utente scrive 1.000.000: la soglia è una retta, l'etichetta dice «soglia», il tono del
   verdetto è neutro. Il tasto «Numero FIRE» la riporta a quella del Calcolatore.

### 13.5 Regole di calcolo

**RN1 — La serie del numero FIRE** (nominale, dal piano): il cammino del Base del Calcolatore sul piano salvato
(`useWhatIfBaseline` → `runBaselineProjection`, lo stesso di «Dopo il FIRE»), portato fino a `H` anni:

```
F_0     = requisito di oggi (resolveFireMetrics(baseline).fireNumber = il numero FIRE del Calcolatore, R4 della Base di calcolo)
F_t     = baseFireNumber della riga t del cammino      t = 1 … H        (nominale dell'anno t)
```

È **la stessa serie** della linea «Target FIRE» del Ventaglio del Calcolatore (`resolveFanFireTargets`), non una
formula nuova: spesa ÷ SWR, tassa sul prelievo (con la quota di plusvalenza del cammino), pensioni statali attive
dall'età di ciascuna, ponte del fondo bloccato fino allo sblocco, flussi datati a valore attuale (RF5, al tasso reale
del Base).

**RN2 — In euro di oggi**: `S_t = F_t / (1 + π_b)^t`, `π_b` = inflazione del Base. Una sola serie per i tre scenari
(DN1): il numero FIRE del Calcolatore è quello del Base, e senza tassa né pensioni i requisiti di Orso e Toro in euro
di oggi coincidono con il Base per costruzione (spesa ÷ SWR + flussi a un tasso solo, RF5 di #62).

**RN3 — Probabilità con la soglia mobile**: `P_t = #{percorsi con V_t^reale ≥ S_t} / n` (RV5 con `X = S_t`); la
riga `t` di Tappe, il verdetto (`t` = orizzonte) e Scenari (`t` = orizzonte, `S_t` uguale per i tre) leggono la
soglia del proprio anno. Nel Base, confrontare valori reali con `S_t` equivale a confrontare i nominali con `F_t`: è il
test del Ventaglio del Calcolatore all'anno `t`, con una differenza dichiarata — qui il versamento continua anche dopo
il FIRE (V2), là si ferma.

**RN4 — Soglia scritta**: un importo scritto nel campo è una retta `S_t = X` in euro di oggi per ogni `t` (RV5 com'è).
Senza piano calcolabile (nessuna spesa o SWR = 0: `runBaselineProjection` restituisce `projection: null`) non c'è
soglia di default, come RV6: il campo resta vuoto, le righe della probabilità spariscono.

**RN5 — Lettura, non esecuzione**: la serie viene dal piano, non dai percorsi: cambiarla (piano in bozza, flussi
salvati) o passare tra «Numero FIRE» e una cifra scritta aggiorna le cifre **senza** nuova esecuzione e senza il
footer «stantio», come la soglia di T4 (§ 11.6, P11).

**RN6 — Lunghezza**: il cammino gira per `years = H` (`resolveRunYears(orizzonte)`, fino a 60) e non si ferma 5 anni
dopo il FIRE (`calculateFIREProjection(…, maxYears = H, …, minYears = H)`); la serie ha `H + 1` valori (0…H).

**RV6 è sostituita da RN1–RN4**; `resolveProjectionThreshold` resta solo se un altro chiamante la usa, altrimenti
esce con il suo test.

### 13.6 Cosa vede l'utente

- **Verdetto** (Base, orizzonte scelto): con il numero FIRE «… Supera il tuo numero FIRE di quell'anno (826.000 € di
  oggi) nel 45% delle simulazioni.»; con una soglia scritta «… Supera la soglia di 1.000.000 € di oggi nel 36% delle
  simulazioni.» Il tono segue `resolveSuccessTone` solo con il numero FIRE (come oggi).
- **Tappe** (prima tessera, 12 colonne su desktop, prima anche su tablet e telefono, tabella intera: al massimo sei
  righe): la colonna «Sopra la soglia» porta sotto la percentuale, in piccolo come il nominale della mediana, la soglia
  della riga («di 826.000 €»). Con una soglia scritta la sotto-riga non c'è (è la stessa per tutte, la dice il footer).
- **Ventaglio** (8 colonne) e **Scenari a confronto** (4 colonne) sulla seconda riga. Nel Ventaglio la soglia è una
  **linea tratteggiata che segue la serie** (`--muted-foreground`, come il «Target FIRE» del Calcolatore), etichetta
  «numero FIRE»; con una soglia scritta resta la retta di oggi, etichetta «soglia». Footer: «la linea tratteggiata è
  il tuo numero FIRE anno per anno (Calcolatore)» oppure «… è la soglia».
- **Parametri**: accanto al campo «Soglia» un seme **«Numero FIRE»** con lo stato premuto pieno di `WeightsFields`
  (`ASIDE_TOGGLE_ON_CLASS`/`OFF`, `aria-pressed`). Premuto = soglia del Calcolatore: il campo è vuoto e il suo
  segnaposto dice «oggi 606.961 €, poi anno per anno». Scrivere un importo spegne il seme (soglia scritta); premerlo
  svuota il campo e torna al numero FIRE. Suggerimento sotto il campo: «il numero FIRE del Calcolatore, anno per anno,
  in euro di oggi: non segue il capitale e il versamento scritti qui» oppure, con una cifra scritta, «una cifra fissa
  in euro di oggi». Senza piano il seme non c'è e resta il suggerimento di oggi («scrivi una soglia…»).
- **Distribuzione**: non c'è più (DN2). La sua frase (25°–75°) è già nella lettura del Ventaglio.
- **Dettaglio › Come si calcola**: un paragrafo per RN1–RN3 («la soglia è il numero FIRE del Calcolatore ricalcolato
  ogni anno: flussi, pensioni, tassa e fondo bloccato lo spostano; qui il versamento continua dopo il FIRE») e il
  limite DN4.

Griglia: desktop Tappe 12 · Ventaglio 8 \| Scenari 4 · Parametri 12; tablet e telefono in colonna: verdetto → Tappe →
Ventaglio → Scenari → Parametri. Lo scheletro (`SKELETON_CELLS`) segue la stessa geometria.

### 13.7 Dettagli tecnici

1. **Cammino** — `runBaselineProjection(baseline, options?: { years?: number })`: con `years` passa `maxYears = years`
   e `minYears = years` a `calculateFIREProjection`; senza, identico a oggi («Dopo il FIRE» e What If non cambiano).
2. **Serie** — nuovo puro `resolveProjectionFireSeries(baseline, years)` in `lib/utils/projectionSummary.ts` (o
   accanto, se tira dentro `whatIfService` in modo scomodo per i test): restituisce `number[] | null` di lunghezza
   `years + 1` in euro di oggi (RN1–RN2), `null` quando il piano non gira (RN4). `F_0` da `resolveFireMetrics`
   (esportarla, o esporre il requisito di oggi da `runBaselineProjection`).
3. **Soglia nel riepilogo** — `summarizeProjection(…, { threshold })` riceve
   `ProjectionThreshold = { kind: 'fire'; series: readonly number[] } | { kind: 'fixed'; value: number } | null`;
   `ProjectionFigures` guadagna `threshold: number | null` (la `S_t` della riga, per Tappe e verdetto). Con `kind:
   'fixed'` le cifre sono identiche a oggi (P1–P12 verdi senza modifiche, a parte il tipo dell'argomento).
4. **Scheda** — `ProjectionTab.tsx`: `useWhatIfBaseline()` (stesse chiavi di React Query, nessuna lettura in più);
   `thresholdMode: 'fire' | 'fixed'` nello stato del form al posto del confronto `threshold === defaultThreshold`;
   seme iniziale `'fire'` quando la serie esiste, altrimenti campo vuoto. La serie si ricalcola con `useMemo` su
   baseline e `resolveRunYears(orizzonte)`, fuori dall'esecuzione (RN5).
5. **Grafico** — `MonteCarloFanChart` guadagna `referenceSeries?: { values: readonly number[]; label: string }`
   disegnata come `Line` tratteggiata neutra sulle stesse ascisse dei percentili; `referenceLine` resta per la retta.
6. **Card FIX (stato premuto)** — il seme «Numero FIRE» nasce con le classi di `AsideToggle`; l'impl confronta in
   codice i controlli della scheda (scope di Tappe, semi, «Totale / Liquido», bottone Prova, intestazioni ed etichette
   dei campi) con `components/monte-carlo/tiles/ParametriTile.tsx` e `TraguardoTile.tsx` e allinea ogni differenza che
   trova; ciò che solo l'occhio vede va nel collaudo sull'anteprima Vercel.
7. **Distribuzione** — escono `components/projection/tiles/DistribuzioneTile.tsx`, `describeDistribuzione*`,
   `histogram`/`histogramCap` del riepilogo; `valueHistogram.ts` resta se `monteCarloService.createDistribution` lo
   importa ancora, `FinalValueBars` esce se nessuno lo importa più.

### 13.8 Decisioni (prese con il proprietario il 05/10/2026)

| # | Decisione | Alternative scartate e motivo |
| --- | --- | --- |
| DN1 | **Soglia mobile**: il numero FIRE del Calcolatore anno per anno, in euro di oggi, una serie sola (Base) per i tre scenari; una soglia scritta resta una retta. | Rinominare 720.000 € in «spesa ÷ SWR, senza flussi» (la Proiezione conta i flussi: confronterebbe un capitale con flussi a un fabbisogno senza, e resterebbe un quinto numero); retta a 606.961 € (il requisito di oggi, troppo basso negli anni in cui i flussi sono esauriti); una serie per scenario (tre linee, e la differenza è solo tassa e pensioni). |
| DN2 | **Via la Distribuzione**, come in «Dopo il FIRE» (DF8). | Scenderla nel Dettaglio (ripete i percentili del Ventaglio a un anno solo; la sua frase è già nella lettura del Ventaglio). |
| DN3 | **Tappe prima, tabella intera** su ogni larghezza (al massimo sei righe). | Due o tre tappe in testa e il resto richiudibile (un controllo in più per una tabella che sta in uno schermo; la riga dell'orizzonte scelto deve restare visibile). |
| DN4 | La soglia è **il numero del piano**: non segue capitale, versamento e pesi scritti nei Parametri della Proiezione; lo dice il suggerimento del campo. | Ricalcolarla sugli input della Proiezione (un secondo «numero FIRE» diverso dal Calcolatore, il problema che la card chiude). |
| DN5 | Il nome della scheda resta **«Proiezione»** (punto aperto 2 di § 12.9 chiuso): risponde a «quanto vale tra N anni» anche oltre il FIRE e con una soglia qualunque. | «Verso il FIRE» (vero solo con il numero FIRE come soglia; la scheda continua a versare dopo il FIRE, V2). |

**Scelte di default prese dall'agente**: il seme «Numero FIRE» sta accanto al campo come i semi dei pesi; nessuna
colonna nuova in Tappe (la soglia è una sotto-riga); la serie si calcola fuori dall'esecuzione.

### 13.9 Criteri di accettazione (valori di riferimento verificabili)

Caso del piano: spesa 32.000 € di oggi, SWR 4%, Base `g` = 7%, `π` = 2% (reale 4,902%), nessuna tassa, pensione o
fondo bloccato, `planExpensesFromCashflow` falso. Valori calcolati con
`/mnt/project-files/fire-simulazioni/soglia-controllo.py` (RF5 in euro di oggi).

| # | Caso | Valore atteso |
| --- | --- | --- |
| A-N1 | Nessun flusso | `S_t` = 800.000 € per `t` = 0, 10, 30 (la retta di T4: P4 e P10 invariati) |
| A-N2 | Spesa indicizzata 6.000 €/anno, anni 1–10, non nel Cashflow | `S_0` 846.552 € · `S_1` 842.834 € · `S_5` 826.047 € · `S_9` 805.720 € · `S_10` 800.000 € · `S_20` 800.000 €; nominale `F_5` = 912.023 € |
| A-N3 | Forfait in entrata 100.000 € di oggi all'anno 5 | `S_0` 721.281 € · `S_1` 717.422 € · `S_4` 704.673 € · `S_5` 800.000 € · `S_10` 800.000 € |
| A-N4 | `S_0` = numero FIRE del Calcolatore | uguale all'euro a `buildFireLedger(...).total` e a `resolveFireMetrics(baseline).fireNumber` sullo stesso piano (sul mirror del Tour: 606.961 €) |
| A-N5 | `S_t · (1+π_b)^t` = `baseFireNumber` della riga `t` del cammino del Calcolatore | per ogni `t` ≤ `H`, anche oltre i 5 anni dopo il FIRE (RN6: la serie ha `H + 1` valori con `H` = 60) |
| A-N6 | RN3 su snapshot costruiti a mano: 10 percorsi reali 100…1.000 all'anno 5, `S_5` = 550 | probabilità 50%; con `kind: 'fixed'`, `value` = 550, la stessa |
| A-N7 | RN5 | passare tra «Numero FIRE» e una cifra scritta, o cambiare la bozza del piano, aggiorna verdetto, Tappe e Ventaglio senza footer «stantio» |
| A-N8 | RN4 | piano senza spesa: nessun seme «Numero FIRE», campo vuoto, nessuna riga di probabilità |
| A-N9 | Regressione | `runBaselineProjection` senza `years` identico a oggi (test di T5 e What If verdi); P1–P12 verdi |
| A-N10 | Griglia | desktop: Tappe, poi Ventaglio e Scenari sulla stessa riga, poi Parametri; telefono: Tappe subito dopo il verdetto; nessun `DistribuzioneTile` nel DOM |

### 13.10 File

**Modificati**: `lib/services/whatIfService.ts` (`runBaselineProjection` con `years`, export del requisito di oggi),
`lib/utils/{projectionSummary,projectionNarrative}.ts`, `components/fire-simulations/ProjectionTab.tsx`,
`components/projection/{ProjectionDettaglio,tiles/TappeTile,tiles/ParametriTile,tiles/VentaglioTile,tiles/ScenariTile}.tsx`,
`components/monte-carlo/MonteCarloFanChart.tsx` (`referenceSeries`); test
`__tests__/{projectionSummary,projectionNarrative,whatIfService}.test.ts`.
**Rimossi**: `components/projection/tiles/DistribuzioneTile.tsx` e `components/monte-carlo/FinalValueBars.tsx` (nessun altro lo importava); `valueHistogram.ts` resta (lo importa `monteCarloService.createDistribution`).

### 13.11 Test

- `projectionSummary.test.ts`: A-N1–A-N3 (serie da un piano costruito nel test), A-N6, i P esistenti con
  `{ kind: 'fixed' }`.
- `whatIfService.test.ts` (o il file dei test di T5): A-N4, A-N5, A-N9.
- `projectionNarrative.test.ts`: verdetto con numero FIRE e con soglia scritta, sotto-riga di Tappe, footer del
  Ventaglio nei due modi, suggerimento del campo nei tre stati (fire, scritta, senza piano).
- Nessuna spec Playwright nuova; collaudo sull'anteprima Vercel e sul mirror (A-N4 con 606.961 €), quando il
  proprietario è al computer.

### 13.12 Documentazione e fine

- `doc/guide/fire-proiezione.md`: la soglia (RN1–RN6, il blind spot DN4, «il versamento continua dopo il FIRE»), la
  griglia nuova, via la Distribuzione; `doc/guide/fire.md` (`runBaselineProjection` con `years`); § 11 di questo
  dossier: rimando a § 13 su RV6; `CLAUDE.md` riga «Latest»; `Draft Release Temp.md`.
- Fine: `npx tsc --noEmit`, `npx eslint app components lib types e2e scripts __tests__`, `TZ=Europe/Rome npx vitest
  run` verdi. Collaudo una fase per messaggio (WORKFLOW.md § 2).
