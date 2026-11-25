# Cron serale affidabile — dossier

Fork only. Card: Todoist «Fable minori · Cron serale: dire quando fallisce, email una volta sola, un cron in ordine
(C2, C5, C6, C7)» (id `6j2RQrGc3hCG2FQr`), labels `epic-review-fable`, `fix`. It also implements **D-SN12**
(`doc/snapshot-integri/README.md` § 8 and § 9 P1, taken by the owner on 2026-11-15): the recap email and the vault's
`dati/` are built by the cron of the 1st on the month that closed.

Sources: the security review of 2026-11-11 (project Library `review-sicurezza/parte-3-cron-snapshot.md`, C2 C5 C6
C7), the test-health review (`salute-test/parte-2-copertura.md`, its C2: the cron's body has no test), Vercel's cron
documentation read on 2026-11-24 (§ 3.4). Spec written on 2026-11-24 on `main` = `34b24f5`; decisions confirmed by the owner on 2026-11-24 (§ 8). **Implemented 2026-11-24** in the same PR as this dossier (thread «Implementare il cron serale affidabile»): `lib/server/{portfolioSnapshot,emailTransport,deliveryRecord,periodEmailDelivery,cronRun}.ts`, `lib/utils/periodRecapDue.ts`, `app/api/cron/period-recap/route.ts`, `app/api/user/cron-status/route.ts`, `scripts/cronStatus.mts`; tests CS1–CS11 as in § 6 (CS11 in `__tests__/rules/firestoreRules.rules.ts`).

---

## 1. Obiettivo

On 31/10/2026 the October recap email failed (Resend was never configured), the AI comment was paid and thrown
away, and the cron showed green; nobody knew until the next day. That evening's edits also missed the email and the
wiki, because the month closed at 19:00. After this work:

1. a run that fails **says so**: in Vercel (the run is red) and in a record that outlives the logs (C2);
2. the recap is not built when it cannot be sent: **no AI comment without a working mail transport** (C2);
3. a period's email (and the month's `dati/`) goes out **once**, even if the cron is invoked twice, and **at least
   once** even if the cron of the 1st is missed (C5, Vercel's own advice, § 3.4);
4. the dividends of the day are credited **before** the month's photo is taken (C6);
5. the cron secret never travels over HTTP (C7);
6. the recap and `dati/` are built **on the 1st, on the month that closed**, with its final cashflow (D-SN12);
7. the orchestration has **tests** on fixed dates, with a phase that fails (salute-test C2).

## 2. Perimetro

**Incluso**

- `vercel.json` crons, `app/api/cron/*` (the two existing routes and one new one), the snapshot route's creation
  logic moved into `lib/server/` (C7).
- The period emails' sending path in `lib/server/monthlyEmailService.ts` (transport check, marker, reuse of a paid
  AI comment) and the weekly budget email's in `weeklyBudgetEmailService.ts` (transport check, marker).
- `POST /api/user/monthly-email/send` («Invia … ora»): the same transport check and the marker for a closed period.
  Only the server answer changes; the Impostazioni code is not touched (it already shows the server's `error`).
- Two new Admin-only collections (`cron-runs`, `deliveries`), their `firestore.rules` deny block, the backup
  registry (`scripts/lib/backup/registry.ts`, held by `backupRegistry.test.ts`).
- A read route for the caller's last run (`GET /api/user/cron-status`) and a Mac script `npm run cron:status`.
- The guides: `doc/guide/email-pdf.md` (cron phases), `doc/guide/server.md`, `doc/guide/hall-of-fame.md` (the
  sentence that quotes the cron's `if (snapshotResult.success)`), `doc/guide/cashflow-budget.md` (phase 8), CLAUDE.md.

**Escluso**

- **Any UI change.** Allocazione, Impostazioni and Essenziale are being reworked by other threads (RU8 done, RU9
  queued). The line «Ultimo aggiornamento automatico» that C2 proposes for Impostazioni is a follow-up after RU9
  (D-CS3); this spec delivers its data and its route.
- C1, C3, C4 (who wrote a snapshot, closed months, failed prices): done in F07, `doc/snapshot-integri`.
- C8 (the PAC test user processed every evening): its data is to be removed with `account:remove` (exit-plan card);
  since S2 the cron reads `allowed-users`, so a removed user is no longer processed.
- Configuring Resend (`RESEND_API_KEY`, `RESEND_FROM_EMAIL` on Vercel): done by the owner after 31/10 (§ 9 P1). This spec makes a
  missing variable visible, it does not supply it.
- What «Invia mensile ora» sends (the running month, as a format test): unchanged, § 9 P2.
- The email and the PDF saying a month was built on stale prices (F07 § 9 P3).

## 3. Stato di partenza (letto sul codice)

### 3.1 Two crons at the same hour

`vercel.json`: `/api/cron/monthly-snapshot` and `/api/cron/daily-dividend-processing`, both `0 18 * * *` (19:00
Italian in winter, 20:00 in summer). `maxDuration` is 300 s on the snapshot cron (`route.ts:31`); the dividend cron
has the default. The dividend route's header still says «00:00 UTC» (stale).

### 3.2 The snapshot cron (`app/api/cron/monthly-snapshot/route.ts`, 480 lines)

| Phase | What | When | On failure |
| --- | --- | --- | --- |
| 1 | per user: `fetch(${NEXT_PUBLIC_APP_URL}/api/portfolio/snapshot, { userId, cronSecret })` (C7), then `verifyExpenseTotals`, then `updateHallOfFame` if the snapshot succeeded | daily | pushed to `errors[]` |
| — | ECB rates, market anchors | daily | logged |
| 2–5 | monthly, quarterly, semi-annual, yearly emails, side by side (`Promise.all`) | **last day** of the period (`isLastDayOf…Italy`) | counter `errors++`, logged |
| 6 | weekly budget email | Sunday | counter |
| 7 | assistant goals | daily | counter |
| 8 | budget history | daily | logged |
| 9 | TheBull retries | daily, with the vault | logged |
| 10 | `exportToVault(WIKI_EXPORT_UID, [this month])` | last day of the month | logged |

The response is **always** `{ success: true }` with status 200 (`route.ts:427`), whatever `errors` and the email
counters say; nothing is stored (C2). An email is sent whenever the date says so: two invocations of the last day
send two emails and pay two AI comments (C5).

### 3.3 The send path

`buildAndSendForPeriod` (`monthlyEmailService.ts:2327`) builds the data, the comparison, **then the AI comment**
(`generateEmailAiComment`, up to `EMAIL_AI_TIMEOUT_MS` = 150 s), and only then calls `sendMonthlyEmail`, which does
`new Resend(process.env.RESEND_API_KEY)` and sends from `RESEND_FROM_EMAIL ?? 'noreply@example.com'`. Without the key
the failure comes after the comment was paid; the comment is lost with the exception. The weekly budget email
(`weeklyBudgetEmailService.ts:574`) has the same shape without an AI comment.

`POST /api/user/monthly-email/send` resolves the period (`getMostRecentCompleted…End` for quarter, half, year; the
**running** month for monthly) and calls the same function; it writes no marker.

### 3.4 What Vercel guarantees (docs read 2026-11-24)

- Hobby: a cron runs at most once a day, **anywhere within the scheduled hour** (`0 18 * * *` fires 18:00–18:59 UTC).
- Delivery is best effort: a run can be **missed** (not retried) or **delivered twice**; the docs ask jobs to tolerate
  both, to set state rather than increment it, and to process all outstanding work since the last successful run.
- Up to 100 cron jobs per project on every plan (changelog); the old «2 per team on Hobby» is stale.

Sources: <https://vercel.com/docs/cron-jobs/usage-and-pricing>, <https://vercel.com/docs/cron-jobs/manage-cron-jobs>,
<https://vercel.com/kb/guide/background-workers-on-vercel>,
<https://vercel.com/changelog/cron-jobs-now-support-100-per-project-on-every-plan>.

Consequence for C6: two crons in **different hours** are ordered (the earlier one's window closes before the later
one's opens, and neither lasts more than 300 s); two crons in the same hour are not. The review's «spostare l'orario
non basta» held for minutes inside one hour, not for distinct hours.

### 3.5 The month that closes at 19:00 (D-SN12)

Today the recap and `dati/` are built on the last day at ~19:00 on that evening's snapshot and cashflow. With D-SN12
they move to the 1st. Read on the code, the move is safe for the builders:

- `buildPeriodEmailData(userId, year, month, periodType)` takes the period explicitly; the snapshot it reads is
  `{uid}-{year}-{month}`, which on the 1st is final (the cron of the 1st writes the NEW month).
- `measureEmailDrivers(…, { today: new Date() })` counts rows with Italian day ≤ `today` (`growthDrivers.ts:139`): on
  the 1st every row of the closed month counts, including those typed after 19:00 on the last day.
- `exportToVault` marks a month `partial` only when it is the running month and not its last day
  (`vaultExport.ts:139`): the closed month is written as final. `dati/portafoglio.md` takes the latest real snapshot,
  which on the 1st is the new month's first photo: the portfolio «today», as it is mid-month when run by hand.

## 4. Casi d'uso

| # | Situation | Today | After |
| --- | --- | --- | --- |
| UC1 | Resend not configured, 1st of the month | AI comment paid, send throws, cron green, nothing stored | no AI call; the run is red; `cron-runs` says «email non configurata» per user; `cron:status` and the route show it |
| UC2 | Vercel delivers the recap cron twice | two emails, two comments | the second finds the marker `sent`: nothing |
| UC3 | The cron of the 1st is missed | the email of that month never goes (today: the last day missed) | the run of the 2nd (up to the 7th) sends it |
| UC4 | A coupon paid on the last day of the month | may land after the snapshot read: its cash enters next month's photo | credited at 17:xx UTC, photo at 18:xx UTC |
| UC5 | Edits on the evening of the 31st | out of the email and `dati/` | in the cashflow of the email and `dati/`; the photo of the 31st stays (D-SN12) |
| UC6 | Send fails after the comment (Resend error) | comment lost | comment kept on the marker; the next run sends with it, no second payment |
| UC7 | A phase throws (e.g. ECB down) | logged, green | the others run; the run is red; the phase is named in `cron-runs` |
| UC8 | The owner presses «Invia trimestrale ora» on 2 Oct, the cron then runs | two emails | the manual send marks the quarter `sent`; the cron skips it |
| UC9 | `NEXT_PUBLIC_APP_URL` wrong | every snapshot fails silently, secret sent there | no HTTP call |

## 5. Regole

### 5.1 Three crons in three hours (C6, D-CS1)

| Cron | Path | Schedule (UTC) | Italian (winter / summer) | Phases |
| --- | --- | --- | --- | --- |
| Dividends | `/api/cron/daily-dividend-processing` | `0 17 * * *` | 18–19 / 19–20 | scraping, cashflow rows of the day, next coupons (unchanged) |
| Snapshot | `/api/cron/monthly-snapshot` | `0 18 * * *` | 19–20 / 20–21 | per user: snapshot → expense totals → Hall of Fame; ECB rates; anchors; goals; budget history |
| Recap | `/api/cron/period-recap` (new) | `0 19 * * *` | 20–21 / 21–22 | period emails (§ 5.3), weekly budget (Sunday), TheBull retries, vault export (§ 5.3) |

- Each has its own `maxDuration = 300` and its own run record (§ 5.5).
- The order holds because the windows do not overlap (§ 3.4). A missed dividend run is recovered by the dividend
  processor's own look-back (`COUPON_CATCHUP_LOOKBACK_DAYS`); a missed snapshot run leaves the previous day's photo;
  a missed recap run is recovered by § 5.3.
- `__tests__/vercelConfig.test.ts` asserts the three entries, their hours strictly increasing, and `maxDuration` on
  each route.
- Paths stay where they are (Vercel's «Run» button and the guides name them); only the third is new.

### 5.2 The snapshot as a function (C7, D-CS7)

- `lib/server/portfolioSnapshot.ts` exports `createPortfolioSnapshot(userId, { writtenBy, writtenByUid?, now })`,
  the body of today's `POST /api/portfolio/snapshot` from `settleDueBalances` to `invalidateDashboardOverviewSummaryServer`,
  returning `{ status: 'created' | 'updated' | 'no-assets', snapshotId, data }`. No behaviour change: same transaction,
  same builder (F07), same price record.
- The route keeps auth (token + `assertCanAccessAccount`) and calls it with `writtenBy: 'button'`.
- **`cronSecret` leaves the route's body schema** (strict: a body carrying it is a 400). The cron calls the function
  with `writtenBy: 'cron'`. `routeAuthorization.table.ts` loses the cron-secret row of this route and gains the 400.
- The cron no longer reads `NEXT_PUBLIC_APP_URL`.

### 5.3 Which periods the recap sends, and when (D-SN12, C5, D-CS5, D-CS6)

Let `T` be the Italian calendar day of the run. A **period** is `monthly YYYY-MM`, `quarterly YYYY-Qn`,
`semiannual YYYY-Hn`, `yearly YYYY`, `budget-week YYYY-MM-DD` (the Sunday), `vault YYYY-MM`. Its **end** is its last
Italian day (the Sunday itself for `budget-week`).

A period is **due** at `T` when:

1. it is closed: `end < T` (for `budget-week`, `end = T` — the weekly email keeps its Sunday evening);
2. it is recent: `T − end ≤ 7` days (the catch-up window, D-CS6);
3. the user has its toggle on and at least one recipient (as today; `vault` only for `WIKI_EXPORT_UID` with the
   vault configured);
4. its delivery record (§ 5.4) is not `sent`, and not `sending` with a claim younger than 10 minutes.

On an ordinary 1st only `monthly` of the previous month is due; on 1 January `monthly 12`, `Q4`, `H2`, `yearly`. The
four emails keep running side by side (F6b). A period with no snapshot (`buildPeriodEmailData` → null) is recorded as
`skipped: no-snapshot` and **not** retried by later runs (nothing will create a closed month's snapshot by itself;
D-SN3 makes it a manual act, after which «Invia … ora» sends it).

### 5.4 The delivery record (C5, D-CS5)

Collection `deliveries`, id `{uid}_{periodKey}` (e.g. `abc_monthly-2026-10`), Admin SDK only, fields:
`userId`, `period`, `status` (`sending` | `sent` | `failed` | `skipped`), `reason?`, `source` (`cron` | `manual`),
`claimedAt`, `sentAt?`, `attempts`, `aiComment?`, `recipientsCount`.

Sequence for one email:

1. **Claim** in a transaction: read the record; if `sent`, or `sending` claimed < 10 min ago, stop (`already-sent` /
   `in-flight`); else write `sending`, `claimedAt = now`, `attempts + 1`. Ten minutes is twice `maxDuration`: a run
   killed mid-send leaves a claim that the next day reclaims.
2. **Transport check** before anything else (§ 5.6). Absent → `failed`, `reason: 'email-not-configured'`, stop.
3. Build the data; **reuse `aiComment` from the record** if present, else generate it and write it to the record
   **before** sending.
4. Send. Success → `sent`, `sentAt`. Resend error → `failed`, `reason: 'send-failed'`, the comment stays.

A manual send («Invia … ora») of a **closed** period goes through the same steps with `source: 'manual'` but skips the
«already `sent`» stop (it is an explicit re-send) and leaves `sent`. A manual monthly send is of the running month,
which is never due to the cron: it writes no record.

The vault export uses the same record (`vault-YYYY-MM`, no AI comment, no transport check): a duplicate run commits
once; a missed 1st is caught up.

### 5.5 The run record (C2, D-CS2)

Collection `cron-runs`, id `{YYYY-MM-DD}_{job}` (Italian date; job `dividends` | `snapshot` | `recap`), Admin only.
A second invocation the same day **overwrites** it (the latest run is what the day says) and increments `invocations`.

```
{ job, date, startedAt, finishedAt, durationMs, invocations,
  outcome: 'ok' | 'partial' | 'failed',
  phases: [{ name, status: 'ok' | 'failed' | 'skipped', durationMs, counts?: {…}, error?: string }],
  users: { [uid]: { snapshot?: 'created'|'updated'|'no-assets'|'failed',
                    deliveries?: { [periodKey]: 'sent'|'skipped'|'failed'|'already-sent', reason? } } } }
```

- `error` and `reason` are a short code or the first 200 characters of the message, never a stack, an email address
  or a figure.
- `outcome` is `failed` when the whole job threw, `partial` when any phase or any user failed, else `ok`.
- **The HTTP status follows it**: 200 for `ok`, **500 for `partial` and `failed`**, so Vercel shows the run red. The
  body keeps today's summary fields plus `outcome` and `runId`.
- The snapshot cron, on its run, deletes `cron-runs` older than 90 days (one query, `limit 50`).
- The run record is written even when a phase throws (`finally`); a failure to write it is logged and does not
  change the status.

### 5.6 The mail transport (C2, D-CS4)

- `isEmailTransportConfigured()` in `lib/server/emailTransport.ts`: true only with `RESEND_API_KEY` **and**
  `RESEND_FROM_EMAIL` non-empty. The `'noreply@example.com'` fallback is removed (Resend refuses it anyway).
- Both senders (`sendMonthlyEmail`, the weekly budget) go through `sendEmail()` in that module.
- The recap checks it once per run: when false, every due email is recorded `failed: email-not-configured` without
  building data or calling the model; the vault export still runs.
- `POST /api/user/monthly-email/send` answers **503** `{ error: "L'invio delle email non è configurato sul server." }`
  before the rate-limit counter. Impostazioni already shows `error` in its toast.

### 5.7 Reading the last run (D-CS3)

- `GET /api/user/cron-status` (token, an admitted user): for the caller's account (`assertCanAccessAccount` on the
  owner, so a delegated member reads the owner's), the latest record of each job in the last 8 days, filtered to
  `users[ownerId]` plus the job's `outcome` and time. No other user's uid appears. A row of
  `routeAuthorization.table.ts`.
- `npm run cron:status` (Mac, production read with the typed project id as `backup:export` does): prints the last 8
  days of the three jobs, every user, every phase. Read only.
- The line in Impostazioni («Ultimo aggiornamento automatico: ieri 20:03 · email di ottobre non inviata, invio non
  configurato») is written after RU9 on this route (§ 9 P3).

## 6. Test (D-T3)

Figures invented and round (WORKFLOW rule 7). Each fix lands with the test that fails without it (rule 9).

| Id | File | What |
| --- | --- | --- |
| CS1 | `__tests__/periodRecapDue.test.ts` | `duePeriods(T, settings, records)` pure: the dates of § 7 CA1–CA5 |
| CS2 | `__tests__/periodRecapCron.test.ts` | the recap route with phases faked and the clock fixed on 2026-11-11 (ordinary day), 2026-11-01, 2026-10-01 (quarter), 2027-01-01 (year), 2026-11-08 (Sunday, inside the window): which builders are called, with which period |
| CS3 | same | a phase that throws: the others run, status 500, the record names it |
| CS4 | `__tests__/deliveryRecord.test.ts` (over `helpers/adminFake.ts`) | claim, duplicate (`sent` → stop), stale `sending` (11 min → reclaimed, 9 min → stop), manual re-send, AI comment reused after `send-failed` (generator called once over two runs) |
| CS5 | `__tests__/emailTransport.test.ts` | missing key or sender → false; recap records `email-not-configured` with the AI generator never called; send route 503 before the rate limit |
| CS6 | `__tests__/snapshotCron.test.ts` | the snapshot cron calls `createPortfolioSnapshot` directly (no `fetch`), Hall of Fame only on `created`/`updated`, run record per user, 500 when one user failed |
| CS7 | `__tests__/snapshotRoute.test.ts` (existing) | a body with `cronSecret` is a 400; the button path unchanged (F07's SR1–SR5 stay green) |
| CS8 | `__tests__/vercelConfig.test.ts` | three crons, hours 17 < 18 < 19, `maxDuration` 300 on each route |
| CS9 | `__tests__/cronStatusRoute.test.ts` + table row | own account sees its entries; another account's uid never in the body; a member reads the owner's |
| CS10 | `__tests__/backupRegistry.test.ts` (existing) | stays green with `cron-runs` (global, cache) and `deliveries` (userField) registered |
| CS11 | `npm run test:rules` | `cron-runs` and `deliveries`: client read and write denied, own and other account (the pair) |

`cronSecretAuth.test.ts` gains the third route. `TZ=Europe/Rome` and `TZ=UTC` both green (the dates are Italian).

## 7. Criteri di accettazione

Reference values worked out by hand; `T` is the Italian date of the run, all toggles on unless said.

- **CA1** `T` = 2026-11-01 → due: `monthly-2026-10`, `vault-2026-10` and `budget-week-2026-11-01` (1 Nov 2026 is a
  Sunday: 1 Jan 2026 is a Thursday, +304 days = 43 weeks + 3 days). Not due: `quarterly-2026-Q4` (open).
  `T` = 2026-11-11 (Wednesday) → nothing due.
- **CA2** `T` = 2027-01-01 → `monthly-2026-12`, `quarterly-2026-Q4`, `semiannual-2026-H2`, `yearly-2026`,
  `vault-2026-12`; four emails, four AI calls.
- **CA3** `T` = 2026-11-02, record `monthly-2026-10` absent → sent today (missed 1st). Same with `T` = 2026-11-07
  (`T − end` = 7). With `T` = 2026-11-08 (8 days) → not due, nothing sent.
- **CA4** two invocations on 2026-11-01: emails sent 1, AI calls 1, `cron-runs/2026-11-01_recap.invocations` = 2.
- **CA5** `RESEND_FROM_EMAIL` absent on 2026-11-01: AI calls 0, record `failed: email-not-configured`, HTTP 500,
  `vault-2026-10` written. On 2026-11-02 with the variable set: sent, AI calls 1 (no comment was stored, none paid).
- **CA6** Resend answers an error after the comment on 2026-11-01; on 2026-11-02 it works: AI calls over the two runs
  = 1, the email carries the stored comment.
- **CA7** a coupon of 50 € paid on 2026-11-30 into an account of 1000 €: the snapshot of November holds the account
  at 1050 € (dividends at 17:xx, photo at 18:xx).
- **CA8** an expense of 100 € dated 2026-10-31, typed at 22:00 on the 31st: present in the October email's expenses
  and in `dati/2026-10.md`; the October snapshot unchanged (no button pressed).
- **CA9** a run where the ECB fetch throws: goals and budget history still written, `outcome: partial`, status 500.
- **CA10** no outbound HTTP call to `/api/portfolio/snapshot` from any cron (asserted by CS6 with `fetch` spied).
- **CA11** (D-CS9) `EMAIL_RECIPIENT_ALLOWLIST=altro@example.com`, a user with `fenicottero@example.com` only, 1 Nov: no builder call, no AI call, no `deliveries` document, HTTP 200. With two recipients and the list naming one, the builder receives that one; emptying the list on 2 Nov sends October to both (nothing was recorded). Held by `periodRecapCron.test.ts`, `emailTransport.test.ts`, `monthlyEmailSendRoute.test.ts` (CS12).

## 8. Decisioni

Proposed on 2026-11-24 and confirmed by the owner the same day, all as recommended.

| Id | Decision | Alternatives rejected, and why | State |
| --- | --- | --- | --- |
| **D-CS1** | **Three crons in three hours** (17, 18, 19 UTC): dividends, snapshot, recap (§ 5.1). | *(a) One cron, dividends then snapshot then emails* (the card's text): one 300 s budget for scraping every instrument, every user's snapshot and up to four reasoning-model comments on 1 January; a timeout in the emails would also cost the evening's photo. *(b) Keep two crons at 18*: C6 stays. Distinct hours give the order for free (§ 3.4). | **taken** (owner, 2026-11-24) |
| **D-CS2** | A run record per job and day in `cron-runs`, overwritten by a repeat, kept 90 days; **HTTP 500 when anything failed** (§ 5.5). | *Status 200 with `success: false`*: Vercel paints it green, the 31/10 case again. *207*: Vercel treats any 2xx as success. *A record per invocation*: a duplicate delivery would look like two days. | **taken** (owner, 2026-11-24) |
| **D-CS3** | No UI in this work: the route `GET /api/user/cron-status` and `npm run cron:status` now; the line in Impostazioni after RU9 (§ 5.7). | *The line in Impostazioni now* (the card's text): Impostazioni is being reworked by RU9; two threads on one file. *A line in Panoramica*: a page about the month, not about the machine. *An alert email*: it fails exactly when the mail transport fails. | **taken** (owner, 2026-11-24) |
| **D-CS4** | The transport is checked **before** data and AI comment, on both senders and on «Invia … ora» (503); no `noreply@example.com` fallback (§ 5.6). | *Check only in the cron*: the button would still pay a comment and fail. *Keep the fallback*: it hides a missing variable behind a Resend error after the payment. | applies the card (confirmed 2026-11-24) |
| **D-CS5** | One **delivery record** per user and period, claimed in a transaction, holding the paid AI comment until the send succeeds; a manual send of a closed period marks it too (§ 5.4). Covers the weekly budget email and the vault export. | *Marker written after sending* (`emailsSent` of the card): a duplicate run starting before the first finished sends twice. *No comment kept*: a Resend outage costs one comment per retry. *Monthly emails only*: the weekly email and `dati/` have the same duplicate. | **taken** (owner, 2026-11-24) |
| **D-CS6** | **Catch-up for 7 days**: a closed period whose record is not `sent` is sent by any recap run up to its 7th day after the end (§ 5.3). | *Only on the 1st* (D-SN12 literally): a missed run (Vercel does not retry) loses the email for good. *No limit*: configuring Resend in March would send October to February in one evening. *3 days*: a long weekend with Resend down would lose it. | **taken** (owner, 2026-11-24) |
| **D-CS7** | The snapshot becomes a function called by the cron; `cronSecret` leaves the route's body (§ 5.2). | *Keep the HTTP call with the secret in a header*: still a configurable host and an invocation per user. *Keep `cronSecret` accepted by the route for manual use*: the cron's own «Run» covers that; one fewer door. | applies the card (confirmed 2026-11-24) |
| **D-CS8** | The recap runs on the **evening** of the 1st (19 UTC), so the whole 1st is there to finish the month's cashflow. | *The morning of the 1st* (e.g. 05 UTC): the email at breakfast, but edits of the 1st morning for the 31st miss it — the 31/10 case moved by one night. | **taken** (owner, 2026-11-24) |
| **D-CS9** | **Recipient allowlist** `EMAIL_RECIPIENT_ALLOWLIST` (comma-separated, case-insensitive): when set, every send (recap, weekly budget, «Invia … ora») keeps only those addresses; none left = like a toggle off — no record, no AI call, green run, manual send 400. Empty or absent = no filter. Asked by the owner on 2026-11-24: Resend without a verified domain sends from `onboarding@resend.dev` to the owner's address only and refuses the whole send if one address is foreign. | *A `skipped` record*: the cron never retries `skipped`, so lifting the filter within 7 days would not send the month. *Filtering users, not addresses*: one foreign address among the owner's would still sink the send. | **taken** (owner, 2026-11-24) |

## 9. Punti aperti

**P1 — Resend.** Closed on 2026-11-24: the owner configured `RESEND_API_KEY` and `RESEND_FROM_EMAIL` on Vercel
production after 31/10 (the October failure was the missing configuration). The recap is therefore not red for
that reason; a missing variable would still be recorded `failed: email-not-configured` and make the run red (D-CS2).
Without a verified domain Resend delivers only to the owner's own address: see D-CS9 (recipient
allowlist, § 8).

**P2 — «Invia mensile ora» sends the running month.** The button is a format test (its line says so). After D-SN12
the cron sends the closed month; the button could do the same, but that is Impostazioni copy and belongs to RU9.

**P3 — The line in Impostazioni.** After RU9: one sentence in the email tile from `GET /api/user/cron-status`, with
the «oggi / proposta» sketch (WORKFLOW rule 8).

**P4 — Duration.** The run record measures each phase. If the snapshot job nears 300 s as users grow (capacity
report: 6–12 typical users), the per-user loop is the first to split; not needed today.

**P5 — Rules and index.** `cron-runs` and `deliveries` are Admin-only: the default deny already holds, the explicit
block is for the rules suite; publishing the rules stays the owner's step after the merge. `cron-runs` cleanup
queries by `date` (single-field index, automatic).

## 10. Implementazione

One impl PR (Opus or Sonnet 5.5), order: CS8 + D-CS1 (`vercel.json`, new route skeleton) → C7 (function, route,
table) → transport + delivery record (CS4, CS5) → recap orchestration (CS1–CS3) → run record + status route + script
(CS6, CS9) → registry, rules, guides. Mac round: `perf:build` / `perf:budget` (the server routes only; no client
change expected), a real run of the three crons against the emulators, and — with the owner's OK — `npm run
cron:status` on production after the first evening.
