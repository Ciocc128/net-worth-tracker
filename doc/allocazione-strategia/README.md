# Allocazione › Strategia e la catena dei pesi (dossier, R8)

> Card Todoist «F16 FEAT riordino UI ondate 2–3», ondata 2, punto R8 («R8 ha bisogno di un dossier suo»). Fonti: review
> «Riordino della UI» (Fable, 2026-11-12; Library `riordino-ui/parte-3-proposta-riordino.md` § R8), la decisione **M4 del
> 2026-11-14** («il portafoglio modello comanda sui pesi per strumento», conferma di D-AL3, card «Fable minori · Pesi per
> strumento e perimetro del portafoglio: una fonte sola (M4, L2, L3, L5)»), D-RU3 dell'ondata 1 (la riga «Portafoglio X su Y»
> va con la striscia). Il piano comune, R4, R10 e P6 sono in `doc/riordino-ui/ondata-2.md`; questa è la task **RU8**.
>
> **Stato: specifica scritta il 2026-11-23 su main `7e930b1`; decisioni D-ST1…D-ST9 PROPOSTE, da confermare con Giorgio (§ 8).**
> Render «oggi / proposta» nella stessa pagina dell'ondata 2 (`doc/riordino-ui/ondata-2.md` § 1).

## 1. In breve

Oggi le quattro cose che decidono cosa compro sono in tre posti e in ordine rovesciato: i **target per classe** in
Impostazioni › Allocazione, i **criteri** e il **portafoglio modello** in fondo ad Accumulo, il **piano** e la **rata** in cima
ad Accumulo. Il riordino:

- una **striscia** sotto le schede di Allocazione, uguale sulle tre: `1 Target per classe → 2 Portafoglio modello → 3 Piano di
  accumulo → 4 Rata del mese`, ognuna con il suo stato in una cifra e il link al posto dove si cambia;
- una terza scheda, **Strategia**, con ciò che si decide una o due volte l'anno, dall'alto in basso nell'ordine della
  striscia: (1) Target per classe con la sua fonte (a mano · formula per età · dai traguardi), (2) Portafoglio modello con i
  suoi Criteri accanto;
- **Accumulo** resta l'esecuzione: Questo mese, Classi del piano, Piani conclusi;
- **Bilanciamento** perde il bottone «Modifica target» (la matita è sul tile Per classe e porta a Strategia), Esposizione e
  Previdenza diventano righe chiuse anche a desktop, la testata dice quanto vale il portafoglio rispetto al patrimonio.

Nessun dato salvato cambia forma.

## 2. Stato di partenza (main `7e930b1`, census 1440×900)

- **Pagina** `app/dashboard/allocation/page.tsx` (~770 righe): due schede (`ALLOCATION_TABS`: Bilanciamento, Accumulo
  `?tab=accumulo`), solo la scheda attiva montata (`renderedPanels`), entrambe nel JS iniziale (849 KB gz). Legge assets,
  settings, goals e il modello; i target effettivi da `resolveEffectiveTargets` (manuali, default o dai traguardi con
  `goalDrivenAllocationEnabled`).
- **Testata**: descrizione `describeAllocazioneHeader` («301.955 € allocati · 3 classi · target dalle impostazioni» /
  «… · pesi dal portafoglio modello»), azione «Modifica target» (link a `/dashboard/settings`, solo su Bilanciamento, solo da
  `desktop:`; sotto `desktop:` un bottone a tutta larghezza dopo la griglia).
- **Bilanciamento**: verdetto · Bilanciamento 5 | Ordini 7 · Per classe 5 · Esposizione 12 · Previdenza 12 (con un fondo) ·
  Dettaglio. Misure: Bilanciamento e Ordini 300, Per classe 642, Esposizione 984, Previdenza 1224.
- **Accumulo** (`components/allocation/AccumuloTab.tsx`): verdetto · Questo mese 7 | Classi del piano 5 · Portafoglio modello 7
  | Criteri del modello 5 · Piani conclusi 12; senza piano `AccumuloVuotoTile` 12. Misure: Questo mese 292, Portafoglio modello
  791, Classi del piano 292, Criteri 862. `?obiettivi=1` apre il modale dei Criteri. `COMPOSITION_ANCHOR_ID` =
  `portafoglio-modello` (ancora del tile del modello, usata da `AccumuloVuotoTile`).
- **Impostazioni › Allocazione** (`components/settings/tabs/AllocazioneTab.tsx`): Allocazione target (totale, leva, classi con
  target, sottocategorie; sola lettura) · Auto-calcolo Azioni / Obbligazioni (età letta da FIRE › Il mio piano, risk-free
  scritto o stimato, interruttore `autoCalculate`) · Target per classe (`AllocationClassEditor` per classe, `SubTargetEditor`
  per le sottocategorie e gli strumenti specifici, liquidità a importo fisso) · Criteri del modello (`IdealAllocationSummary`,
  sola lettura). La validazione `findTargetProblem`/`describeTargetProblem` (`allocationTargetValidation.ts`), il fuoco sul
  campo sbagliato attraverso la bozza (`revealTargetProblem`), «Ripristina default» in testata. L'interruttore
  «Allocazione derivata dai traguardi» è invece in Impostazioni › Preferenze › FIRE e traguardi.
- **I quattro posti dei pesi per strumento** (M4): `targets[classe].subTargets[…].specificAssets` (upstream, per nome o ticker,
  letto da Bilanciamento per il dettaglio di Per classe e dall'ottimizzatore come vincolo), `modelPortfolios/{uid}.weights`,
  `accumulationPlans/*.positions`, `idealAllocation.instrumentLimits/groupLimits`. AL4 li tiene allineati con funzioni di
  confronto (`comparePlanToModel`, `applyModelToPositions`).

## 3. Obiettivo e perimetro

**Obiettivo**: rispondere a «da dove vengono i pesi che seguo, e dove li cambio?» con una mappa sempre visibile, e mettere
ogni regolazione sulla pagina dell'oggetto che regola (P2).

**Incluso**: la striscia; la scheda Strategia; l'editor dei target spostato da Impostazioni con validazione, fuoco e salvataggio;
la fonte dei target come scelta sola; Accumulo ridotto all'esecuzione; Bilanciamento con matita, righe chiuse e testata nuova;
la scheda Allocazione tolta da Impostazioni (con l'alias `?tab=allocazione`, D-RU21); P6 per Accumulo e Strategia (D-RU23).

**Escluso**
- Il lavoro sui dati di M4 (un dato solo per i gruppi, il modello che sostituisce `specificAssets`, Ordini divisi per i pesi del
  modello), L2 (una definizione di liquidità), L3 (`selectPortfolio`), L5: card M4, **dopo** RU8 (D-ST6).
- Lo Zainetto fiscale (D-ST9).
- FIRE: la riga «Portafoglio X su Y» lì va con R9.
- Nessun motore cambia: Ribilancia · Versa · Preleva, il PAC, l'ottimizzatore, il confronto col modello.

## 4. Casi d'uso

1. **Apro Allocazione.** Sotto le schede leggo «1 Target 60 · 30 · 10 → 2 Modello 3 strumenti → 3 Piano rata 3 di 12 → 4 Rata
   di novembre 606 €»; su Bilanciamento la cella 1 è evidenziata.
2. **Voglio alzare le azioni al 70%.** Matita su Per classe, oppure la cella 1: arrivo in Strategia › Target per classe, scrivo
   70 e 20, «Salva i target». Torno su Bilanciamento: verdetto e Ordini sono rifatti sui target nuovi.
3. **Passo alla formula per età.** In Target per classe scelgo «Formula per età»: Azioni e Obbligazioni diventano grigie con il
   valore della formula (età da FIRE › Il mio piano, risk-free da Impostazioni › Investimenti, entrambi con il link).
4. **Ricalcolo il modello.** Strategia › Portafoglio modello › «Ricalcola», come oggi in Accumulo; i Criteri sono il tile
   accanto.
5. **È il 3 del mese.** Apro Accumulo: verdetto della rata, Questo mese, Classi del piano. Niente modello né criteri da
   scorrere.
6. **Ho un piano che differisce dal modello.** La cella 3 dice «differisce dal modello su 2»; Questo mese ha la riga «Rivedi
   dal modello» come oggi.
7. **Sul telefono.** La striscia è una riga di quattro celle compatte; Strategia è una colonna di tile senza composizione.

## 5. Regole

### 5.1 Le schede

`ALLOCATION_TABS`: **Bilanciamento** (default) · **Accumulo** (`?tab=accumulo`) · **Strategia** (`?tab=strategia`, icona
`Compass` o `SlidersHorizontal`). Solo la scheda attiva è montata (come oggi); Accumulo e Strategia sono chunk
(`lazyComponent`, precaricati in idle, D-RU23).

### 5.2 La striscia (`AllocazioneChain`, nuovo; D-ST2)

Un `<nav aria-label="La catena dei pesi">` sotto la barra delle schede, sopra il verdetto, **uguale sulle tre schede**.
Quattro celle, ognuna un link; le celle della scheda corrente hanno il fondo tinto e il numero pieno (Bilanciamento: 1;
Strategia: 1 e 2; Accumulo: 3 e 4). Testo e cifre nascono in una funzione pura `buildAllocationChain(input)` in
`lib/utils/allocationChain.ts` (nuovo), con i suoi test; il componente non calcola.

| Cella | Cifra | Riga sotto | Senza dato | Link |
|---|---|---|---|---|
| 1 Target per classe | le classi con target > 0 in ordine di peso, «60 · 30 · 10» (al più quattro; oltre, «7 classi») | la fonte: «a mano» · «formula per età» · «dai traguardi»; con totale > 100% «leva 1,10×» | target di default mai salvati: «predefiniti» · totale che non torna: «da completare» (ambra, Graphite: testo) | `?tab=strategia#target` |
| 2 Portafoglio modello | «N strumenti» (righe del modello; un gruppo conta 1) | «scritto a mano il 23/11» · «calcolato il 23/11» | «da creare» | `?tab=strategia#portafoglio-modello` |
| 3 Piano di accumulo | «rata 3 di 12» · «bozza» | «fino ad ago 2027»; se `comparePlanToModel` trova differenze: «differisce dal modello su 2» | «nessun piano» | `?tab=accumulo` |
| 4 Rata del mese | «606 €» (la rata del mese, `summarizePacMonth`) | «0 di 3 acquisti registrati» · «registrata» | «—» con riga «nessuna rata» | `?tab=accumulo` |

- Stessi numeri del resto della pagina: la cella 4 legge `pac` come il verdetto di Bilanciamento; la cella 2 il modello di
  `useModelPortfolio`; la cella 3 `useOpenAccumuloPlan`. Nessuna lettura nuova.
- Una cella in errore di lettura (modello o piani non letti) dice «non letto», mai «da creare» o «nessun piano».
- **Sotto `desktop:`** la stessa striscia in una riga di quattro celle alte 44 px con solo numero e cifra («1 60·30·10»,
  «2 3 strum.», «3 3/12», «4 606 €»); il nome intero e la riga sotto stanno nell'`aria-label` del link. Nessuno scorrimento
  orizzontale a 390.
- **La testata** (D-ST7, chiude D-RU3): `describeAllocazioneHeader` diventa «Portafoglio 16.000 € su 300.000 € di patrimonio ·
  fuori: casa, fondo pensione» (i nomi dei primi due asset `excluded` per valore, «e altri N» oltre) su tutte e tre le schede;
  la fonte dei pesi esce dalla testata ed è la riga sotto della cella 1.

### 5.3 Strategia (`components/allocation/StrategiaTab.tsx`, nuovo; D-ST3)

Nessun verdetto (è una superficie di regolazioni: The Declaration-Tile Rule); la striscia sopra fa da riassunto. Due blocchi,
numerati come le celle della striscia:

```
1  [Target per classe 12]                        id="target"
2  [Portafoglio modello 7][Criteri del modello 5] id="portafoglio-modello"
```

**1 · Target per classe** — un tile solo che sostituisce i tre di Impostazioni (Allocazione target, Auto-calcolo, Target per
classe):
- **Eyebrow** «Target per classe», **aside** la scelta della fonte come `SegmentedPill` (selettore vicino al controllo):
  **A mano · Formula per età · Dai traguardi** (D-ST4). La pillola scrive i due campi di oggi: A mano = `autoCalculate:
  false, goalDrivenAllocationEnabled: false`; Formula = `autoCalculate: true, goalDrivenAllocationEnabled: false`; Dai
  traguardi = `goalDrivenAllocationEnabled: true` (`autoCalculate` resta com'era, non letto). «Dai traguardi» c'è solo con
  `goalBasedInvestingEnabled` (Impostazioni › Funzioni); senza, la pillola ha due voci.
- **Lettura** (una frase, `describeClassTargets` esteso): fonte e stato, per esempio «A mano: 3 classi su 8, totale 100%, senza
  leva.» · «Formula per età: con 35 anni e 3,5% le Azioni sono al 62,4%, le Obbligazioni prendono il resto.» · «Dai
  traguardi: 2 traguardi attivi decidono le classi.»
- **Cifra** del totale (40 px, rosso se non valido) con la pillola «Leva 1,10×» e «esclusa liquidità fissa» come nel tile
  Allocazione target di oggi; sotto, le righe «Residuo da allocare» quando serve.
- **Righe per classe**: `AllocationClassEditor` e `SubTargetEditor` spostati da `components/settings/allocation/` a
  `components/allocation/strategia/` senza cambiarne il comportamento (gruppi chiusi non nel DOM, somma sul gruppo, liquidità
  a importo fisso).
  - Con **Formula**: Azioni e Obbligazioni in sola lettura con il valore della formula (`calculateFormulaEquityPercentage`);
    sopra le righe una riga «Età 35 anni · FIRE › Il mio piano» e «Risk-free 3,52% (stima BCE) · Impostazioni ›
    Investimenti», entrambe link (la formula non ha campi suoi qui).
  - Con **Dai traguardi**: tutte le righe in sola lettura con i valori di `buildTargetsFromGoalAllocation`; i target a mano
    restano salvati e tornano con «A mano».
- **Piede**: «Ripristina default» (bottone outline, i target di fabbrica nella bozza, non salva); la nota di metodo di oggi
  («Salva» controlla il totale…); per D-ST6 la riga sugli strumenti specifici.

**2 · Portafoglio modello e Criteri del modello** — `PortafoglioModelloTile` (7) e `ObiettiviTile` (5) **spostati** da
Accumulo come sono, con i loro dialoghi (`IdealCompositionDialog`, `ModelEditDialog`, `ObiettiviDialog`) e `?obiettivi=1`.
L'ancora `portafoglio-modello` (`COMPOSITION_ANCHOR_ID`) resta l'id del blocco; il «Parti dal portafoglio modello» di
`AccumuloVuotoTile` porta a `?tab=strategia#portafoglio-modello`.

**Sotto `desktop:`**: una colonna, nessuna composizione (nessuna riga chiusa: ogni tile è un modulo), due colonne da `tablet:`
solo per il blocco 2.

### 5.4 Il salvataggio dei target (D-ST5)

- **La bozza sta nella pagina**, non nella scheda: `useTargetsDraft(settings)` (nuovo, `lib/hooks/useTargetsDraft.ts`) in
  `app/dashboard/allocation/page.tsx`, con un reducer puro `targetsDraftReducer` in `lib/utils/targetsDraft.ts` ricavato dalla
  fetta `allocazione` di `settingsDraft.ts` (stesse azioni: `setClass`, `replaceTargets`, `set`, il riassestamento della coppia
  Azioni/Obbligazioni con la formula a ogni azione). Passare a Bilanciamento e tornare non perde nulla.
- **Lo stato di salvataggio**: pallino sulla scheda Strategia quando la bozza differisce dal salvato (`TabDef.unsaved`); una
  barra in fondo a `<main>` come quella di Impostazioni, solo su Strategia, con **«Annulla»** (rilettura del documento) e
  **«Salva i target»** (il solo bottone pieno della pagina, con `useSavedFlash`); `beforeunload` con bozza sporca.
- **Validazione e fuoco**: `findTargetProblem` prima di scrivere; con un problema la barra lo dice
  (`describeTargetProblem`), il gruppo della classe si apre e il fuoco va sul campo (`revealTargetProblem` adattato alla bozza
  nuova, `targetFieldId` invariato).
- **Scrittura**: `setSettings(ownerId, { targets, autoCalculate, goalDrivenAllocationEnabled, cashUseFixedAmount,
  cashFixedAmount })`. Con `targets` presente `setSettings` prende il ramo che rilegge il documento e lo riscrive con i campi
  di oggi (`getDoc` subito prima): gli altri campi restano quelli del server, non della cache. Poi
  `invalidateQueries(queryKeys.settings.all(ownerId))`: verdetto, Ordini, Per classe e la striscia si rifanno.
- **Impostazioni smette di scrivere i target** nella stessa PR: la fetta `allocazione` esce da `settingsDraft.ts` e
  `composeSettingsDocument` non mette più `targets` (§ 5.2 dell'ondata 2): un «Salva» di Impostazioni con la pagina aperta da
  prima non riporta indietro i target salvati qui.
- **I lettori della fetta**: `__tests__/settingsDraft.test.ts` perde i casi dei target, che passano a
  `__tests__/targetsDraft.test.ts` con lo stesso `FULL_PAGE_SETTINGS` (`compose ∘ slice ≡ targets`).

### 5.5 Bilanciamento (D-ST7)

- **Testata**: niente più «Modifica target» (né a desktop né il bottone dopo la griglia sotto `desktop:`); la striscia porta
  a Strategia.
- **Matita su Per classe** (P2): nell'aside del tile, `Pencil` 32 px (44 sotto `desktop:`), «Modifica i target per classe»,
  link a `?tab=strategia#target`. Il link di oggi in `PerClasseTile` (r. 68, verso Impostazioni) diventa questo.
- **Esposizione e Previdenza chiuse anche a desktop**, con il `collapse` locale come Intestatari della Panoramica (D-RU5): una
  riga di 52 px con l'aside di oggi («titoli, settori, geografia, valute, emittenti», il nome del fondo); si aprono in linea;
  l'Esposizione legge i profili solo all'apertura, come già sotto `desktop:`. A desktop non si ricordano (nessuna chiave nuova).
- Bilanciamento, Ordini e Per classe restano come sono (5 | 7, Per classe sotto Bilanciamento).

### 5.6 Accumulo (D-ST8)

- Restano: verdetto, Questo mese 7 | Classi del piano 5, Piani conclusi 12; senza piano `AccumuloVuotoTile`.
- Escono: Portafoglio modello e Criteri (in Strategia). Le righe chiuse sotto `desktop:` diventano Classi del piano · Piani
  conclusi (`resolveAccumuloSections`); la memoria `mobile-sections:allocation:accumulo` ignora le chiavi che non esistono più.
- La riga di Questo mese «Il piano differisce dal portafoglio modello su N strumenti» con «Rivedi dal modello» resta (apre
  l'editor del piano, che è in Accumulo).

### 5.7 I pesi per strumento (M4; D-ST6)

R8 non cambia dati. La decisione M4 («il modello comanda sui pesi per strumento») si vede così:
- la striscia mette il modello al passo 2, prima del piano; Strategia ha un solo posto per i pesi per strumento, il blocco 2;
- nel blocco 1, il livello **strumenti specifici** di una sottocategoria (`specificAssets`, upstream) resta modificabile **com'è
  oggi**, ma il suo interruttore si chiama «Strumenti specifici (solo per Bilanciamento)» e, quando esiste un modello, il piede
  del tile dice «I pesi per strumento del piano di accumulo vengono dal portafoglio modello (2); gli strumenti specifici
  dividono solo gli Ordini di Bilanciamento.»;
- se il modello sostituisce `specificAssets` (e gli Ordini si dividono per i pesi del modello) lo decide la spec della card M4,
  che parte dopo RU8 e trova un posto solo dove farlo.

### 5.8 Lo Zainetto fiscale (D-ST9)

Non in Strategia (non è una regolazione: è uno stato che cambia a ogni vendita). Il posto naturale è Bilanciamento, accanto
agli Ordini che prezzano la ritenuta, o Patrimonio; lo decide la sua spec. R8 non occupa la terza riga di Bilanciamento.

## 6. Interfaccia

### 6.1 Accessibilità
- La striscia è un `nav` con quattro link; la cella della scheda corrente ha `aria-current="page"` solo se il link porta alla
  scheda aperta; numeri e frecce sono `aria-hidden`, il nome accessibile è la frase intera («Passo 1, target per classe: 60,
  30, 10, a mano. Apri Strategia»).
- La pillola della fonte è un `radiogroup` (`SegmentedPill`); cambiare fonte annuncia la lettura nuova (regione `polite` già
  del tile).
- Il fuoco dopo «Salva i target» resta sul bottone («Salvato»); dopo un problema va sul campo.

### 6.2 Movimento
La striscia non si anima al cambio di scheda (cambia solo il fondo delle celle, con la transizione di colore del tema). Le
schede usano la scena di oggi.

### 6.3 Composizione mobile
- Bilanciamento: la striscia compatta (44 px) sta fra la barra delle schede e il verdetto; il verdetto resta la prima cosa
  letta dopo la navigazione. Righe chiuse invariate. `mobile:budget` di `allocazione` si rimisura (la striscia sposta tutto di
  ~56 px).
- Accumulo: due righe chiuse in meno; il pavimento `allocazione-accumulo` @768 deve tornare a `tilesAboveFold` ≥ 3 (card
  «Comporre Impostazioni sul telefono», D-RU22).
- Strategia: nuova superficie `allocazione-strategia` in `perf/mobile-budget.json` con `target: false` (come Impostazioni).

## 7. Piano

Una task, **RU8**, una PR (Opus 5.5). Ordine interno consigliato, con commit intermedi:
1. `lib/utils/targetsDraft.ts` + test (la fetta e i suoi casi spostati da `settingsDraft`), `lib/utils/allocationChain.ts` +
   test, `describeAllocazioneHeader` nuovo + test.
2. `StrategiaTab` con i componenti spostati, `useTargetsDraft`, la barra di salvataggio; `?tab=strategia`.
3. Accumulo ridotto; Bilanciamento (matita, righe chiuse, testata); la striscia.
4. Impostazioni senza la scheda Allocazione (fetta tolta, alias `allocazione` → Strategia, «Ripristina default» tolto dalla
   testata); i link di `fireAssumptionsNarrative` e `weightOptimizerNarrative` a `?tab=strategia`.
5. P6: `lazyComponent` per Accumulo e Strategia; tetto di `/dashboard/allocation` e `/dashboard/settings` abbassati sul Mac.
6. Guide: `doc/guide/allocazione.md`, `accumulo.md`, `ottimizzatore.md`, `impostazioni.md` (§ the FIVE places: il quinto posto
   dei target è Strategia), CLAUDE.md (una riga), AGENTS.md § 3 se serve uno stub nuovo.

**Prove**: `__tests__/{targetsDraft,allocationChain,allocazioneNarrative,settingsDraft,settingsRoundTrip}.test.ts`;
`e2e/allocation{,.mobile}.spec.ts` e `e2e/settings*.spec.ts` (oggi aprono Impostazioni › Allocazione: passano a Strategia);
le spec di Accumulo (`e2e/accumulo*.spec.ts`, il modello e i criteri ora in Strategia); `e2e/cashflow.transfer-fee.spec.ts`
(ripristina ancora il documento intero).

## 8. Decisioni

**Proposte il 2026-11-23, da confermare con Giorgio.**

| ID | Stato | Decisione | Alternative scartate e motivo |
|----|-------|-----------|-------------------------------|
| D-ST1 | Proposta | Tre schede **Bilanciamento · Accumulo · Strategia**, default Bilanciamento, `?tab=strategia`. | Strategia prima (ordine della catena): si apre una o due volte l'anno, non deve essere la porta. Strategia come pagina o modale a sé: la catena si spezzerebbe di nuovo fra due posti. |
| D-ST2 | Proposta | La striscia di quattro celle sotto le schede, **sulle tre schede**, con stato e link per cella; da `desktop:` due righe per cella (~84 px), sotto `desktop:` una riga di 44 px con numero e cifra. | Solo su Accumulo e Strategia: su Bilanciamento si perderebbe il legame «questi target vengono da qui». Appiccicata in alto (sticky): ruba altezza a ogni scorrimento. Nascosta sotto `desktop:`: proprio sul telefono la mappa serve di più. |
| D-ST3 | Proposta | Strategia senza verdetto, due blocchi numerati come la striscia: 1 Target per classe (12), 2 Portafoglio modello (7) con i Criteri accanto (5). | Un verdetto: una pagina di regolazioni non misura nulla (Declaration-Tile Rule), la striscia già riassume. I tre blocchi della review (1 Target, 2 Criteri, 3 Modello): la numerazione non tornerebbe con la striscia (2 = Modello); i criteri sono l'ingresso del «Ricalcola» del modello e stanno accanto a lui come oggi. |
| D-ST4 | Proposta | La fonte dei target è **una pillola** nell'aside del tile: A mano · Formula per età · Dai traguardi; scrive i due campi di oggi (`autoCalculate`, `goalDrivenAllocationEnabled`); «Dai traguardi» solo con i Traguardi accesi; con la formula età e risk-free sono righe di sola lettura con il link a dove si cambiano. | Due interruttori come oggi, in due schede diverse: è il difetto che R8 cura. Un campo nuovo `targetSource`: cambierebbe il dato e i lettori (email, Panoramica) per lo stesso significato. Età e risk-free modificabili qui: secondo posto di scrittura per campi di FIRE e di Impostazioni. |
| D-ST5 | Proposta | Bozza dei target nella pagina (`useTargetsDraft`), pallino sulla scheda, barra con Annulla · **Salva i target** (unico bottone pieno), stessa validazione e fuoco; scrittura con `setSettings` sul ramo che rilegge il documento; Impostazioni smette di scrivere `targets` nella stessa PR; «Ripristina default» nel piede del tile. | Salvataggio automatico a ogni cifra: un 60 → 70 a metà (6 → 7 → 70) passerebbe da totali non validi e rifarebbe gli Ordini a ogni tasto. Bozza dentro la scheda: Radix smonta la scheda inattiva e la bozza si perde passando a Bilanciamento. Impostazioni che continua a scrivere i target: un suo «Salva» con la pagina aperta da prima riporterebbe indietro quelli di Strategia (M1). |
| D-ST6 | Proposta | M4 in R8 solo come posto: il modello è il passo 2 e l'unico blocco dei pesi per strumento; `specificAssets` resta modificabile com'è, chiamato «Strumenti specifici (solo per Bilanciamento)» con la riga che dice cosa fa; il dato e gli Ordini li decide la card M4, dopo RU8. | Nascondere `specificAssets` quando c'è un modello: pesi salvati che continuano ad agire senza che si vedano. Fare M4 dentro R8 (Ordini divisi per i pesi del modello, migrazione di `specificAssets`): cambia un motore e un dato upstream in una PR di riordino, e D-AL4 aveva detto che Versa e Ribilancia non cambiano. |
| D-ST7 | Proposta | Bilanciamento: niente «Modifica target» in testata, matita su Per classe verso Strategia, Esposizione e Previdenza righe chiuse anche a desktop, testata «Portafoglio X su Y di patrimonio · fuori: …» su tutte le schede (chiude D-RU3). | Tenere «Modifica target» in testata: due porte per la stessa cosa, e l'unico bottone della testata sarebbe una regolazione rara. Esposizione aperta a desktop: è una lettura rara che pesa 240 px e legge i profili Yahoo a ogni apertura della pagina. |
| D-ST8 | Proposta | Accumulo resta l'esecuzione: Questo mese, Classi del piano, Piani conclusi; modello e criteri vanno in Strategia; `?obiettivi=1` apre Strategia. | Lasciare il modello anche in Accumulo come riassunto: la differenza piano/modello è già la riga di Questo mese e la cella 3 della striscia (P1: un riassunto senza controlli e col rimando, che già c'è). |
| D-ST9 | Proposta | Lo Zainetto fiscale non va in Strategia; R8 non gli prenota un posto, la sua spec sceglie fra Bilanciamento (accanto agli Ordini) e Patrimonio. | Prenotargli la terza riga di Bilanciamento ora: decide la sua forma prima della sua spec. |

## 9. Punti aperti

- **Gli strumenti specifici sull'account vero**: se Giorgio non usa `specificAssets`, D-ST6 può diventare «il livello non si
  offre più quando esiste un modello» senza nascondere dati (da verificare sul mirror nella PR, mai con i numeri veri nel
  repo).
- **Icona della scheda Strategia**: `Compass` o `SlidersHorizontal` (quest'ultima è oggi del bottone «Modifica target», che
  sparisce): si sceglie sul render.
- **La cella 1 con la formula**: «62 · 38» (le cifre risultanti) o «formula» come cifra; la proposta è le cifre, con la fonte
  sotto.

## 10. Criteri di accettazione

Valori inventati e tondi (WORKFLOW.md regola 7).

**Striscia** (`__tests__/allocationChain.test.ts` + spec)
1. Target Azioni 60, Obbligazioni 30, Oro 10, a mano → cella 1 «60 · 30 · 10», «a mano». Totale 110 (Azioni 70) → «70 · 30 ·
   10», «a mano · leva 1,10×». Cinque classi con target → «5 classi». Totale 90 → «da completare».
2. Modello con 3 righe di cui una gruppo di 2 strumenti, `origin: 'manual'`, `updatedAt` 2026-11-23 → «3 strumenti»,
   «scritto a mano il 23/11»; nessun modello → «da creare»; lettura fallita → «non letto».
3. Piano attivo, mese 3 di 12, fine agosto 2027, nessuna differenza → «rata 3 di 12», «fino ad ago 2027»; con 2 differenze
   (`comparePlanToModel`) → «differisce dal modello su 2»; nessun piano → «nessun piano».
4. Rata 600 € in 3 acquisti, 1 registrato → «600 €», «1 di 3 acquisti registrati»; nessun piano → «—», «nessuna rata».
5. Su Bilanciamento la cella 1 ha il fondo tinto; su Strategia 1 e 2; su Accumulo 3 e 4. A 390 la striscia non scorre
   orizzontalmente e ogni link ha un nome che dice il passo intero.

**Testata**
6. Portafoglio 16.000 €, patrimonio 300.000 €, esclusi Casa 250.000 € e Fondo pensione 34.000 € → «Portafoglio 16.000 € su
   300.000 € di patrimonio · fuori: Casa, Fondo pensione»; con quattro esclusi → «… · fuori: Casa, Fondo pensione e altri 2».

**Strategia e salvataggio**
7. Scrivo Azioni 70 e Obbligazioni 20, passo a Bilanciamento e torno: la bozza c'è e la scheda Strategia ha il pallino;
   «Salva i target» scrive una volta, il verdetto di Bilanciamento si rifà su 70/20/10.
8. Totale 95 → «Salva i target» non scrive, la barra dice il problema, il fuoco va sul campo (con il gruppo della classe aperto
   se il problema è in una sottocategoria).
9. «Annulla» rilegge il documento; «Ripristina default» mette i target di fabbrica nella bozza senza salvarli.
10. Fonte «Formula per età» con età 35 e risk-free 3,5 → Azioni = `calculateFormulaEquityPercentage(35, 3.5)` in sola lettura,
    Obbligazioni il residuo; salvare scrive `autoCalculate: true`. «Dai traguardi» non compare con i Traguardi spenti.
11. Il caso M1 di `doc/riordino-ui/ondata-2.md` § 10 criterio 12 è verde.
12. `?obiettivi=1` apre il modale dei Criteri in Strategia; «Parti dal portafoglio modello» di `AccumuloVuotoTile` porta al
    blocco 2 di Strategia.

**Bilanciamento e Accumulo**
13. Nessun «Modifica target» in testata né dopo la griglia; la matita di Per classe porta a `?tab=strategia#target`.
14. A 1440 Esposizione e Previdenza sono righe chiuse di 52 px; aperte mostrano il tile di oggi; nessuna richiesta dei profili
    prima dell'apertura (spec di rete).
15. Accumulo non contiene Portafoglio modello né Criteri; `allocazione-accumulo` @768 ha `tilesAboveFold` ≥ 3 nel census.

**Impostazioni e prestazioni**
16. Impostazioni non ha la scheda Allocazione; `?tab=allocazione` porta a Strategia (`replace`).
17. JS iniziale di `/dashboard/allocation` sotto 849 KB gz sul Mac, tetto abbassato; Accumulo e Strategia sono chunk a sé.
