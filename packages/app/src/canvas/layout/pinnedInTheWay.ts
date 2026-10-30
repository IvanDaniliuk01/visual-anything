/**
 * Pinned shapes in the way of Layout (ADR 0080, Stage 0b): pinned shapes never move (ADR 0009), so
 * pinned shapes that cover each other stay overlapped, and a pinned container that holds the ends of
 * relations to shapes outside it keeps the one-pass layout from placing what it holds near them, since
 * ELK's layered algorithm cannot hold a given place. The canvas outlines them, and the view's
 * inspector lists them and offers to unpin them, one undoable action, after which Layout can place
 * them.
 */
import { positionKey, type Command } from '@visual-anything/core';
import type { ViewFile } from '@visual-anything/schema';
import { covers } from './quality';
import type { ElementShape, Scene } from '../scene';

/** A pinned shape in the way, and why. */
export interface PinnedInTheWay {
  shape: ElementShape;
  /** The pinned shapes it covers, which stay overlapped. */
  overlaps: ElementShape[];
  /** Whether it is a container whose contents relations lead out of, which layout cannot place. */
  holdsRelated: boolean;
}

const found = new WeakMap<Scene, readonly PinnedInTheWay[]>();

/** The pinned shapes in the way of Layout in a scene, in the scene's order. */
export function pinnedInTheWay(scene: Scene): readonly PinnedInTheWay[] {
  const known = found.get(scene);
  if (known) return known;
  const byKey = new Map(scene.shapes.map((shape) => [shape.key, shape]));
  const overlaps = new Map<string, ElementShape[]>();
  // Pinned siblings that cover each other.
  const siblings = new Map<string, ElementShape[]>();
  for (const shape of scene.shapes) {
    if (shape.positioned !== 'pinned' || shape.row !== undefined) continue;
    if (shape.part?.inDrawing === true) continue;
    const key = shape.containerShape ?? '';
    const list = siblings.get(key);
    if (list) list.push(shape);
    else siblings.set(key, [shape]);
  }
  const note = (shape: ElementShape, other: ElementShape) => {
    const list = overlaps.get(shape.key);
    if (list) list.push(other);
    else overlaps.set(shape.key, [other]);
  };
  for (const list of siblings.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const one = list[i] as ElementShape;
        const other = list[j] as ElementShape;
        if (!covers(one.rect, other.rect)) continue;
        note(one, other);
        note(other, one);
      }
    }
  }
  // Pinned open containers that hold an end of a relation whose other end lies outside them.
  const holding = new Set<string>();
  const holdersOf = (key: string): string[] => {
    const keys: string[] = [];
    for (
      let up = byKey.get(key)?.containerShape;
      up !== undefined;
      up = byKey.get(up)?.containerShape
    ) {
      keys.push(up);
    }
    return keys;
  };
  for (const line of scene.relations) {
    const ends = line.ends;
    if (ends?.from.kind !== 'shape' || ends.to.kind !== 'shape') continue;
    const fromUp = holdersOf(ends.from.key);
    const toUp = new Set(holdersOf(ends.to.key));
    const fromSet = new Set(fromUp);
    for (const key of [...fromUp, ...toUp]) {
      if (fromSet.has(key) && toUp.has(key)) continue;
      if (key === ends.from.key || key === ends.to.key) continue;
      const shape = byKey.get(key);
      if (shape?.positioned !== 'pinned' || shape.collapsed !== undefined) continue;
      if (shape.rowCount !== undefined) continue;
      holding.add(key);
    }
  }
  const result: PinnedInTheWay[] = [];
  for (const shape of scene.shapes) {
    const covered = overlaps.get(shape.key);
    const holdsRelated = holding.has(shape.key);
    if (!covered && !holdsRelated) continue;
    result.push({ shape, overlaps: covered ?? [], holdsRelated });
  }
  found.set(scene, result);
  return result;
}

/** The English undo label of unpinning shapes, which the catalog translates. */
export function unpinLabel(shapes: readonly ElementShape[]): string {
  const [first] = shapes;
  return shapes.length === 1 && first ? `Unpin "${first.name}"` : `Unpin ${shapes.length} shapes`;
}

/**
 * Unpins shapes where they are, one undoable action: their positions stay, no longer set by hand,
 * so that Layout may move them. Undefined when none of them is pinned in the view.
 */
export function unpinCommand(view: ViewFile, shapes: readonly ElementShape[]): Command | undefined {
  const wanted = new Set(
    shapes.map((shape) =>
      positionKey({
        element: shape.element,
        ...(shape.container ? { container: shape.container } : {}),
      }),
    ),
  );
  const positions = view.positions
    .filter((position) => position.pinned === true && wanted.has(positionKey(position)))
    .map((position) => ({ ...position, pinned: false }));
  if (positions.length === 0) return undefined;
  return {
    type: 'batch',
    label: unpinLabel(shapes),
    commands: [{ type: 'set-positions', view: view.id, positions }],
  };
}
