import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createVaultClient, readVaultConfig } from '@/lib/server/wiki/githubVault';
import { ingestTheBull } from '@/lib/server/wiki/thebullCompiler';

/**
 * POST /api/wiki/ingest — TheBull's newsletter, sent by the owner's Google Apps Script
 * (doc/ai-open-models-wiki.md § 5.2; the script in `scripts/wiki/thebullIngest.gs`).
 *
 * Auth is a shared secret (`WIKI_INGEST_SECRET`), not a user session: the caller is a script in
 * the owner's Gmail. Idempotent on the newsletter's date — a second POST of the same issue is a
 * 200 `duplicate`, so the script can label the message either way; a mail from the same sender that
 * is not an issue (the subscription confirmation) is a 200 `ignored`, labelled and never sent again.
 * The compilation runs in the same request; when it fails the raw is still committed and the daily
 * cron retries it.
 */

// One model call plus a handful of GitHub requests: well past the default on a slow provider.
export const maxDuration = 120;

/** A newsletter is ~16k characters; ten times that is not a newsletter. */
const MAX_TEXT_CHARS = 200_000;

const bodySchema = z.object({
  source: z.literal('thebull'),
  receivedAt: z.string().datetime({ offset: true }),
  subject: z.string().max(500),
  text: z.string().min(1),
});

function verifyIngestSecret(header: string | null): boolean {
  const expected = process.env.WIKI_INGEST_SECRET;
  const provided = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  if (!expected || !provided) return false;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!verifyIngestSecret(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }
  const config = readVaultConfig();
  if (!config) {
    return NextResponse.json({ error: 'Vault non configurato (WIKI_GITHUB_TOKEN, WIKI_GITHUB_REPO)' }, { status: 503 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo non valido' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Corpo non valido' }, { status: 400 });
  }
  if (parsed.data.text.length > MAX_TEXT_CHARS) {
    return NextResponse.json({ error: 'Testo troppo lungo' }, { status: 413 });
  }

  try {
    const outcome = await ingestTheBull(parsed.data, { vault: createVaultClient(config) });
    console.info('[wiki] ingest', outcome);
    return NextResponse.json(outcome, { status: outcome.status === 'ingested' ? 201 : 200 });
  } catch (error) {
    console.error('[wiki] ingest failed:', error);
    return NextResponse.json({ error: 'Scrittura nel vault non riuscita' }, { status: 502 });
  }
}
