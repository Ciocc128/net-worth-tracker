import { NextRequest, NextResponse } from 'next/server';
import {
  assertCanAccessAccount,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { isAssistantStoreError, listAssistantThreads } from '@/lib/server/assistant/store';

// Threads are created server-side inside the stream route (it calls `createAssistantThread`
// directly when the request carries no `threadId`), so this resource is read-only: there is no
// POST handler by design. A client-side "create empty thread" flow would need one added back.

export async function GET(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const userId = request.nextUrl.searchParams.get('userId');

    await assertCanAccessAccount(decodedToken, userId);

    const threads = await listAssistantThreads(userId as string);
    return NextResponse.json({ threads });
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    if (isAssistantStoreError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[API /ai/assistant/threads] GET error:', error);
    return NextResponse.json(
      { error: 'Impossibile recuperare i thread dell’assistente' },
      { status: 500 }
    );
  }
}
