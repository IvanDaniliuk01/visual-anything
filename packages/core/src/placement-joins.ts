/**
 * Whether the app's placement of what an action added may join that action in the history (ADR 0065
 * and its clarification of W48). The local program asks it, with the project as it was before the
 * action and as it is now, right after it, before it extends the action with the placement.
 *
 * A placement joins when it is only `set-positions`, every position is unpinned, and each is:
 * - of a shape the action created, or moved into another container: a shape, an element in the
 *   container its shape sits in, that the view did not have before the action; or
 * - of a shape beside a container the action made grow, which the placement moved aside to make
 *   room: it sits where a container holding such a new shape sits, it had a stored, unpinned position
 *   there before, it moved only right or down, and it kept its stored size.
 *
 * Anything else is the person's own action, so that a layout that comes late or does more never rides
 * on someone else's action.
 */
import type { Id, ShapePosition, ViewFile } from '@visual-anything/schema';
import type { Command } from './commands';
import { positionKey } from './operations';
import { shapesInView } from './scope-placement';
import type { ProjectSnapshot } from './snapshot';

/** Whether a placement joins the action before it, or why not, in words for the program's log. */
export type PlacementJoin = { ok: true } | { ok: false; why: string };

/** The key of a shape: its element and the container it sits in, as positions are keyed. */
const keyOf = (element: Id, container: Id | undefined) => positionKey({ element, container });

/**
 * Whether a placement joins the action that took the project from `previous` to `current`: see the
 * module's comment.
 */
export function placementJoins(
  previous: ProjectSnapshot,
  current: ProjectSnapshot,
  command: Command,
): PlacementJoin {
  const placements = setPositionsOf(command);
  if (placements === undefined) return { ok: false, why: 'it does more than set positions' };
  for (const placement of placements) {
    const view = current.views.find((each) => each.id === placement.view);
    if (!view) return { ok: false, why: 'it names a view the project does not have' };
    const before = previous.views.find((each) => each.id === view.id);
    const { added, levels } = addedShapes(previous, before, current, view);
    const stored = new Map((before?.positions ?? []).map((each) => [positionKey(each), each]));
    for (const position of placement.positions ?? []) {
      if (position.pinned === true) return { ok: false, why: 'it pins a position' };
      const key = positionKey(position);
      if (added.has(key)) continue;
      const was = stored.get(key);
      const beside =
        was !== undefined &&
        was.pinned !== true &&
        levels.has(position.container ?? WORLD) &&
        position.x >= was.x &&
        position.y >= was.y &&
        position.width === was.width &&
        position.height === was.height;
      if (!beside) {
        return { ok: false, why: 'it moves a shape the action neither added nor made room for' };
      }
    }
  }
  return { ok: true };
}

/** Stands for World among levels, where no element's id can. */
const WORLD = ' world';

/** The `set-positions` a command is made of, directly or in batches; undefined if it holds more. */
function setPositionsOf(
  command: Command,
): { view: Id; positions?: readonly ShapePosition[] }[] | undefined {
  if (command.type === 'set-positions') return [command];
  if (command.type !== 'batch' || !Array.isArray(command.commands)) return undefined;
  const found: { view: Id; positions?: readonly ShapePosition[] }[] = [];
  for (const each of command.commands) {
    const inner = setPositionsOf(each);
    if (inner === undefined) return undefined;
    found.push(...inner);
  }
  return found;
}

/**
 * The shapes of a view that the action added, by key, and the levels where a shape beside what grew
 * may move: each container, or World, in which sits a container that holds such a shape, at any depth.
 */
function addedShapes(
  previous: ProjectSnapshot,
  before: ViewFile | undefined,
  current: ProjectSnapshot,
  view: ViewFile,
): { added: ReadonlySet<string>; levels: ReadonlySet<string> } {
  const now = shapesInView(current, view);
  const then = before === undefined ? undefined : shapesInView(previous, before);
  const added = new Set<string>();
  const grown = new Set<Id>();
  const grow = (container: Id) => {
    const waiting = [container];
    for (let at = waiting.pop(); at !== undefined; at = waiting.pop()) {
      if (grown.has(at)) continue;
      grown.add(at);
      waiting.push(...(now.containersOf(at) ?? []));
    }
  };
  const elements = [current.model.world.id, ...current.model.elements.map((each) => each.id)];
  for (const element of elements) {
    const containers = now.containersOf(element);
    if (containers === undefined) continue;
    const had = then?.containersOf(element);
    const sits = containers.length === 0 ? [undefined] : containers;
    for (const container of sits) {
      const was =
        had !== undefined && (container === undefined ? had.length === 0 : had.includes(container));
      if (was) continue;
      added.add(keyOf(element, container));
      if (container !== undefined) grow(container);
    }
  }
  const levels = new Set<string>();
  for (const container of grown) {
    const around = now.containersOf(container) ?? [];
    if (around.length === 0) levels.add(WORLD);
    for (const each of around) levels.add(each);
  }
  return { added, levels };
}
