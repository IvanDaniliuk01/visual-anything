/**
 * Levels of detail on the canvas (ADR 0055): what a tile of shapes that declare levels shows at the
 * scale. The renderer works it out per tile, not per shape per frame: a tile holds only shapes that
 * declare the same levels, so all of them change level at once, and a change of level draws again
 * only the tiles that cross it. A level is entered at its scale and left 10% below it.
 *
 * What each part shows on the canvas:
 * - a silhouette: the shapes as plain blocks of their fill, as the canvas draws everything far out;
 * - anything else: the shapes drawn in full, with their names for `name`, and their detail under them
 *   for `detail`, which writes the name too;
 * - `contents`: for rows, their texts, which a row writes only from there; nothing else of a
 *   container, whose contents follow their own levels;
 * - `image`: their pictures, as the canvas shows pictures: without it, none.
 *
 * Shapes that declare no levels follow the canvas's own steps, as before: names from 0.45, details
 * from 0.9 and plain blocks below 0.25.
 */
import { levelAt, partsAt } from '@visual-anything/core';
import type { LevelOfDetail } from '@visual-anything/schema';

/** What a tile of shapes shows at a scale. */
export interface TileDetail {
  /** Whether it shows its plain drawing: its shapes as blocks. */
  coarse: boolean;
  /** Which labels it writes: none, names, or names and details. */
  wanted: 0 | 1 | 2;
  /** Whether its pictures show. */
  images: boolean;
}

/**
 * What shapes that declare these levels show at a scale, and the level reached, from `current`, the
 * level they showed until now; `rows` for a tile of rows.
 */
export function levelDetail(
  levels: readonly LevelOfDetail[],
  scale: number,
  current: number | undefined,
  rows: boolean,
): { at: number; detail: TileDetail } {
  const at = levelAt(levels, scale, current);
  const parts = partsAt(levels, at);
  const coarse = parts.has('silhouette');
  const wanted = coarse
    ? 0
    : rows
      ? parts.has('contents')
        ? 2
        : 0
      : parts.has('detail')
        ? 2
        : parts.has('name')
          ? 1
          : 0;
  return { at, detail: { coarse, wanted, images: !coarse && parts.has('image') } };
}

const namesFromLevels = new WeakMap<readonly LevelOfDetail[], number>();

/**
 * The least scale at which any of these shapes writes its name, which Fit keeps to (ADR 0055's
 * clarification of 2026-10-26): by its levels, the lowest that shows its name or its detail, where it
 * declares them, and `canvasNamesFrom`, the canvas's own step, where it does not. A row, which writes
 * its texts and no name, and a shape whose levels never show its name, count for nothing; with none
 * left, the canvas's own step.
 */
export function namesFromOf(
  shapes: readonly { levels?: readonly LevelOfDetail[]; row?: unknown }[],
  canvasNamesFrom: number,
): number {
  let least = Infinity;
  for (const shape of shapes) {
    if (shape.row !== undefined) continue;
    const { levels } = shape;
    if (levels === undefined || levels.length === 0) {
      least = Math.min(least, canvasNamesFrom);
      continue;
    }
    let from = namesFromLevels.get(levels);
    if (from === undefined) {
      from = Infinity;
      for (const level of levels) {
        if (level.shows.includes('silhouette')) continue;
        if (level.shows.includes('name') || level.shows.includes('detail')) {
          from = Math.min(from, level.from);
        }
      }
      namesFromLevels.set(levels, from);
    }
    least = Math.min(least, from);
  }
  return Number.isFinite(least) ? least : canvasNamesFrom;
}
