# S3 — «Le regole Firestore hanno una suite» (F11)

Fork only. Source: security review 2026-11-11, `review-sicurezza/parte-1-regole-firestore.md` (R2–R5) and
`parte-4-secret-perdita-dati.md` (S1), test-health review C1. Implemented 2026-11-17 on `main` after F02, F07, F04 S2a.

## 1. Obiettivo

`firestore.rules` is no longer published blind: a suite proves, for every collection, that the owner succeeds and a
stranger fails, plus the shared account and the allowed-users list. Four review findings are closed with it (R2, R4,
R5; R3 was closed by F07), and `npm run dev` can no longer touch production by habit (S1).

## 2. Perimetro

**Incluso**: the suite (`__tests__/rules/firestoreRules.rules.ts`, `npm run test:rules`, 36 tests); R2, R4, R5 in the
rules; S1 (`dev` → emulators, `dev:prod`, typed confirmation in `users:allow`).
**Escluso**: the comparison of the console's rules with the file (Mac, read-only, with the owner's OK); R6 (demo off);
a CI step (card F06 «CI step 1»); validation of asset derived fields (product choice, left as is).

## 3. Regole

| ID | Rule |
| --- | --- |
| **RR1** | The suite runs against the Firestore emulator through `firebase emulators:exec` and the config `vitest.rules.config.ts`. It is NOT in `npm test` (it needs the emulator, and Java). It runs in the cloud container. |
| **RR2 (R2)** | `assetAllocationTargets/{targetId}`: create and update need `canAccess(targetId)` and `userId == targetId`, as `budgets`. A stranger cannot occupy a document before it exists. |
| **RR3 (R3)** | Already closed by F07 (RI17): the client creates only test snapshots (`isDummy`) on an id bound to its fields, updates only `note`, deletes only test snapshots. The suite proves it; the rule is untouched. |
| **RR4 (R4)** | Every update rule reads `request.resource.data.userId == resource.data.userId`, with no «absent» alternative. A partial `updateDoc` still passes (the resulting document keeps `userId`); `deleteField()` on it, or a new value, is refused. Seven collections: assets, expenses, expenseCategories, pensionContributions, accumulationPlans, costCenters (+ the R2 one). |
| **RR5 (R5)** | `expenses`, after create or update: `amount` is a number, `date` a timestamp, `notes` absent, null or a string ≤ 5000 characters (`hasValidExpenseShape`). Nothing else is checked. Snapshots need nothing (the client writes only the note); asset derived fields are left. |
| **RR6 (S1)** | `npm run dev` = `dev:emulator`; `dev:prod` is `next dev` on `.env.local`. `users:allow` (add or `--remove`) on production asks to type the production project id; a non-interactive shell refuses; `--list` and the emulator do not ask. The other scripts that touch production only read it (`mirror:seed`, `exposure:*`). |

## 4. Decisioni

| ID | Decision | Alternative scartata |
| --- | --- | --- |
| **D-RG1** | The suite is a separate vitest config, not part of `npm test`. | Skipping inside the normal suite when the emulator is down: a silent skip is the failure this card exists to remove. |
| **D-RG2** | R5 minimal, on expenses only (type of amount and date, cap on notes), confirmed by the owner 2026-11-17. | No R5; also snapshots and assets (the first would not close the finding, the second breaks the asset form). |
| **D-RG3** | `dev` points at the emulators. | Keeping `dev` and adding a warning: the review's scenario is exactly the habit. |

## 5. Criteri di accettazione

- CA1 `npm run test:rules`: 36 green; with the old rules (R2 line and R4 clause restored) the R2, R4 and R5 tests are red.
- CA2 `npx tsc --noEmit` and eslint on the new files clean; `npm test` unaffected.
- CA3 (Mac, after the merge, by hand) `firebase deploy --only firestore:rules`; `npm run test:e2e` with the new rules (the client writes: settings save, expense forms, CSV import, PAC, snapshots note) stays green; console ↔ file comparison, read-only.

## 6. Punti aperti

- The CI step for `test:rules`: card F06.
- A bulk client write that sets `amount` as a string would now be refused: the audit of the writers found numbers only, the Mac `test:e2e` is the proof.
