'use client';

/**
 * useCoastFireSettingsDraft — the Coast FIRE configuration form as one unit.
 *
 * Owns the local draft (age, target age, custom expenses, state pensions, IRPEF brackets), the
 * dirty check against the saved settings, and the save mutation. Everything the tab needs to
 * PROJECT — parsed ages, normalized pensions and brackets — comes out already derived, so the
 * preview stays instant: an edit updates the draft, the draft re-derives, the projection re-runs.
 *
 * WHY A HOOK AND NOT STATE IN THE TAB
 * The tab is an orchestrator over five sections; the form is one of them and its plumbing is
 * self-contained (thirteen pieces of state, one effect, one mutation, seven handlers). Keeping it
 * here is what lets the tab read as a page instead of a form.
 *
 * The dirty snapshot keys contain ONLY persisted fields (AGENTS → *Settings — the FIVE places*),
 * so re-deriving equivalent drafts never reads as an unsaved change.
 */

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getDefaultTargets, setSettings } from '@/lib/services/assetAllocationService';
import {
  normalizeCoastFirePensions,
  normalizeCoastFireTaxBrackets,
} from '@/lib/services/fireService';
import {
  addYearsToDate,
  buildPensionDraftIssues,
  buildPensionSnapshotKey,
  buildTaxBracketSnapshotKey,
  createLocalId,
  createPensionDraft,
  createTaxBracketDraft,
  isValidAge,
  parseOptionalInteger,
  parsePensionDrafts,
  parseTaxBracketDrafts,
  toPensionDrafts,
  toTaxBracketDrafts,
  type CoastFirePensionDraft,
  type CoastFireTaxBracketDraft,
  type PensionDraftIssue,
} from '@/lib/utils/coastFireView';
import type { CoastFirePensionInput, CoastFireTaxBracket } from '@/types/assets';
import type { Settings } from '@/types/settings';

const DEFAULT_COAST_RETIREMENT_AGE = 60;

/**
 * The saved settings as form strings. One function, so the load effect and the "Annulla" button
 * cannot drift apart — they used to be two copies of the same six assignments.
 */
function toDraftState(settings: Settings | null | undefined) {
  return {
    userAge: settings?.userAge !== undefined ? String(settings.userAge) : '',
    retirementAge: String(settings?.coastFireRetirementAge ?? DEFAULT_COAST_RETIREMENT_AGE),
    useCustomExpenses: settings?.coastFireCustomExpenses !== undefined,
    customExpenses: settings?.coastFireCustomExpenses?.toString() ?? '',
    pensions: toPensionDrafts(settings?.coastFirePensions, settings?.userAge),
    taxBrackets: toTaxBracketDrafts(settings?.coastFireTaxBrackets),
  };
}

type PensionDraftField = keyof Omit<CoastFirePensionDraft, 'id'>;
type TaxBracketDraftField = keyof Omit<CoastFireTaxBracketDraft, 'id'>;

interface UseCoastFireSettingsDraftInput {
  settings: Settings | null | undefined;
  isLoadingSettings: boolean;
  /** The signed-in viewer's uid — what `setSettings` writes under. */
  userId: string | undefined;
  /** Whose data is displayed, for the cache invalidation key. */
  ownerId: string | undefined;
}

export interface CoastFireSettingsDraft {
  userAge: string;
  setUserAge: (value: string) => void;
  retirementAge: string;
  setRetirementAge: (value: string) => void;
  useCustomExpenses: boolean;
  setUseCustomExpenses: (value: boolean) => void;
  customExpenses: string;
  setCustomExpenses: (value: string) => void;
  pensions: CoastFirePensionDraft[];
  taxBrackets: CoastFireTaxBracketDraft[];

  addPension: () => void;
  updatePension: (pensionId: string, field: PensionDraftField, value: string) => void;
  removePension: (pensionId: string) => void;
  addTaxBracket: () => void;
  updateTaxBracket: (bracketId: string, field: TaxBracketDraftField, value: string) => void;
  removeTaxBracket: (bracketId: string) => void;

  /** null when the input is empty or outside 18-100 — the projection refuses to run on it. */
  currentAge: number | null;
  parsedRetirementAge: number | null;
  usesCustomExpenses: boolean;
  parsedCustomExpenses: number;
  previewPensions: CoastFirePensionInput[];
  previewTaxBrackets: CoastFireTaxBracket[];
  pensionIssues: PensionDraftIssue[];
  hasUnsavedChanges: boolean;

  isSaving: boolean;
  save: () => void;
  resetToSaved: () => void;
}

export function useCoastFireSettingsDraft({
  settings,
  isLoadingSettings,
  userId,
  ownerId,
}: UseCoastFireSettingsDraftInput): CoastFireSettingsDraft {
  const queryClient = useQueryClient();

  const [userAge, setUserAge] = useState('');
  const [retirementAge, setRetirementAge] = useState(String(DEFAULT_COAST_RETIREMENT_AGE));
  const [useCustomExpenses, setUseCustomExpensesState] = useState(false);
  const [customExpenses, setCustomExpenses] = useState('');
  const [pensions, setPensions] = useState<CoastFirePensionDraft[]>([]);
  const [taxBrackets, setTaxBrackets] = useState<CoastFireTaxBracketDraft[]>([]);

  const savedRetirementAge = settings?.coastFireRetirementAge ?? DEFAULT_COAST_RETIREMENT_AGE;

  useEffect(() => {
    if (isLoadingSettings) return;

    const draft = toDraftState(settings);
    setUserAge(draft.userAge);
    setRetirementAge(draft.retirementAge);
    setUseCustomExpensesState(draft.useCustomExpenses);
    setCustomExpenses(draft.customExpenses);
    setPensions(draft.pensions);
    setTaxBrackets(draft.taxBrackets);
  }, [isLoadingSettings, settings]);

  const parsedCurrentAge = parseOptionalInteger(userAge);
  const parsedRetirementAgeRaw = parseOptionalInteger(retirementAge);
  const currentAge = isValidAge(parsedCurrentAge) ? parsedCurrentAge : null;
  const parsedRetirementAge = isValidAge(parsedRetirementAgeRaw) ? parsedRetirementAgeRaw : null;

  const parsedCustomExpenses = parseFloat(customExpenses);
  const usesCustomExpenses =
    useCustomExpenses && !isNaN(parsedCustomExpenses) && parsedCustomExpenses > 0;

  const previewPensions = useMemo(() => parsePensionDrafts(pensions), [pensions]);
  const previewTaxBrackets = useMemo(() => parseTaxBracketDrafts(taxBrackets), [taxBrackets]);
  const pensionIssues = useMemo(
    () => buildPensionDraftIssues(pensions, currentAge, parsedRetirementAge, new Date()),
    [currentAge, parsedRetirementAge, pensions]
  );

  const savedPensionSnapshotKey = useMemo(
    () => buildPensionSnapshotKey(normalizeCoastFirePensions(settings?.coastFirePensions)),
    [settings?.coastFirePensions]
  );
  const savedTaxBracketSnapshotKey = useMemo(
    () => buildTaxBracketSnapshotKey(normalizeCoastFireTaxBrackets(settings?.coastFireTaxBrackets)),
    [settings?.coastFireTaxBrackets]
  );
  const previewPensionSnapshotKey = useMemo(
    () => buildPensionSnapshotKey(previewPensions),
    [previewPensions]
  );
  const previewTaxBracketSnapshotKey = useMemo(
    () => buildTaxBracketSnapshotKey(previewTaxBrackets),
    [previewTaxBrackets]
  );

  const hasUnsavedChanges =
    userAge !== (settings?.userAge !== undefined ? String(settings.userAge) : '') ||
    retirementAge !== String(savedRetirementAge) ||
    useCustomExpenses !== (settings?.coastFireCustomExpenses !== undefined) ||
    (useCustomExpenses && parsedCustomExpenses !== settings?.coastFireCustomExpenses) ||
    previewPensionSnapshotKey !== savedPensionSnapshotKey ||
    previewTaxBracketSnapshotKey !== savedTaxBracketSnapshotKey;

  const saveMutation = useMutation({
    mutationFn: (nextSettings: {
      userAge: number;
      coastFireRetirementAge: number;
      coastFireCustomExpenses?: number;
      coastFirePensions: CoastFirePensionInput[];
      coastFireTaxBrackets: CoastFireTaxBracket[];
    }) =>
      setSettings(userId!, {
        ...(settings ?? {}),
        targets: settings?.targets || getDefaultTargets(),
        ...nextSettings,
      }),
    onSuccess: () => {
      toast.success('Impostazioni Coast FIRE salvate con successo');
      queryClient.invalidateQueries({ queryKey: ['settings', ownerId] });
    },
    onError: (error) => {
      console.error('Error saving Coast FIRE settings:', error);
      toast.error('Errore nel salvataggio delle impostazioni Coast FIRE');
    },
  });

  /** Default decorrenza for a new row: the target age, which is where most users start editing. */
  const buildDefaultPensionDate = (): string => {
    if (currentAge !== null && parsedRetirementAge !== null) {
      return addYearsToDate(new Date(), Math.max(parsedRetirementAge - currentAge, 0))
        .toISOString()
        .slice(0, 10);
    }
    return '';
  };

  return {
    userAge,
    setUserAge,
    retirementAge,
    setRetirementAge,
    useCustomExpenses,
    setUseCustomExpenses: (checked: boolean) => {
      setUseCustomExpensesState(checked);
      if (!checked) setCustomExpenses('');
    },
    customExpenses,
    setCustomExpenses,
    pensions,
    taxBrackets,

    addPension: () =>
      setPensions((current) => [...current, createPensionDraft(buildDefaultPensionDate())]),
    updatePension: (pensionId, field, value) =>
      setPensions((current) =>
        current.map((pension) =>
          pension.id === pensionId ? { ...pension, [field]: value } : pension
        )
      ),
    removePension: (pensionId) =>
      setPensions((current) => current.filter((pension) => pension.id !== pensionId)),
    addTaxBracket: () =>
      setTaxBrackets((current) => [
        ...current,
        createTaxBracketDraft({ id: createLocalId('coast-tax'), upTo: null, rate: 43 }),
      ]),
    updateTaxBracket: (bracketId, field, value) =>
      setTaxBrackets((current) =>
        current.map((bracket) =>
          bracket.id === bracketId ? { ...bracket, [field]: value } : bracket
        )
      ),
    // The last bracket is the unlimited one: removing it would leave the top income untaxed.
    removeTaxBracket: (bracketId) =>
      setTaxBrackets((current) =>
        current.length > 1 ? current.filter((bracket) => bracket.id !== bracketId) : current
      ),

    currentAge,
    parsedRetirementAge,
    usesCustomExpenses,
    parsedCustomExpenses,
    previewPensions,
    previewTaxBrackets,
    pensionIssues,
    hasUnsavedChanges,

    isSaving: saveMutation.isPending,
    save: () => {
      if (currentAge === null) {
        toast.error("Inserisci un'età attuale valida tra 18 e 100 anni");
        return;
      }
      if (parsedRetirementAge === null) {
        toast.error("Inserisci un'età di pensionamento valida tra 18 e 100 anni");
        return;
      }
      saveMutation.mutate({
        userAge: currentAge,
        coastFireRetirementAge: parsedRetirementAge,
        // Undefined removes the field from Firestore; the service handles the deleteField() call.
        coastFireCustomExpenses: usesCustomExpenses ? parsedCustomExpenses : undefined,
        coastFirePensions: previewPensions,
        coastFireTaxBrackets: previewTaxBrackets,
      });
    },
    resetToSaved: () => {
      if (isLoadingSettings) return;
      const draft = toDraftState(settings);
      setUserAge(draft.userAge);
      setRetirementAge(draft.retirementAge);
      setUseCustomExpensesState(draft.useCustomExpenses);
      setCustomExpenses(draft.customExpenses);
      setPensions(draft.pensions);
      setTaxBrackets(draft.taxBrackets);
    },
  };
}
