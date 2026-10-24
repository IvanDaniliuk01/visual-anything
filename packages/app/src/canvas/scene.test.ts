import type { ProjectSnapshot } from '@visual-anything/core';
import type { Component, Element, Relation, RelationType, ViewFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../test/sample';
import { distance, type Point, type Rect } from './geometry';
import { buildScene, type ElementShape, type RelationLine, type Scene } from './scene';

const sample = loadSample();
const overview = buildScene(sample, 'system-overview');

function shapeOf(scene: Scene, element: string): ElementShape {
  const shapes = scene.shapes.filter((shape) => shape.element === element);
  if (shapes.length !== 1)
    throw new Error(`Expected one shape of ${element}, got ${shapes.length}.`);
  return shapes[0] as ElementShape;
}

function lineOf(scene: Scene, relation: string): RelationLine {
  const line = scene.relations.find((candidate) => candidate.relation === relation);
  if (!line) throw new Error(`The scene draws no relation ${relation}.`);
  return line;
}

const TOLERANCE = 1e-6;

function isOnBorder(point: Point, rect: Rect): boolean {
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const within =
    point.x >= rect.x - TOLERANCE &&
    point.x <= right + TOLERANCE &&
    point.y >= rect.y - TOLERANCE &&
    point.y <= bottom + TOLERANCE;
  const onASide = [point.x - rect.x, point.x - right, point.y - rect.y, point.y - bottom].some(
    (offset) => Math.abs(offset) < TOLERANCE,
  );
  return within && onASide;
}

function encloses(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function distanceToSegment(point: Point, from: Point, to: Point): number {
  const length = distance(from, to) ** 2;
  if (length === 0) return distance(point, from);
  const along =
    ((point.x - from.x) * (to.x - from.x) + (point.y - from.y) * (to.y - from.y)) / length;
  const clamped = Math.min(1, Math.max(0, along));
  return distance(point, {
    x: from.x + clamped * (to.x - from.x),
    y: from.y + clamped * (to.y - from.y),
  });
}

function cross(origin: Point, a: Point, b: Point): number {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

/** The shortest distance between two lines; 0 when they cross. */
function distanceBetween(a: RelationLine, b: RelationLine): number {
  const crosses =
    cross(a.from, a.to, b.from) * cross(a.from, a.to, b.to) < 0 &&
    cross(b.from, b.to, a.from) * cross(b.from, b.to, a.to) < 0;
  if (crosses) return 0;
  return Math.min(
    distanceToSegment(a.from, b.from, b.to),
    distanceToSegment(a.to, b.from, b.to),
    distanceToSegment(b.from, a.from, a.to),
    distanceToSegment(b.to, a.from, a.to),
  );
}

interface Fixture {
  components?: Component[];
  relationTypes?: RelationType[];
  elements: (Partial<Element> & Pick<Element, 'id'>)[];
  relations?: Relation[];
  view?: Partial<ViewFile>;
}

/** A small project with one package, `p`, and one view, `v`. */
function fixture({
  components = [],
  relationTypes = [],
  elements,
  relations = [],
  view = {},
}: Fixture): ProjectSnapshot {
  return {
    project: { schemaVersion: 1, name: 'Fixture', packages: ['p'] },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: elements.map((element) => ({ component: 'essence', name: element.id, ...element })),
      relations,
    },
    packages: [{ id: 'p', name: 'P', components, relationTypes }],
    views: [
      {
        id: 'v',
        name: 'V',
        perspective: { name: 'Any' },
        nestingRelationTypes: [],
        positions: [],
        freeShapes: [],
        ...view,
      },
    ],
    scenarios: [],
  };
}

const box: Component = {
  id: 'p.box',
  name: 'Box',
  derivesFrom: 'essence',
  appearance: { width: 100, height: 40 },
};
const isIn: RelationType = { id: 'p.in', name: 'is in', derivesFrom: 'relates-to', nests: true };

describe('buildScene with the sample project', () => {
  it('gives every element except World exactly one anchored shape', () => {
    const shown = overview.shapes.map((shape) => shape.element).sort();
    const elements = sample.model.elements.map((element) => element.id).sort();
    expect(shown).toEqual(elements);
    expect(shown).not.toContain(sample.model.world.id);
  });

  it('resolves positions relative to the container’s shape into absolute rectangles', () => {
    expect(shapeOf(overview, 'patient').rect).toEqual({ x: 40, y: 200, width: 140, height: 80 });
    expect(shapeOf(overview, 'clinic-booking').rect).toEqual({
      x: 240,
      y: 40,
      width: 980,
      height: 480,
    });
    expect(shapeOf(overview, 'scheduling').rect).toEqual({
      x: 740,
      y: 100,
      width: 440,
      height: 380,
    });
    expect(shapeOf(overview, 'appointments-api').rect).toEqual({
      x: 780,
      y: 204,
      width: 180,
      height: 72,
    });
    expect(shapeOf(overview, 'appointments-db').rect).toEqual({
      x: 780,
      y: 364,
      width: 180,
      height: 80,
    });
  });

  it('records which container holds each shape', () => {
    expect(shapeOf(overview, 'patient').container).toBeUndefined();
    expect(shapeOf(overview, 'scheduling').container).toBe('clinic-booking');
    expect(shapeOf(overview, 'appointments-api').container).toBe('scheduling');
  });

  it('takes what a component leaves out from the component it derives from', () => {
    const whatsapp = shapeOf(overview, 'whatsapp');
    expect(whatsapp.rect).toEqual({ x: 280, y: 204, width: 180, height: 72 });
    expect(whatsapp).toMatchObject({
      kind: 'rounded-rectangle',
      fill: '#D8F3E3',
      stroke: '#1E6B43',
    });
  });

  it('draws an element with its own appearance where it sets one', () => {
    expect(shapeOf(overview, 'booking-agent')).toMatchObject({
      fill: '#F8E1EC',
      stroke: '#5B3A9E',
    });
  });

  it('names each shape after its element and its component', () => {
    expect(shapeOf(overview, 'appointments-api')).toMatchObject({
      name: 'Appointments API',
      componentName: 'Service',
    });
    expect(shapeOf(overview, 'appointments-db')).toMatchObject({
      kind: 'cylinder',
      componentName: 'Calendar',
    });
  });

  it('draws each container around its contents, and before them', () => {
    const contained = overview.shapes.filter((shape) => shape.container !== undefined);
    expect(contained).toHaveLength(6);
    for (const shape of contained) {
      const container = shapeOf(overview, shape.container ?? '');
      expect(encloses(container.rect, shape.rect), `${shape.element} in ${container.element}`).toBe(
        true,
      );
      expect(overview.shapes.indexOf(container)).toBeLessThan(overview.shapes.indexOf(shape));
      expect(container.holdsContents).toBe(true);
    }
    expect(shapeOf(overview, 'appointments-api').holdsContents).toBe(false);
  });

  it('draws every relation except those of the view’s nesting relation types', () => {
    expect(overview.relations.map((line) => line.relation)).toEqual([
      'patient-to-whatsapp',
      'whatsapp-to-agent',
      'agent-to-api',
      'api-reads-db',
      'api-writes-db',
      'api-to-reminders',
    ]);
  });

  it('ends each relation at the borders of the shapes it relates', () => {
    const elementShapes = new Map(overview.shapes.map((shape) => [shape.element, shape]));
    for (const relation of sample.model.relations) {
      const line = overview.relations.find((candidate) => candidate.relation === relation.id);
      if (!line) continue;
      const from = elementShapes.get(relation.from);
      const to = elementShapes.get(relation.to);
      expect(from && isOnBorder(line.from, from.rect), `${relation.id} starts on a border`).toBe(
        true,
      );
      expect(to && isOnBorder(line.to, to.rect), `${relation.id} ends on a border`).toBe(true);
    }
  });

  it('draws the two relations between the Appointments API and the Appointments DB side by side', () => {
    const reads = lineOf(overview, 'api-reads-db');
    const writes = lineOf(overview, 'api-writes-db');
    expect(distanceBetween(reads, writes)).toBeGreaterThanOrEqual(16);
  });

  it('draws directed relations with an arrowhead whose tip is their `to` end', () => {
    for (const line of overview.relations) {
      expect(line.arrowhead?.tip).toEqual(line.to);
    }
  });

  it('draws each relation with its relation type’s stroke, width and dash', () => {
    expect(lineOf(overview, 'api-reads-db')).toMatchObject({
      stroke: '#3D4651',
      width: 2,
      dash: 'dashed',
    });
    expect(lineOf(overview, 'api-writes-db')).toMatchObject({ dash: 'solid' });
  });

  it('labels a relation that has a name with it, at the middle of its line', () => {
    const https = lineOf(overview, 'agent-to-api');
    expect(https.label).toBe('HTTPS');
    expect(https.middle).toEqual({
      x: (https.from.x + https.to.x) / 2,
      y: (https.from.y + https.to.y) / 2,
    });
    expect(lineOf(overview, 'api-reads-db').label).toBeUndefined();
  });

  it('draws the view’s notes at their positions', () => {
    expect(overview.notes).toEqual([
      {
        id: 'calendar-note',
        rect: { x: 240, y: 560, width: 460, height: 72 },
        text: 'Scheduling owns the calendar: only the Appointments API reads and writes the Appointments DB.',
      },
    ]);
  });

  it('bounds everything it draws', () => {
    expect(overview.bounds).toEqual({ x: 40, y: 40, width: 1180, height: 592 });
  });
});

describe('buildScene', () => {
  it('attaches a relation that ends on another relation to the middle of that relation’s line', () => {
    const scene = buildScene(
      fixture({
        relationTypes: [
          { id: 'p.calls', name: 'calls', derivesFrom: 'relates-to', direction: 'directed' },
          { id: 'p.governs', name: 'governs', derivesFrom: 'relates-to', direction: 'directed' },
        ],
        elements: [{ id: 'client' }, { id: 'server' }, { id: 'contract' }],
        relations: [
          { id: 'call', relationType: 'p.calls', from: 'client', to: 'server' },
          { id: 'rule', relationType: 'p.governs', from: 'contract', to: 'call' },
        ],
        view: {
          positions: [
            { element: 'client', x: 0, y: 0 },
            { element: 'server', x: 400, y: 0 },
            { element: 'contract', x: 200, y: 200 },
          ],
        },
      }),
      'v',
    );
    const call = lineOf(scene, 'call');
    const rule = lineOf(scene, 'rule');
    expect(rule.to).toEqual(call.middle);
    expect(rule.arrowhead?.tip).toEqual(call.middle);
    expect(isOnBorder(rule.from, shapeOf(scene, 'contract').rect)).toBe(true);
  });

  it('draws relations of undirected relation types without an arrowhead', () => {
    const scene = buildScene(
      fixture({
        relationTypes: [
          { id: 'p.near', name: 'is near', derivesFrom: 'relates-to', direction: 'undirected' },
          { id: 'p.likes', name: 'likes', derivesFrom: 'relates-to' },
          { id: 'p.points', name: 'points at', derivesFrom: 'relates-to', direction: 'directed' },
          { id: 'p.aims', name: 'aims at', derivesFrom: 'p.points' },
        ],
        elements: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
        relations: [
          { id: 'near', relationType: 'p.near', from: 'a', to: 'b' },
          { id: 'likes', relationType: 'p.likes', from: 'b', to: 'c' },
          { id: 'aims', relationType: 'p.aims', from: 'c', to: 'd' },
        ],
        view: {
          positions: [
            { element: 'a', x: 0, y: 0 },
            { element: 'b', x: 300, y: 0 },
            { element: 'c', x: 600, y: 0 },
            { element: 'd', x: 900, y: 0 },
          ],
        },
      }),
      'v',
    );
    expect(lineOf(scene, 'near').arrowhead).toBeUndefined();
    expect(lineOf(scene, 'likes').arrowhead).toBeUndefined();
    expect(lineOf(scene, 'aims').arrowhead).toBeDefined();
  });

  it('places shapes without a stored position in a row below everything else', () => {
    const scene = buildScene(
      fixture({
        components: [box],
        elements: [
          { id: 'placed', component: 'p.box' },
          { id: 'first', component: 'p.box' },
          { id: 'second', component: 'p.box' },
        ],
        view: {
          positions: [{ element: 'placed', x: 50, y: 0 }],
          freeShapes: [{ kind: 'note', id: 'n', x: 0, y: 100, width: 200, height: 50, text: '' }],
        },
      }),
      'v',
    );
    const first = shapeOf(scene, 'first');
    const second = shapeOf(scene, 'second');
    expect(first.rect).toMatchObject({ x: 0, width: 100, height: 40 });
    expect(first.rect.y).toBeGreaterThan(150);
    expect(second.rect.y).toBe(first.rect.y);
    expect(second.rect.x).toBeGreaterThan(first.rect.x + first.rect.width);
  });

  it('places contents without a stored position inside their container, which grows to hold them', () => {
    const scene = buildScene(
      fixture({
        components: [box],
        relationTypes: [isIn],
        elements: [
          { id: 'sized' },
          { id: 'unsized' },
          { id: 'loose', component: 'p.box' },
          { id: 'placed', component: 'p.box' },
          { id: 'tucked', component: 'p.box' },
        ],
        relations: [
          { id: 'r1', relationType: 'p.in', from: 'loose', to: 'sized' },
          { id: 'r2', relationType: 'p.in', from: 'placed', to: 'unsized' },
          { id: 'r3', relationType: 'p.in', from: 'tucked', to: 'unsized' },
        ],
        view: {
          nestingRelationTypes: ['p.in'],
          positions: [
            { element: 'sized', x: 0, y: 0, width: 400, height: 300 },
            { element: 'unsized', x: 500, y: 0 },
            { element: 'placed', container: 'unsized', x: 200, y: 160 },
          ],
        },
      }),
      'v',
    );
    const sized = shapeOf(scene, 'sized');
    const unsized = shapeOf(scene, 'unsized');
    expect(sized.rect).toEqual({ x: 0, y: 0, width: 400, height: 300 });
    expect(encloses(sized.rect, shapeOf(scene, 'loose').rect)).toBe(true);
    expect(encloses(unsized.rect, shapeOf(scene, 'placed').rect)).toBe(true);
    expect(encloses(unsized.rect, shapeOf(scene, 'tucked').rect)).toBe(true);
    expect(shapeOf(scene, 'placed').rect).toMatchObject({ x: 700, y: 160 });
  });

  it('draws an element with several containers once inside each of them', () => {
    const scene = buildScene(
      fixture({
        relationTypes: [isIn],
        elements: [{ id: 'region' }, { id: 'circuit' }, { id: 'neuron' }],
        relations: [
          { id: 'r1', relationType: 'p.in', from: 'neuron', to: 'region' },
          { id: 'r2', relationType: 'p.in', from: 'neuron', to: 'circuit' },
        ],
        view: {
          nestingRelationTypes: ['p.in'],
          positions: [
            { element: 'region', x: 0, y: 0, width: 300, height: 200 },
            { element: 'circuit', x: 400, y: 0, width: 300, height: 200 },
            { element: 'neuron', container: 'region', x: 20, y: 60 },
            { element: 'neuron', container: 'circuit', x: 40, y: 80 },
          ],
        },
      }),
      'v',
    );
    const neurons = scene.shapes.filter((shape) => shape.element === 'neuron');
    expect(neurons.map((shape) => [shape.container, shape.rect.x, shape.rect.y])).toEqual([
      ['region', 20, 60],
      ['circuit', 440, 80],
    ]);
    expect(new Set(scene.shapes.map((shape) => shape.key)).size).toBe(scene.shapes.length);
  });

  it('leaves out relations with an end that is not shown', () => {
    const scene = buildScene(
      fixture({
        relationTypes: [
          isIn,
          { id: 'p.uses', name: 'uses', derivesFrom: 'relates-to' },
          { id: 'p.notes', name: 'notes', derivesFrom: 'relates-to' },
        ],
        elements: [{ id: 'a' }, { id: 'b' }],
        relations: [
          { id: 'nesting', relationType: 'p.in', from: 'a', to: 'b' },
          { id: 'to-world', relationType: 'p.uses', from: 'a', to: 'world' },
          { id: 'to-nesting', relationType: 'p.notes', from: 'b', to: 'nesting' },
          { id: 'to-nothing', relationType: 'p.uses', from: 'a', to: 'gone' },
          { id: 'to-itself', relationType: 'p.uses', from: 'a', to: 'a' },
        ],
        view: { nestingRelationTypes: ['p.in'] },
      }),
      'v',
    );
    expect(scene.relations).toEqual([]);
  });

  it('draws free arrows with an arrowhead at their end', () => {
    const scene = buildScene(
      fixture({
        elements: [],
        view: {
          freeShapes: [
            { kind: 'arrow', id: 'pointer', from: { x: 0, y: 0 }, to: { x: 100, y: 0 } },
          ],
        },
      }),
      'v',
    );
    expect(scene.arrows).toHaveLength(1);
    expect(scene.arrows[0]).toMatchObject({
      id: 'pointer',
      from: { x: 0, y: 0 },
      to: { x: 100, y: 0 },
    });
    expect(scene.arrows[0]?.arrowhead.tip).toEqual({ x: 100, y: 0 });
    expect(scene.bounds && encloses(scene.bounds, { x: 0, y: 0, width: 100, height: 0 })).toBe(
      true,
    );
  });

  it('has no bounds when it draws nothing', () => {
    expect(buildScene(fixture({ elements: [] }), 'v').bounds).toBeUndefined();
  });

  it('refuses a view the project does not have', () => {
    expect(() => buildScene(sample, 'no-such-view')).toThrow(/no-such-view/);
  });
});
