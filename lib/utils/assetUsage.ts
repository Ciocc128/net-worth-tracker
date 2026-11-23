/**
 * «Dove è usato» — the report behind the delete-an-asset dialog (doc/cancellazione-strumenti/README.md
 * § 4.1–4.3). Pure, no SDK: the server reads the documents (`assetUsageReader.ts`) and hands them
 * here, so the dialog and the DELETE route read the SAME rule.
 *
 * Three outcomes per reference (D-CA3): `blockers` stop the deletion, `cleanups` are removed by it,
 * `kept` stay. The ledger (R1) and the pension contributions (R15) are the one thing the user chooses.
 */
import { SENTENCES } from '@/lib/utils/assetUsageNarrative';

export type LedgerChoice = 'keep' | 'delete';

export interface UsageLine {
  /** The row of § 4.1 (R4, R6…). */
  code: string;
  area: string;
  count?: number;
  sentence: string;
  href?: string;
}

export interface AssetUsage {
  asset: { id: string; name: string; type: string; quantity: number };
  ledger: { count: number; quantity: number; firstDate: string | null; lastDate: string | null };
  /** R15 — the contributions into a pension fund: they follow the same keep/delete choice. */
  pensionContributions: number;
  dividends: { future: number; past: number };
  blockers: UsageLine[];
  cleanups: UsageLine[];
  kept: UsageLine[];
  /** True when the user must choose what happens to the ledger (and the contributions). */
  needsLedgerChoice: boolean;
  /** D-CA2b: `keep` when everything was sold, null (no voice chosen) otherwise. */
  defaultLedgerChoice: LedgerChoice | null;
  /** What the cleanups will write, for the server (never sent to the client as a command). */
  plan: {
    instrumentLimits: boolean;
    groupLimitIds: string[];
    emptiedGroupIds: string[];
    goalAssignments: boolean;
    pointers: Array<'defaultDebitCashAssetId' | 'defaultCreditCashAssetId' | 'dividendCashAssetId'>;
    assetsToUnlinkDividendAccount: string[];
  };
}

interface PlanLike {
  name: string;
  status: string;
  positions?: Array<{ memberAssetIds?: string[]; buyAssetId?: string }>;
  disposals?: Array<{ assetId: string }>;
  liquidity?: { sourceCashAssetIds?: string[] };
  installments?: Array<{ lines?: Array<{ assetId: string }> }>;
}

export interface AssetUsageInput {
  asset: { id: string; name: string; type: string; quantity: number };
  today: Date;
  /** The asset's own ledger rows (R1). */
  transactions: Array<{ date: Date | null }>;
  /** Rows of OTHER assets that settle on this account (R2). */
  settlingTransactions: number;
  dividends: Array<{ exDate: Date | null }>;
  plans: PlanLike[];
  model: { weights: Array<{ assetId: string; memberAssetIds?: string[]; targetPercentage: number }> } | null;
  idealAllocation: {
    instrumentLimits?: Array<{ assetId: string; minPct?: number; maxPct?: number }>;
    groupLimits?: Array<{ id: string; label: string; assetIds: string[] }>;
  } | null;
  pointers: {
    defaultDebitCashAssetId?: string;
    defaultCreditCashAssetId?: string;
    dividendCashAssetId?: string;
  } | null;
  goals: Array<{ id: string; name: string }>;
  goalAssignments: Array<{ goalId: string; assetId: string }>;
  otherAssets: Array<{ id: string; name: string; type: string; dividendCashAssetId?: string; financedAssetId?: string }>;
  fireDatedFlows: Array<{ source?: { kind: string; propertyId?: string } }>;
  /** Cashflow rows that name the asset as account or loan (R14). */
  expenseRows: number;
  /** Pension contributions: into this fund (R15) and naming it as source account. */
  pensionContributionsInto: number;
  pensionContributionsFrom: number;
}

const ALLOCATION_HREF = '/dashboard/allocation?tab=accumulo';
/** The model portfolio's block in Allocazione › Strategia (RU8). */
const MODEL_HREF = '/dashboard/allocation?tab=strategia#portafoglio-modello';

function planReferences(plan: PlanLike, id: string): boolean {
  return (
    (plan.positions ?? []).some((p) => p.buyAssetId === id || (p.memberAssetIds ?? []).includes(id)) ||
    (plan.disposals ?? []).some((d) => d.assetId === id) ||
    (plan.liquidity?.sourceCashAssetIds ?? []).includes(id) ||
    (plan.installments ?? []).some((i) => (i.lines ?? []).some((l) => l.assetId === id))
  );
}

const iso = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

export function buildAssetUsage(input: AssetUsageInput): AssetUsage {
  const { asset } = input;
  const id = asset.id;
  const blockers: UsageLine[] = [];
  const cleanups: UsageLine[] = [];
  const kept: UsageLine[] = [];

  // R4 — an open plan (draft or active) that cites the asset in any way stops the deletion (D-CA4).
  for (const plan of input.plans) {
    if ((plan.status === 'draft' || plan.status === 'active') && planReferences(plan, id)) {
      blockers.push({ code: 'R4', area: 'Accumulo', sentence: SENTENCES.R4(plan.name), href: ALLOCATION_HREF });
    }
  }
  // R5 — closed plans keep their saved names.
  const closedPlans = input.plans.filter((p) => (p.status === 'completed' || p.status === 'cancelled') && planReferences(p, id)).length;
  if (closedPlans > 0) kept.push({ code: 'R5', area: 'Piani conclusi', count: closedPlans, sentence: SENTENCES.R5(closedPlans) });

  // R6 — a weight in the model stops it (D-CA5).
  const weight = input.model?.weights.find((w) => w.assetId === id || (w.memberAssetIds ?? []).includes(id));
  if (weight) {
    blockers.push({ code: 'R6', area: 'Portafoglio modello', sentence: SENTENCES.R6(weight.targetPercentage), href: MODEL_HREF });
  }

  // R12 — a property financed by loans stops it; deleting the loan itself is free (D-CA6).
  if (asset.type !== 'loan') {
    for (const other of input.otherAssets) {
      if (other.type === 'loan' && other.financedAssetId === id) {
        blockers.push({ code: 'R12', area: 'Patrimonio', sentence: SENTENCES.R12(other.name), href: '/dashboard/assets' });
      }
    }
  }

  // R7, R8 — the limits of the Criteri.
  const ideal = input.idealAllocation;
  let instrumentLimits = false;
  for (const limit of ideal?.instrumentLimits ?? []) {
    if (limit.assetId === id) {
      instrumentLimits = true;
      cleanups.push({ code: 'R7', area: 'Criteri', sentence: SENTENCES.R7(limit.minPct, limit.maxPct) });
    }
  }
  const groupLimitIds: string[] = [];
  const emptiedGroupIds: string[] = [];
  for (const group of ideal?.groupLimits ?? []) {
    if (!group.assetIds.includes(id)) continue;
    const alone = group.assetIds.filter((member) => member !== id).length === 0;
    groupLimitIds.push(group.id);
    if (alone) emptiedGroupIds.push(group.id);
    cleanups.push({ code: 'R8', area: 'Criteri', sentence: SENTENCES.R8(group.label, alone) });
  }

  // R9 — the goals' quotas.
  const goalNames = new Map(input.goals.map((g) => [g.id, g.name]));
  const assignments = input.goalAssignments.filter((a) => a.assetId === id);
  for (const assignment of assignments) {
    cleanups.push({ code: 'R9', area: 'Traguardi', sentence: SENTENCES.R9(goalNames.get(assignment.goalId) ?? 'senza nome') });
  }

  // R10, R11 — the account pointers.
  const pointers: AssetUsage['plan']['pointers'] = [];
  for (const field of ['defaultDebitCashAssetId', 'defaultCreditCashAssetId', 'dividendCashAssetId'] as const) {
    if (input.pointers?.[field] === id) {
      pointers.push(field);
      cleanups.push({ code: 'R10', area: 'Impostazioni', sentence: SENTENCES.R10(field) });
    }
  }
  const assetsToUnlinkDividendAccount: string[] = [];
  for (const other of input.otherAssets) {
    if (other.id !== id && other.dividendCashAssetId === id) {
      assetsToUnlinkDividendAccount.push(other.id);
      cleanups.push({ code: 'R11', area: 'Patrimonio', sentence: SENTENCES.R11(other.name) });
    }
  }

  // Kept: R2, R13, R14, R15 (the source account).
  if (input.settlingTransactions > 0) {
    kept.push({ code: 'R2', area: 'Registro', count: input.settlingTransactions, sentence: SENTENCES.R2(input.settlingTransactions) });
  }
  const flows = input.fireDatedFlows.filter((f) => f.source?.kind === 'mortgage' && f.source.propertyId === id).length;
  if (flows > 0) kept.push({ code: 'R13', area: 'FIRE', count: flows, sentence: SENTENCES.R13(flows), href: '/dashboard/fire-simulations' });
  if (input.expenseRows > 0) kept.push({ code: 'R14', area: 'Cashflow', count: input.expenseRows, sentence: SENTENCES.R14(input.expenseRows) });
  if (input.pensionContributionsFrom > 0) {
    kept.push({ code: 'R15', area: 'Previdenza', count: input.pensionContributionsFrom, sentence: SENTENCES.R15(input.pensionContributionsFrom) });
  }

  // R1 + R15: what the user chooses.
  const dates = input.transactions.map((t) => t.date).filter((d): d is Date => d !== null).sort((a, b) => a.getTime() - b.getTime());
  const ledgerCount = input.transactions.length;
  const pension = input.pensionContributionsInto;
  const needsLedgerChoice = ledgerCount + pension > 0;
  const defaultLedgerChoice: LedgerChoice | null = needsLedgerChoice && asset.quantity === 0 && pension === 0 ? 'keep' : null;

  const cutoff = new Date(input.today);
  cutoff.setHours(0, 0, 0, 0);
  const future = input.dividends.filter((d) => d.exDate && d.exDate.getTime() > cutoff.getTime()).length;

  return {
    asset,
    ledger: {
      count: ledgerCount,
      quantity: asset.quantity,
      firstDate: iso(dates[0] ?? null),
      lastDate: iso(dates[dates.length - 1] ?? null),
    },
    pensionContributions: pension,
    dividends: { future, past: input.dividends.length - future },
    blockers,
    cleanups,
    kept,
    needsLedgerChoice,
    defaultLedgerChoice,
    plan: { instrumentLimits, groupLimitIds, emptiedGroupIds, goalAssignments: assignments.length > 0, pointers, assetsToUnlinkDividendAccount },
  };
}
