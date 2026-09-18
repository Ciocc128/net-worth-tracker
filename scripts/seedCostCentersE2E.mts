/**
 * Deterministic Centri di Costo fixture for the Playwright suite — its OWN account.
 *
 * Run via `npm run e2e:seed:centri` (Admin SDK pointed at the emulators — NEVER production).
 * Playwright's global setup runs it before every suite.
 *
 * WHY A SEPARATE ACCOUNT (test-user-centri)
 * The tab is opt-in (`costCentersEnabled`): turning it on for the base account would add a
 * fifth tab to every Cashflow spec, and a linked expense is an ordinary expense — on the
 * Analisi account it would move every exact figure those specs assert.
 *
 * THE DATES, chosen so the page reads the same whatever day the suite runs
 * - Fenicottero: 800 € booked on January 15th of the current year, a 300 € instalment on
 *   December 31st, an ANNUAL ceiling of 1000 €. What is booked holds (800), the calendar
 *   carries it past (1100): the RISK as the page knows it — never a pace. An annual ceiling,
 *   not a monthly one: a row «later this month» does not exist on the month's last day.
 *   On December 31st itself the instalment is booked and the ceiling is crossed for real;
 *   the spec says so where it matters.
 * - Ornitorinco: 27 rows of 10 € on January 15th of the PREVIOUS year — always more than 90
 *   days ago, so always dormant; and more than one page of Movimenti (25), so «Mostra altre»
 *   is on screen for the mobile spec's 44px check. With two rows that check could not fail.
 * Fenicottero wears `chart-1` and Ornitorinco `chart-2`: a new center must open on `chart-3`.
 *
 * The names are decoy words: they appear nowhere else in any fixture, so a locator that
 * finds one has found this data.
 *
 * Idempotent: deterministic `e2e-cc-*` ids overwritten on every run. Centers a failed spec
 * left behind (a create that was never deleted) are removed first, or the free-slot
 * assertion would drift.
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    'Refusing to seed: FIRESTORE_EMULATOR_HOST is not set. Run this via `npm run e2e:seed:centri` ' +
      '(with the emulators started via `npm run emulators`).'
  );
  process.exit(1);
}

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-net-worth';
const UID = 'test-user-centri';
const EMAIL = 'centri@example.com';
const PASSWORD = 'test1234';

const CURRENT_YEAR = new Date().getFullYear();

if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();
const auth = getAuth();
const now = new Date();

const CATEGORY = { id: 'e2e-cc-cat-progetti', name: 'Progetti', type: 'variable' };

const CENTERS = [
  { id: 'e2e-cc-fenicottero', name: 'Fenicottero', color: 'chart-1', budgetAmount: 1000, budgetPeriod: 'annual' },
  { id: 'e2e-cc-ornitorinco', name: 'Ornitorinco', color: 'chart-2' },
];

const EXPENSES = [
  { id: 'e2e-cc-exp-booked', costCenterId: 'e2e-cc-fenicottero', date: new Date(CURRENT_YEAR, 0, 15), amount: -800 },
  { id: 'e2e-cc-exp-instalment', costCenterId: 'e2e-cc-fenicottero', date: new Date(CURRENT_YEAR, 11, 31), amount: -300, isInstallment: true },
  ...Array.from({ length: 27 }, (_, i) => ({
    id: `e2e-cc-exp-old-${String(i + 1).padStart(2, '0')}`,
    costCenterId: 'e2e-cc-ornitorinco',
    date: new Date(CURRENT_YEAR - 1, 0, 15),
    amount: -10,
  })),
];

async function seedAccount(): Promise<void> {
  try {
    await auth.updateUser(UID, { email: EMAIL, password: PASSWORD, emailVerified: true });
  } catch {
    await auth.createUser({ uid: UID, email: EMAIL, password: PASSWORD, emailVerified: true });
  }
  console.info(`  ✓ account ${EMAIL}`);
}

async function removeLeftovers(): Promise<void> {
  const known = new Set(CENTERS.map((center) => center.id));
  const snap = await db.collection('costCenters').where('userId', '==', UID).get();
  const strays = snap.docs.filter((doc) => !known.has(doc.id));
  await Promise.all(strays.map((doc) => doc.ref.delete()));
  if (strays.length > 0) console.info(`  ✓ removed ${strays.length} center(s) left by an earlier run`);
}

async function seedData(): Promise<void> {
  await db.collection('expenseCategories').doc(CATEGORY.id).set({ userId: UID, name: CATEGORY.name, type: CATEGORY.type, subCategories: [], createdAt: now, updatedAt: now });
  await Promise.all(
    CENTERS.map(({ id, ...center }) => db.collection('costCenters').doc(id).set({ userId: UID, ...center, archivedAt: null, createdAt: now, updatedAt: now }))
  );
  await Promise.all(
    EXPENSES.map(({ id, ...expense }) =>
      db.collection('expenses').doc(id).set({
        userId: UID,
        type: CATEGORY.type,
        categoryId: CATEGORY.id,
        categoryName: CATEGORY.name,
        currency: 'EUR',
        ...expense,
        createdAt: now,
        updatedAt: now,
      })
    )
  );
  console.info(`  ✓ ${CENTERS.length} centers, ${EXPENSES.length} linked expenses`);
}

async function seedSettings(): Promise<void> {
  // merge: a plain set would silently wipe whatever a future fixture adds to this document.
  await db.collection('assetAllocationTargets').doc(UID).set({ userId: UID, costCentersEnabled: true }, { merge: true });
  console.info('  ✓ settings (costCentersEnabled)');
}

console.info(`Seeding Centri di Costo E2E fixture for ${UID} on ${PROJECT_ID}…`);
await seedAccount();
await removeLeftovers();
await seedData();
await seedSettings();
console.info('Done.');
