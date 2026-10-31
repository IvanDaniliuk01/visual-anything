/**
 * The canonical writer (ADR 0075): every solid it writes is one the core's reader takes, with the
 * counts it was given, and the same solid always gives the same bytes.
 */
import { readBitmap, readSolid } from '@visual-anything/core';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { writeCanonicalSolid, type CleanSolid } from './canonical';
import { png } from './test/gltf';

const coordinate = fc.float({ min: -50, max: 50, noNaN: true });
const unit = fc.float({ min: -1, max: 1, noNaN: true });

const picture = (() => {
  const cleaned = readBitmap(png(2, 2), 'png');
  if (!cleaned.ok) throw new Error('The test picture does not clean.');
  return cleaned.value.bytes;
})();

/** A cleaned solid of a few nodes, meshes, materials, textures and animations. */
const solidArb: fc.Arbitrary<CleanSolid> = fc
  .record({
    meshes: fc.array(
      fc.array(
        fc.record({
          vertices: fc.integer({ min: 3, max: 40 }),
          triangles: fc.integer({ min: 1, max: 30 }),
          normals: fc.boolean(),
          tangents: fc.boolean(),
          uv: fc.boolean(),
          colors: fc.boolean(),
          material: fc.option(fc.nat(), { nil: undefined }),
          seed: fc.array(coordinate, { minLength: 3, maxLength: 3 }),
          unitSeed: unit,
        }),
        { minLength: 1, maxLength: 3 },
      ),
      { minLength: 1, maxLength: 3 },
    ),
    nodes: fc.array(
      fc.record({
        named: fc.boolean(),
        mesh: fc.nat(),
        parent: fc.nat(),
        t: fc.tuple(coordinate, coordinate, coordinate),
      }),
      { minLength: 1, maxLength: 10 },
    ),
    materials: fc.integer({ min: 0, max: 3 }),
    textured: fc.boolean(),
    animated: fc.boolean(),
  })
  .map((spec) => {
    const materials = Array.from({ length: spec.materials }, (_, at) => ({
      baseColorFactor: [0.5, 0.25, at / 4, 1] as const,
      ...(spec.textured && at === 0 ? { baseColorTexture: { texture: 0, texCoord: 0 } } : {}),
      metallicFactor: 0,
      roughnessFactor: 1,
      emissiveFactor: [0, 0, 0] as const,
      alphaMode: 'OPAQUE' as const,
      alphaCutoff: 0.5,
      doubleSided: at % 2 === 0,
      unlit: at === 1,
    }));
    const meshes = spec.meshes.map((primitives) => ({
      primitives: primitives.map((primitive) => {
        const positions = new Float32Array(primitive.vertices * 3);
        for (let at = 0; at < positions.length; at += 1) {
          positions[at] = (primitive.seed[at % 3] as number) + Math.sin(at) * 2;
        }
        const indices = new Uint32Array(primitive.triangles * 3);
        for (let at = 0; at < indices.length; at += 1) indices[at] = (at * 7) % primitive.vertices;
        const filled = (width: number) =>
          Float32Array.from({ length: primitive.vertices * width }, (_, at) =>
            Math.cos(at + primitive.unitSeed),
          );
        return {
          positions,
          indices,
          ...(primitive.normals ? { normals: filled(3) } : {}),
          ...(primitive.tangents ? { tangents: filled(4) } : {}),
          ...(primitive.uv ? { texcoords0: filled(2) } : {}),
          ...(primitive.colors ? { colors: filled(4).map(Math.abs) } : {}),
          ...(primitive.material === undefined || spec.materials === 0
            ? {}
            : { material: primitive.material % spec.materials }),
        };
      }),
    }));
    const nodes = spec.nodes.map((node, at) => ({
      ...(node.named ? { name: `part_${at}` } : {}),
      children: [] as number[],
      mesh: node.mesh % meshes.length,
      translation: node.t,
      rotation: [0, 0, 0, 1] as const,
      scale: [1, 1, 1] as const,
    }));
    // A tree in depth-first order: each node's holder comes before it, and its children in order.
    spec.nodes.forEach((node, at) => {
      if (at > 0) nodes[node.parent % at]?.children.push(at);
    });
    const order: number[] = [];
    const visit = (at: number) => {
      order.push(at);
      for (const child of nodes[at]?.children ?? []) visit(child);
    };
    visit(0);
    const renumber = new Map(order.map((old, at) => [old, at]));
    const sorted = order.map((old) => {
      const node = nodes[old] as (typeof nodes)[number];
      return { ...node, children: node.children.map((child) => renumber.get(child) as number) };
    });
    const solid: CleanSolid = {
      nodes: sorted,
      roots: [0],
      meshes,
      materials,
      textures:
        spec.textured && spec.materials > 0
          ? [{ image: picture, mimeType: 'image/png', sampler: { wrapS: 10497, wrapT: 33071 } }]
          : [],
      animations: spec.animated
        ? [
            {
              channels: [
                {
                  node: 0,
                  path: 'rotation',
                  times: Float32Array.from([0, 1.5]),
                  values: Float32Array.from([0, 0, 0, 1, 0, 1, 0, 0]),
                  interpolation: 'LINEAR',
                },
              ],
            },
          ]
        : [],
    };
    return solid;
  });

describe('the canonical writer (ADR 0075)', () => {
  it('writes only what the core reads, with the counts it was given, the same each time', () => {
    fc.assert(
      fc.property(solidArb, (solid) => {
        const bytes = writeCanonicalSolid(solid);
        const read = readSolid(bytes);
        expect(read.ok, JSON.stringify(read)).toBe(true);
        if (!read.ok) return;
        const triangles = solid.meshes.reduce(
          (sum, mesh) =>
            sum + mesh.primitives.reduce((inner, p) => inner + p.indices.length / 3, 0),
          0,
        );
        expect(read.description.counts.triangles).toBe(triangles);
        expect(read.description.counts.nodes).toBe(solid.nodes.length);
        expect(read.description.parts.length).toBe(solid.nodes.filter((node) => node.name).length);
        expect(writeCanonicalSolid(solid)).toEqual(bytes);
      }),
      { numRuns: 150 },
    );
  });
});
