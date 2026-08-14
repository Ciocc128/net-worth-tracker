# Workflow — standing instructions

> **Standing instructions for any AI agent working on this repo.** They are not suggestions and not
> per-session: they hold until this file says otherwise.
>
> **Why they live in the repo and not in agent memory**: agent memory is per-machine and per
> install, so the same rules drift into different versions on the laptop, the desktop and a cloud
> session. A tracked file travels with the clone and can be reviewed in a diff. If you are an agent
> with persistent memory, do **not** re-save these rules there — save one pointer to this file.
>
> Sections 1-2 are the portable standard, identical across every repo that adopts it. Section 3 is
> the only project-specific part: it says what "automate it yourself" concretely means *here*.

---

## 1. Session and collaboration rules

1. **Never commit without explicit approval.** Do not run `git commit` (nor `--amend`) until the
   owner gives the OK for that specific commit. Finish the work, summarise the diff, then ask.
   Creating the branch and editing files needs no approval — only the commit does.

2. **One branch per session.** Before starting implementation work, create a new branch from the
   branch that is active at the start of the session. Always check which one that is; never assume
   `master`/`main`.

3. **One commit per session.** Everything from a session is squashed into a single commit, never
   scattered across several.

4. **Always answer in Italian** when working on this repo. This applies to the conversational
   channel; code, identifiers and comments stay in English.

---

## 2. Guided verification (*collaudo guidato*)

When a freshly implemented feature has to be verified by hand, do **not** hand over a checklist and
disappear. The verification is done together, in chat, one phase at a time.

### Four obligations

1. **You prepare the test data.** A throwaway script (untracked by git, deleted when the
   verification ends) that plants **decoy words** — invented terms such as *fenicottero*,
   *ornitorinco*, which appear nowhere else in the data. Not entered by hand by the owner.

2. **One phase per message.** Give the phase, wait for the report, then the next one. Never deliver
   all the phases at once: it breaks their prerequisites.

3. **State the expected outcome before running, not after** — otherwise the reading always bends to
   fit whatever happened.

4. **Do every check you can automate yourself, and leave the owner only what you cannot do.**
   "Together, in chat" does not mean "one dictated click at a time". If the sessions are JWT-based
   or otherwise scriptable, write a throwaway script that opens a **real browser** (e.g. Playwright)
   with an authenticated session — your own if the role allows it, otherwise a throwaway test
   identity created for the occasion — and verify every outcome **against the database or the HTTP
   response, never against the look of the page alone**. Report the results phase by phase, with the
   expected outcome stated first.
   **Any automated end-to-end test that you are able to run, you run.** What is left to the owner is
   only what is genuinely not automatable: visual and aesthetic judgement, physical hardware (a real
   barcode scanner), or an interactive login that cannot be driven by a script (a real OAuth flow
   with MFA).

### Standard phases, when they make sense

| | Phase | What it establishes |
| --- | --- | --- |
| **A** | Invarianza | What worked before still works |
| **B** | Cambio di contesto | The new role/state is genuinely active |
| **C** | Comportamento nuovo | It does what it must, and not what it must not — obligation 4 matters most here: automate |
| **D** | Sotto la UI | The same rules hold when the route is called directly |
| **E** | Casi negativi | Someone without rights is refused, with the right error |
| **F** | Ripristino | Configuration restored, fixtures removed, script deleted |

### A negative test alone never proves a security guard

It always takes the pair: **own resource** (positive control — must succeed) and **someone else's
resource** (the test — must fail), with the same identical file or record.

### Closing a verification

Restore any configuration that was changed, remove fixtures and test attachments, delete the script,
and **record the outcome somewhere that survives the session** (`CLAUDE.md` or equivalent).
*A verification that was not recorded counts as not done.*

---

## 3. What this means in THIS repo

The rules above are the standard. This section is the local translation of obligation 4 — it changes
from repo to repo and is the only part to rewrite when the tooling changes.

- **Never verify against production Firebase.** Everything runs on the Firebase Emulator Suite:
  `npm run emulators` → `npm run emulators:seed` → `npm run dev:emulator`. Prerequisites (Java 21+)
  and the full guide: SETUP.md → Step 6.
- **Throwaway fixtures** follow the existing seed pattern (`scripts/seedEmulator.ts`,
  `scripts/seedAnalisiE2E.mts`, `scripts/seedPensionE2E.mts`) or live as a throwaway `.mts` in the
  session scratchpad. `.mts`, never `.ts`: a `.ts` script is CJS under tsx and has no top-level
  await (AGENTS.md → *Emulator Exercise Scripts*).
- **The authenticated browser already exists.** The Playwright projects park an authenticated
  `storageState` per fixture account, so a script does not have to reproduce the login:
  `npx playwright test --project=<name>`. A throwaway spec must match that project's `testMatch` to
  be collected, and must be deleted at the end.
- **Automated suites are yours to run, always**: `npx tsc --noEmit`, `TZ=Europe/Rome npx vitest run`
  and `npx playwright test`. Never report a feature as verified while an automated check that could
  have covered it was left unrun.
- **Assert on data, not on pixels.** Read back from the Firestore emulator —
  `curl -H "Authorization: Bearer owner" "http://127.0.0.1:8080/v1/projects/demo-net-worth/databases/(default)/documents/<collection>"`;
  without that header the call is silently filtered to an empty result, which looks exactly like
  "there are no documents" — or from the API route's own response. Arithmetic belongs to Vitest; the
  browser is for what only a browser knows (AGENTS.md → *Browser-Driven E2E*).
- **Prove the check can fail.** Break the thing under test on purpose once and watch the assertion go
  red. A green check that has never been seen red is indistinguishable from one asserting nothing.
- **Phase E here is the delegation boundary**: `assertCanAccessAccount`, `firestore.rules`,
  `REGISTRATION_WHITELIST`. The positive/negative pair is the owner's document against another
  account's document — same collection, same shape.
- **Phase F**: prefer deleting the few documents you created (`curl -X DELETE` with the same
  `Bearer owner` header) over wiping `.emulator-data/`, which throws away the shared seed.
- **Where the outcome is recorded**: `SESSION_NOTES.md` during the session; it is folded into
  `CLAUDE.md` (the "Latest" entry) and `Draft Release Temp.md` before the PR, then deleted.
