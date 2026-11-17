/**
 * Firestore rules suite (F11, doc/sicurezza/S3-regole.md). Runs against the emulator through
 * `npm run test:rules`; figures and names are invented (WORKFLOW § 1.7).
 *
 * Actors: A owner, B an allowed stranger, M a delegated member of A, C an Auth user NOT on the
 * allowed-users list (never activated by the server).
 */
import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { Timestamp, deleteField, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let env: RulesTestEnvironment
const A = 'uid-alice'
const B = 'uid-bruno'
const M = 'uid-marta'
const C = 'uid-carlo'

const db = (uid: string) => env.authenticatedContext(uid).firestore()
const now = () => Timestamp.fromDate(new Date('2026-06-15T12:00:00Z'))

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-net-worth',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
afterAll(async () => { await env?.cleanup() })

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const s = ctx.firestore()
    for (const uid of [A, B, M]) await setDoc(doc(s, 'allowed-users', uid), { allowedAt: now() })
    await setDoc(doc(s, 'account-access', A), { memberUids: [M] })
    await setDoc(doc(s, 'assets', 'asset-a'), { userId: A, name: 'fenicottero', quantity: 10 })
    await setDoc(doc(s, 'expenses', 'exp-a'), { userId: A, amount: -50, date: now(), notes: 'ornitorinco' })
    await setDoc(doc(s, 'monthly-snapshots', `${A}-2026-5`), { userId: A, year: 2026, month: 5, totalNetWorth: 1000 })
    await setDoc(doc(s, 'monthly-snapshots', `${A}-2026-4`), { userId: A, year: 2026, month: 4, isDummy: true })
  })
})

describe('T1 isolation: a stranger never touches an owner\'s documents', () => {
  it('owner creates, stranger cannot read/list/update/delete/create-for/steal', async () => {
    await assertSucceeds(setDoc(doc(db(A), 'assets', 'asset-a2'), { userId: A, name: 'x' }))
    await assertFails(getDoc(doc(db(B), 'assets', 'asset-a')))
    await assertFails(getDocs(query(collection(db(B), 'assets'), where('userId', '==', A))))
    await assertFails(updateDoc(doc(db(B), 'assets', 'asset-a'), { quantity: 0 }))
    await assertFails(deleteDoc(doc(db(B), 'assets', 'asset-a')))
    await assertFails(addDoc(collection(db(B), 'assets'), { userId: A, name: 'intruso' }))
    await assertFails(updateDoc(doc(db(A), 'assets', 'asset-a'), { userId: B }))
  })
  it('the owner reads and queries her own', async () => {
    await assertSucceeds(getDoc(doc(db(A), 'assets', 'asset-a')))
    await assertSucceeds(getDocs(query(collection(db(A), 'assets'), where('userId', '==', A))))
  })
})

describe('R2: the settings document cannot be squatted', () => {
  it('a stranger cannot create assetAllocationTargets/{A}, even stamping his own uid', async () => {
    await assertFails(setDoc(doc(db(B), 'assetAllocationTargets', A), { userId: B, monthlyEmailRecipients: ['b@example.com'] }))
    await assertFails(setDoc(doc(db(B), 'assetAllocationTargets', A), { userId: A }))
  })
  it('the owner creates and overwrites hers with userId = id; a wrong userId is refused', async () => {
    await assertSucceeds(setDoc(doc(db(A), 'assetAllocationTargets', A), { userId: A, targets: {} }))
    await assertSucceeds(setDoc(doc(db(A), 'assetAllocationTargets', A), { userId: A, targets: { x: 1 } }))
    await assertFails(setDoc(doc(db(A), 'assetAllocationTargets', A), { userId: B }))
    await assertSucceeds(deleteDoc(doc(db(A), 'assetAllocationTargets', A)))
  })
  it('budgets and goalBasedInvesting keep refusing the same move', async () => {
    await assertFails(setDoc(doc(db(B), 'budgets', A), { userId: B }))
    await assertFails(setDoc(doc(db(B), 'goalBasedInvesting', A), { userId: B }))
  })
})

describe('R3: monthly-snapshots, the client writes the note and test data only', () => {
  it('no real snapshot from the client, nor an id not bound to the field', async () => {
    await assertFails(setDoc(doc(db(A), 'monthly-snapshots', `${A}-2027-1`), { userId: A, year: 2027, month: 1, totalNetWorth: 1 }))
    await assertFails(setDoc(doc(db(B), 'monthly-snapshots', `${A}-2027-1`), { userId: B, year: 2027, month: 1, isDummy: true }))
    await assertFails(setDoc(doc(db(A), 'monthly-snapshots', `${A}-2027-2`), { userId: A, year: 2027, month: 1, isDummy: true }))
  })
  it('a test snapshot on a free id is fine, never over an existing document', async () => {
    await assertSucceeds(setDoc(doc(db(A), 'monthly-snapshots', `${A}-2027-3`), { userId: A, year: 2027, month: 3, isDummy: true }))
    await assertFails(setDoc(doc(db(A), 'monthly-snapshots', `${A}-2026-5`), { userId: A, year: 2026, month: 5, isDummy: true }))
  })
  it('the note passes, any other field does not; a free id cannot take a bare note', async () => {
    await assertSucceeds(updateDoc(doc(db(A), 'monthly-snapshots', `${A}-2026-5`), { note: 'ornitorinco' }))
    await assertFails(updateDoc(doc(db(A), 'monthly-snapshots', `${A}-2026-5`), { totalNetWorth: 1 }))
    await assertFails(updateDoc(doc(db(A), 'monthly-snapshots', `${A}-2026-5`), { note: 'x', totalNetWorth: 1 }))
    await assertFails(setDoc(doc(db(A), 'monthly-snapshots', `${A}-2027-2`), { note: 'x', userId: A }, { merge: true }))
    await assertFails(updateDoc(doc(db(B), 'monthly-snapshots', `${A}-2026-5`), { note: 'x' }))
  })
  it('only test snapshots can be deleted by the client', async () => {
    await assertSucceeds(deleteDoc(doc(db(A), 'monthly-snapshots', `${A}-2026-4`)))
    await assertFails(deleteDoc(doc(db(A), 'monthly-snapshots', `${A}-2026-5`)))
  })
  it('versions/ is server-only', async () => {
    await assertFails(setDoc(doc(db(A), 'monthly-snapshots', `${A}-2026-5`, 'versions', 'v1'), { x: 1 }))
    await assertFails(getDoc(doc(db(A), 'monthly-snapshots', `${A}-2026-5`, 'versions', 'v1')))
  })
})

describe('R4: userId can never be removed or changed on update', () => {
  it('deleteField on userId is refused (owner keeps the document reachable)', async () => {
    await assertFails(updateDoc(doc(db(A), 'expenses', 'exp-a'), { userId: deleteField() }))
    await assertSucceeds(getDoc(doc(db(A), 'expenses', 'exp-a')))
  })
  it.each(['assets', 'expenseCategories', 'pensionContributions', 'accumulationPlans', 'costCenters', 'expenses'])(
    '%s: partial updates pass, handing the document away or dropping userId does not',
    async (col) => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), col, 'doc-1'), { userId: A, amount: -1, date: now(), name: 'n' })
      })
      await assertSucceeds(updateDoc(doc(db(A), col, 'doc-1'), { name: 'nuovo' }))
      await assertFails(updateDoc(doc(db(A), col, 'doc-1'), { userId: B }))
      await assertFails(updateDoc(doc(db(A), col, 'doc-1'), { userId: deleteField() }))
    },
  )
})

describe('R5: minimal shape on expenses', () => {
  it('a well-formed expense passes', async () => {
    await assertSucceeds(addDoc(collection(db(A), 'expenses'), { userId: A, amount: -12.5, date: now(), notes: 'caffè' }))
    await assertSucceeds(addDoc(collection(db(A), 'expenses'), { userId: A, amount: 1, date: now(), notes: null }))
  })
  it('a wrong type or a huge note is refused, on create and update', async () => {
    await assertFails(addDoc(collection(db(A), 'expenses'), { userId: A, amount: { x: 1 }, date: now() }))
    await assertFails(addDoc(collection(db(A), 'expenses'), { userId: A, amount: 'abc', date: now() }))
    await assertFails(addDoc(collection(db(A), 'expenses'), { userId: A, amount: 1, date: 'ieri' }))
    await assertFails(addDoc(collection(db(A), 'expenses'), { userId: A, amount: 1, date: now(), notes: 'x'.repeat(200_000) }))
    await assertFails(updateDoc(doc(db(A), 'expenses', 'exp-a'), { amount: 'abc' }))
    await assertSucceeds(updateDoc(doc(db(A), 'expenses', 'exp-a'), { amount: -60 }))
  })
})

describe('allowed-users: Auth is not enough (S2a)', () => {
  it('an Auth user off the list reads and writes nothing, not even his own', async () => {
    await assertFails(setDoc(doc(db(C), 'users', C), { email: 'c@example.com' }))
    await assertFails(setDoc(doc(db(C), 'assetAllocationTargets', C), { userId: C }))
    await assertFails(addDoc(collection(db(C), 'expenses'), { userId: C, amount: -1, date: now() }))
    await assertFails(setDoc(doc(db(C), 'userPreferences', C), { colorTheme: 'x' }))
    await assertFails(getDoc(doc(db(C), 'benchmark-cache', '60-40')))
  })
  it('an allowed user reads the global caches; nobody writes them', async () => {
    await assertSucceeds(getDoc(doc(db(A), 'benchmark-cache', '60-40')))
    await assertSucceeds(getDoc(doc(db(A), 'fx-rate-cache', 'usd-eur')))
    await assertSucceeds(getDoc(doc(db(A), 'ecb-rate-cache', 'deposit-rate')))
    await assertFails(setDoc(doc(db(A), 'benchmark-cache', '60-40'), { x: 1 }))
  })
  it('allowed-users: get only on one\'s own uid, no list, no write', async () => {
    await assertSucceeds(getDoc(doc(db(A), 'allowed-users', A)))
    await assertSucceeds(getDoc(doc(db(C), 'allowed-users', C)))
    await assertFails(getDoc(doc(db(A), 'allowed-users', B)))
    await assertFails(getDocs(collection(db(A), 'allowed-users')))
    await assertFails(setDoc(doc(db(C), 'allowed-users', C), { allowedAt: now() }))
    await assertFails(setDoc(doc(db(A), 'allowed-users', A), { allowedAt: now() }))
    await assertFails(deleteDoc(doc(db(A), 'allowed-users', A)))
  })
  it('an unauthenticated client gets nothing', async () => {
    const anon = env.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(anon, 'assets', 'asset-a')))
    await assertFails(getDoc(doc(anon, 'allowed-users', A)))
  })
})

describe('shared account: a delegated member', () => {
  it('reads and writes the account\'s data, as a full co-owner', async () => {
    await assertSucceeds(getDoc(doc(db(M), 'assets', 'asset-a')))
    await assertSucceeds(addDoc(collection(db(M), 'expenses'), { userId: A, amount: -5, date: now() }))
    await assertSucceeds(updateDoc(doc(db(M), 'assets', 'asset-a'), { quantity: 11 }))
    await assertSucceeds(deleteDoc(doc(db(M), 'assets', 'asset-a')))
  })
  it('cannot read the owner\'s profile or preferences, nor edit the grant', async () => {
    await assertFails(getDoc(doc(db(M), 'users', A)))
    await assertFails(getDoc(doc(db(M), 'userPreferences', A)))
    await assertFails(updateDoc(doc(db(M), 'account-access', A), { memberUids: [M, B] }))
  })
  it('a non-member cannot see the grant, a member and the owner can', async () => {
    await assertFails(getDoc(doc(db(B), 'account-access', A)))
    await assertSucceeds(getDoc(doc(db(M), 'account-access', A)))
    await assertSucceeds(getDoc(doc(db(A), 'account-access', A)))
  })
  it('a member removed from the grant loses access', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(doc(ctx.firestore(), 'account-access', A), { memberUids: [] }) })
    await assertFails(getDoc(doc(db(M), 'assets', 'asset-a')))
  })
})

describe('server-only collections', () => {
  it('the client never writes the ledger, dividends, caches or the budget history', async () => {
    await assertFails(addDoc(collection(db(A), 'assetTransactions'), { userId: A }))
    await assertFails(setDoc(doc(db(A), 'assetTransactionsMeta', A), { userId: A }))
    await assertFails(setDoc(doc(db(A), 'exposure-cache', A), { userId: A }))
    await assertFails(setDoc(doc(db(A), 'budgetHistory', A, 'months', '2026-10'), { x: 1 }))
    await assertFails(addDoc(collection(db(A), 'dividends'), { userId: A, expenseId: 'exp-b' }))
  })
  it('reads: own ledger and own dividends yes, someone else\'s no', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'assetTransactions', 't1'), { userId: A })
      await setDoc(doc(ctx.firestore(), 'dividends', 'd1'), { userId: A })
    })
    await assertSucceeds(getDoc(doc(db(A), 'assetTransactions', 't1')))
    await assertSucceeds(getDoc(doc(db(M), 'dividends', 'd1')))
    await assertFails(getDoc(doc(db(B), 'assetTransactions', 't1')))
    await assertFails(getDoc(doc(db(B), 'dividends', 'd1')))
  })
  it('collections with no rule are closed (assistantThreads)', async () => {
    await assertFails(getDocs(query(collection(db(A), 'assistantThreads'), where('userId', '==', A))))
    await assertFails(setDoc(doc(db(A), 'assistantThreads', 't'), { userId: A }))
  })
})

describe('per-account documents keyed by uid', () => {
  it.each(['hall-of-fame', 'goalBasedInvesting', 'budgets', 'performance-cache', 'modelPortfolios'])(
    '%s: owner and member write with userId = id, a stranger and a wrong userId cannot',
    async (col) => {
      await assertSucceeds(setDoc(doc(db(A), col, A), { userId: A }))
      await assertSucceeds(setDoc(doc(db(M), col, A), { userId: A }))
      await assertFails(setDoc(doc(db(A), col, A), { userId: B }))
      await assertFails(setDoc(doc(db(B), col, A), { userId: B }))
      await assertFails(getDoc(doc(db(B), col, A)))
    },
  )
  it('users and userPreferences are the viewer\'s own', async () => {
    await assertSucceeds(setDoc(doc(db(A), 'users', A), { email: 'a@example.com' }))
    await assertFails(getDoc(doc(db(B), 'users', A)))
    await assertSucceeds(setDoc(doc(db(A), 'userPreferences', A), { colorTheme: 'x' }))
    await assertFails(setDoc(doc(db(B), 'userPreferences', A), { colorTheme: 'x' }))
  })
})
