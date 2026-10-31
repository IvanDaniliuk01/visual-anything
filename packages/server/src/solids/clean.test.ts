/**
 * The cleaner (ADR 0075): what it keeps, drops and changes, written as the canonical form the core's
 * reader takes, the same bytes for the same file. It runs here in the test's own thread; the program
 * runs it in a worker thread, which `cleaner.test.ts` checks.
 */
import { readSolid, solidHash } from '@visual-anything/core';
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cleanSolid, type CleanedSolid } from './clean';
import { box, grid, inputGlb, inputGltf, png, type InputMesh, type InputSolid } from './test/gltf';

function cleaned(result: CleanedSolid): Extract<CleanedSolid, { ok: true }> {
  if (!result.ok) throw new Error(`Not cleaned: ${JSON.stringify(result.problems)}`);
  return result;
}

const ARM: InputSolid = {
  nodes: [
    { name: 'base', children: [1], mesh: 0 },
    { name: 'shoulder', translation: [0, 1, 0], mesh: 1, children: [2] },
    { name: 'elbow', translation: [0, 1, 0], mesh: 1 },
  ],
  meshes: [box([-0.5, 0, -0.5], [0.5, 0.2, 0.5]), box([-0.1, 0, -0.1], [0.1, 1, 0.1])],
};

describe('cleaning a solid (ADR 0075)', () => {
  it('writes a canonical file the core reads, with its description, and says what it dropped', async () => {
    const result = cleaned(await cleanSolid(inputGlb(ARM)));
    const read = readSolid(result.bytes);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.description).toEqual(result.description);
    expect(result.hash).toBe(solidHash(result.bytes));
    expect(result.description.parts.map((part) => [part.name, part.parent])).toEqual([
      ['base', undefined],
      ['shoulder', 0],
      ['elbow', 1],
    ]);
    expect(result.description.bounds).toEqual({
      min: { x: -0.5, y: 0, z: -0.5 },
      max: { x: 0.5, y: 3, z: 0.5 },
    });
    expect(result.description.counts).toEqual({
      triangles: 24,
      vertices: 16,
      nodes: 3,
      textures: 0,
    });
    expect(result.report).toContain('The name of the program that wrote it was taken out.');
  });

  it('gives the same bytes for the same file, and for its .gltf with the data inside', async () => {
    const first = cleaned(await cleanSolid(inputGlb(ARM)));
    const again = cleaned(await cleanSolid(inputGlb(ARM)));
    const gltf = cleaned(await cleanSolid(inputGltf(ARM)));
    expect(again.bytes).toEqual(first.bytes);
    expect(gltf.bytes).toEqual(first.bytes);
  });

  it('scales from the units chosen to meters, and turns +Z up into +Y up', async () => {
    const solid: InputSolid = {
      nodes: [{ name: 'part', mesh: 0 }],
      meshes: [box([0, 0, 0], [100, 200, 300])],
    };
    const millimetres = cleaned(await cleanSolid(inputGlb(solid), { units: 'mm' }));
    expect(millimetres.description.bounds.max).toEqual({ x: 0.1, y: 0.2, z: 0.3 });
    expect(millimetres.report).toContain('It was scaled from millimetres to meters.');
    const zUp = cleaned(await cleanSolid(inputGlb(solid), { units: 'mm', up: 'z' }));
    // (x, y, z) becomes (x, z, −y).
    expect(zUp.description.bounds).toEqual({
      min: { x: 0, y: 0, z: -0.2 },
      max: { x: 0.1, y: 0.3, z: 0 },
    });
    expect(zUp.report).toContain('It was turned so that +Y is up, where +Z was.');
    const inches = cleaned(await cleanSolid(inputGlb(solid), { units: 'in' }));
    expect(inches.description.bounds.max.x).toBe(2.54);
  });

  it('names nodes by the rule: kept when valid and first, otherwise made valid and unique', async () => {
    const names = [
      'arm',
      'arm',
      '3rd link',
      'gripper/jaw',
      'x'.repeat(70),
      'ok.name-1',
      '',
      'Ünter',
    ];
    const solid: InputSolid = {
      nodes: names.map((name, at) => ({
        ...(name === '' ? {} : { name }),
        mesh: 0,
        translation: [at, 0, 0],
      })),
      meshes: [box()],
    };
    const result = cleaned(await cleanSolid(inputGlb(solid)));
    expect(result.description.parts.map((part) => part.name)).toEqual([
      'arm',
      'arm-2',
      '_3rd_link',
      'gripper_jaw',
      'x'.repeat(64),
      'ok.name-1',
      '_nter',
    ]);
    expect(result.report).toContain('The node "arm" is named "arm-2".');
    expect(result.report).toContain('The node "3rd link" is named "_3rd_link".');
    expect(result.report).toContain('The node "Ünter" is named "_nter".');
  });

  it('drops nodes that draw nothing, and keeps those that hold a node that does', async () => {
    const solid: InputSolid = {
      nodes: [
        { name: 'holder', children: [1, 2] },
        { name: 'drawn', mesh: 0 },
        { name: 'empty', children: [3] },
        { name: 'empty-too' },
      ],
      meshes: [box()],
    };
    const result = cleaned(await cleanSolid(inputGlb(solid)));
    expect(result.description.parts.map((part) => part.name)).toEqual(['holder', 'drawn']);
    expect(result.report).toContain('2 nodes that draw nothing');
  });

  it('makes strips and fans lists of triangles, and drops points and lines', async () => {
    const square = [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0];
    const solid: InputSolid = {
      nodes: [{ name: 'shapes', mesh: 0 }],
      meshes: [
        [
          { positions: square, indices: [0, 1, 2, 3], mode: 5 },
          { positions: square, indices: [0, 1, 3, 2], mode: 6 },
          { positions: square, mode: 0 },
          { positions: square, indices: [0, 1, 1, 2], mode: 1 },
        ],
      ],
    };
    const result = cleaned(await cleanSolid(inputGlb(solid)));
    expect(result.description.counts.triangles).toBe(4);
    expect(result.report).toContain(
      '2 primitives of triangle strips or fans, made lists of triangles',
    );
    expect(result.report).toContain('2 primitives of points or lines');
  });

  it('keeps PNG textures rebuilt without their metadata, and lets go of those past the caps', async () => {
    const material = (index: number) => ({ pbrMetallicRoughness: { baseColorTexture: { index } } });
    const solid: InputSolid = {
      nodes: [
        { name: 'a', mesh: 0 },
        { name: 'b', mesh: 1 },
      ],
      meshes: [
        { ...box(), texcoords: new Array(16).fill(0.5), material: 0 },
        { ...box([2, 0, 0], [3, 1, 1]), texcoords: new Array(16).fill(0.5), material: 1 },
      ],
      materials: [material(0), material(1)],
      images: [
        { bytes: png(4, 4), mimeType: 'image/png' },
        { bytes: png(4096, 1, ''), mimeType: 'image/png' },
      ],
    };
    const result = cleaned(await cleanSolid(inputGlb(solid)));
    expect(result.description.counts.textures).toBe(1);
    expect(result.report).toContain('1 texture past its caps');
    expect(result.report).toContain(
      'Its textures were rebuilt without their text, positions, profiles and times.',
    );
    // The text chunk is gone from the stored file.
    expect(Buffer.from(result.bytes).includes('made in a test')).toBe(false);
  });

  it('keeps animations that move nodes, moved as the units and the up axis say', async () => {
    const solid: InputSolid = {
      nodes: [{ name: 'arm', mesh: 0 }],
      meshes: [box()],
      animations: [
        [
          { node: 0, path: 'translation', times: [0, 2.5], values: [0, 0, 0, 0, 0, 1000] },
          { node: 0, path: 'weights', times: [0, 1], values: [0, 0, 0, 1, 1, 1] },
        ],
      ],
    };
    const result = cleaned(await cleanSolid(inputGlb(solid), { units: 'mm' }));
    expect(result.description.animations).toEqual([{ duration: 2.5 }]);
    expect(result.report).toContain('1 animation channel that moves nothing a solid keeps');
  });

  it('refuses a solid past the cap on triangles, and simplifies it to fit when asked', async () => {
    const heavy: InputSolid = { nodes: [{ name: 'terrain', mesh: 0 }], meshes: [grid(725)] };
    const bytes = inputGlb(heavy);
    const refused = await cleanSolid(bytes);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.problems[0]).toEqual({
        code: 'solid-too-large',
        message:
          'It draws 1,051,250 triangles, past the 1,000,000 a solid holds: simplify it to fit.',
      });
    }
    const simplified = cleaned(await cleanSolid(bytes, { simplify: true }));
    expect(simplified.description.counts.triangles).toBeLessThanOrEqual(1_000_000);
    expect(simplified.description.counts.triangles).toBeGreaterThan(500_000);
    expect(
      simplified.report.some((line) => line.startsWith('It was simplified from 1,051,250 to ')),
    ).toBe(true);
  }, 60_000);

  it('decodes a file compressed with meshopt into what its uncompressed file gives', async () => {
    const { WebIO } = await import('@gltf-transform/core');
    const { EXTMeshoptCompression } = await import('@gltf-transform/extensions');
    const { MeshoptEncoder } = await import('meshoptimizer/encoder');
    await MeshoptEncoder.ready;
    const plain = cleaned(await cleanSolid(inputGlb(ARM)));
    // The arm, written again by glTF Transform with its buffer views compressed.
    const io = new WebIO().registerExtensions([EXTMeshoptCompression]).registerDependencies({
      'meshopt.encoder': MeshoptEncoder,
    });
    const document = await io.readBinary(inputGlb(ARM));
    document
      .createExtension(EXTMeshoptCompression)
      .setRequired(true)
      .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
    const compressed = await io.writeBinary(document);
    expect(new TextDecoder().decode(compressed.subarray(0, 2000))).toContain(
      'EXT_meshopt_compression',
    );
    const decoded = cleaned(await cleanSolid(compressed));
    expect(decoded.description).toEqual(plain.description);
  });

  it('cleans what it wrote into the same bytes, for any small solid', async () => {
    const meshArb: fc.Arbitrary<InputMesh> = fc
      .tuple(
        fc.array(fc.float({ min: -10, max: 10, noNaN: true }), { minLength: 9, maxLength: 30 }),
        fc.integer({ min: 0, max: 5 }),
      )
      .map(([values, extra]) => {
        const count = Math.floor(values.length / 3);
        const positions = values.slice(0, count * 3);
        // A box beside every mesh keeps its bounds over a micrometre.
        const solid = box([extra, extra, extra], [extra + 1, extra + 1, extra + 1]);
        const indices = Array.from({ length: count - (count % 3) }, (_, at) => at);
        return {
          positions: [...positions, ...(solid.positions as number[])],
          indices: [...indices, ...(solid.indices as number[]).map((at) => at + count)],
        };
      });
    const solidArb = fc
      .tuple(
        fc.array(meshArb, { minLength: 1, maxLength: 3 }),
        fc.array(
          fc.record({
            name: fc.option(fc.string({ maxLength: 12 }), { nil: undefined }),
            mesh: fc.nat(),
            parent: fc.nat(),
            t: fc.tuple(
              fc.float({ min: -5, max: 5, noNaN: true }),
              fc.float({ min: -5, max: 5, noNaN: true }),
              fc.float({ min: -5, max: 5, noNaN: true }),
            ),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        fc.constantFrom<'m' | 'cm' | 'mm' | 'in'>('m', 'cm', 'mm', 'in'),
        fc.constantFrom<'y' | 'z'>('y', 'z'),
      )
      .map(([meshes, specs, units, up]) => {
        const nodes = specs.map((spec) => ({
          ...(spec.name === undefined ? {} : { name: spec.name }),
          mesh: spec.mesh % meshes.length,
          translation: spec.t,
          children: [] as number[],
        }));
        specs.forEach((spec, at) => {
          if (at === 0) return;
          (nodes[spec.parent % at] as { children: number[] }).children.push(at);
        });
        return { solid: { nodes, roots: [0], meshes }, units, up };
      });
    await fc.assert(
      fc.asyncProperty(solidArb, async ({ solid, units, up }) => {
        const first = cleaned(await cleanSolid(inputGlb(solid), { units, up }));
        expect(readSolid(first.bytes).ok).toBe(true);
        const again = cleaned(await cleanSolid(first.bytes));
        expect(Buffer.from(again.bytes).equals(Buffer.from(first.bytes))).toBe(true);
      }),
      { numRuns: 40 },
    );
  }, 60_000);
});
