/** 20 synthetic scenarios for the Optima benchmark. Every figure is invented. */
type PT = 'monthly' | 'quarterly' | 'semiannual' | 'yearly';
type Mood = 'risk-on' | 'risk-off' | 'neutral' | 'mixed';

export interface Cat { name: string; type: 'fixed' | 'variable' | 'debt'; role: 'need' | 'want' | 'saving'; cur: number; prev: number; yoy: number | null; tx: number; subs?: Array<[string, number, number]> }
export interface Move { band: string; market: number; traded?: number; paidIn?: number; other?: number }
export interface Trade { name: string; legs: Array<{ assetClass: string; percentage: number; subCategory?: string }>; lev?: number; buys?: number; bq?: number; inv?: number; sells?: number; sq?: number; proc?: number; tax?: number | null }
export interface Scenario {
  id: string; titolo: string; periodType: PT; year: number; month: number; quarter?: number; semester?: number;
  start: Record<string, number>;
  moves: Move[];
  extraOther?: number; // untracked movements on cash, ends in «altre variazioni»
  income: Array<{ name: string; cur: number; tx: number }>;
  cats: Cat[];
  prev: { label: string; income: number; expenses: number };
  yoy: { label: string; nw: number; income: number | null; expenses: number } | null;
  targets: Record<string, number>;
  sleeves?: Array<{ assetClass: string; subCategory: string; share: number; target: number | null }>;
  leverage?: number;
  trades: Trade[];
  sales?: { realizedGain: number; taxIsWithheld: boolean };
  debtRepaid?: number;
  twr: number | null;
  dividends: { total: number; count: number };
  hof?: { rank: number; total: number; trend: 'growth' | 'decline' };
  alerts?: Array<{ label: string; level: 'exceeded' | 'warning'; threshold: number; spent: number; budget: number; forecast: boolean }>;
  split?: { commonTotal: number; commonIncome: number; members: Array<{ name: string; income: number; personal: number }> };
  goals?: Array<{ name: string; target?: number; date?: string; current: number; monthly?: number; verdict?: string; required?: number; projected?: number; ret?: number }>;
  top: Array<[string, string, string | null, number, string?]>;
  wiki: { moods: Record<string, Mood>; principles: boolean } | null;
  missingStart?: boolean;
  marketNotMeasured?: boolean;
  notes?: string[];
  trappole: string[]; // task-specific grading criteria (Italian)
}



/** The household's usual monthly spending, scaled to `months`, with per-category overrides. */
function std(months: number, over: Partial<Record<string, Partial<Cat>>> = {}, drift = { prev: 0.96, yoy: 0.93 }): Cat[] {
  const base: Cat[] = [
    { name: 'Mutuo', type: 'debt', role: 'need', cur: 780, prev: 780, yoy: 780, tx: 1, subs: [['Rata', 780, 1]] },
    { name: 'Casa', type: 'fixed', role: 'need', cur: 290, prev: 0, yoy: 0, tx: 3, subs: [['Bollette', 205, 2], ['Condominio', 85, 1]] },
    { name: 'Alimentari', type: 'variable', role: 'need', cur: 540, prev: 0, yoy: 0, tx: 9, subs: [['Supermercato', 470, 7], ['Mercato', 70, 2]] },
    { name: 'Trasporti', type: 'variable', role: 'need', cur: 210, prev: 0, yoy: 0, tx: 5, subs: [['Carburante', 140, 3], ['Abbonamento treno', 70, 1]] },
    { name: 'Ristoranti', type: 'variable', role: 'want', cur: 240, prev: 0, yoy: 0, tx: 5 },
    { name: 'Shopping', type: 'variable', role: 'want', cur: 170, prev: 0, yoy: 0, tx: 3 },
    { name: 'Abbonamenti', type: 'fixed', role: 'want', cur: 55, prev: 0, yoy: 0, tx: 4, subs: [['Streaming', 30, 2], ['Palestra', 25, 1]] },
    { name: 'Salute', type: 'variable', role: 'need', cur: 60, prev: 0, yoy: 0, tx: 2 },
  ];
  return base.map((c) => {
    const k = months;
    const cur = Math.round(c.cur * k);
    const merged: Cat = {
      ...c,
      cur,
      prev: c.name === 'Mutuo' ? cur : Math.round(cur * drift.prev),
      yoy: c.name === 'Mutuo' ? cur : Math.round(cur * drift.yoy),
      tx: Math.max(1, Math.round(c.tx * k)),
      subs: c.subs?.map(([n, v, tx]) => [n, Math.round(v * k), Math.max(1, Math.round(tx * k))] as [string, number, number]),
      ...(over[c.name] ?? {}),
    };
    return merged;
  }).concat(Object.entries(over).filter(([n]) => !base.some((b) => b.name === n)).map(([name, c]) => ({ name, type: 'variable', role: 'want', cur: 0, prev: 0, yoy: 0, tx: 1, ...c } as Cat)));
}
const sum = (cats: Cat[], key: 'cur' | 'prev' | 'yoy') => cats.reduce((a, c) => a + (c[key] ?? 0), 0);

const START = { equity: 112000, bonds: 39000, commodity: 9500, cash: 27000, realestate: 96000 };
const TARGETS = { equity: 60, bonds: 25, commodity: 5, cash: 10 };
const VWCE = { name: 'VWCE', legs: [{ assetClass: 'equity', percentage: 100, subCategory: 'Globale' }] };
const AGGH = { name: 'AGGH', legs: [{ assetClass: 'bonds', percentage: 100, subCategory: 'Aggregate globale' }] };
const SGLD = { name: 'SGLD', legs: [{ assetClass: 'commodity', percentage: 100, subCategory: 'Oro' }] };
const BTP = { name: 'BTP 2033', legs: [{ assetClass: 'bonds', percentage: 100, subCategory: 'Governativi Italia' }] };
const pac = (inv = 1000, q = 8.1) => ({ ...VWCE, buys: 1, bq: q, inv });

const SAL = (n: number, extra: Array<{ name: string; cur: number; tx: number }> = []) => [{ name: 'Stipendio', cur: 3200 * n, tx: n }, ...extra];

// ─── Mensili ──────────────────────────────────────────────────────────────────

const m01 = std(1);
const m02 = std(1, { Ristoranti: { cur: 190, prev: 250, yoy: 230 } });
const m03 = std(1, {
  Ristoranti: { cur: 610, prev: 250, yoy: 280, tx: 11 },
  Shopping: { cur: 1240, prev: 190, yoy: 210, tx: 7, subs: [['Abbigliamento', 520, 4], ['Elettronica', 720, 1]] },
  Alimentari: { cur: 690, prev: 520, yoy: 500, tx: 12 },
});
const m04 = std(1);
const m05 = std(1);
const m06 = std(1, {
  Casa: { cur: 2690, prev: 300, yoy: 280, tx: 4, subs: [['Manutenzione', 2400, 1], ['Bollette', 205, 2], ['Condominio', 85, 1]] },
  Viaggi: { cur: 0, prev: 1150, yoy: 640, tx: 0, type: 'variable', role: 'want' },
});
const m08 = std(1, {
  Viaggi: { cur: 2950, prev: 0, yoy: 2600, tx: 6, type: 'variable', role: 'want', subs: [['Volo', 680, 2], ['Alloggio', 1720, 3], ['Esperienze', 550, 1]] },
  Ristoranti: { cur: 590, prev: 230, yoy: 540, tx: 12 },
  Shopping: { cur: 420, prev: 160, yoy: 300, tx: 4 },
});

export const SCENARIOS: Scenario[] = [
  {
    id: 'T01-mensile-buono', titolo: 'Mensile: mese buono, PAC regolare, mercato in rialzo',
    periodType: 'monthly', year: 2026, month: 5,
    start: START, moves: [{ band: 'equity', market: 3350, traded: 1000 }, { band: 'bonds', market: 120 }, { band: 'commodity', market: -90 }, { band: 'cash', market: 45 }],
    income: SAL(1), cats: m01, prev: { label: 'Aprile 2026', income: 3200, expenses: sum(m01, 'prev') }, yoy: { label: 'Maggio 2025', nw: 248000, income: 3050, expenses: sum(m01, 'yoy') },
    targets: TARGETS, trades: [pac()], twr: 1.9, dividends: { total: 0, count: 0 }, hof: { rank: 5, total: 31, trend: 'growth' },
    top: [['2026-05-02', 'Mutuo', 'Rata', 780], ['2026-05-18', 'Alimentari', 'Supermercato', 132], ['2026-05-24', 'Ristoranti', null, 96, 'cena compleanno']],
    wiki: { moods: { '2026-05': 'risk-on' }, principles: true },
    trappole: [
      "Il risparmio del mese (entrate meno uscite) e l'effetto mercato sono attribuiti con le cifre del blocco DA COSA VIENE LA VARIAZIONE, senza ricalcolarle.",
      "Il PAC da 1.000 € su VWCE è descritto come investimento (denaro spostato), non come spesa né come rendimento.",
      "La Hall of Fame (5° su 31) è letta come piazzamento 'tra le crescite più forti', non come serie di mesi consecutivi.",
    ],
  },
  {
    id: 'T02-mensile-negativo', titolo: 'Mensile: mese negativo, calo di mercato, PAC mantenuto',
    periodType: 'monthly', year: 2026, month: 3,
    start: { ...START, equity: 118500 }, moves: [{ band: 'equity', market: -7650, traded: 1000 }, { band: 'bonds', market: 310 }, { band: 'commodity', market: 420 }, { band: 'cash', market: 40 }],
    income: SAL(1), cats: m02, prev: { label: 'Febbraio 2026', income: 3200, expenses: sum(m02, 'prev') }, yoy: { label: 'Marzo 2025', nw: 241000, income: 3050, expenses: sum(m02, 'yoy') },
    targets: TARGETS, trades: [pac(1000, 8.9)], twr: -4.3, dividends: { total: 0, count: 0 }, hof: { rank: 2, total: 9, trend: 'decline' },
    top: [['2026-03-02', 'Mutuo', 'Rata', 780], ['2026-03-11', 'Alimentari', 'Supermercato', 118]],
    wiki: { moods: { '2026-03': 'risk-off' }, principles: true },
    trappole: [
      "Il calo del patrimonio è attribuito al mercato azionario (circa −7.650 € sulle Azioni) e non al risparmio, che resta positivo.",
      "Il contesto macro (dazi, calo dell'MSCI World) è usato per spiegare il mercato del portafoglio senza presentare cifre macro come cifre del portafoglio.",
      "Collega il PAC mantenuto nel mese negativo al principio dichiarato 'il PAC non si sospende nei mesi negativi', nominandolo.",
      "Il 2° posto tra i cali è letto come 'tra i cali più marcati' (2° su 9), senza drammatizzare né inventare serie.",
    ],
  },
  {
    id: 'T03-mensile-budget-sforati', titolo: 'Mensile: spese anomale e budget superati',
    periodType: 'monthly', year: 2026, month: 2,
    start: START, moves: [{ band: 'equity', market: 900, traded: 1000 }, { band: 'bonds', market: 60 }, { band: 'commodity', market: 210 }, { band: 'cash', market: 30 }],
    income: SAL(1), cats: m03, prev: { label: 'Gennaio 2026', income: 3200, expenses: 2330 }, yoy: { label: 'Febbraio 2025', nw: 238000, income: 3050, expenses: 2410 },
    targets: TARGETS, trades: [pac()], twr: 0.7, dividends: { total: 0, count: 0 }, hof: { rank: 24, total: 31, trend: 'growth' },
    alerts: [
      { label: 'Shopping', level: 'exceeded', threshold: 100, spent: 1240, budget: 250, forecast: true },
      { label: 'Ristoranti', level: 'exceeded', threshold: 100, spent: 610, budget: 300, forecast: true },
      { label: 'Alimentari', level: 'warning', threshold: 80, spent: 690, budget: 750, forecast: false },
    ],
    top: [['2026-02-14', 'Shopping', 'Elettronica', 720, 'notebook'], ['2026-02-02', 'Mutuo', 'Rata', 780], ['2026-02-21', 'Ristoranti', null, 140, 'San Valentino'], ['2026-02-08', 'Shopping', 'Abbigliamento', 310]],
    wiki: { moods: { '2026-02': 'neutral' }, principles: true },
    trappole: [
      "Nomina i due budget superati (Shopping 1.240 € su 250 €, Ristoranti 610 € su 300 €) e l'avviso all'80% su Alimentari con le cifre esatte.",
      "Lega lo sforamento dello Shopping alla singola spesa del notebook (720 €) invece di parlare di un generico aumento.",
      "Dice che il mese chiude con uscite (3.935 €) oltre le entrate (3.200 €), deficit coperto dal patrimonio, e lo confronta con l'obiettivo di risparmio del 30% dei principi senza inventare percentuali.",
    ],
  },
  {
    id: 'T04-mensile-acquisti-grandi', titolo: 'Mensile: grandi acquisti dalla liquidità (non sono spese)',
    periodType: 'monthly', year: 2026, month: 6,
    start: { ...START, cash: 46000 }, moves: [{ band: 'equity', market: 1380, traded: 10000 }, { band: 'bonds', market: -150, traded: 5000 }, { band: 'commodity', market: 140 }, { band: 'cash', market: 60 }],
    income: SAL(1, [{ name: 'Rimborsi', cur: 240, tx: 1 }]), cats: m04, prev: { label: 'Maggio 2026', income: 3200, expenses: sum(m04, 'prev') }, yoy: { label: 'Giugno 2025', nw: 251000, income: 3050, expenses: sum(m04, 'yoy') },
    targets: TARGETS, trades: [{ ...VWCE, buys: 2, bq: 79.3, inv: 10000 }, { ...AGGH, buys: 1, bq: 1035, inv: 5000 }], twr: 0.8, dividends: { total: 0, count: 0 }, hof: { rank: 18, total: 31, trend: 'growth' },
    top: [['2026-06-02', 'Mutuo', 'Rata', 780], ['2026-06-15', 'Alimentari', 'Supermercato', 125]],
    wiki: { moods: { '2026-06': 'neutral' }, principles: true },
    notes: ["La liquidità in eccesso rispetto al target è stata investita in due tranche il 3 e il 17 giugno."],
    trappole: [
      "Gli acquisti da 15.000 € (VWCE 10.000 €, AGGH 5.000 €) sono descritti come liquidità spostata in investimenti: NON come spese, NON come rendimento, NON come calo del risparmio o del patrimonio.",
      "Il forte calo della liquidità è spiegato dagli acquisti, citando il totale del blocco OPERAZIONI.",
      "AGGH è chiamato obbligazionario (classe dal blocco), non dedotto dal ticker in modo diverso.",
      "Collega l'investimento della liquidità in eccesso al target del 10% di liquidità o al principio sul fondo di emergenza, senza inventare il valore del fondo.",
    ],
  },
  {
    id: 'T05-mensile-vendita-tassata', titolo: 'Mensile: vendita con plusvalenza e tasse trattenute',
    periodType: 'monthly', year: 2026, month: 7,
    start: { ...START, equity: 131000, cash: 21000 }, moves: [{ band: 'equity', market: 1240, traded: 1000 - 18000 }, { band: 'bonds', market: 90 }, { band: 'commodity', market: 60 }, { band: 'cash', market: 35 }],
    income: SAL(1, [{ name: 'Quattordicesima', cur: 2900, tx: 1 }]), cats: m05, prev: { label: 'Giugno 2026', income: 3440, expenses: sum(m05, 'prev') }, yoy: { label: 'Luglio 2025', nw: 255000, income: 5800, expenses: sum(m05, 'yoy') },
    targets: TARGETS, trades: [{ ...VWCE, buys: 1, bq: 7.6, inv: 1000, sells: 1, sq: 132, proc: 18000, tax: 1310 }], sales: { realizedGain: 5040, taxIsWithheld: true },
    twr: 0.6, dividends: { total: 0, count: 0 }, hof: { rank: 12, total: 32, trend: 'growth' },
    top: [['2026-07-02', 'Mutuo', 'Rata', 780], ['2026-07-19', 'Alimentari', 'Supermercato', 141]],
    wiki: { moods: { '2026-07': 'mixed' }, principles: true },
    notes: ['La vendita di VWCE serve ad accantonare la liquidità per un obiettivo di acquisto auto nel 2027.'],
    trappole: [
      "La tassa di 1.310 € trattenuta sulla vendita è indicata come costo della vendita (riga 'tasse sulle vendite'), non come perdita di mercato.",
      "Cita i 18.000 € incassati e la plusvalenza realizzata senza inventare il prezzo medio di carico o il numero di quote residue.",
      "La quattordicesima (2.900 €) è riconosciuta come entrata straordinaria che gonfia il risparmio del mese.",
      "Valuta la vendita alla luce del principio 'si ribilancia con i nuovi versamenti, non con le vendite' in modo esplicito (la nota dice che è per un obiettivo, non per ribilanciare).",
    ],
  },
  {
    id: 'T06-mensile-categoria-a-zero', titolo: 'Mensile: Viaggi scesi a zero e spesa straordinaria per la casa',
    periodType: 'monthly', year: 2026, month: 9,
    start: START, moves: [{ band: 'equity', market: 2050, traded: 1000 }, { band: 'bonds', market: 280 }, { band: 'commodity', market: 330 }, { band: 'cash', market: 40 }],
    income: SAL(1), cats: m06, prev: { label: 'Agosto 2026', income: 3200, expenses: 3350 }, yoy: { label: 'Settembre 2025', nw: 252000, income: 3050, expenses: 2600 },
    targets: TARGETS, trades: [pac()], twr: 1.3, dividends: { total: 0, count: 0 }, hof: { rank: 14, total: 33, trend: 'growth' },
    top: [['2026-09-09', 'Casa', 'Manutenzione', 2400, 'sostituzione caldaia'], ['2026-09-02', 'Mutuo', 'Rata', 780], ['2026-09-20', 'Alimentari', 'Supermercato', 120]],
    wiki: { moods: { '2026-09': 'risk-on' }, principles: true },
    trappole: [
      "Nota che i Viaggi sono scesi a zero (1.150 € nel mese precedente, nessuna spesa ora) leggendolo dalla riga 'Scese a zero'.",
      "Attribuisce l'aumento della categoria Casa alla sostituzione della caldaia (2.400 €, spesa una tantum), non a un nuovo livello stabile.",
      "Collega la spesa straordinaria al principio 'le spese straordinarie si pianificano con un obiettivo dedicato' (osservazione, non rimprovero).",
    ],
  },
  {
    id: 'T07-mensile-dati-mancanti', titolo: 'Mensile: snapshot di inizio periodo mancante, niente macro',
    periodType: 'monthly', year: 2026, month: 1, missingStart: true,
    start: START, moves: [{ band: 'equity', market: 1500, traded: 1000 }, { band: 'bonds', market: 40 }],
    income: SAL(1), cats: std(1), prev: { label: 'Dicembre 2025', income: 6050, expenses: 2900 }, yoy: { label: 'Gennaio 2025', nw: 236000, income: 3050, expenses: 2390 },
    targets: TARGETS, trades: [pac()], twr: null, dividends: { total: 85, count: 1 },
    top: [['2026-01-02', 'Mutuo', 'Rata', 780], ['2026-01-12', 'Casa', 'Bollette', 160]],
    wiki: { moods: {}, principles: true },
    trappole: [
      "Dice chiaramente che la variazione del patrimonio del mese e l'allocazione non sono calcolabili (snapshot di inizio mancante) e NON stima un effetto mercato o un rendimento.",
      "Non inventa un rendimento del mese, né scostamenti dai target, né un contesto macro (nessun blocco macro presente).",
      "Spiega il calo delle entrate rispetto a dicembre (6.050 € → 3.200 €) come assenza della tredicesima solo come ipotesi dichiarata.",
    ],
  },
  {
    id: 'T08-mensile-deficit-divisione', titolo: 'Mensile: uscite oltre le entrate (vacanze) e divisione delle spese di coppia',
    periodType: 'monthly', year: 2026, month: 8,
    start: START, moves: [{ band: 'equity', market: -420, traded: 1000 }, { band: 'bonds', market: 150 }, { band: 'commodity', market: 190 }, { band: 'cash', market: 40 }],
    income: [{ name: 'Stipendio', cur: 3200, tx: 1 }, { name: 'Stipendio Giulia', cur: 2350, tx: 1 }], cats: m08,
    prev: { label: 'Luglio 2026', income: 8450, expenses: sum(m08, 'prev') }, yoy: { label: 'Agosto 2025', nw: 254000, income: 5350, expenses: sum(m08, 'yoy') },
    targets: TARGETS, trades: [pac()], twr: -0.2, dividends: { total: 0, count: 0 }, hof: { rank: 6, total: 9, trend: 'decline' },
    split: { commonTotal: 5100, commonIncome: 0, members: [{ name: 'Marco', income: 3200, personal: 410 }, { name: 'Giulia', income: 2350, personal: 380 }] },
    top: [['2026-08-05', 'Viaggi', 'Alloggio', 1720, 'Sardegna, due settimane'], ['2026-08-02', 'Mutuo', 'Rata', 780], ['2026-08-04', 'Viaggi', 'Volo', 680]],
    wiki: { moods: { '2026-08': 'neutral' }, principles: true },
    trappole: [
      "Dice che le uscite (5.895 €) hanno superato le entrate (5.550 €) e che il deficit di 345 € è coperto dal patrimonio, con le cifre del blocco 50/30/20, senza inventarne altre.",
      "Lega le uscite alte alle vacanze (Viaggi 2.950 €, alloggio in Sardegna) e nota che è un evento stagionale (agosto 2025 simile), come ipotesi dichiarata.",
      "Riporta la divisione di coppia con le quote e il 'resta' di Marco e Giulia esattamente come nel blocco DIVISIONE.",
    ],
  },

  // ─── Trimestrali ────────────────────────────────────────────────────────────

  {
    id: 'T09-trimestrale-volatile', titolo: 'Trimestrale: trimestre volatile, chiusura leggermente negativa',
    periodType: 'quarterly', year: 2026, month: 3, quarter: 1,
    start: START, moves: [{ band: 'equity', market: -2650, traded: 3000 }, { band: 'bonds', market: 420 }, { band: 'commodity', market: 760 }, { band: 'cash', market: 120 }],
    income: SAL(3), cats: std(3, { Ristoranti: { cur: 1040, prev: 760, yoy: 690, tx: 21 } }), prev: { label: 'Q4 2025', income: 12450, expenses: 7500 }, yoy: { label: 'Q1 2025', nw: 238500, income: 9150, expenses: 6950 },
    targets: TARGETS, trades: [pac(3000, 24.6)].map((t) => ({ ...t, buys: 3 })), twr: -1.2, dividends: { total: 85, count: 1 },
    top: [['2026-02-14', 'Shopping', 'Elettronica', 720, 'notebook'], ['2026-01-02', 'Mutuo', 'Rata', 780], ['2026-02-02', 'Mutuo', 'Rata', 780], ['2026-03-02', 'Mutuo', 'Rata', 780]],
    wiki: { moods: { '2026-01': 'risk-on', '2026-02': 'neutral', '2026-03': 'risk-off' }, principles: true },
    trappole: [
      "Racconta il trimestre come sequenza (due mesi tranquilli o positivi poi marzo negativo) solo sulla base del contesto macro mensile, senza inventare il risultato del singolo mese del portafoglio.",
      "Distingue il TWR (−1,2% nei 3 mesi) dalla variazione del patrimonio, che include risparmio e PAC.",
      "Nota che oro e obbligazioni hanno attenuato il calo azionario (righe di ANDAMENTO PER CLASSE), collegandolo alla diversificazione.",
    ],
  },
  {
    id: 'T10-trimestrale-leva', titolo: 'Trimestrale: introduzione di un ETF a leva 2×',
    periodType: 'quarterly', year: 2026, month: 6, quarter: 2, leverage: 1.12,
    start: START, moves: [{ band: 'equity', market: 5200, traded: 9000 }, { band: 'bonds', market: -240 }, { band: 'commodity', market: 180 }, { band: 'cash', market: 110 }],
    income: SAL(3), cats: std(3), prev: { label: 'Q1 2026', income: 9600, expenses: 7480 }, yoy: { label: 'Q2 2025', nw: 246000, income: 9150, expenses: 7050 },
    targets: TARGETS, trades: [{ ...VWCE, buys: 3, bq: 24.1, inv: 3000 }, { name: 'SPXL2', legs: [{ assetClass: 'equity', percentage: 100, subCategory: 'USA' }], lev: 2, buys: 2, bq: 41, inv: 6000 }],
    sleeves: [{ assetClass: 'equity', subCategory: 'Globale', share: 82, target: 90 }, { assetClass: 'equity', subCategory: 'USA', share: 18, target: 10 }],
    twr: 4.6, dividends: { total: 0, count: 0 },
    top: [['2026-04-02', 'Mutuo', 'Rata', 780], ['2026-05-02', 'Mutuo', 'Rata', 780], ['2026-06-02', 'Mutuo', 'Rata', 780]],
    wiki: { moods: { '2026-04': 'neutral', '2026-05': 'risk-on', '2026-06': 'risk-on' }, principles: true },
    trappole: [
      "Identifica SPXL2 come Azioni USA con leva 2× (dal blocco) e riporta la leva del portafoglio 1,12× senza confonderla con quella dello strumento.",
      "Confronta la leva introdotta con il principio 'mai oltre 1,2× sul portafoglio' e con la memoria 'diffidente verso la leva': nota la tensione apertamente, senza moralismi.",
      "Non presenta i 6.000 € investiti nell'ETF a leva come guadagno; il rendimento si legge dal TWR (+4,6%).",
    ],
  },
  {
    id: 'T11-trimestrale-cambio-di-vita', titolo: 'Trimestrale: cambio di lavoro, TFR liquidato e nascita di un figlio',
    periodType: 'quarterly', year: 2026, month: 9, quarter: 3,
    start: { ...START, cash: 31000 }, moves: [{ band: 'equity', market: 3900, traded: 3000 }, { band: 'bonds', market: 610, traded: 4000 }, { band: 'commodity', market: 420 }, { band: 'cash', market: 140 }],
    income: [{ name: 'Stipendio', cur: 5400, tx: 2 }, { name: 'Liquidazione TFR', cur: 6800, tx: 1 }, { name: 'Assegno unico', cur: 340, tx: 2 }],
    cats: std(3, {
      Bambino: { cur: 1650, prev: 0, yoy: 0, tx: 14, type: 'variable', role: 'need', subs: [['Pannolini e cura', 420, 8], ['Arredo cameretta', 980, 2], ['Visite', 250, 4]] },
      Ristoranti: { cur: 310, prev: 720, yoy: 690, tx: 6 },
    }),
    prev: { label: 'Q2 2026', income: 9600, expenses: 7380 }, yoy: { label: 'Q3 2025', nw: 252000, income: 9150, expenses: 7200 },
    targets: TARGETS, trades: [{ ...pac(3000, 23.9), buys: 3 }, { ...BTP, buys: 1, bq: 4000, inv: 4000 }], twr: 2.0, dividends: { total: 1250, count: 3 },
    top: [['2026-08-01', 'Bambino', 'Arredo cameretta', 870, 'culla e fasciatoio'], ['2026-07-02', 'Mutuo', 'Rata', 780], ['2026-08-02', 'Mutuo', 'Rata', 780], ['2026-09-02', 'Mutuo', 'Rata', 780]],
    wiki: { moods: { '2026-07': 'mixed', '2026-08': 'neutral', '2026-09': 'risk-on' }, principles: true },
    notes: ["Lo stipendio ha due accrediti nel trimestre invece di tre."],
    trappole: [
      "Riconosce la nuova categoria Bambino come cambio di vita (nascita), dichiarandolo come ipotesi coerente con i dati, non come errore di registrazione.",
      "Spiega che le entrate del trimestre sono gonfiate dalla liquidazione del TFR (6.800 €, una tantum) mentre lo stipendio ha solo due accrediti: legge il possibile cambio di lavoro come ipotesi.",
      "Distingue i dividendi/cedole del registro (1.250 € in 3 pagamenti) dalle entrate del cashflow, senza sommarli.",
      "Il BTP da 4.000 € è un investimento obbligazionario, non una spesa.",
    ],
  },
  {
    id: 'T12-trimestrale-mercato-non-misurato', titolo: 'Trimestrale: mercato non misurato strumento per strumento',
    periodType: 'quarterly', year: 2025, month: 12, quarter: 4, marketNotMeasured: true,
    start: { ...START, equity: 104000 }, moves: [{ band: 'equity', market: 4100, traded: 3000 }, { band: 'bonds', market: -180 }, { band: 'commodity', market: 650 }],
    extraOther: 900,
    income: SAL(3, [{ name: 'Tredicesima', cur: 2850, tx: 1 }]), cats: std(3, { Shopping: { cur: 980, prev: 430, yoy: 900, tx: 9, subs: [['Regali di Natale', 760, 7], ['Abbigliamento', 220, 2]] } }),
    prev: { label: 'Q3 2025', income: 9150, expenses: 7200 }, yoy: { label: 'Q4 2024', nw: 221000, income: 11900, expenses: 7900 },
    targets: TARGETS, trades: [{ ...pac(3000, 25.3), buys: 3 }], twr: null, dividends: { total: 640, count: 2 },
    top: [['2025-12-20', 'Shopping', 'Regali di Natale', 430], ['2025-10-02', 'Mutuo', 'Rata', 780], ['2025-11-02', 'Mutuo', 'Rata', 780], ['2025-12-02', 'Mutuo', 'Rata', 780]],
    wiki: { moods: { '2025-10': 'neutral', '2025-11': 'risk-on', '2025-12': 'neutral' }, principles: true },
    trappole: [
      "Presenta l'effetto mercato come STIMA residua (non misurato strumento per strumento), non come rendimento, e non attribuisce variazioni di mercato a singole classi.",
      "Non inventa un TWR (assente) né un rendimento per classe.",
      "Riconosce tredicesima e regali di Natale come stagionalità di fine anno, confrontandoli con il Q4 2024.",
    ],
  },
  {
    id: 'T13-trimestrale-fuori-target', titolo: 'Trimestrale: rally azionario, Azioni fuori target secondo la regola 5/25',
    periodType: 'quarterly', year: 2025, month: 9, quarter: 3,
    start: { equity: 118000, bonds: 36000, commodity: 9000, cash: 17000, realestate: 93000 }, moves: [{ band: 'equity', market: 14200, traded: 3000 }, { band: 'bonds', market: -320 }, { band: 'commodity', market: 900 }, { band: 'cash', market: 50 }],
    income: SAL(3), cats: std(3), prev: { label: 'Q2 2025', income: 9150, expenses: 7000 }, yoy: { label: 'Q3 2024', nw: 213000, income: 8700, expenses: 6800 },
    targets: TARGETS, trades: [{ ...pac(3000, 26.4), buys: 3 }], twr: 8.3, dividends: { total: 0, count: 0 },
    top: [['2025-07-02', 'Mutuo', 'Rata', 780], ['2025-08-02', 'Mutuo', 'Rata', 780], ['2025-09-02', 'Mutuo', 'Rata', 780]],
    wiki: { moods: { '2025-07': 'risk-on', '2025-08': 'risk-on', '2025-09': 'risk-on' }, principles: true },
    trappole: [
      "Segnala le classi fuori target (Azioni +8,5 p.p., Obbligazioni −6,9 p.p.) con gli scarti del blocco ALLOCAZIONE, non con le percentuali della composizione sul patrimonio intero.",
      "Applica i principi: ribilanciare con i nuovi versamenti (indirizzare il PAC su obbligazioni/liquidità), vendere solo se fuori banda per più di un trimestre; non raccomanda di vendere subito.",
      "Cita le tesi dell'autore (valutazioni USA tirate) come opinioni attribuite, non come fatti.",
    ],
  },

  // ─── Semestrali ─────────────────────────────────────────────────────────────

  {
    id: 'T14-semestrale-mutuo-previdenza', titolo: 'Semestrale: semestre positivo con mutuo e fondo pensione',
    periodType: 'semiannual', year: 2026, month: 6, semester: 1, debtRepaid: 2950,
    start: START, moves: [{ band: 'equity', market: 6100, traded: 6000 }, { band: 'bonds', market: 380 }, { band: 'commodity', market: 1450 }, { band: 'cash', market: 220 }, { band: 'pension', market: 610, paidIn: 2900 }],
    income: SAL(6, [{ name: 'Rimborso 730', cur: 640, tx: 1 }]), cats: std(6), prev: { label: '2° semestre 2025', income: 21500, expenses: 15100 }, yoy: { label: '1° semestre 2025', nw: 240000, income: 18300, expenses: 14200 },
    targets: TARGETS, trades: [{ ...pac(6000, 48.7), buys: 6 }], twr: 4.1, dividends: { total: 85, count: 1 },
    top: [['2026-02-14', 'Shopping', 'Elettronica', 720, 'notebook'], ['2026-01-02', 'Mutuo', 'Rata', 780], ['2026-06-02', 'Mutuo', 'Rata', 780]],
    wiki: { moods: { '2026-01': 'risk-on', '2026-02': 'neutral', '2026-03': 'risk-off', '2026-04': 'neutral', '2026-05': 'risk-on', '2026-06': 'neutral' }, principles: true },
    trappole: [
      "Spiega i 'motori' della crescita con le righe del Driver: risparmio, mercato, mutuo rimborsato (2.950 €) e versamenti al fondo pensione (2.900 €), senza fonderli in un unico 'guadagno'.",
      "Spiega che i versamenti al fondo pensione non passano dal cashflow e non sono rendimento.",
      "Distingue la rata del mutuo come spesa (cashflow) dalla quota capitale rimborsata che aumenta il patrimonio netto.",
    ],
  },
  {
    id: 'T15-semestrale-negativo-vendite', titolo: 'Semestrale: semestre negativo, vendita di oro in guadagno per comprare obbligazioni',
    periodType: 'semiannual', year: 2025, month: 12, semester: 2,
    start: { equity: 121000, bonds: 31000, commodity: 15500, cash: 22000, realestate: 94000 }, moves: [{ band: 'equity', market: -9400, traded: 6000 }, { band: 'bonds', market: -620, traded: 6500 }, { band: 'commodity', market: 1900, traded: -6500 }, { band: 'cash', market: 200 }],
    income: SAL(6, [{ name: 'Tredicesima', cur: 2850, tx: 1 }]), cats: std(6), prev: { label: '1° semestre 2025', income: 18300, expenses: 14200 }, yoy: { label: '2° semestre 2024', nw: 236000, income: 20900, expenses: 14800 },
    targets: TARGETS,
    trades: [{ ...pac(6000, 50.2), buys: 6 }, { ...AGGH, buys: 2, bq: 1370, inv: 6500 }, { ...SGLD, sells: 1, sq: 26, proc: 6500, tax: 410 }], sales: { realizedGain: 1580, taxIsWithheld: true },
    twr: -3.9, dividends: { total: 640, count: 2 },
    top: [['2025-12-20', 'Shopping', null, 430, 'regali'], ['2025-07-02', 'Mutuo', 'Rata', 780], ['2025-12-02', 'Mutuo', 'Rata', 780]],
    wiki: { moods: { '2025-07': 'risk-on', '2025-08': 'risk-on', '2025-10': 'risk-off', '2025-11': 'mixed', '2025-12': 'neutral' }, principles: true },
    trappole: [
      "Riconosce che per settembre 2025 manca la pagina macro e non ne inventa il contesto.",
      "Descrive la vendita di SGLD (oro, 6.500 € incassati, 410 € di tasse) e l'acquisto di AGGH (obbligazioni) come ribilanciamento, valutandolo rispetto al principio 'vendere solo se fuori banda per più di un trimestre'.",
      "Il calo è attribuito alle Azioni (mercato −9.400 €), con l'oro in guadagno; i totali di acquisti e vendite sono quelli del blocco.",
    ],
  },
  {
    id: 'T16-semestrale-senza-wiki', titolo: 'Semestrale: nessun contesto macro né principi (Wiki assente)',
    periodType: 'semiannual', year: 2025, month: 6, semester: 1,
    start: { equity: 101000, bonds: 35500, commodity: 8200, cash: 21000, realestate: 91000 }, moves: [{ band: 'equity', market: 2350, traded: 6000 }, { band: 'bonds', market: 290 }, { band: 'commodity', market: 1650 }, { band: 'cash', market: 180 }],
    income: [{ name: 'Stipendio', cur: 18300, tx: 6 }], cats: std(6), prev: { label: '2° semestre 2024', income: 20900, expenses: 14800 }, yoy: { label: '1° semestre 2024', nw: 222000, income: 17800, expenses: 13700 },
    targets: TARGETS, trades: [{ ...pac(6000, 52.4), buys: 6 }], twr: 2.4, dividends: { total: 0, count: 0 },
    top: [['2025-03-02', 'Mutuo', 'Rata', 780], ['2025-05-17', 'Ristoranti', null, 180, 'anniversario']],
    wiki: null,
    trappole: [
      "Non cita eventi macro, banche centrali o notizie di mercato né principi dell'investitore: nessun blocco li fornisce.",
      "Non promette né nomina sezioni o dati assenti (macro, principi).",
      "Il rendimento (TWR +2,4% nei 6 mesi) è distinto dalla crescita del patrimonio dovuta al risparmio e al PAC.",
    ],
  },

  // ─── Annuali ────────────────────────────────────────────────────────────────

  {
    id: 'T17-annuale-record', titolo: 'Annuale: anno record, obiettivo FIRE in linea',
    periodType: 'yearly', year: 2025, month: 12,
    start: { equity: 89000, bonds: 33000, commodity: 7200, cash: 19500, realestate: 89500 }, debtRepaid: 5800,
    moves: [{ band: 'equity', market: 15600, traded: 12000 }, { band: 'bonds', market: 650, traded: 2000 }, { band: 'commodity', market: 2950 }, { band: 'cash', market: 380 }, { band: 'pension', market: 1150, paidIn: 5600 }],
    income: [{ name: 'Stipendio', cur: 36600, tx: 12 }, { name: 'Tredicesima', cur: 2850, tx: 1 }, { name: 'Bonus', cur: 4200, tx: 1 }], cats: std(12, { Viaggi: { cur: 4300, prev: 3600, yoy: 3600, tx: 11, type: 'variable', role: 'want' } }),
    prev: { label: 'Anno 2024', income: 38700, expenses: 29600 }, yoy: { label: 'Anno 2024', nw: 238200, income: 38700, expenses: 29600 },
    targets: TARGETS, trades: [{ ...pac(12000, 103.5), buys: 12 }, { ...AGGH, buys: 1, bq: 420, inv: 2000 }], twr: 11.8, dividends: { total: 725, count: 3 }, hof: { rank: 1, total: 5, trend: 'growth' },
    goals: [
      { name: 'Indipendenza finanziaria', target: 1100000, date: '2039-12-31', current: 152000, monthly: 1000, verdict: 'onTrack', required: 940, projected: 1160000, ret: 5.6 },
      { name: 'Auto nuova', target: 18000, date: '2027-06-30', current: 9500, monthly: 400, verdict: 'offTrack', required: 470, projected: 16900, ret: 2.1 },
    ],
    top: [['2025-08-06', 'Viaggi', null, 1900, 'Giappone'], ['2025-02-14', 'Shopping', null, 650, 'telefono'], ['2025-11-03', 'Casa', 'Bollette', 260]],
    wiki: { moods: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`2025-${String(i + 1).padStart(2, '0')}`, (['neutral', 'risk-on', 'risk-off', 'risk-off', 'risk-on', 'risk-on', 'risk-on', 'risk-on', 'mixed', 'neutral', 'risk-on', 'neutral'] as const)[i]])), principles: true },
    trappole: [
      "Riconosce il 1° posto su 5 nella Hall of Fame degli anni come anno migliore registrato, con la crescita del Driver.",
      "Riporta gli obiettivi con i loro verdetti: Indipendenza finanziaria in linea, Auto nuova in ritardo (servono 470 €/mese contro 400 €), dichiarando che le proiezioni poggiano sul rendimento ipotizzato.",
      "Usa il bonus (4.200 €) e la tredicesima come entrate straordinarie nella lettura del tasso di risparmio, senza calcolare un nuovo tasso non fornito.",
      "Sintetizza l'anno macro (marzo-aprile negativi, poi recupero) senza attribuire cifre macro al portafoglio.",
    ],
  },
  {
    id: 'T18-annuale-calo-2022', titolo: 'Annuale: anno di calo di azioni e obbligazioni insieme, solo principi',
    periodType: 'yearly', year: 2022, month: 12,
    start: { equity: 61000, bonds: 26500, commodity: 4100, cash: 24000, realestate: 81000 }, debtRepaid: 5300,
    moves: [{ band: 'equity', market: -8900, traded: 10500 }, { band: 'bonds', market: -3700, traded: 1500 }, { band: 'commodity', market: 240 }, { band: 'cash', market: 20 }],
    income: [{ name: 'Stipendio', cur: 31800, tx: 12 }, { name: 'Tredicesima', cur: 2450, tx: 1 }], cats: std(12, { Casa: { cur: 4950, prev: 3100, yoy: 3100, tx: 36, subs: [['Bollette', 3930, 24], ['Condominio', 1020, 12]] } }, { prev: 0.92, yoy: 0.92 }),
    prev: { label: 'Anno 2021', income: 32600, expenses: 25100 }, yoy: { label: 'Anno 2021', nw: 196600, income: 32600, expenses: 25100 },
    targets: TARGETS, trades: [{ ...pac(10500, 108), buys: 12 }, { ...BTP, buys: 1, bq: 1500, inv: 1500 }], twr: -10.6, dividends: { total: 260, count: 2 }, hof: { rank: 1, total: 1, trend: 'decline' },
    top: [['2022-11-08', 'Casa', 'Bollette', 610, 'gas'], ['2022-12-07', 'Casa', 'Bollette', 580, 'gas'], ['2022-08-10', 'Ristoranti', null, 160]],
    wiki: { moods: {}, principles: true },
    trappole: [
      "Nessun blocco macro: non presenta come dati forniti eventi dell'anno (inflazione, tassi, guerra) che non sono nel prompt, o se li evoca li dichiara come conoscenza generale e non come dati del periodo.",
      "Nota che azioni e obbligazioni sono scese insieme (righe di ANDAMENTO PER CLASSE), con la diversificazione che non ha protetto, e che il patrimonio è comunque cresciuto grazie a risparmio, PAC e mutuo.",
      "Attribuisce l'aumento della categoria Casa alle bollette (3.930 €), citando le singole bollette del gas.",
      "La Hall of Fame (1° su 1 tra i cali) non è presentata come record significativo: c'è un solo anno di calo registrato.",
    ],
  },
  {
    id: 'T19-annuale-tanti-strumenti', titolo: 'Annuale: molte operazioni (oltre 15 strumenti), compositi e obiettivi in ritardo',
    periodType: 'yearly', year: 2023, month: 12,
    start: { equity: 66300, bonds: 25000, commodity: 4340, cash: 21000, realestate: 86300 }, debtRepaid: 5450,
    moves: [{ band: 'equity', market: 9100, traded: 5200 }, { band: 'bonds', market: 1100, traded: 2700 }, { band: 'commodity', market: 520, traded: 1100 }, { band: 'cash', market: 410 }],
    income: [{ name: 'Stipendio', cur: 33600, tx: 12 }, { name: 'Tredicesima', cur: 2600, tx: 1 }], cats: std(12),
    prev: { label: 'Anno 2022', income: 34250, expenses: 27700 }, yoy: { label: 'Anno 2022', nw: 202950, income: 34250, expenses: 27700 },
    targets: TARGETS,
    trades: [
      { name: 'VNGA60', legs: [{ assetClass: 'equity', percentage: 60, subCategory: 'Globale' }, { assetClass: 'bonds', percentage: 40, subCategory: 'Aggregate globale' }], buys: 4, bq: 75, inv: 2500 },
      ...['IWDA', 'EIMI', 'ZPRV', 'ZPRX', 'XDEM', 'IUSN', 'CSPX', 'MEUD', 'SWDA', 'IS3N', 'VFEM', 'CNDX', 'EXSA', 'WSML', 'XDWT', 'XDWH'].map((name, i) => ({ name, legs: [{ assetClass: 'equity', percentage: 100 }], buys: 1, bq: 3 + i, inv: i < 4 ? 400 : 120 })),
      { ...BTP, buys: 2, bq: 1700, inv: 1700 }, { ...SGLD, buys: 1, bq: 6, inv: 1100 },
    ],
    twr: 9.2, dividends: { total: 410, count: 4 }, hof: { rank: 3, total: 3, trend: 'growth' },
    goals: [
      { name: 'Indipendenza finanziaria', target: 1100000, date: '2039-12-31', current: 128000, monthly: 600, verdict: 'offTrack', required: 1150, projected: 870000, ret: 5.4 },
      { name: 'Fondo emergenza', target: 15000, current: 15000, verdict: 'reached' },
    ],
    top: [['2023-07-20', 'Viaggi', null, 1200, 'Grecia'], ['2023-03-02', 'Mutuo', 'Rata', 780], ['2023-10-15', 'Salute', null, 320, 'dentista']],
    wiki: { moods: {}, principles: true },
    notes: ["Nel 2023 molti acquisti piccoli e sparsi su ETF diversi: il PAC unico su VWCE parte dal 2024."],
    trappole: [
      "Usa i totali del blocco OPERAZIONI (investito e numero di acquisti) e la riga 'oltre i primi 15 restano N strumenti' invece di sommare a mano.",
      "VNGA60 è descritto come composito 60% azioni / 40% obbligazioni, non come solo azionario.",
      "Segnala l'obiettivo Indipendenza finanziaria in ritardo (1.150 €/mese richiesti contro 600 €) e lo collega alla frammentazione del portafoglio come osservazione dichiarata.",
      "Il 3° posto su 3 tra le crescite è letto come 'tra le crescite più deboli', non come un buon piazzamento.",
    ],
  },
  {
    id: 'T20-annuale-crypto-oro', titolo: 'Annuale: crypto ed oro in forte rialzo, classe crypto fuori dai target',
    periodType: 'yearly', year: 2024, month: 12,
    start: { equity: 72000, bonds: 26000, commodity: 4300, cash: 20500, crypto: 3100, realestate: 84000 }, debtRepaid: 5600,
    moves: [{ band: 'equity', market: 10800, traded: 7000 }, { band: 'bonds', market: 300, traded: 1000 }, { band: 'commodity', market: 1100 }, { band: 'cash', market: 520 }, { band: 'crypto', market: 3700, traded: 500 }],
    income: [{ name: 'Stipendio', cur: 34800, tx: 12 }, { name: 'Tredicesima', cur: 2700, tx: 1 }, { name: 'Vendita usato', cur: 1200, tx: 2 }], cats: std(12),
    prev: { label: 'Anno 2023', income: 36200, expenses: 27900 }, yoy: { label: 'Anno 2023', nw: 214000, income: 36200, expenses: 27900 },
    targets: TARGETS,
    trades: [{ ...pac(7000, 66), buys: 7 }, { name: 'BTC', legs: [{ assetClass: 'crypto', percentage: 100 }], buys: 2, bq: 0.009, inv: 500 }, { ...AGGH, buys: 1, bq: 220, inv: 1000 }],
    twr: 12.4, dividends: { total: 520, count: 3 }, hof: { rank: 2, total: 4, trend: 'growth' },
    top: [['2024-08-12', 'Viaggi', null, 1450, 'Portogallo'], ['2024-04-02', 'Mutuo', 'Rata', 780]],
    wiki: { moods: {}, principles: true },
    trappole: [
      "Nota che le Criptovalute hanno target 0% ma pesano il 4,8% del portafoglio (+3.700 € di mercato), quindi sono fuori dal piano di allocazione dichiarato nei principi.",
      "Non calcola nulla da sé: nessun rendimento percentuale della crypto inventato (il blocco dà solo euro).",
      "Riconosce il 2° posto su 4 tra le crescite annuali e collega l'anno buono soprattutto alle azioni.",
    ],
  },
];
