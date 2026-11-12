/**
 * Which explorable is live on the canvas (ADR 0107, A10.3): one at a time. Double-click or Explore
 * makes one live in place, as a frame laid over its shape that follows pan and zoom; it turns still
 * again when another is explored, when its shape scrolls off screen or goes, or with Escape.
 */
import type { Id } from '@visual-anything/schema';
import type { Rect } from '../geometry';

/** What is live: the spot it shows in (a shape's key, or a free shape's id), and what it shows. */
export interface LiveTarget {
  spot: string;
  explorable: Id;
  /** The element whose data it reads. */
  element?: Id;
}

/** What happens to the live explorable. */
export type LiveEvent =
  | { kind: 'explore'; target: LiveTarget }
  | { kind: 'escape' }
  /** The camera or the scene changed: where its spot is now, none when it went, and what shows. */
  | { kind: 'view'; rect: Rect | undefined; visible: Rect };

/** The live explorable after an event; the same object while it stays the same. */
export function liveAfter(live: LiveTarget | undefined, event: LiveEvent): LiveTarget | undefined {
  switch (event.kind) {
    case 'explore':
      return live !== undefined &&
        live.spot === event.target.spot &&
        live.explorable === event.target.explorable &&
        live.element === event.target.element
        ? live
        : event.target;
    case 'escape':
      return undefined;
    case 'view':
      if (live === undefined || event.rect === undefined) return undefined;
      return overlaps(event.rect, event.visible) ? live : undefined;
  }
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
