/**
 * What a space draws, worked out without the GPU (ADR 0076), so that drawing and picking agree and
 * tests can check it in Node: for each entry, where each piece of its solid is, the look it is drawn
 * with, and what pointing at it answers.
 *
 * - **Solids** are drawn at their entries' matrices. Each piece of a solid takes its look from the
 *   nearest element standing for it: the anchored part holding its node, at any depth, or else the
 *   solid's own element, so that the nodes of a drawn solid that no element stands for are drawn in
 *   its element's state. Marks (selection, hover and highlight) are inherited by every piece inside a
 *   marked part, as on the canvas; hiding, faintness, a fill and an opacity come from the nearest.
 * - **A collapsed container** is drawn as one: what is drawn as it (`as`) answers a pick as it.
 * - **The exploded view** moves each named part away from the middle of the part or solid holding it,
 *   by the factor given, and each part moves with what holds it. What is posed in an entry moves as
 *   that entry does, at any depth ({@link explosionShifts}), and is drawn, named and picked there.
 *   Relation lines move their ends with what they end on ({@link explodedLines}), so that their
 *   travelling markers follow; framing frames what the exploded view draws ({@link explodedBoundsOf}).
 * - **Markers** are drawn at their entries' origins, in their overlay's fill, or their shape's.
 * - **Points**, where names are written: an anchored part's middle, moved as its part is; else the
 *   middle of its solid's bounds; else its origin.
 *
 * Places are kept in the coordinates of the element the panel shows, in double precision; the GPU
 * draws them less the camera's target (`scene.ts`).
 */
import type { Color, Id, SpaceBounds, SpacePoint } from '@visual-anything/schema';
import { Matrix3, Matrix4, Vector3 } from 'three';
import { DIMMED_ALPHA } from '../../../canvas/colors';
import { boundsPlaced } from '../../../space/camera';
import type { SpaceDrawnEntry, SpaceElementState, SpaceLine } from '../../protocol';
import type { BuiltSolid, SolidPiece } from '../build';
import type { SpaceToDraw } from '../host';

/** The bits of an element's marks, as the marks pass reads them. */
export const SPACE_MARK = { selected: 1, hovered: 2, highlighted: 4 } as const;

/**
 * A marker's pin, in pixels of the page, whatever the camera's distance: how tall it stands over its
 * point, and how wide its head is.
 */
export const MARKER_PIN = { height: 22, head: 12 } as const;

/** How an element, or a piece of its solid, is drawn. */
export interface SpaceLook {
  /** What pointing at it answers: its element, or the collapsed container it is drawn as. */
  answers: Id;
  faint: boolean;
  /** How much of it is drawn, from 0 to 1: a faint share, times an overlay's opacity. */
  alpha: number;
  /** An overlay's fill, which its color gives way to. */
  fill?: Color;
  /** Its marks' bits ({@link SPACE_MARK}). */
  marks: number;
}

/** One piece of a solid, where it is drawn and how. */
export interface LaidPiece {
  readonly piece: SolidPiece;
  /** Its index among its solid's pieces. */
  readonly index: number;
  /** Its place in the coordinates of the element the panel shows. */
  readonly matrix: Matrix4;
  readonly look: SpaceLook;
}

/** A solid drawn for an entry. */
export interface LaidSolid {
  readonly entry: SpaceDrawnEntry;
  readonly solid: BuiltSolid;
  /** Its entry's matrix, as the exploded view moves it. */
  readonly matrix: Matrix4;
  /** Its own look, which its box takes while it is drawn as one; none when it is hidden. */
  readonly look: SpaceLook | undefined;
  /** The pieces drawn: none of those hidden. */
  readonly pieces: readonly LaidPiece[];
  /** Each named part's look, by index; none for a part hidden. */
  readonly parts: readonly (SpaceLook | undefined)[];
  /** Drawn as its box while the camera moves past the triangles' mark. */
  readonly boxed: boolean;
  /** Its bounds, along the panel's axes, where the exploded view moves it. */
  readonly bounds: SpaceBounds;
  /** Its bounds in its own coordinates. */
  readonly own: SpaceBounds;
}

/** A marker: a pin of a fixed size on the screen at an entry's origin. */
export interface LaidMarker {
  readonly entry: SpaceDrawnEntry;
  readonly at: SpacePoint;
  readonly look: SpaceLook;
  /** Its overlay's fill, or its shape's; the theme's when neither. */
  readonly color?: Color;
}

/** An entry drawn: its look and the point its name is written at. */
export interface DrawnEntry {
  readonly entry: SpaceDrawnEntry;
  readonly look: SpaceLook;
  readonly point: SpacePoint;
  /** Its own marks, not those it inherits from what holds it: what its name is written for. */
  readonly marks: number;
}

/** What a space draws, apart from its camera. */
export interface SpaceLayout {
  readonly solids: readonly LaidSolid[];
  readonly markers: readonly LaidMarker[];
  /** Each entry not hidden, by element, in the entries' order. */
  readonly drawn: ReadonlyMap<Id, DrawnEntry>;
  /** How far the exploded view moves each entry it moves ({@link explosionShifts}). */
  readonly shifts: ReadonlyMap<Id, Vector3>;
}

/** What {@link layOut} reads of a space. */
export type LaidOutSpace = Pick<SpaceToDraw, 'entries' | 'states' | 'solids' | 'explode' | 'boxed'>;

/** An element's look from its state, with marks inherited from what holds it; none when hidden. */
export function lookOf(
  entry: Pick<SpaceDrawnEntry, 'element' | 'as'>,
  state: SpaceElementState | undefined,
  inherited = 0,
): SpaceLook | undefined {
  if (state?.hidden) return undefined;
  const faint = state?.faint === true;
  const look: SpaceLook = {
    answers: entry.as ?? entry.element,
    faint,
    alpha: clamp01((faint ? DIMMED_ALPHA : 1) * (state?.opacity ?? 1)),
    marks: inherited | marksOf(state),
  };
  if (state?.fill !== undefined) look.fill = state.fill;
  return look;
}

/** The bits of a state's marks. */
export function marksOf(state: SpaceElementState | undefined): number {
  if (!state) return 0;
  return (
    (state.selected ? SPACE_MARK.selected : 0) |
    (state.hovered ? SPACE_MARK.hovered : 0) |
    (state.highlighted ? SPACE_MARK.highlighted : 0)
  );
}

/** A look as a key: pieces of one solid with the same key are drawn together. */
export function lookKey(look: SpaceLook): string {
  return `${look.faint ? 'f' : 'p'}:${look.alpha.toFixed(4)}:${look.fill ?? ''}:${look.marks}`;
}

// The exploded view ------------------------------------------------------------------------------

const explosions = new WeakMap<BuiltSolid, Map<number, Vector3[]>>();

/** The middle of bounds. */
export function middleOf(bounds: SpaceBounds): Vector3 {
  return new Vector3(
    (bounds.min.x + bounds.max.x) / 2,
    (bounds.min.y + bounds.max.y) / 2,
    (bounds.min.z + bounds.max.z) / 2,
  );
}

/** A part's holder among the parts, which comes before it in depth-first order. */
function holderOf(solid: BuiltSolid, part: number): number | undefined {
  const parent = solid.description.parts[part]?.parent;
  return parent !== undefined && parent < part ? parent : undefined;
}

/**
 * How far each named part of a solid moves in its exploded view, in the solid's coordinates: away
 * from the middle of the part holding it, or of the solid for a part held by none, by `factor` times
 * the distance between their middles, plus what its holder moves.
 */
export function explosionOf(solid: BuiltSolid, factor: number): readonly Vector3[] {
  const parts = solid.description.parts;
  if (!(factor > 0)) return parts.map(() => new Vector3());
  let known = explosions.get(solid);
  if (!known) {
    known = new Map();
    explosions.set(solid, known);
  }
  const cached = known.get(factor);
  if (cached) return cached;
  const offsets: Vector3[] = [];
  parts.forEach((_, at) => {
    const holder = holderOf(solid, at);
    const from = middleOf(
      holder === undefined ? solid.description.bounds : solid.partBounds(holder),
    );
    const own = middleOf(solid.partBounds(at)).sub(from).multiplyScalar(factor);
    if (holder !== undefined) own.add(offsets[holder] as Vector3);
    offsets.push(own);
  });
  known.set(factor, offsets);
  return offsets;
}

/**
 * How far the exploded view moves each entry, in the coordinates of the element the panel shows: an
 * anchored part as its holder moves plus its part's offset, turned by its holder's matrix; a posed
 * entry as what it is posed in moves, at any depth. Only the entries that move are named; at a factor
 * of 0, none.
 */
export function explosionShifts(
  entries: readonly SpaceDrawnEntry[],
  solids: ReadonlyMap<string, BuiltSolid>,
  factor: number,
): ReadonlyMap<Id, Vector3> {
  const shifts = new Map<Id, Vector3>();
  if (!(factor > 0)) return shifts;
  const byElement = new Map(entries.map((entry) => [entry.element, entry]));
  const known = new Map<Id, Vector3 | undefined>();
  const visiting = new Set<Id>();
  const shiftOf = (entry: SpaceDrawnEntry): Vector3 | undefined => {
    if (known.has(entry.element)) return known.get(entry.element);
    // What is posed in a loop moves with nothing: the model never makes one.
    if (visiting.has(entry.element)) return undefined;
    visiting.add(entry.element);
    let shift: Vector3 | undefined;
    if (entry.part) {
      const holder = byElement.get(entry.part.of);
      const held = holder?.solid === undefined ? undefined : solids.get(holder.solid);
      const offset = held ? explosionOf(held, factor)[entry.part.index] : undefined;
      const outer = holder ? shiftOf(holder) : undefined;
      if (holder && offset && offset.lengthSq() > 0) {
        shift = offset
          .clone()
          .applyMatrix3(new Matrix3().setFromMatrix4(new Matrix4().fromArray(holder.matrix)));
        if (outer) shift.add(outer);
      } else shift = outer;
    } else if (entry.in !== undefined) {
      const holder = byElement.get(entry.in);
      shift = holder ? shiftOf(holder) : undefined;
    }
    visiting.delete(entry.element);
    known.set(entry.element, shift);
    return shift;
  };
  for (const entry of entries) {
    const shift = shiftOf(entry);
    if (shift && shift.lengthSq() > 0) shifts.set(entry.element, shift);
  }
  return shifts;
}

/**
 * Relation lines with their ends moved as the exploded view moves what they end on (`SpaceLine.ends`):
 * an end on an entry by that entry's shift, an end at the middle of another line by the mean of that
 * line's two ends' moves. A line whose ends move nothing is given back as it is, and so is the list
 * when no line moves.
 */
export function explodedLines(
  lines: readonly SpaceLine[],
  shifts: ReadonlyMap<Id, Vector3>,
): readonly SpaceLine[] {
  if (shifts.size === 0 || !lines.some((line) => line.ends)) return lines;
  const byRelation = new Map(lines.map((line) => [line.relation, line]));
  const known = new Map<Id, { from?: Vector3; to?: Vector3 }>();
  const visiting = new Set<Id>();
  /** How far an end on `end` moves: an entry's shift, or the middle of a line drawn. */
  const endShift = (end: Id): Vector3 | undefined => {
    const shift = shifts.get(end);
    if (shift) return shift;
    const line = byRelation.get(end);
    if (!line) return undefined;
    const moves = movesOf(line);
    if (!moves.from && !moves.to) return undefined;
    return new Vector3()
      .add(moves.from ?? new Vector3())
      .add(moves.to ?? new Vector3())
      .multiplyScalar(0.5);
  };
  const movesOf = (line: SpaceLine): { from?: Vector3; to?: Vector3 } => {
    const kept = known.get(line.relation);
    if (kept) return kept;
    // A line that ends on itself, through other lines, moves with nothing there.
    if (!line.ends || visiting.has(line.relation)) return {};
    visiting.add(line.relation);
    const from = endShift(line.ends.from);
    const to = endShift(line.ends.to);
    visiting.delete(line.relation);
    const moves = { ...(from ? { from } : {}), ...(to ? { to } : {}) };
    known.set(line.relation, moves);
    return moves;
  };
  let changed = false;
  const moved = lines.map((line) => {
    const { from, to } = movesOf(line);
    if (!from && !to) return line;
    changed = true;
    return {
      ...line,
      from: from ? movedPoint(line.from, from) : line.from,
      to: to ? movedPoint(line.to, to) : line.to,
    };
  });
  return changed ? moved : lines;
}

function movedPoint(point: SpacePoint, by: Vector3): SpacePoint {
  return { x: point.x + by.x, y: point.y + by.y, z: point.z + by.z };
}

const explodedBounds = new WeakMap<BuiltSolid, Map<string, SpaceBounds>>();

/**
 * Bounds in a solid's own coordinates with its named parts where the exploded view moves them: of
 * the whole solid, its bounds at rest with each part's bounds moved by its offset; of one part, the
 * bounds of it and of each part it holds, each moved by its own offset. At a factor of 0, the bounds
 * at rest. A part's bounds at rest hold the parts it holds where they rest, so these may be a little
 * larger than what is drawn, never smaller.
 */
export function explodedBoundsOf(solid: BuiltSolid, factor: number, part?: number): SpaceBounds {
  const parts = solid.description.parts;
  const whole = part === undefined;
  if (!whole && (part < 0 || part >= parts.length)) return solid.description.bounds;
  if (!(factor > 0) || parts.length === 0) {
    return whole ? solid.description.bounds : solid.partBounds(part);
  }
  let known = explodedBounds.get(solid);
  if (!known) {
    known = new Map();
    explodedBounds.set(solid, known);
  }
  const key = `${factor}:${part ?? 'all'}`;
  const cached = known.get(key);
  if (cached) return cached;
  const offsets = explosionOf(solid, factor);
  const start = whole ? solid.description.bounds : undefined;
  const min = {
    x: start?.min.x ?? Infinity,
    y: start?.min.y ?? Infinity,
    z: start?.min.z ?? Infinity,
  };
  const max = {
    x: start?.max.x ?? -Infinity,
    y: start?.max.y ?? -Infinity,
    z: start?.max.z ?? -Infinity,
  };
  // In depth-first order, what a part holds comes right after it.
  const first = part ?? 0;
  for (let at = first; at < parts.length; at++) {
    if (!whole && !solid.holds(first, at)) break;
    const bounds = solid.partBounds(at);
    const offset = offsets[at] as Vector3;
    min.x = Math.min(min.x, bounds.min.x + offset.x);
    min.y = Math.min(min.y, bounds.min.y + offset.y);
    min.z = Math.min(min.z, bounds.min.z + offset.z);
    max.x = Math.max(max.x, bounds.max.x + offset.x);
    max.y = Math.max(max.y, bounds.max.y + offset.y);
    max.z = Math.max(max.z, bounds.max.z + offset.z);
  }
  const found = { min, max };
  known.set(key, found);
  return found;
}

// Pieces at rest ----------------------------------------------------------------------------------

const rests = new WeakMap<BuiltSolid, Matrix4[]>();

/** Each piece's place in its solid's coordinates, at rest. */
export function piecesAtRest(solid: BuiltSolid): readonly Matrix4[] {
  const known = rests.get(solid);
  if (known) return known;
  if (solid.posed) solid.toRest();
  solid.root.updateMatrixWorld(true);
  const inverse = solid.root.matrixWorld.clone().invert();
  const found = solid.pieces.map((piece) => inverse.clone().multiply(piece.mesh.matrixWorld));
  rests.set(solid, found);
  return found;
}

const triangles = new WeakMap<BuiltSolid, number>();

/** How many triangles a solid draws, all its pieces together. */
export function trianglesOf(solid: BuiltSolid): number {
  const known = triangles.get(solid);
  if (known !== undefined) return known;
  let count = 0;
  for (const { mesh } of solid.pieces) {
    const geometry = mesh.geometry;
    const indices = geometry.index?.count ?? geometry.getAttribute('position')?.count ?? 0;
    count += Math.floor(indices / 3);
  }
  triangles.set(solid, count);
  return count;
}

// The layout --------------------------------------------------------------------------------------

/** What a space draws apart from its camera, from what the worker holds of it. */
export function layOut(space: LaidOutSpace): SpaceLayout {
  const { states, solids } = space;
  const byElement = new Map(space.entries.map((entry) => [entry.element, entry]));
  // The anchored parts of each element's solid, by part index.
  const partsOf = new Map<Id, Map<number, SpaceDrawnEntry>>();
  for (const entry of space.entries) {
    if (!entry.part) continue;
    let parts = partsOf.get(entry.part.of);
    if (!parts) {
      parts = new Map();
      partsOf.set(entry.part.of, parts);
    }
    if (!parts.has(entry.part.index)) parts.set(entry.part.index, entry);
  }
  const solidOf = (entry: SpaceDrawnEntry | undefined) =>
    entry?.solid === undefined ? undefined : solids.get(entry.solid);
  // Each entry's matrix as the exploded view moves it.
  const shifts = explosionShifts(space.entries, solids, space.explode);
  const placedOf = (entry: SpaceDrawnEntry): Matrix4 => {
    const placed = new Matrix4().fromArray(entry.matrix);
    const shift = shifts.get(entry.element);
    if (shift) {
      // An entry's matrix is affine, so moving it adds to its translation.
      placed.elements[12] = (placed.elements[12] ?? 0) + shift.x;
      placed.elements[13] = (placed.elements[13] ?? 0) + shift.y;
      placed.elements[14] = (placed.elements[14] ?? 0) + shift.z;
    }
    return placed;
  };

  const laidSolids: LaidSolid[] = [];
  const markers: LaidMarker[] = [];
  const drawn = new Map<Id, DrawnEntry>();
  const lookFor = (entry: SpaceDrawnEntry) => lookOf(entry, states.get(entry.element));

  for (const entry of space.entries) {
    const look = lookFor(entry);
    const solid = solidOf(entry);
    if (solid) {
      laidSolids.push(
        laySolid(entry, placedOf(entry), solid, look, partsOf.get(entry.element), space),
      );
    }
    if (entry.marker && look) {
      const color = look.fill ?? entry.fill;
      markers.push({
        entry,
        at: originOf(placedOf(entry).elements),
        look,
        ...(color === undefined ? {} : { color }),
      });
    }
  }
  // An anchored part is drawn when its own piece is: inside a holder drawn, and not hidden.
  for (const entry of space.entries) {
    const look = entry.part ? partLook(entry) : lookFor(entry);
    if (look) {
      const marks = marksOf(states.get(entry.element));
      drawn.set(entry.element, { entry, look, point: pointOf(entry), marks });
    }
  }
  return { solids: laidSolids, markers, drawn, shifts };

  function partLook(entry: SpaceDrawnEntry): SpaceLook | undefined {
    const holder = entry.part && byElement.get(entry.part.of);
    const laid = holder && laidSolids.find((each) => each.entry === holder);
    if (!laid || !entry.part || entry.part.index >= laid.parts.length) return lookFor(entry);
    return laid.parts[entry.part.index];
  }

  /** Where an entry's name is written. */
  function pointOf(entry: SpaceDrawnEntry): SpacePoint {
    const solid = solidOf(entry);
    if (solid) {
      const bounds = entry.bounds ?? solid.description.bounds;
      return toPoint(middleOf(bounds).applyMatrix4(placedOf(entry)));
    }
    if (entry.part) {
      const holder = byElement.get(entry.part.of);
      const held = solidOf(holder);
      if (holder && held && entry.part.index < held.description.parts.length) {
        const middle = middleOf(held.partBounds(entry.part.index));
        const moved = explosionOf(held, space.explode)[entry.part.index];
        if (moved) middle.add(moved);
        return toPoint(middle.applyMatrix4(placedOf(holder)));
      }
    }
    return originOf(placedOf(entry).elements);
  }
}

function laySolid(
  entry: SpaceDrawnEntry,
  matrix: Matrix4,
  solid: BuiltSolid,
  look: SpaceLook | undefined,
  anchored: ReadonlyMap<number, SpaceDrawnEntry> | undefined,
  space: Pick<SpaceToDraw, 'states' | 'explode' | 'boxed'>,
): LaidSolid {
  const own = entry.bounds ?? solid.description.bounds;
  const offsets = explosionOf(solid, space.explode);
  const rest = piecesAtRest(solid);
  // Each part's look: its anchored element's, or its holder's; marks inherited from every holder.
  const partLooks: (SpaceLook | undefined)[] = [];
  const holderMarks: number[] = [];
  solid.description.parts.forEach((_, at) => {
    const holder = holderOf(solid, at);
    const outer = holder === undefined ? look : partLooks[holder];
    const inherited = holder === undefined ? (look?.marks ?? 0) : (holderMarks[holder] ?? 0);
    const standing = anchored?.get(at);
    const found = standing
      ? lookOf(standing, space.states.get(standing.element), inherited)
      : outer && { ...outer, marks: outer.marks | inherited };
    partLooks.push(found);
    holderMarks.push(found ? found.marks : inherited);
  });
  const pieces: LaidPiece[] = [];
  solid.pieces.forEach((piece, index) => {
    const pieceLook = piece.part >= 0 ? partLooks[piece.part] : look;
    if (!pieceLook) return;
    const placed = matrix.clone();
    const moved = piece.part >= 0 ? offsets[piece.part] : undefined;
    if (moved && moved.lengthSq() > 0) {
      placed.multiply(new Matrix4().makeTranslation(moved.x, moved.y, moved.z));
    }
    placed.multiply(rest[index] as Matrix4);
    pieces.push({ piece, index, matrix: placed, look: pieceLook });
  });
  return {
    entry,
    solid,
    matrix,
    look,
    pieces,
    parts: partLooks,
    boxed: space.boxed.has(entry.element),
    bounds: boundsPlaced(matrix.elements, own),
    own,
  };
}

/** The origin of a matrix written column by column. */
export function originOf(matrix: readonly number[]): SpacePoint {
  return { x: matrix[12] ?? 0, y: matrix[13] ?? 0, z: matrix[14] ?? 0 };
}

function toPoint(vector: Vector3): SpacePoint {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}
