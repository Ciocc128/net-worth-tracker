'use client';

/**
 * The run of a FIRE simulation tab (F12, doc/simulazioni-worker/README.md § RW6): «Dopo il FIRE» and the Proiezione
 * hold their LAST run here instead of computing it in their own `setTimeout`. The hook knows no tab — R9 may move
 * them — only a kind and the owner.
 *
 * `run(inputs)` shows a finished run with the same inputs at once, from the store; otherwise it raises `isRunning`
 * and waits for the worker (or the main-thread fallback). A newer `run` wins: an older answer that arrives late is
 * ignored, and a run cancelled by a newer one is not an error. `lastRun` keeps the shape the tabs always read
 * (`inputs` plus the figures), so the Stale-Run reading, the verdict and the Dettaglio do not change.
 */

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { peekSimulation, runSimulation, SimulationSupersededError } from '@/lib/simulation/simulationStore';
import type { SimulationInputsByKind, SimulationKind, SimulationResultByKind } from '@/lib/simulation/simulationProtocol';

export interface SimulationRunState<K extends SimulationKind> {
  lastRun: SimulationResultByKind[K] | null;
  isRunning: boolean;
  run: (inputs: SimulationInputsByKind[K]) => void;
}

export function useSimulationRun<K extends SimulationKind>(kind: K, ownerId: string | null): SimulationRunState<K> {
  const [lastRun, setLastRun] = useState<SimulationResultByKind[K] | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  // The newest request: an answer to an older one is dropped.
  const ticketRef = useRef(0);

  const run = useCallback(
    (inputs: SimulationInputsByKind[K]) => {
      ticketRef.current += 1;
      const ticket = ticketRef.current;
      const cached = peekSimulation(kind, ownerId, inputs);
      if (cached) {
        setLastRun(cached);
        setIsRunning(false);
        return;
      }
      setIsRunning(true);
      runSimulation(kind, ownerId, inputs).then(
        (result) => {
          if (ticket !== ticketRef.current) return;
          setLastRun(result);
          setIsRunning(false);
        },
        (error: unknown) => {
          if (error instanceof SimulationSupersededError || ticket !== ticketRef.current) return;
          console.error(`Error running the ${kind} simulation:`, error);
          toast.error('Errore durante la simulazione');
          setIsRunning(false);
        },
      );
    },
    [kind, ownerId],
  );

  return { lastRun, isRunning, run };
}
