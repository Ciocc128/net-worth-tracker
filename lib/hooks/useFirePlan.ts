'use client';

/**
 * «Il mio piano»'s ONE draft for the whole FIRE page (doc/fire-ipotesi/README.md § 15, RP3–RP5).
 *
 * `useFirePlanDraft()` is called once, by the page, and its state is put in `FirePlanContext`. Every tab
 * reads the settings through `useFireSettings()`, which lays the draft's valid edits over the saved
 * document — so a typed expense reaches the six tabs, the «Ipotesi usate» line and the verdicts at once,
 * and «Annulla» takes it back everywhere. The draft survives a tab switch (the page owns it) and is lost
 * only on a reload. Outside the page (the Settings tile) there is no provider and the saved settings are read.
 *
 * The draft is stored WITH the key of the saved values it was seeded from and read back only while that key
 * still matches: a save (or another account) re-seeds without an effect, and a refetch that changes nothing the
 * plan edits keeps what the user typed.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { getDefaultTargets, getSettings, setSettings } from '@/lib/services/assetAllocationService';
import { describeWriteError } from '@/lib/utils/dialogNarrative';
import { getItalyYear } from '@/lib/utils/dateHelpers';
import {
  FIRE_PLAN_FIELD_IDS,
  applyPlanOverlay,
  buildPlanOverlay,
  buildPlanPayload,
  isPlanDirty,
  planFormFromSettings,
  planPensionIssues,
  planSeedKey,
  validateFirePlan,
  type FirePlanField,
  type FirePlanForm,
  type FirePlanProblems,
} from '@/lib/utils/firePlan';
import type { PensionDraftIssue } from '@/lib/utils/coastFireView';
import type { Settings } from '@/types/settings';

/** How long the Collapsible takes to mount its content before a field inside it can take focus. */
const PLAN_OPEN_FOCUS_DELAY_MS = 80;

export interface FirePlanState {
  form: FirePlanForm;
  /** The saved settings as the form's strings. */
  seed: FirePlanForm;
  onFormChange: (patch: Partial<FirePlanForm>) => void;
  hasUnsavedChanges: boolean;
  problems: FirePlanProblems;
  pensionIssues: PensionDraftIssue[];
  /** The valid edits to lay over the saved settings; null when there is nothing unsaved (the saved object stays). */
  overlay: Partial<Settings> | null;
  isSaving: boolean;
  /** `derivedFund`: the fund a legacy share stands for (RE5), fixed in euro by this save. */
  save: (options?: { derivedFund?: number | null }) => void;
  reset: () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** RP10: opens the block and puts the focus on the field. */
  focusField: (field: FirePlanField) => void;
  isLoadingSettings: boolean;
}

export const FirePlanContext = createContext<FirePlanState | null>(null);

export function useFirePlan(): FirePlanState | null {
  return useContext(FirePlanContext);
}

export function useFirePlanDraft(): FirePlanState {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const queryClient = useQueryClient();

  const { data: settings, isLoading: isLoadingSettings } = useQuery<Settings | null>({
    queryKey: ['settings', ownerId],
    queryFn: () => getSettings(ownerId!),
    enabled: !!user && !!ownerId,
    staleTime: 300000,
  });

  const seed = useMemo(() => planFormFromSettings(settings), [settings]);
  const seedKey = planSeedKey(settings);
  const [draft, setDraft] = useState<{ key: string; form: FirePlanForm } | null>(null);
  const live = draft !== null && draft.key === seedKey;
  const form = live ? draft.form : seed;
  const hasUnsavedChanges = live && isPlanDirty(form, seed);

  const onFormChange = useCallback(
    (patch: Partial<FirePlanForm>) => setDraft((previous) => ({ key: seedKey, form: { ...(previous?.key === seedKey ? previous.form : seed), ...patch } })),
    [seedKey, seed],
  );
  const reset = useCallback(() => setDraft(null), []);

  const overlay = useMemo(() => (hasUnsavedChanges ? buildPlanOverlay(form, seed) : null), [hasUnsavedChanges, form, seed]);
  const currentYear = getItalyYear();
  const problems = useMemo(() => validateFirePlan(form, currentYear), [form, currentYear]);
  const pensionIssues = useMemo(() => planPensionIssues(form, new Date()), [form]);

  const mutation = useMutation({
    mutationFn: (payload: object) => setSettings(ownerId!, { ...(settings ?? {}), targets: settings?.targets || getDefaultTargets(), ...payload }),
    onSuccess: () => {
      toast.success('Piano FIRE salvato');
      return queryClient.invalidateQueries({ queryKey: ['settings', ownerId] });
    },
    onError: (error) => {
      console.error('Error saving the FIRE plan:', error);
      toast.error(describeWriteError(error));
    },
  });

  const save = useCallback(
    ({ derivedFund }: { derivedFund?: number | null } = {}) => {
      const result = buildPlanPayload(form, { derivedFund, currentYear });
      if (result.payload === null) {
        toast.error(result.problem);
        return;
      }
      mutation.mutate(result.payload);
    },
    [form, currentYear, mutation],
  );

  // RP5: opens by itself ONCE per visit, when the plan is not written yet (no SWR, no age, an incomplete pension). The flag is
  // set INSIDE the timer: under StrictMode's double-invoke the first timer is cleared before it fires.
  const [open, setOpen] = useState(false);
  const decidedRef = useRef(false);
  const planUnwritten = settings?.withdrawalRate == null || settings?.userAge == null || seedHasIncompletePension(seed);
  useEffect(() => {
    if (decidedRef.current || isLoadingSettings || !user || !ownerId) return;
    const timer = setTimeout(() => {
      decidedRef.current = true;
      if (planUnwritten) setOpen(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [isLoadingSettings, user, ownerId, planUnwritten]);

  const focusField = useCallback((field: FirePlanField) => {
    setOpen(true);
    window.setTimeout(() => {
      const element = document.getElementById(FIRE_PLAN_FIELD_IDS[field]);
      element?.scrollIntoView({ block: 'center' });
      element?.focus();
    }, PLAN_OPEN_FOCUS_DELAY_MS);
  }, []);

  return {
    form,
    seed,
    onFormChange,
    hasUnsavedChanges,
    problems,
    pensionIssues,
    overlay,
    isSaving: mutation.isPending,
    save,
    reset,
    open,
    setOpen,
    focusField,
    isLoadingSettings,
  };
}

function seedHasIncompletePension(seed: FirePlanForm): boolean {
  return planPensionIssues(seed, new Date()).some((issue) => issue.kind === 'incomplete');
}

/**
 * The settings every FIRE tab reads: the saved document with the page's plan draft laid over it (RP3). Same shape as the
 * query it replaces; `saved` is the document as stored, for the few readers that must not see the preview.
 */
export function useFireSettings(): { data: Settings | null | undefined; saved: Settings | null | undefined; isLoading: boolean; isError: boolean } {
  const { user } = useAuth();
  const { ownerId } = useActiveAccount();
  const plan = useFirePlan();
  const query = useQuery<Settings | null>({
    queryKey: ['settings', ownerId],
    queryFn: () => getSettings(ownerId!),
    enabled: !!user && !!ownerId,
    staleTime: 300000,
  });
  const overlay = plan?.overlay ?? null;
  const data = useMemo(() => applyPlanOverlay(query.data, overlay), [query.data, overlay]);
  return { data, saved: query.data, isLoading: query.isLoading, isError: query.isError };
}
