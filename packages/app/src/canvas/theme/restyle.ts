/**
 * How the canvas restyles its tiles in place (ADR-0033): after a theme switch, the tiles drawn in
 * built-in colors; after a recolor, the tiles whose shapes, lines or notes changed only their colors.
 *
 * Each drawing of a tile carries a stamp: the theme it was drawn in, when the tile's drawings follow
 * the theme, and how many times the tile's colors changed. A drawing whose stamp is not the one the
 * canvas should show is stale. Stale drawings on screen are drawn again behind the ones showing, the
 * nearest the middle of the screen first, within a clock of their own each frame; once none is left
 * on screen, or after `SWAP_WITHIN` frames, they are shown in one frame, with the new theme's canvas,
 * marks and label tints. Drawings off screen are drawn again before they show, and while the camera
 * rests. A drawing is never dropped for being stale: it shows until the new one is ready.
 */
import type { ThemeName } from '@visual-anything/core';
import type { ArrowShape, ElementShape, NoteShape, RelationLine } from '../scene';
import type { TilePlan } from '../tiles';
import { lineFollowsTheme, noteFollowsTheme, shapeFollowsTheme } from './paint';

/** How long a frame may spend drawing tiles again, in milliseconds; labels take what is left of it. */
export const RESTYLE_BUDGET = 6;
/**
 * How long a frame may spend drawing again, while the camera rests, the tiles that do not show: when
 * nothing moves, a longer frame is not seen, and they are ready sooner for when the camera moves.
 */
export const CATCH_UP_BUDGET = 12;
/** How many frames a switch or a recolor waits for the tiles on screen before it shows anyway. */
export const SWAP_WITHIN = 30;

/** What the benchmark checks of restyles. */
export interface RestyleStats {
  /**
   * Tiles shown in their plain drawing close enough for their full drawing, which they had before
   * they were restyled: never, since a restyle keeps a full drawing until the new one shows.
   */
  fallbacks: number;
  /** Tiles shown, once a switch or a recolor showed, with drawings of the theme or colors before it. */
  staleShown: number;
  /** For each switch or recolor shown, how many frames it took from its start. */
  swapAfter: number[];
}

/** The drawings of a tile: its plain drawing, shown far out, and its full drawing. */
export type Drawing = 'coarse' | 'full';

/** The stamp of drawings made in `theme`, of a tile whose colors changed `paints` times. */
export function stampOf(followsTheme: boolean, theme: ThemeName, paints: number): string {
  return followsTheme ? `${theme} ${paints}` : `any ${paints}`;
}

/** What a tile draws, as far as the theme goes. */
export interface TileItems {
  kind: 'shapes' | 'relations' | 'free';
  shapes: readonly ElementShape[];
  /** For relations: every one it draws something of, and those whose names it writes. */
  touching: readonly RelationLine[];
  lines: readonly RelationLine[];
  notes: readonly NoteShape[];
  arrows: readonly ArrowShape[];
}

const drawingsFollow = new WeakMap<readonly object[], boolean>();
const labelsFollow = new WeakMap<readonly object[], boolean>();

/**
 * Whether a tile's drawings differ between the themes: one of its shapes or lines is in a built-in
 * color, or one of its free shapes takes the theme's colors. Free arrows' casings are drawn in the
 * canvas color, so a tile of free shapes with arrows follows the theme too.
 */
export function drawingsFollowTheme(tile: TileItems): boolean {
  const members = membersOf(tile);
  let follows = drawingsFollow.get(members);
  if (follows === undefined) {
    follows =
      tile.kind === 'shapes'
        ? tile.shapes.some(shapeFollowsTheme)
        : tile.kind === 'relations'
          ? tile.touching.some(lineFollowsTheme)
          : tile.notes.some(noteFollowsTheme) || tile.arrows.length > 0;
    drawingsFollow.set(members, follows);
  }
  return follows;
}

/**
 * Whether a tile's labels are tinted differently in each theme: a shape's on a built-in fill, every
 * relation's name, which is written in the theme's text over the theme's canvas, and a note's text on
 * the theme's fill.
 */
export function labelsFollowTheme(tile: TileItems): boolean {
  const members = tile.kind === 'relations' ? tile.lines : membersOf(tile);
  let follows = labelsFollow.get(members);
  if (follows === undefined) {
    follows =
      tile.kind === 'shapes'
        ? tile.shapes.some(shapeFollowsTheme)
        : tile.kind === 'relations'
          ? tile.lines.some((line) => line.label !== undefined)
          : tile.notes.some((note) => note.fill === undefined);
    labelsFollow.set(members, follows);
  }
  return follows;
}

function membersOf(tile: TileItems): readonly object[] {
  return tile.kind === 'shapes'
    ? tile.shapes
    : tile.kind === 'relations'
      ? tile.touching
      : tile.notes;
}

/**
 * The drawings a tile shows now: far out its plain drawing, closer in its full one once it has one;
 * free shapes have only a full drawing. A plain drawing of relations whose lines are all thinner than
 * half a device pixel on screen, as at the whole view of a large scene, shows next to nothing: it is
 * not waited for, and is restyled while the camera rests or once it shows.
 */
export function shownDrawings(
  tile: {
    kind: TileItems['kind'];
    coarse?: unknown;
    full?: unknown;
    touching?: readonly RelationLine[];
  },
  coarse: boolean,
  devicePixelsPerUnit = Infinity,
): Drawing[] {
  if (tile.kind === 'free') return tile.full ? ['full'] : [];
  if (!coarse && tile.full) return ['full'];
  if (tile.kind === 'relations' && widestLine(tile.touching ?? []) * devicePixelsPerUnit < 0.5) {
    return [];
  }
  return tile.coarse ? ['coarse'] : [];
}

const widest = new WeakMap<readonly RelationLine[], number>();

/** How wide the widest of these lines is, in canvas units. */
function widestLine(lines: readonly RelationLine[]): number {
  let width = widest.get(lines);
  if (width === undefined) {
    width = 0;
    for (const line of lines) if (line.width > width) width = line.width;
    widest.set(lines, width);
  }
  return width;
}

/**
 * Takes out of a plan the tiles that it would make again, under the same key, only because what they
 * draw changed its colors: `same` says whether the tile drawn before under that key and the planned
 * one differ in nothing else. Those tiles are kept, and restyled in place.
 */
export function takeRepaints<P extends { key: string }>(
  plan: TilePlan<P>,
  same: (key: string, next: P) => boolean,
): P[] {
  const dropping = new Set(plan.drop);
  const repaints: P[] = [];
  plan.make = plan.make.filter((next) => {
    if (!dropping.has(next.key) || !same(next.key, next)) return true;
    repaints.push(next);
    dropping.delete(next.key);
    return false;
  });
  if (repaints.length > 0) plan.drop = plan.drop.filter((key) => dropping.has(key));
  return repaints;
}
