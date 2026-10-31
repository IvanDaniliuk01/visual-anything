/**
 * The tab's simulation store (ADR 0085), as the shell keeps it: made once for the tab over the code
 * worker's host, played one frame at a time while a run plays, its runs closed with the shell, and
 * kept in step with the project:
 *
 * - a run whose element is deleted, or whose component no longer simulates, closes;
 * - a run whose simulation was redefined opens again from the new definition, with what it chose
 *   when the new one takes it;
 * - a run that could not run opens again once its package's code stands otherwise, as when the
 *   person approves it.
 *
 * None of it renders the shell: it hears the store and the code itself.
 */
import {
  modelIndexOf,
  simulationOf,
  type Definitions,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, SavedSimulation } from '@visual-anything/schema';
import { useEffect, useState } from 'react';
import type { CodeState, CodeStore } from '../code/context';
import { LentSimulationPort } from './port';
import { SimulationStore, type SimulationPort } from './store';

export interface SimulationStoreInput {
  /** The code worker's host; none where the browser has no workers. */
  host: SimulationPort | undefined;
  project: ProjectSnapshot;
  definitions: Definitions;
  /** Package code and where it stands, for opening again what could not run. */
  code: CodeStore;
  /** The frames to play on; the browser's by default. */
  frames?: Frames;
}

/** Where frames come from: `requestAnimationFrame` and `cancelAnimationFrame`. */
export interface Frames {
  request(callback: (now: number) => void): number;
  cancel(handle: number): void;
}

export const BROWSER_FRAMES: Frames = {
  request: (callback) =>
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(callback)
      : (setTimeout(() => callback(Date.now()), 16) as unknown as number),
  cancel: (handle) => {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
    else clearTimeout(handle);
  },
};

export function useSimulationStore({
  host,
  project,
  definitions,
  code,
  frames = BROWSER_FRAMES,
}: SimulationStoreInput): SimulationStore {
  const [port] = useState(() => new LentSimulationPort());
  const [store] = useState(() => new SimulationStore(port));
  useEffect(() => port.lend(host), [port, host]);
  // The runs close with the shell; StrictMode's second mount finds none open.
  useEffect(() => () => store.closeAll(), [store]);
  useEffect(() => playFrames(store, frames), [store, frames]);
  useEffect(() => keepInStep(store, project, definitions), [store, project, definitions]);
  useEffect(() => openAgainWhenStanding(store, code), [store, code]);
  return store;
}

/** Calls `store.frame` once a frame while a run plays, and asks for none otherwise. */
export function playFrames(store: SimulationStore, frames: Frames): () => void {
  let handle: number | undefined;
  const schedule = () => {
    if (handle === undefined && store.playing) handle = frames.request(loop);
  };
  const loop = (now: number) => {
    handle = undefined;
    store.frame(now);
    schedule();
  };
  const unsubscribe = store.subscribe(schedule);
  schedule();
  return () => {
    unsubscribe();
    if (handle !== undefined) frames.cancel(handle);
    handle = undefined;
  };
}

/**
 * Closes the runs whose element is gone or simulates nothing now, and opens again from its new
 * definition a run whose simulation was redefined.
 */
export function keepInStep(
  store: SimulationStore,
  project: ProjectSnapshot,
  definitions: Definitions,
): void {
  const index = modelIndexOf(project);
  for (const run of store.list()) {
    const element = index.element(run.element);
    const simulation = element && simulationOf(definitions, element.component);
    if (!simulation) {
      store.close(run.element);
      continue;
    }
    if (
      simulation.definition === run.simulation.definition &&
      simulation.package === run.simulation.package
    ) {
      continue;
    }
    const chosen = chosenOf(store, run.element);
    if (!store.open(run.element, simulation, chosen).ok) {
      store.open(run.element, simulation, chosen.tick === undefined ? {} : { tick: chosen.tick });
    }
  }
}

/**
 * Opens again each run that could not run once the code of its package stands otherwise than when
 * it could not, as when the person approves it.
 */
export function openAgainWhenStanding(store: SimulationStore, code: CodeStore): () => void {
  /** Where its package's code stood when each run that cannot run was first seen so. */
  const seen = new Map<Id, string>();
  let checking = false;
  const check = () => {
    if (checking) return;
    checking = true;
    try {
      const state = code.snapshot();
      const again: Id[] = [];
      for (const run of store.list()) {
        if (run.unavailable === undefined || run.unavailable === 'no-simulation') {
          seen.delete(run.element);
          continue;
        }
        const now = standingOf(state, run.simulation.package);
        const was = seen.get(run.element);
        if (was === undefined) seen.set(run.element, now);
        else if (was !== now) {
          seen.delete(run.element);
          again.push(run.element);
        }
      }
      for (const element of [...seen.keys()]) if (!store.get(element)) seen.delete(element);
      for (const element of again) {
        const run = store.get(element);
        if (run) store.open(element, run.simulation, chosenOf(store, element));
      }
    } finally {
      checking = false;
    }
  };
  const unhearStore = store.subscribe(check);
  const unhearCode = code.subscribe(check);
  check();
  return () => {
    unhearStore();
    unhearCode();
  };
}

/** What a run chose, as `open` takes it. */
function chosenOf(store: SimulationStore, element: Id): Omit<SavedSimulation, 'element'> {
  const saved = store.saved(element);
  return {
    ...(saved?.parameters === undefined ? {} : { parameters: saved.parameters }),
    ...(saved?.seed === undefined ? {} : { seed: saved.seed }),
    ...(saved?.tick === undefined ? {} : { tick: saved.tick }),
  };
}

/** Where a package's code stands, as one text. */
function standingOf(code: CodeState, pkg: Id): string {
  const view = code.packages.get(pkg);
  return `${view?.status.state ?? ''}:${view?.run?.state ?? ''}`;
}
