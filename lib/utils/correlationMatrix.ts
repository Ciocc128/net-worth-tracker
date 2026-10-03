/**
 * Correlation-matrix toolkit of the Monte Carlo (doc/montecarlo/README.md § 6.2, rule R5).
 *
 * Pure and dependency-free: the matrices are 7×7, so the symmetric eigen-decomposition is a cyclic
 * Jacobi written here. The user types the 21 pairs of the upper triangle (`MONTE_CARLO_CLASSES`
 * order, row by row); an arbitrary set of pairs is generally NOT a valid correlation matrix, so
 * `nearestCorrelation` replaces it with the closest valid one (Higham 2002, alternating projections
 * with Dykstra's correction) and `cholesky` factors the result for the draws.
 */

export type Matrix = number[][];

/** The smallest eigenvalue a matrix handed to Cholesky may have (R5). */
export const MIN_EIGENVALUE = 1e-6;

const MAX_ITERATIONS = 200;
const TOLERANCE = 1e-9;

/** Number of pairs in the upper triangle of an `n × n` matrix: 21 for 7 classes. */
export const pairCount = (n: number): number => (n * (n - 1)) / 2;

/** The (row, column) of every pair, in upper-triangle order (row by row, left to right). */
export function pairIndices(n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.push([i, j]);
  return out;
}

export const identityMatrix = (n: number): Matrix => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));

const copyMatrix = (matrix: Matrix): Matrix => matrix.map((row) => row.slice());

/** Upper-triangle values (length `n(n−1)/2`) → the full symmetric matrix with a unit diagonal. */
export function expandUpperTriangle(values: readonly number[], n: number): Matrix {
  const matrix = identityMatrix(n);
  pairIndices(n).forEach(([i, j], index) => {
    const value = values[index] ?? 0;
    matrix[i][j] = value;
    matrix[j][i] = value;
  });
  return matrix;
}

/** The inverse of `expandUpperTriangle`. */
export function compressUpperTriangle(matrix: Matrix): number[] {
  return pairIndices(matrix.length).map(([i, j]) => matrix[i][j]);
}

/** Symmetric eigen-decomposition by cyclic Jacobi: `matrix = V · diag(values) · Vᵀ`, columns of `V` the eigenvectors. */
export function symmetricEigen(matrix: Matrix): { values: number[]; vectors: Matrix } {
  const n = matrix.length;
  const a = copyMatrix(matrix);
  const v = identityMatrix(n);

  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
    if (off < 1e-26) break;

    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: a.map((row, i) => row[i]), vectors: v };
}

export function minEigenvalue(matrix: Matrix): number {
  return Math.min(...symmetricEigen(matrix).values);
}

/** Positive semi-definite up to a numerical tolerance. */
export function isPositiveSemiDefinite(matrix: Matrix, tolerance = 1e-10): boolean {
  return minEigenvalue(matrix) >= -tolerance;
}

/** `V · diag(max(λ, floor)) · Vᵀ`. */
function reconstruct(values: number[], vectors: Matrix, floor: number): Matrix {
  const n = values.length;
  const out = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let k = 0; k < n; k++) {
    const lambda = Math.max(values[k], floor);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[i][j] += lambda * vectors[i][k] * vectors[j][k];
  }
  return out;
}

/** Rescales a covariance-like matrix to unit diagonal (`D^-1/2 · M · D^-1/2`) and re-symmetrises it. */
function toUnitDiagonal(matrix: Matrix): Matrix {
  const n = matrix.length;
  const scale = matrix.map((row, i) => 1 / Math.sqrt(Math.max(row[i], Number.EPSILON)));
  const out = identityMatrix(n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const value = Math.max(-1, Math.min(1, matrix[i][j] * scale[i] * scale[j]));
      out[i][j] = value;
      out[j][i] = value;
    }
  }
  return out;
}

const frobenius = (a: Matrix, b: Matrix): number => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < a.length; j++) sum += (a[i][j] - b[i][j]) ** 2;
  return Math.sqrt(sum);
};

/** True when the matrix has a unit diagonal and an eigenvalue floor high enough for Cholesky (`MIN_EIGENVALUE`). */
export function isUsableCorrelation(matrix: Matrix): boolean {
  return matrix.every((row, i) => Math.abs(row[i] - 1) < 1e-12) && minEigenvalue(matrix) >= MIN_EIGENVALUE;
}

/**
 * R5. The nearest correlation matrix in Frobenius norm (Higham 2002: alternating projections onto
 * the positive-semidefinite cone and the unit-diagonal set, with Dykstra's correction), then the
 * eigenvalues raised to at least `MIN_EIGENVALUE` and the diagonal renormalised to 1. A matrix
 * that is already usable comes back unchanged.
 */
export function nearestCorrelation(matrix: Matrix): Matrix {
  const n = matrix.length;
  // Symmetric, clipped to [−1, 1], unit diagonal: the shape the algorithm assumes.
  const start = identityMatrix(n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const raw = (matrix[i][j] + matrix[j][i]) / 2;
      const value = Number.isFinite(raw) ? Math.max(-1, Math.min(1, raw)) : 0;
      start[i][j] = value;
      start[j][i] = value;
    }
  }
  if (isUsableCorrelation(start)) return start;

  let y = copyMatrix(start);
  let deltaS = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const r = y.map((row, i) => row.map((value, j) => value - deltaS[i][j]));
    const { values, vectors } = symmetricEigen(r);
    const x = reconstruct(values, vectors, 0);
    deltaS = x.map((row, i) => row.map((value, j) => value - r[i][j]));
    const next = copyMatrix(x);
    for (let i = 0; i < n; i++) next[i][i] = 1;
    const change = frobenius(next, y) / Math.max(frobenius(next, identityMatrix(n)), 1);
    y = next;
    if (change < TOLERANCE) break;
  }

  const { values, vectors } = symmetricEigen(y);
  return toUnitDiagonal(reconstruct(values, vectors, MIN_EIGENVALUE));
}

/** Lower-triangular `L` with `L·Lᵀ = matrix`. Throws when the matrix is not positive definite. */
export function cholesky(matrix: Matrix): Matrix {
  const n = matrix.length;
  const l = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = matrix[i][j];
      for (let k = 0; k < j; k++) sum -= l[i][k] * l[j][k];
      if (i === j) {
        if (!(sum > 0)) throw new Error('Matrix is not positive definite');
        l[i][i] = Math.sqrt(sum);
      } else {
        l[i][j] = sum / l[j][j];
      }
    }
  }
  return l;
}

/**
 * The pairs R5 changed, for the «scritto 0,90 → usato 0,50» note: indices into the upper triangle
 * where the corrected value differs from what was written by more than `tolerance` (two decimals,
 * which is what the UI shows).
 */
export function changedPairs(written: readonly number[], used: readonly number[], tolerance = 0.005): { index: number; written: number; used: number }[] {
  const out: { index: number; written: number; used: number }[] = [];
  used.forEach((value, index) => {
    if (Math.abs(value - (written[index] ?? 0)) >= tolerance) out.push({ index, written: written[index] ?? 0, used: value });
  });
  return out;
}

/** Corrects the 21 typed pairs (R5): the full-precision pairs to save, or the same pairs when already valid. */
export function correctUpperTriangle(values: readonly number[], n: number): number[] {
  return compressUpperTriangle(nearestCorrelation(expandUpperTriangle(values, n)));
}
