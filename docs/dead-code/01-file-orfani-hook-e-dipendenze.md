# Spec 01 — File orfani, hook e dipendenze

**✅ Implementata (2026-07-28)** — branch `chore/dead-code-01-orfani`, sezioni A-G
tutte completate con un commit convenzionale ciascuna. Validazione finale verde:
`tsc` pulito, suite completa 79 file / 1406 test, `npm run build` e
`npm run build-storybook` ok, `npx knip` non segnala più nessuno dei simboli di
questa spec. Dettagli in `git log` sul branch (`docs: update AGENTS.md and
CLAUDE.md for dead-code audit session 1/6` e i 7 commit precedenti).

**Rischio: basso** — solo cancellazioni di file mai importati, catene collaterali
interamente verificate, dipendenze npm senza consumatori. Nessun cambiamento di
comportamento. `tsc` + vitest + build coprono ogni errore statico.

Leggi prima `docs/dead-code/README.md` (protocollo condiviso e whitelist).

## A. Componenti orfani (zero importer, verificati con scettico avversariale)

| File | LOC | Storia |
|------|-----|--------|
| `components/expenses/ExpenseCard.tsx` | 207 | Superseded dal `TransactionFeed` condiviso; chiamante rimosso nel redesign Cashflow (PR #132, commit `b27ecfd`) |
| `components/goals/GoalSummaryCards.tsx` | 113 | Rimozione deliberata, documentata nel consumer: `components/fire-simulations/GoalBasedInvestingTab.tsx:5` ("GoalSummaryCards removed — hero block covers totals…") |
| `components/monte-carlo/SuccessRateCard.tsx` | 152 | Sostituito dall'hero di probabilità inline in `MonteCarloTab.tsx:331` ("Probabilità di Successo") |

Passi:
1. Cancella i tre file.
2. **Fix commento stale**: `components/cashflow/ExpenseTrackingTab.tsx:95` istruisce
   ancora "Add color mapping in ExpenseCard.tsx badge colors" — aggiorna il
   commento indicando la posizione reale della mappa colori (il TransactionFeed /
   costanti condivise), non cancellarlo e basta.

## B. Hook morti + catena `expenseStats` (unità atomica)

| File | LOC | Nota |
|------|-----|------|
| `lib/hooks/useAllExpenses.ts` | 33 | Duplicato funzionale esatto di `useExpenses` (`lib/hooks/useExpenses.ts:27`): stessa query key `queryKeys.expenses.all`, stesso fetcher `getAllExpenses` |
| `lib/hooks/useDelayedLoading.ts` | 28 | Zero consumer da quando è stato scritto (session-10, `c076cb3`); anti-flash da 150ms mai adottato |
| `lib/hooks/useExpenseStats.ts` | 40 | Superseded dalla pipeline server `/api/dashboard/overview` (`f1837b6`) |

**Catena collaterale di `useExpenseStats` — va cancellata TUTTA insieme**
(knip marcava "vivi" gli anelli intermedi solo perché importati dall'orfano):

1. `lib/hooks/useExpenseStats.ts` (il seme).
2. `lib/services/expenseService.ts` → `getExpenseStats` (riga ~632, ~52 LOC):
   unico consumer era l'hook.
3. `lib/services/expenseService.ts` → `getMonthlyExpenseSummary` (riga ~572) e
   `getExpensesByMonth` (riga ~80): usati solo internamente dalla catena di
   `getExpenseStats`. **Prima di cancellare, grep interno al file** per confermare
   che nessun'altra funzione viva li chiami.
4. `types/expenses.ts` → interfaccia `ExpenseStats` (riga ~139) + import in
   `expenseService.ts:40`. Verifica anche `MonthlyExpenseSummary`: se resta orfano
   dopo il punto 3, rimuovi anche lui.
5. `queryKeys.expenses.stats`: rimuovi la definizione della key E l'invalidation
   in `app/dashboard/settings/page.tsx:655` (invalida una key senza subscriber).
6. **Doc**: AGENTS.md:463 cita `useAllExpenses` come anti-pattern per l'Overview —
   riformula la guidance senza il nome dell'hook cancellato (il principio resta
   valido, il simbolo no).

Nota: la pipeline overview usa il tipo DISTINTO `DashboardOverviewExpenseStats`
(`types/dashboardOverview.ts:55`) — non c'entra, non toccarlo.

## C. Decisione: `SettingsPageSkeleton` (+ coerenza con `useDelayedLoading`)

`components/settings/SettingsPageSkeleton.tsx` (132 LOC) ha zero importer; la
pagina fa `if (loading) return null;` (`app/dashboard/settings/page.tsx:1595`).
Il commit di creazione `c076cb3` dice esplicitamente che lo skeleton fu lasciato
"available for future use; pages currently use return null during fast loading"
— orfano **by design**, non per dimenticanza. Gli altri nove skeleton fratelli
sono tutti montati.

**Raccomandazione: cancellare** (Opzione A), coerente con la cancellazione di
`useDelayedLoading` (stesso ciclo session-10: se si eliminasse l'anti-flash ma si
montasse lo skeleton, si introdurrebbe proprio il flash che quell'hook doveva
prevenire).

- **Opzione A (consigliata)**: cancella `SettingsPageSkeleton.tsx`. Aggiorna i
  documenti che lo elencano come parte della superficie Settings:
  `docs/audit-prompts.md:945,974,1085` e `docs/critique-prompts.md:936`.
- **Opzione B (alternativa)**: monta lo skeleton (`if (loading) return
  <SettingsPageSkeleton />;` a `page.tsx:1595`) e in tal caso NON cancellare
  `useDelayedLoading`: usalo come guardia anti-flash. Scegliere B significa una
  micro-feature UX, non una rimozione di codice morto.

## D. Mock Storybook/Vitest morti

| File | Evidenza |
|------|----------|
| `.storybook/mocks/firebase.ts` (4 LOC) | Mai aliasato: `.storybook/main.ts:19-25` aliasa SOLO `ColorThemeContext` (strategia scelta: rompere la catena `useChartColors → ColorThemeContext → AuthContext → firebase` a monte, rendendo il mock firebase superfluo) |
| `__mocks__/firebase-config.ts` | Stessa storia: l'header dice "Storybook mock" ma niente vi risolve; l'auto-mock di vitest da `__mocks__/` root vale solo per i nomi di pacchetto node_modules, e `firebase-config` non lo è. Zero riferimenti repo-wide |

Passi: cancella entrambi; poi verifica che Storybook compili
(`npm run build-storybook` o `npm run storybook` con smoke visivo di una story) e
che la suite vitest completa passi. **NON toccare** `.storybook/mocks/ColorThemeContext.tsx`
(vivo via alias — whitelist).

## E. `components/ui/carousel.tsx` + dipendenza embla

- `components/ui/carousel.tsx` (242 LOC, shadcn standard): unico consumer storico
  (`CashflowTrackingMobile`) refactorato in `bc52e93` verso il self-contained
  `CashflowKpiCarousel` (`components/cashflow/cashflow-kpi/CashflowKpiCarousel.tsx`
  — nome simile, NESSUN import di ui/carousel: non confonderli).
- `embla-carousel-react` ha come unico importer quel file (`carousel.tsx:6`).

Passi: cancella il file, poi `npm uninstall embla-carousel-react`.

## F. Dipendenze npm

| Pacchetto | Azione | Evidenza |
|-----------|--------|----------|
| `embla-carousel-react` | `npm uninstall` (con E) | Unico importer è l'orfano carousel.tsx |
| `@storybook/react` (devDep) | `npm uninstall` | Nessun import diretto (le story importano da `@storybook/react-vite`); è **regular dep esatta** di `@storybook/react-vite`, non peer: resta installato transitively |
| `baseline-browser-mapping` (devDep) | `npm uninstall` | Nessuna config browserslist nel repo (no key in package.json, no `.browserslistrc`); già transitiva via next |
| `dotenv` (devDep) | `npm uninstall` | Zero riferimenti in scripts/, configs, .storybook (verificato con `--hidden`) |
| `png-to-ico` (devDep) | `npm uninstall` | Leftover di una generazione favicon one-off; nessuno script la referenzia (`npx png-to-ico` se mai riservisse) |
| `@types/canvas-confetti` | Sposta in devDependencies | È in `dependencies` per errore; consumata solo da tsc |
| `firebase-tools` | **KEEP** | Binario shellato da `scripts/emulators.mjs:38` — vedi whitelist |
| `react-dom` | **KEEP** | Peer obbligatorio |

Dopo le uninstall: `npm install` per riallineare il lockfile, poi
`npm run build` E un giro dell'emulator suite (`npm run emulators` si avvia? basta
verificare che il comando parta) per il caso firebase-tools.

## G. Asset statici in `public/`

- Cancella gli SVG starter di Next mai referenziati: `public/file.svg`,
  `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg`.
- In `public/favicon/`: l'unico file referenziato è `favicon-48x48.png`
  (`app/login/page.tsx:149`, `app/register/page.tsx:142`). Cancella
  `android-chrome-192x192.png`, `android-chrome-512x512.png`, `source.svg`,
  `favicon-16x16.png`, `favicon-32x32.png` — **dopo aver ri-verificato** che nel
  repo non esista alcun web manifest (`Glob **/*manifest*` — l'audit non ne ha
  trovati) né riferimenti nuovi.
- **Bug collaterale da fixare**: `app/layout.tsx:55-56` dichiara icone a
  `/favicon-16x16.png` e `/favicon-32x32.png` (root del sito) ma i file vivono
  sotto `/favicon/` → quei due `<link>` sono 404 oggi. Raccomandazione: rimuovi le
  due entry e affidati alle convenzioni App Router già presenti
  (`app/favicon.ico`, `app/icon.svg`, `app/apple-icon.png`).
- `public/sw.js`: **NON toccare** (whitelist).

## Validazione finale

1. `npx tsc --noEmit`
2. Suite d'area: `npx vitest run __tests__/dashboardOverviewService.test.ts` (la
   catena expenseStats confina con l'overview) + suite completa `npx vitest run`
3. `npm run build`
4. Smoke: pagina Impostazioni (per il punto C), tab Tracciamento Cashflow (per
   ExpenseCard), landing/login (favicon)
5. `npx knip`: i file di questa spec non devono più comparire

## Prompt per la sessione di implementazione

```
Implementa la spec docs/dead-code/01-file-orfani-hook-e-dipendenze.md (audit
codice morto, sessione 1 di 6). Segui la spec alla lettera: cancellazioni di
file orfani, catene collaterali atomiche (sez. B), decisione consigliata per
SettingsPageSkeleton (Opzione A), dipendenze npm e asset public/.

Regole:
- Prima di ogni cancellazione ri-esegui il grep di verifica come da protocollo in
  docs/dead-code/README.md (usa --hidden per .storybook)
- Un commit convenzionale per sezione (A..G); branch chore/dead-code-01-orfani
- npx tsc --noEmit dopo ogni sezione; vitest completa + npm run build alla fine
- Niente refactor opportunistici fuori spec

Contesto:
- Leggi docs/dead-code/README.md (protocollo condiviso e whitelist)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente, known issues)
- Leggi COMMENTS.md e APPLICALA mentre scrivi codice
- Leggi DEVELOPMENT_GUIDELINES.md e APPLICALA mentre scrivi codice

Crea SESSION_NOTES.md per tracciare il lavoro.
```

**Modello consigliato: Sonnet 5 · Effort: medium.** Lavoro meccanico con catene
già spellate; la rete tsc/vitest/build copre gli errori. Non serve un modello
maggiore.
