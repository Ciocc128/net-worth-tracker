/**
 * F12 (doc/simulazioni-worker/README.md § 5): the store of the FIRE simulations and its engines.
 *
 * Regression net of P2 (WORKFLOW § 1.9): before F12 every opening of «Dopo il FIRE» or the Proiezione ran the
 * engine again with the same inputs. Here a counting engine proves the store asks it once (CA2), drops the oldest of
 * four runs (RW2: three kept), forgets everything on another owner or the sign-out (CA6), and that the worker engine
 * cancels a superseded run and falls back to the main thread (RW3, RW5, CA5).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSimulationStore,
  createMainThreadEngine,
  createWorkerEngine,
  MAX_RUNS_PER_KIND,
  peekSimulation,
  runSimulation,
  setSimulationEngineForTests,
  SimulationSupersededError,
  type SimulationEngine,
} from '@/lib/simulation/simulationStore';
import { forgetSimulationsOnSignOut } from '@/lib/simulation/simulationSignOut';
import { handleSimulationRequest, type SimulationInputsByKind, type SimulationKind, type SimulationRequest, type SimulationResultByKind } from '@/lib/simulation/simulationProtocol';
import { computeProjectionRun } from '@/lib/utils/fireSimulationRuns';
import { resolveMonteCarloMarket } from '@/lib/utils/monteCarloMarket';
import { monteCarloClassRecord } from '@/lib/constants/monteCarloClasses';
import type { ProjectionRunInputs } from '@/lib/utils/projectionSummary';

const market = resolveMonteCarloMarket(null);

function inputs(initialPortfolio = 100_000): ProjectionRunInputs {
  return {
    initialPortfolio,
    annualSavings: 10_000,
    savingsYears: 10,
    simulations: 50,
    horizon: 10,
    years: 50,
    weights: monteCarloClassRecord((cls) => (cls === 'equity' ? 100 : 0)),
    scenarios: market.scenarios,
    correlations: market.correlations,
    leverageSpread: market.leverageSpread,
    inflows: [],
  };
}

/** An engine that counts its runs and lets the test settle each one by hand. */
function controlledEngine() {
  const runs: { kind: SimulationKind; inputs: unknown; resolve: (value: unknown) => void; reject: (reason: unknown) => void; cancelled: boolean }[] = [];
  const engine: SimulationEngine = {
    run<K extends SimulationKind>(kind: K, runInputs: SimulationInputsByKind[K]) {
      const record = { kind, inputs: runInputs, resolve: (() => {}) as (value: unknown) => void, reject: (() => {}) as (reason: unknown) => void, cancelled: false };
      const promise = new Promise<SimulationResultByKind[K]>((resolve, reject) => {
        record.resolve = resolve as (value: unknown) => void;
        record.reject = reject;
      });
      runs.push(record);
      return {
        promise,
        cancel() {
          record.cancelled = true;
          record.reject(new SimulationSupersededError());
        },
      };
    },
  };
  return { engine, runs };
}

const fakeResult = (tag: number) => ({ tag }) as unknown as SimulationResultByKind['projection'];

describe('F12 · the store (RW2)', () => {
  let control: ReturnType<typeof controlledEngine>;
  beforeEach(() => {
    control = controlledEngine();
    setSimulationEngineForTests(control.engine);
  });
  afterEach(() => setSimulationEngineForTests(null));

  it('CA2: the same inputs twice run the engine ONCE, and the second time are read at once', async () => {
    const first = runSimulation('projection', 'owner-a', inputs());
    control.runs[0].resolve(fakeResult(1));
    await expect(first).resolves.toEqual({ tag: 1 });
    // Reopening the tab: the hook peeks before it runs — the figures are there, no running state.
    expect(peekSimulation('projection', 'owner-a', inputs())).toEqual({ tag: 1 });
    await expect(runSimulation('projection', 'owner-a', inputs())).resolves.toEqual({ tag: 1 });
    // By hand: one opening, one reopening, one request → 1 engine run (before F12: 2).
    expect(control.runs).toHaveLength(1);
  });

  it('a request while the same run is still in flight joins it (CU3: the tab left and reopened)', async () => {
    const a = runSimulation('projection', 'owner-a', inputs());
    const b = runSimulation('projection', 'owner-a', inputs());
    expect(peekSimulation('projection', 'owner-a', inputs())).toBeNull();
    control.runs[0].resolve(fakeResult(2));
    await expect(Promise.all([a, b])).resolves.toEqual([{ tag: 2 }, { tag: 2 }]);
    expect(control.runs).toHaveLength(1);
  });

  it('one euro of difference is another run', async () => {
    const a = runSimulation('projection', 'owner-a', inputs(100_000));
    control.runs[0].resolve(fakeResult(1));
    await a;
    const b = runSimulation('projection', 'owner-a', inputs(100_001));
    control.runs[1].resolve(fakeResult(2));
    await b;
    expect(control.runs).toHaveLength(2);
  });

  it(`keeps the last ${MAX_RUNS_PER_KIND} runs of a kind: the fourth pushes the first out`, async () => {
    for (let i = 1; i <= 4; i++) {
      const run = runSimulation('projection', 'owner-a', inputs(i * 1000));
      control.runs[i - 1].resolve(fakeResult(i));
      await run;
    }
    // By hand: 4 runs; the first (1000) left, the second (2000) is still there → asking both adds 1 run, total 5.
    expect(peekSimulation('projection', 'owner-a', inputs(1000))).toBeNull();
    expect(peekSimulation('projection', 'owner-a', inputs(2000))).toEqual({ tag: 2 });
    void runSimulation('projection', 'owner-a', inputs(1000));
    expect(control.runs).toHaveLength(5);
  });

  it('D-SW3: a newer run of the same kind cancels the one in flight; the other kind is left alone', async () => {
    const montecarlo = runSimulation('montecarlo', 'owner-a', { tag: 'mc' } as unknown as SimulationInputsByKind['montecarlo']);
    const old = runSimulation('projection', 'owner-a', inputs(1000));
    const fresh = runSimulation('projection', 'owner-a', inputs(2000));
    await expect(old).rejects.toBeInstanceOf(SimulationSupersededError);
    expect(control.runs.map((run) => run.cancelled)).toEqual([false, true, false]);
    control.runs[2].resolve(fakeResult(2));
    control.runs[0].resolve({ tag: 'mc' });
    await expect(fresh).resolves.toEqual({ tag: 2 });
    await expect(montecarlo).resolves.toEqual({ tag: 'mc' });
    // A cancelled run is not kept: asking it again runs it again.
    void runSimulation('projection', 'owner-a', inputs(1000));
    expect(control.runs).toHaveLength(4);
  });

  it('a failed run is not kept', async () => {
    const run = runSimulation('projection', 'owner-a', inputs());
    control.runs[0].reject(new Error('boom'));
    await expect(run).rejects.toThrow('boom');
    expect(peekSimulation('projection', 'owner-a', inputs())).toBeNull();
    void runSimulation('projection', 'owner-a', inputs());
    expect(control.runs).toHaveLength(2);
  });

  it('CA6: another owner empties the store — the first owner’s run is gone when they come back', async () => {
    const a = runSimulation('projection', 'owner-a', inputs());
    control.runs[0].resolve(fakeResult(1));
    await a;
    expect(peekSimulation('projection', 'owner-b', inputs())).toBeNull();
    expect(peekSimulation('projection', 'owner-a', inputs())).toBeNull();
  });

  it('CA6: the sign-out empties the store and cancels the run in flight', async () => {
    const done = runSimulation('projection', 'owner-a', inputs(1000));
    control.runs[0].resolve(fakeResult(1));
    await done;
    const flying = runSimulation('projection', 'owner-a', inputs(2000));
    forgetSimulationsOnSignOut();
    await expect(flying).rejects.toBeInstanceOf(SimulationSupersededError);
    expect(peekSimulation('projection', 'owner-a', inputs(1000))).toBeNull();
  });
});

/** A Worker stand-in: records what is posted, answers through the real handler when the test says so. */
class FakeWorker {
  static instances: FakeWorker[] = [];
  posted: SimulationRequest[] = [];
  terminated = false;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(message: SimulationRequest) {
    this.posted.push(structuredClone(message));
  }
  terminate() {
    this.terminated = true;
  }
  answer(index = 0) {
    const request = this.posted[index];
    this.onmessage?.({ data: structuredClone(handleSimulationRequest(request)) } as MessageEvent);
  }
}

describe('F12 · the engines (RW3, RW5)', () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    clearSimulationStore();
  });

  it('the worker engine posts the run and resolves with the worker’s answer', async () => {
    const engine = createWorkerEngine(() => new FakeWorker() as unknown as Worker);
    const handle = engine.run('projection', inputs());
    const worker = FakeWorker.instances[0];
    expect(worker.posted).toHaveLength(1);
    worker.answer();
    await expect(handle.promise).resolves.toEqual(computeProjectionRun(inputs()));
  });

  it('cancelling terminates the worker and re-posts the other run that was waiting, on a new worker', async () => {
    const engine = createWorkerEngine(() => new FakeWorker() as unknown as Worker);
    const first = engine.run('projection', inputs(1000));
    const other = engine.run('projection', inputs(2000));
    first.cancel();
    await expect(first.promise).rejects.toBeInstanceOf(SimulationSupersededError);
    expect(FakeWorker.instances[0].terminated).toBe(true);
    const replacement = FakeWorker.instances[1];
    expect(replacement.posted.map((request) => (request.inputs as ProjectionRunInputs).initialPortfolio)).toEqual([2000]);
    replacement.answer();
    await expect(other.promise).resolves.toEqual(computeProjectionRun(inputs(2000)));
  });

  it('RW5: a worker that fails hands what was waiting to the main thread, and is not recreated', async () => {
    const fallbackRuns: unknown[] = [];
    const fallback: SimulationEngine = {
      run(kind, runInputs) {
        fallbackRuns.push(runInputs);
        return createMainThreadEngine(0).run(kind, runInputs);
      },
    };
    const engine = createWorkerEngine(() => new FakeWorker() as unknown as Worker, fallback);
    const handle = engine.run('projection', inputs());
    FakeWorker.instances[0].onerror?.({ preventDefault() {} } as ErrorEvent);
    await expect(handle.promise).resolves.toEqual(computeProjectionRun(inputs()));
    void engine.run('projection', inputs(5000)).promise;
    expect(FakeWorker.instances).toHaveLength(1);
    expect(fallbackRuns).toHaveLength(2);
  });

  it('CA5: without Worker (as here, in Node) the default store still answers, with the same figures', async () => {
    vi.useFakeTimers();
    try {
      setSimulationEngineForTests(null);
      expect(typeof Worker).toBe('undefined');
      const run = runSimulation('projection', null, inputs());
      await vi.advanceTimersByTimeAsync(60);
      await expect(run).resolves.toEqual(computeProjectionRun(inputs()));
    } finally {
      vi.useRealTimers();
      setSimulationEngineForTests(null);
    }
  });

  it('the main-thread engine waits for the paint and can be cancelled before it starts', async () => {
    vi.useFakeTimers();
    try {
      const handle = createMainThreadEngine(60).run('projection', inputs());
      handle.cancel();
      await expect(handle.promise).rejects.toBeInstanceOf(SimulationSupersededError);
    } finally {
      vi.useRealTimers();
    }
  });
});
