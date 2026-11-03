'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import type { Narrative } from '@/lib/utils/narrative';
import {
  SPENDING_CALENDAR_STEPS,
  daysInMonth,
  weekdayOf,
  type CalendarDay,
  type SpendingCalendar,
  type SpendingCalendarFilter,
  type SpendingStep,
} from '@/lib/utils/spendingCalendar';
import { calendarDayLabel, describeCalendarCell, weekdayName } from '@/lib/utils/analisiNarrative';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { MONTH_NAMES } from '@/lib/constants/months';
import { ROVING_ITEM_ATTRIBUTE, useRovingFocus } from '@/lib/hooks/useRovingFocus';
import { SegmentedPill } from '@/components/ui/segmented-pill';
import { Popover, PopoverContent } from '@/components/ui/popover';
import { Tile, type TileCollapse } from '@/components/ui/tile';
import { cn } from '@/lib/utils';

const FILTER_OPTIONS = [
  { value: 'all', label: 'Tutte' },
  { value: 'variable', label: 'Solo variabili' },
] as const;

const MONTH_LETTERS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'] as const;
/** Rows of the year grid labelled in the margin: lunedì, mercoledì, venerdì, domenica (D-CS: «L · M · V · D»). */
const YEAR_ROW_LABELS: Record<number, string> = { 0: 'L', 2: 'M', 4: 'V', 6: 'D' };
const WEEKDAY_HEADERS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'] as const;

/** The year grid's cell: 18px at most, 10px at least (below it the tile draws one month), 3px apart. */
const YEAR_CELL_MAX = 18;
const YEAR_CELL_MIN = 10;
const YEAR_GAP = 3;
const YEAR_LABEL_COLUMN = 22;

const euroCents = (value: number) => cachedFormatCurrencyEUR(value);
const euroWhole = (value: number) => cachedFormatCurrencyEUR(value, true);

/**
 * The cell's fill: `--flow-out` at the step's intensity over the card, so a change of period or
 * of filter fades from one colour to the next (`transition-colors`, the inline `color-mix` of
 * `heatmapCellStyle`). A past day with nothing spent is `--muted`; a scheduled day is a dashed
 * outline with diagonal strokes inside, no fill (D-CS5); a later day with nothing is an empty frame.
 */
export function calendarCellStyle(day: Pick<CalendarDay, 'step' | 'isFuture' | 'planned'>): CSSProperties {
  if (day.isFuture) {
    if (day.planned > 0) {
      return {
        border: '1.5px dashed var(--flow-out)',
        backgroundImage: 'repeating-linear-gradient(45deg, color-mix(in oklab, var(--flow-out) 30%, transparent) 0 2px, transparent 2px 5px)',
      };
    }
    return { border: '1px solid var(--border)' };
  }
  if (day.step === 0) return { backgroundColor: 'var(--muted)' };
  const { intensity } = SPENDING_CALENDAR_STEPS[day.step - 1];
  return { backgroundColor: `color-mix(in oklab, var(--flow-out) ${intensity}%, var(--card))` };
}

function stepSwatchStyle(step: SpendingStep): CSSProperties {
  return calendarCellStyle({ step, isFuture: false, planned: 0 });
}

/** The label of each step in the legend: its own limits, whole euros (they are borders, not spendings). */
function stepLabel(step: SpendingStep, [q1, q2, q3]: [number, number, number]): string {
  if (step === 1) return `fino a ${euroWhole(q1)}`;
  if (step === 2) return `${euroWhole(q1)}–${euroWhole(q2)}`;
  if (step === 3) return `${euroWhole(q2)}–${euroWhole(q3)}`;
  return `oltre ${euroWhole(q3)}`;
}

function Legend({ calendar, hasPlanned }: { calendar: SpendingCalendar; hasPlanned: boolean }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground" aria-hidden="true">
      <span className="flex items-center gap-1 whitespace-nowrap">
        <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={stepSwatchStyle(0)} />
        nessuna spesa
      </span>
      {calendar.thresholds &&
        calendar.stepsUsed.map((step) => (
          <span key={step} className="flex items-center gap-1 whitespace-nowrap">
            <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={stepSwatchStyle(step)} />
            <span className="font-mono tabular-nums">{stepLabel(step, calendar.thresholds as [number, number, number])}</span>
          </span>
        ))}
      {hasPlanned && (
        <span className="flex items-center gap-1 whitespace-nowrap">
          <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={calendarCellStyle({ step: 0, isFuture: true, planned: 1 })} />
          in calendario
        </span>
      )}
    </div>
  );
}

interface CalendarioTileProps {
  calendar: SpendingCalendar;
  filter: SpendingCalendarFilter;
  onFilterChange: (filter: SpendingCalendarFilter) => void;
  reading: Narrative;
  /** Today in the Italian calendar: the ring, and the month a phone opens on. */
  today: { year: number; month: number; day: number };
  /** The row below `desktop:` (`useMobileSections().collapse(id)`); `undefined` at 1440. */
  collapse?: TileCollapse;
  asideWhenClosed?: string;
  className?: string;
}

/**
 * «In quali giorni spendo, e c'è uno schema?» — one cell per day of the period, coloured by what was
 * spent (doc/calendario-spese/README.md). A year is the 53-week grid (columns = weeks from Monday)
 * when the cell can be 10px at least, otherwise — and always on a month — one calendar month at a
 * time, with ‹ › to move inside the period on a year. The scale is the period's, so two months
 * compare. The grid is ONE Tab stop (`useRovingFocus`): ←→ a day, ↑↓ a week, Enter or Space opens
 * the day in a popover beside the cell.
 */
export function CalendarioTile({ calendar, filter, onFilterChange, reading, today, collapse, asideWhenClosed, className }: CalendarioTileProps) {
  // The wrapper mounts only while the tile is open (a closed row holds no content), so it is state,
  // not a ref: the observer attaches whenever the element appears.
  const [wrapper, setWrapper] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const element = wrapper;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [wrapper]);

  const weekColumns = Math.ceil((calendar.startWeekday + calendar.days.length) / 7);
  const yearCell = width === null ? null : Math.min(YEAR_CELL_MAX, Math.floor((width - YEAR_LABEL_COLUMN - YEAR_GAP * weekColumns) / weekColumns));
  const showYear = calendar.kind === 'year' && yearCell !== null && yearCell >= YEAR_CELL_MIN;

  // The month a compact year shows: today's when the period holds it, else its last; moved by ‹ ›.
  const lastMonth = calendar.days[calendar.days.length - 1].month;
  const defaultMonth = calendar.year === today.year && today.month <= lastMonth ? today.month : lastMonth;
  const [override, setOverride] = useState<{ year: number; month: number } | null>(null);
  const viewMonth = calendar.kind === 'month' ? (calendar.month as number) : override && override.year === calendar.year ? Math.min(Math.max(override.month, 1), lastMonth) : defaultMonth;
  const monthMode = !showYear && width !== null;
  const visibleDays = monthMode ? calendar.days.filter((d) => d.month === viewMonth) : calendar.days;

  // The cells a keyboard can reach: every day but a later one with nothing in it.
  const interactive = visibleDays.filter((d) => !d.isFuture || d.planned > 0);
  const interactiveIndex = new Map(interactive.map((d, i) => [d.date, i]));
  const roving = useRovingFocus(interactive.length, 'both');

  const [selected, setSelected] = useState<string | null>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const selectedDay = selected ? calendar.days.find((d) => d.date === selected) ?? null : null;

  const select = (day: CalendarDay, element: HTMLElement) => {
    anchorRef.current = element;
    setSelected(day.date);
  };
  const closePopover = () => setSelected(null);

  const handleGridKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (!target.hasAttribute(ROVING_ITEM_ATTRIBUTE)) return;
    const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' ? 7 : event.key === 'ArrowUp' ? -7 : 0;
    if (delta === 0) {
      roving.containerProps.onKeyDown(event);
      return;
    }
    event.preventDefault();
    const from = visibleDays.findIndex((d) => d.date === target.dataset.date);
    const step = Math.sign(delta);
    // A week up or down lands on one cell; a day steps over what cannot be reached.
    let index = from + delta;
    while (index >= 0 && index < visibleDays.length) {
      const day = visibleDays[index];
      if (interactiveIndex.has(day.date)) {
        gridRef.current?.querySelector<HTMLElement>(`[data-date="${day.date}"]`)?.focus();
        return;
      }
      if (Math.abs(delta) === 7) return;
      index += step;
    }
  };

  const cellProps = (day: CalendarDay) => {
    const index = interactiveIndex.get(day.date);
    if (index === undefined) return null;
    return roving.itemProps(index);
  };

  const renderCell = (day: CalendarDay, className: string, children?: React.ReactNode) => {
    const props = cellProps(day);
    const style = calendarCellStyle(day);
    const common = cn('rounded-[3px] motion-safe:transition-colors motion-safe:duration-300', day.isToday && 'ring-2 ring-foreground ring-offset-1 ring-offset-card', className);
    if (!props) {
      return (
        <div key={day.date} data-date={day.date} className={common} style={{ ...style, ...placement(day) }}>
          <span className="sr-only">{describeCalendarCell(day)}</span>
        </div>
      );
    }
    return (
      <button
        key={day.date}
        type="button"
        {...props}
        data-date={day.date}
        aria-haspopup="dialog"
        aria-expanded={selected === day.date}
        onClick={(event) => select(day, event.currentTarget)}
        className={cn(common, 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card')}
        style={{ ...style, ...placement(day) }}
      >
        <span className="sr-only">{describeCalendarCell(day)}</span>
        {children}
      </button>
    );
  };

  // Year: columns are weeks (label column first), rows the weekdays under a row of month names.
  const yearPlacement = (day: CalendarDay): CSSProperties => {
    const index = calendar.startWeekday + calendar.days.indexOf(day);
    return { gridColumn: Math.floor(index / 7) + 2, gridRow: (index % 7) + 2 };
  };
  const monthPlacement = (day: CalendarDay): CSSProperties => {
    const index = weekdayOf(day.year, day.month, 1) + day.day - 1;
    return { gridColumn: (index % 7) + 1, gridRow: Math.floor(index / 7) + 2 };
  };
  function placement(day: CalendarDay): CSSProperties {
    return monthMode ? monthPlacement(day) : yearPlacement(day);
  }

  const hasPlanned = calendar.days.some((d) => d.planned > 0);
  const monthName = MONTH_NAMES[viewMonth - 1];
  const monthWeeks = Math.ceil((weekdayOf(calendar.year, viewMonth, 1) + daysInMonth(calendar.year, viewMonth)) / 7);

  return (
    <Tile
      eyebrow="Calendario delle spese"
      aside={calendar.kind === 'month' ? `${MONTH_NAMES[(calendar.month as number) - 1].toLowerCase()} ${calendar.year}` : String(calendar.year)}
      collapse={collapse}
      asideWhenClosed={asideWhenClosed}
      reading={reading}
      className={className}
    >
      <div className="mt-3">
        <SegmentedPill
          options={FILTER_OPTIONS}
          value={filter}
          onChange={onFilterChange}
          layoutId="calendario-filtro"
          ariaLabel="Quali spese contare"
          semantics="radio"
          optionClassName="max-desktop:min-h-11 max-desktop:py-2 text-[13px]"
        />
      </div>

      <div ref={setWrapper} className="mt-4">
        {monthMode && calendar.kind === 'year' && (
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Mese precedente"
              disabled={viewMonth <= 1}
              onClick={() => setOverride({ year: calendar.year, month: viewMonth - 1 })}
              className="flex size-11 items-center justify-center rounded-md text-lg text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              ‹
            </button>
            <span className="text-[13px] font-medium" aria-live="polite">
              {monthName} {calendar.year}
            </span>
            <button
              type="button"
              aria-label="Mese successivo"
              disabled={viewMonth >= lastMonth}
              onClick={() => setOverride({ year: calendar.year, month: viewMonth + 1 })}
              className="flex size-11 items-center justify-center rounded-md text-lg text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              ›
            </button>
          </div>
        )}

        {width !== null && (
          <div
            ref={gridRef}
            role="group"
            aria-label={monthMode ? `Spese di ${monthName.toLowerCase()} ${calendar.year}, giorno per giorno` : `Spese del ${calendar.year}, giorno per giorno`}
            onKeyDown={handleGridKeyDown}
            className={cn('grid', !monthMode && 'w-max')}
            style={
              monthMode
                ? { gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gridTemplateRows: `auto repeat(${monthWeeks}, auto)`, gap: YEAR_GAP }
                : {
                    gridTemplateColumns: `${YEAR_LABEL_COLUMN}px repeat(${weekColumns}, ${yearCell}px)`,
                    gridTemplateRows: `auto repeat(7, ${yearCell}px)`,
                    gap: YEAR_GAP,
                  }
            }
          >
            {monthMode
              ? WEEKDAY_HEADERS.map((letter, i) => (
                  <span key={i} aria-hidden="true" className="text-center font-mono text-[11px] text-muted-foreground" style={{ gridColumn: i + 1, gridRow: 1 }}>
                    {letter}
                  </span>
                ))
              : (
                <>
                  {Object.entries(YEAR_ROW_LABELS).map(([row, letter]) => (
                    <span key={row} aria-hidden="true" className="flex items-center font-mono text-[11px] text-muted-foreground" style={{ gridColumn: 1, gridRow: Number(row) + 2 }}>
                      {letter}
                    </span>
                  ))}
                  {calendar.days
                    .filter((d) => d.day === 1)
                    .map((d) => (
                      <span key={d.date} aria-hidden="true" className="whitespace-nowrap font-mono text-[11px] text-muted-foreground" style={{ gridColumn: `${Math.floor((calendar.startWeekday + calendar.days.indexOf(d)) / 7) + 2} / span 3`, gridRow: 1 }}>
                        {MONTH_LETTERS_SHORT[d.month - 1]}
                      </span>
                    ))}
                </>
              )}
            {visibleDays.map((day) =>
              renderCell(
                day,
                monthMode ? 'flex min-h-11 items-start justify-start p-1 text-left font-mono text-[11px] tabular-nums' : '',
                monthMode ? (
                  <span aria-hidden="true" className={cn(day.step === 4 && 'text-card')}>
                    {day.day}
                  </span>
                ) : undefined,
              ),
            )}
          </div>
        )}

        <Popover open={selectedDay !== null} onOpenChange={(open) => !open && closePopover()}>
          <PopoverPrimitive.Anchor virtualRef={anchorRef as React.RefObject<HTMLElement>} />
          <PopoverContent
            align="center"
            side="bottom"
            className="w-64"
            onCloseAutoFocus={(event) => {
              // No trigger to return to: the focus goes back to the cell the popover was opened from.
              event.preventDefault();
              (anchorRef.current as HTMLElement | null)?.focus();
            }}
          >
            {selectedDay && <DayPopover day={selectedDay} />}
          </PopoverContent>
        </Popover>
      </div>

      <Legend calendar={calendar} hasPlanned={hasPlanned} />
    </Tile>
  );
}

const POPOVER_LINES = 5;

function DayPopover({ day }: { day: CalendarDay }) {
  const future = day.isFuture;
  const total = future ? day.planned : day.total;
  const shown = day.lines.slice(0, POPOVER_LINES);
  const hidden = day.lines.length - shown.length;
  return (
    <div>
      <p className="text-[13px] font-medium">
        {weekdayName(day.weekday)} {calendarDayLabel(day.day, day.month)}
      </p>
      <p className="mt-0.5 text-[13px] text-muted-foreground">
        {total > 0 ? (
          <>
            {future ? 'In calendario ' : 'Speso '}
            <span className="font-mono tabular-nums text-foreground">{euroCents(total)}</span>
          </>
        ) : (
          'Nessuna spesa.'
        )}
      </p>
      {shown.length > 0 && (
        <ul className="mt-2 space-y-1">
          {shown.map((line) => (
            <li key={line.id} className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate">{line.label}</span>
              <span className="shrink-0 font-mono tabular-nums">{euroCents(line.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      {hidden > 0 && <p className="mt-1 text-[12px] text-muted-foreground">e altre {hidden}</p>}
    </div>
  );
}
