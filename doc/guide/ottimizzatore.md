# Allocazione › Ottimizzatore dei pesi

> **Quando aprire questa guida** — chi tocca `lib/utils/{weightOptimizer,weightOptimizerNarrative,boxProjection,
> activeSetQP,accumulationPlanUtils}.ts`, `lib/constants/geoAreas.ts`, `lib/server/exposure/profileResolver.ts`
> (le parti su `otherAreaSplit` e `includeZeroQuantity`), `app/api/portfolio/instrument-profiles/route.ts`,
> `lib/hooks/{useInstrumentProfiles,useOptimizerGeographyReference}.ts`,
> `components/settings/IdealAllocationTile.tsx`, `components/allocation/{OptimizerPanel,OptimizerReport,
> IdealCompositionDialog}.tsx` o `components/allocation/tiles/ComposizioneIdealeTile.tsx`. La specifica
> chiusa è `doc/weight-optimizer-ate.md` (§1 le decisioni funzionali O1–O9), la terza modalità ha la sua in
> `doc/weight-optimizer-targeted-ate.md` (T1–T6); questa guida ne è la
> traduzione operativa e i limiti trovati scrivendo il codice. Prerequisito: la feature PAC
> (`doc/pac-ate.md`, `doc/guide/accumulo.md`).

> **Refactor in corso (dal 07/10/2026)** — `doc/pac-ottimizzatore/README.md` ridisegna questa feature con la scheda
> «Accumulo» di Allocazione, il portafoglio modello e le decisioni PO1–PO15; i task A0–A3 aggiornano questa guida
> man mano. Dove il dossier e questa guida divergono, per il lavoro nuovo vale il dossier.

## Cosa fa

Il motore (`optimizeWeights`, `lib/utils/weightOptimizer.ts`) propone i **pesi di mercato** degli
strumenti candidati a partire dagli obiettivi di "Allocazione ideale" (Impostazioni → Allocazione):
classi, leva, **secondo livello** (le sottocategorie di una classe — significato libero, deciso
dall'utente: fattori per l'azionario, durata per l'obbligazionario, altro per un'altra classe; il
motore non lo interpreta, legge solo i pesi che l'utente ha assegnato), geografia dell'azionario in
tre macro-aree, limiti per strumento e per gruppo. **Il terzo livello (`specificAssets`, i target sui
singoli strumenti) non è mai un input del motore**: è esattamente ciò che il motore calcola, e ogni
punto d'ingresso lo dichiara (`OPTIMIZER_SPECIFIC_ASSETS_NOTE`) invece di farlo sparire nel calcolo.
In codice, `factorObjectives`/`kind: 'factor'`/gli id `factor:…` restano il nome del campo persistito
(dati già salvati in produzione) — "factor" lì significa "secondo livello", non "fattore" in senso
stretto.

**Due punti d'ingresso, un solo motore**: il passo Target del PAC (`OptimizerPanel`, i candidati sono
le posizioni della bozza) e lo strumento a sé di Allocazione (`ComposizioneIdealeTile` →
`IdealCompositionDialog`, i candidati sono gli asset tradable del portafoglio, uno per strumento, un
`frozen` fissato al suo peso attuale) — entrambi passano da `runOptimizer` (`weightOptimizer.ts`,
candidati + `optimizeWeights` in una chiamata) e condividono la stessa presentazione del rapporto
(`OptimizerObjectivesReport`, `components/allocation/OptimizerReport.tsx`); solo la tabella dei pesi e
l'azione finale sono proprie di ciascuno — il PAC scrive `targetPercentage` sulle sue posizioni
("Usa questi pesi"), lo strumento a sé propone di aprire un PAC nuovo già seminato con quei pesi
("Crea un PAC con questi pesi", `weightsToSeedPositions` in `accumulationPlanUtils.ts`) o mostra il
motivo per cui non può («Hai già un piano aperto»). I pesi restano modificabili a mano ovunque —
l'ottimizzatore non scrive mai da solo, propone soltanto (stessa filosofia del matching col ledger,
doc/guide/accumulo.md § Abbinamento).

**Tre modalità, la terza solo nello strumento a sé** (2026-09-27, `doc/weight-optimizer-targeted-ate.md`):
**Ideale** ignora il posseduto e vende tutto ciò che è in eccesso; **Raggiungibile col PAC** non scende mai
sotto il posseduto (il PAC non vende); **Con vendite mirate**, in mezzo, vende solo ciò che conviene di più
finché le tasse stimate restano sotto un **tetto in euro** («Tasse massime (€)», vuoto = 0), e mai gli
strumenti spuntati **«Non vendere»** (stato del dialog, mai persistito). Ordine nel selettore: Ideale · Con
vendite mirate · Raggiungibile. Solo in `IdealCompositionDialog`: il PAC (`OptimizerPanel`) resta a due
modalità (T4). La modalità mirata non chiede un importo — si può ribilanciare con 0 € da versare — e in essa
la tabella mostra le righe (nome, peso attuale, casella) **prima** di «Calcola», perché i blocchi si mettono
prima del calcolo; dopo, due colonne in più: la tassa stimata sulle righe in vendita («0,00 €» su una
vendita in perdita, «—» sulle altre; sul telefono la colonna «Differenza» le cede il posto — sei colonne
misuravano 393 px in un corpo di 356 a 390, collaudo del 2026-09-27, `e2e/allocation.mobile.spec.ts`) e una riga del totale (`describeTargetedSaleTotal`: «Vendi X €, paghi
circa Y € di tasse (tetto Z €).», «…: è l'Ideale, il tetto di Z € non serve.», «Nessuna vendita…»). La tassa
per euro venduto è `taxPerEuroSoldOf` (§3 della ATE: quota di plusvalenza sul prezzo × aliquota, costo
fiscale da `costBasisPerUnitEur`, 26% o l'aliquota dello strumento): una posizione in perdita costa 0, un
costo fiscale sconosciuto (estero senza `averageCostEur`) è `null` e rende lo strumento **non vendibile** —
casella spuntata e disabilitata, «Costo fiscale sconosciuto»; un `frozen` idem, «Bloccato in Impostazioni».
Lo snapshot del PAC creato da qui porta `mode: 'targeted'`, `taxCapEur` e `lockedKeys`.

**Le parole degli obiettivi hanno UNA sorgente** (`buildIdealAllocationInput` in `settingsNarrative.ts`,
2026-09-25): Impostazioni, il pannello Ottimizzato del PAC, `ComposizioneIdealeTile` e il suo dialog ne
costruivano ciascuno una copia a mano, e le due di Allocazione stampavano l'id dell'indice
(«geografia come wt-global-efficient-core») invece del suo nome curato. Le frasi sono due, sulla
stessa lista: `describeIdealAllocation` («Il PAC può proporre i pesi da N obiettivi…», Impostazioni e
PAC) e `describeIdealComposition` («Il portafoglio che rispetta meglio i tuoi N obiettivi, strumento
per strumento…», lo strumento a sé, che non è il PAC — parole del proprietario). Il tile sta nella
colonna destra di Allocazione, sotto il Piano (doc/guide/allocazione.md).

**Un avviso preventivo, non un blocco**: `findSecondLevelGaps` (stessa normalizzazione di
`calculateCurrentAllocationSnapshot`, `sub?.trim() || NO_SUBCATEGORY_LABEL`) elenca gli strumenti
tradable/frozen di valore positivo senza una sottocategoria riconosciuta dalla classe, mostrato sia
in Impostazioni sotto la riga "Secondo livello" sia in entrambi i pannelli prima di "Calcola" — non
impedisce mai il calcolo, dice solo quali euro finiranno in "Senza sottocategoria" o generanno
`factor_unmapped`.

## La formulazione

Un problema quadratico convesso: ogni obiettivo morbido `k` è una riga lineare `r_k(w)` in punti
percentuali (o una cerniera `max(0, ...)` per un tetto di gruppo), penalizzata al quadrato e pesata
per priorità:

```
J(w) = Σ_k λ(priority_k) · r_k(w)²  +  ε · Σ_i (100 · (w_i − wRef_i))²
λ: essenziale 1000, alta 100, media 10, bassa 1        ε = 0,01
```

I vincoli rigidi — somma = 100% e il box `[lowerPct, upperPct]` di ogni candidato — sono i vincoli del
solver, mai un termine di penalità; `projectOntoBudgetBox` (`boxProjection.ts`, la proiezione del motore a leva
di Allocazione) ne dà solo il punto di partenza. Il termine di regolarizzazione `ε` rende l'ottimo
unico (senza, più configurazioni di pesi darebbero lo stesso `J`); il riferimento `wRef` è il peso di
mercato corrente dei candidati (uniforme se il totale è zero).

**Un solo solver** (A2, RO2, PO11): l'**active set esatto** di `lib/utils/activeSetQP.ts` (`solvePiecewiseQP`) per
Ideale, Raggiungibile e Con vendite mirate. Ideale e Raggiungibile lo chiamano a moltiplicatore di tassa zero
(`solveAtMultiplier(…, mu = 0, …)`: nessun kink, un QP piano su somma e box); «Con vendite mirate» lo chiama con `μ`
> 0. La discesa del gradiente proiettata con backtracking (`solveQP` a 8000 iterazioni, `not_converged` di routine
sullo scenario leva + geografia, il timeout a 5 s dei test nel container) è uscita: `solveQP` oggi è solo il
guscio dell'active set, e `SolverOptions.maxIterations` è il tetto dei suoi passi (`maxIterations: 0` forza
`not_converged` nei test). `projectOntoBudgetBox` resta, la usa il motore a leva. Seguono due passaggi
puramente meccanici: l'euristica del 2% (§6.4 — un peso sotto 2 punti con limite inferiore 0 viene azzerato,
a meno che azzerarlo renda impossibile coprire il 100%) e l'arrotondamento a 0,5 punti col metodo dei resti
maggiori (§6.5). Determinismo garantito: stesso input → stesso output bit per bit, nessun ordinamento instabile.

### «Con vendite mirate» — il tetto di tasse

Lo stesso `J(w)`, con un vincolo in più: `B · Σ c_i · max(0, cur_i − w_i) ≤ tetto` (`c_i` = tassa per euro
venduto, `cur_i` = peso attuale). Un candidato bloccato o con `c_i` sconosciuto ha `lowerPct` alzato al peso
attuale (`applyTargetedLocks`, in `optimizeWeights` e non in `resolveCandidateBounds`, così vale anche per i
candidati costruiti a mano; un blocco sopra un massimo di Impostazioni vince, con `bound_conflict`).

**Tre percorsi, e i casi limite di T6 per costruzione** (`solveTargetedCore`):

1. **Il tetto non serve**: gira la pipeline di Ideale (`applyMinWeightHeuristic` → `solveQP`, ora lo stesso active set, con i limiti
   della modalità); se la sua tassa sta sotto il tetto, il risultato È Ideale, bit per bit (`wRef` usa la
   formula di Ideale, v/Σv, identica a quella «raggiungibile» normalizzata che chiede la ATE §4).
2. **Tetto 0** (e nessuna vendita obbligata): gira la pipeline di Raggiungibile, ogni candidato tassato
   tenuto almeno al suo peso — le posizioni in perdita (`c_i = 0`) restano vendibili.
3. **Il tetto lega**: il solver esatto ad active set (`lib/utils/activeSetQP.ts`) su `J(w) + μ·tassa(w)`,
   con `μ` in J per euro di tassa cercato con la regula falsi di Illinois finché la tassa sta entro mezzo
   centesimo sotto il tetto. I tetti di gruppo restano esatti con una variabile di scarto per cerniera
   (`max(0, r)² = min_{t ≥ 0} (r + t)²`).

**Perché un solver esatto e non la discesa proiettata della ATE §5** (dal refactor A2 vale per tutte e tre le modalità, non solo dove il tetto lega) (decisione del proprietario,
2026-09-27, con le misure della revisione sul fixture reale a 12 candidati): il prototipo impiegava 330–525
ms per calcolo (54 solve × ~1.000 iterazioni; il 74% del tempo in `projectOntoBudgetBox` su 2n variabili, e
soprattutto `μ` partiva da 1 in una scala dove serviva 10⁶–10⁸); la stessa discesa con `μ` in euro e Illinois
scende a 8–18 ms; l'active set chiude l'intera ricerca in 25–45 passi, **0,1–0,2 ms**, con la soluzione
esatta — un candidato tenuto sta al suo peso attuale all'ultimo bit, la tassa arriva al tetto al centesimo,
e conflitti ed euristica (che risolvono di nuovo) costano quasi nulla. Il problema è mal condizionato (λ da 1
a 1000, ε = 0,01: κ ≈ 10⁶), per questo i metodi del primo ordine a passo fisso (FISTA) perdevano. Il
controllo incrociato su 1.600 portafogli casuali (tetti di gruppo, limiti, blocchi, 0 € da versare) ha dato
un J mai peggiore della discesa proiettata (+1e-12 relativo nel caso peggiore) e ha scoperto una
degenerazione — tutti i pesi al valore attuale con 0 € da versare: il vincolo di somma blocca da solo
l'unica variabile liberata e il metodo ciclava — curata nel ratio test (la coordinata «fissata dalla somma»
non si rifissa); `__tests__/activeSetQP.test.ts` la tiene, con un certificato KKT su 300 problemi casuali.

**Euristica del 2%** (§7): come nelle altre modalità, ma azzerare un peso è una vendita — si fa solo se, al
`μ` trovato, la tassa resta sotto il tetto (EIMI resta all'1% nel caso reale, a 494 € con NTSG bloccato); un
acquisto da zero si azzera come sempre, e se spostarne il peso fa sforare il tetto `μ` si cerca di nuovo.

**Arrotondamento** (§6): prima quello di Ideale (`roundToHalfPoints`), che si tiene se non vende uno
strumento bloccato e non sfora il tetto — così un tetto che non lega mostra i pesi di Ideale anche al mezzo
punto (T6); altrimenti `roundTargeted`: un tenuto resta al peso attuale esatto (fuori griglia: 39,08%), una
vendita si arrotonda verso il peso attuale (vende meno), un acquisto coi resti maggiori senza scendere sotto
il peso attuale; il frammento lasciato dai tenuti fuori griglia lo assorbe un acquisto. Ogni passo riduce una
vendita, quindi **tassa arrotondata ≤ tassa calcolata ≤ tetto**. Dopo l'arrotondamento tassa e `J` NON sono
monotoni nel tetto (mezzo punto di una posizione da 49.000 € sono ~630 € di vendita, ~22 € di tasse): la
monotonia vale sulla soluzione grezza, che il test legge da `targetedRawSolution`.

**La tassa minima obbligata** (decisione del proprietario, 2026-09-27): un massimo di Impostazioni sotto il
peso attuale, o un minimo sopra il peso attuale senza euro da versare, obbligano a vendere qualcosa.
`minimumTaxEur` calcola la tassa minima inevitabile (vendendo prima ciò che costa meno per euro) e, se supera
il tetto, **diventa il tetto**; la riga del totale lo dice («I limiti in Impostazioni obbligano a pagare
almeno X € di tasse, oltre il tetto di Y €: …»).

## "Altri paesi" — la regola di attribuzione (O4)

Un profilo curato (`INDEX_PROFILES`) o Yahoo restituisce quasi sempre un residuo `OTHER` non
itemizzato. `areasFromCountries` lo risolve in ordine, MAI a caso:

1. **Regionale**: se tutti i paesi espliciti del profilo cadono in una sola area, `OTHER` va lì.
2. **Curato**: se il profilo porta un `otherAreaSplit` (un factsheet che scompone il residuo per
   area — `lib/constants/instrumentProfiles.ts`, propagato da `profileResolver.ts` sulla gamba
   equity quando le countries vengono dall'indice curato), lo segue.
3. **Stimato**: altrimenti stima dai paesi del riferimento geografico (esclusi quelli già espliciti
   in questo profilo ed esclusa la voce `OTHER` del riferimento), e marca la quota come stimata
   (`geo_estimated`/`reference_estimated`).
4. **Ripiego**: se il passo 3 non ha dati, `OTHER` va tutto a Sviluppati ex USA, stimato.

**Nessun profilo curato porta ancora un `otherAreaSplit` reale** (2026-09-19): il campo esiste e si
propaga, ma resta vuoto finché un umano non lo compila da un factsheet (nessuna delle fonti lette il
2026-09-30 scompone il residuo per area: MSCI dà un top-5 più «Other»). Fino a quel momento ogni
indice di riferimento e ogni strumento passano dal passo 3 (stima) o 4 (ripiego).

## Classificazione geografica: una sola, MSCI

`lib/constants/geoAreas.ts` usa la classificazione MSCI Emerging Markets per TUTTI — sia gli
strumenti sia l'indice di riferimento — anche quando l'indice di riferimento scelto (es. FTSE
All-World) classifica diversamente. FTSE mette la Corea del Sud tra gli Sviluppati, MSCI tra gli
Emergenti: con FTSE All-World come riferimento, circa 2,4 punti di Corea passano da Sviluppati a
Emergenti. È voluto — coerenza INTERNA prima della fedeltà a un singolo provider (altrimenti lo
stesso paese vestirebbe due aree diverse nello stesso rapporto, a seconda di quale lato lo guarda).

## Perché la proiezione è condivisa col motore a leva

`dot`, `clamp`, `projectOntoBudgetBox` erano funzioni PRIVATE di
`lib/utils/leverageAwareAllocationUtils.ts` (il planner di Allocazione): stesso identico problema —
proiettare un vettore su un simplesso con limiti per componente — quindi O1 le ha spostate in
`boxProjection.ts` senza toccarle, e il motore a leva le importa da lì. Dall'A2 l'ottimizzatore non ne fa più
la sua discesa (l'active set ha sostituito il solver proiettato): gli resta il punto di partenza dell'active set
(`projectOntoBudgetBox(start, lo, hi, 1)`), mentre il motore a leva la usa ancora per intero. Un solo posto
dove la proiezione può avere un bug (`__tests__/boxProjection.test.ts` + `__tests__/leverageAwareAllocationUtils.test.ts`).

## Profili sul client — `includeZeroQuantity` (O3)

Il PAC può proporre pesi anche per uno strumento a **quantità 0** (una posizione "Nuovo asset",
doc/guide/accumulo.md § D7) — che `resolveInstrumentProfiles` esclude per costruzione dal calcolo
dell'Esposizione (dove uno strumento a quantità 0 non ha alcun peso nel portafoglio). L'opzione
`{ includeZeroQuantity: true }` toglie SOLO quel filtro, mai il filtro sul ruolo (`tradable`/
`frozen`); ogni chiamante esistente (`portfolioExposureService.ts`) non la passa e mantiene il
comportamento di prima. La route `GET /api/portfolio/instrument-profiles` (delegation-aware, stesso
modello di `/api/asset-transactions`) è l'unica a passarla, per i membri di TUTTE le posizioni della
bozza — non ha una cache propria: il resolver ha già la cache di 30 giorni per ticker.

## Candidati dello strumento a sé (A0 e A2, RO1)

`buildStandaloneCandidates(assets, baseEur, valueOf, evaluateAssetIds?)` prende gli strumenti `tradable` o `frozen`
con valore > 0 e **mai un conto di liquidità** (`type !== 'cash'`): un conto è da dove arrivano i soldi, non un
candidato. I `frozen` restano fissati al peso attuale dentro il calcolo e `toModelWeights` li toglie quando i pesi
diventano il portafoglio modello o un PAC. **Strumenti da valutare (A2, PO10, RM3)**: gli id degli strumenti del
portafoglio modello (`evaluateAssetIds`) entrano come candidati anche a 0 quote, purché `tradable` e non conti; i
loro profili arrivano da `GET /api/portfolio/instrument-profiles` (`includeZeroQuantity`). Un candidato a valore 0
ha peso corrente 0 e l'ottimizzatore gli dà un peso solo se un obiettivo lo chiede (PZ5).

## Il portafoglio modello (A2, PO1, RM1–RM4, RO3–RO4)

- **Dove vive**: collezione nuova `modelPortfolios/{ownerId}` (un documento per account, `types/modelPortfolio.ts`:
  pesi di mercato per strumento sommati a 100, `origin: 'manual' | 'optimizer'`, `optimizerSnapshot?` con anche i
  conflitti del calcolo, `updatedAt`). Service `lib/services/modelPortfolioService.ts` (client SDK; rifiuta Σ ≠ 100 ±
  0,01, uno strumento che non c'è più, un `frozen`/`excluded` o un conto, con `userFacingError`), hook
  `useModelPortfolio`/`useSaveModelPortfolio`, chiave `queryKeys.modelPortfolio.byOwner`. **La regola Firestore
  (`match /modelPortfolios/{ownerId}` in `firestore.rules`) non parte con Vercel**: va pubblicata a mano
  (`firebase deploy --only firestore:rules`, SETUP.md) prima del primo salvataggio; senza, il tile dice che non
  riesce a leggere il modello.
- **Cosa può starci (RM2)**: `toModelWeights` (`lib/utils/modelPortfolio.ts`) toglie `frozen`, `excluded` e conti e
  riscala a 100 al centesimo di punto; `proposalToModelWeights` lo applica a un calcolo e marca `candidate` ciò che non
  si possiede (RM3). Un fondo monetario resta.
- **Il tile «Portafoglio modello»** (`PortafoglioModelloTile`, sostituisce Composizione ideale): tabella oggi · modello ·
  differenza in euro (`describeModelVsToday`, RM4: base `M` = valore degli strumenti del modello, i «da valutare» in
  fondo, ciò che si possiede fuori dal modello in una riga a parte); «Ricalcola» (`IdealCompositionDialog`: le tre
  modalità, **«Salva come portafoglio modello»** scrive il risultato con `origin: 'optimizer'` e lo snapshot, «Crea un
  PAC con questi pesi» resta fino ad A3), «Modifica a mano» (`ModelEditDialog`: somma 100 obbligatoria, «Riporta a
  100%», `origin: 'manual'`, lo snapshot resta), «Aggiungi strumento da valutare» (`AssetDialog` `createEmpty`, il
  modello deve già esistere perché la somma resta 100).
- **Il rapporto con le barre (RO4)**: `ObjectiveBars` (`OptimizerReport.tsx`) — nome, chip di priorità, «target →
  raggiunto (gap)» in mono e un `TargetTick` — è l'unica presentazione per lo strumento a sé, il passo Target del
  PAC, il modale degli Obiettivi e il tile Obiettivi (che lo legge dallo snapshot del modello, con la prima frase dei
  conflitti). I conflitti restano frasi.

## Limiti noti

- **I gruppi proxy assumono la stessa esposizione per euro del buy asset per tutti i membri** (§5.1
  della ATE): se un membro differisce di oltre 0,05 in qualunque classe o area dal buy asset, il
  candidato porta l'avviso `proxy_mismatch` e il calcolo procede comunque con i soli valori del buy
  asset — un'approssimazione dichiarata, non un errore silenzioso.
- **Un tetto di gruppo è un obiettivo MORBIDO** (una cerniera penalizzata, non un vincolo rigido
  nella proiezione): con priorità bassa e altri obiettivi in conflitto, il risultato può superarlo.
  Il rapporto lo mostra comunque col suo gap.
- **L'euristica del 2% è a due passaggi, non ricorsiva all'infinito** (§6.4, max 5 giri): un peso
  che scende sotto 2 punti solo dopo il quarto giro resta com'è.
- **Nessun profilo curato ha ancora un `otherAreaSplit`** (vedi sopra) — finché resta così, "Altri
  paesi" passa sempre dalla stima o dal ripiego, mai dal passo curato.
- **Perimetro (O9): mai Versa, Ribilancia, Preleva** — l'ottimizzatore alimenta solo il passo Target
  del PAC e, da G4, lo strumento a sé (dall'A2 `PortafoglioModelloTile` + `IdealCompositionDialog`); nessuno dei
  due tocca il Piano (Versa/Ribilancia/Preleva) della pagina Allocazione, e nessuno scrive mai da
  solo — lo strumento a sé propone di aprire un PAC nuovo, mai un `AllocationRow`/trade diretto.
- **«Con vendite mirate»: i conflitti si calcolano a `μ` fisso** (targeted ATE §8) — il «senza
  l'obiettivo X» non rifà la ricerca sul tetto, quindi è indicativo e la sua tassa può differire dal tetto.
  Lo dice questa guida, non la UI.
- **Minusvalenze e zainetto fiscale fuori perimetro**: una vendita in perdita costa 0 € di tasse, nient'altro
  — il motore non sa che una minusvalenza compenserebbe altre plusvalenze.
- **Costo fiscale sconosciuto = non vendibile**: uno strumento estero senza `averageCostEur` non si vende mai
  in modalità mirata; la tassa che non si può stimare non si presume zero.
- **Le commissioni del broker non contano**, né sulla tassa né sul venduto; e il PAC creato da qui non
  vende: le vendite le fa l'utente al broker.
- **L'active set non ha un piano B numerico**: se non convergesse (mai visto su 1.600 portafogli casuali),
  il risultato porta l'avviso `not_converged`. Dopo A2 questo vale anche per Ideale e Raggiungibile: il vecchio
  `not_converged` di routine dell'8000ª iterazione non esiste più.
- **Un candidato da valutare ha un peso solo se un obiettivo lo chiede** (o se l'ε verso il peso corrente 0 lo lascia
  fuori): non è una raccomandazione di acquisto, è la domanda «con questo strumento il portafoglio migliora?».
- **Lo strumento a sé non raggruppa mai**: un candidato è sempre un singolo strumento
  (`buildStandaloneCandidates`), mai un gruppo proxy — quello resta un gesto del PAC (D6,
  doc/guide/accumulo.md), che si fa nell'editor, non in questo modale di sola lettura.
