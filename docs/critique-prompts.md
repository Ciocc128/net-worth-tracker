# Impeccable Critique Prompts

Prompt ottimizzati per eseguire `/impeccable critique` su ogni sezione dell'app.

**Come usarli:** copia il blocco del prompt e incollalo nella chat con Claude Code.
Riesegui dopo ogni redesign per misurare il delta di score.

**Due modalità, due mestieri.** Una critique che deve sempre proporre qualcosa di nuovo non
converge mai: lo score smette di essere un criterio di stop perché il bersaglio si sposta a
ogni run. Per questo la chiusura dei blocchi qui sotto è di **verifica** (default, convergente);
il **ripensamento** (generativo) è opt-in e si attiva sostituendo il paragrafo finale.

**Critique di verifica (default):** misura e convergenza. Flusso:
`critique → fix dei soli finding → audit (docs/audit-prompts.md) → critique di verifica`.
**Criterio di stop: score ≥ 36/40 e zero P0/P1 → pagina "a regime"** — non si riesegue la
critique finché il codice della pagina non cambia. Sotto soglia si iterano SOLO i finding,
mai nuove feature: la produzione di novità non è evidenza di un difetto.

**Critique di ripensamento (opt-in):** evoluzione deliberata della pagina. Flusso:
`critique → shape combinato (blocco A nuova IA + blocco B 2-4 nuove feature) → checkpoint
approvazione → implementa tutto (craft + polish) → test verdi + tsc pulito → audit →
critique di verifica`. La critique che CHIUDE un ripensamento è di verifica, non un altro
ripensamento — è così che il ciclo termina. Per attivare questa modalità, sostituisci il
paragrafo finale del blocco ("Al termine: …") con:

> Al termine: presenta la critique completa, poi proponi lo shape combinato — blocco A (nuovi
> modi di presentare le info GIÀ presenti) + blocco B (2-4 nuove feature/estensioni coerenti) —
> e fermati al checkpoint per approvazione, senza scrivere codice. Dopo l'ok: implementa tutto
> in una volta (craft + polish), con test verdi e tsc pulito.

I vecchi file `shape-prompts.md` / `polish-prompts.md` sono stati rimossi: lo shape vive inline qui,
il polish è parte dell'implementazione.

**Formato:** ogni prompt include solo file target, contesto minimo e benchmark di confronto.
Nessun "focus specifico" — la critique deve essere indipendente e olistica.

**Design language atteso (sintesi di `DESIGN.md` — la fonte canonica; leggila sempre):**
North Star *"Effortless Precision"* — Linear/Vercel + Trade Republic + Apple, sotto la legge
**Form Follows Function** (onestà, deferenza, inevitabilità: ogni proprietà visiva è conseguenza
di una funzione, mai decorazione). Scala hero: page hero `text-[44px] desktop:text-[54px]
font-bold font-mono tracking-[-0.03em]`, section hero `text-[36px]`, sub-hero `text-[22px]`
(**mai** `text-4xl`/`text-2xl` per un hero — il salto 22→36→44→54 è intenzionale). **Mono Mandate**:
ogni numero in Geist Mono + `tabular-nums`. **Zero-Chroma + Data Owns Color**: chrome achromatica,
il colore lo possiede il dato (chart e temi). Gerarchia Trade Republic (un numero dominante,
flat `divide-y` rows, no card-in-card), `useChartColors()` per ogni serie, token OKLCH su tutti e 6 i temi.

---

## Panoramica

```
/impeccable critique la pagina Panoramica

File: app/dashboard/page.tsx
Componenti: components/dashboard/* (OverviewAnimatedCurrency, NetWorthSparkline,
            PeriodSelector, SavingsRingChart, OverviewChartsSection, ExportPDFButton),
            components/ui/composition-list.tsx, components/ui/composition-bar.tsx
Pure layer: lib/utils/dashboardOverviewUtils.ts, lib/utils/sparklinePeriod.ts
Dati: useDashboardOverview → GET /api/dashboard/overview (cache materialized-summary)

Questa è la home del dashboard — layout "Bento Asimmetrico" [2fr_1fr], rivisto dopo la
critique del 2026-07-16:
- Hero (colonna dominante): Patrimonio Totale Lordo (text-[44px]/[54px], con step-down
  a text-[32px]/[40px] oltre i 13 caratteri) → chip di variazione mensile/YTD + chip
  "Nuovo massimo storico" (ATH) disposte in `grid grid-cols-1 tablet:grid-cols-2` (colonne
  di larghezza uguale, non flex-wrap) → riga "Ultimi 12 mesi" mostrata solo quando la chip
  mensile è negativa → PeriodSelector della sparkline (3M/6M/YTD/1A/3A/All, niente 1M) →
  sparkline edge-to-edge (-mx-[22px]) → digest "Guidato da" con i top movers del mese.
- Sintesi Patrimoniale (colonna companion): breakdown flat a 3 righe (Liquidità /
  Investimenti / Illiquidi), blocco Impatto Fiscale condizionale, barra di progresso
  dell'obiettivo in evidenza (solo se goalBasedInvestingEnabled).
- TER + Costo Annuale: responsive duplication (desktop:hidden / hidden desktop:grid),
  colorati con `text-warning-foreground` (non amber raw).
- Cashflow card (full-width): KPI chip (bg-muted/40 rounded-xl, text-[22px]) con delta
  annotation text-[12px] font-mono + breakdown a barre per categoria.
- Charts section: deferred via requestIdleCallback; tab-switched su mobile (layoutId
  "chart-tab"), 2-col grid su desktop; composizione via CompositionList/CompositionBar
  (i pie/donut sono stati eliminati da tutta l'app).
Confronta con: Patrimonio (hero gemello — stesse chip, stesso payload), Rendimenti
(PerformanceHero), Storico (hero patrimonio), Goals (hero allocato).
Nota: hero rivisto il 2026-07-16 (ATH, PeriodSelector, top movers, goal progress) e chip
portate a grid il 2026-07-26 — rieseguire la critique per misurare il delta.
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)

Al termine: presenta la critique completa — score /40 e finding classificati P0/P1/P2.
Se lo score è ≥36/40 e non ci sono P0/P1, dichiara la pagina "a regime" e fermati lì:
nessuna proposta ulteriore. Altrimenti proponi SOLO gli interventi che risolvono i finding
(craft + polish sull'esistente, nessuna nuova feature) e fermati al checkpoint per
approvazione, senza scrivere codice. Dopo l'ok: implementa, con test verdi e tsc pulito.
```

---

## Patrimonio

```
/impeccable critique la pagina Patrimonio

File: app/dashboard/assets/page.tsx
Componenti: components/assets/AssetManagementTab.tsx,
            components/assets/AssetCard.tsx,
            components/assets/AssetSparkline.tsx,
            components/assets/AssetDialog.tsx,
            components/assets/TransactionDialog.tsx,
            components/assets/AssetMovementsDialog.tsx,
            components/assets/TaxCalculatorModal.tsx,
            components/dashboard/OverviewAnimatedCurrency.tsx,
            components/dashboard/NetWorthSparkline.tsx
Pure layer: lib/utils/assetTransactionUtils.ts, lib/utils/assetDisplay.ts,
            lib/utils/assetPricing.ts

La pagina è una singola scroll (nessun tab). Layout:
- Header
- Hero [2fr_1fr]: gemello di Panoramica — stesso `useDashboardOverview` RQ cache, stesse
  chip di variazione (mensile/YTD/ATH in grid a colonne uguali), stessa sparkline
  edge-to-edge, stessa card companion con flat 3-row breakdown. In più: riga G/P non
  realizzato condizionale.
- CashAccountsSection: grid cards 2-col/4-col per i conti correnti (type=cash,
  assetClass=cash), esclusi dalla tabella principale.
- AssetManagementTab: tabella ordinabile (Valore, G/P%, Peso%, Nome, Classe),
  group-by-class toggle, colonne Δ Mese/YTD/Inizio dietro il toggle "Andamento",
  sparkline per asset, 2-click delete, AssetDialog 2-step.
  Mobile: niente tabella — grid di AssetCard raggruppate per classe, rese inline
  nello stesso componente (non un AssetMobileSummary separato).
- Registro operazioni: dalle azioni di riga/card, gated su `useAssetLedgerMeta` —
  "Registra operazione" (TransactionDialog: segmented Compra/Vendi/Rettifica, anteprima
  della plusvalenza realizzata, regolamento su conto cash opzionale) e "Movimenti"
  (AssetMovementsDialog: vitals P&L/Rendimento/XIRR + lista movimenti). Le scritture
  passano solo dalle Admin API; l'asset doc resta autoritativo (quantità/PMC riscritti da
  un replay completo). Per gli asset a ledger l'edit mostra quantità/PMC in sola lettura.
- Righe a valutazione manuale (cash, immobili, fondi pensione, Private Equity, o
  autoUpdatePrice off) hanno un tint `color-mix()` su --chart-3, senza legenda.
- Alias ticker: la label dello strumento passa sempre da `getAssetDisplayTicker`
  (displayTicker → ticker); i fondi pensione non mostrano mai un ticker.
Confronta con: Panoramica (hero gemello), Previdenza (stesso asset visto dal lato
contributi), AllocationBreakdown (flat divide-y rows), GoalDetailCard (expand/collapse inline).
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)

Al termine: presenta la critique completa — score /40 e finding classificati P0/P1/P2.
Se lo score è ≥36/40 e non ci sono P0/P1, dichiara la pagina "a regime" e fermati lì:
nessuna proposta ulteriore. Altrimenti proponi SOLO gli interventi che risolvono i finding
(craft + polish sull'esistente, nessuna nuova feature) e fermati al checkpoint per
approvazione, senza scrivere codice. Dopo l'ok: implementa, con test verdi e tsc pulito.
```

---

## Previdenza

```
/impeccable critique la pagina Previdenza

File: app/dashboard/pension/page.tsx
Componenti: components/pension/PensionOverview.tsx,
            components/pension/PensionHeaderAction.tsx,
            components/pension/PensionContributionDialog.tsx
Pure layer: lib/utils/pensionDeduction.ts, lib/utils/pensionContributions.ts,
            lib/utils/pensionFamilyMembers.ts, lib/utils/pensionReturn.ts

Vista dedicata al fondo pensione, in `planningNav` (Pianificazione) e non come tab di
FIRE e Simulazioni: versamenti, beneficio fiscale e plafond sono contenuto di pianificazione
a sé. È anche il target del link "Vai a Previdenza" da una card asset pensionFund in Patrimonio.
Tre capitoli separati da `border-t border-border/40`, con l'asse anno che governa SOLO il
secondo e il terzo:
1. Il fondo oggi — nessun asse temporale; il titolo si accorda al numero di fondi tracciati
   («I fondi oggi» con più di uno, `fundNoun`). Hero `desktop:grid-cols-[2fr_1fr]`: valore totale
   dei fondi (somma di TUTTI gli asset `pensionFund`, cifra di patrimonio non fiscale) +
   versato totale ancorato col sticky footer, accanto alla sintesi del rendimento (TWR come
   section hero). La colonna 1fr non resta MAI vuota: rendimento, errore, o la card che spiega
   perché non è ancora calcolabile. La scomposizione euro-per-euro sta in un Collapsible. Il
   rendimento tiene separate le tre cause della crescita — versamenti, contributo datoriale
   (retribuzione, non rendimento) e mercato — e SOSTITUISCE il numero con una spiegazione in due
   casi: `isCoverageSuspicious` (annualizzato > 20% = versamenti non registrati) e `hasNoMovement`
   (finestra aperta ma nulla si è mosso: 0% per assenza di dati, non per risultato). In entrambi
   sparisce anche la scomposizione: il predicato unico è `isPensionReturnMeasurable`.
2. Anno fiscale {Y} — `SegmentedPill` degli anni disponibili (mostrato solo con >1 anno),
   poi `desktop:grid-cols-2`: versato per natura TFR / Volontario / Datoriale (solo il
   Volontario esce da un conto cash, modellato come `transfer`; TFR e Datoriale accreditano
   il fondo standalone) e UNA card di recap PER membro famiglia con almeno un fondo collegato
   (il tetto di deducibilità IRPEF è per contribuente, non per conto). Il RISPARMIO IRPEF è il
   numero dominante della sua card — è la risposta per cui la pagina esiste; deducibili e TFR
   sono righe di supporto. Un fondo senza membro collegato mostra un prompt, mai un numero
   silenziosamente sbagliato. I membri si gestiscono in Impostazioni → Preferenze → Famiglia.
   Disclaimer fiscale UNO per capitolo, non uno per contribuente.
3. Storico versamenti {Y} — filtrato sull'anno selezionato, con conteggio in testa, date in
   mono e 2-click delete che reversa l'effetto valore/transfer.
L'azione primaria vive nello slot `actions` di `PageHeader` (`PensionHeaderAction`), non in una
riga sopra l'hero. La nota operativa sull'ordine "prima i versamenti, poi il valore da estratto
conto" è in un Collapsible chiuso, non sempre a schermo.
Il fondo pensione è un asset a valutazione manuale (nessun ticker, nessun cost basis,
nessun auto-update) con `allocationRole: 'frozen'` di default, e il suo valore in euro vive in
`quantity` A PREZZO 1 come un saldo di conto.
Confronta con: Patrimonio (stesso asset dal lato valore), Allocazione
(PensionAllocationCards, il fondo resta frozen e non entra mai in un piano),
Coast FIRE (stesso registro fiscale IRPEF + scaglioni editabili).
Nota: DUE baseline, non una — misurare il delta dalla seconda.
- critique 2026-08-01 = 26/40, 5 P1 (empty state falso in caricamento, zero layout desktop,
  tipografia fuori scala, risparmio IRPEF senza dominanza, messaggio zod in inglese). Redesign +
  polish lo stesso giorno, con l'asse anno come unica aggiunta funzionale approvata; snapshot in
  `.impeccable/critique/`.
- audit 2026-08-02 = 15/20, 3 P1 tutti chiusi: `text-red-500` sotto AA nel dialog, la scomposizione
  che sopravviveva a `isCoverageSuspicious` contraddicendo l'avviso soprastante, e lo skeleton che
  aspettava 2 query su 4 (zeri falsi al primo frame). Chiusi anche: colonna 1fr vuota a 1440px,
  capitolo e card tipograficamente identici, stati d'errore assenti, `<Button>` dentro `<Link>`.
  NON ri-aprirli come nuovi: sono la nuova linea di partenza.
Attenzione: la suite Playwright è di TRE spec (`pension.spec.ts`, `pension.mobile.spec.ts`,
`pension.degraded.spec.ts` + scenari `npm run e2e:seed -- suspicious|idle|fresh` su account
isolato) e asserisce layout 2:1 a 1440px, scala 54/44/36px, asse anno, collapsible, guardia sul
caricamento e i tre stati degradati — un redesign che li tocca deve aggiornarla, non aggirarla.
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)

Al termine: presenta la critique completa — score /40 e finding classificati P0/P1/P2.
Se lo score è ≥36/40 e non ci sono P0/P1, dichiara la pagina "a regime" e fermati lì:
nessuna proposta ulteriore. Altrimenti proponi SOLO gli interventi che risolvono i finding
(craft + polish sull'esistente, nessuna nuova feature) e fermati al checkpoint per
approvazione, senza scrivere codice. Dopo l'ok: implementa, con test verdi e tsc pulito.
```

---

## Cashflow

### Tab "Dividendi"

```
/impeccable critique il tab "Dividendi" della pagina Cashflow

File: app/dashboard/cashflow/page.tsx
Componenti: components/dividends/DividendTrackingTab.tsx,
            components/dividends/DividendStats.tsx,
            components/dividends/DividendCalendar.tsx,
            components/dividends/DividendTable.tsx,
            components/dividends/DividendRecordDetailsDialog.tsx,
            components/dividends/DividendDialog.tsx,
            components/dividends/InflationRateDialog.tsx,
            components/dividends/ProvisionalCouponBanner.tsx
Pure layer: lib/utils/dividendAnalytics.ts, lib/utils/couponUtils.ts,
            lib/constants/dividendTypes.ts

Questo tab (redesign "ripensamento" 2026-06-11) traccia dividendi e cedole con IA
Trade-Republic: asse periodo (DividendPeriod Mese/Anno/12 mesi/Storico, derivato in-memory
dalla lista — niente refetch sullo switch) → hero net-income (font-mono + chip di variazione
+ sparkline trailing-12m), griglia di KPI chip, strip income-reliability (copertura mensile %
+ concentrazione payer HHI/top-share), leaderboard payer flat divide-y ordinata per netto
(payer venduti inclusi — assetTicker/assetName denormalizzati per record). Table/Calendario via
SegmentedControl; filtri secondari asset/tipo + day-focus sotto "Filtra"; grafici e analisi
avanzata dietro Collapsible. Colori segno via getMetricValueColor. DividendStats è ora solo il
blocco server-computed YOC/DPS/total-return, alimentato dai bound di data del periodo; la sua
tabella "Total Return per Asset" è basata sul registro operazioni (replayTransactions /
computeAssetTotalReturn) e include le posizioni chiuse con badge "Chiusa" e le vendite parziali —
gli asset senza doc di ledger ricadono sul confronto statico prezzo-vs-PMC. Supporta conversione
EUR per asset in valuta estera e cedole auto-generate per bond, incluse le obbligazioni indicizzate
all'inflazione (BTP Italia): la cedola successiva resta PROVVISORIA (ProvisionalCouponBanner)
finché l'utente non annuncia il tasso FOI dall'InflationRateDialog.
Confronta con: Centri di Costo (stesso asse periodo in-memory + hero + leaderboard divide-y),
Hall of Fame (tabelle flat), Cashflow/Analisi (period-based data).
Nota: il redesign è stato implementato il 2026-06-11 — rieseguire la critique per misurare il delta.
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)

Al termine: presenta la critique completa — score /40 e finding classificati P0/P1/P2.
Se lo score è ≥36/40 e non ci sono P0/P1, dichiara la pagina "a regime" e fermati lì:
nessuna proposta ulteriore. Altrimenti proponi SOLO gli interventi che risolvono i finding
(craft + polish sull'esistente, nessuna nuova feature) e fermati al checkpoint per
approvazione, senza scrivere codice. Dopo l'ok: implementa, con test verdi e tsc pulito.
```

### Tab "Tracciamento" *(mobileLabel: "Spese")*

```
/impeccable critique il tab "Tracciamento" della pagina Cashflow

File: app/dashboard/cashflow/page.tsx
Componenti: components/cashflow/ExpenseTrackingTab.tsx,
            components/cashflow/CashflowTrackingMobile.tsx,
            components/cashflow/TransactionFeed.tsx,
            components/cashflow/cashflow-kpi/CashflowHero.tsx,
            components/cashflow/CategoryBreakdownList.tsx,
            components/cashflow/MobileFiltersDrawer.tsx,
            components/expenses/ExpenseDialog.tsx,
            components/expenses/CategoryManagementDialog.tsx
Pure layer: lib/utils/trackingSummary.ts
Servizi: lib/services/cashBalanceReconciliation.ts

Questo tab è stato ripensato con una IA "single answer": non è più una lista con KPI
sopra, ma una risposta sola seguita dalla prova.
- CashflowHero: Risparmio Netto dominante + UN verdetto di salute + top-5 spese del
  periodo. Derivazione pura e testata in lib/utils/trackingSummary.ts.
- Toolbar di filtri contestuale sotto l'hero (su mobile: MobileFiltersDrawer).
- TransactionFeed condiviso: raggruppamento per giorno con toggle Feed/Tabella,
  load-more e 2-click inline delete. Su portrait il layout passa da
  CashflowTrackingMobile (stesso stato, resa diversa).
- I trasferimenti sono un tipo a sé (`transfer`): net-zero per ogni metrica e
  riconciliazione atomica dei due saldi cash (updateCashAssetBalancesAtomic) — non
  devono mai comparire come entrata o come spesa in nessun totale.
- ExpenseDialog: form a singolo step + Collapsible "Impostazioni avanzate", reso in
  ResponsiveModal (Drawer ≤768px / Dialog sopra), creazione inline di categoria e
  sottocategoria.
Confronta con: Analisi (stessi dati, taglio analitico), Centri di Costo (stesso feed di
spese raggruppato per progetto), AssetManagementTab (delete 2-click).
Nota: IA single-answer (CashflowHero + TransactionFeed) implementata dopo la stesura del
prompt originale — la descrizione "lista + KPI blocks" era obsoleta.
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)

Al termine: presenta la critique completa — score /40 e finding classificati P0/P1/P2.
Se lo score è ≥36/40 e non ci sono P0/P1, dichiara la pagina "a regime" e fermati lì:
nessuna proposta ulteriore. Altrimenti proponi SOLO gli interventi che risolvono i finding
(craft + polish sull'esistente, nessuna nuova feature) e fermati al checkpoint per
approvazione, senza scrivere codice. Dopo l'ok: implementa, con test verdi e tsc pulito.
```

### Tab "Budget"

```
/impeccable critique il tab "Budget" della pagina Cashflow

File: app/dashboard/cashflow/page.tsx
Componenti: components/cashflow/BudgetTab.tsx,
            components/cashflow/budget/BudgetList.tsx,
            components/cashflow/budget/BudgetItemDialog.tsx,
            components/cashflow/budget/BudgetSettingsCard.tsx,
            components/cashflow/budget/BudgetForecastCard.tsx,
            components/cashflow/budget/BudgetInsightsCard.tsx,
            components/cashflow/budget/BudgetAlertsBanner.tsx

Questo tab (redesign issue #148, 2026-06-05) è un sistema opt-in: solo i budget creati
esplicitamente vengono mostrati (nessun auto-fill per categoria). Struttura:
BudgetSettingsCard (overall ceiling + auto-save 800ms), BudgetAlertsBanner (soglie 50/75/90/100%
+ forecast overrun), BudgetList (split Mensili/Annuali, inline progress, 2-click delete),
BudgetForecastCard (proiezione fine mese con dampening early-month), BudgetInsightsCard
(confronto vs expected-to-date). BudgetItemDialog tramite ResponsiveModal. Income budgets
come target invertiti (progress inverso). Auto-save via useBudgetConfig (debounce 800ms,
paused su allocazione invalida).
Confronta con: Allocazione/RebalancePlan (mosse ordinate per priorità — pattern lista firmata
simile), Goals (progress bar + target%).
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)

Al termine: presenta la critique completa — score /40 e finding classificati P0/P1/P2.
Se lo score è ≥36/40 e non ci sono P0/P1, dichiara la pagina "a regime" e fermati lì:
nessuna proposta ulteriore. Altrimenti proponi SOLO gli interventi che risolvono i finding
(craft + polish sull'esistente, nessuna nuova feature) e fermati al checkpoint per
approvazione, senza scrivere codice. Dopo l'ok: implementa, con test verdi e tsc pulito.
```

### Tab "Centri di Costo" *(visibile solo se costCentersEnabled)*

```
/impeccable critique il tab "Centri di Costo" della pagina Cashflow

File: app/dashboard/cashflow/page.tsx
Componenti: components/cashflow/CostCentersTab.tsx,
            components/cashflow/CostCenterDetail.tsx,
            components/cashflow/CostCenterDialog.tsx,
            components/cashflow/CostCenterErrorNotice.tsx,
            components/cashflow/costCenterStyles.ts
Pure layer: lib/utils/costCenterUtils.ts, lib/utils/costCenterColors.ts

Questo tab raggruppa le spese per oggetto/progetto (es. "Automobile"). Due viste, UN SOLO asse
periodo (Mese / Anno / 12 mesi / Sempre — `SegmentedPill`, derivato in-memory): lo stato è
posseduto dalla Panoramica ma il controllo è renderizzato in ENTRAMBE, perché il Detail
mostrava un periodo che non poteva cambiare.
1. Panoramica — hero totale del periodo (page hero) + lista flat divide-y dei centri ordinata
   per spesa. Nella riga la barra codifica il RANGO (spesa / centro maggiore) e la `%` in
   sub-line codifica la QUOTA (spesa / totale del periodo): sono due domande diverse e servono
   entrambe, perché con la sola barra la prima riga è sempre piena e si legge come se FOSSE
   l'hero, che è invece la loro somma. Archiviati in un Collapsible, con un `maxSpend` proprio.
2. Detail — hero del periodo (section hero) + chip Δ-vs-precedente + righe flat, composizione
   per categoria, grafico mensile stacked-by-categoria, tabella transazioni.
   TRE blocchi NON seguono l'asse e devono dirlo: il tetto (finestra del suo `budgetPeriod`),
   la proiezione (sempre YTD) e il grafico (12 mesi / tutto, toggle proprio). Tetto e proiezione
   stanno dietro un separatore `border-t border-border/40` col capitolo "Tetto e proiezione" e
   ogni blocco nomina la propria finestra nell'eyebrow.
Il Detail ha inoltre una composizione per SOTTO-categoria (buildSubCategoryComposition) con
toggle di esclusione di sola sessione → "Totale al netto": è una lente di analisi e non altera
mai hero, budget o grafico — e ora lo DICE, con un hint che sopravvive al proprio primo uso.
Feature: budget ceiling per centro (verdict + meter), costo annuo proiettato (smorzato a inizio anno),
overlay di confronto cross-centro (troncato ai top 5, con il residuo dichiarato),
lifecycle attivo/dormiente/archiviato.
Tre invarianti da non rompere:
- Il lifecycle deriva dall'attività NON filtrata (`resolveLastActivityDate`), non da quella
  del periodo: la dormienza è un fatto del centro, non dell'asse.
- Il colore d'identità è uno SLOT di tema (`COST_CENTER_COLOR_KEYS` → `resolveCostCenterColor()`
  → `useChartColors()`), mai un hex: gli hex legacy sono mappati sullo slot di pari posizione
  senza backfill. Il picker mostra il token risolto e le etichette screen-reader nominano la
  POSIZIONE, non la tinta (che cambia con il tema).
- Un fetch fallito non è un insieme vuoto: `isError` → `CostCenterErrorNotice`, instradato
  PRIMA del controllo empty-state in entrambe le viste.
Delete e rename cascadano sulle spese via writeBatch. Il delete SCOLLEGA (non cancella) le
spese, e ora lo dichiara: conteggio nell'etichetta armata e in `aria-label`, live region per
armamento e disarmo, nota che compare all'armamento, toast che nomina l'esito.
Confronta con: Previdenza/PensionOverview (stessa dottrina degli stati d'errore, stesse costanti
EYEBROW_CLASS / CHAPTER_TITLE_CLASS, capitoli separati da border-t border-border/40),
GoalBasedInvestingTab (Panoramica + asse periodo + budget meter — pattern analogo),
ExpenseTrackingTab (transaction style).
Nota: critique 2026-08-13 = 20/40, 2 P0 e 4 P1, tutti chiusi lo stesso giorno. NON ri-aprirli
come nuovi: sono la nuova linea di partenza.
- P0 stato d'errore — `isError` non letto in nessuna delle due query, quindi un fetch fallito
  rendeva «Nessun centro di costo» con l'invito a crearne uno: indistinguibile dal caso vero.
- P0 quattro finestre temporali su uno schermo, con l'asse della prima sullo schermo precedente
  (hero «questo mese 340 €» sopra una proiezione YTD senza titolo, 24× di distanza).
- P1 «Inattivo» derivato dal `lastActivityDate` filtrato dal periodo: badge che seguiva l'asse
  e contraddiceva «centri attivi» dodici pixel più su.
- P1 delete a cascata silenzioso; P1 tipografia fuori ramp (48px inesistente, hero Detail più
  piccolo su desktop di quello della lista) e ~14 numeri fuori dal Mono Mandate; P1 palette hex
  grezza fuori tema, con due voci su otto sotto 3:1 in light mode.
Chiusi anche, come P2: `%` di quota assente nella lista, `maxSpend` degli attivi usato per gli
archiviati, `<Card>` in mezzo a contenitori piatti, stagger Framer senza guardia reduced-motion,
progressbar senza nome accessibile, `<dl>` senza `<dt>/<dd>`, focus-visible assente su due
`<button>` nudi, apostrofi misti, «Storico» in collisione con la pagina omonima.
Attenzione: il layer puro è coperto (43 test fra costCenterUtils e costCenterColors), i TRE
componenti no — nessuna spec Vitest né Playwright li tocca. Un redesign qui non ha rete di
sicurezza meccanica: la verifica è manuale, sui sei temi e a 390px.
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)

Al termine: presenta la critique completa — score /40 e finding classificati P0/P1/P2.
Se lo score è ≥36/40 e non ci sono P0/P1, dichiara la pagina "a regime" e fermati lì:
nessuna proposta ulteriore. Altrimenti proponi SOLO gli interventi che risolvono i finding
(craft + polish sull'esistente, nessuna nuova feature) e fermati al checkpoint per
approvazione, senza scrivere codice. Dopo l'ok: implementa, con test verdi e tsc pulito.
```

---

## Analisi

```
/impeccable critique la pagina Analisi

File: app/dashboard/analisi/page.tsx
Componenti: components/cashflow/AnalisiTab.tsx,
            components/cashflow/CashflowSankeyChart.tsx,
            components/cashflow/AnomalieBlock.tsx,
            components/cashflow/ConfrontoAnnualeSection.tsx,
            components/cashflow/SavingsRateTrendSection.tsx,
            components/cashflow/CategoryTrendsGrid.tsx,
            components/cashflow/AndamentoStoricoSection.tsx
Pure layer: lib/utils/cashflowTimeSeries.ts

Pagina standalone (estratta dal tab "Analisi" di Cashflow). Unifica anno corrente +
storico in un'unica vista con 3-state period pill (Anno Corrente / Anno / Storico), ora
sincronizzato in querystring (`?period=&year=&month=`) per check mensili ripetibili via link.
Sempre visibili: KPI trio Entrate/Spese/Risparmio (section-hero scale) + AnomalieBlock
(banner `--warning` token) + Sankey (drill-down con `DrillBreadcrumb` cliccabile a livello
intermedio, condiviso con AnalisiTab) + TopExpensesBlock (top 5 spese espandibile). Dietro un
"Dettaglio" Collapsible (default chiuso, progressive disclosure): ConfrontoAnnualeSection
(confronto anno corrente vs anno precedente), SavingsRateTrendSection (trend savings rate),
CategoryTrendsGrid (sparkline per categoria, ultimi 12 mesi), e solo in modalità Storico
AndamentoStoricoSection — Chart A ComposedChart (Entrate/Uscite barre + Risparmio netto
linea) + Chart B LineChart a linee multiple per categoria (sub-toggle Entrate/Uscite),
con toggle Mese/Anno condiviso; aggregazione pura in cashflowTimeSeries.ts (asse temporale
con floor `cashflowHistoryStartYear`). Tutti i pill (period/view/range/granularity) usano
`SegmentedPill` condiviso (`components/ui/segmented-pill.tsx`, roving tabindex). Data
fetching autonomo via useExpenses / useExpenseCategories — non condivide route lifecycle
con Cashflow.
Confronta con: Cashflow/Tracciamento (dati condivisi via RQ cache),
Rendimenti (period selector), Storico (narrative order + collapsible appendice).
Nota: critique baseline 2026-07-21 = 25/40 (pre-redesign, 2 P1: scala tipografica hero,
assenza di progressive disclosure). Il redesign (Dettaglio collapsible, SegmentedPill,
DrillBreadcrumb, token warning/positive) è stato implementato lo stesso giorno —
rieseguire la critique per misurare il delta.
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)

Al termine: presenta la critique completa — score /40 e finding classificati P0/P1/P2.
Se lo score è ≥36/40 e non ci sono P0/P1, dichiara la pagina "a regime" e fermati lì:
nessuna proposta ulteriore. Altrimenti proponi SOLO gli interventi che risolvono i finding
(craft + polish sull'esistente, nessuna nuova feature) e fermati al checkpoint per
approvazione, senza scrivere codice. Dopo l'ok: implementa, con test verdi e tsc pulito.
```

---

## Allocazione

```
/impeccable critique la pagina Allocazione

File: app/dashboard/allocation/page.tsx
Componenti: components/allocation/*
Pure layer: lib/utils/allocationUtils.ts, lib/utils/leverageAwareAllocationUtils.ts,
            lib/utils/assetExposureUtils.ts

Questa pagina (redesign "ripensamento" 2026-06-04, esteso 2026-07-14 con `AllocationRole` +
"Preleva", poi 2026-07-25 con l'allocazione a leva) risponde a una sola domanda — "sono in
linea col target e cosa muovo?" — organizzata in due zone: una zona DECISIONE (hero → banda →
azione) e, sotto un divisore "Dettaglio", una zona DETTAGLIO più quieta (composizione →
esposizione), così che l'azione non pesi mai quanto il materiale di riferimento. Contiene:
AllocationHero (patrimonio allocato dominante + AllocationCompositionBar + BalanceScoreGauge
con verdetto equilibrio, più caption cliccabili separate per la quota "frozen" e la quota
"esclusa"),
ActionPlanner segmented a 3 stati Ribilancia/Versa/Preleva (possiede la Card; i pannelli sono
bodyless) → RebalancePanel (lista firmata e ordinata delle mosse per classe, empty-state
"Tutto in linea", sell cap sulla quota tradable) / ContributionPanel (versamento no-sell
ripartito per classe e sottocategoria) / WithdrawalPanel (prelievo surplus-first, mirror di
Versa) — Versa e Preleva condividono un unico albero PlanNode col segno invertito, class →
sottocategoria → strumento, righe rese dal `PlanRow` comune. RebalanceBandControl (soglia
±2/±5/regola 5·25/custom, di sessione, ri-classifica COMPRA/VENDI/OK in tutta la pagina).
`Asset.allocationRole` (tradable/frozen/excluded, selezionabile in AssetDialog per qualsiasi
tipo di asset) è partizionato PRIMA di compareAllocations: un asset frozen (fondo pensione,
private equity) resta nel denominatore e nelle percentuali ma non compare mai in un piano —
i piani compensano spostando ciò che è tradable; un asset excluded (la casa di abitazione)
esce dalla pagina, denominatore incluso — per questo il totale è più piccolo del net worth di
Panoramica. AllocationBreakdown (una card, accordion inline grid-template-rows su tutti i
breakpoint, AllocationRow + TargetTick per riga, più un gruppo "Esclusi dall'allocazione");
findOrphanedTargets + stripOrphanedSubTargets individuano e correggono i target rimasti
orfani per via di un'esclusione, anche a livello di sotto-categoria. Colori azione dal tema
via useActionColors.
ALLOCAZIONE A LEVA: `Asset.leverageRatio` su un ETF espande l'asset nella sua esposizione
nozionale (assetExposureUtils.ts) e introduce le classi di sola esposizione `trendFollowing`
e `carry`, raggiungibili solo via `composition` di un ETF composito. La base dei piani diventa
il nozionale, non il valore di mercato: planInstrumentContribution/Rebalance/Withdrawal
(leverageAwareAllocationUtils.ts) risolvono un QP per strumento e InstrumentTradeList mostra
le mosse a livello di strumento. CompositionBar espone `displayPct` per non mentire quando la
somma nozionale supera il 100%.
PENSIONE: PensionAllocationCards fa il look-through dei fondi pensione — il fondo resta
`frozen`, conta nel denominatore, non compare mai in un piano.
Bottom: sezione "Esposizione Portfolio" (ExposureSection) lazy-loaded con drill-down per
azienda / settore / emittente ETF.
Confronta con: Rendimenti (MetricSection flat rows), Patrimonio (sortable table),
Previdenza (il fondo visto dal lato contributi).
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)

Al termine: presenta la critique completa — score /40 e finding classificati P0/P1/P2.
Se lo score è ≥36/40 e non ci sono P0/P1, dichiara la pagina "a regime" e fermati lì:
nessuna proposta ulteriore. Altrimenti proponi SOLO gli interventi che risolvono i finding
(craft + polish sull'esistente, nessuna nuova feature) e fermati al checkpoint per
approvazione, senza scrivere codice. Dopo l'ok: implementa, con test verdi e tsc pulito.
```

---

## Rendimenti

```
/impeccable critique la pagina Rendimenti

File: app/dashboard/performance/page.tsx
Componenti: components/performance/* (PerformanceHero, HeroMetricBlock, MetricSection,
            MetricCard, PerformanceTooltip, RealizedGainsSection, MonthlyReturnsHeatmap,
            UnderwaterDrawdownChart, BenchmarkComparisonSection/Chart,
            CustomDateRangeDialog, AIAnalysisDialog)
Pure layer: lib/utils/performanceSummary.ts, lib/utils/benchmarkPeriodReturn.ts,
            lib/utils/performanceBase.ts, lib/utils/drawdownSeries.ts,
            lib/utils/cashFlowMap.ts

Questa pagina è stata ripensata con una IA "single answer": una risposta dominante, poi le
prove, poi il dettaglio a richiesta.
- PerformanceHero: TWR dominante + verdetto + delta "vs benchmark" + chip di drawdown +
  vital signs (Sharpe / MaxDD / Contributi / YOC). Il benchmark di riferimento è
  BENCHMARKS[0] (60/40) via useBenchmarkReturns a livello di pagina.
- Strip di return-consistency subito sotto (computeReturnConsistency).
- Collapsible "Mostra tutte le metriche" che avvolge i MetricSection (HeroMetricBlock +
  righe divide-y di MetricCard): Rendimento, Rischio, Contesto — quest'ultimo con la riga
  "Capitale investito" basata sul registro operazioni accanto ai Contributi Netti (gated su
  useAssetLedgerMeta) — Proventi Finanziari, e una sezione "Plusvalenze Realizzate" per anno
  fiscale (RealizedGainsSection, aggregazione cross-asset), anch'essa gated sul ledger.
- Grafici raggruppati in cluster "Andamento" / "Rischio"; period selector
  YTD/1 Anno/3 Anni/5 Anni/Storico + Personalizzato (il custom è un chip overlay, non uno
  slot fisso).
- Grafico "Evoluzione Patrimonio": un'area ("Capitale immesso" = patrimonio iniziale del
  periodo + versamenti netti cumulati) sotto la linea del patrimonio; la forbice fra le due
  È il rendimento di mercato, e il tooltip la scompone in valore iniziale / versamenti /
  rendimento. NON è un grafico a bande impilate: i versamenti netti cumulati possono essere
  negativi e una banda negativa romperebbe la pila.
- Benchmark comparison: 6 portafogli modello, tabella risk/return e growth-of-100 chart;
  Sharpe/Sortino usano la media di periodo del tasso BCE (FRED ECBDFR, cached).
- Base delle metriche CONFIGURABILE (performanceBase.ts): di default escludono fondi pensione
  e asset `allocationRole: 'excluded'` (la casa); i due switch stanno in Impostazioni →
  Preferenze e la base attiva è dichiarata in una riga sotto l'hero, con link a Impostazioni.
- Onestà dei numeri (correzioni 2026-07-28): sotto i 6 mesi l'hero mostra il
  rendimento DI PERIODO con etichetta esplicita ("nei 2 mesi") invece di un annualizzato che
  estrapolerebbe un anno da due mesi; volatilità e Sharpe mostrano "—" sotto 3 rendimenti
  mensili; la chip di drawdown dice "dal massimo DEL PERIODO"; heatmap, Underwater e Max
  Drawdown concatenano gli stessi rendimenti mensili e devono riconciliare.
Colori segno via getMetricValueColor; ogni serie grafica via useChartColors.
Confronta con: Storico (hero patrimonio + CAGR), Allocazione (stessa struttura decisione →
dettaglio), Goals (hero allocato).
Nota: la descrizione precedente ("4 hero blocks affiancati") era pre-redesign — oggi c'è un
solo numero dominante e le metriche stanno dietro un Collapsible. Il 2026-07-28 la pagina ha
avuto una revisione profonda dei CALCOLI (non del layout): se emergono numeri che sembrano
sbagliati, prima di proporre modifiche leggi CLAUDE.md → Current Status e Known Issues.
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)

Al termine: presenta la critique completa — score /40 e finding classificati P0/P1/P2.
Se lo score è ≥36/40 e non ci sono P0/P1, dichiara la pagina "a regime" e fermati lì:
nessuna proposta ulteriore. Altrimenti proponi SOLO gli interventi che risolvono i finding
(craft + polish sull'esistente, nessuna nuova feature) e fermati al checkpoint per
approvazione, senza scrivere codice. Dopo l'ok: implementa, con test verdi e tsc pulito.
```

---

## Storico

```
/impeccable critique la pagina Storico

File: app/dashboard/history/page.tsx
Componenti: components/history/*,
            components/dashboard/LaborMetricsChart.tsx

Questa pagina mostra l'evoluzione storica del patrimonio con narrative order:
Hero (patrimonio + CAGR + crescita totale) → Evoluzione → Raddoppi → Composizione
→ Driver (3 sezioni: Savings vs Investment, Lavoro & Investimenti, Variazione Anno su Anno
sempre visibile). Nessuna Appendice collapsible (eliminata). Include segmented pills
per view toggles e mobile inline legend sui grafici multi-serie. La Composizione per tipo
include una banda "Previdenza" dedicata ai fondi pensione (chartService.ts,
prepareAssetClassHistoryData). Include inoltre la sezione "Valore per Strumento"
(`MonthlyAssetBreakdownSection`): tabella per-strumento del mese scelto + somma del
sottoinsieme selezionato + trend cross-mese con `TrendTooltip` custom che scompone la
variazione in effetto prezzo vs effetto quantità.
Confronta con: Rendimenti (period selector), Hall of Fame (tabelle flat + hero).
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)

Al termine: presenta la critique completa — score /40 e finding classificati P0/P1/P2.
Se lo score è ≥36/40 e non ci sono P0/P1, dichiara la pagina "a regime" e fermati lì:
nessuna proposta ulteriore. Altrimenti proponi SOLO gli interventi che risolvono i finding
(craft + polish sull'esistente, nessuna nuova feature) e fermati al checkpoint per
approvazione, senza scrivere codice. Dopo l'ok: implementa, con test verdi e tsc pulito.
```

---

## Hall of Fame

```
/impeccable critique la pagina Hall of Fame

File: app/dashboard/hall-of-fame/page.tsx
Componenti: components/hall-of-fame/*,
            lib/constants/hallOfFame.ts

Questa pagina mostra i record storici del portafoglio: hero block con il miglior
record assoluto, mobile three-section nav pill, single card rankings con period +
category pill switchers, SpotlightCard flat divide-y, tabelle full-height su desktop
e top-5 + collapsible "Vedi tutti" su mobile.
Confronta con: Storico (hero patrimonio + narrative sections), Rendimenti (period selector).
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)

Al termine: presenta la critique completa — score /40 e finding classificati P0/P1/P2.
Se lo score è ≥36/40 e non ci sono P0/P1, dichiara la pagina "a regime" e fermati lì:
nessuna proposta ulteriore. Altrimenti proponi SOLO gli interventi che risolvono i finding
(craft + polish sull'esistente, nessuna nuova feature) e fermati al checkpoint per
approvazione, senza scrivere codice. Dopo l'ok: implementa, con test verdi e tsc pulito.
```

---

## FIRE e Simulazioni

### Tab "FIRE Calculator"

```
/impeccable critique il tab "FIRE Calculator" della pagina FIRE e Simulazioni

File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/FireCalculatorTab.tsx,
            components/fire-simulations/FIREProjectionSection.tsx,
            components/fire-simulations/FIREProjectionChart.tsx,
            components/fire-simulations/FireCalculatorSkeleton.tsx

Questo tab calcola il FIRE Number con hero block, Settings collapsible
(auto-open su unsaved changes), flat divide-y metric rows, "Annulla" reset button
e sezione proiezione con sensitivity matrix e scenario chart. Include un toggle opzionale
per il capitale bloccato nel fondo pensione (respectPensionLockInFire /
lib/utils/pensionFire.ts): quando è attivo il capitale previdenziale non è considerato
disponibile prima dell'età di accesso.
Confronta con: Monte Carlo (same hero + collapsible pattern), Goals (hero allocato),
Coast FIRE (stesso Settings pattern), Previdenza (stessa materia, taglio contributi/fiscale).
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)

Al termine: presenta la critique completa — score /40 e finding classificati P0/P1/P2.
Se lo score è ≥36/40 e non ci sono P0/P1, dichiara la pagina "a regime" e fermati lì:
nessuna proposta ulteriore. Altrimenti proponi SOLO gli interventi che risolvono i finding
(craft + polish sull'esistente, nessuna nuova feature) e fermati al checkpoint per
approvazione, senza scrivere codice. Dopo l'ok: implementa, con test verdi e tsc pulito.
```

### Tab "Coast FIRE"

```
/impeccable critique il tab "Coast FIRE" della pagina FIRE e Simulazioni

File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/CoastFireTab.tsx,
            components/fire-simulations/CoastFireProjectionChart.tsx

Questo tab calcola il Coast FIRE Number con hero block (HeroMetricBlock),
Settings collapsible, flat rows con progress bar animata, scenari Bear/Base/Bull
e sezione opzionale per pensioni statali (UI mobile 2-col con items-start).
Confronta con: FIRE Calculator (same hero + Settings pattern), Monte Carlo (scenarios).
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)

Al termine: presenta la critique completa — score /40 e finding classificati P0/P1/P2.
Se lo score è ≥36/40 e non ci sono P0/P1, dichiara la pagina "a regime" e fermati lì:
nessuna proposta ulteriore. Altrimenti proponi SOLO gli interventi che risolvono i finding
(craft + polish sull'esistente, nessuna nuova feature) e fermati al checkpoint per
approvazione, senza scrivere codice. Dopo l'ok: implementa, con test verdi e tsc pulito.
```

### Tab "What If"

```
/impeccable critique il tab "What If" della pagina FIRE e Simulazioni

File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/WhatIfAnalysisTab.tsx,
            components/fire-simulations/WhatIfSensitivitySection.tsx,
            components/fire-simulations/WhatIfAnalysisSkeleton.tsx

Questo tab simula eventi di vita (perdita lavoro, acquisto importante, variazione
risparmio/spesa, windfall) e mostra l'impatto before→after su FIRE tradizionale e
Coast FIRE. Gli eventi v1 si applicano "da adesso" (anno 0) come perturbazione di
patrimonio/risparmio/spesa; l'impatto è calcolato ri-eseguendo le pure functions di
fireService su baseline vs adjusted e diffando. L'evento "perdita di lavoro" lascia selezionare
le voci di entrata che vengono a mancare (`IncomeSourceSelector` inline: albero
categoria→sottocategoria, checkbox tri-state, default = `laborIncomeCategoryIds`) e mostra un box
esplicativo con i dati usati + le formule `min/max` della scomposizione (mancati risparmi vs spese
dal portafoglio), layout 2 colonne da `desktop:`. Hero con blocco before→after custom
(non HeroMetricBlock — il sign-coloring confligge con "meno anni = meglio"). Ospita la
matrice "Sensibilità Anni al FIRE" rilocata con baseline locale ri-centrabile. L'impatto
Coast richiede settings.userAge, altrimenti empty-state. Input scenario ephemeral (non persistiti).
Confronta con: FIRE Calculator + Coast FIRE (riusa le stesse fireService functions, hero pattern),
Monte Carlo (scenario inputs + collapsible).
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)

Al termine: presenta la critique completa — score /40 e finding classificati P0/P1/P2.
Se lo score è ≥36/40 e non ci sono P0/P1, dichiara la pagina "a regime" e fermati lì:
nessuna proposta ulteriore. Altrimenti proponi SOLO gli interventi che risolvono i finding
(craft + polish sull'esistente, nessuna nuova feature) e fermati al checkpoint per
approvazione, senza scrivere codice. Dopo l'ok: implementa, con test verdi e tsc pulito.
```

---

### Tab "Monte Carlo"

```
/impeccable critique il tab "Monte Carlo" della pagina FIRE e Simulazioni

File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/MonteCarloTab.tsx,
            components/monte-carlo/*,
            components/fire-simulations/MonteCarloSkeleton.tsx

Questo tab esegue simulazioni Monte Carlo con hero "Probabilità di Successo"
(always visible, "--" pre-run), mode toggle pill, ParametersForm con market params
in collapsible (auto-open se non-default), scenario comparison e appendice collapsible.
Confronta con: FIRE Calculator (hero + collapsible), Coast FIRE (scenarios Bear/Base/Bull).
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)

Al termine: presenta la critique completa — score /40 e finding classificati P0/P1/P2.
Se lo score è ≥36/40 e non ci sono P0/P1, dichiara la pagina "a regime" e fermati lì:
nessuna proposta ulteriore. Altrimenti proponi SOLO gli interventi che risolvono i finding
(craft + polish sull'esistente, nessuna nuova feature) e fermati al checkpoint per
approvazione, senza scrivere codice. Dopo l'ok: implementa, con test verdi e tsc pulito.
```

### Tab "Obiettivi"

```
/impeccable critique il tab "Obiettivi" della pagina FIRE e Simulazioni

File: app/dashboard/fire-simulations/page.tsx
Componenti: components/fire-simulations/GoalBasedInvestingTab.tsx,
            components/goals/*,
            components/fire-simulations/GoalsSkeleton.tsx

Questo tab è trajectory-led (non solo progress bar). Hero a verdetto (GoalsHero: patrimonio
allocato + "N in ritardo" + prossima scadenza; KPI chip Da-accantonare/mese + Non-assegnato
espandibile sugli asset liberi; lista divide-y sotto desktop / chip grid al desktop). Lista
ordinata per urgenza; ogni riga GoalDetailCard ha chip verdetto (In linea/In ritardo/Raggiunto)
+ ritmo richiesto-vs-pianificato, grafico di proiezione (GoalProjectionChart), asset assegnati
flat divide-y, colori verdetto/priorità su token (goalVerdictMeta). Feature: contribution planner
cross-goal (GoalContributionPlanner, gap×priorità), milestone timeline (GoalMilestoneTimeline).
Layer puro lib/utils/goalTrajectory.ts (contributo richiesto via rendita, data proiettata, verdetto);
InvestmentGoal ha monthlyContribution opzionale.
Confronta con: FIRE Calculator (hero pattern), Allocazione (ContributionAllocator, target%),
Centri di Costo (Panoramica + budget meter).
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)

Al termine: presenta la critique completa — score /40 e finding classificati P0/P1/P2.
Se lo score è ≥36/40 e non ci sono P0/P1, dichiara la pagina "a regime" e fermati lì:
nessuna proposta ulteriore. Altrimenti proponi SOLO gli interventi che risolvono i finding
(craft + polish sull'esistente, nessuna nuova feature) e fermati al checkpoint per
approvazione, senza scrivere codice. Dopo l'ok: implementa, con test verdi e tsc pulito.
```

---

## Assistente AI

```
/impeccable critique la pagina Assistente AI

File: app/dashboard/assistant/page.tsx
Componenti: components/assistant/*

Questa pagina (redesign "single period axis" 2026-06-04) offre un assistente AI per analisi
del portafoglio su un unico asse period (AssistantPeriodSelector: Mese / Anno / YTD / Storico /
Libera = ex-Chat) con sub-picker co-locato; in Libera un Contesto opzionale (chatContextType).
Scheda period-reactive (renderPeriodScheda + useAssistantPeriodContext sulla selezione live,
PatrimonioTodayCard per Libera) che mostra net-worth Δ + cashflow + allocation prima della
domanda — desktop colonna destra, mobile nell'empty-state + AssistantContextPill nell'header.
Conversazioni/Memoria aperte da header come sheets su ogni breakpoint. Proactive memory:
AssistantSuggestionsBanner (goal-completion) + AssistantMemoryFacts ("sa di te"). Prefs unificate
in AssistantPreferencesPopover (stile + macro/web + memoria on/off). Follow-up chips
(AssistantFollowUps). Composer slim (AssistantComposer: input+send). Streaming SSE
(meta|context|status|text|done|error; status:'searching' → "Sto cercando sul web…"),
thread persistenti period-pinned, memoria con lifecycle attivo/completato/archiviato.
Il modello vede l'intera tassonomia di categorie spesa dell'utente (expenseCategories), quindi
le risposte di categorizzazione usano le SUE categorie: verifica che la UI lo renda evidente
invece di far sembrare la risposta una scelta arbitraria del modello.
Confronta con: Rendimenti (hero number + data-first hierarchy), Storico (narrative order),
Goals (flat divide-y list).
Nota: critique baseline 2026-05-24 = 25/40 (pre-redesign). Il redesign è stato implementato
il 2026-06-04 — rieseguire la critique per misurare il delta.
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)

Al termine: presenta la critique completa — score /40 e finding classificati P0/P1/P2.
Se lo score è ≥36/40 e non ci sono P0/P1, dichiara la pagina "a regime" e fermati lì:
nessuna proposta ulteriore. Altrimenti proponi SOLO gli interventi che risolvono i finding
(craft + polish sull'esistente, nessuna nuova feature) e fermati al checkpoint per
approvazione, senza scrivere codice. Dopo l'ok: implementa, con test verdi e tsc pulito.
```

---

## Impostazioni

```
/impeccable critique la pagina Impostazioni

File: app/dashboard/settings/page.tsx
Componenti: components/settings/AccountSharingSection.tsx,
            components/settings/ExpenseImportSection.tsx,
            components/expenses/CategoryManagementDialog.tsx,
            components/layout/ThemePicker.tsx
Pure layer: lib/utils/expenseImport.ts

Questa pagina raccoglie tutte le configurazioni dell'app, in 6 tab (SETTINGS_TABS —
tab su desktop, Radix Select su mobile):
- Allocazione: target per classe di asset, con validazione della somma ≥100 quando c'è
  leva e leva di target derivata (deriveTargetLeverageRatio).
- Preferenze: profilo utente, labor categories per Storico, stamp duty, card "Famiglia"
  (membri del nucleo a cui attribuire un fondo pensione: nome, RAL, eleggibilità — è la
  fonte dei recap fiscali per membro in Previdenza), opzioni avanzate (dummy snapshots,
  cashflowHistoryStartYear).
- Spese: categorie cashflow con sotto-categorie + sezione "Importa Dati Storici"
  (ExpenseImportSection): upload CSV → ANTEPRIMA obbligatoria (righe valide/scartate con
  motivo, categorie da creare, totali, range date) → commit → undo per batch. Nessuna
  scrittura su Firestore prima dell'anteprima; i saldi dei conti non vengono mai toccati.
- Dividendi: preferenze di tracking e cedole.
- Condivisione: AccountSharingSection — l'owner aggiunge/rimuove co-owner via email; il
  tema e le userPreferences restano del viewer, non dell'account condiviso.
- Aspetto: ThemePicker (6 temi), condiviso con landing/login/register.
Confronta con: nessuna pagina specifica (registro separato), ma verifica che i
componenti form (Switch, Select, Input) usino la stessa vocabulary degli altri form dell'app,
e che l'anteprima dell'import segua la gerarchia Trade Republic (un numero dominante) invece
di essere un dump tabellare.
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)

Al termine: presenta la critique completa — score /40 e finding classificati P0/P1/P2.
Se lo score è ≥36/40 e non ci sono P0/P1, dichiara la pagina "a regime" e fermati lì:
nessuna proposta ulteriore. Altrimenti proponi SOLO gli interventi che risolvono i finding
(craft + polish sull'esistente, nessuna nuova feature) e fermati al checkpoint per
approvazione, senza scrivere codice. Dopo l'ok: implementa, con test verdi e tsc pulito.
```

---

## App Shell e Navigazione

```
/impeccable critique l'app shell e la navigazione

File: app/dashboard/layout.tsx,
      app/dashboard/template.tsx
Componenti: components/layout/Sidebar.tsx,
            components/layout/BottomNavigation.tsx,
            components/layout/SecondaryMenuDrawer.tsx,
            components/layout/AssistenteBanner.tsx,
            components/layout/LogoutDialog.tsx

Questi file definiscono la struttura permanente dell'app: layout wrapper (main padding,
demo banner, landscape header bar con SidebarTrigger), page transitions (template.tsx),
sidebar desktop collassabile (icon mode, toggle desktop-only, AssistenteBanner → Bot icon
in collapsed), bottom navigation mobile portrait con FAB cashflow animato via AnimatePresence
e theme sync via --sidebar-* CSS vars, secondary menu drawer per voci overflow su mobile.
Nuovi componenti condivisi: PageContainer, PageHeader (sticky mobile bar), PageTabs/PageTabBar
(underline tab indicator), ThemePicker, lib/constants/navigation.ts (nav arrays centralizzati,
inclusa la voce "Previdenza" in planningNav).
Account condiviso: lo switcher viewer→owner (useActiveAccount) vive SIA nella Sidebar SIA nel
SecondaryMenuDrawer ("Altro") — la Sidebar è irraggiungibile in portrait, quindi su telefono
il drawer è l'unico switcher esistente: valutarli come un'unica affordance, non come due.
Confronta con: nessuna pagina specifica — il benchmark è la coerenza interna tra
sidebar desktop, bottom nav mobile e secondary drawer.
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)

Al termine: presenta la critique completa — score /40 e finding classificati P0/P1/P2.
Se lo score è ≥36/40 e non ci sono P0/P1, dichiara la pagina "a regime" e fermati lì:
nessuna proposta ulteriore. Altrimenti proponi SOLO gli interventi che risolvono i finding
(craft + polish sull'esistente, nessuna nuova feature) e fermati al checkpoint per
approvazione, senza scrivere codice. Dopo l'ok: implementa, con test verdi e tsc pulito.
```

---

## Landing e Auth

### Landing Page

```
/impeccable critique la landing page

File: app/page.tsx
Componenti: components/dashboard/NetWorthSparkline.tsx,
            components/dashboard/SavingsRingChart.tsx,
            components/layout/ThemePicker.tsx

Questa è la landing page pubblica ed è il primo contatto dell'utente con il prodotto.
Scelta di fondo: l'hero NON è una illustrazione di marketing ma una anteprima fedele del
prodotto — preview impilate di Panoramica (numero dominante in Geist Mono + chip di
variazione + sparkline) e di Cashflow (savings ring) — perché il linguaggio data-first
dell'app È l'impressione di brand. Le preview sono etichettate "Dati dimostrativi" per non
fingere mai un account reale (DESIGN.md: onestà prima dell'illusione). Sotto: proof strip,
ThemePicker (lo stesso condiviso con login/register, così il tema scelto qui sopravvive
al login) e CTA "Prova la Demo" (condizionale a NEXT_PUBLIC_DEMO_EMAIL: se le env var
mancano il CTA sparisce, per i self-hosted senza account demo).
Zero-Chroma vale anche qui: mai accentare headline o icone feature con text-primary/bg-primary
(in tema default --primary ≈ --foreground, quindi l'accento è invisibile lì e colora solo sui
5 temi personalità). L'unico colore in pagina è il dato.
Confronta con: Panoramica (di cui la hero è una anteprima letterale), Login e Register
(stesso ThemePicker e stesso guscio).
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)

Al termine: presenta la critique completa — score /40 e finding classificati P0/P1/P2.
Se lo score è ≥36/40 e non ci sono P0/P1, dichiara la pagina "a regime" e fermati lì:
nessuna proposta ulteriore. Altrimenti proponi SOLO gli interventi che risolvono i finding
(craft + polish sull'esistente, nessuna nuova feature) e fermati al checkpoint per
approvazione, senza scrivere codice. Dopo l'ok: implementa, con test verdi e tsc pulito.
```

### Login e Register

```
/impeccable critique le pagine Login e Register

File: app/login/page.tsx,
      app/register/page.tsx

Le pagine di autenticazione: form con email+password, toggle visibilità password
keyboard-reachable, feedback inline su submit (Loader2 animate-spin durante pending),
motion di entrata "calmer" rispetto al vecchio design. Login ha link a Register e viceversa.
Confronta con: Impostazioni (stessa vocabulary form: Input, Button, label/focus ring),
Landing (stesso brand entry point, coerenza visiva).
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)

Al termine: presenta la critique completa — score /40 e finding classificati P0/P1/P2.
Se lo score è ≥36/40 e non ci sono P0/P1, dichiara la pagina "a regime" e fermati lì:
nessuna proposta ulteriore. Altrimenti proponi SOLO gli interventi che risolvono i finding
(craft + polish sull'esistente, nessuna nuova feature) e fermati al checkpoint per
approvazione, senza scrivere codice. Dopo l'ok: implementa, con test verdi e tsc pulito.
```

---

## Cross-cutting: Sistema di Shell e Layout Condivisi

```
/impeccable critique il sistema di shell e layout condivisi dell'app

Componenti: components/layout/PageContainer.tsx,
            components/layout/PageHeader.tsx,
            components/layout/PageTabBar.tsx,
            components/layout/PageTabs.tsx,
            components/layout/ThemePicker.tsx,
            lib/constants/navigation.ts

Questa critique valuta il guscio "interno" condiviso da tutte le pagine del dashboard
come unità: PageContainer (wrapper max-w-[1600px], spacing, max-desktop:portrait:pb-20),
PageHeader (sticky mobile bar h-14 backdrop-blur ↔ desktop full header), il pattern
multi-tab (PageTabBar underline animata desktop ≥1440px ↔ Radix Select / segmented pill
mobile, deep-link, stato tab), ThemePicker (6 temi) e navigation.ts (primaryNav/analysisNav/
planningNav/secondaryHrefs centralizzati). 9 pagine usano queste primitive; Cashflow, FIRE
e Settings usano il pattern multi-tab.
Confronta con: App Shell e Navigazione (sidebar/bottom-nav/drawer = guscio "esterno",
questo è il guscio "interno" della pagina); il benchmark è la coerenza cross-pagina.
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)

Al termine: presenta la critique completa — score /40 e finding classificati P0/P1/P2.
Se lo score è ≥36/40 e non ci sono P0/P1, dichiara la pagina "a regime" e fermati lì:
nessuna proposta ulteriore. Altrimenti proponi SOLO gli interventi che risolvono i finding
(craft + polish sull'esistente, nessuna nuova feature) e fermati al checkpoint per
approvazione, senza scrivere codice. Dopo l'ok: implementa, con test verdi e tsc pulito.
```

---

## Cross-cutting: Sistema dei Dialog

```
/impeccable critique il sistema dei dialog dell'app

Componenti: components/assets/AssetDialog.tsx,
            components/assets/TransactionDialog.tsx,
            components/assets/AssetMovementsDialog.tsx,
            components/assets/TaxCalculatorModal.tsx,
            components/expenses/ExpenseDialog.tsx,
            components/goals/GoalFormDialog.tsx,
            components/goals/AssetAssignmentDialog.tsx,
            components/dividends/DividendDialog.tsx,
            components/dividends/DividendDetailsDialog.tsx,
            components/dividends/InflationRateDialog.tsx,
            components/pension/PensionContributionDialog.tsx,
            components/cashflow/CostCenterDialog.tsx,
            components/expenses/CategoryManagementDialog.tsx,
            components/layout/LogoutDialog.tsx,
            components/ui/responsive-modal.tsx

Questa critique valuta la coerenza del sistema dei dialog come unità: struttura
(DialogTitle + DialogDescription presente in tutti?), footer pattern (primario destra /
ghost sinistra), sizing breakpoint, loading state (Loader2 su tutti i submit pending?),
2-step flow in AssetDialog e ExpenseDialog (AnimatePresence mode="wait", spring config),
motion consistency e token compliance cross-dialog. Il perimetro include i dialog più
recenti, mai valutati insieme agli altri: TransactionDialog (segmented Compra/Vendi/Rettifica
con anteprima della plusvalenza), AssetMovementsDialog (lettura, non form — verifica che non
imiti un form), PensionContributionDialog e InflationRateDialog.
Convergenza su ResponsiveModal: `components/ui/responsive-modal.tsx` è l'astrazione target —
Dialog su desktop ↔ vaul bottom-sheet Drawer su mobile (≤768px) da una sola API. Oggi la usano
solo ExpenseDialog e CategoryManagementDialog; gli altri dialog-form sono `Dialog` plain (centrato
anche su mobile). Segnala dove un dialog-form trarrebbe beneficio dalla migrazione a ResponsiveModal
per uniformare il comportamento mobile (le conferme piccole e i flussi speciali possono restare Dialog).
Vedi AGENTS.md → "Responsive Modals".
Confronta con: ogni dialog rispetto agli altri — il benchmark è la coerenza interna.
Design language atteso (vedi DESIGN.md): North Star "Effortless Precision" — Linear/Vercel +
Trade Republic + Apple, sotto la legge Form Follows Function (onestà, deferenza, inevitabilità:
ogni proprietà visiva è conseguenza di una funzione, mai decorazione). Scala hero: page hero
text-[44px] desktop:text-[54px] font-bold font-mono tracking-[-0.03em], section hero text-[36px],
sub-hero text-[22px] (mai text-4xl/text-2xl per un hero). Mono Mandate: ogni numero in Geist Mono
+ tabular-nums. Zero-Chroma + Data Owns Color: chrome achromatica, il colore lo possiede il dato
(chart e temi). Gerarchia Trade Republic (un numero dominante, flat divide-y rows, no card-in-card),
useChartColors() per ogni serie grafica, token OKLCH compliance su tutti e 6 i temi.

Contesto:
- Leggi DESIGN.md (fonte canonica del design system — North Star, Form Follows Function, scala tipografica, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)

Al termine: presenta la critique completa — score /40 e finding classificati P0/P1/P2.
Se lo score è ≥36/40 e non ci sono P0/P1, dichiara la pagina "a regime" e fermati lì:
nessuna proposta ulteriore. Altrimenti proponi SOLO gli interventi che risolvono i finding
(craft + polish sull'esistente, nessuna nuova feature) e fermati al checkpoint per
approvazione, senza scrivere codice. Dopo l'ok: implementa, con test verdi e tsc pulito.
```

---

## Email Periodiche

> **Medium diverso dal resto del registro.** Le altre 17 voci critiquano pagine React del
> dashboard; questa critiqua un artefatto **HTML email** server-side. Il blocco "Design
> language atteso" standard NON si applica: niente token CSS, niente `useChartColors()`,
> niente Framer Motion, niente breakpoint `desktop:`. Usa il benchmark email-specifico qui sotto.
> Distingui inoltre il piano **visivo** (oggetto di questa critique) dal piano **funzionale**
> (correttezza confronti, semantica baseline, boundary periodi, prompt AI) che è dominio di
> `/code-review` + test Vitest (`__tests__/emailPeriodComparison.test.ts`), non di impeccable.

```
/impeccable critique l'email periodica (riepilogo mensile / trimestrale / semestrale / annuale)

PRE-STEP OBBLIGATORIO — l'email va VISTA, non solo letta nel sorgente:
`buildEmailHtml` ritorna una stringa HTML. Prima di critiquare, RENDERIZZALA:
genera l'HTML (via il manual test-send `app/api/user/monthly-email/send/route.ts`,
oppure salvando l'output di build in un file `.html`) e aprila nel browser —
idealmente in light E dark, a larghezza desktop E mobile (320–375px). Una critique
sul solo sorgente TS è cieca su spacing, overflow e resa cross-client.

File: lib/server/monthlyEmailService.ts
      (buildEmailHtml, simpleMarkdownToHtml, buildComparisonSectionHtml, comparisonCell)
      lib/server/weeklyBudgetEmailService.ts (email budget settimanale)
Contesto logico (non visivo, solo per capire i dati renderizzati):
      lib/server/emailPeriodComparison.ts,
      app/api/cron/monthly-snapshot/route.ts (fasi 2-6: è il cron che le invia),
      app/api/user/monthly-email/send/route.ts (per il render di test)

Sono DUE artefatti, entrambi nel perimetro:
1. Riepilogo periodico (mensile / trimestrale / semestrale / annuale): hero patrimonio netto,
   tabella deterministica "Confronti" (Patrimonio/Entrate/Uscite/Risparmio × periodo precedente
   + stesso periodo anno prima, con nota baseline), e un commento AI in 5 sezioni (sintesi /
   vs periodo precedente / vs anno prima / variazione entrate-spese + cause / azioni) reso da
   markdown via simpleMarkdownToHtml.
2. Email budget settimanale (domenica, fase 6 del cron): è INVIATA settimanalmente ma le sue
   cifre sono month-to-date (budget mensili e complessivo) e year-to-date (budget annuali), con
   proiezioni di fine periodo. Ogni orizzonte deve restare dichiarato esplicitamente nella
   caption HTML — il modello aveva già etichettato una volta la proiezione mensile come
   "fine anno". Verificare che la resa visiva non riapra quell'ambiguità.

Design language atteso (email HTML — il medium impone vincoli OPPOSTI al dashboard):
Il principio resta quello di DESIGN.md — "Effortless Precision" e la legge Form Follows
Function (onestà, deferenza, inevitabilità): ogni elemento giustifica la sua presenza
comunicando un numero, un trend o una relazione. Ma questi vincoli del medium NON sono violazioni:
- Stili INLINE con hex hardcoded sono OBBLIGATORI — i client email (Gmail, Outlook) non
  supportano CSS variables/token né classi esterne. NON segnalare gli hex inline come
  "token violation": qui è onestà verso il medium, non un difetto.
- Layout a TABELLE (`<table>`/`<td>`) è corretto e necessario — non flex/grid.
- NON applicabili e da NON cercare: `useChartColors()`, Framer Motion, ARIA `role="tablist"`,
  breakpoint `desktop:`, count-up, Recharts.
Cosa invece DEVE valere (i principi che attraversano il medium):
- Mono Mandate adattato: ogni numero (patrimonio, %, €) usa uno stack monospace
  (`'Geist Mono', ui-monospace, monospace`) con allineamento tabellare nella tabella Confronti.
- Gerarchia Trade Republic: UN numero dominante (patrimonio netto), eyebrow label sopra,
  variazione/contesto sotto. Nessun numero secondario di pari peso visivo.
- Zero-chroma / Data Owns Color: la chrome è achromatica (grigi); il colore è riservato ai
  delta sign-aware — verde positivo / rosso negativo, con semantica INVERTITA sulle Uscite
  (un +% di spesa è rosso). Nessun accento decorativo.
- Chrome reduction: niente box-dentro-box; separazione via `border-bottom` sulle righe.
Assi di qualità PROPRI del medium email (valuta QUESTI):
- Compatibilità client: Gmail web/app, Apple Mail, Outlook.
- Dark mode: oggi l'email è light-only su `#ffffff` fisso, senza `<meta name="color-scheme">`
  né `@media (prefers-color-scheme: dark)` → opportunità, segnalala.
- Mobile: la tabella Confronti non deborda a 320–375px; body ≥ 14px; singola colonna.
- Fedeltà markdown→HTML: simpleMarkdownToHtml rende le 5 sezioni (heading, liste ol/ul,
  grassetti) senza `<br>` orfani o spacing rotto.
- Fallback dati: celle "N/D" pulite quando manca una baseline; caso `previousEqualsYoy`
  (yearly degenere) collassa a colonna singola.
- Accessibilità: `lang="it"`, header di tabella semantici, contrasto AA del grigio su sfondo,
  larghezza max 600px centrata.

Contesto:
- Leggi DESIGN.md (North Star, Form Follows Function, Mono Mandate, Zero-Chroma)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALO durante la scrittura di codice (tipi di commento ammessi, WHY non WHAT)
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALO durante la scrittura di codice (struttura, naming, error handling, test)

Al termine: presenta la critique completa — score /40 e finding classificati P0/P1/P2.
Se lo score è ≥36/40 e non ci sono P0/P1, dichiara la pagina "a regime" e fermati lì:
nessuna proposta ulteriore. Altrimenti proponi SOLO gli interventi che risolvono i finding
(craft + polish sull'esistente, nessuna nuova feature) e fermati al checkpoint per
approvazione, senza scrivere codice. Dopo l'ok: implementa, con test verdi e tsc pulito.
```

---

## Ordine consigliato di esecuzione

Dalla meno redesignata alla più redesignata, per trovare i delta maggiori prima:

1. Cashflow / tab "Dividendi" ← mai redesignato, delta atteso alto
2. Impostazioni ← 6 tab, due sezioni recenti mai valutate (import CSV, Condivisione)
3. Cross-cutting: Sistema dei Dialog ← usati ovunque, e 4 dialog nuovi mai valutati insieme agli altri
4. App Shell e Navigazione ← fondamentale, problemi noti già in layout.tsx; ora anche lo switcher account
5. Landing Page ← primo contatto utente, mai critiquata
6. Login e Register ← già migliorati ma mai critiquati formalmente

Previdenza esce dalla lista: critiquata 2026-08-01 e auditata 2026-08-02, con entrambe le baseline
registrate nella sua sezione. Rientra solo per misurare un delta, non come pagina scoperta.

Cashflow / tab "Centri di Costo" non è mai stato in lista ed è già stato fatto: critiquato
2026-08-13 = 20/40, 2 P0 e 4 P1 chiusi lo stesso giorno (baseline nella sua sezione). Manca
invece il suo audit, che è il candidato più fresco: il tab è passato da 1 finding del detector
a zero, ma i tre componenti non hanno alcuna copertura di test.
8. Allocazione ← esteso con l'allocazione a leva, la parte più giovane della pagina
9. Patrimonio ← hero gemello di Panoramica + registro operazioni mai critiquato
10. Analisi ← critiquata 2026-07-21 (25/40), redesign implementato — rieseguire per delta
11. Panoramica ← hero rivisto 2026-07-16 + chip a grid 2026-07-26 (verifica delta)
12. Cashflow / tab "Tracciamento" (mobileLabel: "Spese") e "Budget"
13. Rendimenti ← IA single-answer già implementata, verifica delta
14. Storico
15. Hall of Fame
16. FIRE e Simulazioni (5 tab — incl. What If)
17. Assistente AI ← rieseguire dopo redesign (baseline: 25/40)
18. Cross-cutting: Shell e Layout Condivisi (PageContainer/PageHeader/PageTabBar) ← guscio mai verificato come unità
19. Email Periodiche ← medium a sé (HTML email, mai critiquato), 2 artefatti, benchmark proprio + render pre-step obbligatorio
