/**
 * The messages between a FIRE tab and the simulation worker (F12, doc/simulazioni-worker/README.md § RW3–RW4).
 *
 * Pure and free of DOM or worker globals, so Vitest calls `handleSimulationRequest` directly: the worker is a
 * three-line shell around it (`lib/workers/fireSimulation.worker.ts`).
 */

import { computeMonteCarloRun, computeProjectionRun, type MonteCarloRunState, type ProjectionRunState } from '@/lib/utils/fireSimulationRuns';
import type { MonteCarloRunInputs } from '@/lib/utils/monteCarloSummary';
import type { ProjectionRunInputs } from '@/lib/utils/projectionSummary';

export type SimulationKind = 'montecarlo' | 'projection';

export interface SimulationInputsByKind {
  montecarlo: MonteCarloRunInputs;
  projection: ProjectionRunInputs;
}

export interface SimulationResultByKind {
  montecarlo: MonteCarloRunState;
  projection: ProjectionRunState;
}

export type SimulationRequest = {
  [K in SimulationKind]: { id: number; kind: K; inputs: SimulationInputsByKind[K] };
}[SimulationKind];

export type SimulationResponse =
  | { id: number; ok: true; result: SimulationResultByKind[SimulationKind] }
  | { id: number; ok: false; message: string };

/** The one place that maps a kind to its engine — the worker and the main-thread fallback both call it (RW5). */
export function computeSimulation<K extends SimulationKind>(kind: K, inputs: SimulationInputsByKind[K]): SimulationResultByKind[K] {
  if (kind === 'montecarlo') return computeMonteCarloRun(inputs as MonteCarloRunInputs) as SimulationResultByKind[K];
  return computeProjectionRun(inputs as ProjectionRunInputs) as SimulationResultByKind[K];
}

/** What the worker does with one message: the run, or the error's message (an `Error` does not survive the copy whole). */
export function handleSimulationRequest(request: SimulationRequest): SimulationResponse {
  try {
    return { id: request.id, ok: true, result: computeSimulation(request.kind, request.inputs) };
  } catch (error) {
    return { id: request.id, ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The buffers a response can hand over instead of copying (RW4): the Proiezione's per-year snapshots, 10.000 values
 * a year and a scenario. The Monte Carlo result carries none (its factors are dropped inside the run).
 */
export function collectTransferables(response: SimulationResponse): ArrayBuffer[] {
  if (!response.ok || !('data' in response.result)) return [];
  const buffers = new Set<ArrayBuffer>();
  for (const scenario of Object.values(response.result.data.scenarios)) {
    for (const values of Object.values(scenario.snapshots)) {
      if (values.buffer instanceof ArrayBuffer) buffers.add(values.buffer);
    }
  }
  return [...buffers];
}

/**
 * RW1: the run's key — the WHOLE input, stricter than `haveRunInputsChanged` (which decides what the page says, not
 * what may be reused). A `Map` (a mortgage flow's `yearly`) and a typed array would vanish in plain JSON, so they
 * are written out.
 */
export function simulationKey(kind: SimulationKind, ownerId: string | null, inputs: SimulationInputsByKind[SimulationKind]): string {
  const body = JSON.stringify(inputs, (_key, value: unknown) => {
    if (value instanceof Map) return { __map: [...value.entries()] };
    if (ArrayBuffer.isView(value) && !(value instanceof DataView)) return { __typed: Array.from(value as unknown as ArrayLike<number>) };
    if (typeof value === 'number' && !Number.isFinite(value)) return { __number: String(value) };
    return value;
  });
  return `${kind}|${ownerId ?? ''}|${body}`;
}
