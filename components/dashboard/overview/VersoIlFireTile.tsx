'use client';

import { useFireProgress } from '@/lib/hooks/useFireProgress';
import { useViewAreas } from '@/contexts/ViewAreasContext';
import { describeFireProgress } from '@/lib/utils/fireProgress';
import { TILE_FOOTER_ACTION_CLASS } from '@/components/ui/tile';
import { OverviewTile } from './OverviewTile';

import { VersoIlFireTileSkeleton, type VersoIlFireTileProps } from './VersoIlFireTileSkeleton';

/**
 * «A che punto sono?» for a viewer with FIRE off and a plan written (doc/essenziale/README.md § 5.7, D-ES2): the capital over
 * the Calculator's number, and the Base year. The figures are the Calculator's (`useFireProgress`, one derivation); the tile
 * is a chunk of its own and only mounts when the page asked for it, so a viewer in Completa reads nothing more.
 */
export function VersoIlFireTile({ collapse, asideWhenClosed, className }: VersoIlFireTileProps) {
  const { showArea } = useViewAreas();
  const progress = useFireProgress();
  const loading = progress.isLoadingSettings || progress.isLoadingAssets || progress.isLoadingCashflow;
  const failed = progress.settingsError || progress.assetsError || progress.recentExpensesError;

  if (loading) return <VersoIlFireTileSkeleton collapse={collapse} asideWhenClosed={asideWhenClosed} className={className} />;

  const reading =
    !failed && progress.displayedFireMetrics
      ? describeFireProgress({
          capital: progress.currentNetWorth,
          fireNumber: progress.displayedFireMetrics.fireNumber,
          baseYearsToFIRE: progress.projection?.baseYearsToFIRE ?? null,
          currentYear: progress.currentYearForFan,
        })
      : null;

  return (
    <OverviewTile
      eyebrow="Verso il FIRE"
      ariaLabel="Verso il FIRE"
      asideWhenClosed={asideWhenClosed}
      collapse={collapse}
      className={className}
    >
      {reading ? (
        <div className="mt-4 flex flex-col gap-2.5">
          <span className="font-mono text-[40px] font-bold leading-none tracking-[0.01em] tabular-nums text-foreground">{reading.percent}%</span>
          <div
            className="h-[3px] overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(reading.fill)}
            aria-label="Avanzamento verso il FIRE"
          >
            <div className="h-full rounded-full bg-foreground" style={{ width: `${reading.fill}%` }} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            <span className="font-mono tabular-nums text-foreground">{reading.amounts}</span>
            {' · '}
            {reading.forecast}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-[13px] text-muted-foreground">
          {failed ? 'Non riesco a leggere il piano FIRE.' : 'Con il piano di oggi il numero FIRE non si calcola ancora.'}
        </p>
      )}
      <div className="mt-auto border-t border-border pt-3.5 text-[11px] text-muted-foreground">
        <button type="button" className={TILE_FOOTER_ACTION_CLASS} onClick={() => showArea('fire')}>
          Mostra FIRE nel menu
        </button>
      </div>
    </OverviewTile>
  );
}
