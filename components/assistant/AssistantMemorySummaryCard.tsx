'use client';

import { Brain, ChevronRight } from 'lucide-react';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { AssistantMemoryDocument, AssistantMemoryItem } from '@/types/assistant';

interface AssistantMemorySummaryCardProps {
  memory: AssistantMemoryDocument | undefined;
  /** Opens the full Memoria sheet — the single place where items are managed. */
  onOpenMemory: () => void;
}

/**
 * Companion-card extract of the assistant's memory: active goals with their
 * latest evaluation, plus a count of the remaining facts. After the
 * structured-goals work the memory panel carries real state, so it earns a
 * visible presence on the page instead of living only behind a hidden sheet.
 *
 * Read-only by design — managing items stays in the Memoria sheet; this card
 * only surfaces what already grounds the answers.
 */
export function AssistantMemorySummaryCard({ memory, onOpenMemory }: AssistantMemorySummaryCardProps) {
  const activeItems = (memory?.items ?? []).filter((item) => item.status === 'active');
  const goals = activeItems.filter((item) => item.category === 'goal');
  const otherFactsCount = activeItems.length - goals.length;

  // Nothing learned yet: state the absence instead of rendering empty chrome.
  if (activeItems.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Memoria e obiettivi
        </p>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Nessun fatto in memoria. L&apos;assistente impara dagli obiettivi e dalle preferenze che
          dichiari in conversazione.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Memoria e obiettivi
        </p>
        <Brain className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      </div>

      {goals.length > 0 && (
        <div className="divide-y divide-border/50">
          {goals.map((goal) => (
            <GoalRow key={goal.id} goal={goal} />
          ))}
        </div>
      )}

      {/* Footer: remaining fact count + the one action (open the sheet). */}
      <div className="flex items-center justify-between gap-2 border-t border-border/50 px-4 py-2.5">
        <span className="text-[11px] text-muted-foreground">
          {otherFactsCount > 0
            ? `${otherFactsCount} ${otherFactsCount === 1 ? 'altro fatto' : 'altri fatti'} in memoria`
            : goals.length === 1
              ? '1 obiettivo attivo'
              : `${goals.length} obiettivi attivi`}
        </span>
        <button
          type="button"
          onClick={onOpenMemory}
          className="inline-flex items-center gap-0.5 rounded text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          Apri memoria
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/**
 * One active goal as a flat row: text left, evaluation state right.
 * The evaluation is the last stored one (always computed against the current
 * month, server-side) — the row never recomputes anything.
 */
function GoalRow({ goal }: { goal: AssistantMemoryItem }) {
  const evaluation = goal.lastEvaluationResult;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="min-w-0 truncate text-[13px] text-foreground" title={goal.text}>
        {goal.text}
      </span>
      {evaluation ? (
        evaluation.matched ? (
          <span className="shrink-0 text-[11px] font-medium text-positive">Raggiunto</span>
        ) : (
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
            {formatEvaluationProgress(evaluation.metricValue, evaluation.targetValue, evaluation.unit)}
          </span>
        )
      ) : (
        // A goal without structure is legitimate — say it is not auto-trackable
        // instead of leaving it indistinguishable from one that is one euro short.
        <span className="shrink-0 text-[11px] text-muted-foreground/70">Non tracciato</span>
      )}
    </div>
  );
}

/** "current / target" in the goal's own unit; a null metric reads as an absence, not a zero. */
function formatEvaluationProgress(
  metricValue: number | null,
  targetValue: number,
  unit: 'eur' | 'percent'
): string {
  const fmt = (value: number) =>
    unit === 'percent' ? `${value.toFixed(1)}%` : cachedFormatCurrencyEUR(value, true);
  if (metricValue === null) return `— / ${fmt(targetValue)}`;
  return `${fmt(metricValue)} / ${fmt(targetValue)}`;
}
