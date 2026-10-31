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
 * canvas draws its contents as the container; a collapsed container that is not itself an entry gets
 * a state of its own too, for the name the panel writes for it (`entries.ts`). The containers drawn
 * faintly because the view does not show them (`Space.faint`) are faint. An element with no shape,
 * such as World shown as the panel's element, takes only what its id marks.
 *
 * A container that draws no solid of its own is drawn as what is in it, so selecting or hovering it
 * marks everything it holds, at any depth, that is in the space (`containersOf` says what holds what).
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
  /**
   * The containers of an element in the model, through which a selected or hovered container that
   * draws no solid marks what it holds; absent, marks go by id alone.
   */
  containersOf?: ((element: Id) => readonly Id[]) | undefined;
  /** World, which marks nothing through it when it is selected. */
  world?: Id | undefined;
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
  const through = marksThrough(input);
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
    if (selected.has(element) || through(element, 'selected')) state.selected = true;
    if (hovered === element || through(element, 'hovered')) state.hovered = true;
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
  // A collapsed container that is neither an entry nor faint is written by the name entry the panel
  // sends for it (`entries.ts`).
  for (const entry of [...space.entries.values(), ...space.faint.values()]) {
    const as = entry.drawnAs;
    if (as === undefined || states.has(as) || space.entries.has(as) || space.faint.has(as))
      continue;
    keep(as, stateOf(as));
  }
  return states;
}

/**
 * Whether an element is marked through a container holding it, at any depth, that is selected (or
 * hovered) and draws no solid in the space: such a container is drawn as what is in it.
 */
function marksThrough(
  input: SpaceStatesInput,
): (element: Id, mark: 'selected' | 'hovered') => boolean {
  const { space, selected, hovered, containersOf, world } = input;
  if (!containersOf) return () => false;
  const drawsNoSolid = (element: Id) => {
    if (element === world) return false;
    const entry = space.entries.get(element) ?? space.faint.get(element);
    return entry?.solid === undefined;
  };
  const marking = {
    selected: new Set([...selected].filter(drawsNoSolid)),
    hovered: new Set(hovered !== undefined && drawsNoSolid(hovered) ? [hovered] : []),
  };
  if (marking.selected.size === 0 && marking.hovered.size === 0) return () => false;
  const known = new Map<Id, { selected: boolean; hovered: boolean }>();
  // What reaches an element from the containers above it, worked out once for each.
  const reaching = (element: Id, visiting: Set<Id>): { selected: boolean; hovered: boolean } => {
    const found = known.get(element);
    if (found) return found;
    const result = { selected: false, hovered: false };
    visiting.add(element);
    for (const container of containersOf(element)) {
      if (visiting.has(container)) continue;
      const above = reaching(container, visiting);
      result.selected ||= marking.selected.has(container) || above.selected;
      result.hovered ||= marking.hovered.has(container) || above.hovered;
      if (result.selected && result.hovered) break;
    }
    visiting.delete(element);
    known.set(element, result);
    return result;
  };
  return (element, mark) => reaching(element, new Set())[mark];
}

/** The states as the worker's messages carry them, one for each element that does not look plain. */
export function spaceStateList(states: ReadonlyMap<Id, SpaceElementState>): SpaceStateEntry[] {
  return [...states].map(([element, state]) => ({ element, ...state }));
}
