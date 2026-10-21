# C-fee · PR text for upstream: a trade's fee out of the PMC, into the cashflow

> Text for GitHub, in English (RC3). Branch `pr/trade-fee-cashflow` on the fork, one commit on `upstream/develop`
> (54634a9). Not opened: the owner opens it after U1–U3 are merged (RC8), or says so in the thread.

## Title

Keep a trade's fee out of the EUR average cost and record it in the cashflow

## Body

**This is a product change, not a bug fix, so I'd like your call on it.**

Today the EUR average cost (`costBasisEur` → `averageCostEur`) includes purchase fees, and a trade's fee is a field on
the trade with no row anywhere in the cashflow. In practice:

- the PMC shown in the app is higher than the one on the broker statement (a purchase of 10 units at 100 € with 5 € of
  fees shows 100.50 €; the broker carries 100.00 €);
- the fee never appears among the spending, so a month's costs are understated.

This PR changes both:

1. `costBasisEur` and `averageCostEur` stand on quantity × price alone. The native PMC already did.
2. With a fee category chosen in Settings › Expenses (the one fees already use), saving a buy or a sell with a fee writes,
   in the same Firestore transaction, a spending row on the trade's date. The row moves no account: the trade's own cash
   settlement already debits the fee, and a second debit would pay it twice. The trade names the row
   (`feeExpenseId`) and the row names the trade (`feeOfTradeId`). Editing the trade moves the row's amount and date;
   deleting the trade, or clearing the fee, removes it. With no category set the trade saves as before and no row is
   written.

Unchanged on purpose: realized P&L stays net of the sale's fee; invested capital and the XIRR flows still count the fee
(the cash left); the tax estimate already ignored fees (the fiscal gain is the price difference).

Trades saved before this have no row. Saving one again creates it and recomputes the PMC; no migration or script.

**Trade-off to be aware of**: `doc/guide/registro-operazioni.md` and `lib/utils/costBasisEur.ts` described the EUR PMC
with fees as «the fiscal cost». The broker's own fiscal carrying value excludes them (see the Directa example in the
guide), so the new number matches the statement; the fee is still tracked, in the cashflow.

### Tests
`tsc`, eslint, full Vitest under `Europe/Rome` and `TZ=UTC` on `upstream/develop`. New: `tradeFeeExpense` (the plan and the
document), and the write-transaction cases (row created, moved, removed with the trade; no category; an old trade saved
again). Updated: the four assertions that expected fees in the EUR cost.

Not run here: the E2E specs of the area (`assets.sale-tax`, `cashflow.transfer-fee`), on the owner's machine.
