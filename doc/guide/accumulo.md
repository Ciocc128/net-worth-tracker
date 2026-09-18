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
