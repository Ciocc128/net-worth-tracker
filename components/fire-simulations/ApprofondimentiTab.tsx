'use client';

/**
 * FIRE › Approfondimenti (RU10, D-RU26; doc/riordino-ui/ondata-3.md § 5.1) — the method behind the answer: Coast FIRE,
 * Dopo il FIRE and Proiezione behind ONE door, chosen with a pill that is the tab's AXIS (a value the tab reads, a
 * `radiogroup`, not a second bar of tabs). Each view is the tab of before, whole: its verdict, its strip, its «Il resto
 * della pagina», its figures to the float.
 *
 * The pill is ONE element at every width, drawn by this tab and not by the views' verdicts, so it is there while a view
 * is still loading and keeps its focus when the view changes: above the verdict on a phone, full width; from `desktop:`
 * on the right of the verdict, out of the flow. The views are chunks of their own (P6): only the open one mounts, the
 * others are preloaded once the Calcolatore's reads are in (`APPROFONDIMENTI_LAZY`).
 */

import type { ReactNode } from 'react';
import { SegmentedPill, type SegmentedPillOption } from '@/components/ui/segmented-pill';
import { TileGridSkeleton } from '@/components/ui/tile-grid-skeleton';
import { lazyComponent } from '@/components/ui/lazy-component';
import { COAST_TAB_SKELETON_CELLS, MONTE_CARLO_TAB_SKELETON_CELLS } from './tabSkeletons';
import type { FireVista } from '@/lib/utils/firePlan';

const CoastFireTab = lazyComponent(() => import('@/components/fire-simulations/CoastFireTab').then((m) => m.CoastFireTab));
const MonteCarloTab = lazyComponent(() => import('@/components/fire-simulations/MonteCarloTab').then((m) => m.MonteCarloTab));
const ProjectionTab = lazyComponent(() => import('@/components/fire-simulations/ProjectionTab').then((m) => m.ProjectionTab));

/** The chunks of the three views, for `usePreloadWhenIdle` (the page adds the other lazy tabs). */
export const APPROFONDIMENTI_LAZY = [CoastFireTab, MonteCarloTab, ProjectionTab];

/** Whole words at every width: «Dopo il FIRE» is the longest and the three fit in 358px (doc § 9). */
const VISTA_OPTIONS: ReadonlyArray<SegmentedPillOption<FireVista>> = [
  { value: 'coast', label: 'Coast FIRE' },
  { value: 'dopo', label: 'Dopo il FIRE' },
  { value: 'proiezione', label: 'Proiezione' },
];

interface ApprofondimentiTabProps {
  vista: FireVista;
  onVistaChange: (vista: FireVista) => void;
}

export function ApprofondimentiTab({ vista, onVistaChange }: ApprofondimentiTabProps) {
  let view: ReactNode;
  if (vista === 'coast') view = <CoastFireTab fallback={<TileGridSkeleton cells={COAST_TAB_SKELETON_CELLS} />} />;
  else if (vista === 'dopo') view = <MonteCarloTab fallback={<TileGridSkeleton cells={MONTE_CARLO_TAB_SKELETON_CELLS} />} />;
  else view = <ProjectionTab fallback={<TileGridSkeleton cells={MONTE_CARLO_TAB_SKELETON_CELLS} />} />;

  return (
    <div className="relative">
      <SegmentedPill
        options={VISTA_OPTIONS}
        value={vista}
        onChange={onVistaChange}
        layoutId="fire-vista-pill"
        ariaLabel="Vista di Approfondimenti"
        semantics="radio"
        className="mb-3 w-full desktop:absolute desktop:right-0 desktop:top-4 desktop:z-10 desktop:mb-0 desktop:w-auto"
        optionClassName="max-desktop:min-h-11 max-desktop:flex-1"
      />
      {view}
    </div>
  );
}
