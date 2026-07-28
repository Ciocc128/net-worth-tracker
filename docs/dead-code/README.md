# Audit codice morto — indice delle spec (2026-07-28)

Risultato dell'audit multi-agente del 2026-07-28: baseline `knip` (unused files /
exports / dependencies) + verifica avversariale di ogni candidato (grep esteso:
import statici, `next/dynamic`, riferimenti a stringa, JSX, re-export, test,
entry point) + discovery delle categorie che knip non vede (route API morte,
branch morti in file vivi, cluster superseded, dipendenze) + critico di
completezza. **Ogni finding nelle spec è stato confermato da almeno due agenti
indipendenti** (verificatore + scettico che ha provato a confutarlo); i verdetti
confutati sono già stati esclusi.

## Le spec (una sessione ciascuna, in quest'ordine)

| # | Spec | Rischio | Modello | Effort | Stato |
|---|------|---------|---------|--------|-------|
| 01 | [File orfani, hook e dipendenze](01-file-orfani-hook-e-dipendenze.md) | Basso | Sonnet 5 | medium | ✅ Implementata (2026-07-28, `chore/dead-code-01-orfani`) |
| 02 | [Pipeline PDF chart-capture (no-op)](02-pipeline-pdf-chart-capture.md) | Medio | Sonnet 5 | high | ✅ Implementata (2026-07-28, `chore/dead-code-02-pdf`) |
| 03 | [Export morti: services, server, hooks](03-export-morti-services-server-hooks.md) | Medio | Sonnet 5 | high | ✅ Implementata (2026-07-28, `chore/dead-code-03-exports`) |
| 04 | [Export morti: utils, types e policy UI](04-export-morti-utils-types-e-policy-ui.md) | Basso | Sonnet 5 | medium | ✅ Implementata (2026-07-28, `chore/dead-code-04-utils-types`) |
| 05 | [Branch morti e decisioni di prodotto](05-branch-morti-e-decisioni-di-prodotto.md) | Alto | Opus 5 | high | |
| 06 | [Sweep token CSS (opzionale)](06-sweep-token-css.md) | Medio | Sonnet 5 | high | |

**Ordine**: 01 → 02 → 03 → 04 → 05; la 06 è opzionale e va DOPO la 04 (usa la
policy shadcn lì definita). La 01 va prima della 03 (entrambe toccano
`lib/services/expenseService.ts`). La 05 è indipendente ma è l'unica che cambia
comportamento: farla per ultima tiene le regressioni isolate. **Un branch per
spec** (`chore/dead-code-01-orfani`, ecc.), come per l'audit Rendimenti.

## Protocollo condiviso (vale per OGNI spec)

1. **Prima di ogni cancellazione, ri-verifica**: `grep -rn "<Simbolo>"` su
   `**/*.{ts,tsx,mts,mjs,js,json,md}` — il codice può essere cambiato dopo
   l'audit. Se compaiono riferimenti nuovi, fermati e segnala invece di forzare.
   ⚠️ ripgrep di default **salta le directory con il punto** (`.storybook/`,
   `__mocks__` no ma `.storybook` sì): usa `--hidden` (escludendo `.git`,
   `node_modules`, `.next`) o il file sembrerà morto quando non lo è.
2. **Batch piccoli**: dopo ogni blocco logico esegui `npx tsc --noEmit`. A fine
   sessione: suite d'area (mappa in AGENTS.md → *Testing and Workflow*),
   `npx vitest run` completa, `npm run build`.
3. **tsc è la rete di sicurezza** per i riferimenti statici; NON copre i
   riferimenti runtime a stringa (URL, `vi.mock`, collection Firestore). Le spec
   segnalano esplicitamente i punti dove serve una verifica runtime.
4. **Cancella la catena intera, non il primo anello**: molti simboli sono "vivi"
   solo perché importati da un altro orfano. Le catene collaterali sono spellate
   per esteso in ogni spec — applicale come unità atomiche.
5. **Aggiorna i documenti citati**: ogni spec elenca le righe di AGENTS.md /
   CLAUDE.md / docs/* che menzionano i simboli rimossi. Un doc che punta a codice
   cancellato è il prossimo falso positivo.
6. **Niente refactor opportunistici**: solo rimozioni e de-export previsti dalla
   spec (DEVELOPMENT_GUIDELINES: mai mischiare refactoring e feature work).
7. **Commit convenzionali**: `chore: remove <cosa>` / `refactor: unexport <cosa>`,
   un commit per blocco logico.
8. A fine sessione (facoltativo ma consigliato): `npx knip` per confermare che i
   finding della propria spec sono spariti e non ne sono comparsi di nuovi.

## Whitelist — VIVI per convenzione, MAI da segnalare o cancellare

- `app/**/{page,layout,route,loading,error,not-found}.tsx|ts` (App Router)
- `app/api/cron/monthly-snapshot` e `app/api/cron/daily-dividend-processing`:
  vivi SOLO via `vercel.json` crons (zero chiamanti interni — è normale).
  Il cron mensile chiama a sua volta `POST /api/portfolio/snapshot` server-to-server
  con URL assoluto da `NEXT_PUBLIC_APP_URL` (`monthly-snapshot/route.ts:92`):
  ogni rename di quella route deve aggiornare quel call site.
- `public/sw.js`: vivo per convenzione URL — service worker volutamente vuoto che
  risponde 200 alle auto-probe di `/sw.js` (vedi il suo commento). NON cancellare.
- `scripts/*` referenziati dagli script npm; `firebase-tools` (devDep): usato come
  **binario** da `scripts/emulators.mjs:38` (`firebase emulators:start` via shell)
  — invisibile a knip, rimuoverlo rompe `npm run emulators` a runtime.
- `react-dom`: zero import diretti ma peer obbligatorio di next/radix-ui.
- `.storybook/mocks/ColorThemeContext.tsx` (incl. `useColorTheme`): consumato via
  alias `viteFinal` in `.storybook/main.ts:19-25` — falso positivo di knip.
- `components/performance/RealizedGainsSection.tsx`: il file NON esporta un
  componente `<RealizedGainsSection>` — esporta `RealizedGainsRows` e
  `aggregateRealizedByYear`, entrambi consumati dalla pagina Rendimenti.
- Tutte le altre route API: censite metodo per metodo, ogni coppia route/metodo ha
  almeno un chiamante di produzione con metodo HTTP corrispondente — unica
  eccezione `POST /api/ai/assistant/threads` (vedi spec 05).

## Fuori perimetro (valutato e chiuso, NON ri-esplorare)

- **Commented-out code / feature flag costanti**: sweep sistematico eseguito,
  zero risultati.
- **File di types/ interi**: tutti e 19 hanno importer; solo morte a livello di
  simbolo (coperta dalle spec 03-04).
- **Storie Storybook**: tutte e 4 mostrano componenti vivi.
- **Script npm**: nessuno stale. **Env var**: diff `.env.local.example` ↔ codice
  pulito nei due sensi.
- **Snapshot mensili / matematica Rendimenti**: nessuna spec tocca calcoli —
  `CACHE_MATH_VERSION` NON va bumpata da nessuna di queste sessioni.

## Nota di metodo

La regola AGENTS.md *"Census 'Keep' Verdicts Need the Same Grep as 'Delete'
Verdicts"* è stata applicata: anche i verdetti "vivo" citati qui sopra sono
passati dallo stesso protocollo di grep dei verdetti "morto".
