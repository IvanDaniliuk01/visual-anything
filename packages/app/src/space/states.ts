/**
 * Each element's state in physical space (ADR 0076), by element id, from what the canvas draws by
 * shape key: the panel draws the canvas's emphasis, so what any source hides is hidden there, what is
 * faint is faint, and what playback, guidance and a tour highlight is highlighted; the selection, the
 * hover and the overlays' fill and opacity mark it as they mark its shapes.
 *
 * An element is drawn once in space and once in each of its containers on the canvas, so its state
 * in space comes from all of its shapes:
 * - **hidden** when every one of its shapes is hidden;
 * - **highlighted** when any of them is, which wins over faint, as on the canvas;
 * - **faint** when every one of its shapes not hidden is dimmed;
 * - **selected** and **hovered** by its id, and its overlay's **fill** and **opacity** below 1.
 *
 * An entry drawn as a collapsed container (`drawnAs`) takes that container's state whole, as the
 * canvas draws its contents as the container. The containers drawn faintly because the view does not
 * show them (`Space.faint`) are faint. An element with no shape, such as World shown as the panel's
 * element, takes only what its id marks.
 *
 * Pure, so that the panel, the read-only page and the tests work it out alike.
 */
import type { Space } from '@visual-anything/core';
import type { Color, Id } from '@visual-anything/schema';
import type { Emphasized } from '../canvas/emphasize';
import type { SpaceElementState, SpaceStateEntry } from '../solids/protocol';

/** What the canvas's emphasis does to its element shapes, by shape key. */
export interface ShapeEmphasis {
  hidden: ReadonlySet<string>;
  dimmed: ReadonlySet<string>;
  highlighted: ReadonlySet<string>;
}

/** An overlay's look of an element, as the panel draws it: its fill and its opacity. */
export interface SpaceOverlayLook {
  fill?: Color;
  opacity?: number;
}

/** What {@link spaceStates} works from. */
export interface SpaceStatesInput {
  space: Pick<Space, 'entries' | 'faint'>;
  /** The canvas's element shapes: each one's key and element. */
  shapes: readonly { readonly key: string; readonly element: Id }[];
  emphasis: ShapeEmphasis;
  /** The elements selected. */
  selected: ReadonlySet<Id>;
  /** The element hovered, on the canvas or in the panel. */
  hovered?: Id | undefined;
  /** What the open view's overlays give an element. */
  overlay?: ((element: Id) => SpaceOverlayLook | undefined) | undefined;
}

/** The element shapes' emphasis of what `emphasize` worked out for a scene. */
export function shapeEmphasisOf(emphasized: Emphasized): ShapeEmphasis {
  return {
    hidden: emphasized.hidden.shapes,
    dimmed: emphasized.dimmed.shapes,
    highlighted: new Set(emphasized.highlighted.shapes.map((shape) => shape.key)),
  };
}

/**
 * Each element's state in the space, by id, for every entry and faint container, leaving out those
 * that look plain.
 */
export function spaceStates(input: SpaceStatesInput): Map<Id, SpaceElementState> {
  const { space, emphasis, selected, hovered, overlay } = input;
  const keysOf = new Map<Id, string[]>();
  for (const { key, element } of input.shapes) {
    const keys = keysOf.get(element);
    if (keys) keys.push(key);
    else keysOf.set(element, [key]);
  }
  const own = new Map<Id, SpaceElementState>();
  const stateOf = (element: Id): SpaceElementState => {
    const known = own.get(element);
    if (known) return known;
    const state: SpaceElementState = {};
    const keys = keysOf.get(element) ?? [];
    const shown = keys.filter((key) => !emphasis.hidden.has(key));
    if (keys.length > 0 && shown.length === 0) state.hidden = true;
    if (shown.some((key) => emphasis.highlighted.has(key))) state.highlighted = true;
    else if (shown.length > 0 && shown.every((key) => emphasis.dimmed.has(key))) state.faint = true;
    if (selected.has(element)) state.selected = true;
    if (hovered === element) state.hovered = true;
    const look = overlay?.(element);
    if (look?.fill !== undefined) state.fill = look.fill;
    if (look?.opacity !== undefined && look.opacity < 1) state.opacity = look.opacity;
    own.set(element, state);
    return state;
  };
  const states = new Map<Id, SpaceElementState>();
  const keep = (element: Id, state: SpaceElementState) => {
    if (Object.keys(state).length > 0) states.set(element, state);
  };
  for (const [element, entry] of space.entries) {
    keep(element, stateOf(entry.drawnAs ?? element));
  }
  for (const [element, entry] of space.faint) {
    if (space.entries.has(element)) continue;
    keep(element, { ...stateOf(entry.drawnAs ?? element), faint: true });
  }
  return states;
}

/** The states as the worker's messages carry them, one for each element that does not look plain. */
export function spaceStateList(states: ReadonlyMap<Id, SpaceElementState>): SpaceStateEntry[] {
  return [...states].map(([element, state]) => ({ element, ...state }));
}
