/**
 * Lines that take their color back, and the rest that fade, as the pointer and the selection say
 * (ADR 0086): where the drawing defaults draw lines in one neutral color, a line under the pointer,
 * a selected one, and the lines touching a shape under the pointer or selected take their type's
 * color; with `fadeOthers`, while the pointer is on a shape or a line, the lines that do not touch it
 * fade to `FADED_OTHERS`. Fading on selection stays the view's `selectionFadesLines` (ADR 0080),
 * which the emphasis draws.
 *
 * The canvas draws these lines again, over the tiles, in their color, while the tiles keep drawing
 * them as they are: a change of pointer or selection redraws a few lines, never a tile. Pure: the
 * renderer strokes what this gives.
 */
import type { ThemeName } from '@visual-anything/core';
import type { Color, Id } from '@visual-anything/schema';
import { lineStroke } from './theme/paint';
import { standsFor, type DrawnEnd, type RelationLine, type Scene } from './scene';

/** How opaque the lines that touch nothing pointed at are drawn while the pointer is on something. */
export const FADED_OTHERS = 0.35;

/** What the pointer and the selection are on, by the scene's keys. */
export interface Pointed {
  /** The shape under the pointer. */
  shape?: string;
  /** The line under the pointer, by its key. */
  line?: string;
  /** The selected elements' shape keys, and the selected relations. */
  selectedShapes: ReadonlySet<string>;
  selectedRelations: ReadonlySet<Id>;
}

/** The lines of a scene by the shapes they end on, built once for each scene. */
const byEnd = new WeakMap<Scene, Map<string, RelationLine[]>>();

function linesByEnd(scene: Scene): Map<string, RelationLine[]> {
  let index = byEnd.get(scene);
  if (index === undefined) {
    index = new Map();
    const add = (end: DrawnEnd | undefined, line: RelationLine) => {
      if (end?.kind !== 'shape') return;
      const list = index?.get(end.key);
      if (list) list.push(line);
      else index?.set(end.key, [line]);
    };
    for (const line of scene.relations) {
      const { from, to } = line.ends ?? {};
      add(from, line);
      // A line from a shape to itself is listed once.
      if (!(from?.kind === 'shape' && to?.kind === 'shape' && from.key === to.key)) add(to, line);
    }
    byEnd.set(scene, index);
  }
  return index;
}

/** Whether a scene draws any line in the neutral color, whose type's color hover gives back. */
const neutralScenes = new WeakMap<readonly RelationLine[], boolean>();

export function drawsNeutralLines(scene: Scene): boolean {
  let neutral = neutralScenes.get(scene.relations);
  if (neutral === undefined) {
    neutral = scene.relations.some((line) => line.typeStroke !== undefined);
    neutralScenes.set(scene.relations, neutral);
  }
  return neutral;
}

/**
 * The lines that end on these shapes or on shapes inside them, as a selected table keeps the lines of
 * its rows (a shape's key names the shapes it sits in, from World down, joined by `/`): each end
 * is looked at once, whatever the number of shapes.
 */
function linesOnShapes(scene: Scene, keys: ReadonlySet<string>, into: Set<RelationLine>): void {
  if (keys.size === 0) return;
  const within = (key: string): boolean => {
    if (keys.has(key)) return true;
    for (let at = key.indexOf('/'); at >= 0; at = key.indexOf('/', at + 1)) {
      if (keys.has(key.slice(0, at))) return true;
    }
    return false;
  };
  for (const [end, lines] of linesByEnd(scene)) {
    if (within(end)) for (const line of lines) into.add(line);
  }
}

/**
 * The most lines the selection gives their color back: past it, as when everything is selected, the
 * selection leaves lines as they are drawn, so that drawing them again never costs a large view's
 * frames.
 */
export const MOST_ACCENTED = 1000;

/** The lines the pointer is on or touches: the line under it, or those on the shape under it. */
export function pointedLines(scene: Scene, pointed: Pointed): Set<RelationLine> {
  const lines = new Set<RelationLine>();
  if (pointed.line !== undefined) {
    const line = scene.relations.find((each) => each.relation === pointed.line);
    if (line) lines.add(line);
  }
  if (pointed.shape !== undefined) linesOnShapes(scene, new Set([pointed.shape]), lines);
  return lines;
}

/** The lines the selection holds or touches. */
export function selectedLines(scene: Scene, pointed: Pointed): Set<RelationLine> {
  const lines = new Set<RelationLine>();
  if (pointed.selectedRelations.size > 0) {
    for (const line of scene.relations) {
      if (standsFor(line).some((id) => pointed.selectedRelations.has(id))) lines.add(line);
    }
  }
  linesOnShapes(scene, pointed.selectedShapes, lines);
  return lines.size > MOST_ACCENTED ? new Set() : lines;
}

/** A line drawn again over the tiles, in the color it takes. */
export interface AccentedLine {
  line: RelationLine;
  stroke: Color;
}

/** What the canvas draws for the pointer and the selection: the lines again, and how the rest fade. */
export interface Accents {
  lines: AccentedLine[];
  /** How opaque the tiles' lines are: `FADED_OTHERS` while some fade, 1 otherwise. */
  othersAlpha: number;
}

const NO_ACCENTS: Accents = { lines: [], othersAlpha: 1 };

/**
 * What the pointer and the selection change of a scene's lines, in a theme: each line that takes its
 * type's color, and with `fadeOthers` while the pointer is on something, every line it touches,
 * drawn again whole over the faded rest. `hidden` lines are drawn nowhere.
 */
export function accentsOf(
  scene: Scene,
  pointed: Pointed,
  options: { fadeOthers: boolean; theme: ThemeName; hidden: ReadonlySet<string> },
): Accents {
  const neutral = drawsNeutralLines(scene);
  const pointing = pointed.shape !== undefined || pointed.line !== undefined;
  const fading = options.fadeOthers && pointing;
  if (!neutral && !fading) return NO_ACCENTS;
  const touched = pointing ? pointedLines(scene, pointed) : new Set<RelationLine>();
  const chosen = neutral ? selectedLines(scene, pointed) : new Set<RelationLine>();
  const lines: AccentedLine[] = [];
  const add = (line: RelationLine, whole: boolean) => {
    if (options.hidden.has(line.relation)) return;
    if (line.typeStroke === undefined && !whole) return;
    lines.push({ line, stroke: accentStroke(line, options.theme) });
  };
  for (const line of touched) add(line, fading);
  for (const line of chosen) if (!touched.has(line)) add(line, false);
  if (!fading && lines.length === 0) return NO_ACCENTS;
  return { lines, othersAlpha: fading ? FADED_OTHERS : 1 };
}

/** The color a line takes on hover and selection: its type's, or the color it is drawn in. */
export function accentStroke(line: RelationLine, theme: ThemeName): Color {
  const type = line.typeStroke;
  if (type === undefined) return lineStroke(line, theme);
  return theme === 'dark' ? (type.dark ?? type.light) : type.light;
}
