/**
 * A file at every cap of a solid (ADR 0075), made in the test that cleans it and never kept: 1,000,000
 * triangles and 1,000,000 vertices, 8,192 nodes of which 4,096 are named parts, 4,096 meshes, 8,192
 * primitives, 256 materials, 32 textures at the bitmap cleaner's side, 16 animations of 256 channels
 * and 199,936 keyframes in all.
 */
import { SOLID_CAPS } from '@visual-anything/core';
import { glbOf, png } from './gltf';

/** The numbers the file is made of. */
export const AT_THE_CAPS = {
  parts: SOLID_CAPS.parts,
  meshes: SOLID_CAPS.meshes,
  primitives: SOLID_CAPS.primitives,
  triangles: SOLID_CAPS.triangles,
  vertices: SOLID_CAPS.vertices,
  materials: SOLID_CAPS.materials,
  textures: SOLID_CAPS.textures,
  animations: SOLID_CAPS.animations,
  channels: SOLID_CAPS.channels,
  /** Keyframes a channel: 781 × 256 = 199,936, within 200,000. */
  keyframes: Math.floor(SOLID_CAPS.keyframes / SOLID_CAPS.channels),
  /** The side of each texture, the most the core's bitmap cleaner keeps. */
  textureSide: 1024,
} as const;

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

  // Each primitive draws a fan of thin triangles: 122 of them, or 123 for the first few, so that the
  // primitives together hold exactly a million of each.
  const base = Math.floor(caps.triangles / caps.primitives);
  const extra = caps.triangles - base * caps.primitives;
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
          TEXCOORD_0: accessor({
            bufferView: add(new Uint8Array(uv.buffer)),
            componentType: 5126,
            count,
            type: 'VEC2',
          }),
        },
        indices: accessor({
          bufferView: add(new Uint8Array(indices.buffer)),
          componentType: 5123,
          count: count * 3,
          type: 'SCALAR',
        }),
        material: primitive % caps.materials,
      });
      primitive += 1;
    }
    meshes.push({ primitives });
  }

  // Each named part holds one node that draws its mesh.
  const nodes: Record<string, unknown>[] = [];
  for (let part = 0; part < caps.parts; part += 1) {
    nodes.push({ name: `part_${part}`, children: [caps.parts + part] });
  }
  for (let part = 0; part < caps.parts; part += 1) nodes.push({ mesh: part });

  const picture = png(caps.textureSide, caps.textureSide, '');
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
