# Sicurezza e integrità — dossier

Fork only. Source: the security review of 2026-11-11 (project Library `review-sicurezza/`, page
<https://claude.ai/artifact/2hwcn9rwBnE2iJyKtqxprx>) and the test-health review (`salute-test/parte-2-copertura.md`,
C3). This dossier collects the corrections of that review, one stage per Todoist card. S1 is implemented
(2026-11-15); S2 and S3 are specs of their own.

| Stage | Card | What | State |
| --- | --- | --- | --- |
| **S1 «chi può agire per chi»** | F02 (A1 + A4 + the authorization table) | this file, §§ 1–9 | implemented 2026-11-15 (§ 10) |
| **S2 «utenti ammessi lato server»** | F04 (allowed users: R1, A3, A2) | [`S2-utenti-ammessi.md`](S2-utenti-ammessi.md) | S2a (list, rules, crons, A3) implemented 2026-11-16; S2b (the invitation, A2) next |
| S3 | F11 (rules suite, R2–R4, S1) | to be written by its own thread | — |

Read at `main` = `ec6d115`: 38 `route.ts` files under `app/api/`, 46 handlers.

---

# S1 — «Chi può agire per chi» (F02)

## 1. Obiettivo

No API route writes, rewrites or deletes a document of an account the caller cannot access. Two proven defects are
closed (A1, A4), and the CLASS is closed by a test that holds a table of every route: a new route that is not in the
table, or one that answers anything but 401/403 to a stranger, turns the suite red.

## 2. Perimetro

**Incluso**

- **A1** — `POST /api/dividends/sync-expenses` writes income rows and moves an account's balance in the account that
  each dividend OBJECT in the request declares (`lib/services/dividendIncomeService.ts:46, 108, 111`), after checking
  only `body.userId` (`app/api/dividends/sync-expenses/route.ts:49`).
- **A4** — `PUT` and `DELETE /api/dividends/[dividendId]` rewrite or delete the expense named by the dividend's
  `expenseId` without comparing its owner (`dividendIncomeService.ts:171, 214`); `expenseId` is client-chosen because
  the rules let the client write `dividends` (`firestore.rules:116-130`).
- The second defence inside `createExpenseFromDividend`, which also covers its three other callers
  (`dividends/scrape/route.ts:202`, `lib/server/dividendUseCase.ts:150`, `lib/server/dividendProcessor.ts:319`).
- `dividends` closed to client writes in `firestore.rules` (published by hand by the owner).
- One more unfiltered read found while writing the table: `DELETE /api/assets/[assetId]` deletes the future
  dividends `where assetId == …` with no owner filter (`app/api/assets/[assetId]/route.ts:101-105`).
- The authorization table of the 46 handlers (§ 5) and the test that holds it (§ 6, RA1–RA5).
- One rule added to `doc/guide/server.md` § Server Layer and API Authorization (§ 4, RS7).

**Escluso** (each has its card)

- A2 (the members route returns the uid of any email) and A3 (any token spends the keys): **F04**, the allowed-users
  list. The table marks the rows they concern.
- A5 (manual snapshot unvalidated): **F07**. A6, A7: «Fable minori · sicurezza».
- The Firestore rules suite (`@firebase/rules-unit-testing`) and R2–R4: **F11**.
- `GET /api/portfolio/exposure` reading the caller's own account for a delegate: a functional defect of the shared
  account, not an authorization one (review, «Nota fuori perimetro»). Marked in the table, not fixed here.
- The 14 `details: error.message` responses (A7), rate limits, the CSP.

## 3. Casi d'uso

1. **The owner synchronises** from Impostazioni › Dividendi («Sincronizza»): every dividend already paid and without
   a row gets its income row, as today. Same toast, same counts.
2. **A member of a shared account synchronises** for the owner: allowed; the rows carry the OWNER's `userId`.
3. **A stranger with a valid token** calls the route with their own `userId` and dividend objects that declare the
   victim's: nothing is written in the victim's account; the objects are not even read.
4. **A stranger (or an ex member) has a dividend of their own whose `expenseId` names someone else's expense** (a
   document written before the rule is closed): editing or deleting that dividend leaves the foreign expense and its
   account untouched; the dividend itself is edited or deleted.
5. **The cron, the scraper and a manual dividend** keep creating their rows; a dividend object that disagrees with
   the stored document is refused.
6. **A developer adds a route**: the suite fails until the route is in the table with its kind, and passes only if
   the handler refuses a stranger.

## 4. Regole

**RS1 — The request of `sync-expenses` carries ids, never documents.** Body `{ userId, categoryId, subCategoryId? }`,
validated by a schema in `lib/server/validation.ts` through `parseOr400` (non-strict: an open tab of the previous
build still sends `dividends`, `categoryName`, `subCategoryName` — they are dropped, never read). Order: token →
schema → `assertCanAccessAccount(decodedToken, userId)` → the reads below.

**RS2 — The server reads the dividends itself.** `getAllDividends(userId)` (`where('userId', '==', userId)`), then
today's filter unchanged: skip a dividend with an `expenseId`, skip a payment date after today. Every dividend
processed is the verified account's by construction. `syncDividendExpenses` loses its `dividends` parameter.

**RS3 — The category is read, not declared.** The server loads `expenseCategories/{categoryId}`; a missing document
or one whose `userId` differs from the verified account answers 400 «Categoria non trovata» with no write. The
category name and the sub-category name written on the row come from that document (`subCategories.find(id)`), not
from the request. The id stays in the request because the tab's category is a DRAFT of Impostazioni
(`components/settings/tabs/DividendiTab.tsx:101`): the settings on the server may still hold the previous one.

**RS4 — `createExpenseFromDividend` trusts the stored dividend.** Inside its transaction, right after
`tx.get(dividendRef)`: the document must exist and its `userId` must equal `dividend.userId`; otherwise the function
throws before any write (no row, no balance, no `expenseId`). The row's `userId` is the stored one. This is the second
defence: no caller, present or future, can make the function write in an account other than the dividend's.

**RS5 — A linked expense is touched only when it is the dividend's account's.**
- `updateExpenseFromDividend`: in the transaction, an expense that exists with `userId !== dividend.userId` makes the
  function throw before any write. The route keeps its non-blocking `catch` (the dividend's own edit stands).
- `deleteExpenseForDividend(dividendId, expenseId, ownerId)` gains the dividend's `userId`: an expense whose `userId`
  differs is NOT deleted and its account is not moved; the function logs a warning and still removes the stale
  `expenseId` from the dividend (the link was false). The DELETE route passes `dividend.userId` and goes on to delete
  the dividend: one's own dividend stays deletable.
- A missing expense behaves as today (update fails and is logged; delete is a no-op).

**RS6 — `dividends` is written only by the server.** `firestore.rules`: `allow read: if canAccess(resource.data.userId);
allow write: if false;`. Verified on the code: the client only READS the collection
(`lib/services/dividendReceiptsService.ts:32`, `lib/services/assetService.ts:143`); every write goes through
`/api/dividends*` or the crons (Admin SDK). The E2E specs write through the emulator's REST with `Bearer owner`,
which bypasses the rules. Publishing is the owner's (`firebase deploy --only firestore:rules`, SETUP.md → rules) and
can happen before or after the code, since no client write exists.

**RS6b — `DELETE /api/assets/[assetId]` deletes only the account's future dividends**: the documents of the query
are filtered by `userId === userId` in memory before the batch (no new composite index).

**RS7 — The rule for every route (added to `doc/guide/server.md`).** A route passes IDS to its service and the
service re-reads; a document that arrives in a request is never written, and never names the account it is written
in. The account of a write is one of two things: the `userId` verified by `assertCanAccessAccount`, or the `userId`
of a document the server has just read. Every `route.ts` × method is a row of
`__tests__/routeAuthorization.table.ts`.

## 5. Tabella di autorizzazione

**Kinds.** `owner`: the account comes from the request and passes `assertCanAccessAccount` (the owner or a member of
`account-access/{owner}.memberUids`, `lib/server/apiAuth.ts:64-95`). `resource`: the account is the `userId` of a
stored document, then `assertCanAccessAccount`. `viewer`: only the token's uid, no account in the request. `token`:
any valid token of an ADMITTED user, no account data (S2: `owner`, `resource`, `viewer` imply admitted too). `activation`: a valid token, the list not asked — only `auth/activate`. `secret`: a shared secret compared in constant time. `public`: no credential.

«Ids» = every identifier the client supplies besides the account, and where its owner is checked — the column that
would have shown A1. «Test» = a Vitest file imports the route today.

| Route (`/api/…`) | Method | Kind | Account from | Ids from the client → owner check | Test | Note |
| --- | --- | --- | --- | --- | --- | --- |
| `account/members` | GET | viewer | token uid | — | yes | |
| `account/members` | POST | viewer | token uid | `email` → none: returns that user's uid | yes | **A2**, F04 |
| `account/members` | DELETE | viewer | token uid | `memberUid` → removed from the caller's own doc only | yes | |
| `ai/analyze-performance` | POST | owner | body `userId` | `metrics`, `timePeriod` → `performanceAnalysisRequestSchema` (22 fields, S2 RU10) | yes | |
| `ai/assistant/context` | GET | owner | query `userId` | — | yes | |
| `ai/assistant/memory` | GET | owner | query `userId` | — | yes | |
| `ai/assistant/memory` | PATCH | owner | body `userId` | item / suggestion id → looked up inside `assistantMemory/{userId}` | yes | |
| `ai/assistant/memory` | DELETE | owner | body `userId` | as PATCH | yes | |
| `ai/assistant/stream` | POST | owner | body `userId` | `threadId` → `getAssistantThread` compares `thread.userId` (`lib/server/assistant/store.ts:259`) | yes | prompt ≤ 8000 (S2 RU11) |
| `ai/assistant/threads` | GET | owner | query `userId` | `after` cursor → `store.ts:212` | yes | |
| `ai/assistant/threads/[threadId]` | GET, DELETE | owner | query `userId` | `threadId` → `store.ts:259` | yes | |
| `asset-transactions` | POST | owner | body `userId` | `assetId`, `linkedCashAssetId` → `getLedgerAssetCurrencyOrThrow` (`lib/server/assetTransactionUseCase.ts:165-175`) and the cash-account check (`:231`), 404 | yes | |
| `asset-transactions/[transactionId]` | PUT, DELETE | owner | body / query `userId` | `transactionId` → `getOwnedTradeOrThrow` (`:177-183`), 404 | yes | |
| `asset-transactions/by-asset/[assetId]` | DELETE | owner | query `userId` | `assetId` → the query filters `userId` (`:684-688`) | **no** | |
| `asset-transactions/migrate` | POST | owner | body `userId` | — | yes | |
| `asset-transactions/backfill-average-cost-eur` | POST | owner | body `userId` | — | yes | |
| `assets/[assetId]` | DELETE | owner | body `userId` | `assetId` → `asset.userId !== userId` → 403 (`route.ts:74`); future dividends by `assetId` only | **no** | **RS6b** |
| `auth/activate` | POST | activation | token uid | — (no body: the policy judges the token's email, S2 RU2) | yes | F04 |
| `auth/check-registration` | POST | public | — | `email` | **no** | A7 |
| `benchmarks/ecb-rates` | GET | token | — | — | **no** | |
| `benchmarks/fx-rates` | GET | token | — | — | **no** | |
| `benchmarks/returns` | GET | token | — | — | **no** | |
| `cron/daily-dividend-processing` | GET | secret | every user | — (`CRON_SECRET`, `apiAuth.ts:105`) | yes | |
| `cron/monthly-snapshot` | GET | secret | every user | — (`CRON_SECRET`) | yes | |
| `dashboard/overview` | GET | owner | query `userId` | — | yes | |
| `dashboard/overview/invalidate` | POST | owner | body `ownerId` | — | yes | |
| `dividends` | GET | owner | query `userId` | `assetId` → the query filters `userId` | yes | |
| `dividends` | POST | owner | body `userId` | `dividendData.assetId` → `asset.userId !== userId` → 403 (`route.ts:173`) | yes | |
| `dividends/[dividendId]` | PUT | resource | `dividend.userId` (`route.ts:75`) | `expenseId` (stored, client-writable) → **none**; `updates.assetId` → none, harmless (readers join the account's own assets, `dividendIncomeService.ts:53`) | yes | **A4**, RS5 |
| `dividends/[dividendId]` | DELETE | resource | `dividend.userId` (`route.ts:158`) | `expenseId` → **none** | yes | **A4**, RS5 |
| `dividends/scrape` | POST | owner | body `userId` | `assetId` → `asset.userId !== userId` → 403 (`route.ts:67`) | **no** | A3 |
| `dividends/stats` | GET | owner | query `userId` | `assetId` → queries filter `userId` | yes | |
| `dividends/sync-expenses` | POST | owner | body `userId` | `dividends[].userId`, `dividends[].id`, `categoryId` → **none** | **no** | **A1**, RS1–RS4 |
| `goals` | POST | owner | body `userId` | — (id generated by the server) | yes | |
| `hall-of-fame/recalculate` | POST | owner | body `userId` | — | **no** | |
| `performance/yields` | POST | owner | body `userId` | — | yes | |
| `portfolio/exposure` | GET | viewer | token uid | — | **no** | a delegate reads their own account (functional) |
| `portfolio/instrument-profiles` | GET | owner | query `userId` | `assetIds` → picked among the account's assets | **no** | |
| `portfolio/snapshot` | POST | owner **or** secret | body `userId` | — (`cronSecret` in the body skips the token, `route.ts:97-110`) | yes | |
| `portfolio/snapshot/manual` | POST | owner | body `userId` | — (the document id is built from `userId`) | **no** | A5, F07 |
| `prices/quote` | GET | token | — | `ticker` → schema | yes | |
| `prices/bond-quote` | GET | token | — | `isin` → schema | yes | |
| `prices/update` | POST | owner | body `userId` | — | yes | |
| `user/monthly-email/send` | POST | viewer | token uid | — (on the helper, 5 sends an hour, S2 RU9) | yes | |
| `wiki/ingest` | POST | secret | the vault | — (`WIKI_INGEST_SECRET`) | yes | |

Reading of the table: of 46 handlers, 30 are `owner` (one of them also accepts the cron secret), 2 `resource`,
5 `viewer`, 5 `token`, 3 `secret`, 1 `public`. The three cells that say **none** are A1 and A4; after S1 they read «`getAllDividends(userId)`;
category `userId`» and «`expense.userId === dividend.userId`». 14 route files have no test today.

## 6. Test che accompagnano la correzione (D-T3)

Figures are invented and round (WORKFLOW § 1.7): 2500, 8000, 50. Decoy words: «Fenicottero», «Ornitorinco».
Accounts: `owner-1` (victim), `stranger` (valid token, no membership), `member-1` (in
`account-access/owner-1.memberUids`).

**The two defects, on the documents** — the real service over the in-memory Admin fake of
`__tests__/dividendIncomeService.test.ts` (extended with `where().get()` for the dividends query), so each assertion
reads what Firestore would hold.

| Id | File | Case | Expected |
| --- | --- | --- | --- |
| SX1 (P4a, P4b) | `syncExpensesRoute.test.ts` (new) | `stranger`'s token, `userId: stranger`, a legacy `dividends: [{ userId: 'owner-1', netAmount: 2500, … }]`, the stranger's own category «Fenicottero» | 200, `created: 0`; no `expenses/*` with `userId: 'owner-1'` is added |
| SX2 (P4c) | same | as SX1 with `netAmount: -2500`; `owner-1` has a default dividend account at 8000 | the account stays at 8000 |
| SX3 | same | `stranger`'s token, `userId: 'owner-1'` | 403, zero writes |
| SX4 | same | own `userId`, `categoryId` of a category of `owner-1` | 400, zero writes |
| SX5 | same | the owner: two paid dividends without a row, one future, one already linked; body also sends `categoryName: 'Fenicottero'` | `created: 2, skipped: 2, failed: 0`; the rows carry `userId: 'owner-1'` and the STORED category name |
| SX6 | same | `member-1` for `owner-1` | 200; rows with `userId: 'owner-1'` |
| SX7 | same | no `Authorization` | 401 |
| DI1 | `dividendIncomeService.test.ts` | `createExpenseFromDividend` with an object `userId: 'u2'`, stored dividend `userId: 'u1'` | rejects; no row, balances unchanged, no `expenseId` |
| DI2 (P5) | same | `deleteExpenseForDividend('div-1', 'exp-x', 'u1')`, `expenses/exp-x.userId = 'u2'` credited 50 on `u2`'s account | the row stays, `u2`'s balance unchanged, `dividends/div-1` loses `expenseId` |
| DI3 | same | `updateExpenseFromDividend` on a row of `u2` | rejects; amount, date and notes of the row unchanged |
| DR1 (P5) | `dividendLinkedExpenseRoute.test.ts` (new) | `stranger` owns `dividends/div-s` with `expenseId: 'exp-v'` (a row of `owner-1`); `DELETE /api/dividends/div-s` | 200; `expenses/exp-v` exists; `dividends/div-s` gone |
| DR2 | same | `PUT` on the same dividend with `netAmount: 2500` | 200; `expenses/exp-v` unchanged |
| AD1 | `assetDeleteRoute.test.ts` (new) | the owner deletes an asset; a future dividend of ANOTHER `userId` has the same `assetId` | the owner's future dividends and the asset are deleted, the other one stays |

The existing cases of `dividendIncomeService.test.ts`, `dividendUseCase.test.ts`, `dividendProcessor.test.ts` and the
dividend cases of `apiAuthRoutes.test.ts` stay green with the new signature of `deleteExpenseForDividend`.

**The class, on every route** — `__tests__/routeAuthorization.test.ts` over
`__tests__/routeAuthorization.table.ts` (one entry per file × method: `kind`, how to build a request for an account —
query, body, params — and, where the design answers 404 to a foreign id, `strangerStatus: 404`). The Admin SDK is one
universal fake that RECORDS every document path read and every write; `fetch` is stubbed to reject.

| Id | Case | Expected |
| --- | --- | --- |
| RA1 | the files `app/api/**/route.ts` and their exported methods (read from disk) against the table | same set both ways; a route missing from the table, or a row whose file is gone, fails by name |
| RA2 | every row but `public`, no credential (`secret` rows: no secret, then a wrong one) | 401, zero writes |
| RA3 | every `owner` and `resource` row: `stranger`'s token aimed at `owner-1` (for `resource`, a stored document of `owner-1`) | 403 (or the declared 404), zero writes |
| RA4 | every `owner`, `resource`, `viewer`, `token` row with the account's own token | neither 401 nor 403 |
| RA5 | every `viewer` row called with `userId: 'owner-1'` in query and body | no recorded path contains `owner-1` |

Each guard is seen red once before the commit (the suite's habit, `__tests__/vercelConfig.test.ts`): RA1 with a
throwaway `app/api/zz/route.ts`, RA3 by removing one `assertCanAccessAccount`, SX1/SX2/DI2 on `main`'s code. A row
that cannot be imported hermetically is exempted IN the table with its reason, never silently; its 200 stays the
duty of the route's own test.

**Not automated here.** The rule RS6 has no automated test until F11 builds the rules suite (D-SI6); until then the
proof is the emulator probe of § 8, CA6.

## 7. Decisioni

Proposed by this spec on 2026-11-14. **D-SI1, D-SI4 and D-SI6** — the three that depart from the card — were
confirmed by the owner in the thread the same day. The other six apply the review's corrections and were shown to
the owner with them; none was objected to.

| Id | Decision | Alternatives rejected, and why |
| --- | --- | --- |
| **D-SI1** | The sync route receives NO dividend list: the server reads the account's dividends (RS2). | *(a) A list of dividend ids, re-read and filtered by owner* (the review's wording): the client sends every dividend anyway (`DividendiTab.tsx:134-146`), so the list carries no choice, costs one read per id and keeps an input to validate. *(b) Keep the objects and check `dividend.userId === userId` in the route*: closes P4 but leaves amount, date and names declared by the client — a caller could still write any figure in their own cashflow through a route meant to copy stored data, and the next field added would be trusted again. |
| **D-SI2** | The category id stays in the request and is verified against the account; names come from the stored category (RS3). | *(a) Read the saved settings (`resolveDividendIncomeCategory`)*: the tab's category is an unsaved draft, so «Sincronizza» would silently use the previous category. *(b) Keep the names from the request*: a declared string written on a row, the same pattern as A1 in small. |
| **D-SI3** | Second defence in the transaction of `createExpenseFromDividend` (RS4). | *Only the route fix*: three other callers pass a dividend object; the one place where the row and the balance are written must not depend on each of them being right. |
| **D-SI4** | A foreign linked expense is left untouched; the dividend's own edit or delete goes on, the false link is dropped, a warning is logged (RS5). | *(a) 409 and stop*: a forged dividend would become undeletable by its owner. *(b) Also require a back-reference `dividendId` on the expense*: a data-model change with a backfill of every existing row, for a hole the owner check already closes. |
| **D-SI5** | `dividends` read-only for the client in the rules (RS6). | *Keep create/update and validate `expenseId` in a rule*: rules cannot read the expense's owner cheaply (`get()` per write), and no client writer exists to keep alive. |
| **D-SI6** | The rule change ships with an emulator probe, not a Vitest; its automated test arrives with F11's rules suite. Declared exception to D-T3. | *Add `@firebase/rules-unit-testing` now*: it is F11's whole job (harness, emulator in CI); doing a slice here means two harnesses or a F11 started without its spec. |
| **D-SI7** | One table test for all 46 handlers, with the inventory read from disk (RA1–RA5), rather than fourteen new per-route test files. | *Extend `apiAuthRoutes.test.ts` route by route*: it is the model that left 14 routes out; nothing fails when a route is born untested. *A lint rule on `route.ts`*: proves the helper is called, not that the answer is 403. |
| **D-SI8** | `own token` in the table means «neither 401 nor 403» (RA4); the 200 and the payload stay each route's own test. | *Assert 200 everywhere*: needs every external service of 38 routes mocked in one file — the cost that kept the table from existing. |
| **D-SI9** | RS6b filters in memory. | *Add `userId` to the query*: a new composite index to deploy, for a defence in depth on a handful of documents. |

## 8. Criteri di accettazione

- **CA1** SX1–SX7, DI1–DI3, DR1–DR2, AD1 and RA1–RA5 are green; SX1, SX2, DI2 and DR1 were seen red on `main`'s code.
- **CA2** Reference values: with the victim's default dividend account at 8000 and a forged dividend of ±2500, the
  balance after the call is 8000 and the victim's count of cashflow rows is unchanged (the review measured 133 → 134
  and 8000 → 5500 on the emulators).
- **CA3** `npx vitest run` green under `TZ=Europe/Rome` and `TZ=UTC`; `npx tsc --noEmit` clean;
  `npx eslint app components lib types e2e scripts __tests__` clean.
- **CA4** Impostazioni › Dividendi › «Sincronizza» on an account with unsynchronised dividends gives the same toast
  and the same rows as before. No spec presses the button today: one case **SE1** is added to `e2e/settings.spec.ts`
  (a paid dividend without a row planted through `Bearer owner`, two presses, the toast «1 voci create», the row read
  from the emulator with the account's `userId`), run on the Mac.
- **CA5** `e2e/cashflow.dividendi*.spec.ts`, `e2e/assets.bond.spec.ts`, `e2e/mobile-composition.cashflow.mobile.spec.ts`
  green on the Mac with the new rules loaded in the emulator (they write `dividends` through `Bearer owner`).
- **CA6** On the Mac, emulators up: the review's `api-probe.mjs` and `p4c.mjs` give the safe outcome for P4a, P4b,
  P4c and P5; with the new rules their own `setDoc(dividends)` is refused (`permission-denied`), which is RS6 proven.
- **CA7** `doc/guide/server.md` carries RS7; `doc/guide/cashflow-dividendi.md` says the sync reads the dividends on
  the server; CLAUDE.md and AGENTS.md updated per WORKFLOW.

## 9. Punti aperti

- **Publishing the rules** is the owner's step after the merge (RS6); the PR says so in its first lines.
- **«Today» in the sync filter** is the server's local midnight (`dividendIncomeService.ts:255-256`, UTC on Vercel):
  a dividend paid today in Italy can be skipped between 00:00 and 02:00. Unchanged here; it belongs with the
  dividend fixes of F09.
- **The 14 routes without a test of their own** get 401/403 from the table; their 200 and payload remain debt
  (salute-test C3), to be paid when each is next touched.

## 10. Stato dell'implementazione (2026-11-15)

- **A1** closed: `app/api/dividends/sync-expenses/route.ts` (schema `dividendSyncRequestSchema`, RS1),
  `syncDividendExpenses(userId, category)` and `readDividendSyncCategory` in `lib/services/dividendIncomeService.ts`
  (RS2–RS3), the owner check inside the transaction of `createExpenseFromDividend` (RS4);
  `components/settings/tabs/DividendiTab.tsx` sends ids only.
- **A4** closed: `updateExpenseFromDividend` throws on a row of another account, `deleteExpenseForDividend(dividendId,
  expenseId, ownerId)` leaves it and drops the link (RS5); `dividends` is `allow write: if false` in
  `firestore.rules` (RS6, **to be published by hand**); `DELETE /api/assets/[assetId]` filters the future dividends
  by owner (RS6b).
- **Tests**: SX1–SX7 `__tests__/syncExpensesRoute.test.ts`, DI1–DI3 (+ DI1b: a dividend not stored at all) in
  `__tests__/dividendIncomeService.test.ts`, DR1–DR2 `__tests__/dividendLinkedExpenseRoute.test.ts`, AD1
  `__tests__/assetDeleteRoute.test.ts`, RA1–RA5 `__tests__/routeAuthorization.{table,test}.ts` (160 cases, every row
  hermetic: no exemption was needed). All run the real routes over `__tests__/helpers/adminFake.ts`. Seen red on
  `main`'s code: SX1 (a row written in the victim's account), SX2 (8000 → 5500, the review's P4c), SX4–SX6, DI1–DI3,
  DR1–DR2, AD1; RA1 with a throwaway `app/api/zz/route.ts`, RA3 with the check removed from `dashboard/overview`.
  The table's cells for A1 and A4 now read «`getAllDividends(userId)`; category `userId`» and
  «`expense.userId === dividend.userId`».
- **Two AI routes check the key before the account** (`ai/analyze-performance` 500, `ai/assistant/stream` 503 without
  `ANTHROPIC_API_KEY`): harmless (nothing is read), but the table stubs the key so RA3 reaches the check.
- **On the Mac** (CA4–CA6): SE1 in `e2e/settings.spec.ts`, the dividend specs with the new rules loaded in the
  emulator, the review's probes.
- **Seen while implementing, left for later**: `deleteUpcomingCouponsForAsset` and
  `deleteUpcomingFinalPremiumForAsset` (`lib/services/dividendService.ts`) delete the expense named by a dividend's
  `expenseId` without comparing its owner — the dividends are filtered by `userId`, and with RS6 `expenseId` is no
  longer client-writable, so only a link written before the rule could reach another account; and
  `resolveDividendIncomeCategory` reads the category named in the settings without comparing its `userId` (names
  only). Both are candidates for «Fable minori · sicurezza».
- **Mac round of 2026-11-15**: the probes confirm A1 and A4 closed (the victim's 133 rows and the 8000 balance
  untouched, P5's expense stays; P4a now answers 400 «Categoria non trovata»). SE1 was red only because its
  `decoyRows()` read the first page of `expenses` (150 of 826 in a long-lived emulator), so the count missed the row
  and the clean-up left earlier runs' rows behind (the doubled row of the first attempt); it now follows
  `nextPageToken`. `assets.bond.spec.ts:77` was red the same day for a date reason, not S1: on 15/11 (and 15/05) the
  BTP€i's provisional coupon falls today and the banner lists only coupons after now. **P7**, the manual snapshot
  answering 200 to a malformed body instead of 400, is input validation, not authorization: out of S1, it goes to
  F07 (A5) or «Fable minori».
