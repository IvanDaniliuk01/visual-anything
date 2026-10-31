// @vitest-environment node
/**
 * The solid worker's reader (ADR 0075): canonical files, made with the core's test writer, built into
 * three.js objects without GLTFLoader: geometry with its quantized attributes, the parts of each
 * piece, metallic-roughness materials, textures from the decoder handed in, nodes and animations.
 */
import { readSolid, solidHash, type SolidDescription } from '@visual-anything/core';
import {
  DoubleSide,
  FrontSide,
  Int16BufferAttribute,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NearestFilter,
  NoColorSpace,
  SRGBColorSpace,
  type BufferAttribute,
  type Mesh,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { boxMesh, writeTestSolid } from '../../../../core/src/test/solids';
import { CubicSplineInterpolant, loopedTime, poseAt } from './animation';
import { buildSolid, type BuiltSolid, type ImageDecoder } from './build';
import {
  ARM,
  ARM_HASH,
  FakeImage,
  SLIDER,
  SLIDER_HASH,
  quantizedTriangle,
  texturedSquare,
} from './fixtures';

const noImages: ImageDecoder = () => Promise.resolve(undefined);

async function built(bytes: Uint8Array, decodeImage: ImageDecoder = noImages): Promise<BuiltSolid> {
  const result = await buildSolid(bytes, solidHash(bytes), { decodeImage });
  if (!result.ok) throw new Error(result.message);
  return result.solid;
}

function description(bytes: Uint8Array): SolidDescription {
  const read = readSolid(bytes);
  if (!read.ok) throw new Error('not canonical');
  return read.description;
}

describe('the solid worker’s reader', () => {
  it('builds the nodes’ tree, and a piece for each primitive a node draws', async () => {
    const solid = await built(ARM);
    expect(solid.hash).toBe(ARM_HASH);
    expect(solid.description).toEqual(description(ARM));
    expect(solid.nodes.map((node) => node.name)).toEqual(['base', 'link', 'gripper']);
    expect(solid.root.children).toEqual([solid.nodes[0]]);
    expect(solid.nodes[1]?.parent).toBe(solid.nodes[0]);
    expect(solid.nodes[2]?.parent).toBe(solid.nodes[1]);
    expect(solid.pieces.map((piece) => [piece.node, piece.part])).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
    const link = solid.pieces[1]?.mesh as Mesh;
    expect(link.parent).toBe(solid.nodes[1]);
    const position = link.geometry.getAttribute('position') as BufferAttribute;
    expect(position.count).toBe(8);
    expect(position.array).toBeInstanceOf(Float32Array);
    expect([position.getX(7), position.getY(7), position.getZ(7)]).toEqual([
      expect.closeTo(0.1, 6),
      expect.closeTo(1, 6),
      expect.closeTo(0.1, 6),
    ]);
    expect(link.geometry.index?.count).toBe(36);
    // Each mesh: 8 positions of 12 bytes, and 36 indices of 2.
    expect(solid.gpuBytes).toBe(3 * (8 * 12 + 36 * 2));
  });

  it('gives each piece the innermost named part holding its node, numbered as the core numbers parts', async () => {
    // Node order differs from depth-first order: a root "a" holds an unnamed node and "b"; an unnamed
    // root lies outside every part.
    const bytes = writeTestSolid({
      nodes: [{ name: 'b', mesh: 0 }, { mesh: 1 }, { name: 'a', children: [3, 0] }, { mesh: 2 }],
      roots: [2, 1],
      meshes: [
        boxMesh([0, 0, 0], [1, 1, 1]),
        boxMesh([2, 0, 0], [3, 1, 1]),
        boxMesh([0, 2, 0], [1, 3, 1]),
      ],
    });
    const solid = await built(bytes);
    expect(solid.description.parts.map((part) => [part.name, part.parent])).toEqual([
      ['a', undefined],
      ['b', 0],
    ]);
    expect([...solid.partOfNode]).toEqual([1, -1, 0, 0]);
    expect(solid.pieces.map((piece) => [piece.node, piece.part])).toEqual([
      [0, 1],
      [1, -1],
      [3, 0],
    ]);
    expect(solid.holds(0, 1)).toBe(true);
    expect(solid.holds(1, 0)).toBe(false);
    expect(solid.holds(1, 1)).toBe(true);
  });

  it('works out a part’s bounds from its geometry and the parts it holds', async () => {
    const solid = await built(ARM);
    const link = solid.partBounds(1);
    expect([link.min.x, link.min.y, link.max.x, link.max.y]).toEqual([
      expect.closeTo(-0.2, 6),
      expect.closeTo(0.2, 6),
      expect.closeTo(0.2, 6),
      expect.closeTo(1.2, 6),
    ]);
    expect(solid.partBounds(1)).toBe(link);
  });

  it('refuses bytes that are not their hash’s, or not canonical, and never throws', async () => {
    const wrong = await buildSolid(ARM, '0'.repeat(64), { decodeImage: noImages });
    expect(wrong).toMatchObject({ ok: false, code: 'invalid-solid' });
    const broken = ARM.slice(0, 40);
    const result = await buildSolid(broken, solidHash(broken), { decodeImage: noImages });
    expect(result).toMatchObject({ ok: false, code: 'invalid-solid' });
    const digest = vi.fn(() => Promise.resolve(ARM_HASH));
    expect((await buildSolid(ARM, ARM_HASH, { decodeImage: noImages, digest })).ok).toBe(true);
    expect(digest).toHaveBeenCalledOnce();
  });

  it('keeps quantized attributes as the file stores them, read as normalized integers', async () => {
    const bytes = quantizedTriangle();
    const solid = await built(bytes);
    const geometry = (solid.pieces[0]?.mesh as Mesh).geometry;
    const position = geometry.getAttribute('position') as Int16BufferAttribute;
    expect(position.array).toBeInstanceOf(Int16Array);
    expect(position.normalized).toBe(true);
    // Interleaved to four bytes in the file, packed here.
    expect([...position.array]).toEqual([0, 0, 0, 32767, 0, 0, 0, 32767, 0]);
    const normal = geometry.getAttribute('normal') as BufferAttribute;
    expect(normal.array).toBeInstanceOf(Int8Array);
    expect([...normal.array]).toEqual([0, 0, 127, 0, 0, 127, 0, 0, 127]);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox?.max.toArray()).toEqual([1, 1, 0]);
    expect(solid.description.bounds.max).toEqual({ x: 2, y: 2, z: 0 });
    expect(solid.nodes[0]?.scale.toArray()).toEqual([2, 2, 2]);
    expect(solid.gpuBytes).toBe(18 + 9 + 6);
  });

  it('makes metallic-roughness materials, unlit ones, and a flat one of base colors for each', async () => {
    const bytes = texturedSquare({
      extensionsUsed: ['KHR_materials_unlit', 'KHR_materials_emissive_strength'],
      materials: [
        {
          pbrMetallicRoughness: {
            baseColorFactor: [1, 0, 0, 0.5],
            metallicFactor: 0,
            roughnessFactor: 0.25,
          },
          emissiveFactor: [0, 1, 0],
          extensions: { KHR_materials_emissive_strength: { emissiveStrength: 3 } },
          alphaMode: 'BLEND',
          doubleSided: true,
        },
        { extensions: { KHR_materials_unlit: {} }, alphaMode: 'MASK', alphaCutoff: 0.3 },
        {},
      ],
    });
    const solid = await built(bytes);
    const [first, unlit, plain] = solid.pieces;
    const standard = first?.studio as MeshStandardMaterial;
    expect(standard).toBeInstanceOf(MeshStandardMaterial);
    expect(standard.color.toArray()).toEqual([1, 0, 0]);
    expect(standard.opacity).toBe(0.5);
    expect(standard.transparent).toBe(true);
    expect(standard.depthWrite).toBe(false);
    expect([standard.metalness, standard.roughness]).toEqual([0, 0.25]);
    expect(standard.emissive.toArray()).toEqual([0, 1, 0]);
    expect(standard.emissiveIntensity).toBe(3);
    expect(standard.side).toBe(DoubleSide);
    expect(first?.side).toBe(DoubleSide);
    const flat = first?.flat as MeshBasicMaterial;
    expect(flat).toBeInstanceOf(MeshBasicMaterial);
    expect(flat.toneMapped).toBe(false);
    expect(flat.color.toArray()).toEqual([1, 0, 0]);
    expect(flat.opacity).toBe(0.5);
    expect(unlit?.studio).toBeInstanceOf(MeshBasicMaterial);
    expect(unlit?.studio.alphaTest).toBe(0.3);
    expect(unlit?.studio.side).toBe(FrontSide);
    // glTF's own default: white, fully metallic and rough, opaque.
    const fallback = plain?.studio as MeshStandardMaterial;
    expect([fallback.metalness, fallback.roughness, fallback.opacity]).toEqual([1, 1, 1]);
    expect(fallback.transparent).toBe(false);
  });

  it('draws vertex colors, and shades flat a primitive without normals', async () => {
    const solid = await built(texturedSquare({ materials: [{}], colors: true, normals: false }));
    const studio = solid.pieces[0]?.studio as MeshStandardMaterial;
    expect(studio.vertexColors).toBe(true);
    expect(studio.flatShading).toBe(true);
    expect(solid.pieces[0]?.flat.vertexColors).toBe(true);
  });

  it('decodes textures from their bytes, with the decoder handed in, and draws them as glTF says', async () => {
    const decode = vi.fn((bytes: Uint8Array, mimeType: string) => {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      expect(mimeType).toBe('image/png');
      return Promise.resolve(new FakeImage(view.getUint32(16), view.getUint32(20)));
    });
    const bytes = texturedSquare({
      extensionsUsed: ['KHR_texture_transform'],
      images: [
        { width: 64, height: 32 },
        { width: 16, height: 16 },
      ],
      samplers: [{ magFilter: 9728, minFilter: 9728, wrapS: 33071 }],
      textures: [{ source: 0 }, { source: 1, sampler: 0 }],
      materials: [
        {
          pbrMetallicRoughness: {
            baseColorTexture: {
              index: 0,
              extensions: {
                KHR_texture_transform: { offset: [0.5, 0], scale: [2, 2], texCoord: 1 },
              },
            },
          },
          normalTexture: { index: 1, scale: 0.5 },
        },
      ],
    });
    const solid = await built(bytes, decode);
    expect(decode).toHaveBeenCalledTimes(2);
    const studio = solid.pieces[0]?.studio as MeshStandardMaterial;
    const map = studio.map;
    expect(map?.colorSpace).toBe(SRGBColorSpace);
    expect(map?.flipY).toBe(false);
    expect(map?.channel).toBe(1);
    expect(map?.offset.toArray()).toEqual([0.5, 0]);
    expect(map?.repeat.toArray()).toEqual([2, 2]);
    expect(map?.generateMipmaps).toBe(true);
    const normal = studio.normalMap;
    expect(normal?.colorSpace).toBe(NoColorSpace);
    expect(normal?.magFilter).toBe(NearestFilter);
    expect(normal?.generateMipmaps).toBe(false);
    expect(studio.normalScale.toArray()).toEqual([0.5, 0.5]);
    // Flat lighting draws the base color's texture too, and the uses share their image.
    expect((solid.pieces[0]?.flat as MeshBasicMaterial).map?.source).toBe(map?.source);
    // The square's geometry, then each image once: 64 by 32 with mipmaps, 16 by 16 without.
    const geometry = 4 * 12 + 4 * 8 + 6 * 2 + 4 * 12;
    expect(solid.gpuBytes).toBe(geometry + Math.ceil(64 * 32 * 4 * (4 / 3)) + 16 * 16 * 4);
    const images = await Promise.all(
      decode.mock.results.map((result) => result.value as Promise<FakeImage>),
    );
    solid.dispose();
    expect(images.every((image) => image.closed)).toBe(true);
  });

  it('leaves a material its factors when its texture does not decode', async () => {
    const bytes = texturedSquare({
      images: [{ width: 8, height: 8 }],
      textures: [{ source: 0 }],
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    });
    const solid = await built(bytes, () => Promise.reject(new Error('cannot decode')));
    expect((solid.pieces[0]?.studio as MeshStandardMaterial).map).toBeNull();
  });

  it('reads animations and poses the nodes they move, then puts them back at rest', async () => {
    const solid = await built(SLIDER);
    expect(solid.hash).toBe(SLIDER_HASH);
    const animation = solid.animations[0];
    expect(animation?.duration).toBe(2);
    expect(animation?.channels.map((channel) => [channel.node, channel.path])).toEqual([
      [0, 'translation'],
    ]);
    poseAt(solid.nodes, solid.rest, animation as NonNullable<typeof animation>, 1.5);
    expect(solid.nodes[0]?.position.x).toBeCloseTo(1.5);
    solid.posed = true;
    solid.toRest();
    expect(solid.nodes[0]?.position.toArray()).toEqual([0, 0, 0]);
    expect(solid.posed).toBe(false);
  });

  it('steps between keyframes when asked to', async () => {
    const bytes = writeTestSolid({
      nodes: [{ name: 'slider', mesh: 0 }],
      meshes: [boxMesh([0, 0, 0], [0.1, 0.1, 0.1])],
      animations: [[0, 1, 2]],
      edit: (json) => {
        const animations = json.animations as { samplers: { interpolation: string }[] }[];
        (animations[0]?.samplers[0] as { interpolation: string }).interpolation = 'STEP';
      },
    });
    const solid = await built(bytes);
    poseAt(solid.nodes, solid.rest, solid.animations[0] as BuiltSolid['animations'][number], 1.5);
    expect(solid.nodes[0]?.position.x).toBe(1);
  });

  it('interpolates cubic splines as glTF lays them out, and loops time', () => {
    // Two keyframes of one number: in-tangent, value, out-tangent each.
    const spline = new CubicSplineInterpolant(
      new Float32Array([0, 1]),
      new Float32Array([0, 0, 0, 0, 1, 0]),
      1,
      new Float32Array(1),
      false,
    );
    expect(spline.evaluate(0)[0]).toBe(0);
    expect(spline.evaluate(0.5)[0]).toBeCloseTo(0.5);
    expect(spline.evaluate(1)[0]).toBe(1);
    expect(loopedTime(5, 2)).toBe(1);
    expect(loopedTime(5, 0)).toBe(0);
  });
});
