/**
 * Collapsing closes the room it leaves (ADR 0080's clarification of 2026-10-29, built in M3c Stage
 * 1). A container collapsed with no places to give back, expanded since the view was made or before a
 * reload, would leave a hole the size it had open. So the shapes it freed move back left or up, by the
 * least that keeps 40 units apart, in their order, level by level up to World:
 *
 * - at each level, the siblings that stood to the right of the shrunk box, within 40 of its height,
 *   and those to their right in turn, move left by up to what it shrank across; those below it, and
 *   below them in turn, move up by up to what it shrank down;
 * - each stops 40 from what stands before it, moved or not, on the step of 8, and never moves right
 *   or down;
 * - pinned shapes, rows and the anchored parts of a drawing never move, and stand in the way;
 * - a container whose contents closed up shrinks too, and its own level closes up after it.
 *
 * It is worked out from the scenes the view draws, open and collapsed, and is stored as one
 * `set-positions`, part of the collapse's own action.
 */
import { executeCommand, positionKey, type ProjectSnapshot } from '@visual-anything/core';
import type { Id, ShapePosition } from '@visual-anything/schema';
import type { Rect } from '../geometry';
import { buildScene, type ElementShape, type Scene } from '../scene';
import { LAYOUT_STEP, NODE_GAP } from './types';

/** How many levels up closing goes, however deep a file nests containers. */
const MOST_LEVELS = 64;

/** A sibling closing up: its shape, its rectangle as it stands, and whether it may move. */
interface Sibling {
  shape: ElementShape;
  rect: Rect;
  movable: boolean;
}

/**
 * The places that close the room collapsing `elements` leaves, given the project with them open and
 * with them collapsed; none when nothing moves.
 */
export function closedRoom(
  open: ProjectSnapshot,
  collapsed: ProjectSnapshot,
  viewId: Id,
  elements: readonly Id[],
): ShapePosition[] {
  const view = collapsed.views.find((each) => each.id === viewId);
  if (!view) return [];
  const before = buildScene(open, viewId);
  const was = new Map(before.shapes.map((shape) => [shape.key, shape.rect]));
  const closing = new Set(elements);
  let shrunk = new Set(
    before.shapes.filter((shape) => closing.has(shape.element)).map((shape) => shape.key),
  );
  const stored = new Map(view.positions.map((position) => [positionKey(position), position]));
  const placed = new Map<string, ShapePosition>();
  let project = collapsed;
  for (let level = 0; level < MOST_LEVELS && shrunk.size > 0; level++) {
    const scene = buildScene(project, viewId);
    const moves = closeLevel(scene, was, shrunk, stored, placed);
    if (moves.length > 0) {
      for (const position of moves) placed.set(positionKey(position), position);
      const done = executeCommand(project, {
        type: 'set-positions',
        view: viewId,
        positions: moves,
      });
      if (!done.ok) break;
      project = done.state;
    }
    // The containers that hold what shrank, once it closed up, shrink in their turn.
    const now = moves.length > 0 ? buildScene(project, viewId) : scene;
    const rects = new Map(now.shapes.map((shape) => [shape.key, shape.rect]));
    const next = new Set<string>();
    for (const key of shrunk) {
      const holder = scene.shapes.find((shape) => shape.key === key)?.containerShape;
      if (holder === undefined) continue;
      const from = was.get(holder);
      const to = rects.get(holder);
      if (from && to && (to.width < from.width || to.height < from.height)) next.add(holder);
    }
    shrunk = next;
  }
  return [...placed.values()];
}

/**
 * The places that close up one level around the shapes of `shrunk` that sit in it, from the scene
 * as it stands now and the rectangles they had open.
 */
function closeLevel(
  scene: Scene,
  was: ReadonlyMap<string, Rect>,
  shrunk: ReadonlySet<string>,
  stored: ReadonlyMap<string, ShapePosition>,
  placed: ReadonlyMap<string, ShapePosition>,
): ShapePosition[] {
  const byHolder = new Map<string | undefined, ElementShape[]>();
  for (const shape of scene.shapes) {
    const list = byHolder.get(shape.containerShape);
    if (list) list.push(shape);
    else byHolder.set(shape.containerShape, [shape]);
  }
  const moves: ShapePosition[] = [];
  const holders = new Set(
    [...shrunk].map((key) => scene.shapes.find((shape) => shape.key === key)?.containerShape),
  );
  for (const holder of holders) {
    const siblings: Sibling[] = (byHolder.get(holder) ?? []).map((shape) => ({
      shape,
      rect: { ...shape.rect },
      movable:
        shape.positioned === 'stored' &&
        shape.row === undefined &&
        shape.part?.inDrawing !== true &&
        stored.has(positionKey(shape)),
    }));
    const boxes = siblings.filter((each) => shrunk.has(each.shape.key));
    const left = new Map<Sibling, number>();
    const up = new Map<Sibling, number>();
    for (const box of boxes) {
      const open = was.get(box.shape.key);
      if (!open) continue;
      const across = open.x + open.width - (box.rect.x + box.rect.width);
      const down = open.y + open.height - (box.rect.y + box.rect.height);
      if (across > 0) reach(box, open, siblings, 'x', across, left);
      if (down > 0) reach(box, open, siblings, 'y', down, up);
    }
    for (const each of left.keys()) up.delete(each);
    const moved = new Set<Sibling>();
    close(siblings, left, 'x', moved);
    close(siblings, up, 'y', moved);
    for (const each of moved) {
      const key = positionKey(each.shape);
      const position = placed.get(key) ?? stored.get(key);
      if (!position) continue;
      const by = { x: each.rect.x - each.shape.rect.x, y: each.rect.y - each.shape.rect.y };
      moves.push({ ...position, x: position.x + by.x, y: position.y + by.y });
    }
  }
  return moves;
}

/**
 * The siblings that stood past an open box along `axis`, within 40 of it across, and those past them
 * in turn, each with the most it may move back: what the box shrank by along `axis`.
 */
function reach(
  box: Sibling,
  open: Rect,
  siblings: readonly Sibling[],
  axis: 'x' | 'y',
  by: number,
  found: Map<Sibling, number>,
): void {
  const waiting: Rect[] = [open];
  const seen = new Set<Sibling>([box]);
  for (let from = waiting.pop(); from !== undefined; from = waiting.pop()) {
    for (const each of siblings) {
      if (seen.has(each) || !past(from, each.rect, axis)) continue;
      seen.add(each);
      if (!each.movable) continue;
      found.set(each, Math.max(found.get(each) ?? 0, by));
      waiting.push(each.rect);
    }
  }
}

/** Whether `rect` stands past `from` along `axis`, and within 40 of it across. */
function past(from: Rect, rect: Rect, axis: 'x' | 'y'): boolean {
  if (axis === 'x') {
    return rect.x >= from.x + from.width && near(from.y, from.height, rect.y, rect.height);
  }
  return rect.y >= from.y + from.height && near(from.x, from.width, rect.x, rect.width);
}

/** Whether two spans come within 40 of each other. */
function near(a: number, aSize: number, b: number, bSize: number): boolean {
  return b < a + aSize + NODE_GAP && a < b + bSize + NODE_GAP;
}

/**
 * Moves each sibling of `movers` back along `axis`, in their order, by the most it may, but stopping
 * 40 from whatever stands before it within 40 across, on the step of 8.
 */
function close(
  siblings: readonly Sibling[],
  movers: ReadonlyMap<Sibling, number>,
  axis: 'x' | 'y',
  moved: Set<Sibling>,
): void {
  const size = axis === 'x' ? 'width' : 'height';
  const order = [...movers.keys()].sort((a, b) => a.rect[axis] - b.rect[axis]);
  for (const each of order) {
    const most = movers.get(each) ?? 0;
    const start = each.rect[axis];
    let stop = start - most;
    for (const other of siblings) {
      if (other === each) continue;
      const before = other.rect[axis] + other.rect[size];
      if (before > start) continue;
      const across =
        axis === 'x'
          ? near(other.rect.y, other.rect.height, each.rect.y, each.rect.height)
          : near(other.rect.x, other.rect.width, each.rect.x, each.rect.width);
      if (across) stop = Math.max(stop, before + NODE_GAP);
    }
    const by = Math.floor((start - stop) / LAYOUT_STEP) * LAYOUT_STEP;
    if (by <= 0) continue;
    each.rect = { ...each.rect, [axis]: start - by };
    moved.add(each);
  }
}
