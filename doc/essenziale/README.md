# Modalità Essenziale (dossier)

> Card Todoist «F17 FEAT modalità Essenziale (strada C, aree con scelta rapida)» (label `epic-review-fable`). Fonti: review
> «Riordino della UI e modalità basic» (Fable, 2026-11-12; Library `riordino-ui/parte-4-modalita-basic.md`, pagina
> https://claude.ai/artifact/1YV1mnG77bMMUHXcSwED3S), dossier dell'ondata 1 (`doc/riordino-ui/README.md`) e dell'ondata 2
> (`doc/riordino-ui/ondata-2.md`, § 5.2 R10: lo spazio riservato in testa a Impostazioni › Funzioni).
>
> **Stato: specifica scritta il 2026-11-24 su main `cd8d56a` (RU8 unita, RU9 non ancora). Decisioni D-ES1…D-ES7 PRESE da
> Giorgio il 2026-11-14 (strada C e i cinque default); D-ES8…D-ES19 PRESE da Giorgio il 2026-11-24 («Ok a tutto») (§ 8).**
> Pagina «oggi / proposta» (WORKFLOW.md regola 8): § 1.1.
>
> **ES1 implementata il 2026-11-26** (branch `claude/project-thread-gmm1te`): § 11 dice cosa è entrato e dove.
> ES2 («Verso il FIRE») segue in una PR sua.

## 1. In breve

Un account nuovo (l'amico che entra, un co-proprietario appena registrato) apre un'app con **meno porte**: il menu passa da
12 voci a 8 (9 con i Traguardi accesi), le schede da esperti spariscono, e dentro le pagine non cambia niente. Una scelta
rapida **«Essenziale · Completa»** in testa a Impostazioni › Funzioni, e nel menu dell'account accanto al tema, accende o
spegne in blocco **sette aree**; ogni area ha anche il suo interruttore, e chi ne cambia una vede «Personalizzata».

- Spegnere un'area **toglie le sue porte** (voce di menu, scheda, rimando) e nient'altro: nessun tile cambia contenuto,
  nessun calcolo cambia, snapshot, email e cron non guardano la scelta.
- La scelta è **di chi guarda**, come il tema (`userPreferences/{uid}`); gli interruttori che cambiano i dati inseriti
  (Traguardi, Centri di Costo, Divisione, Ruoli 50/30/20) restano dell'account.
- Chi c'è già resta in **Completa** senza migrazione: un documento senza la scelta si legge Completa; è la **prima
  ammissione** di un utente nuovo che scrive Essenziale.
- Un solo elemento nuovo esiste solo per chi ha FIRE spenta: il tile **«Verso il FIRE»** in Panoramica, quando il piano FIRE
  dell'account è compilato (D-ES2).

### 1.1 Dove sono i render

Pagina pubblicata con il thread «Specificare la modalità Essenziale» (2026-11-24),
https://claude.ai/artifact/ATpieDpvUSjrWcwnPu449c: la fascia a 1440 e il foglio «Altro» a 390 «oggi / Essenziale», le schede
di Cashflow, la riga di una pagina nascosta, il menu dell'account, la scheda Funzioni (interattiva), il tile «Verso il FIRE». I render
«oggi» sono l'app vera sugli emulatori (account `census@example.com`); quelli «proposta» la stessa pagina con le voci
tolte da uno script, o composti a schizzo dove la scheda non esiste ancora (Funzioni nasce con RU9). File sorgente nella
Library `essenziale/`.

## 2. Stato di partenza (letto nel codice, main `cd8d56a`)

- **Il menu** ha una fonte sola, `navGroups` in `lib/constants/navigation.ts`, letta da `Sidebar`, `SecondaryMenuDrawer`,
  `ShellBand` (attraverso `lib/utils/folderNav.ts`) e `BottomNavigation` (`secondaryHrefs`). Gruppi: Panoramica · Entrate e
  spese (Cashflow, Analisi spese) · Investimenti (Patrimonio, Allocazione, Rendimenti) · Futuro (FIRE e Simulazioni,
  Previdenza) · Storia (Storico, Hall of Fame); poi Assistente AI (flag `NEXT_PUBLIC_ASSISTANT_AI_ENABLED`) e Impostazioni
  nel menu dell'account. **12 voci.**
- **Le schede**: Cashflow (Tracciamento, Budget, Divisione*, Centri di Costo*, Dividendi; * = interruttore dell'account, la
  scheda di una funzione spenta ricade su Tracciamento, `app/dashboard/cashflow/page.tsx`), Allocazione (Bilanciamento,
  Accumulo, Strategia, `lib/utils/allocationChain.ts`), FIRE (Calcolatore, Coast, What If, Dopo il FIRE, Proiezione,
  Traguardi; `FIRE_TAB_VALUES` in `lib/utils/firePlan.ts`; «Il mio piano» in testa a tutte), Impostazioni (sette oggi,
  cinque dopo RU9: Account, Funzioni, Cashflow, Investimenti, Avanzate).
- **Le preferenze di chi guarda**: `userPreferences/{uid}` (`lib/services/userPreferencesService.ts`: `colorTheme`,
  `topBand`), regole `isOwner(userId)`; il tema vive in `localStorage` e su `<html>` da uno script in `<head>`
  (`COLOR_THEME_INIT_SCRIPT`, `app/layout.tsx`), così la prima pittura è giusta prima dell'autenticazione
  (`ColorThemeContext`). Il menu dell'account (`components/layout/AccountMenu.tsx`) ha Impostazioni, il `ThemePicker`, Esci.
- **L'ammissione**: ogni utente entra da `allowed-users/{uid}`, scritto da due sole strade di produzione: la route
  `POST /api/auth/activate` (registrazione, email o Google) e lo script `npm run users:allow` (account creato a mano nella
  console Firebase: è la strada della card «Portare a bordo il primo amico»). Le fixture E2E usano l'helper
  `scripts/lib/allowUser.ts`, non lo script.
- **Gli interruttori dell'account**: `goalBasedInvestingEnabled`, `costCentersEnabled`, `expenseSplitEnabled`,
  `spendingRolesEnabled` (dopo RU9 nella fetta `funzioni`, `doc/riordino-ui/ondata-2.md` § 5.2.1). Non esistono interruttori
  di Budget e Assistente (D-RU19 li ha lasciati a F17: qui non se ne creano, D-ES8).
- **Le porte dalle pagine che restano verso le aree che si spengono** (censimento, `rg` sui `href` e sulle parole):

  | # | Dove | Porta | Area |
  |---|------|-------|------|
  | P1 | `app/dashboard/page.tsx` (Composizione, piè) | «Il piano in Allocazione.» | Allocazione |
  | P2 | `app/dashboard/assets/page.tsx` (Classi, piè) | «Target e ribilanciamento in Allocazione.» | Allocazione |
  | P3 | `components/history/tiles/ComposizioneTile.tsx` | «Vai all'Allocazione» | Allocazione |
  | P4 | `components/assets/tiles/RendimentoTile.tsx` | link «Rendimenti» nel piè | Rendimenti |
  | P5 | `components/assets/StrumentiTile.tsx`, `AssetRow.tsx` | «Apri in Previdenza» sulla riga di un fondo pensione | Previdenza |
  | P6 | `components/assets/AssetDialog.tsx` (fondo pensione) | link «Previdenza» nel blocco membro | Previdenza |
  | P7 | `app/dashboard/cashflow/page.tsx` | scheda Dividendi e le sue due azioni | Dividendi |
  | P8 | Impostazioni (dopo RU9) | voci di «Si regola altrove» verso Strategia e FIRE › Il mio piano | Allocazione, FIRE |
  | P9 | `lib/utils/assetUsage.ts` (dialogo di eliminazione) | dove è usato uno strumento: piano, modello, FIRE | Accumulo, Allocazione, FIRE |

  Le frasi d'aiuto dei moduli che nominano l'area che legge un campo (otto in `AssetDialog`, una in `AssetMovementsDialog`,
  una in `patrimonioNarrative`, due in `goalsNarrative`) non sono porte: § 5.5. I verdetti delle pagine che restano non
  nominano altre aree (`overviewNarrative`, `patrimonioNarrative`, `storicoNarrative`, `analisiNarrative`,
  `cashflowNarrative`, `budgetNarrative`: nessuna occorrenza).

## 3. Obiettivo e perimetro

**Obiettivo**: chi apre l'app per la prima volta trova le domande del suo primo anno (quanto ho, quanto spendo, a che punto
sono con i traguardi) senza 12 voci di menu e le loro schede davanti; chi vuole di più accende un'area alla volta, o tutto con un tocco.

**Incluso**
- Il modello delle aree (§ 5.1), la preferenza di chi guarda e il suo valore iniziale (§ 5.2), la scelta rapida in
  Impostazioni › Funzioni e nel menu dell'account (§ 5.3), il menu e le schede che leggono le aree (§ 5.4), le porte (§ 5.5),
  la riga di una pagina nascosta (§ 5.6), il tile «Verso il FIRE» (§ 5.7).

**Escluso**
- Tile da esperti chiusi a 1440 per tutti (parte B della review: Rischio e Consistenza in Rendimenti, Driver in Storico,
  Flusso e Calendario in Analisi spese): cambia le pagine anche per chi è in Completa, quindi è una card sua (D-ES17).
- Il riordino dell'ondata 3 (R9 FIRE in tre schede, Traguardi e Record nel menu, R7): F17 funziona sul menu di oggi e
  l'ondata 3 sposta solo righe della tabella delle aree (§ 5.1, D-ES9).
- Interruttori nuovi per Budget e Assistente (D-ES8).
- Email, PDF, cron, snapshot: non guardano la scelta (regola R3).
- Il telefono: la pillola in basso (Panoramica, Patrimonio, Cashflow) non cambia; cambia il foglio «Altro», che legge gli
  stessi gruppi.

## 4. Casi d'uso

1. **L'amico entra per la prima volta.** Giorgio lo crea nella console e lo ammette con `npm run users:allow`; al primo
   accesso il menu è Panoramica · Cashflow · Analisi spese · Patrimonio · Storico · Hall of Fame · Assistente, Impostazioni
   nel menu dell'account. In Cashflow vede Tracciamento e Budget.
2. **Vuole il Bilanciamento.** Impostazioni › Funzioni › «Cosa vedi»: accende Allocazione; la scelta rapida dice
   «Personalizzata», il menu guadagna Allocazione con Bilanciamento e Strategia (Accumulo resta spento finché non lo accende).
3. **Vuole vedere tutto.** Menu dell'account › «Vista: Completa»: tutto acceso in un tocco, senza aprire Impostazioni.
4. **Giorgio** non vede differenze: il suo `userPreferences` non ha la scelta, quindi Completa.
5. **La compagna di Giorgio, co-proprietaria, si registra.** La registrazione la ammette in Essenziale; guarda l'account di
   Giorgio con il menu corto, mentre Giorgio, sullo stesso account, resta in Completa. Il piano FIRE dell'account è compilato,
   quindi in Panoramica vede «Verso il FIRE».
6. **Un link porta a un'area spenta** (un segnalibro, il dialogo di eliminazione, l'email). La pagina si apre come sempre, con
   una riga sotto la testata: «Allocazione non è nel tuo menu.» e il pulsante «Mostrala nel menu».
7. **Dividendi spenta, ma ho ETF a distribuzione.** Il cron registra i dividendi come sempre; in Tracciamento li vedo tra le
   entrate; la scheda Dividendi non c'è finché non accendo l'area.

## 5. Regole

### 5.1 Le aree

Una tabella sola, `lib/constants/viewAreas.ts`, dice quali porte appartengono a quale area. Sette aree di chi guarda:

| Area (`id`) | Porte | Richiede | Essenziale | Completa |
|---|---|---|---|---|
| Allocazione (`allocazione`) | voce di menu; P1, P2, P3; «Si regola altrove» → Strategia | — | spenta | accesa |
| Piano di accumulo (`accumulo`) | scheda Allocazione › Accumulo; righe «piano» di P9 | `allocazione` | spenta | accesa |
| Rendimenti (`rendimenti`) | voce di menu; P4 | — | spenta | accesa |
| FIRE (`fire`) | voce di menu (schede Calcolatore, What If); «Si regola altrove» → Il mio piano; righe FIRE di P9 | — | spenta | accesa |
| Simulazioni (`simulazioni`) | schede Coast FIRE, Dopo il FIRE, Proiezione; scheda Impostazioni › Avanzate | `fire` | spenta | accesa |
| Dividendi (`dividendi`) | scheda Cashflow › Dividendi e le sue azioni (P7) | — | spenta | accesa |
| Previdenza (`previdenza`) | voce di menu | — | spenta (P5, P6 restano, D-ES10) | accesa |

- **Sempre accese** (non sono aree): Panoramica, Cashflow › Tracciamento e Budget, Analisi spese, Patrimonio, Storico, Hall of
  Fame, Assistente (se il flag è acceso), Impostazioni › Account, Funzioni, Cashflow, Investimenti (D-ES12).
- **Traguardi** non è un'area di chi guarda: segue l'interruttore dell'account `goalBasedInvestingEnabled` (D-ES9).
- **«Richiede»**: un'area dipendente spenta dal suo capo è spenta qualunque cosa dica la sua preferenza; il suo interruttore
  è disabilitato con la riga «Richiede FIRE».
- **Una funzione pura** decide tutto: `resolveViewAreas(prefs): Record<ViewAreaId, boolean>` in `lib/utils/viewAreas.ts`, e
  `resolveNavGroups(areas, account)` che restituisce i gruppi del menu già filtrati (un gruppo vuoto sparisce). `navGroups`
  resta la lista completa; Sidebar, foglio «Altro», `ShellBand`/`folderNav` e `secondaryHrefs` leggono la funzione.
  Nessun componente scrive `areas.fire &&` a mano fuori dalla tabella delle porte (§ 5.5).
- **L'ondata 3** cambia solo righe: Traguardi diventa una voce sua (sparisce l'eccezione di D-ES9), le schede di FIRE si
  rinominano nella colonna «Porte».

### 5.2 La preferenza

- **Dove**: `userPreferences/{uid}` (di chi guarda, regola esistente `isOwner(userId)`, nessuna regola nuova), due campi:
  - `viewPreset?: 'essenziale' | 'completa'` — **assente = `completa`**;
  - `viewAreaOverrides?: Partial<Record<ViewAreaId, boolean>>` — le aree che chi guarda ha cambiato rispetto al preset.
- **«Personalizzata»** non è un valore salvato: è ciò che la UI dice quando `viewAreaOverrides` ha almeno una voce diversa dal
  preset. Scegliere Essenziale o Completa cancella gli override (`deleteField()`). Un'area aggiunta in futuro prende il
  valore del preset, senza migrazione.
- **Valore iniziale** (D-ES3): nessuna migrazione; chi c'è già non ha `viewPreset`, quindi Completa. Scrive
  `viewPreset: 'essenziale'` (con `merge`, **solo se il documento non ha già un `viewPreset`**) la **prima ammissione** in
  produzione:
  - `POST /api/auth/activate`, nel ramo che crea `allowed-users/{uid}` (non in quello «già ammesso»);
  - `npm run users:allow -- <email>`, quando l'utente non era ammesso; il flag `--completa` scrive invece `completa`.
  - L'helper `scripts/lib/allowUser.ts` (usato dalle fixture) **non** la scrive: le fixture E2E e il census restano in
    Completa senza toccare un seed.
- **Lettura e prima pittura** (D-ES15): come il tema. `localStorage` (`view-areas`) tiene il preset e gli override; uno script
  in `<head>` (`VIEW_AREAS_INIT_SCRIPT`, accanto a `COLOR_THEME_INIT_SCRIPT`) mette su `<html>` l'attributo
  `data-view-off="allocazione rendimenti …"`; ogni voce di menu e ogni scheda con un'area porta `data-view-area="<id>"`, e
  una regola CSS le nasconde prima dell'idratazione. Dopo l'autenticazione un provider (`ViewAreasContext`, sul modello di
  `ColorThemeContext`) legge `userPreferences` una volta per uid e allinea storage e attributo. Su un dispositivo nuovo il
  primo caricamento mostra il menu completo per il tempo della lettura: dichiarato, non nascosto.
- **Demo** (D-ES16): l'account demo si legge Completa; la scelta rapida funziona per la sessione (`localStorage`) e non si
  scrive mai (`useDemoMode`).
- **Account condiviso**: la preferenza è del `user.uid` che guarda, non dell'`ownerId`. Chi passa da un account all'altro con
  il selettore tiene la sua vista.

### 5.3 La scelta rapida

**Impostazioni › Funzioni** (la scheda nasce con RU9; F17 occupa lo spazio riservato in testa, `ondata-2.md` § 5.2):

| Ordine | Tile | Contenuto |
|---|---|---|
| 1 | **Cosa vedi** 12 | in testa la pillola `SegmentedPill` «Essenziale · Completa» (con «Personalizzata» scritto accanto quando ci sono override, non un terzo bottone); la riga «Vale solo per te: chi usa l'account con te sceglie la sua.»; poi una riga per area (§ 5.1) con `Switch`, nome e una riga d'aiuto che dice cosa compare quando è accesa («Aggiunge Allocazione al menu: Bilanciamento e Strategia»). Le dipendenti rientrate sotto il capo. Si salva da sola, come il tema (non entra nella bozza di Impostazioni, non accende il pallino). |
| 2 | **Funzioni dell'account** 12 | il tile di RU9 (Traguardi, Centri di Costo, Divisione, Ruoli 50/30/20), con la riga «Valgono per tutti quelli che usano l'account.»; entra nella bozza e nel «Salva» come in RU9. |

**Menu dell'account** (`AccountMenu`, una sola copia per la barra laterale e la fascia): sotto «Preferenze», dopo la riga
«Tema», una riga «Vista» con la stessa pillola del `ThemePicker` e due voci di testo «Essenziale · Completa» (con override
nessuna delle due è segnata e la riga dice «Vista: personalizzata»), poi la voce «Scegli le aree…» che apre Impostazioni ›
Funzioni.

### 5.4 Menu e schede

- **Menu**: `resolveNavGroups`. In Essenziale, senza Traguardi: Panoramica · Entrate e spese (Cashflow, Analisi spese) ·
  Investimenti (Patrimonio) · Storia (Storico, Hall of Fame) · Assistente · Impostazioni = **8**. Con i Traguardi accesi
  nell'account: + Futuro (Traguardi) = **9**. Completa: 12 come oggi.
- **Un gruppo con una sola pagina** resta un gruppo (nome e una scheda nella fascia): cambiare la forma della fascia per la
  vista corta sarebbe una seconda composizione (regola R2). Nel foglio «Altro» (che omette le tre pagine della pillola) un
  gruppo rimasto senza voci sparisce con la sua etichetta (Investimenti in Essenziale).
- **La pagina aperta resta nella fascia**: arrivati da un link a una pagina di un'area spenta, la fascia mostra la sua scheda
  (aperta) nel suo gruppo finché ci si resta, così chi guarda non perde dove si trova; le altre pagine spente del gruppo no.
- **Una pagina con una sola scheda visibile** non mostra la barra delle schede (FIRE ridotta ai Traguardi).
- **Schede**: `PageTabs`/`PageTabBar` ricevono le schede già filtrate dalla pagina con `filterTabsByArea(tabs, areas)`. Una
  scheda spenta richiesta da `?tab=` **si apre lo stesso** con la riga di § 5.6 (non ricade sulla prima, come fa oggi la
  scheda di una funzione dell'account spenta: lì la funzione non esiste, qui è solo nascosta).
- **FIRE con FIRE spenta** (D-ES9): la voce si chiama «Traguardi», porta a `/dashboard/fire-simulations?tab=goals` e la pagina
  mostra la sola scheda Traguardi; «Il mio piano» resta in testa (la pagina non cambia stanze; l'ondata 3 lo risolve dando ai
  Traguardi la loro pagina).
- **Impostazioni**: Avanzate segue Simulazioni; le altre quattro schede sempre (D-ES12). Nessun tile di Impostazioni si
  nasconde.
- **Assistente**: invariato. Il contesto che manda al modello non guarda la vista.

### 5.5 Le porte

- **Le porte P1–P8 si nascondono intere** quando la loro area è spenta: il link con la sua frase («Target e ribilanciamento in
  Allocazione.» sparisce tutta, il piè resta con ciò che dice d'altro o sparisce se era solo quello). Ogni porta legge
  `useViewArea('<id>')`; la tabella delle porte in § 2 è la lista da tenere in pari (una prova per porta, § 10).
- **P5 e P6 restano** (D-ES10): esistono solo sulla riga o nel modulo di un fondo pensione, quindi sono già «accese solo se c'è
  un fondo»; portano a Previdenza anche se la voce di menu è spenta.
- **P9 resta** (dialogo di eliminazione): spiega perché un'eliminazione è bloccata; nasconderla lascerebbe un blocco senza
  ragione. I link portano alla pagina, che mostra la riga di § 5.6.
- **Le frasi d'aiuto non sono porte** (D-ES13): «Vale solo per la pagina Allocazione», «Usati per il calcolo del beneficio
  fiscale nella vista Previdenza» restano vere (l'area esiste, è fuori dal menu) e spiegano un campo che continua a contare.
  Non si riscrivono.
- **Niente frasi nuove** che nominano la vista nei verdetti o nelle letture.

### 5.6 La riga di una pagina nascosta

- Una pagina o una scheda di un'area spenta, aperta da un link, mostra sotto la testata (sopra il verdetto) una riga
  `HiddenAreaNotice`: «{Area} non è nel tuo menu.» e un pulsante secondario «Mostrala nel menu», che accende **quell'area**
  (e il suo capo, se dipende) come override: la vista diventa «Personalizzata». Nessuna chiusura con la X, nessun avviso
  ambra: è un fatto, non un allarme.
- Una sola copia nel layout della dashboard: legge pathname e `?tab=`, li traduce in area con la tabella di § 5.1.
- Il pulsante non è pieno (un solo bottone pieno per pagina: quello della pagina).

### 5.7 «Verso il FIRE» in Panoramica

- **Quando**: area `fire` spenta **e** piano FIRE salvato nell'account con età (`userAge`) e SWR (`withdrawalRate`). Con FIRE
  accesa non c'è: la casa del numero è il Calcolatore (P1 di DESIGN.md).
- **Dove**: colonna «Quanto ho», nella riga di Sintesi · Costi · Obiettivo, al posto di Costi quando non c'è spazio (le regole
  di colonne dei tre tile in `app/dashboard/page.tsx` contano un quarto).
- **Cosa**: eyebrow «Verso il FIRE»; cifra eroe la percentuale del capitale FIRE sul numero FIRE; una riga «{capitale} di
  {numero FIRE} · FIRE previsto nel {anno}» (scenario Base) o «oltre l'orizzonte»; nessun grafico. Nel piè «Mostra FIRE nel
  menu» (accende l'area, come § 5.6).
- **Le cifre sono le stesse del Calcolatore** (NF1: «numero FIRE» nomina solo il requisito del Calcolatore): la derivazione di
  `FireCalculatorTab` (capitale K1/EF1, `resolveFireRequirement`, anno Base) esce in un hook `useFireProgress()` che il
  Calcolatore e il tile leggono entrambi. Il tile è un `lazyComponent` caricato solo quando la condizione è vera: per chi è
  in Completa Panoramica non cambia di un byte né di una lettura.
- **Letture**: le stesse del Calcolatore (impostazioni, strumenti, snapshot, spese per finestra FIRE), dalla cache
  persistita quando c'è. Per chi ha FIRE spenta e il piano compilato sono letture in più su Panoramica: misurate nella PR.

## 6. Interfaccia

### 6.1 Accessibilità
- La pillola «Essenziale · Completa» è un `radiogroup` con nome «Vista»; gli `Switch` delle aree hanno l'etichetta cliccabile
  (la riga intera, come nelle Funzioni dell'account) e `aria-describedby` sulla riga d'aiuto; uno dipendente disabilitato dice
  perché nella sua descrizione.
- Cambiare vista non sposta il fuoco; un annuncio `polite` dice «Vista Essenziale: 8 voci nel menu».
- `HiddenAreaNotice` è un `<p role="status">` letto una volta all'apertura, non un `alert`.
- Il menu nascosto da CSS prima dell'idratazione usa `display:none` (fuori dall'albero di accessibilità), mai `visibility`.

### 6.2 Movimento
Nessuno nuovo. Le voci che compaiono o spariscono nel menu non si animano (un cambio di vista è raro e voluto).

### 6.3 Composizione mobile
- Il foglio «Altro» legge `resolveNavGroups`; la pillola in basso non cambia.
- Il census della prima schermata gira su `census@example.com`, che resta in Completa (§ 5.2): **nessuna voce di
  `perf/mobile-budget.json` cambia per ES1**, salvo Impostazioni › Funzioni (la scelta rapida allunga la scheda; la voce è
  `target: false` e si riscrive al misurato). Il rosso di `mobile:budget` ancora aperto su Impostazioni va chiuso da RU9 prima
  che ES1 misuri.
- «Verso il FIRE» sotto `desktop:` è una riga chiusa di «Il resto della pagina» (`panoramica-fire`, risposta «{p}% del numero
  FIRE»); il census non la vede (Completa).

## 7. Piano

Due task, una PR ciascuna, **dopo RU9** (la scheda Funzioni, le fette della bozza, i tab id). **Modello**: Opus 5.5 per ES1
(tocca la shell, il layout, l'ammissione e cinque pagine), Sonnet 5.5 per ES2.

| Task | Contenuto | Tocca | Dipende da |
|------|-----------|-------|------------|
| **ES1** | Aree, preferenza, valore iniziale, scelta rapida, menu, schede, porte, riga della pagina nascosta (§ 5.1–5.6) | nuovi `lib/constants/viewAreas.ts`, `lib/utils/viewAreas.ts`, `contexts/ViewAreasContext.tsx`, `components/layout/HiddenAreaNotice.tsx`; `navigation.ts`, `folderNav.ts`, `Sidebar`, `SecondaryMenuDrawer`, `ShellBand`, `BottomNavigation`, `AccountMenu`, `app/layout.tsx` (script), `app/dashboard/layout.tsx`, `userPreferencesService.ts`, `app/api/auth/activate/route.ts`, `scripts/usersAllow.mts`, le pagine con porte (P1–P8), `FunzioniTab` di RU9, `doc/guide/shell.md`, `doc/guide/impostazioni.md`, `doc/guide/account-condiviso-demo.md`, DESIGN.md (una regola, § 8 D-ES18) | RU9 |
| **ES2** | «Verso il FIRE» (§ 5.7) e l'hook condiviso con il Calcolatore | `FireCalculatorTab`, nuovo `lib/hooks/useFireProgress.ts`, nuovo `components/dashboard/overview/VersoIlFireTile.tsx`, `app/dashboard/page.tsx`, `overviewSummary` (riga chiusa), `doc/guide/panoramica.md`, `doc/guide/fire.md` | ES1 |

Ogni PR: `npx tsc --noEmit`, `npx eslint app components lib types e2e scripts __tests__`, `TZ=Europe/Rome npx vitest run`
sui file toccati, le spec E2E della shell e delle pagine con porte sugli emulatori (nel cloud), sul Mac `perf:build` +
`perf:budget` (WORKFLOW.md regola 10) e il giudizio visivo; `mobile:budget` per la voce di Funzioni (ES1) e per Panoramica
(ES2, dove il tile non compare: deve restare uguale).

**Prima di ES1**: la card «Portare a bordo il primo amico». Se l'amico entra prima che ES1 sia in produzione, non ha
`viewPreset` e si legge Completa: Giorgio lo mette in Essenziale insieme a lui al primo accesso (un tocco nel menu
dell'account), oppure entra dopo ES1 (§ 9).

## 8. Decisioni

| ID | Stato | Decisione | Alternative scartate e motivo |
|----|-------|-----------|-------------------------------|
| D-ES1 | **Presa** (2026-11-14) | Strada C: aree che si accendono e si spengono, con la scelta rapida «Essenziale · Completa»; spegnere un'area toglie solo le sue porte. | A, due composizioni per pagina: ogni pagina disegnata, provata e misurata due volte per sempre. B, solo livelli a richiesta: il menu resta di 12 voci, ed è lì che ci si perde. |
| D-ES2 | **Presa** (2026-11-14) | FIRE spenta in Essenziale, con un tile «Verso il FIRE» in Panoramica solo se il piano è compilato (unica eccezione a «niente esiste solo in Essenziale»). Dettaglio proposto: § 5.7 (stesse cifre del Calcolatore da un hook condiviso, tile caricato a richiesta, task ES2 a sé). | Tenere la sola scheda Calcolatore: FIRE resta la pagina più da esperti, e il tile risponde a «a che punto sono» senza aprirla. Un tile con «Spese ÷ SWR» (come il PDF): una seconda cifra chiamata FIRE, contro NF1. |
| D-ES3 | **Presa** (2026-11-14) | Chi c'è resta in Completa; un account nuovo o un co-proprietario appena registrato parte in Essenziale. Meccanismo proposto: assente = Completa; la prima ammissione in produzione (activate, `users:allow`) scrive Essenziale; un utente che esisteva già e viene aggiunto come co-proprietario tiene la sua vista (la scelta è sua, D-ES7). | Assente = Essenziale con una migrazione che scrive Completa a chi c'è: una scrittura in produzione per ogni utente e ogni fixture E2E da aggiornare. Scriverla alla registrazione nel client (`AuthContext`): l'amico creato a mano nella console non passa da lì. |
| D-ES4 | **Presa** (2026-11-14) | Nomi «Essenziale» e «Completa»; «Personalizzata» quando ci sono aree cambiate a mano. | «Basic»: suona come un piano a pagamento; «Essenziale» è già una parola del marchio (PRODUCT.md). |
| D-ES5 | **Presa** (2026-11-14) | La scelta in testa a Impostazioni › Funzioni e una seconda porta nel menu dell'account accanto al tema. | Solo in Impostazioni: chi è in Essenziale deve trovare «mostra tutto» senza cercarlo. |
| D-ES6 | **Presa** (2026-11-14) | Allocazione spenta in Essenziale. | Accesa: Composizione e Classi rispondono già a «com'è diviso»; «cosa compro» è una domanda di secondo livello. |
| D-ES7 | **Presa** (2026-11-14) | La vista è di chi guarda (preferenze personali, come il tema); gli interruttori che cambiano i dati restano dell'account. | Dell'account: Giorgio e chi condivide l'account vedrebbero per forza la stessa app. |
| D-ES8 | **Presa** (2026-11-24) | Sette aree di chi guarda (§ 5.1): Allocazione, Piano di accumulo, Rendimenti, FIRE, Simulazioni, Dividendi, Previdenza; due dipendenze (Accumulo da Allocazione, Simulazioni da FIRE). Budget e Assistente non diventano aree. | Le aree della review con «Strategia passi 2 e 3» dentro Accumulo: spegnerebbe tile dentro una scheda, cioè cambierebbe una stanza. Meno aree (cinque, senza Accumulo e Simulazioni): chi vuole il Bilanciamento senza il PAC, o il Calcolatore senza Monte Carlo, non potrebbe. Budget e Assistente aree: Budget è nel cono di Essenziale; l'Assistente ha già il suo flag. |
| D-ES9 | **Presa** (2026-11-24) | Finché l'ondata 3 non dà ai Traguardi una voce loro: con FIRE spenta e Traguardi accesi nell'account, la voce di FIRE si chiama «Traguardi» e la pagina mostra la sola scheda Traguardi, con «Il mio piano» in testa come oggi. | Aspettare l'ondata 3 per fare F17: l'ondata 3 non ha ancora una specifica e l'amico entra prima. Traguardi fuori da Essenziale fino all'ondata 3: toglie il terzo pezzo del cono («a che punto sono con i miei traguardi»). |
| D-ES10 | **Presa** (2026-11-24) | Previdenza: voce di menu spenta in Essenziale; i link dalla riga e dal modulo di un fondo pensione in Patrimonio restano. È la regola della review «accesa se c'è un fondo» senza una lettura nuova. | Leggere gli strumenti nella shell per accendere la voce quando c'è un fondo: una lettura in più su ogni pagina, per una voce. Nascondere anche i link: chi ha un fondo non troverebbe dove inserire i versamenti. |
| D-ES11 | **Presa** (2026-11-24) | Storico e Hall of Fame restano accesi in Essenziale, come pagine intere (l'ondata 3 li unisce). | Hall of Fame spenta: costa niente tenerla ed è nel cono («come sono arrivato qui»). |
| D-ES12 | **Presa** (2026-11-24) | Impostazioni in Essenziale: Account, Funzioni, Cashflow, Investimenti; Avanzate segue Simulazioni. Nessun tile di Impostazioni si nasconde; le voci di «Si regola altrove» verso un'area spenta sì. | Tre schede come nella review (senza Investimenti): il bollo, che cambia i Costi in Panoramica, diventerebbe irraggiungibile. Nascondere tile dentro Investimenti: cambia una stanza. |
| D-ES13 | **Presa** (2026-11-24) | Si nascondono le porte (link e la loro frase, schede, azioni); le frasi d'aiuto dei moduli che nominano l'area che legge un campo restano, e restano i rimandi del dialogo di eliminazione. | Rendere condizionale ogni frase che nomina un'area (regola 5 della review alla lettera): una decina di frasi d'aiuto riscritte che spiegano un campo che continua a contare, con una versione che non si prova mai in Completa. |
| D-ES14 | **Presa** (2026-11-24) | Un link a un'area spenta apre la pagina con la riga «{Area} non è nel tuo menu.» e «Mostrala nel menu» (accende quell'area, vista Personalizzata). | Rimandare a Panoramica: rompe segnalibri e i link del dialogo di eliminazione. Aprire senza dire nulla: chi arriva non capisce perché la pagina non è nel menu. |
| D-ES15 | **Presa** (2026-11-24) | Prima pittura come il tema: `localStorage` + script in `<head>` + attributo su `<html>` + CSS sulle voci; la lettura da `userPreferences` dopo l'autenticazione. | Menu completo e poi accorciato dopo la lettura: le voci saltano a ogni caricamento per chi è in Essenziale. Aspettare l'autenticazione prima di disegnare il menu: la shell è prerenderizzata apposta per non aspettarla (2026-09-28). |
| D-ES16 | **Presa** (2026-11-24) | Demo in Completa; la scelta rapida funziona per la sessione e non si salva. | Demo in Essenziale: la landing mostra l'app intera a chi la valuta. Salvarla: il documento della demo è di tutti i visitatori. |
| D-ES17 | **Presa** (2026-11-24) | I tile da esperti chiusi a 1440 per tutti (parte B della review) escono da F17 in una card loro, con il loro schizzo. | Farli in F17: cambiano Rendimenti, Storico e Analisi anche per chi è in Completa, toccano il budget della prima schermata di tre pagine e meritano una scelta a sé, tile per tile. |
| D-ES18 | **Presa** (2026-11-24) | DESIGN.md riceve una regola, **The Door-Not-Room Rule**: «A view area hides doors (a menu entry, a tab, a link with its sentence); it never changes what a tile shows or what a figure counts. Nothing exists only in one view, except where a decision in `doc/essenziale/README.md` names it.» | Nessuna regola scritta: la prossima feature metterebbe un `if (essenziale)` dentro un tile, e la seconda composizione nasce da lì. |
| D-ES19 | **Presa** (2026-11-24) | Due task (§ 7): ES1 tutto tranne il tile, ES2 il tile «Verso il FIRE», entrambe dopo RU9. | Una PR sola: l'hook del Calcolatore e la shell nello stesso diff, due giri di misura. Prima di RU9: la scheda Funzioni non esiste e le schede di Impostazioni cambiano id subito dopo. |

## 9. Punti aperti

- **L'amico prima o dopo ES1?** Se entra prima, si legge Completa: o Giorgio lo mette in Essenziale al primo accesso insieme
  (un tocco), o la card dell'amico aspetta ES1. Va scelto con quella card, non qui.
- **Il giro con il tester** (review, «Cosa non so»): l'elenco delle aree di Essenziale è un giudizio, non una misura d'uso.
  Conviene rifare il giro con la stessa persona sulla pagina «oggi / proposta» prima di ES1.
- **Letture di «Verso il FIRE»**: quante letture Firestore aggiunge a una Panoramica fredda per chi ha FIRE spenta e il piano
  compilato; si misura in ES2 sul census con il piano compilato (capacità Spark, `capacita/README.md`).

## 10. Criteri di accettazione

Valori inventati e tondi (WORKFLOW.md regola 7).

**ES1**
1. `resolveViewAreas`: senza documento → tutte accese; `{ viewPreset: 'essenziale' }` → tutte spente; `{ viewPreset:
   'essenziale', viewAreaOverrides: { allocazione: true } }` → solo Allocazione accesa, Accumulo spento; `{ viewPreset:
   'completa', viewAreaOverrides: { fire: false } }` → FIRE e Simulazioni spente anche se Simulazioni non è negli override
   (dipendenza). Vitest.
2. `resolveNavGroups` in Essenziale senza Traguardi: 6 voci nei gruppi + Assistente + Impostazioni = 8;
   con `goalBasedInvestingEnabled`: + «Traguardi» → `/dashboard/fire-simulations?tab=goals`; nessun gruppo vuoto. Completa:
   identico a `navGroups`. Vitest.
3. La prima ammissione scrive `viewPreset: 'essenziale'`: `POST /api/auth/activate` per un uid nuovo lo scrive, per un uid già
   ammesso no, e un `viewPreset` già presente non si tocca (test della route su `__tests__/helpers/adminFake.ts`);
   `allowUser` delle fixture non lo scrive.
4. E2E (emulatori, un account della fixture con `viewPreset: 'essenziale'` scritto dal seed): a 1440 la fascia ha i gruppi
   Panoramica, Entrate e spese, Investimenti, Storia; Cashflow ha due schede; `/dashboard/allocation` si apre con la riga
   «Allocazione non è nel tuo menu.»; «Mostrala nel menu» aggiunge Allocazione alla fascia senza ricaricare e la scelta in
   Funzioni dice «Personalizzata». A 390 lo stesso nel foglio «Altro».
5. E2E: menu dell'account › «Completa» rimette 12 voci; ricaricando la pagina le voci non lampeggiano (nessun frame con
   Allocazione visibile in Essenziale dopo il primo caricamento, dallo storage).
6. Ogni porta P1–P8 ha la sua prova: con l'area spenta il link e la sua frase non ci sono, con l'area accesa sì.
7. Le spec E2E esistenti restano verdi senza modifiche (il census e le fixture sono in Completa); `perf:budget` entro i tetti
   (la shell cresce di qualche KB al massimo).

**ES2**
8. Piano con età 40, SWR 4%, spesa del piano 24.000 €, nessun flusso, nessuna pensione, nessun fondo, guadagno latente zero
   (niente imposta sui prelievi), capitale FIRE 150.000 €: numero FIRE 24.000 / 0,04 = **600.000 €**, avanzamento
   150.000 / 600.000 = **25%**. Il tile scrive «25%» e «150.000 € di 600.000 €», e il Calcolatore sullo stesso piano scrive lo
   stesso numero (`useFireProgress` letto da tutti e due).
9. Con FIRE accesa, o senza `userAge`/`withdrawalRate` salvati, il tile non c'è e il suo chunk non si carica (rete).
10. `mobile:budget` di Panoramica invariato sul census (Completa).

## 11. ES1 — com'è stata fatta (2026-11-26)

- **Codice**: `lib/constants/viewAreas.ts` (la tabella, lo script e lo stile della prima pittura, la prima ammissione),
  `lib/utils/viewAreas.ts` (le funzioni pure), `contexts/ViewAreasContext.tsx` (lo store, la lettura da `userPreferences`,
  la regione `polite`), `lib/hooks/useViewNavGroups.ts`, `components/layout/{HiddenAreaNotice,ViewPicker}.tsx`,
  `components/settings/tabs/CosaVediTile.tsx`; il resto sono modifiche alle letture di § 7.
- **Scelte prese scrivendo il codice** (nessuna cambia una decisione):
  - la riga «non è nel tuo menu» la disegna `PageHeader` (una copia nel codice, sotto la testata in ogni pagina della
    dashboard) invece del layout: il layout non sa dove finisce la testata della pagina;
  - FIRE tiene la scheda aperta nello stato, non nell'URL: le quattro pagine a schede pubblicano la loro
    (`usePublishOpenTab`) e la riga legge quella, poi `?tab=`;
  - una dipendente spenta (Accumulo) dà la riga col SUO nome («Piano di accumulo non è nel tuo menu.»), e «Mostrala nel
    menu» accende anche il capo: un tocco solo;
  - `secondaryHrefs` resta intero: una pagina nascosta aperta da un link accende ancora «Altro» nella pillola;
  - l'annuncio «Vista Essenziale: 8 voci nel menu» conta i Traguardi dalla cache delle impostazioni, senza una lettura
    in più nella shell;
  - `scripts/seedEmulator.ts` accetta `SEED_UID`/`SEED_EMAIL` per seminare lo stesso portafoglio su un altro account
    (gli id prendono il prefisso dell'uid).
- **Le porte**: P1–P4 nascoste con la loro frase (in Patrimonio il piè di «Guadagno sul costo» resta «Tra gli N
  strumenti maggiori.»), P8 come `area` di un `ElsewhereItem`; P5, P6, P9 restano (D-ES10, § 5.5); le frasi d'aiuto
  che nominano Strategia dentro un tile di Investimenti restano (D-ES13).
- **Prove**: `__tests__/viewAreas.test.ts` (criteri 1–2, le schede, la riga, lo script della prima pittura eseguito
  contro il TypeScript), `__tests__/activateRoute.test.ts` (criterio 3), `e2e/essenziale.spec.ts` e
  `e2e/essenziale.mobile.spec.ts` (criteri 4–6, viste rosse rompendo la porta P2 e togliendo lo stile).
- **Sul Mac, nella PR**: `perf:build` + `perf:budget` (la shell cresce di qualche KB), `mobile:budget` per la voce di
  Impostazioni › Funzioni (la scheda si allunga del tile «Cosa vedi»), il giudizio visivo.

