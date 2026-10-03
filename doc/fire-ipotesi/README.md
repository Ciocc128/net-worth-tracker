# FIRE — una lingua comune per le cinque schede (epic `epic-fire-ipotesi`)

> **Per chi implementa (agente).** Questo dossier è la specifica vincolante delle task L1–L3. Le decisioni
> funzionali (§ 3) prese con il proprietario sono **chiuse**: non riaprirle, non aggiungere funzionalità.
> Dove dossier e codice sembrano in contrasto, fermati e chiedi nel thread (WORKFLOW.md § 1 regola 6c).
>
> Base di codice analizzata: commit `2f87546` (03/10/2026, `main` del fork, merge della PR #39). Se `main` è
> avanzato, verifica che i simboli citati esistano ancora con la stessa firma prima di usarli.
>
> Lingua: conversazione in italiano; codice, identificatori e commenti in inglese; testo UI in italiano.
>
> Origine: analisi `/mnt/project-files/fire-simulazioni/analisi-fire-simulazioni.md` (§ 4, «Incoerenze tra le
> schede», proposta P0), decisioni D1–D3 confermate dal proprietario il 03/10/2026 nella conversazione di progetto, D4–D8 nel thread
> della spec lo stesso giorno.

---

## 0. Letture obbligatorie prima di scrivere codice

1. `WORKFLOW.md` § 1 (regola 6 per i thread cloud) e § 2.
2. `doc/montecarlo/README.md` per intero: R1 (CAGR → lognormale), R2 (media → CAGR), RK (capitale `K`), RG (Oro),
   R4 (leva), R6 (pesi dai target). Questo dossier **riusa** quelle regole, non ne scrive di parallele.
3. `doc/guide/fire.md` § FIRE, What If and Goals e § Per-page blind spots; `doc/guide/fire-coast.md`,
   `fire-what-if.md`, `fire-monte-carlo.md`, `fire-obiettivi.md`.
4. `doc/guide/impostazioni.md` § Settings — the FIVE places.
5. `DESIGN.md`: The Declaration-Tile Rule, The Input Tile Rule, The Narrative Honesty Rule, The Stale-Run Rule,
   The Comma Rule, The Verdict-First Rule.

---

## 1. AFU

### 1.1 Obiettivo

Le cinque schede di FIRE e Simulazioni rispondono a domande diverse, ma devono partire **dalle stesse ipotesi**:
lo stesso portafoglio (quello target di Allocazione), gli stessi rendimenti e la stessa inflazione per Orso, Base
e Toro (quelli di Impostazioni › Simulazioni), la stessa spesa, lo stesso capitale, lo stesso risparmio. Oggi lo
stesso utente può leggere «FIRE nel 2041» nel Calcolatore e una probabilità calcolata su un'altra spesa, un altro
capitale e altri rendimenti nel Monte Carlo. Dopo questa epic, ogni scheda dice in una riga quali ipotesi usa, e
le righe delle cinque schede coincidono.

### 1.2 Stato di partenza (verificato nel codice, 03/10/2026)

| Fatto | Dove |
| --- | --- |
| Calcolatore, Coast e What If usano un tasso per scenario scritto a mano: Orso 4%/3,5%, Base 7%/2,5%, Toro 10%/1,5% (crescita/inflazione), modificabile e salvato in `fireProjectionScenarios` | `lib/services/fireService.ts:985-991`, `FireParametri.tsx:280-297`, `FireCalculatorTab.tsx:210,243,686` |
| Coast e What If leggono lo scenario **salvato**, il Calcolatore l'anteprima non salvata | `CoastFireTab.tsx:165`, `WhatIfAnalysisTab.tsx:214` |
| Monte Carlo e Ventaglio leggono le ipotesi per classe di Impostazioni › Simulazioni (azioni Base 10,02% CAGR, inflazione 3,04%) | `lib/utils/monteCarloMarket.ts` (`resolveMonteCarloMarket`), `lib/constants/monteCarloMarketDefaults.ts:66-90` |
| Il Ventaglio prende il rendimento da Impostazioni ma l'**inflazione** delle spese dallo scenario Base del Calcolatore | `FireCalculatorTab.tsx:488` (`expenseInflationRate: scenarios.base.inflationRate`) |
| Obiettivi: tabella propria di rendimenti nominali per classe (azioni 7%, obbligazioni 2,5%…), nessuna inflazione | `lib/utils/goalTrajectory.ts:29-41` (`GOAL_CLASS_RETURNS`) |
| Rendimento reale = **sottrazione** `growthRate − inflationRate` in Coast, nel requisito FIRE e in What If; il cammino deterministico invece compone crescita e inflazione separatamente (equivale a Fisher) | `fireService.ts:1292-1294`, `fireService.ts:1542`, `types/whatIf.ts:54` |
| Pesi: il Ventaglio usa il portafoglio **detenuto** (`weightsFromHoldings`), il Monte Carlo i **target** (`seedWeightsFromTargets`) | `FireCalculatorTab.tsx:477`, `MonteCarloTab.tsx:266` |
| Capitale: le curve deterministiche (Calcolatore, Coast, What If) partono dal patrimonio FIRE intero (crypto e immobili non di residenza compresi); Ventaglio e Monte Carlo da `K` (sette classi, senza crypto e immobili) | `FireCalculatorTab.tsx` (`currentNetWorth = calculateFIRENetWorth(...) − pensionLockedValue`), `CoastFireTab.tsx:194`, `computeSimulatedCapital` |
| Spesa: Calcolatore e What If dal Cashflow (ultimo anno intero o anno in corso annualizzato); Coast dal Cashflow o da `coastFireCustomExpenses`; Monte Carlo da `plannedAnnualExpenses` di Impostazioni o 30.000 € | `fireService.ts:921-963`, `useCoastFireSettingsDraft.ts:79`, `MonteCarloTab.tsx:273` |
| Risparmio: costante in euro **nominali** nel Calcolatore e nel Ventaglio, costante in euro **reali** nel ritmo di Coast | `fireService.ts:1682-1691`, `doc/guide/fire-coast.md` blind spots |
| Guida sbagliata: «dal FIRE in poi» non considererebbe pensioni e tasse, ma il codice le passa | `doc/guide/fire.md:161` e il blind spot del Calcolatore, contro `FireCalculatorTab.tsx:509-527` |
| `withdrawalAdjustment: 'percentage'` dichiarato nel tipo, mai implementato (si comporta come `'fixed'`), la scheda forza `'inflation'` | `types/assets.ts:540`, `monteCarloService.ts:98-104`, `MonteCarloTab.tsx:291` |

### 1.3 Perimetro

**Incluso**
- Una **fonte unica delle ipotesi** (D1): rendimento e inflazione per Orso/Base/Toro calcolati dal portafoglio
  target sulle ipotesi per classe di Impostazioni › Simulazioni, letti da Calcolatore, Coast, What If, Monte Carlo
  (che già li legge per classe) e Obiettivi.
- Il **numero per scenario** delle schede deterministiche = rendimento composto atteso del portafoglio (D2, RP1).
- Il **rendimento reale** con la formula di Fisher ovunque (RP2).
- Il **capitale** unico (D4), la **spesa** unica (D5), il **risparmio** indicizzato all'inflazione (D6).
- Una riga **«Ipotesi usate»** uguale nelle cinque schede.
- La pulizia: correzione della guida su «dal FIRE in poi», la sorte di `'percentage'`.
- **D3, bootstrap storico**: presa come decisione, **non specificata qui** (§ 3.1); serve prima una ricerca.

**Escluso**
- Nuove domande (spesa sostenibile, età obiettivo, prelievi dinamici, eventi datati, reddito dopo il FIRE, costi
  ricorrenti): proposte P1–P16 dell'analisi, epic separate che erediteranno questa lingua.
- Cambiare le ipotesi per classe, le correlazioni o la regola Orso/Toro di R0: restano quelle del dossier Monte Carlo.
- Lo storico del runway e lo storico cashflow del Dettaglio del Calcolatore: sono fatti, non ipotesi; restano sul
  patrimonio FIRE come oggi.
- Il Monte Carlo resta il decumulo «se smetto oggi» (P7 dell'analisi è un'altra epic).

### 1.4 Casi d'uso

1. **Cambio le ipotesi una volta.** Abbasso il CAGR delle azioni in Impostazioni › Simulazioni e salvo: l'anno
   FIRE del Calcolatore, il numero Coast, il delta di What If, la probabilità del Monte Carlo e la traiettoria
   degli Obiettivi si muovono tutti. Oggi si muovono solo Monte Carlo e Ventaglio.
2. **Cambio i target una volta.** Porto i target di Allocazione da 60/40 a 80/20: i tre scenari del Calcolatore
   salgono (Base da 8,26% a 9,21% composto con i default), il Monte Carlo si semina con i nuovi pesi, il
   Ventaglio simula lo stesso 80/20.
3. **Un portafoglio a leva.** Target che sommano 150%: il rendimento composto di ogni scenario sconta il costo del
   debito e il drag di volatilità della leva (RP1), lo stesso che il Monte Carlo simula percorso per percorso.
4. **Stesse cifre ovunque.** Le cinque righe «Ipotesi usate» dicono la stessa cosa: «Portafoglio target ·
   Base 8,3% (reale 5,1%) · inflazione 3,0% · spesa 32.000 € dal Cashflow 2025 · capitale 410.000 €».
5. **Il Ventaglio sotto le curve.** A volatilità zero il Ventaglio coincide con la curva Base anche quando il
   portafoglio ha crypto o immobili, perché i due motori partono dallo stesso capitale con lo stesso rendimento.

### 1.5 Regole di calcolo

**RP1 — Rendimento composto atteso del portafoglio** (per scenario; pesi `w_i` in percentuale sulle sette classi
del Monte Carlo, `W = Σw/100`, parametri della classe da R1, correlazioni `ρ_ij` di Impostazioni, spread `sp` in
decimali):

```
G_i   = 1 + μa_i                         // media aritmetica del fattore (R1)
s_i   = dev. std del log-rendimento (R1)
v_i   = w_i / 100;  se W > 1: v_cash ← v_cash − (W − 1)        // il debito è liquidità negativa (R4)
M     = Σ v_i · G_i − max(W − 1, 0) · sp                      // E[1 + r_p]
V     = Σ_i Σ_j v_i · v_j · G_i · G_j · (exp(ρ_ij · s_i · s_j) − 1)   // Var[1 + r_p]
g_p   = M / √(1 + V / M²) − 1                                  // il CAGR del portafoglio (R2 su M, √V)
```

È R2 applicata al portafoglio: si approssima il fattore annuo del portafoglio ribilanciato con una lognormale
di stessa media e varianza, e se ne prende la mediana. **Proprietà** (criteri A1–A4): una classe sola al 100%
restituisce esattamente il suo CAGR; a volatilità zero `g_p = Σ v_i·g_i − max(W−1,0)·sp`, cioè lo stesso
rendimento che i motori stocastici danno a volatilità zero (R3/R4), quindi il test di coerenza del Ventaglio con
la curva Base resta valido per costruzione. Verificata contro simulazione (400.000 estrazioni correlate, media
dei log): scarto ≤ 0,02 punti in tutti i casi di § 1.6.

**RP2 — Rendimento reale** (Fisher, ovunque serva un rendimento reale: Coast, requisito FIRE con ponte e pensioni,
What If, riga «Ipotesi usate»):

```
reale = (1 + g_p) / (1 + π) − 1
```

Sostituisce la sottrazione `g − π` di `fireService.ts:1292-1294`, `:1542` e `types/whatIf.ts:54`. Il cammino
deterministico del Calcolatore (crescita nominale, spese che si inflazionano) non cambia: già equivale a Fisher.

**RP3 — Inflazione dello scenario**: `π` = `inflationRate` dello scenario in Impostazioni › Simulazioni (default
3,04% nei tre). È l'inflazione delle spese nel Calcolatore, nel Ventaglio, in Coast, in What If e nel Monte Carlo.

**RP4 — Pesi** (D1): `seedWeightsFromTargets(targets, assets, { lockedAssetIds, goldSubCategory })` (R6) quando
Allocazione ha target; altrimenti `weightsFromHoldings` (il portafoglio di oggi), e la riga «Ipotesi usate» dice
quale dei due. **Un solo punto** li calcola per la pagina (§ 4.1); nessuna scheda chiama le due funzioni da sola.
Il Monte Carlo resta l'unica scheda in cui i pesi si possono ritoccare per un'esecuzione (il seme è RP4).

**RP5 — Capitale** (D4): `K` di RK (`computeSimulatedCapital`), al netto dei fondi pensione bloccati, per
**tutte** le schede. Crypto e immobili (residenza compresa) restano fuori, dichiarati nella riga «Ipotesi usate»
come oggi nel tile Parametri del Monte Carlo: «Fuori: Immobili 250.000 €, Crypto 5.000 €».

**RP6 — Spesa** (D5): `spesa = plannedAnnualExpenses` di Impostazioni se impostata, altrimenti la spesa
del Cashflow di `getAnnualCashflowData` (ultimo anno intero, o anno in corso annualizzato). Una sola funzione
pura `resolvePlanExpenses(settings, cashflowData)` restituisce importo e origine.

**RP7 — Risparmio indicizzato** (D6): nel cammino deterministico e nel Ventaglio il risparmio dell'anno
`t` (t = 1, 2, …) è `S · (1 + π)^(t−1)`. Il primo anno resta `S`, quindi un orizzonte di un anno è identico a oggi.
Coast tiene già il risparmio costante in euro reali: dopo RP7 Calcolatore e Coast danno lo stesso anno.

### 1.6 Criteri di accettazione (valori di riferimento verificabili)

Default di Impostazioni (dossier Monte Carlo § 2.3: tabella, correlazioni, spread 2,0%, inflazione 3,04%) salvo
dove indicato. Tolleranza delle formule chiuse: ± 0,0001 punti percentuali.

| # | Caso | Valore atteso |
| --- | --- | --- |
| A1 | RP1, Azioni 100%, i tre scenari | Orso 8,0100%, Base 10,0200%, Toro 12,1900% (il CAGR della classe, esatto) |
| A2 | RP1, volatilità 0 su tutte le classi, Azioni 60% (g = 10,02%) + Obbligazioni 40% (g = 4,53%) | 7,8240% = 0,6·10,02 + 0,4·4,53 |
| A3 | RP1, Azioni 60% + Obbligazioni 40% | Orso 5,9669%, Base 8,2623%, Toro 11,0855% (media aritmetica Base 8,9313%, volatilità 12,1288%) |
| A4 | A3 con matrice identità al posto dei default | Base 8,2697% (la correlazione azioni-obbligazioni di 0,0224 pesa 0,007 punti) |
| A5 | RP1, Azioni 50%, Obbligazioni 20%, Oro 10%, Liquidità 10%, Trend 10% | Orso 6,0780%, Base 8,5976%, Toro 11,4379% |
| A6 | RP1 con leva: Azioni 90% + Obbligazioni 60% (W = 1,5), spread 2,0% | Orso 6,6383%, Base 9,2298%, Toro 12,6731% |
| A7 | A6 a volatilità 0 | `0,9·10,02 + 0,6·4,53 − 0,5·(3,37 + 2,0)` = 9,0510% |
| A8 | Simulazione di controllo: 400.000 estrazioni seminate con `drawYear` e il fattore di Cholesky dei default, A3 Base | `exp(media di ln(1 + r_p)) − 1` = 8,26% ± 0,03 punti |
| A9 | RP2: g = 7%, π = 3,04% | 3,8432% (non 3,96%) |
| A10 | RP2 su A3 | reale Orso 2,8406%, Base 5,0682%, Toro 7,8081% |
| A11 | RP7: patrimonio 100.000 €, risparmio 10.000 €, g = 5%, π = 2%, nessun FIRE raggiunto | anno 1: 115.000 €; anno 2: 115.000·1,05 + 10.200 = 130.950 € |
| A12 | RP5: ETF azionario 300.000 €, crypto 50.000 €, seconda casa 200.000 € | capitale 300.000 € in tutte le schede; riga «Fuori: Immobili 200.000 €, Crypto 50.000 €» |
| A13 | RP6: `plannedAnnualExpenses` 28.000 €, Cashflow 2025 31.500 € | 28.000 € «da Impostazioni» in tutte le schede; senza `plannedAnnualExpenses` 31.500 € «dal Cashflow 2025» |
| A14 | Obiettivo con allocazione Azioni 80% + Obbligazioni 20%, Base | rendimento 9,2079% (oggi 6,1% da `GOAL_CLASS_RETURNS`) |
| A15 | Obiettivo con allocazione Azioni 20%, Obbligazioni 70%, Liquidità 10%, Base | 5,8300% |
| A16 | Obiettivo con Azioni 90% + Crypto 10% | Azioni riscalate a 100%: 10,0200%; la riga dice «Crypto fuori dalle ipotesi» |
| A17 | Coerenza: volatilità 0, target A2, nessun fondo bloccato | il Ventaglio coincide, float per float, con la curva Base di `calculateFIREProjection` (stesso capitale, stesso `g_p`, stesso risparmio indicizzato) |
| A18 | Coerenza tra schede: stessi dati | la riga «Ipotesi usate» è la stessa stringa in Calcolatore, Coast, What If, Monte Carlo (prima di ritoccare i pesi) e Obiettivi (senza allocazione propria) |

I valori A3–A6 e A14–A15 sono calcolati con lo script di controllo
`/mnt/project-files/fire-simulazioni/rp1-controllo.py` (formula chiusa e simulazione).

---

## 2. Che cosa cambia per l'utente (a colpo d'occhio)

Con i default di Impostazioni e target 60/40 (A3, A10), gli scenari del Calcolatore passano da
4% / 7% / 10% nominali con inflazioni 3,5% / 2,5% / 1,5% (reali 0,5% / 4,5% / 8,5% per sottrazione) a
5,97% / 8,26% / 11,09% nominali con inflazione 3,04% (reali 2,84% / 5,07% / 7,81%). **L'Orso diventa molto meno
severo** (reale da 0,5% a 2,8%) perché R0 lo definisce come il 10° percentile delle finestre trentennali reali,
non come una stagflazione. Il Base reale sale di circa mezzo punto. Le cifre dipendono dai target: un 80/20 sale,
un portafoglio prudente scende.

---

## 3. Decisioni

| # | Stato | Decisione | Alternative scartate e motivo |
| --- | --- | --- | --- |
| D1 | **Presa** (03/10/2026) | **Fonte unica delle ipotesi.** Calcolatore, Coast, What If, Monte Carlo e Obiettivi leggono rendimento e inflazione dei tre scenari Orso/Base/Toro del **portafoglio target**, calcolati dalle ipotesi per classe di Impostazioni › Simulazioni. Conseguenze: `fireProjectionScenarios` non si legge più (§ 4.3); il Ventaglio passa dai pesi detenuti ai pesi target (RP4), rovesciando la scelta di default del dossier Monte Carlo § 3. | Numeri separati per scheda (il problema di oggi). |
| D2 | **Presa** (03/10/2026) | **Numero per il Calcolatore**: per scenario il **rendimento composto atteso** del portafoglio (RP1), non la media aritmetica. I 2 scenari scritti a mano diventano i 3 del portafoglio. | Media aritmetica (anticipa l'anno FIRE: il drag di volatilità sparisce). |
| D3 | **Presa** (03/10/2026), dettagli aperti | **Bootstrap storico** come seconda modalità del Monte Carlo, accanto alla parametrica, estraendo **blocchi di anni consecutivi**. Dettagli in § 3.1. | Estrarre anni singoli (perde le sequenze); sostituire la parametrica (resta l'unica con tre scenari). |
| D4 | **Presa** (03/10/2026) | **Capitale unico = `K`** (RP5) in tutte le schede: crypto e immobili, residenza compresa, fuori, dichiarati. L'interruttore «includi la casa di residenza» del Calcolatore sparisce dai Parametri (resta solo per lo storico del runway). | (b) Patrimonio FIRE ovunque, con crypto e immobili a rendimento reale zero anche nei motori stocastici: un compartimento non volatile da aggiungere al Monte Carlo e al Ventaglio, che non si preleva mai finché il resto basta; più codice e una regola di prelievo nuova. (c) Lasciare due capitali (l'incoerenza 3 resta). |
| D5 | **Presa** (03/10/2026) | **Spesa unica** (RP6): `plannedAnnualExpenses` di Impostazioni se impostata, altrimenti il Cashflow. La spesa personalizzata di Coast (`coastFireCustomExpenses`) migra una volta in `plannedAnnualExpenses` (se questa è vuota) e il suo interruttore sparisce. Il Monte Carlo si semina con la stessa cifra (oggi 30.000 € di ripiego). | Solo Cashflow (chi pianifica una spesa diversa in pensione non ha dove scriverla); una spesa per scheda (oggi). |
| D6 | **Presa** (03/10/2026) | **Risparmio indicizzato all'inflazione** (RP7) nel Calcolatore e nel Ventaglio, come già in Coast. | Nominale costante (oggi: si erode del 3% l'anno); un tasso di crescita del risparmio separato (un parametro in più, va con P2 se servirà). |
| D7 | **Presa** (03/10/2026) | **Rendimento reale con Fisher** (RP2) ovunque. | Sottrazione (oggi: sovrastima il reale di circa 0,1–0,3 punti e fa differire di un anno Coast e Calcolatore). |
| D8 | **Presa** (03/10/2026) | **Obiettivi**: il rendimento di un obiettivo è RP1 sullo scenario **Base**, con la sua allocazione consigliata se ne ha una (crypto e immobili tolti e il resto riscalato a 100, dichiarato), altrimenti con i pesi del portafoglio target. `GOAL_CLASS_RETURNS` e `DEFAULT_GOAL_RETURN` spariscono. Gli importi degli obiettivi restano nominali (nessuna inflazione). | Pesi del portafoglio target per tutti gli obiettivi (un fondo casa a 3 anni al 100% obbligazioni renderebbe come il portafoglio di lungo periodo); tre scenari anche negli Obiettivi (la scheda non ha una vista per scenari: nuovo design, fuori perimetro). |

**Scelte di default prese dall'agente** (dichiarate, il proprietario può rovesciarle):
- **Nome del dossier** `doc/fire-ipotesi/` (proposta del coordinatore): coerente con `doc/montecarlo/`, nomina
  ciò che si unifica.
- **RP1 in forma chiusa**, non con una simulazione: deterministico, istantaneo, testabile al decimo di millesimo;
  lo scarto dalla simulazione è ≤ 0,02 punti (A8).
- **Una sola inflazione per scenario dalla tab Simulazioni** (RP3): i campi «inflazione» dei Parametri del
  Calcolatore spariscono con quelli di crescita.
- **Il Ventaglio resta sullo scenario Base**, come oggi.
- **`withdrawalAdjustment: 'percentage'`**: resta nel tipo (è di upstream, § 6) con un commento «non implementato,
  riservato a P3»; nessun cambio di comportamento. Toglierlo farebbe conflitto al prossimo riallineamento.
- **Valori salvati in `fireProjectionScenarios`**: non migrati (non hanno un equivalente per classe). Se il documento
  li ha e differiscono dai vecchi default, la riga «Ipotesi usate» del Calcolatore dice una volta «I tassi scritti
  a mano prima del <data> non sono più usati: le ipotesi ora sono in Impostazioni › Simulazioni».

### 3.1 Punti aperti

- **D3, bootstrap storico** — da specificare dopo una **ricerca B0** (thread «ricerca»):
  - quali serie annuali delle sette classi si possono **salvare nella repo** (licenze di Damodaran, testfolio,
    S&P GSCI, DBMFSIM, UEQCSIM; le serie R0 sono in `/mnt/project-files/montecarlo/r0-dati/`);
  - periodo comune: con Trend dal 2000 e Carry dal 2002, le finestre comuni alle sette classi sono circa 25 anni;
    decidere se estendere con proxy dichiarati o campionare solo le classi con pesi non nulli;
  - lunghezza del blocco (proposta di partenza: blocchi di 5 anni, *circular block bootstrap*), inflazione
    storica estratta nello stesso blocco (prelievi indicizzati all'inflazione storica, non al 3,04%);
  - come si presenta: una modalità «Storico» accanto a «Parametrico» nel tile Parametri; una sola distribuzione
    (niente Orso/Base/Toro), quindi il tile «Scenari a confronto» non c'è in quella modalità;
  - valuta: serie in dollari come R0 (rendimenti reali coerenti con CPI USA).
- **Leva e target** nella riga «Ipotesi usate»: con target sopra 100% la riga dice «leva 1,5×». Nessuna decisione
  aperta, solo da non dimenticare nel testo.

---

## 4. Modello dati e moduli (comuni alle task)

### 4.1 Le ipotesi della pagina — `lib/utils/fireAssumptions.ts` (nuovo, L1)

Un modulo puro, chiamato da **ogni** scheda; nessuna scheda ricostruisce i pezzi da sola.

```ts
export interface PortfolioScenario extends FIREScenarioParams { // growthRate = g_p (RP1), inflationRate = π (RP3)
  realReturnRate: number;   // RP2, percent
  arithmeticMean: number;   // M − 1, percent, read-only («media 8,9%»)
  volatility: number;       // √V, percent, read-only
}
export interface FireAssumptions {
  scenarios: { bear: PortfolioScenario; base: PortfolioScenario; bull: PortfolioScenario };
  weights: Record<MonteCarloClass, number>;
  weightsOrigin: 'targets' | 'holdings';
  leverage: number;
  market: ResolvedMonteCarloMarket;
  // L2:
  capital?: { total: number; outside: { realestate: number; crypto: number } };
  expenses?: { annual: number; origin: 'settings' | 'cashflow'; referenceYear?: number; isAnnualized?: boolean };
}

export function portfolioCompoundReturn(weights, scenario: MonteCarloMarketScenario, correlations, leverageSpread): { cagr; arithmeticMean; volatility } // RP1
export function realReturn(growthPct: number, inflationPct: number): number // RP2
export function resolveFireAssumptions(input: { settings; assets; lockedAssetIds; cashflowData? }): FireAssumptions
```

- `portfolioCompoundReturn` riusa `toLogNormal` di `lib/utils/monteCarloDraw.ts` (R1) e `expandUpperTriangle` +
  `nearestCorrelation` di `lib/utils/correlationMatrix.ts` (la stessa correzione silenziosa di `buildDrawPlan`).
- `PortfolioScenario` **estende** `FIREScenarioParams`: `calculateFIREProjection`, `calculateCoastFIREProjection`,
  `calculateWhatIfImpact` e `calculateFIRESensitivityMatrix` ricevono `FIREProjectionScenarios` come oggi, senza
  cambiare firma.
- Un hook sottile `lib/hooks/useFireAssumptions.ts` fa le query (settings, assets, cashflow) con le **stesse chiavi**
  di oggi (`['settings', ownerId]`, `['assets', ownerId]`, `['annualCashflowData', ownerId]`) e memoizza il risultato:
  le schede condividono la cache di React Query.

### 4.2 La riga «Ipotesi usate» — `components/fire-simulations/FireAssumptionsRow.tsx` (nuovo, L1)

Una `DeclarationRow` (The Declaration-Tile Rule) sopra il verdetto di ogni scheda, testo generato da
`describeFireAssumptions(assumptions, scope)` in `lib/utils/fireAssumptionsNarrative.ts`:

- L1: «Portafoglio target · Base 8,3% (reale 5,1%), Orso 6,0%, Toro 11,1% · inflazione 3,0%» con link
  «Modifica in Impostazioni» (`/dashboard/settings?tab=simulazioni`). Con pesi dal portafoglio di oggi:
  «Portafoglio di oggi (nessun target in Allocazione)». Con leva: «· leva 1,5×».
- L2 aggiunge: «· spesa 32.000 € dal Cashflow 2025 · capitale 410.000 € (fuori: Immobili 250.000 €)».
- Obiettivi (L3) usa la stessa riga quando l'obiettivo non ha allocazione propria; con allocazione propria il
  tile dell'obiettivo dichiara «rendimento 9,2% dall'allocazione dell'obiettivo».
- Nel Monte Carlo la riga dichiara il seme; se l'utente ritocca i pesi il tile Parametri dice già «a mano» (T3).

### 4.3 Impostazioni

- **Nessun campo nuovo.** `fireProjectionScenarios` resta nel tipo e nelle sedi di `setSettings` (è di upstream),
  **non si legge e non si scrive più** nel fork: `FireCalculatorTab` perde `scenarios`/`setScenarios`,
  `scenarioSaveMutation` e `handleResetScenarios`.
- `plannedAnnualExpenses` (già esistente) diventa la spesa del piano (D5). La tab di Impostazioni che la ospita ne
  cambia la lettura: «Spesa del piano, usata da tutte le simulazioni; vuota = dal Cashflow».
- Impostazioni › Simulazioni › Ipotesi di mercato aggiunge una riga in sola lettura: «Il portafoglio target rende
  (composto): Orso 6,0% · Base 8,3% · Toro 11,1%» (L1), calcolata con `portfolioCompoundReturn` sui valori in
  modifica, così chi cambia un CAGR vede subito l'effetto sul portafoglio.

---

## 5. Task

Ogni task è un thread «impl» (Sonnet 5.5, regola del progetto), un branch da `main`, una PR in bozza verso
`Ciocc128/net-worth-tracker:main`. L2 e L3 partono dopo il merge di L1.

### 5.1 L1 — Le ipotesi del portafoglio target in tutte le schede (D1, D2, D7, pulizia)

**Cosa vede l'utente**
- Calcolatore › Parametri: la griglia «crescita / inflazione» dei tre scenari sparisce; al suo posto la
  dichiarazione con i tre rendimenti del portafoglio, la media e la volatilità in sola lettura, e il link a
  Impostazioni. Restano SWR, residenza (fino a L2), INPS/RITA.
- Calcolatore › Scenari, Coast › Scenari, What If (`describeBeforeAfterAside`): i tassi mostrati sono `g_p` e il
  reale RP2.
- Il Ventaglio simula i pesi target (RP4) e gonfia le spese con l'inflazione di Impostazioni (RP3), non più con
  quella del Calcolatore.
- La riga «Ipotesi usate» (§ 4.2, versione L1) in Calcolatore, Coast, What If, Monte Carlo.
- Impostazioni › Simulazioni: la riga «Il portafoglio target rende».

**Dettagli tecnici**
1. `lib/utils/fireAssumptions.ts` (RP1, RP2, RP4) + `lib/hooks/useFireAssumptions.ts`.
2. `FireCalculatorTab.tsx`: `scenarios` = `assumptions.scenarios`; via stato, salvataggio e reset degli scenari;
   `fanInputs.weights` = `assumptions.weights`, `expenseInflationRate` = `assumptions.scenarios.base.inflationRate`.
   `FireParametri.tsx`: rimossa la griglia, aggiunta la dichiarazione.
3. `CoastFireTab.tsx:165`, `WhatIfAnalysisTab.tsx:214`: `assumptions.scenarios` al posto di
   `settings?.fireProjectionScenarios ?? getDefaultScenarios()`.
4. RP2 in `calculateCoastFIREProjection` (`fireService.ts:1292-1294`), `resolveFireRequirement` (`:1542`), il
   `realReturnRate` del baseline di What If; una sola funzione `realReturn` in `fireAssumptions.ts`.
   `getDefaultScenarios` resta esportata solo se un test o upstream la usa; altrimenti si toglie.
5. `MonteCarloTab.tsx`: il seme dei pesi passa da `resolveFireAssumptions` (stessa regola di oggi, una sola
   chiamata); l'inflazione per le pensioni (`baseInflationRate`) già è quella del mercato.
6. `MonteCarloMarketTile.tsx`: la riga del portafoglio target (riceve target e assets dalla pagina Impostazioni).
7. Pulizia: `doc/guide/fire.md:161` e il blind spot del Calcolatore («withdraws the expenses only — no state
   pension, no tax») riscritti su ciò che il codice fa (pensioni e tassa passate a `fanRetirement`); commento su
   `'percentage'` in `types/assets.ts:540`.

**File** — Nuovi: `lib/utils/fireAssumptions.ts`, `lib/utils/fireAssumptionsNarrative.ts`,
`lib/hooks/useFireAssumptions.ts`, `components/fire-simulations/FireAssumptionsRow.tsx`, test omonimi.
Modificati: `lib/services/fireService.ts`, `lib/services/whatIfService.ts`, `types/whatIf.ts`,
`components/fire-simulations/{FireCalculatorTab,FireParametri,CoastFireTab,WhatIfAnalysisTab,MonteCarloTab}.tsx`,
`lib/utils/{fireNarrative,whatIfNarrative,coastFireView,fireSummary}.ts` (dove stampano i tassi),
`components/settings/MonteCarloMarketTile.tsx`, `app/dashboard/settings/page.tsx`.

**Test**
- `fireAssumptions.test.ts`: A1–A7, A9, A10; A8 con 400.000 estrazioni seminate (o 100.000 con tolleranza 0,05).
- `fireService.test.ts` e `coastFireView.test.ts`: le attese che usano `g − π` cambiano con RP2; ogni attesa nuova
  ha il calcolo scritto nel commento.
- `monteCarloService.test.ts`: il test di coerenza del Ventaglio resta verde (A2 a volatilità zero).
- `fireAssumptionsNarrative.test.ts`: le tre letture (target, portafoglio di oggi, leva).

### 5.2 L2 — Capitale, spesa e risparmio comuni (D4, D5, D6) — dopo L1

**Cosa vede l'utente**
- Calcolatore, Coast, What If partono da `K`; «Fuori: …» nella riga «Ipotesi usate». Sparisce l'interruttore della
  residenza dai Parametri del Calcolatore (D4). Liquido/illiquido del Traguardo si leggono su `K`.
- Una spesa sola (RP6) in tutte le schede, con l'origine nella riga; Coast perde «spesa personalizzata»; il Monte
  Carlo si semina con la stessa cifra.
- Il risparmio cresce con l'inflazione (RP7) nel Calcolatore e nel Ventaglio; la leva sul risparmio («servirebbero
  +X € l'anno») parla di euro di oggi.

**Dettagli tecnici**
1. `resolveFireAssumptions` aggiunge `capital` (`computeSimulatedCapital`, già usato dal Ventaglio) ed `expenses`
   (`resolvePlanExpenses`). Il costo fiscale (`resolvePortfolioTaxProfile`) si legge sugli asset di `K`, così la
   scala `basisScale` di `FireCalculatorTab.tsx:521` sparisce.
2. `calculateFIREProjection` e `runAccumulationSimulation`: RP7 (un parametro `savingsInflationRate`, default 0 =
   comportamento di oggi per upstream e per i test esistenti; le schede passano `π`).
3. Migrazione D5: al primo salvataggio di Impostazioni o di Coast, se `coastFireCustomExpenses` esiste e
   `plannedAnnualExpenses` no, si copia; `coastFireCustomExpenses` non si scrive più (resta nel tipo).
4. Lo storico del runway (`calculateHistoricalFIRERunway`) resta sul patrimonio FIRE con la residenza secondo
   `includePrimaryResidenceInFIRE` (fatti, non ipotesi; § 1.3).

**Test**: A11–A13, A17, A18; `useCoastFireSettingsDraft` senza spesa personalizzata; `settingsRoundTrip.test.ts`
per la migrazione.

### 5.3 L3 — Obiettivi sulle ipotesi comuni (D8) — dopo L1

- `goalTrajectory.ts`: `expectedAnnualReturn(allocation)` → `goalAnnualReturn(allocation, assumptions)` (RP1 sullo
  scenario Base, crypto e immobili tolti e riscalati, A14–A16); via `GOAL_CLASS_RETURNS` e `DEFAULT_GOAL_RETURN`.
- I consumatori (`GoalBasedInvestingTab.tsx`, `goalsSummary.ts`, `lib/services/assistantMonthContextService.ts`,
  `lib/server/assistant/prompts.ts` se stampa il tasso) ricevono le ipotesi. Il server (Assistente) calcola le
  ipotesi con la stessa funzione pura sui dati che già legge.
- Il tile dell'obiettivo dichiara da dove viene il rendimento (§ 4.2).

### 5.4 B0 — Ricerca per il bootstrap (thread «ricerca», non codice)

Consegna un file in Library che risponde ai punti di § 3.1 su D3, con fonti e licenze verificate. Dopo B0, un
thread «spec» aggiunge a questo dossier (o a `doc/montecarlo/README.md`) la task del bootstrap.

---

## 6. Documentazione da aggiornare (in ogni task, per la sua parte)

- `doc/guide/fire.md` § FIRE, What If and Goals: «le ipotesi della pagina sono UNA lettura»
  (`resolveFireAssumptions`), RP1–RP7, il Ventaglio sui pesi target; blind spots del Calcolatore.
- `doc/guide/fire-coast.md`, `fire-what-if.md`, `fire-monte-carlo.md`, `fire-obiettivi.md`: la riga «Ipotesi usate»
  e i blind spots che spariscono (risparmio nominale vs reale, rendimenti propri degli Obiettivi).
- `doc/guide/impostazioni.md`: la riga del portafoglio target, `plannedAnnualExpenses` come spesa del piano.
- `doc/guide/fork-scelte-ui.md` e `CLAUDE.md` (righe «FIRE», «Solo fork», «Latest»): le schede deterministiche del
  fork divergono da upstream.
- `Draft Release Temp.md` secondo WORKFLOW.md § Where things are recorded.

---

## 7. Rischi

| Rischio | Mitigazione |
| --- | --- |
| **Merge con upstream**: `fireService.ts`, `FireCalculatorTab.tsx`, `FireParametri.tsx`, `CoastFireTab.tsx`, `goalTrajectory.ts` sono di upstream. | Logica nuova in moduli nuovi (`fireAssumptions*`); le firme di `calculateFIREProjection` e Coast restano; RP7 come parametro con default neutro; voce in `fork-scelte-ui.md`. |
| L'utente vede numeri diversi dal giorno dopo (Orso molto meno severo, § 2). | La riga «Ipotesi usate» e la nota una tantum sui tassi scritti a mano; il collaudo confronta prima e dopo sul mirror dei dati. |
| RP1 è un'approssimazione. | Scarto misurato ≤ 0,02 punti (A8), dichiarato nel «Come si calcola». |
| Con D4 chi ha molti immobili o crypto vede il progresso verso il FIRE calare. | Scelta del proprietario (D4); la riga «Fuori: …» lo dice; P5 (affitti come reddito) è la risposta di lungo periodo. |
| I test esistenti cambiano attese (RP2, RP7). | Ogni attesa cambiata ha il calcolo nel commento; il test di coerenza del Ventaglio non cambia nella sostanza. |
| Prestazioni: RP1 ricalcolata a ogni render. | 7×7 operazioni per scenario, memoizzata su target, assets e mercato. |

---

## 8. Ordine delle PR e criteri di fine

Alla fine di ogni task: `npx tsc --noEmit`, `npx eslint app components lib types e2e scripts __tests__`,
`TZ=Europe/Rome npx vitest run` verdi, guide di § 6 aggiornate. Le spec Playwright del Calcolatore e di Coast
(`e2e/fire*.spec.ts`, `e2e/coast*.spec.ts`) si eseguono in un thread sul computer del proprietario.

| Ordine | Task | Prerequisito | Criterio di fine |
| --- | --- | --- | --- |
| 1 | L1 ipotesi del portafoglio target | — | A1–A10 verdi; nessun lettore di `fireProjectionScenarios`; la riga «Ipotesi usate» in quattro schede; coerenza del Ventaglio verde |
| 2 | L2 capitale, spesa, risparmio | L1 unita | A11–A13, A17, A18 verdi |
| 3 | L3 Obiettivi | L1 unita | A14–A16 verdi; nessun lettore di `GOAL_CLASS_RETURNS` |
| — | B0 ricerca bootstrap | — (in parallelo) | file in Library con fonti e licenze |

**Collaudo**: dopo ciascuna PR, su anteprima Vercel, una fase per messaggio con l'esito scritto prima
(WORKFLOW.md § 2). Le verifiche sugli emulatori o sul mirror dei dati di produzione si fanno in un thread sul
computer del proprietario, non nel cloud.
