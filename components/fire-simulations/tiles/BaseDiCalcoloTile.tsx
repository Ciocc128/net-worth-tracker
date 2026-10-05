'use client';

/**
 * BASE DI CALCOLO — «su cosa è calcolato?»: the inputs of the FIRE number as flat rows (the net
 * worth the page runs on, the expenses, the savings, the SWR, the pensions, the tax, the flows, the
 * locked pension fund — each with the window or the rule it comes from as a caption).
 *
 * The tile is a READING. The pension-lock switch that lived here until 2026-10-05 is «Il mio piano»'s
 * (doc/fire-ipotesi/README.md § 15, D-T4): the field acts on six tabs, and the page's one place to
 * write it is the plan block above the tabs. The lock's row says what it does to the number.
 *
 * The tile computes nothing: the rows read `FireBase`, the caption reads `describeLock(lock)`.
 */

import type { ReactNode } from 'react';
import type { Narrative } from '@/lib/utils/narrative';
import type { FireLock } from '@/lib/utils/fireSummary';
import { describePensionRow, describeTaxRow, formatRate, type FireBase } from '@/lib/utils/fireNarrative';
import { describeFlowsRow } from '@/lib/utils/datedFlowsNarrative';
import { NO_HONEST } from '@/lib/utils/fireSummary';
import { describeOutsideCapital } from '@/lib/utils/fireAssumptionsNarrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils';
import { Tile } from '@/components/ui/tile';
import { NarrativeText } from '@/components/ui/narrative-text';

interface BaseDiCalcoloTileProps {
  reading: Narrative;
  aside: string | null;
  base: FireBase;
  lock: FireLock;
  /** `describeLock(lock)`. */
  lockCaption: Narrative;
  footer: Narrative;
  /** The calendar year, for «già in corso» on a pension that has started. */
  currentYear: number;
  className?: string;
}

function Row({ label, caption, value }: { label: string; caption?: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-[9px]">
      <span className="min-w-0">
        <span className="block text-[13px] text-muted-foreground">{label}</span>
        {/* A caption is a fact (the window, the rule), so it takes the full muted ink: at /70 it
            measured 2,60:1 in light (2026-09-22). */}
        {caption && <span className="block text-[11px] leading-[1.4] text-muted-foreground">{caption}</span>}
      </span>
      {/* An absence prints «—» in the muted ink: a state, never a figure of 0. */}
      <span className={cn('shrink-0 font-mono text-[14px] tabular-nums', value === null ? 'text-muted-foreground' : 'text-foreground')}>{value ?? '—'}</span>
    </div>
  );
}

export function BaseDiCalcoloTile({ reading, aside, base, lock, lockCaption, footer, currentYear, className }: BaseDiCalcoloTileProps) {
  const honest = base.honest ?? NO_HONEST;
  const pensionRow = describePensionRow(honest, currentYear);
  const taxRow = describeTaxRow(honest);
  const flowsRow = base.flows ? describeFlowsRow(base.flows) : null;
  const outside = describeOutsideCapital(base.outsideCapital);
  const netWorthCaption = [
    outside ? `fuori: ${outside}` : 'portafoglio, non patrimonio',
    lock.active && lock.lockedValue > 0 ? 'fondo pensione bloccato escluso' : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
  const expensesCaption = [`${cachedFormatCurrencyEUR(base.monthlyExpenses, true)} al mese`, base.planExpensesOrigin === 'settings' ? 'spesa del piano, da Parametri' : null]
    .filter((part): part is string => part !== null)
    .join(' · ');

  return (
    <Tile eyebrow="Base di calcolo" aside={aside ?? undefined} reading={reading} ariaLabel="Base di calcolo del FIRE" className={cn('@container', className)}>
      <div className="mt-2.5 flex flex-col divide-y divide-border">
        <Row label="Capitale del piano" caption={netWorthCaption} value={cachedFormatCurrencyEUR(base.netWorth, true)} />
        <Row label="Spese annue" caption={expensesCaption} value={cachedFormatCurrencyEUR(base.annualExpenses, true)} />
        <Row label="Risparmio annuo" caption={`${cachedFormatCurrencyEUR(base.monthlySavings, true)} al mese`} value={cachedFormatCurrencyEUR(base.annualSavings, true)} />
        <Row label="Safe Withdrawal Rate" caption="numero FIRE = spese ÷ SWR" value={formatRate(base.swr)} />
        {/* The two rows that make the number honest (2026-09-24): each is either in the number
            or declared out with its reason — never silently assumed. */}
        <Row label="Pensioni statali" caption={pensionRow.caption} value={pensionRow.value} />
        <Row label="Tasse sui prelievi" caption={taxRow.caption} value={taxRow.value} />
        {/* § 12 (D-F12): the dated flows in use, and how far they move the FIRE year. */}
        {flowsRow && <Row label="Flussi nel tempo" caption={flowsRow.caption} value={flowsRow.value} />}
        {/* The lock is written in «Il mio piano»; here only what it does (an absence prints «—»). */}
        <Row
          label="Fondo pensione bloccato"
          caption={<NarrativeText segments={lockCaption} className="text-[11px] leading-[1.4] text-muted-foreground" figureClassName="font-medium" />}
          value={lock.active && lock.lockedValue > 0 ? cachedFormatCurrencyEUR(lock.lockedValue, true) : null}
        />
      </div>

      <NarrativeText segments={footer} className="mt-auto border-t border-border pt-3.5 text-[11px] leading-[1.45] text-muted-foreground" />
    </Tile>
  );
}
