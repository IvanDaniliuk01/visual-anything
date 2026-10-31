/**
 * The tab's simulation runs, as the shell provides them (ADR 0085): the inspector's Simulation
 * section, guidance and the view state read and change them here.
 */
import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import type { Selection } from '../editor/selection';
import type { SimulationShown, SimulationStore } from './store';

export const SimulationContext = createContext<SimulationStore | null>(null);

/** The tab's simulation store; none outside the shell. */
export function useSimulations(): SimulationStore | null {
  return useContext(SimulationContext);
}

/** The store's version, which changes with every change of a run: reading it re-renders on each. */
export function useSimulationVersion(store: SimulationStore | null): number {
  const subscribe = useCallback(
    (listener: () => void) => store?.subscribe(listener) ?? noUnsubscribe,
    [store],
  );
  return useSyncExternalStore(subscribe, () => store?.version ?? 0);
}

/**
 * The simulation shown, the one a view state carries: the run of the element selected alone when it
 * has one, else the run opened last.
 */
export function shownRun(
  store: SimulationStore,
  selection: Pick<Selection, 'elements'> | undefined,
): SimulationShown | undefined {
  const selected = selection?.elements.size === 1 ? [...selection.elements][0] : undefined;
  const run = selected === undefined ? undefined : store.get(selected);
  return run ?? store.list().at(-1);
}

const noUnsubscribe = () => undefined;
