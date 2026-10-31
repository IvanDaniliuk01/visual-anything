/**
 * Canonical solid files for the solid worker's tests (ADR 0075), made with the core's test writer,
 * and a few written by hand where they need what it does not write: quantized attributes, materials
 * and textures.
 */
import { solidHash } from '@visual-anything/core';
import { boxMesh, writeGlb, writeTestSolid } from '../../../../core/src/test/solids';
import type { DecodedImage } from './build';

/** An arm of three named parts: a base, a link on it, and a gripper held by the link. */
export const ARM = writeTestSolid({
  nodes: [
    { name: 'base', mesh: 0, children: [1] },
    { name: 'link', mesh: 1, children: [2] },
    { name: 'gripper', mesh: 2 },
  ],
  meshes: [
    boxMesh([-0.5, 0, -0.5], [0.5, 0.2, 0.5]),
    boxMesh([-0.1, 0.2, -0.1], [0.1, 1, 0.1]),
    boxMesh([-0.2, 1, -0.05], [0.2, 1.2, 0.05]),
  ],
});
export const ARM_HASH = solidHash(ARM);

/** A box that slides along x, from 0 to 2 in 2 s, by linear keyframes. */
export const SLIDER = writeTestSolid({
  nodes: [{ name: 'slider', mesh: 0 }],
  meshes: [boxMesh([0, 0, 0], [0.1, 0.1, 0.1])],
  animations: [[0, 1, 2]],
});
export const SLIDER_HASH = solidHash(SLIDER);

/** A decoded picture, as `createImageBitmap` would give it. */
export class FakeImage implements DecodedImage {
  closed = false;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}
  close(): void {
    this.closed = true;
  }
}

/** The header of a PNG of a size: as much as the core's reader reads of one. */
export function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  bytes.set(
    [...'IHDR'].map((each) => each.charCodeAt(0)),
    12,
  );
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/** The binary chunk of a hand-written GLB, and its buffer views, as data is added to it. */
export class Binary {
  readonly bufferViews: Record<string, unknown>[] = [];
  private readonly chunks: Uint8Array[] = [];
  private length = 0;

  /** Adds data, padded to four bytes, as a buffer view of its own; answers the view's index. */
  add(bytes: Uint8Array, byteStride?: number): number {
    const offset = this.length;
    this.chunks.push(bytes);
    this.length += bytes.length;
    const pad = (4 - (this.length % 4)) % 4;
    if (pad > 0) {
      this.chunks.push(new Uint8Array(pad));
      this.length += pad;
    }
    this.bufferViews.push({
      buffer: 0,
      byteOffset: offset,
      byteLength: bytes.length,
      ...(byteStride === undefined ? {} : { byteStride }),
    });
    return this.bufferViews.length - 1;
  }

  /** The GLB of some JSON with this data. */
  glb(json: Record<string, unknown>): Uint8Array {
    const bin = new Uint8Array(this.length);
    let at = 0;
    for (const chunk of this.chunks) {
      bin.set(chunk, at);
      at += chunk.length;
    }
    return writeGlb(
      { ...json, bufferViews: this.bufferViews, buffers: [{ byteLength: this.length }] },
      bin,
    );
  }
}

/**
 * A triangle stored as `KHR_mesh_quantization` stores it: positions as normalized shorts and normals
 * as normalized bytes, each interleaved to four bytes, under a node that scales it by 2.
 */
export function quantizedTriangle(): Uint8Array {
  const binary = new Binary();
  const positions = new Int16Array([0, 0, 0, 0, 32767, 0, 0, 0, 0, 32767, 0, 0]);
  const normals = new Int8Array([0, 0, 127, 0, 0, 0, 127, 0, 0, 0, 127, 0]);
  const position = binary.add(new Uint8Array(positions.buffer), 8);
  const normal = binary.add(new Uint8Array(normals.buffer), 4);
  const indices = binary.add(new Uint8Array(new Uint16Array([0, 1, 2]).buffer));
  return binary.glb({
    asset: { version: '2.0' },
    extensionsUsed: ['KHR_mesh_quantization'],
    extensionsRequired: ['KHR_mesh_quantization'],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'plate', mesh: 0, scale: [2, 2, 2] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2 }] }],
    accessors: [
      {
        bufferView: position,
        componentType: 5122,
        normalized: true,
        count: 3,
        type: 'VEC3',
        min: [0, 0, 0],
        max: [1, 1, 0],
      },
      { bufferView: normal, componentType: 5120, normalized: true, count: 3, type: 'VEC3' },
      { bufferView: indices, componentType: 5123, count: 3, type: 'SCALAR' },
    ],
  });
}

/** A square of two triangles, with texture coordinates, whose materials the test gives. */
export function texturedSquare(options: {
  materials: Record<string, unknown>[];
  textures?: Record<string, unknown>[];
  samplers?: Record<string, unknown>[];
  images?: { width: number; height: number }[];
  extensionsUsed?: string[];
  colors?: boolean;
  normals?: boolean;
}): Uint8Array {
  const binary = new Binary();
  const positions = binary.add(
    new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]).buffer),
  );
  const uvs = binary.add(new Uint8Array(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]).buffer));
  const indices = binary.add(new Uint8Array(new Uint16Array([0, 1, 2, 0, 2, 3]).buffer));
  const accessors: Record<string, unknown>[] = [
    {
      bufferView: positions,
      componentType: 5126,
      count: 4,
      type: 'VEC3',
      min: [0, 0, 0],
      max: [1, 1, 0],
    },
    { bufferView: uvs, componentType: 5126, count: 4, type: 'VEC2' },
    { bufferView: indices, componentType: 5123, count: 6, type: 'SCALAR' },
  ];
  const attributes: Record<string, number> = { POSITION: 0, TEXCOORD_0: 1, TEXCOORD_1: 1 };
  if (options.colors) {
    accessors.push({
      bufferView: binary.add(new Uint8Array(new Uint8Array(16).fill(255).buffer)),
      componentType: 5121,
      normalized: true,
      count: 4,
      type: 'VEC4',
    });
    attributes.COLOR_0 = accessors.length - 1;
  }
  if (options.normals !== false) {
    accessors.push({
      bufferView: binary.add(
        new Uint8Array(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]).buffer),
      ),
      componentType: 5126,
      count: 4,
      type: 'VEC3',
    });
    attributes.NORMAL = accessors.length - 1;
  }
  const images = (options.images ?? []).map((size) => ({
    bufferView: binary.add(pngHeader(size.width, size.height)),
    mimeType: 'image/png',
  }));
  return binary.glb({
    asset: { version: '2.0' },
    ...(options.extensionsUsed ? { extensionsUsed: options.extensionsUsed } : {}),
    scene: 0,
    scenes: [{ nodes: options.materials.map((_, at) => at) }],
    nodes: options.materials.map((_, at) => ({ name: `square${at}`, mesh: at })),
    meshes: options.materials.map((_, at) => ({
      primitives: [{ attributes, indices: 2, material: at }],
    })),
    accessors,
    materials: options.materials,
    ...(options.textures ? { textures: options.textures } : {}),
    ...(options.samplers ? { samplers: options.samplers } : {}),
    ...(images.length > 0 ? { images } : {}),
  });
}
