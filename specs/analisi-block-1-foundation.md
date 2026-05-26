# Block 1 — Foundation: Nuova Pagina Analisi + Migrazione + Hero KPI

**Obiettivo**: Estrarre il Tab Analisi da Cashflow in una pagina autonoma `app/dashboard/analisi/`, aggiornare la gerarchia visiva del blocco KPI (hero trio Trade Republic), correggere i bug minori presenti in AnalisiTab, aggiornare la navigazione in 3 file, rimuovere il tab da Cashflow.

**Prerequisiti**: nessuno (questo è il blocco di fondazione).  
**Output di questo blocco**: la pagina Analisi funziona al 100% con tutte le feature esistenti, ma come pagina standalone invece che tab.

---

## File da creare

### 1. `app/dashboard/analisi/page.tsx` (NUOVO)

Page component che:
- Usa `'use client'` directive
- Importa `useAuth` da `@/contexts/AuthContext`
- Importa `useExpenses`, `useExpenseCategories` da `@/lib/hooks/useExpenses`
- Importa `getSettings` da `@/lib/services/assetAllocationService`
- Importa `AnalisiTab` da `@/components/cashflow/AnalisiTab`
- Gestisce il proprio stato per `cashflowHistoryStartYear` (same loading logic del Cashflow page — `useEffect` + `getSettings`, fallback a `new Date().getFullYear() - 1`)
- Gestisce `handleRefresh` con `queryClient.invalidateQueries` su `queryKeys.expenses.all(user?.uid || '')`

**Struttura della page:**
```tsx
export default function AnalisiPage() {
  // auth, expenses, categories — same pattern as cashflow page
  // cashflowHistoryStartYear state + getSettings effect (copy from cashflow page)
  
  return (
    <div className="space-y-6 max-desktop:portrait:pb-20">
      {/* Header — pattern standard delle altre pagine */}
      <div className="border-b border-border pb-4">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Analisi
        </p>
        <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">
          Analisi Cashflow
        </h1>
        <p className="mt-2 text-muted-foreground">
          Distribuzione delle spese, pattern e trend nel tempo
        </p>
      </div>

      <AnalisiTab
        allExpenses={allExpenses}
        loading={expensesLoading}
        onRefresh={handleRefresh}
        historyStartYear={cashflowHistoryStartYear}
      />
    </div>
  );
}
```

**Note implementative:**
- Il loading skeleton di AnalisiTab è gestito internamente al componente (vedere sezione modifiche AnalisiTab)
- `handleRefresh` invalida solo `queryKeys.expenses.all(uid)` — NON `queryKeys.expenses.categories` (le categorie non cambiano durante un refresh manuale dei dati)
- Il pattern `getSettings` per `cashflowHistoryStartYear` è identico a quello in `app/dashboard/cashflow/page.tsx` — copialo letteralmente, NON creare una nuova astrazione

---

## File da modificare

### 2. `components/cashflow/AnalisiTab.tsx`

#### 2a. Fix: sostituire `ITALIAN_MONTHS` inline con `MONTH_NAMES` da constants

**Rimuovere** (righe 67-70):
```tsx
const ITALIAN_MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];
```

**Aggiungere** all'import block in cima:
```tsx
import { MONTH_NAMES } from '@/lib/constants/months.ts';
```

Sostituire tutte le occorrenze di `ITALIAN_MONTHS` con `MONTH_NAMES` nel file (sia nel Select dei mesi che nel `periodLabel`).

**Verificare**: `MONTH_NAMES` in `lib/constants/months.ts` è un array di 12 stringhe indicizzato 0-11 (Gennaio=0). L'uso esistente di `ITALIAN_MONTHS[selectedMonth - 1]` diventa `MONTH_NAMES[selectedMonth - 1]` — invariato.

#### 2b. Fix: sostituire `isMobile` con `useMediaQuery`

**Rimuovere** il `useState<boolean>` + `useEffect` per `isMobile` (righe ~220-240):
```tsx
// RIMUOVERE questo blocco:
const [isMobile, setIsMobile] = useState(false);
useEffect(() => {
  const media = window.matchMedia('(max-width: 639px)');
  const handleChange = () => setIsMobile(media.matches);
  handleChange();
  media.addEventListener('change', handleChange);
  return () => media.removeEventListener('change', handleChange);
}, []);
```

**Sostituire con:**
```tsx
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
// ...
const isMobile = useMediaQuery('(max-width: 639px)');
```

**Nota**: `useMediaQuery` in questo progetto inizializza con il valore reale di `window.matchMedia` (non `false`) perché tutti i caller sono `'use client'` post-login (vedere AGENTS.md — "useMediaQuery — Mobile Re-render Trap").

#### 2c. Upgrade: Hero KPI trio (Trade Republic hierarchy)

**Sostituire** il blocco KPI esistente (grid 2-col / 4-col con card box separate) con un hero trio flat.

Il blocco attuale (attorno alla riga 826):
```tsx
{/* ── KPI block ─────────────────────────────────────────────────── */}
<div className="grid gap-4 grid-cols-2 desktop:grid-cols-4">
  {/* Entrate card, Spese card, Risparmio card, Tasso card */}
</div>
```

**Nuovo blocco:**
```tsx
{/* ── Hero KPI trio ─────────────────────────────────────────────── */}
{/* Three dominant metrics in flat 3-col layout (Trade Republic hierarchy).
    Savings rate sits below Risparmio as a secondary metric, not a 4th column. */}
<div className="grid grid-cols-3 gap-px bg-border rounded-xl overflow-hidden">
  {/* Entrate */}
  <div className="bg-card px-4 py-4 desktop:px-6 desktop:py-5 space-y-1">
    <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
      Entrate
    </p>
    <p className="text-2xl desktop:text-4xl font-bold font-mono text-foreground tabular-nums">
      {formatCurrency(totalIncome)}
    </p>
  </div>

  {/* Spese */}
  <div className="bg-card px-4 py-4 desktop:px-6 desktop:py-5 space-y-1">
    <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
      Spese
    </p>
    <p className="text-2xl desktop:text-4xl font-bold font-mono text-foreground tabular-nums">
      {formatCurrency(Math.abs(totalExpenses))}
    </p>
  </div>

  {/* Risparmio + tasso */}
  <div className="bg-card px-4 py-4 desktop:px-6 desktop:py-5 space-y-1">
    <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
      Risparmio
    </p>
    <p className={cn(
      'text-2xl desktop:text-4xl font-bold font-mono tabular-nums',
      netBalance >= 0 ? 'text-foreground' : 'text-destructive'
    )}>
      {formatCurrency(netBalance)}
    </p>
    {totalIncome > 0 && (
      <p className={cn(
        'text-xs font-medium font-mono',
        ratio >= 20
          ? 'text-emerald-600 dark:text-emerald-400'
          : ratio >= 10
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-destructive'
      )}>
        {ratio >= 0 ? `${ratio.toFixed(1)}% risparmiato` : 'Deficit'}
      </p>
    )}
  </div>
</div>
```

**Note sul colore savings rate:**
- ≥ 20% → emerald (verde, obiettivo buono)
- 10–19% → amber (warning)
- < 10% o negativo → destructive (rosso)
- `ratio` è già calcolato con `calculateIncomeExpenseRatio` — verificare che restituisca una percentuale (0–100 range), non 0–1

**`formatCurrency` note**: usare la funzione già importata da `@/lib/services/chartService`. Non la `cachedFormatCurrencyEUR` da formatters — quella è per l'overview, non per il cashflow.

#### 2d. Upgrade: Framer Motion layoutId sul period pill

Il period pill attuale usa plain `<button>` senza Framer Motion. Aggiungere il pattern standard del progetto:

**Sostituire** il `<button>` per ogni tab con:
```tsx
<div
  role="tablist"
  aria-label="Periodo di analisi"
  className="inline-flex items-center gap-1 rounded-full bg-muted p-1"
>
  {([
    ['current', 'Anno Corrente'],
    ['year', 'Anno'],
    ['history', 'Storico'],
  ] as [PeriodMode, string][]).map(([mode, label]) => (
    <button
      key={mode}
      type="button"           // ← AGENTS.md: sempre type="button"
      role="tab"
      aria-selected={periodMode === mode}
      onClick={() => handlePeriodModeChange(mode)}
      className={cn(
        'relative px-3 py-1.5 text-sm font-medium rounded-full transition-colors',
        periodMode !== mode && 'text-muted-foreground hover:text-foreground'
      )}
    >
      {periodMode === mode && (
        <motion.span
          layoutId="analisi-period-pill"
          className="absolute inset-0 rounded-full bg-background shadow-sm"
          transition={{ type: 'spring', stiffness: 400, damping: 35 }}
        />
      )}
      <span className="relative z-10">{label}</span>
    </button>
  ))}
</div>
```

**Nota**: `motion` è già importato da `framer-motion` nel file.

#### 2e. Aggiungere skeleton loading interno

Aggiungere uno skeleton strutturale all'inizio del return di `AnalisiTab`, che si attiva quando `loading === true` E `periodFilteredExpenses.length === 0` (distingue loading iniziale da re-fetch con dati già presenti).

```tsx
// Show structural skeleton only on initial load (no data yet)
if (loading && allExpenses.length === 0) {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Period selector placeholder */}
      <div className="h-9 w-64 rounded-full bg-muted" />
      
      {/* Hero KPI trio */}
      <div className="grid grid-cols-3 gap-px bg-border rounded-xl overflow-hidden">
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-card px-4 py-4 desktop:px-6 desktop:py-5 space-y-2">
            <div className="h-3 w-16 rounded bg-muted" />
            <div className="h-8 w-28 rounded bg-muted" />
          </div>
        ))}
      </div>

      {/* Sankey placeholder */}
      <div className="h-64 rounded-xl bg-muted" />

      {/* Charts placeholder */}
      <div className="grid grid-cols-1 desktop:grid-cols-2 gap-4">
        <div className="h-48 rounded-xl bg-muted" />
        <div className="h-48 rounded-xl bg-muted" />
      </div>
    </div>
  );
}
```

**Collocare** questo blocco DOPO tutti i `useMemo` e hook (regola React: hooks prima di ogni early return).

---

### 3. `app/dashboard/cashflow/page.tsx`

#### 3a. Rimuovere il tab Analisi dall'array CASHFLOW_TABS_BASE

**Trovare e modificare** (attorno alla riga 51):
```tsx
// PRIMA
const CASHFLOW_TABS_BASE = [
  { value: 'tracking',  label: 'Tracciamento', mobileLabel: 'Spese',    icon: Receipt   },
  { value: 'dividends', label: 'Dividendi',    mobileLabel: 'Dividendi', icon: Coins     },
  { value: 'analisi',   label: 'Analisi',      mobileLabel: 'Analisi',   icon: BarChart3 },
  { value: 'budget',    label: 'Budget',       mobileLabel: 'Budget',    icon: Target    },
];

// DOPO
const CASHFLOW_TABS_BASE = [
  { value: 'tracking',  label: 'Tracciamento', mobileLabel: 'Spese',    icon: Receipt  },
  { value: 'dividends', label: 'Dividendi',    mobileLabel: 'Dividendi', icon: Coins    },
  { value: 'budget',    label: 'Budget',       mobileLabel: 'Budget',    icon: Target   },
];
```

#### 3b. Rimuovere il TabsContent per analisi

**Trovare e rimuovere** il blocco (attorno alle righe 270-285):
```tsx
{mountedTabs.has('analisi') && (
  <TabsContent value="analisi" forceMount>
    <motion.div
      initial={false}
      animate={activeTab === 'analisi' ? 'visible' : 'hidden'}
      variants={tabPanelSwitch}
    >
      <AnalisiTab
        allExpenses={allExpenses}
        loading={loading}
        onRefresh={handleRefresh}
        historyStartYear={cashflowHistoryStartYear}
      />
    </motion.div>
  </TabsContent>
)}
```

#### 3c. Rimuovere import di AnalisiTab

Rimuovere:
```tsx
import { AnalisiTab } from '@/components/cashflow/AnalisiTab';
```

#### 3d. Rimuovere import di BarChart3 se non più usato

Verificare se `BarChart3` è ancora usato dopo la rimozione del tab. Se non lo è, rimuoverlo dall'import di `lucide-react`.

#### 3e. Mantenere cashflowHistoryStartYear

`cashflowHistoryStartYear` rimane nel Cashflow page perché è ancora usato da `BudgetTab`. NON rimuoverlo.

#### 3f. Aggiornare la descrizione della page header

La descrizione attuale include "analizza" che ora si riferisce alla nuova pagina. Aggiornare:
```tsx
// PRIMA
<p className="mt-2 text-muted-foreground">
  Traccia e analizza le tue entrate e uscite nel tempo
</p>

// DOPO
<p className="mt-2 text-muted-foreground">
  Traccia entrate, uscite e gestisci il budget mensile
</p>
```

---

### 4. `components/layout/SecondaryMenuDrawer.tsx`

#### 4a. Aggiungere BarChart3 all'import da lucide-react

Trovare il blocco import di lucide-react e aggiungere `BarChart3`:
```tsx
import {
  PieChart,
  History,
  Trophy,
  Flame,
  Settings,
  TrendingUp,
  LogOut,
  MoreVertical,
  Sun,
  Moon,
  Monitor,
  BarChart3,  // ← aggiungere
} from 'lucide-react';
```

#### 4b. Aggiungere Analisi all'array analisiNav

```tsx
// PRIMA
const analisiNav: NavEntry[] = [
  { name: 'Allocazione', href: '/dashboard/allocation',   icon: PieChart    },
  { name: 'Rendimenti',  href: '/dashboard/performance',  icon: TrendingUp  },
  { name: 'Storico',     href: '/dashboard/history',      icon: History     },
  { name: 'Hall of Fame',href: '/dashboard/hall-of-fame', icon: Trophy      },
];

// DOPO (Analisi inserito PRIMA di Allocazione — è la porta d'ingresso all'analisi)
const analisiNav: NavEntry[] = [
  { name: 'Analisi',     href: '/dashboard/analisi',      icon: BarChart3   },
  { name: 'Allocazione', href: '/dashboard/allocation',   icon: PieChart    },
  { name: 'Rendimenti',  href: '/dashboard/performance',  icon: TrendingUp  },
  { name: 'Storico',     href: '/dashboard/history',      icon: History     },
  { name: 'Hall of Fame',href: '/dashboard/hall-of-fame', icon: Trophy      },
];
```

**Nota sulla posizione**: Analisi va PRIMA di Allocazione perché è operativa (dove vado a guardare le spese ogni mese), mentre Allocazione è strategica.

---

### 5. `components/layout/BottomNavigation.tsx`

#### 5a. Aggiungere `/dashboard/analisi` a secondaryHrefs

```tsx
// PRIMA
const secondaryHrefs = [
  '/dashboard/allocation',
  '/dashboard/performance',
  '/dashboard/history',
  ...(process.env.NEXT_PUBLIC_ASSISTANT_AI_ENABLED !== 'false' ? ['/dashboard/assistant'] : []),
  '/dashboard/hall-of-fame',
  '/dashboard/fire-simulations',
  '/dashboard/settings',
];

// DOPO
const secondaryHrefs = [
  '/dashboard/analisi',         // ← aggiungere (prima di allocation)
  '/dashboard/allocation',
  '/dashboard/performance',
  '/dashboard/history',
  ...(process.env.NEXT_PUBLIC_ASSISTANT_AI_ENABLED !== 'false' ? ['/dashboard/assistant'] : []),
  '/dashboard/hall-of-fame',
  '/dashboard/fire-simulations',
  '/dashboard/settings',
];
```

**Perché**: AGENTS.md dice che `secondaryHrefs` in BottomNavigation deve restare sincronizzato con `navigationGroups` hrefs in SecondaryMenuDrawer.

---

### 6. `components/layout/Sidebar.tsx`

#### 6a. Aggiungere BarChart3 all'import da lucide-react

```tsx
import {
  // ... esistenti
  BarChart3,  // ← aggiungere
} from 'lucide-react';
```

#### 6b. Aggiungere Analisi all'analisiNav (array locale del Sidebar)

```tsx
// PRIMA (attorno alle righe 67-70)
{ name: 'Allocazione',  href: '/dashboard/allocation',   icon: PieChart   },
{ name: 'Rendimenti',   href: '/dashboard/performance',  icon: TrendingUp },
{ name: 'Storico',      href: '/dashboard/history',      icon: History    },
{ name: 'Hall of Fame', href: '/dashboard/hall-of-fame', icon: Trophy     },

// DOPO
{ name: 'Analisi',      href: '/dashboard/analisi',      icon: BarChart3  },
{ name: 'Allocazione',  href: '/dashboard/allocation',   icon: PieChart   },
{ name: 'Rendimenti',   href: '/dashboard/performance',  icon: TrendingUp },
{ name: 'Storico',      href: '/dashboard/history',      icon: History    },
{ name: 'Hall of Fame', href: '/dashboard/hall-of-fame', icon: Trophy     },
```

---

## Verifiche post-implementazione

1. **TypeScript**: `npx tsc --noEmit` — nessun errore
2. **Test cashflow**: `npx vitest run __tests__/budgetUtils` — deve passare (BudgetTab non è toccato)
3. **Navigazione**: cliccando "Analisi" nel drawer / sidebar si arriva a `/dashboard/analisi`
4. **Cashflow**: il tab "Analisi" non appare più nella pagina Cashflow
5. **Hero KPI**: i 3 valori mostrano font-mono, tasso di risparmio con colore semantico
6. **Period pill**: il Framer Motion spring anima tra i 3 stati
7. **Mobile**: la pagina è visitabile dal drawer "Altro" nel bottom nav
8. **`isMobile`**: nessun effetto di re-render indesiderato al mount (verificare con React DevTools)

---

## Prompt di implementazione (Block 1)

```
Implementa il Block 1 della nuova pagina Analisi seguendo la specifica in `specs/analisi-block-1-foundation.md`.

Prima di iniziare:
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- Leggi CLAUDE.md (stato corrente del progetto)
- Leggi COMMENTS.md e applicala mentre scrivi codice (commenti why, non what)
- Leggi DEVELOPMENT_GUIDELINES.md e applicala (layer separation, naming, single responsibility)
- Leggi `specs/analisi-block-1-foundation.md` (questa spec — guida l'intera implementazione)

Scope esatto di questo blocco:
1. Crea `app/dashboard/analisi/page.tsx` — pagina standalone con data fetching proprio
2. Modifica `components/cashflow/AnalisiTab.tsx` — 4 interventi: (a) MONTH_NAMES import, (b) useMediaQuery, (c) hero KPI trio, (d) Framer Motion period pill, (e) skeleton loading
3. Modifica `app/dashboard/cashflow/page.tsx` — rimuovi tab analisi, import AnalisiTab, BarChart3 se non usato, aggiorna descrizione header
4. Modifica `components/layout/SecondaryMenuDrawer.tsx` — aggiungi Analisi a analisiNav con BarChart3 icon
5. Modifica `components/layout/BottomNavigation.tsx` — aggiungi /dashboard/analisi a secondaryHrefs
6. Modifica `components/layout/Sidebar.tsx` — aggiungi Analisi a analisiNav con BarChart3 icon

Non implementare nessuna feature delle sezioni Block 2, 3, 4 (anomalie, YoY, trend) — solo foundation.

Al termine, esegui `npx tsc --noEmit` e riporta l'output.
```
