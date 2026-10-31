/**
 * The synthetic project of the solids benchmark (`?solids`, M9's "Done when"): systems on a grid, as
 * `synthetic.ts` lays them out, with drawings with parts among them, built the same way every time,
 * and the canonical files of its twenty solids (`solidFiles.ts`). Of its 10,000 elements:
 * - 200 show solids, from the twenty distinct ones: 10 drawings with parts, each showing one of the
 *   drawings' solids, the drawing in the cell nearest the middle of the grid the one at the cap on
 *   named parts and the next the one at every cap; and 190 contents of the systems, spread evenly,
 *   every solid in turn, half as an icon and half as a drawing;
 * - 1,000 are anchored parts, 100 in each drawing, naming their solid;
 * - the rest are systems and their other contents, with relations between those as the default
 *   project has them, and 100 more, 10 to the parts of each drawing from the contents nearest it.
 * Smaller projects keep the same shares: a drawing for every 1,000 elements, from 1 to 10.
 */
import { SYSTEMS, readSolid, type ProjectSnapshot } from '@visual-anything/core';
import type {
  Element,
  PackageFile,
  Relation,
  ShapePosition,
  SolidDefinition,
} from '@visual-anything/schema';
import { BENCH_SOLIDS, benchSolidFiles, type BenchSolidScale } from './solidFiles';
import { CELL, CONTENT_COMPONENTS, SYSTEM_PADDING, relationsBetween, seeded } from './synthetic';

/** The shares of the project, as the spec counts them at 10,000 elements. */
export const SOLIDS_SHARES = {
  /** Shapes that show a solid, drawings included. */
  shown: 0.02,
  anchored: 0.1,
  /** One drawing with parts for this many elements, from 1 up to `drawings`. */
  perDrawing: 1_000,
  drawings: BENCH_SOLIDS.drawings.length,
  /** Relations that end on anchored parts, for each element. */
  onParts: 0.01,
} as const;

/** The package of the benchmark's solids. */
export const SOLIDS_PACKAGE = 'bench-solids';
/** The view's id. */
export const SOLIDS_VIEW = 'everything';
const NESTING = 'systems.is-part-of';
const PLAIN = 'systems.communicates-with';
const PER_SYSTEM = 25;
const GAP = 80;

/** The id of the benchmark's solid at `index`. */
export function benchSolidId(index: number): string {
  return `${SOLIDS_PACKAGE}.solid-${index}`;
}

export interface SolidsOptions {
  elements: number;
  scale?: BenchSolidScale;
}

/** The project, its solids' files by their hashes, and the drawings' ids in the grid's order. */
export interface SolidsProject {
  project: ProjectSnapshot;
  files: ReadonlyMap<string, Uint8Array>;
  definitions: readonly SolidDefinition[];
  /** The drawings with parts, the one in the middle of the grid first. */
  drawings: readonly string[];
}

/** The benchmark's solids' definitions, described from their files as the program describes them. */
export function benchSolidDefinitions(scale: BenchSolidScale = 'full'): {
  definitions: SolidDefinition[];
  files: Map<string, Uint8Array>;
} {
  const files = new Map<string, Uint8Array>();
  const definitions = benchSolidFiles(scale).map((file): SolidDefinition => {
    const read = readSolid(file.bytes);
    if (!read.ok)
      throw new Error(`${file.name}: ${read.problems.map((each) => each.message).join(' ')}`);
    files.set(read.hash, file.bytes);
    const { bounds, counts, parts, animations } = read.description;
    return {
      id: benchSolidId(file.index),
      name: file.name,
      description: `A solid the benchmark makes: ${file.name.toLowerCase()}.`,
      source: 'Made by the benchmark',
      license: 'CC0-1.0',
      hash: read.hash,
      bytes: read.bytes,
      bounds,
      counts,
      parts,
      camera: { azimuth: 30, elevation: 20 },
      ...(animations.length > 0 ? { animations } : {}),
    };
  });
  return { definitions, files };
}

/** The project of the solids benchmark. */
export function syntheticSolids(options: SolidsOptions): SolidsProject {
  const total = Math.max(1, Math.round(options.elements));
  const random = seeded(9);
  const { definitions, files } = benchSolidDefinitions(options.scale);
  const drawings = Math.max(
    1,
    Math.min(SOLIDS_SHARES.drawings, Math.floor(total / SOLIDS_SHARES.perDrawing)),
  );
  // The middle drawing shows the first of the drawings' solids, and the next the second.
  const middleDrawing = Math.floor(drawings / 2);
  const solidOf = (drawing: number) =>
    BENCH_SOLIDS.drawings[(drawing - middleDrawing + drawings) % drawings] as number;
  const anchoredIn = shares(Math.round(total * SOLIDS_SHARES.anchored), drawings).map(
    (count, drawing) => Math.min(count, definitions[solidOf(drawing)]?.parts.length ?? 0),
  );
  const anchored = anchoredIn.reduce((sum, each) => sum + each, 0);
  const inSystems = Math.max(2, total - drawings - anchored);
  const systems = Math.max(1, Math.ceil(inSystems / PER_SYSTEM));
  const contents = inSystems - systems;
  const shownContents = Math.min(contents, Math.round(total * SOLIDS_SHARES.shown) - drawings);

  const inside = PER_SYSTEM - 1;
  const innerColumns = Math.ceil(Math.sqrt(inside));
  const innerRows = Math.ceil(inside / innerColumns);
  const systemSize = {
    width: SYSTEM_PADDING.left + innerColumns * CELL.width + SYSTEM_PADDING.right,
    height: SYSTEM_PADDING.top + innerRows * CELL.height + SYSTEM_PADDING.bottom,
  };
  const cells = systems + drawings;
  const columns = Math.ceil(Math.sqrt(cells));
  const rows = Math.ceil(cells / columns);
  const drawingCells = drawingCellsOf(cells, drawings, columns, rows);
  const originOf = (cell: number) => ({
    x: (cell % columns) * (systemSize.width + GAP),
    y: Math.floor(cell / columns) * (systemSize.height + GAP),
  });

  const elements: Element[] = [];
  const relations: Relation[] = [];
  const positions: ShapePosition[] = [];
  const ordinary: { id: string; x: number; y: number }[] = [];
  const placedDrawings: { id: string; x: number; y: number; parts: string[] }[] = [];
  let system = 0;
  let content = 0;
  let shown = 0;
  let drawing = 0;
  for (let cell = 0; cell < cells; cell++) {
    const origin = originOf(cell);
    if (drawingCells.has(cell)) {
      const id = `drawing-${drawing}`;
      const index = solidOf(drawing);
      const solid = benchSolidId(index);
      elements.push({
        id,
        component: 'systems.system',
        name: `Drawing ${drawing}`,
        appearance: { solid: { solid, placement: 'parts' } },
      });
      positions.push({ element: id, ...origin });
      const names = definitions[index]?.parts.map((part) => part.name) ?? [];
      const count = anchoredIn[drawing] ?? 0;
      const parts: string[] = [];
      for (let each = 0; each < count; each++) {
        const part = names[Math.floor((each * names.length) / count)] as string;
        const partId = `part-${drawing}-${each}`;
        elements.push({
          id: partId,
          component: 'systems.service',
          name: `Part ${drawing}.${each}`,
          appearance: { part: { part, solid } },
        });
        relations.push({ id: `${partId}-in`, relationType: NESTING, from: partId, to: id });
        parts.push(partId);
      }
      placedDrawings.push({ id, ...origin, parts });
      drawing += 1;
      continue;
    }
    if (system >= systems) continue;
    const systemId = `system-${system}`;
    elements.push({ id: systemId, component: 'systems.system', name: `System ${system}` });
    positions.push({ element: systemId, ...origin, ...systemSize });
    const held = Math.min(inside, inSystems - 1 - system * PER_SYSTEM);
    for (let each = 0; each < held; each++) {
      const id = `element-${system}-${each}`;
      const offset = {
        x: SYSTEM_PADDING.left + (each % innerColumns) * CELL.width,
        y: SYSTEM_PADDING.top + Math.floor(each / innerColumns) * CELL.height,
      };
      const showsSolid =
        Math.floor(((content + 1) * shownContents) / contents) >
        Math.floor((content * shownContents) / contents);
      const component = CONTENT_COMPONENTS[
        Math.floor(random() * CONTENT_COMPONENTS.length)
      ] as string;
      elements.push({
        id,
        component,
        name: `Element ${system}.${each}`,
        ...(showsSolid
          ? {
              appearance: {
                solid: {
                  solid: benchSolidId(shown % BENCH_SOLIDS.count),
                  placement: shown % 2 === 0 ? ('icon' as const) : ('drawing' as const),
                },
              },
            }
          : {}),
      });
      if (showsSolid) shown += 1;
      relations.push({ id: `${id}-in`, relationType: NESTING, from: id, to: systemId });
      positions.push({ element: id, container: systemId, ...offset });
      if (!showsSolid) ordinary.push({ id, x: origin.x + offset.x, y: origin.y + offset.y });
      content += 1;
    }
    system += 1;
  }

  relations.push(
    ...relationsBetween(
      ordinary.map((each) => each.id),
      ordinary.length,
      random,
    ),
  );
  // To the parts of each drawing, from the ordinary contents nearest it.
  const onParts = shares(Math.round(total * SOLIDS_SHARES.onParts), placedDrawings.length);
  placedDrawings.forEach((placed, at) => {
    const near = [...ordinary]
      .sort(
        (a, b) =>
          Math.hypot(a.x - placed.x, a.y - placed.y) - Math.hypot(b.x - placed.x, b.y - placed.y) ||
          (a.id < b.id ? -1 : 1),
      )
      .slice(0, onParts[at] ?? 0);
    near.forEach((from, each) => {
      const part = placed.parts[Math.floor((each * placed.parts.length) / near.length)];
      if (part) {
        relations.push({
          id: `to-part-${at}-${each}`,
          relationType: PLAIN,
          from: from.id,
          to: part,
        });
      }
    });
  });

  const benchPackage: PackageFile = {
    id: SOLIDS_PACKAGE,
    name: 'Benchmark solids',
    components: [],
    relationTypes: [],
    solids: definitions,
  };
  // The drawing in the middle of the grid first.
  const ordered = [
    ...placedDrawings.slice(middleDrawing),
    ...placedDrawings.slice(0, middleDrawing),
  ].map((each) => each.id);
  return {
    project: {
      project: {
        schemaVersion: 1,
        name: `${total} elements with solids`,
        packages: ['systems', SOLIDS_PACKAGE],
      },
      model: {
        world: { id: 'world', component: 'essence', name: 'World' },
        elements,
        relations,
      },
      packages: [SYSTEMS, benchPackage],
      views: [
        {
          id: SOLIDS_VIEW,
          name: 'Everything',
          perspective: { name: 'Benchmark' },
          nestingRelationTypes: [NESTING],
          positions,
          freeShapes: [],
        },
      ],
      scenarios: [],
      tours: [],
      comments: [],
    },
    files,
    definitions,
    drawings: ordered,
  };
}

/** `count` shared out among `among`, the first ones taking one more where it does not divide. */
function shares(count: number, among: number): number[] {
  return Array.from(
    { length: among },
    (_, at) => Math.floor(count / among) + (at < count % among ? 1 : 0),
  );
}

/** The cells drawings take: spread evenly, the middle one moved onto the grid's middle cell. */
function drawingCellsOf(cells: number, drawings: number, columns: number, rows: number) {
  const spread = Array.from({ length: drawings }, (_, at) =>
    Math.floor(((at + 0.5) * cells) / drawings),
  );
  const middleCell = Math.min(cells - 1, Math.floor(rows / 2) * columns + Math.floor(columns / 2));
  const middle = Math.floor(drawings / 2);
  const before = spread[middle - 1] ?? -1;
  const after = spread[middle + 1] ?? cells;
  if (middleCell > before && middleCell < after) spread[middle] = middleCell;
  return new Set(spread);
}
