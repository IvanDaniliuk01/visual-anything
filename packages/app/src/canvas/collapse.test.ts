import type { ProjectSnapshot } from '@visual-anything/core';
import type { Component, Element, Relation, RelationType, ViewFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { selectionOf } from '../editor/selection';
import {
  collapseActions,
  collapseDone,
  collapsedIn,
  headerLines,
  insideCount,
  setCollapsedCommand,
} from './collapse';
import { indexScene } from './hit';
import {
  AGGREGATED,
  aggregatedExtraWidth,
  buildScene,
  buildSceneAfresh,
  relationLinesOf,
  type ElementShape,
  type RelationLine,
  type Scene,
} from './scene';

const box: Component = {
  id: 'p.box',
  name: 'Box',
  derivesFrom: 'essence',
  appearance: { width: 100, height: 40 },
};
const group: Component = {
  id: 'p.group',
  name: 'Group',
  derivesFrom: 'essence',
  appearance: { width: 160, height: 64 },
};
const isIn: RelationType = { id: 'p.in', name: 'is in', derivesFrom: 'relates-to', nests: true };
const calls: RelationType = {
  id: 'p.calls',
  name: 'calls',
  derivesFrom: 'relates-to',
  direction: 'directed',
  appearance: { width: 2 },
};
const reads: RelationType = {
  id: 'p.reads',
  name: 'reads',
  derivesFrom: 'relates-to',
  direction: 'directed',
};
const talks: RelationType = {
  id: 'p.talks',
  name: 'talks with',
  derivesFrom: 'relates-to',
  direction: 'undirected',
};

interface Fixture {
  elements: (Partial<Element> & Pick<Element, 'id'>)[];
  relations?: Relation[];
  view?: Partial<ViewFile> & { collapsed?: string[] };
}

/** A project with one package, `p`, and one view, `v`, nesting by "is in". */
function fixture({ elements, relations = [], view = {} }: Fixture): ProjectSnapshot {
  return {
    project: { schemaVersion: 1, name: 'Fixture', packages: ['p'] },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: elements.map((element) => ({ component: 'p.box', name: element.id, ...element })),
      relations,
    },
    packages: [
      {
        id: 'p',
        name: 'P',
        components: [box, group],
        relationTypes: [isIn, calls, reads, talks],
      },
    ],
    views: [
      {
        id: 'v',
        name: 'V',
        perspective: { name: 'Any' },
        nestingRelationTypes: ['p.in'],
        positions: [],
        freeShapes: [],
        ...view,
      },
    ],
    scenarios: [],
    tours: [],
    comments: [],
  };
}

const inside = (id: string, element: string, container: string): Relation => ({
  id,
  relationType: 'p.in',
  from: element,
  to: container,
});
const relation = (id: string, relationType: string, from: string, to: string): Relation => ({
  id,
  relationType,
  from,
  to,
});

/**
 * A system holding a service and a store, the store holding a table; a client and a backup outside.
 * The client calls the service and the store, and reads the table; the backup reads the store; the
 * service calls the store.
 */
function systems(collapsed?: string[]): ProjectSnapshot {
  return fixture({
    elements: [
      { id: 'system', component: 'p.group' },
      { id: 'service' },
      { id: 'store', component: 'p.group' },
      { id: 'table' },
      { id: 'client' },
      { id: 'backup' },
    ],
    relations: [
      inside('i1', 'service', 'system'),
      inside('i2', 'store', 'system'),
      inside('i3', 'table', 'store'),
      relation('c1', 'p.calls', 'client', 'service'),
      relation('c2', 'p.calls', 'client', 'store'),
      relation('r1', 'p.reads', 'client', 'table'),
      relation('r2', 'p.reads', 'backup', 'store'),
      relation('c3', 'p.calls', 'service', 'store'),
      relation('own', 'p.calls', 'client', 'system'),
    ],
    view: {
      positions: [
        { element: 'system', x: 0, y: 0, width: 600, height: 400 },
        { element: 'client', x: 800, y: 0 },
        { element: 'backup', x: 800, y: 300 },
      ],
      ...(collapsed ? { collapsed } : {}),
    },
  });
}

function shapeOf(scene: Scene, key: string): ElementShape {
  const shape = scene.shapes.find((each) => each.key === key);
  if (!shape) throw new Error(`The scene draws no shape ${key}.`);
  return shape;
}

function aggregates(scene: Scene): RelationLine[] {
  return scene.relations.filter((line) => line.aggregate !== undefined);
}

describe('a collapsed container', () => {
  it('draws none of its contents, at its component’s size, keeping its stored size', () => {
    const scene = buildScene(systems(['system']), 'v');
    expect(scene.shapes.map((shape) => shape.key)).toEqual(['system', 'client', 'backup']);
    const system = shapeOf(scene, 'system');
    expect(system.rect).toEqual({ x: 0, y: 0, width: 160, height: 64 });
    expect(system.extent).toEqual(system.rect);
    expect(system.storedSize).toEqual({ width: 600, height: 400 });
    expect(system.holdsContents).toBe(false);
    expect(system.collapsed).toEqual({ contents: 2 });
    expect(insideCount(system)).toBe('2 inside');
  });

  it('writes its count on a line of its own when its header has room, or else before its detail', () => {
    const system = shapeOf(buildScene(systems(['system']), 'v'), 'system');
    expect(headerLines(system, 64)).toEqual({ detail: 'Group', count: '2 inside', countRoom: 16 });
    expect(headerLines(system, 59)).toEqual({ detail: 'Group', count: '2 inside', countRoom: 15 });
    expect(headerLines(system, 52)).toEqual({ detail: '2 inside · Group' });
    expect(headerLines({ ...system, detail: '' }, 52)).toEqual({ detail: '2 inside' });
    const open = shapeOf(buildScene(systems(), 'v'), 'system');
    expect(headerLines(open, 400)).toEqual({ detail: 'Group' });
  });

  it('draws the relations of its contents as aggregated relations, one per relation type and far end', () => {
    const scene = buildScene(systems(['system']), 'v');
    const lines = aggregates(scene);
    expect(lines.map((line) => line.aggregate)).toEqual([
      { relationType: 'p.calls', relations: ['c1', 'c2'] },
      { relationType: 'p.reads', relations: ['r1'] },
      { relationType: 'p.reads', relations: ['r2'] },
    ]);
    const [calling] = lines;
    expect(calling?.ends).toMatchObject({
      from: { kind: 'shape', key: 'client' },
      to: { kind: 'shape', key: 'system' },
    });
    expect(calling?.label).toBe('×2');
    expect(calling?.width).toBe(2 + aggregatedExtraWidth(2));
    expect(calling?.arrowhead).toBeDefined();
    expect(calling?.relation.startsWith(AGGREGATED)).toBe(true);
    // The service calling the store happens inside: it is not drawn.
    expect(scene.relations.some((line) => line.relation === 'c3')).toBe(false);
    expect(lines.flatMap((line) => line.aggregate?.relations)).not.toContain('c3');
  });

  it('keeps its own relations as they are, beside the aggregated ones between the same ends', () => {
    const scene = buildScene(systems(['system']), 'v');
    const own = scene.relations.find((line) => line.relation === 'own');
    expect(own?.aggregate).toBeUndefined();
    // The client's calls, its reads and its own relation to the system run side by side.
    const between = scene.relations.filter((line) =>
      [line.ends?.from, line.ends?.to].every(
        (end) => end?.kind === 'shape' && (end.key === 'client' || end.key === 'system'),
      ),
    );
    expect(between.map((line) => line.ends?.offset)).toEqual([-24, 0, 24]);
    expect(between.at(-1)).toBe(own);
  });

  it('aggregates on the outermost collapsed container, and an inner one alone hides only its own', () => {
    const inner = buildScene(systems(['store']), 'v');
    expect(inner.shapes.map((shape) => shape.key)).toEqual([
      'system',
      'system/service',
      'system/store',
      'client',
      'backup',
    ]);
    expect(aggregates(inner).map((line) => line.aggregate?.relations)).toEqual([['r1']]);
    expect(inner.relations.find((line) => line.relation === 'c2')?.ends?.to).toEqual({
      kind: 'shape',
      key: 'system/store',
    });

    const both = buildScene(systems(['store', 'system']), 'v');
    expect(both.shapes.map((shape) => shape.key)).toEqual(['system', 'client', 'backup']);
    expect(aggregates(both).map((line) => line.aggregate?.relations)).toEqual([
      ['c1', 'c2'],
      ['r1'],
      ['r2'],
    ]);
  });

  it('aggregates between the contents of two collapsed containers', () => {
    const project = fixture({
      elements: [
        { id: 'a', component: 'p.group' },
        { id: 'a1' },
        { id: 'a2' },
        { id: 'b', component: 'p.group' },
        { id: 'b1' },
      ],
      relations: [
        inside('i1', 'a1', 'a'),
        inside('i2', 'a2', 'a'),
        inside('i3', 'b1', 'b'),
        relation('x', 'p.calls', 'a1', 'b1'),
        relation('y', 'p.calls', 'a2', 'b1'),
        relation('z', 'p.calls', 'b1', 'a1'),
      ],
      view: { collapsed: ['a', 'b'] },
    });
    const lines = aggregates(buildScene(project, 'v'));
    // Directed: each way is an aggregated relation of its own.
    expect(
      lines.map((line) => [line.ends?.from, line.ends?.to, line.aggregate?.relations]),
    ).toEqual([
      [{ kind: 'shape', key: 'a' }, { kind: 'shape', key: 'b' }, ['x', 'y']],
      [{ kind: 'shape', key: 'b' }, { kind: 'shape', key: 'a' }, ['z']],
    ]);
  });

  it('aggregates relations of an undirected type whichever way they run, saying which run back', () => {
    const project = fixture({
      elements: [{ id: 'a', component: 'p.group' }, { id: 'a1' }, { id: 'a2' }, { id: 'far' }],
      relations: [
        inside('i1', 'a1', 'a'),
        inside('i2', 'a2', 'a'),
        relation('t1', 'p.talks', 'a1', 'far'),
        relation('t2', 'p.talks', 'far', 'a2'),
      ],
      view: { collapsed: ['a'] },
    });
    const [line, ...others] = aggregates(buildScene(project, 'v'));
    expect(others).toEqual([]);
    expect(line?.aggregate?.relations).toEqual(['t1', 't2']);
    expect(line?.arrowhead).toBeUndefined();
    const reversed = line?.aggregate?.reversed ?? [];
    // The one that runs from the aggregated relation's `to` end towards its `from` end.
    const fromKey = line?.ends?.from.kind === 'shape' ? line.ends.from.key : undefined;
    expect(reversed).toEqual(fromKey === 'a' ? ['t2'] : ['t1']);
  });

  it('attaches a relation that ends on an aggregated one to its middle', () => {
    const project = fixture({
      elements: [
        { id: 'a', component: 'p.group' },
        { id: 'a1' },
        { id: 'far' },
        { id: 'note-taker' },
      ],
      relations: [
        inside('i1', 'a1', 'a'),
        relation('c', 'p.calls', 'a1', 'far'),
        relation('about', 'p.reads', 'note-taker', 'c'),
      ],
      view: {
        collapsed: ['a'],
        positions: [
          { element: 'a', x: 0, y: 0 },
          { element: 'far', x: 600, y: 0 },
          { element: 'note-taker', x: 300, y: 300 },
        ],
      },
    });
    const scene = buildScene(project, 'v');
    const [aggregate] = aggregates(scene);
    const about = scene.relations.find((line) => line.relation === 'about');
    expect(about?.ends?.to).toEqual({ kind: 'relation', relation: aggregate?.relation });
    expect(about?.to).toEqual(aggregate?.middle);
    expect(relationLinesOf(scene).get('c')).toBe(aggregate);
    expect(relationLinesOf(scene).get('about')).toBe(about);
  });

  it('is drawn as before once expanded', () => {
    const collapsed = buildScene(systems(['system']), 'v');
    const expanded = buildScene(systems(), 'v');
    expect(expanded).toEqual(buildSceneAfresh(systems(), 'v'));
    expect(expanded.shapes).toHaveLength(6);
    expect(aggregates(expanded)).toEqual([]);
    expect(collapsed).toEqual(buildSceneAfresh(systems(['system']), 'v'));
  });

  it('collapses only what holds shapes in the view', () => {
    const scene = buildScene(systems(['client', 'unknown']), 'v');
    expect(scene).toEqual(buildSceneAfresh(systems(), 'v'));
    expect(shapeOf(scene, 'client').collapsed).toBeUndefined();
  });
});

describe('copies of an element in several containers', () => {
  /** A cell in a region and in a circuit, both containers, related to a probe outside. */
  function copies(collapsed?: string[]): ProjectSnapshot {
    return fixture({
      elements: [
        { id: 'region', component: 'p.group' },
        { id: 'circuit', component: 'p.group' },
        { id: 'cell' },
        { id: 'probe' },
      ],
      relations: [
        inside('i1', 'cell', 'region'),
        inside('i2', 'cell', 'circuit'),
        relation('m', 'p.reads', 'probe', 'cell'),
      ],
      view: {
        positions: [
          { element: 'region', x: 0, y: 0 },
          { element: 'circuit', x: 400, y: 0 },
          { element: 'probe', x: 200, y: 400 },
        ],
        ...(collapsed ? { collapsed } : {}),
      },
    });
  }

  it('draws one copy inside each container, and relations from the first', () => {
    const scene = buildScene(copies(), 'v');
    expect(scene.shapes.map((shape) => shape.key)).toEqual([
      'region',
      'region/cell',
      'circuit',
      'circuit/cell',
      'probe',
    ]);
    const line = scene.relations.find((each) => each.relation === 'm');
    expect(line?.ends?.to).toEqual({ kind: 'shape', key: 'region/cell' });
    // Selected together: every copy is the element's.
    expect(
      indexScene(scene)
        .byElement.get('cell')
        ?.map((shape) => shape.key),
    ).toEqual(['region/cell', 'circuit/cell']);
  });

  it('hides only the copy inside a collapsed container, and draws relations from one that shows', () => {
    const scene = buildScene(copies(['region']), 'v');
    expect(scene.shapes.map((shape) => shape.key)).toEqual([
      'region',
      'circuit',
      'circuit/cell',
      'probe',
    ]);
    expect(shapeOf(scene, 'region').collapsed).toEqual({ contents: 1 });
    const line = scene.relations.find((each) => each.relation === 'm');
    expect(line?.ends?.to).toEqual({ kind: 'shape', key: 'circuit/cell' });
    expect(aggregates(scene)).toEqual([]);
  });

  it('aggregates on the container of the first copy once every copy is hidden', () => {
    const scene = buildScene(copies(['circuit', 'region']), 'v');
    expect(aggregates(scene).map((line) => [line.ends?.to, line.aggregate?.relations])).toEqual([
      [{ kind: 'shape', key: 'region' }, ['m']],
    ]);
  });
});

describe('collapse actions', () => {
  it('reads the containers a view collapses, as I1 stores them', () => {
    const project = systems(['store', 'system']);
    expect([...collapsedIn(project.views[0] as ViewFile)]).toEqual(['store', 'system']);
    expect(collapsedIn(systems().views[0] as ViewFile).size).toBe(0);
  });

  it('collapses the selected containers drawn expanded and expands those drawn collapsed', () => {
    const project = systems(['store']);
    const indexed = indexScene(buildScene(project, 'v'));
    const select = (...ids: string[]) =>
      selectionOf(ids.map((id) => ({ kind: 'element' as const, id })));
    expect(collapseActions(indexed, project, select('system'))).toEqual({
      collapse: { elements: ['system'], label: 'Collapse "system"' },
    });
    expect(collapseActions(indexed, project, select('store', 'client'))).toEqual({
      expand: { elements: ['store'], label: 'Expand "store"' },
    });
    const both = collapseActions(indexed, project, select('system', 'store', 'service'));
    expect(both.collapse?.label).toBe('Collapse "system"');
    expect(both.expand?.label).toBe('Expand "store"');
    expect(collapseActions(indexed, project, select('client'))).toEqual({});

    const twice = systems();
    const several = collapseActions(
      indexScene(buildScene(twice, 'v')),
      twice,
      select('system', 'store'),
    );
    expect(several.collapse?.label).toBe('Collapse 2 containers');
    expect(collapseDone(several.collapse!, true)).toBe('Collapsed 2 containers.');
    expect(collapseDone({ elements: ['a'], label: 'Expand "A"' }, false)).toBe('Expanded "A".');
  });

  it('makes I1’s command, with the containers sorted and once each', () => {
    expect(setCollapsedCommand('v', ['b', 'a', 'b'], true)).toEqual({
      type: 'set-collapsed',
      view: 'v',
      elements: ['a', 'b'],
      collapsed: true,
    });
  });
});
