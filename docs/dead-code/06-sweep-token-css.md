# Spec 06 — Sweep token CSS in globals.css (opzionale, audit-first)

**Rischio: medio** — territorio design system (6 temi, Tailwind v4, detector
impeccable). A differenza delle spec 01-05, qui l'audit ha fatto solo uno
**spot-check** (fruttuoso): questa sessione deve PRIMA completare lo sweep con un
protocollo rigoroso, POI rimuovere. Non applicare a scatola chiusa.

Prerequisito: spec 04 mergiata (riusa la sua policy "shadcn standard resta").
Leggi `docs/dead-code/README.md` e, obbligatoriamente, DESIGN.md (mai
rigenerarla; il frontmatter YAML è normativo).

## Candidati già individuati dallo spot-check

| Token | Stato rilevato | Azione proposta |
|-------|----------------|-----------------|
| `--destructive-foreground` | Definito in OGNI blocco tema (globals.css:196, 236, 278, 316, 515, …) ma NESSUNA mapping `@theme` (`--color-destructive-foreground` non esiste ⇒ la utility `text-destructive-foreground` non viene generata) e zero `var(--destructive-foreground)` repo-wide | ⚠️ È superficie **standard shadcn**: per la policy della spec 04 la raccomandazione è **KEEP** (un futuro `npx shadcn add` o un uso di `bg-destructive` + foreground la richiederebbe). In alternativa documentata: rimuoverla da tutti i blocchi tema E dalla checklist mentale — ma solo con scelta esplicita |
| `--positive-foreground` + mapping `--color-positive-foreground` (globals.css:34, definizioni per tema es. :81, :123) | Coppia custom (non shadcn): utilities `*-positive-foreground` usate 0 volte | **CANCELLA la coppia** (mapping + definizioni per tema) |
| Mapping `--color-ai-accent` (globals.css:36) | L'unico consumer (`app/dashboard/performance/page.tsx:133`) usa `var(--ai-accent)` come arbitrary value: la MAPPING è morta, il token sottostante `--ai-accent` è VIVO | **CANCELLA solo la riga di mapping**; non toccare `--ai-accent` |
| Famiglia `--sidebar-primary-foreground` | Utilities a 0 hit (vs `sidebar-accent-foreground` a 11) | **KEEP** — superficie standard shadcn sidebar (policy spec 04). AGENTS.md documenta la semantica dei sidebar token: non assottigliarla |

## Protocollo di sweep completo (le ~471 custom property non spot-checkate)

Per OGNI `--nome` definito in `app/globals.css`, un token è vivo se vale almeno
una di queste; morto solo se falliscono TUTTE:

1. **`var(--nome`** in qualunque file (`.tsx`, `.ts`, `.css`) — copre inline
   style, SVG stroke/fill, arbitrary value Tailwind `[var(--nome)]`.
2. **Utility Tailwind generata**: se esiste una mapping `@theme` (`--color-X`,
   `--radius-X`, `--font-X`, `--breakpoint-X`), cerca le utility derivate
   (es. `--color-positive` → `text-positive`, `bg-positive/10`,
   `border-positive` …). Grep sul NOME UTILITY, non sul nome variabile.
3. **`getPropertyValue('--nome')`** — pattern `useChartColors` e affini.
4. **Catena CSS interna**: un token vivo può consumarne un altro
   (`--color-positive: var(--positive)`): risali la catena prima di dichiarare
   morto il token sottostante.
5. **Contratto shadcn/impeccable**: se il token è superficie standard shadcn o è
   dichiarato nel frontmatter di DESIGN.md / in `.impeccable/design.json`,
   default **KEEP** (la spec 04 ha stabilito che la superficie standard non si
   pota); segnala invece l'eventuale divergenza tra DESIGN.md e globals.css come
   finding documentale.

Suggerimento operativo: estrai la lista dei token con un one-liner
(`grep -o -- '--[a-z0-9-]*:' app/globals.css | sort -u`) e lavora per famiglie
(un tema = 6 blocchi da tenere allineati: la rimozione di un token va fatta in
TUTTI i blocchi tema che lo definiscono, mai in uno solo).

## Vincoli

- **Mai toccare DESIGN.md** (hand-maintained, autoritativa). Se un token morto è
  citato nel suo frontmatter, il finding è "divergenza documentale": segnala in
  SESSION_NOTES, non editare.
- I 6 temi devono restare coerenti: dopo ogni famiglia rimossa, smoke visivo su
  almeno default + cyberpunk (light e dark) — sono i temi con i valori più
  divergenti.
- Il detector impeccable legge il frontmatter di DESIGN.md e
  `.impeccable/design.json`: non rimuovere token che quei layer dichiarano senza
  prima segnalarlo.

## Validazione finale

1. `npm run build` (la compilazione Tailwind v4 è il vero test qui) + `npx tsc --noEmit`
2. Smoke visivo: Panoramica, Rendimenti, Allocazione su 2+ temi in light/dark
3. `npx vitest run` (le utility di colore hanno test in `metricColors`)
4. Diff finale di globals.css riletto riga per riga: solo rimozioni attese

## Prompt per la sessione di implementazione

```
Implementa la spec docs/dead-code/06-sweep-token-css.md (audit codice morto,
sessione 6 di 6 — opzionale; richiede la 04 mergiata). Prima completa lo sweep
di TUTTE le custom property di app/globals.css col protocollo a 5 controlli
della spec (i 4 candidati già noti partono dalla tabella), poi applica solo le
rimozioni che falliscono tutti i controlli, rispettando la policy shadcn della
spec 04 (superficie standard = KEEP) e i vincoli su DESIGN.md.

Regole:
- Audit-first: nessuna rimozione prima che lo sweep completo sia documentato in
  SESSION_NOTES.md (token → esito dei 5 controlli)
- Un token si rimuove da TUTTI i blocchi tema insieme, mai da uno solo
- MAI editare DESIGN.md; divergenze documentali si segnalano soltanto
- npm run build dopo ogni famiglia rimossa; smoke visivo su default + cyberpunk
  in light e dark; branch chore/dead-code-06-css-tokens

Contesto:
- Leggi docs/dead-code/README.md (protocollo condiviso e whitelist)
- Leggi DESIGN.md (fonte canonica del design system — layer normativo frontmatter)
- Leggi AGENTS.md (pattern, convenzioni, gotcha — in particolare Color Theme
  System e Layout Tokens)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice

Crea SESSION_NOTES.md per tracciare il lavoro.
```

**Modello consigliato: Sonnet 5 · Effort: high.** Lo sweep è meccanico ma le
semantiche Tailwind v4 (@theme → utility generate) e il vincolo multi-tema
chiedono rigore; se durante lo sweep emergono ambiguità ripetute sui token
shadcn, fermarsi e riportare invece di decidere da soli.
