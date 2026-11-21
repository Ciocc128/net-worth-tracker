import { NextRequest, NextResponse } from 'next/server';
import {
  assertCanAccessAccount,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { readAssetUsage } from '@/lib/server/assetUsageReader';
import { assetIdParamSchema, parseOr400 } from '@/lib/server/validation';

/**
 * GET /api/assets/[assetId]/usage?userId=...
 *
 * «Dove è usato»: the report behind the delete dialog (doc/cancellazione-strumenti/README.md § 4.4).
 * Read-only; the DELETE re-reads the same report, so what the dialog shows is what the server obeys.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const assetIdResult = parseOr400(assetIdParamSchema, (await params).assetId);
    if (!assetIdResult.ok) return assetIdResult.response;

    const userId = request.nextUrl.searchParams.get('userId');
    await assertCanAccessAccount(decodedToken, userId);

    const usage = await readAssetUsage(userId as string, assetIdResult.data);
    if (!usage) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }
    return NextResponse.json(usage);
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;
    console.error('Error reading asset usage:', error);
    return NextResponse.json({ error: 'Failed to read asset usage' }, { status: 500 });
  }
}
