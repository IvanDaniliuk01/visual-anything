/**
 * How a solid's pieces are drawn together in a space (ADR 0076), so that its draws scale with its
 * materials and not its pieces: the pieces that share a material, a side and the same attributes are
 * merged into one geometry, each vertex in the solid's coordinates at rest and naming its part's
 * column (`lookPart`, the part plus one), which its look and its exploded offset are read by
 * (`looks.ts`). A piece too large to copy cheaply, or alone, is drawn from its own geometry, which
 * the canvas's pictures share.
 *
 * The merged geometry is a second copy on the GPU of the pieces it merges, kept once for each solid
 * whatever the spaces drawing it, and let go of with the solid.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Matrix3,
  Vector3,
  type Matrix4,
  type InterleavedBufferAttribute,
  type Material,
  type Side,
} from 'three';
import type { BuiltSolid } from '../build';
import { piecesAtRest } from './layout';

/** The most vertices a piece has to be merged with others. */
export const MERGE_MOST_VERTICES = 65_536;

/** Pieces of a solid drawn together, from one geometry. */
export interface DrawGroup {
  /** The pieces it draws, by their index among the solid's pieces. */
  readonly pieces: readonly number[];
  readonly geometry: BufferGeometry;
  /** Whether its geometry is its pieces merged, at rest, each vertex naming its part's column. */
  readonly merged: boolean;
  readonly studio: Material;
  readonly side: Side;
}

const groups = new WeakMap<BuiltSolid, readonly DrawGroup[]>();

/** The groups a solid's pieces are drawn in, worked out once for each solid. */
export function drawGroupsOf(solid: BuiltSolid): readonly DrawGroup[] {
  const known = groups.get(solid);
  if (known) return known;
  const alike = new Map<string, number[]>();
  const found: DrawGroup[] = [];
  const alone = (index: number) => {
    const piece = solid.pieces[index];
    if (!piece) return;
    found.push({
      pieces: [index],
      geometry: piece.mesh.geometry,
      merged: false,
      studio: piece.studio,
      side: piece.side,
    });
  };
  solid.pieces.forEach((piece, index) => {
    const geometry = piece.mesh.geometry;
    const vertices = geometry.getAttribute('position')?.count ?? 0;
    if (vertices === 0 || vertices > MERGE_MOST_VERTICES) return alone(index);
    const key = `${piece.studio.uuid}|${piece.side}|${signatureOf(geometry)}`;
    const list = alike.get(key);
    if (list) list.push(index);
    else alike.set(key, [index]);
  });
  const rest = alike.size > 0 ? piecesAtRest(solid) : [];
  for (const list of alike.values()) {
    if (list.length === 1) {
      alone(list[0] as number);
      continue;
    }
    const first = solid.pieces[list[0] as number];
    if (!first) continue;
    found.push({
      pieces: list,
      geometry: merge(solid, list, rest),
      merged: true,
      studio: first.studio,
      side: first.side,
    });
  }
  // In the order of their first pieces, as the solid's pieces are drawn.
  found.sort((a, b) => (a.pieces[0] ?? 0) - (b.pieces[0] ?? 0));
  groups.set(solid, found);
  return found;
}

const alone = new WeakMap<BuiltSolid, readonly DrawGroup[]>();

/**
 * The groups a jointed solid's pieces are drawn in (ADR 0090): each piece alone, from its own
 * geometry, so that joints turn each part on its own; worked out once for each solid.
 */
export function pieceGroupsOf(solid: BuiltSolid): readonly DrawGroup[] {
  const known = alone.get(solid);
  if (known) return known;
  const found = solid.pieces.map((piece, index): DrawGroup => ({
    pieces: [index],
    geometry: piece.mesh.geometry,
    merged: false,
    studio: piece.studio,
    side: piece.side,
  }));
  alone.set(solid, found);
  return found;
}

/** Lets go of the geometry merged for a solid, never its own. */
export function forgetMerged(solid: BuiltSolid): void {
  for (const group of groups.get(solid) ?? []) if (group.merged) group.geometry.dispose();
  groups.delete(solid);
}

/** A geometry's attributes, by name and size, which pieces merged together share. */
function signatureOf(geometry: BufferGeometry): string {
  return Object.keys(geometry.attributes)
    .sort()
    .map((name) => `${name}${geometry.getAttribute(name)?.itemSize ?? 0}`)
    .join(',');
}

type Attribute = BufferAttribute | InterleavedBufferAttribute;

function merge(
  solid: BuiltSolid,
  indexes: readonly number[],
  rest: readonly Matrix4[],
): BufferGeometry {
  const first = solid.pieces[indexes[0] as number]?.mesh.geometry as BufferGeometry;
  const names = Object.keys(first.attributes).sort();
  const sizes = names.map((name) => first.getAttribute(name)?.itemSize ?? 1);
  let vertices = 0;
  let corners = 0;
  for (const index of indexes) {
    const geometry = solid.pieces[index]?.mesh.geometry as BufferGeometry;
    const count = geometry.getAttribute('position').count;
    vertices += count;
    corners += geometry.index ? geometry.index.count : count;
  }
  const arrays = sizes.map((size) => new Float32Array(vertices * size));
  const parts = new Float32Array(vertices);
  const corner = vertices > 65_535 ? new Uint32Array(corners) : new Uint16Array(corners);
  const vector = new Vector3();
  const normals = new Matrix3();
  let base = 0;
  let written = 0;
  for (const index of indexes) {
    const piece = solid.pieces[index];
    if (!piece) continue;
    const geometry = piece.mesh.geometry;
    const count = geometry.getAttribute('position').count;
    const matrix = rest[index];
    if (!matrix) continue;
    normals.getNormalMatrix(matrix);
    names.forEach((name, at) => {
      const attribute: Attribute = geometry.getAttribute(name);
      const size = sizes[at] as number;
      const out = arrays[at] as Float32Array;
      // Components are read in their real units, normalized ones too.
      for (let vertex = 0; vertex < count; vertex++) {
        const to = (base + vertex) * size;
        if (name === 'position' || name === 'normal' || name === 'tangent') {
          vector.set(
            attribute.getComponent(vertex, 0),
            attribute.getComponent(vertex, 1),
            attribute.getComponent(vertex, 2),
          );
          if (name === 'position') vector.applyMatrix4(matrix);
          else if (name === 'normal') vector.applyMatrix3(normals).normalize();
          else vector.transformDirection(matrix);
          out[to] = vector.x;
          out[to + 1] = vector.y;
          out[to + 2] = vector.z;
          if (size === 4) out[to + 3] = attribute.getComponent(vertex, 3);
        } else {
          for (let k = 0; k < size; k++) out[to + k] = attribute.getComponent(vertex, k);
        }
      }
    });
    parts.fill(piece.part + 1, base, base + count);
    // A piece turned inside out at rest keeps its faces facing out.
    const flip = matrix.determinant() < 0;
    const own = geometry.index;
    const triangles = Math.floor((own ? own.count : count) / 3);
    for (let triangle = 0; triangle < triangles; triangle++) {
      const a = own ? own.getX(triangle * 3) : triangle * 3;
      const b = own ? own.getX(triangle * 3 + 1) : triangle * 3 + 1;
      const c = own ? own.getX(triangle * 3 + 2) : triangle * 3 + 2;
      corner[written++] = base + a;
      corner[written++] = base + (flip ? c : b);
      corner[written++] = base + (flip ? b : c);
    }
    base += count;
  }
  const merged = new BufferGeometry();
  names.forEach((name, at) => {
    merged.setAttribute(name, new BufferAttribute(arrays[at] as Float32Array, sizes[at] as number));
  });
  merged.setAttribute('lookPart', new BufferAttribute(parts, 1));
  merged.setIndex(new BufferAttribute(corner.subarray(0, written), 1));
  return merged;
}
