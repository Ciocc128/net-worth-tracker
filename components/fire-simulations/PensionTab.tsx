/**
 * PensionTab — "Previdenza" tab of the FIRE simulations page.
 *
 * Two blocks:
 *  1. Versato — register contributions via the dedicated flow and track the AMOUNT CONTRIBUTED by
 *     nature and year. The fund's current value lives on the manually-valued pension asset in
 *     Patrimonio; contributions raise it immediately (§4.2) but market return is updated by hand.
 *  2. Beneficio fiscale — the annual tax recap (spec §3.2/§8.4): estimated IRPEF saving for the year
 *     and, for first-employment-post-2007 workers, the extra-deducibilità plafond (§3.4). Uses the
 *     pure `computePensionTaxRecap` fed by the RAL and IRPEF brackets from Settings.
 *
 * The RAL and the first-employment inputs are person-level pension tax params (§3.1/§6.5); they are
 * edited inline here and persisted to `AssetAllocationSettings`.
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { PiggyBank, Plus, Trash2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useAssets } from '@/lib/hooks/useAssets';
import { usePensionContributions } from '@/lib/hooks/usePensionContributions';
import { deletePensionContribution } from '@/lib/services/pensionContributionService';
import { queryKeys } from '@/lib/query/queryKeys';
import type { ContributionSource, PensionContribution } from '@/types/pension';
import {
  derivePensionContributionsByYearAndNature,
  derivePensionDeductibleByYear,
} from '@/lib/utils/pensionContributions';
import {
  computePensionTaxRecap,
  getPensionDeductionCeiling,
} from '@/lib/utils/pensionDeduction';
import { calculateProgressiveTax, normalizeCoastFireTaxBrackets } from '@/lib/services/fireService';
import { getDefaultTargets, getSettings, setSettings } from '@/lib/services/assetAllocationService';
import type { Settings } from '@/types/settings';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { getItalyYear } from '@/lib/utils/dateHelpers';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PensionContributionDialog } from '@/components/pension/PensionContributionDialog';

const NATURE_LABELS: { key: 'voluntary' | 'employer' | 'tfr'; label: string; hint: string }[] = [
  { key: 'voluntary', label: 'Volontario', hint: 'deducibile · trasferito dal conto' },
  { key: 'employer', label: 'Datoriale', hint: 'deducibile · non transita dal conto' },
  { key: 'tfr', label: 'TFR', hint: 'non deducibile' },
];

const SOURCE_LABEL: Record<ContributionSource, string> = {
  voluntary: 'Volontario',
  employer: 'Datoriale',
  tfr: 'TFR',
};

export function PensionTab() {
  const { user } = useAuth();
  const isDemo = useDemoMode();
  const queryClient = useQueryClient();
  const { data: assets = [] } = useAssets(user?.uid);
  const { data: contributions = [] } = usePensionContributions(user?.uid);
  const { data: settings } = useQuery<Settings | null>({
    queryKey: ['settings', user?.uid],
    queryFn: () => getSettings(user!.uid),
    enabled: !!user?.uid,
  });
  const [dialogOpen, setDialogOpen] = useState(false);

  const currentYear = getItalyYear(new Date());

  // The fondo pensione assets the contributions can attach to (type 'pension' in Patrimonio).
  const funds = useMemo(
    () =>
      assets
        .filter((asset) => asset.type === 'pension')
        .map((asset) => ({ id: asset.id, name: asset.name })),
    [assets]
  );

  // Cash accounts a voluntary contribution can be drawn from (the transfer origin, §4.3).
  const cashAccounts = useMemo(
    () =>
      assets
        .filter((asset) => asset.assetClass === 'cash')
        .map((asset) => ({ id: asset.id, name: asset.name })),
    [assets]
  );

  const byYearNature = useMemo(
    () => derivePensionContributionsByYearAndNature(contributions),
    [contributions]
  );
  const deductibleByYear = useMemo(
    () => derivePensionDeductibleByYear(contributions),
    [contributions]
  );

  const thisYear = byYearNature[currentYear] ?? { tfr: 0, voluntary: 0, employer: 0 };
  const totalThisYear = thisYear.tfr + thisYear.voluntary + thisYear.employer;
  const totalAllTime = useMemo(
    () =>
      Object.values(byYearNature).reduce(
        (sum, nature) => sum + nature.tfr + nature.voluntary + nature.employer,
        0
      ),
    [byYearNature]
  );

  // ── Tax params (RAL + first employment) — editable, persisted to settings ──────────
  const [ral, setRal] = useState('');
  const [isFirstJob, setIsFirstJob] = useState(false);
  const [firstJobYear, setFirstJobYear] = useState('');
  const [savingParams, setSavingParams] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setRal(settings.grossAnnualIncome != null ? String(settings.grossAnnualIncome) : '');
    setIsFirstJob(settings.isFirstEmploymentPost2007 ?? false);
    setFirstJobYear(settings.firstEmploymentYear != null ? String(settings.firstEmploymentYear) : '');
  }, [settings]);

  const saveParamsMutation = useMutation({
    mutationFn: async () => {
      const ralValue = parseFloat(ral.replace(',', '.'));
      const yearValue = parseInt(firstJobYear, 10);
      // Merge into existing settings (setSettings replaces the whole doc; targets is required).
      await setSettings(user!.uid, {
        ...(settings ?? {}),
        targets: settings?.targets || getDefaultTargets(),
        grossAnnualIncome: Number.isFinite(ralValue) && ralValue > 0 ? ralValue : undefined,
        isFirstEmploymentPost2007: isFirstJob,
        firstEmploymentYear: Number.isInteger(yearValue) ? yearValue : undefined,
      });
    },
    onMutate: () => setSavingParams(true),
    onSettled: () => setSavingParams(false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', user!.uid] });
      toast.success('Parametri fiscali salvati');
    },
    onError: () => toast.error('Errore nel salvataggio dei parametri'),
  });

  // ── Tax recap for the current year ─────────────────────────────────────────────────
  const ralNumber = settings?.grossAnnualIncome ?? 0;
  // The plafond window starts at the first employment year; fall back to the earliest contribution.
  const enrollmentYear = useMemo(() => {
    if (settings?.firstEmploymentYear) return settings.firstEmploymentYear;
    const years = Object.keys(deductibleByYear).map(Number);
    return years.length > 0 ? Math.min(...years) : currentYear;
  }, [settings?.firstEmploymentYear, deductibleByYear, currentYear]);

  const recap = useMemo(() => {
    const brackets = normalizeCoastFireTaxBrackets(settings?.coastFireTaxBrackets);
    return computePensionTaxRecap(
      {
        targetYear: currentYear,
        enrollmentYear,
        isFirstJobPost2007: settings?.isFirstEmploymentPost2007 ?? false,
        deductibleContribByYear: deductibleByYear,
      },
      ralNumber,
      (income) => calculateProgressiveTax(income, brackets)
    );
  }, [settings, currentYear, enrollmentYear, deductibleByYear, ralNumber]);

  const { state, taxSaving } = recap;
  const showPlafond = (settings?.isFirstEmploymentPost2007 ?? false) && (state.isAccrualYear || state.isUsageYear);

  // ── Contributions history + delete (reverses the value/transfer effect) ─────────────
  const fundNameById = useMemo(() => new Map(funds.map((f) => [f.id, f.name])), [funds]);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (contribution: PensionContribution) => deletePensionContribution(contribution),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.pensionContributions.all(user!.uid) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(user!.uid) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all(user!.uid) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(user!.uid) }),
      ]);
      toast.success('Versamento eliminato');
      setPendingDeleteId(null);
    },
    onError: () => {
      toast.error('Errore nell\'eliminazione del versamento');
      setPendingDeleteId(null);
    },
  });

  return (
    <div className="space-y-4">
      {/* Header + primary action */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <PiggyBank className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Fondo Pensione</h2>
        </div>
        <Button onClick={() => setDialogOpen(true)} disabled={isDemo || !user}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Registra versamento
        </Button>
      </div>

      {/* Versato quest'anno — dominant figure + per-nature split */}
      <div className="rounded-2xl border border-border bg-card p-[22px]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Versato nel {currentYear}
        </p>
        <p className="mt-2 font-mono text-[38px] font-bold leading-none tracking-[-0.03em] text-foreground">
          {cachedFormatCurrencyEUR(totalThisYear)}
        </p>

        <div className="mt-5 divide-y divide-border/60">
          {NATURE_LABELS.map(({ key, label, hint }) => (
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

        <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3">
          <span className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
            Versato totale
          </span>
          <span className="font-mono text-sm tabular-nums text-foreground">
            {cachedFormatCurrencyEUR(totalAllTime)}
          </span>
        </div>
      </div>

      {/* Beneficio fiscale — annual tax recap */}
      <div className="rounded-2xl border border-border bg-card p-[22px] space-y-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Beneficio fiscale {currentYear}
        </p>

        {/* Person-level tax params: RAL + first employment (persisted to settings) */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pt-ral" className="text-xs">Reddito annuo lordo (RAL)</Label>
            <Input
              id="pt-ral"
              type="number"
              inputMode="decimal"
              value={ral}
              onChange={(e) => setRal(e.target.value)}
              placeholder="es. 35000"
              disabled={isDemo}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pt-firstjob-year" className="text-xs">Anno prima occupazione</Label>
            <Input
              id="pt-firstjob-year"
              type="number"
              value={firstJobYear}
              onChange={(e) => setFirstJobYear(e.target.value)}
              placeholder="es. 2022"
              disabled={isDemo || !isFirstJob}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="pt-firstjob" className="text-xs text-muted-foreground">
            Prima occupazione dopo il 2007 (abilita il recupero plafond)
          </Label>
          <Switch id="pt-firstjob" checked={isFirstJob} onCheckedChange={setIsFirstJob} disabled={isDemo} />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => saveParamsMutation.mutate()}
          disabled={isDemo || savingParams || !user}
        >
          {savingParams ? 'Salvataggio...' : 'Salva parametri'}
        </Button>

        {/* The three figures */}
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
              {cachedFormatCurrencyEUR(thisYear.tfr)}
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
            Inserisci la RAL per stimare il risparmio IRPEF. «Rientrerà nel 730 del {currentYear + 1}».
          </p>
        )}

        {/* Plafond deducibilità (only for eligible first-employment workers) */}
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
          Stima informativa, non consulenza fiscale: dipende dalla tua situazione personale (altri
          oneri deducibili, incapienza, tetto). Verifica con un professionista.
        </p>
      </div>

      {/* Storico versamenti — con eliminazione (annulla l'effetto su valore fondo / conto) */}
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
                      <span className="text-sm text-foreground">
                        {SOURCE_LABEL[contribution.source]}
                      </span>
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
                    {isPending ? (
                      <button
                        type="button"
                        onClick={() => deleteMutation.mutate(contribution)}
                        disabled={isDemo || deleteMutation.isPending}
                        className="rounded-md bg-destructive px-2 py-1 text-[11px] font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                      >
                        Conferma
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPendingDeleteId(contribution.id)}
                        disabled={isDemo}
                        aria-label="Elimina versamento"
                        className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
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
        in Patrimonio quando arriva l&apos;estratto conto.
      </p>

      {user && (
        <PensionContributionDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          userId={user.uid}
          funds={funds}
          cashAccounts={cashAccounts}
        />
      )}
    </div>
  );
}
