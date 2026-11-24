/**
 * The FIRE simulations' store and engine (F12, doc/simulazioni-worker/README.md § RW1–RW5).
 *
 * - The STORE (RW2): the last {@link MAX_RUNS_PER_KIND} runs of each kind, in memory at module level and never
 *   persisted, keyed on the WHOLE input plus the owner (RW1). A tab that reopens with the same inputs reads its
 *   figures here instead of re-running 10.000 paths; a run still in flight is shared, so leaving the tab does not
 *   lose it (CU3). It is emptied when the owner changes and on sign-out (`clearSimulationStore`, reached from the
 *   query provider's sign-out guard through `simulationSignOut.ts`).
 * - The ENGINE (RW3, RW5): one module worker for both kinds, created at the first run and kept alive; a newer run
 *   of the same kind terminates it (and re-posts the other kind's run, if one was waiting); without `Worker`, or
 *   once the worker failed, the run goes on the main thread with the very same function after 60 ms, so the
 *   browser paints the running state first — what the tabs did before F12.
 */

import { registerSimulationClearer } from '@/lib/simulation/simulationSignOut';
import { computeSimulation, simulationKey, type SimulationInputsByKind, type SimulationKind, type SimulationResponse, type SimulationResultByKind } from '@/lib/simulation/simulationProtocol';

/** RW2 (D-SW2): how many runs of each kind the store keeps. */
export const MAX_RUNS_PER_KIND = 3;

/** The delay before a main-thread run, so the running state is painted first (the tabs' old `setTimeout`). */
const MAIN_THREAD_DELAY_MS = 60;

/** A run dropped because a newer one of the same kind replaced it, or the store was emptied: never an error to show. */
export class SimulationSupersededError extends Error {
  constructor() {
    super('Simulation superseded');
    this.name = 'SimulationSupersededError';
  }
}

export interface SimulationHandle<K extends SimulationKind> {
  promise: Promise<SimulationResultByKind[K]>;
  /** Stops the run if it has not finished; its promise rejects with {@link SimulationSupersededError}. */
  cancel(): void;
}

export interface SimulationEngine {
  run<K extends SimulationKind>(kind: K, inputs: SimulationInputsByKind[K]): SimulationHandle<K>;
}

// ─── The engines ──────────────────────────────────────────────────────────────

/** RW5: the run on the main thread, after the paint of the running state. */
export function createMainThreadEngine(delayMs = MAIN_THREAD_DELAY_MS): SimulationEngine {
  return {
    run(kind, inputs) {
      let timer: ReturnType<typeof setTimeout> | null = null;
      let rejectRun: ((reason: unknown) => void) | null = null;
      const promise = new Promise<SimulationResultByKind[typeof kind]>((resolve, reject) => {
        rejectRun = reject;
        timer = setTimeout(() => {
          timer = null;
          try {
            resolve(computeSimulation(kind, inputs));
          } catch (error) {
            reject(error);
          }
        }, delayMs);
      });
      return {
        promise,
        cancel() {
          if (timer === null) return;
          clearTimeout(timer);
          timer = null;
          rejectRun?.(new SimulationSupersededError());
        },
      };
    },
  };
}

interface PendingRun {
  kind: SimulationKind;
  inputs: SimulationInputsByKind[SimulationKind];
  resolve: (result: SimulationResultByKind[SimulationKind]) => void;
  reject: (reason: unknown) => void;
}

/**
 * RW3: one module worker for both kinds. `spawn` is injectable for the tests; by default it is the literal
 * `new Worker(new URL(…, import.meta.url))` the bundler recognises, and `null` where `Worker` does not exist.
 */
export function createWorkerEngine(spawn: () => Worker | null = spawnSimulationWorker, fallback: SimulationEngine = createMainThreadEngine()): SimulationEngine {
  let worker: Worker | null = null;
  let broken = false;
  let nextId = 1;
  const pending = new Map<number, PendingRun>();

  const toFallback = (run: PendingRun) => {
    fallback.run(run.kind, run.inputs).promise.then(run.resolve, run.reject);
  };

  const attach = (instance: Worker) => {
    instance.onmessage = (event: MessageEvent<SimulationResponse>) => {
      const run = pending.get(event.data.id);
      if (!run) return;
      pending.delete(event.data.id);
      if (event.data.ok) run.resolve(event.data.result);
      else run.reject(new Error(event.data.message));
    };
    // RW5: a worker that fails (it did not load, or it threw outside a run) is not recreated; what was waiting on it
    // runs on the main thread.
    instance.onerror = (event: ErrorEvent) => {
      event.preventDefault?.();
      broken = true;
      instance.terminate();
      if (worker === instance) worker = null;
      const waiting = [...pending.values()];
      pending.clear();
      waiting.forEach(toFallback);
    };
  };

  const ensureWorker = (): Worker | null => {
    if (worker || broken) return worker;
    try {
      worker = spawn();
    } catch {
      worker = null;
    }
    if (!worker) {
      broken = true;
      return null;
    }
    attach(worker);
    return worker;
  };

  const post = (instance: Worker, id: number, run: PendingRun): boolean => {
    try {
      instance.postMessage({ id, kind: run.kind, inputs: run.inputs });
      return true;
    } catch {
      // A DataCloneError: these inputs cannot cross, so they run here.
      return false;
    }
  };

  return {
    run(kind, inputs) {
      const instance = ensureWorker();
      if (!instance) return fallback.run(kind, inputs);
      const id = nextId++;
      let entry: PendingRun | null = null;
      const promise = new Promise<SimulationResultByKind[typeof kind]>((resolve, reject) => {
        entry = { kind, inputs, resolve: resolve as PendingRun['resolve'], reject };
      });
      const run = entry as unknown as PendingRun;
      pending.set(id, run);
      if (!post(instance, id, run)) {
        pending.delete(id);
        toFallback(run);
      }
      return {
        promise,
        cancel() {
          const current = pending.get(id);
          if (!current) return;
          pending.delete(id);
          current.reject(new SimulationSupersededError());
          // The CPU goes back at once: the worker is terminated, and the other kind's run (if any) starts again on a new one.
          worker?.terminate();
          worker = null;
          if (pending.size === 0) return;
          const replacement = ensureWorker();
          for (const [otherId, other] of [...pending.entries()]) {
            if (replacement && post(replacement, otherId, other)) continue;
            pending.delete(otherId);
            toFallback(other);
          }
        },
      };
    },
  };
}

/** The default worker: the bundler (Turbopack / webpack) emits `fireSimulation.worker.ts` as its own chunk from this literal. */
function spawnSimulationWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  return new Worker(new URL('../workers/fireSimulation.worker.ts', import.meta.url), { type: 'module', name: 'fire-simulation' });
}

// ─── The store ────────────────────────────────────────────────────────────────

interface StoreEntry {
  key: string;
  promise: Promise<SimulationResultByKind[SimulationKind]>;
  result: SimulationResultByKind[SimulationKind] | null;
  cancel: () => void;
}

let engine: SimulationEngine | null = null;
let storeOwner: string | null | undefined;
const entries: Record<SimulationKind, StoreEntry[]> = { montecarlo: [], projection: [] };

function getEngine(): SimulationEngine {
  if (!engine) engine = createWorkerEngine();
  return engine;
}

/** CU6: another owner's runs never stay in memory for this one. */
function syncOwner(ownerId: string | null): void {
  if (storeOwner !== undefined && storeOwner !== ownerId) clearSimulationStore();
  storeOwner = ownerId;
}

/** The figures of a finished run with exactly these inputs, or `null` — synchronous, so a tab can show them without a running state. */
export function peekSimulation<K extends SimulationKind>(kind: K, ownerId: string | null, inputs: SimulationInputsByKind[K]): SimulationResultByKind[K] | null {
  syncOwner(ownerId);
  const key = simulationKey(kind, ownerId, inputs);
  const entry = entries[kind].find((candidate) => candidate.key === key);
  return (entry?.result as SimulationResultByKind[K] | undefined) ?? null;
}

/**
 * The run with these inputs: from the store when it is there (finished or still running), else a new one on the
 * engine. A run of the same kind still in flight with OTHER inputs is cancelled (its promise rejects with
 * {@link SimulationSupersededError}).
 */
export function runSimulation<K extends SimulationKind>(kind: K, ownerId: string | null, inputs: SimulationInputsByKind[K]): Promise<SimulationResultByKind[K]> {
  syncOwner(ownerId);
  const key = simulationKey(kind, ownerId, inputs);
  const list = entries[kind];
  const index = list.findIndex((candidate) => candidate.key === key);
  if (index >= 0) {
    const [existing] = list.splice(index, 1);
    list.push(existing);
    return existing.promise as Promise<SimulationResultByKind[K]>;
  }
  // D-SW3: only the newest run of a kind is worth the CPU.
  for (const stale of list.filter((candidate) => candidate.result === null)) {
    list.splice(list.indexOf(stale), 1);
    stale.cancel();
  }
  const handle = getEngine().run(kind, inputs);
  const entry: StoreEntry = { key, promise: handle.promise, result: null, cancel: handle.cancel };
  entry.promise = handle.promise.then(
    (result) => {
      entry.result = result;
      return result;
    },
    (error: unknown) => {
      // A failed or cancelled run is not kept: the next request with these inputs runs again.
      const at = entries[kind].indexOf(entry);
      if (at >= 0) entries[kind].splice(at, 1);
      throw error;
    },
  );
  // Nobody may be listening any more (the tab was left): an unhandled rejection would only be noise.
  entry.promise.catch(() => {});
  list.push(entry);
  while (list.length > MAX_RUNS_PER_KIND) list.shift();
  return entry.promise as Promise<SimulationResultByKind[K]>;
}

/** Sign-out and owner change (CU6): every run is forgotten, the one in flight cancelled. */
export function clearSimulationStore(): void {
  for (const kind of Object.keys(entries) as SimulationKind[]) {
    const list = entries[kind];
    entries[kind] = [];
    for (const entry of list) if (entry.result === null) entry.cancel();
  }
  storeOwner = undefined;
}

registerSimulationClearer(clearSimulationStore);

/** Tests only: a fake engine (or `null` for the default one), with an empty store. */
export function setSimulationEngineForTests(next: SimulationEngine | null): void {
  clearSimulationStore();
  engine = next;
}
