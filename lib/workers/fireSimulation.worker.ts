/**
 * The FIRE simulations off the main thread (F12, doc/simulazioni-worker/README.md § RW3): «Dopo il FIRE» and the
 * Proiezione post `{ id, kind, inputs }`, the worker answers `{ id, ok, result | message }`. All the logic is in
 * `lib/simulation/simulationProtocol.ts`; this file is only the message shell, loaded by
 * `new Worker(new URL('./fireSimulation.worker.ts', import.meta.url), { type: 'module' })` in the store.
 */

import { collectTransferables, handleSimulationRequest, type SimulationRequest } from '@/lib/simulation/simulationProtocol';

/** The dedicated worker's scope, typed by hand: the project's `lib` is `dom`, not `webworker`. */
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<SimulationRequest>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
};

scope.onmessage = (event) => {
  const response = handleSimulationRequest(event.data);
  scope.postMessage(response, collectTransferables(response));
};
