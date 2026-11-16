/**
 * dividendReceiptsService — the dividends and coupons an account has received, read with the
 * CLIENT SDK for a client page.
 *
 * WHY A SECOND READER
 * `lib/services/dividendService.ts` is `server-only` (Admin SDK): importing it from a client page
 * compiles under `tsc` and dies in the browser as a Next build error («You're importing a module
 * that depends on "server-only"»), which is exactly how the Rendimenti page found out on
 * 2026-09-06. The attribution tile needs one thing from the registry — net amount, payment date
 * and instrument — so this reader returns only that, as `DividendReceipt`, and nothing a page
 * could misuse.
 *
 * Since 2026-11-15 (F08, doc/rendimenti-misura § 5.3) the receipt carries gross, tax and the synced
 * row too: Rendimenti counts a distribution GROSS, its tax as a withdrawal, and an income row named
 * by a record is not counted twice.
 *
 * The query carries the `userId` constraint the rules require (`allow read: if canAccess(
 * resource.data.userId)`): without it the list is refused as a whole, at any size.
 */

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { DividendReceipt } from '@/lib/utils/performanceAttribution';

const DIVIDENDS_COLLECTION = 'dividends';

/**
 * Every dividend record of an owner, as receipts.
 *
 * `paymentDate` is a Firestore Timestamp on the document; a record without one (never the case for
 * the app's own writes) is skipped rather than dated today, because "received today" is a claim.
 *
 * @param ownerId - Whose data is displayed (`useActiveAccount().ownerId`, never the viewer's uid)
 */
export async function getDividendReceipts(ownerId: string): Promise<DividendReceipt[]> {
  const snapshot = await getDocs(query(collection(db, DIVIDENDS_COLLECTION), where('userId', '==', ownerId)));

  const receipts: DividendReceipt[] = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const paymentDate = data.paymentDate?.toDate?.();
    if (!(paymentDate instanceof Date)) continue;
    receipts.push(toDividendReceipt(data, paymentDate));
  }
  return receipts;
}

const optionalNumber = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

/**
 * A dividend document's fields as a receipt. (The server's `Dividend` from the Admin reader is
 * already a `DividendReceipt` by shape: the periodic email passes it as is.)
 *
 * @param data - The document's fields (client or Admin SDK)
 * @param paymentDate - Its payment date, already converted
 */
function toDividendReceipt(data: Record<string, unknown>, paymentDate: Date): DividendReceipt {
  return {
    assetId: data.assetId as string,
    paymentDate,
    netAmount: Number(data.netAmount ?? 0),
    netAmountEur: optionalNumber(data.netAmountEur),
    grossAmount: optionalNumber(data.grossAmount),
    grossAmountEur: optionalNumber(data.grossAmountEur),
    taxAmount: optionalNumber(data.taxAmount),
    taxAmountEur: optionalNumber(data.taxAmountEur),
    expenseId: typeof data.expenseId === 'string' && data.expenseId !== '' ? data.expenseId : undefined,
  };
}
