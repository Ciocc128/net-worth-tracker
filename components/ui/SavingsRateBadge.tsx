'use client';

/**
 * SAVINGS RATE CELEBRATION BADGE
 *
 * Appears once per calendar month — on the first visit of the month — when last month's
 * savings rate exceeds the threshold. Auto-dismisses after 3 seconds, or immediately when the
 * user closes it.
 *
 * SHOW LOGIC lives in `lib/utils/savingsRateBadge.ts` (`shouldShowSavingsBadge`): previous-month
 * income > 0, rate >= threshold, day of month >= 5 (earlier data is partial), no reduced-motion
 * preference, and the celebrated month not yet recorded for this account.
 *
 * WHY localStorage (via `celebrationUtils`) keyed on account + month, not sessionStorage:
 * the original "once per browser session" flag was lost with every new tab or window, so the
 * badge greeted the user on every login. The celebration is a fact about a MONTH, so the
 * record must outlive the session and must change identity when the month does — the key
 * carries `YYYY-MM`, which is what makes the badge reappear exactly once next month.
 *
 * AUTO-DISMISS (gotcha):
 * The dismiss timer lives in its OWN effect keyed on `visible` — NOT in the show-decision
 * effect. The show effect depends on the cashflow props, which change whenever React Query
 * refetches the overview; a timer armed there would be cleared by that refetch, the re-run
 * would hit the already-celebrated guard and return without re-arming, and the badge would
 * stick until a manual refresh.
 *
 * TESTING:
 * To force the badge: DevTools → Application → Local Storage → delete the
 * `celebrated_savings_rate_<ownerId>_<YYYY-MM>` entry, then reload.
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { hasCelebrated, markCelebrated, shouldReduceMotion } from '@/lib/utils/celebrationUtils';
import {
  buildSavingsBadgeCelebrationKey,
  computeSavingsRate,
  resolveCelebratedMonth,
  shouldShowSavingsBadge,
} from '@/lib/utils/savingsRateBadge';

const AUTO_DISMISS_MS = 3000;

interface SavingsRateBadgeProps {
  /** The account whose cashflow is displayed — scopes the once-per-month record. */
  ownerId: string;
  previousMonthIncome: number;
  previousMonthExpenses: number;
}

export function SavingsRateBadge({
  ownerId,
  previousMonthIncome,
  previousMonthExpenses,
}: SavingsRateBadgeProps) {
  const [visible, setVisible] = useState(false);
  // Guard against triggering twice within the same component lifecycle (Strict Mode re-runs)
  const triggered = useRef(false);

  const savingsRate = computeSavingsRate(previousMonthIncome, previousMonthExpenses);

  // ─── Show decision — runs when the underlying data settles ───────────────────
  useEffect(() => {
    if (triggered.current) return;

    const now = new Date();
    const celebrated = resolveCelebratedMonth(now);
    const celebrationKey = buildSavingsBadgeCelebrationKey(ownerId, celebrated);

    const show = shouldShowSavingsBadge({
      previousMonthIncome,
      savingsRate,
      now,
      alreadyCelebrated: hasCelebrated(celebrationKey),
      reducedMotion: shouldReduceMotion(),
    });
    if (!show) return;

    triggered.current = true;
    markCelebrated(celebrationKey);
    // Deferred so the effect never sets state synchronously (react-hooks/set-state-in-effect).
    const reveal = setTimeout(() => setVisible(true), 0);
    return () => clearTimeout(reveal);
  }, [ownerId, previousMonthIncome, savingsRate]);

  // ─── Auto-dismiss — armed only while visible, independent of data deps ───────
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  const celebratedMonthName = resolveCelebratedMonth(new Date()).name;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="savings-badge"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="bg-positive/10 border-positive/20 fixed bottom-4 left-4 z-50 flex max-w-[300px] items-start gap-3 rounded-lg border px-4 py-3 shadow-lg"
        >
          <div className="min-w-0">
            <p className="text-positive text-sm font-semibold">
              ✦ Ottimo risparmio a {celebratedMonthName}!
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Hai risparmiato il {savingsRate.toFixed(0)}% delle entrate
            </p>
          </div>
          <button
            type="button"
            onClick={() => setVisible(false)}
            aria-label="Chiudi notifica"
            className="text-muted-foreground hover:text-foreground -mr-1 -mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md transition-colors"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
