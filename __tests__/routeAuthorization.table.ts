/**
 * The authorization table of every API handler — doc/sicurezza/README.md § 5 (S1, 2026-11-14).
 *
 * One row per `app/api/**​/route.ts` × exported method. `__tests__/routeAuthorization.test.ts`
 * reads the files from disk and fails when a handler is missing here or a row names a handler that
 * no longer exists (RA1), then calls every row without a credential (RA2), with a stranger's
 * token aimed at another account (RA3), with the account's own token (RA4), and checks that a
 * `viewer` row never touches the account named in the request (RA5).
 *
 * Kinds (§ 5):
 * - `owner`: the account comes from the request and passes `assertCanAccessAccount`.
 * - `resource`: the account is the `userId` of a stored document, then `assertCanAccessAccount`.
 * - `viewer`: only the token's uid; no account in the request.
 * - `token`: any valid token, no account data.
 * - `secret`: a shared secret, compared in constant time.
 * - `public`: no credential.
 *
 * Adding a route: add its row with the kind and a `request` that reaches the authorization check
 * (a body the route would refuse with 400 BEFORE checking the account proves nothing). A row that
 * cannot be called hermetically is exempted HERE with its reason (`exempt`), never silently.
 */

export type RouteKind = 'owner' | 'resource' | 'viewer' | 'token' | 'secret' | 'public';
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RouteRequest {
  query?: Record<string, string>;
  body?: unknown;
  params?: Record<string, string>;
}

export interface RouteRow {
  /** The path under `app/api/`, as on disk: `dividends/[dividendId]`. */
  route: string;
  method: Method;
  kind: RouteKind;
  /**
   * The request for `account`. For `resource` rows, `account` names whose stored document the
   * request points at (the fixture holds `dividends/div-<account>` and friends).
   */
  request: (account: string) => RouteRequest;
  /** The status a stranger gets when the design answers «not found» rather than 403. */
  strangerStatus?: 404;
  /** Secret rows: the environment variable holding the secret, and where the secret travels. */
  secret?: { env: 'CRON_SECRET' | 'WIKI_INGEST_SECRET'; in: 'header' | 'body' };
  /** A short note: the review point the row concerns, or why it is shaped as it is. */
  note?: string;
}

const body = (fields: Record<string, unknown>) => (account: string): RouteRequest => ({ body: { userId: account, ...fields } });
const query = (fields: Record<string, string> = {}) => (account: string): RouteRequest => ({ query: { userId: account, ...fields } });

export const ROUTE_TABLE: RouteRow[] = [
  // Sharing management: always the caller's own account.
  { route: 'account/members', method: 'GET', kind: 'viewer', request: () => ({}) },
  { route: 'account/members', method: 'POST', kind: 'viewer', request: () => ({ body: { email: 'fenicottero@example.com' } }), note: 'A2, F04' },
  { route: 'account/members', method: 'DELETE', kind: 'viewer', request: () => ({ query: { memberUid: 'member-x' } }) },

  { route: 'ai/analyze-performance', method: 'POST', kind: 'owner', request: body({ metrics: {}, timePeriod: 'YTD' }), note: 'A3, F04' },
  { route: 'ai/assistant/context', method: 'GET', kind: 'owner', request: query({ mode: 'month_analysis', year: '2026', month: '3' }) },
  { route: 'ai/assistant/memory', method: 'GET', kind: 'owner', request: query() },
  { route: 'ai/assistant/memory', method: 'PATCH', kind: 'owner', request: body({ action: 'acceptSuggestion', suggestionId: 's-1', itemId: 'i-1' }) },
  { route: 'ai/assistant/memory', method: 'DELETE', kind: 'owner', request: body({ itemId: 'i-1' }) },
  { route: 'ai/assistant/stream', method: 'POST', kind: 'owner', request: body({ mode: 'month_analysis', prompt: 'Ornitorinco', month: { year: 2026, month: 3 } }), note: 'A3, F04; strict schema A5, F07' },
  { route: 'ai/assistant/threads', method: 'GET', kind: 'owner', request: query() },
  { route: 'ai/assistant/threads/[threadId]', method: 'GET', kind: 'owner', request: (account) => ({ query: { userId: account }, params: { threadId: 'thread-1' } }) },
  { route: 'ai/assistant/threads/[threadId]', method: 'DELETE', kind: 'owner', request: (account) => ({ query: { userId: account }, params: { threadId: 'thread-1' } }) },

  { route: 'asset-transactions', method: 'POST', kind: 'owner', request: body({ transaction: {} }) },
  { route: 'asset-transactions/[transactionId]', method: 'PUT', kind: 'owner', request: (account) => ({ body: { userId: account, updates: {} }, params: { transactionId: 'tx-1' } }) },
  { route: 'asset-transactions/[transactionId]', method: 'DELETE', kind: 'owner', request: (account) => ({ query: { userId: account }, params: { transactionId: 'tx-1' } }) },
  { route: 'asset-transactions/by-asset/[assetId]', method: 'DELETE', kind: 'owner', request: (account) => ({ query: { userId: account }, params: { assetId: `asset-${account}` } }) },
  { route: 'asset-transactions/migrate', method: 'POST', kind: 'owner', request: body({}) },
  { route: 'asset-transactions/backfill-average-cost-eur', method: 'POST', kind: 'owner', request: body({}) },
  { route: 'assets/[assetId]', method: 'DELETE', kind: 'owner', request: (account) => ({ body: { userId: account }, params: { assetId: `asset-${account}` } }), note: 'RS6b' },

  { route: 'auth/check-registration', method: 'POST', kind: 'public', request: () => ({ body: { email: 'fenicottero@example.com' } }), note: 'A7' },

  { route: 'benchmarks/ecb-rates', method: 'GET', kind: 'token', request: () => ({}), note: 'A3, F04' },
  { route: 'benchmarks/fx-rates', method: 'GET', kind: 'token', request: () => ({}), note: 'A3, F04' },
  { route: 'benchmarks/returns', method: 'GET', kind: 'token', request: () => ({ query: { benchmarkId: 'msci-world' } }), note: 'A3, F04' },

  { route: 'cron/daily-dividend-processing', method: 'GET', kind: 'secret', secret: { env: 'CRON_SECRET', in: 'header' }, request: () => ({}) },
  { route: 'cron/monthly-snapshot', method: 'GET', kind: 'secret', secret: { env: 'CRON_SECRET', in: 'header' }, request: () => ({}) },

  { route: 'dashboard/overview', method: 'GET', kind: 'owner', request: query() },
  { route: 'dashboard/overview/invalidate', method: 'POST', kind: 'owner', request: (account) => ({ body: { ownerId: account, reason: 'test' } }) },

  { route: 'dividends', method: 'GET', kind: 'owner', request: query() },
  {
    route: 'dividends', method: 'POST', kind: 'owner',
    request: (account) => ({
      body: {
        userId: account,
        dividendData: {
          assetId: `asset-${account}`, exDate: '2026-03-10T12:00:00.000Z', paymentDate: '2026-03-10T12:00:00.000Z',
          dividendPerShare: 1, quantity: 50, grossAmount: 50, taxAmount: 0, netAmount: 50, currency: 'EUR', dividendType: 'ordinary',
        },
      },
    }),
  },
  { route: 'dividends/[dividendId]', method: 'PUT', kind: 'resource', request: (account) => ({ body: { updates: { netAmount: 50 } }, params: { dividendId: `div-${account}` } }), note: 'A4, RS5' },
  { route: 'dividends/[dividendId]', method: 'DELETE', kind: 'resource', request: (account) => ({ params: { dividendId: `div-${account}` } }), note: 'A4, RS5' },
  { route: 'dividends/scrape', method: 'POST', kind: 'owner', request: (account) => ({ body: { userId: account, assetId: `asset-${account}` } }), note: 'A3' },
  { route: 'dividends/stats', method: 'GET', kind: 'owner', request: query() },
  { route: 'dividends/sync-expenses', method: 'POST', kind: 'owner', request: (account) => ({ body: { userId: account, categoryId: `cat-${account}` } }), note: 'A1, RS1–RS4' },

  { route: 'goals', method: 'POST', kind: 'owner', request: body({ goal: {} }) },
  { route: 'hall-of-fame/recalculate', method: 'POST', kind: 'owner', request: body({}) },
  { route: 'performance/yields', method: 'POST', kind: 'owner', request: body({ periods: [{ key: 'ytd', startDate: '2026-01-01T00:00:00.000Z', dividendEndDate: '2026-03-31T00:00:00.000Z', numberOfMonths: 3 }] }) },

  { route: 'portfolio/exposure', method: 'GET', kind: 'viewer', request: () => ({}), note: 'a delegate reads their own account (functional, out of S1)' },
  { route: 'portfolio/instrument-profiles', method: 'GET', kind: 'owner', request: (account) => ({ query: { userId: account, assetIds: `asset-${account}` } }) },
  { route: 'portfolio/snapshot', method: 'POST', kind: 'owner', request: body({}), note: 'also accepts `cronSecret` in the body instead of a token' },
  {
    route: 'portfolio/snapshot/manual', method: 'POST', kind: 'owner',
    request: body({ year: 2026, month: 3, totalNetWorth: 2500, liquidNetWorth: 2500, illiquidNetWorth: 0, byAssetClass: { equity: 2500 } }),
    note: 'A5, F07: strict schema, then the account',
  },
  { route: 'portfolio/snapshot/restore', method: 'POST', kind: 'owner', request: body({ year: 2026, month: 3 }), note: 'F07 RI10: the undo of a replacement' },

  { route: 'prices/quote', method: 'GET', kind: 'token', request: () => ({ query: { ticker: 'VWCE.DE' } }), note: 'A3, F04' },
  { route: 'prices/bond-quote', method: 'GET', kind: 'token', request: () => ({ query: { isin: 'IT0005083057' } }), note: 'A3, F04' },
  { route: 'prices/update', method: 'POST', kind: 'owner', request: body({}) },

  { route: 'user/monthly-email/send', method: 'POST', kind: 'viewer', request: () => ({ body: { periodType: 'monthly' } }), note: 'A3, F04' },
  { route: 'wiki/ingest', method: 'POST', kind: 'secret', secret: { env: 'WIKI_INGEST_SECRET', in: 'header' }, request: () => ({ body: {} }) },
];
