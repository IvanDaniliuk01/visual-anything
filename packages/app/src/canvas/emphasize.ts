/**
 * What an emphasis does to a scene (interface I2): which of the shapes and lines it draws are hidden,
 * dimmed or highlighted, and where markers travel. Pure, so that the canvas draws it, pointing goes
 * past what it hides, and the outline leaves out the rows of what it hides, all from the same rules.
 *
 * Filters, focus, playback and guidance name relations by their ids. A relation that a collapsed
 * container hides is drawn by the aggregated relation that stands for it, so each of them reaches
 * that line: see `standsFor`.
 */
import type { Id } from '@visual-anything/schema';
import type { Emphasis } from '../editor/emphasis';
import {
  relationLinesOf,
  standsFor,
  type ArrowShape,
  type DrawnEnd,
  type ElementShape,
  type NoteShape,
  type RelationLine,
  type Scene,
} from './scene';

/** What is left out, or drawn faintly, by kind: element shapes by key, lines by key, free shapes by id. */
export interface Hidden {
  shapes: ReadonlySet<string>;
  relations: ReadonlySet<Id>;
  free: ReadonlySet<Id>;
}

export const NOTHING_HIDDEN: Hidden = { shapes: new Set(), relations: new Set(), free: new Set() };

const NONE: ReadonlySet<string> = new Set();

/**
 * What the emphasis does to one scene: which shapes, lines and free shapes it hides and dims, by the
 * keys the scene uses, what it highlights, and where its markers are.
 */
export interface Emphasized {
  hidden: Hidden;
  dimmed: Hidden;
  /** The lines drawn dashed, by key (ADR 0078). */
  dashed: ReadonlySet<Id>;
  highlighted: Lit;
  /** Of what it highlights, what fades in (ADR 0077), and over how many milliseconds: 0 for none. */
  arriving: Lit;
  arrivingFor: number;
  /** Over how many milliseconds the lines that arrive draw from their start (ADR 0084): 0 for none. */
  arrivingDraw: number;
  /**
   * Each marker on the line that draws its relation, a fraction of the way along its route, and
   * where its trail starts, when it leaves one.
   */
  markers: readonly PlacedMarker[];
}

/** What is drawn marked: element shapes, relations' lines and free shapes. */
export interface Lit {
  shapes: readonly ElementShape[];
  lines: readonly RelationLine[];
  notes: readonly NoteShape[];
  arrows: readonly ArrowShape[];
}

/** A marker on a line: `along` its route, and its trail `from` there to it, when it leaves one. */
export interface PlacedMarker {
  line: RelationLine;
  along: number;
  from?: number;
}

const NOTHING_LIT: Lit = { shapes: [], lines: [], notes: [], arrows: [] };

export const NOTHING_EMPHASIZED: Emphasized = {
  hidden: NOTHING_HIDDEN,
  dimmed: NOTHING_HIDDEN,
  dashed: NONE,
  highlighted: NOTHING_LIT,
  arriving: NOTHING_LIT,
  arrivingFor: 0,
  arrivingDraw: 0,
  markers: [],
};

/**
 * What an emphasis does to a scene. Its keys name element shapes by key, relations by id, aggregated
 * relations by their line's key, and free shapes by id; keys the scene does not draw are left out.
 * - A line is hidden when its key is, when every relation it stands for is, or when an end it is
 *   drawn to is hidden: a line is never drawn to nothing.
 * - A line is dimmed when its key is, or every relation it stands for is; highlighted when its key
 *   or any relation it stands for is.
 * - An aggregated relation highlighted for a relation it stands for highlights its ends too: they
 *   show that relation's ends, which a collapsed container hides.
 * - Highlighting wins over dimming, and hiding over both.
 * - A line is dashed when its key is, or every relation it stands for is, unless it is hidden.
 * - A marker on a relation that an aggregated relation stands for travels along that line, the way
 *   the relation runs, and so does its trail.
 * - What arrives is what it highlights that its `arriving` names, a line by any relation it stands for.
 */
export function emphasize(scene: Scene, emphasis: Emphasis): Emphasized {
  const {
    hidden = NONE,
    dimmed = NONE,
    dashed = NONE,
    highlighted = NONE,
    markers = [],
  } = emphasis;
  if (
    hidden.size === 0 &&
    dimmed.size === 0 &&
    dashed.size === 0 &&
    highlighted.size === 0 &&
    markers.length === 0
  ) {
    return NOTHING_EMPHASIZED;
  }
  const byKey = linesByKey(scene.relations);
  const byRelation = relationLinesOf(scene);
  const { shapes } = scene;
  const keysOf = (set: ReadonlySet<string>) => {
    const found = new Set<string>();
    if (set.size === 0) return found;
    for (const shape of shapes) if (set.has(shape.key)) found.add(shape.key);
    return found;
  };
  const freeOf = (set: ReadonlySet<string>) => {
    const found = new Set<Id>();
    if (set.size === 0) return found;
    for (const note of scene.notes) if (set.has(note.id)) found.add(note.id);
    for (const arrow of scene.arrows) if (set.has(arrow.id)) found.add(arrow.id);
    return found;
  };
  const every = (set: ReadonlySet<string>, line: RelationLine) =>
    set.has(line.relation) ||
    (line.aggregate !== undefined && standsFor(line).every((id) => set.has(id)));
  const some = (set: ReadonlySet<string>, line: RelationLine) =>
    set.has(line.relation) ||
    (line.aggregate !== undefined && standsFor(line).some((id) => set.has(id)));

  const hiddenShapes = keysOf(hidden);
  const hiddenLines = new Set<string>();
  if (hidden.size > 0) {
    const hiding = new Map<string, boolean>();
    const isHidden = (line: RelationLine): boolean => {
      const known = hiding.get(line.relation);
      if (known !== undefined) return known;
      hiding.set(line.relation, false);
      const endHidden = (end: DrawnEnd | undefined): boolean => {
        if (!end) return false;
        if (end.kind === 'shape') return hiddenShapes.has(end.key);
        const other = byKey.get(end.relation);
        return other !== undefined && isHidden(other);
      };
      const result = every(hidden, line) || endHidden(line.ends?.from) || endHidden(line.ends?.to);
      hiding.set(line.relation, result);
      return result;
    };
    for (const line of scene.relations) if (isHidden(line)) hiddenLines.add(line.relation);
  }
  const hiddenFree = freeOf(hidden);

  const litLines =
    highlighted.size === 0
      ? []
      : scene.relations.filter(
          (line) => some(highlighted, line) && !hiddenLines.has(line.relation),
        );
  // The ends of an aggregated relation lit for what it stands for show that relation's ends.
  const litEnds = new Set<string>();
  for (const line of litLines) {
    if (!line.aggregate || highlighted.has(line.relation) || !line.ends) continue;
    for (const end of [line.ends.from, line.ends.to])
      if (end.kind === 'shape') litEnds.add(end.key);
  }
  const lit = {
    shapes:
      highlighted.size === 0
        ? []
        : shapes.filter(
            (shape) =>
              (highlighted.has(shape.key) || litEnds.has(shape.key)) &&
              !hiddenShapes.has(shape.key),
          ),
    lines: litLines,
    notes: scene.notes.filter((note) => highlighted.has(note.id) && !hiddenFree.has(note.id)),
    arrows: scene.arrows.filter((arrow) => highlighted.has(arrow.id) && !hiddenFree.has(arrow.id)),
  };
  const litShapes = new Set(lit.shapes.map((shape) => shape.key));
  const litLineKeys = new Set(lit.lines.map((line) => line.relation));
  const litFree = new Set([...lit.notes, ...lit.arrows].map((free) => free.id));

  const dimmedShapes = keysOf(dimmed);
  for (const key of [...dimmedShapes]) {
    if (hiddenShapes.has(key) || litShapes.has(key)) dimmedShapes.delete(key);
  }
  const dimmedLines = new Set<string>();
  if (dimmed.size > 0) {
    for (const line of scene.relations) {
      const key = line.relation;
      if (!hiddenLines.has(key) && !litLineKeys.has(key) && every(dimmed, line))
        dimmedLines.add(key);
    }
  }
  const dimmedFree = freeOf(dimmed);
  for (const id of [...dimmedFree]) {
    if (hiddenFree.has(id) || litFree.has(id)) dimmedFree.delete(id);
  }
  const dashedLines = new Set<string>();
  if (dashed.size > 0) {
    for (const line of scene.relations) {
      if (!hiddenLines.has(line.relation) && every(dashed, line)) dashedLines.add(line.relation);
    }
  }

  const placed: PlacedMarker[] = [];
  const clamped = (value: number) => Math.min(1, Math.max(0, value));
  for (const marker of markers) {
    const line = byRelation.get(marker.relation) ?? byKey.get(marker.relation);
    if (!line || hiddenLines.has(line.relation)) continue;
    const progress = clamped(marker.progress);
    const back = line.aggregate?.reversed?.includes(marker.relation) ?? false;
    const along = back ? 1 - progress : progress;
    if (marker.trail === undefined) placed.push({ line, along });
    else {
      const trail = clamped(marker.trail);
      placed.push({ line, along, from: back ? 1 - trail : trail });
    }
  }

  const arrivingKeys = emphasis.arriving?.keys;
  const arriving =
    arrivingKeys === undefined || arrivingKeys.size === 0
      ? NOTHING_LIT
      : {
          shapes: lit.shapes.filter((shape) => arrivingKeys.has(shape.key)),
          lines: lit.lines.filter((line) => some(arrivingKeys, line)),
          notes: lit.notes.filter((note) => arrivingKeys.has(note.id)),
          arrows: lit.arrows.filter((arrow) => arrivingKeys.has(arrow.id)),
        };

  return {
    hidden: { shapes: hiddenShapes, relations: hiddenLines, free: hiddenFree },
    dimmed: { shapes: dimmedShapes, relations: dimmedLines, free: dimmedFree },
    dashed: dashedLines.size === 0 ? NONE : dashedLines,
    highlighted: lit,
    arriving,
    arrivingFor: arriving === NOTHING_LIT ? 0 : (emphasis.arriving?.duration ?? 0),
    arrivingDraw: arriving.lines.length === 0 ? 0 : (emphasis.arriving?.draw ?? 0),
    markers: placed,
  };
}

const dashedCopies = new WeakMap<RelationLine, RelationLine>();
const dashedLists = new WeakMap<
  readonly RelationLine[],
  { dashed: ReadonlySet<Id>; lines: readonly RelationLine[] }
>();
const dashedSources = new WeakMap<readonly RelationLine[], readonly RelationLine[]>();

/**
 * A scene's lines with those `dashed` names drawn dashed (ADR 0078), each in its place: the same list
 * when it names none, and the same copy of a line each time, so that only the lines whose dashes
 * change draw again.
 */
export function withDashes(
  lines: readonly RelationLine[],
  dashed: ReadonlySet<Id>,
): readonly RelationLine[] {
  if (dashed.size === 0) return lines;
  const kept = dashedLists.get(lines);
  if (kept?.dashed === dashed) return kept.lines;
  const drawn = lines.map((line) => {
    if (!dashed.has(line.relation) || line.dash === 'dashed') return line;
    let copy = dashedCopies.get(line);
    if (!copy) {
      copy = { ...line, dash: 'dashed' };
      dashedCopies.set(line, copy);
    }
    return copy;
  });
  dashedLists.set(lines, { dashed, lines: drawn });
  dashedSources.set(drawn, lines);
  return drawn;
}

/** The scene's lines a list of lines was made from by `withDashes`, or the list itself. */
export function linesDrawnFrom(lines: readonly RelationLine[]): readonly RelationLine[] {
  return dashedSources.get(lines) ?? lines;
}

const lineMaps = new WeakMap<readonly RelationLine[], Map<string, RelationLine>>();

/** A scene's lines by their keys: relation ids, and aggregated relations' keys. */
export function linesByKey(lines: readonly RelationLine[]): Map<string, RelationLine> {
  let byKey = lineMaps.get(lines);
  if (!byKey) {
    byKey = new Map(lines.map((line) => [line.relation, line]));
    lineMaps.set(lines, byKey);
  }
  return byKey;
}
