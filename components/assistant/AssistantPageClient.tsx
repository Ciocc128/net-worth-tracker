'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AssistantComposer } from '@/components/assistant/AssistantComposer';
import { AssistantContextCard, AssistantContextCardSkeleton } from '@/components/assistant/AssistantContextCard';
import { AssistantConversationPanel } from '@/components/assistant/AssistantConversationPanel';
import { AssistantEmptyState } from '@/components/assistant/AssistantEmptyState';
import { AssistantHeader } from '@/components/assistant/AssistantHeader';
import { AssistantLockedState } from '@/components/assistant/AssistantLockedState';
import { AssistantMemorySummaryCard } from '@/components/assistant/AssistantMemorySummaryCard';
import { AssistantPageSkeleton } from '@/components/assistant/AssistantPageSkeleton';
import { AssistantPatrimonioTodayCard } from '@/components/assistant/AssistantPatrimonioTodayCard';
import { AssistantPeriodSelector } from '@/components/assistant/AssistantPeriodSelector';
import { AssistantSheets } from '@/components/assistant/AssistantSheets';
import { AssistantSuggestionsBanner } from '@/components/assistant/AssistantSuggestionsBanner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { useDemoMode } from '@/lib/hooks/useDemoMode';
import { useDashboardOverview } from '@/lib/hooks/useDashboardOverview';
import { useAssistantMemory, useUpdateAssistantMemory } from '@/lib/hooks/useAssistantMemory';
import { useAssistantPeriodContext } from '@/lib/hooks/useAssistantPeriodContext';
import { useAssistantStreaming } from '@/lib/hooks/useAssistantStreaming';
import { useAssistantThread, useAssistantThreads, useDeleteAssistantThread } from '@/lib/hooks/useAssistantThreads';
import { assistantPromptChips } from '@/lib/constants/assistantPrompts';
import { buildFollowUpSuggestions } from '@/lib/utils/assistantFollowUps';
import {
  buildComposerPlaceholder,
  buildEmptyStateQuestion,
  buildMonthOptions,
  buildYearOptions,
  findThreadForPeriod,
  getActivePeriodLabel,
  getPreviousCompletedMonth,
  resolveAssistantPreviewMode,
} from '@/lib/utils/assistantPeriodOptions';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';
import { MONTH_NAMES } from '@/lib/constants/months';
import {
  AssistantChatContextType,
  AssistantMode,
  AssistantMonthSelectorValue,
  AssistantPromptChip,
  AssistantThread,
} from '@/types/assistant';

interface AssistantPageClientProps {
  assistantConfigured: boolean;
}

/**
 * Orchestrator for the Assistente page shell: period axis, thread and
 * memory queries, and the hero grid [2fr_1fr] — conversational heart left,
 * companion context (scheda + memoria/obiettivi) right. Streaming state and the
 * SSE lifecycle live in useAssistantStreaming; every visual block is an
 * extracted module-level component.
 */
export function AssistantPageClient({ assistantConfigured }: AssistantPageClientProps) {
  const { ownerId } = useActiveAccount();
  const isDemo = useDemoMode();
  const conversationEndRef = useRef<HTMLDivElement>(null);

  // Italy current month/year — stable for the session
  const { year: currentYear } = useMemo(() => getItalyMonthYear(new Date()), []);

  // Month and year options are stable for the session — computed once on mount
  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const yearOptions = useMemo(() => buildYearOptions(), []);

  const [selectedThreadId, setSelectedThreadId] = useState<string>();
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<AssistantMode>('month_analysis');
  const [selectedMonth, setSelectedMonth] = useState<AssistantMonthSelectorValue>(
    // Default to the last completed month — it always has data, so the period
    // scheda and composer are usable from the first render (see getPreviousCompletedMonth).
    () => getPreviousCompletedMonth()
  );
  const [selectedYear, setSelectedYear] = useState<number>(() => getItalyMonthYear(new Date()).year);
  // Optional period attached to a free (Libera) question — drives both the scheda
  // preview and what numeric bundle the server builds for the chat answer.
  const [chatContextType, setChatContextType] = useState<AssistantChatContextType>('none');

  // Sheets are controlled here because more than one surface opens them: the
  // header icons, the empty state's "+N altri" and the companion memory card.
  const [isThreadSheetOpen, setIsThreadSheetOpen] = useState(false);
  const [isMemorySheetOpen, setIsMemorySheetOpen] = useState(false);

  // Dashboard overview — used to source the current net worth for the "patrimonio oggi" scheda.
  // Reuses the React Query cache from Panoramica if the user visited it this session,
  // so in practice this is a cache hit and adds no network latency.
  const { data: overviewData } = useDashboardOverview(ownerId);

  const { data: threads = [], isLoading: loadingThreads, error: threadsError } = useAssistantThreads(ownerId);
  const { data: threadDetail, isLoading: loadingThreadDetail, error: threadError } = useAssistantThread(
    selectedThreadId,
    ownerId
  );
  const { data: memory, isLoading: loadingMemory, error: memoryError } = useAssistantMemory(ownerId);
  const updateMemoryMutation = useUpdateAssistantMemory(ownerId ?? '');
  const deleteThreadMutation = useDeleteAssistantThread(ownerId ?? '');

  // ── Streaming engine (extracted verbatim from the former monolith) ──
  const streaming = useAssistantStreaming({
    ownerId,
    selectedThreadId,
    onThreadIdResolved: setSelectedThreadId,
    draft,
    onDraftConsumed: () => setDraft(''),
    threadMessages: threadDetail?.messages,
    mode,
    selectedMonth,
    selectedYear,
    chatContextType,
    preferences: memory?.preferences,
  });

  const {
    streamingMessages,
    renderedMessages,
    streamingMessageId,
    isStreaming,
    isInterrupted,
    isSlowResponse,
    streamStatus,
    contextBundle,
    setContextBundle,
  } = streaming;

  // Effective period for the context scheda: a loaded thread pins its own period;
  // otherwise the live selector drives a preview so the scheda fills in *before* the
  // first question is asked.
  const hasActiveThread = !!selectedThreadId;
  const pinnedMonth = threadDetail?.thread.pinnedMonth ?? null;
  const pinnedYear = threadDetail?.thread.pinnedYear ?? null;
  const threadMode = threadDetail?.thread.mode ?? mode;
  const previewMode = hasActiveThread ? threadMode : resolveAssistantPreviewMode(mode, chatContextType);
  const previewMonth = hasActiveThread ? pinnedMonth : selectedMonth;
  const previewYear = hasActiveThread ? pinnedYear : selectedYear;

  // Fetch the context bundle whenever a period is selected and no SSE bundle is active.
  // SSE bundle always takes priority over the fetched one. Free (chat) mode has no
  // numeric period, so it never fetches — the "patrimonio oggi" card stands in instead.
  const shouldFetchContext =
    streamingMessages.length === 0 &&
    contextBundle === null &&
    (
      (previewMode === 'month_analysis' && previewMonth !== null) ||
      (previewMode === 'year_analysis' && previewYear !== null) ||
      previewMode === 'ytd_analysis' ||
      previewMode === 'history_analysis'
    );

  const { data: fetchedContextBundle, isLoading: loadingContextBundle } = useAssistantPeriodContext(
    shouldFetchContext ? ownerId : undefined,
    previewMode,
    previewMonth,
    previewYear,
    currentYear,
    // history start year: the hook fetches it server-side; pass 0 as placeholder key
    0,
    shouldFetchContext
  );

  // Populate the context panel from the fetched bundle when no SSE bundle is present.
  // SSE bundle (set by the streaming hook) always takes priority — this effect
  // only fires when contextBundle is still null.
  useEffect(() => {
    if (fetchedContextBundle && contextBundle === null) {
      setContextBundle(fetchedContextBundle);
    }
  }, [fetchedContextBundle]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow-up chips: shown after a completed assistant answer, derived purely
  // from the answer's mode + the period bundle. Hidden while streaming.
  const followUps = useMemo(() => {
    const last = renderedMessages[renderedMessages.length - 1];
    const isComplete = !isStreaming && streamingMessageId === undefined && !isInterrupted;
    if (!isComplete || !last || last.role !== 'assistant' || last.content.trim().length === 0) {
      return [];
    }
    return buildFollowUpSuggestions(last.mode, contextBundle);
  }, [renderedMessages, isStreaming, streamingMessageId, isInterrupted, contextBundle]);

  // Sync mode and period picker to the loaded thread so the UI stays coherent
  // with the conversation being shown. Runs when threadDetail resolves, but not
  // during streaming (streamingMessages.length > 0) to avoid disrupting active input.
  useEffect(() => {
    if (!threadDetail || streamingMessages.length > 0) {
      return;
    }
    // Deferred with setTimeout(0) so the sync happens outside the effect body
    // (react-hooks/set-state-in-effect) — the selection is user-editable state
    // that must ALSO follow the loaded thread, so it cannot be purely derived.
    const timer = setTimeout(() => {
      setMode(threadDetail.thread.mode);
      if (threadDetail.thread.pinnedMonth) {
        setSelectedMonth(threadDetail.thread.pinnedMonth);
      }
      if (threadDetail.thread.pinnedYear) {
        setSelectedYear(threadDetail.thread.pinnedYear);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [threadDetail]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to the bottom when messages are available, but not while the thread
  // is still loading — scrolling to an empty area before content arrives feels jarring.
  // During streaming use instant scroll so new tokens stay visible without jank:
  // smooth scroll on every token triggers continuous CSS animation on slow devices.
  useEffect(() => {
    if (renderedMessages.length === 0) return;
    if (loadingThreadDetail && !isStreaming) return;
    const el = conversationEndRef.current;
    if (!el) return;
    if (isStreaming) {
      el.scrollIntoView({ behavior: 'instant' });
    } else {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }, [renderedMessages, loadingThreadDetail, isStreaming]);

  // CTA is disabled when month_analysis mode has no data available to analyse.
  const isAnalysisBlocked = useMemo(
    () =>
      mode === 'month_analysis' &&
      contextBundle !== null &&
      !contextBundle.dataQuality.hasSnapshot &&
      !contextBundle.dataQuality.hasCashflowData,
    [mode, contextBundle]
  );

  const canSubmit = draft.trim().length > 0 && !isStreaming && !isAnalysisBlocked;

  const heroNetWorth = overviewData?.metrics.netTotal ?? null;
  const heroVariation = overviewData?.variations.monthly ?? null;

  const handleModeChange = (newMode: AssistantMode) => {
    if (isStreaming) return;
    setMode(newMode);
    // Reset the bundle so the period scheda re-fetches the new period's preview.
    setContextBundle(null);
    // Auto-select an existing thread matching the new mode + period — explicit
    // user action only, scanning the already-loaded list (no extra fetch).
    const match = findThreadForPeriod(threads, newMode, selectedMonth, selectedYear);
    if (match) {
      setSelectedThreadId(match.id);
      streaming.resetStream();
      // Thread sync useEffect will update mode/month/year when threadDetail resolves
    }
  };

  // Period sub-picker changes refresh the live preview only when no conversation is
  // active; mid-thread the value is still captured for the next submit, as before.
  const handleMonthChange = (month: AssistantMonthSelectorValue) => {
    setSelectedMonth(month);
    if (renderedMessages.length === 0) setContextBundle(null);
  };

  const handleYearChange = (year: number) => {
    setSelectedYear(year);
    if (renderedMessages.length === 0) setContextBundle(null);
  };

  // Attaching/detaching a period to a Libera question re-fetches the scheda preview.
  const handleChatContextChange = (type: AssistantChatContextType) => {
    setChatContextType(type);
    if (renderedMessages.length === 0) setContextBundle(null);
  };

  // Starter chips prefill the composer (so the user can confirm the period before sending).
  const handleChipClick = (chip: AssistantPromptChip) => {
    setMode(chip.mode);
    setContextBundle(null);
    setDraft(chip.prompt);
  };

  const handlePreferencesChange = async (
    patch: Partial<NonNullable<typeof memory>['preferences']>
  ) => {
    if (!ownerId) return;
    try {
      await updateMemoryMutation.mutateAsync({ preferences: patch });
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  // Deselects the current thread so the empty state reappears and the next
  // submit creates a fresh thread server-side (threadId omitted from the request).
  const handleNewThread = () => {
    setSelectedThreadId(undefined);
    streaming.resetStream();
    setContextBundle(null);
    setDraft('');
  };

  const handleSelectThread = (thread: AssistantThread) => {
    setSelectedThreadId(thread.id);
    streaming.resetStream();
    setContextBundle(null);
    setMode(thread.mode);
    if (thread.pinnedMonth) setSelectedMonth(thread.pinnedMonth);
    if (thread.pinnedYear) setSelectedYear(thread.pinnedYear);
  };

  const handleDeleteThread = async (threadId: string) => {
    try {
      await deleteThreadMutation.mutateAsync(threadId);
      // If the deleted thread was selected, return to empty state
      if (selectedThreadId === threadId) {
        handleNewThread();
      }
      toast.success('Conversazione eliminata');
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const activePeriodLabel = getActivePeriodLabel(mode, selectedMonth, selectedYear);
  const activeMonthLabel = `${MONTH_NAMES[selectedMonth.month - 1]} ${selectedMonth.year}`;
  const composerPlaceholder = buildComposerPlaceholder(mode, chatContextType, selectedMonth, selectedYear);
  const emptyStateQuestion = buildEmptyStateQuestion(mode, selectedMonth, selectedYear);

  const composerErrorHint = isAnalysisBlocked
    ? `Nessun dato disponibile per ${activeMonthLabel}. Seleziona un altro periodo.`
    : undefined;

  const activeMemoryCount = (memory?.items ?? []).filter((i) => i.status === 'active').length;
  const isEmptyState = renderedMessages.length === 0 && !selectedThreadId && !loadingThreadDetail;

  // Renders the period scheda (numeric grounding for the selected period).
  // Reused on desktop (companion column) and mobile (inside the empty state).
  const renderPeriodScheda = () => {
    if (contextBundle) return <AssistantContextCard bundle={contextBundle} />;
    if (loadingContextBundle) return <AssistantContextCardSkeleton />;
    // Free question with no period attached → show net worth today as grounding.
    if (mode === 'chat' && chatContextType === 'none') {
      return <AssistantPatrimonioTodayCard netWorth={heroNetWorth} variation={heroVariation} />;
    }
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {activePeriodLabel}
        </p>
        <p className="text-xs text-muted-foreground">Nessun dato disponibile per questo periodo.</p>
      </div>
    );
  };

  // Show skeleton while threads resolve on first load
  if (loadingThreads) {
    return (
      <ProtectedRoute>
        <AssistantPageSkeleton />
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      {/* max-desktop:portrait:pb-20 provides clearance for the fixed bottom navigation on mobile portrait */}
      <div className="space-y-4 max-desktop:portrait:pb-20">
        <AssistantHeader
          isDemo={isDemo}
          isStreaming={isStreaming}
          threadsCount={threads.length}
          activeMemoryCount={activeMemoryCount}
          memory={memory}
          loadingMemory={loadingMemory}
          isPreferencesPending={updateMemoryMutation.isPending}
          onPreferencesChange={handlePreferencesChange}
          onNewThread={handleNewThread}
          onOpenThreads={() => setIsThreadSheetOpen(true)}
          onOpenMemory={() => setIsMemorySheetOpen(true)}
        />

        <AssistantSheets
          ownerId={ownerId}
          isThreadSheetOpen={isThreadSheetOpen}
          onThreadSheetOpenChange={setIsThreadSheetOpen}
          isMemorySheetOpen={isMemorySheetOpen}
          onMemorySheetOpenChange={setIsMemorySheetOpen}
          threads={threads}
          loadingThreads={loadingThreads}
          selectedThreadId={selectedThreadId}
          isStreaming={isStreaming}
          isDeletingId={deleteThreadMutation.variables as string | undefined}
          onSelectThread={handleSelectThread}
          onDeleteThread={handleDeleteThread}
          memory={memory}
          loadingMemory={loadingMemory}
        />

        {isDemo ? (
          <AssistantLockedState
            title="Non disponibile in modalità demo"
            description="L'Assistente AI non è accessibile nell'account demo."
          />
        ) : !assistantConfigured ? (
          <AssistantLockedState
            title="Servizio AI non configurato"
            description="La pagina resta accessibile, ma per usare l'assistente devi configurare ANTHROPIC_API_KEY nell'ambiente."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 desktop:grid-cols-[2fr_1fr]">
            {/* ── Hero left: the conversational heart ── */}
            <div className="flex min-w-0 flex-col">
              {/* Single period axis */}
              <div className="mb-4">
                <AssistantPeriodSelector
                  mode={mode}
                  onModeChange={handleModeChange}
                  selectedMonth={selectedMonth}
                  monthOptions={monthOptions}
                  onMonthChange={handleMonthChange}
                  selectedYear={selectedYear}
                  yearOptions={yearOptions}
                  onYearChange={handleYearChange}
                  chatContextType={chatContextType}
                  onChatContextTypeChange={handleChatContextChange}
                  disabled={isStreaming}
                />
              </div>

              {/* Proactive goal-completion banner — visible in any state. */}
              {ownerId && (
                <AssistantSuggestionsBanner userId={ownerId} memory={memory} disabled={isStreaming} />
              )}

              {isEmptyState ? (
                <>
                  <AssistantEmptyState
                    question={emptyStateQuestion}
                    mode={mode}
                    chips={assistantPromptChips}
                    onChipSelect={handleChipClick}
                    disabled={isStreaming}
                    memory={memory}
                    onOpenMemory={() => setIsMemorySheetOpen(true)}
                  />
                  {/* Mobile-only scheda — numeric grounding below the question where
                      there is no companion column. A sibling, never inside the card
                      (bg-card inside bg-card is the card-in-card violation). */}
                  <div className="desktop:hidden mt-4">{renderPeriodScheda()}</div>
                </>
              ) : (
                <AssistantConversationPanel
                  activePeriodLabel={activePeriodLabel}
                  contextBundle={contextBundle}
                  renderedMessages={renderedMessages}
                  loadingThreadDetail={loadingThreadDetail}
                  hasSelectedThread={!!selectedThreadId}
                  isStreaming={isStreaming}
                  streamStatus={streamStatus}
                  isSlowResponse={isSlowResponse}
                  isInterrupted={isInterrupted}
                  streamingMessageId={streamingMessageId}
                  followUps={followUps}
                  onRetry={streaming.retry}
                  onFollowUpSelect={(prompt) => streaming.submit(prompt)}
                  conversationEndRef={conversationEndRef}
                />
              )}

              {/* Sticky composer — stays at bottom of viewport as conversation grows */}
              <div className="sticky bottom-0 max-desktop:portrait:bottom-20 z-10">
                <AssistantComposer
                  draft={draft}
                  onChange={setDraft}
                  onSubmit={streaming.submit}
                  onStop={streaming.stop}
                  isStreaming={isStreaming}
                  canSubmit={canSubmit}
                  placeholder={composerPlaceholder}
                  errorHint={composerErrorHint}
                />
              </div>
            </div>

            {/* ── Hero right: companion context, sticky (self-start so it can travel) ── */}
            <div className="hidden desktop:flex desktop:flex-col desktop:gap-4 desktop:self-start desktop:sticky desktop:top-6">
              {/* Period scheda — the numeric grounding for the selected period. */}
              <div>{renderPeriodScheda()}</div>

              {/* Memoria e obiettivi — visible extract; management stays in the sheet. */}
              <AssistantMemorySummaryCard memory={memory} onOpenMemory={() => setIsMemorySheetOpen(true)} />

              {/* Query-level error callout */}
              {(threadsError || threadError || memoryError) && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {(threadsError || threadError || memoryError)?.message}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
