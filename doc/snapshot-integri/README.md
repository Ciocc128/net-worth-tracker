# Snapshot integri — dossier

Fork only. Card: Todoist **F07** «integrità degli snapshot: chi scrive, mesi chiusi, prezzi falliti» (C1, C3, C4,
A5, M7), label `epic-review-fable`. Sources: the security review of 2026-11-11 (project Library
`review-sicurezza/parte-3-cron-snapshot.md` for C1, C3, C4; `parte-2-api-route.md` for A5; `parte-1-regole-firestore.md`
for R3 and R5) and the data-model review (`review-modello-dati/parte-1-tipi-e-documenti.md`, M7). Pages:
<https://claude.ai/artifact/2hwcn9rwBnE2iJyKtqxprx>, <https://claude.ai/artifact/WU1QvVw5iUgYRojErZgJva>.

Nothing in the app yet: this is the spec, written on 2026-11-14 on `main` = `ec6d115`. **One implementation PR.**
Decisions confirmed by the owner on 2026-11-15 (§ 8): spec ready.

Sibling specs not on `main` yet, referenced where they overlap:

- **F02** `doc/sicurezza/README.md` (branch `claude/project-thread-btpwuv`): the authorization table of every route
  and its rule RS7. This spec adds one route (§ 5.5) and keeps to RS7.
- **F08** `doc/rendimenti-misura/README.md` (branch `claude/project-thread-uwvwn7`): D-RM4 reads the snapshot's
  capture day from `createdAt`. This spec changes what `createdAt` means (§ 5.2, RI4): the two meet in ONE helper.

---

## 1. Obiettivo

A monthly snapshot is the only history of the net worth and cannot be rebuilt. After this work:

1. every snapshot says **who wrote it and when** (C1);
2. a **closed month** — any month before the current Italian one — cannot be rewritten with today's figures, and a
   deliberate rewrite by hand can be **undone** (C3);
3. the manual snapshot, and five other routes that read their body unchecked, **validate** what they receive (A5);
4. a price that **failed to refresh** or **jumped** leaves a mark in the snapshot that was built on it, and the app
   says so (C4);
5. the document has **one builder** and one shape, whoever writes it (M7).

## 2. Perimetro

**Incluso**

- The snapshot document: authorship and timestamps, the price record, the pointer to the previous version (§ 5.1).
- `POST /api/portfolio/snapshot` (cron and «Crea snapshot»): current month only; the price record; the transaction.
- `POST /api/portfolio/snapshot/manual`: schema, coherence checks, explicit replacement, the previous version kept.
- A new `POST /api/portfolio/snapshot/restore` (undo of a replacement).
- `lib/helpers/priceUpdater.ts`: a structured result (failures, anomalies).
- The note writer of Storico (`updateSnapshotNote`): it can no longer create a document.
- The test-data generator (`dummySnapshotGenerator`): the same builder; it skips a month that holds a real snapshot.
- `firestore.rules` for `monthly-snapshots` (R3, and the snapshot half of R5), published by hand by the owner.
- Schemas for the five routes A5 names: `hall-of-fame/recalculate`, `prices/update`, `assets/[assetId]` (DELETE),
  `ai/assistant/memory` (PATCH, DELETE), `ai/assistant/stream`.
- What the user sees: a toast after «Crea snapshot», one sentence and one footer in Storico › Dettaglio, the
  replacement step of the manual-snapshot dialog (§ 5.8).

**Escluso** (each has its card)

- The cron's own defects — C2 (no trace of a failed run), C5 (email sent twice), C6 (two crons at 18:00 UTC), C7
  (the secret in an HTTP call): «Fable minori · Cron serale». This spec does not need them: the route already knows
  a cron call by its `cronSecret`.
- **The month that closes at 19:00** (edits of the last evening miss the recap email and the wiki export): a product
  choice, § 9 P1. It is decided here because this spec supplies the fields it needs, and implemented with the cron
  card, not in this PR.
- D2 in full (the test-data block only on the emulators): «Fable minori · Sicurezza». Here only the overwrite is
  closed.
- The Firestore rules SUITE (`@firebase/rules-unit-testing`) and R2, R4: **F11**. The rule written here is tested by
  that suite when it exists (§ 6, D-SN8).
- The allowed-users list and the prompt/metrics limits of A3: **F04**. The stream schema below sets a length cap
  because a schema without one validates nothing; F04 may tighten it.
- The recap email and the PDF do not yet say that a month was built on stale prices (§ 9 P3).
- No backfill: a snapshot written before this work keeps its shape and reads as «origine non registrata».

## 3. Stato di partenza (letto sul codice)

Six writers of `monthly-snapshots` exist (review, part 3). The four that matter:

| # | Writer | Where | Shape today |
| --- | --- | --- | --- |
| 1 | cron, every day 18:00 UTC | `app/api/portfolio/snapshot/route.ts` via `app/api/cron/monthly-snapshot/route.ts:104` | full; `createdAt: Timestamp.now()` on every rewrite (`:237`) |
| 2 | «Crea snapshot», Panoramica | same route, `lib/hooks/useSnapshots.ts:81` | identical to the cron |
| 3 | manual, Storico | `app/api/portfolio/snapshot/manual/route.ts` from `components/CreateManualSnapshotModal.tsx:210` | no `pension`, no `fireNetWorth`; nothing validated (`:63-180`) |
| 4 | note, Storico | `lib/services/snapshotService.ts:147` (`setDoc` + `merge`, client) | on a free id creates `{ note, userId }` |
| 5 | test data | `lib/services/dummySnapshotGenerator.ts:238-243` (`setDoc` + `merge`, client) | `isDummy`, written OVER a real month |

- **C1**: nothing tells writer 1 from 2 from 3, and `createdAt` is the time of the last rewrite. The October case
  (two «ottobre» on 31/10, 19:00 and 23:20) stayed open ten days for this.
- **C3**: `snapshotRequestSchema` (`lib/server/validation.ts:36-41`) accepts `year`/`month`; the route uses them as
  the target (`route.ts:186-188`) with today's figures. The UI never sends them (`app/dashboard/page.tsx:340`), two
  tests do (`__tests__/apiAuthRoutes.test.ts:727-742`). The manual route replaces any month, and the dialog does not
  say the month already has a snapshot. The replaced version is lost.
- **A5**: proven on the emulators (P7): `month: 1.5`, `totalNetWorth: "abc"` → 200 and a document `{uid}-2020-1.5`.
- **C4**: `updateUserAssetPrices` returns `failed: string[]`; the route logs it and goes on (`route.ts:123-129`). The
  only check on a price is `> 0`. An FX failure leaves a stale `currentPriceEur` and is only a `console.warn`
  (`priceUpdater.ts:193-199`).
- **Rules** (`firestore.rules:58-65`): a client that can access the account may create, update and delete any
  snapshot of it, with any content.
- **Readers** are safe against a note-only document only by accident: the client and two server readers order by
  `year`, `month`, which drops a document without them; `monthlyEmailService`, `assetAdminRepository` and the
  assistant store do not.

## 4. Casi d'uso

1. **The evening cron** writes the current month, as today. The document now says `writtenBy: 'cron'`, keeps the
   `createdAt` of the month's first write and stamps `updatedAt`.
2. **Giorgio presses «Crea snapshot»** at 23:20 on the last day, after the cron: the month is rewritten,
   `writtenBy: 'button'` with his uid. Storico › Dettaglio says who wrote October and when.
3. **A script, a test or an agent calls the automatic route with `{ year: 2024, month: 3 }`**: 400, nothing written.
4. **Giorgio enters by hand a month that has no snapshot** (history before the app): as today, with the figures
   checked on the server too.
5. **He enters by hand a month that already has one**: the dialog says so, names who wrote the existing one, and
   asks to replace. The replaced version is kept. Afterwards the same dialog offers «Ripristina» for that month.
6. **Yahoo does not answer for one ETF on the last day of the month**: the snapshot is written with the last known
   price, and records the ticker. The toast names it; Storico › Dettaglio says it on that month, for good.
7. **Yahoo answers with a price a hundred times too high** (pence for pounds): the price is taken, the snapshot
   records the jump, the toast asks to check it.
8. **A malformed request** to the manual route or to the five other routes: 400, nothing written or run.
9. **A client write that is not a note** (a console, a stale tab, another member's script): refused by the rules.

## 5. Regole

### 5.1 The document

`MonthlySnapshot` (`types/assets.ts:590`) gains five optional fields. Absent = written before this work.

```ts
writtenBy?: 'cron' | 'button' | 'manual' | 'dummy';
writtenByUid?: string;          // the token's uid; absent for the cron
updatedAt?: Date;               // the last write of the FIGURES (Firestore Timestamp)
prices?: {
  status: 'fresh' | 'partial' | 'failed' | 'none';
  failed: Array<{ assetId: string; ticker: string; reason: 'quote' | 'fx' | 'write' }>;
  anomalies: Array<{ assetId: string; ticker: string; previousPrice: number; price: number; changePct: number }>;
  oldest: { assetId: string; ticker: string; at: string } | null;   // ISO instant
};
previous?: { versionId: string; archivedAt: string; writtenBy?: string; updatedAt?: string };  // ISO instants
```

`createdAt` keeps its name and becomes what the name says: the first write of the document.

### 5.2 One builder, authorship, time (C1, M7)

**RI1 — One builder.** `lib/utils/snapshotDocument.ts`, pure and SDK-free (it is imported by the two routes and by
the client-side generator): `buildSnapshotDocument(input)` takes the figures, `writtenBy`, `writtenByUid?`, `now`,
`prices?` and the existing document (or `undefined`) and returns the whole document. No other code assembles a
snapshot object. It:
- writes `fireNetWorth` and `pension` only when the caller measured them (the manual writer does not: absent stays
  «unknown», `types/assets.ts:622-626`);
- derives `assetAllocation` from `byAssetClass` and the total (today's `buildAllocationPercentages`), also for the
  manual writer: the percentages are never taken from a request (F02, RS7);
- carries the user-authored fields of the existing document (`preserveUserAuthoredSnapshotFields`, unchanged) and
  its `previous` pointer;
- omits every `undefined` (Firestore refuses it).

**RI2 — Who.** `writtenBy` is `cron` when the request carries a valid `cronSecret`, `button` when it carries a token
on the automatic route, `manual` on the manual route, `dummy` from the generator. `writtenByUid` is the token's
`uid` — the member's own when a member writes for the owner.

**RI3 — When.** `createdAt` = the existing document's `createdAt` when it has one, else `now`. `updatedAt` = `now`
on every write of the figures. A note does not touch either.

**RI4 — The capture instant has ONE reader.** `snapshotCapturedAt(snapshot)` in the same module returns
`updatedAt ?? createdAt`. F08 § 5.4 (D-RM4: «fine del giorno italiano di `snapshot.createdAt`») must read it through
this helper: after RI3, `createdAt` of the current month is its FIRST evening, and reading it directly would stop
the month's flows on day 1. Whichever PR lands second adopts the helper; the F08 dossier is amended in that PR.
`getUserSnapshots` (`snapshotService.ts:56-59`) and the server readers that convert `createdAt` convert `updatedAt`
the same way.

**RI5 — Read and write in one transaction.** Both routes read the existing document and write the new one (and the
archived version, RI9) inside `adminDb.runTransaction`: two writers a second apart (the cron and the button) cannot
both believe they are the first.

### 5.3 The automatic route writes the current month (C3)

**RI6.** `snapshotRequestSchema` becomes `{ userId, cronSecret? }` and **strict**: a body with `year` or `month` (or
any other key) is a 400 «Invalid request», with no price update and no write. The target is always
`getItalyMonthYear()` at the time of the call. `CreateSnapshotParams` (`useSnapshots.ts:43-47`) loses the two fields.
Rejected rather than dropped: a caller that names a past month must not silently get the current one written.

A closed month is therefore reachable by one writer only, the manual route.

### 5.4 The manual route (A5, C3)

**RI7 — Schema** (`manualSnapshotSchema` in `lib/server/validation.ts`, through `parseOr400`, strict). Order: token
→ schema → `assertCanAccessAccount`.

| Field | Rule |
| --- | --- |
| `userId` | non-empty string |
| `year` | integer, 1900–2100 |
| `month` | integer, 1–12 |
| `totalNetWorth`, `liquidNetWorth`, `illiquidNetWorth` | finite numbers (a net worth below zero is legal: loans) |
| `byAssetClass` | record: keys among `ASSET_CLASS_SEQUENCE`, values finite |
| `byAsset` | optional array, at most 500 rows of `{ assetId, ticker, name: string ≤ 200; quantity, price, totalValue: finite }` |
| `replace` | optional boolean |

`assetAllocation` and `createdAt`, which the dialog sends today, are no longer part of the request (RI1). The dialog
stops sending them in the same PR; a tab of the previous build gets a 400 and its form says to reload.

**RI8 — Coherence, on the server as in the dialog** (`lib/utils/manualSnapshotAmounts.ts`, tolerance 0,01):
`|Σ byAssetClass − totalNetWorth| ≤ 0,01` and `|liquidNetWorth + illiquidNetWorth − totalNetWorth| ≤ 0,01`; else
400 with the Italian sentence the dialog already shows. A month **after** the current Italian one is a 400 («Un mese
futuro non ha uno snapshot»). The current month is allowed: an account with no market-priced asset has no other way
to write it.

**RI9 — Replacing is explicit and kept.** When the target document exists and has figures:
- without `replace: true` → **409** `{ error: 'snapshot_exists', existing: { writtenBy, updatedAt } }`, nothing
  written;
- with `replace: true` → in the transaction, the existing document is copied whole to
  `monthly-snapshots/{id}/versions/{autoId}` with `archivedAt` and `archivedByUid`, then the new one is written with
  `previous` pointing at that version. The note rides across as today.

A document without figures (a legacy note-only one, § 3) is not «existing»: it is completed, its note kept.
Versions are never pruned (a replacement by hand is rare; each is a few kB). The automatic route never archives: it
rewrites the current month every evening by design.

### 5.5 Undo

**RI10.** `POST /api/portfolio/snapshot/restore`, body `{ userId, year, month }` (strict schema), kind `owner` in
F02's table. In one transaction: read the document and the version named by `previous.versionId`; archive the
current document as a new version; write the old version back with its own `writtenBy`, `writtenByUid`, `createdAt`,
`updatedAt` and figures, the CURRENT note, and `previous` pointing at the version just archived. So a restore is
itself undone by a second restore. No `previous`, or its version missing → 404, nothing written. Afterwards: the
overview invalidation and `updateHallOfFame`, as the manual route does.

Restoring is the only way a document is written with someone else's authorship fields: they describe the figures,
not the act of restoring.

### 5.6 Prices (C4)

**RI11 — The updater says what happened.** `PriceUpdateResult` gains `failures: Array<{ assetId, ticker, reason }>`
and `anomalies: Array<{ assetId, ticker, previousPrice, price, changePct }>`; `failed: string[]` and `message` stay
for `/api/prices/update`. Reasons: `quote` (no quote, or a price ≤ 0, from every source tried), `fx` (the price was
written but `convertToEur` threw, so `currentPriceEur` is stale), `write` (the Firestore update threw).

**RI12 — A jump.** Before writing a new price, compare it with the stored one **in the same currency** (bonds: the
euro-per-unit price after `bondQuoteToEurPerUnit`; a GBp quote after its ÷100):

```
changePct = (new / old − 1) × 100
anomaly   ⇔  |changePct| ≥ 30   and   old > 0   and   lastPriceUpdate is within 7 days   and   same currency
```

The price is **written anyway** and the anomaly recorded (D-SN5). Thirty percent in a day is beyond a 3× leveraged
ETF in an ordinary crash and far below a unit error (×100, ÷100); seven days because an older price is not a
baseline.

**RI13 — The snapshot's record.** The automatic route builds `prices` from the updater's result and the assets it
then reads; only assets with `quantity > 0` count.

| `status` | When |
| --- | --- |
| `none` | no asset is due an automatic price (`shouldUpdatePrice` and `autoUpdatePrice !== false`) |
| `fresh` | every one refreshed |
| `partial` | `failed` is not empty |
| `failed` | `updateUserAssetPrices` threw: `failed` is empty because nothing is known, the status says it |

`oldest` = the market-priced asset (`hasMarketPrice`, auto-update or not) with the earliest `lastPriceUpdate`, or
`null` without one. The manual writer writes no `prices`: its figures are declared, not priced. Absent ≠ `fresh`
(DESIGN → The Absence-Has-Three-Names Rule).

**RI14 — A month «has a price warning»** (`describeSnapshotPrices` in `lib/utils/snapshotDocument.ts`, pure) when
`status` is `partial` or `failed`, or `anomalies` is not empty, or `oldest.at` is more than 7 days before the
capture instant. One predicate, read by the toast and by Storico.

**RI15 — The route's response** adds `prices` to `data`; the snapshot is written in every case (the comment at
`route.ts:118-131` stands: a stale price is better than no month).

### 5.7 The client can only annotate (R3, R5 for snapshots)

**RI16 — The note.** `updateSnapshotNote` uses `updateDoc` with `{ note }` (or `deleteField()`), no `userId`, no
merge: on a month without a snapshot it fails, and the dialog's own error line says «Questo mese non ha uno
snapshot». The UI already offers notes only on existing months (`SnapshotSearchDialog` receives `snapshots`).

**RI17 — The rule.**

```
match /monthly-snapshots/{snapshotId} {
  allow read:   if canAccess(resource.data.userId);
  // Test data only, on an id of the account, never over an existing document.
  allow create: if canAccess(request.resource.data.userId)
                && request.resource.data.isDummy == true
                && snapshotId == request.resource.data.userId + '-'
                   + string(request.resource.data.year) + '-' + string(request.resource.data.month);
  // The note, and nothing else.
  allow update: if canAccess(resource.data.userId)
                && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['note']);
  allow delete: if canAccess(resource.data.userId) && resource.data.isDummy == true;
  // Versions are server-only (Admin SDK): no match, so denied.
}
```

Every real snapshot is written by the two routes and the restore (Admin SDK, which the rules do not bind). Verified
on the code: the only client writes are the note (`snapshotService.ts`), the generator
(`dummySnapshotGenerator.ts:242`) and the test-data delete (`dummyDataService.ts:92-108`, a query on
`isDummy == true`). Publishing is the owner's step after the merge (`firebase deploy --only firestore:rules`), in
either order with the code — except that the generator must already use RI18, or it fails on existing months.

**RI18 — The generator.** It builds with `buildSnapshotDocument` (`writtenBy: 'dummy'`, `isDummy: true`), writes
with `setDoc` and **no merge**, and skips every month whose id is among the snapshots it has just read for the
account. Its modal says how many months it skipped.

### 5.8 What the user sees

Italian, as on screen. Sketches «oggi / proposta» for the four surfaces: the page linked from the thread
(WORKFLOW § 1.8).

| Where | When | Text |
| --- | --- | --- |
| Panoramica, toast after «Crea snapshot» | no warning | as today («Snapshot creato / aggiornato con successo») |
| same, `toast.warning` | `partial` | «Snapshot aggiornato. 2 prezzi non aggiornati: VWCE, BTP-30: valgono gli ultimi noti.» (one: «1 prezzo non aggiornato: VWCE: vale l'ultimo noto.»; more than three tickers: the first three «e altri N») |
| same | `failed` | «Snapshot aggiornato con i prezzi già salvati: l'aggiornamento non è riuscito.» |
| same | anomaly | «Snapshot aggiornato. Il prezzo di SWDA è cambiato del +9.900% dall'ultimo: controllalo in Patrimonio.» |
| Storico › Dettaglio, the month's reading (`describeMonthBreakdown`), one more sentence | RI14 true | «Quel giorno 2 prezzi non si sono aggiornati (VWCE, BTP-30): il mese usa gli ultimi noti.» · «Quel giorno l'aggiornamento dei prezzi non è riuscito: il mese usa quelli già salvati.» · «Il prezzo di SWDA era cambiato del +9.900% in un giorno.» · «Il prezzo più vecchio, quello di XYZ, era del 12 ottobre.» |
| Storico › Dettaglio, the tile's footer (`TileMethodNote`) | `writtenBy` present | «Scritto dall'aggiornamento automatico il 31 ottobre alle 19:02.» · «Scritto con «Crea snapshot» il 31 ottobre alle 23:20.» · «Inserito a mano il 3 novembre alle 10:15.» · absent: no footer |
| Manual-snapshot dialog, the reading | the chosen month has a snapshot | «Ottobre 2026 ha già uno snapshot, scritto dall'aggiornamento automatico il 31 ottobre alle 19:02. Se lo sostituisci, quella versione resta recuperabile da qui.» — the primary button reads «Sostituisci» and sends `replace: true` |
| same, a row under the period | the chosen month has `previous` | «Versione precedente: 31 ottobre, 19:02.» + button «Ripristina» |
| toast after a replacement | — | «Snapshot di ottobre 2026 sostituito.» with the action «Annulla» (calls restore) |

The dialog knows the existing months from the snapshots the page already holds (no new read); the 409 of RI9 is the
server's guard for a stale page, shown as the same reading. Times are Italian (`dateHelpers.ts`). The Storico
verdict is untouched: it tells the growth since the first snapshot, and one stale price is not its story (D-SN7).

### 5.9 The five other routes (A5)

Each body goes through `parseOr400` with a strict schema in `lib/server/validation.ts`, before any read or call.

| Route | Schema |
| --- | --- |
| `POST hall-of-fame/recalculate` | `{ userId: string }` |
| `POST prices/update` | `{ userId: string }` |
| `DELETE assets/[assetId]` | `{ userId: string }`; the path's `assetId` a non-empty string ≤ 200 |
| `PATCH ai/assistant/memory` | `userId`; `action` among `acceptSuggestion`, `ignoreSuggestion`, `reactivateGoal`; ids as strings ≤ 200; `preferences`, `item`, `suggestion` as objects whose known keys are typed (enums, booleans, strings ≤ 2.000) and whose unknown keys are refused — the exact key lists are read from `types/assistant.ts` at implementation |
| `DELETE ai/assistant/memory` | `{ userId, itemId?: string ≤ 200, resetAll?: boolean }` |
| `POST ai/assistant/stream` | `userId`; `mode` and `chatContext` among the `AssistantMode` / `AssistantChatContextType` values; `prompt` non-empty after trim, **≤ 8.000 characters**; `threadId` ≤ 200; `year` integer 1900–2100; `month` as `AssistantMonthSelectorValue`; `preferences` as above |

The checks these routes do by hand today (`if (!body.prompt?.trim() || !body.mode)`) go away where the schema covers
them. The order token → schema → `assertCanAccessAccount` is kept, so an unauthenticated caller still gets 401.

## 6. Test (D-T3)

Figures invented and round (WORKFLOW § 1.7). Decoys: «Fenicottero», «Ornitorinco». «Now» is fixed at
2026-11-14 12:00 Europe/Rome unless a row says otherwise.

| Id | File | Case | Expected |
| --- | --- | --- | --- |
| SD1 | `snapshotDocument.test.ts` (new) | builder, no existing document, `writtenBy: 'cron'`, `now` = T | `createdAt` = `updatedAt` = T; no `writtenByUid`; no key is `undefined` |
| SD2 | same | existing `createdAt` = T0, `note: 'Ornitorinco'`, `previous` set; `writtenBy: 'button'`, uid `u1`, `now` = T | `createdAt` = T0, `updatedAt` = T, the note and `previous` kept, `writtenByUid: 'u1'` |
| SD3 | same | manual input, classes 6.000 + 4.000, total 10.000 | `assetAllocation` 60 and 40; no `pension`, no `fireNetWorth`, no `prices` |
| SD4 | same | `snapshotCapturedAt`: `updatedAt` present; only `createdAt` | the first; the second |
| SD5 | same | `describeSnapshotPrices` on `fresh`, `partial`, `failed`, one anomaly, `oldest` 8 days before capture, `oldest` 7 days before, `prices` absent | warning: no, yes, yes, yes, yes, no, no — and the exact sentences of § 5.8 |
| SR1 | `apiAuthRoutes.test.ts` | automatic route, cron secret, body with `year: 2024, month: 3` (**closed month**) | 400, the price updater not called, zero writes |
| SR2 | same | automatic route, cron secret, existing document with `createdAt` = T0 | written `createdAt` = T0, `updatedAt` = now, `writtenBy: 'cron'`, no `writtenByUid` |
| SR3 | same | the same with a token (uid `u1`) | `writtenBy: 'button'`, `writtenByUid: 'u1'` |
| SR4 | same | updater returns `failures: [{ ticker: 'FENI', reason: 'quote' }]` | the document has `prices.status: 'partial'` and that row; the response too; 200 |
| SR5 | same | updater throws | `prices.status: 'failed'`, document written |
| SR6 | same (replaces «out-of-range month», `:727`) | `month: 13` | 400 (now by strictness) |
| SM1 (P7) | `manualSnapshotRoute.test.ts` (new) | `month: 1.5`, `totalNetWorth: 'abc'`, lists for numbers — one case each | 400, zero writes |
| SM2 | same | total 10.000, classes summing 9.000 · liquid 7.000 + illiquid 2.000 | 400 each |
| SM3 | same | December 2026 (future) | 400 |
| SM4 | same | a free closed month, coherent figures | 200; `writtenBy: 'manual'`, the uid, `assetAllocation` derived |
| SM5 | same | **an existing closed month, no `replace`** | 409 with `existing.writtenBy`; zero writes |
| SM6 | same | the same with `replace: true`; the existing one has total 10.000 and note «Fenicottero» | 200; one version document equal to the old one; the new one has `previous.versionId`, the note kept |
| SM7 | same | no token · a stranger's token | 401 · 403 |
| RS1 | `snapshotRestoreRoute.test.ts` (new) | after SM6 (old 10.000, new 12.000) | the document reads 10.000 with the old `writtenBy` and `updatedAt`; a second version holds the 12.000 one |
| RS2 | same | restore again | 12.000 back |
| RS3 | same | no `previous` · a stranger | 404 · 403, zero writes |
| PU1 | `priceUpdater.test.ts` (new) | stored 100 two days ago, quote 131 · quote 129 · quote 1 (÷100) | anomaly +31% · none · anomaly −99%; the price written in all three |
| PU2 | same | stored 100 **ten** days ago, quote 200 · stored in USD, quote in EUR | no anomaly |
| PU3 | same | no quote · `convertToEur` throws · the update throws | reasons `quote`, `fx`, `write` |
| SN1 | `snapshotService.test.ts` | `updateSnapshotNote` | calls `updateDoc` with `{ note }` only; an empty note sends `deleteField()` |
| DG1 | `dummySnapshotGenerator.test.ts` (new) | twelve months asked, two already hold a real snapshot | ten writes, none on the two; each `isDummy` and `writtenBy: 'dummy'` |
| AV1 | `serverValidation.test.ts` + the routes' tests | each schema of § 5.9: one valid body, one with a wrong type, one with an unknown key; `prompt` of 8.001 characters | 200-path, 400, 400; 400 |

SR1, SM1, SM5 and SR4 are seen red on `main`'s code before the commit (the card's three: a closed month's rewrite
refused, a failed price recorded, the manual schema). F02's table test, when it is on `main`, gains the restore
route.

**Not automated here.** RI17 (the rule): the emulator probe of § 7 CA6, then F11's suite. The four surfaces of
§ 5.8 in the browser: § 7 CA7.

## 7. Criteri di accettazione

- **CA1** Every test of § 6 green; the four named ones were seen red first.
- **CA2** Reference values. (a) An existing October 2026 at 10.000 written by the cron on 31/10 19:02, replaced by
  hand with 12.000 on 03/11 10:15: the document reads 12.000, `writtenBy: 'manual'`; its version reads 10.000,
  `writtenBy: 'cron'`, `updatedAt` 31/10 19:02. After «Ripristina»: 10.000, `cron`, 31/10 19:02 — field for field
  the first document plus `previous`. (b) Stored price 100 two days old, quote 131: `changePct` = 31, anomaly; quote
  129: none. (c) Classes 6.000 and 4.000 on 10.000: allocation 60% and 40%.
- **CA3** `npx vitest run` green under `TZ=Europe/Rome` and `TZ=UTC`; `npx tsc --noEmit` clean;
  `npx eslint app components lib types e2e scripts __tests__` clean.
- **CA4** The current month's snapshot on `main`'s data is rewritten by the cron with no visible change in
  Panoramica, Storico, Rendimenti and Hall of Fame: the new fields are additive, and a legacy document (no
  `writtenBy`, no `prices`) renders exactly as today, without footer and without warning.
- **CA5** On the Mac, emulators up: `e2e/history{,.mobile}.spec.ts`, `e2e/dashboard*.spec.ts` and the specs that
  seed snapshots stay green with the new rules loaded. The seeds write through the emulator's owner bearer, which
  bypasses the rules.
- **CA6** On the Mac, emulators up, as a throwaway probe: with the account's own client token, a `setDoc` of a real
  snapshot, an `updateDoc` of `totalNetWorth` and a `deleteDoc` of a real snapshot are refused
  (`permission-denied`); an `updateDoc` of `note` and the three test-data writes succeed. The review's P7 answers 400.
- **CA7** In the browser on the Mac (guided, WORKFLOW § 2), base fixture plus one planted failure and one planted
  replacement: the four surfaces of § 5.8 show their texts; the manual dialog replaces and restores.
- **CA8** Docs per WORKFLOW: `doc/guide/storico.md` (the document's two natures become three: recomputed,
  user-authored, authorship; the builder; the note cannot create), `doc/guide/server.md` (strict schemas; the
  automatic route writes the current month only; the restore route), `doc/guide/dialog.md` (the replacement step),
  AGENTS.md § Firestore Writes, CLAUDE.md. `SNAPSHOT_USER_AUTHORED_FIELDS` stays `['note']`.

## 8. Decisioni

Proposed by this spec on 2026-11-14; state in the last column. The five put to the owner (D-SN3, D-SN5, D-SN6,
D-SN7, D-SN12) were confirmed as recommended on 2026-11-15; the others apply the card or follow from those, were
shown with them and not objected to.

| Id | Decision | Alternatives rejected, and why | State |
| --- | --- | --- | --- |
| **D-SN1** | Authorship as `writtenBy` (`cron`, `button`, `manual`, `dummy`), `writtenByUid`, `updatedAt`; `createdAt` frozen at the first write (C1, card F07). One field serves C1's «who» and M7's «source». | *A separate `source` field next to `writtenBy`*: two names for one fact. *A log collection of writes*: answers «who» only by a join, and the question is asked on the document. | applies the card |
| **D-SN2** | The automatic route refuses `year`/`month` (strict schema, 400) instead of ignoring them. | *Drop them silently*: a caller that names March 2024 would get the current month rewritten and a 200. *Keep them for the cron's use*: the cron never sends them. | applies the card |
| **D-SN3** | A closed month is written only by hand; replacing an existing month needs an explicit `replace`, and the replaced version is kept in a `versions` sub-collection, restorable from the dialog. | *(a) Refuse any rewrite of a closed month*: the manual snapshot exists to correct history (a wrong balance found a week later); it would force a delete-and-recreate that does not exist. *(b) A `previous` field holding the old document inside the new one*: every reader downloads it (Storico reads all snapshots), it keeps one level only, and it doubles a document that already carries `byAsset`. *(c) Archive every rewrite, the cron's too*: thirty versions a month of a document that is meant to be rewritten. | **taken** (owner, 2026-11-15) |
| **D-SN4** | Undo is a swap (RI10): restoring archives what it replaces. | *A one-way restore that deletes the version*: an undo that cannot be undone, on the one collection with no backup (free plan, no PITR). | follows D-SN3 |
| **D-SN5** | A price that jumps ≥ 30% in a day is written and flagged, not held back. | *Hold the old price and count it as a failure*: a real fall (a 3× ETF in a crash, a crypto) would never be accepted — tomorrow's quote is again 30% from the stale one. *Flag at 10%*: ordinary days of single stocks and crypto would cry wolf. *No check*: C4's ×100 case stays silent. | **taken** (owner, 2026-11-15) |
| **D-SN6** | The client can only write a note; real snapshots are written by the server; test data only on free ids (RI17). Decided here because F11 defers R3 to this spec. | *R3's lighter form (bind the id to `userId` at creation)*: closes the squatting of a future month, leaves every member's client free to rewrite any closed month — the thing this spec protects. *Leave it to F11*: the API would be closed and the client door open until then. | **taken** (owner, 2026-11-15) |
| **D-SN7** | The price warning shows in two places: the toast after «Crea snapshot» and the month's reading in Storico › Dettaglio. The Storico verdict and the Panoramica verdict are untouched. | *In the Storico verdict* (the review's suggestion): the verdict is the growth since the first snapshot; a stale price of one month is not what the page answers, and it would stay there for a month. *A badge on the chart*: a new visual vocabulary for a rare fact. | **taken** (owner, 2026-11-15) |
| **D-SN8** | The rule ships with an emulator probe (CA6); its automated test arrives with F11's suite. Declared exception to D-T3, the same as F02's D-SI6. | *Add `@firebase/rules-unit-testing` here*: it is F11's whole job. | follows D-SI6 |
| **D-SN9** | A future month is refused by the manual route; the current month is allowed. | *Refuse the current month too*: an account with no market-priced asset gets no snapshot from the cron («No assets found» aside, a cash-only account does, but a user who tracks totals by hand has no other door). | proposed |
| **D-SN10** | No backfill of the existing documents: absent fields read as «not recorded». | *Stamp every old document `writtenBy: 'cron'`*: an invented fact — October 2026 was the button. | proposed |
| **D-SN11** | The stream prompt is capped at 8.000 characters here; F04 may lower it with the limits of A3. | *No cap until F04*: a schema that accepts any length checks only the type. | proposed |
| **D-SN12** | **The month that closes at 19:00**: option A of § 9 P1 — the recap email and the vault's `dati/` are built by the cron of the 1st on the month that closed. Implemented with the cron card, not in this PR. | B (re-run on rewrite), C (say it, re-send by hand), D (leave it): § 9 P1, with their costs. | **taken** (owner, 2026-11-15) |

## 9. Punti aperti

**P1 — The month closes at 19:00** (D-SN12, decided: option A). On the last day the cron takes the photo at 19:00 Italian time and, in
the same run, builds the recap email and the vault's `dati/` on it. What is typed that evening enters the month
only if «Crea snapshot» is pressed before midnight — and then Storico holds one October, the email and the wiki
another (31/10/2026). Whatever is chosen is implemented with the cron card («Fable minori · Cron serale», with C5's
«already sent» marker), not in F07's PR; F07 supplies `writtenBy` and `updatedAt`, which every option reads.

| Option | What happens | Cost |
| --- | --- | --- |
| **A — Recap and wiki the day after** (**chosen**, 2026-11-15) | The cron of the 1st, at 19:00, sends the recap and writes `dati/` for the month that closed, reading its final snapshot and its final cashflow. The 19:00 photo of the last day stays; the button before midnight still improves it. | The recap arrives a day later. One email, one AI comment, nothing to re-run. Quarterly, half-year and yearly move the same way. |
| B — Re-run on rewrite (the coordinator's lean) | When the last day's snapshot is rewritten after the cron, the email and the export are built again. | A second email and a second paid comment per press; the button's request must outlive its response (minutes of AI); needs C5 to tell a correction from a duplicate. A row typed at 23:50 without pressing the button is still missed. |
| C — Say it, re-send by hand | The toast after a late «Crea snapshot» says the recap was built on the 19:00 figures; «Invia ora» in Impostazioni already re-sends, `npm run vault:export` rewrites `dati/`. | Nothing automatic; the wiki step stays a Mac command. |
| D — Leave it | Known and documented. | Two Octobers each time. |

**P2 — F08.** If F08's PR lands first with `createdAt`, this PR changes that read to `snapshotCapturedAt` (RI4) and
amends § 5.4 of its dossier; if this lands first, F08 is implemented on the helper.

**P3 — The recap email and the PDF** read the snapshot and do not say «built on stale prices». A line in the email's
data block is a small follow-up once `prices` exists.

**P4 — Versions outlive their snapshot.** Deleting test data deletes only `isDummy` documents, which never have
versions; a future «delete my account» must delete the sub-collection too. No such feature exists today.

**P5 — Publishing the rules** is the owner's step after the merge; the PR says so in its first lines.
