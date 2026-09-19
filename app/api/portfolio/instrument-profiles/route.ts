import { NextRequest, NextResponse } from 'next/server';
import { assertCanAccessAccount, getApiAuthErrorResponse, requireFirebaseAuth } from '@/lib/server/apiAuth';
import { getUserAssetsAdmin } from '@/lib/server/assetAdminRepository';
import { resolveInstrumentProfiles } from '@/lib/server/exposure/profileResolver';
import { resolveAllocationRole } from '@/lib/utils/allocationUtils';
import type { InstrumentProfile } from '@/types/exposure';

const MAX_ASSET_IDS = 40;

/**
 * GET /api/portfolio/instrument-profiles?userId=<ownerId>&assetIds=<id1,id2,...>
 *
 * Resolves curated/Yahoo instrument profiles for a specific set of assets — the weight optimizer's
 * PAC candidates (`doc/weight-optimizer-ate.md` §8.2), which may include a zero-quantity asset the
 * plan proposes to BUY. No route-level cache: `resolveInstrumentProfiles` already carries its own
 * 30-day `instrument-profile-cache/{ticker}`.
 *
 * Auth: delegation-aware, same model as `/api/asset-transactions` — the caller must be the owner or
 * a granted member of `ownerId`'s account.
 */
export async function GET(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);

    const ownerId = request.nextUrl.searchParams.get('userId');
    await assertCanAccessAccount(decodedToken, ownerId);

    const assetIds = (request.nextUrl.searchParams.get('assetIds') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    if (assetIds.length === 0) {
      return NextResponse.json({ error: 'assetIds is required' }, { status: 400 });
    }
    if (assetIds.length > MAX_ASSET_IDS) {
      return NextResponse.json({ error: `assetIds accepts at most ${MAX_ASSET_IDS} ids` }, { status: 400 });
    }

    const requestedIds = new Set(assetIds);
    const assets = await getUserAssetsAdmin(ownerId as string);
    const selected = assets.filter((a) => {
      if (!requestedIds.has(a.id)) return false;
      const role = resolveAllocationRole(a);
      return role === 'tradable' || role === 'frozen';
    });

    const profileMap = await resolveInstrumentProfiles(selected, { includeZeroQuantity: true });
    const profiles: Record<string, InstrumentProfile> = Object.fromEntries(profileMap);

    return NextResponse.json({ profiles, computedAt: new Date().toISOString() });
  } catch (error) {
    const authError = getApiAuthErrorResponse(error);
    if (authError) return authError;

    console.error('[instrument-profiles] Error resolving instrument profiles:', error);
    return NextResponse.json({ error: 'Failed to resolve instrument profiles' }, { status: 500 });
  }
}
