# Server layer — API routes, Admin SDK and Vercel functions

> **When to open this guide** — anyone touching an `app/api/**/route.ts`, `lib/server/*` (the `server-only` modules, `lib/server/validation.ts`, `lib/server/serverTiming.ts`), `lib/firebase/admin.ts`, the cron routes (`app/api/cron/*/route.ts`, `CRON_SECRET`) or `vercel.json` — or anyone taking a server dependency. `AGENTS.md` keeps the stub in § Server Layer and API Authorization; here is the full rule. The environment and the deploy are `SETUP.md`'s.

## Files

- **Server layer**: `app/api/**/route.ts` (the cron routes `app/api/cron/{daily-dividend-processing,monthly-snapshot,period-recap}/route.ts`, `/api/portfolio/snapshot`, `lib/server/{portfolioSnapshot,cronRun,deliveryRecord,periodEmailDelivery,emailTransport}.ts`, `lib/utils/periodRecapDue.ts`), `lib/server/*` (server-only: `apiAuth.ts` with `assertCanAccessAccount`, `validation.ts` with the reusable schemas, `isoDateSchema` and `parseOr400`, `serverTiming.ts` with `startTiming()` and `ServerTimingRecorder`), `lib/firebase/admin.ts` (the Admin SDK), `vercel.json`, `package.json` (`overrides`, `engines.node`); tests `__tests__/vercelConfig.test.ts`, `__tests__/serverCashSettlement.test.ts`, `__tests__/serverValidation.test.ts`, `__tests__/serverTiming.test.ts`, `__tests__/apiAuthRoutes.test.ts`, the authorization table `__tests__/routeAuthorization.{table,test}.ts` over `__tests__/helpers/adminFake.ts`, and the route tests (`__tests__/{performanceYieldsRoute,dividendStatsRoute,instrumentProfilesRoute,syncExpensesRoute,dividendLinkedExpenseRoute,assetDeleteRoute}.test.ts`), plus the throwaway emulator exercises `scripts/*.tmp.mts` of doc/guide/e2e-emulatori.md

## Server Layer and API Authorization
- Route = auth → validate → fetch → ownership check → delegate → return; no Firestore queries or business logic in the
  handler body. Firestore rules do not protect Admin SDK calls, so enforce record-level ownership after loading the doc.
- **Being a Firebase Auth user is not enough: the SERVER admits users** (F04, 2026-11-16,
  `doc/sicurezza/S2-utenti-ammessi.md`). The list is `allowed-users/{uid}` (`ALLOWED_USERS_COLLECTION`,
  `types/account.ts`), written only with the Admin SDK. `requireFirebaseAuth` = `verifyFirebaseToken` +
  `assertAllowedUser(uid)`: a valid token without the document is **403 `account/not-allowed`** (the body carries the
  code); a positive answer is remembered 60 s per instance (`ALLOWED_USER_MEMORY_MS`), a negative one never. Only
  `POST /api/auth/activate` calls `verifyFirebaseToken` alone — it is the door into the list: the registration policy
  (`isRegistrationAllowed`) judges the TOKEN's email, never a body, and writes `source: 'registration'`. The Firestore
  rules ask the same (`isAllowedUser()` inside `isOwner`/`isMemberOf`/the global caches; `allowed-users/{uid}` is
  readable only by its own uid), and the two crons walk `allowed-users`, not `users`. The owner manages the list with
  `npm run users:allow -- <email>` · `--remove <email>` · `--list` (production with `.env.local`'s Admin key;
  `users:allow:emulator` for the emulators); every seed admits its account through `scripts/lib/allowUser.ts`.
  A route test admits its personas (`fake.allow(...)` in `__tests__/helpers/adminFake.ts`, or an `allowed-users`
  branch in a hand-written mock); RA6 of the route table proves the 403 on every `owner`/`resource`/`viewer`/`token` row.
- **Owner-scoped routes authorize with `assertCanAccessAccount(decodedToken, ownerUserId)`**, never a fallback to
  `decodedToken.uid`; viewer-scoped routes (sharing management) just read the token uid.
- **A route passes IDS to its service, and the service re-reads** (RS7, 2026-11-15, `doc/sicurezza/README.md` § 4): a
  document that arrives in a request is never written, and never names the account it is written in. The account of
  a write is one of two things — the `userId` verified by `assertCanAccessAccount`, or the `userId` of a document the
  server has just read. Until 2026-11 `POST /api/dividends/sync-expenses` wrote income rows in whatever account each
  dividend OBJECT in its body declared (A1): it now takes `{ userId, categoryId, subCategoryId? }` and reads the rest.
- **Every `route.ts` × method is a row of `__tests__/routeAuthorization.table.ts`** (kind `owner` · `resource` ·
  `viewer` · `token` · `activation` · `secret` · `public`, and a request that REACHES the check). `__tests__/routeAuthorization.test.ts`
  reads the handlers from disk and fails when one is missing from the table (RA1), when it answers anything but 401
  without a credential (RA2), anything but 403 (or the row's declared 404) or writes anything for a stranger's token
  aimed at another account (RA3), 401/403 to the account's own token or a member's (RA4), or when a `viewer` route
  touches the account named in the request (RA5), or when a valid token of a user NOT admitted gets anything but 403,
  writes, or reads more than `allowed-users/{uid}` (RA6, F04). The routes run for real over `__tests__/helpers/adminFake.ts`, an
  in-memory Admin SDK that records every path read and written; `fetch` rejects. A new route is born with its row; the
  readable table with the review's notes is `doc/sicurezza/README.md` § 5.
- Server-owned materialized docs are mutated only via a private authenticated route; cron routes use `CRON_SECRET`.
  **`/api/portfolio/snapshot` has no cron door any more** (C7, 2026-11-24): the cron calls `createPortfolioSnapshot`
  (`lib/server/portfolioSnapshot.ts`) directly and `cronSecret` in the body is a 400.
- **Three crons in three hours** (2026-11-24, `doc/cron-serale/README.md`, D-CS1): dividends 17:00 UTC → snapshot
  18:00 → recap (`/api/cron/period-recap`: period emails, weekly budget, TheBull retries, vault export) 19:00;
  distinct hours give the order, two in one hour have none (Vercel fires anywhere in the hour). Each route has its
  own `maxDuration = 300` (held by `vercelConfig.test.ts`). **A run records itself** in `cron-runs/{YYYY-MM-DD}_{job}`
  (`lib/server/cronRun.ts`: phases, per-user results, `invocations`, 90 days) and the **HTTP status follows it: 500 when
  any phase or user failed** — never answer 200 over a failure, Vercel paints it green. A period's email goes through
  `deliveries/{uid}_{period}` (`deliveryRecord.ts`, `periodEmailDelivery.ts`: claim in a transaction → transport check
  → build, reusing a paid AI comment → send): a doubled run sends nothing twice, a missed run is caught up for 7
  days. Both collections are Admin-only. The caller reads its own at `GET /api/user/cron-status`; the Mac at
  `npm run cron:status`.
- **The automatic snapshot route writes the current Italian month and nothing else** (F07, 2026-11-16,
  `doc/snapshot-integri/README.md` § 5.3): `snapshotRequestSchema` is `{ userId }` and STRICT — a `year`,
  `month` or `cronSecret` is a 400 before any price update, never silently dropped. A closed month has one writer, the manual
  route (409 on a month with figures unless `replace: true`; the replaced document kept in `versions/`), and one undo,
  `POST /api/portfolio/snapshot/restore` (kind `owner`). All three read and write in ONE `runTransaction`, and every
  snapshot goes through `buildSnapshotDocument`, which stamps `writtenBy` from the credential (`cron` from the cron's direct call,
  `button` with a token on the automatic route, `manual` on the manual one) and the token's uid.
- **Validation**: `lib/server/validation.ts` owns the reusable schemas and `parseOr400` — never cast with `as { … }`
  first, coerce dates with `z.coerce.date()` (behind a string when they come from a request, below), and validate
  **Firestore-originated** inputs at the service entry point too.
  **A date in a request is a STRING first** (2026-10-04, `isoDateSchema` = `z.string().min(1).pipe(z.coerce.date())`):
  alone, `z.coerce.date()` turns `null` into 1970-01-01 and a number into a timestamp, so a missing date answers 200 on
  an epoch instead of 400 — every request date in the file goes through it (yields, dividends, transactions), pinned by
  the «a null date» case of `__tests__/performanceYieldsRoute.test.ts` and the date cases of `serverValidation.test.ts`.
  Tests that touch a `server-only` module need `vi.mock('server-only', () => ({}))`.
  **A body schema is STRICT** (F07, A5): `.strict()`, so an unknown key is a 400 rather than a field silently read
  or dropped; the order is token → schema → `assertCanAccessAccount`, so an unauthenticated caller still gets 401 and a
  row of the route table needs a body that passes the schema (or RA3 reads a 400). The manual snapshot, the restore,
  `hall-of-fame/recalculate`, `prices/update`, `assets/[assetId]` DELETE (and its path id), the assistant's memory
  PATCH/DELETE and stream (prompt ≤ 8.000 characters, D-SN11; the 400 says it in words, and the composer has the same
  `maxLength`, `ASSISTANT_PROMPT_MAX_LENGTH` in `lib/constants/assistantPrompts.ts`) are the worked examples. Not strict
  on purpose: `performanceAnalysisRequestSchema` (F04 RU10) keeps the 22 fields of `metrics` the prompt reads and DROPS
  the rest of the `PerformanceMetrics` the client sends — no free string over 20 characters reaches the prompt.
- **`POST /api/user/monthly-email/send` sends at most 5 emails an hour per user** (F04 RU9, `checkRateLimit`
  `${uid}:email-send`, counted before the email and its AI comment are built; 429 with `Retry-After`), and its 500
  carries no `details`.
- **A route's latency is a `Server-Timing` header** (`lib/server/serverTiming.ts`; five routes since 2026-10-05: overview,
  yields, dividend stats, instrument profiles, assistant threads): `startTiming()` at the handler's top, `mark('auth')`
  after `assertCanAccessAccount`, `mark('db')` after ONE round of reads, `mark('compute')` before the response; a service
  with stages of its own takes the recorder (`timing?: ServerTimingRecorder`) instead of returning times, and a count
  the header carries travels BESIDE the body, never inside it (`resolveInstrumentProfiles` → `{ response, counts }`).
  The route tests read the header's stage names (`__tests__/{dividendStatsRoute,instrumentProfilesRoute}.test.ts`).
- **`REGISTRATION_WHITELIST` has no `NEXT_PUBLIC_` prefix**, and `lib/constants/appConfig.ts` must stay client-safe.
- **A Vercel Function never `require()`s an ESM-only package — whatever the Node version** (2026-10-08): Vercel starts
  Node with `--no-experimental-require-module`, so `firebase-admin@14 → jwks-rsa@4 → jose@6` (pure ESM, loaded by
  `require` in `jwks-rsa/src/utils.js`) answered 500 on every Admin route — `ERR_REQUIRE_ESM` in the runtime log of the
  develop deploy of PR #436, on 22.x AND on 24.x — while the same production build on the dev machine (Node 24, standalone,
  real credentials) answers 401 to a forged token. The cure is `package.json` `overrides` → `jwks-rsa ^3.2.2` (jose 4,
  CommonJS; firebase-admin calls only `jwks({ jwksUri, cache })` and `getSigningKeys()`, identical in 3.x), held by
  `__tests__/vercelConfig.test.ts` with `engines.node` `"24.x"` (local and Lambda on the same major). Before taking
  any server dependency whose chain reaches an ESM-only package, grep its `require(` calls; the emulators cannot see
  this (`verifyIdToken` skips the signature there) and only a real token on a deploy proves it. The same bump pins
  the CLIENT `firebase` to ≥ 12.19 (one `@firebase/app`, CLAUDE.md § Known Issues).
- **A `server-only` module is not protected by `tsc`**: importing `lib/services/dividendService.ts` (Admin SDK) from a
  client page type-checks and dies in the browser as a Next build error («You're importing a module that depends on
  "server-only"») — the browser is the check (2026-09-06). A client page reads such a registry through a client
  reader: `lib/services/dividendReceiptsService.ts` is the worked example.

## Per-page blind spots

- **The Vercel region, the ESM-only trap and the audit advisories are in `CLAUDE.md` § Known Issues**: the functions
  in `fra1` beside Firestore in `eur3` (held by `__tests__/vercelConfig.test.ts`), the `ERR_REQUIRE_ESM` of PR #436
  and its `overrides`, and the 20 `npm audit` advisories inside `firebase-tools` and `@grpc/grpc-js`.
