interface BenchmarkComponent {
  ticker: string;
  weight: number; // 0.0 to 1.0, must sum to 1
  name: string;
}

export interface BenchmarkDefinition {
  id: string;
  name: string;
  description: string;
  color: string;
  components: BenchmarkComponent[];
}

export interface BenchmarkMonthlyReturn {
  year: number;
  month: number; // 1-12
  return: number; // decimal (e.g. 0.02 = +2%)
}

export interface BenchmarkReturnsResponse {
  benchmarkId: string;
  name: string;
  monthlyReturns: BenchmarkMonthlyReturn[];
  cachedAt: string; // ISO string
}

// Monthly EUR/USD exchange rate (EUR per 1 USD, end-of-month closing rate)
export interface FxMonthlyRate {
  year: number;
  month: number; // 1-12
  eurPerUsd: number; // e.g. 0.9147 means 1 USD = 0.9147 EUR
}

export interface FxRatesResponse {
  monthlyRates: FxMonthlyRate[];
  cachedAt: string; // ISO string
}

// Monthly ECB deposit facility rate (annual %)
export interface EcbMonthlyRate {
  year: number;
  month: number; // 1-12
  rate: number;  // annual %, e.g. 4.0
}

export interface EcbRatesResponse {
  monthlyRates: EcbMonthlyRate[];
  cachedAt: string; // ISO string
}
