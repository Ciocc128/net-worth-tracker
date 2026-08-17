# Spec 4 — Redesign tab Calcolatore FIRE + grafico a ventaglio

> **Ordine**: 4 di 5. **Dipende dalla Spec 3** (mostra bridge e sblocco) e beneficia della Spec 1.
> **Scopo**: portare il tab "Calcolatore FIRE" all'IA "single-answer" del resto dell'app (hero con
> verdetto → dettaglio progressivo) e aggiungere la vista **Ventaglio**: percentili + percorsi
> casuali derivati dal portafoglio reale sul grafico di proiezione.
> **Vincolo di fondo**: questa spec NON cambia la matematica — presenta i risultati delle formule
> esistenti (incluse quelle della Spec 3). Ogni numero mostrato deve provenire da una pure
> function già testata.

## Decisione presa (Giuseppe, 2026-08-17)

Struttura a 5 tab **invariata**; il ventaglio con i path casuali entra nel tab FIRE come vista del
grafico di proiezione; il tab Monte Carlo resta per l'analisi approfondita (decumulo).

## Stato attuale

`components/fire-simulations/FireCalculatorTab.tsx` (937 righe): collapsible impostazioni (SWR,
switch casa, switch fondo pensione + controlli RITA da Spec 3), due card hero (FIRE number,
Reddito passivo), `FireReachedBanner`, due LineChart ("Anni di Spesa Coperti nel Tempo",
"Cashflow e Reddito Passivo nel Tempo"), `FIREProjectionSection` (input Bear/Base/Bull +
`FIREProjectionChart` a 6 serie + `FIREProjectionTable`), collapsible "Come funziona il FIRE?".
Problemi: configurazione mescolata ai risultati, nessun verdetto dominante, due grafici storici
allo stesso livello della proiezione, 6 serie sovrapposte nel grafico principale.

## Layout target (riferimenti: `PerformanceHero`, Panoramica, DESIGN.md — che è normativo e NON
va mai rigenerato)

1. **Hero `[2fr_1fr]`** (pattern `desktop:grid-cols-[2fr_1fr]`, `h-full` su entrambi i livelli —
   AGENTS → *Tailwind Breakpoints*):
   - **Dominante**: la risposta alla domanda della pagina — "Quando?": anno/età di FIRE proiettati
     nello scenario base (dalla proiezione esistente), con verdetto testuale (es. "FIRE proiettato
     nel 2041, a 56 anni") + chip `% verso FI` + gap in €. Se il FIRE è già raggiunto, il verdetto
     lo dice e il `FireReachedBanner` attuale viene assorbito qui (non due annunci).
   - **Companion**: Reddito passivo sostenibile (annuo dominante, mensile/giornaliero secondari,
     righe "di cui liquidi/illiquidi"). Con toggle pensione attivo: riga "Fondo pensione: {X} € —
     rientra nel {anno}" (Spec 3).
   - Sotto l'hero, una riga di **basis** in `text-muted-foreground` che dichiara le assunzioni
     attive: SWR, casa inclusa/esclusa, fondo pensione bloccato/no (stesso pattern della riga
     basis di Rendimenti).
2. **Configurazione separata dai risultati**: un solo collapsible "Impostazioni" (SWR, casa,
   fondo pensione + controlli RITA), chiuso di default quando già configurato — pattern
   config-first collapse con `useRef` seeded-flag (AGENTS → *FIRE, What If and Goals*: mai
   keyare su `hasUnsavedChanges` transiente). Il banner "Anteprima locale attiva" resta.
3. **Sezione "Proiezione"** (il cuore): `FIREProjectionSection` con un **segmented pill**
   `Scenari | Ventaglio` (plain `button role="tab"` + Framer `layoutId` a livello modulo — mai
   shadcn `Tabs` qui; AGENTS → *Hierarchy, Density and Disclosure*):
   - **Scenari** = grafico attuale, ma ridotto a leggibilità: 3 serie patrimonio + UNA sola linea
     target FIRE (scenario base) tratteggiata invece di 3 — le altre due restano nel tooltip.
     Con Spec 3 attiva, il gradino del fondo pensione all'anno di sblocco è visibile e il tooltip
     lo nomina.
   - **Ventaglio** = nuova vista, vedi sotto.
   - Gli input Bear/Base/Bull e la `FIREProjectionTable` scendono in un collapsible "Parametri e
     tabella" dentro la sezione.
4. **Collapsible "Dettaglio"** (divider, pattern Rendimenti/Allocazione): i due grafici storici
   attuali ("Anni di Spesa Coperti", "Cashflow e Reddito Passivo") + "Come funziona il FIRE?".
   Nessun grafico eliminato: retrocesso.

## La vista Ventaglio

### Motore (pure, testato)

1. In `lib/services/monteCarloService.ts`: nuova
   `runAccumulationSimulation(params): { paths; percentiles; fireYearDistribution }` — fase di
   **accumulo**: ogni anno `portfolio = portfolio · (1 + rendimentoCasuale) + annualSavings`,
   spese inflazionate → target FIRE mobile (stessa formula della proiezione deterministica),
   `capitalInflows` della Spec 3 rispettati (fondo pensione allo sblocco). Riusa `randomNormal` e
   la struttura di `runSingleSimulation`; ~1000 simulazioni, orizzonte = anni della proiezione
   deterministica (cap 40). Output per anno: p10/p25/p50/p75/p90 + i path completi + per ogni
   anno la **probabilità cumulata di aver raggiunto il FIRE** (questo è il numero nuovo che il
   deterministico non sa dare).
2. I parametri di mercato vengono **derivati dal portafoglio reale**: estrarre la normalizzazione
   allocazione→4 classi MC oggi inline in `MonteCarloTab.tsx` (~:168-207) in una pure util
   condivisa `lib/utils/monteCarloParams.ts` (due call site che DEVONO restare identici — AGENTS
   → *Quick-Fix Reference*: la copia divergente è quella che l'utente vede), consumata da
   entrambi i tab. Volatilità/rendimenti per classe: `getDefaultMarketParameters` o
   `monteCarloScenarios` salvati, come nel tab MC. `annualSavings` dal `fireData` esistente,
   `initialPortfolio` = patrimonio FIRE (asset liberi se toggle pensione attivo).
3. Niente `Math.random()` a render time: la selezione dei ~40 path "spaghetti" da disegnare è
   deterministica (ogni k-esimo path). Il motore gira client-side in `useMemo` keyata sugli
   input; a 1000×40 è ben sotto il budget CPU, ma va verificato su build di produzione (AGENTS →
   *Motion*: budget mobile 3-5× più stretto).

### Grafico

Recharts `ComposedChart`: banda `p10-p90` (Area, tinta debole), banda `p25-p75` (Area, tinta
media), `p50` (Line piena), ~40 path campione (Line sottilissime, opacità ~0.12, nessun dot,
`isAnimationActive={false}` sui path), linea target FIRE tratteggiata. Sotto il grafico, una riga
verdetto: "Probabilità di FIRE entro il {annoBase}: {N}%" + caption che dichiara la fonte dei
parametri ("rendimenti e volatilità derivati dall'allocazione attuale; {S} simulazioni").
Obblighi AGENTS → *Recharts*: `useChartColors()` per ogni serie, `tick={CHART_TICK_STYLE}` su
ogni asse, i 3 props di stile tooltip tutti definiti a livello modulo, `role="img"` +
`aria-label` + `accessibilityLayer={false}` sul chart, legenda con `wrapperStyle` e componente a
livello modulo, empty-state inline quando i dati non bastano.

## Cosa NON fare

- Non cambiare formule: proiezione deterministica, bridge, metriche — sono delle Spec 3 e di
  `fireService`.
- Non toccare gli altri 4 tab (Coast è Spec 5; MC riceve solo l'estrazione di
  `monteCarloParams.ts`, a comportamento identico).
- Non rigenerare DESIGN.md; nessun hex hardcoded, sign color via token, `desktop:` mai `lg:`.
- Non introdurre un nuovo period selector né stati "Custom" permanenti.

## Test

- `__tests__/monteCarloService.test.ts` esteso: accumulo a volatilità 0 → identico alla
  proiezione deterministica a parità di tassi (QUESTO è il test chiave di coerenza); inflow
  rispettato; percentili monotoni (p10 ≤ p25 ≤ p50 ≤ p75 ≤ p90); probabilità cumulata
  non-decrescente.
- `__tests__/monteCarloParams.test.ts` (nuovo): normalizzazione allocazione→4 classi, somma 100,
  classi assenti → 0.
- Vitest sui componenti non serve (arithmetic nel motore); la resa va in E2E.
- **Playwright** (nuovo `e2e/fire.spec.ts`, progetto desktop, account base, `workers: 1`): hero
  renderizzato con un importo formattato (ancorare con regex Intl-safe — AGENTS → *Italian
  Localization*), pill Scenari/Ventaglio commuta il grafico (assert su `aria-label` del chart),
  collapsible Impostazioni apre/chiude (misurare l'altezza, non `visible` — AGENTS →
  *Browser-Driven E2E*). Provare che i test possano fallire prima di fidarsi.
- `npx tsc --noEmit` dopo i test; suite anche con `TZ=Europe/Rome`.

## Verifica (collaudo guidato, WORKFLOW.md)

Emulatori + build di produzione (`npm run build` locale per il costo motion/CPU del ventaglio).
Fasi: A invarianza (numeri hero = numeri di prima del redesign a parità di dati — sono le stesse
pure function), C comportamento nuovo (ventaglio coerente col deterministico a volatilità
azzerata via parametri custom), giudizio estetico finale a Giuseppe (unica parte non
automatizzabile). Aggiornare al termine: CLAUDE.md (Latest + conteggio test), SESSION_NOTES.md,
eventuale voce in docs/critique-prompts.md per la pagina FIRE.

## Criteri di accettazione

- [ ] La pagina risponde in un colpo d'occhio a "quando?" e "quanto posso spendere?"; la
      configurazione non è più in mezzo ai risultati.
- [ ] Vista Ventaglio: bande percentili + spaghetti + target, con probabilità di FIRE entro
      l'anno base e caption sulle assunzioni; parametri derivati dal portafoglio reale.
- [ ] A volatilità 0 il ventaglio collassa sulla proiezione deterministica (test).
- [ ] Nessuna regressione numerica sui valori mostrati; toggle e settings invariati.
- [ ] E2E fire.spec verde (e visto rosso su assert falsificati); tsc pulito.

---

## Implementazione consigliata

- **Modello**: `claude-fable-5` · **Effort**: high
  (lavoro di design con barra qualità DESIGN.md + un'estensione di motore con test di coerenza;
  usare la skill impeccable durante il lavoro visivo)

### Prompt di implementazione

```
Leggi TASSATIVAMENTE prima di ogni cosa: AGENTS.md (in particolare Recharts, Motion, Hierarchy,
FIRE What If and Goals, Browser-Driven E2E), CLAUDE.md, WORKFLOW.md, COMMENTS.md,
DEVELOPMENT_GUIDELINES.md e DESIGN.md (normativo, mai rigenerarlo). Crea un branch dalla branch
attiva (una branch per sessione, commit solo dopo mia approvazione esplicita). Crea/aggiorna
SESSION_NOTES.md. Per il lavoro visivo usa la skill impeccable (/impeccable) sul tab FIRE.

Implementa ESATTAMENTE la specifica in specs/4-redesign-tab-calcolatore-fire-e-ventaglio.md.
In sintesi: (1) FireCalculatorTab passa a IA single-answer — hero [2fr_1fr] con verdetto "FIRE
proiettato nel {anno}, a {età}" + companion reddito passivo, riga basis con le assunzioni,
configurazione in un solo collapsible con seeded-flag, sezione Proiezione con pill
Scenari|Ventaglio, grafici storici retrocessi in un collapsible Dettaglio; (2) vista Ventaglio:
runAccumulationSimulation in monteCarloService (accumulo con contributi, target FIRE mobile,
capitalInflows della Spec 3, percentili + path + probabilità cumulata di FIRE), parametri
derivati dal portafoglio reale tramite la nuova pure util lib/utils/monteCarloParams.ts estratta
da MonteCarloTab (due call site identici), grafico ComposedChart con bande p10-p90/p25-p75,
mediana, ~40 spaghetti a selezione deterministica e linea target, tutte le regole Recharts di
AGENTS rispettate.

Vincolo di fondo: NESSUN cambio di formula — solo presentazione di pure function esistenti/nuove
testate. Test-first sul motore (coerenza a volatilità 0 col deterministico, percentili monotoni),
poi UI, poi e2e/fire.spec.ts come da spec (provando che possa fallire). npx tsc --noEmit dopo i
test, suite anche con TZ=Europe/Rome, verifica motion su build di produzione. Chiudi con il
collaudo guidato della spec e lascia a me solo il giudizio estetico. Riassumi il diff e chiedi
l'OK per il commit.
```
