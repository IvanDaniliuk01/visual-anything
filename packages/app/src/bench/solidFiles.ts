/**
 * The canonical files of the solids benchmark (`?solids`, M9's "Done when"), which it makes itself,
 * the same every time, with the core's writer of canonical files for tests. Twenty distinct solids,
 * four of them at the caps (`SOLID_CAPS`):
 * - 0, at the cap on named parts: 4,096 parts, each a box under a node of its own, 8,192 nodes;
 * - 1, at every cap at once: 4,096 parts in 8,192 nodes, each part a mesh of its own, 4,096 meshes,
 *   with 999,424 vertices and 991,232 triangles in all;
 * - 2 to 9, the drawings' solids: grids of 100 to 140 boxes, each a named part;
 * - 10, at the cap on triangles: one surface of 999,698 triangles;
 * - 11, at the cap on vertices: 333,333 triangles of their own, 999,999 vertices;
 * - 12, the solid of 200,000 triangles the turning phase turns: one surface of 199,712;
 * - 13 to 19, small solids of a few boxes.
 * `small` makes the same twenty with every count cut down, for the tests in jsdom.
 */
import {
  boxMesh,
  writeTestSolid,
  type TestSolidMesh,
  type TestSolidNode,
} from '../../../core/src/test/solids';
import { seeded } from './synthetic';

/** How the twenty solids are made: at their full sizes, or cut down for tests. */
export type BenchSolidScale = 'full' | 'small';

/** The counts of the benchmark's solids, as the spec counts them. */
export const BENCH_SOLIDS = {
  count: 20,
  atCaps: [0, 1, 10, 11] as readonly number[],
  /** The solids drawings with parts show, the middle drawing the first. */
  drawings: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as readonly number[],
  /** The solid of 200,000 triangles, and the one at every cap, that turning turns. */
  turned: 12,
  turnedAtCaps: 1,
} as const;

/** One of the benchmark's solids: its canonical file, and what it is. */
export interface BenchSolidFile {
  index: number;
  name: string;
  atCaps: boolean;
  bytes: Uint8Array;
}

/** A surface of `side` by `side` vertices, two triangles a square, rippled so that it shades. */
function surface(side: number, size = 1): TestSolidMesh {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row < side; row++) {
    for (let column = 0; column < side; column++) {
      const x = (column / (side - 1) - 0.5) * size;
      const z = (row / (side - 1) - 0.5) * size;
      positions.push(x, 0.05 * size * Math.sin(x * 9) * Math.cos(z * 7), z);
    }
  }
  for (let row = 0; row + 1 < side; row++) {
    for (let column = 0; column + 1 < side; column++) {
      const a = row * side + column;
      indices.push(a, a + side, a + 1, a + 1, a + side, a + side + 1);
    }
  }
  return { positions, indices };
}

/** A ribbon of `count` vertices, two along each step, `count - 2` triangles. */
function ribbon(count: number, width: number): TestSolidMesh {
  const positions: number[] = [];
  const indices: number[] = [];
  const steps = count / 2;
  for (let at = 0; at < steps; at++) {
    const x = (at / (steps - 1)) * width;
    const y = 0.1 * width * Math.sin(at / 3);
    positions.push(x, y, 0, x, y + width * 0.2, 0);
  }
  for (let at = 0; at + 1 < steps; at++) {
    const a = at * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  return { positions, indices };
}

/** `count` triangles of their own, scattered in a cube of a side of one. */
function confetti(count: number, random: () => number): TestSolidMesh {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let at = 0; at < count; at++) {
    const x = random() - 0.5;
    const y = random();
    const z = random() - 0.5;
    positions.push(x, y, z, x + 0.004, y, z, x, y + 0.004, z + 0.002);
    indices.push(at * 3, at * 3 + 1, at * 3 + 2);
  }
  return { positions, indices };
}

/**
 * `parts` named parts on a square grid, each under a node of its own that places it: one box shared
 * by them all, or a ribbon of `vertices` vertices of its own for each.
 */
function partsOnGrid(parts: number, own: { vertices: number } | undefined): Uint8Array {
  const side = Math.ceil(Math.sqrt(parts));
  const nodes: TestSolidNode[] = [];
  const meshes: TestSolidMesh[] = own ? [] : [boxMesh([0, 0, 0], [0.8, 0.8, 0.4])];
  for (let at = 0; at < parts; at++) {
    const holder = nodes.length;
    nodes.push({
      children: [holder + 1],
      translation: [(at % side) - side / 2, Math.floor(at / side), 0],
    });
    if (own) meshes.push(ribbon(own.vertices, 0.8));
    nodes.push({ name: `part-${at}`, mesh: own ? at : 0 });
  }
  return writeTestSolid({ nodes, meshes });
}

/** A grid of boxes, each a named part of its own, their heights from the solid's seed. */
function boxes(columns: number, rows: number, seed: number): Uint8Array {
  const random = seeded(seed);
  const nodes: TestSolidNode[] = [];
  const meshes: TestSolidMesh[] = [];
  for (let at = 0; at < columns * rows; at++) {
    const x = at % columns;
    const y = Math.floor(at / columns);
    const depth = 0.2 + random() * 0.8;
    meshes.push(boxMesh([x, y, 0], [x + 0.9, y + 0.9, depth]));
    nodes.push({ name: `part-${at}`, mesh: at });
  }
  return writeTestSolid({ nodes, meshes });
}

/** The benchmark's twenty solids, in their order. */
export function benchSolidFiles(scale: BenchSolidScale = 'full'): BenchSolidFile[] {
  const full = scale === 'full';
  const made: BenchSolidFile[] = [];
  const add = (name: string, bytes: Uint8Array) =>
    made.push({
      index: made.length,
      name,
      atCaps: BENCH_SOLIDS.atCaps.includes(made.length),
      bytes,
    });
  const parts = full ? 4_096 : 256;
  add('Parts at the cap', partsOnGrid(parts, undefined));
  add('Every cap at once', partsOnGrid(parts, { vertices: full ? 244 : 24 }));
  for (let at = 2; at <= 9; at++) add(`Drawing ${at}`, boxes(10, 10 + ((at - 2) % 5), at));
  add(
    'Triangles at the cap',
    writeTestSolid({ nodes: [{ name: 'surface', mesh: 0 }], meshes: [surface(full ? 708 : 40)] }),
  );
  add(
    'Vertices at the cap',
    writeTestSolid({
      nodes: [{ name: 'confetti', mesh: 0 }],
      meshes: [confetti(full ? 333_333 : 3_000, seeded(11))],
    }),
  );
  add(
    '200,000 triangles',
    writeTestSolid({ nodes: [{ name: 'surface', mesh: 0 }], meshes: [surface(full ? 317 : 30)] }),
  );
  for (let at = 13; at < BENCH_SOLIDS.count; at++) {
    add(`Small ${at}`, boxes(1 + (at % 3), 1 + (at % 4), at));
  }
  return made;
}
