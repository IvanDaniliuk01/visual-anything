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
 *   by the factor given, and each part moves with what holds it.
 * - **Markers** are drawn at their entries' origins, in their overlay's fill, or their shape's.
 * - **Points**, where names are written: an anchored part's middle, moved as its part is; else the
 *   middle of its solid's bounds; else its origin.
 *
 * Places are kept in the coordinates of the element the panel shows, in double precision; the GPU
 * draws them less the camera's target (`scene.ts`).
 */
import type { Color, Id, SpaceBounds, SpacePoint } from '@visual-anything/schema';
import { Matrix4, Vector3 } from 'three';
import { DIMMED_ALPHA } from '../../../canvas/colors';
import { boundsPlaced } from '../../../space/camera';
import type { SpaceDrawnEntry, SpaceElementState } from '../../protocol';
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
  /** Its entry's matrix. */
  readonly matrix: Matrix4;
  /** Its own look, which its box takes while it is drawn as one; none when it is hidden. */
  readonly look: SpaceLook | undefined;
  /** The pieces drawn: none of those hidden. */
  readonly pieces: readonly LaidPiece[];
  /** Each named part's look, by index; none for a part hidden. */
  readonly parts: readonly (SpaceLook | undefined)[];
  /** Drawn as its box while the camera moves past the triangles' mark. */
  readonly boxed: boolean;
  /** Its bounds, along the panel's axes. */
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

  const laidSolids: LaidSolid[] = [];
  const markers: LaidMarker[] = [];
  const drawn = new Map<Id, DrawnEntry>();
  const lookFor = (entry: SpaceDrawnEntry) => lookOf(entry, states.get(entry.element));

  for (const entry of space.entries) {
    const look = lookFor(entry);
    const solid = solidOf(entry);
    if (solid) laidSolids.push(laySolid(entry, solid, look, partsOf.get(entry.element), space));
    if (entry.marker && look) {
      const color = look.fill ?? entry.fill;
      markers.push({
        entry,
        at: originOf(entry.matrix),
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
  return { solids: laidSolids, markers, drawn };

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
      return toPoint(middleOf(bounds).applyMatrix4(new Matrix4().fromArray(entry.matrix)));
    }
    if (entry.part) {
      const holder = byElement.get(entry.part.of);
      const held = solidOf(holder);
      if (holder && held && entry.part.index < held.description.parts.length) {
        const middle = middleOf(held.partBounds(entry.part.index));
        const moved = explosionOf(held, space.explode)[entry.part.index];
        if (moved) middle.add(moved);
        return toPoint(middle.applyMatrix4(new Matrix4().fromArray(holder.matrix)));
      }
    }
    return originOf(entry.matrix);
  }
}

function laySolid(
  entry: SpaceDrawnEntry,
  solid: BuiltSolid,
  look: SpaceLook | undefined,
  anchored: ReadonlyMap<number, SpaceDrawnEntry> | undefined,
  space: Pick<SpaceToDraw, 'states' | 'explode' | 'boxed'>,
): LaidSolid {
  const matrix = new Matrix4().fromArray(entry.matrix);
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
    bounds: boundsPlaced(entry.matrix, own),
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
