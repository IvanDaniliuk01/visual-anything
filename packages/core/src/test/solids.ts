/**
 * Canonical solid files for tests (ADR 0075): a small writer of the form `readSolid` takes, positions
 * as floats and indices as unsigned shorts or ints, so that tests can make solids and break them on
 * purpose. The local program's cleaner writes the same form from any glTF file.
 */

export interface TestSolidNode {
  name?: string;
  children?: number[];
  mesh?: number;
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
}

export interface TestSolidMesh {
  /** x, y, z of each vertex. */
  positions: number[];
  /** Three vertex indices a triangle. */
  indices: number[];
}

export interface TestSolid {
  nodes: TestSolidNode[];
  /** The scene's roots; every node that is nobody's child when left out. */
  roots?: number[];
  meshes: TestSolidMesh[];
  /** Each animation's keyframe times, moving node 0 by translation. */
  animations?: number[][];
  /** Changes the JSON before it is written, to break the form on purpose. */
  edit?: (json: Record<string, unknown>) => void;
}

/** A box of one triangle a face, 12 triangles, from `min` to `max`. */
export function boxMesh(
  min: [number, number, number],
  max: [number, number, number],
): TestSolidMesh {
  const positions: number[] = [];
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) positions.push(x, y, z);
    }
  }
  // The corners are indexed by their bits: x * 4 + y * 2 + z.
  const faces = [
    [0, 1, 3, 2],
    [4, 6, 7, 5],
    [0, 4, 5, 1],
    [2, 3, 7, 6],
    [0, 2, 6, 4],
    [1, 5, 7, 3],
  ];
  const indices = faces.flatMap(([a, b, c, d]) => [a, b, c, a, c, d] as number[]);
  return { positions, indices };
}

/** Writes a canonical GLB of a test solid. */
export function writeTestSolid(solid: TestSolid): Uint8Array {
  const chunks: Uint8Array[] = [];
  let length = 0;
  const bufferViews: Record<string, unknown>[] = [];
  const accessors: Record<string, unknown>[] = [];
  const add = (bytes: Uint8Array): number => {
    const offset = length;
    chunks.push(bytes);
    length += bytes.length;
    const pad = (4 - (length % 4)) % 4;
    if (pad > 0) {
      chunks.push(new Uint8Array(pad));
      length += pad;
    }
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length });
    return bufferViews.length - 1;
  };
  const meshes = solid.meshes.map((mesh) => {
    const positions = new Float32Array(mesh.positions);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let at = 0; at < positions.length; at += 1) {
      const axis = at % 3;
      const value = positions[at] as number;
      min[axis] = Math.min(min[axis] as number, value);
      max[axis] = Math.max(max[axis] as number, value);
    }
    const position = accessors.length;
    accessors.push({
      bufferView: add(new Uint8Array(positions.buffer)),
      componentType: 5126,
      count: positions.length / 3,
      type: 'VEC3',
      min,
      max,
    });
    const wide = positions.length / 3 > 65_535;
    const indexBytes = wide
      ? new Uint8Array(new Uint32Array(mesh.indices).buffer)
      : new Uint8Array(new Uint16Array(mesh.indices).buffer);
    const indices = accessors.length;
    accessors.push({
      bufferView: add(indexBytes),
      componentType: wide ? 5125 : 5123,
      count: mesh.indices.length,
      type: 'SCALAR',
    });
    return { primitives: [{ attributes: { POSITION: position }, indices }] };
  });
  const animations = (solid.animations ?? []).map((times) => {
    const input = accessors.length;
    accessors.push({
      bufferView: add(new Uint8Array(new Float32Array(times).buffer)),
      componentType: 5126,
      count: times.length,
      type: 'SCALAR',
      min: [Math.min(...times)],
      max: [Math.max(...times)],
    });
    const output = accessors.length;
    accessors.push({
      bufferView: add(new Uint8Array(new Float32Array(times.flatMap((t) => [t, 0, 0])).buffer)),
      componentType: 5126,
      count: times.length,
      type: 'VEC3',
    });
    return {
      channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }],
      samplers: [{ input, output, interpolation: 'LINEAR' }],
    };
  });
  const held = new Set(solid.nodes.flatMap((node) => node.children ?? []));
  const roots = solid.roots ?? solid.nodes.map((_, at) => at).filter((at) => !held.has(at));
  const json: Record<string, unknown> = {
    asset: { version: '2.0' },
    ...(solid.nodes.length > 0 ? { scene: 0, scenes: [{ nodes: roots }] } : {}),
    ...(solid.nodes.length > 0 ? { nodes: solid.nodes } : {}),
    ...(meshes.length > 0 ? { meshes } : {}),
    ...(accessors.length > 0 ? { accessors } : {}),
    ...(bufferViews.length > 0 ? { bufferViews, buffers: [{ byteLength: length }] } : {}),
    ...(animations.length > 0 ? { animations } : {}),
  };
  solid.edit?.(json);
  const bin = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    bin.set(chunk, at);
    at += chunk.length;
  }
  return writeGlb(json, bin);
}

/** A GLB of some JSON and binary data, each chunk padded to four bytes as the form asks. */
export function writeGlb(json: unknown, bin: Uint8Array): Uint8Array {
  let text = JSON.stringify(json);
  while (new TextEncoder().encode(text).length % 4 !== 0) text += ' ';
  const jsonBytes = new TextEncoder().encode(text);
  const binLength = Math.ceil(bin.length / 4) * 4;
  const total = 12 + 8 + jsonBytes.length + (bin.length > 0 ? 8 + binLength : 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonBytes.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  if (bin.length > 0) {
    const at = 20 + jsonBytes.length;
    view.setUint32(at, binLength, true);
    view.setUint32(at + 4, 0x004e4942, true);
    out.set(bin, at + 8);
  }
  return out;
}
