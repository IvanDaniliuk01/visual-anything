/**
 * A file at every cap of a solid (ADR 0075), made in the test that cleans it and never kept: its nodes
 * draw 1,000,000 triangles and 1,000,000 vertices, 8,192 nodes of which 4,096 are named parts, 4,096
 * meshes, 8,192 primitives, 256 materials, 32 textures at a solid's largest side whose cleaned bytes
 * come to nearly 16 MiB in all, 16 animations of 256 channels and 199,936 keyframes in all.
 *
 * Every cap at once would not fit the 32 MiB of a cleaned file: 16 MiB of textures, and a million
 * vertices kept once each, as 32-bit positions with their 16-bit indices, come to over 33 MiB. So each
 * mesh is drawn by two nodes, its part and the node the part holds, which the caps count once for
 * each: the file keeps half a million vertices and triangles, and its nodes draw a million of each.
 * Only primitives with a textured material have texture coordinates.
 */
import { deflateSync } from 'node:zlib';
import { SOLID_CAPS } from '@visual-anything/core';
import { glbOf, pngChunk } from './gltf';

/** The numbers the file is made of. */
export const AT_THE_CAPS = {
  parts: SOLID_CAPS.parts,
  meshes: SOLID_CAPS.meshes,
  primitives: SOLID_CAPS.primitives,
  /** What its nodes draw, each mesh drawn twice. */
  triangles: SOLID_CAPS.triangles,
  vertices: SOLID_CAPS.vertices,
  /** What the file keeps, and its description counts. */
  storedTriangles: SOLID_CAPS.triangles / 2,
  storedVertices: SOLID_CAPS.vertices / 2,
  materials: SOLID_CAPS.materials,
  textures: SOLID_CAPS.textures,
  animations: SOLID_CAPS.animations,
  channels: SOLID_CAPS.channels,
  /** Keyframes a channel: 781 × 256 = 199,936, within 200,000. */
  keyframes: Math.floor(SOLID_CAPS.keyframes / SOLID_CAPS.channels),
  /** The side of each texture, the most a solid's texture has. */
  textureSide: SOLID_CAPS.textureSide,
  /** The bytes of each texture once cleaned, its share of the textures' bytes in all. */
  textureBytes: Math.floor(SOLID_CAPS.textureBytes / SOLID_CAPS.textures),
} as const;

/**
 * A PNG of `side` pixels a side, with no chunk the cleaner drops, whose bytes are at most `bytes` and
 * close to it: its first rows are noise, which does not compress, and the rest one color, which
 * compresses to almost nothing.
 */
export function pngOfBytes(side: number, bytes: number): Uint8Array {
  const rowBytes = 1 + side * 3;
  const raw = new Uint8Array(rowBytes * side);
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, side);
  view.setUint32(4, side);
  header.set([8, 2, 0, 0, 0], 8);
  const write = (noisy: number): Uint8Array => {
    raw.fill(128);
    // Every row's filter is 0, none.
    for (let row = 0; row < side; row += 1) raw[row * rowBytes] = 0;
    let seed = 0x9e3779b9;
    for (let at = 0; at < noisy; at += 1) {
      if (at % rowBytes === 0) continue;
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      raw[at] = seed & 0xff;
    }
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk('IHDR', header),
      pngChunk('IDAT', deflateSync(raw, { level: 1 })),
      pngChunk('IEND', new Uint8Array(0)),
    ]);
  };
  let noisy = bytes;
  let picture = write(noisy);
  // Noise deflates to a little more than itself, so a few steps down bring it within its bytes.
  for (let step = 0; picture.length > bytes && step < 8; step += 1) {
    noisy -= picture.length - bytes + 64;
    picture = write(noisy);
  }
  if (picture.length > bytes) throw new Error(`The PNG is ${picture.length} bytes, past ${bytes}.`);
  return picture;
}

/** The GLB of a solid at every cap. */
export function solidAtTheCaps(): Uint8Array {
  const caps = AT_THE_CAPS;
  const parts: Uint8Array[] = [];
  let length = 0;
  const bufferViews: Record<string, unknown>[] = [];
  const accessors: Record<string, unknown>[] = [];
  const add = (bytes: Uint8Array): number => {
    const pad = (4 - (length % 4)) % 4;
    if (pad > 0) {
      parts.push(new Uint8Array(pad));
      length += pad;
    }
    bufferViews.push({ buffer: 0, byteOffset: length, byteLength: bytes.length });
    parts.push(bytes);
    length += bytes.length;
    return bufferViews.length - 1;
  };
  const accessor = (value: Record<string, unknown>) => {
    accessors.push(value);
    return accessors.length - 1;
  };

  // Each primitive draws a fan of thin triangles: 61 of them, or 62 for the first few, so that the
  // primitives together hold exactly half a million of each, which their nodes draw twice.
  const base = Math.floor(caps.storedTriangles / caps.primitives);
  const extra = caps.storedTriangles - base * caps.primitives;
  const meshes = [];
  let primitive = 0;
  for (let mesh = 0; mesh < caps.meshes; mesh += 1) {
    const primitives = [];
    for (let own = 0; own < caps.primitives / caps.meshes; own += 1) {
      const count = base + (primitive < extra ? 1 : 0);
      const positions = new Float32Array(count * 3);
      const uv = new Float32Array(count * 2);
      const x = (primitive % 128) * 0.1;
      const z = Math.floor(primitive / 128) * 0.1;
      for (let at = 0; at < count; at += 1) {
        const angle = (at / count) * Math.PI * 2;
        positions.set(
          [x + Math.cos(angle) * 0.04, (at % 7) * 0.01, z + Math.sin(angle) * 0.04],
          at * 3,
        );
        uv.set([at / count, (at % 7) / 7], at * 2);
      }
      const indices = new Uint16Array(count * 3);
      for (let at = 0; at < count; at += 1) {
        indices.set([at, (at + 1) % count, (at + 2) % count], at * 3);
      }
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      positions.forEach((value, at) => {
        min[at % 3] = Math.min(min[at % 3] as number, value);
        max[at % 3] = Math.max(max[at % 3] as number, value);
      });
      const material = primitive % caps.materials;
      primitives.push({
        attributes: {
          POSITION: accessor({
            bufferView: add(new Uint8Array(positions.buffer)),
            componentType: 5126,
            count,
            type: 'VEC3',
            min,
            max,
          }),
          ...(material < caps.textures
            ? {
                TEXCOORD_0: accessor({
                  bufferView: add(new Uint8Array(uv.buffer)),
                  componentType: 5126,
                  count,
                  type: 'VEC2',
                }),
              }
            : {}),
        },
        indices: accessor({
          bufferView: add(new Uint8Array(indices.buffer)),
          componentType: 5123,
          count: count * 3,
          type: 'SCALAR',
        }),
        material,
      });
      primitive += 1;
    }
    meshes.push({ primitives });
  }

  // Each named part draws its mesh, and holds one node that draws it again.
  const nodes: Record<string, unknown>[] = [];
  for (let part = 0; part < caps.parts; part += 1) {
    nodes.push({ name: `part_${part}`, mesh: part, children: [caps.parts + part] });
  }
  for (let part = 0; part < caps.parts; part += 1) nodes.push({ mesh: part });

  const picture = pngOfBytes(caps.textureSide, caps.textureBytes);
  const images = Array.from({ length: caps.textures }, () => ({
    bufferView: add(picture),
    mimeType: 'image/png',
  }));
  const materials = Array.from({ length: caps.materials }, (_, at) => ({
    pbrMetallicRoughness: {
      baseColorFactor: [at / caps.materials, 0.5, 0.5, 1],
      ...(at < caps.textures ? { baseColorTexture: { index: at } } : {}),
    },
  }));

  const times = new Float32Array(caps.keyframes);
  for (let at = 0; at < times.length; at += 1) times[at] = (at / (times.length - 1)) * 59;
  const input = accessor({
    bufferView: add(new Uint8Array(times.buffer)),
    componentType: 5126,
    count: times.length,
    type: 'SCALAR',
    min: [0],
    max: [59],
  });
  const perAnimation = caps.channels / caps.animations;
  const animations = Array.from({ length: caps.animations }, (_, animation) => {
    const samplers = [];
    const channels = [];
    for (let own = 0; own < perAnimation; own += 1) {
      const values = new Float32Array(caps.keyframes * 3);
      for (let at = 0; at < caps.keyframes; at += 1) values[at * 3 + 1] = Math.sin(at / 50) * 0.01;
      const output = accessor({
        bufferView: add(new Uint8Array(values.buffer)),
        componentType: 5126,
        count: caps.keyframes,
        type: 'VEC3',
      });
      samplers.push({ input, output, interpolation: 'LINEAR' });
      channels.push({
        sampler: own,
        target: { node: animation * perAnimation + own, path: 'translation' },
      });
    }
    return { channels, samplers };
  });

  const json = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: Array.from({ length: caps.parts }, (_, at) => at) }],
    nodes,
    meshes,
    materials,
    textures: images.map((_, source) => ({ source })),
    images,
    accessors,
    bufferViews,
    buffers: [{ byteLength: length }],
    animations,
  };
  const bin = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    bin.set(part, at);
    at += part.length;
  }
  return glbOf(json, bin);
}
