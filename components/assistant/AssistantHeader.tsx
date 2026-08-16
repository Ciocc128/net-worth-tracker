'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Brain, HelpCircle, MessagesSquare, Plus } from 'lucide-react';
import { AssistantPreferencesPopover } from '@/components/assistant/AssistantPreferencesPopover';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { AssistantMemoryDocument, AssistantPreferences } from '@/types/assistant';

interface AssistantHeaderProps {
  isDemo: boolean;
  isStreaming: boolean;
  threadsCount: number;
  activeMemoryCount: number;
  memory: AssistantMemoryDocument | undefined;
  loadingMemory: boolean;
  isPreferencesPending: boolean;
  onPreferencesChange: (patch: Partial<AssistantPreferences>) => void;
  onNewThread: () => void;
  onOpenThreads: () => void;
  onOpenMemory: () => void;
}

/** Small count dot overlaid on an icon action — visual only, the count is in the aria-label. */
function CountDot({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span
      aria-hidden="true"
      className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] font-medium text-primary-foreground"
    >
      {count > 99 ? '99' : count}
    </span>
  );
}

/**
 * Page header for the Assistente: the canonical PageHeader with ONE primary
 * action ("Nuova conversazione"); Conversazioni, Memoria, Preferenze and the
 * guide degrade to icon actions (SPEC-4D — the old header gave four buttons
 * equal weight, so nothing led). The sheets the icons open live in the page,
 * which owns their open state (the empty state and the companion card can open
 * the Memoria sheet too).
 */
export function AssistantHeader({
  isDemo,
  isStreaming,
  threadsCount,
  activeMemoryCount,
  memory,
  loadingMemory,
  isPreferencesPending,
  onPreferencesChange,
  onNewThread,
  onOpenThreads,
  onOpenMemory,
}: AssistantHeaderProps) {
  const prefersReducedMotion = useReducedMotion();
  // Guide section — opened on demand only (no auto-open wall of text); action-first onboarding.
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  return (
    <div>
      <PageHeader
        label="Analisi"
        title="Assistente AI"
        description="Fai domande sul tuo patrimonio: un periodo, una risposta."
        actions={
          <>
            <Button
              variant="ghost"
              size="icon"
              className="relative h-9 w-9"
              disabled={isDemo}
              title={isDemo ? 'Non disponibile in modalità demo' : undefined}
              aria-label={threadsCount > 0 ? `Conversazioni (${threadsCount})` : 'Conversazioni'}
              onClick={onOpenThreads}
            >
              <MessagesSquare className="h-4 w-4 text-muted-foreground" />
              <CountDot count={threadsCount} />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="relative h-9 w-9"
              aria-label={activeMemoryCount > 0 ? `Memoria (${activeMemoryCount})` : 'Memoria'}
              onClick={onOpenMemory}
            >
              <Brain className="h-4 w-4 text-muted-foreground" />
              <CountDot count={activeMemoryCount} />
            </Button>

            {/* Unified behaviour preferences (style, web context, memory on/off) */}
            <AssistantPreferencesPopover
              memory={memory}
              onChange={onPreferencesChange}
              isLoading={loadingMemory}
              isPending={isPreferencesPending}
              disabled={isDemo}
            />

            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              aria-label="Come funziona l'assistente"
              aria-expanded={isGuideOpen}
              onClick={() => setIsGuideOpen((v) => !v)}
            >
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
            </Button>

            {/* The ONE primary action. Icon-only on mobile — the sticky navbar has no room for the label. */}
            <Button
              onClick={onNewThread}
              disabled={isDemo || isStreaming}
              title={isDemo ? 'Non disponibile in modalità demo' : undefined}
              className="h-9 w-9 p-0 desktop:h-9 desktop:w-auto desktop:px-4"
              aria-label="Nuova conversazione"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span className="hidden desktop:inline">Nuova conversazione</span>
            </Button>
          </>
        }
      />

      {/* Collapsible guide — on-demand reference for non-obvious behaviours. */}
      <AnimatePresence initial={false}>
        {isGuideOpen && (
          <motion.div
            key="guide"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="mt-4 space-y-4 rounded-2xl border border-border bg-muted/30 p-4 text-sm">
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Periodi di analisi
                </p>
                <div className="space-y-1.5">
                  {[
                    { label: 'Mese', desc: 'Patrimonio netto, cashflow, dividendi e allocazione del mese selezionato.' },
                    { label: 'Anno', desc: 'Performance annuale, risparmio, crescita investimenti e dividendi totali.' },
                    { label: 'YTD', desc: "Stesse metriche dall'1 gennaio a oggi — utile per valutare l'andamento in corso d'anno." },
                    { label: 'Storico', desc: 'Evoluzione completa del patrimonio da quando hai iniziato a tracciare.' },
                    { label: 'Libera', desc: 'Domanda aperta senza un periodo numerico collegato.' },
                  ].map(({ label, desc }) => (
                    <div key={label} className="flex gap-3">
                      <span className="w-14 shrink-0 font-medium text-foreground">{label}</span>
                      <span className="text-muted-foreground">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 desktop:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Ricerca web (contesto macro)
                  </p>
                  <p className="text-muted-foreground">
                    Nelle analisi di periodo il toggle{' '}
                    <span className="font-medium text-foreground">Contesto macro</span> abilita sempre la
                    ricerca web. In modalità Libera: se il toggle è attivo la ricerca è sempre abilitata; se è
                    disattivo si attiva solo su keyword macro — inflazione, tassi, dazi, BCE, recessione — o
                    frasi come{' '}
                    <span className="font-medium text-foreground">&ldquo;cerca sul web&rdquo;</span>.
                  </p>
                </div>

                <div>
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    Memoria
                  </p>
                  <p className="text-muted-foreground">
                    Dopo ogni risposta l&apos;assistente estrae fatti stabili che hai dichiarato — obiettivi,
                    preferenze di rischio, orizzonti temporali — e li salva nel pannello{' '}
                    <span className="font-medium text-foreground">Memoria</span>. Vengono inclusi
                    automaticamente nelle analisi successive.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
