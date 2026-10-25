/**
 * Where the pins of the open view's threads sit (ADR 0059), in canvas units: on the top right corner
 * of an element's first shape, or of the collapsed container that shows it; at the middle of a
 * relation's line, or of the aggregated relation standing for it; at a point. Threads about one thing
 * share one pin. A thread about the view as a whole has no pin: the panel lists it. Nothing the
 * filters hide has a pin.
 */
import type { CommentFile, Id } from '@visual-anything/schema';
import type { Point } from '../canvas/geometry';
import { shownBy, standsFor, type Scene } from '../canvas/scene';

export interface Pin {
  /** Unique in the view: what the pin is on. */
  key: string;
  /** Where it sits, in canvas units. */
  at: Point;
  /** Its threads, in the project's order. */
  threads: CommentFile[];
  /** Whether every one of its threads is resolved. */
  resolved: boolean;
}

/** The pins of some threads over a view's scene; `hidden` holds what the filters hide, as the scene keys it. */
export function pinsOf(
  scene: Scene,
  viewId: Id,
  threads: readonly CommentFile[],
  hidden: ReadonlySet<string> = new Set(),
): Pin[] {
  const pins = new Map<string, Pin>();
  let lines: Map<Id, { key: string; at: Point }> | undefined;
  const add = (key: string, at: Point, thread: CommentFile) => {
    const pin = pins.get(key);
    if (pin) {
      pin.threads.push(thread);
      pin.resolved &&= thread.resolved === true;
    } else {
      pins.set(key, { key, at, threads: [thread], resolved: thread.resolved === true });
    }
  };
  for (const thread of threads) {
    const { anchor } = thread;
    switch (anchor.kind) {
      case 'element': {
        const shape = shownBy(scene, anchor.element);
        if (!shape || hidden.has(shape.key)) break;
        const box = shape.plate ?? shape.rect;
        add(`shape:${shape.key}`, { x: box.x + box.width, y: box.y }, thread);
        break;
      }
      case 'relation': {
        lines ??= lineMiddles(scene, hidden);
        const line = lines.get(anchor.relation);
        if (line) add(`line:${line.key}`, line.at, thread);
        break;
      }
      case 'point':
        if (anchor.view === viewId) add(`point:${thread.id}`, { x: anchor.x, y: anchor.y }, thread);
        break;
      case 'view':
        break;
    }
  }
  return [...pins.values()];
}

/** Where each relation drawn is pinned: its line's middle, or that of the line standing for it. */
function lineMiddles(
  scene: Scene,
  hidden: ReadonlySet<string>,
): Map<Id, { key: string; at: Point }> {
  const middles = new Map<Id, { key: string; at: Point }>();
  for (const line of scene.relations) {
    if (hidden.has(line.relation)) continue;
    for (const relation of standsFor(line)) {
      if (!middles.has(relation)) middles.set(relation, { key: line.relation, at: line.middle });
    }
  }
  return middles;
}
