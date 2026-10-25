/**
 * Levels of detail (ADR 0055): what a shape shows from a scale up, as its appearance declares. Levels
 * sort by the scale they start at, and the highest reached wins; below the first, a shape shows its
 * silhouette. A level is entered at its scale and left only 10% below it, so that a zoom that hovers
 * at a threshold never flickers. The same holds for a collapsed container that expands as the canvas
 * zooms into it. These are pure, so the canvas works them out per tile and tests check them alone.
 */
import type { LevelOfDetail, LevelPart } from '@visual-anything/schema';

/** Every part a level can show, in the order the editors offer them. */
export const LEVEL_PARTS: readonly LevelPart[] = [
  'silhouette',
  'name',
  'detail',
  'contents',
  'image',
] satisfies readonly LevelPart[];

/** The most levels an appearance declares. */
export const MAX_LEVELS = 8;

/** The largest scale a level starts at, or a container expands from: the canvas's closest zoom. */
export const MAX_LEVEL_SCALE = 8;

/** How far below its scale a level, or an expansion, is left: 10% below it (ADR 0055). */
export const LEVEL_EXIT = 0.9;

const sorted = new WeakMap<readonly LevelOfDetail[], readonly LevelOfDetail[]>();

/**
 * Levels in increasing order of the scale each starts at. Two levels that start at one scale, as a
 * file edited by hand may hold, count as the last of them, as a later one wins.
 */
export function sortedLevels(levels: readonly LevelOfDetail[]): readonly LevelOfDetail[] {
  let known = sorted.get(levels);
  if (!known) {
    const byScale = new Map<number, LevelOfDetail>();
    for (const level of levels) byScale.set(level.from, level);
    known = [...byScale.values()].sort((a, b) => a.from - b.from);
    sorted.set(levels, known);
  }
  return known;
}

/**
 * The level reached at a scale, as its index in `sortedLevels`, or -1 below the first: from `current`,
 * the level shown until now, it goes up once the scale reaches a higher level's start, and down only
 * once it falls 10% below the start of the one shown. Without `current`, the level whose range holds
 * the scale.
 */
export function levelAt(levels: readonly LevelOfDetail[], scale: number, current?: number): number {
  const ordered = sortedLevels(levels);
  if (current === undefined || current < -1 || current >= ordered.length) {
    let at = -1;
    while (at + 1 < ordered.length && scale >= (ordered[at + 1] as LevelOfDetail).from) at += 1;
    return at;
  }
  let at = current;
  while (at + 1 < ordered.length && scale >= (ordered[at + 1] as LevelOfDetail).from) at += 1;
  while (at >= 0 && scale < (ordered[at] as LevelOfDetail).from * LEVEL_EXIT) at -= 1;
  return at;
}

const SILHOUETTE: ReadonlySet<LevelPart> = new Set(['silhouette']);
const shown = new WeakMap<LevelOfDetail, ReadonlySet<LevelPart>>();

/**
 * What a shape shows at a level, by its index in `sortedLevels`: a silhouette below the first, and a
 * silhouette only for a level that says it, whatever else it lists.
 */
export function partsAt(levels: readonly LevelOfDetail[], at: number): ReadonlySet<LevelPart> {
  const level = sortedLevels(levels)[at];
  if (level === undefined) return SILHOUETTE;
  let parts = shown.get(level);
  if (!parts) {
    parts = level.shows.includes('silhouette') ? SILHOUETTE : new Set(level.shows);
    shown.set(level, parts);
  }
  return parts;
}

/**
 * Whether a collapsed container whose appearance expands from `expandFrom` shows expanded at a scale:
 * it expands once the scale reaches `expandFrom` and collapses again only 10% below it.
 */
export function expandedAt(expandFrom: number, scale: number, expanded: boolean): boolean {
  return expanded ? scale >= expandFrom * LEVEL_EXIT : scale >= expandFrom;
}

/**
 * A short key that names a list of levels by what it says, the same for equal lists: tiles group
 * shapes by it, so that every shape of a tile changes level at once.
 */
export function levelsKey(levels: readonly LevelOfDetail[]): string {
  return sortedLevels(levels)
    .map((level) => `${level.from}:${partsKey(level)}`)
    .join(';');
}

function partsKey(level: LevelOfDetail): string {
  if (level.shows.includes('silhouette')) return 's';
  return LEVEL_PARTS.filter((part) => level.shows.includes(part))
    .map((part) => part.charAt(0))
    .join('');
}
