/**
 * Claude's guidance `simulation` (ADR 0085), done once per request, as the person would do it: it
 * opens the view it names first, in the tab the person used last only (`tabs.ts`), then selects the
 * element so that the inspector shows its Simulation section, opens its run with the parameters,
 * seed and tick asked for, and plays it at the speed asked for or leaves it paused; `close` closes
 * the simulation shown. Nothing is recorded, and the person can change or close the run at any time.
 */
import { modelIndexOf, simulationOf } from '@visual-anything/core';
import { useEffect, useRef } from 'react';
import type { Editor } from '../editor/EditorContext';
import { selectionOf } from '../editor/selection';
import { shownRun } from '../simulation/context';
import type { SimulationStore } from '../simulation/store';
import type { GuidedSimulationRequest } from './state';
import { forThisTab } from './tabs';

/** Does what a guidance `simulation` asks, now that its view is open; false when it opens nothing. */
export function applyGuidedSimulation(
  store: SimulationStore,
  editor: Pick<Editor, 'project' | 'definitions' | 'selection' | 'select'>,
  request: GuidedSimulationRequest,
): boolean {
  if ('close' in request) {
    const run = shownRun(store, editor.selection);
    if (run) store.close(run.element);
    return true;
  }
  const element = modelIndexOf(editor.project).element(request.element);
  const simulation = element && simulationOf(editor.definitions, element.component);
  if (!element || !simulation) return false;
  const { element: id, play, speed, parameters, seed, tick } = request;
  const chosen = {
    ...(parameters === undefined ? {} : { parameters }),
    ...(seed === undefined ? {} : { seed }),
    ...(tick === undefined ? {} : { tick }),
  };
  if (!store.open(id, simulation, chosen).ok) return false;
  editor.select(selectionOf([{ kind: 'element', id }]));
  if (play === true) store.play(id, speed);
  else if (speed !== undefined) store.setSpeed(id, speed);
  return true;
}

/** Applies Claude's newest guidance `simulation` to the tab's runs, once, when its view is open. */
export function useGuidedSimulation(
  request: GuidedSimulationRequest | undefined,
  editor: Editor | undefined,
  store: SimulationStore | null,
): void {
  const applied = useRef<number>(undefined);
  const opened = useRef<number>(undefined);
  useEffect(() => {
    if (!request || !editor || !store || applied.current === request.request) return;
    if (!forThisTab(request, editor.viewId)) {
      applied.current = request.request;
      return;
    }
    const named = 'view' in request ? request.view : undefined;
    if (named !== undefined && named !== editor.viewId) {
      // The view opens first; a view the project lacks never will.
      if (!editor.project.views.some((view) => view.id === named)) {
        applied.current = request.request;
      } else if (opened.current !== request.request) {
        opened.current = request.request;
        editor.openView?.(named);
      }
      return;
    }
    applied.current = request.request;
    applyGuidedSimulation(store, editor, request);
  }, [request, editor, store]);
}
