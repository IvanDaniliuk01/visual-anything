/**
 * Adding an explorable shape (ADR 0107, A10.3): Explorable… on the canvas toolbar, which lists the
 * explorables the project's packages define, or Put on the canvas in the explorable panel, which
 * binds it to the element the panel shows. It is added at the middle of the view, 320 by 240 units,
 * and selected, so that its inspector binds it to an element.
 */
import type { Command } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import type { Point } from '../geometry';
import type { LiveTarget } from './live';

/** The size an explorable shape is added at, in canvas units: a page's usual 4 by 3. */
export const EXPLORABLE_SHAPE_SIZE = { width: 320, height: 240 } as const;

/** The command that adds an explorable shape with its middle at a point, bound to an element or not. */
export function addExplorableCommand(view: Id, explorable: Id, at: Point, element?: Id): Command {
  const { width, height } = EXPLORABLE_SHAPE_SIZE;
  return {
    type: 'create-free-shape',
    view,
    shape: {
      kind: 'explorable',
      x: Math.round(at.x - width / 2),
      y: Math.round(at.y - height / 2),
      width,
      height,
      explorable,
      ...(element === undefined ? {} : { element }),
    },
  };
}

/** An explorable shape asked for outside the canvas, as the explorable panel asks. */
export interface ExplorableShapeAsk {
  explorable: Id;
  element?: Id;
}

const listeners = new Set<(ask: ExplorableShapeAsk) => void>();

/** Asks the active canvas to add an explorable shape; answers whether a canvas took it. */
export function askExplorableShape(ask: ExplorableShapeAsk): boolean {
  for (const listener of [...listeners]) listener(ask);
  return listeners.size > 0;
}

/** Takes the asks for explorable shapes while the canvas is the active one; returns what stops it. */
export function onExplorableShapeAsked(listener: (ask: ExplorableShapeAsk) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const exploring = new Set<(target: LiveTarget) => void>();

/** Asks the active canvas to make an explorable live in place, as Explore in the inspector does. */
export function askExplore(target: LiveTarget): void {
  for (const listener of [...exploring]) listener(target);
}

/** Takes the asks to explore while the canvas is the active one; returns what stops it. */
export function onExploreAsked(listener: (target: LiveTarget) => void): () => void {
  exploring.add(listener);
  return () => {
    exploring.delete(listener);
  };
}
