/**
 * Tests for lib/utils/monteCarloNarrative.ts — the words of FIRE › Monte Carlo: the verdict that
 * answers «quanto è probabile?» with its tone from the success rate, and the reading line of
 * every tile. Every phrasing is pinned; a missing input drops its clause instead of printing a
 * placeholder (The Narrative Honesty Rule).
 *
 * Same mocking as the other `*Narrative.test.ts`: chartService's it-IT percentage formatter
 * drags the Firebase chain in, which is mocked away.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteField: vi.fn(),
}));

import {
  buildMonteCarloVerdict,
  DETTAGLIO_DESCRIPTION,
  describeAllocationTotal,
  describeWeightsSource,
  formatLeverage,
  resolveAllocationTotalState,
  describeFireStartRow,
  describeParametri,
  describeMarketDeclaration,
  describeParametriFooter,
  describePensionInflowRow,
  describePercentili,
  describeStatePensionRow,
  describeWithdrawalTaxRow,
  describeProbabilita,
  describeProbabilitaAside,
  describeProbabilitaFooter,
  describeScenari,
  describeScenarioNote,
  describeSpesaSostenibile,
  describeSpesaCell,
  describeSpesaHeroAside,
  describeTraiettorie,
  PARAMETRI_ASIDE,
  SCENARI_ASIDE,
  SCENARI_FOOTER,
} from '@/lib/utils/monteCarloNarrative';
import type { SustainableSpendingSummary, SustainableWithdrawal } from '@/lib/utils/sustainableWithdrawal';
import { narrativeToText, type Narrative } from '@/lib/utils/narrative';
import { INACTIVE_LOCK, type FireLock } from '@/lib/utils/fireSummary';
import type { MonteCarloPlan, MonteCarloRun, ScenarioComparison, ScenarioRunSummary } from '@/lib/utils/monteCarloSummary';

/** Flattens the no-break space `Intl` puts before € so expectations read like the screen. */
const plain = (narrative: Narrative) => narrativeToText(narrative).replace(/ /g, ' ');

function makeRun(overrides: Partial<MonteCarloRun> = {}): MonteCarloRun {
  return {
    successRate: 84.21,
    successCount: 8421,
    failureCount: 1579,
    leverageFailureCount: 0,
    leverage: 1,
    simulations: 10000,
    years: 35,
    endCalendarYear: 2061,
    endAge: 81,
    medianFinal: 612400,
    finalPercentiles: { p10: 0, p25: 118000, p50: 612400, p75: 1310000, p90: 2096000 },
    p10DepletionYear: 27,
    p10DepletionCalendarYear: 2053,
    p10DepletionAge: 73,
    failureAverageYear: 24,
    failureAverageCalendarYear: 2050,
    failureMedianYear: 26,
    failureMedianCalendarYear: 2052,
    todayEuros: false,
    inflationRate: null,
    startCalendarYear: 2026,
    startYears: 0,
    ...overrides,
  };
}

function makeScenarioRow(key: ScenarioRunSummary['key'], overrides: Partial<ScenarioRunSummary> = {}): ScenarioRunSummary {
  const defaults: Record<ScenarioRunSummary['key'], ScenarioRunSummary> = {
    bear: { key: 'bear', successRate: 61.5, successCount: 6150, failureCount: 3850, medianFinal: 198000, p10DepletionCalendarYear: 2045, todayEuros: false },
    base: { key: 'base', successRate: 84.21, successCount: 8421, failureCount: 1579, medianFinal: 612400, p10DepletionCalendarYear: 2053, todayEuros: false },
    bull: { key: 'bull', successRate: 96.8, successCount: 9680, failureCount: 320, medianFinal: 1420000, p10DepletionCalendarYear: null, todayEuros: false },
  };
  return { ...defaults[key], ...overrides };
}

function makeComparison(overrides: Partial<ScenarioComparison> = {}): ScenarioComparison {
  return { rows: [makeScenarioRow('bear'), makeScenarioRow('base'), makeScenarioRow('bull')], spreadPoints: 35.3, ...overrides };
}

function makePlan(overrides: Partial<MonteCarloPlan> = {}): MonteCarloPlan {
  return {
    initialPortfolio: 488600,
    lockedValue: 31400,
    annualWithdrawal: 22000,
    isIndexed: true,
    years: 35,
    endAge: 81,
    endCalendarYear: 2061,
    simulations: 10000,
    allocation: [
      { key: 'equity', label: 'azioni', pct: 58 },
      { key: 'bonds', label: 'obbligazioni', pct: 27 },
      { key: 'cash', label: 'liquidità', pct: 10 },
      { key: 'commodity', label: 'materie prime', pct: 5 },
    ],
    inflows: [{ yearOffset: 19, calendarYear: 2045, amount: 31400 }],
    statePensions: [],
    withdrawalTax: null,
    ...overrides,
  };
}

const ACTIVE_LOCK: FireLock = { active: true, lockedValue: 31400, unlockCalendarYear: 2045, unlockAge: 62, source: 'rita', lockedFundCount: 1, unmodellableCount: 0 };

describe('buildMonteCarloVerdict', () => {
  it('says what is missing when the plan cannot run', () => {
    const verdict = buildMonteCarloVerdict({ runnable: false, run: null, scenarios: null, lock: INACTIVE_LOCK });
    expect(verdict.headline).toBe('Monte Carlo non calcolabile.');
    expect(verdict.tone).toBe('neutral');
    expect(plain(verdict.sentence)).toBe('Servono un patrimonio iniziale e un prelievo annuo maggiori di zero: inseriscili nella tessera Parametri.');
  });

  it('names a run that has not produced results yet', () => {
    const verdict = buildMonteCarloVerdict({ runnable: true, run: null, scenarios: null, lock: INACTIVE_LOCK });
    expect(verdict.headline).toBe('Simulazione non ancora eseguita.');
    expect(plain(verdict.sentence)).toBe('Premi Prova nella tessera Parametri: i tre scenari girano insieme.');
  });

  it('reads the base run: the share that holds to the age, the median, the worst tenth, the scenarios and the bridge', () => {
    const verdict = buildMonteCarloVerdict({ runnable: true, run: makeRun(), scenarios: makeComparison(), lock: ACTIVE_LOCK });
    expect(verdict.headline).toBe("Il piano regge nell'84,2% dei casi.");
    expect(verdict.tone).toBe('warning');
    expect(plain(verdict.sentence)).toBe(
      "Nell'84,2% delle 10.000 simulazioni il capitale regge fino a 81 anni (2061); nel caso mediano chiudi con 612.400 €, nel 10% peggiore i soldi finiscono entro il 2053 (73 anni). " +
        'Nello scenario bear regge nel 61,5% dei casi, nel bull nel 96,8%. Numeri con il modello ponte: i 31.400 € del fondo pensione entrano nel 2045 al valore di oggi.',
    );
  });

  it('takes the tone from the rate and elides the article by the printed figure', () => {
    expect(buildMonteCarloVerdict({ runnable: true, run: makeRun({ successRate: 95.04 }), scenarios: null, lock: INACTIVE_LOCK })).toMatchObject({ headline: 'Il piano regge nel 95% dei casi.', tone: 'positive' });
    expect(buildMonteCarloVerdict({ runnable: true, run: makeRun({ successRate: 57.3 }), scenarios: null, lock: INACTIVE_LOCK })).toMatchObject({ headline: 'Il piano regge nel 57,3% dei casi.', tone: 'negative' });
    expect(buildMonteCarloVerdict({ runnable: true, run: makeRun({ successRate: 100 }), scenarios: null, lock: INACTIVE_LOCK })).toMatchObject({ headline: 'Il piano regge in ogni simulazione.', tone: 'positive' });
    // The elision follows the Italian number name: «dieci» and «diciotto» start with a consonant, «undici» and «ottanta» with a vowel.
    expect(buildMonteCarloVerdict({ runnable: true, run: makeRun({ successRate: 10.6 }), scenarios: null, lock: INACTIVE_LOCK }).headline).toBe('Il piano regge nel 10,6% dei casi.');
    expect(buildMonteCarloVerdict({ runnable: true, run: makeRun({ successRate: 18.2 }), scenarios: null, lock: INACTIVE_LOCK }).headline).toBe('Il piano regge nel 18,2% dei casi.');
    expect(buildMonteCarloVerdict({ runnable: true, run: makeRun({ successRate: 11 }), scenarios: null, lock: INACTIVE_LOCK }).headline).toBe("Il piano regge nell'11% dei casi.");
  });

  it('reads the horizon in years when no age is saved, and the tenth that survives with its floor', () => {
    const run = makeRun({ endAge: null, p10DepletionYear: null, p10DepletionCalendarYear: null, p10DepletionAge: null, finalPercentiles: { p10: 118000, p25: 300000, p50: 612400, p75: 1310000, p90: 2096000 } });
    const verdict = buildMonteCarloVerdict({ runnable: true, run, scenarios: null, lock: INACTIVE_LOCK });
    expect(plain(verdict.sentence)).toBe("Nell'84,2% delle 10.000 simulazioni il capitale regge per 35 anni (fino al 2061); nel caso mediano chiudi con 612.400 €, e anche nel 10% peggiore chiudi con almeno 118.000 €.");
  });

  it('says the median case runs out when the median final value is zero', () => {
    const run = makeRun({ successRate: 41, medianFinal: 0, finalPercentiles: { p10: 0, p25: 0, p50: 0, p75: 200000, p90: 700000 }, p10DepletionCalendarYear: 2040, p10DepletionAge: 60 });
    const verdict = buildMonteCarloVerdict({ runnable: true, run, scenarios: null, lock: INACTIVE_LOCK });
    expect(plain(verdict.sentence)).toBe('Nel 41% delle 10.000 simulazioni il capitale regge fino a 81 anni (2061); nel caso mediano i soldi finiscono prima del 2061, nel 10% peggiore entro il 2040 (60 anni).');
  });

  it('drops the bridge clause without a lock and the scenario clause without a comparison', () => {
    const verdict = buildMonteCarloVerdict({ runnable: true, run: makeRun(), scenarios: null, lock: INACTIVE_LOCK });
    expect(plain(verdict.sentence)).not.toContain('modello ponte');
    expect(plain(verdict.sentence)).not.toContain('scenario bear');
  });
});

describe('Probabilità', () => {
  it('counts the survivors and dates the average failure', () => {
    expect(plain(describeProbabilita(makeRun()))).toBe("8421 simulazioni su 10.000 arrivano al 2061 con capitale positivo; le 1579 che falliscono esauriscono il capitale in media nell'anno 24 (2050).");
  });

  it('says so when nothing fails, and reads one failure in the singular', () => {
    expect(plain(describeProbabilita(makeRun({ failureCount: 0, successCount: 10000, failureAverageYear: null, failureAverageCalendarYear: null })))).toBe('Tutte le 10.000 simulazioni arrivano al 2061 con capitale positivo.');
    expect(plain(describeProbabilita(makeRun({ failureCount: 1, successCount: 9999, failureAverageYear: 30, failureAverageCalendarYear: 2056 })))).toBe("9999 simulazioni su 10.000 arrivano al 2061 con capitale positivo; l'unica che fallisce esaurisce il capitale nell'anno 30 (2056).");
  });

  it('names the scope in the aside and the legend in the footer, with the step only when a fund enters', () => {
    expect(describeProbabilitaAside(makeRun())).toBe('scenario base · 10.000 simulazioni Monte Carlo · 35 anni');
    expect(plain(describeProbabilitaFooter(makeRun(), ACTIVE_LOCK))).toBe(
      'La linea è la mediana delle 10.000 traiettorie, le bande il 25–75 e il 10–90; la tratteggiata in basso è il capitale esaurito. Il gradino nel 2045 è il fondo pensione che entra, al valore di oggi. Valori nominali: il prelievo cresce con l\'inflazione.',
    );
    expect(plain(describeProbabilitaFooter(makeRun(), INACTIVE_LOCK))).not.toContain('gradino');
  });
});

describe('Scenari a confronto', () => {
  it('reads bear and bull with the spread in points', () => {
    expect(plain(describeScenari(makeComparison()))).toBe('Lo scenario bear regge nel 61,5% dei casi, il bull nel 96,8%: 35 punti di distanza attorno al base.');
  });

  it('says the scenarios coincide under half a point', () => {
    expect(plain(describeScenari(makeComparison({ spreadPoints: 0.2 })))).toBe('Lo scenario bear regge nel 61,5% dei casi, il bull nel 96,8%: i tre scenari non si distinguono.');
  });

  it('writes each row note with the median and the worst tenth', () => {
    expect(plain(describeScenarioNote(makeScenarioRow('bear')))).toBe('mediana finale 198.000 € · nel 10% peggiore esaurito nel 2045');
    expect(plain(describeScenarioNote(makeScenarioRow('bull')))).toBe('mediana finale 1.420.000 € · anche il 10% peggiore regge');
    expect(plain(describeScenarioNote(makeScenarioRow('bear', { medianFinal: 0 })))).toBe('nel caso mediano i soldi finiscono · nel 10% peggiore esaurito nel 2045');
  });

  it('exposes the aside and the footer', () => {
    expect(SCENARI_ASIDE).toBe('stesso piano, mercati diversi');
    expect(plain(SCENARI_FOOTER)).toContain('La riga Base è il riferimento delle altre tessere');
  });
});

describe('Parametri', () => {
  it('states the plan as typed, the locked fund named, the allocation listed', () => {
    expect(plain(describeParametri(makePlan()))).toBe(
      'Parti da 488.600 € — il patrimonio senza i 31.400 € del fondo pensione bloccato — e prelevi 22.000 € l\'anno, indicizzati all\'inflazione, per 35 anni, con il 58% in azioni, il 27% in obbligazioni, il 10% in liquidità e il 5% in materie prime.',
    );
  });

  it('drops the lock aside without a locked fund and reads a fixed withdrawal', () => {
    expect(plain(describeParametri(makePlan({ lockedValue: 0, isIndexed: false, allocation: [{ key: 'equity', label: 'azioni', pct: 60 }, { key: 'bonds', label: 'obbligazioni', pct: 40 }] })))).toBe(
      'Parti da 488.600 € e prelevi 22.000 € l\'anno, fissi, per 35 anni, con il 60% in azioni e il 40% in obbligazioni.',
    );
  });

  it('reads the pension row and the run state in the footer', () => {
    expect(plain(describePensionInflowRow({ yearOffset: 19, calendarYear: 2045, amount: 31400 }))).toBe("Fondo pensione: +31.400 € aggiunti da soli nell'anno 19 (2045), al valore di oggi.");
    expect(plain(describeStatePensionRow({ yearOffset: 34, calendarYear: 2060, annualNetToday: 13000 }))).toBe("Pensione statale: −13.000 € l'anno tolti dal prelievo dall'anno 34 (2060), netti, al valore di oggi.");
    expect(plain(describeStatePensionRow({ yearOffset: 0, calendarYear: 2026, annualNetToday: 13000 }))).toBe("Pensione statale: −13.000 € l'anno tolti dal prelievo da subito, netti, al valore di oggi.");
    expect(plain(describeWithdrawalTaxRow({ rate: 26, gainSharePct: 40 }))).toBe('Tasse sui prelievi: ogni prelievo vende quanto serve a pagare il 26% sulla plusvalenza (40% del capitale oggi).');
    expect(plain(describeWithdrawalTaxRow(null))).toBe('Tasse sui prelievi: non stimate, nessun PMC in euro nel portafoglio.');
    expect(plain(describeParametriFooter({ stale: false, simulations: 10000 }))).toBe('Ultima esecuzione con questi parametri · 30.000 traiettorie, 10.000 per scenario.');
    expect(plain(describeParametriFooter({ stale: true, simulations: 10000 }))).toBe("I risultati sopra usano i parametri dell'ultima esecuzione: premi Prova per aggiornarli.");
    expect(PARAMETRI_ASIDE).toBe('una prova, non si salva · le ipotesi di mercato stanno in Impostazioni');
  });
});

describe('Dettaglio', () => {
  it('reads the three medians against the same start', () => {
    expect(plain(describeTraiettorie(makeComparison(), makePlan()))).toBe("Le tre mediane partono dagli stessi 488.600 €; nel 2061 il bear chiude a 198.000 €, il base a 612.400 €, il bull a 1.420.000 €.");
    expect(plain(describeTraiettorie(makeComparison({ rows: [makeScenarioRow('bear', { medianFinal: 0 }), makeScenarioRow('base'), makeScenarioRow('bull')] }), makePlan()))).toBe(
      "Le tre mediane partono dagli stessi 488.600 €; nel 2061 il bear finisce i soldi, il base chiude a 612.400 €, il bull a 1.420.000 €.",
    );
  });

  it('dates the 10th percentile at zero, or names its floor', () => {
    expect(plain(describePercentili(makeRun()))).toBe('Il 10° percentile scende a zero dal 2053: da lì in poi almeno una simulazione su dieci ha finito i soldi.');
    expect(plain(describePercentili(makeRun({ p10DepletionCalendarYear: null, finalPercentiles: { p10: 118000, p25: 300000, p50: 612400, p75: 1310000, p90: 2096000 } })))).toBe('Nessun percentile tocca zero: anche il 10° chiude il 2061 con 118.000 €.');
    expect(DETTAGLIO_DESCRIPTION).toBe('Traiettorie dei tre scenari in euro di oggi, percentili a passi di 5 anni, come funziona');
  });
});

describe('Ipotesi di mercato nel tile Parametri', () => {
  it('declares where the assumptions come from, never editing them', () => {
    expect(plain(describeMarketDeclaration({ origin: 'default', editedClasses: [] }))).toBe('Ipotesi di mercato: valori predefiniti, storici di lungo periodo in dollari.');
    expect(plain(describeMarketDeclaration({ origin: 'saved', editedClasses: [] }))).toBe('Ipotesi di mercato: salvate, uguali ai valori predefiniti.');
    expect(plain(describeMarketDeclaration({ origin: 'saved', editedClasses: ['equity'] }))).toBe('Ipotesi di mercato: salvate, modificate in 1 classe.');
    expect(plain(describeMarketDeclaration({ origin: 'saved', editedClasses: ['equity', 'gold', 'carry'] }))).toBe('Ipotesi di mercato: salvate, modificate in 3 classi.');
    expect(plain(describeMarketDeclaration({ origin: 'default', editedClasses: [], correlationOrigin: 'default' }))).toBe('Ipotesi di mercato: valori predefiniti, storici di lungo periodo in dollari. Correlazioni predefinite.');
    expect(plain(describeMarketDeclaration({ origin: 'saved', editedClasses: ['equity'], correlationOrigin: 'saved' }))).toBe('Ipotesi di mercato: salvate, modificate in 1 classe. Correlazioni personalizzate.');
    expect(plain(describeMarketDeclaration({ origin: 'migrated', editedClasses: [] }))).toBe('Ipotesi di mercato: migrate dai parametri salvati prima (da media aritmetica a CAGR): rileggile in Impostazioni.');
  });
});

describe('leverage (T3)', () => {
  it('the verdict adds the comparison with and without leverage, in the tone of the leveraged run', () => {
    const run = makeRun({ successRate: 87, leverage: 1.5 });
    const verdict = buildMonteCarloVerdict({ runnable: true, run, scenarios: null, lock: INACTIVE_LOCK, unleveragedSuccessRate: 94 });
    expect(plain(verdict.sentence)).toContain("Con leva 1,5× il piano regge nell'87% delle simulazioni; senza leva, sugli stessi rendimenti, nel 94%.");
    expect(verdict.tone).toBe('warning');
  });

  it('the verdict has no leverage sentence without leverage', () => {
    const verdict = buildMonteCarloVerdict({ runnable: true, run: makeRun(), scenarios: null, lock: INACTIVE_LOCK, unleveragedSuccessRate: null });
    expect(plain(verdict.sentence)).not.toContain('leva');
  });

  it('the Probabilità footer splits the failures by cause only when some are leverage ruin', () => {
    const withLeverage = plain(describeProbabilitaFooter(makeRun({ failureCount: 1300, leverageFailureCount: 420 }), INACTIVE_LOCK));
    expect(withLeverage).toContain('Dei 1300 fallimenti, 420 per rovina da leva (una perdita annua oltre il capitale), 880 per prelievi.');
    expect(plain(describeProbabilitaFooter(makeRun(), INACTIVE_LOCK))).not.toContain('rovina da leva');
  });

  it('the total of the weights reads leverage above 100% and blocks under 100% and over 300%', () => {
    expect(plain(describeAllocationTotal(100))).toBe('Totale 100%');
    expect(plain(describeAllocationTotal(150))).toBe('Totale 150% · leva 1,5×');
    expect(plain(describeAllocationTotal(85))).toBe('Totale 85%: deve arrivare ad almeno 100%');
    expect(plain(describeAllocationTotal(340))).toBe('Totale 340%: leva oltre 3×');
    expect(['below', 'plain', 'leveraged', 'above']).toEqual([85, 100, 150, 340].map(resolveAllocationTotalState));
    expect(resolveAllocationTotalState(300)).toBe('leveraged');
  });

  it('says where the weights come from', () => {
    expect(plain(describeWeightsSource({ origin: 'targets', leverage: 1.5, hasTargets: true }))).toBe('Dai target di Allocazione, leva 1,5×.');
    expect(plain(describeWeightsSource({ origin: 'holdings', leverage: 1.32, hasTargets: true }))).toBe('Dal portafoglio di oggi, leva 1,32×.');
    expect(plain(describeWeightsSource({ origin: 'holdings', leverage: 1, hasTargets: false }))).toBe('Nessun target configurato in Allocazione: parti dal portafoglio di oggi.');
    expect(plain(describeWeightsSource({ origin: 'edited', leverage: 1, hasTargets: true }))).toBe('Pesi modificati a mano.');
    expect(formatLeverage(2)).toBe('2×');
  });

  it('declares the price of the debt on the market line only with leverage', () => {
    const market = { origin: 'default' as const, editedClasses: [], leverageSpread: 2 };
    expect(plain(describeMarketDeclaration(market, 1.5))).toContain('Il debito costa la liquidità dell’anno più 2%.');
    expect(plain(describeMarketDeclaration(market, 1))).not.toContain('debito');
  });
});

// ─── S1: spesa sostenibile ────────────────────────────────────────────────────

const cell = (withdrawal: number | null, capital = 1_000_000): SustainableWithdrawal =>
  withdrawal === null ? { withdrawal: null, successRate: 0, rate: null } : { withdrawal, successRate: 0.9, rate: withdrawal / capital };

function makeSummary(base90: number | null, bear90: number | null = 33_700): SustainableSpendingSummary {
  return {
    capital: 1_000_000,
    rows: [
      { probability: 0.8, bear: cell(38_500), base: cell(49_800), bull: cell(66_100) },
      { probability: 0.9, bear: cell(bear90), base: cell(base90), bull: cell(57_500) },
      { probability: 0.95, bear: cell(30_100), base: cell(38_500), bull: cell(51_100) },
    ],
  };
}

describe('the verdict’s sustainable-spending sentence', () => {
  const verdictWith = (base90: SustainableWithdrawal, typedWithdrawal: number) =>
    plain(buildMonteCarloVerdict({ runnable: true, run: makeRun(), scenarios: null, lock: INACTIVE_LOCK, sustainable: { base90, capital: 1_000_000, typedWithdrawal } }).sentence);

  it('a typed withdrawal at or under W90: the plan could withdraw up to it', () => {
    expect(verdictWith(cell(43_300), 30_000)).toContain("Per restare al 90% potresti prelevare fino a 43.300 € l'anno di oggi (3608 € al mese), il 4,3% del capitale.");
    expect(verdictWith(cell(43_300), 43_300)).toContain('Per restare al 90%');
  });
  it('a typed withdrawal over W90: it should come down to it', () => {
    expect(verdictWith(cell(43_300), 50_000)).toContain("Per tornare al 90% il prelievo dovrebbe scendere a 43.300 € l'anno di oggi (il 4,3% del capitale).");
  });
  it('null: no withdrawal reaches 90% — the leverage ruins the capital alone', () => {
    expect(verdictWith(cell(null), 30_000)).toContain('Con questa leva nessun prelievo arriva al 90%: in più di una simulazione su dieci la leva azzera il capitale da sola.');
  });
  it('a zero figure says so instead of «fino a 0 €»', () => {
    const text = verdictWith({ withdrawal: 0, successRate: 0.9, rate: 0 }, 30_000);
    expect(text).toContain('Nemmeno un prelievo di 100 €');
    expect(text).not.toContain('fino a 0');
  });
  it('without the figures the sentence is absent and the tone is the probability’s', () => {
    const verdict = buildMonteCarloVerdict({ runnable: true, run: makeRun(), scenarios: null, lock: INACTIVE_LOCK });
    expect(plain(verdict.sentence)).not.toContain('al 90%');
    const withFigures = buildMonteCarloVerdict({ runnable: true, run: makeRun(), scenarios: null, lock: INACTIVE_LOCK, sustainable: { base90: cell(43_300), capital: 1_000_000, typedWithdrawal: 30_000 } });
    expect(withFigures.tone).toBe(verdict.tone);
  });
});

describe('the Spesa sostenibile tile’s words', () => {
  it('the reading: nine in ten hold the horizon at the Base figure, the bear beside it', () => {
    expect(plain(describeSpesaSostenibile(makeSummary(43_300), 30))).toBe("In 9 simulazioni su 10 il capitale regge 30 anni prelevando fino a 43.300 € l'anno di oggi; nel bear 33.700 €.");
    expect(plain(describeSpesaSostenibile(makeSummary(43_300), 1))).toContain('regge 1 anno ');
  });
  it('a bear cell with no withdrawal says it', () => {
    expect(plain(describeSpesaSostenibile(makeSummary(43_300, null), 30))).toContain("nel bear nessun prelievo basta");
  });
  it('a Base cell with no withdrawal reads the leverage', () => {
    expect(plain(describeSpesaSostenibile(makeSummary(null), 30))).toContain('la leva azzera il capitale da sola');
  });
  it('the cells and the hero aside', () => {
    expect(describeSpesaCell(cell(43_300)).replace(/\u00a0/g, ' ')).toBe('43.300 €');
    expect(describeSpesaCell(cell(null))).toBe('nessun prelievo');
    expect(describeSpesaHeroAside(cell(43_300))?.replace(/\u00a0/g, ' ')).toBe('3608 € al mese · 4,3% del capitale');
    expect(describeSpesaHeroAside(cell(null))).toBeNull();
  });
});


describe('T5 — Dopo il FIRE: partenza, euro di oggi, righe di Parametri', () => {
  const sustainable = { base90: { withdrawal: 27300, rate: 0.0336 }, capital: 812000, typedWithdrawal: 20000 } as unknown as Parameters<typeof buildMonteCarloVerdict>[0]['sustainable'];
  const REAL = { todayEuros: true, inflationRate: 3.04, startYears: 5, startCalendarYear: 2031, endCalendarYear: 2076, endAge: 90, years: 45, medianFinal: 640000, finalPercentiles: { p10: 0, p25: 100000, p50: 640000, p75: 1200000, p90: 2000000 }, successRate: 63, p10DepletionCalendarYear: 2058, p10DepletionAge: 72 };

  it('names the start before the probability, the euros are «di oggi», the sustainable sentence follows at once', () => {
    const verdict = buildMonteCarloVerdict({
      runnable: true,
      run: makeRun(REAL),
      scenarios: makeComparison(),
      lock: INACTIVE_LOCK,
      sustainable,
      start: { atFire: true, calendarYear: 2031, age: 45, capital: 812000 },
    });
    expect(plain(verdict.sentence)).toContain(
      'Smettendo nel 2031 (a 45 anni) con 812.000 € di oggi, nel 63% delle 10.000 simulazioni il capitale regge fino a 90 anni (2076); nel caso mediano chiudi con 640.000 € di oggi, nel 10% peggiore i soldi finiscono entro il 2058 (72 anni). Per restare al 90% potresti prelevare fino a 27.300 € l\'anno di oggi',
    );
    expect(plain(verdict.sentence).indexOf('Per restare al 90%')).toBeLessThan(plain(verdict.sentence).indexOf('Nello scenario orso'));
  });

  it('from today the start is «Smettendo oggi con 700.000 €»; without a start the sentence is the one of before', () => {
    const today = buildMonteCarloVerdict({ runnable: true, run: makeRun({ ...REAL, startYears: 0, startCalendarYear: 2026 }), scenarios: null, lock: INACTIVE_LOCK, start: { atFire: false, calendarYear: 2026, age: 40, capital: 700000 } });
    expect(plain(today.sentence).startsWith('Smettendo oggi con 700.000 €, nel 63% delle')).toBe(true);
    const before = buildMonteCarloVerdict({ runnable: true, run: makeRun(), scenarios: null, lock: INACTIVE_LOCK });
    expect(plain(before.sentence).startsWith('Nell\'84,2% delle 10.000 simulazioni')).toBe(true);
    expect(plain(before.sentence)).not.toContain('di oggi');
  });

  it('the Probabilità footer says the euros are today\'s and the inflation, not «Valori nominali»', () => {
    const footer = plain(describeProbabilitaFooter(makeRun(REAL), INACTIVE_LOCK));
    expect(footer).toContain("Euro di oggi, inflazione 3,04% (Impostazioni › Simulazioni): il prelievo resta costante in potere d'acquisto.");
    expect(footer).not.toContain('Valori nominali');
  });

  it('a fund that unlocks before the FIRE year makes no step on the plot', () => {
    // ACTIVE_LOCK unlocks in 2045; the run starts in 2031 and ends in 2076, so the step stays; with a start in 2046 it goes.
    expect(plain(describeProbabilitaFooter(makeRun(REAL), ACTIVE_LOCK))).toContain('Il gradino nel 2045');
    expect(plain(describeProbabilitaFooter(makeRun({ ...REAL, startCalendarYear: 2046 }), ACTIVE_LOCK))).not.toContain('gradino');
  });

  it('the Parametri line: the FIRE year and the Base capital, or why the run starts today (DF6)', () => {
    const fire = { kind: 'fire' as const, years: 5, calendarYear: 2031, ageAtFire: 45, capitalNominal: 943000, capitalToday: 812000, gainShare: null };
    expect(plain(describeFireStartRow(fire, 'fire', 2026))).toContain('Capitale al FIRE: 812.000 € di oggi (943.000 € nel 2031).');
    expect(plain(describeFireStartRow(fire, 'today', 2026))).toContain('il Calcolatore dice FIRE nel 2031');
    expect(plain(describeFireStartRow({ kind: 'today', reason: 'already' }, 'today', 2026))).toBe('Sei già FIRE: la simulazione parte da oggi.');
    expect(plain(describeFireStartRow({ kind: 'today', reason: 'never' }, 'today', 2026))).toBe('Il Calcolatore non trova un anno FIRE entro il 2076: la simulazione parte da oggi.');
    expect(plain(describeFireStartRow({ kind: 'today', reason: 'no-plan' }, 'today', 2026))).toBe('Il Calcolatore non ha spesa o SWR: la simulazione parte da oggi.');
  });

  it('the scenario note and the percentile line say «di oggi» only for real euros', () => {
    expect(plain(describeScenarioNote(makeScenarioRow('bear', { todayEuros: true })))).toContain('mediana finale 198.000 € di oggi');
    expect(plain(describePercentili(makeRun({ todayEuros: true, p10DepletionCalendarYear: null })))).toContain('con 0 € di oggi');
  });
});
