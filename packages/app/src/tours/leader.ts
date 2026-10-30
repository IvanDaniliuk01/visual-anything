/**
 * A caption's leader line (ADR 0084): from the caption card's nearest edge to the nearest point of
 * the shape its `pointTo` names, or to the middle of a relation's route, following the camera and the
 * card. Straight, under the card and over the canvas; it never crosses the card, since it starts at
 * the card's point nearest where it ends. Off the canvas, it hides and the card says so.
 */
import { relationLinesOf, shownBy, type Scene } from '../canvas/scene';
import type { Camera } from '../canvas/camera';
import type { Point, Rect, Size } from '../canvas/geometry';

/** Where the leader line runs on screen, or that its mark is off the canvas. */
export type Leader = { from: Point; to: Point } | 'off';

/** What a leader line points at on screen: a shape's rectangle, or a relation route's middle. */
export type LeaderTarget = { rect: Rect } | { point: Point };

/**
 * The leader line from a card to what it points at: from the card's point nearest the target to the
 * target's point nearest that; `off` when the target is wholly off the screen; none when the target
 * meets the card, so that a line would run under it.
 */
export function leaderLine(card: Rect, target: LeaderTarget, screen: Size): Leader | undefined {
  const rect = 'rect' in target ? target.rect : { ...target.point, width: 0, height: 0 };
  const onScreen =
    rect.x <= screen.width &&
    rect.y <= screen.height &&
    rect.x + rect.width >= 0 &&
    rect.y + rect.height >= 0;
  if (!onScreen) return 'off';
  const middle = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const near = clampTo(middle, card);
  const to = clampTo(near, rect);
  const from = clampTo(to, card);
  if (inside(to, card)) return undefined;
  return { from, to };
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
