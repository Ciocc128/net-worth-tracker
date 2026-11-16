/**
 * The authorization table of every API handler — doc/sicurezza/README.md § 6 (RA1–RA5), D-SI7.
 *
 * The review of 2026-11-11 found two routes that wrote in another account (A1, A4) while 14 route
 * files had no test at all: nothing failed when a route was born without its check. This file
 * closes the CLASS: it reads the handlers from disk and holds each against its row of
 * `routeAuthorization.table.ts`.
 *
 * Every route runs for real over the in-memory Admin fake (`helpers/adminFake.ts`), which records
 * every document path read and written; `fetch` rejects, so no route reaches the network. RA4 asks
 * only «neither 401 nor 403» (D-SI8): the 200 and the payload are each route's own test.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/firebase/admin', async () => (await import('./helpers/adminFake')).adminModule);

import { fake, bearer } from './helpers/adminFake';
import { resetAllowedUserMemory } from '@/lib/server/apiAuth';
import { ROUTE_TABLE, type RouteRow } from './routeAuthorization.table';

const API_DIR = path.resolve(__dirname, '..', 'app', 'api');
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
const SECRETS = { CRON_SECRET: 'cron-secret-test', WIKI_INGEST_SECRET: 'wiki-secret-test' } as const;
// The AI routes answer «not configured» before the account check without a key: with one, they
// reach it (the SDK's own calls then fail on the stubbed `fetch`).
const ENV = { ...SECRETS, ANTHROPIC_API_KEY: 'test-key-not-real', OPENROUTER_API_KEY: 'test-key-not-real' };

/** Every `route.ts` under app/api, as `route × method`, read from the files themselves. */
function handlersOnDisk(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry === 'route.ts') {
        const source = readFileSync(full, 'utf8');
        const route = path.relative(API_DIR, dir).split(path.sep).join('/');
        for (const method of METHODS) {
          if (new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\b|export\\s+const\\s+${method}\\b`).test(source)) {
            found.push(`${route} ${method}`);
          }
        }
      }
    }
  };
  walk(API_DIR);
  return found.sort();
}

const keyOf = (row: RouteRow) => `${row.route} ${row.method}`;

function seedAccounts() {
  const paid = Timestamp.fromDate(new Date('2026-03-10T12:00:00Z'));
  for (const account of ['owner-1', 'stranger', 'member-1']) {
    fake.set(`assets/asset-${account}`, { userId: account, type: 'etf', assetClass: 'equity', ticker: 'ORNI', name: 'Ornitorinco', quantity: 50, currentPrice: 50, currency: 'EUR' });
    fake.set(`dividends/div-${account}`, {
      userId: account, assetId: `asset-${account}`, assetTicker: 'ORNI', assetName: 'Ornitorinco',
      exDate: paid, paymentDate: paid, netAmount: 50, grossAmount: 50, taxAmount: 0, currency: 'EUR',
    });
    fake.set(`expenseCategories/cat-${account}`, { userId: account, name: 'Fenicottero', type: 'income', subCategories: [] });
  }
  fake.set('account-access/owner-1', { memberUids: ['member-1'] });
  // F04 (S2 RU1): the three personas are admitted; `outsider` has a valid token and no document.
  fake.allow('owner-1', 'stranger', 'member-1');
}

type Credential = { uid: string } | { secret: string } | null;

async function call(row: RouteRow, account: string, credential: Credential, extra?: { userId: string }) {
  const mod = (await import(path.join(API_DIR, row.route, 'route.ts'))) as Record<string, (...args: unknown[]) => Promise<Response>>;
  const handler = mod[row.method];
  const spec = row.request(account);

  const url = new URL(`http://localhost/api/${row.route}`);
  for (const [key, value] of Object.entries({ ...(spec.query ?? {}), ...(extra ? { userId: extra.userId } : {}) })) {
    url.searchParams.set(key, value);
  }
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  let requestBody = spec.body as Record<string, unknown> | undefined;
  if (credential && 'uid' in credential) Object.assign(headers, bearer(credential.uid));
  if (credential && 'secret' in credential) {
    if (row.secret?.in === 'body') requestBody = { ...(requestBody ?? {}), cronSecret: credential.secret };
    else headers.authorization = `Bearer ${credential.secret}`;
  }
  if (extra) requestBody = { ...(requestBody ?? {}), userId: extra.userId };

  const request = new NextRequest(url, {
    method: row.method,
    headers,
    ...(row.method !== 'GET' && requestBody !== undefined ? { body: JSON.stringify(requestBody) } : {}),
  });
  const response = await handler(request, { params: Promise.resolve(spec.params ?? {}) });
  return response.status;
}

beforeAll(() => {
  vi.stubGlobal('fetch', vi.fn(async () => {
    throw new Error('network disabled in routeAuthorization.test.ts');
  }));
  for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);
  // The routes log their refusals; the table reads statuses, not logs.
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

beforeEach(() => {
  fake.reset();
  resetAllowedUserMemory();
  seedAccounts();
  fake.clearLog();
});

describe('RA1 — the table and the files agree', () => {
  it('lists every handler on disk, and nothing else', () => {
    const onDisk = handlersOnDisk();
    const inTable = ROUTE_TABLE.map(keyOf).sort();
    expect(new Set(inTable).size, 'a handler listed twice').toBe(inTable.length);
    expect(onDisk.filter((key) => !inTable.includes(key)), 'handlers missing from routeAuthorization.table.ts').toEqual([]);
    expect(inTable.filter((key) => !onDisk.includes(key)), 'rows whose handler is gone').toEqual([]);
  });
});

const protectedRows = ROUTE_TABLE.filter((row) => row.kind !== 'public');
const accountRows = ROUTE_TABLE.filter((row) => row.kind === 'owner' || row.kind === 'resource');
const admittedRows = ROUTE_TABLE.filter((row) => ['owner', 'resource', 'viewer', 'token'].includes(row.kind));
const ownTokenRows = ROUTE_TABLE.filter((row) => ['owner', 'resource', 'viewer', 'token', 'activation'].includes(row.kind));
const viewerRows = ROUTE_TABLE.filter((row) => row.kind === 'viewer');
const secretRows = ROUTE_TABLE.filter((row) => row.kind === 'secret');

describe('RA2 — without a credential the answer is 401 and nothing is written', () => {
  it.each(protectedRows.map((row) => [keyOf(row), row] as const))('%s', async (_key, row) => {
    expect(await call(row, 'owner-1', null)).toBe(401);
    expect(fake.writes).toEqual([]);

    if (row.kind === 'secret') {
      expect(await call(row, 'owner-1', { secret: 'not-the-secret' })).toBe(401);
      expect(fake.writes).toEqual([]);
    }
  });
});

describe('RA3 — a stranger’s token aimed at another account is refused and writes nothing', () => {
  it.each(accountRows.map((row) => [keyOf(row), row] as const))('%s', async (_key, row) => {
    const status = await call(row, 'owner-1', { uid: 'stranger' });
    expect(status).toBe(row.strangerStatus ?? 403);
    expect(fake.writes).toEqual([]);
  });
});

describe('RA4 — the account’s own token is neither 401 nor 403', () => {
  it.each(ownTokenRows.map((row) => [keyOf(row), row] as const))('%s', async (_key, row) => {
    const status = await call(row, 'owner-1', { uid: 'owner-1' });
    expect([401, 403]).not.toContain(status);
  }, 20_000);

  it.each(accountRows.map((row) => [keyOf(row), row] as const))('a member of the shared account: %s', async (_key, row) => {
    const status = await call(row, 'owner-1', { uid: 'member-1' });
    expect([401, 403]).not.toContain(status);
  }, 20_000);

  it.each(secretRows.map((row) => [keyOf(row), row] as const))('the right secret: %s', async (_key, row) => {
    const status = await call(row, 'owner-1', { secret: SECRETS[row.secret!.env] });
    expect([401, 403]).not.toContain(status);
  }, 20_000);
});

describe('RA5 — a viewer route never touches the account named in the request', () => {
  it.each(viewerRows.map((row) => [keyOf(row), row] as const))('%s', async (_key, row) => {
    await call(row, 'stranger', { uid: 'stranger' }, { userId: 'owner-1' });
    expect([...fake.reads, ...fake.writes].filter((docPath) => docPath.includes('owner-1'))).toEqual([]);
  }, 20_000);
});

describe('RA6 — a valid token of a user the server never admitted is refused everywhere (F04, S2 RU4)', () => {
  it.each(admittedRows.map((row) => [keyOf(row), row] as const))('%s', async (_key, row) => {
    // The outsider aims at its OWN account: the refusal must come from the list, not the account check.
    const status = await call(row, 'outsider', { uid: 'outsider' });
    expect(status).toBe(403);
    expect(fake.writes).toEqual([]);
    expect(fake.reads).toEqual(['allowed-users/outsider']);
  });

  it('the activation row is exempt by kind: it is the door into the list', () => {
    expect(ROUTE_TABLE.filter((row) => row.kind === 'activation').map(keyOf)).toEqual(['auth/activate POST']);
  });
});
