/**
 * Claude's `turn` guidance on the canvas (ADR 0075): Claude asks to turn the solid a shape shows to a
 * camera, and the canvas does as Turn does. It brings the target's shape into sight, selects it and
 * turns its solid live from that camera, until the person ends it with Escape or by selecting
 * something else. A part anchored in a drawing turns with its drawing. Nothing is recorded.
 *
 * Each request applies once, in its view: `useGuidedRequests` opens that view, in the tab the person
 * used last only, and the canvas turns once it shows it. A request for a view the project lacks, or
 * for a target no shape of which shows a solid there, does nothing.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import type { Id, SolidCamera } from '@visual-anything/schema';
import { useEffect, useRef } from 'react';
import type { GuidedTurnRequest } from '../../guidance/state';
import { forThisTab } from '../../guidance/tabs';
import type { IndexedScene } from '../hit';

/** What the guidance needs of the canvas: the controller's `turn` and `reveal`. */
export interface GuidedTurning {
  turn(key: string, camera?: SolidCamera): boolean;
  reveal(key: string): void;
}

/**
 * The key of the shape Claude's turn guidance turns for a target: its first shape that shows a
 * solid, or, for a part anchored in a drawing that shows a solid, that drawing; none otherwise.
 */
export function guidedTurnKey(indexed: IndexedScene, target: Id): string | undefined {
  for (const shape of indexed.byElement.get(target) ?? []) {
    if (shape.part?.inDrawing === true && shape.part.solid !== undefined) {
      const drawing =
        shape.containerShape === undefined ? undefined : indexed.byKey.get(shape.containerShape);
      if (drawing?.solid) return drawing.key;
      continue;
    }
    if (shape.solid) return shape.key;
  }
  return undefined;
}

/** Applies Claude's newest turn guidance to the canvas, once, when its view shows. */
export function useGuidedTurn(
  request: GuidedTurnRequest | undefined,
  project: ProjectSnapshot,
  viewId: Id,
  indexed: IndexedScene | undefined,
  canvas: () => GuidedTurning | null | undefined,
): void {
  const applied = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!request || applied.current === request.request) return;
    if (!forThisTab(request, viewId)) {
      applied.current = request.request;
      return;
    }
    const named = request.view;
    if (named !== undefined && named !== viewId) {
      // The view opens first; a view the project lacks never will.
      if (!project.views.some((view) => view.id === named)) applied.current = request.request;
      return;
    }
    const turning = canvas();
    if (!turning || !indexed) return;
    applied.current = request.request;
    const key = guidedTurnKey(indexed, request.target);
    if (key === undefined) return;
    turning.reveal(key);
    turning.turn(key, request.camera);
  });
}
