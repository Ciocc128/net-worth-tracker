/**
 * accumulationPlanSchema — structural (zod) and domain validation for a PAC draft (doc/pac-ate.md §6).
 *
 * `accumulationPlanDraftSchema` checks SHAPE only (ranges, required fields); everything that needs
 * the actual portfolio (a member's allocationRole, a source account's assetClass) lives in
 * `validateDraftAgainstAssets`, which reads `assetsById` and never Firebase — same Firebase-free
 * discipline as `accumulationPlanUtils.ts`, but this module is allowed the role helper it needs.
 */
import { z } from 'zod';
import type { Asset } from '@/types/assets';
import type { AccumulationPlanDraft } from '@/types/accumulationPlan';
import { resolveAllocationRole } from './allocationUtils';
import { describeDraftIssue, type DraftIssueCode } from './accumulationNarrative';

export interface DraftIssue {
  code: DraftIssueCode;
  message: string;
  assetId?: string;
  positionId?: string;
}

const planPositionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  targetPercentage: z.number(),
  memberAssetIds: z.array(z.string().min(1)).min(1),
  buyAssetId: z.string().min(1),
});

const planDisposalSchema = z.object({
  assetId: z.string().min(1),
  estimatedProceedsEur: z.number(),
  status: z.enum(['planned', 'executed', 'skipped']),
  transactionIds: z.array(z.string()).optional(),
  executedAmountEur: z.number().optional(),
});

const planLiquiditySchema = z.object({
  sourceCashAssetIds: z.array(z.string().min(1)),
  reserveEur: z.number(),
  monthlyInflowEur: z.number(),
});

export const accumulationPlanDraftSchema = z.object({
  name: z.string().min(1),
  startMonth: z.string().regex(/^\d{4}-\d{2}$/),
  months: z.number().int(),
  liquidity: planLiquiditySchema,
  positions: z.array(planPositionSchema),
  disposals: z.array(planDisposalSchema),
});

/** Every asset a draft names, whichever role it plays. */
function labelOf(assetId: string, assetsById: Map<string, Asset>): string {
  return assetsById.get(assetId)?.name ?? assetId;
}

/**
 * Cross-referential checks that need the real portfolio. Structural checks (§ months_range,
 * negative_amount shape) are covered by `accumulationPlanDraftSchema` at the call site that owns
 * parsing; this function assumes the draft already parsed and re-checks the numeric ranges that
 * ALSO need to surface as a `DraftIssue` (so the editor's status line, not zod's own error shape,
 * is what the user reads).
 */
export function validateDraftAgainstAssets(
  draft: AccumulationPlanDraft,
  assetsById: Map<string, Asset>
): DraftIssue[] {
  const issues: DraftIssue[] = [];

  if (!Number.isInteger(draft.months) || draft.months < 1 || draft.months > 60) {
    issues.push({ code: 'months_range', message: describeDraftIssue({ code: 'months_range' }) });
  }
  if (draft.liquidity.reserveEur < 0 || draft.liquidity.monthlyInflowEur < 0) {
    issues.push({ code: 'negative_amount', message: describeDraftIssue({ code: 'negative_amount' }) });
  }

  if (draft.positions.length === 0) {
    issues.push({ code: 'no_positions', message: describeDraftIssue({ code: 'no_positions' }) });
  }

  const sum = draft.positions.reduce((total, p) => total + p.targetPercentage, 0);
  if (draft.positions.length > 0 && Math.abs(sum - 100) > 0.01) {
    issues.push({ code: 'weights_sum', message: describeDraftIssue({ code: 'weights_sum', sum }) });
  }

  for (const position of draft.positions) {
    if (position.targetPercentage < 0) {
      issues.push({
        code: 'weight_negative',
        message: describeDraftIssue({ code: 'weight_negative', label: position.label }),
        positionId: position.id,
      });
    }
    if (!position.memberAssetIds.includes(position.buyAssetId)) {
      issues.push({
        code: 'buy_not_member',
        message: describeDraftIssue({ code: 'buy_not_member', label: position.label }),
        positionId: position.id,
        assetId: position.buyAssetId,
      });
    }
    for (const memberId of position.memberAssetIds) {
      const member = assetsById.get(memberId);
      if (member && resolveAllocationRole(member) !== 'tradable') {
        issues.push({
          code: 'position_not_tradable',
          message: describeDraftIssue({ code: 'position_not_tradable', label: labelOf(memberId, assetsById) }),
          positionId: position.id,
          assetId: memberId,
        });
      }
    }
  }

  for (const disposal of draft.disposals) {
    const asset = assetsById.get(disposal.assetId);
    if (asset && resolveAllocationRole(asset) !== 'tradable') {
      issues.push({
        code: 'position_not_tradable',
        message: describeDraftIssue({ code: 'position_not_tradable', label: labelOf(disposal.assetId, assetsById) }),
        assetId: disposal.assetId,
      });
    }
  }

  // duplicate_asset: an asset in two positions, or in a position AND a disposal.
  const seenIn = new Map<string, number>();
  for (const position of draft.positions) {
    for (const memberId of position.memberAssetIds) {
      seenIn.set(memberId, (seenIn.get(memberId) ?? 0) + 1);
    }
  }
  for (const disposal of draft.disposals) {
    seenIn.set(disposal.assetId, (seenIn.get(disposal.assetId) ?? 0) + 1);
  }
  for (const [assetId, count] of seenIn.entries()) {
    if (count > 1) {
      issues.push({
        code: 'duplicate_asset',
        message: describeDraftIssue({ code: 'duplicate_asset', label: labelOf(assetId, assetsById) }),
        assetId,
      });
    }
  }

  for (const sourceId of draft.liquidity.sourceCashAssetIds) {
    const asset = assetsById.get(sourceId);
    if (asset && asset.assetClass !== 'cash') {
      issues.push({
        code: 'source_not_cash',
        message: describeDraftIssue({ code: 'source_not_cash', label: labelOf(sourceId, assetsById) }),
        assetId: sourceId,
      });
    }
  }

  const assignedAssetIds = new Set(seenIn.keys());
  for (const asset of assetsById.values()) {
    if (assignedAssetIds.has(asset.id)) continue;
    if (resolveAllocationRole(asset) !== 'tradable') continue;
    if (asset.quantity <= 0) continue;
    issues.push({
      code: 'unassigned_tradable',
      message: describeDraftIssue({ code: 'unassigned_tradable', label: asset.name }),
      assetId: asset.id,
    });
  }

  return issues;
}
