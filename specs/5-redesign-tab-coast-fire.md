# Spec 5 — Redesign tab Coast FIRE

> **Ordine**: 5 di 5. **Dipende dalla Spec 3** (inflow del fondo pensione nella camminata) e
> segue la Spec 4 (ne riprende pattern e componenti condivisi appena stabiliti).
> **Scopo**: `CoastFireTab.tsx` è il componente più grande del repo (1.618 righe) e mescola
> configurazione, scenari e proiezione senza una risposta dominante. Va portato alla stessa IA
> "single-answer" della Spec 4 e spezzato in sottocomponenti.
> **Vincolo di fondo**: NESSUN cambio di matematica — sconto Coast, IRPEF marginale, pensioni
> statali e camminata bridge restano quelli di `fireService.ts` (+ Spec 3).

## Stato attuale

`components/fire-simulations/CoastFireTab.tsx` (1618 righe): collapsible config (età, età
pensionamento, spese custom, righe pensioni statali, scaglioni IRPEF), `HeroMetricBlock` sul
`coastFireNumberToday` (scenario base), righe per-scenario con progress (incluso progress
solo-liquido), `CoastFireProjectionChart` (3 serie portafoglio + target tratteggiato con
tooltip anno+età), testo esplicativo. La domanda della pagina — **"posso smettere di versare?"** —
non riceve mai una risposta esplicita: l'utente deve confrontare da solo il numero hero col
proprio patrimonio.

## Layout target

1. **Hero `[2fr_1fr]`**:
   - **Dominante**: il verdetto. "Coast FIRE raggiunto" / "Ti mancano {X} € al Coast FIRE"
     (scenario base), con il confronto esplicito `patrimonio attuale` vs `coastFireNumberToday`
     e la % di progresso come chip. Copy al singolare/plurale coerente dove serve.
   - **Companion**: cosa succede se smetti oggi — capitale proiettato a pensione senza nuovi
     versamenti (`futureValueAtRetirementWithoutNewContributions`, scenario base) vs capitale
     richiesto, + riga pensioni statali nette considerate.
   - Riga **basis** sotto l'hero: età attuale, età pensionamento, spese usate (reali o custom),
     real return dello scenario base, fondo pensione bloccato/no.
2. **Timeline degli afflussi** (nuovo, piccolo): una riga orizzontale che nomina gli eventi che
   la camminata già sconta — anno di sblocco del fondo pensione (Spec 3) e anni di partenza di
   ciascuna pensione statale, ciascuno con l'importo. È la spiegazione visiva del perché il
   numero Coast è più basso del FIRE number pieno. Solo dati già calcolati: nessuna nuova
   matematica.
3. **Configurazione**: un solo collapsible "Impostazioni" (età, età pensionamento, spese custom,
   pensioni, scaglioli IRPEF), chiuso di default quando già configurato (seeded-flag `useRef`,
   stesso pattern della Spec 4). Le pensioni statali e gli scaglioni restano editabili lì dentro,
   invariati nella logica.
4. **Scenari**: le attuali righe Bear/Base/Bull compattate in card coerenti con la Spec 4
   (progress verso il Coast number di scenario, incluso il progress solo-liquido esistente).
5. **Sezione "Proiezione"**: `CoastFireProjectionChart` invariato nella sostanza, con il gradino
   dello sblocco visibile (Spec 3) e il tooltip che lo nomina; la spiegazione "come funziona il
   Coast FIRE" scende in un collapsible "Dettaglio".

## Spezzare il componente

Nuova cartella `components/fire-simulations/coast/`:

- `CoastFireConfigSection.tsx` (form + pensioni + IRPEF)
- `CoastFireHero.tsx`
- `CoastInflowTimeline.tsx`
- `CoastScenarioCards.tsx`
- `CoastFireProjectionSection.tsx` (wrappa il chart esistente)

`CoastFireTab.tsx` resta l'orchestratore (stato, query, mutation) e scende sotto le ~400 righe.
Regole: componenti a livello modulo (mai definiti nel render body), `useWatch` per render /
`getValues` nei handler, `DialogDescription` ovunque servisse, niente hex hardcoded, `desktop:`
mai `lg:`. Refactor e feature NON nello stesso commit… ma la sessione ha un solo commit
(WORKFLOW): quindi lo split è parte integrante di questa spec, dichiarato nel messaggio di
commit, e NON deve cambiare alcun numero renderizzato — è la definizione di riuscita.

## Cosa NON fare

- Nessuna modifica a `fireService.ts` (se il redesign rivela un bisogno matematico, fermarsi e
  segnalarlo).
- Non toccare What If, Monte Carlo, Obiettivi, né il tab FIRE (Spec 4).
- Non rigenerare DESIGN.md; niente nuovo period selector; nessuno stato "Custom" permanente.
- La serializzazione delle pensioni (`serializeCoastFirePensions`, niente `undefined` nei nested
  — AGENTS → *FIRE, What If and Goals*) non va toccata.

## Test

- I numeri sono già coperti da `fireService`; qui si aggiunge:
  - un test di **parità di rendering dei dati**: gli input passati ai nuovi sottocomponenti
    (props) derivano dalle stesse chiamate di prima — se esiste già una suite di helper del tab,
    estenderla; altrimenti coprire con l'E2E sotto.
  - **Playwright**: estendere `e2e/fire.spec.ts` (o nuovo `coast.spec.ts`, progetto desktop,
    `workers: 1`): il tab Coast mostra il verdetto con un importo formattato, la timeline degli
    afflussi elenca pensioni + sblocco fondo (col seed scenario pensione), il collapsible
    Impostazioni apre/chiude misurando l'altezza. Visto rosso su assert falsificati prima di
    fidarsi.
- `npx tsc --noEmit` dopo i test; suite anche con `TZ=Europe/Rome`.

## Verifica (collaudo guidato, WORKFLOW.md)

Fase A (invarianza): con gli stessi dati seed, ogni numero visibile prima/dopo il refactor è
identico — confrontare una lista scritta PRIMA del redesign (hero, scenari, punti chiave del
chart) con la pagina nuova. Fase C: timeline afflussi coerente con i settings (spostare l'età
INPS di 1 anno sposta lo sblocco di 1 anno). Giudizio estetico a Giuseppe. Aggiornare CLAUDE.md
(Latest), SESSION_NOTES.md, docs/critique-prompts.md se esiste la voce Coast.

## Criteri di accettazione

- [ ] Il tab risponde subito a "posso smettere di versare?" con un verdetto esplicito.
- [ ] `CoastFireTab.tsx` < ~400 righe, sottocomponenti a livello modulo in
      `components/fire-simulations/coast/`.
- [ ] Timeline afflussi presente e coerente con la camminata (pensioni statali + sblocco fondo).
- [ ] Zero variazioni numeriche rispetto a prima (fase A del collaudo superata).
- [ ] E2E verde (e visto rosso su falsificazione); tsc pulito.

---

## Implementazione consigliata

- **Modello**: `claude-opus-5` · **Effort**: high
  (refactor + redesign con vincolo di invarianza numerica; la matematica non si tocca; usare la
  skill impeccable per il lavoro visivo)

### Prompt di implementazione

```
Leggi TASSATIVAMENTE prima di ogni cosa: AGENTS.md (in particolare Hierarchy, Motion, Recharts,
FIRE What If and Goals, Browser-Driven E2E), CLAUDE.md, WORKFLOW.md, COMMENTS.md,
DEVELOPMENT_GUIDELINES.md e DESIGN.md (normativo, mai rigenerarlo). Crea un branch dalla branch
attiva (una branch per sessione, commit solo dopo mia approvazione esplicita). Crea/aggiorna
SESSION_NOTES.md. Per il lavoro visivo usa la skill impeccable (/impeccable) sul tab Coast FIRE.

Implementa ESATTAMENTE la specifica in specs/5-redesign-tab-coast-fire.md. In sintesi:
CoastFireTab.tsx (1618 righe) diventa un orchestratore < ~400 righe sopra i nuovi sottocomponenti
in components/fire-simulations/coast/ (ConfigSection, Hero, InflowTimeline, ScenarioCards,
ProjectionSection); hero [2fr_1fr] con verdetto esplicito "posso smettere di versare?" +
companion "cosa succede se smetti oggi" + riga basis; nuova timeline degli afflussi (pensioni
statali + sblocco fondo pensione della Spec 3, solo dati già calcolati); configurazione in un
collapsible con seeded-flag; scenari come card; proiezione con gradino allo sblocco nominato nel
tooltip; spiegazioni in un collapsible Dettaglio.

Vincolo assoluto: NESSUN cambio di matematica e ZERO variazioni numeriche — prima di toccare il
codice, registra in SESSION_NOTES.md i valori visibili col seed attivo (hero, scenari, punti del
chart) e a fine lavoro dimostra che sono identici (fase A del collaudo guidato). Poi estendi la
E2E come da spec, provando che possa fallire. npx tsc --noEmit dopo i test, suite anche con
TZ=Europe/Rome. Chiudi con il collaudo guidato e lascia a me solo il giudizio estetico. Riassumi
il diff e chiedi l'OK per il commit.
```
