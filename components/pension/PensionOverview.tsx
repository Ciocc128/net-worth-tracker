'use client';

/**
 * PensionOverview — body of the dedicated `/dashboard/pension` view.
 *
 * Three chapters, separated by the page-level `border-t border-border/40` rule:
 *
 *  1. **Il fondo oggi** — no time axis. Hero (total value of ALL `pensionFund` assets + total ever
 *     contributed, a net-worth figure) beside the fund's return summary. The return's full
 *     decomposition sits in a collapsible below: it is the densest block on the page and the answer
 *     ("did the market do anything for me") is already in the summary.
 *  2. **Anno fiscale {Y}** — everything on the year axis: contributions split by nature, and ONE tax
 *     recap card PER family member with >=1 linked fund (the IRPEF deduction ceiling is per
 *     taxpayer, not per account, so summing every fund's contributions against one RAL would be
 *     wrong for a household tracking more than one person's fund). Family members + their
 *     RAL/eligibility are edited in Impostazioni → Preferenze → Famiglia; a fund is linked to a
 *     member from its own edit dialog in Patrimonio. Funds with no member (or a stale one) get a
 *     prompt instead of a number — never silently folded into someone else's calculation.
 *  3. **Storico versamenti {Y}** — the selected year's contributions with 2-click delete (reverses
 *     the value/transfer effect — invariant #5).
 *
 * The year axis governs chapters 2 and 3 only. The fund's value and its market return are not
 * annual quantities: value is a running total and the return has its own trust-derived window
 * (`resolvePensionReturnStart`), so putting them under the selector would invent a period they
 * don't have. It also disambiguates the page's three "versato" figures, which previously sat on
 * three different windows with no visible axis to tell them apart.
 *
 * OGNI CAPITOLO PORTA IL PROPRIO TITOLO, un gradino tipografico sopra le card che contiene
 * (`CHAPTER_TITLE_CLASS` vs `EYEBROW_CLASS`): con lo stesso eyebrow da 10px su entrambi i livelli la
 * struttura esisteva solo nell'albero dei heading.
 *
 * NIENTE ZERI CHE NON SONO STATI LETTI. Le quattro query defaultano tutte a `[]`, quindi lo skeleton
 * le aspetta tutte e quattro (non solo le due che decidono l'empty state) e ogni blocco che dipende
 * da una query fallita viene sostituito da `PensionErrorNotice`, mai renderizzato a zero: su questa
 * pagina uno zero è un'affermazione, e «versato 0,00 €» è indistinguibile da un anno senza versamenti.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, ChevronDown, PiggyBank, Trash2, Users } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useAssets } from '@/lib/hooks/useAssets';
import { calculateAssetValue } from '@/lib/services/assetService';
import { getSettings } from '@/lib/services/assetAllocationService';
import { usePensionContributions, useDeletePensionContribution } from '@/lib/hooks/usePensionContributions';
import {
  derivePensionContributionsByYearAndNature,
  derivePensionContributionYears,
  derivePensionDeductibleByYear,
  resolveActivePensionYear,
} from '@/lib/utils/pensionContributions';
import { groupFundsByFamilyMember } from '@/lib/utils/pensionFamilyMembers';
import { computePensionTaxRecap, getPensionDeductionCeiling, type PensionTaxRecap } from '@/lib/utils/pensionDeduction';
import {
  buildPensionValueSeries,
  computePensionReturn,
  isPensionReturnMeasurable,
  resolvePensionReturnStart,
  type PensionReturnResult,
} from '@/lib/utils/pensionReturn';
import { calculateProgressiveTax, normalizeCoastFireTaxBrackets } from '@/lib/services/fireService';
import { getUserSnapshots } from '@/lib/services/snapshotService';
import { queryKeys } from '@/lib/query/queryKeys';
import type { ContributionSource, PensionContribution } from '@/types/pension';
import type { FamilyMember, MonthlySnapshot } from '@/types/assets';
import type { Settings } from '@/types/settings';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { getMetricValueColor, signTextClass } from '@/lib/utils/metricColors';
import { getItalyYear } from '@/lib/utils/dateHelpers';
import { MONTH_NAMES } from '@/lib/constants/months';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { Collapsible, CollapsibleTrigger } from '@/components/ui/collapsible';

/** Eyebrow label above a dominant number (DESIGN.md §3). */
const EYEBROW_CLASS = 'text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground';

/**
 * Titolo di CAPITOLO — il livello Title di DESIGN.md §3, un gradino sopra l'eyebrow delle card.
 *
 * I capitoli e le card che contengono avevano entrambi l'eyebrow da 10px: la struttura a tre
 * capitoli esisteva per lo screen reader (`h2`/`h3`) e non per l'occhio, e l'unico segnale che
 * «Anno fiscale 2026» contenesse «Risparmio IRPEF · Marco» era il filo del `border-t`. La forma
 * segue la funzione: due livelli di contenimento, due livelli tipografici.
 */
const CHAPTER_TITLE_CLASS = 'text-[15px] font-semibold tracking-[-0.01em] text-foreground';

/**
 * Il numero grammaticale delle frasi che hanno il fondo come SOGGETTO.
 *
 * Un household può tracciare il fondo di due persone (è il motivo per cui il recap fiscale è già
 * per contribuente), e sopra due fondi «Il fondo oggi» legge come un errore. Riguarda solo i punti
 * in cui il fondo è il soggetto: «Valore attuale» e «Versato totale» restano invariati perché sono
 * grandezze aggregate, non il fondo.
 */
function fundNoun(many: boolean): { chapter: string; ofTheFund: string } {
  return many
    ? { chapter: 'I fondi oggi', ofTheFund: 'dei fondi' }
    : { chapter: 'Il fondo oggi', ofTheFund: 'del fondo' };
}

/** 'YYYY-MM' → "Nov 2025", per le etichette di finestra. */
function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return `${MONTH_NAMES[month - 1]?.slice(0, 3) ?? month} ${year}`;
}

/** Percentuale con segno esplicito: il "+" comunica quanto il "−". */
function formatSignedPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

const NATURE_ROWS: { key: ContributionSource; label: string; hint: string }[] = [
  { key: 'voluntary', label: 'Volontario', hint: 'deducibile · trasferito dal conto' },
  { key: 'employer', label: 'Datoriale', hint: 'deducibile · non transita dal conto' },
  { key: 'tfr', label: 'TFR', hint: 'non deducibile' },
];

const SOURCE_LABEL: Record<ContributionSource, string> = {
  voluntary: 'Volontario',
  employer: 'Datoriale',
  tfr: 'TFR',
};

/** One "Beneficio fiscale" card for a single family member, fed by THEIR OWN filtered contributions. */
function PensionTaxRecapCard({
  member,
  memberContributions,
  taxYear,
}: {
  member: FamilyMember;
  memberContributions: PensionContribution[];
  taxYear: number;
}) {
  const deductibleByYear = derivePensionDeductibleByYear(memberContributions);
  const byYearNature = derivePensionContributionsByYearAndNature(memberContributions);
  const tfrThisYear = byYearNature[taxYear]?.tfr ?? 0;

  // Same fallback logic the old single-account calculation used, but scoped to THIS member's own
  // contribution history — reusing the account-wide map here would leak one person's years into
  // another's plafond fold.
  const enrollmentYear = (() => {
    if (member.firstEmploymentYear) return member.firstEmploymentYear;
    const years = Object.keys(deductibleByYear).map(Number);
    return years.length > 0 ? Math.min(...years) : taxYear;
  })();

  const ralNumber = member.grossAnnualIncome ?? 0;
  const brackets = normalizeCoastFireTaxBrackets(undefined);
  const recap: PensionTaxRecap = computePensionTaxRecap(
    {
      targetYear: taxYear,
      enrollmentYear,
      isFirstJobPost2007: member.isFirstEmploymentPost2007 ?? false,
      deductibleContribByYear: deductibleByYear,
    },
    ralNumber,
    (income) => calculateProgressiveTax(income, brackets)
  );
  const { state, taxSaving } = recap;
  const showPlafond = (member.isFirstEmploymentPost2007 ?? false) && (state.isAccrualYear || state.isUsageYear);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-[22px]">
      <h3 className={EYEBROW_CLASS}>Risparmio IRPEF · {member.name}</h3>

      {/* The page's answer, at section-hero scale: everything below explains how it was reached. */}
      <p className="mt-2 font-mono text-[36px] font-bold leading-none tracking-[-0.03em] tabular-nums text-foreground">
        {ralNumber > 0 ? `~${cachedFormatCurrencyEUR(taxSaving)}` : '—'}
      </p>

      {ralNumber > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          stimato sui contributi deducibili {taxYear}
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Imposta la RAL di {member.name} in{' '}
          <Link href="/dashboard/settings" className="text-primary underline hover:no-underline">
            Impostazioni → Preferenze → Famiglia
          </Link>{' '}
          per stimare il risparmio IRPEF.
        </p>
      )}

      <div className="mt-5 divide-y divide-border/60">
        <div className="flex items-baseline justify-between gap-3 py-2">
          <span className="text-sm text-foreground">
            Contributi deducibili {taxYear}
            <span className="ml-2 text-[11px] text-muted-foreground">volontario + datoriale</span>
          </span>
          <span className="font-mono text-sm tabular-nums text-foreground">
            {cachedFormatCurrencyEUR(state.deductedThisYear)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3 py-2">
          <span className="text-sm text-muted-foreground">
            TFR versato <span className="text-[11px]">non deducibile, escluso</span>
          </span>
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            {cachedFormatCurrencyEUR(tfrThisYear)}
          </span>
        </div>
      </div>

      {/* Sub-tile Variante A (DESIGN.md §5): il bordo della Variante B è riservato ai pannelli di
          parametri dentro un collapsible — qui il blocco è sempre visibile e il tint basta. */}
      {showPlafond && (
        <div className="mt-auto space-y-2 rounded-xl bg-muted/40 p-3.5">
          <h4 className={EYEBROW_CLASS}>Plafond deducibilità</h4>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs text-muted-foreground">Plafond creato quest&apos;anno</span>
            <span className="font-mono text-xs tabular-nums text-foreground">
              {cachedFormatCurrencyEUR(state.plafondCreatedThisYear)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs text-muted-foreground">Plafond residuo recuperabile</span>
            <span className="font-mono text-xs tabular-nums text-foreground">
              {cachedFormatCurrencyEUR(state.accruedPlafondResidual)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              Extra deducibile {taxYear} oltre {cachedFormatCurrencyEUR(getPensionDeductionCeiling(taxYear))}
            </span>
            <span className="font-mono text-xs tabular-nums text-foreground">
              {cachedFormatCurrencyEUR(state.extraAvailableThisYear)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * "Rendimento del fondo" — the summary half of the growth decomposition.
 *
 * Il valore di un fondo pensione sale per tre motivi che non sono la stessa cosa (versamenti tuoi,
 * regalo del datore, mercato). Questa card risponde alla domanda — quanto ha fatto il mercato — con
 * il TWR, l'unico numero confrontabile con un ETF; le righe in euro che lo spiegano stanno nel
 * blocco "Da dove viene la crescita" qui sotto. Quando i versamenti registrati non bastano a
 * giustificare la crescita, il TWR viene dichiarato inattendibile invece di essere mostrato come un
 * risultato: vedi `isCoverageSuspicious` in lib/utils/pensionReturn.ts.
 */
function PensionReturnSummaryCard({
  result,
  hasStartMonth,
  manyFunds,
}: {
  result: PensionReturnResult;
  hasStartMonth: boolean;
  manyFunds: boolean;
}) {
  const showReturn = isPensionReturnMeasurable(result);
  const { ofTheFund } = fundNoun(manyFunds);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-[22px]">
      <h3 className={EYEBROW_CLASS}>Rendimento {ofTheFund}</h3>
      <p className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
        {formatMonthLabel(result.windowStart)} → {formatMonthLabel(result.windowEnd)}
      </p>

      {showReturn ? (
        <>
          <p
            className={cn(
              'mt-3 font-mono text-[36px] font-bold leading-none tracking-[-0.03em] tabular-nums',
              getMetricValueColor(result.twr, 'percentage')
            )}
          >
            {formatSignedPercent(result.twr)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {result.annualizedTwr === null
              ? `Su ${result.monthsCovered} ${result.monthsCovered === 1 ? 'mese' : 'mesi'}: troppo pochi per annualizzare.`
              : `${formatSignedPercent(result.annualizedTwr)} annualizzato, al netto dei versamenti.`}
          </p>
          <div className="mt-auto flex items-baseline justify-between gap-3 border-t border-border/60 pt-3">
            <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
              Guadagno di mercato
            </span>
            <span className={cn('font-mono text-sm font-semibold tabular-nums', signTextClass(result.marketGain))}>
              {cachedFormatCurrencyEUR(result.marketGain)}
            </span>
          </div>
        </>
      ) : result.hasNoMovement ? (
        <p className="mt-3 rounded-xl bg-muted/40 p-3.5 text-xs text-muted-foreground">
          Da {formatMonthLabel(result.windowStart)} il valore {ofTheFund} non si è ancora mosso e non
          risultano versamenti registrati dopo quel mese: non c&apos;è ancora niente da misurare. La
          prima misura arriva quando aggiorni «Valore attuale» col prossimo estratto conto.
        </p>
      ) : (
        <p className="mt-3 rounded-xl bg-muted/40 p-3.5 text-xs text-muted-foreground">
          {manyFunds ? 'I fondi sono cresciuti' : 'Il fondo è cresciuto'} di{' '}
          {cachedFormatCurrencyEUR(result.valueGrowth)} ma risultano
          registrati solo {cachedFormatCurrencyEUR(result.contributions.total)} di versamenti: la
          differenza verrebbe letta come rendimento di mercato, e non lo è. Registra i versamenti
          mancanti
          {hasStartMonth ? (
            '.'
          ) : (
            <>
              , oppure indica da quale mese il calcolo è affidabile in{' '}
              <Link href="/dashboard/settings" className="text-primary underline hover:no-underline">
                Impostazioni → Preferenze
              </Link>
              .
            </>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * The euro-by-euro decomposition behind the TWR — dense, and therefore behind a disclosure.
 *
 * Renderizzato SOLO quando `isPensionReturnMeasurable(result)`: ogni riga qui sotto presuppone che
 * la finestra sia una misura. Il filtro sta nel chiamante e non qui perché il blocco non ha uno
 * stato degradato sensato — senza una misura non c'è una scomposizione da mostrare, c'è la
 * spiegazione che la card di riepilogo sta già dando.
 */
function PensionReturnBreakdown({ result }: { result: PensionReturnResult }) {
  return (
    <div className="px-[22px] pb-[22px]">
      <div className="divide-y divide-border/60 border-t border-border/60">
        <div className="flex items-baseline justify-between gap-3 py-2">
          <span className="text-sm text-foreground">
            Crescita del valore
            <span className="ml-2 text-[11px] text-muted-foreground">versamenti inclusi</span>
          </span>
          <span className="font-mono text-sm tabular-nums text-foreground">
            {cachedFormatCurrencyEUR(result.valueGrowth)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3 py-2">
          <span className="text-sm text-muted-foreground">
            Versamenti registrati{' '}
            <span className="text-[11px]">
              volontario {cachedFormatCurrencyEUR(result.contributions.voluntary)} · TFR{' '}
              {cachedFormatCurrencyEUR(result.contributions.tfr)}
            </span>
          </span>
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            −{cachedFormatCurrencyEUR(result.contributions.voluntary + result.contributions.tfr)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3 py-2">
          <span className="text-sm text-muted-foreground">
            Contributo datoriale <span className="text-[11px]">capitale ricevuto, non rendimento</span>
          </span>
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
            −{cachedFormatCurrencyEUR(result.contributions.employer)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3 py-2">
          <span className="text-sm font-medium text-foreground">Guadagno di mercato</span>
          <span className={cn('font-mono text-sm font-semibold tabular-nums', signTextClass(result.marketGain))}>
            {cachedFormatCurrencyEUR(result.marketGain)}
          </span>
        </div>
        {result.personalReturn !== null && (
          <div className="flex items-baseline justify-between gap-3 py-2">
            <span className="text-sm text-foreground">
              Ritorno sul tuo capitale
              <span className="ml-2 text-[11px] text-muted-foreground">
                mercato + datoriale, sul capitale che hai messo tu
              </span>
            </span>
            <span
              className={cn(
                'font-mono text-sm font-semibold tabular-nums',
                getMetricValueColor(result.personalReturn, 'percentage')
              )}
            >
              {formatSignedPercent(result.personalReturn)}
            </span>
          </div>
        )}
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground">
        Il rendimento isola il mercato: i versamenti spostano il valore, non la percentuale. Il
        contributo datoriale è retribuzione — contarlo come rendimento farebbe risultare il fondo a
        doppia cifra ogni anno. Il risparmio IRPEF, la terza componente di quanto ti conviene il
        fondo, è nel capitolo «Anno fiscale».
      </p>
    </div>
  );
}

/** Prompt shown instead of a recap when a fund has no (valid) family member linked. */
function UnassignedFundsCard({ funds }: { funds: { id: string; name: string }[] }) {
  return (
    <div className="space-y-2 rounded-2xl border border-dashed border-border bg-muted/20 p-[22px]">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {/* h3 come le card pari-livello della griglia fiscale: è una di quelle, non una nota. */}
        <h3 className="text-sm font-medium text-foreground">Fondi non assegnati</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        {funds.map((f) => f.name).join(', ')} — collega ciascun fondo a un membro della famiglia
        dalla sua scheda in Patrimonio per calcolare il beneficio fiscale. Se non hai ancora
        membri configurati, aggiungine uno in{' '}
        <Link href="/dashboard/settings" className="text-primary underline hover:no-underline">
          Impostazioni → Preferenze → Famiglia
        </Link>
        .
      </p>
    </div>
  );
}

/**
 * Il compagno della card hero quando un rendimento non è ancora calcolabile.
 *
 * Esiste per una ragione di layout oltre che di onestà: la riga hero è `desktop:grid-cols-[2fr_1fr]`
 * e con un solo figlio a 1440px lasciava un terzo di riga bianco, senza che niente spiegasse il
 * vuoto — lo stato di OGNI fondo appena creato, finché il cron serale non scrive il primo snapshot
 * che lo contiene. Un capitolo che promette due card ne rende due; quella che non ha un numero dice
 * perché, come già fanno `hasNoMovement` e `isCoverageSuspicious` dall'altro lato.
 */
function PensionReturnPendingCard({
  hasValueSeries,
  startMonth,
  manyFunds,
}: {
  hasValueSeries: boolean;
  startMonth: string | null;
  manyFunds: boolean;
}) {
  const { ofTheFund } = fundNoun(manyFunds);
  const explanation = !hasValueSeries
    ? `Nessuna fotografia mensile dello storico contiene ancora ${manyFunds ? 'questi fondi' : 'questo fondo'}: la prima arriva col prossimo aggiornamento serale. Da lì servono due mesi di valori per calcolare un rendimento.`
    : startMonth
      ? `Serve un secondo mese dopo ${formatMonthLabel(startMonth)} per calcolare un rendimento: con un solo valore non c'è nulla da confrontare.`
      : 'Registra il primo versamento per iniziare a misurare il rendimento: prima di quello la crescita del fondo e i versamenti sono indistinguibili.';

  return (
    <div className="flex h-full flex-col rounded-2xl border border-dashed border-border bg-muted/20 p-[22px]">
      <h3 className={EYEBROW_CLASS}>Rendimento {ofTheFund}</h3>
      <p className="mt-2 text-xs text-muted-foreground">{explanation}</p>
    </div>
  );
}

/**
 * Un fetch fallito non è un insieme vuoto.
 *
 * Le quattro query della pagina defaultano a `[]`, quindi un errore di rete si presenterebbe come
 * «Nessun versamento registrato» e come zeri in `font-mono` — indistinguibili dal caso reale, e su
 * una pagina la cui tesi è "quando non so, lo dico" la conclusione dell'utente è che i dati sono
 * andati persi. Il blocco che dipende dai dati mancanti viene OMESSO e sostituito da questo.
 */
function PensionErrorNotice({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-2xl border border-border bg-card p-[22px]"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-sm text-foreground">{message}</p>
        <p className="text-xs text-muted-foreground">
          Ricarica la pagina per riprovare. I dati registrati non sono stati toccati.
        </p>
      </div>
    </div>
  );
}

/**
 * Section disclosure — Radix Collapsible for ARIA/keyboard, Framer Motion for the height animation
 * Radix alone can't do smoothly (DESIGN.md §5). Closed by default: everything behind one is
 * secondary by construction.
 */
function DisclosureSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-2xl border border-border bg-card"
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full cursor-pointer select-none items-center justify-between px-[22px] py-4 text-left"
        >
          <span className={EYEBROW_CLASS}>{title}</span>
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
              open && 'rotate-180'
            )}
            aria-hidden="true"
          />
        </button>
      </CollapsibleTrigger>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key={title}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: 'hidden' }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </Collapsible>
  );
}

/** Structural stand-in while assets/settings load — without it the page briefly claims the user
 *  owns no pension fund, which reads as data loss on the one screen about what they own. */
function PensionOverviewSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Caricamento previdenza">
      <div className="space-y-4">
        <Skeleton className="h-5 w-32" />
        <div className="grid gap-4 desktop:grid-cols-[2fr_1fr]">
          <div className="rounded-2xl border border-border bg-card p-[22px]">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-11 w-56" />
            <Skeleton className="mt-6 h-4 w-full" />
          </div>
          <div className="rounded-2xl border border-border bg-card p-[22px]">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="mt-3 h-9 w-28" />
            <Skeleton className="mt-6 h-4 w-full" />
          </div>
        </div>
      </div>
      <div className="space-y-4 border-t border-border/40 pt-4">
        <Skeleton className="h-5 w-40" />
        <div className="grid gap-4 desktop:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-[22px]">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-3 h-9 w-40" />
            <Skeleton className="mt-6 h-16 w-full" />
          </div>
          <div className="rounded-2xl border border-border bg-card p-[22px]">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="mt-3 h-9 w-40" />
            <Skeleton className="mt-6 h-16 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function PensionOverview() {
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const { data: assets = [], isLoading: assetsLoading, isError: assetsError } = useAssets(ownerId);
  const {
    data: contributions = [],
    isLoading: contributionsLoading,
    isError: contributionsError,
  } = usePensionContributions(ownerId);
  const {
    data: settings,
    isLoading: settingsLoading,
    isError: settingsError,
  } = useQuery<Settings | null>({
    queryKey: ['settings', ownerId],
    queryFn: () => getSettings(ownerId!),
    enabled: !!ownerId,
  });
  // Il rendimento del fondo si legge dagli snapshot mensili: sono l'unico posto dove il valore del
  // fondo è congelato mese per mese (l'asset porta solo il valore corrente).
  const {
    data: snapshots = [],
    isLoading: snapshotsLoading,
    isError: snapshotsError,
  } = useQuery<MonthlySnapshot[]>({
    queryKey: queryKeys.snapshots.all(ownerId || ''),
    queryFn: () => getUserSnapshots(ownerId!),
    enabled: !!ownerId,
  });
  const deleteMutation = useDeletePensionContribution(ownerId || '');

  const currentYear = getItalyYear(new Date());
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const funds = assets.filter((asset) => asset.type === 'pensionFund');
  const manyFunds = funds.length > 1;
  const { chapter: fundChapterTitle, ofTheFund } = fundNoun(manyFunds);
  const fundNameById = new Map(funds.map((f) => [f.id, f.name]));
  const totalFundValue = funds.reduce((sum, fund) => sum + calculateAssetValue(fund), 0);

  // The year axis is derived, so it survives a refetch that adds or removes a year without an
  // effect to keep the selection in sync — `resolveActivePensionYear` owns that reconciliation.
  const availableYears = derivePensionContributionYears(contributions, currentYear);
  const activeYear = resolveActivePensionYear(selectedYear, availableYears, currentYear);

  // Header stays aggregate across every fund/member — a net-worth figure, not a tax one. Only the
  // year chapter below needs the per-year and per-member splits.
  const byYearNature = derivePensionContributionsByYearAndNature(contributions);
  const activeYearNature = byYearNature[activeYear] ?? { tfr: 0, voluntary: 0, employer: 0 };
  const totalActiveYear = activeYearNature.tfr + activeYearNature.voluntary + activeYearNature.employer;
  const totalAllTime = Object.values(byYearNature).reduce(
    (sum, nature) => sum + nature.tfr + nature.voluntary + nature.employer,
    0
  );

  const familyMembers = settings?.familyMembers ?? [];
  const { matched, unassigned } = groupFundsByFamilyMember(funds, familyMembers);

  // Rendimento: aggregato su tutti i fondi (è una domanda di mercato, non fiscale — il beneficio
  // IRPEF resta l'unica cosa che va spezzata per contribuente).
  const pensionReturnStart = resolvePensionReturnStart(
    contributions,
    settings?.pensionReturnStartMonth
  );
  const pensionValueSeries = buildPensionValueSeries(snapshots, funds.map((fund) => fund.id));
  const pensionReturn = computePensionReturn(pensionValueSeries, contributions, pensionReturnStart);
  // Il rendimento va mostrato solo quando è una misura: nei due stati in cui non lo è, la card di
  // riepilogo dà la spiegazione E la scomposizione in euro sparisce con la percentuale — stampare
  // «Guadagno di mercato» sotto un avviso che dice che quella differenza NON è guadagno di mercato
  // contraddiceva l'avviso stesso.
  const showReturnBreakdown = !!pensionReturn && isPensionReturnMeasurable(pensionReturn);

  const yearContributions = contributions.filter((c) => c.taxYear === activeYear);

  // ── Storico versamenti — 2-click delete with 3s auto-disarm ─────────────────────────
  const [pendingDeleteId, setPendingDeleteId] = useState<string | undefined>(undefined);
  const [deleteAnnouncement, setDeleteAnnouncement] = useState('');
  const pendingDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
    };
  }, []);

  const handleDeleteClick = (contribution: PensionContribution) => {
    if (pendingDeleteId === contribution.id) {
      if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
      setPendingDeleteId(undefined);
      // L'esito lo annuncia il toast: lasciare qui il messaggio di armamento lo farebbe rileggere.
      setDeleteAnnouncement('');
      deleteMutation.mutate(contribution, {
        onSuccess: () => toast.success('Versamento eliminato'),
        onError: () => toast.error("Errore nell'eliminazione del versamento"),
      });
    } else {
      if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
      setPendingDeleteId(contribution.id);
      setDeleteAnnouncement(
        'Eliminazione armata: premi di nuovo per confermare. Si disarma da sola dopo 3 secondi.'
      );
      pendingDeleteTimerRef.current = setTimeout(() => {
        setPendingDeleteId(undefined);
        setDeleteAnnouncement('Eliminazione disarmata: il versamento non è stato eliminato.');
      }, 3000);
    }
  };

  // Tutte e QUATTRO le query, non solo le due che decidono l'empty state. Ognuna defaulta a `[]`, e
  // ognuna ha un numero che senza i suoi dati vale zero: «Versato totale 0,00 €» sotto un valore del
  // fondo corretto, «Versato nel {Y}» a 36px, «~0,00 €» di risparmio IRPEF — cioè l'unica risposta
  // che questa pagina produce, affermata prima di averla letta. `isLoading` (non `isPending`) è
  // falso su una query disabilitata, quindi uno `ownerId` assente non blocca lo skeleton per sempre.
  if (assetsLoading || settingsLoading || contributionsLoading || snapshotsLoading) {
    return <PensionOverviewSkeleton />;
  }

  // Senza asset o impostazioni non si sa nemmeno se l'utente possiede un fondo: qui l'errore è
  // bloccante, mentre versamenti e snapshot degradano per capitolo più sotto.
  if (assetsError || settingsError) {
    return (
      <PensionErrorNotice message="Non è stato possibile caricare i tuoi fondi pensione." />
    );
  }

  if (funds.length === 0) {
    return (
      <div className="space-y-3 rounded-2xl border border-border bg-card p-[22px] text-center">
        <PiggyBank className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-foreground">Nessun fondo pensione ancora tracciato.</p>
        <p className="text-xs text-muted-foreground">
          Crea un asset di tipo «Fondo Pensione» da Patrimonio per iniziare a registrare i versamenti
          e vedere qui il beneficio fiscale.
        </p>
        {/* `asChild`: un <Button> dentro un <Link> produce <a><button>, nesting non valido che
            espone due target sovrapposti all'albero di accessibilità. */}
        <Button asChild variant="outline" size="sm" className="mt-1">
          <Link href="/dashboard/assets">Vai a Patrimonio</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Il fondo oggi — nessun asse temporale ─────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className={CHAPTER_TITLE_CLASS}>{fundChapterTitle}</h2>

        <div className="grid gap-4 desktop:grid-cols-[2fr_1fr]">
          <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-[22px]">
            <h3 className={EYEBROW_CLASS}>Valore attuale</h3>
            <p className="mt-2 font-mono text-[44px] font-bold leading-none tracking-[-0.03em] tabular-nums text-foreground desktop:text-[54px]">
              {cachedFormatCurrencyEUR(totalFundValue)}
            </p>
            <div className="mt-auto flex items-center justify-between border-t border-border/60 pt-3">
              <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                Versato totale
              </span>
              <span className="font-mono text-sm tabular-nums text-foreground">
                {contributionsError ? '—' : cachedFormatCurrencyEUR(totalAllTime)}
              </span>
            </div>
          </div>

          {/* La colonna 1fr ha SEMPRE un occupante: o il rendimento, o l'errore che lo ha impedito,
              o la spiegazione del perché non è ancora calcolabile. Mai il vuoto. */}
          {snapshotsError ? (
            <PensionErrorNotice message="Non è stato possibile caricare lo storico da cui si calcola il rendimento." />
          ) : pensionReturn ? (
            <PensionReturnSummaryCard
              result={pensionReturn}
              hasStartMonth={!!settings?.pensionReturnStartMonth}
              manyFunds={manyFunds}
            />
          ) : (
            <PensionReturnPendingCard
              hasValueSeries={pensionValueSeries.length > 0}
              startMonth={pensionReturnStart}
              manyFunds={manyFunds}
            />
          )}
        </div>

        {showReturnBreakdown && pensionReturn && (
          <DisclosureSection title="Da dove viene la crescita">
            <PensionReturnBreakdown result={pensionReturn} />
          </DisclosureSection>
        )}
      </section>

      {/* ── Anno fiscale — versato per natura + beneficio IRPEF per contribuente ──── */}
      <section className="space-y-4 border-t border-border/40 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className={CHAPTER_TITLE_CLASS}>Anno fiscale {activeYear}</h2>
          {availableYears.length > 1 && (
            <SegmentedPill
              options={availableYears.map((year) => ({ value: String(year), label: String(year) }))}
              value={String(activeYear)}
              onChange={(value) => setSelectedYear(Number(value))}
              layoutId="pension-year-axis"
              ariaLabel="Anno fiscale"
            />
          )}
        </div>

        {/* Ogni numero di questo capitolo deriva dai versamenti: se non sono arrivati, il capitolo
            non ha una versione degradata onesta — mostrerebbe un versato di zero e un risparmio
            IRPEF di zero, entrambi indistinguibili da un anno in cui non hai versato nulla. */}
        {contributionsError ? (
          <PensionErrorNotice message="Non è stato possibile caricare i versamenti: il versato dell'anno e il beneficio fiscale non sono calcolabili." />
        ) : (
        <div className="grid gap-4 desktop:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-[22px]">
            <h3 className={EYEBROW_CLASS}>Versato nel {activeYear}</h3>
            <p className="mt-2 font-mono text-[36px] font-bold leading-none tracking-[-0.03em] tabular-nums text-foreground">
              {cachedFormatCurrencyEUR(totalActiveYear)}
            </p>
            <div className="mt-5 divide-y divide-border/60">
              {NATURE_ROWS.map(({ key, label, hint }) => (
                <div key={key} className="flex items-baseline justify-between gap-3 py-2">
                  <div>
                    <span className="text-sm text-foreground">{label}</span>
                    <span className="ml-2 text-[11px] text-muted-foreground">{hint}</span>
                  </div>
                  <span className="font-mono text-sm tabular-nums text-foreground">
                    {cachedFormatCurrencyEUR(activeYearNature[key])}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* One card per family member with >=1 linked fund, never one combined number: the IRPEF
              deduction ceiling is per taxpayer. */}
          {matched.map(({ member, funds: memberFunds }) => {
            const memberAssetIds = new Set(memberFunds.map((f) => f.id));
            const memberContributions = contributions.filter((c) => memberAssetIds.has(c.assetId));
            return (
              <PensionTaxRecapCard
                key={member.id}
                member={member}
                memberContributions={memberContributions}
                taxYear={activeYear}
              />
            );
          })}
          {unassigned.length > 0 && <UnassignedFundsCard funds={unassigned} />}
          {matched.length === 0 && unassigned.length === 0 && familyMembers.length === 0 && (
            <UnassignedFundsCard funds={funds} />
          )}
        </div>
        )}

        {/* One disclaimer for the chapter, not one per taxpayer — repeating it per card said the
            same thing twice to a two-person household. */}
        {matched.length > 0 && !contributionsError && (
          <p className="text-[11px] text-muted-foreground">
            Stima informativa, non consulenza fiscale: dipende dalla situazione personale di ciascun
            contribuente (altri oneri deducibili, incapienza, tetto). Verifica con un professionista.
          </p>
        )}
      </section>

      {/* ── Storico versamenti dell'anno selezionato ───────────────────────────────── */}
      <section className="space-y-4 border-t border-border/40 pt-4">
        {/* Titolo e conteggio FUORI dalla card, come negli altri due capitoli: il titolo di capitolo
            nomina ciò che la card contiene, non è il titolo della card. */}
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className={CHAPTER_TITLE_CLASS}>Storico versamenti {activeYear}</h2>
          {!contributionsError && (
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {yearContributions.length}{' '}
              {yearContributions.length === 1 ? 'versamento' : 'versamenti'}
            </span>
          )}
        </div>

        {contributionsError ? (
          <PensionErrorNotice message="Non è stato possibile caricare lo storico dei versamenti." />
        ) : (
        <div className="rounded-2xl border border-border bg-card p-[22px]">
          {yearContributions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nessun versamento registrato con anno fiscale {activeYear}.
            </p>
          ) : (
            <>
              <div className="divide-y divide-border/60">
                {yearContributions.map((contribution) => {
                  const isPending = pendingDeleteId === contribution.id;
                  // A January payment booked to the previous tax year would otherwise look like a
                  // row filed under the wrong year.
                  const isStraddling = contribution.date.getFullYear() !== contribution.taxYear;
                  const dateLabel = contribution.date.toLocaleDateString('it-IT');
                  // The armed label names the cash consequence for a voluntary contribution — the
                  // one nature whose deletion also moves an account balance. It lives here rather
                  // than in a `title`: that attribute is added at the moment the pointer is already
                  // resting on the button, and a tooltip that appears under a motionless cursor is
                  // never shown (confirmed in manual testing). The visible warning is the card's
                  // closing note, which says the same thing and is always on screen.
                  const deleteLabel = isPending
                    ? `Conferma eliminazione del versamento ${SOURCE_LABEL[contribution.source]} del ${dateLabel}${
                        contribution.source === 'voluntary' ? ', il conto verrà riaccreditato' : ''
                      }`
                    : `Elimina versamento ${SOURCE_LABEL[contribution.source]} del ${dateLabel}`;
                  return (
                    <div key={contribution.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2">
                          <span className="text-sm text-foreground">{SOURCE_LABEL[contribution.source]}</span>
                          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                            {dateLabel}
                          </span>
                          {isStraddling && (
                            <span className="text-[11px] text-muted-foreground">
                              competenza {contribution.taxYear}
                            </span>
                          )}
                        </div>
                        {funds.length > 1 && (
                          <p className="truncate text-[11px] text-muted-foreground">
                            {fundNameById.get(contribution.assetId) ?? '—'}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm tabular-nums text-foreground">
                          {cachedFormatCurrencyEUR(contribution.amount)}
                        </span>
                        <Button
                          type="button"
                          variant={isPending ? 'destructive' : 'ghost'}
                          size="sm"
                          onClick={() => handleDeleteClick(contribution)}
                          disabled={isDemo}
                          aria-label={deleteLabel}
                        >
                          {isPending ? (
                            <span className="px-1 text-xs">Conferma?</span>
                          ) : (
                            <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* The armed state is carried by a variant + label swap, which a screen reader would
                  otherwise never announce. Il DISARMO è un annuncio a sé e non il ritorno alla
                  stringa vuota: svuotare la region non produce nessun annuncio, quindi chi non vede
                  il bottone tornare grigio resterebbe a credere che l'eliminazione sia ancora armata
                  per il resto della sessione. */}
              <p className="sr-only" role="status" aria-live="polite">
                {deleteAnnouncement}
              </p>

              <p className="mt-3 text-[11px] text-muted-foreground">
                Eliminare un versamento annulla il suo effetto: il valore del fondo torna indietro e,
                per i volontari, il conto viene riaccreditato e il trasferimento rimosso.
              </p>
            </>
          )}
        </div>
        )}
      </section>

      <DisclosureSection title={`Come aggiornare il valore ${ofTheFund}`}>
        <p className="px-[22px] pb-[22px] text-xs text-muted-foreground">
          Il valore {ofTheFund} (versato + rendimento) si aggiorna a mano dal tuo asset «Fondo
          Pensione» in Patrimonio quando arriva l&apos;estratto conto. Ordine corretto: registra
          prima tutti i versamenti del mese qui sopra, poi aggiorna «Valore attuale» —
          l&apos;estratto conto li include già, quindi aggiornarlo prima li farebbe contare due
          volte.
          <br />
          <br />
          Fallo <strong>entro la fine del mese di competenza</strong>: lo storico salva una
          fotografia del patrimonio a fine mese e quella dei mesi passati non si riscrive più,
          quindi un versamento di giugno registrato a luglio compare nel valore di luglio. Il
          rendimento resta corretto — viene attribuito al mese in cui il valore si è mosso — ma il
          confronto mese per mese si legge meglio se le due cose coincidono.
        </p>
      </DisclosureSection>
    </div>
  );
}
