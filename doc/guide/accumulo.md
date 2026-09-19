# Allocazione › Accumulo (PAC)

> **Quando aprire questa guida** — chi tocca `components/allocation/tiles/AccumuloTile.tsx`,
> `components/allocation/Accumulation{PlanDialog,CalendarDialog,RecalibrateDialog}.tsx`,
> `components/allocation/ClassDriftChart.tsx`, `lib/utils/accumulationPlan{Utils,Schema,Matching}.ts`,
> `lib/utils/accumulationNarrative.ts` o `lib/services/accumulationPlanService.ts`. La specifica
> chiusa è `doc/pac-ate.md`; questa guida ne è la traduzione operativa, con le decisioni D1–D12 come
> regole e le trappole trovate scrivendo il codice. In `AGENTS.md` resta lo stub con l'essenziale.

## Modello dati

Un `AccumulationPlan` (`types/accumulationPlan.ts`) è UN documento in `accumulationPlans/{planId}`,
`userId` = l'owner dell'account condiviso. Attraversa quattro stati (`draft → active → completed |
cancelled`, D12: **al massimo uno** in `draft`/`active` per account — `selectOpenPlan` lo trova).

- `positions: PlanPosition[]` — un peso target per **posizione**, non per asset: `memberAssetIds`
  (1 = strumento singolo, ≥2 = gruppo proxy, D6) e `buyAssetId` (l'UNICO membro che riceve acquisti).
- `disposals: PlanDisposal[]` — gli strumenti tenuti ma lasciati fuori dal piano, venduti al mese 1 (D5).
- `liquidity: PlanLiquidity` — conti sorgente, riserva intoccabile, entrata mensile stimata (D4).
- `installments: Installment[]` — il calendario S1 (D8): quote intere per posizione, mai frazionate (D9).
- `baseline`/`installment.measurement` — la misura mese per mese (D11): notional € per classe contro il
  target EFFETTIVO della pagina, salvata al momento della chiusura, mai ricalcolata all'indietro.

Il motore puro (`accumulationPlanUtils.ts`) e lo schema (`accumulationPlanSchema.ts`) non importano
Firebase: ogni dipendenza dal portafoglio vivo è iniettata (`PlanDeps.valueOf`/`priceOf`,
`AllocationCompare`). Lo stesso vale per il matching (`accumulationPlanMatching.ts`, sotto).

## Le 12 decisioni (D1–D12)

| # | Regola | Dove vive |
| --- | --- | --- |
| D1 | Feature autonoma: tile separato da Piano, fuori da `PlanMode`/`buildPlanView`/dal verdetto della pagina. | `AccumuloTile.tsx` montato accanto, non dentro, `PianoTile` |
| D2 | Target del piano PER STRUMENTO, indipendenti dai target di Impostazioni. | `PlanPosition.targetPercentage` |
| D3 | La liquidità è sempre `excluded`: B = valore posizioni + L. | `computeTotalPurchases` |
| D4 | L = max(0, Σconti−riserva) + vendite fuori piano + E×N; la riserva non si tocca mai. | `computeUsableLiquidity` |
| D5 | Fuori piano → venduti al mese 1, ricavo in L; sovrappesate → mai vendute. | `PlanDisposal`, `computeTotalPurchases` (una posizione sopra target riceve 0 in fase deficit) |
| D6 | Gruppi proxy: un peso, un solo `buyAssetId` compra. | `resolvePositionStates` |
| D7 | Nuovo strumento = asset reale a quantità 0, senza operazione d'apertura. | `AssetDialog` con `createEmpty` (§8, S3) |
| D8 | Calendario S1 salvato all'attivazione; ricalibrazione S3 proposta, mai imposta. | `scheduleInstallments` / `recalibrateInstallment` |
| D9 | Solo quote intere, arrotondate per difetto; il resto va alla rata successiva della STESSA posizione. | `scheduleInstallments`'s `carry` |
| D10 | Il sistema propone gli abbinamenti col ledger; l'utente conferma, corregge o segna a mano. | `accumulationPlanMatching.ts` (§9, sotto) |
| D11 | Traiettoria mese per mese contro i target EFFETTIVI e la banda della pagina; per i mesi chiusi si salva la misura, lo scostamento si ricalcola sempre contro i target correnti. | `projectClassTrajectory`, `buildClassMeasurement` |
| D12 | Al massimo un piano `draft`/`active` per account. | `createDraftPlan` (pre-check) + `selectOpenPlan` |

## Le correzioni di §2 (perché il codice non è quello di una prima lettura ingenua)

- **La banda non è un'impostazione**: è stato di `app/dashboard/allocation/page.tsx`
  (`useState<RebalanceBand>`), passato come prop al tile — la stessa banda che governa Bilanciamento e
  Per classe, mai una seconda banda per l'Accumulo.
- **I target sono quelli EFFETTIVI della pagina** (`targets` di `page.tsx`, che include i target
  derivati dagli Obiettivi), mai `settings.targets` grezzi — altrimenti la traiettoria di D11
  confronterebbe contro un piano che l'utente non vede più.
- **`compareAllocations` è iniettato** (`AllocationCompare`), mai importato dal motore puro: vive in
  `lib/services/assetAllocationService.ts`, che porta Firebase. Il tile passa la funzione reale; i test
  mockano Firebase una volta sola (`__tests__/compareAllocations.test.ts`) e importano quella vera.
- **`exposurePerEuro` non chiama `expandAssetExposure`**: calcola il notional per classe direttamente da
  `composition`/`leverageRatio`, senza toccare `assetExposureUtils.ts` (che importa `calculateAssetValue`
  da un service Firebase). La coerenza fra i due è un test esplicito (`accumulationPlanUtils.test.ts`),
  non un'importazione condivisa.
- **`calculateAssetValue`/`unitPriceEur` sono iniettati** via `PlanDeps`, come fa `buildHoldings` per il
  resto della pagina — mai importati direttamente nel motore puro.
- **Il target di un punto della traiettoria viene da QUEL punto, mai dalla baseline** (PR #4,
  rilievo 1, chiuso 2026-09-19): un punto misurato risolve il target con `resolveTargetPct`
  passandogli la SUA `marketBaseEur`, un punto proiettato lo legge direttamente dal risultato del
  `compare()` di quel punto — mai un target risolto una volta sola all'inizio della funzione.
  Motivo: con un target cash a importo fisso, `compareAllocations` scala il target di OGNI classe
  (non solo cash) sulla base di mercato corrente; congelare il target alla base della baseline lo
  sbagliava non appena la base cambiava (acquisti, entrate stimate, vendite). doc/pac-ate.md §5.9.
- **La proiezione muove anche la cassa del piano** (PR #4, rilievo 2, chiuso 2026-09-19):
  `buildProjectedAssets` non si limita più ad aggiungere le quote pianificate all'asset
  d'acquisto — sottrae anche gli acquisti non eseguiti dai conti sorgente, aggiunge l'entrata
  mensile stimata mese per mese e i ricavi delle vendite non eseguite, pro quota sui saldi live di
  `sourceCashAssetIds`. Prima, la cassa restava ferma mentre il lato acquisti faceva crescere la
  base di mercato dal nulla. doc/pac-ate.md §5.9.
- **Un conto `cash` non è mai una posizione del passo 2** (PR #4, rilievo 6, chiuso 2026-09-19):
  `resolveAllocationRole` legge `tradable` per un conto corrente per default, quindi senza
  l'esclusione `assetClass !== 'cash'` — nel seeder e nei candidati di `AccumulationPlanDialog.tsx`,
  e nel `unassigned_tradable` di `accumulationPlanSchema.ts` — un conto corrente finiva fra le righe
  a peso 0%, e se scelto anche come sorgente del passo 1 il suo valore entrava due volte in B.
- **`unassigned_tradable` segue lo STESSO predicato di valore del seeder/candidati** (PR #4, rilievo
  7, chiuso 2026-09-19): `calculateAssetValue(asset) > 0` nel componente (import Firebase, lecito
  lì), `asset.quantity * unitPriceEur(asset) > 0` nello schema (Firebase-free, §5.0). Prima lo
  schema usava `asset.quantity <= 0`, un predicato diverso — un asset con quantità tracciata ma
  senza prezzo mai recuperato era preteso dal validatore e offerto da nessuna riga: vicolo cieco,
  «Avanti» permanentemente disabilitato.
- **Il toggle «Nel piano / Da vendere» del passo 2 sta ORA nella colonna che lo promette** (trovato
  dal proprietario in un giro guidato, chiuso 2026-09-19): la cella della colonna renderizzava solo
  il testo `ACCUMULO_STEP2_TOGGLE_IN_PLAN`, senza `onClick` — il controllo vero viveva in un
  paragrafo separato SOTTO la tabella, in caratteri piccoli, per le sole righe non raggruppate: da
  UI sembrava semplicemente che non ci fosse modo di marcare uno strumento come «Da vendere».
  `AccumulationPlanDialog.tsx`: la cella del toggle per una riga NON raggruppata (`!grouped`) è ora
  un bottone che chiama `moveAssetToDisposal(asset)`; per un membro di un gruppo proxy resta testo
  semplice (non si vende un solo membro senza prima «Separare», invariato). Il paragrafo duplicato è
  stato rimosso.
- **La striscia classi (D11) ora stampa il peso vero, non solo il suo scostamento** (decisione del
  proprietario, 2026-09-20): la riga primaria (prominente, mono) è "Azioni 105,4% · target 102,0%"
  — i valori assoluti — mentre lo scostamento in pp ("+3,4 pp oggi → +1,3 pp a fine piano") scende
  a riga secondaria, più piccola e sempre muted. Prima era il contrario: l'UNICA cifra stampata
  era il delta, il peso reale della classe non compariva mai nel tile. `describeClassStripItem`
  ritorna `{ label, primary, secondary, note?, outOfBandNow }` invece del vecchio `{ text, note?,
  outOfBandNow }`; `AccumuloTile.tsx` legge `item.label` per il calcolo di `furthestDrift` (prima
  lo estraeva spezzando la stringa `text` — fragile). doc/pac-ate.md §10.2 punto 5.
- **La tabella «Classi mese per mese» del passo 3 (anteprima) segue la stessa regola** (decisione
  del proprietario, 2026-09-20): prima ogni cella portava solo lo scostamento in pp, senza
  nemmeno un'intestazione che dicesse quale colonna fosse quale classe. Ora ogni cella ha due
  righe — il peso assoluto (`currentPct`, primario, warning se fuori banda) sopra la pp
  (`driftPp`, secondario, muted) — e la tabella ha un'intestazione per classe
  (`ASSET_CLASS_LABELS`), nello stesso stile della tabella Calendario appena sopra
  (`text-[9px] uppercase`, scroll orizzontale nel proprio contenitore). `classKeys` (i nomi delle
  classi, stabili lungo tutta la traiettoria perché derivano tutti dagli stessi `targets`) si
  legge UNA volta da `preview.trajectory[0]?.byClass` e guida sia l'intestazione sia l'ordine
  delle colonne di ogni riga. **L'intestazione è colorata col colore della classe** (richiesto dal
  proprietario subito dopo): `classColor(assetClass)` legge lo stesso `ASSET_CLASS_CHART_INDEX` →
  `useChartColors()`/`CHART_COLORS` già usato dalla barra di esposizione appena sopra e da
  `ClassDriftChart`, così una colonna si riconosce per colore contro il grafico, non solo per
  posizione. doc/pac-ate.md §10.3.

## §9 — Abbinamento col ledger (`accumulationPlanMatching.ts`)

`matchPlanExecutions(plan, transactions, today)` non scrive nulla: propone. Una riga (installment o
disposal) resta quella che l'utente ha confermato finché non arriva un'azione dalla UI.

- **Candidati rata**: `type === 'buy'`, non baseline, stesso asset della riga, stesso mese
  (`toMonthKey`, fuso Italia — un acquisto alle 23:30 del 31 in orario italiano appartiene comunque a
  quel mese, mai al successivo per un confronto UTC ingenuo). `linkedCashAssetId` in uno dei conti
  sorgente → confidenza `high`; assente → `medium`; presente ma ESTRANEO ai conti sorgente → **non è
  candidato affatto** (non basso, proprio escluso).
- **Candidati vendita** (disposals): `type === 'sell'`, stesso asset, data ≥ `activatedAt` — **nessun
  vincolo di mese**, perché D5 dice «venduti al mese 1» come stima contabile, non come termine ultimo
  reale: la vendita può arrivare più tardi.
- Un id già presente in `transactionIds` di QUALUNQUE riga del piano (anche la riga stessa, se una
  patch lo ha scritto) non è mai più candidato — questo è ciò che rende `Conferma` irreversibile senza
  passare da `Scollega`.
- Più candidati sulla stessa riga si sommano in un solo `LineMatch` (quantità e importo Σ); la
  confidenza combinata è `high` solo se OGNI candidato lo è.
- Stati (`LineUiState`): `executed`/`lostLink` derivano dallo stato salvato (un id sparito dal ledger è
  `lostLink`, mai silenzioso); `skipped` è terminale; un `planned` con un match diventa `toConfirm`; un
  `planned` senza match E prima del mese corrente è `late`; altrimenti `todo`. Per una disposal, «mese
  corrente» è sempre il mese 1 del piano (D5): `late` significa «il piano è oltre il primo mese e la
  vendita non risulta ancora».
- **Il quarto parametro `transactionsLoading`** (PR #4 review, rilievo 5, chiuso 2026-09-19): finché
  `useAssetTransactions` è in volo, `transactions` arriva `[]` — indistinguibile da un ledger
  genuinamente vuoto — e senza questo parametro OGNI riga già `executed` con `transactionIds`
  leggeva `lostLink` per un frame (il bottone «Rivedi» lampeggiava a caso). Il chiamante passa
  `transactionsQuery.isLoading`; di default è `false`, quindi ogni altro chiamante (i test) resta
  invariato.

**Il tile (§10.2 punto 4)** usa questi stati per decidere le azioni, non il proprio `InstallmentLineStatus`
grezzo:

| Stato | Azioni |
| --- | --- |
| `todo` | nessuna — il tile non anticipa una conferma prima che il ledger la proponga |
| `toConfirm` | Conferma (scrive `transactionIds`/quantità/importo dal match) · Ignora |
| `executed` (con `transactionIds`) | Scollega (torna `planned`, pulisce i campi collegati) |
| `executed` (manuale, senza `transactionIds`) | Segna da rifare |
| `late` | Segna eseguita a mano · Salta |
| `skipped` | nessuna |
| `lostLink` | Rivedi (apre il Calendario sulla rata) per una installment line; Scollega per una disposal — il Calendario non ha una vista disposals |

**«Ignora» non scrive nulla** (2026-09-18, S5): nessun campo dello schema registra un match rifiutato,
quindi la scelta vive in uno `Set` locale del tile e sparisce a un reload — a quel punto il candidato
viene riproposto. È una scelta deliberata (niente schema in più per un caso che l'utente può ririfiutare
in un secondo), non un difetto.

**Le vendite fuori piano hanno una loro sezione nel tile** («Vendite fuori piano», sotto le righe della
rata): senza di essa un piano con almeno una disposal non avrebbe mai un modo, da UI, di farla
transitare da `planned` a `executed`/`skipped` — e `isPlanDone` richiede `disposalsClosed`, quindi il
piano non avrebbe mai potuto chiudersi. Stessa vocabolario di stati, `setDisposal` invece di
`setInstallmentLine`; il form manuale ha solo l'importo (una disposal non ha una quantità pianificata,
solo un ricavo stimato).

## Passo 2 — Manuale / Ottimizzato (doc/weight-optimizer-ate.md §9)

Un `SegmentedPill` sopra la tabella dei pesi (`Manuale` di default). **Ottimizzato SOSTITUISCE
l'intero corpo del passo** — tabella, righe di vendita e i controlli di raggruppamento inclusi —
con `OptimizerPanel`; tornando su Manuale il corpo riappare identico, coi valori correnti della
bozza (nessuno stato perso: il selettore cambia solo COSA si vede, mai il `draft`). La riga
"Totale" e la sua nota restano visibili in entrambe le viste, perché contano sempre sul
`draft.positions` corrente qualunque sia stata la via per arrivarci.

`OptimizerPanel` (`components/allocation/OptimizerPanel.tsx`) è spento con una sola riga e un link
a Impostazioni quando `idealAllocation` non è attiva; acceso, mostra il riepilogo degli obiettivi
(la STESSA `describeIdealAllocation` del tile di Impostazioni — un solo posto dove si legge un
`IdealAllocationSettings`), il selettore Raggiungibile/Ideale, e — dopo **Calcola** — la tabella dei
pesi proposti più il rapporto per obiettivo, i conflitti e gli avvisi (`lib/utils/{weightOptimizer,
weightOptimizerNarrative}.ts`, doc/guide/ottimizzatore.md). I candidati sono le posizioni della
bozza (le righe "Da vendere" non esistono in `draft.positions`, quindi sono escluse per
costruzione, non da un filtro esplicito); la base B somma i loro valori correnti (`resolvePosition
States`) più la liquidità L del passo 1. "Usa questi pesi" scrive `targetPercentage` di ogni
posizione e torna su Manuale; in modalità Ideale con un peso proposto sotto il posseduto, chiede
prima una conferma INLINE (mai una modale annidata: DESIGN.md → The Modal-Is-A-Tile Rule) — il PAC
non vende, quindi quella posizione riceve zero acquisti fino al prossimo passo.

**Lo snapshot** (`AccumulationPlan.optimizerSnapshot` / `AccumulationPlanDraft.optimizerSnapshot`)
si scrive SOLO da "Usa questi pesi" — mai da un salvataggio della bozza in sé — e resta anche se
l'utente poi ritocca un peso a mano: documenta da dove si è partiti, non lo stato attuale. Il passo
3 lo mostra come una riga quando presente (`describeOptimizerSnapshot`, confronta i pesi dello
snapshot con `draft.positions` corrente e aggiunge «, poi modificati a mano» solo se differiscono
di oltre 0,01 punti).

## Deploy della regola Firestore

`firestore.rules` porta il blocco `accumulationPlans` da S2 (`match /accumulationPlans/{planId}`,
stesso schema di `pensionContributions`: lettura/scrittura per chi accede all'account, `userId`
immutabile in update). **Il deploy delle regole NON avviene con Vercel**: va fatto a mano dalla console
Firebase (Firestore → Regole → incolla il contenuto di `firestore.rules` → Pubblica) prima di poter
creare un piano in produzione — nessuna pipeline di questo repo lo fa per conto dell'utente.

## Limiti noti

- **Un asset creato a quantità 0 (D7) è visibile in Patrimonio prima ancora del primo acquisto**: non
  c'è modo di nasconderlo finché il Registro operazioni non registra un `buy` — è lo stesso
  comportamento di un asset "vuoto" creato fuori dall'Accumulo, non una regressione della feature.
- **Un asset `frozen` (allocationRole) resta fuori dalla base del piano** (B = posizioni del piano + L,
  D3): il piano non lo vede né come sorgente né come target, anche se conta nel denominatore della
  pagina Allocazione.
- **Nessuno spec Playwright** (fuori perimetro per l'intera ATE): la verifica del collaudo guidato passa
  dall'anteprima Vercel (WORKFLOW.md §2 adattato, doc/pac-ate.md §13).
- **`recalibrateInstallment` non scrive**: propone soltanto; `applyRecalibration` (chiamata dal dialog)
  sostituisce le righe ancora `planned` della rata, quelle già `executed` restano intatte.
- **L'Ottimizzato tocca solo i pesi**: non aggiunge, rimuove o raggruppa posizioni — quello resta un
  gesto Manuale. Un cambio di struttura fatto DOPO "Usa questi pesi" (un nuovo asset, un
  raggruppamento) non invalida lo snapshot: resta la fotografia di quando è stato calcolato.
- **Il modello di cassa del piano è indipendente dal target cash di Impostazioni**:
  `plan.liquidity.reserveEur` (mai toccata, D4) e il target `cash` a importo fisso di Impostazioni
  (quello che `compareAllocations` scala nella traiettoria di D11) sono due numeri distinti che
  l'app non concilia — un piano può spendere la cassa fino alla SUA riserva anche quando
  l'Allocazione vuole tenerne di più da parte per il target. La traiettoria lo mostra semplicemente
  come una classe cash sotto target (drift negativo) a fine piano, mai come un conflitto esplicito
  fra i due numeri: non è un bug della proiezione (§5.9 la calcola correttamente contro il saldo
  REALE che risulterebbe), è che i due concetti non si parlano.
