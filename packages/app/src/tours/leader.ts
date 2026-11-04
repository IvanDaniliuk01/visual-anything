/**
 * A caption's leader line (ADR 0084): from the caption card's nearest edge to the nearest point of
 * the shape its `pointTo` names, or to the middle of a relation's route, following the camera and the
 * card. Under the card and over the canvas; straight by default, it never crosses the card, since it
 * starts at the card's point nearest where it ends. A step may give it a shape, an end and a side to
 * leave from (ADR 0097). Off the canvas, it hides and the card says so.
 */
import { relationLinesOf, shownBy, type Scene } from '../canvas/scene';
import type { Camera } from '../canvas/camera';
import type { Point, Rect, Size } from '../canvas/geometry';

/** A side of the caption card. */
export type CardSide = 'top' | 'right' | 'bottom' | 'left';

/**
 * Where the leader line runs on screen, and the card's side it leaves from, which an elbow or a curve
 * leaves square to (ADR 0097); or that its mark is off the canvas.
 */
export type Leader = { from: Point; to: Point; side: CardSide } | 'off';

/** What a leader line points at on screen: a shape's rectangle, or a relation route's middle. */
export type LeaderTarget = { rect: Rect } | { point: Point };

/**
 * The leader line from a card to what it points at: from the middle of the card's side `side` when
 * given (ADR 0097), else from the card's point nearest the target, to the target's point nearest that;
 * `off` when the target is wholly off the screen; none when the target meets the card, so that a line
 * would run under it.
 */
export function leaderLine(
  card: Rect,
  target: LeaderTarget,
  screen: Size,
  side?: CardSide,
): Leader | undefined {
  const rect = 'rect' in target ? target.rect : { ...target.point, width: 0, height: 0 };
  const onScreen =
    rect.x <= screen.width &&
    rect.y <= screen.height &&
    rect.x + rect.width >= 0 &&
    rect.y + rect.height >= 0;
  if (!onScreen) return 'off';
  if (side !== undefined) {
    const from = sideMiddle(card, side);
    const to = clampTo(from, rect);
    if (inside(to, card)) return undefined;
    return { from, to, side };
  }
  const middle = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const near = clampTo(middle, card);
  const to = clampTo(near, rect);
  const from = clampTo(to, card);
  if (inside(to, card)) return undefined;
  return { from, to, side: sideOf(card, from, to) };
}

/** The middle of a side of a rectangle. */
function sideMiddle(rect: Rect, side: CardSide): Point {
  switch (side) {
    case 'top':
      return { x: rect.x + rect.width / 2, y: rect.y };
    case 'right':
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 };
    case 'bottom':
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height };
    case 'left':
      return { x: rect.x, y: rect.y + rect.height / 2 };
  }
}

/**
 * The side of the card a point on its border lies on; at a corner, the one that faces the target
 * more, across the longer way to it.
 */
function sideOf(card: Rect, from: Point, to: Point): CardSide {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const left = from.x <= card.x;
  const right = from.x >= card.x + card.width;
  const top = from.y <= card.y;
  const bottom = from.y >= card.y + card.height;
  if ((left || right) && (!(top || bottom) || Math.abs(dx) >= Math.abs(dy))) {
    return left ? 'left' : 'right';
  }
  if (top || bottom) return top ? 'top' : 'bottom';
  return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'top' : 'bottom';
}

/**
 * The path a leader line is drawn along (ADR 0097), as SVG path data: straight; with one right-angled
 * turn, out of its side first; or a curve leaving its side square and arriving along the way it ran.
 */
export function leaderPath(
  leader: { from: Point; to: Point; side: CardSide },
  shape: 'straight' | 'elbow' | 'curved' = 'straight',
): string {
  const { from, to, side } = leader;
  const across = side === 'left' || side === 'right';
  if (shape === 'elbow') {
    const corner = across ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
    return `M ${from.x} ${from.y} L ${corner.x} ${corner.y} L ${to.x} ${to.y}`;
  }
  if (shape === 'curved') {
    const reach = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) / 2;
    const out = {
      top: { x: 0, y: -1 },
      right: { x: 1, y: 0 },
      bottom: { x: 0, y: 1 },
      left: { x: -1, y: 0 },
    }[side];
    const c1 = { x: from.x + out.x * reach, y: from.y + out.y * reach };
    const c2 = across
      ? { x: to.x, y: from.y + (to.y - from.y) / 2 }
      : { x: from.x + (to.x - from.x) / 2, y: to.y };
    return `M ${from.x} ${from.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${to.x} ${to.y}`;
  }
  return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
}

/**
 * The direction the line arrives at its mark in, as a unit vector: along its last run, which an
 * arrow at its end points along.
 */
export function leaderArrival(
  leader: { from: Point; to: Point; side: CardSide },
  shape: 'straight' | 'elbow' | 'curved' = 'straight',
): Point {
  const { from, to, side } = leader;
  const across = side === 'left' || side === 'right';
  let dx = to.x - from.x;
  let dy = to.y - from.y;
  if (shape !== 'straight') {
    if (across && dy !== 0) dx = 0;
    else if (!across && dx !== 0) dy = 0;
  }
  const length = Math.hypot(dx, dy);
  return length === 0 ? { x: 1, y: 0 } : { x: dx / length, y: dy / length };
}

/** Where a mark is on screen with a camera: its shape, or its line's middle; none if not drawn. */
export function leaderTargetOf(scene: Scene, id: string, camera: Camera): LeaderTarget | undefined {
  const line = relationLinesOf(scene).get(id);
  if (line) {
    return {
      point: {
        x: line.middle.x * camera.scale + camera.x,
        y: line.middle.y * camera.scale + camera.y,
      },
    };
  }
  const shape = shownBy(scene, id);
  const rect =
    shape?.rect ?? scene.notes.find((note) => note.id === id)?.rect ?? arrowRect(scene, id);
  if (!rect) return undefined;
  return {
    rect: {
      x: rect.x * camera.scale + camera.x,
      y: rect.y * camera.scale + camera.y,
      width: rect.width * camera.scale,
      height: rect.height * camera.scale,
    },
  };
}

function arrowRect(scene: Scene, id: string): Rect | undefined {
  const arrow = scene.arrows.find((each) => each.id === id);
  if (!arrow) return undefined;
  const x = Math.min(arrow.from.x, arrow.to.x);
  const y = Math.min(arrow.from.y, arrow.to.y);
  return {
    x,
    y,
    width: Math.abs(arrow.to.x - arrow.from.x),
    height: Math.abs(arrow.to.y - arrow.from.y),
  };
}

function clampTo(point: Point, rect: Rect): Point {
  return {
    x: Math.min(rect.x + rect.width, Math.max(rect.x, point.x)),
    y: Math.min(rect.y + rect.height, Math.max(rect.y, point.y)),
  };
}

function inside(point: Point, rect: Rect): boolean {
  return (
    point.x > rect.x &&
    point.x < rect.x + rect.width &&
    point.y > rect.y &&
    point.y < rect.y + rect.height
  );
}
