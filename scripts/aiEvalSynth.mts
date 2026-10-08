/**
 * The synthetic round of the email eval (doc/ai-open-models-wiki.md § 7.7): freezes the EXACT
 * periodic-email request the app sends (`buildEmailAiPrompt`: EMAIL_SYSTEM_CORE + format contract +
 * Wiki block / data sections + macro, production output budget) over 20 SYNTHETIC scenarios
 * (scripts/aiEvalSynthScenarios.mts), in the bundle format `scripts/aiEval.mts` runs. No real data:
 * persona, figures, newsletter pages and principles are invented here, so the bundles may leave
 * the machine (they were also the Optima benchmark of 2026-10-07).
 *
 *   npm run ai:eval:synth -- --dir <d>          then  npm run ai:eval -- estimate|run --round gara --dir <d>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildEmailAiPrompt, emailAiOutputBudget } from '../lib/server/monthlyEmailService';
import { renderMonthPage, type MacroWeekRecord } from '../lib/utils/wikiMacro';
import { prepareMacroMonthPage, cleanPrinciplesDigest, formatMacroForPrompt, MACRO_DEPTH, monthLabel } from '../lib/utils/emailWiki';
import { MAX_CATEGORY_DELTAS } from '../lib/server/emailPeriodComparison';
import { EMAIL_PERIODIC_WORD_LIMITS } from '../lib/server/assistant/prompts';
import type { MonthlyEmailData } from '../lib/server/monthlyEmailService';
import type { PeriodComparison } from '../lib/server/emailPeriodComparison';
import type { EmailWikiContext } from '../lib/utils/emailWiki';
import type { AssistantMemoryItem, AssistantMonthContextBundle, AssistantPreferences } from '../types/assistant';
import { SCENARIOS, type Scenario } from './aiEvalSynthScenarios';

type Mood = 'risk-on' | 'risk-off' | 'neutral' | 'mixed';
const CLASS_LABEL: Record<string, string> = {
  equity: 'Azioni', bonds: 'Obbligazioni', cash: 'Liquidità', commodity: 'Materie Prime', realestate: 'Immobili',
  crypto: 'Criptovalute', trendFollowing: 'Trend following', carry: 'Carry', pension: 'Previdenza',
};
const TYPE_LABEL: Record<string, string> = { fixed: 'Spese Fisse', variable: 'Spese Variabili', debt: 'Debiti' };

const round = (x: number) => Math.round(x);
const pctOf = (a: number, b: number) => (b === 0 ? null : Math.round(((a - b) / Math.abs(b)) * 1000) / 10);
const delta = (previous: number | null | undefined, current: number) =>
  previous === null || previous === undefined ? null : { absChange: round(current - previous), pctChange: pctOf(current, previous), previous: round(previous) };

const MONTHS_IT = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
function windowMonths(s: Scenario): string[] {
  const start = s.periodType === 'monthly' ? s.month : s.periodType === 'quarterly' ? s.month - 2 : s.periodType === 'semiannual' ? s.month - 5 : 1;
  const out: string[] = [];
  for (let m = start; m <= s.month; m++) out.push(`${s.year}-${String(m).padStart(2, '0')}`);
  return out;
}
function periodLabel(s: Scenario): string {
  if (s.periodType === 'monthly') return `${MONTHS_IT[s.month - 1][0].toUpperCase()}${MONTHS_IT[s.month - 1].slice(1)} ${s.year}`;
  if (s.periodType === 'quarterly') return `Q${s.quarter} ${s.year}`;
  if (s.periodType === 'semiannual') return `${s.semester}° semestre ${s.year}`;
  return `Anno ${s.year}`;
}

// ─── Synthetic macro (TheBull-shaped month pages, invented content) ──────────

const FACTS: Record<Mood, Array<[string, string, string]>> = {
  'risk-on': [
    ['banche-centrali', 'Eurozona', 'La BCE lascia il tasso sui depositi al 2,00% e segnala che il ciclo di tagli è concluso.'],
    ['azionario', 'Stati Uniti', "L'S&P 500 chiude il mese su un nuovo massimo storico, guidato dai titoli tecnologici."],
    ['inflazione', 'Eurozona', "L'inflazione dell'area euro scende al 2,1% annuo, in linea con l'obiettivo."],
    ['crescita', 'Eurozona', 'Il PMI composito dell\'area euro sale a 52,4, il livello più alto da due anni.'],
    ['obbligazionario', 'Italia', 'Lo spread BTP-Bund si restringe a 85 punti base.'],
    ['materie-prime', 'Globale', "L'oro si stabilizza dopo il rialzo dei mesi precedenti."],
    ['cambio', 'Globale', "L'euro si rafforza a 1,17 sul dollaro."],
  ],
  'risk-off': [
    ['azionario', 'Globale', "L'MSCI World perde oltre il 6% nel mese in euro, con vendite concentrate sui titoli tecnologici."],
    ['politica', 'Stati Uniti', 'Nuovi dazi annunciati sulle importazioni europee aumentano la volatilità.'],
    ['tassi', 'Stati Uniti', 'Il rendimento del Treasury decennale scende al 3,9% per la fuga verso i titoli rifugio.'],
    ['materie-prime', 'Globale', "L'oro sale sopra i 3.300 dollari l'oncia."],
    ['crescita', 'Eurozona', 'Il PMI manifatturiero tedesco torna sotto 50.'],
    ['obbligazionario', 'Italia', 'Lo spread BTP-Bund si allarga a 135 punti base.'],
    ['cambio', 'Globale', 'Il dollaro si indebolisce contro euro e franco svizzero.'],
  ],
  neutral: [
    ['banche-centrali', 'Stati Uniti', 'La Fed mantiene i tassi invariati e rinvia ogni taglio alle prossime riunioni.'],
    ['azionario', 'Europa', "L'Euro Stoxx 50 chiude il mese quasi invariato dopo oscillazioni ampie."],
    ['inflazione', 'Stati Uniti', "L'inflazione core statunitense resta al 3,0%."],
    ['debito-pubblico', 'Italia', "Un'agenzia di rating conferma il giudizio sull'Italia con outlook stabile."],
    ['crescita', 'Italia', "Il PIL italiano cresce dello 0,1% trimestre su trimestre."],
    ['materie-prime', 'Globale', 'Il petrolio Brent oscilla tra 65 e 70 dollari al barile.'],
  ],
  mixed: [
    ['azionario', 'Stati Uniti', 'Forte rotazione settoriale: tecnologia in calo, energia e finanziari in rialzo.'],
    ['tassi', 'Eurozona', 'Il rendimento del Bund decennale risale al 2,7%.'],
    ['banche-centrali', 'Eurozona', 'La BCE taglia di 25 punti base, ma la conferenza stampa raffredda le attese su ulteriori tagli.'],
    ['obbligazionario', 'Globale', 'Le obbligazioni a lunga scadenza perdono terreno sul rialzo dei rendimenti.'],
    ['materie-prime', 'Globale', "L'oro corregge del 4% dopo il massimo di inizio mese."],
    ['crescita', 'Stati Uniti', 'Il mercato del lavoro statunitense rallenta: 90.000 nuovi occupati, sotto le attese.'],
  ],
};
const THESES: Record<Mood, string[]> = {
  'risk-on': ["Secondo l'autore le valutazioni azionarie USA sono tirate e il rendimento atteso dei prossimi anni è più basso della media storica.", "L'autore ritiene che i BTP restino interessanti per chi cerca cedole, ma senza allungare troppo la durata."],
  'risk-off': ["Per l'autore la correzione è una reazione alla politica commerciale più che un cambio del ciclo economico.", "L'autore invita a non vendere in preda al panico e a usare la liquidità solo secondo il piano."],
  neutral: ["L'autore considera probabile una lunga fase laterale dei tassi.", "Secondo l'autore la diversificazione in oro ha fatto il suo lavoro negli ultimi due anni."],
  mixed: ["L'autore vede rischi sulla duration lunga finché l'inflazione dei servizi resta alta.", "Per l'autore la rotazione settoriale premia chi è diversificato a livello globale."],
};
const FTSE: Record<Mood, string[]> = { 'risk-on': ['+2.40%', '+21.30%'], 'risk-off': ['-7.10%', '+4.60%'], neutral: ['+0.90%', '+12.10%'], mixed: ['+1.20%', '+10.50%'] };
const INDEX: Record<Mood, string[]> = {
  'risk-on': ['+3.12%', '+18.40%'], 'risk-off': ['-6.35%', '+2.10%'], neutral: ['+0.40%', '+9.80%'], mixed: ['-0.90%', '+7.20%'],
};

function macroPage(month: string, mood: Mood): string {
  const facts = FACTS[mood];
  const weeks: MacroWeekRecord[] = [0, 1, 2].map((w) => {
    const date = `${month}-${String(7 + 7 * w).padStart(2, '0')}`;
    const slice = facts.filter((_, i) => i % 3 === w);
    return {
      week: `${month.slice(0, 4)}-W${String(Number(month.slice(5)) * 4 + w).padStart(2, '0')}`,
      date, issue: w + 1, headline: `Settimana ${w + 1} di ${monthLabel(month)}`, subtitle: '', model: 'sintetico',
      compiledAt: `${date}T10:00:00Z`, rawPath: `raw/thebull/${date}.md`,
      extraction: {
        fatti: slice.map(([area, paese, sintesi]) => ({ area, paese, sintesi, citazione: sintesi })),
        tesi: w === 2 ? THESES[mood].map((sintesi) => ({ area: 'azionario', sintesi, citazione: sintesi })) : [],
        spunti: [],
      },
      dropped: [],
      indices: {
        horizons: ['1 mese', '1 anno'],
        rows: [
          { name: 'MSCI All Country World', values: INDEX[mood] },
          { name: 'FTSE MIB', values: FTSE[mood] },
          { name: 'Bloomberg Euro Aggregate', values: [mood === 'risk-off' ? '+0.80%' : mood === 'mixed' ? '-1.10%' : '+0.30%', '+3.40%'] },
          { name: 'Oro', values: [mood === 'risk-off' ? '+4.20%' : mood === 'mixed' ? '-4.00%' : '+0.60%', '+21.00%'] },
        ],
        caption: 'Variazioni in % in Euro.',
      },
      readings: [], episodes: [],
    } as unknown as MacroWeekRecord;
  });
  return renderMonthPage(month, weeks, `${month}-28T10:00:00Z`);
}

const DIGEST = `---
tipo: digest
---

# Principi — digest

## Allocazione e ribilanciamento

- **Il portafoglio segue un'allocazione strategica**: 60% azioni globali, 25% obbligazioni, 5% oro, 10% liquidità.
- **Si ribilancia con i nuovi versamenti, non con le vendite**: vendere solo se una classe è fuori dalla banda 5/25 per più di un trimestre.
- **Mai spostare pesi per motivi di mercato** o per le notizie del mese.

## Comportamento

- Il PAC mensile non si sospende nei mesi negativi: un calo è un'occasione di comprare a prezzi più bassi.
- Il fondo di emergenza (6 mesi di spese) non si investe.
- La leva si usa solo in piccola parte e solo su ETF a leva giornaliera ampiamente diversificati, mai oltre 1,2× sul portafoglio.

## Spesa

- Il tasso di risparmio è la leva più importante: obiettivo almeno il 30% delle entrate.
- Le spese straordinarie si pianificano con un obiettivo dedicato, non si pescano dal portafoglio.
`;

// ─── Scenario → prompt ───────────────────────────────────────────────────────

function build(s: Scenario) {
  const income = s.income.reduce((a, r) => a + r.cur, 0);
  const activeCats = s.cats.filter((c) => c.cur > 0).sort((a, b) => b.cur - a.cur);
  const expenses = activeCats.reduce((a, c) => a + c.cur, 0);
  const netSavings = income - expenses;
  const invested = s.trades.reduce((a, t) => a + (t.inv ?? 0), 0);
  const proceeds = s.trades.reduce((a, t) => a + (t.proc ?? 0), 0);
  const taxes = s.trades.reduce((a, t) => a + (t.tax ?? 0), 0);
  const debtRepaid = s.debtRepaid ?? 0;

  // Class moves: cash absorbs savings, trades, taxes withheld, dividends and untracked movements.
  const moves = new Map<string, { market: number; traded: number; paidIn: number; other: number }>();
  for (const m of s.moves) moves.set(m.band, { market: m.market, traded: m.traded ?? 0, paidIn: m.paidIn ?? 0, other: m.other ?? 0 });
  const cash = moves.get('cash') ?? { market: 0, traded: 0, paidIn: 0, other: 0 };
  cash.other += netSavings - invested + proceeds - taxes + s.dividends.total + (s.extraOther ?? 0);
  moves.set('cash', cash);
  if (debtRepaid) {
    const re = moves.get('realestate') ?? { market: 0, traded: 0, paidIn: 0, other: 0 };
    re.other += debtRepaid;
    moves.set('realestate', re);
  }
  const end: Record<string, number> = { ...s.start };
  for (const [band, m] of moves) {
    const cls = band === 'pension' ? 'bonds' : band;
    end[cls] = (end[cls] ?? 0) + m.market + m.traded + m.paidIn + m.other;
  }
  for (const k of Object.keys(end)) end[k] = round(end[k]);
  const nwStart = Object.values(s.start).reduce((a, b) => a + b, 0);
  const nwEnd = Object.values(end).reduce((a, b) => a + b, 0);
  const market = [...moves.values()].reduce((a, m) => a + m.market, 0);
  const pension = [...moves.values()].reduce((a, m) => a + m.paidIn, 0);
  const growth = nwEnd - nwStart;
  const drivers = {
    netWorthGrowth: growth, netSavings, market, taxes, debtRepaid, pensionContributions: pension,
    other: growth - netSavings - market + taxes - debtRepaid - pension,
    isMarketMeasured: !s.marketNotMeasured,
  };
  if (s.marketNotMeasured) {
    // Without per-instrument detail the market is the remainder of what the ledger names.
    drivers.market = growth - netSavings - pension + taxes - debtRepaid;
    drivers.other = 0;
  }

  const classMoves = s.marketNotMeasured || s.missingStart ? null : {
    rows: [...moves.entries()]
      .filter(([, m]) => Math.abs(m.market) + Math.abs(m.traded) + Math.abs(m.paidIn) + Math.abs(m.other) >= 1)
      .map(([band, m]) => ({ band, label: CLASS_LABEL[band], market: m.market, traded: m.traded, paidIn: m.paidIn, other: m.other, valueChange: m.market + m.traded + m.paidIn + m.other })),
    unassigned: null,
  };

  // Allocation on the portfolio (everything but real estate), 5/25 band.
  const portfolio = Object.entries(end).filter(([k]) => k !== 'realestate');
  const base = portfolio.reduce((a, [, v]) => a + v, 0);
  const classes = Object.keys({ ...Object.fromEntries(portfolio), ...s.targets }).map((assetClass) => {
    const value = end[assetClass] ?? 0;
    const cur = (value / base) * 100 * (s.leverage && assetClass === 'equity' ? 1 : 1);
    const tgt = s.targets[assetClass] ?? 0;
    const pp = cur - tgt;
    const off = Math.abs(pp) > 5 || (tgt > 0 && Math.abs(pp) > tgt * 0.25);
    return {
      assetClass, label: CLASS_LABEL[assetClass], currentPercentage: cur, targetPercentage: tgt, differencePp: pp,
      differenceValue: (pp / 100) * base, currentValue: value, action: off ? (pp > 0 ? 'VENDI' : 'COMPRA') : 'OK', dormant: false,
    };
  });
  const group = (count: number, total: number) => ({ count, total, holdings: [], rows: [] });
  const allocation = s.missingStart ? null : {
    marketValue: base,
    leverageRatio: s.leverage ?? 1,
    hasLeveragedExposure: !!s.leverage,
    fromGoals: false,
    classes,
    offTarget: classes.filter((c) => c.action !== 'OK'),
    subCategories: (s.sleeves ?? []).map((sl) => ({
      assetClass: sl.assetClass, subCategory: sl.subCategory, currentPercentage: sl.share,
      targetPercentage: sl.target, differencePp: sl.target === null ? null : sl.share - sl.target,
      currentValue: round(((end[sl.assetClass] ?? 0) * sl.share) / 100),
    })),
    frozen: group(0, 0),
    excluded: end.realestate ? group(1, end.realestate) : group(0, 0),
    unmatched: [],
  };

  // 50/30/20 on income (F6b N2).
  const need = activeCats.filter((c) => c.role === 'need').reduce((a, c) => a + c.cur, 0);
  const want = activeCats.filter((c) => c.role === 'want').reduce((a, c) => a + c.cur, 0);
  const savedRows = activeCats.filter((c) => c.role === 'saving').reduce((a, c) => a + c.cur, 0);
  const surplus = Math.max(0, income - expenses);
  const deficit = Math.max(0, expenses - income);
  const roleBase = income + deficit;
  const rolePct = (v: number) => Math.round((v / roleBase) * 100);
  const rows = [
    { bucket: 'need', label: 'Bisogni', amount: need, percentage: rolePct(need) },
    { bucket: 'want', label: 'Desideri', amount: want, percentage: rolePct(want) },
    { bucket: 'saving', label: 'Risparmi', amount: savedRows + surplus, percentage: 0 },
  ];
  rows[2].percentage = 100 - rows[0].percentage - rows[1].percentage;
  const expensesByRole = { base: roleBase, income, rows, saved: savedRows, surplus, deficit };

  // Comparison.
  const label = periodLabel(s);
  const categoryDeltas = activeCats.slice(0, MAX_CATEGORY_DELTAS).map((c) => ({
    name: c.name, current: c.cur, vsPrevious: delta(c.prev, c.cur), vsYoy: c.yoy === null || !s.yoy ? null : delta(c.yoy, c.cur),
  }));
  const comparison = {
    previousEqualsYoy: s.periodType === 'yearly',
    vsPrevious: {
      baselineLabel: s.prev.label,
      netWorth: s.missingStart ? null : delta(nwStart, nwEnd),
      income: delta(s.prev.income, income),
      expenses: delta(s.prev.expenses, expenses),
      savings: delta(s.prev.income - s.prev.expenses, netSavings),
    },
    vsYoy: s.yoy
      ? {
          baselineLabel: s.yoy.label,
          netWorth: delta(s.yoy.nw, nwEnd),
          income: s.yoy.income === null ? null : delta(s.yoy.income, income),
          expenses: delta(s.yoy.expenses, expenses),
          savings: s.yoy.income === null ? null : delta(s.yoy.income - s.yoy.expenses, netSavings),
        }
      : { baselineLabel: '—', netWorth: null, income: null, expenses: null, savings: null },
    categoryDeltas,
    droppedCategories: s.cats.filter((c) => c.cur === 0 && c.prev > 0).map((c) => ({ name: c.name, previous: c.prev })),
  };

  const tradesOut = s.trades.map((t, i) => ({
    assetId: `a${i}`, name: t.name, buys: t.buys ?? 0, sells: t.sells ?? 0, boughtQuantity: t.bq ?? 0, soldQuantity: t.sq ?? 0,
    invested: t.inv ?? 0, proceeds: t.proc ?? 0, estimatedTax: t.sells ? (t.tax ?? null) : null, legs: t.legs, leverageRatio: t.lev ?? 1,
  })).sort((a, b) => b.invested + b.proceeds - (a.invested + a.proceeds));
  const periodSales = proceeds > 0
    ? {
        proceeds, realizedGain: s.sales?.realizedGain ?? 0, estimatedTax: taxes, taxIsWithheld: s.sales?.taxIsWithheld ?? true,
        instruments: s.trades.filter((t) => t.proc).map((t, i) => ({ id: `s${i}`, name: t.name, proceeds: t.proc!, realizedGain: s.sales?.realizedGain ?? 0, estimatedTax: t.tax ?? null })),
        brokenLedgers: 0, purchases: invested > 0 ? { amount: invested } : null,
      }
    : null;

  const typeTotals = new Map<string, number>();
  for (const c of activeCats) typeTotals.set(c.type, (typeTotals.get(c.type) ?? 0) + c.cur);

  const emailData = {
    periodType: s.periodType, year: s.year, month: s.month, quarter: s.quarter, semester: s.semester,
    currentNetWorth: nwEnd, previousNetWorth: s.missingStart ? 0 : nwStart, netWorthDelta: s.missingStart ? 0 : growth,
    netWorthDeltaPct: s.missingStart ? 0 : (growth / nwStart) * 100,
    liquidNetWorth: nwEnd - (end.realestate ?? 0),
    byAssetClass: end, previousByAssetClass: s.start,
    totalIncome: income, totalExpenses: expenses,
    topExpenseCategories: activeCats.map((c) => ({ key: c.name, name: c.name, amount: c.cur })),
    allIncomeCategories: s.income.map((r) => ({ key: r.name, name: r.name, amount: r.cur })),
    topIndividualExpenses: [], topIndividualIncome: [],
    expensesByType: [...typeTotals].map(([type, amount]) => ({ type, label: TYPE_LABEL[type], amount })),
    expensesByRole,
    dividendTotal: s.dividends.total, dividendCount: s.dividends.count,
    hallOfFameRank: s.hof ? { ...s.hof, scope: s.periodType === 'yearly' ? 'year' : 'month' } : undefined,
    budgetAlerts: (s.alerts ?? []).map((a) => ({
      key: a.label, label: a.label, level: a.level, period: 'monthly', calendarPct: 100, aheadOfCalendar: true, threshold: a.threshold,
      spent: a.spent, budgetAmount: a.budget, usedRatio: a.spent / a.budget, forecastedOverrun: a.forecast, thresholdCrossed: true, crossedOn: null,
    })),
    expenseSplit: s.split ? splitSummary(s.split) : undefined,
    periodSales,
    drivers: s.missingStart ? null : drivers,
    classMoves,
    allocation,
    trades: tradesOut,
    periodReturn: s.twr === null ? null : {
      value: s.twr,
      label: s.periodType === 'monthly' ? 'nel mese' : s.periodType === 'quarterly' ? 'nei 3 mesi' : s.periodType === 'semiannual' ? 'nei 6 mesi' : 'annualizzato',
      baseLabel: "Base: portafoglio gestito, al netto dei fondi pensione e degli asset esclusi dall'allocazione.",
    },
  };

  const months = windowMonths(s);
  const bundle = {
    selector: { year: s.year, month: s.month },
    currentSnapshot: { totalNetWorth: nwEnd, liquidNetWorth: emailData.liquidNetWorth, byAssetClass: end, byAsset: [] },
    previousSnapshot: null,
    cashflow: {
      totalIncome: income, totalExpenses: -expenses, totalDividends: 0, netCashFlow: income - expenses,
      transactionCount: s.income.reduce((a, r) => a + r.tx, 0) + activeCats.reduce((a, c) => a + c.tx, 0),
      expenseTransactionCount: activeCats.reduce((a, c) => a + c.tx, 0),
    },
    netWorth: s.missingStart
      ? { start: null, end: nwEnd, delta: null, deltaPct: null }
      : { start: nwStart, end: nwEnd, delta: growth, deltaPct: (growth / nwStart) * 100 },
    allocationChanges: [],
    expensesByCategory: activeCats.map((c) => ({
      categoryName: c.name, total: -c.cur, transactionCount: c.tx,
      subCategories: (c.subs ?? []).map(([n, v, tx]) => ({ subCategoryName: n, total: -v, transactionCount: tx })),
    })),
    incomeByCategory: s.income.map((r) => ({ categoryName: r.name, total: r.cur, transactionCount: r.tx })),
    expensesByType: [...typeTotals].map(([type, amount]) => ({ type, label: TYPE_LABEL[type], total: -amount })),
    topIndividualExpenses: s.top.map(([date, categoryName, sub, amount, notes]) => ({ date, categoryName, ...(sub ? { subCategoryName: sub } : {}), amount: -amount, ...(notes ? { notes } : {}) })),
    bySubCategoryAllocation: {},
    targetAllocation: null,
    targetAllocationSource: 'manual',
    goals: s.goals
      ? {
          enabled: true, goalDrivenAllocationEnabled: false,
          items: s.goals.map((g) => ({
            name: g.name, targetAmount: g.target, targetDateIso: g.date, priority: 'high', currentValue: g.current,
            monthlyContribution: g.monthly, verdict: g.verdict, requiredMonthlyContribution: g.required,
            projectedValueAtDeadline: g.projected, assumedAnnualReturn: g.ret,
          })),
        }
      : null,
    expenseCategories: s.cats.map((c) => ({ name: c.name, type: c.type, subCategories: (c.subs ?? []).map(([n]) => n) })),
    dataQuality: {
      hasSnapshot: true, hasPreviousBaseline: !s.missingStart, hasCashflowData: true, isPartialMonth: false,
      notes: [
        `Finestra di analisi: ${label} (${months.length} ${months.length === 1 ? 'mese' : 'mesi'}).`,
        ...(s.missingStart ? ["Snapshot patrimoniale di inizio periodo assente: la variazione del patrimonio non è calcolabile."] : []),
        ...(s.notes ?? []),
      ],
    },
  };

  const preferences: AssistantPreferences = { responseStyle: 'balanced', includeMacroContext: false, memoryEnabled: true, includeDummySnapshots: false };
  const now = new Date('2026-10-01T00:00:00Z');
  const memory = [
    ['goal', "Vuole raggiungere l'indipendenza finanziaria (FIRE) intorno ai 50 anni; oggi ne ha 36."],
    ['preference', 'Investe con un PAC mensile su ETF a basso costo e non fa market timing.'],
    ['fact', 'Vive in coppia con Giulia; hanno una casa con mutuo a tasso fisso fino al 2045.'],
    ['risk', 'Tollera bene la volatilità azionaria, è diffidente verso la leva.'],
  ].map(([category, text], i) => ({ id: `m${i}`, userId: 'u', category, text, status: 'active', createdAt: now, updatedAt: now }));

  let wiki: EmailWikiContext | null = null;
  if (s.wiki) {
    const depth = MACRO_DEPTH[s.periodType];
    const present = months.filter((m) => s.wiki!.moods[m]);
    wiki = {
      principles: s.wiki.principles ? cleanPrinciplesDigest(DIGEST) : null,
      months: present.map((m) => ({ month: m, page: prepareMacroMonthPage(macroPage(m, s.wiki!.moods[m]), depth) })),
      missingMonths: months.filter((m) => !s.wiki!.moods[m]),
      depth,
    };
  }

  // The fixtures are hand-built plain data: the casts stand where the app's own types are wider
  // than what a scenario needs (Firestore snapshots, Expense rows).
  const { system, userContent } = buildEmailAiPrompt(
    emailData as unknown as MonthlyEmailData,
    comparison as unknown as PeriodComparison,
    bundle as unknown as AssistantMonthContextBundle,
    preferences,
    memory as unknown as AssistantMemoryItem[],
    wiki
  );
  if (process.env.SYNTH_DEBUG) console.error(`   ${s.id}: entrate ${income} uscite ${expenses} risparmio ${netSavings} crescita ${growth} mercato ${round(drivers.market)} altre ${round(drivers.other)} NW ${nwStart}→${nwEnd} liquidità ${end.cash}`);
  const macro = wiki && wiki.months.length > 0 ? formatMacroForPrompt(wiki).join('\n') : null;
  // The checks split the prompt on these strings: they must be in it verbatim (as in `freeze`).
  if (macro && !userContent.includes(macro)) throw new Error(`${s.id}: the macro block is not verbatim in the user message`);
  if (wiki?.principles && !system.includes(wiki.principles)) throw new Error(`${s.id}: the digest is not verbatim in the system block`);
  return {
    system, user: userContent, budget: emailAiOutputBudget(s.periodType), wordLimit: EMAIL_PERIODIC_WORD_LIMITS[s.periodType],
    wiki: wiki ? { macro, principles: wiki.principles as string | null } : null,
  };
}

function splitSummary(sp: NonNullable<Scenario['split']>) {
  const toSplit = Math.max(0, sp.commonTotal - sp.commonIncome);
  const totalIncome = sp.members.reduce((a, m) => a + m.income, 0);
  return {
    basis: { kind: 'computed' },
    common: { total: sp.commonTotal, income: sp.commonIncome, toSplit, surplus: Math.max(0, sp.commonIncome - sp.commonTotal) },
    members: sp.members.map((m) => {
      const share = m.income / totalIncome;
      const commonShare = round(toSplit * share);
      return { member: { id: m.name, name: m.name }, income: m.income, share, commonShare, personalSpending: m.personal, remaining: m.income - commonShare - m.personal };
    }),
    unassigned: { total: 0, rowCount: 0, income: 0, incomeRowCount: 0 },
    commonExpenses: [],
  };
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const at = process.argv.indexOf('--dir');
const out = at >= 0 ? process.argv[at + 1] : undefined;
if (!out) throw new Error('Usage: npm run ai:eval:synth -- --dir <d>');
mkdirSync(join(out, 'bundles'), { recursive: true });
const ids: string[] = [];
for (const s of SCENARIOS) {
  const p = build(s);
  const bundle = {
    id: s.id,
    label: periodLabel(s),
    reason: `sintetico: ${s.titolo}`,
    contract: { kind: 'periodic', wordLimit: p.wordLimit, comparisonsMerged: s.periodType === 'yearly', form: 'narrative' },
    system: p.system,
    user: p.user,
    maxTokens: p.budget.maxTokens,
    reasoningMaxTokens: p.budget.reasoningMaxTokens,
    ...(p.wiki ? { wiki: p.wiki } : {}),
    /** The scenario's traps: what a reader checks first (not sent to the models). */
    traps: s.trappole,
  };
  writeFileSync(join(out, 'bundles', `${s.id}.json`), JSON.stringify(bundle, null, 2));
  ids.push(s.id);
  console.log(`${s.id.padEnd(38)} ${periodLabel(s).padEnd(20)} ${String(p.system.length + p.user.length).padStart(6)} caratteri`);
}
writeFileSync(join(out, 'bundles.json'), JSON.stringify(ids, null, 2));
console.log(`\n${ids.length} bundle sintetici in ${join(out, 'bundles')}`);
