import { describe, expect, it } from 'vitest';

import {
  changedPairs,
  cholesky,
  compressUpperTriangle,
  correctUpperTriangle,
  expandUpperTriangle,
  identityMatrix,
  isPositiveSemiDefinite,
  minEigenvalue,
  nearestCorrelation,
  pairCount,
  symmetricEigen,
} from '@/lib/utils/correlationMatrix';
import { MONTE_CARLO_DEFAULT_CORRELATIONS } from '@/lib/constants/monteCarloMarketDefaults';
import { MONTE_CARLO_CLASSES } from '@/lib/constants/monteCarloClasses';

const N = MONTE_CARLO_CLASSES.length;
const A9 = [
  [1, 0.9, 0.9],
  [0.9, 1, -0.9],
  [0.9, -0.9, 1],
];

const multiplyLLt = (l: number[][]) => l.map((row, i) => l.map((_, j) => row.reduce((sum, _v, k) => sum + l[i][k] * l[j][k], 0)));

describe('upper-triangle helpers', () => {
  it('expands 21 values into a symmetric matrix with unit diagonal and back', () => {
    expect(pairCount(7)).toBe(21);
    const matrix = expandUpperTriangle(MONTE_CARLO_DEFAULT_CORRELATIONS, N);
    for (let i = 0; i < N; i++) {
      expect(matrix[i][i]).toBe(1);
      for (let j = 0; j < N; j++) expect(matrix[i][j]).toBe(matrix[j][i]);
    }
    // Azioni–Materie prime is the third pair, Trend–Carry last (README § 14.6).
    expect(matrix[0][3]).toBe(0.35);
    expect(matrix[5][6]).toBe(0.5);
    expect(compressUpperTriangle(matrix)).toEqual([...MONTE_CARLO_DEFAULT_CORRELATIONS]);
  });
});

describe('symmetricEigen', () => {
  it('reconstructs the matrix from values and vectors', () => {
    const matrix = expandUpperTriangle(MONTE_CARLO_DEFAULT_CORRELATIONS, N);
    const { values, vectors } = symmetricEigen(matrix);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const rebuilt = values.reduce((sum, lambda, k) => sum + lambda * vectors[i][k] * vectors[j][k], 0);
        expect(rebuilt).toBeCloseTo(matrix[i][j], 10);
      }
    }
    expect(values.reduce((a, b) => a + b, 0)).toBeCloseTo(N, 10); // trace
  });

  it('A9: the eigenvalues of the broken matrix are −0,8; 1,9; 1,9', () => {
    const values = symmetricEigen(A9).values.sort((a, b) => a - b);
    expect(values[0]).toBeCloseTo(-0.8, 8);
    expect(values[1]).toBeCloseTo(1.9, 8);
    expect(values[2]).toBeCloseTo(1.9, 8);
  });
});

describe('nearestCorrelation — rule R5', () => {
  it('A9: the broken matrix becomes ≈ ±0,5 and Cholesky succeeds', () => {
    expect(isPositiveSemiDefinite(A9)).toBe(false);
    const fixed = nearestCorrelation(A9);
    const expected = [
      [1, 0.5, 0.5],
      [0.5, 1, -0.5],
      [0.5, -0.5, 1],
    ];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) expect(Math.abs(fixed[i][j] - expected[i][j])).toBeLessThan(0.01);
      expect(fixed[i][i]).toBe(1);
    }
    expect(minEigenvalue(fixed)).toBeGreaterThanOrEqual(1e-6 - 1e-12);
    expect(() => cholesky(fixed)).not.toThrow();
  });

  it('a matrix that is already valid comes back unchanged (± 1e-12)', () => {
    const matrix = expandUpperTriangle(MONTE_CARLO_DEFAULT_CORRELATIONS, N);
    const out = nearestCorrelation(matrix);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) expect(Math.abs(out[i][j] - matrix[i][j])).toBeLessThan(1e-12);
  });

  it('A15: the default matrix is valid as it stands, minimum eigenvalue 0,42', () => {
    const matrix = expandUpperTriangle(MONTE_CARLO_DEFAULT_CORRELATIONS, N);
    expect(isPositiveSemiDefinite(matrix)).toBe(true);
    expect(minEigenvalue(matrix)).toBeGreaterThan(0.41);
    expect(minEigenvalue(matrix)).toBeLessThan(0.43);
    expect(correctUpperTriangle(MONTE_CARLO_DEFAULT_CORRELATIONS, N)).toEqual([...MONTE_CARLO_DEFAULT_CORRELATIONS]);
  });

  it('corrects a random-looking 7×7 into something Cholesky accepts, keeping a unit diagonal', () => {
    // All pairs at −0,9: seven classes cannot all be that anti-correlated (needs ρ ≥ −1/6).
    const pairs = new Array(21).fill(-0.9);
    const fixed = nearestCorrelation(expandUpperTriangle(pairs, N));
    for (let i = 0; i < N; i++) expect(fixed[i][i]).toBe(1);
    const factor = cholesky(fixed);
    const rebuilt = multiplyLLt(factor);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) expect(rebuilt[i][j]).toBeCloseTo(fixed[i][j], 10);
    // The nearest valid value is the boundary of feasibility: close to −1/6.
    expect(fixed[0][1]).toBeLessThan(-0.1);
    expect(fixed[0][1]).toBeGreaterThan(-0.25);
  });

  it('clips out-of-range and non-finite inputs instead of failing', () => {
    const fixed = nearestCorrelation(expandUpperTriangle([2, Number.NaN, ...new Array(19).fill(0)], N));
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) expect(Math.abs(fixed[i][j])).toBeLessThanOrEqual(1);
    expect(() => cholesky(fixed)).not.toThrow();
  });

  it('identity stays identity', () => {
    expect(nearestCorrelation(identityMatrix(N))).toEqual(identityMatrix(N));
  });
});

describe('cholesky', () => {
  it('recomposes the default matrix', () => {
    const matrix = expandUpperTriangle(MONTE_CARLO_DEFAULT_CORRELATIONS, N);
    const rebuilt = multiplyLLt(cholesky(matrix));
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) expect(rebuilt[i][j]).toBeCloseTo(matrix[i][j], 12);
  });

  it('throws on a matrix that is not positive definite', () => {
    expect(() => cholesky(A9)).toThrow();
  });
});

describe('changedPairs', () => {
  it('lists the pairs R5 moved by more than what the UI shows', () => {
    const written = new Array(21).fill(0);
    const used = [...written];
    used[3] = 0.2;
    used[4] = 0.001;
    expect(changedPairs(written, used)).toEqual([{ index: 3, written: 0, used: 0.2 }]);
  });
});
