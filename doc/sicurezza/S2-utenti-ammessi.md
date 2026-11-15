# S2 — «Utenti ammessi lato server» (F04)

Fork only. Second stage of the dossier `doc/sicurezza/README.md` (S1 = F02, on its own branch until its PR; the
implementation PR of this stage fills the row «S2» of that file's stage table and links here). Source: the security
review of 2026-11-11, points **R1** (`review-sicurezza/parte-1-regole-firestore.md`), **A3** and **A2**
(`parte-2-api-route.md`), page <https://claude.ai/artifact/2hwcn9rwBnE2iJyKtqxprx>. Nothing in the app yet: this is
the spec. Read at `main` = `ec6d115`. Decisions continue S1's series (D-SI1–D-SI9) from **D-SI10**.

State on 2026-11-15: Firebase sign-up was switched off in the console on 11/11; two Auth users exist (the owner and
a PAC test user that F01 deletes). The door is closed by a console switch; rules, API and crons still accept any
Auth user.

---

## 1. Obiettivo

Being a Firebase Auth user is no longer enough to use the app. A user counts only when the SERVER has admitted
them: a document `allowed-users/{uid}` that no client can write. The Firestore rules, every private API route and
the two crons ask for it, in one place each. On top of that list: the three inputs through which an admitted user
(or a bug of the client) can still spend the keys get a ceiling (A3), and sharing an account becomes an invitation
the other person accepts, with no uid in any answer (A2).

## 2. Perimetro

**Incluso**

- **R1** — the list `allowed-users/{uid}`; how a user enters it (registration through the server, § 4 RU2) and the
  migration of the existing account (RU8); `isAuthenticated()` in `firestore.rules:7-9` and its seven uses; the two
  crons that walk the whole `users` collection (`app/api/cron/monthly-snapshot/route.ts:84`,
  `app/api/cron/daily-dividend-processing/route.ts:37`).
- **A3** — the one check in `requireFirebaseAuth` (`lib/server/apiAuth.ts:25-46`), which closes the 41 handlers of
  kind `owner`, `resource`, `viewer` and `token` (S1 § 5) at once; `POST /api/user/monthly-email/send` moved onto the
  helper (today its own `verifyIdToken`, `route.ts:30-37`, and `details: error.message`, `:118`) with a send limit;
  a schema on `metrics` and `timePeriod` of `POST /api/ai/analyze-performance` (`route.ts:260`, unvalidated into the
  prompt); a schema with a maximum prompt length on `POST /api/ai/assistant/stream` (`route.ts:152-170`).
- **A2** — `POST /api/account/members` no longer resolves an email to a uid for the caller
  (`route.ts:117`, `:166`) and no longer answers 404 for an unregistered email; sharing is an invitation that the
  invited person accepts or declines.
- What a signed-in user who is NOT on the list sees (RU7).
- The seeds and scripts that create Auth users (nine files under `scripts/`), which must admit them, or every E2E
  spec fails on the new rules.
- `SETUP.md` Step 5 / 5b, `doc/guide/{server,account-condiviso-demo,accesso-registrazione,e2e-emulatori}.md`.

**Escluso** (each has its card)

- A1, A4 and the authorization table: **F02** (S1). This stage ADDS one persona and one case to that table (§ 6,
  RA6) and therefore starts after F02 is merged (D-SI19).
- The rules suite with `@firebase/rules-unit-testing`, R2–R4: **F11**. This stage ships an emulator probe (D-SI20).
- A5 (manual snapshot): **F07**. A6 (the rate limiter lives in memory) and A7 (`check-registration` answers without
  a token; `details` on 14 routes): «Fable minori · sicurezza». The one `details` removed here is the email route's,
  because the route is rewritten anyway.
- R6 (the demo account is read-only only in the interface): not on this deploy (no `NEXT_PUBLIC_DEMO_*` on Vercel).
  A deployment that has a demo must admit its user like any other (RU8).
- Email verification, password reset, a UI to manage the list: the list is managed by the registration policy and
  by one script.
- Sending the invitation by email (Resend is not configured).

## 3. Casi d'uso

1. **The owner uses the app as today.** Nothing visible changes; every read costs one more rule lookup (§ 4, RU3).
2. **Carlo, never authorised, obtains an Auth user** (sign-up reopened by mistake, or Google sign-in called against
   the public API key). He has a valid token and no `allowed-users` document: every Firestore read and write is
   denied, every private route answers 403, the crons never see him. He can write nothing, so he cannot plant
   `users/{C}` or settings with recipients (review T6a–T6c).
3. **A relative registers.** The owner adds the email to `REGISTRATION_WHITELIST`, redeploys, reopens sign-up in the
   console for the time it takes. The relative registers from `/register`: the Auth user is created, the SERVER
   checks the policy on the email of the token and writes `allowed-users/{uid}`, then the profile and the default
   allocation are written as today. The owner closes sign-up again.
4. **Someone registers with an email the policy refuses** (calling Firebase directly, or the page bypassed): the
   activation answers 403, nothing is written, the client deletes the Auth user as it already does for a refused
   Google registration.
5. **The owner removes someone**: `npm run users:allow -- --remove <email>`. Firestore refuses them from the next
   request; the API within 60 seconds (RU4).
6. **A user who is not on the list opens the app** (the PAC test user before F01 deletes it; a removed relative):
   they are signed out and the login page says why (RU7).
7. **The owner invites a person to their account**: types the email, «Invita». The answer is the same whether that
   email is registered or not. The tile shows the invitation as «In attesa» with a way to withdraw it.
8. **The invited person** (an admitted user whose email is the invited one) finds «Inviti ricevuti» in Impostazioni ›
   Condivisione, accepts or declines. Accepting makes them a member exactly as today; declining removes the invitation.
9. **The cron** takes the snapshot, processes dividends and sends the emails only for admitted users.
10. **A developer seeds an emulator account**: the seed admits it through the same helper the script uses; a seed
    that forgets is caught by the first spec, which cannot read anything.

## 4. Regole

### La lista

**RU1 — The document.** `allowed-users/{uid}`: `{ uid, email, grantedAt, source }`, `source` ∈
`'registration' | 'script' | 'seed'`. Written only with the Admin SDK. Its existence is the whole rule; the fields
are for the owner reading the console. Constant `ALLOWED_USERS_COLLECTION` in `types/account.ts`.

**RU2 — How a user enters: `POST /api/auth/activate`.** The route verifies the ID token WITHOUT asking for the list
(it is the one private route that cannot: `verifyFirebaseToken`, the first half of today's `requireFirebaseAuth`).
Then, in order: an existing `allowed-users/{uid}` answers `200 { allowed: true }` and writes nothing (idempotent);
a token without `email` answers 403; `isRegistrationAllowed(email)` (`lib/server/registrationPolicy.ts`, unchanged)
false answers `403 { allowed: false, code: 'registration/not-allowed' }` with no write; true writes the document
with `source: 'registration'` and answers 200. The email is the token's, never the body's: the route takes no body.

The client calls it in the two registration paths of `contexts/AuthContext.tsx`, right after the Auth user exists
and BEFORE any Firestore write: in `signUp` after `createUserWithEmailAndPassword` (the pre-check on
`/api/auth/check-registration` stays in front, so a refused email creates no Auth user), and in
`registerGoogleUser` in place of today's `check-registration` call (`:138`). A 403 takes today's cleanup path
(delete the Auth user, else sign out) and the same code `registration/not-allowed`; `signUp` gains that cleanup,
which today only the Google path has.

**RU3 — Firestore rules.** `isAuthenticated()` becomes `isAllowedUser()`:

```
function isAllowedUser() {
  return request.auth != null
    && exists(/databases/$(database)/documents/allowed-users/$(request.auth.uid));
}
```

and replaces `isAuthenticated()` in its seven uses (`isOwner`, `isMemberOf`, the three caches at `:248`, `:256`,
`:264`, `account-access` at `:302`). A member of a shared account is therefore admitted too, or sees nothing. New
block:

```
match /allowed-users/{uid} {
  allow get: if request.auth != null && request.auth.uid == uid;
  allow list, write: if false;
}
```

The `get` is for RU7 (a user may learn only whether THEY are admitted). Cost: Firestore bills one read per request
for the lookup (once per query, not per document returned); with `isMemberOf` a request reads at most two rule
documents, far from the limit of 10. The rules are published by hand by the owner AFTER RU8's migration.

**RU4 — API.** `requireFirebaseAuth` = `verifyFirebaseToken` + `assertAllowedUser(uid)`. A user without the
document gets `ApiAuthError(403, 'Account non abilitato')` with `code: 'account/not-allowed'` in the body
(`getApiAuthErrorResponse` adds the code when the error carries one). A positive answer is remembered in the
function instance for 60 seconds per uid (one `Map`, as `lib/server/rateLimit.ts`); a negative one never is, so an
activation takes effect at the next request. No route is edited for this except the two that do not use the helper
today: `user/monthly-email/send` (RU9) and nothing else — `auth/check-registration` stays public, the crons and
`wiki/ingest` stay on their secret, `portfolio/snapshot` with `cronSecret` in the body stays as is (its caller is
the cron, RU5).

**RU5 — Crons.** Both crons read `allowed-users` instead of `users` and walk those ids (the three phases of the
dividend cron use only `userDoc.id`, `route.ts:102, 212, 379`). `users/{uid}` is a profile; it no longer decides who
is processed.

**RU6 — `users:allow`, the owner's script.** `npm run users:allow -- <email>` writes the document
(`source: 'script'`) for the Auth user with that email; `--remove <email>` deletes it; `--list` prints uid, email,
date and source. It runs with the Admin credentials of the environment it is pointed at (production from the Mac,
or the emulators with the emulator variables, like `mirror:seed`). One helper `allowUser(db, uid, email, source)` in
`scripts/lib/`, used by the script and by every seed that calls `auth.createUser` (`seedEmulator.ts`,
`seedPensionE2E.mts`, `seedAnalisiE2E.mts`, `seedHallOfFameE2E.mts`, `seedCostCentersE2E.mts`, `seedSplitE2E.mts`,
`seedCensusE2E.mts`, `mirrorProdAccount.mts`, `exercisePensionPerformanceAndFire.mts`); `mirror:remove` deletes the
mirror's document with the rest.

**RU7 — A signed-in user who is not on the list.** `ActiveAccountProvider` (which already reads Firestore right
after the sign-in, `contexts/ActiveAccountContext.tsx:142`) reads `allowed-users/{viewer uid}` once per session,
without blocking the shell. Only a SUCCESSFUL read that finds no document acts: sign out, redirect to
`/login?reason=not-allowed`, and the tile's reading says the sentence of `account/not-allowed`
(`lib/utils/authNarrative.ts`, a new entry of `AUTH_ERROR_TEXT`): «Questo account non è abilitato a usare l'app.
Chiedi a chi la gestisce di abilitarlo.» A failed read (offline, timeout) does nothing: absence of an answer is not
a refusal. The demo uid is exempt from the check only in the sense that a demo deployment must have admitted it
(RU8), not by a branch in the code.

**RU8 — Migration and order.** The owner's account enters the list with `npm run users:allow -- <owner email>`
against production, run by the owner on the Mac. Order, each step harmless if the next is late:
1. `users:allow` for the owner (and for nobody else; the PAC test user stays out and F01 deletes it);
2. merge and deploy (from here the API and the crons ask for the list);
3. publish the rules (`firebase deploy --only firestore:rules`).
Reversed, step 2 before 1 gives the owner 403 on every route and step 3 before 1 denies every read; both are cured
by step 1 and lose no data. The PR says the order in its first lines. Vercel must keep
`NEXT_PUBLIC_REGISTRATIONS_ENABLED=false` or `NEXT_PUBLIC_REGISTRATION_WHITELIST_ENABLED=true`: with both at their
defaults `isRegistrationAllowed` admits every email and the list would admit whoever signs up (§ 9).

### I limiti di A3

**RU9 — `POST /api/user/monthly-email/send`.** `requireFirebaseAuth` and `getApiAuthErrorResponse` like every other
route; the 500 carries no `details`. A limit of **5 sends per hour per user** with `checkRateLimit`
(`${uid}:email-send`), counted before the email is built (the AI comment is generated before the send): the sixth
answers 429 «Hai raggiunto il limite di invii. Riprova più tardi.» with `Retry-After`. The four toggles and the
recipients check stay as they are.

**RU10 — `POST /api/ai/analyze-performance`.** A schema `performanceAnalysisRequestSchema` in
`lib/server/validation.ts`, through `parseOr400`, before the rate limit: `userId` string; `timePeriod` one of the
seven `TimePeriod` values; `metrics` an object holding ONLY the 22 fields the prompt reads
(`buildAnalysisPrompt`, `route.ts:357`): `roi`, `cagr`, `timeWeightedReturn`, `moneyWeightedReturn`, `volatility`,
`sharpeRatio`, `maxDrawdown`, `drawdownDuration`, `recoveryTime`, `yocGross`, `yocNet`, `currentYield`,
`currentYieldNet` finite numbers or null; `startNetWorth`, `endNetWorth`, `netCashFlow`, `numberOfMonths`,
`measuredFlowMonths` finite numbers; `startDate`, `endDate` through the file's date helper; `maxDrawdownDate` a
string of at most 20 characters, optional; `flowSource` one of the `FlowSource` values. Unknown keys are dropped
(the client sends the whole `PerformanceMetrics`, `cashFlows` included: none of it reaches the prompt). No free
string longer than 20 characters can enter the prompt.

**RU11 — `POST /api/ai/assistant/stream`.** A schema `assistantStreamRequestSchema`: `userId`; `mode` one of the
five `AssistantMode`; `prompt` trimmed, 1 to **8000** characters; `threadId` optional string of at most 64;
`month`, `year`, `chatContext`, `preferences` with the shapes of `types/assistant.ts`, unknown keys dropped. A longer
prompt answers 400 «La domanda è troppo lunga (massimo 8000 caratteri).» before any call to Anthropic. The composer
gets `maxLength={8000}` so the limit is not discovered at the send.

### L'invito (A2)

**RU12 — Storage.** `account-access/{ownerUid}` gains `inviteEmails: string[]` (lowercased, the flat array the
server queries) and `invites: { email, invitedAt }[]`, beside `memberUids` / `members`. No new collection, no new
rule: the document is already `write: false` and readable only by the owner and the members.

**RU13 — Inviting.** `POST /api/account/members { email }` (the route keeps its path): own email → 400; an email
already in `members` → 409; otherwise the invitation is stored (already invited: left as it is) and the answer is
`200 { invite: { email, invitedAt } }`. The route never calls `getUserByEmail` and never answers 404: a registered
and an unregistered email are indistinguishable (review P2a, P2b). An invitation to an email that is not registered
yet waits; the person still needs the whitelist to register (use case 3).

**RU14 — Reading.** `GET /api/account/members` answers `{ members, invites, received }`: the caller's members and
pending invitations, and `received` = the invitations addressed to the email of the caller's token
(`where('inviteEmails', 'array-contains', email)`), each `{ ownerUid, ownerEmail, ownerDisplayName, invitedAt }`.
One request, as today.

**RU15 — Answering.** `POST /api/account/invites { ownerUid, action: 'accept' | 'decline' }`, in a transaction on
`account-access/{ownerUid}`: the invitation for the token's email must be there (else 404, no write); `accept` adds
the caller to `memberUids` / `members` (uid, email and name from the token) and removes the invitation; `decline`
only removes it. The uid that enters `memberUids` is always the caller's own.

**RU16 — Withdrawing and revoking.** `DELETE /api/account/members?inviteEmail=…` removes a pending invitation;
`?memberUid=…` revokes a member as today. The members' uids stay in `GET` (the owner needs them to revoke people
who accepted).

**RU17 — The tile** (`components/settings/AccountSharingSection.tsx`; sketch «oggi / proposta» on the page linked
in the thread, WORKFLOW § 1.8). The button reads «Invita»; a pending invitation is a row with the email, «In
attesa» and the armed delete of a member row («Ritirando, {email} non potrà più accettare.»); the toast says
«Invito creato per {email}. Lo troverà in Impostazioni › Condivisione.» — no email is sent and the words do not
suggest one. Above the form, only when `received` is not empty, a block «Inviti ricevuti» with one row per
invitation: «{Nome} ti invita a vedere e modificare il suo account» · «Accetta» · «Rifiuta». After «Accetta» the
shared accounts are re-read so the switcher shows the account at once. `describeSharing` gains the pending clause
(«1 invito in attesa»). In demo every control is disabled as today.

## 5. Tabella di autorizzazione (changes to S1 § 5)

- The kind `token` now reads «any ADMITTED user»; `owner`, `resource`, `viewer` imply admitted.
- New row `auth/activate` · POST · kind `activation` (a valid token, the list not asked) · account = token uid ·
  ids from the client: none.
- New row `account/invites` · POST · `viewer` · ids: `ownerUid` → the invitation must name the token's email.
- `account/members` POST: «`email` → stored as an invitation, never resolved». DELETE: `memberUid` or
  `inviteEmail` → the caller's own document only.
- `user/monthly-email/send`: on the helper.
- The notes «A3, F04» and «A2, F04» come off.

## 6. Test che accompagnano la correzione (D-T3)

Figures invented and round; decoy words «Fenicottero», «Ornitorinco». Personas: `owner-1` (admitted), `member-1`
(admitted, member of `owner-1`), `stranger` (admitted, no membership), **`outsider`** (valid token, NO
`allowed-users` document).

| Id | File | Case | Expected |
| --- | --- | --- | --- |
| AU1 | `apiAuth.test.ts` | valid token, document present | passes; one read of `allowed-users/{uid}` |
| AU2 | same | valid token, no document | 403, body `code: 'account/not-allowed'` |
| AU3 | same | two calls within 60 s, then one after | one read, then a second; a 403 is never remembered (document added → next call passes) |
| AU4 | same | no token / forged token | 401 as today, no read of the list |
| AC1 | `activateRoute.test.ts` (new) | `outsider`, email allowed by the policy | 200; `allowed-users/{uid}` = `{ uid, email, source: 'registration' }` |
| AC2 | same | email refused by the policy | 403 `registration/not-allowed`; no write |
| AC3 | same | already admitted | 200; no write |
| AC4 | same | no token; token without email | 401; 403 |
| AC5 | same | body `{ email: 'owner@…' }` with a token of another email | the body is ignored: decided on the token's email |
| RA6 | `routeAuthorization.test.ts` (S1) | every row of kind `owner`, `resource`, `viewer`, `token` with `outsider`'s token | 403, zero writes, no path read but `allowed-users/outsider`; the `activation` row is exempt by kind |
| CR1 | `cronAllowedUsers.test.ts` (new) | `users` holds `owner-1` and `outsider`, `allowed-users` only `owner-1` | monthly-snapshot calls the snapshot once, for `owner-1`; the three dividend phases receive only `owner-1` |
| ME1 | `monthlyEmailSendRoute.test.ts` (new) | `outsider` | 403; the builder is not called |
| ME2 | same | six sends in an hour | five reach the builder, the sixth 429 with `Retry-After` |
| ME3 | same | the builder throws «Ornitorinco» | 500 whose body does not contain «Ornitorinco» |
| AP1 | `analyzePerformanceRoute.test.ts` | `metrics` with an extra key `note: 'Fenicottero'` and `cashFlows` | 200; the prompt handed to Anthropic does not contain «Fenicottero» |
| AP2 | same | `roi: 'abc'`; `timePeriod: 'Fenicottero'`; `maxDrawdownDate` of 200 characters | 400 each; Anthropic not called |
| AS1 | `assistantStreamRoute.test.ts` | prompt of 8001 characters | 400; Anthropic not called |
| AS2 | same | prompt of 8000 characters | not 400 |
| IN1 (P2a) | `accountMembersRoute.test.ts` | `owner-1` invites a registered email | 200 `{ invite }`; the body contains no `uid`; `getUserByEmail` never called; `memberUids` unchanged |
| IN2 (P2b) | same | the same with an unregistered email | a body of the same shape and status as IN1 |
| IN3 | same | own email; an email already member; an email already invited | 400; 409; 200 with one invitation stored |
| IN4 | `accountInvitesRoute.test.ts` (new) | the invited user accepts | their uid in `memberUids`, the invitation gone |
| IN5 | same | `stranger` accepts an invitation addressed to another email | 404; `memberUids` unchanged |
| IN6 | same | decline; the owner withdraws (`DELETE ?inviteEmail`) | the invitation gone, `memberUids` unchanged |
| IN7 | `accountMembersRoute.test.ts` | `GET` as the invited user | `received` holds the invitation of `owner-1`; `GET` as `stranger`: empty |
| AN1 | `authNarrative.test.ts` | `describeAuthError({ code: 'account/not-allowed' })` | the sentence of RU7 |
| SN1 | `settingsNarrative.test.ts` | `describeSharing` with one member and one pending | names the member and «1 invito in attesa» |

Each guard seen red once before the commit: AU2 and RA6 on `main`'s `requireFirebaseAuth`, CR1 on the crons reading
`users`, IN1/IN2 on today's route.

**The rules, on the emulators** (Mac; `scratchpad/rules-probe.mjs` from the review, extended; not a Vitest, D-SI20).
Pair by pair, positive control first:

| Id | Case | Expected |
| --- | --- | --- |
| RP1 | A (admitted) repeats T1a, T7a, T6d | allowed as before |
| RP2 | C (Auth only) repeats T6a, T6b, T6c, T6d | all four denied |
| RP3 | C reads `allowed-users/{C}`; C reads `allowed-users/{A}`; C lists the collection | allowed (not found); denied; denied |
| RP4 | C creates `allowed-users/{C}`; A writes `allowed-users/{A}` | denied; denied |
| RP5 | M (member, admitted) reads A's asset; M with its document removed | allowed; denied |

## 7. Decisioni

Proposed by this spec on 2026-11-15; **none is taken until the owner confirms it in the thread**. D-SI10, D-SI11,
D-SI15 and D-SI17 are the product choices put to the owner; the others apply the review's corrections.

| Id | Decision | Alternatives rejected, and why |
| --- | --- | --- |
| **D-SI10** | The list is a Firestore document `allowed-users/{uid}` (RU1, RU3). | *(a) A custom claim on the token*: free for rules and API, but a grant or a removal takes up to an hour to reach a session (or a forced refresh on every path), the existing session of the owner would be denied until its token renews after the rules are published, and the crons would have to ask Auth for each user. *(b) Compare the token's email with `REGISTRATION_WHITELIST` on the server*: the rules cannot read an environment variable, so R1 would stay open exactly where it was proven (T6a–T6c). |
| **D-SI11** | A user enters the list through the server at registration (`/api/auth/activate`, the existing policy on the token's email), and by the owner's script for the migration and the seeds (RU2, RU6). | *(a) The script only*: the relative's registration would stop at a wall of denied writes until the owner runs a command, and needs a waiting screen that serves one person once. *(b) A blocking function before the user is created*: needs Identity Platform and the Blaze plan; the project is on the free plan. |
| **D-SI12** | The activation does not require a verified email. | *Require `email_verified`*: Google passes, but email and password registration would need a verification flow the app does not have. The case it prevents (someone registering a whitelisted, not yet registered email before its owner does) needs sign-up open in the console at that moment and is visible at once («email già in uso»). |
| **D-SI13** | One check inside `requireFirebaseAuth`, 403 with a code, positive answers remembered 60 s per instance (RU4). | *A check per route*: the model that left the email route outside the helper. *No memory*: one Firestore read in front of every API call of the owner. *A longer memory*: a removal would take that long to bite on the API. |
| **D-SI14** | The crons walk `allowed-users` (RU5). | *Walk `users` and skip who is not admitted*: two reads for the same answer, and `users` stays the thing a client writes. |
| **D-SI15** | A signed-in user who is not admitted is signed out and told why on the login page (RU7); no new screen. | *(a) Do nothing*: they would see every tile of the dashboard as a failed read, which says «riprova» about something that will never work. *(b) A dedicated «in attesa di abilitazione» page*: a screen, its states and its spec for a case that today is the PAC test user. *(c) Block the shell until the list answers*: a Firestore read in front of every page, removed on 2026-09-28 for the display name. |
| **D-SI16** | The limits of A3: 5 sends an hour, the 22 fields of `metrics` and nothing else, 8000 characters of prompt; counted in memory like the two AI routes (RU9–RU11). | *A counter on Firestore now*: it is A6, which moves all three counters together. *Limit `metrics` by size only*: any string would still reach the prompt. |
| **D-SI17** | Sharing is an invitation stored on the owner's `account-access` document, answered by the invited person; the invite answer is the same for any email; no email is sent; an invitation does not expire (RU12–RU16). | *(a) Keep the immediate add and rely on the list*: closed to strangers, but the route would still tell an admitted user which emails are registered and add people without their consent. *(b) A collection `account-invites` with its own ids*: a second place to keep in step with `memberUids` for at most a handful of rows. *(c) An expiry*: a date to check and to explain, for an invitation the owner can withdraw. *(d) Send it by email*: Resend is not configured. |
| **D-SI18** | The invited person finds the invitation in the same tile, in Impostazioni › Condivisione; nothing is fetched elsewhere (RU14, RU17). | *A notice on the dashboard or a row in the account switcher*: one more request on every session of every user, for an event the owner announces in person. |
| **D-SI19** | Two implementation steps, two PRs, after F02 is merged: **S2a** = the list, the rules, the crons, A3 (RU1–RU11); **S2b** = the invitation (RU12–RU17). | *One PR*: S2a changes who can use the app and needs the migration order of RU8; S2b is a feature with a UI. Reviewing and reverting them together ties the lock to the feature. |
| **D-SI20** | The rules change ships with the emulator probe RP1–RP5; its automated test arrives with F11's suite. Same declared exception to D-T3 as D-SI6. | *Add `@firebase/rules-unit-testing` here*: it is F11's job. |

## 8. Criteri di accettazione

**S2a**

- **CA1** AU1–AU4, AC1–AC5, RA6, CR1, ME1–ME3, AP1–AP2, AS1–AS2, AN1 green; AU2, RA6 and CR1 seen red on `main`.
- **CA2** `npx vitest run` green under `TZ=Europe/Rome` and `TZ=UTC`; `npx tsc --noEmit` clean;
  `npx eslint app components lib types e2e scripts __tests__` clean.
- **CA3** On the Mac, emulators up and re-seeded: RP1–RP5 give the expected outcome; the review's `api-probe.mjs`
  with a freshly created Auth user gets 403 on its nine P3 routes and on P2a.
- **CA4** `npm run test:e2e` on the Mac with the new rules loaded: the same result as the run before the change
  (every seed admits its account; a spec that cannot read is a seed that was missed).
- **CA5** On the emulators, in a browser: a new registration with an allowed email lands on the dashboard and
  `allowed-users/{uid}` exists with `source: 'registration'`; an Auth user created with the Admin SDK and no
  document signs in and is returned to `/login` with the sentence of RU7.
- **CA6** `mobile:census` / `mobile:budget` and `perf:budget` unchanged (one more rule read, no new request before
  the first screen); if a ceiling moves, the measure is in the PR.
- **CA7** `doc/guide/server.md` (the list, `requireFirebaseAuth`, `users:allow`), `account-condiviso-demo.md`,
  `accesso-registrazione.md`, `e2e-emulatori.md` (seeds admit their account), `SETUP.md` Step 5; CLAUDE.md and
  AGENTS.md per WORKFLOW. The PR's first lines carry the order of RU8.

**S2b**

- **CA8** IN1–IN7, SN1 green; IN1/IN2 seen red on today's route.
- **CA9** `e2e/settings.spec.ts`: one case **SH1** — the base account invites `ornitorinco@example.com`, the row
  «In attesa» appears, the document holds the invitation and `memberUids` is unchanged, the withdrawal removes it;
  the existing «lettura fallita» case stays green.
- **CA10** `SETUP.md` Step 5b rewritten (the guest no longer has to register first); the guide of the shared account
  says the invitation.

## 9. Punti aperti

- **The registration variables on Vercel** (`NEXT_PUBLIC_REGISTRATIONS_ENABLED`,
  `NEXT_PUBLIC_REGISTRATION_WHITELIST_ENABLED`, `REGISTRATION_WHITELIST`): not readable from here. RU8 needs
  registrations off or the whitelist on; the owner confirms the values before S2a is merged.
- **A member of a shared account calling `users:allow --remove` on themselves** is not a case: the script is the
  owner's. A member who is removed from the list keeps their entry in `memberUids`; it is inert (RU3) and the owner
  revokes it from the tile.
- **The 60 seconds of RU4** are per function instance: a removal can be honoured by one instance and not yet by
  another for up to a minute. Accepted with D-SI13.
- **F11** inherits RP1–RP5 as cases of its suite, and the rule that every new collection uses `isAllowedUser()`
  through `isOwner` / `canAccess`.
- **A6** (counters on Firestore) will move the email limit of RU9 with the two AI limits.
