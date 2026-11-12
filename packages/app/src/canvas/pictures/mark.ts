/**
 * A video's play mark (ADR 0098, stage 2), pure, so that the canvas and the exports, which the
 * command line runs in Node, draw the same.
 */
import type { Rect } from '../geometry';

/**
 * Where a video's play mark goes in its rectangle: a disc a fifth of its shorter side, from 6 to 40
 * units across in radius, and a triangle pointing right within it. The exports draw the same.
 */
export function playMark(rect: Rect): {
  disc: { x: number; y: number; radius: number };
  triangle: number[];
} {
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  const radius = Math.max(6, Math.min(40, Math.min(rect.width, rect.height) / 5));
  const side = radius * 0.5;
  return {
    disc: { x, y, radius },
    triangle: [x - side * 0.6, y - side, x + side, y, x - side * 0.6, y + side],
  };
}
