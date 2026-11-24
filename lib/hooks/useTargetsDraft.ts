'use client';

/**
 * The class targets' draft, held by Allocazione (RU8, doc/allocazione-strategia/README.md § 5.4, D-ST5).
 *
 * The page holds it, not the Strategia tab: Radix unmounts an inactive panel, and a draft inside it
 * would be lost by a visit to Bilanciamento. Seeded during render from the settings document every
 * page shares (`useSettings`), exactly as Impostazioni seeds its own draft: the first document of
 * this owner seeds it, a fresher read reseeds it ONLY while the draft is clean — a co-owner's save
 * never overwrites what the reader is typing.
 *
 * «Salva i target» validates the tree as it will be written (`composeTargetsWrite`) BEFORE any
 * round trip, then writes ONLY the targets and the two source fields through `setSettings`, whose
 * replace branch re-reads the document just before writing: every field another page owns stays the
 * server's. Then the settings key is invalidated, so the verdict, the Ordini, Per classe and the
 * chain are rebuilt on the new targets.
 */

import { useReducer, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query/queryKeys';
import { settingsQueryOptions } from '@/lib/hooks/useSettings';
import { useSavedFlash } from '@/lib/hooks/useSavedFlash';
import { getDefaultTargets, setSettings } from '@/lib/services/assetAllocationService';
import { runGuarded } from '@/lib/utils/runGuarded';
import {
  composeTargetsWrite,
  createTargetsDraft,
  isTargetsDirty,
  revealTargetProblem,
  targetsDraftReducer,
  type TargetsSlice,
} from '@/lib/utils/targetsDraft';
import type { TargetProblem } from '@/lib/utils/allocationTargetValidation';
import type { AssetAllocationSettings } from '@/types/assets';

export interface UseTargetsDraftInput {
  ownerId: string | null | undefined;
  /** The settings document as `useSettings` has it: `undefined` = not read yet, `null` = no document. */
  document: AssetAllocationSettings | null | undefined;
  /** `dataUpdatedAt` of the settings query: a fresher read reseeds a clean draft. */
  documentUpdatedAt: number;
  /** The ECB estimate of the risk-free rate in force (`resolveRiskFreeEstimate`). */
  riskFreeEstimate: number;
}

export function useTargetsDraft({ ownerId, document, documentUpdatedAt, riskFreeEstimate }: UseTargetsDraftInput) {
  const queryClient = useQueryClient();
  const [draft, dispatch] = useReducer(targetsDraftReducer, undefined, createTargetsDraft);
  const [saving, setSaving] = useState(false);
  const { saved: justSaved, flash: flashSaved } = useSavedFlash();

  const dirty = draft.loaded && isTargetsDirty(draft.slice, draft.saved);

  // Seeded during render on the (owner, read) subject (AGENTS.md § Motion, the third answer).
  const seedSubject = document === undefined ? null : `${ownerId}:${documentUpdatedAt}`;
  const [seededFrom, setSeededFrom] = useState<string | null>(null);
  if (seedSubject !== null && seedSubject !== seededFrom && !dirty) {
    setSeededFrom(seedSubject);
    dispatch({ type: 'reset', document: document ?? null, fallbackTargets: getDefaultTargets() });
  }
  // The estimate is handed to BOTH sides, so its arrival is never an edit.
  if (draft.loaded && draft.slice.riskFreeEstimate !== riskFreeEstimate) {
    dispatch({ type: 'riskFreeEstimate', value: riskFreeEstimate });
  }

  /** The class's group opened and the focus on the field to fix (the tile consumes `pendingFocus`). */
  const reveal = (found: TargetProblem, cleaned: TargetsSlice) => {
    const { slice, fieldId } = revealTargetProblem(found, cleaned);
    dispatch({ type: 'replace', slice });
    dispatch({ type: 'focus', fieldId });
  };

  /** «Salva i target»: `false` when a rule refused it (the problem is revealed) or the write failed. */
  const save = async (): Promise<boolean> => {
    if (!ownerId) return false;
    const composed = composeTargetsWrite(draft.slice);
    if (!composed.ok) {
      reveal(composed.problem, composed.cleaned);
      return false;
    }
    if (composed.cleaned !== draft.slice) dispatch({ type: 'replace', slice: composed.cleaned });
    return runGuarded(
      async () => {
        setSaving(true);
        await setSettings(ownerId, composed.write);
        toast.success('Target salvati');
        flashSaved();
        // Awaited BEFORE the baseline moves: a clean draft reseeds from the newest read.
        await queryClient.invalidateQueries({ queryKey: queryKeys.settings.all(ownerId) });
        dispatch({ type: 'saved', cleaned: composed.cleaned });
        return true;
      },
      (error) => {
        console.error('Error saving the targets:', error);
        toast.error('Salvataggio dei target non riuscito: la bozza resta com’è.');
        return false;
      },
      () => setSaving(false),
    );
  };

  /** «Annulla»: back to what is saved, by READING it again — never a copy kept in memory. */
  const revert = async () => {
    if (!ownerId) return;
    await runGuarded(
      async () => {
        const fresh = await queryClient.fetchQuery({ ...settingsQueryOptions(ownerId), staleTime: 0 });
        dispatch({ type: 'reset', document: fresh, fallbackTargets: getDefaultTargets() });
      },
      (error) => {
        console.error('Error re-reading the targets:', error);
        toast.error('Lettura dei target non riuscita: le modifiche restano nella bozza.');
      },
    );
  };

  /** «Ripristina default»: the FACTORY targets in the draft, not saved. */
  const restoreDefaults = () => {
    dispatch({ type: 'replaceTargets', targets: getDefaultTargets() });
  };

  return { draft, dispatch, dirty, saving, justSaved, save, revert, restoreDefaults };
}

export type TargetsDraftController = ReturnType<typeof useTargetsDraft>;
