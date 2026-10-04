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
> della spec lo stesso giorno. La § 9 (P6, costi ricorrenti, task C1) è stata aggiunta il 04/10/2026.

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
  ricorrenti): proposte P1–P16 dell'analisi, epic separate che erediteranno questa lingua. I costi ricorrenti (P6)
  sono poi entrati in questo dossier come § 9 (task C1, 04/10/2026).
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
| 4 | C1 costi ricorrenti (§ 9) | L1–L3 unite | C1–C12 verdi (§ 9.9) |

**Collaudo**: dopo ciascuna PR, su anteprima Vercel, una fase per messaggio con l'esito scritto prima
(WORKFLOW.md § 2). Le verifiche sugli emulatori o sul mirror dei dati di produzione si fanno in un thread sul
computer del proprietario, non nel cloud.

---

## 9. P6 — Costi ricorrenti: bollo e TER in tutti i motori (task C1)

> Origine: analisi `/mnt/project-files/fire-simulazioni/analisi-fire-simulazioni.md` § 5 (P6) e § 4 (resto di P0).
> Spec scritta il 04/10/2026 su `main` al commit `e63fce1` (merge della PR #45, T4 «Proiezione»); decisioni
> D-C1–D-C6 confermate dal proprietario nel thread della spec lo stesso giorno. Valgono le regole RP1–RP7 di § 1.5:
> questa sezione le **estende**, non le sostituisce.

### 9.1 Obiettivo

Ogni scheda di FIRE e Simulazioni parla di rendimenti **lordi**: nessun motore toglie il TER dei fondi né l'imposta
di bollo, che l'app già conosce (Panoramica › Costi). Per un investitore italiano sono circa 0,3–0,5 punti l'anno,
che su 30 anni spostano l'anno FIRE, la probabilità del Monte Carlo e la Proiezione in modo visibile. Dopo C1 tutte
le schede usano il rendimento **netto di TER e bollo**, calcolato da una regola sola, e la riga «Ipotesi usate» dice
quanto pesano i costi.

### 9.2 Stato di partenza (verificato nel codice, 04/10/2026)

| Fatto | Dove |
| --- | --- |
| TER per strumento (`Asset.totalExpenseRatio`, percentuale), letto solo dalla Panoramica (`calculatePortfolioWeightedTER`, media sui soli strumenti che ce l'hanno) | `types/assets.ts:170`, `lib/services/assetService.ts:785-838`, `lib/utils/dashboardOverviewUtils.ts:241` |
| Bollo: `stampDutyEnabled` (default **false**) e `stampDutyRate` (default 0,2) nelle impostazioni, tile «Costi» di Impostazioni › Allocazione; `stampDutyExempt` per strumento; conto corrente (sottocategoria `checkingAccountSubCategory`) a forfait di 34,20 € sopra 5.000 € | `types/assets.ts:171,374-376`, `lib/services/assetService.ts:841-875`, `lib/constants/stampDuty.ts`, `app/dashboard/settings/page.tsx:2363` |
| Nessun motore FIRE legge TER o bollo | `fireAssumptions.ts`, `monteCarloDraw.ts`, `monteCarloService.ts`, `fireService.ts`, `goalTrajectory.ts` |
| Due punti di strozzatura coprono tutte le schede: `portfolioCompoundReturn`/`buildPortfolioScenarios` (Calcolatore, Coast, What If e matrice, Obiettivi via `goalAnnualReturn`) e `portfolioReturn` (Monte Carlo, Ventaglio, Proiezione) | `lib/utils/fireAssumptions.ts:105,227`, `lib/utils/goalTrajectory.ts:121`, `lib/utils/monteCarloDraw.ts:144` |
| I default per classe sono lordi di costi del fondo, tranne **Trend** (DBMFSIM, già netto del TER di DBMF, 0,85%) e **Carry** (UEQCSIM meno l'1% di costi, scelta del proprietario) | `doc/montecarlo/README.md` § 2.3 |
| La Proiezione dichiara il valore lordo (V8) | `doc/montecarlo/README.md` § 11 (V8), `doc/guide/fire-proiezione.md:21` |
| **Resto di P0.** Tutto il resto è chiuso da L1–L3 (riga «Ipotesi usate», prelievo del Monte Carlo = spesa del piano, guida su «dal FIRE in poi», `'percentage'` commentato, risparmio indicizzato). Unico residuo: il commento di `calculateFIREProjection` dice ancora «Annual savings are added nominally (not inflation-adjusted)», mentre le schede passano `indexSavings = true` | `lib/services/fireService.ts:1458` |

### 9.3 Fonti (norme e dati, consultate il 04/10/2026)

| Fatto | Fonte |
| --- | --- |
| Bollo sulle comunicazioni relative ai prodotti finanziari: **0,20% annuo**, art. 13 c. 2-ter della Tariffa, parte prima, allegata al DPR 642/1972; **invariato nel 2026** (la legge di bilancio 2026 tocca il bollo solo su piccoli finanziamenti, commi 145–146) | [QuiFinanza, bollo e IVAFE 2026](https://quifinanza.it/fisco-tasse/imposta-bollo-ivafe-prodotti-finanziari-2026/1005389/); [Money.it, conto deposito](https://www.money.it/imposta-di-bollo-sul-conto-deposito-quanto-si-paga-e-come-si-calcola) |
| Base: **valore di mercato** dei prodotti alla data di fine rendicontazione (in mancanza, nominale o di rimborso), rapportato al periodo (pro rata temporis); per le **persone fisiche nessun tetto** (il massimo di 14.000 € vale per gli altri soggetti) e nessuna franchigia | [Facile.it, bollo sugli investimenti](https://www.facile.it/investimenti/guida/imposta-di-bollo-sugli-investimenti.html); [Directa, FAQ bolli](https://www.directa.it/pub2/it/faq/bolli.html); circolare AdE 48/E del 21/12/2012 |
| Conto deposito 0,20%; conto corrente 34,20 € fissi sopra 5.000 € di giacenza media (già nell'app) | come sopra; `lib/constants/stampDuty.ts` |
| DBMFSIM: SG CTA Index + 2,5% fino al 2019, poi l'ETF DBMF, con TER dello **0,85%** già tolto | [Risk Parity Chronicles, tre backtester](https://riskparitychronicles.substack.com/p/three-portfolio-backtesters-every); [testfolio, Help](https://testfol.io/help/) |

**Limite dichiarato**: dal cloud i siti dell'Agenzia delle Entrate e di testfolio sono bloccati dalla rete; le cifre
vengono da fonti secondarie concordi trovate con la ricerca web. Chi implementa non cambia i valori; se una fonte
primaria li contraddice, si ferma e chiede.

### 9.4 Perimetro

**Incluso**
- Un costo annuo **per classe** (TER + bollo) ricavato dagli strumenti di `K` e dalle Impostazioni (RC1–RC3).
- Il costo del portafoglio applicato **ogni anno, dopo il rendimento**, in tutti i motori: rendimento composto RP1
  (quindi Calcolatore, Coast, What If, matrice di sensibilità, Obiettivi), Monte Carlo, Ventaglio, Proiezione (RC4, RC5).
- La riga «Ipotesi usate» e la riga «Il portafoglio target rende» di Impostazioni › Simulazioni dicono i costi.
- La Proiezione passa da lorda a **netta di TER e bollo** (D-C6), resta lorda della tassa sulla vendita.
- Il residuo di P0 (il commento di `fireService.ts:1458`).

**Escluso**
- Costi di transazione, spread denaro-lettera, commissioni del broker, IVAFE sugli strumenti detenuti all'estero
  (stessa aliquota dello 0,2%, ma l'app non sa dove sono depositati: dichiarato nel «Come si calcola»).
- Il forfait di 34,20 € dei conti correnti (D-C4): fuori dal modello, dichiarato.
- Il bollo e i costi di crypto e immobili: sono fuori da `K` (RP5).
- Un interruttore lordo/netto nelle schede (D-C5).
- Cambiare i default per classe o il TER degli strumenti: il TER si scrive nel dialogo dello strumento, come oggi.

### 9.5 Casi d'uso

1. **Il numero si abbassa, e la pagina dice perché.** Con un 60/40 di ETF (TER 0,20% e 0,10%) e il bollo attivo,
   la riga «Ipotesi usate» dice «… · costi 0,36% (TER 0,16%, bollo 0,20%)» e il Base del Calcolatore passa
   dall'8,26% al 7,87% (C3).
2. **Bollo spento in Impostazioni.** Chi non ha attivato il bollo nel tile Costi vede solo il TER, e la riga lo dice:
   «costi 0,16% (solo TER; bollo non attivo in Impostazioni › Allocazione)».
3. **Nessun TER inserito.** Un portafoglio senza TER sugli strumenti, con il bollo attivo, paga solo il bollo; la
   riga dice «TER non inseriti negli strumenti».
4. **Un target su una classe che non ho.** Target 10% di Oro senza strumenti d'oro: la classe prende il TER medio
   degli strumenti di `K` e il bollo pieno (RC2).
5. **Un fondo trend-following.** DBMF con TER 0,85%: la classe Trend paga solo il bollo, perché il suo default è già
   netto del TER (D-C2).
6. **Pesi ritoccati nel Monte Carlo.** L'utente porta le azioni all'80%: il costo del portafoglio si ricalcola sugli
   stessi costi per classe e sui pesi della corsa.

### 9.6 Regole di calcolo

Tutte le percentuali sono annue. `K`, le classi e i pesi sono quelli di RK, RP4 e RP5.

**RC1 — Costo di una classe dagli strumenti** (D-C1, D-C2, D-C4). Per ogni classe `i` delle sette, sulle gambe
(`expandAssetExposure`, la stessa lettura di `weightsFromHoldings`) degli strumenti di `K` con quantità > 0, pesate
sul **valore di mercato** della gamba `m` (non sul nozionale: TER e bollo si pagano su ciò che si possiede):

```
TER_i   = Σ m · TER_strumento / Σ m        (strumento senza TER = 0)
          0 per Trend e Carry               (D-C2: i default sono già netti)
quota_i = Σ m soggetta / Σ m               (soggetta = non stampDutyExempt e non conto corrente)
bollo_i = stampDutyEnabled ? stampDutyRate · quota_i : 0
c_i     = TER_i + bollo_i
```

Un conto corrente è la regola di `calculateStampDuty`: `type === 'cash' && assetClass === 'cash' &&
subCategory === checkingAccountSubCategory`; resta fuori dalla quota soggetta (il forfait non entra, D-C4) ma
**dentro** il denominatore.

**RC2 — Classe senza strumenti.** Se `Σ m = 0` per la classe `i` (un target su una classe non detenuta, o i pesi
del Monte Carlo ritoccati a mano): `TER_i` = TER medio degli strumenti di `K` pesato sul valore, Trend e Carry
esclusi dal numeratore e dal denominatore (0 se `K` ha solo Trend e Carry o è vuoto, e per Trend e Carry sempre 0);
`quota_i = 1`, quindi `bollo_i = stampDutyRate` se attivo. Senza strumenti affatto (`K` vuoto, pesi 60/40 di
ripiego): TER 0, bollo pieno se attivo.

**RC3 — Costo del portafoglio** (D-C3, sul capitale). Con i pesi `w_i` in percentuale (che con la leva sommano
`W·100`, `W > 1`):

```
c = Σ_i (w_i / Σ_j w_j) · c_i        // pesi riportati a 100: la leva non moltiplica i costi
```

Il costo del debito resta lo spread di R4 (che per un ETF 2x già include il suo TER, R0 § 2.3).

**RC4 — Dove si applica** (tutti i motori, una volta l'anno, **dopo** il rendimento e prima di risparmio o
prelievo): `fattore netto = (1 + r) · (1 − c/100)`.
- Nei motori stocastici: `portfolioReturn(weights, returns, spread, costPct)` restituisce
  `(1 + r_lordo)(1 − c/100) − 1`; `MonteCarloParams` e `AccumulationSimulationParams` ricevono `annualCostRate`
  (percento, assente = 0 = comportamento di oggi per upstream e per i test esistenti).
- In RP1: `portfolioCompoundReturn(…, costPct)` scala per `(1 − c/100)` la media `M` (quindi `g_p`), e la
  volatilità `√V` con lo stesso fattore; `g_netto = (1 + g_p)(1 − c/100) − 1` esatto. Il reale RP2 si calcola sul
  netto.
- Il pro rata del bollo e il TER che matura ogni giorno sono approssimati da un prelievo a fine anno: lo scarto su
  un anno è il prodotto `r · c`, sotto 0,04 punti con i default.
- **Coerenza**: a volatilità zero `g_netto = (Σ v_i·g_i − leva·sp + 1)(1 − c) − 1`, lo stesso fattore che il
  Ventaglio applica a ogni anno; il test A17 resta valido con i costi accesi (C8).

**RC5 — Obiettivi.** `goalAnnualReturn` usa i costi per classe di RC1–RC2 con i pesi dell'allocazione
dell'obiettivo (riscalati come in D8), quindi RC3 su quei pesi; senza allocazione propria il rendimento è quello
netto del portafoglio target (Base).

**RC6 — Resto di P0.** Il commento di `calculateFIREProjection` descrive il parametro `indexSavings` (default
`false` = risparmio nominale costante, `true` = RP7) invece di «added nominally».

### 9.7 Decisioni

| # | Stato | Decisione | Alternative scartate e motivo |
| --- | --- | --- | --- |
| D-C1 | **Presa** (04/10/2026) | **TER per classe dagli strumenti di `K`**, pesato sul valore di mercato, applicato ai pesi della scheda (target, o quelli della corsa nel Monte Carlo); una classe senza strumenti prende il TER medio del portafoglio (RC2). | (a) Un TER unico del portafoglio: ignora che i target possono differire da ciò che si ha. (c) Un campo TER per classe in Impostazioni › Simulazioni: un input in più da tenere allineato con i TER già scritti negli strumenti. |
| D-C2 | **Presa** (04/10/2026) | **Trend e Carry hanno TER 0 nel modello**: i loro CAGR di default sono già netti (DBMFSIM dello 0,85%, Carry dell'1%). Pagano il bollo. | Togliere il TER anche lì: lo conterebbe due volte. |
| D-C3 | **Presa** (04/10/2026) | **Costi sul capitale** (pesi riportati a 100, RC3), non sull'esposizione. | Sull'esposizione lorda: con un ETF 2x pagherebbe due volte il TER della leva, già dentro lo spread del 2,0%, e il bollo di un ETF 2x si paga sul suo valore, cioè sul capitale. |
| D-C4 | **Presa** (04/10/2026) | **Bollo dalle Impostazioni esistenti** (`stampDutyEnabled`, `stampDutyRate`, `stampDutyExempt`, conto corrente), sulla quota soggetta della classe (RC1); il forfait del conto corrente resta fuori, dichiarato. | Un'aliquota separata per le simulazioni: due fonti per lo stesso fatto. Modellare il forfait: 34,20 € l'anno, trascurabile e legato alla giacenza, non a un rendimento. |
| D-C5 | **Presa** (04/10/2026) | **Costi sempre attivi**, dichiarati nella riga «Ipotesi usate». Chi vuole il lordo spegne il bollo in Impostazioni o non inserisce i TER. | Un interruttore lordo/netto nelle schede: una seconda lettura di ogni numero, e la tentazione di guardare quella più bella. |
| D-C6 | **Presa** (04/10/2026) | **La Proiezione diventa netta di TER e bollo**, resta lorda della tassa sulla vendita: V8 del dossier Monte Carlo § 11 cambia di conseguenza. | Lasciarla lorda: sarebbe l'unica scheda senza costi, con la stessa riga «Ipotesi usate» delle altre. |

**Scelte di default prese dall'agente** (dichiarate, il proprietario può rovesciarle):
- **Prelievo a fine anno, moltiplicativo** (RC4) invece di `r − c`: è la forma esatta per un'imposta sul valore di
  fine periodo e tiene A17 vero per costruzione.
- **Pesatura sul valore di mercato** delle gambe, non sul nozionale (RC1).
- **Nessun campo nuovo** nelle impostazioni: tutto viene da TER degli strumenti e tile Costi.
- Spec nel dossier `doc/fire-ipotesi/` (sezione 9) e non in un dossier a parte: i costi sono un'ipotesi comune a
  tutte le schede, letta da `resolveFireAssumptions`.

### 9.8 Punti aperti

- Nessuno sulle regole. Da ricordare nel testo: chi non ha attivato il bollo (il default di `stampDutyEnabled` è
  `false`) non vede bollo nelle simulazioni; la riga lo dice e rimanda al tile Costi (caso d'uso 2).

### 9.9 Criteri di accettazione (valori di riferimento verificabili)

Default di Impostazioni › Simulazioni (dossier Monte Carlo § 2.3), bollo attivo allo 0,2% salvo dove indicato.
Tolleranza delle formule chiuse: ± 0,0001 punti percentuali. Portafoglio di prova **P**: ETF azionario 100.000 €
(TER 0,20%), ETF obbligazionario 50.000 € (TER 0,10%), conto corrente 20.000 € (sottocategoria dei conti correnti),
conto deposito 10.000 € (cash, altra sottocategoria, nessun TER).

| # | Caso | Valore atteso |
| --- | --- | --- |
| C1 | RC1 su P | Azioni 0,40% (0,20 + 0,20); Obbligazioni 0,30% (0,10 + 0,20); Liquidità 0,066667% (TER 0; quota soggetta 10.000/30.000 → 0,2·⅓) |
| C2 | RC2 su P, classe Oro senza strumenti | TER medio (100.000·0,20 + 50.000·0,10 + 30.000·0)/180.000 = 0,138889%; costo Oro 0,338889% |
| C3 | RC3 + RC4 su P, pesi 60/40 (A3) | c = 0,36%; Orso 5,5854%, Base 7,8726%, Toro 10,6856% (lordi A3: 5,9669 / 8,2623 / 11,0855) |
| C4 | RP2 su C3 (π = 3,04%) | reale Orso 2,4703%, Base 4,6900%, Toro 7,4200% |
| C5 | C3 con il bollo spento | c = 0,6·0,20 + 0,4·0,10 = 0,16%; Base 8,0891% |
| C6 | Leva, pesi A6 (Azioni 90%, Obbligazioni 60%), costi di P | c = 0,36% (pesi riportati a 60/40, D-C3); Base (1,092298 · 0,9964) − 1 = 8,8366% |
| C7 | Trend: strumento DBMF 20.000 € con TER 0,85% | costo Trend 0,20% (solo bollo, D-C2) |
| C8 | Coerenza: volatilità 0, target A2 (60/40), costi di P | `g_netto` = (1,07824 · 0,9964) − 1 = 7,4358%; il Ventaglio coincide, float per float, con la curva Base di `calculateFIREProjection` (A17 con i costi) |
| C9 | Monte Carlo, volatilità 0, Azioni 100% (Base), costo 0,40%, capitale 100.000 €, nessun prelievo, 1 anno | 100.000 · 1,1002 · 0,996 = 109.579,92 € |
| C10 | Obiettivo con allocazione Azioni 80% + Obbligazioni 20%, costi di P | c = 0,8·0,40 + 0,2·0,30 = 0,38%; rendimento (1,092079 · 0,9962) − 1 = 8,7929% (lordo A14: 9,2079%) |
| C11 | `annualCostRate` assente | ogni motore dà gli stessi numeri di oggi (i test esistenti restano verdi senza modifiche) |
| C12 | Riga «Ipotesi usate» su P | contiene «costi 0,36% (TER 0,16%, bollo 0,20%)»; bollo spento: «costi 0,16% (solo TER; bollo non attivo in Impostazioni › Allocazione)»; nessun TER: «TER non inseriti negli strumenti» |

I TER e i bolli «del portafoglio» della riga sono le somme pesate di RC3 separate per componente:
`TER = Σ u_i·TER_i`, `bollo = Σ u_i·bollo_i` (su P con 60/40: 0,16% e 0,20%).

### 9.10 Task C1 — Costi ricorrenti in tutti i motori (thread «impl», Sonnet 5.5)

Branch da `main`, PR in bozza verso `Ciocc128/net-worth-tracker:main`.

**Cosa vede l'utente**
- La riga «Ipotesi usate» di Calcolatore, Coast, What If, Monte Carlo, Proiezione e Obiettivi aggiunge i costi
  (C12), con il link al tile Costi quando il bollo è spento.
- I tassi di Orso, Base e Toro (Parametri del Calcolatore, Scenari, Coast, What If) sono netti di costi; il «Come si
  calcola» del Calcolatore e del Monte Carlo dice la regola in una frase («ogni anno, dopo il rendimento, si toglie lo
  0,36% del capitale: TER degli strumenti e bollo»).
- Impostazioni › Simulazioni: la riga «Il portafoglio target rende» mostra i tassi netti e dice «al netto di costi
  0,36%».
- Proiezione: il footer del Ventaglio e il Dettaglio passano da «Valori lordi: niente tasse sulla vendita, TER né
  bollo» a «Al netto di TER e bollo (0,36% l'anno); lordi della tassa sulla vendita».

**Dettagli tecnici**
1. Nuovo modulo puro `lib/utils/fireCosts.ts`:
   ```ts
   export interface ClassCost { ter: number; stampDuty: number; total: number; held: boolean } // percent
   export interface FireCosts {
     byClass: Record<MonteCarloClass, ClassCost>;
     stampDutyEnabled: boolean;
     stampDutyRate: number;
     anyTer: boolean;          // at least one instrument of K carries a TER
   }
   export function resolveClassCosts(assets, valueOf, settings: Pick<AssetAllocationSettings,'stampDutyEnabled'|'stampDutyRate'|'checkingAccountSubCategory'>, options: { lockedAssetIds?; goldSubCategory? }): FireCosts // RC1, RC2
   export function portfolioCost(weightsPct, costs: FireCosts): { total: number; ter: number; stampDuty: number } // RC3
   ```
   Le gambe con `expandAssetExposure` e la regola RG dell'oro, come `collectLegs` di `monteCarloWeights.ts` (se
   serve, esportare quella funzione invece di copiarla). La regola del conto corrente riusa la stessa condizione di
   `calculateStampDuty`: estrarla in una funzione `isCheckingAccount(asset, subCategory)` in
   `lib/constants/stampDuty.ts` o accanto, e usarla da entrambi.
2. `lib/utils/monteCarloDraw.ts`: `portfolioReturn(weightsPct, returns, leverageSpreadPct = 0, costPct = 0)` (RC4).
3. `lib/services/monteCarloService.ts`: `annualCostRate?: number` in `MonteCarloParams` (`types/assets.ts`) e in
   `AccumulationSimulationParams`, passato a `portfolioReturn` (C9, C11).
4. `lib/utils/fireAssumptions.ts`: `portfolioCompoundReturn(…, costPct = 0)`; `FireAssumptions.costs?: FireCosts` e
   `cost?: { total; ter; stampDuty }` (dei pesi della pagina); `buildPortfolioScenarios` applica il costo;
   `resolveFireAssumptions` riceve `stampDutyEnabled`, `stampDutyRate`, `checkingAccountSubCategory` nelle
   `settings` e calcola i costi solo quando ha `assetValue` (come `capital`).
5. Le schede passano il costo ai motori stocastici: `FireCalculatorTab.tsx` (Ventaglio, `annualCostRate:
   assumptions.cost.total`), `MonteCarloTab.tsx` (il costo dei pesi **della corsa**: `portfolioCost(params.weights,
   assumptions.costs)`, ricalcolato quando l'utente li ritocca), `ProjectionTab.tsx` (idem sui pesi della corsa).
   Calcolatore, Coast, What If e matrice prendono già `assumptions.scenarios`: nessuna modifica oltre alla riga.
6. `lib/utils/goalTrajectory.ts`: `GoalAssumptions` include `costs`; `goalAnnualReturn` applica RC5 (C10).
   Il server dell'Assistente, che calcola le ipotesi con la stessa funzione, passa gli stessi campi.
7. `lib/utils/fireAssumptionsNarrative.ts`: il segmento dei costi (C12); `components/settings/MonteCarloMarketTile.tsx`:
   la riga netta (riceve le impostazioni del bollo dalla pagina).
8. Proiezione: il testo «Valori lordi…» di `lib/utils/projectionNarrative.ts` (footer e Dettaglio).
9. RC6: il commento di `fireService.ts:1458`.

**File** — Nuovi: `lib/utils/fireCosts.ts`, `__tests__/fireCosts.test.ts`. Modificati: `lib/utils/monteCarloDraw.ts`,
`lib/services/monteCarloService.ts`, `types/assets.ts`, `lib/utils/fireAssumptions.ts`,
`lib/utils/fireAssumptionsNarrative.ts`, `lib/hooks/useFireAssumptions.ts`, `lib/utils/goalTrajectory.ts`,
`components/fire-simulations/{FireCalculatorTab,MonteCarloTab,ProjectionTab}.tsx`,
`components/settings/MonteCarloMarketTile.tsx`, `lib/services/assetService.ts` (solo l'estrazione di
`isCheckingAccount`), `lib/services/fireService.ts` (commento), i consumatori server delle ipotesi se cambiano firma.

**Test**
- `fireCosts.test.ts`: C1, C2, C5 (solo TER), C7, RC2 con `K` vuoto, un composito (gambe pesate), un ETF a leva
  (pesato sul valore di mercato, non sul nozionale).
- `fireAssumptions.test.ts`: C3, C4, C6, C8 (forma chiusa); A1–A10 invariati con costo 0.
- `monteCarloService.test.ts`: C9; C8 come coerenza Ventaglio = curva Base con i costi; C11 (stessi numeri senza
  `annualCostRate`, stesso seme).
- `goalTrajectory.test.ts`: C10. `fireAssumptionsNarrative.test.ts`: le tre letture di C12.

**Documentazione** (stessa PR): `doc/guide/fire.md` § FIRE, What If and Goals (RC1–RC6, «i costi sono UNA lettura»),
`fire-monte-carlo.md`, `fire-proiezione.md` (V8 cambia: netto di TER e bollo), `fire-coast.md`, `fire-what-if.md`,
`fire-obiettivi.md` per la riga; `doc/montecarlo/README.md` § 11 V8 e il testo del footer (una nota «cambiata da
P6, doc/fire-ipotesi § 9»); `doc/guide/impostazioni.md` (il tile Costi è letto anche dalle simulazioni);
`doc/guide/fork-scelte-ui.md`, `CLAUDE.md` («Latest», riga FIRE), `Draft Release Temp.md` (WORKFLOW.md § Where
things are recorded).

**Criterio di fine**: C1–C12 verdi; `npx tsc --noEmit`, `npx eslint app components lib types e2e scripts __tests__`,
`TZ=Europe/Rome npx vitest run` verdi; nessun motore che chiama `portfolioReturn` o `portfolioCompoundReturn` senza
passare il costo, salvo i test e i chiamanti di upstream. Collaudo sull'anteprima Vercel (WORKFLOW.md § 2): la riga
dei costi in sei schede, il Base che scende, la Proiezione che non dice più «lordi».

**Rischi**
| Rischio | Mitigazione |
| --- | --- |
| Merge con upstream su `monteCarloDraw.ts`, `monteCarloService.ts`, `types/assets.ts`. | parametri opzionali con default neutro (C11); logica nuova in `fireCosts.ts`. |
| Chi ha il bollo spento (default) non vede differenza e pensa che non ci sia. | La riga lo dice e rimanda al tile Costi (C12). |
| TER mancanti sugli strumenti sottostimano i costi. | La riga dice «TER non inseriti negli strumenti» quando nessuno strumento ne ha. |
