'use client';

/**
 * PensionOverview — body of the dedicated `/dashboard/pension` view (incl. the family-member split
 * follow-up).
 *
 * Four blocks:
 *  1. Header — total fund value (sum of ALL the user's `pensionFund` assets) + total ever
 *     contributed. Stays aggregate across every fund/member — this is a net-worth figure, not a tax
 *     one.
 *  2. Versato per natura — this year's contributions split TFR/Volontario/Datoriale, also aggregate.
 *  3. Beneficio fiscale — ONE recap card PER family member with >=1 linked fund (the IRPEF pension
 *     deduction ceiling is per taxpayer, not per account, so summing every fund's contributions
 *     against one RAL would be wrong for a household tracking more than one person's fund). Family
 *     members + their RAL/eligibility are edited in Impostazioni → Preferenze → Famiglia, not here;
 *     a fund is linked to a member from its own edit dialog in Patrimonio. Funds with no member (or
 *     a stale one) get a prompt instead of a number — never silently folded into someone else's
 *     calculation.
 *  4. Storico versamenti — contribution history with 2-click delete (reverses the value/transfer
 *     effect — invariant #5).
 */

import { useRef, useState } from 'react';
import Link from 'next/link';
import { PiggyBank, Plus, Trash2, Users } from 'lucide-react';
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
  derivePensionDeductibleByYear,
} from '@/lib/utils/pensionContributions';
import { groupFundsByFamilyMember } from '@/lib/utils/pensionFamilyMembers';
import { computePensionTaxRecap, getPensionDeductionCeiling, type PensionTaxRecap } from '@/lib/utils/pensionDeduction';
import {
  buildPensionValueSeries,
  computePensionReturn,
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
import { PensionContributionDialog } from '@/components/pension/PensionContributionDialog';

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
  title,
  member,
  memberContributions,
  currentYear,
}: {
  title: string;
  member: FamilyMember;
  memberContributions: PensionContribution[];
  currentYear: number;
}) {
  const deductibleByYear = derivePensionDeductibleByYear(memberContributions);
  const byYearNature = derivePensionContributionsByYearAndNature(memberContributions);
  const tfrThisYear = byYearNature[currentYear]?.tfr ?? 0;

  // Same fallback logic the old single-account calculation used, but scoped to THIS member's own
  // contribution history — reusing the account-wide map here would leak one person's years into
  // another's plafond fold.
  const enrollmentYear = (() => {
    if (member.firstEmploymentYear) return member.firstEmploymentYear;
    const years = Object.keys(deductibleByYear).map(Number);
    return years.length > 0 ? Math.min(...years) : currentYear;
  })();

  const ralNumber = member.grossAnnualIncome ?? 0;
  const brackets = normalizeCoastFireTaxBrackets(undefined);
  const recap: PensionTaxRecap = computePensionTaxRecap(
    {
      targetYear: currentYear,
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
    <div className="rounded-2xl border border-border bg-card p-[22px] space-y-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {title}
      </p>

      <div className="divide-y divide-border/60 border-t border-border/60 pt-1">
        <div className="flex items-baseline justify-between gap-3 py-2">
          <span className="text-sm text-foreground">
            Contributi deducibili {currentYear}
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
        <div className="flex items-baseline justify-between gap-3 py-2">
          <span className="text-sm font-medium text-foreground">Risparmio IRPEF stimato</span>
          <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
            {ralNumber > 0 ? `~${cachedFormatCurrencyEUR(taxSaving)}` : '—'}
          </span>
        </div>
      </div>

      {ralNumber <= 0 && (
        <p className="text-[11px] text-muted-foreground">
          Imposta la RAL di {member.name} in{' '}
          <Link href="/dashboard/settings" className="text-primary underline hover:no-underline">
            Impostazioni → Preferenze → Famiglia
          </Link>{' '}
          per stimare il risparmio IRPEF.
        </p>
      )}

      {showPlafond && (
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Plafond deducibilità
          </p>
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
              Extra deducibile {currentYear} oltre {cachedFormatCurrencyEUR(getPensionDeductionCeiling(currentYear))}
            </span>
            <span className="font-mono text-xs tabular-nums text-foreground">
              {cachedFormatCurrencyEUR(state.extraAvailableThisYear)}
            </span>
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Stima informativa, non consulenza fiscale: dipende dalla situazione personale di {member.name}{' '}
        (altri oneri deducibili, incapienza, tetto). Verifica con un professionista.
      </p>
    </div>
  );
}

/**
 * "Rendimento del fondo" — la scomposizione della crescita, non una percentuale sola.
 *
 * Il valore di un fondo pensione sale per tre motivi che non sono la stessa cosa (versamenti tuoi,
 * regalo del datore, mercato). La card li tiene separati e mostra il TWR — l'unico numero
 * confrontabile con un ETF — accanto alle righe in euro che lo spiegano. Quando i versamenti
 * registrati non bastano a giustificare la crescita, il TWR viene dichiarato inattendibile invece
 * di essere mostrato come un risultato: vedi `isCoverageSuspicious` in lib/utils/pensionReturn.ts.
 */
function PensionReturnCard({
  result,
  hasStartMonth,
}: {
  result: PensionReturnResult;
  hasStartMonth: boolean;
}) {
  const windowLabel = `${formatMonthLabel(result.windowStart)} → ${formatMonthLabel(result.windowEnd)}`;
  const showReturn = !result.isCoverageSuspicious;

  return (
    <div className="rounded-2xl border border-border bg-card p-[22px]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        Rendimento del fondo · {windowLabel}
      </p>

      {showReturn ? (
        <>
          <p
            className={cn(
              'mt-2 font-mono text-[22px] font-bold leading-none tracking-[-0.02em] tabular-nums',
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
        </>
      ) : (
        <p className="mt-3 rounded-xl border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
          Il fondo è cresciuto di {cachedFormatCurrencyEUR(result.valueGrowth)} ma risultano
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

      <div className="mt-5 divide-y divide-border/60">
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
          <span
            className={cn(
              'font-mono text-sm font-semibold tabular-nums',
              signTextClass(result.marketGain)
            )}
          >
            {cachedFormatCurrencyEUR(result.marketGain)}
          </span>
        </div>
        {result.personalReturn !== null && showReturn && (
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
        fondo, è nella card qui sotto.
      </p>
    </div>
  );
}

/** Prompt shown instead of a recap when a fund has no (valid) family member linked. */
function UnassignedFundsCard({ funds }: { funds: { id: string; name: string }[] }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-[22px] space-y-2">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">Fondi non assegnati</p>
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

export function PensionOverview() {
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const { data: assets = [] } = useAssets(ownerId);
  const { data: contributions = [] } = usePensionContributions(ownerId);
  const { data: settings } = useQuery<Settings | null>({
    queryKey: ['settings', ownerId],
    queryFn: () => getSettings(ownerId!),
    enabled: !!ownerId,
  });
  // Il rendimento del fondo si legge dagli snapshot mensili: sono l'unico posto dove il valore del
  // fondo è congelato mese per mese (l'asset porta solo il valore corrente).
  const { data: snapshots = [] } = useQuery<MonthlySnapshot[]>({
    queryKey: queryKeys.snapshots.all(ownerId || ''),
    queryFn: () => getUserSnapshots(ownerId!),
    enabled: !!ownerId,
  });
  const deleteMutation = useDeletePensionContribution(ownerId || '');
  const [dialogOpen, setDialogOpen] = useState(false);

  const currentYear = getItalyYear(new Date());

  const funds = assets.filter((asset) => asset.type === 'pensionFund');
  const fundNameById = new Map(funds.map((f) => [f.id, f.name]));
  const totalFundValue = funds.reduce((sum, fund) => sum + calculateAssetValue(fund), 0);

  // Header + "Versato per natura" stay aggregate across every fund/member — net-worth figures, not
  // tax ones. Only the recap below needs the per-member split.
  const byYearNature = derivePensionContributionsByYearAndNature(contributions);
  const thisYear = byYearNature[currentYear] ?? { tfr: 0, voluntary: 0, employer: 0 };
  const totalThisYear = thisYear.tfr + thisYear.voluntary + thisYear.employer;
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
  // Serve dire PERCHÉ manca il rendimento, o spostare il mese di partenza in avanti sembra un bug:
  // la card sparirebbe e basta.
  const pensionReturnPending = !pensionReturn && pensionValueSeries.length > 0;

  // ── Storico versamenti — 2-click delete with 3s auto-disarm ─────────────────────────
  const [pendingDeleteId, setPendingDeleteId] = useState<string | undefined>(undefined);
  const pendingDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDeleteClick = (contribution: (typeof contributions)[number]) => {
    if (pendingDeleteId === contribution.id) {
      if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
      setPendingDeleteId(undefined);
      deleteMutation.mutate(contribution, {
        onSuccess: () => toast.success('Versamento eliminato'),
        onError: () => toast.error("Errore nell'eliminazione del versamento"),
      });
    } else {
      if (pendingDeleteTimerRef.current) clearTimeout(pendingDeleteTimerRef.current);
      setPendingDeleteId(contribution.id);
      pendingDeleteTimerRef.current = setTimeout(() => setPendingDeleteId(undefined), 3000);
    }
  };

  if (funds.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-[22px] text-center space-y-3">
        <PiggyBank className="h-8 w-8 mx-auto text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-foreground">Nessun fondo pensione ancora tracciato.</p>
        <p className="text-xs text-muted-foreground">
          Crea un asset di tipo «Fondo Pensione» da Patrimonio per iniziare a registrare i versamenti
          e vedere qui il beneficio fiscale.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button onClick={() => setDialogOpen(true)} disabled={isDemo} aria-label="Registra versamento">
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Registra versamento
        </Button>
      </div>

      {/* Header — valore totale + versato totale */}
      <div className="rounded-2xl border border-border bg-card p-[22px]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Valore attuale
        </p>
        <p className="mt-2 font-mono text-[44px] font-bold leading-none tracking-[-0.03em] text-foreground tabular-nums">
          {cachedFormatCurrencyEUR(totalFundValue)}
        </p>
        <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
          <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            Versato totale
          </span>
          <span className="font-mono text-sm tabular-nums text-foreground">
            {cachedFormatCurrencyEUR(totalAllTime)}
          </span>
        </div>
      </div>

      {/* Rendimento del fondo — la crescita scomposta nelle sue tre cause, con il TWR (l'unica
          componente confrontabile con il mercato) tenuto separato da versamenti e datoriale. */}
      {pensionReturn && (
        <PensionReturnCard
          result={pensionReturn}
          hasStartMonth={!!settings?.pensionReturnStartMonth}
        />
      )}
      {pensionReturnPending && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-[22px]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Rendimento del fondo
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {pensionReturnStart
              ? `Serve un secondo mese dopo ${formatMonthLabel(pensionReturnStart)} per calcolare un rendimento: con un solo valore non c'è nulla da confrontare.`
              : 'Registra il primo versamento per iniziare a misurare il rendimento: prima di quello la crescita del fondo e i versamenti sono indistinguibili.'}
          </p>
        </div>
      )}

      {/* Versato nel {currentYear} — per natura */}
      <div className="rounded-2xl border border-border bg-card p-[22px]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Versato nel {currentYear}
        </p>
        <p className="mt-2 font-mono text-[28px] font-bold leading-none tracking-[-0.03em] text-foreground tabular-nums">
          {cachedFormatCurrencyEUR(totalThisYear)}
        </p>
        <div className="mt-5 divide-y divide-border/60">
          {NATURE_ROWS.map(({ key, label, hint }) => (
            <div key={key} className="flex items-baseline justify-between gap-3 py-2">
              <div>
                <span className="text-sm text-foreground">{label}</span>
                <span className="ml-2 text-[11px] text-muted-foreground">{hint}</span>
              </div>
              <span className="font-mono text-sm tabular-nums text-foreground">
                {cachedFormatCurrencyEUR(thisYear[key])}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Beneficio fiscale — one card per family member with >=1 linked fund, never one combined
          number: the IRPEF deduction ceiling is per taxpayer. */}
      {matched.map(({ member, funds: memberFunds }) => {
        const memberAssetIds = new Set(memberFunds.map((f) => f.id));
        const memberContributions = contributions.filter((c) => memberAssetIds.has(c.assetId));
        return (
          <PensionTaxRecapCard
            key={member.id}
            title={`Beneficio fiscale — ${member.name} ${currentYear}`}
            member={member}
            memberContributions={memberContributions}
            currentYear={currentYear}
          />
        );
      })}
      {unassigned.length > 0 && <UnassignedFundsCard funds={unassigned} />}
      {matched.length === 0 && unassigned.length === 0 && familyMembers.length === 0 && (
        <UnassignedFundsCard funds={funds} />
      )}

      {/* Storico versamenti */}
      {contributions.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-[22px]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Storico versamenti
          </p>
          <div className="mt-3 divide-y divide-border/60">
            {contributions.map((contribution) => {
              const isPending = pendingDeleteId === contribution.id;
              return (
                <div key={contribution.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground">{SOURCE_LABEL[contribution.source]}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {contribution.date.toLocaleDateString('it-IT')}
                      </span>
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
                      aria-label={isPending ? 'Conferma eliminazione' : 'Elimina versamento'}
                      title={
                        isPending && contribution.source === 'voluntary'
                          ? 'Conferma? Il saldo del conto verrà ristornato.'
                          : undefined
                      }
                    >
                      {isPending ? (
                        <span className="text-xs px-1">Conferma?</span>
                      ) : (
                        <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Eliminare un versamento annulla il suo effetto: il valore del fondo torna indietro e, per
            i volontari, il conto viene riaccreditato e il trasferimento rimosso.
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Il valore del fondo (versato + rendimento) si aggiorna a mano dal tuo asset «Fondo Pensione»
        in Patrimonio quando arriva l&apos;estratto conto. Ordine corretto: registra prima tutti i
        versamenti del mese qui sopra, poi aggiorna «Valore attuale» — l&apos;estratto conto li
        include già, quindi aggiornarlo prima li farebbe contare due volte.
        <br />
        Fallo <strong>entro la fine del mese di competenza</strong>: lo storico salva una fotografia
        del patrimonio a fine mese e quella dei mesi passati non si riscrive più, quindi un
        versamento di giugno registrato a luglio compare nel valore di luglio. Il rendimento resta
        corretto — viene attribuito al mese in cui il valore si è mosso — ma il confronto mese per
        mese si legge meglio se le due cose coincidono.
      </p>

      <PensionContributionDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
