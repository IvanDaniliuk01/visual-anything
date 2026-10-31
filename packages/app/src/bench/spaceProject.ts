/**
 * The synthetic project of the space benchmark (`?space`, M10's "Done when"): systems on a grid, as
 * `synthetic.ts` lays them out on the canvas, built the same way every time, with the canonical files
 * of its twenty solids (`spaceSolidFiles`). Of its 10,000 elements:
 * - 200 show solids and are posed in World, on a grid 12 m apart, from the twenty distinct solids, two
 *   of them at the caps: 20 holders, drawings with parts, each with 100 anchored parts, 2,000 in all,
 *   the one nearest the middle of the space showing the solid at every cap; and 180 contents of the
 *   systems, spread evenly, half as an icon and half as a drawing, two showing the solid at the cap on
 *   triangles, three the one of 200,000, 120 the four surfaces of 7,000 to 28,000 triangles and the
 *   rest the small ones, so that the space draws about 5.6 million triangles at rest;
 * - 2,000 are anchored parts, 100 in each holder;
 * - the rest are systems and their other contents, with relations between those as the default
 *   project has them, and 20 more that a scenario step plays: 10 between posed contents and 10 from
 *   posed contents to anchored parts.
 * Smaller projects keep the same shares: a holder for every 500 elements, from 1 to 20.
 */
import { SYSTEMS, readSolid, type ProjectSnapshot } from '@visual-anything/core';
import type {
  Element,
  PackageFile,
  Relation,
  ShapePosition,
  SolidDefinition,
} from '@visual-anything/schema';
import { SPACE_SOLIDS, spaceSolidFiles, type BenchSolidScale } from './solidFiles';
import { CELL, CONTENT_COMPONENTS, SYSTEM_PADDING, relationsBetween, seeded } from './synthetic';

/** The shares of the project, as the spec counts them at 10,000 elements. */
export const SPACE_SHARES = {
  /** Posed elements that show a solid, the holders included. */
  posed: 0.02,
  anchored: 0.2,
  /** One holder of anchored parts for this many elements, from 1 up to `holders`. */
  perHolder: 500,
  holders: 20,
  /** The relations a scenario step plays, drawn in space. */
  step: 20,
} as const;

/** The package of the benchmark's solids. */
export const SPACE_PACKAGE = 'bench-space';
/** The view's id. */
export const SPACE_VIEW = 'everything';
/** How far apart posed elements stand, in meters. */
export const SPACE_SPACING = 12;
const NESTING = 'systems.is-part-of';
const PLAIN = 'systems.communicates-with';
const PER_SYSTEM = 25;
const GAP = 80;

/** The id of the space benchmark's solid at `index`. */
export function spaceSolidId(index: number): string {
  return `${SPACE_PACKAGE}.solid-${index}`;
}

/** The solids the posed contents show, in turn, before they are spread over the systems. */
function contentSolids(count: number): number[] {
  // As the spec counts them at 180 posed contents; fewer take the same shares.
  const plan: [number, number][] = [
    [1, 2],
    [10, 3],
    [11, 30],
    [12, 30],
    [13, 30],
    [14, 30],
    [15, 11],
    [16, 11],
    [17, 11],
    [18, 11],
    [19, 11],
  ];
  const whole = plan.reduce((sum, [, times]) => sum + times, 0);
  const solids: number[] = [];
  for (const [solid, times] of plan) {
    const share = Math.max(1, Math.round((times * count) / whole));
    for (let each = 0; each < share; each++) solids.push(solid);
  }
  // Interleaved, so that a smaller project still shows every kind, and cut to the count.
  const spread: number[] = [];
  for (let at = 0; spread.length < count && at < solids.length * 2; at++) {
    const index = (at * 7) % solids.length;
    spread.push(solids[index] as number);
  }
  while (spread.length < count) spread.push(19);
  return spread.slice(0, count);
}

export interface SpaceOptions {
  elements: number;
  scale?: BenchSolidScale;
}

/** The project, its solids' files by their hashes, and what the phases go to. */
export interface SpaceProject {
  project: ProjectSnapshot;
  files: ReadonlyMap<string, Uint8Array>;
  definitions: readonly SolidDefinition[];
  /** The holders of anchored parts, the one nearest the middle of the space first. */
  holders: readonly string[];
  /** The posed elements that show a solid, holders included, in the order they are posed. */
  posed: readonly string[];
  /** The relations the scenario step plays. */
  step: readonly string[];
  /** Triangles every posed solid draws together, at rest. */
  triangles: number;
}

/** The benchmark's solids' definitions, described from their files as the program describes them. */
export function spaceSolidDefinitions(scale: BenchSolidScale = 'full'): {
  definitions: SolidDefinition[];
  files: Map<string, Uint8Array>;
} {
  const files = new Map<string, Uint8Array>();
  const definitions = spaceSolidFiles(scale).map((file): SolidDefinition => {
    const read = readSolid(file.bytes);
    if (!read.ok)
      throw new Error(`${file.name}: ${read.problems.map((each) => each.message).join(' ')}`);
    files.set(read.hash, file.bytes);
    const { bounds, counts, parts, animations } = read.description;
    return {
      id: spaceSolidId(file.index),
      name: file.name,
      description: `A solid the space benchmark makes: ${file.name.toLowerCase()}.`,
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

/** The project of the space benchmark. */
export function syntheticSpace(options: SpaceOptions): SpaceProject {
  const total = Math.max(1, Math.round(options.elements));
  const random = seeded(19);
  const { definitions, files } = spaceSolidDefinitions(options.scale);
  const holders = Math.max(
    1,
    Math.min(SPACE_SHARES.holders, Math.floor(total / SPACE_SHARES.perHolder)),
  );
  const posedCount = Math.max(holders, Math.round(total * SPACE_SHARES.posed));
  // The holder nearest the middle shows the solid at every cap; the others the holders' solids.
  const middleHolder = Math.floor(holders / 2);
  const solidOfHolder = (holder: number) =>
    holder === middleHolder
      ? 0
      : (SPACE_SOLIDS.holders[1 + (holder % (SPACE_SOLIDS.holders.length - 1))] as number);
  const anchoredIn = shares(Math.round(total * SPACE_SHARES.anchored), holders).map(
    (count, holder) => Math.min(count, definitions[solidOfHolder(holder)]?.parts.length ?? 0),
  );
  const anchored = anchoredIn.reduce((sum, each) => sum + each, 0);
  const inSystems = Math.max(2, total - holders - anchored);
  const systems = Math.max(1, Math.ceil(inSystems / PER_SYSTEM));
  const contents = inSystems - systems;
  const posedContents = Math.min(contents, posedCount - holders);
  const shownSolids = contentSolids(posedContents);

  const inside = PER_SYSTEM - 1;
  const innerColumns = Math.ceil(Math.sqrt(inside));
  const innerRows = Math.ceil(inside / innerColumns);
  const systemSize = {
    width: SYSTEM_PADDING.left + innerColumns * CELL.width + SYSTEM_PADDING.right,
    height: SYSTEM_PADDING.top + innerRows * CELL.height + SYSTEM_PADDING.bottom,
  };
  const cells = systems + holders;
  const columns = Math.ceil(Math.sqrt(cells));
  const holderCells = new Set(
    Array.from({ length: holders }, (_, at) => Math.floor(((at + 0.5) * cells) / holders)),
  );
  const originOf = (cell: number) => ({
    x: (cell % columns) * (systemSize.width + GAP),
    y: Math.floor(cell / columns) * (systemSize.height + GAP),
  });

  // Where posed elements stand in World: a grid on the ground, the holders spread evenly over it,
  // the middle one nearest its middle.
  const spaceColumns = Math.ceil(Math.sqrt(posedCount));
  const spaceRows = Math.ceil(posedCount / spaceColumns);
  const placeOf = (slot: number) => ({
    x: ((slot % spaceColumns) - (spaceColumns - 1) / 2) * SPACE_SPACING,
    y: 0,
    z: (Math.floor(slot / spaceColumns) - (spaceRows - 1) / 2) * SPACE_SPACING,
  });
  const middleSlot = Math.floor(spaceRows / 2) * spaceColumns + Math.floor(spaceColumns / 2);
  const holderSlots = Array.from({ length: holders }, (_, at) =>
    Math.min(posedCount - 1, Math.floor(((at + 0.5) * posedCount) / holders)),
  );
  holderSlots[middleHolder] = Math.min(posedCount - 1, middleSlot);
  const takenSlots = new Set(holderSlots);
  let nextSlot = 0;
  const freeSlot = () => {
    while (takenSlots.has(nextSlot)) nextSlot += 1;
    takenSlots.add(nextSlot);
    return nextSlot;
  };

  const elements: Element[] = [];
  const relations: Relation[] = [];
  const positions: ShapePosition[] = [];
  const ordinary: string[] = [];
  const posedContentIds: string[] = [];
  const holderIds: string[] = [];
  const partsOf: string[][] = [];
  const posedOrder: string[] = [];
  let system = 0;
  let content = 0;
  let shown = 0;
  let holder = 0;
  for (let cell = 0; cell < cells; cell++) {
    const origin = originOf(cell);
    if (holderCells.has(cell) && holder < holders) {
      const id = `holder-${holder}`;
      const index = solidOfHolder(holder);
      const solid = spaceSolidId(index);
      elements.push({
        id,
        component: 'systems.system',
        name: `Holder ${holder}`,
        appearance: { solid: { solid, placement: 'parts' } },
        pose: { at: placeOf(holderSlots[holder] as number) },
      });
      positions.push({ element: id, ...origin });
      const names = definitions[index]?.parts.map((part) => part.name) ?? [];
      const count = anchoredIn[holder] ?? 0;
      const parts: string[] = [];
      for (let each = 0; each < count; each++) {
        const part = names[Math.floor((each * names.length) / count)] as string;
        const partId = `part-${holder}-${each}`;
        elements.push({
          id: partId,
          component: 'systems.service',
          name: `Part ${holder}.${each}`,
          appearance: { part: { part, solid } },
        });
        relations.push({ id: `${partId}-in`, relationType: NESTING, from: partId, to: id });
        parts.push(partId);
      }
      holderIds.push(id);
      partsOf.push(parts);
      posedOrder.push(id);
      holder += 1;
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
      const posed =
        Math.floor(((content + 1) * posedContents) / contents) >
        Math.floor((content * posedContents) / contents);
      const component = CONTENT_COMPONENTS[
        Math.floor(random() * CONTENT_COMPONENTS.length)
      ] as string;
      elements.push({
        id,
        component,
        name: `Element ${system}.${each}`,
        ...(posed
          ? {
              appearance: {
                solid: {
                  solid: spaceSolidId(shownSolids[shown] ?? 19),
                  placement: shown % 2 === 0 ? ('icon' as const) : ('drawing' as const),
                },
              },
              pose: { at: placeOf(freeSlot()) },
            }
          : {}),
      });
      if (posed) {
        shown += 1;
        posedContentIds.push(id);
        posedOrder.push(id);
      } else ordinary.push(id);
      relations.push({ id: `${id}-in`, relationType: NESTING, from: id, to: systemId });
      positions.push({ element: id, container: systemId, ...offset });
      content += 1;
    }
    system += 1;
  }

  relations.push(...relationsBetween(ordinary, ordinary.length, random));
  // The relations a scenario step plays: between posed contents, then to anchored parts.
  const step: string[] = [];
  const half = Math.ceil(SPACE_SHARES.step / 2);
  for (let each = 0; each < SPACE_SHARES.step && posedContentIds.length > 1; each++) {
    const from = posedContentIds[(each * 7) % posedContentIds.length] as string;
    const parts = partsOf[each % Math.max(1, partsOf.length)] ?? [];
    const to =
      each < half || parts.length === 0
        ? (posedContentIds[(each * 7 + 3) % posedContentIds.length] as string)
        : (parts[(each * 13) % parts.length] as string);
    if (to === from) continue;
    const id = `step-${each}`;
    relations.push({ id, relationType: PLAIN, from, to });
    step.push(id);
  }

  const spacePackage: PackageFile = {
    id: SPACE_PACKAGE,
    name: 'Benchmark space',
    components: [],
    relationTypes: [],
    solids: definitions,
  };
  const trianglesOf = (index: number) => definitions[index]?.counts.triangles ?? 0;
  const triangles =
    holderIds.reduce((sum, _, at) => sum + trianglesOf(solidOfHolder(at)), 0) +
    shownSolids.reduce((sum, index) => sum + trianglesOf(index), 0);
  return {
    project: {
      project: {
        schemaVersion: 1,
        name: `${total} elements in physical space`,
        packages: ['systems', SPACE_PACKAGE],
      },
      model: {
        world: { id: 'world', component: 'essence', name: 'World' },
        elements,
        relations,
      },
      packages: [SYSTEMS, spacePackage],
      views: [
        {
          id: SPACE_VIEW,
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
    holders: [
      ...holderIds.slice(middleHolder, middleHolder + 1),
      ...holderIds.filter((_, at) => at !== middleHolder),
    ],
    posed: posedOrder,
    step,
    triangles,
  };
}

/** `count` shared out among `among`, the first ones taking one more where it does not divide. */
function shares(count: number, among: number): number[] {
  return Array.from(
    { length: among },
    (_, at) => Math.floor(count / among) + (at < count % among ? 1 : 0),
  );
}
