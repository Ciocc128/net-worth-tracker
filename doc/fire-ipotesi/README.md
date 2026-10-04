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
> della spec lo stesso giorno. La § 9 (P6, costi ricorrenti, task C1) è stata aggiunta il 04/10/2026, la § 10 (P1 spesa sostenibile e P2 età
> obiettivo, task S1 ed E1) lo stesso giorno, la § 11 (patrimonio e portafoglio, task K1) lo stesso giorno: sostituisce RP5.

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
  sono poi entrati in questo dossier come § 9 (task C1, 04/10/2026); spesa sostenibile ed età obiettivo (P1, P2) come
  § 10 (task S1, E1).
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

**RP5 — Capitale** (D4; **sostituita da RK1–RK4, § 11**): `K` di RK (`computeSimulatedCapital`), al netto dei fondi pensione bloccati, per
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
| 5 | S1 spesa sostenibile nel Monte Carlo (§ 10.9) | C1 unita | S1–S10 verdi (§ 10.8) |
| 6 | E1 età obiettivo e SWR personale nel Calcolatore (§ 10.10) | S1 unita | E1–E6, S11, S12 verdi (§ 10.8) |

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

---

## 10. P1 + P2 — Quanto posso spendere, e cosa serve per smettere a un'età scelta (task S1, E1)

> Origine: analisi `/mnt/project-files/fire-simulazioni/analisi-fire-simulazioni.md` § 5 (P1, P2) e § 6 (sequenza).
> Spec scritta il 04/10/2026 su `main` al commit `be21551` (merge della PR #47, C1 costi ricorrenti); decisioni
> D-S1–D-S4 e D-E1–D-E3 confermate dal proprietario nel thread della spec lo stesso giorno (piano:
> `/mnt/project-files/fire-simulazioni/piano-p1-p2.md`). Valgono RP1–RP7 (§ 1.5) e RC1–RC6 (§ 9.6): questa sezione
> le **legge**, non ne scrive di nuove. Valori di riferimento: `/mnt/project-files/fire-simulazioni/p1p2-controllo.py`.
>
> Letture obbligatorie, oltre a § 0: `doc/guide/fire.md` § FIRE, What If and Goals (il motore del Ventaglio, la leva
> sul risparmio `solveSavingsForTail`, «Year 0 is a year») e § Calcolatore; `doc/guide/fire-monte-carlo.md` per
> intero (seme, `failRun`, Stale-Run); DESIGN.md: The Verdict-First Rule, The Stale-Run Rule, The Narrative Honesty
> Rule, The Risk-vs-Fact Rule, The Input Tile Rule, The Comma Rule.

### 10.1 Obiettivo

Due domande che oggi nessuna scheda risolve, entrambe l'**inverso** di una domanda a cui la pagina già risponde:

- **P1, «quanto posso spendere?»** Il Monte Carlo dice «con questo prelievo, in quante simulazioni su cento i soldi
  durano». Dopo S1 dice anche «per durare in 9 simulazioni su 10, puoi prelevare al massimo X € l'anno di oggi», e il
  Calcolatore propone un **SWR personale** al posto del 4% convenzionale.
- **P2, «voglio smettere a 50 anni: cosa serve?»** Il Calcolatore dice in che anno si arriva al FIRE. Dopo E1 dice,
  per un'età scelta, quanto risparmio serve (nel Base e in 9 percorsi su 10) e quanto si potrà spendere al massimo con
  il risparmio di oggi.

### 10.2 Stato di partenza (verificato nel codice, 04/10/2026)

| Fatto | Dove |
| --- | --- |
| Il Monte Carlo prende il prelievo come input (seminato con la spesa del piano, RP6) e restituisce la probabilità di successo | `MonteCarloTab.tsx:254`, `lib/services/monteCarloService.ts:206` (`runMonteCarloSimulation`) |
| Per ogni percorso e anno: afflusso → rendimento (`portfolioReturn` con leva e costi) → prelievo indicizzato, netto delle pensioni, lordo della tassa (`withdrawGross`); il percorso fallisce se il capitale va a ≤ 0 dopo il rendimento (leva) o dopo il prelievo | `monteCarloService.ts:47-135` (`runSingleSimulation`) |
| **Il fattore di rendimento di un percorso in un anno non dipende dal prelievo**: dipende solo dal seme, dai pesi, dal mercato, dallo spread e dal costo | stesso file, `drawYear` + `portfolioReturn` prima del prelievo |
| Un percorso fallito continua a estrarre fino all'orizzonte (`failRun`): ogni percorso consuma `7 × 2 × anni` uniformi | stesso file, `failRun` |
| Il prelievo del primo anno è già rivalutato: anno `t` = `W · (1 + π)^t`, con `t` da 1 | stesso file, `withdrawal *= Math.pow(1 + π, year)` |
| La leva sul risparmio è una bisezione su esecuzioni seminate del Ventaglio, generica sull'anno bersaglio (`targetYears`), oggi sempre l'anno del base | `lib/utils/fireDistribution.ts:167` (`solveSavingsForTail`), `FireCalculatorTab.tsx:545-555` |
| Un'età obiettivo esiste: `coastFireRetirementAge` (default 60), scritta da Coast › Ipotesi e letta anche da What If; l'età attuale `userAge` si scrive in Coast › Ipotesi | `types/assets.ts:351`, `lib/hooks/useCoastFireSettingsDraft.ts:50,73-74,284`, `WhatIfAnalysisTab.tsx:267` |
| L'SWR è un input dei Parametri del Calcolatore (`settings.withdrawalRate`, 4% di default), un'anteprima fino a «Salva» | `components/fire-simulations/FireParametri.tsx:95-160` |
| Il cammino deterministico: `NW_t = NW_{t−1}·(1 + g) + S·(1 + π)^{t−1}` (RP7), FIRE all'anno `t` se `NW_t ≥ requisito_t` (`resolveFireRequirement`: spesa inflazionata ÷ SWR, ponte, pensioni, tassa); l'anno 0 è un anno | `lib/services/fireService.ts:1590-1720` |
| Griglia del Calcolatore: Traguardo 5×2 · Base di calcolo 7 · Reddito passivo 4 · Scenari 3; del Monte Carlo: Probabilità 5 · Distribuzione 4 · Scenari 3 · Parametri 12 | `FireCalculatorTab.tsx:166-169`, `MonteCarloTab.tsx:415-461` |

### 10.3 Perimetro

**Incluso**
- **S1 (Monte Carlo)**: la spesa sostenibile a 80, 90 e 95% per Orso, Base e Toro, sugli **stessi percorsi**
  dell'esecuzione mostrata (stesso piano: capitale, orizzonte, pesi, leva, costi, fondi pensione, pensioni di Stato,
  tassa sul prelievo); un tile nuovo «Spesa sostenibile» e una frase nel verdetto (D-S1–D-S3).
- **S1 (motore)**: l'estrazione dei fattori separata dal registro dei prelievi, così il prelievo si **rigioca** senza
  rieseguire l'estrazione (RS1, RS2), e un risolutore puro (RS3).
- **E1 (Calcolatore)**: un tile nuovo «Età obiettivo» con tre cifre (D-E2, D-E3), il campo «Età obiettivo» nei
  Parametri (D-E1), l'**SWR personale** proposto accanto all'SWR con un bottone «Usa» (D-S4, RS5).

**Escluso**
- Accumulo **seguito** da decumulo nello stesso Monte Carlo («smetto a 50 anni e prelevo fino a 90»): è il resto di
  P7 (§ 11.10 del dossier Monte Carlo). P2 qui risponde con il cammino deterministico e con il Ventaglio, che si
  ferma all'anno FIRE di ogni percorso.
- Prelievi dinamici (P3): la spesa sostenibile resta un importo fisso rivalutato con l'inflazione.
- Una probabilità scritta dall'utente (D-S2): i tre livelli sono fissi.
- Sostituire l'SWR in automatico (D-S4).
- Due età (famiglia, P11): resta una sola età obiettivo.
- Cambiare la leva sul risparmio della Distribuzione: continua a mirare all'anno del base.
- Spec Playwright: nessuna nuova; si aggiornano solo i locator se una spec esistente conta i tile.

### 10.4 Casi d'uso

1. **Quanto posso prelevare.** Un milione in un 60/40, 30 anni, ipotesi di default: il Monte Carlo, oltre alla
   probabilità del prelievo scritto, dice «Per restare al 90% puoi prelevare fino a 43.300 € l'anno di oggi, il 4,3%
   del capitale» (Base, senza costi; valore indicativo di § 10.8, S4).
2. **Prelievo troppo alto.** Con 50.000 € scritti la probabilità è sotto il 90%: il verdetto aggiunge «Per tornare al
   90% il prelievo dovrebbe scendere a 43.300 €».
3. **Scenari e prudenza.** Il tile mostra le nove cifre (Orso, Base, Toro × 80, 90, 95%): chi vuole il 95% nell'Orso
   legge 30.100 €.
4. **Leva che rovina.** Con una leva tale che più del 10% dei percorsi si azzeri per la leva, al 90% nessun prelievo
   basta: la cella dice «nessun prelievo» e la frase lo spiega (la rovina da leva non dipende dal prelievo).
5. **SWR personale.** Nei Parametri del Calcolatore, sotto l'SWR 4%: «SWR personale 4,3%: 9 simulazioni su 10
   reggono 30 anni di prelievi (portafoglio target, scenario Base, costi compresi). Usa». «Usa» scrive 4,3 nel campo
   (anteprima, poi «Salva»).
6. **Smettere a 50 anni.** Età 35, età obiettivo 50 (2041): il tile «Età obiettivo» dice «Per smettere a 50 anni,
   nel 2041, servono 26.000 € di risparmio l'anno (oggi 18.000 €); perché ci arrivino 9 percorsi su 10, 34.500 €. Con
   il risparmio di oggi la spesa del piano potrebbe essere al massimo 21.100 €.» (cifre di esempio).
7. **Già in rotta.** Al ritmo di oggi il FIRE è nel 2038, prima dell'età obiettivo: «Ci arrivi già nel 2038; per
   smettere a 50 anni basterebbero 14.000 € l'anno.»
8. **Coast.** Il capitale di oggi basta da solo: «Il capitale di oggi basta: anche senza risparmiare arrivi al FIRE a
   50 anni (è il tuo Coast FIRE).»

### 10.5 Regole di calcolo

**RS1 — I fattori del piano** (S1). Per uno scenario e un piano, la matrice `f[i][t]` (percorso `i = 1…n`, anno
`t = 1…N`) è il fattore lordo del capitale nell'anno, **prima** di afflussi e prelievi:

```
f[i][t] = 1 + portfolioReturn(pesi, drawYear(plan, random), spread, costo)      // R3/R4 e RC4, come oggi
```

con lo stesso seme (`MONTE_CARLO_SEED`, un generatore nuovo per scenario), nello **stesso ordine** di estrazione di
oggi (percorso per percorso, anno per anno, tutti gli anni anche dopo un fallimento). `f ≤ 0` = rovina da leva.

**RS2 — Il registro dei prelievi** (S1). Per un prelievo `W` (euro di oggi), sul percorso `i`:

```
V_0 = K + Σ afflussi con anno ≤ 0;           B_0 = base fiscale di oggi + Σ afflussi con anno ≤ 0
per t = 1…N:
  V += afflussi dell'anno t;  B += afflussi dell'anno t
  V *= f[i][t];                               se V ≤ 0: fallito (leva)
  netto = max(0, W·(1+π)^t − P_t)             // P_t = pensioni di Stato attive, indicizzate come oggi
  lordo = tassa ? withdrawGross(V, B, netto, τ) : netto   (B aggiornata)
  V -= lordo;                                 se V ≤ 0: fallito (prelievi)
```

È **esattamente** il ciclo di `runSingleSimulation`. Si estrae in una funzione sola che `runSingleSimulation` stessa
chiama dopo aver estratto i fattori del percorso (RS1): così il conteggio dei successi rigiocato a `W` coincide float
per float con `runMonteCarloSimulation` a `W` sullo stesso seme (criterio S5). `success(W)` = percorsi che arrivano a
`N` / `n`.

**RS3 — Spesa sostenibile a probabilità `p`** (S1). `W_p` = il più grande multiplo di 100 € con `success(W) ≥ p`:
- se `success(0) < p` (rovina da leva oltre `1 − p`): **nessun prelievo** basta, `W_p = null`;
- altrimenti bisezione su `[0, W_alto]`, con `W_alto` raddoppiato da `K` finché `success(W_alto) < p`; si ferma a un
  intervallo ≤ 1 €, arrotonda **per difetto** a 100 € e **riverifica** (scende di 100 € finché `success < p`): la
  cifra stampata rispetta la soglia.
- **SWR del piano** = `W_p / K`, con `K` il capitale di partenza della corsa (il campo «Capitale»).
- `success(W)` è non crescente in `W` (più prelievo non salva nessun percorso: senza tassa è vero per induzione su
  RS2; con la tassa la quota di plusvalenza non dipende dal prelievo salvo gli afflussi, scarto trascurabile) e la
  riverifica protegge la cifra stampata anche dove la monotonia vacillasse.
- **Forma chiusa di controllo** (solo test, senza tassa, pensioni e afflussi): `W_i* = K / Σ_{s=1…N} (1+π)^s / Π_{u≤s} f[i][u]`
  (0 se il percorso ha un `f ≤ 0`); il percorso regge `W` se e solo se `W < W_i*`.

**RS4 — Le nove cifre** (S1). `p ∈ {80%, 90%, 95%}` × Orso, Base, Toro, sulle tre matrici della corsa. Il verdetto e
l'eroe del tile leggono Base 90%. Le cifre appartengono all'**ultima esecuzione** (The Stale-Run Rule): un piano
modificato non le ricalcola finché non si preme «Esegui». La corsa senza leva di confronto (`unleveragedBase`) non ha
spesa sostenibile.

**RS5 — SWR personale del Calcolatore** (E1, D-S4). RS1–RS3 su un piano **puro**: `K = 1`, nessun afflusso, nessuna
pensione, nessuna tassa (il numero FIRE li conta già a parte: metterli qui li conterebbe due volte), pesi
`assumptions.weights` (RP4), mercato Base, correlazioni e spread di Impostazioni, costo `assumptions.cost.total` (RC4),
`n = 10.000`, `MONTE_CARLO_SEED`, `p = 90%`, orizzonte `N = clamp(90 − età obiettivo, 10, 60)` (età obiettivo
salvata o 60 di default). Il risultato è un **tasso**: senza afflussi né tasse `success` dipende solo da `W/K`, quindi
`K = 1` dà l'SWR del piano per qualunque capitale. Si arrotonda **per difetto a 0,1 punti** (RS3 con passo 0,001 su
`K = 1`).

**RS6 — Anni all'età obiettivo** (E1). `T = età obiettivo − userAge` (interi, come l'età in Coast). Senza `userAge`
nessuna cifra (il tile dice dove si scrive); con `T ≤ 0` «età obiettivo già raggiunta o passata», nessuna cifra. Anno
di calendario = anno di oggi + `T`.

**RS7 — Risparmio richiesto nel Base** (E1). `S_req` = il più piccolo multiplo di 100 € con
`calculateFIREProjection(K, spesa, S, SWR, scenari, 50, ponte, honest, true).baseYearsToFIRE ≤ T` (gli stessi
argomenti del Calcolatore, solo il risparmio cambia). Bisezione su `[0, S_max]`, `S_max = 20 × spesa del piano`;
arrotondamento **per eccesso** e riverifica. Casi: `baseYearsToFIRE ≤ T` già con `S = 0` → `S_req = 0` («il capitale di
oggi basta», Coast); oltre `S_max` → `null` («più di X € l'anno»). `S_req` può essere minore del risparmio di oggi
(caso d'uso 7). Il risparmio dell'anno `t` è `S_req·(1+π)^{t−1}` (RP7), quindi `S_req` è in euro di oggi.

**RS8 — Risparmio perché 9 percorsi su 10 arrivino** (E1). `solveSavingsForTail` **così com'è**, con
`targetYears = T`, `percentile = 0,9`, `extraCap = resolveLeverCap(…)`, lo stesso `runFan` della Distribuzione (stesso
seme, stessi obiettivi `fireTargets`). Risultato = risparmio di oggi + `extraAnnualSavings`; `0` extra = «9 percorsi su
10 ci arrivano già con il risparmio di oggi»; `null` = «nemmeno con +X € l'anno». Non scende sotto il risparmio di oggi
(la leva cerca solo extra positivi; dichiarato).

**RS9 — Spesa del piano massima** (E1). `E_max` = il più grande multiplo di 100 € con `baseYearsToFIRE ≤ T` nel
cammino di RS7 a risparmio di oggi, cambiando **solo** la spesa (il risparmio resta quello del Cashflow: la spesa del
piano è quella da pensionati, RP6). Bisezione su `[0, E_alto]` con `E_alto` raddoppiato dalla spesa del piano finché
non è raggiungibile; arrotondamento **per difetto** e riverifica. In euro di oggi.

### 10.6 Cosa vede l'utente

**Monte Carlo (S1)**
- **Verdetto**: dopo la frase sulla probabilità, una frase sulla spesa sostenibile Base 90%, nella forma che serve:
  - prelievo scritto ≤ `W_90`: «Per restare al 90% potresti prelevare fino a 43.300 € l'anno di oggi (3.608 € al
    mese), il 4,3% del capitale.»
  - prelievo scritto > `W_90`: «Per tornare al 90% il prelievo dovrebbe scendere a 43.300 € l'anno di oggi (il 4,3%
    del capitale).»
  - `W_90 = null`: «Con questa leva nessun prelievo arriva al 90%: in più di una simulazione su dieci la leva azzera il
    capitale da sola.»
  Nessun tono sulla frase (è una proposta, non un giudizio: il tono resta quello della probabilità).
- **Tile «Spesa sostenibile»** (`ariaLabel` «Spesa sostenibile»): eroe = `W_90` Base l'anno, con il mensile e l'SWR
  del piano accanto; sotto, una tabella 3 × 3 (righe 80 / 90 / 95%, colonne Orso / Base / Toro con lo swatch di
  `SCENARIO_SLOT`), cifre in euro di oggi l'anno, «nessun prelievo» dove `null`. Lettura: «In 9 simulazioni su 10 il
  capitale regge 30 anni prelevando fino a 43.300 € l'anno di oggi; nell'orso 33.700 €.» Footer: «Prelievo fisso
  rivalutato con l'inflazione, sugli stessi percorsi della simulazione: capitale, pesi, pensioni e tasse del piano.»
  «Come si calcola» (`TileMethodNote`): RS1–RS3 a parole, il seme fisso («la cifra è stabile, non esatta: con 10.000
  simulazioni un altro seme la sposterebbe di circa l'1–2%»), l'arrotondamento per difetto a 100 €.
- **Griglia**: desktop Probabilità 5 · Distribuzione 4 · Scenari 3, poi **Spesa sostenibile 12** (eroe a sinistra,
  tabella a destra con una container query; a telefono una sotto l'altra), poi Parametri 12. Telefono e tablet:
  Probabilità → Spesa sostenibile → Distribuzione → Scenari → Parametri. Lo skeleton aggiunge la cella.

**Calcolatore (E1)**
- **Parametri › Impostazioni**: il campo **«Età obiettivo»** (scrive `coastFireRetirementAge`, la stessa di Coast e
  What If, con la stessa validazione di Coast: intero, maggiore dell'età attuale, al massimo 100), anteprima fino a
  «Salva» come gli altri campi; help: «La stessa di Coast FIRE: a che età vuoi smettere».
- **Parametri › SWR personale** (sotto il campo SWR): «SWR personale 4,3%: 9 simulazioni su 10 reggono 30 anni di
  prelievi (portafoglio target, scenario Base, costi compresi).» e il bottone **«Usa 4,3%»**, che scrive il valore nel
  campo SWR (anteprima). Assente se l'SWR digitato è già uguale. Calcolato solo quando i Parametri sono aperti (come il
  Ventaglio solo quando è aperto), memoizzato su pesi, mercato, costo e orizzonte.
- **Tile «Età obiettivo»** (`ariaLabel` «Età obiettivo»), desktop una terza riga a 12 colonne con le tre cifre
  affiancate (RS7, RS8, RS9), ognuna con la sua didascalia («nel base», «9 percorsi su 10», «spesa massima del piano»)
  e il riferimento di oggi («oggi 18.000 €», «oggi 32.000 €»). Lettura come nei casi d'uso 6–8; senza età: «Serve la
  tua età: scrivila in Coast FIRE › Ipotesi.» (link `?tab=coast`); FIRE già raggiunto oggi: «Sei già FIRE: l'età
  obiettivo non serve.» e nessuna cifra. La cifra RS8 costa ~14 esecuzioni del Ventaglio (< 100 ms, come la leva): si
  calcola con il tile, memoizzata sugli input del Ventaglio; se misurata sopra 150 ms, si calcola su `useDeferredValue`
  degli input (la misura va nella guida). Telefono: Traguardo → Scenari → Età obiettivo → Reddito → Base.
  «Come si calcola»: RS6–RS9 a parole (cammino del Base, stesso numero FIRE, risparmio che cresce con l'inflazione,
  arrotondamenti).

### 10.7 Decisioni

| # | Stato | Decisione | Alternative scartate e motivo |
| --- | --- | --- | --- |
| D-S1 | **Presa** (04/10/2026) | **Spesa sostenibile in un tile nuovo del Monte Carlo**, sugli stessi percorsi dell'esecuzione, più una frase nel verdetto. | Una modalità «quanto posso spendere» del Monte Carlo: due domande nello stesso verdetto. Una scheda nuova: duplicherebbe tutto il piano. |
| D-S2 | **Presa** (04/10/2026) | **Tre livelli fissi, 80 / 90 / 95%**, verdetto sul 90% (la soglia del tono positivo, `resolveSuccessTone`). | Un campo libero: un input in più e un verdetto che cambia con un numero scritto. Solo il 90%: nasconde quanto costa la prudenza. |
| D-S3 | **Presa** (04/10/2026) | **Orso, Base e Toro** nel tile, Base nel verdetto. | Solo Base: «e se va male?» è la domanda di chi decide quanto spendere. |
| D-S4 | **Presa** (04/10/2026) | **SWR personale proposto, non imposto**: accanto all'SWR del Calcolatore con «Usa»; SWR **puro** (senza pensioni e tasse), pesi della pagina, Base, orizzonte 90 − età obiettivo (RS5). | Solo nel Monte Carlo: il Calcolatore resterebbe sul 4% convenzionale. Sostituire il 4% in automatico: il numero FIRE cambierebbe da solo a ogni ritocco delle ipotesi, senza che l'utente l'abbia scelto. |
| D-E1 | **Presa** (04/10/2026) | **Età obiettivo = `coastFireRetirementAge`**, una sola per la pagina, scrivibile anche dai Parametri del Calcolatore. | Un campo nuovo solo per il Calcolatore: due età obiettivo sulla stessa pagina. |
| D-E2 | **Presa** (04/10/2026) | **Tre cifre**: risparmio richiesto nel Base (RS7), risparmio perché 9 percorsi su 10 arrivino (RS8), spesa del piano massima ai risparmi di oggi (RS9). | Solo il risparmio: non risponde a «quanto potrò spendere se smetto a 50 anni». |
| D-E3 | **Presa** (04/10/2026) | **Un tile nuovo «Età obiettivo» nel Calcolatore.** | Dentro il Traguardo (già pieno, tre viste). In Coast: risponde a un'altra domanda, «posso smettere di versare?». |

**Scelte di default prese dall'agente** (dichiarate nel piano, accettate con le decisioni il 04/10/2026):
- **Estrarre una volta e rigiocare il prelievo** (RS1–RS2) invece di rieseguire il Monte Carlo per ogni passo della
  bisezione: le nove cifre costano meno di un «Esegui» e coincidono per costruzione con l'esecuzione mostrata.
- **Arrotondamenti**: spesa sostenibile e spesa massima per difetto a 100 €, risparmio richiesto per eccesso a 100 €,
  SWR personale per difetto a 0,1 punti; ogni cifra riverificata dopo l'arrotondamento.
- **La leva della Distribuzione resta sull'anno del base**: la versione «all'età scelta» è RS8 nel tile nuovo.
- **Senza età** il tile «Età obiettivo» rimanda a Coast › Ipotesi, come le pensioni; l'SWR personale usa 60 anni di
  età obiettivo di default (orizzonte 30).
- **Rovina da leva oltre `1 − p`** = «nessun prelievo» in quella cella, spiegato nel verdetto.
- Spec nel dossier `doc/fire-ipotesi/` (§ 10): entrambe leggono `resolveFireAssumptions`; il motore toccato è del
  Monte Carlo, ma senza regole nuove di estrazione.

### 10.8 Criteri di accettazione (valori di riferimento verificabili)

Default di Impostazioni › Simulazioni (dossier Monte Carlo § 2.3, inflazione 3,04%), costo 0, nessuna pensione, tassa,
afflusso, salvo dove indicato. «Volatilità 0» = tutte le classi con volatilità 0 (R1 restituisce il CAGR esatto).

| # | Caso | Valore atteso |
| --- | --- | --- |
| S1 | RS3, volatilità 0, Azioni 100% (g = 10,02%), K = 1.000.000 €, N = 30 | `W*` = K / Σ_{s=1}^{30} (1,0304/1,1002)^s = 78.765,23 €; `W_p` = 78.700 € per ogni `p`; `success(78.700)` = 100%, `success(78.800)` = 0% |
| S2 | S1 con costo 0,40% (RC4) | `W*` = 75.366,34 €; `W_p` = 75.300 € |
| S3 | S1 con N = 40 | `W*` = 73.049,34 €; `W_p` = 73.000 € |
| S4 | RS3 seminato (10.000 percorsi, `MONTE_CARLO_SEED`), K = 1.000.000 €, N = 30; Azioni 60% + Obbligazioni 40% | Base 80 / 90 / 95%: 49.800 / 43.300 / 38.500 €; Orso 38.500 / 33.700 / 30.100 €; Toro 66.100 / 57.500 / 51.100 € — ogni cifra entro ± 2% (riferimento a 400.000 percorsi; a 10.000 l'errore di campionamento misurato è ± 800 € sul Base 90%) |
| S5 | Coerenza: per S4 Base 90%, `runMonteCarloSimulation` con `annualWithdrawal = W_90` e con `W_90 + 100`, stesso seme | successo ≥ 90% e < 90% rispettivamente; e `success(W)` rigiocato = `successRate` dell'esecuzione per ogni `W` provato, esattamente |
| S6 | Forma chiusa: matrice `f` scritta a mano (10 percorsi × 5 anni, nessun `f ≤ 0`), K = 1.000 € | `success(W)` = quota dei percorsi con `W < W_i*` di RS3, per una griglia di `W` |
| S7 | Pensioni, volatilità 0: Azioni g = 5%, π = 2%, K = 500.000 €, N = 30, pensione netta 10.000 € l'anno di oggi da `fromYear` 11 | `W_p` = 30.900 € (esatto 30.984,03); senza pensione 25.300 € (esatto 25.316,04) |
| S8 | Tassa, volatilità 0: come S7 senza pensione, base fiscale 250.000 € (plusvalenza 50%), τ = 26% | `W_p` = 20.500 € (esatto 20.569,57) |
| S9 | Leva: matrice `f` con 2 percorsi su 10 che hanno un `f ≤ 0` | `success(0)` = 80%: `W_90` = `W_95` = null, `W_80` calcolato sugli 8 percorsi |
| S10 | Regressione: i test esistenti di `runMonteCarloSimulation` (anche con leva, tassa, pensioni, afflussi) | verdi senza modifiche; un'esecuzione seminata dà gli stessi risultati float per float prima e dopo il refactoring (RS2) |
| S11 | RS5, volatilità 0, Azioni 60% + Obbligazioni 40% (g = 7,824%, A2), N = 30 | SWR esatto 6,2427%, proposto «6,2%» |
| S12 | RS5 seminato, 60/40, Base, N = 30 | «4,3%» (esatto ≈ 4,33%); con K = 500.000 € o 1.000.000 € il tasso non cambia |
| E1 | RS7 con scenari scritti a mano: g = 7%, π = 2%, K = 100.000 €, spesa 30.000 €, SWR 4%, nessun ponte, pensione o tassa | T = 15: `S_req` = 26.000 € (esatto 25.952,35; con 25.900 € il FIRE è a 16 anni); T = 10: 48.000 €; T = 20: 15.300 € |
| E2 | RS9, come E1, T = 15, risparmio 24.000 € | `E_max` = 28.300 € (esatto 28.360,02); con 28.400 € il FIRE è a 16 anni |
| E3 | RS7, come E1, T = 15, K = 370.000 € | `S_req` = 0 («il capitale di oggi basta»): la soglia esatta è K = 30.000 · (1,02/1,07)^15 / 0,04 = 365.853,47 € |
| E4 | Coerenza RS7/RS8: volatilità 0, nessuna pensione e tassa, risparmio di oggi multiplo di 100 € e sotto `S_req` | risparmio di oggi + extra di RS8 = `S_req` di RS7 (tutti i percorsi coincidono con il Base, A17) |
| E5 | RS6: senza `userAge`; età obiettivo ≤ età | nessuna cifra; il tile dice rispettivamente dove scrivere l'età e «età obiettivo già raggiunta» |
| E6 | Età obiettivo scritta nei Parametri del Calcolatore e salvata | Coast › Ipotesi e What If leggono la stessa età (un solo campo `coastFireRetirementAge`) |

I valori S1–S4, S7, S8, S11, S12 ed E1–E3 sono calcolati con
`/mnt/project-files/fire-simulazioni/p1p2-controllo.py` (forma chiusa e simulazione numpy con la stessa R1 e la stessa
matrice); S4 e S12 sono statistici: il test li verifica con il seme fisso entro la tolleranza indicata.

### 10.9 Task S1 — Spesa sostenibile nel Monte Carlo (thread «impl», Sonnet 5.5)

Branch da `main`, PR in bozza verso `Ciocc128/net-worth-tracker:main`.

**Dettagli tecnici**
1. `lib/services/monteCarloService.ts`:
   - `drawPathFactors(params, plan, weights, random): Float64Array` (RS1, `N` fattori di un percorso, `f ≤ 0`
     compreso) e `runWithdrawalLedger(factors, params, annualWithdrawal, recordPath)` (RS2) estratte da
     `runSingleSimulation`, che diventa «estrai i fattori del percorso, poi il registro». L'ordine delle uniformi non
     cambia (S10).
   - `runMonteCarloSimulation(params, options?: { keepFactors?: boolean })`: con `keepFactors` il risultato porta
     `factors: Float64Array` (`n × N`, riga per percorso). Assente = comportamento di oggi (upstream e test).
   - `countSuccesses(factors, n, params, annualWithdrawal): number` — RS2 senza registrare i percorsi.
2. `lib/utils/sustainableWithdrawal.ts` (nuovo, puro): `solveSustainableWithdrawal({ success: (w) => number,
   capital, probability, step = 100 }): { withdrawal: number | null; successRate; rate }` (RS3) e
   `SUSTAINABLE_PROBABILITIES = [0.8, 0.9, 0.95]`; `summarizeSustainableSpending(results, params)` → le nove cifre
   (RS4).
3. `MonteCarloTab.tsx`: le tre corse con `keepFactors: true`; le nove cifre in un `useMemo` su `lastRun` (mai sugli
   input digitati: Stale-Run). La corsa senza leva non le chiede.
4. `lib/utils/monteCarloNarrative.ts`: la frase del verdetto (tre forme, § 10.6), `describeSpesaSostenibile`,
   footer e metodo. `components/monte-carlo/tiles/SpesaSostenibileTile.tsx` (nuovo); griglia e skeleton.
5. Prestazioni: misura e scrivi in `doc/guide/fire-monte-carlo.md` il tempo delle nove bisezioni su 10.000 percorsi ×
   30 e × 50 anni (stima: decine di ms) e il costo di `keepFactors` (memoria: `n × N × 8` byte per scenario).

**Test** — `__tests__/sustainableWithdrawal.test.ts`: S1–S3, S6, S7, S8, S9 (fattori iniettati o volatilità 0); S4 e S5
in `monteCarloService.test.ts` con il seme fisso; S10 (esecuzione seminata identica prima e dopo, con leva, tassa,
pensioni e afflussi); `monteCarloNarrative.test.ts`: le tre forme della frase, il «nessun prelievo», l'elisione.

**Documentazione** (stessa PR): `doc/guide/fire-monte-carlo.md` (il tile, RS1–RS4, «i fattori si estraggono una volta»,
blind spots: prelievo fisso rivalutato, cifra stabile non esatta, ultima esecuzione); `doc/guide/fire.md` (il motore
con `keepFactors`); `CLAUDE.md` («Latest», riga FIRE); `doc/guide/fork-scelte-ui.md`; `Draft Release Temp.md`.

**Criterio di fine**: S1–S10 verdi; `npx tsc --noEmit`, `npx eslint app components lib types e2e scripts __tests__`,
`TZ=Europe/Rome npx vitest run` verdi; tempi misurati nella guida. Collaudo su anteprima Vercel (WORKFLOW.md § 2):
il tile, la frase del verdetto nelle due forme (prelievo sotto e sopra `W_90`), le cifre che restano dell'ultima
esecuzione finché non si preme «Esegui».

### 10.10 Task E1 — Età obiettivo e SWR personale nel Calcolatore (thread «impl», Sonnet 5.5) — dopo S1

**Dettagli tecnici**
1. `lib/utils/fireTargetAge.ts` (nuovo, puro): `yearsToTargetAge(targetAge, userAge)` (RS6),
   `solveSavingsForTargetYear(walk, targetYears, cap)` (RS7) e `solveMaxPlanExpenses(walk, targetYears)` (RS9), dove
   `walk(savings, expenses)` è una chiusura su `calculateFIREProjection` con gli stessi argomenti del Calcolatore;
   `summarizeTargetAge(...)` per il tile.
2. RS8: `solveSavingsForTail` invariata, chiamata con `targetYears = T` e il `runFan` esistente.
3. RS5: `solvePersonalSwr({ weights, market, correlations, leverageSpread, costPct, horizonYears })` in
   `lib/utils/sustainableWithdrawal.ts`, su `runMonteCarloSimulation(..., { keepFactors: true })` con `K = 1`,
   1 € di prelievo come unità (RS3 con `step = 0,001`), arrotondata per difetto a 0,1 punti.
4. `FireParametri.tsx`: campo «Età obiettivo» (nella forma, in `hasUnsavedChanges`, salvata con gli altri come
   `coastFireRetirementAge`; validazione condivisa con `useCoastFireSettingsDraft`, da estrarre se serve) e la riga
   dell'SWR personale con «Usa».
5. `components/fire-simulations/tiles/EtaObiettivoTile.tsx` (nuovo), cella `ETA_CELL` nella griglia e nello skeleton;
   parole in `lib/utils/fireNarrative.ts` (`describeTargetAge*`).

**Test** — `__tests__/fireTargetAge.test.ts`: E1–E3, E5; E4 con il Ventaglio a volatilità 0; S11, S12 in
`sustainableWithdrawal.test.ts`; `fireNarrative.test.ts`: le letture dei casi d'uso 6–8 e dei due stati senza cifre;
E6 in `settingsRoundTrip.test.ts` (o nel test della forma).

**Documentazione** (stessa PR): `doc/guide/fire.md` § Calcolatore (il tile, RS5–RS9, l'età obiettivo è UNA per la
pagina, blind spots: cammino deterministico, RS8 non scende sotto il risparmio di oggi, SWR personale puro e solo
proposto); `doc/guide/fire-coast.md` e `fire-what-if.md` (l'età si scrive anche dal Calcolatore); `CLAUDE.md`,
`doc/guide/fork-scelte-ui.md`, `Draft Release Temp.md`.

**Criterio di fine**: E1–E6, S11, S12 verdi; tsc, eslint e vitest come sopra; tempo di RS8 e RS5 misurato nella guida;
le spec Playwright del Calcolatore (`e2e/fire*.spec.ts`) si eseguono in un thread sul computer del proprietario se il
tile nuovo cambia una misura (la guardia a 390 px). Collaudo su anteprima Vercel: il tile nei tre casi (serve
risparmio, già in rotta, Coast), «Usa» che cambia l'SWR in anteprima, l'età salvata letta da Coast.

**Esito E1 (04/10/2026, thread «impl»)** — Implementata come da spec; scelte di default dell'agente:
- Il tile «Età obiettivo» e l'SWR personale leggono l'età **digitata** nei Parametri (anteprima fino a «Salva», un'età non valida ricade sulla salvata), come SWR e spesa del piano; la spec diceva «salvata» solo per l'SWR personale.
- Tempi misurati sul container cloud: RS8 ≈ 0,4 s (1.000 percorsi, 30 anni, ~14 esecuzioni), RS5 ≈ 0,4 s a 30 anni e ≈ 0,65 s a 60: oltre i 150 ms della spec, quindi entrambi su `useDeferredValue` (il pannello e il campo si aggiornano subito, le cifre seguono).
- RS8 richiede l'età obiettivo entro l'orizzonte del Ventaglio (40 anni): oltre, la cifra è «—».
- Senza `onOpenCoast` (la pagina lo passa) il tile senza età non offre il collegamento; la scheda Coast si apre con lo stato locale della pagina, non con un `?tab=`.

### 10.11 Rischi

| Rischio | Mitigazione |
| --- | --- |
| Il refactoring di `runSingleSimulation` cambia i numeri di oggi. | S10: esecuzione seminata identica float per float prima e dopo; i test esistenti senza modifiche. |
| Merge con upstream su `monteCarloService.ts`, `FireParametri.tsx`, `FireCalculatorTab.tsx`. | Opzione `keepFactors` con default neutro; logica nuova in moduli nuovi (`sustainableWithdrawal.ts`, `fireTargetAge.ts`); voce in `fork-scelte-ui.md`. |
| La cifra della spesa sostenibile sembra esatta. | «Come si calcola» dichiara il seme e l'errore di campionamento (S4); arrotondamento per difetto. |
| L'SWR personale cambia il numero FIRE in modo inatteso. | Solo proposto (D-S4): cambia solo con «Usa» e «Salva». |
| Memoria di `keepFactors` (10.000 × 50 × 3 × 8 byte = 12 MB). | Misurata nella guida; i fattori vivono solo nell'ultima esecuzione. |

---

## 11. Patrimonio e portafoglio — da quale capitale partono le schede (task K1)

> Aggiunta il 04/10/2026 (thread «spec», richiesta del proprietario nella conversazione di progetto). D-P1 e D-P2
> proposte dal coordinatore e confermate nel thread; D-P3 decisa dal proprietario («versamento iniziale nei pesi
> target di una certa quantità della liquidità, anche 100% o meno»). **Sostituisce RP5 (§ 1.5) e il termine `E_c`
> di R6** (`doc/montecarlo/README.md`) per le schede di FIRE e Simulazioni. Base di codice: commit `65d26cb`
> (`main` del fork, merge della PR #50).

### 11.1 Obiettivo

Per l'utente **patrimonio** e **portafoglio** sono due cose diverse. Il patrimonio è tutto ciò che possiede; il
portafoglio è ciò che ha messo nei pesi target di Allocazione. Le schede che simulano un rendimento (Calcolatore,
Coast, What If, Monte Carlo, Proiezione) devono partire dal **portafoglio**, perché le loro ipotesi (RP1) sono
calcolate proprio sui pesi target. La liquidità che l'utente tiene fuori dal portafoglio ma intende investire entra
come **versamento iniziale nei pesi target**, per la quota che sceglie lui (0–100%). Il patrimonio resta come
contesto: ciò che è fuori si dichiara, non si simula.

### 11.2 Stato di partenza (verificato nel codice, 04/10/2026)

| Scheda | Capitale di partenza | Pesi | Dove |
| --- | --- | --- | --- |
| Calcolatore (anno FIRE, requisito, Ventaglio, Età obiettivo, SWR personale) | `K` = le sette classi di **tutti** gli strumenti, qualunque `allocationRole`, meno i fondi pensione bloccati | RP4 → `seedWeightsFromTargets` (R6) | `FireCalculatorTab.tsx:311,331,495` via `useFireAssumptions` → `resolveFireCapital` (`fireAssumptions.ts:197`) → `computeSimulatedCapital` (`monteCarloParams.ts:86`) |
| Coast FIRE | stesso `K` (e la sua parte liquida per il ponte) | RP4 | `CoastFireTab.tsx:185-195` |
| What If | stesso `K` | RP4 | `WhatIfAnalysisTab.tsx:193-211` |
| Monte Carlo (+ Spesa sostenibile) | `K` calcolato **di nuovo** nella scheda, seminato nel campo «Capitale iniziale» (modificabile) | seme RP4; pulsanti «dai target» e «di oggi» ricalcolati nella scheda | `MonteCarloTab.tsx:206-217,220,281` |
| Proiezione | `K` ricalcolato nella scheda (con ripiego su `assumptions.capital`) | come il Monte Carlo | `ProjectionTab.tsx:185-198` |
| Obiettivi | il valore degli **strumenti assegnati** a ciascun obiettivo, non `K` | RP1 Base sull'allocazione dell'obiettivo o sui pesi target (D8) | `GoalBasedInvestingTab.tsx:146,173-189` |
| Storico runway del Calcolatore | gli snapshot del patrimonio FIRE (fatti, non ipotesi) | — | `fireService.ts:771` (`getFIREData`) |

Il difetto, sul caso del proprietario (conti di liquidità con «Escludi dall'allocazione», target Liquidità 0%):

- quei conti **sono in `K`**, perché `computeSimulatedCapital` non guarda `allocationRole`;
- R6 li aggiunge ai pesi come `E_cash / K` (`monteCarloWeights.ts:162-167`): la Liquidità riceve un peso che il
  target non ha e le altre classi si **diluiscono** (70/30 diventa 63/27/10 nell'esempio di § 11.8);
- la liquidità **inclusa** oltre il target, invece, è oggi simulata come già investita nei pesi target (entra in `B`).

Le due liquidità fuori dal piano finiscono quindi nel capitale per due strade diverse, e nessuna delle due è una
scelta dell'utente.

### 11.3 Perimetro

**Incluso**
- La definizione di portafoglio e di liquidità da investire (RK1–RK3), letta da **una** funzione per la pagina.
- La quota di liquidità da investire (RK4), salvata nelle impostazioni, impostata nei Parametri del Calcolatore.
- I pesi sul nuovo capitale (RK5): i target, senza il termine `E_c` degli strumenti esclusi.
- Costo fiscale, parte liquida e costi ricorrenti sul nuovo capitale (RK6).
- Monte Carlo e Proiezione leggono il capitale dalla pagina e non lo ricalcolano più (RK7).
- La riga «Ipotesi usate», il tile Parametri del Monte Carlo e della Proiezione e «Parametri del piano» in
  Impostazioni dicono portafoglio, liquidità usata e ciò che resta fuori (§ 11.6).

**Escluso**
- **Obiettivi**: il capitale di un obiettivo resta quello degli strumenti assegnati (è già un sottoinsieme scelto
  dall'utente); cambiano solo i pesi del portafoglio target che legge in ripiego (RK5), come tutte le schede.
- Lo storico runway e lo storico cashflow del Dettaglio del Calcolatore: fatti, restano sul patrimonio FIRE.
- La pagina Allocazione: definizioni e piani invariati. RK2 legge i suoi target, non li cambia.
- Una quota diversa per scheda; una data del versamento diversa da oggi (il versamento è all'anno 0).
- Il reddito dopo il FIRE (P5), in coda dopo questa task.

### 11.4 Casi d'uso

1. **Liquidità esclusa da investire** (il caso del proprietario). Conti di liquidità esclusi dall'allocazione per
   60.000 €, target 70/30 senza Liquidità. Con quota 0% le schede partono dal solo portafoglio e simulano 70/30;
   portando la quota a 50%, 30.000 € entrano nel capitale, investiti 70/30, e l'anno FIRE si avvicina.
2. **Liquidità inclusa oltre il target.** Un conto incluso con target Liquidità 0% (o più basso di quanto si ha):
   l'eccedenza è liquidità da investire come quella esclusa, con la stessa quota.
3. **Liquidità con un peso target.** Target Liquidità 10%: il 10% del portafoglio resta Liquidità nel piano e rende
   come Liquidità; solo il di più è da investire.
4. **Tutto dentro.** Quota 100%: il capitale torna alla cifra di oggi, ma con i pesi target puri, senza la
   diluizione di R6.
5. **Il fondo emergenze resta fuori.** Con quota 0% un conto escluso non entra mai; la riga «Ipotesi usate» lo
   dichiara tra ciò che è fuori, così l'utente vede dove sono finiti i soldi.

### 11.5 Regole di calcolo

Notazione: per ogni strumento non bloccato e per ogni gamba (`legsOf`, la composizione se c'è) nelle sette classi,
`m` = valore di mercato della gamba (`calculateAssetValue × quota`), `role` = `resolveAllocationRole(asset)`.
Crypto e immobili restano fuori come oggi (RK di `doc/montecarlo/`).

**RK1 — Portafoglio lordo.** `N` = Σ `m` delle gambe **non Liquidità** con `role ∈ {tradable, frozen}`;
`C` = Σ `m` delle gambe Liquidità (`assetClass === 'cash'`, conti e fondi monetari) con lo stesso ruolo. Gli
strumenti `excluded` non sono portafoglio.

**RK2 — Liquidità nel portafoglio** (dal target effettivo di Allocazione, `resolveEffectiveTargets`):

```
target a importo fisso F (useFixedAmount):  C_in = min(C, F)
target in percentuale t (0 ≤ t < 100):      C_in = min(C, t/(100 − t) · N)      // la Liquidità è t% del portafoglio
nessun target sulle classi (pesi RP4 'holdings' o 'default'):  C_in = C
P = N + C_in                                                                    // il PORTAFOGLIO
X = C − C_in                                                                    // eccedenza inclusa, ≥ 0
```

Con `t` riscalato come in R6 quando crypto e immobili hanno un target (`100 / (100 − t_crypto − t_realestate)`).
Con la leva (target sopra 100%) la formula non cambia: `t` è la quota di mercato, come in Allocazione.

**RK3 — Liquidità da investire.** `L = max(0, X + E)`, dove `E` = Σ `m` delle gambe Liquidità degli strumenti
`excluded` (un saldo negativo, la carta di credito esclusa, la riduce). Gli strumenti `excluded` **non Liquidità**
(per esempio un'azione tenuta fuori dal piano) restano fuori e si dichiarano, mai investiti.

**RK4 — Capitale delle schede.** Quota `q` ∈ [0, 100] salvata in `fireCashToInvestPct` (assente = 0):

```
capitale = P + q/100 · L
```

La parte `q·L` è un versamento all'anno 0 nei pesi target: nei motori è capitale iniziale come il resto (nessun
flusso nuovo). Senza strumenti nel portafoglio (`P = 0`) e con `q·L > 0` il capitale è `q·L` e i pesi sono RP4.

**RK5 — Pesi sul capitale.** Con target sulle classi: `w_c = t_c` (riscalati come in R6, Oro da RG), **senza** il
termine `E_c`; con target Liquidità a importo fisso `F`: `w_cash = C_in / capitale · 100` e
`w_c = t_c · (1 − C_in / capitale)` per le altre. Senza target: i pesi detenuti (`weightsFromHoldings`) delle sole
gambe del portafoglio, più `q·L` in Liquidità. Leva invariata: la somma dei target. Normalizzazione invariata
(`normalise` di `monteCarloWeights.ts`).

**RK6 — Costo fiscale, liquidità, costi.** Ogni strumento entra nel capitale con una quota `s_a` ∈ [0, 1]: 1 per gli
strumenti del portafoglio non Liquidità; per le gambe Liquidità incluse `1 − X/C` (l'eccedenza si toglie in
proporzione) più la sua parte di `q·L`; per le gambe Liquidità escluse la sua parte di `q·L` (in proporzione a
`m / (X + E)`); 0 per il resto. Il **profilo fiscale** (`resolvePortfolioTaxProfile`) usa valore e costo scalati da
`s_a`; la **parte liquida** è Σ `s_a · m` delle gambe liquide; i **costi ricorrenti** (`resolveClassCosts`, § 9)
leggono gli stessi strumenti con lo stesso `s_a` (gli `excluded` non Liquidità non ci sono più).

**RK7 — Una sola lettura.** `resolveFireCapital` calcola RK1–RK6 e `resolveFireAssumptions` restituisce capitale e
pesi coerenti. Monte Carlo e Proiezione non chiamano più `computeSimulatedCapital`, `seedWeightsFromTargets` né
`weightsFromHoldings`: il seme del campo «Capitale iniziale» è `assumptions.capital.total`, il pulsante «dai target»
è `assumptions.weights`, quello «di oggi» è RK5 senza target. `computeSimulatedCapital` resta per Impostazioni
(le classi detenute) e come mattone interno.

**RK8 — Patrimonio di contesto.** `patrimonio` = `calculateTotalValue(assets)` (il totale della pagina Patrimonio).
`fuori` = Immobili, Crypto, liquidità da investire non usata `(1 − q/100)·L`, altri esclusi; più i fondi pensione
bloccati, dichiarati come oggi dal vincolo.

### 11.6 Cosa vede l'utente

- **Parametri del Calcolatore**: un campo «Liquidità da investire» in percentuale accanto a «Spesa del piano»,
  anteprima fino a «Salva» come la spesa. Sotto: «60.000 € fuori dal portafoglio (conti esclusi 45.000 €, oltre il
  target 15.000 €): ne entrano 30.000 € nei pesi target». Con `L = 0` il campo non c'è e la riga dice «Nessuna
  liquidità fuori dal portafoglio».
- **Riga «Ipotesi usate»** (le sei schede): «· capitale 430.000 € (portafoglio 400.000 € + 30.000 € di liquidità da
  investire; fuori: Liquidità 30.000 €, Immobili 250.000 €, Crypto 10.000 €)». Con `q = 0`: «capitale 400.000 €
  (portafoglio; fuori: …)». Il patrimonio totale si legge nel tooltip «Come si calcola» della riga, non nel testo.
- **Monte Carlo e Proiezione**, tile Parametri: la stessa scomposizione sotto «Capitale iniziale» al posto
  dell'elenco «Fuori» di oggi.
- **Impostazioni › Parametri del piano**: riga «Liquidità da investire» «50%» (o «0% · predefinita»), sola lettura,
  il collegamento al Calcolatore come le altre.

### 11.7 Decisioni

| # | Stato | Decisione | Alternative scartate e motivo |
| --- | --- | --- | --- |
| D-P1 | **Presa** (04/10/2026) | **Portafoglio** = gli strumenti inclusi o bloccati in Allocazione nelle sette classi, con la Liquidità fino al suo target (RK1–RK2). **Patrimonio** = tutto. | Esclusioni a mano scheda per scheda (un secondo posto dove dire cosa è portafoglio); `K` di oggi (ignora `allocationRole`, il difetto). |
| D-P2 | **Presa** (04/10/2026) | Calcolatore, Coast, What If, Monte Carlo (con Spesa sostenibile) e Proiezione partono dal capitale di RK4; il patrimonio è dichiarato, mai simulato. Obiettivi tiene gli strumenti assegnati. | Patrimonio intero (simula soldi fermi come investiti, o diluisce i pesi); solo portafoglio senza quota (la liquidità che si sta per investire sparisce e l'anno FIRE si allontana). |
| D-P3 | **Presa** (04/10/2026, proprietario) | La liquidità fuori dal portafoglio entra come **versamento iniziale nei pesi target** per una quota `q` da 0% a 100% scelta dall'utente. | Esclusa del tutto; un importo in euro invece di una percentuale (va riscritto a ogni movimento del conto). |
| D-P4 | **Presa** (04/10/2026, proprietario) | **Liquidità da investire** = conti esclusi dall'allocazione **più** l'eccedenza oltre il target sui conti inclusi (RK3). Gli esclusi non Liquidità restano fuori. | Solo l'eccedenza dei conti inclusi (il caso del proprietario, conti esclusi, resterebbe fuori senza rimedio). |
| D-P5 | Default dell'agente (04/10/2026) | **Quota predefinita 0%**: senza scelta conta il solo portafoglio, la liquidità esclusa si dichiara. | 100% (riproduce la cifra di oggi, cioè il difetto, finché l'utente non se ne accorge). |
| D-P6 | Default dell'agente (04/10/2026) | **Dove**: nei Parametri del Calcolatore, salvata in `fireCashToInvestPct` (impostazioni), letta da tutte le schede; dichiarata in Impostazioni › Parametri del piano. | Impostazioni › Simulazioni (è un'ipotesi del piano come la spesa, non del mercato). |
| D-P7 | Default dell'agente (04/10/2026) | Il versamento è all'**anno 0**, nei pesi target come il resto del capitale; nessun flusso dedicato nei motori. | Un ingresso di capitale datato (come i fondi pensione): più codice, e la data non è chiesta. |

D-P5 e D-P6 sono le opzioni consigliate nel thread; il proprietario può rovesciarle prima dell'implementazione.

### 11.8 Criteri di accettazione (valori di riferimento verificabili)

Esempio comune: ETF azionario 280.000 € (costo 200.000 €), ETF obbligazionario 120.000 € (costo 110.000 €),
conto corrente incluso 15.000 €, conto deposito **escluso** 45.000 €, crypto 10.000 €, casa di residenza esclusa
250.000 €. Target Azioni 70, Obbligazioni 30, Liquidità 0. Impostazioni di default, nessun costo (TER assenti,
bollo spento), nessun fondo bloccato. Tolleranza: ± 0,01 € sugli importi, ± 0,0001 punti sulle percentuali.

| # | Caso | Valore atteso |
| --- | --- | --- |
| K1 | Oggi (prima della task), per confronto | capitale 460.000 €, pesi 63/27/10 (Azioni/Obbligazioni/Liquidità), Base 8,2891% |
| K2 | RK1–RK3 | `N` = 400.000, `C` = 15.000, `C_in` = 0, `P` = 400.000, `X` = 15.000, `E` = 45.000, `L` = 60.000 |
| K3 | RK4, `q` = 0 / 50 / 100 | capitale 400.000 / 430.000 / 460.000 € |
| K4 | RK5, ogni `q` | pesi 70/30; RP1 Orso 6,5158%, Base 8,7525%, Toro 11,4278% (reale Base 5,5439%) |
| K5 | RK2, target Liquidità 10%, conto incluso 60.000 €, niente conti esclusi | `C_in` = 44.444,44, `P` = 444.444,44, `X` = 15.555,56 |
| K6 | RK2, Liquidità a importo fisso 20.000 €, conto incluso 60.000 € | `C_in` = 20.000, `P` = 420.000, `X` = 40.000; con `q` = 100: capitale 460.000, `w_cash` = 4,3478%, Azioni 66,9565%, Obbligazioni 28,6957% (prima di `normalise`) |
| K7 | RK3, carta di credito esclusa −2.000 € oltre al conto deposito | `E` = 43.000, `L` = 58.000 |
| K8 | RK6, `q` = 50 | costo fiscale 340.000 €, quota plusvalenze 90.000 / 430.000 = 20,93% (oggi 90.000 / 460.000 = 19,57%) |
| K9 | RK6, parte liquida, `q` = 50 (ETF e conti liquidi) | 430.000 € |
| K10 | Senza target (pesi «di oggi»), `q` = 0 | capitale 415.000 € (conto incluso dentro, deposito escluso fuori), pesi 67,47/28,92/3,61 prima di `normalise` |
| K11 | RK7 | Monte Carlo e Proiezione seminano «Capitale iniziale» con la stessa cifra della riga «Ipotesi usate»; nessuna chiamata a `computeSimulatedCapital` nelle due schede |
| K12 | RK8 e § 11.6, `q` = 50 | riga: «capitale 430.000 € (portafoglio 400.000 € + 30.000 € di liquidità da investire; fuori: Liquidità 30.000 €, Immobili 250.000 €, Crypto 10.000 €)», uguale nelle sei schede |
| K13 | Round-trip | `fireCashToInvestPct` attraversa le cinque sedi (`settingsRoundTrip`); assente = 0; 0 e 100 accettati, fuori da [0, 100] rifiutato con un messaggio nei Parametri |
| K14 | Coerenza A17 (§ 1.6) | a volatilità 0 il Ventaglio coincide con la curva Base partendo dal capitale di RK4 |

I valori RP1 di K1 e K4 vengono da `/mnt/project-files/fire-simulazioni/rp1-controllo.py` (`pg`).

### 11.9 Task K1 — Portafoglio e liquidità da investire (thread «impl», Sonnet 5.5)

**Moduli**
- `lib/utils/fireAssumptions.ts`: `resolveFireCapital` diventa RK1–RK6 e riceve target effettivi e `q`; `FireCapital`
  aggiunge `portfolio` (`P`), `cashToInvest` (`{ total: L, used: q·L, pct: q, excludedAccounts: E, overTarget: X }`),
  `netWorth` (RK8), `outside.cash` e `outside.otherExcluded`. `resolveFireWeights` usa RK5 (una funzione nuova in
  `monteCarloWeights.ts`, per esempio `weightsForFireCapital`; `seedWeightsFromTargets` resta per i suoi test e per
  Impostazioni se servisse). `resolveClassCosts` riceve le quote `s_a`.
- `lib/utils/fireAssumptionsNarrative.ts`: `describeCapital` come § 11.6.
- `components/fire-simulations/FireParametri.tsx` + `FireCalculatorTab.tsx`: il campo, anteprima e «Salva» come
  `plannedExpenses`.
- `MonteCarloTab.tsx`, `ProjectionTab.tsx`: RK7, il tile Parametri come § 11.6.
- Impostazioni: `fireCashToInvestPct` nelle cinque sedi (`doc/guide/impostazioni.md` § Settings — the FIVE places),
  riga in «Parametri del piano» (`describePlanParameters`).

**Test** — `__tests__/fireAssumptions.test.ts`: K2–K10, K14; `fireAssumptionsNarrative.test.ts`: K12;
`settingsRoundTrip.test.ts`: K13; i test esistenti di Monte Carlo, Proiezione e Calcolatore che fissano un capitale
con strumenti esclusi si aggiornano dichiarandolo nella PR.

**Documentazione** (stessa PR): `doc/guide/fire.md` (capitale e quota, blind spot: la liquidità esclusa non conta a
0%), `fire-monte-carlo.md`, `fire-proiezione.md`, `doc/guide/impostazioni.md` (la riga nuova), `doc/montecarlo/README.md`
(nota su R6: `E_c` non si usa più nelle schede FIRE), `CLAUDE.md`, `doc/guide/fork-scelte-ui.md`,
`Draft Release Temp.md`.

**Criterio di fine**: K1–K14 verdi; `npx tsc --noEmit`, `npx eslint app components lib types e2e scripts __tests__`,
`TZ=Europe/Rome npx vitest run`. Le spec Playwright di FIRE (`e2e/fire*.spec.ts`, Monte Carlo, Proiezione) e la
verifica sui dati reali (`npm run mirror:seed`) si fanno in un thread sul computer del proprietario: la riga «Ipotesi
usate» e il capitale cambiano per ogni account con strumenti esclusi.

### 11.10 Rischi

| Rischio | Mitigazione |
| --- | --- |
| Con quota 0% l'anno FIRE si allontana di colpo per chi ha liquidità esclusa. | La riga dichiara la liquidità fuori e il campo è nei Parametri; nota nelle note di rilascio. |
| `allocationRole` usato ora fuori da Allocazione cambia anche Coast e What If. | È lo scopo (D-P2); la guida di `types/assets.ts` sui tre ruoli si aggiorna («FIRE: excluded è fuori dal portafoglio»). |
| Merge con upstream su `monteCarloWeights.ts` e sulle schede. | Funzione nuova accanto a `seedWeightsFromTargets`, che resta; voce in `fork-scelte-ui.md`. |
| Due capitali di nuovo, se una scheda ricalcola. | RK7 e K11: le schede leggono solo `assumptions.capital`. |

---

## 12. P4 + P5 — Flussi datati: eventi nel tempo e reddito dopo il FIRE (task F1, F2, F3)

> Aggiunta il 04/10/2026 (thread «spec», via del proprietario nella conversazione di progetto). Decisioni D-F1–D-F12
> proposte nel piano `/mnt/project-files/fire-simulazioni/piano-p4-p5.md` e confermate dal proprietario nel thread lo
> stesso giorno. Base di codice: commit `6eaecdf` (`main` del fork, merge della PR #51). **Parte dal capitale di
> § 11 (K1)**: le task F1–F3 si implementano dopo il merge di K1 e leggono `assumptions.capital` come lo definisce RK4.
> Valgono RP1–RP7, RC1–RC6, RS1–RS9 e RK1–RK8: questa sezione le **legge** e aggiunge solo le regole dei flussi.
> Valori di riferimento: `/mnt/project-files/fire-simulazioni/p4p5-controllo.py`.
>
> Letture obbligatorie, oltre a § 0: `doc/guide/fire.md` § FIRE, What If and Goals («The bridge model reuses the Coast
> walk», «Year 0 is a year», «The Ventaglio engine mirrors the deterministic walk», «THE ONE RULE of the requirement»);
> `doc/guide/fire-what-if.md`; `doc/guide/fire-proiezione.md`; `doc/guide/patrimonio.md` § Mutuo;
> `doc/guide/impostazioni.md` § Settings — the FIVE places; DESIGN.md: The Declaration-Tile Rule, The Input Tile Rule,
> The Modal-Is-A-Tile Rule, The Narrative Honesty Rule, The Comma Rule.

### 12.1 Obiettivo

Oggi il tempo delle simulazioni è piatto: spesa costante in termini reali per sempre, risparmio indicizzato, nessun
evento oltre l'anno 0, nessun reddito dopo il FIRE salvo le pensioni di Stato. Due famiglie di domande restano senza
risposta:

- **P4, eventi datati.** «Il mutuo finisce nel 2034: quanto anticipa?», «un figlio nel 2028», «un'eredità tra dieci
  anni», «compro casa nel 2030», «dopo i 75 anni spendo meno».
- **P5, reddito dopo il FIRE.** «Se dopo il FIRE guadagno 800 € al mese per 10 anni, quando posso smettere?» (Barista
  FIRE), «l'affitto dell'appartamento continua anche dopo».

Le due famiglie sono la stessa cosa: un importo che entra o esce **da un anno, per un certo numero di anni**. Questa
sezione definisce un solo modello, i **flussi datati**, letto da tutte le schede che simulano un piano (Calcolatore,
Coast, What If, Monte Carlo, Proiezione). Gli Obiettivi (P8) vi si agganceranno in una spec successiva.

### 12.2 Stato di partenza (verificato nel codice, 04/10/2026)

| Fatto | Dove |
| --- | --- |
| Il cammino del Calcolatore: crescita, risparmio `S·(1+π)^(t−1)` finché non è FIRE, test contro il requisito dell'anno; l'unico evento datato è il fondo pensione che si sblocca | `lib/services/fireService.ts:1590-1745` (`calculateFIREProjection`) |
| Il requisito dell'anno t: la camminata all'indietro di Coast (spesa ÷ SWR a regime, anni del ponte finanziati al rendimento reale, entrate di capitale scontate), con il moltiplicatore della tassa sulla parte finanziata dal portafoglio | `fireService.ts:1008-1135` (`buildCoastFIRERetirementNeeds`), `:1541` (`resolveFireRequirement`) |
| Le pensioni di Stato sono già un flusso datato: entrata netta (IRPEF), da una data, per sempre, in euro di oggi | `types/assets.ts:311` (`CoastFirePensionInput`), `monteCarloService.ts:17` (`AnnualInflow`) |
| Ventaglio e Monte Carlo accettano entrate di capitale per anno (`capitalInflows`) e pensioni annue (`annualInflows`, `retirement.statePensions`); ordine entrata → rendimento → prelievo | `monteCarloService.ts:80-170`, `:477-620` |
| What If: ogni evento accade all'anno 0 e la guida vieta gli eventi datati («Do NOT add timed mid-projection cash events») | `types/whatIf.ts:10-20`, `lib/services/whatIfService.ts:65-105`, `doc/guide/fire.md:61` |
| La rata del mutuo è una spesa `debt` del Cashflow, conteggiata intera (interessi e capitale) nella spesa e quindi nel risparmio di oggi | `lib/services/expenseService.ts:828-840` (`isCountableExpense`) |
| Patrimonio proietta la fine del mutuo dalla rata collegata, dal debito e dal TAN (`projectPayoff`, esiti `date` / `never` / `repaid`); le rate si leggono con `useMortgageInstalments` | `lib/utils/mortgageSummary.ts:104,141`, `lib/hooks/useMortgageInstalments.ts:15` |
| Nessun motore FIRE legge il mutuo, i figli, un'eredità futura o un reddito dopo il FIRE | `fireService.ts`, `monteCarloService.ts`, `whatIfService.ts` |
| Una camminata all'indietro allungata **abbassa** il requisito quando il rendimento reale supera l'SWR (con 7%/2% e SWR 4%: un anno di spesa finanziato al 4,90% costa meno della sua quota di perpetuità al 4%) | verificato con lo script; la guida lo dichiara per il ponte («beyond it the extra discounted years change the baseline too») |

### 12.3 Perimetro

**Incluso**
- Il modello `DatedFlow` (§ 12.5): spesa ricorrente, entrata ricorrente, una tantum; ancorato a un anno, a un'età o
  al FIRE; in euro di oggi o fisso nominale; salvato in `fireDatedFlows` nelle impostazioni.
- Il **mutuo collegato** a Patrimonio (D-F5): rata e fine lette dal tile Mutuo a ogni apertura.
- Le regole RF1–RF11: traduzione in tabelle per anno, requisito FIRE, cammino deterministico, Ventaglio, Monte Carlo
  (con Spesa sostenibile), Coast, Proiezione, What If.
- La sezione «Flussi nel tempo» nei Parametri del Calcolatore, la riga della Base di calcolo con l'effetto sull'anno
  FIRE, i segni delle una tantum nel grafico Scenari, la clausola nella riga «Ipotesi usate», la riga in Impostazioni ›
  Parametri del piano.
- What If con un campo «Quando» (D-F9); la regola della guida che lo vietava si riscrive.

**Escluso**
- **P8, Obiettivi come uscite datate**: il tipo riserva la sorgente `goal`, nessuna scheda la legge in questa sezione.
- Le **pensioni di Stato** restano dove sono (D-F4): non migrano a flussi.
- Tasse sui redditi (IRPEF, cedolare): gli importi sono netti, scritti dall'utente (D-F8).
- Flussi **incerti** (un'eredità con probabilità, un reddito che varia con i mercati): i flussi sono deterministici,
  uguali in tutti i percorsi.
- Fasi della spesa in percentuale («−20% dopo i 75»): si scrive l'importo in euro.
- Precisione sotto l'anno, salvo l'ultimo anno del mutuo collegato (RF1).
- Salvare uno scenario What If come flusso (P14).
- Spec Playwright nuove: nessuna; le spec esistenti di FIRE si rieseguono sul computer del proprietario.

### 12.4 Casi d'uso

Esempio comune (valori di § 12.9): capitale 400.000 €, spesa del piano 30.000 € dal Cashflow, risparmio 20.000 €
indicizzato, rendimento 7%, inflazione 2%, SWR 4%, nessuna pensione né tassa. Senza flussi: requisito di oggi
750.000 €, FIRE all'anno 8.

1. **Il mutuo finisce.** La rata di 800 € al mese è dentro la spesa di 30.000 € e il piano la conta per sempre.
   L'utente collega il mutuo di Casa (ultima rata nel 2034): fino al 2034 il risparmio cresce perché la rata è fissa,
   dopo cresce di tutta la rata; la spesa da pensionato scende a 20.400 €. Requisito di oggi 581.371 €, FIRE
   all'anno 4.
2. **Un figlio.** 6.000 € l'anno di oggi dal 2028 per 20 anni: il risparmio scende in quegli anni e il requisito sale
   del valore attuale degli anni che cadono dopo il FIRE. Requisito di oggi 821.875 €, FIRE all'anno 10.
3. **Un'eredità.** 100.000 € nel 2036: il capitale sale in quell'anno; se il FIRE arriva prima, il requisito scende del
   suo valore attuale. Requisito di oggi 699.165 €, FIRE all'anno 7.
4. **Barista FIRE.** Un part-time da 800 € al mese per 10 anni dopo il FIRE: non tocca l'accumulo, abbassa il
   requisito del valore attuale dei dieci anni. Requisito di oggi 675.517 €, FIRE all'anno 7.
5. **Affitti.** Un affitto netto di 6.000 € l'anno, già nel Cashflow, per sempre: il risparmio non cambia, la spesa da
   coprire col portafoglio scende a 24.000 €. Requisito di oggi 600.000 €, FIRE all'anno 5.
6. **Coast.** Età 35, obiettivo 50: l'eredità a 45 anni abbassa il numero Coast di oggi da 365.853 a 315.019 €; il
   figlio conta solo per gli anni dopo i 50.
7. **Se smetto oggi.** Monte Carlo con un part-time di 10.000 € l'anno per i primi 10 anni: la spesa sostenibile
   sale; a volatilità zero il prelievo massimo passa da 50.632 a 54.964 € (§ 12.9, F13).
8. **What If datato.** «Perdo il lavoro per 6 mesi nel 2029» invece che oggi: la stessa perdita all'anno 3, con il
   capitale che nel frattempo è cresciuto.

### 12.5 Il modello

```ts
// types/assets.ts (accanto a CoastFirePensionInput)
export type DatedFlowKind = 'expense' | 'income' | 'lumpIn' | 'lumpOut';
export type DatedFlowStart =
  | { anchor: 'year'; year: number }        // anno di calendario
  | { anchor: 'age'; age: number }          // età (serve userAge)
  | { anchor: 'fire'; afterYears: number }; // anni dopo l'anno FIRE (0 = dal primo anno da pensionato); solo ricorrenti
export interface DatedFlow {
  id: string;
  label: string;                  // ≤ 60 caratteri
  kind: DatedFlowKind;
  amount: number;                 // annuo per expense/income (expense anche < 0: una spesa che scende), importo per lump (> 0)
  indexed: boolean;               // true = euro di oggi rivalutati con π; false = euro nominali fissi (serve una fine)
  start: DatedFlowStart;
  durationYears: number | null;   // solo ricorrenti: anni ≥ 1; null = per sempre
  inCashflowToday?: boolean;      // solo ricorrenti attivi oggi (RF1): già nel risparmio e nella spesa di oggi
  source?: { kind: 'mortgage'; propertyId: string } | { kind: 'goal'; goalId: string }; // 'goal' riservato a P8
}
// AssetAllocationSettings
fireDatedFlows?: DatedFlow[];     // assente = nessun flusso; al massimo 20
```

**Validazione** (`lib/utils/datedFlowValidation.ts`, condivisa da dialogo e salvataggio): importo finito e diverso da
zero (positivo per `income` e per le una tantum); `durationYears` intero ≥ 1 o `null`; `indexed: false` richiede una
fine; `anchor: 'fire'` solo per `expense` e `income`; anno tra l'anno in corso − 50 e + 100; età tra 0 e 120;
`afterYears` intero tra 0 e 50. Un flusso con `source.kind = 'mortgage'` ignora `amount`, `indexed`, `start` e
`durationYears` salvati: li deriva RF1.

### 12.6 Regole di calcolo

Notazione: anno `t` = anni da oggi (l'anno di calendario in corso è `t = 0`, come in `calculateFIREProjection`); π e
il rendimento nominale `g` dello scenario (RP1 netto di costi, RC4); `r = (1+g)/(1+π) − 1` (RP2); `σ = +1` per una
spesa, `−1` per un'entrata. Tutti i flussi di un anno arrivano **alla fine dell'anno**, come il risparmio e il
prelievo.

**RF1 — Finestra di un flusso.** Inizio `s₀`: `year − annoInCorso`; `age − userAge` (senza `userAge` il flusso è
**escluso e dichiarato**, come le pensioni); per l'ancora `fire`, ritirandosi alla fine dell'anno `T`:
`T + 1 + afterYears`. Una ricorrente è attiva negli anni `s₀ … s₀ + durationYears − 1` (per sempre se `null`); una
una tantum solo in `s₀`. Gli anni `s < 0` sono passati e non contano; una una tantum con `s₀ = 0` è capitale di
partenza; una ricorrente attiva in `s ≤ 0` può avere `inCashflowToday` (default `true`). Un flusso ancorato al FIRE non
esiste prima del FIRE.
**Mutuo collegato**: rata = l'ultima rata collegata (`summarizeMortgage(...).next.amount`, o la rata di
`projectPayoff`), fine = `payoff.date`; importo dell'anno `s ≥ 1` = rata × numero di rate mensili con data in quell'anno
di calendario, dalla prossima rata non saldata alla fine; `indexed: false`, `inCashflowToday: true`. `payoff = never`
→ flusso escluso, «la rata non copre gli interessi: il mutuo non finisce»; `repaid` o nessuna rata collegata → escluso,
«nessuna rata collegata al mutuo di Casa: collegala in Cashflow o scrivi il flusso a mano».

**RF2 — Importo nominale all'anno s.** Fisso: `A`. Indicizzato: `A·(1+π)^s` dove modifica la **spesa** (requisito,
prelievi, una tantum), `A·(1+π)^(s−1)` dove modifica il **risparmio** (RF3), così un flusso indicizzato «già nel
Cashflow» e ancora attivo non sposta nulla, come il risparmio di RP7.

**RF3 — Variazione del risparmio** (accumulo, solo ricorrenti ad anno o età):

```
Δs_t = Σ_f  −σ_f · ( a_f^ris(t)·[attivo in t]  −  [inCashflowToday]·A_f·(1+π)^(t−1) )
```

Il secondo termine toglie ciò che il risparmio di oggi già contiene. Il risparmio dell'anno è `S·(1+π)^(t−1) + Δs_t` e
può essere negativo (si preleva dal capitale per pagarlo).

**RF4 — Variazione del bisogno** (dopo il FIRE, ritirandosi alla fine dell'anno T, anno `s > T`, euro nominali):

```
n_s = Σ_f  σ_f · ( a_f^spesa(s)·[attivo in s]  −  [inCashflowToday ∧ spesa ∧ spesa del piano dal Cashflow]·A_f·(1+π)^s )
```

Una spesa «già nel Cashflow» è dentro la spesa del piano solo se questa viene dal Cashflow (RP6): se è scritta a mano,
i flussi si aggiungono sopra (D-F6). Un'entrata non è mai dentro la spesa, quindi riduce sempre il bisogno per intero.

**RF5 — Requisito FIRE con i flussi** (sostituisce nulla: si **somma** a `resolveFireRequirement`). Alla fine
dell'anno T, in euro dell'anno T, con `E_T` la spesa dell'anno T, `P_j` le pensioni nette attive all'anno `T + j` in
euro dell'anno T (0 se non considerate), `m` il moltiplicatore della tassa:

```
n'_j  = n_{T+j} / (1+π)^j                                       // euro dell'anno T
δ_j   = max(0, E_T − P_j + n'_j) − max(0, E_T − P_j)            // l'eccedenza di un anno non si reinveste (D-F8)
L'_k  = una tantum nette all'anno T + k, in euro dell'anno T    // entrate +, uscite −
J     = ultimo anno (da T) in cui un flusso o una pensione inizia o finisce
R_T   = max(0, R_T^base + m·Σ_{j=1..J} δ_j/(1+r)^j + m·δ_{J+1}/SWR/(1+r)^J − Σ_{k=1..J} c_k·L'_k/(1+r)^k)
        con c_k = 1 per un'entrata, m per un'uscita
```

`R_T^base` è il requisito di oggi (`resolveFireRequirement`, invariato). Le parti temporanee si finanziano al
rendimento reale, la parte permanente (`δ_{J+1}`, uguale per tutti gli anni dopo J) all'SWR, come la spesa. **Senza
flussi `R_T = R_T^base` identico** (F1). Proprietà: una spesa in più non abbassa mai il requisito (D-F7).

**RF6 — Cammino deterministico** (`calculateFIREProjection`, ogni scenario con i suoi g e π):

```
NW_0 = K + L_0                                                   // una tantum dell'anno in corso nel capitale di partenza
NW_t = NW_{t−1}·(1+g) [+ fondo allo sblocco] + [non ancora FIRE]·(S·(1+π)^(t−1) + Δs_t) + L_t
FIRE all'anno t se NW_t ≥ R_t (RF5); il test dell'anno 0 resta («Year 0 is a year»)
```

Le una tantum entrano anche dopo il FIRE (come il fondo che si sblocca); il risparmio e Δs no. La base fiscale
cresce con ogni euro che entra (risparmio, una tantum in entrata); un'uscita o un risparmio negativo vende alla quota
di plusvalenza del portafoglio (`basis × (1 − uscita/NW)`), senza tassa nell'accumulo (dichiarato). Il capitale può
scendere sotto zero: il cammino continua, la riga lo mostra.

**RF7 — Ventaglio** (`runAccumulationSimulation`): nell'accumulo di ogni percorso, per anno, rendimento → risparmio
`+ Δs_t` (finché il percorso non è FIRE) `+ L_t` (sempre), come RF6; i bersagli sono le righe di RF6
(`resolveFanFireTargets`, invariato). Nel registro «dal FIRE in poi», dall'anno dopo il FIRE del percorso (`T` = il
suo anno FIRE): rendimento → `+ L⁺_s` (entrate, anche nella base) → prelievo di `max(0, E_s − P_s + n_s) + L⁻_s`,
lordo della tassa (`withdrawGross`). Le ancore `fire` partono dal FIRE **di ogni percorso**. A volatilità zero ogni
percorso coincide con la curva Base di RF6 (F18).

**RF8 — Monte Carlo** «se smetto oggi» (`runWithdrawalLedger`, `T = 0`, le ancore `fire` dall'anno `1 + afterYears`),
anno s: entrate di capitale di oggi (fondo) → rendimento → `+ L⁺_s` → prelievo di
`max(0, W·(1+π)^s + n_s − P_s) + L⁻_s`, lordo della tassa. Il prelievo `W` prende il posto della spesa del piano in
RF4. La Spesa sostenibile (RS1–RS4) risolve `W` sullo stesso registro: i flussi sono parte del piano e la coerenza S5
resta. L'**SWR personale** (RS5) resta puro, senza flussi (come senza pensioni). La corsa senza leva di confronto
legge gli stessi flussi.

**RF9 — Coast** (età obiettivo, `T` anni): il requisito all'età obiettivo è RF5 con `T` = l'età obiettivo (le ancore
`fire` partono da lì); nel tratto da oggi all'età obiettivo contano **solo le una tantum** (D-F11):

```
CoastOggi = R_T^reale / (1+r)^T − Σ_{s=1..T} L^reale_s / (1+r)^s
```

Le ricorrenti prima dell'età obiettivo non contano: per definizione di Coast le copre il lavoro. L'anno «al ritmo
attuale» di Coast usa RF3 e RF6 come il Calcolatore.

**RF10 — Proiezione** (accumulo, euro di oggi): `+ L_t` in ogni anno, `+ Δs_t` solo mentre si versa (`t ≤
savingsYears`); le ancore `fire` non esistono (D-F10).

**RF11 — What If datato.** Ogni evento prende un anno `y = Quando − annoInCorso` (default 0). Con `y = 0` il calcolo
è **identico a oggi** (perturbazione dell'anno 0, `applyScenarioToBaseline`). Con `y ≥ 1` l'evento diventa un flusso
non salvato, aggiunto ai flussi salvati solo nel lato «dopo» del confronto:
- perdita di lavoro → una tantum in uscita di `reddito perso × mesi / 12`, indicizzata, all'anno y;
- acquisto importante → una tantum in uscita all'anno y; entrata straordinaria → una tantum in entrata all'anno y;
- variazione di cashflow → `ΔS·(1+π)^(t−1)` sul risparmio dagli anni `t ≥ y` (RF3) e una spesa ricorrente `ΔE`
  indicizzata da `y` per sempre nel bisogno (RF4), senza toccare il risparmio una seconda volta.
Il lato «prima» è il piano con i flussi salvati. La matrice di Sensibilità varia spesa e risparmio di base, non i
flussi (dichiarato).

### 12.7 Cosa vede l'utente

**Calcolatore › Parametri** — una sezione **«Flussi nel tempo»** dopo «Spesa del piano» e «Liquidità da investire»:
- la lista dei flussi, una riga ciascuno: «Mutuo Casa · spesa · 800 €/mese fissi · fino a marzo 2034 · già nel
  Cashflow», «Part-time · entrata · 9.600 €/anno · 10 anni dal FIRE», «Eredità · entrata una tantum · 100.000 € ·
  2036»; un flusso escluso dice perché (RF1) in tono di avviso;
- le **pensioni di Stato** in coda, in sola lettura: «Pensione INPS · dal 2058 · si modifica in Coast FIRE › Ipotesi»
  (collegamento) (D-F4);
- **«Aggiungi un flusso»** apre un `ResponsiveModal` (The Modal-Is-A-Tile Rule) con: Nome; Tipo (Spesa ricorrente,
  Entrata ricorrente, Una tantum in entrata, Una tantum in uscita); Importo (€/anno o €); «Importo fisso, non
  rivalutato» (spento di default; aiuto: «per una rata a tasso fisso»); Inizio (Anno, Età, Dal FIRE + anni dopo);
  Durata (anni, o «per sempre»); «Già nel Cashflow di oggi» (solo se attivo oggi). Errori in italiano da
  `datedFlowValidation`;
- **«Collega un mutuo»**, se Patrimonio ha immobili con una rata collegata: un elenco degli immobili con la fine
  prevista; sceglierne uno crea il flusso con `source.mortgage`;
- anteprima fino a «Salva» come gli altri campi (`hasUnsavedChanges`); l'aiuto di «Spesa del piano» aggiunge: «Se la
  scrivi a mano, scrivila senza il mutuo e le altre voci che hai tra i flussi: le aggiungono loro».

**Calcolatore › Base di calcolo** — una riga «Flussi nel tempo»: «4 · spostano il FIRE dal 2034 al 2029» (anno Base
senza flussi contro anno Base con flussi: il cammino RF6 rieseguito con la lista vuota); «4 · non spostano l'anno
FIRE» se uguale; senza flussi «nessuno: aggiungili nei Parametri». Gli esclusi: «1 escluso: manca l'età».

**Calcolatore › Scenari** — un segno per ogni una tantum sull'asse degli anni, con il nome nel tooltip; nessun segno per
le ricorrenti (la riga della Base di calcolo le dichiara).

**Riga «Ipotesi usate»** (`describeFireAssumptions`): «· 4 flussi datati» in Calcolatore, Coast, What If, Monte Carlo
e Proiezione; gli Obiettivi non leggono i flussi e la clausola non c'è.

**Monte Carlo e Proiezione › Parametri** — una riga in sola lettura sotto «Capitale iniziale»: «Flussi nel tempo: 4
(quelli dal FIRE partono dal primo anno)» / «(quelli dal FIRE non valgono nella Proiezione)», con il collegamento ai
Parametri del Calcolatore.

**What If** — il form dell'evento aggiunge **«Quando»** (anno, default l'anno in corso, «oggi»); il verdetto nomina
l'anno quando non è oggi («Se perdi il lavoro per 6 mesi nel 2029, il FIRE slitta di un anno»).

**Impostazioni › Parametri del piano** — riga «Flussi nel tempo» «4» (o «nessuno»), sola lettura, collegamento al
Calcolatore (The Declaration-Tile Rule).

### 12.8 Decisioni

| # | Stato | Decisione | Alternative scartate e motivo |
| --- | --- | --- | --- |
| D-F1 | **Presa** (04/10/2026) | **Un solo modello di flussi datati** per P4 e P5, tre forme (spesa ricorrente, entrata ricorrente, una tantum); P8 si aggancerà come sorgente `goal`. | Eventi (P4) e redditi (P5) separati: due liste e due regole per la stessa cosa. |
| D-F2 | **Presa** (04/10/2026) | **Ancora anno, età o FIRE**, durata in anni o per sempre; l'ancora FIRE solo per le ricorrenti. | Solo anni di calendario: il part-time «dopo il FIRE» non si potrebbe dire, perché l'anno FIRE è un risultato. |
| D-F3 | **Presa** (04/10/2026) | **Sezione «Flussi nel tempo» nei Parametri del Calcolatore**, salvata in `fireDatedFlows`, letta da tutte le schede. | Coast › Ipotesi accanto alle pensioni (la spesa del piano sta già nel Calcolatore); un documento Firestore a parte (più codice, nessun vantaggio a 20 voci). |
| D-F4 | **Presa** (04/10/2026) | **Le pensioni di Stato restano in Coast › Ipotesi** con l'IRPEF; i motori le sommano ai flussi; la sezione le elenca in sola lettura. | Migrarle a flussi: migrazione dei dati salvati e IRPEF riscritta per un caso solo. |
| D-F5 | **Presa** (04/10/2026) | **Mutuo collegato a Patrimonio**: rata e fine lette dalla proiezione del tile Mutuo a ogni apertura; rata fissa, già nel Cashflow. Senza rata collegata si scrive a mano. | Una copia a mano: la data di fine invecchia a ogni estinzione anticipata o cambio di rata. |
| D-F6 | **Presa** (04/10/2026) | **«Già nel Cashflow di oggi»** per i flussi attivi oggi (sì di default): il risparmio lo contiene, e la spesa del piano quando viene dal Cashflow. Se la spesa del piano è scritta a mano, i flussi si aggiungono sopra. | Chiedere per ogni flusso a quale delle due cifre appartiene: una domanda in più a cui pochi sanno rispondere. |
| D-F7 | **Presa** (04/10/2026) | **Requisito di oggi + valore attuale dei flussi** (RF5): temporanei al rendimento reale, permanenti all'SWR. Senza flussi nulla cambia. | Allungare la camminata all'indietro fino all'ultimo flusso: con rendimento reale sopra l'SWR il requisito scende da solo, e un figlio da 6.000 €/anno lo porterebbe da 750.000 a 732.000 € invece che a 821.875 €. |
| D-F8 | **Presa** (04/10/2026) | **Importi netti**, scritti dall'utente; l'eccedenza di un anno in cui le entrate superano la spesa **non si reinveste**, come per le pensioni. | IRPEF sui redditi (servirebbe sommarli alle pensioni per lo scaglione); reinvestire l'eccedenza (cambia la regola delle pensioni). |
| D-F9 | **Presa** (04/10/2026) | **What If con «Quando»**, default oggi (identico a ora); l'evento si somma ai flussi salvati. La regola «Do NOT add timed mid-projection cash events» della guida si riscrive. | What If solo «da oggi», con i flussi solo nel Calcolatore. |
| D-F10 | **Presa** (04/10/2026) | **Proiezione**: una tantum sempre, ricorrenti di calendario mentre si versa, ancore FIRE no. | Nessun flusso: la Proiezione resterebbe senza la vita intorno. |
| D-F11 | **Presa** (04/10/2026) | **Coast**: le una tantum prima dell'età obiettivo contano, le ricorrenti no (le copre il lavoro). | Contare anche le ricorrenti: Coast smetterebbe di rispondere a «posso smettere di versare?». |
| D-F12 | **Presa** (04/10/2026) | **Effetto nella Base di calcolo** («spostano il FIRE dal 2034 al 2029»), segni delle una tantum nel grafico, clausola nella riga «Ipotesi usate». | Un tile nuovo: la Base di calcolo è già il posto in cui si dice da dove vengono i numeri. |

**Scelte di default prese dall'agente** (dichiarate nel piano, accettate con le decisioni il 04/10/2026):
- **Fine anno** per ogni flusso, come il risparmio e il prelievo; l'anno in corso è l'anno 0 (una tantum = capitale di
  partenza, ricorrenti dall'anno prossimo).
- Un flusso **fisso** in euro nominali deve avere una fine.
- Nel Monte Carlo le ancore FIRE partono dal primo anno; la Spesa sostenibile considera i flussi, l'SWR personale no.
- Nei motori stocastici i flussi sono uguali in tutti i percorsi; nel Ventaglio le ancore FIRE seguono il FIRE di ogni
  percorso.
- Nessuna tassa sulle vendite dell'accumulo (risparmio negativo, una tantum in uscita prima del FIRE), come oggi per
  le spese dell'accumulo; dopo il FIRE le uscite pagano la tassa come i prelievi.
- Al massimo 20 flussi.
- La sorgente `goal` è nel tipo ma nessuna scheda la legge fino a P8.

### 12.9 Criteri di accettazione (valori di riferimento verificabili)

Esempio comune salvo dove indicato: `K` = 400.000 €, spesa del piano 30.000 € dal Cashflow, risparmio 20.000 €
indicizzato (RP7), un solo scenario g = 7%, π = 2% (r = 4,901961%), SWR 4%, nessuna pensione, ponte, tassa o costo.
Anni da oggi. Tolleranza ± 0,01 €.

| # | Caso | Valore atteso |
| --- | --- | --- |
| F1 | Nessun flusso | requisito di oggi 750.000,00 €, FIRE all'anno 8; ogni test esistente di `calculateFIREProjection`, `runAccumulationSimulation`, `runMonteCarloSimulation`, Coast e What If **identico** senza `fireDatedFlows` |
| F2 | Eredità 100.000 € fissi all'anno 10 | requisito di oggi 699.165,07 € (= 750.000 − 100.000/1,02^10/(1+r)^10), FIRE all'anno 7 |
| F3 | Part-time 9.600 € indicizzati, 10 anni dal FIRE | 675.517,14 € (= 750.000 − Σ_{j=1..10} 9.600/(1+r)^j), FIRE all'anno 7 |
| F4 | Figlio 6.000 € indicizzati, anni 2–21 | 821.875,46 € (= 750.000 + Σ_{j=2..21} 6.000/(1+r)^j), FIRE all'anno 10 |
| F5 | Mutuo 9.600 € fissi, già nel Cashflow, ultimo anno 8 | 581.371,04 € (= 750.000 + Σ_{j=1..8}(9.600/1,02^j − 9.600)/(1+r)^j − 9.600/0,04/(1+r)^8), FIRE all'anno 4 |
| F6 | Affitto 6.000 € indicizzati, per sempre, già nel Cashflow | 600.000,00 € (= 24.000/0,04), FIRE all'anno 5; risparmio di ogni anno invariato |
| F7 | F5 con la spesa del piano **scritta a mano** (30.000 €) | 807.324,47 € (= 750.000 + Σ_{j=1..8} 9.600/1,02^j/(1+r)^j), FIRE all'anno 8 |
| F8 | Part-time 40.000 € indicizzati, 5 anni dal FIRE (più della spesa) | 619.762,94 € (= 750.000 − Σ_{j=1..5} 30.000/(1+r)^j: l'eccedenza non si reinveste), FIRE all'anno 6 |
| F9 | Auto 30.000 € indicizzati, una tantum in uscita all'anno 3 | 775.987,86 € (= 750.000 + 30.000/(1+r)^3), FIRE all'anno 9 |
| F10 | F2 + F3 + F4 + F5 insieme | 541.877,22 €, FIRE all'anno 3 |
| F11 | RF3 con il mutuo di F5 | risparmio anno 5: 22.439,99 € (= 20.000·1,02^4 + 9.600·(1,02^4 − 1)); anno 9: 34.681,12 € (= 29.600·1,02^8) |
| F12 | RF6 con l'auto di F9 | capitale all'anno 3: 523.714,96 € contro 555.551,20 € senza (differenza 31.836,24 = 30.000·1,02^3) |
| F13 | RF8, volatilità 0, Azioni g = 5%, π = 2%, K = 1.000.000 €, N = 30, part-time 10.000 € indicizzati dal FIRE per 10 anni | prelievo massimo esatto 54.964,10 € = (K + 10.000·A_10)/A_30 con A_n = Σ_{s=1..n}(1,02/1,05)^s (senza flussi 50.632,09 €); RS3 stampa 54.900 € |
| F14 | RF8 come F13 con un'eredità di 200.000 € fissi all'anno 15 al posto del part-time | 55.503,07 € = (K + 200.000/1,05^15)/A_30; RS3 stampa 55.500 € |
| F15 | RF9, età 35, obiettivo 50, r di 7%/2%, spesa 30.000 €, SWR 4% | numero Coast di oggi 365.853,47 € senza flussi; con l'eredità di F2 315.018,54 €; con il figlio di F4 (contano solo gli anni 16–21) 380.755,83 € |
| F16 | RF5 con pensioni: `P_j` = 10.000 € dall'anno 12, part-time 40.000 € dal FIRE per 15 anni, T = 0 | `δ_j` = −30.000 negli anni 1–11 e −20.000 negli anni 12–15 (l'eccedenza si calcola dopo la pensione) |
| F17 | RF1 mutuo collegato: rata 800 €, prossima rata gennaio 2027, fine marzo 2034, anno in corso 2026 | importi 9.600 € l'anno dal 2027 al 2033, 2.400 € nel 2034, nulla dopo; `payoff = never` → escluso con il motivo |
| F18 | Coerenza A17 con flussi: volatilità 0, F10 | il Ventaglio coincide, float per float, con la curva Base di RF6, e la Distribuzione mette tutti i percorsi all'anno 3 |
| F19 | RS1–RS4 con flussi: S5 (§ 10.8) con il part-time di F13 seminato | `success(W)` rigiocato = `successRate` di «Esegui» a `W`, esattamente |
| F20 | What If, perdita di lavoro 6 mesi, reddito perso 40.000 €: Quando = oggi / Quando = anno 3 | oggi: risultato identico a prima della task; anno 3: il lato «dopo» è il cammino con una tantum in uscita di 20.000·1,02^3 = 21.224,16 € all'anno 3 |
| F21 | RF10 Proiezione, volatilità 0, K = 100.000 €, g = 5%, nessun risparmio, eredità 50.000 € fissi all'anno 5, N = 10 | valore nominale all'anno 10: 100.000·1,05^10 + 50.000·1,05^5 = 226.703,54 € |
| F22 | Round-trip e validazione | `fireDatedFlows` attraversa le cinque sedi (`settingsRoundTrip`); assente = nessun flusso; rifiutati: fisso senza fine, ancora FIRE su una tantum, importo 0, entrata negativa, durata 0, più di 20 flussi |
| F23 | Età mancante | un flusso ad età senza `userAge` è escluso dai motori e la Base di calcolo dice «1 escluso: manca l'età» |

F2–F15 e F21 sono calcolati con `/mnt/project-files/fire-simulazioni/p4p5-controllo.py` (cammino, requisito e forme
chiuse concordano al centesimo).

### 12.10 Task

Tre PR in sequenza, tutte dopo il merge di K1, branch da `main`, bozza verso `Ciocc128/net-worth-tracker:main`.

**F1 — Modello, requisito e Calcolatore (thread «impl», Sonnet 5.5)**
- `types/assets.ts`: `DatedFlow` e `fireDatedFlows`; le cinque sedi (`doc/guide/impostazioni.md`); riga in
  `describePlanParameters`.
- `lib/utils/datedFlows.ts` (nuovo, puro): `resolveDatedFlows(flows, { currentYear, userAge, mortgages })` → flussi
  risolti con finestre e motivi di esclusione (RF1); `buildFlowSchedule(resolved, { inflationRate, horizon,
  planExpensesOrigin })` → `savingsDelta(t)` (RF3), `lump(t)`, `needDelta(s, T)` (RF4); `flowsRequirementAdjustment(…)`
  (RF5). `lib/utils/datedFlowValidation.ts` (nuovo). Il mutuo: una funzione pura `mortgageFlowSchedule(summary, now)`
  accanto a `mortgageSummary.ts`.
- `fireService.ts`: `calculateFIREProjection(…, flows?: FlowSchedule)` (nono parametro, assente = identico),
  `resolveFireRequirement` con `flows`; `calculateCoastFIREProjection` con RF9; `calculateFIRESensitivityMatrix` passa
  i flussi.
- `useFireAssumptions`: aggiunge i flussi risolti (legge `useMortgageInstalments` per gli immobili collegati) e
  l'origine della spesa; `describeFireAssumptions` la clausola.
- `FireParametri.tsx` + un dialogo `DatedFlowDialog.tsx`; `BaseDiCalcoloTile` (riga e parole in `fireNarrative.ts`);
  `FIREProjectionChart` (segni delle una tantum); Età obiettivo e leva leggono il cammino con i flussi senza modifiche
  oltre agli argomenti.
- Test: `__tests__/datedFlows.test.ts` (F2–F12, F15–F17, F22, F23), `fireService.test.ts` (F1 regressione),
  `fireNarrative.test.ts`, `settingsRoundTrip.test.ts`.

**Esito di F1 (04/10/2026)** — fatto come da spec; scostamenti dichiarati: `mortgageFlowSchedule(summary)` non prende `now` (il mese è già nella proiezione del tile) e `MortgageSummary` guadagna `instalment` (la rata su cui gira `payoff`); i `Δs` si applicano a ogni camminata che riceve i flussi (anche con `indexSavings = false`, che nessuna scheda usa con i flussi); le clausole «· N flussi datati» e la riga della Base di calcolo ci sono in Calcolatore e Coast, **non** in What If, Monte Carlo e Proiezione finché F2/F3 non li fanno leggere i flussi (la clausola direbbe il falso); il Ventaglio punta ai bersagli del cammino (che includono i flussi) ma i suoi percorsi non li ricevono fino a F2. Criteri F1–F12, F15–F17, F22 (validazione e giro delle impostazioni) e F23 in `__tests__/datedFlows.test.ts`, `datedFlowsNarrative.test.ts`, `settingsRoundTrip.test.ts`; non toccati e quindi non eseguiti: F13, F14, F18, F19, F20, F21 (F2/F3).

**F2 — Motori stocastici (thread «impl», Sonnet 5.5) — dopo F1**
- `runAccumulationSimulation` (`flows?` nei parametri: RF7, accumulo e registro), `runWithdrawalLedger` /
  `ledgerSchedule` (RF8: le tabelle si calcolano una volta per `params`, come oggi), Proiezione (RF10).
- `MonteCarloTab.tsx`, `ProjectionTab.tsx`: la riga nei Parametri; la Spesa sostenibile senza modifiche oltre ai
  parametri.
- Test: F13, F14, F18, F19, F21; S10 e i test esistenti identici senza flussi.

**F3 — What If datato (thread «impl», Sonnet 5.5) — dopo F1**
- `types/whatIf.ts` (`whenYear?`), `whatIfService.ts` (RF11: `y = 0` invariato, `y ≥ 1` come flusso sovrapposto),
  il form e il verdetto (`whatIfNarrative.ts`).
- Test: F20, i test esistenti di What If identici.

**Documentazione** (ogni task per la sua parte): `doc/guide/fire.md` (i flussi, RF5 «una spesa in più non abbassa
mai il requisito», la regola sugli eventi datati riscritta; blind spots: flussi deterministici, eccedenza non
reinvestita, nessuna tassa nell'accumulo, mutuo collegato che cambia con le rate), `fire-coast.md` (RF9),
`fire-what-if.md` (Quando), `fire-monte-carlo.md` e `fire-proiezione.md` (la riga, RF8, RF10),
`doc/guide/impostazioni.md`, `CLAUDE.md`, `doc/guide/fork-scelte-ui.md`, `Draft Release Temp.md`.

**Criterio di fine** di ogni task: i suoi criteri verdi; `npx tsc --noEmit`, `npx eslint app components lib types e2e
scripts __tests__`, `TZ=Europe/Rome npx vitest run`. Le spec Playwright di FIRE (`e2e/fire*.spec.ts`,
`e2e/coast*.spec.ts`) e la verifica sui dati reali (`npm run mirror:seed`, con il mutuo collegato del proprietario) si
fanno in un thread sul computer del proprietario. Collaudo su anteprima Vercel: un flusso per forma, il mutuo
collegato, la riga della Base di calcolo, What If con Quando.

### 12.11 Rischi

| Rischio | Mitigazione |
| --- | --- |
| Un utente con la spesa del piano scritta a mano che **include** il mutuo lo conta due volte. | L'aiuto del campo lo dice (D-F6); la riga del mutuo nei Parametri ricorda «si aggiunge alla spesa del piano scritta a mano». |
| Il mutuo collegato cambia da solo l'anno FIRE quando si salda una rata o cambia il TAN. | È lo scopo (D-F5); la riga del flusso mostra la fine prevista di oggi. |
| Il requisito con flussi diverge dal registro «dal FIRE in poi» per la stessa ragione per cui diverge oggi (SWR contro rendimento reale). | RF5 non aggiunge divergenza: senza flussi è identico; dichiarato nella guida. |
| Le firme di `calculateFIREProjection` e dei motori crescono ancora. | Parametri opzionali con default neutro; la logica nuova in moduli nuovi; voce in `fork-scelte-ui.md`. |
| Conflitti con K1 su `fireAssumptions.ts` e le schede. | Implementazione dopo il merge di K1 (§ 11). |
