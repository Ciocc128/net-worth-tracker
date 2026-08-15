# SPEC-4D — Assistente AI: redesign della pagina (con impeccable)

**Stato**: pronta per implementazione · **Dipendenze**: SPEC-4A/4B/4C (si ridisegna lo stato FINALE, non quello attuale) · **Ordine**: ultima del blocco assistente

## Obiettivo

Riallineare la pagina Assistente al linguaggio delle pagine nuove (Panoramica, Rendimenti,
Allocazione, Previdenza): oggi è l'unica pagina "vecchia" rimasta ed è un file monolitico. È un
**rebuild della shell della pagina**, non una lucidata — ma la logica (stream SSE, thread, memoria,
bundle) NON cambia: si riorganizza solo la superficie.

## Stato attuale (verificato — il gap col design system)

- `components/assistant/AssistantPageClient.tsx` è **1480 righe** con due componenti inline
  (`ThreadList` ~182 righe, `PatrimonioTodayCard` ~40) e ~15 `useState`.
- **Nessun hero**: header con `h1 text-3xl` (fuori dalla scala tipografica documentata — DESIGN.md
  non ha uno step da 30px) e **quattro bottoni di pari peso** (Conversazioni / Memoria / Nuova
  conversazione / Preferenze), nessuna azione primaria.
- Griglia bespoke `desktop:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.85fr)]` invece del canonico
  `[2fr_1fr]` (DESIGN.md → Bento Asymmetric Hero).
- Period selector artigianale (`AssistantPeriodSelector.tsx:95-125`, `layoutId` proprio +
  `bg-secondary`) mentre esiste `components/ui/segmented-pill.tsx`, usato da 8+ superfici nuove.
- `rounded-xl` su contenitori top-level dove DESIGN.md riserva `rounded-2xl` alle card primarie.
- L'empty state impila **cinque** blocchi senza gerarchia; la lista "Riprendi conversazione"
  duplica lo sheet Conversazioni (due rappresentazioni della stessa cosa).

## Direzione (vincoli per impeccable, non mockup)

1. **Hero `[2fr_1fr]`**: a sinistra il cuore conversazionale (o, in empty state, il "cosa posso
   chiederti" con i prompt chip gerarchizzati); a destra la companion card di contesto (l'attuale
   scheda periodo / `AssistantContextCard`), sticky come oggi. Il period selector diventa
   `SegmentedPill`.
2. **Una azione primaria** ("Nuova conversazione"); Conversazioni/Memoria/Preferenze degradano a
   icone/overflow coerenti con le altre pagine. Eliminare la lista duplicata "Riprendi
   conversazione" (lo sheet Conversazioni è l'unica rappresentazione).
3. **Memoria e obiettivi più visibili**: dopo SPEC-4B il pannello memoria mostra goal strutturati e
   valutazioni — merita una presenza nella pagina (badge/estratto nella companion card), non solo
   uno sheet nascosto.
4. **Decomposizione obbligatoria**: `ThreadList`, `PatrimonioTodayCard`, l'empty state e l'header
   estratti in file propri; il file pagina scende sotto una soglia ragionevole (~400 righe).
5. **Ciò che già funziona resta**: sheet per thread/memoria su ogni breakpoint (scelta deliberata,
   commenti a `:1054-1056` e `:1457-1460` — la colonna destra non deve mai diventare un secondo
   scroll annidato), composer sticky, streaming con `aria-live`.

## Processo

- **Usare il plugin impeccable** (`/impeccable`) per la direzione visiva: DESIGN.md è la spec
  normativa (frontmatter YAML letto dal detector) e NON va mai rigenerato a mano; PRODUCT.md è la
  verità di prodotto. I prompt di critique/audit per pagina sono in `docs/critique-prompts.md` e
  `docs/audit-prompts.md` — se manca una voce per l'assistente, questa sessione la aggiunge.
- Gotcha AGENTS da tenere davanti mentre si ricostruisce: componenti a livello di modulo (mai
  definiti nel render), `useWatch`/`getValues` mai `watch()`, `SegmentedPill` per i selettori,
  skeleton invece di spinner, Mono Mandate sui numeri (anche tick dei grafici), token di segno,
  touch target ≥44px, `DialogDescription` ovunque, transizioni via `template.tsx` già in essere.
- La pagina è dietro `NEXT_PUBLIC_ASSISTANT_AI_ENABLED` e bloccata in demo: il redesign non cambia i gate.

## Verifica

- `npx tsc --noEmit`, `TZ=Europe/Rome npx vitest run` (le suite assistant esistenti restano verdi:
  la logica non cambia), `npx knip` (i componenti estratti non devono lasciare orfani).
- Collaudo guidato visivo (WORKFLOW.md): emulatore + build di produzione (il budget CPU mobile è
  3-5× più stretto di `next dev`), portrait e desktop 1440px, tema chiaro/scuro su almeno due temi.
- Non esistono E2E per questa pagina: se durante il lavoro emergono asserzioni che solo un layout
  reale può dare (breakpoint 1440px, collapsible), valutare uno spec Playwright dedicato — ma è
  facoltativo, non un requisito della spec.

---

## Prompt per l'implementazione

> /impeccable Ridisegna la pagina Assistente AI seguendo la specifica
> `docs/specs/SPEC-4D-assistente-redesign.md`: rebuild della shell (hero `[2fr_1fr]` con companion
> card di contesto, SegmentedPill per il periodo, una sola azione primaria, memoria/obiettivi
> visibili, eliminazione della lista thread duplicata) con decomposizione di
> AssistantPageClient.tsx in componenti estratti, SENZA toccare la logica di streaming, thread,
> memoria e bundle. DESIGN.md è normativo e non va rigenerato; rispetta i vincoli della sezione
> "Direzione" e i gotcha elencati in "Processo". Al termine proponi il collaudo guidato visivo
> secondo WORKFLOW.md (build di produzione, portrait + desktop, due temi).
>
> Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
> - Leggi AGENTS.md (pattern, convenzioni, gotcha)
> - Leggi CLAUDE.md (stato corrente, known issues)
> - Leggi WORKFLOW.md
> - Leggi COMMENTS.md e APPLICALA mentre scrivi codice
> - Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice
>
> Crea SESSION_NOTES.md per tracciare il lavoro.

**Modello consigliato**: Fable 5 (o Opus 5), effort **high**, con il plugin impeccable installato.
Il redesign è giudizio estetico + refactor largo di un file da 1480 righe: è il caso d'uso del
modello maggiore. Farla per ULTIMA: ridisegnare prima di 4B/4C significherebbe ridisegnare due volte.
