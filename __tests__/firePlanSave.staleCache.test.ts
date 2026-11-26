/**
 * M1 — «Salva il piano» (FIRE) must not rewrite the whole settings document from a stale cache.
 * The first block is the review's proof of the hazard (full rewrite); the second pins the fix (`buildFirePlanWrite`).
 * Figures are invented and round.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteField: vi.fn(() => ({ __deleteField: true })),
}));

import { getDoc, setDoc } from 'firebase/firestore';
import { getSettings, setSettings } from '@/lib/services/assetAllocationService';
import { buildFirePlanWrite, type FirePlanPayload } from '@/lib/utils/firePlan';
import type { AssetAllocationSettings } from '@/types/assets';

const TARGETS_OLD = { equity: { targetPercentage: 60 }, bonds: { targetPercentage: 40 } };
const TARGETS_NEW = { equity: { targetPercentage: 80 }, bonds: { targetPercentage: 20 } };

function stored(data: Record<string, unknown>) {
  vi.mocked(getDoc).mockResolvedValue({ exists: () => true, data: () => data } as never);
}
const written = () => vi.mocked(setDoc).mock.calls.at(-1)?.[1] as Record<string, unknown>;

beforeEach(() => {
  vi.mocked(setDoc).mockClear();
  vi.mocked(setDoc).mockResolvedValue(undefined as never);
});

describe('M1 — il salvataggio del piano FIRE da una cache vecchia (la riscrittura intera, che il piano non deve più usare)', () => {
  it('cancella ciò che un altro dispositivo ha salvato nel frattempo', async () => {
    // 1. Il telefono apre FIRE: la cache prende il documento di quel momento.
    stored({ userId: 'u', targets: TARGETS_OLD, withdrawalRate: 4 });
    const cached = (await getSettings('u')) as AssetAllocationSettings;

    // 2. Dal Mac: nuovi target, i Criteri del modello, il mercato delle Simulazioni, il conto dei dividendi.
    const onServer = {
      userId: 'u',
      targets: TARGETS_NEW,
      withdrawalRate: 4,
      idealAllocation: { enabled: true, classPriority: 'high', leveragePriority: 'off', factorObjectives: [], geography: null, instrumentLimits: [], groupLimits: [] },
      monteCarloMarket: { version: 2, inflationRate: 2 },
      dividendCashAssetId: 'conto-1',
      pensionReturnStartMonth: '2026-01',
    };
    stored(onServer);

    // 3. Il telefono preme «Salva il piano» (lib/hooks/useFirePlan.ts:104) senza aver riletto.
    await setSettings('u', { ...cached, targets: cached.targets, withdrawalRate: 3.5 } as AssetAllocationSettings);

    const doc = written();
    expect(doc.withdrawalRate).toBe(3.5); // il campo che l'utente voleva cambiare
    // Tutto il resto torna indietro o sparisce, senza errori:
    expect(doc.targets).toEqual(TARGETS_OLD);
    expect('idealAllocation' in doc).toBe(false);
    expect('monteCarloMarket' in doc).toBe(false);
    expect('dividendCashAssetId' in doc).toBe(false);
    expect('pensionReturnStartMonth' in doc).toBe(false);
  });

  it('controllo positivo: lo stesso salvataggio col solo campo del piano non tocca il resto', async () => {
    stored({ userId: 'u', targets: TARGETS_NEW, idealAllocation: { enabled: true } });
    await setSettings('u', { withdrawalRate: 3.5 } as AssetAllocationSettings);
    const doc = written();
    expect(doc).toMatchObject({ withdrawalRate: 3.5 });
    expect('targets' in doc).toBe(false); // ramo merge: i target restano quelli sul server
    expect('idealAllocation' in doc).toBe(false);
    expect(vi.mocked(setDoc).mock.calls.at(-1)?.[2]).toEqual({ merge: true });
  });
});

const PAYLOAD: FirePlanPayload = {
  withdrawalRate: 3.5,
  userAge: 40,
  coastFireRetirementAge: 60,
  plannedAnnualExpenses: undefined,
  fireEmergencyFund: undefined,
  fireCashToInvestPct: undefined,
  fireDatedFlows: [],
  coastFireCustomExpenses: undefined,
  coastFirePensions: [],
  respectPensionLockInFire: true,
  includePrimaryResidenceInFIRE: true,
  pensionInpsRetirementAge: 67,
  pensionRitaLongUnemployment: false,
};

describe('M1 — buildFirePlanWrite: «Salva il piano» scrive solo i suoi campi', () => {
  it('non porta mai `targets` né altri campi fuori dal piano', () => {
    const write = buildFirePlanWrite(PAYLOAD) as unknown as Record<string, unknown>;
    expect(Object.keys(write).sort()).toEqual(Object.keys(PAYLOAD).sort());
    expect('targets' in write).toBe(false);
    expect('idealAllocation' in write).toBe(false);
  });

  it('con una cache vecchia il documento sul server resta intatto (ramo merge) e i campi svuotati si cancellano', async () => {
    stored({ userId: 'u', targets: TARGETS_NEW, idealAllocation: { enabled: true }, monteCarloMarket: { version: 2 }, dividendCashAssetId: 'conto-1', plannedAnnualExpenses: 30000 });
    await setSettings('u', buildFirePlanWrite(PAYLOAD));
    const doc = written();
    expect(vi.mocked(setDoc).mock.calls.at(-1)?.[2]).toEqual({ merge: true });
    expect(doc.withdrawalRate).toBe(3.5);
    for (const key of ['targets', 'idealAllocation', 'monteCarloMarket', 'dividendCashAssetId']) expect(key in doc).toBe(false);
    // spesa del piano svuotata: il campo si toglie davvero dal server
    expect(doc.plannedAnnualExpenses).toEqual({ __deleteField: true });
  });
});
