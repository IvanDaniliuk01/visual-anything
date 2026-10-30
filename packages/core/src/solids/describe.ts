/**
 * A solid's description, worked out from its canonical file's geometry (ADR 0075): its bounds, its
 * counts, its named parts in depth-first order with their parents and points, and its animations'
 * durations. A package keeps it beside the solid's hash, so that the canvas, layout, the outline,
 * comparisons and Claude know a solid's parts without its bytes.
 */
import type {
  SolidAnimation,
  SolidCounts,
  SolidPart,
  SpaceBounds,
  SpacePoint,
} from '@visual-anything/schema';
import { notCanonical, overCap, readElement, type SolidAccessor, type SolidDocument } from './glb';
import { SOLID_CAPS } from './caps';

/** What the core reads from a solid's file. */
export interface SolidDescription {
  bounds: SpaceBounds;
  counts: SolidCounts;
  parts: SolidPart[];
  animations: SolidAnimation[];
}

/** A column-major 4×4 matrix, as glTF writes them. */
type Matrix = Float64Array;

/** Rounds a length in meters to a tenth of a millimetre, as a package keeps them. */
export function roundLength(value: number): number {
  const rounded = Math.round(value * 10_000) / 10_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function roundPoint(point: readonly [number, number, number]): SpacePoint {
  return { x: roundLength(point[0]), y: roundLength(point[1]), z: roundLength(point[2]) };
}

/** Works out a canonical file's description. Throws a refusal when its data breaks the form. */
export function describeSolid(document: SolidDocument): SolidDescription {
  const world = worldMatrices(document);
  // Each node's part: its own index among the parts when named, else the part of its nearest named
  // holder, or -1 when none holds it.
  const parts: SolidPart[] = [];
  const partOf = new Int32Array(document.nodes.length).fill(-1);
  const visit = (node: number, holder: number): void => {
    const data = document.nodes[node];
    if (data === undefined) return;
    let part = holder;
    if (data.name !== undefined) {
      part = parts.length;
      parts.push({ name: data.name, ...(holder >= 0 ? { parent: holder } : {}) });
    }
    partOf[node] = part;
    for (const child of data.children) visit(child, part);
  };
  for (const root of document.roots) visit(root, -1);

  // Every vertex in world space, by the part its node belongs to.
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const partMin = parts.map(() => [Infinity, Infinity, Infinity]);
  const partMax = parts.map(() => [-Infinity, -Infinity, -Infinity]);
  const vertexBuffer: number[] = [];
  const transformed: [number, number, number] = [0, 0, 0];
  const eachVertex = (
    visitVertex: (node: number, point: readonly [number, number, number]) => void,
  ) => {
    document.nodes.forEach((node, nodeIndex) => {
      if (node.mesh === undefined) return;
      const matrix = world[nodeIndex] as Matrix;
      const mesh = document.meshes[node.mesh];
      for (const primitive of mesh?.primitives ?? []) {
        const accessor = document.accessors[primitive.position] as SolidAccessor;
        for (let at = 0; at < accessor.count; at += 1) {
          readElement(document, accessor, at, vertexBuffer);
          transform(matrix, vertexBuffer, transformed);
          visitVertex(nodeIndex, transformed);
        }
      }
    });
  };

  // Positions' own bounds must be those their accessors say, and indices must name a vertex.
  for (const mesh of document.meshes) {
    for (const primitive of mesh.primitives) {
      const accessor = document.accessors[primitive.position] as SolidAccessor;
      checkPositionBounds(document, accessor);
      const indices = document.accessors[primitive.indices] as SolidAccessor;
      for (let at = 0; at < indices.count; at += 1) {
        const value = readElement(document, indices, at, vertexBuffer)[0] as number;
        if (value >= accessor.count) notCanonical('A triangle names a vertex its primitive lacks.');
      }
    }
  }

  eachVertex((node, point) => {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = point[axis] as number;
      if (value < (min[axis] as number)) min[axis] = value;
      if (value > (max[axis] as number)) max[axis] = value;
      const part = partOf[node] as number;
      if (part >= 0) {
        const low = partMin[part] as number[];
        const high = partMax[part] as number[];
        if (value < (low[axis] as number)) low[axis] = value;
        if (value > (high[axis] as number)) high[axis] = value;
      }
    }
  });
  const drawsNothing = !Number.isFinite(min[0]);
  if (!drawsNothing) {
    for (let axis = 0; axis < 3; axis += 1) {
      const span = (max[axis] as number) - (min[axis] as number);
      if (span > SOLID_CAPS.largestSide) overCap('Its bounds pass 100 km a side.');
    }
    const across = Math.hypot(
      (max[0] as number) - (min[0] as number),
      (max[1] as number) - (min[1] as number),
      (max[2] as number) - (min[2] as number),
    );
    if (across < SOLID_CAPS.smallestSpan) notCanonical('It is less than a micrometre across.');
  }

  // Each part's point: the vertex of its own geometry nearest the middle of its own bounds.
  const middles = parts.map((_, part) => {
    const low = partMin[part] as number[];
    const high = partMax[part] as number[];
    return Number.isFinite(low[0])
      ? [0, 1, 2].map((axis) => ((low[axis] as number) + (high[axis] as number)) / 2)
      : undefined;
  });
  const best = parts.map(() => ({
    distance: Infinity,
    point: [0, 0, 0] as [number, number, number],
  }));
  eachVertex((node, point) => {
    const part = partOf[node] as number;
    if (part < 0) return;
    const middle = middles[part];
    if (middle === undefined) return;
    const distance =
      (point[0] - (middle[0] as number)) ** 2 +
      (point[1] - (middle[1] as number)) ** 2 +
      (point[2] - (middle[2] as number)) ** 2;
    const known = best[part] as { distance: number; point: [number, number, number] };
    if (distance < known.distance) {
      known.distance = distance;
      known.point = [point[0], point[1], point[2]];
    }
  });
  parts.forEach((part, at) => {
    const known = best[at] as { distance: number; point: [number, number, number] };
    if (Number.isFinite(known.distance)) part.point = roundPoint(known.point);
  });

  let triangles = 0;
  let vertices = 0;
  for (const mesh of document.meshes) {
    for (const primitive of mesh.primitives) {
      triangles += (document.accessors[primitive.indices] as SolidAccessor).count / 3;
      vertices += (document.accessors[primitive.position] as SolidAccessor).count;
    }
  }

  const animations = document.animations.map((animation) => {
    let duration = 0;
    for (const input of animation.inputs) {
      const accessor = document.accessors[input] as SolidAccessor;
      for (let at = 0; at < accessor.count; at += 1) {
        const time = readElement(document, accessor, at, vertexBuffer)[0] as number;
        if (!(time >= 0)) notCanonical("An animation's times are not from 0.");
        if (time > duration) duration = time;
      }
    }
    if (duration > SOLID_CAPS.animationSeconds) overCap('An animation is longer than 60 s.');
    return { duration: Math.round(duration * 1000) / 1000 };
  });

  const zero: SpacePoint = { x: 0, y: 0, z: 0 };
  return {
    bounds: drawsNothing
      ? { min: zero, max: zero }
      : {
          min: roundPoint(min as [number, number, number]),
          max: roundPoint(max as [number, number, number]),
        },
    counts: { triangles, vertices, nodes: document.nodes.length, textures: document.textures },
    parts,
    animations,
  };
}

/** Checks that a positions accessor's `min` and `max` are those of its data. */
function checkPositionBounds(document: SolidDocument, accessor: SolidAccessor): void {
  if (accessor.min === undefined || accessor.max === undefined) {
    notCanonical('Positions say their bounds.');
  }
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  const element: number[] = [];
  for (let at = 0; at < accessor.count; at += 1) {
    readElement(document, accessor, at, element);
    for (let axis = 0; axis < 3; axis += 1) {
      const value = element[axis] as number;
      if (!Number.isFinite(value)) notCanonical('A position is not a finite number.');
      if (value < (low[axis] as number)) low[axis] = value;
      if (value > (high[axis] as number)) high[axis] = value;
    }
  }
  for (let axis = 0; axis < 3; axis += 1) {
    const tolerance =
      1e-6 * Math.max(1, Math.abs(high[axis] as number), Math.abs(low[axis] as number));
    if (
      Math.abs((accessor.min[axis] as number) - (low[axis] as number)) > tolerance ||
      Math.abs((accessor.max[axis] as number) - (high[axis] as number)) > tolerance
    ) {
      notCanonical("Positions' bounds are not those of their data.");
    }
  }
}

/** Each node's matrix in the scene's space, from its holders' translations, rotations and scales. */
function worldMatrices(document: SolidDocument): Matrix[] {
  const world: Matrix[] = document.nodes.map(() => identity());
  const visit = (node: number, parent: Matrix): void => {
    const data = document.nodes[node];
    if (data === undefined) return;
    const matrix = multiply(parent, local(data.translation, data.rotation, data.scale));
    world[node] = matrix;
    for (const child of data.children) visit(child, matrix);
  };
  for (const root of document.roots) visit(root, identity());
  return world;
}

function identity(): Matrix {
  const matrix = new Float64Array(16);
  matrix[0] = matrix[5] = matrix[10] = matrix[15] = 1;
  return matrix;
}

/** The matrix of a translation, a rotation as a unit quaternion and a scale, in that glTF order. */
function local(
  t: readonly [number, number, number],
  q: readonly [number, number, number, number],
  s: readonly [number, number, number],
): Matrix {
  const [x, y, z, w] = q;
  const length = Math.hypot(x, y, z, w) || 1;
  const [qx, qy, qz, qw] = [x / length, y / length, z / length, w / length];
  const m = new Float64Array(16);
  m[0] = (1 - 2 * (qy * qy + qz * qz)) * s[0];
  m[1] = 2 * (qx * qy + qz * qw) * s[0];
  m[2] = 2 * (qx * qz - qy * qw) * s[0];
  m[4] = 2 * (qx * qy - qz * qw) * s[1];
  m[5] = (1 - 2 * (qx * qx + qz * qz)) * s[1];
  m[6] = 2 * (qy * qz + qx * qw) * s[1];
  m[8] = 2 * (qx * qz + qy * qw) * s[2];
  m[9] = 2 * (qy * qz - qx * qw) * s[2];
  m[10] = (1 - 2 * (qx * qx + qy * qy)) * s[2];
  m[12] = t[0];
  m[13] = t[1];
  m[14] = t[2];
  m[15] = 1;
  return m;
}

function multiply(a: Matrix, b: Matrix): Matrix {
  const out = new Float64Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1)
        sum += (a[k * 4 + row] as number) * (b[column * 4 + k] as number);
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

function transform(m: Matrix, p: readonly number[], out: [number, number, number]): void {
  const x = p[0] as number;
  const y = p[1] as number;
  const z = p[2] as number;
  out[0] = (m[0] as number) * x + (m[4] as number) * y + (m[8] as number) * z + (m[12] as number);
  out[1] = (m[1] as number) * x + (m[5] as number) * y + (m[9] as number) * z + (m[13] as number);
  out[2] = (m[2] as number) * x + (m[6] as number) * y + (m[10] as number) * z + (m[14] as number);
}
