/**
 * The containers a build draws collapsed: those the view keeps collapsed, less those the open app
 * expands as the canvas zooms into them (ADR 0055, `expansion.ts`). Kept apart from what works the
 * expansion out, which reads scenes, so that the scene reads this alone.
 */
import type { Id } from '@visual-anything/schema';

/** No container expanded by zoom: the set every build without one shares. */
export const NOT_EXPANDED: ReadonlySet<Id> = Object.freeze(new Set<Id>());

const without = new WeakMap<ReadonlySet<Id>, WeakMap<ReadonlySet<Id>, ReadonlySet<Id>>>();

/**
 * A view's collapsed containers without those the open app expands by zoom: the same set for the
 * same two sets, and `collapsed` itself when it expands none of them, so that a build tells by
 * identity whether collapse changed.
 */
export function collapsedWithout(
  collapsed: ReadonlySet<Id>,
  expanded: ReadonlySet<Id>,
): ReadonlySet<Id> {
  if (expanded.size === 0 || ![...expanded].some((id) => collapsed.has(id))) return collapsed;
  let byExpanded = without.get(collapsed);
  if (!byExpanded) {
    byExpanded = new WeakMap();
    without.set(collapsed, byExpanded);
  }
  let left = byExpanded.get(expanded);
  if (!left) {
    left = new Set([...collapsed].filter((id) => !expanded.has(id)));
    byExpanded.set(expanded, left);
  }
  return left;
}
