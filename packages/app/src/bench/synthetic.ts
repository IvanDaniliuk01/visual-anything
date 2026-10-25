/**
 * A synthetic project for measuring the canvas: thousands of elements in systems laid out on a grid,
 * with relations between them, built the same way every time.
 *
 * By default no two shapes overlap but a container and its contents. The other ways to lay it out
 * make shapes overlap, to measure how the canvas draws them in order:
 * - `stairs`: in every system, contents in staircases of four, each overlapping the one before; every
 *   tenth system has its last content directly in World over its middle.
 * - `grid`: Services directly in World, side by side and touching, a hundred to a row.
 * - `cascade`: four fifths of the elements in systems, and the rest Services directly in World below
 *   them, in one cascade where each overlaps the ones before it.
 */
import { SYSTEMS, type ProjectSnapshot } from '@visual-anything/core';
import type { Element, Relation, Routes, ShapePosition } from '@visual-anything/schema';

/** How the synthetic shapes overlap. */
export type Overlap = 'none' | 'stairs' | 'grid' | 'cascade';

export const OVERLAPS: readonly Overlap[] = ['none', 'stairs', 'grid', 'cascade'];

export interface SyntheticOptions {
  /** How many elements, World aside; at least one system holds them, except in a grid. */
  elements: number;
  /** How many elements each system holds, the system included. */
  perSystem?: number;
  /** How many relations each element starts, on average. */
  relationsPerElement?: number;
  /** How the shapes overlap; by default, only through containment. */
  overlap?: Overlap;
  /**
   * How many relations the view routes by hand (ADR 0039), the first ones: a third curved, a third
   * straight from a place on the top of their start, and a third orthogonal through a bend point.
   */
  routes?: number;
}

const COMPONENTS = [
  'systems.service',
  'systems.database',
  'systems.ai-agent',
  'systems.chat-channel',
];
const RELATION_TYPES = ['systems.communicates-with', 'systems.reads-from', 'systems.writes-to'];
/** What every third relation is called, so that relation labels are drawn too. */
const RELATION_NAMES = ['HTTPS', 'gRPC', 'events', 'SQL', 'webhook'];
const CELL = { width: 200, height: 110 };
const SYSTEM_PADDING = { left: 24, top: 56, right: 24, bottom: 24 };
/** How far each shape of a staircase or of the cascade sits from the one before it. */
const STAIR = { x: 40, y: 16 };
const CASCADE = { x: 24, y: 12 };
/** The largest a content is, which a staircase leaves room for. */
const CONTENT = { width: 180, height: 80 };
const GRID = { columns: 100, width: 100, height: 50 };

/** A project with one view that shows `elements` elements, every one with a stored position. */
export function syntheticProject(options: SyntheticOptions): ProjectSnapshot {
  const overlap = options.overlap ?? 'none';
  const random = seeded(1);
  const elements: Element[] = [];
  const relations: Relation[] = [];
  const positions: ShapePosition[] = [];
  const services: string[] = [];

  if (overlap === 'grid') {
    for (let each = 0; each < options.elements; each++) {
      const id = `service-${each}`;
      elements.push({ id, component: 'systems.service', name: `Service ${each}` });
      positions.push({
        element: id,
        x: (each % GRID.columns) * GRID.width,
        y: Math.floor(each / GRID.columns) * GRID.height,
        width: GRID.width,
        height: GRID.height,
      });
      services.push(id);
    }
  } else {
    const inSystems = overlap === 'cascade' ? Math.ceil(options.elements * 0.8) : options.elements;
    const bottom = addSystems(
      inSystems,
      Math.max(2, options.perSystem ?? 25),
      overlap === 'stairs',
      random,
      { elements, relations, positions, services },
    );
    if (overlap === 'cascade') {
      // From the corner of a tile, so that its first shapes share one.
      const top = Math.ceil((bottom + 200) / 1024) * 1024;
      for (let each = 0; elements.length < options.elements; each++) {
        const id = `cascade-${each}`;
        elements.push({ id, component: 'systems.service', name: `Cascade ${each}` });
        positions.push({ element: id, x: each * CASCADE.x, y: top + each * CASCADE.y });
        services.push(id);
      }
    }
  }

  const wanted = Math.round(services.length * (options.relationsPerElement ?? 1));
  for (let each = 0; each < wanted; each++) {
    const index = Math.floor(random() * services.length);
    const from = services[index] as string;
    // Mostly to a near element, sometimes far away, as real systems are.
    const near = random() < 0.8;
    const to = near
      ? (services[
          Math.min(services.length - 1, Math.max(0, index + 1 + Math.floor(random() * 6)))
        ] as string)
      : (services[Math.floor(random() * services.length)] as string);
    if (from === to) continue;
    const relationType = RELATION_TYPES[Math.floor(random() * RELATION_TYPES.length)] as string;
    const name = each % 3 === 0 ? RELATION_NAMES[(each / 3) % RELATION_NAMES.length] : undefined;
    relations.push({ id: `relation-${each}`, relationType, from, to, ...(name ? { name } : {}) });
  }

  const routes = handRoutes(options.routes ?? 0, relations, positions);
  return {
    project: { schemaVersion: 1, name: `${options.elements} elements`, packages: ['systems'] },
    model: { world: { id: 'world', component: 'essence', name: 'World' }, elements, relations },
    packages: [SYSTEMS],
    views: [
      {
        id: 'everything',
        name: 'Everything',
        perspective: { name: 'Benchmark' },
        nestingRelationTypes: ['systems.is-part-of'],
        positions,
        freeShapes: [],
        ...(routes ? { routes } : {}),
      },
    ],
    scenarios: [],
  };
}

/**
 * Routes by hand for the first `count` relations: every third curved, every third straight from the
 * top of its start, and every third orthogonal through a bend point below the middle between its
 * ends, relative to the canvas.
 */
function handRoutes(
  count: number,
  relations: readonly Relation[],
  positions: readonly ShapePosition[],
): Routes | undefined {
  if (count <= 0) return undefined;
  const places = new Map<string, ShapePosition>();
  for (const position of positions)
    if (!places.has(position.element)) places.set(position.element, position);
  const placeOf = (element: string): { x: number; y: number } => {
    const position = places.get(element);
    if (!position) return { x: 0, y: 0 };
    const origin = position.container === undefined ? { x: 0, y: 0 } : placeOf(position.container);
    return { x: origin.x + position.x, y: origin.y + position.y };
  };
  const routes: Routes = {};
  let made = 0;
  for (const relation of relations) {
    if (made >= count) break;
    if (relation.relationType === 'systems.is-part-of') continue;
    const kind = made % 3;
    if (kind === 0) routes[relation.id] = { style: 'curved' };
    else if (kind === 1) {
      routes[relation.id] = { from: { kind: 'border', side: 'top', at: 0.25 }, style: 'straight' };
    } else {
      const from = placeOf(relation.from);
      const to = placeOf(relation.to);
      routes[relation.id] = {
        bendPoints: [
          { x: Math.round((from.x + to.x) / 2 + 90), y: Math.round((from.y + to.y) / 2 + 120) },
        ],
      };
    }
    made += 1;
  }
  return routes;
}

interface Building {
  elements: Element[];
  relations: Relation[];
  positions: ShapePosition[];
  /** The elements relations are drawn between. */
  services: string[];
}

/**
 * Adds `count` elements in systems on a grid, each system holding `perSystem` of them with itself,
 * and says where the lowest system ends.
 */
function addSystems(
  count: number,
  perSystem: number,
  stairs: boolean,
  random: () => number,
  building: Building,
): number {
  const { elements, relations, positions, services } = building;
  const systems = Math.max(1, Math.ceil(count / perSystem));
  const columns = Math.ceil(Math.sqrt(systems));
  const inside = perSystem - 1;
  // Contents on a grid, or staircases of four on a grid.
  const step = stairs
    ? {
        width: CONTENT.width + 3 * STAIR.x + 20,
        height: CONTENT.height + 3 * STAIR.y + 20,
      }
    : CELL;
  const places = stairs ? Math.ceil(inside / 4) : inside;
  const innerColumns = Math.ceil(Math.sqrt(places));
  const innerRows = Math.ceil(places / innerColumns);
  const systemSize = {
    width: SYSTEM_PADDING.left + innerColumns * step.width + SYSTEM_PADDING.right,
    height: SYSTEM_PADDING.top + innerRows * step.height + SYSTEM_PADDING.bottom,
  };
  const start = elements.length;
  let bottom = 0;
  for (let system = 0; system < systems && elements.length - start < count; system++) {
    const systemId = `system-${system}`;
    const origin = {
      x: (system % columns) * (systemSize.width + 80),
      y: Math.floor(system / columns) * (systemSize.height + 80),
    };
    bottom = Math.max(bottom, origin.y + systemSize.height);
    elements.push({ id: systemId, component: 'systems.system', name: `System ${system}` });
    positions.push({ element: systemId, ...origin, ...systemSize });
    for (let each = 0; each < inside && elements.length - start < count; each++) {
      const id = `element-${system}-${each}`;
      const component = COMPONENTS[Math.floor(random() * COMPONENTS.length)] as string;
      elements.push({ id, component, name: `Element ${system}.${each}` });
      services.push(id);
      const last = each === inside - 1 || elements.length - start === count;
      if (stairs && last && system % 10 === 9) {
        // Over the middle of its system, but directly in World.
        positions.push({
          element: id,
          x: origin.x + (systemSize.width - CONTENT.width) / 2,
          y: origin.y + (systemSize.height - CONTENT.height) / 2,
        });
        continue;
      }
      relations.push({
        id: `${id}-in`,
        relationType: 'systems.is-part-of',
        from: id,
        to: systemId,
      });
      const place = stairs ? Math.floor(each / 4) : each;
      const stair = stairs ? each % 4 : 0;
      positions.push({
        element: id,
        container: systemId,
        x: SYSTEM_PADDING.left + (place % innerColumns) * step.width + stair * STAIR.x,
        y: SYSTEM_PADDING.top + Math.floor(place / innerColumns) * step.height + stair * STAIR.y,
      });
    }
  }
  return bottom;
}

/** A small, fast generator of numbers between 0 and 1, the same for the same seed. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
