'use client';

/**
 * REDDITO PASSIVO — «quanto potrei prelevare oggi?»: the annual allowance at the SWR as the
 * tile's figure, then the same money per month and per day, the years of expenses the net worth
 * covers (with the liquid and illiquid split inline) and the distance from full cover in euros a
 * year (FEAT FIRE, 2026-10-05: it replaced «Prelievo attuale», a percentage to compare by heart
 * with the SWR). The distance stays in income and never becomes a missing capital: that would be
 * a fifth «FIRE number» next to the Traguardo's. No figure here carries a sign colour.
 *
 * The old companion card carried the same rows; what changed is the cadence (eyebrow, reading,
 * figure, flat rows) and the source: every number is `summarizePassiveIncome(metrics)`.
 */

import type { ReactNode } from 'react';
import type { Narrative } from '@/lib/utils/narrative';
import type { PassiveIncome } from '@/lib/utils/fireSummary';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { formatCurrency } from '@/lib/services/chartService';
import { formatRate } from '@/lib/utils/fireNarrative';
import { cn } from '@/lib/utils';
import { Tile } from '@/components/ui/tile';
import { SettledCurrencyValue } from '@/components/fire-simulations/SettledValue';

interface RedditoPassivoTileProps {
  reading: Narrative;
  income: PassiveIncome;
  className?: string;
}

function Row({ label, caption, value, valueClass }: { label: string; caption?: string; value: ReactNode; valueClass?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-[9px]">
      <span className="min-w-0">
        <span className="block text-[13px] text-muted-foreground">{label}</span>
        {caption && <span className="block text-[11px] leading-[1.4] text-muted-foreground">{caption}</span>}
      </span>
      <span className={cn('shrink-0 text-right font-mono text-[14px] tabular-nums text-foreground', valueClass)}>{value}</span>
    </div>
  );
}

const oneDecimal = (value: number) => value.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function RedditoPassivoTile({ reading, income, className }: RedditoPassivoTileProps) {
  const split = [
    income.liquidYears > 0 ? `${oneDecimal(income.liquidYears)} liquidi` : null,
    income.illiquidYears > 0 ? `${oneDecimal(income.illiquidYears)} illiquidi` : null,
  ].filter((part): part is string => part !== null);

  return (
    <Tile eyebrow="Reddito passivo" aside={`oggi, al ${formatRate(income.swr)}`} reading={reading} ariaLabel="Reddito passivo sostenibile" className={className}>
      <div className="mt-3 flex items-baseline gap-2">
        <SettledCurrencyValue value={income.annual} compact className="font-mono text-[22px] font-bold leading-none tracking-[-0.03em] tabular-nums text-foreground" />
        <span className="text-[11px] text-muted-foreground">all&apos;anno</span>
      </div>

      <div className="mt-2.5 flex flex-col divide-y divide-border">
        <Row label="Al mese" value={cachedFormatCurrencyEUR(income.monthly, true)} />
        {/* The liquid/illiquid split is the row's caption, not part of the value: inline it widened
            the value cell until the label wrapped under it («Anni di spesa / coperti», 2026-09-22). */}
        <Row
          label="Anni di spesa coperti"
          caption={split.length > 0 ? split.join(' · ') : undefined}
          value={income.yearsOfExpenses > 0 ? oneDecimal(income.yearsOfExpenses) : '—'}
        />
        {income.shortfallAnnual !== null && income.shortfallAnnual > 0 && (
          <Row
            label="Mancano alla copertura piena"
            caption={`${cachedFormatCurrencyEUR(income.shortfallAnnual / 12, true)} al mese, su ${cachedFormatCurrencyEUR(income.annualExpenses, true)} di spese`}
            value={<>{cachedFormatCurrencyEUR(income.shortfallAnnual, true)} <span className="text-[11px] font-normal text-muted-foreground">all&apos;anno</span></>}
          />
        )}
        {income.shortfallAnnual === 0 && (
          <Row
            label="Copertura piena"
            caption={`le spese sono di ${cachedFormatCurrencyEUR(income.annualExpenses, true)} all'anno`}
            value={
              income.surplusAnnual !== null && income.surplusAnnual > 0 ? (
                <>
                  {cachedFormatCurrencyEUR(income.surplusAnnual, true)} <span className="text-[11px] font-normal text-muted-foreground">avanzano</span>
                </>
              ) : (
                'esatta'
              )
            }
          />
        )}
      </div>
    </Tile>
  );
}
