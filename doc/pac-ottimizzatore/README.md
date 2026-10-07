# PAC e Ottimizzatore — refactor (dossier)

> Scritto il 07/10/2026 (thread «spec», dalla card Todoist «Rivedere feature di calcolo allocazione e pac. Non mi
> piace, poco intuitiva, UI scarna, non si riesce a capire le potenzialità dello strumento, cosa si può fare e cosa
> no», label `epic-pac-ottimizzatore`). Decisioni PO1–PO15 **confermate dal proprietario** il 06–07/10/2026 nel
> thread; PO4 chiusa sull'opzione (a), «io acquisto a quote intere». I default dell'agente (§ 5.2) sono le opzioni
> consigliate: il proprietario può rovesciarle prima dell'implementazione. Base di codice: `main` del fork a
> `aea3ea5` (merge della PR #76).
>
> Il render approvato è in [`render-accumulo.html`](render-accumulo.html) (aprilo nel browser): dati d'esempio, i
> bollini viola rimandano alle decisioni. Specifiche chiuse che questo dossier modifica: `doc/pac-ate.md` (D1–D12),
> `doc/weight-optimizer-ate.md` (O1–O9), `doc/weight-optimizer-targeted-ate.md` (T1–T6). **Fuori perimetro: FIRE e
> Monte Carlo** (feature separate, decisione del proprietario).

---

## 1. Obiettivo

Una scheda **«Accumulo»** di Allocazione che risponde a «sto portando il portafoglio dove voglio, e cosa compro
questo mese?». Tre cose cambiano per l'utente:

1. **Un solo portafoglio modello** per strumento, salvato, da cui parte un PAC: non più tre liste di pesi che non si
   parlano (i target di terzo livello di Impostazioni, le posizioni del PAC, la proposta effimera dell'ottimizzatore).
2. **Un PAC che si usa in un gesto al mese**: «Registra» dalla riga della rata, la ricalibrazione proposta solo quando
   serve, un piano attivo che si rivede senza perdere la storia, le vendite parziali, i piani conclusi.
3. **Un ottimizzatore che si prova dove si decide**: gli obiettivi stanno nella stessa scheda, il risultato resta
   (il portafoglio modello), il rapporto si legge con le barre, si possono valutare strumenti che non si hanno.

E la traiettoria delle classi **mese per mese** è in vista, non nascosta in un modale.

## 2. Stato di partenza (verificato nel codice, 07/10/2026)

| Superficie | Dove | Cosa fa oggi |
| --- | --- | --- |
| `AccumuloTile` | Allocazione, pila sinistra (470 px a 1440; le sue due colonne si accendono da 720 px di tile, quindi mai sul desktop) | stati none · draft · active · done; righe della rata, striscia classi, Calendario, Interrompi |
| `AccumulationPlanDialog` | modale a 3 passi dal tile | Liquidità → Target (Manuale / Ottimizzato con `OptimizerPanel`) → Anteprima (con `ClassDriftChart`) |
| `ComposizioneIdealeTile` + `IdealCompositionDialog` | Allocazione, pila destra | ottimizzatore a sé in tre modalità; «Crea un PAC con questi pesi» (`weightsToSeedPositions`); il risultato non si salva |
| `IdealAllocationTile` | Impostazioni › Allocazione | gli obiettivi dell'ottimizzatore (`settings.idealAllocation`); il testo dell'interruttore nomina solo il PAC (`IdealAllocationTile.tsx:182`) |
| Verdetto della pagina | `buildAllocazioneVerdict` (`lib/utils/allocazioneNarrative.ts:183`) | l'ultima clausola è Versa (`nextMoneyClause`, «con 1000 € in più compreresti…»); il PAC ne è fuori per D1 |

**Difetti** (riprodotti o letti nel codice, analisi § 3):

| # | Difetto | Prova |
| --- | --- | --- |
| B1 | «Crea un PAC con questi pesi» porta nel PAC **ogni** candidato, anche un asset `frozen` e un conto di liquidità `tradable` | `buildStandaloneCandidates` (`weightOptimizer.ts:1682`) non filtra la liquidità; `weightsToSeedPositions` (`accumulationPlanUtils.ts:828`) copia tutto; `validateDraftAgainstAssets` dà `position_not_tradable` sul `frozen` e il piano non si attiva mai |
| B2 | L'avviso di riserva somma **tutti** gli asset di classe Liquidità, non i conti sorgente | `AccumuloTile.tsx:194-197` |
| B3 | Il Calendario non dice niente se una scrittura fallisce | `AccumulationCalendarDialog.tsx:100,119` (`console.error`) |
| B4 | Bottoni a 32 px sul telefono nei modali | `h-8` senza `h-11` in `AccumulationPlanDialog.tsx:704,707,732`, `OptimizerPanel.tsx:218`, `OptimizerReport.tsx:138-147`, `IdealCompositionDialog.tsx:406,440` |
| B5 | Il riquadro della bozza «Liquidità oggi» mostra il lordo dei conti | `AccumuloTile.tsx:390` (`liquidity.sourceCashEur` invece di `availableNowEur`) |

Cosa si **tiene** (analisi § 4): il motore puro con le dipendenze iniettate (`accumulationPlanUtils`, `weightOptimizer`,
`accumulationPlanMatching`, schema, 220 test), «proporre, mai scrivere da solo», la misura salvata a ogni rata (D11),
il modello QP dell'ottimizzatore con i conflitti, il solver ad active set (`activeSetQP.ts`), una sola sorgente delle
parole, la riserva intoccabile, D9 (quote intere).

## 3. Perimetro

**Incluso**
- I difetti B1–B5 (task A0, indipendente dal resto).
- La scheda «Accumulo» in Allocazione con i suoi tile e il suo verdetto; la frase del PAC nel verdetto di Bilanciamento
  (task A1).
- Gli obiettivi dell'ottimizzatore spostati da Impostazioni alla scheda, con prova prima del salvataggio (task A1).
- La traiettoria delle classi mese per mese in vista, con cursore sul mese (task A1).
- Il portafoglio modello, gli strumenti da valutare, un solo solver, il rapporto con le barre (task A2).
- Il PAC: parte dal portafoglio modello, «Rivedi il piano», ricalibrazione proposta, «Registra», vendite parziali,
  piani conclusi, suggerimento dell'entrata mensile, parole del passo 1 e del passo Target (task A3).

**Escluso**
- FIRE e Monte Carlo (feature separate).
- I motori di Versa, Ribilancia e Preleva; i target di Impostazioni (`specificAssets` compresi): restano di upstream.
- Le quote frazionate (PO4: D9 resta).
- Le vendite delle posizioni del piano oltre quella parziale al primo mese (un PAC che ribilancia è il Ribilancia).
- Commissioni, invio di ordini al broker, previsioni di prezzo, minusvalenze, ricerca di ETF.
- Il ritorno dei pesi dal PAC al portafoglio modello (il PAC ne fa una copia: modificare il piano non cambia il modello).
- Il PAC nelle email (card «FEAT Email: PAC, ottimizzatore e centri di costo», dopo questo refactor).
- La PR verso upstream (#420): aspetta la fine del refactor (PO14).

## 4. Casi d'uso

1. **Primo contatto.** Non ho mai usato la feature: la scheda vuota mi dice cosa fa e cosa non fa, con un'anteprima
   sui miei numeri (quanto ho nei conti, che rata ne verrebbe, dove andrebbero le classi).
2. **Disegno il portafoglio.** Imposto gli obiettivi nella scheda, premo «Ricalcola», vedo pesi, barre e conflitti, e
   salvo il risultato come portafoglio modello; correggo un peso a mano; aggiungo EIMI, che non ho, per valutarlo.
3. **Creo un PAC.** «Crea piano» parte dal portafoglio modello: euro, quote e classi a fine piano si vedono mentre
   scrivo i pesi, e il grafico mese per mese mostra anche i mesi di mezzo.
4. **Ogni mese.** Apro la scheda, premo «Registra» sulla riga di VWCE: il dialog del Registro arriva compilato, salvo
   e la riga si chiude. Se i prezzi sono cambiati, il tile propone la nuova rata e io la applico o la lascio.
5. **A metà piano cambio idea.** L'entrata mensile sale da 500 a 800 €: «Rivedi il piano», le rate chiuse restano e il
   calendario si rifà dal mese aperto.
6. **Ribilancio vendendo poco.** «Con vendite mirate» con un tetto di tasse: il PAC creato da lì porta con sé le
   vendite parziali al primo mese.
7. **Guardo indietro.** I piani conclusi o interrotti restano in una lista con quanto ho investito e dove sono finito.

## 5. Decisioni

### 5.1 Decisioni del proprietario

| # | Stato | Decisione | Alternative scartate e motivo |
| --- | --- | --- | --- |
| PO1 | **Presa** (06/10/2026) | **Un solo portafoglio modello** per strumento (pesi di mercato, con data e origine: a mano o dall'ottimizzatore), salvato e mostrato nella scheda; un PAC nuovo ne parte (copia). I target di terzo livello di Impostazioni non si toccano. | Tre liste che non si parlano (è la card); scrivere i pesi in `specificAssets` (sono % di una sottocategoria e non esprimono uno strumento composito o a leva, e cambiano il modello di upstream). |
| PO2 | **Presa** | Allocazione prende la `PageTabs`: **«Bilanciamento»** (la pagina di oggi senza i due tile del fork) e **«Accumulo»** con il suo verdetto e i suoi tile. Gli obiettivi di «Allocazione ideale» si spostano qui da Impostazioni. | Due tessere nelle pile (470 px, obiettivi a due pagine di distanza); una pagina nuova nel menu (una voce in più solo-fork, attrito a ogni merge). |
| PO3 | **Presa** | Con un PAC attivo, l'ultima clausola del verdetto di Bilanciamento nomina la rata del mese al posto di Versa. Il Piano › Versa resta com'è. Riapre D1 solo per questa clausola. | Tenere D1 (due risposte alla stessa domanda); far leggere a Versa i pesi del PAC (cambia il motore di upstream). |
| PO4 | **Presa (a)** (07/10/2026, «io acquisto a quote intere») | **Solo quote intere**: D9 resta, nessun interruttore. | Frazioni per piano o per posizione (nessun caso d'uso del proprietario). |
| PO5 | **Presa** | **«Rivedi il piano»** su un piano attivo: entrata mensile, riserva, mesi restanti, pesi, posizioni aggiunte o tolte. Le rate chiuse e le loro misure restano; il calendario si rifà dal primo mese ancora intatto. | Solo «Interrompi» (si perde la storia); versioni del piano come documenti collegati (stessa cosa con più schema). |
| PO6 | **Presa** | La ricalibrazione si **propone da sola** quando cambia almeno una quota della rata aperta o la riserva è toccata, con «Applica» e «Lascia così» in riga; il bottone fisso «Ricalibra rata» sparisce. | Bottone sempre presente che non dice se serve; riscrivere il calendario da solo (contro D8). |
| PO7 | **Presa** | **«Registra»** su ogni riga da fare o in ritardo apre il dialog del Registro già compilato; salvato l'acquisto, la riga si chiude collegata, senza «Conferma». Il Registro resta la verità. | Uscire, registrare, tornare, confermare; il PAC che scrive il Registro da solo (contro D10). |
| PO8 | **Presa** | Una vendita fuori piano può essere **parziale**, e «Con vendite mirate» la semina nel PAC creato da lì, al mese 1. Le posizioni del piano non si vendono da sole. | Le vendite calcolate si perdono; vendite in ogni mese (è il Ribilancia). |
| PO9 | **Presa** | **Piani conclusi** in una lista nella scheda. | Nessuno storico. |
| PO10 | **Presa** | **Strumenti da valutare** nel portafoglio modello (un asset a 0 quote, D7): l'ottimizzatore li considera. | Solo ciò che si ha; ricerca di ETF (fuori perimetro, serve una fonte). |
| PO11 | **Presa** | **Un solo solver**: l'active set per Ideale, Raggiungibile e Con vendite mirate; la discesa proiettata esce dall'ottimizzatore (`projectOntoBudgetBox` resta, la usa il motore a leva). | Due solver (8000 iterazioni, `not_converged` di routine, timeout dei test). |
| PO12 | **Presa** | Il **rapporto dell'ottimizzatore con le barre** (`TargetTick`: target e raggiunto), pesi con euro e quote, conflitti in frasi come oggi. | Colonna di righe mono. |
| PO13 | **Presa** | **Entrata mensile suggerita** al passo 1 dal risparmio del Cashflow, con la fonte scritta e un «Usa»; mai precompilata in silenzio. | Solo a mano. |
| PO14 | **Presa** | La PR verso upstream (#420) **aspetta il refactor**. | Proporre la forma di oggi; rinunciare a upstream. |
| PO15 | **Presa** (07/10/2026) | **Traiettoria delle classi mese per mese** in vista: nel tile «Classi del piano» e, dal vivo, nel pannello laterale del passo Target. Scostamento dal target in pp, misurato pieno e previsto tratteggiato, la banda della pagina, cursore sul mese, una riga che dice quando ogni classe rientra in banda. **A prezzi di oggi.** | Solo oggi e fine piano (si perdono i mesi di mezzo: una vendita al mese 1 può peggiorare una classe prima che il piano la recuperi); con rendimenti attesi (mescola il PAC col mercato). |

### 5.2 Default dell'agente

| # | Decisione | Alternative scartate e motivo |
| --- | --- | --- |
| D-A1 | Il portafoglio modello vive in una **collezione nuova** `modelPortfolios/{ownerId}` (un documento per account), con la regola Firestore di `accumulationPlans`. | Un campo delle impostazioni: cinque sedi da toccare (`doc/guide/impostazioni.md` § the FIVE places) per un documento con lo snapshot dell'ottimizzatore dentro, e la pagina Impostazioni non lo mostra. |
| D-A2 | I pesi del modello sommano **100 sugli strumenti** (pesi di mercato), senza Liquidità, `frozen` né conti: la stessa base dei pesi del PAC (D3). Lo strumento a sé li riscala dopo aver tolto i `frozen` (RM2). | Pesi sul portafoglio intero (un `frozen` a peso fisso dentro un PAC che non può comprarlo né venderlo è il difetto B1). |
| D-A3 | «Rivedi il piano» riscrive dal **primo mese intatto**: la rata aperta se nessuna sua riga è eseguita, saltata o collegata; altrimenti la successiva. | Riscrivere anche le righe ancora da fare della rata aperta (due regole per una rata a metà, e un piano la cui somma non torna). |
| D-A4 | Una vendita parziale su uno strumento che è anche posizione del piano è ammessa, mai totale; il valore della posizione per `B` è quello **dopo** la vendita. | Vietarla (le vendite mirate su uno strumento che resta nel modello si perderebbero); contare il valore prima della vendita (compra contro un valore che non avrai). |
| D-A5 | «Lascia così» sulla ricalibrazione si ricorda **sul piano**, con le quote proposte: riappare solo se la proposta cambia. | Stato locale del browser (riappare su ogni dispositivo e a ogni ricarica). |
| D-A6 | Gli obiettivi si modificano in un modale aperto dal tile «Obiettivi», con **«Prova»** (calcolo sulla bozza, nulla salvato) e **«Salva gli obiettivi»** (scrive `settings.idealAllocation`, come «Salva il piano» di FIRE H1). Impostazioni › Allocazione mostra un riassunto in sola lettura e il collegamento. | Modifica in riga nel tile (sei obiettivi con priorità, limiti e gruppi non stanno in 5 colonne); tenerli anche in Impostazioni (due posti dove cambiarli). |
| D-A7 | La scheda si apre con `?tab=accumulo`, come Cashflow; «Bilanciamento» resta la scheda predefinita. | Ricordare l'ultima scheda (una pagina che cambia faccia da sola). |
| D-A8 | L'entrata suggerita è il **risparmio annuo del Cashflow diviso 12** di `getAnnualCashflowData` (`lib/services/fireService.ts:944`, lo stesso dato che il Calcolatore FIRE legge), arrotondato per difetto alle decine di euro, con l'anno di riferimento. | Una media mensile nuova (un secondo modo di dire «risparmio» nell'app). |

## 6. Regole

Notazione: `B`, `L`, `L0`, `E`, `N` come in `doc/pac-ate.md` § 5; «posizione» = `PlanPosition`; prezzi in EUR con
`unitPriceEur`; valori con `calculateAssetValue` (iniettati, `PlanDeps`).

### 6.1 Portafoglio modello (PO1, PO10)

**RM1 — Il documento.** `modelPortfolios/{ownerId}`:

```ts
/** One instrument of the model portfolio. */
export interface ModelWeight {
  assetId: string;
  targetPercentage: number;   // market weight; Σ over the model === 100 (±0.01)
  /** True for an instrument held at 0 shares only to be evaluated (PO10, D7). */
  candidate?: boolean;
}

export interface ModelPortfolio {
  userId: string;             // ownerId (shared-account convention)
  weights: ModelWeight[];
  origin: 'manual' | 'optimizer';
  optimizerSnapshot?: OptimizerSnapshot;   // the same type the PAC already stores
  updatedAt: Date;
}
```

Nuovo tipo in `types/modelPortfolio.ts`; service `lib/services/modelPortfolioService.ts` (`getModelPortfolio`,
`saveModelPortfolio`, `deleteModelPortfolio`, client SDK, `removeUndefinedDeep`); regola Firestore identica nella
forma a quella di `accumulationPlans` (`firestore.rules:154`) con `match /modelPortfolios/{ownerId}`; query key
`modelPortfolio.byOwner(ownerId)` e hook `useModelPortfolio`. **Il deploy delle regole non avviene con Vercel**: va
scritto nel riepilogo della PR e fatto dal proprietario.

**RM2 — Cosa può starci** (una funzione pura, `toModelWeights`, in `lib/utils/modelPortfolio.ts`, usata dal
salvataggio, da «Crea un PAC» e dalla correzione di B1). Dati pesi `{ assetId, pct }`:

```
tieni = gli strumenti con resolveAllocationRole === 'tradable' e type !== 'cash'
fuori = gli altri, ognuno con il motivo: 'frozen' («bloccato in Impostazioni») · 'cashAccount' («conto di liquidità») · 'excluded'
pesi  = pct di tieni riscalati a Σ = 100, arrotondati a 0,01 con il resto (in centesimi di punto) sul peso più grande
```

Un fondo monetario (`assetClass === 'cash'`, `type !== 'cash'`) è uno strumento e resta. Se `tieni` è vuoto, nessun
salvataggio: «Nessuno strumento acquistabile fra i pesi proposti.».

**RM3 — Strumenti da valutare.** «Aggiungi strumento da valutare» apre l'`AssetDialog` nella modalità vuota di D7 e
aggiunge l'asset al modello con `candidate: true` e peso 0. Un candidato che l'utente compra resta nel modello (il
flag si toglie al primo salvataggio con quantità > 0). Togliere un candidato dal modello non cancella l'asset.

**RM4 — Lettura «oggi contro modello».** Base `M` = Σ valori degli strumenti del modello. Per ogni riga: `oggi% =
valore / M · 100`, `differenza € = (modello% − oggi%) / 100 · M`. Righe ordinate per peso del modello, i candidati in
fondo. Uno strumento posseduto, `tradable`, fuori dal modello compare sotto in una riga «Fuori dal modello» con il suo
valore (non nei conti di `M`).

### 6.2 Ottimizzatore (PO10–PO12)

**RO1 — Candidati.** Lo strumento a sé (`buildStandaloneCandidates`) prende gli strumenti `tradable` o `frozen` con
valore > 0 **e non conti di liquidità** (`type !== 'cash'`, B1), più i candidati del modello a 0 quote. I `frozen`
restano fissati al loro peso attuale come oggi, e RM2 li toglie quando si salva. I profili dei candidati a 0 quote
arrivano da `GET /api/portfolio/instrument-profiles` (`includeZeroQuantity`, già usato dal PAC).

**RO2 — Un solo solver.** Ideale e Raggiungibile risolvono con `solvePiecewiseQP` (`lib/utils/activeSetQP.ts`) a
moltiplicatore zero, cioè `solveAtMultiplier(…, mu = 0, …)` di `weightOptimizer.ts:1194` senza il termine di tassa;
«Con vendite mirate» resta com'è (già active set). Escono `solveQP`, `MAX_ITERATIONS_DEFAULT` e la discesa proiettata
dall'ottimizzatore; `SolverOptions.maxIterations` passa all'active set; `not_converged` resta solo per un active set che
non converge (mai visto su 1.600 portafogli, guida § «Il solver esatto»). Euristica del 2%, arrotondamento a 0,5 punti
e conflitti invariati.

**RO3 — Salvare.** Il tile «Portafoglio modello» ha «Ricalcola» (le tre modalità, l'Ideale predefinita) e, sul
risultato, «Salva come portafoglio modello»: `toModelWeights` (RM2), `origin: 'optimizer'`, lo snapshot del calcolo.
«Modifica a mano» apre la tabella dei pesi in modifica e salva con `origin: 'manual'` (lo snapshot resta: documenta il
punto di partenza, come nel PAC).

**RO4 — Il rapporto con le barre.** In `OptimizerReport` ogni obiettivo è una riga: nome, chip di priorità, cifra
«target → raggiunto» in mono e un `TargetTick` (target come tacca, raggiunto come barra). I conflitti restano frasi.
Una sola presentazione per lo strumento a sé, il passo Target del PAC e il modale degli obiettivi.

### 6.3 PAC (PO1, PO5–PO9, PO13)

**RP1 — Da dove parte.** «Crea piano» semina le posizioni dal portafoglio modello (`weightsToSeedPositions` sui pesi
del modello, un'unica posizione per strumento) e copia lo `optimizerSnapshot` se il modello lo ha. Il selettore
«Parti da» del passo Target offre: **Portafoglio modello** (predefinito quando esiste) · **Pesi di oggi** (i pesi di
mercato attuali degli strumenti `tradable`) · **Ricalcola con l'ottimizzatore** (il pannello Ottimizzato di oggi).
D2 cambia così: i pesi del piano sono una copia, modificabile, del modello.

**RP2 — Vendite parziali** (PO8, D-A4). `PlanDisposal` aggiunge:

```ts
  quantity?: number;     // shares to sell (integer > 0); absent = every share held at activation
  monthIndex?: number;   // installment index of the sale; absent = 1 (set by a revision, RP4)
```

- `estimatedProceedsEur` = `quantity × prezzo` all'attivazione (o alla revisione); assente `quantity`, il valore
  dell'intera posizione come oggi.
- `resolvePositionStates` riceve le vendite: il valore di una posizione è al netto delle quote in vendita non ancora
  eseguite o saltate (`valore − quantity × prezzo` per membro).
- `buildProjectedAssets` toglie `quantity` quote (non azzera) dal mese `monthIndex`; senza `quantity`, azzera come oggi.
- `validateDraftAgainstAssets`: vendita totale (senza `quantity`, o `quantity ≥` quote possedute) su un membro di una
  posizione → issue nuova `disposal_full_on_position`; `quantity` non intera o ≤ 0 → `disposal_quantity`.
- Semina da «Con vendite mirate»: per ogni strumento che il risultato vende, una vendita con `quantity =
  floor(vendita € / prezzo)` (0 → nessuna vendita); uno strumento portato a peso 0 è una vendita totale fuori piano.
- L'abbinamento (D10) è invariato: una vendita dello strumento nella finestra si propone; `executedAmountEur` come oggi.

**RP3 — Ricalibrazione proposta** (PO6, D-A5). Sulla rata aperta `i` il tile calcola `recalibrateInstallment(plan, i,
…)` a ogni lettura. La proposta compare se `liquidity.belowReserve`, oppure se esiste una riga con
`|suggestedQuantity − plannedQuantity| ≥ 1`, e se le quote suggerite differiscono da quelle ricordate in
`Installment.recalibrationDismissed?: { quantities: Record<string, number> }`. «Applica» → `applyRecalibration` (come
oggi); «Lascia così» → scrive `recalibrationDismissed` con le quote suggerite. Il bottone «Ricalibra rata» del footer
esce.

**RP4 — «Rivedi il piano»** (PO5, D-A3). Funzione pura `buildRevisedPlan(plan, revision, assetsById, deps, today)` in
`accumulationPlanUtils.ts`; service `revisePlan(planId, revision, input)` in `runTransaction`, solo su `active`.

```
revision = { monthlyInflowEur, reserveEur, remainingMonths, positions, disposals (le nuove) }
k        = la prima rata senza righe 'executed'/'skipped' né transactionIds   // D-A3
           (se non esiste: niente da rivedere, issue 'nothing_to_revise')
rate 1..k−1  invariate, misure comprese (deepEqual)
liquidità    = computeUsableLiquidity(revised liquidity, assets di oggi, disposals non eseguite,
                                      monthsRemaining = remainingMonths)
stati        = resolvePositionStates(positions, …, disposals)          // RP2
totali       = computeTotalPurchases(stati, liquidità.L)
calendario   = scheduleInstallments(totali, stati, remainingMonths, month(k)), indici rinumerati da k
months       = (k − 1) + remainingMonths      // 1..60, altrimenti issue 'months_range'
residualEur  = quello del nuovo calendario
le vendite nuove hanno monthIndex = k
revisions    = [...revisions, { at: today, fromIndex: k, before: { months, monthlyInflowEur, reserveEur } }]
```

`baseline` non cambia. Una posizione tolta resta posseduta: diventa fuori piano **senza** vendita, salvo che l'utente
scelga «Vendi» (RP2). Uno strumento aggiunto entra come posizione dal mese `k`. La rata aperta con righe eseguite
resta com'è (le righe ancora da fare restano da fare).

**RP5 — «Registra»** (PO7). `TransactionDialog` accetta due prop opzionali:

```ts
  /** Opens a new trade already filled in (the PAC's «Registra»). Ignored in edit mode. */
  prefill?: { type: 'buy' | 'sell'; quantity: number; linkedCashAssetId?: string; note?: string };
  /** Called once the trade is saved, with the server's result (the PAC links its line with it). */
  onCreated?: (result: AssetTransactionMutationResult, data: AssetTransactionFormData) => void;
```

La riga della rata passa `type: 'buy'`, `quantity: plannedQuantity`, il primo conto sorgente con saldo ≥ importo
(altrimenti il primo conto sorgente), `note: "PAC «<nome>», rata <i> di <N>"`; data di oggi e prezzo come il dialog li
propone già. In `onCreated` il tile chiama `setInstallmentLine(planId, i, positionId, { status: 'executed',
transactionIds: [result.transactionId], executedQuantity: data.quantity, executedAmountEur: data.quantity ×
prezzo EUR })` con il `measurementInput` (commissioni escluse, come D10). Le vendite (RP2) fanno lo stesso con
`type: 'sell'` e `setDisposal`. Un acquisto registrato altrove continua a passare dall'abbinamento.

**RP6 — Piani conclusi** (PO9). Dai piani `completed` e `cancelled` già letti da `getAccumulationPlans`, ordinati per
`closedAt` decrescente. Per riga: nome · periodo («gen 2026 – giu 2026», dal primo all'ultimo mese) · rate («6 / 6»,
«2 / 3 · interrotto») · investito («24.318 € su 24.500 €» = Σ `executedAmountEur` delle righe su `L` all'attivazione,
`max(0, baseline.sourceCashEur − reserveEur) + Σ estimatedProceedsEur + E × N`) · scostamento finale (lo scostamento
più grande in valore assoluto all'ultima misura salvata, contro i target correnti: «+0,6 pp su CL2»; «—» senza misure).
Nessuna azione oltre a leggere.

**RP7 — Entrata suggerita** (PO13, D-A8). Al passo 1, sotto «Entrata mensile», una riga: «Il tuo risparmio medio è di
1200 € al mese (Cashflow 2025).» con «Usa»; «(2026, finora)» quando `isAnnualized`. Con `annualSavings = 0` la riga
non c'è. Il campo non si riempie mai da solo.

**RP8 — Parole dell'editor.** Passo 1: «Rata mensile» e «Entrate nei N mesi» al posto di «Rata mensile (L₀/N + E)» e
«+ Entrate stimate (E × N)» (`accumulationNarrative.ts:493-494`); il riquadro «Liquidità oggi» diventa «Liquidità da
spendere» e mostra `availableNowEur` (B5). Passo Target: colonne Strumento · Tieni o vendi · Oggi · Target · Da
comprare · Al mese, con un segmentato «Tieni | Vendi» con la sua intestazione al posto del link «Nel piano/Da vendere»;
«Oggi» sulla stessa base `B` del target; «Da comprare» in euro con le quote sotto; il raggruppamento (D6) si fa con
«Raggruppa due strumenti» sotto la tabella, non con una casella davanti al nome.

### 6.4 Scheda, verdetti e traiettoria (PO2, PO3, PO15)

**RV1 — La pagina.** `app/dashboard/allocation/page.tsx` monta `PageTabs` con `bilanciamento` (predefinita) e
`accumulo`, `?tab=` come Cashflow (`getInitialTab`, `router.replace`). Bilanciamento: Bilanciamento, Per classe | Piano,
Esposizione, Previdenza (le due pile si rimisurano: il commento sulle altezze in `page.tsx` va riscritto). Accumulo:
verdetto della scheda, poi la griglia del render: **Questo mese** (7 colonne) | **Classi del piano** (5) ·
**Portafoglio modello** (7) | **Obiettivi** (5) · **Piani conclusi** (12); senza piano aperto il posto di «Questo mese»
e «Classi del piano» lo prende **Accumulo** (stato vuoto, RV4). La banda resta stato della pagina, condiviso dalle due
schede. Sotto `desktop:` un tile per riga nell'ordine scritto.

**RV2 — Verdetto di Bilanciamento** (PO3). `AllocazioneVerdictInput` aggiunge `pac: { monthTotalEur: number;
instrumentCount: number; monthLabel: string; allClosed: boolean } | null`. Con `pac` presente la clausola di Versa non
c'è e al suo posto: «il piano di accumulo compra questo mese 3134 € in 4 strumenti» oppure, a rata chiusa, «la rata di
ottobre del piano di accumulo è chiusa». Senza piano attivo la frase è identica a oggi. `monthTotalEur` = Σ
`plannedAmountEur` delle righe della rata aperta non saltate; `instrumentCount` = le loro posizioni.

**RV3 — Verdetto di Accumulo.** `buildAccumuloVerdict` in un modulo puro nuovo `lib/utils/accumuloSummary.ts` (le
parole in `accumulationNarrative.ts`):

| Stato | Titolo | Frase | Tono |
| --- | --- | --- | --- |
| nessun piano, con modello | «Nessun piano di accumulo aperto.» | «Nei conti di liquidità hai 36.500 €: un piano li spende in rate mensili verso il portafoglio modello.» | neutral |
| nessun piano, senza modello | «Nessun piano di accumulo aperto.» | «Nei conti di liquidità hai 36.500 €: un piano li spende in rate mensili verso i pesi che scegli.» | neutral |
| bozza | «Bozza pronta: 12 rate da 3208 € da novembre.» | «Attivala per fissare il calendario.» | neutral |
| attivo | «Ottobre: 3134 € in 4 acquisti, 1 registrato e 1 da confermare.» (le parti a zero si tolgono; «tutti registrati» quando lo sono) | «Rata 3 di 12, investiti finora 6402 € su 38.500 €.» + RV5 | warning con righe in ritardo, positive con la rata chiusa, altrimenti neutral |
| concluso | «Piano concluso: investiti 37.940 € su 38.500 €.» | «Chiudilo per aprirne un altro.» | positive |

«In ritardo» aggiunge «, 1 in ritardo» al titolo. I mesi in minuscolo nella frase, maiuscola a inizio titolo.

**RV4 — Stato vuoto.** Il tile «Accumulo» senza piano: la lettura del verdetto, un'anteprima sui numeri dell'utente
(con riserva predefinita 10.000 € e entrata 0 o quella suggerita da RP7, 12 rate, dal portafoglio modello o dai pesi di
oggi: «12 rate da X €», e le barre delle classi oggi → fine piano), poi due elenchi:
**Cosa fa** — divide liquidità ed entrate in rate mensili a quote intere · tiene intatta la riserva che scegli · vende
al primo mese ciò che lasci fuori, anche solo in parte · riconosce gli acquisti nel Registro e ti chiede solo di
confermare · ricalcola la rata quando i prezzi cambiano, se lo accetti · mostra mese per mese come si muovono le
classi, leva compresa.
**Cosa non fa** — non vende gli strumenti del piano per ribilanciare (c'è il Ribilancia) · non manda ordini al broker e
non conta le commissioni · un piano alla volta, al massimo 60 mesi · non sceglie strumenti che non hai indicato (puoi
aggiungerli da valutare).
Azioni: «Crea piano» · «Apri il portafoglio modello».

**RV5 — Traiettoria e rientro in banda** (PO15). `ClassDriftChart` aggiunge un cursore: `selectedIndex` e
`onSelect(index)`, puntatore e frecce sinistra/destra (il grafico è un solo punto di Tab), una linea verticale e un
punto per classe sul mese scelto; sotto, una riga di lettura «ottobre 2026 · oggi · Azioni −1,8 pp · …» (le classi
fuori banda in colore warning) e la legenda «misurato · previsto a prezzi di oggi · banda». Predefinito: il mese
aperto (piano attivo) o il mese 1 (bozza). Nuova funzione `describeBandReentry(trajectory, fromIndex, band)`:

```
per ogni classe fuori banda al punto fromIndex: il primo punto dopo fromIndex in cui |driftPp| ≤ bandForTarget(band, targetPct)
frase: «Nella banda: Liquidità da gennaio, Obbligazioni da marzo. Da marzo tutto il piano è in banda, se i prezzi restano quelli di oggi.»
        (ordinate per mese; «dal mese 6» nella bozza; senza classi fuori banda: «Tutte le classi sono già in banda.»;
         una classe che non rientra: «Obbligazioni resta fuori banda fino alla fine del piano.»)
```

Dove: nel tile «Classi del piano» (sopra le barre oggi → fine piano, che restano) e nel pannello laterale del passo
Target, ricalcolato da `buildDraftPreview` a ogni modifica dei pesi (con un ritardo di 300 ms dopo l'ultimo tasto). Il
Calendario tiene il suo grafico; il passo Anteprima resta il calendario dei mesi.

**RV6 — Obiettivi nella scheda** (PO2, D-A6). Il tile «Obiettivi» elenca gli obiettivi con priorità e la barra target →
raggiunto dal modello (dallo snapshot del modello; senza snapshot solo i target), e la prima frase dei conflitti.
«Modifica obiettivi» apre il modale con il modulo di `IdealAllocationTile` (estratto in un componente condiviso),
«Prova» (gira `runOptimizer` sulla bozza degli obiettivi e mostra il rapporto RO4, nulla salvato) e «Salva gli
obiettivi» (scrive `idealAllocation` con il pattern di `useFirePlan.ts:103`, unione con le impostazioni lette).
Impostazioni › Allocazione: al posto del tile, il riassunto `describeIdealAllocation` in sola lettura e il collegamento
«Modifica in Allocazione › Accumulo». Il testo dell'interruttore «Attiva» non nomina più solo il PAC.

## 7. Cosa vede l'utente

Il render [`render-accumulo.html`](render-accumulo.html) è la forma attesa, in quattro viste:

1. **Accumulo con un piano attivo** — verdetto (RV3); «Questo mese»: righe con stato e azioni (Registra, Conferma,
   Ignora, Scollega), la ricalibrazione proposta in riga (RP3), la barra dei mesi, il footer «A fine piano…» con
   Calendario · Rivedi il piano · Interrompi; «Classi del piano» col grafico mese per mese (RV5) sopra le barre;
   «Portafoglio modello» con oggi · modello · differenza in euro, i candidati marcati «da valutare», la frase sulle
   vendite mirate e Ricalcola · Modifica a mano · Aggiungi strumento da valutare; «Obiettivi» (RV6); «Piani conclusi»
   (RP6).
2. **Editor al passo Target** — «Parti da» (RP1), la tabella di RP8 con euro e quote dal vivo, il pannello laterale con
   la rata mensile, la composizione di `L`, «Pesi a 100,0%», le classi a fine piano e il grafico mese per mese.
3. **Nessun piano** — RV4.
4. **Bilanciamento con un PAC attivo** — RV2.

Le cifre del render sono d'esempio; le parole e la struttura sono quelle da implementare, salvo dove questo dossier le
scrive diversamente (vale il dossier).

## 8. Criteri di accettazione (valori di riferimento verificabili)

Tolleranza: ± 0,01 € sugli importi, ± 0,0001 punti sulle percentuali, quote esatte. Fixture comune **F**: VWCE 120 €
(100 quote), XDEM 60 € (**200** quote), conto CONTO 30.000 € (sorgente), riserva 10.000 €, `E` = 500 €, `N` = 10,
primo mese 2026-11, posizioni VWCE 70% e XDEM 30%, vendita parziale di XDEM 100 quote. I valori di PP1 e PP2 sono stati
calcolati il 07/10/2026 con le funzioni di oggi (`computeUsableLiquidity`, `resolvePositionStates`,
`computeTotalPurchases`, `scheduleInstallments`), mettendo a mano XDEM a 100 quote per simulare RP2.

### Task A0 — difetti

| # | Caso | Atteso |
| --- | --- | --- |
| PA1 | B1: pesi VWCE 50, XDEM 25, FONDO (`frozen`) 15, CONTO (`type: 'cash'`, `tradable`) 10 → «Crea un PAC con questi pesi» | posizioni VWCE 66,67 e XDEM 33,33; `validateDraftAgainstAssets` senza issue; il modale dice «FONDO resta fuori: bloccato in Impostazioni. CONTO resta fuori: è un conto di liquidità.» |
| PA2 | B2: conti A 5.000 € (sorgente) e B 40.000 € (non sorgente), riserva 10.000 € | avviso di riserva con 5.000 €; `belowReserve` vero |
| PA3 | B3: `setLineMutation` rifiutata nel Calendario | la riga di stato del modale mostra `describeWriteError(error)`; nessun `console.error` come unica traccia |
| PA4 | B4: i bottoni dei quattro modali a 390 px | altezza ≥ 44 px (`h-11 … desktop:h-8`, la convenzione del tile) |
| PA5 | B5: bozza con conto 30.000 € e riserva 10.000 € | riquadro «Liquidità da spendere» = 20.000 € |

### Task A1 — scheda, verdetti, traiettoria, obiettivi

| # | Caso | Atteso |
| --- | --- | --- |
| PT1 | `/dashboard/allocation?tab=accumulo` | apre Accumulo; senza parametro Bilanciamento; Bilanciamento non contiene più `AccumuloTile` né `ComposizioneIdealeTile` |
| PT2 | RV2 con rata aperta da 3134 € su 4 strumenti | la frase termina con «; il piano di accumulo compra questo mese 3134 € in 4 strumenti.»; senza piano attivo i test esistenti di `buildAllocazioneVerdict` restano verdi senza modifiche |
| PT3 | RV2 a rata chiusa, ottobre | «…; la rata di ottobre del piano di accumulo è chiusa.» |
| PT4 | RV3, i cinque stati della tabella | titoli e frasi esatti della tabella, tono come indicato |
| PT5 | RV5, traiettoria con scostamenti (Azioni, Obbligazioni, Materie prime, Carry, Liquidità) per gli indici 0–12: Obbligazioni −5,0 −4,2 −3,5 −2,9 poi lineare a −0,9 al 12; Liquidità 12,4 10,1 7,8 5,6 4,3 3,0 1,9 poi lineare a 0,5; le altre tre classi a 0 in ogni punto; banda assoluta ±2 pp; `fromIndex` 3; mesi da luglio 2026 | «Nella banda: Liquidità da gennaio, Obbligazioni da marzo. Da marzo tutto il piano è in banda, se i prezzi restano quelli di oggi.» |
| PT6 | RV5, cursore | frecce destra/sinistra spostano il mese di uno, fermandosi a 0 e N; la riga di lettura cambia; `aria-label` del grafico invariato nelle cifre |
| PT7 | RV6 | «Salva gli obiettivi» scrive `idealAllocation` e nient'altro delle impostazioni cambia (round trip); «Prova» non scrive; Impostazioni › Allocazione non ha più il modulo |

### Task A2 — portafoglio modello e ottimizzatore

| # | Caso | Atteso |
| --- | --- | --- |
| PZ1 | RM2 come PA1 | `toModelWeights` dà VWCE 66,67, XDEM 33,33 e due righe «fuori» con i motivi `frozen` e `cashAccount` |
| PZ2 | RM2, tre pesi 33,333…/33,333…/33,333… | 33,34 / 33,33 / 33,33 (il resto sul primo dei pesi più grandi, ordine dei dati) |
| PZ3 | RM1 | salvare e rileggere restituisce gli stessi pesi; Σ ≠ 100 ± 0,01 o un `frozen` rifiutati dal service con un messaggio |
| PZ4 | RM4: modello VWCE 60 / XDEM 40 su F prima della vendita (VWCE 12.000, XDEM 12.000) | `M` 24.000; oggi 50 / 50; differenza +2.400 € e −2.400 € |
| PZ5 | RO1, un candidato EIMI a 0 quote con un obiettivo «Emergenti nell'azionario ≥ 10%» essenziale | EIMI fra i candidati e con peso > 0 in Ideale |
| PZ6 | RO2 sui fixture di `__tests__/weightOptimizer*.test.ts`, Ideale e Raggiungibile | `J(nuovo) ≤ J(vecchio) · (1 + 1e-9)` sui pesi grezzi; dopo l'arrotondamento a 0,5 pesi identici, o la differenza elencata nella PR con i due `J`; `solveQP` non esiste più |
| PZ7 | RO2, tempo | ≤ 5 ms per calcolo sul fixture reale a 12 candidati; `weightOptimizer.test.ts` non va più in timeout nel container |
| PZ8 | RO4 | ogni obiettivo del rapporto ha un `TargetTick` con target e raggiunto; i bottoni ≥ 44 px a 390 px |

### Task A3 — PAC

| # | Caso | Atteso |
| --- | --- | --- |
| PP1 | RP2 su F (vendita parziale 100 quote XDEM) | `L0` 26.000 €, `L` 31.000 €; acquisti VWCE 22.300 €, XDEM 8.700 €; rate VWCE 18, 19, 18, 19, 18, 19, 19, 18, 19, 18 (185) e XDEM 14, 15, 14, 15, 14, 15, 14, 15, 14, 15 (145); residuo 100 €. Per confronto, senza RP2 (valore di XDEM prima della vendita) gli acquisti sarebbero 26.500 € e 4.500 € |
| PP2 | RP4 su PP1 dopo tre rate eseguite come da calendario a prezzi invariati (VWCE 155 quote, XDEM 143, CONTO 28.320 €, vendita eseguita), revisione `E` = 800 €, 7 mesi restanti | `k` = 4; rate 1–3 identiche (misure comprese); `L0` 18.320 €, `L` 23.920 €; acquisti VWCE 17.170 €, XDEM 6.750 €; rate 2027-02…2027-08 VWCE 20, 20, 21, 20, 21, 20, 21 e XDEM 16 ogni mese; residuo 40 €; `months` 10; una voce in `revisions` con `fromIndex` 4 e `before.monthlyInflowEur` 500 |
| PP3 | RP4, stessa revisione con 10 mesi restanti / con 58 | `months` 13 / issue `months_range` (61 > 60) |
| PP4 | RP4, rata 4 con una riga già eseguita | `k` = 5; la rata 4 resta com'è |
| PP5 | RP2, validazione | vendita totale di XDEM mentre XDEM è posizione → `disposal_full_on_position`; `quantity` 2,5 → `disposal_quantity` |
| PP6 | RP2, semina da «Con vendite mirate» che vende 6.916 € di XDEM a 60 € | vendita con `quantity` 115 (6.900 €) |
| PP7 | RP3 | proposta assente se nessuna quota cambia e la riserva è intatta; presente se una riga passa da 18 a 17; dopo «Lascia così» assente finché le quote suggerite restano quelle; ricompare se cambiano |
| PP8 | RP5 | salvato il dialog compilato, la riga è `executed` con `transactionIds` = [l'id restituito], `executedQuantity` e `executedAmountEur` = quote × prezzo EUR; l'abbinamento non propone più quell'operazione |
| PP9 | RP6, piano completato 6/6 con 24.318 € eseguiti e `L` 24.500 €, ultima misura con CL2 a +0,6 pp | riga «gen 2026 – giu 2026 · 6 / 6 · 24.318 € su 24.500 € · +0,6 pp su CL2» |
| PP10 | RP7, `annualSavings` del 2025 = 14.400 € / 14.455 € / 0 | «Il tuo risparmio medio è di 1200 € al mese (Cashflow 2025).» in entrambi i primi due casi (1200 e 1204,58 per difetto alle decine); con 0 nessuna riga. Il campo resta vuoto finché non si preme «Usa» |
| PP11 | RP1 | un piano creato con un modello VWCE 60 / XDEM 40 ha due posizioni a 60 e 40 e lo snapshot del modello; «Pesi di oggi» su F dà 50 / 50 |

## 9. Task

Ordine: **A0 → A1 → A2 → A3**, una PR ciascuno, in bozza verso `main`. A0 è indipendente e piccola. A2 viene prima di
A3 (diversamente dall'analisi § 7) perché il PAC parte dal portafoglio modello (RP1): senza il modello l'editor di A3
avrebbe un «Parti da» a metà. Thread «impl» su Sonnet 5.5 (regola del progetto). Ogni task crea la sua card Todoist
«IMPL …».

### Task A0 — Difetti B1–B5

**Moduli**: `lib/utils/modelPortfolio.ts` con `toModelWeights` (RM2: nasce qui e A2 lo riusa);
`ComposizioneIdealeTile`/`IdealCompositionDialog` («Crea un PAC» passa da `toModelWeights` e dice cosa resta fuori);
`buildStandaloneCandidates` senza conti di liquidità (RO1, solo il filtro); `AccumuloTile.tsx` (B2 sui
`sourceCashAssetIds`, B5); `AccumulationCalendarDialog.tsx` (B3, stato del modale come `TransactionDialog`); i bottoni
di B4.
**Test**: `__tests__/modelPortfolio.test.ts` (PA1, PZ1, PZ2); `weightOptimizer.test.ts` (candidati senza conti);
PA2 e PA5 in una funzione pura estratta dal tile (per esempio `summarizeReserve` in `accumulationPlanUtils.ts`).
**Documentazione**: `doc/guide/accumulo.md` e `doc/guide/ottimizzatore.md` (i difetti chiusi, il filtro dei candidati).
**Fine**: PA1–PA5; `npx tsc --noEmit`, `npx eslint app components lib types e2e scripts __tests__`,
`TZ=Europe/Rome npx vitest run`. PA4 si misura sul Mac con `e2e/allocation.mobile.spec.ts`.

### Task A1 — Scheda «Accumulo» (PO2, PO3, PO15, obiettivi)

**Moduli**: `app/dashboard/allocation/page.tsx` (RV1); `components/allocation/tiles/` — `AccumuloTile` si divide in
`QuestoMeseTile`, `ClassiDelPianoTile` e lo stato vuoto (RV4), `ObiettiviTile` (RV6), `PianiConclusiTile` arriva in A3,
`ComposizioneIdealeTile` resta com'è nella scheda fino ad A2; `lib/utils/accumuloSummary.ts` (RV3) e le parole in
`accumulationNarrative.ts`; `buildAllocazioneVerdict` (RV2); `ClassDriftChart` (RV5) e `describeBandReentry`; il modulo
degli obiettivi estratto da `IdealAllocationTile` e la sua versione in sola lettura in Impostazioni (RV6).
**Test**: `allocazioneNarrative.test.ts` (PT2, PT3), `accumuloSummary.test.ts` (PT4), `accumulationNarrative.test.ts`
(PT5), `settingsRoundTrip.test.ts` (PT7).
**Documentazione**: `doc/guide/allocazione.md` (le due schede, la clausola del PAC nel verdetto, il nuovo commento
sulle pile), `doc/guide/accumulo.md`, `doc/guide/impostazioni.md` (il tile tolto), `doc/guide/fork-scelte-ui.md`,
`CLAUDE.md` (Key Features e Latest), `DESIGN.md` solo se una regola nominata cambia (non previsto).
**Fine**: PT1–PT7 e i comandi di A0. Sul Mac: `e2e/allocation*.spec.ts` (le spec che cercano i due tile sulla scheda
predefinita vanno aggiornate nella PR, dichiarandolo) e il collaudo sull'anteprima Vercel con `mirror:seed`.

### Task A2 — Portafoglio modello e ottimizzatore (PO1, PO10–PO12)

**Moduli**: `types/modelPortfolio.ts`, `lib/services/modelPortfolioService.ts`, `firestore.rules`, `lib/query/queryKeys.ts`,
`lib/hooks/useModelPortfolio.ts` (RM1); `lib/utils/modelPortfolio.ts` (RM4, `describeModelVsToday`);
`PortafoglioModelloTile` al posto di `ComposizioneIdealeTile` (tabella oggi · modello · differenza, Ricalcola, Modifica
a mano, Aggiungi strumento da valutare, frase sulle vendite mirate); `IdealCompositionDialog` diventa il modale di
«Ricalcola» con «Salva come portafoglio modello» (RO3); `weightOptimizer.ts` (RO1 candidati, RO2 un solver);
`OptimizerReport.tsx` (RO4); `AssetDialog` riusato nella modalità vuota per RM3.
**Test**: `modelPortfolio.test.ts` (PZ3, PZ4), `weightOptimizer.test.ts` e gli altri `weightOptimizer*.test.ts` (PZ5–PZ7;
la regressione T6 e il controllo incrociato restano), un test di render del rapporto se il repo ne ha per i tile
(PZ8, altrimenti sul Mac).
**Documentazione**: `doc/guide/ottimizzatore.md` (un solver, i candidati da valutare, il modello; la sezione «Perché un
solver esatto» diventa la sola), `doc/weight-optimizer-ate.md` e `doc/weight-optimizer-targeted-ate.md` (una nota in
testa: superate da questo dossier per PO1, PO10–PO12), `CLAUDE.md` (Key Files: i nuovi moduli), `fork-scelte-ui.md`.
**Fine**: PZ1–PZ8 e i comandi di A0. **Il deploy della regola Firestore lo fa il proprietario** (scritto nel corpo della
PR, con il comando). Sul Mac: `e2e/allocation*.spec.ts`, collaudo con `mirror:seed`.

### Task A3 — PAC (PO1 lato PAC, PO5–PO9, PO13)

**Moduli**: `types/accumulationPlan.ts` (`PlanDisposal.quantity`, `monthIndex`; `Installment.recalibrationDismissed`;
`AccumulationPlan.revisions`); `accumulationPlanUtils.ts` (RP2 in `resolvePositionStates` e `buildProjectedAssets`,
`buildRevisedPlan`); `accumulationPlanSchema.ts` (le issue nuove); `accumulationPlanService.ts` (`revisePlan`,
`dismissRecalibration`); `TransactionDialog.tsx` (RP5); `AccumulationPlanDialog.tsx` (RP1, RP7, RP8 e la modalità
«Rivedi il piano», stessa forma con il passo 1 che chiede i mesi restanti); `QuestoMeseTile` (RP3, RP5);
`PianiConclusiTile` (RP6); «Con vendite mirate» semina le vendite (RP2). `AccumulationRecalibrateDialog` esce se la proposta in riga (RP3) lo rende inutile; il Calendario resta.
**Test**: `accumulationPlanUtils.test.ts` (PP1–PP4, PP6, PP11), `accumulationPlanSchema.test.ts` (PP5),
`accumulationNarrative.test.ts` (PP9, PP10), un test puro della condizione di PP7, PP8 con il servizio simulato come
negli altri test del tile o sul Mac.
**Documentazione**: `doc/guide/accumulo.md` (rivedi, vendite parziali, registra, storico; i blind spot: la rata aperta
a metà non si rivede, D-A3), `doc/pac-ate.md` (nota in testa: D2, D5 superate da PO1 e PO8; D1 per PO3), `CLAUDE.md`,
`Draft Release Temp.md`.
**Fine**: PP1–PP11 e i comandi di A0. Sul Mac: `e2e/allocation*.spec.ts` e un giro completo su `mirror:seed` (crea dal
modello, registra una riga, rivedi, interrompi, storico).

## 10. Rischi

| Rischio | Mitigazione |
| --- | --- |
| Un piano attivo in produzione con i campi vecchi. | Tutti i campi nuovi sono opzionali con l'assenza che vale il comportamento di oggi (`quantity` assente = tutto, `monthIndex` assente = 1, nessuna `revisions`). |
| RO2 cambia di qualche mezzo punto un peso arrotondato. | PZ6: si accetta solo un `J` non peggiore, e ogni differenza dopo l'arrotondamento è elencata nella PR. |
| La regola Firestore non deployata: il modello non si salva. | Messaggio d'errore del service in chiaro; il deploy è nel corpo della PR di A2 e nel riepilogo al proprietario. |
| Gli obiettivi tolti da Impostazioni: chi li cercava lì non li trova. | Il riassunto in sola lettura con il collegamento resta in Impostazioni (RV6). |
| Merge con upstream su `page.tsx` di Allocazione e su `TransactionDialog`. | Le schede sono un involucro attorno alla pagina di oggi; le due prop di `TransactionDialog` sono opzionali. Voce in `fork-scelte-ui.md`. |
| La previsione mese per mese letta come una promessa. | «previsto a prezzi di oggi» nella legenda e nella frase di rientro (RV5). |
