/**
 * A synthetic project for measuring the canvas: thousands of elements in systems laid out on a grid,
 * with relations between them, built the same way every time.
 */
import { SYSTEMS, type ProjectSnapshot } from '@visual-anything/core';
import type { Element, Relation, ShapePosition } from '@visual-anything/schema';

export interface SyntheticOptions {
  /** How many elements, World aside; at least one system holds them. */
  elements: number;
  /** How many elements each system holds, the system included. */
  perSystem?: number;
  /** How many relations each element starts, on average. */
  relationsPerElement?: number;
}

const COMPONENTS = [
  'systems.service',
  'systems.database',
  'systems.ai-agent',
  'systems.chat-channel',
];
const RELATION_TYPES = ['systems.communicates-with', 'systems.reads-from', 'systems.writes-to'];
const CELL = { width: 200, height: 110 };
const SYSTEM_PADDING = { left: 24, top: 56, right: 24, bottom: 24 };

/** A project with one view that shows `elements` elements, every one with a stored position. */
export function syntheticProject(options: SyntheticOptions): ProjectSnapshot {
  const perSystem = Math.max(2, options.perSystem ?? 25);
  const relationsPerElement = options.relationsPerElement ?? 1;
  const random = seeded(1);
  const elements: Element[] = [];
  const relations: Relation[] = [];
  const positions: ShapePosition[] = [];

  const systems = Math.max(1, Math.ceil(options.elements / perSystem));
  const columns = Math.ceil(Math.sqrt(systems));
  const inside = perSystem - 1;
  const innerColumns = Math.ceil(Math.sqrt(inside));
  const innerRows = Math.ceil(inside / innerColumns);
  const systemSize = {
    width: SYSTEM_PADDING.left + innerColumns * CELL.width + SYSTEM_PADDING.right,
    height: SYSTEM_PADDING.top + innerRows * CELL.height + SYSTEM_PADDING.bottom,
  };

  const services: string[] = [];
  for (let system = 0; system < systems && elements.length < options.elements; system++) {
    const systemId = `system-${system}`;
    elements.push({ id: systemId, component: 'systems.system', name: `System ${system}` });
    positions.push({
      element: systemId,
      x: (system % columns) * (systemSize.width + 80),
      y: Math.floor(system / columns) * (systemSize.height + 80),
      width: systemSize.width,
      height: systemSize.height,
    });
    for (let each = 0; each < inside && elements.length < options.elements; each++) {
      const id = `element-${system}-${each}`;
      const component = COMPONENTS[Math.floor(random() * COMPONENTS.length)] as string;
      elements.push({ id, component, name: `Element ${system}.${each}` });
      relations.push({
        id: `${id}-in`,
        relationType: 'systems.is-part-of',
        from: id,
        to: systemId,
      });
      positions.push({
        element: id,
        container: systemId,
        x: SYSTEM_PADDING.left + (each % innerColumns) * CELL.width,
        y: SYSTEM_PADDING.top + Math.floor(each / innerColumns) * CELL.height,
      });
      services.push(id);
    }
  }

  const wanted = Math.round(services.length * relationsPerElement);
  for (let each = 0; each < wanted; each++) {
    const from = services[Math.floor(random() * services.length)] as string;
    // Mostly to a near element, sometimes far away, as real systems are.
    const near = random() < 0.8;
    const index = services.indexOf(from);
    const to = near
      ? (services[
          Math.min(services.length - 1, Math.max(0, index + 1 + Math.floor(random() * 6)))
        ] as string)
      : (services[Math.floor(random() * services.length)] as string);
    if (from === to) continue;
    const relationType = RELATION_TYPES[Math.floor(random() * RELATION_TYPES.length)] as string;
    relations.push({ id: `relation-${each}`, relationType, from, to });
  }

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
      },
    ],
    scenarios: [],
  };
}

/** A small, fast generator of numbers between 0 and 1, the same for the same seed. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
