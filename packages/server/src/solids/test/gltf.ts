/**
 * glTF files for the cleaner's tests (ADR 0075), made in the tests and never committed: a small writer
 * of the files people import, `.glb` or `.gltf` with its data in `data:` addresses, which tests then
 * break on purpose through `edit`. Every fixture is generated, and small but for the caps' own.
 */
import { crc32, deflateSync } from 'node:zlib';

export interface InputMesh {
  /** x, y, z of each vertex. */
  positions: number[] | Float32Array;
  /** Three a triangle; none for an unindexed primitive. */
  indices?: number[] | Uint32Array;
  normals?: number[];
  texcoords?: number[];
  /** glTF's primitive mode; 4, triangles, by default. */
  mode?: number;
  material?: number;
}

export interface InputNode {
  name?: string;
  children?: number[];
  mesh?: number;
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  matrix?: number[];
}

export interface InputSolid {
  nodes: InputNode[];
  /** The scene's roots; every node nobody holds when left out. */
  roots?: number[];
  /** Each mesh, with one primitive, or several. */
  meshes: (InputMesh | InputMesh[])[];
  materials?: Record<string, unknown>[];
  /** Pictures, each a texture of its own, in order. */
  images?: { bytes: Uint8Array; mimeType: string }[];
  /** Each animation's channels: a node, a path, keyframe times and values. */
  animations?: { node: number; path: string; times: number[]; values: number[] }[][];
  /** Changes the JSON before it is written, to make it what a test needs. */
  edit?: (json: Record<string, unknown>) => void;
}

/** A box of 12 triangles from `min` to `max`. */
export function box(
  min: [number, number, number] = [0, 0, 0],
  max: [number, number, number] = [1, 1, 1],
): InputMesh {
  const positions: number[] = [];
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) positions.push(x, y, z);
    }
  }
  const faces = [
    [0, 1, 3, 2],
    [4, 6, 7, 5],
    [0, 4, 5, 1],
    [2, 3, 7, 6],
    [0, 2, 6, 4],
    [1, 5, 7, 3],
  ];
  return { positions, indices: faces.flatMap(([a, b, c, d]) => [a, b, c, a, c, d] as number[]) };
}

/** A grid of `side` by `side` squares, two triangles each, in the plane y = 0. */
export function grid(side: number, at: [number, number, number] = [0, 0, 0]): InputMesh {
  const positions = new Float32Array((side + 1) * (side + 1) * 3);
  let p = 0;
  for (let row = 0; row <= side; row += 1) {
    for (let column = 0; column <= side; column += 1) {
      positions[p++] = at[0] + column / side;
      positions[p++] = at[1] + Math.sin(row * 0.37 + column * 0.11) * 0.01;
      positions[p++] = at[2] + row / side;
    }
  }
  const indices = new Uint32Array(side * side * 6);
  let i = 0;
  for (let row = 0; row < side; row += 1) {
    for (let column = 0; column < side; column += 1) {
      const a = row * (side + 1) + column;
      const b = a + 1;
      const c = a + side + 1;
      const d = c + 1;
      indices.set([a, c, b, b, c, d], i);
      i += 6;
    }
  }
  return { positions, indices };
}

/** The JSON and binary data of an input solid. */
export function gltfParts(solid: InputSolid): { json: Record<string, unknown>; bin: Uint8Array } {
  const chunks: Uint8Array[] = [];
  let length = 0;
  const bufferViews: Record<string, unknown>[] = [];
  const accessors: Record<string, unknown>[] = [];
  const add = (bytes: Uint8Array): number => {
    const pad = (4 - (length % 4)) % 4;
    if (pad > 0) {
      chunks.push(new Uint8Array(pad));
      length += pad;
    }
    bufferViews.push({ buffer: 0, byteOffset: length, byteLength: bytes.length });
    chunks.push(bytes);
    length += bytes.length;
    return bufferViews.length - 1;
  };
  const floats = (values: ArrayLike<number>, type: string, bounds = false) => {
    const data = Float32Array.from(values);
    const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[type] as number;
    const accessor: Record<string, unknown> = {
      bufferView: add(new Uint8Array(data.buffer)),
      componentType: 5126,
      count: data.length / components,
      type,
    };
    if (bounds) {
      const min = new Array<number>(components).fill(Infinity);
      const max = new Array<number>(components).fill(-Infinity);
      data.forEach((value, at) => {
        const c = at % components;
        min[c] = Math.min(min[c] as number, value);
        max[c] = Math.max(max[c] as number, value);
      });
      accessor.min = min;
      accessor.max = max;
    }
    accessors.push(accessor);
    return accessors.length - 1;
  };
  const meshes = solid.meshes.map((each) => ({
    primitives: (Array.isArray(each) ? each : [each]).map((mesh) => {
      const attributes: Record<string, number> = { POSITION: floats(mesh.positions, 'VEC3', true) };
      if (mesh.normals) attributes.NORMAL = floats(mesh.normals, 'VEC3');
      if (mesh.texcoords) attributes.TEXCOORD_0 = floats(mesh.texcoords, 'VEC2');
      const primitive: Record<string, unknown> = { attributes };
      if (mesh.indices !== undefined) {
        const wide = mesh.positions.length / 3 > 65_535;
        const bytes = wide
          ? new Uint8Array(Uint32Array.from(mesh.indices).buffer)
          : new Uint8Array(Uint16Array.from(mesh.indices).buffer);
        accessors.push({
          bufferView: add(bytes),
          componentType: wide ? 5125 : 5123,
          count: mesh.indices.length,
          type: 'SCALAR',
        });
        primitive.indices = accessors.length - 1;
      }
      if (mesh.mode !== undefined) primitive.mode = mesh.mode;
      if (mesh.material !== undefined) primitive.material = mesh.material;
      return primitive;
    }),
  }));
  const images = (solid.images ?? []).map((image) => ({
    bufferView: add(image.bytes),
    mimeType: image.mimeType,
  }));
  const animations = (solid.animations ?? []).map((channels) => {
    const samplers = channels.map((channel) => ({
      input: floats(channel.times, 'SCALAR', true),
      output: floats(channel.values, channel.path === 'rotation' ? 'VEC4' : 'VEC3'),
      interpolation: 'LINEAR',
    }));
    return {
      channels: channels.map((channel, at) => ({
        sampler: at,
        target: { node: channel.node, path: channel.path },
      })),
      samplers,
    };
  });
  const held = new Set(solid.nodes.flatMap((node) => node.children ?? []));
  const roots = solid.roots ?? solid.nodes.map((_, at) => at).filter((at) => !held.has(at));
  const json: Record<string, unknown> = {
    asset: { version: '2.0', generator: 'a test' },
    scene: 0,
    scenes: [{ nodes: roots }],
    // Copies, so that a test's edit never changes the solid another test reads.
    nodes: structuredClone(solid.nodes),
    meshes,
    accessors,
    bufferViews,
    buffers: [{ byteLength: length }],
  };
  if (solid.materials) json.materials = structuredClone(solid.materials);
  if (images.length > 0) {
    json.images = images;
    json.textures = images.map((_, source) => ({ source }));
  }
  if (animations.length > 0) json.animations = animations;
  const bin = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    bin.set(chunk, at);
    at += chunk.length;
  }
  solid.edit?.(json);
  return { json, bin };
}

/** A `.glb` of an input solid. */
export function inputGlb(solid: InputSolid): Uint8Array {
  const { json, bin } = gltfParts(solid);
  return glbOf(json, bin);
}

/** A `.gltf` of an input solid, its buffer in a `data:` address. */
export function inputGltf(solid: InputSolid): Uint8Array {
  const { json, bin } = gltfParts(solid);
  const buffers = json.buffers as Record<string, unknown>[];
  if (buffers[0] !== undefined) {
    buffers[0].uri = `data:application/octet-stream;base64,${Buffer.from(bin).toString('base64')}`;
  }
  return new TextEncoder().encode(JSON.stringify(json, null, 2));
}

/** A GLB of a JSON document and binary data. */
export function glbOf(json: unknown, bin: Uint8Array, more: Uint8Array[] = []): Uint8Array {
  let text = JSON.stringify(json);
  while (Buffer.byteLength(text) % 4 !== 0) text += ' ';
  const jsonBytes = new TextEncoder().encode(text);
  const chunks = [chunk(jsonBytes, 0x4e4f534a)];
  if (bin.length > 0) chunks.push(chunk(bin, 0x004e4942));
  chunks.push(...more);
  const total = 12 + chunks.reduce((sum, each) => sum + each.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  let at = 12;
  for (const each of chunks) {
    out.set(each, at);
    at += each.length;
  }
  return out;
}

/** A GLB chunk of a type, padded to four bytes. */
export function chunk(data: Uint8Array, type: number): Uint8Array {
  const length = Math.ceil(data.length / 4) * 4;
  const out = new Uint8Array(8 + length);
  const view = new DataView(out.buffer);
  view.setUint32(0, length, true);
  view.setUint32(4, type, true);
  out.set(data, 8);
  return out;
}

/** A PNG of one color, `width` by `height`, with a text chunk that cleaning drops. */
export function png(width: number, height: number, text = 'Comment\0made in a test'): Uint8Array {
  const row = new Uint8Array(1 + width * 3);
  for (let x = 0; x < width; x += 1) row.set([200, 120, 40], 1 + x * 3);
  const raw = new Uint8Array(row.length * height);
  for (let y = 0; y < height; y += 1) raw.set(row, y * row.length);
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('tEXt', new TextEncoder().encode(text)),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', new Uint8Array(0)),
  ]);
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
