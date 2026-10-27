/**
 * The synthetic project of the beyond-boxes benchmark (`?geometry`, M8b): systems on a grid, as
 * `synthetic.ts` lays them out, with drawings with parts among them, built the same way every time.
 * Of its 10,000 elements:
 * - 2,000 have free geometry (ADR 0066): contents of the systems, spread evenly, of 20 components
 *   that each draw one of 20 distinct geometries, 4 of them at the core's caps (`geometries.ts`);
 * - 1,000 are anchored parts (ADR 0067), 50 in each of 20 drawings with parts, each drawing showing a
 *   picture of its own, 2 of them at the cap of 1,024 named parts (`partPictures.ts`); the drawing in
 *   the cell nearest the middle of the grid shows one of those two;
 * - the rest are systems and their other contents, with relations between those as the default
 *   project has them.
 * 2,000 relations attach on outlines, each starting at a shape with free geometry: 50 from the one
 * nearest the middle drawing, which `GEOMETRY_HUB` names, to the 50 shapes with free geometry nearest
 * it; one to each anchored part, from the shapes with free geometry nearest its drawing; and the rest
 * between shapes with free geometry that follow one another. Every other one is of a relation type
 * whose automatic routes are curved (ADR 0069), so 1,000 are curved automatically; with `curves`,
 * the view's `routeStyle` curves every other automatic route too.
 *
 * Smaller projects keep the same shares: a fifth with free geometry, a tenth anchored, a drawing with
 * parts for every 500 elements, from 1 to 20, and a fifth of the elements in relations on outlines.
 */
import { SYSTEMS, type ProjectSnapshot } from '@visual-anything/core';
import type {
  Component,
  Element,
  PackageFile,
  Relation,
  ShapePosition,
  ViewFile,
} from '@visual-anything/schema';
import { BENCH_GEOMETRY, benchGeometries } from './geometries';
import { BENCH_PARTS, cellsOf, partPictureId, partPicturePackage } from './partPictures';
import {
  CELL,
  CONTENT_COMPONENTS,
  RELATION_NAMES,
  SYSTEM_PADDING,
  relationsBetween,
  seeded,
} from './synthetic';

export interface GeometryOptions {
  /** How many elements, World aside. */
  elements: number;
  /** Whether the view curves the automatic routes that no appearance gives a style (`?curves`). */
  curves?: boolean;
}

/** The shares of the project, as the spec counts them at 10,000 elements. */
export const GEOMETRY_SHARES = {
  geometry: 0.2,
  anchored: 0.1,
  /** Relations that attach on outlines, for each element. */
  onOutlines: 0.2,
  /** One drawing with parts for this many elements, from 1 up to `drawings`. */
  perDrawing: 500,
  drawings: BENCH_PARTS.pictures,
  /** The relations of the shape with free geometry that the drag phase moves. */
  hub: 50,
} as const;

/** The package of the components with free geometry and the relation type that curves. */
export const GEOMETRY_PACKAGE = 'bench-geometry';
/** The relation type whose automatic routes are curved. */
export const CURVED_TYPE = `${GEOMETRY_PACKAGE}.flows`;
/** The relation type of the other relations on outlines, which inherit no route. */
const PLAIN_TYPE = 'systems.communicates-with';
/** The relation type contents nest by. */
const NESTING = 'systems.is-part-of';
/** The view's id. */
export const GEOMETRY_VIEW = 'everything';

/** The component of the shapes with free geometry drawn as the geometry at `at`. */
export function geometryComponent(at: number): string {
  return `${GEOMETRY_PACKAGE}.shape-${at}`;
}

/** The id of the shape with free geometry that has 50 relations, which the drag phase moves. */
export function geometryHub(project: ProjectSnapshot): string | undefined {
  const counts = new Map<string, number>();
  for (const relation of project.model.relations) {
    if (!relation.id.startsWith('outline-')) continue;
    counts.set(relation.from, (counts.get(relation.from) ?? 0) + 1);
  }
  let hub: string | undefined;
  let most = 0;
  for (const [element, count] of counts) {
    if (count > most) {
      most = count;
      hub = element;
    }
  }
  return hub;
}

/** The project with every view curving the automatic routes no appearance gives a style. */
export function withCurves(project: ProjectSnapshot): ProjectSnapshot {
  return {
    ...project,
    views: project.views.map((view): ViewFile => ({ ...view, routeStyle: 'curved' })),
  };
}

/** As `synthetic.ts` lays systems out by default: 25 elements to a system, 80 units apart. */
const PER_SYSTEM = 25;
const GAP = 80;

interface Placed {
  id: string;
  /** Where its top left sits on the canvas. */
  x: number;
  y: number;
}

/** The project of the beyond-boxes benchmark. */
export function syntheticGeometry(options: GeometryOptions): ProjectSnapshot {
  const total = Math.max(1, Math.round(options.elements));
  const random = seeded(5);
  const drawings = Math.max(
    1,
    Math.min(GEOMETRY_SHARES.drawings, Math.floor(total / GEOMETRY_SHARES.perDrawing)),
  );
  const anchoredIn = shares(Math.round(total * GEOMETRY_SHARES.anchored), drawings).map(
    (count, drawing) => Math.min(count, cellsOf(pictureOf(drawing, drawings)).length),
  );
  const anchored = anchoredIn.reduce((sum, each) => sum + each, 0);
  const inSystems = Math.max(2, total - drawings - anchored);
  const systems = Math.max(1, Math.ceil(inSystems / PER_SYSTEM));
  const contents = inSystems - systems;
  const geometryCount = Math.min(contents, Math.round(total * GEOMETRY_SHARES.geometry));

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
  const ordinary: string[] = [];
  const geometry: Placed[] = [];
  const drawingPlaces: (Placed & { parts: string[] })[] = [];
  let system = 0;
  let content = 0;
  let drawing = 0;
  for (let cell = 0; cell < cells; cell++) {
    const origin = originOf(cell);
    if (drawingCells.has(cell)) {
      const id = `drawing-${drawing}`;
      const picture = pictureOf(drawing, drawings);
      elements.push({
        id,
        component: 'systems.system',
        name: `Drawing ${drawing}`,
        appearance: { image: { image: partPictureId(picture), placement: 'parts' } },
      });
      positions.push({ element: id, ...origin });
      const cellIds = cellsOf(picture);
      const count = anchoredIn[drawing] ?? 0;
      const parts: string[] = [];
      for (let each = 0; each < count; each++) {
        const part = cellIds[Math.floor((each * cellIds.length) / count)] as string;
        const partId = `part-${drawing}-${each}`;
        // Half name their picture, and half find it in the drawing they sit in.
        elements.push({
          id: partId,
          component: 'systems.service',
          name: `Part ${drawing}.${each}`,
          appearance: {
            part: each % 2 === 0 ? { part, image: partPictureId(picture) } : { part },
          },
        });
        relations.push({ id: `${partId}-in`, relationType: NESTING, from: partId, to: id });
        parts.push(partId);
      }
      drawingPlaces.push({ id, ...origin, parts });
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
      const withGeometry =
        Math.floor(((content + 1) * geometryCount) / contents) >
        Math.floor((content * geometryCount) / contents);
      const picked = CONTENT_COMPONENTS[Math.floor(random() * CONTENT_COMPONENTS.length)] as string;
      const component = withGeometry
        ? geometryComponent(geometry.length % BENCH_GEOMETRY.count)
        : picked;
      elements.push({ id, component, name: `Element ${system}.${each}` });
      relations.push({ id: `${id}-in`, relationType: NESTING, from: id, to: systemId });
      positions.push({ element: id, container: systemId, ...offset });
      if (withGeometry) geometry.push({ id, x: origin.x + offset.x, y: origin.y + offset.y });
      else ordinary.push(id);
      content += 1;
    }
    system += 1;
  }

  // Between the other contents, one for each, as the default project has them.
  relations.push(...relationsBetween(ordinary, ordinary.length, random));
  relations.push(...outlineRelations(total, geometry, drawingPlaces, systemSize));

  return {
    project: {
      schemaVersion: 1,
      name: `${total} elements beyond boxes`,
      packages: ['systems', GEOMETRY_PACKAGE, partPicturePackage().id],
    },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements,
      relations,
    },
    packages: [SYSTEMS, geometryPackage(), partPicturePackage()],
    views: [
      {
        id: GEOMETRY_VIEW,
        name: 'Everything',
        perspective: { name: 'Benchmark' },
        nestingRelationTypes: [NESTING],
        positions,
        freeShapes: [],
        ...(options.curves ? { routeStyle: 'curved' as const } : {}),
      },
    ],
    scenarios: [],
    tours: [],
    comments: [],
  };
}

/** `count` shared out among `among`, the first ones taking one more where it does not divide. */
function shares(count: number, among: number): number[] {
  return Array.from(
    { length: among },
    (_, at) => Math.floor(count / among) + (at < count % among ? 1 : 0),
  );
}

/**
 * Which picture a drawing shows: the drawing in the middle cell shows the first one, at the cap on
 * parts, and the next the second, also at the cap.
 */
function pictureOf(drawing: number, drawings: number): number {
  const middle = Math.floor(drawings / 2);
  return (drawing - middle + drawings) % drawings;
}

/**
 * The cells of the grid drawings take: spread evenly, the one nearest the middle cell moved onto it,
 * so that the camera on the middle of the view shows a drawing with parts.
 */
function drawingCellsOf(
  cells: number,
  drawings: number,
  columns: number,
  rows: number,
): Set<number> {
  const spread = Array.from({ length: drawings }, (_, at) =>
    Math.floor(((at + 0.5) * cells) / drawings),
  );
  const middleCell = Math.min(cells - 1, Math.floor(rows / 2) * columns + Math.floor(columns / 2));
  const middle = Math.floor(drawings / 2);
  // Only between its neighbours, so that drawings keep their order and no two share a cell.
  const before = spread[middle - 1] ?? -1;
  const after = spread[middle + 1] ?? cells;
  if (middleCell > before && middleCell < after) spread[middle] = middleCell;
  return new Set(spread);
}

/**
 * The relations on outlines: the hub's 50, one to each anchored part, and the rest between shapes
 * with free geometry that follow one another, every other one curved by its relation type.
 */
function outlineRelations(
  total: number,
  geometry: readonly Placed[],
  drawings: readonly (Placed & { parts: string[] })[],
  systemSize: { width: number; height: number },
): Relation[] {
  if (geometry.length < 2) return [];
  const wanted = Math.round(total * GEOMETRY_SHARES.onOutlines);
  const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);
  const pairs: [string, string][] = [];
  // The hub: the shape with free geometry nearest the middle drawing, and the ones nearest it.
  const middle = drawings[Math.floor(drawings.length / 2)];
  const centre = middle
    ? { x: middle.x + systemSize.width / 2, y: middle.y + systemSize.height / 2 }
    : { x: 0, y: 0 };
  const byDistance = (from: { x: number; y: number }) =>
    [...geometry].sort((a, b) => distance(a, from) - distance(b, from) || (a.id < b.id ? -1 : 1));
  const hub = byDistance(centre)[0] as Placed;
  const hubbed = Math.min(GEOMETRY_SHARES.hub, geometry.length - 1, wanted);
  for (const other of byDistance(hub).slice(1, 1 + hubbed)) pairs.push([hub.id, other.id]);
  // One to each anchored part, from the nearest shapes with free geometry not yet used for one.
  const used = new Set<string>([hub.id]);
  for (const drawing of drawings) {
    const near = byDistance(drawing).filter((each) => !used.has(each.id));
    drawing.parts.forEach((part, at) => {
      if (pairs.length >= wanted) return;
      const from = near[at % Math.max(1, near.length)];
      if (!from) return;
      used.add(from.id);
      pairs.push([from.id, part]);
    });
  }
  // The rest: between shapes with free geometry that follow one another, the hub left out.
  for (let at = 0; at + 1 < geometry.length && pairs.length < wanted; at += 2) {
    const from = geometry[at] as Placed;
    const to = geometry[at + 1] as Placed;
    if (from.id === hub.id || to.id === hub.id) continue;
    pairs.push([from.id, to.id]);
  }
  return pairs.map(([from, to], at): Relation => {
    const name = at % 3 === 0 ? RELATION_NAMES[(at / 3) % RELATION_NAMES.length] : undefined;
    return {
      id: `outline-${at}`,
      relationType: at % 2 === 0 ? CURVED_TYPE : PLAIN_TYPE,
      from,
      to,
      ...(name ? { name } : {}),
    };
  });
}

let made: PackageFile | undefined;

/** The components with free geometry, each a Service of its own outline, and the curved type. */
export function geometryPackage(): PackageFile {
  made ??= {
    id: GEOMETRY_PACKAGE,
    name: 'Benchmark geometry',
    components: benchGeometries().map((geometry, at): Component => ({
      id: geometryComponent(at),
      name: at < BENCH_GEOMETRY.atCaps ? `Shape ${at} at the caps` : `Shape ${at}`,
      derivesFrom: 'systems.service',
      appearance: { width: BENCH_GEOMETRY.width, height: BENCH_GEOMETRY.height, geometry },
    })),
    relationTypes: [
      {
        id: CURVED_TYPE,
        name: 'flows to',
        derivesFrom: 'systems.communicates-with',
        appearance: { route: 'curved' },
      },
    ],
  };
  return made;
}
