'use client';

/**
 * BASE DI CALCOLO — «come si arriva al numero FIRE?»: the number as a sum of steps in a fixed order (doc/fire-ipotesi/README.md § 15,
 * RB1–RB3, D-T9): spending ÷ SWR, the withdrawal tax, the state pensions, the locked pension fund, the dated flows, then the FIRE number,
 * every row to the euro and adding up to it. The capital, the spending and the SWR are not repeated here: they are in «Ipotesi usate».
 *
 * The tile is a READING and computes nothing: the steps come from `buildFireLedger` (the same `resolveFireRequirement` the Calcolatore
 * runs), the captions from `describeTaxRow`, `describePensionRow`, `describeLock` and `describeFlowsRow`. The steps are terms of a
 * calculation, not gains or losses of the user: they take no sign colour. An ingredient that does not enter prints «—» and its reason.
 */

import type { ReactNode } from 'react';
import type { Narrative } from '@/lib/utils/narrative';
import { describePensionRow, describeTaxRow, formatRate, type FireBase } from '@/lib/utils/fireNarrative';
import { describeFlowsRow } from '@/lib/utils/datedFlowsNarrative';
import { NO_HONEST } from '@/lib/utils/fireSummary';
import type { FireLedgerStepKey } from '@/lib/utils/fireBaseLedger';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { Tile } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

interface BaseDiCalcoloTileProps {
  reading: Narrative;
  aside: string | null;
  base: FireBase;
  /** `describeLock(lock)`. */
  lockCaption: Narrative;
  footer: Narrative;
  /** The calendar year, for «già in corso» on a pension that has started. */
  currentYear: number;
  className?: string;
}

function Row({ label, caption, value, strong }: { label: string; caption?: ReactNode; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-[9px]">
      <span className="min-w-0">
        <span className={cn('block text-[13px]', strong ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{label}</span>
        {/* A caption is a fact (the window, the rule), so it takes the full muted ink: at /70 it
            measured 2,60:1 in light (2026-09-22). */}
        {caption && <span className="block text-[11px] leading-[1.4] text-muted-foreground">{caption}</span>}
      </span>
      {/* An absence prints «—» in the muted ink: a state, never a figure of 0. */}
      <span className={cn('shrink-0 font-mono text-[14px] tabular-nums', value === null ? 'text-muted-foreground' : 'text-foreground', strong && 'font-semibold')}>{value ?? '—'}</span>
    </div>
  );
}

/** «+41.139 €» / «−169.304 €»: the sign is part of the figure, the colour is not. */
function signedEuro(value: number | null): string | null {
  if (value === null) return null;
  const text = cachedFormatCurrencyEUR(Math.abs(value), true);
  return value < 0 ? `−${text}` : `+${text}`;
}

export function BaseDiCalcoloTile({ reading, aside, base, lockCaption, footer, currentYear, className }: BaseDiCalcoloTileProps) {
  const honest = base.honest ?? NO_HONEST;
  const ledger = base.ledger ?? null;
  const step = (key: FireLedgerStepKey): number | null => ledger?.steps.find((candidate) => candidate.key === key)?.amount ?? null;
  const pensionRow = describePensionRow(honest, currentYear);
  const taxRow = describeTaxRow(honest);
  const flowsRow = base.flows ? describeFlowsRow(base.flows) : null;
  const taxCaption = honest.taxConsidered ? `${formatRate(honest.taxRate)} sulla plusvalenza, ${formatRate(Math.round(honest.gainSharePct))} del portafoglio` : taxRow.caption;

  return (
    <Tile eyebrow="Base di calcolo" aside={aside ?? undefined} reading={reading} ariaLabel="Base di calcolo del FIRE" className={cn('@container', className)}>
      <p className="mt-2.5 text-[11px] leading-[1.4] text-muted-foreground">Capitale e spesa: vedi Ipotesi usate.</p>
      <div className="mt-1 flex flex-col divide-y divide-border">
        <Row label="Spesa ÷ SWR" caption={`${cachedFormatCurrencyEUR(base.annualExpenses, true)} l'anno ÷ ${formatRate(base.swr)}`} value={ledger ? cachedFormatCurrencyEUR(ledger.base, true) : null} />
        {/* The two rows that make the number honest (2026-09-24): each is either in the number
            or declared out with its reason — never silently assumed. */}
        <Row label="Tasse sui prelievi" caption={taxCaption} value={signedEuro(step('tax'))} />
        <Row label="Pensioni statali" caption={pensionRow.caption} value={signedEuro(step('pensions'))} />
        {/* The lock is written in «Il mio piano»; here only what it does to the number. */}
        <Row
          label="Fondo pensione bloccato"
          caption={<NarrativeText segments={lockCaption} className="text-[11px] leading-[1.4] text-muted-foreground" figureClassName="font-medium" />}
          value={signedEuro(step('bridge'))}
        />
        {/* § 12 (D-F12): the dated flows in use, and how far they move the FIRE year. */}
        <Row label="Flussi nel tempo" caption={flowsRow?.caption ?? 'nessuno in Il mio piano'} value={signedEuro(step('flows'))} />
        <Row label="Numero FIRE" value={ledger ? cachedFormatCurrencyEUR(ledger.total, true) : null} strong />
      </div>
      {/* The saving moves the YEAR, not the number: below the total, apart. */}
      <div className="mt-1 border-t border-border">
        <Row label="Risparmio annuo" caption={`${cachedFormatCurrencyEUR(base.monthlySavings, true)} al mese · non entra nel numero`} value={cachedFormatCurrencyEUR(base.annualSavings, true)} />
      </div>

      <NarrativeText segments={footer} className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground" />
    </Tile>
  );
}
