/**
 * Deterministic Previdenza fixture for the Playwright suite.
 *
 * Run via `npm run e2e:seed` (which points the Admin SDK at the emulators — NEVER production).
 * Playwright's global setup runs it before every suite, so the E2E assertions can name exact
 * figures instead of asserting "some number is present".
 *
 * WHY A DEDICATED FIXTURE, not `emulators:seed` + `emulators:pension`
 * The base seed's fondo pensione is deliberately tracked the OLD way (an `etf` with the euro value
 * in `quantity`), because it exists to exercise the conversion path — on `/dashboard/pension` it
 * renders the empty state. `emulators:pension` does convert it, but it is an *exercise* script with
 * 30 assertions of its own: pinning UI tests to its end state would make a failure there look like
 * a UI regression here. This file builds only what the Previdenza view reads, and nothing else.
 *
 * Idempotent: deterministic `e2e-*` doc ids are overwritten on every run, and the Auth user is
 * created-or-updated. It layers ON TOP of `emulators:seed` (same `test-user-1`) without touching
 * any `seed-*` document.
 *
 * The figures below are chosen, not arbitrary — see the comment on `VALUE_SERIES`.
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    'Refusing to seed: FIRESTORE_EMULATOR_HOST is not set. Run this via `npm run e2e:seed` ' +
      '(with the emulators started via `npm run emulators`).'
  );
  process.exit(1);
}

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-net-worth';
const TEST_UID = 'test-user-1';
const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'test1234';

const FUND_ID = 'e2e-pension-fund';
const FUND_NAME = 'Fondo Pensione E2E';
const MEMBER_ID = 'e2e-member-1';
const MEMBER_NAME = 'Marco';

/** The tax years the year axis must offer: the current one plus one older. */
export const CURRENT_YEAR = 2026;
export const PREVIOUS_YEAR = 2025;

/**
 * Monthly fund values, consecutive months so the annualisation is honest (`computePensionReturn`
 * annualises with `12 / monthsCovered`, which assumes monthly points).
 *
 * Two properties are load-bearing for the assertions:
 *  - July's jump is EXACTLY the 821,01 € of contributions recorded that month, so the TWR neutralises
 *    it and the "Guadagno di mercato" excludes it;
 *  - the resulting annualised return stays well under `SUSPICIOUS_ANNUAL_RETURN` (20%), so the card
 *    shows a percentage instead of the coverage warning, and well clear of `hasNoMovement`.
 */
const VALUE_SERIES: [month: number, value: number][] = [
  [1, 28_000],
  [2, 28_150],
  [3, 28_300],
  [4, 28_500],
  [5, 28_650],
  [6, 28_800],
  [7, 29_621.01],
  [8, 29_800],
];

const FUND_VALUE = VALUE_SERIES[VALUE_SERIES.length - 1][1];

/**
 * Contributions. The three June ones are dated 30/06 but RECORDED in July — the real shape that
 * `valueEffectMonth` exists for, and the one that makes July's value jump attributable to
 * contributions rather than to the market.
 */
const CONTRIBUTIONS = [
  {
    id: 'e2e-contrib-2025-voluntary',
    source: 'voluntary',
    amount: 1_000,
    date: new Date(PREVIOUS_YEAR, 10, 15),
    createdAt: new Date(PREVIOUS_YEAR, 10, 15),
    taxYear: PREVIOUS_YEAR,
  },
  {
    id: 'e2e-contrib-2026-tfr',
    source: 'tfr',
    amount: 534.88,
    date: new Date(CURRENT_YEAR, 5, 30),
    createdAt: new Date(CURRENT_YEAR, 6, 5),
    taxYear: CURRENT_YEAR,
  },
  {
    id: 'e2e-contrib-2026-employer',
    source: 'employer',
    amount: 134.11,
    date: new Date(CURRENT_YEAR, 5, 30),
    createdAt: new Date(CURRENT_YEAR, 6, 5),
    taxYear: CURRENT_YEAR,
  },
  {
    id: 'e2e-contrib-2026-voluntary',
    source: 'voluntary',
    amount: 152.02,
    date: new Date(CURRENT_YEAR, 5, 30),
    createdAt: new Date(CURRENT_YEAR, 6, 5),
    taxYear: CURRENT_YEAR,
  },
] as const;

const app = getApps()[0] ?? initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(app);
const auth = getAuth(app);
const now = new Date();

async function seedAuthUser(): Promise<void> {
  try {
    await auth.createUser({ uid: TEST_UID, email: TEST_EMAIL, password: TEST_PASSWORD });
  } catch (error: unknown) {
    const code = (error as { code?: string }).code;
    if (code !== 'auth/uid-already-exists' && code !== 'auth/email-already-exists') throw error;
    await auth.updateUser(TEST_UID, { email: TEST_EMAIL, password: TEST_PASSWORD });
  }
  console.info(`  ✓ Auth user ${TEST_EMAIL}`);
}

/**
 * A `pensionFund` is manually valued, and its euro value lives in `quantity` AT PRICE 1 — exactly
 * like a cash balance (see the VALUE EFFECT note in `pensionContributionService.ts`). `AssetDialog`
 * builds it the same way: the field labelled "Valore attuale" writes `quantity`, and `currentPrice`
 * stays at its default of 1.
 *
 * Inverting the two (quantity 1 at price 29.800) still renders the right total through
 * `calculateAssetValue`, so it looks correct until the first contribution — which adds its amount to
 * `quantity`, turning 1 into 201 and the displayed value into 5.989.800 €.
 */
async function seedFund(): Promise<void> {
  await db.collection('assets').doc(FUND_ID).set({
    userId: TEST_UID,
    name: FUND_NAME,
    ticker: '',
    type: 'pensionFund',
    assetClass: 'equity',
    quantity: FUND_VALUE,
    currentPrice: 1,
    currency: 'EUR',
    isLiquid: false,
    allocationRole: 'frozen',
    pensionFundDetails: { familyMemberId: MEMBER_ID },
    lastPriceUpdate: now,
    createdAt: now,
    updatedAt: now,
  });
  console.info(`  ✓ ${FUND_NAME} (${FUND_VALUE} €)`);
}

/**
 * Merged, not overwritten: the base seed owns `targets`/`laborIncomeCategoryIds` in this same
 * document and the Previdenza fixture must not wipe them.
 *
 * `pensionReturnStartMonth` is deliberately left unset — the window then starts at the first
 * recorded contribution, which is the default path most users are on.
 */
async function seedFamilyMember(): Promise<void> {
  await db
    .collection('assetAllocationTargets')
    .doc(TEST_UID)
    .set(
      {
        userId: TEST_UID,
        familyMembers: [
          {
            id: MEMBER_ID,
            name: MEMBER_NAME,
            grossAnnualIncome: 35_000,
            isFirstEmploymentPost2007: true,
            firstEmploymentYear: 2015,
          },
        ],
      },
      { merge: true }
    );
  console.info(`  ✓ family member ${MEMBER_NAME} (RAL 35.000 €)`);
}

async function seedContributions(): Promise<void> {
  await Promise.all(
    CONTRIBUTIONS.map((contribution) =>
      db.collection('pensionContributions').doc(contribution.id).set({
        userId: TEST_UID,
        assetId: FUND_ID,
        source: contribution.source,
        amount: contribution.amount,
        date: contribution.date,
        taxYear: contribution.taxYear,
        deductible: contribution.source !== 'tfr',
        createdAt: contribution.createdAt,
      })
    )
  );
  console.info(`  ✓ ${CONTRIBUTIONS.length} contributions across ${PREVIOUS_YEAR}/${CURRENT_YEAR}`);
}

/**
 * One snapshot per month carrying the fund in `byAsset` — the only place the fund's value is frozen
 * month by month, and therefore the only input `buildPensionValueSeries` can read.
 *
 * `merge: true` for the same reason as the settings doc: the base seed writes its own snapshot for
 * the current month and this fixture only needs to contribute the fund's `byAsset` entry.
 */
async function seedSnapshots(): Promise<void> {
  await Promise.all(
    VALUE_SERIES.map(([month, value]) =>
      db
        .collection('monthly-snapshots')
        .doc(`${TEST_UID}-${CURRENT_YEAR}-${month}`)
        .set(
          {
            userId: TEST_UID,
            year: CURRENT_YEAR,
            month,
            totalNetWorth: value,
            liquidNetWorth: 0,
            illiquidNetWorth: value,
            byAssetClass: { equity: value },
            byAsset: [
              {
                assetId: FUND_ID,
                ticker: '',
                name: FUND_NAME,
                quantity: value,
                price: 1,
                totalValue: value,
              },
            ],
            assetAllocation: {},
            createdAt: new Date(CURRENT_YEAR, month - 1, 28),
          },
          { merge: true }
        )
    )
  );
  console.info(`  ✓ ${VALUE_SERIES.length} monthly snapshots with the fund in byAsset`);
}

async function main(): Promise<void> {
  console.info(`\nSeeding Previdenza E2E fixture into ${PROJECT_ID} (emulator)…\n`);
  await seedAuthUser();
  await seedFund();
  await seedFamilyMember();
  await seedContributions();
  await seedSnapshots();
  console.info('\nDone.\n');
}

main().catch((error) => {
  console.error('Pension E2E seed failed:', error);
  process.exit(1);
});
