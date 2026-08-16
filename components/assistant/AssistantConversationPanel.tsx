'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Globe, Loader2, MessageSquare } from 'lucide-react';
import { AssistantContextPill } from '@/components/assistant/AssistantContextCard';
import { AssistantFollowUps } from '@/components/assistant/AssistantFollowUps';
import { AssistantStreamingResponse } from '@/components/assistant/AssistantStreamingResponse';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { AssistantFollowUp } from '@/lib/utils/assistantFollowUps';
import { AssistantMessage, AssistantMonthContextBundle } from '@/types/assistant';

interface AssistantConversationPanelProps {
  activePeriodLabel: string;
  contextBundle: AssistantMonthContextBundle | null;
  renderedMessages: AssistantMessage[];
  loadingThreadDetail: boolean;
  /** A thread is selected but still empty → "no messages yet" empty state. */
  hasSelectedThread: boolean;
  isStreaming: boolean;
  streamStatus: 'searching' | 'writing' | 'saving' | null;
  isSlowResponse: boolean;
  isInterrupted: boolean;
  streamingMessageId: string | undefined;
  followUps: AssistantFollowUp[];
  onRetry: () => void;
  onFollowUpSelect: (prompt: string) => void;
  /** Anchor for auto-scroll to the latest message — owned by the page (scroll effect). */
  conversationEndRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * The conversation card: period header with streaming status badges, the message
 * stream (aria-live inside AssistantStreamingResponse) and the follow-up chips.
 * Pure presentation — every state is computed by the page/streaming hook.
 */
export function AssistantConversationPanel({
  activePeriodLabel,
  contextBundle,
  renderedMessages,
  loadingThreadDetail,
  hasSelectedThread,
  isStreaming,
  streamStatus,
  isSlowResponse,
  isInterrupted,
  streamingMessageId,
  followUps,
  onRetry,
  onFollowUpSelect,
  conversationEndRef,
}: AssistantConversationPanelProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="min-h-[200px] space-y-0 overflow-hidden rounded-2xl border border-border bg-card">
      {/* Conversation header */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          {/* Period label crossfades on period switch so the change registers
              as a deliberate context shift, not a text flicker. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={activePeriodLabel}
              className="text-sm font-medium text-foreground"
              initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: prefersReducedMotion ? 0 : -4 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              {activePeriodLabel}
            </motion.p>
          </AnimatePresence>
          {/* Mobile context strip: key delta at a glance during a conversation.
              In the empty state the full mobile scheda already shows this, so the
              pill is suppressed there to avoid two net-worth surfaces. */}
          {contextBundle && renderedMessages.length > 0 && (
            <div className="desktop:hidden">
              <AssistantContextPill bundle={contextBundle} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Streaming status badges. Web search gets its own badge so a slow
              macro lookup doesn't read as a generic delay. */}
          <AnimatePresence>
            {isStreaming && streamStatus === 'searching' && (
              <motion.div
                key="searching-badge"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
              >
                <Badge variant="outline" className="gap-1.5 text-xs text-muted-foreground">
                  <Globe className="h-3 w-3 animate-pulse" />
                  Sto cercando sul web…
                </Badge>
              </motion.div>
            )}
            {isStreaming && streamStatus !== 'searching' && !isSlowResponse && (
              <motion.div
                key="streaming-badge"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
              >
                <Badge variant="outline" className="gap-1.5 text-xs">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  In scrittura…
                </Badge>
              </motion.div>
            )}
            {isStreaming && streamStatus !== 'searching' && isSlowResponse && (
              <motion.div
                key="slow-badge"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
              >
                <Badge variant="outline" className="gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Sta impiegando più del previsto…
                </Badge>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Messages */}
      <div className="p-5">
        {loadingThreadDetail ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Caricamento conversazione…
          </div>
        ) : renderedMessages.length === 0 && hasSelectedThread ? (
          <EmptyState
            icon={MessageSquare}
            title="Nessun messaggio ancora"
            description="Scrivi la tua domanda nel composer in basso."
            className="py-10"
          />
        ) : (
          <>
            <AssistantStreamingResponse
              messages={renderedMessages}
              isInterrupted={isInterrupted}
              onRetry={onRetry}
              streamingMessageId={streamingMessageId}
            />
            {/* Suggested next questions — submit directly on click. */}
            <AssistantFollowUps followUps={followUps} onSelect={onFollowUpSelect} disabled={isStreaming} />
          </>
        )}
        {/* Anchor for auto-scroll to latest message */}
        <div ref={conversationEndRef} />
      </div>
    </div>
  );
}
