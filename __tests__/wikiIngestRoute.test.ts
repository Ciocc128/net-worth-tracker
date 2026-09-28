/**
 * POST /api/wiki/ingest: the shared secret (with its positive control — the right secret gets
 * in, the wrong one does not, same body), the vault switched off when unconfigured, and the
 * body's shape and size refused before anything is written.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const { ingestMock } = vi.hoisted(() => ({ ingestMock: vi.fn() }));
vi.mock('@/lib/server/wiki/thebullCompiler', () => ({ ingestTheBull: ingestMock }));

import { POST } from '@/app/api/wiki/ingest/route';

const body = { source: 'thebull', receivedAt: '2026-06-14T06:32:27Z', subject: 'Il fenicottero', text: '#7 - 14/06/2026' };

function post(payload: unknown, auth: string | null = 'Bearer segreto-fenicottero') {
  return new NextRequest('http://localhost/api/wiki/ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}

beforeEach(() => {
  vi.stubEnv('WIKI_INGEST_SECRET', 'segreto-fenicottero');
  vi.stubEnv('WIKI_GITHUB_TOKEN', 'tok');
  vi.stubEnv('WIKI_GITHUB_REPO', 'owner/finance-wiki');
  ingestMock.mockReset();
  ingestMock.mockResolvedValue({ status: 'ingested', date: '2026-06-14', week: '2026-W24', compiled: true });
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('the secret', () => {
  it('the right secret gets in (201) — the positive control', async () => {
    const response = await POST(post(body));
    expect(response.status).toBe(201);
    expect(ingestMock).toHaveBeenCalledWith(body, expect.objectContaining({ vault: expect.any(Object) }));
  });

  it.each([
    ['a wrong secret', 'Bearer ornitorinco'],
    ['no header', null],
    ['the secret without Bearer', 'segreto-fenicottero'],
  ])('%s is refused (401), and nothing is ingested', async (_, auth) => {
    const response = await POST(post(body, auth));
    expect(response.status).toBe(401);
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it('refuses everyone while the secret is unset', async () => {
    vi.stubEnv('WIKI_INGEST_SECRET', '');
    expect((await POST(post(body, 'Bearer '))).status).toBe(401);
  });
});

describe('the request', () => {
  it('is 503 while the vault is not configured', async () => {
    vi.stubEnv('WIKI_GITHUB_REPO', '');
    expect((await POST(post(body))).status).toBe(503);
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it.each([
    ['not JSON', '{nope'],
    ['another source', { ...body, source: 'altro' }],
    ['a receipt that is not a date', { ...body, receivedAt: 'domenica' }],
    ['an empty text', { ...body, text: '' }],
  ])('refuses %s (400)', async (_, payload) => {
    expect((await POST(post(payload))).status).toBe(400);
    expect(ingestMock).not.toHaveBeenCalled();
  });

  it('refuses a text past 200.000 characters (413)', async () => {
    expect((await POST(post({ ...body, text: 'x'.repeat(200_001) }))).status).toBe(413);
  });

  it('answers a duplicate with 200, so the script labels the message either way', async () => {
    ingestMock.mockResolvedValue({ status: 'duplicate', date: '2026-06-14' });
    const response = await POST(post(body));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'duplicate', date: '2026-06-14' });
  });

  it('answers a mail that is not an issue with 200 `ignored`, so the script labels it and stops', async () => {
    ingestMock.mockResolvedValue({ status: 'ignored', reason: 'non è un numero della newsletter' });
    const response = await POST(post(body));
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe('ignored');
  });

  it('is 502 when the vault write fails — the script will send it again next time', async () => {
    ingestMock.mockRejectedValue(new Error('[vault] update ref failed with HTTP 500'));
    expect((await POST(post(body))).status).toBe(502);
  });
});
