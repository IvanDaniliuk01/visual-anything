import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { readBitmap } from '../images/bitmap';
import { png } from '../images/test/bitmaps';
import { boxMesh, writeGlb, writeTestSolid, type TestSolid } from '../test/solids';
import {
  DEFAULT_SOLID_CAMERA,
  SOLID_TEXTURE_CAPS,
  SOLID_CAPS,
  cornersOf,
  fitSolidCamera,
  projectSolidPoint,
  readSolid,
  solidHash,
  type SolidReading,
} from './index';

/** An arm: a base, a shoulder held by it, and an unnamed bolt held by the shoulder. */
function arm(): TestSolid {
  return {
    nodes: [
      { name: 'base', mesh: 0, children: [1] },
      { name: 'shoulder', mesh: 1, translation: [0, 0.5, 0], children: [2] },
      { mesh: 2, translation: [0, 0.2, 0] },
    ],
    meshes: [
      boxMesh([-0.2, 0, -0.2], [0.2, 0.1, 0.2]),
      boxMesh([-0.05, 0, -0.05], [0.05, 0.3, 0.05]),
      boxMesh([-0.01, 0, -0.01], [0.01, 0.02, 0.01]),
    ],
    animations: [[0, 1.5, 4.5]],
  };
}

function described(reading: SolidReading) {
  if (!reading.ok) throw new Error(reading.problems.map((each) => each.message).join(' '));
  return reading.description;
}

function refusal(reading: SolidReading): [string, string] {
  if (reading.ok) throw new Error('Read a file the form refuses.');
  const [first] = reading.problems;
  return [first?.code ?? '', first?.message ?? ''];
}

describe('readSolid', () => {
  it('describes a canonical file: bounds, counts, parts with parents and points, animations', () => {
    const reading = readSolid(writeTestSolid(arm()));
    const description = described(reading);
    expect(description.bounds).toEqual({
      min: { x: -0.2, y: 0, z: -0.2 },
      max: { x: 0.2, y: 0.8, z: 0.2 },
    });
    expect(description.counts).toEqual({ triangles: 36, vertices: 24, nodes: 3, textures: 0 });
    // The bolt is part of the shoulder, which holds it and is not named.
    expect(description.parts.map(({ name, parent }) => [name, parent])).toEqual([
      ['base', undefined],
      ['shoulder', 0],
    ]);
    expect(description.animations).toEqual([{ duration: 4.5 }]);
    if (reading.ok) {
      expect(reading.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(reading.bytes).toBeGreaterThan(0);
    }
  });

  it("places a part's point on its own geometry, nearest the middle of its bounds", () => {
    const [base, shoulder] = described(readSolid(writeTestSolid(arm()))).parts;
    // The base's corners all lie 0.2 off its middle across; the nearest vertex is one of them.
    expect(base?.point).toBeDefined();
    expect(Math.abs(base?.point?.x ?? 9)).toBe(0.2);
    // The shoulder holds its own box and the bolt, from 0.5 up to 0.82.
    expect(shoulder?.point?.y).toBeGreaterThanOrEqual(0.5);
    expect(shoulder?.point?.y).toBeLessThanOrEqual(0.82);
  });

  it('reads an empty solid, and one whose parts draw nothing of their own', () => {
    const empty = described(readSolid(writeTestSolid({ nodes: [], meshes: [] })));
    expect(empty.counts).toEqual({ triangles: 0, vertices: 0, nodes: 0, textures: 0 });
    const holder = described(
      readSolid(
        writeTestSolid({
          nodes: [{ name: 'group', children: [1] }, { mesh: 0 }],
          meshes: [boxMesh([0, 0, 0], [1, 1, 1])],
        }),
      ),
    );
    expect(holder.parts[0]?.point).toBeDefined();
  });

  it.each<[string, (json: Record<string, unknown>) => void]>([
    ['extras', (json) => (json.extras = { note: 'x' })],
    ['an address', (json) => ((json.buffers as Record<string, unknown>[])[0]!.uri = 'x.bin')],
    ['a behavior extension', (json) => (json.extensionsUsed = ['KHR_interactivity'])],
    [
      'an extension on a node',
      (json) =>
        ((json.nodes as Record<string, unknown>[])[0]!.extensions = { KHR_animation_pointer: {} }),
    ],
    ['a camera', (json) => (json.cameras = [{ type: 'perspective' }])],
    ['a skin', (json) => (json.skins = [{ joints: [0] }])],
    [
      "a node's matrix",
      (json) =>
        ((json.nodes as Record<string, unknown>[])[0]!.matrix = [
          1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
        ]),
    ],
    [
      'points',
      (json) =>
        ((
          (json.meshes as Record<string, unknown>[])[0]!.primitives as Record<string, unknown>[]
        )[0]!.mode = 0),
    ],
    [
      'morph targets',
      (json) =>
        ((
          (json.meshes as Record<string, unknown>[])[0]!.primitives as Record<string, unknown>[]
        )[0]!.targets = [{}]),
    ],
    [
      'a sparse accessor',
      (json) => ((json.accessors as Record<string, unknown>[])[0]!.sparse = { count: 1 }),
    ],
    ['a generator', (json) => ((json.asset as Record<string, unknown>).generator = 'x')],
    [
      'two nodes of one name',
      (json) => ((json.nodes as Record<string, unknown>[])[1]!.name = 'base'),
    ],
    [
      'a name cleaning would change',
      (json) => ((json.nodes as Record<string, unknown>[])[0]!.name = 'base plate'),
    ],
    [
      'a node outside the scene',
      (json) => ((json.scenes as Record<string, unknown>[])[0]!.nodes = [1]),
    ],
    [
      'a node held twice',
      (json) => ((json.nodes as Record<string, unknown>[])[0]!.children = [1, 1]),
    ],
    [
      'an accessor past its data',
      (json) => ((json.accessors as Record<string, unknown>[])[0]!.count = 1_000),
    ],
    [
      'positions whose bounds lie',
      (json) => ((json.accessors as Record<string, unknown>[])[0]!.max = [9, 9, 9]),
    ],
    [
      'an unknown attribute',
      (json) =>
        ((
          (
            (json.meshes as Record<string, unknown>[])[0]!.primitives as Record<string, unknown>[]
          )[0]!.attributes as Record<string, unknown>
        ).JOINTS_0 = 0),
    ],
  ])('refuses %s with invalid-solid', (_, edit) => {
    expect(refusal(readSolid(writeTestSolid({ ...arm(), edit })))[0]).toBe('invalid-solid');
  });

  it('refuses what is not a canonical GLB, and never throws on bytes', () => {
    const good = writeTestSolid(arm());
    expect(refusal(readSolid(new Uint8Array(0)))[0]).toBe('invalid-solid');
    const wrongMagic = good.slice();
    wrongMagic[0] = 0;
    expect(refusal(readSolid(wrongMagic))[0]).toBe('invalid-solid');
    const longer = new Uint8Array(good.length + 4);
    longer.set(good);
    expect(refusal(readSolid(longer))[0]).toBe('invalid-solid');
    expect(refusal(readSolid(writeGlb({ asset: { version: '1.0' } }, new Uint8Array(0))))[0]).toBe(
      'invalid-solid',
    );
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 512 }), fc.nat(good.length - 1), (noise, at) => {
        const broken = good.slice();
        broken.set(noise.subarray(0, Math.max(0, good.length - at)), at);
        expect(() => readSolid(broken)).not.toThrow();
        expect(() => readSolid(noise)).not.toThrow();
      }),
      { numRuns: 300 },
    );
  });

  it('counts a mesh once for every node that draws it, against the caps', () => {
    // A mesh of 600,000 vertices drawn by two nodes draws 1,200,000, past the cap of 1,000,000.
    const positions = new Array<number>(600_000 * 3).fill(0);
    for (let at = 0; at < 600_000; at += 1) positions[at * 3] = at / 600_000;
    const mesh = { positions, indices: [0, 1, 2] };
    const once = readSolid(writeTestSolid({ nodes: [{ mesh: 0 }], meshes: [mesh] }));
    expect(once.ok).toBe(true);
    const twice = writeTestSolid({ nodes: [{ mesh: 0 }, { mesh: 0 }], meshes: [mesh] });
    expect(refusal(readSolid(twice))[0]).toBe('solid-too-large');
  });

  it('refuses a file past a cap with solid-too-large', () => {
    const nodes = Array.from({ length: SOLID_CAPS.nodes + 1 }, () => ({}));
    expect(refusal(readSolid(writeTestSolid({ nodes, meshes: [] })))[0]).toBe('solid-too-large');
    const huge = writeTestSolid({
      nodes: [{ mesh: 0 }],
      meshes: [boxMesh([0, 0, 0], [200_000, 1, 1])],
    });
    expect(refusal(readSolid(huge))[0]).toBe('solid-too-large');
  });
});

/** Random solids: a tree of up to 12 nodes, some named, some with a box. */
const randomSolid: fc.Arbitrary<TestSolid> = fc
  .array(
    fc.record({
      parent: fc.nat(),
      named: fc.boolean(),
      box: fc.option(
        fc.tuple(
          fc.tuple(
            fc.integer({ min: -100, max: 100 }),
            fc.integer({ min: -100, max: 100 }),
            fc.integer({ min: -100, max: 100 }),
          ),
          fc.tuple(
            fc.integer({ min: 1, max: 50 }),
            fc.integer({ min: 1, max: 50 }),
            fc.integer({ min: 1, max: 50 }),
          ),
        ),
        { nil: undefined },
      ),
      move: fc.tuple(
        fc.integer({ min: -20, max: 20 }),
        fc.integer({ min: -20, max: 20 }),
        fc.integer({ min: -20, max: 20 }),
      ),
    }),
    { minLength: 1, maxLength: 12 },
  )
  .map((items) => {
    const meshes: TestSolid['meshes'] = [];
    const nodes = items.map((item, at) => {
      const node: TestSolid['nodes'][number] = {
        translation: [item.move[0] / 10, item.move[1] / 10, item.move[2] / 10],
      };
      if (item.named) node.name = `part_${at}`;
      if (item.box) {
        const [low, size] = item.box;
        const min: [number, number, number] = [low[0] / 100, low[1] / 100, low[2] / 100];
        meshes.push(
          boxMesh(min, [min[0] + size[0] / 100, min[1] + size[1] / 100, min[2] + size[2] / 100]),
        );
        node.mesh = meshes.length - 1;
      }
      return node;
    });
    // Each node after the first is held by an earlier one, or is a root.
    items.forEach((item, at) => {
      if (at === 0 || item.parent % 3 === 0) return;
      const holder = nodes[item.parent % at];
      if (holder) holder.children = [...(holder.children ?? []), at];
    });
    return { nodes, meshes };
  });

describe('solids, by property', () => {
  it('describe a canonical file read again the same, and hash its bytes alike', () => {
    fc.assert(
      fc.property(randomSolid, (solid) => {
        const bytes = writeTestSolid(solid);
        const once = readSolid(bytes);
        const again = readSolid(bytes.slice());
        expect(again).toEqual(once);
        expect(once.ok).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("place every part's point on a vertex of its own, within the solid's bounds", () => {
    fc.assert(
      fc.property(randomSolid, (solid) => {
        const description = described(readSolid(writeTestSolid(solid)));
        for (const part of description.parts) {
          if (!part.point) continue;
          for (const axis of ['x', 'y', 'z'] as const) {
            expect(part.point[axis]).toBeGreaterThanOrEqual(description.bounds.min[axis] - 1e-4);
            expect(part.point[axis]).toBeLessThanOrEqual(description.bounds.max[axis] + 1e-4);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it('change the hash with any changed byte', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 1, maxLength: 256 }), fc.nat(), (bytes, at) => {
        const changed = bytes.slice();
        const index = at % bytes.length;
        changed[index] = ((changed[index] as number) + 1) % 256;
        expect(solidHash(bytes.slice())).toBe(solidHash(bytes));
        expect(solidHash(changed)).not.toBe(solidHash(bytes));
      }),
    );
  });
});

describe("the camera's maths", () => {
  const bounds = fc
    .tuple(
      fc.tuple(
        fc.double({ min: -50, max: 50, noNaN: true }),
        fc.double({ min: -50, max: 50, noNaN: true }),
        fc.double({ min: -50, max: 50, noNaN: true }),
      ),
      fc.tuple(
        fc.double({ min: 0.001, max: 40, noNaN: true }),
        fc.double({ min: 0.001, max: 40, noNaN: true }),
        fc.double({ min: 0.001, max: 40, noNaN: true }),
      ),
    )
    .map(([low, size]) => ({
      min: { x: low[0], y: low[1], z: low[2] },
      max: { x: low[0] + size[0], y: low[1] + size[1], z: low[2] + size[2] },
    }));
  const camera = fc.record({
    azimuth: fc.double({ min: -180, max: 180, noNaN: true }),
    elevation: fc.double({ min: -89, max: 89, noNaN: true }),
    zoom: fc.double({ min: 0.25, max: 1, noNaN: true }),
    projection: fc.constantFrom('perspective' as const, 'orthographic' as const),
  });
  const aspect = fc.double({ min: 0.2, max: 5, noNaN: true });

  it('fits every corner of the bounds in the picture, at zoom 1 or less', () => {
    fc.assert(
      fc.property(bounds, camera, aspect, (box, view, ratio) => {
        const fitted = fitSolidCamera(box, view, ratio);
        for (const corner of cornersOf(box)) {
          const point = projectSolidPoint(fitted, corner);
          expect(point.x).toBeGreaterThanOrEqual(-1e-9);
          expect(point.x).toBeLessThanOrEqual(1 + 1e-9);
          expect(point.y).toBeGreaterThanOrEqual(-1e-9);
          expect(point.y).toBeLessThanOrEqual(1 + 1e-9);
          expect(point.depth).toBeGreaterThan(0);
        }
      }),
      { numRuns: 500 },
    );
  });

  it('draws the target in the middle, and what is above it higher in the picture', () => {
    fc.assert(
      fc.property(bounds, camera, aspect, (box, view, ratio) => {
        const fitted = fitSolidCamera(box, view, ratio);
        const middle = projectSolidPoint(fitted, fitted.target);
        expect(middle.x).toBeCloseTo(0.5, 9);
        expect(middle.y).toBeCloseTo(0.5, 9);
        const above = projectSolidPoint(fitted, [
          fitted.target[0],
          fitted.target[1] + 0.01,
          fitted.target[2],
        ]);
        expect(above.y).toBeLessThan(0.5);
      }),
      { numRuns: 300 },
    );
  });

  it("starts a solid's own camera at a three-quarter view from the front left", () => {
    expect(DEFAULT_SOLID_CAMERA).toEqual({ azimuth: 30, elevation: 20 });
    const fitted = fitSolidCamera(
      { min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } },
      DEFAULT_SOLID_CAMERA,
      1,
    );
    expect(fitted.eye[0]).toBeGreaterThan(0);
    expect(fitted.eye[1]).toBeGreaterThan(0);
    expect(fitted.eye[2]).toBeGreaterThan(0);
  });
});

describe('a solid’s textures', () => {
  it('are cleaned within a solid’s caps, wider than a stored image’s', () => {
    const wide = png({ width: 1500, height: 4 });
    expect(readBitmap(wide, 'png').ok).toBe(false);
    expect(readBitmap(wide, 'png', SOLID_TEXTURE_CAPS).ok).toBe(true);
    expect(readBitmap(png({ width: 2049, height: 4 }), 'png', SOLID_TEXTURE_CAPS).ok).toBe(false);
  });
});
