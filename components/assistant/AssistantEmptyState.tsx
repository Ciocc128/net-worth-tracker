'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { AssistantMemoryFacts } from '@/components/assistant/AssistantMemoryFacts';
import { AssistantPromptChips } from '@/components/assistant/AssistantPromptChips';
import { AssistantMemoryDocument, AssistantMode, AssistantPromptChip } from '@/types/assistant';

interface AssistantEmptyStateProps {
  /** Period-phrased question, e.g. "Cosa vuoi sapere su Luglio 2026?". */
  question: string;
  mode: AssistantMode;
  chips: AssistantPromptChip[];
  onChipSelect: (chip: AssistantPromptChip) => void;
  disabled?: boolean;
  memory: AssistantMemoryDocument | undefined;
  onOpenMemory: () => void;
}

/**
 * The hero card's empty state — the page's front door when no conversation is
 * active. One hierarchy instead of the former five stacked blocks: the
 * period-phrased question leads, the suggestion matching the active period is
 * the primary affordance, the remaining chips follow, and the memory facts sit
 * last as quiet grounding. The old "Riprendi conversazione" list is gone — the
 * Conversazioni sheet is the single representation of threads.
 */
export function AssistantEmptyState({
  question,
  mode,
  chips,
  onChipSelect,
  disabled,
  memory,
  onOpenMemory,
}: AssistantEmptyStateProps) {
  const prefersReducedMotion = useReducedMotion();

  // The chip that targets the active period is promoted to primary suggestion;
  // every other chip stays a quiet secondary affordance.
  const primaryChip = chips.find((chip) => chip.mode === mode);
  const secondaryChips = primaryChip ? chips.filter((chip) => chip.id !== primaryChip.id) : chips;

  return (
    <div className="rounded-2xl border border-border bg-card p-[22px]">
      {/* The question crossfades on period switch so the change registers as a
          deliberate context shift, not a text flicker. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.h2
          key={question}
          className="text-xl font-semibold tracking-[-0.01em] text-foreground"
          initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -4 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          {question}
        </motion.h2>
      </AnimatePresence>

      <div className="mt-4 space-y-3">
        {primaryChip && (
          <button
            type="button"
            onClick={() => onChipSelect(primaryChip)}
            disabled={disabled}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
            {primaryChip.label}
          </button>
        )}

        <AssistantPromptChips chips={secondaryChips} onSelect={onChipSelect} disabled={disabled} />
      </div>

      {/* What the assistant already knows — grounding, not a call to action.
          The wrapper is gated on active items, or its divider would underline nothing
          (AssistantMemoryFacts renders null on an empty memory). */}
      {memory && memory.items.some((item) => item.status === 'active') && (
        <div className="mt-5 border-t border-border/40 pt-4">
          <AssistantMemoryFacts memory={memory} onOpenMemory={onOpenMemory} />
        </div>
      )}
    </div>
  );
}
