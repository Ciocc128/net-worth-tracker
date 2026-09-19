/**
 * The words for a period's sales and for the market-vs-flows split — shared by the Panoramica,
 * Patrimonio and the periodic email, so the three say the same thing about the same trade.
 *
 * SDK-free: formatters from `lib/utils/formatters`, never from `chartService` (the email Lambda
 * imports this — AGENTS.md → Italian Localization).
 */

import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import type { DeclineCause, PeriodSalesSummary, TaxedGrowth } from '@/lib/utils/periodSales';
import type { Narrative, NarrativeSegment } from '@/lib/utils/narrative';

const prose = (text: string): NarrativeSegment => ({ text });
const figure = (text: string): NarrativeSegment => ({ text, mono: true });

/** Signed compact euro figure with a typographic minus, coloured by sign. */
function signedCompactEuro(value: number): NarrativeSegment {
  const sign = value >= 0 ? '+' : '−';
  return {
    text: `${sign}${cachedFormatCurrencyEUR(Math.abs(value), true)}`,
    mono: true,
    sign: value >= 0 ? 'positive' : 'negative',
  };
}

/** «sulla vendita di VWCE» when the period sold exactly one instrument, «sulle vendite» otherwise. */
function taxObject(sales?: PeriodSalesSummary | null): string {
  const instruments = sales?.instruments ?? [];
  return instruments.length === 1 ? `sulla vendita di ${instruments[0].name}` : 'sulle vendite';
}

/**
 * The tail of a falling headline, after «{subject} è in calo». Empty for `unknown`. The
 * `taxes-despite-market` tail names the instrument sold («per le tasse sulla vendita di VWCE, non
 * per il mercato») when the period's sales carry exactly one, «sulle vendite» otherwise — the
 * headline is the ONE place the cause is stated, so it must say which sale.
 */
export function declineHeadlineTail(cause: DeclineCause, sales?: PeriodSalesSummary | null): string {
  switch (cause) {
    case 'taxes-despite-market':
      return ` per le tasse ${taxObject(sales)}, non per il mercato.`;
    case 'despite-market':
      return ', nonostante il mercato.';
    case 'taxes-over-market':
      return ': il mercato ha pesato, le tasse sulle vendite di più.';
    case 'market-and-taxes':
      return ': il mercato ha pesato, e con lui le tasse sulle vendite.';
    case 'flows-over-market':
      return ': più per le uscite che per il mercato.';
    case 'market':
      return ': il mercato ha pesato.';
    case 'unknown':
      return '.';
  }
}

/**
 * The headline of a period the tax kept from growing (`resolveTaxedGrowth`): «Settembre è in pari:
 * le tasse sulla vendita di VWCE si sono prese la crescita.» / «Il portafoglio cresce, ma le tasse
 * sulle vendite si sono prese più di metà della crescita.» `grew` is the caller's verb for a
 * visible growth («cresce» on the pages, «è cresciuto» in the email, which speaks of a closed period).
 */
export function taxedGrowthHeadline(
  subject: string,
  kind: TaxedGrowth,
  sales: PeriodSalesSummary | null | undefined,
  grew = 'cresce',
): string {
  const tax = `le tasse ${taxObject(sales)}`;
  return kind === 'flat'
    ? `${subject} è in pari: ${tax} si sono prese la crescita.`
    : `${subject} ${grew}, ma ${tax} si sono prese più di metà della crescita.`;
}

/**
 * «Di quel movimento, −1079 € viene dal mercato e −3859 € dai tuoi movimenti.» — the month's
 * change split into the price effect and everything else the user did (deposits, spending,
 * sales, taxes). Stated whenever both halves exist; the split is exact by construction.
 */
export function describeOwnFlowsSplit(delta: number, marketEffect: number): Narrative {
  const ownFlows = delta - marketEffect;
  return [
    prose('Di quel movimento, '),
    signedCompactEuro(marketEffect),
    prose(' viene dal mercato e '),
    signedCompactEuro(ownFlows),
    prose(' dai tuoi movimenti.'),
  ];
}

/** «Vanguard FTSE All-World» for one instrument, «3 strumenti» for more. */
function salesSubject(sales: PeriodSalesSummary): NarrativeSegment[] {
  if (sales.instruments.length === 1) return [prose(sales.instruments[0].name)];
  return [figure(String(sales.instruments.length)), prose(' strumenti')];
}

/** The month's change and its market half, for the counterfactual that closes a taxed sale. */
export interface SalesSplit {
  delta: number;
  marketEffect: number;
}

/**
 * «Hai venduto Vanguard FTSE All-World per 39.052 € con una plusvalenza di 15.726 € e pagato
 * circa 4089 € di tasse.» The tax is the broker's withholding, already gone at the sale (regime
 * amministrato), so the verb is «pagato», not «pagherai»; «circa» because it is estimated from the
 * instrument's rate. A loss carries no tax; a missing rate says so instead of printing zero.
 *
 * With `split` and a tax, the sentence closes on the month WITHOUT it, in three exact parts —
 * «: senza, il mese avrebbe fatto +4213 € (+1481 € dal mercato, +2733 € dai tuoi movimenti).» —
 * and replaces `describeOwnFlowsSplit`, whose «dai tuoi movimenti» mixed the savings with the
 * tax (−1356 € on the real account's settembre 2026, a figure nobody could read). The own flows
 * are the residual `Δ − market + tax`, so the parts sum to Δ + tax by construction.
 */
export function describeSales(sales: PeriodSalesSummary, split?: SalesSplit): Narrative {
  const narrative: Narrative = [
    prose('Hai venduto '),
    ...salesSubject(sales),
    prose(' per '),
    figure(cachedFormatCurrencyEUR(sales.proceeds, true)),
  ];

  if (sales.realizedGain <= 0) {
    narrative.push(
      prose(' con una minusvalenza di '),
      figure(cachedFormatCurrencyEUR(Math.abs(sales.realizedGain), true)),
      prose(', senza tasse.'),
    );
    return narrative;
  }

  narrative.push(prose(' con una plusvalenza di '), figure(cachedFormatCurrencyEUR(sales.realizedGain, true)));
  if (sales.estimatedTax === null) {
    const where = sales.instruments.length === 1 ? 'sullo strumento' : 'su ogni strumento';
    narrative.push(prose(`; senza un'aliquota ${where} le tasse non sono stimate.`));
    return narrative;
  }
  narrative.push(
    prose(' e pagato circa '),
    figure(cachedFormatCurrencyEUR(sales.estimatedTax, true)),
    prose(' di tasse'),
  );
  if (!split || sales.estimatedTax <= 0) {
    narrative.push(prose('.'));
    return narrative;
  }
  const withoutTax = split.delta + sales.estimatedTax;
  narrative.push(
    prose(': senza, il mese avrebbe fatto '),
    signedCompactEuro(withoutTax),
    prose(' ('),
    signedCompactEuro(split.marketEffect),
    prose(' dal mercato, '),
    signedCompactEuro(withoutTax - split.marketEffect),
    prose(' dai tuoi movimenti).'),
  );
  return narrative;
}

/**
 * «Nello stesso mese hai comprato 6 strumenti per 34.305 €.» — what the ledger recorded as bought
 * beside the sale, so 39.052 € «venduti» do not read as money gone when they were rebalanced.
 * Stated as a fact, never as «con la vendita hai comprato»: the ledger cannot tell which money paid.
 * Empty when nothing was bought (or the payload predates the field).
 */
export function describePurchases(sales: PeriodSalesSummary, periodNoun = 'mese'): Narrative {
  const purchases = sales.purchases;
  if (!purchases || purchases.amount <= 0) return [];
  const count = purchases.instrumentCount;
  return [
    prose(`Nello stesso ${periodNoun} hai comprato `),
    figure(String(count)),
    prose(` ${count === 1 ? 'strumento' : 'strumenti'} per `),
    figure(cachedFormatCurrencyEUR(purchases.amount, true)),
    prose('.'),
  ];
}
