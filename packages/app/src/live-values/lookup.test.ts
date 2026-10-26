/**
 * The attribute lookup (ADR 0057): live over computed over stored over default, read the same way by
 * the detail on the canvas and by filters, each value from outside with its mark.
 */
import {
  SYSTEMS,
  builtinPackage,
  definitionsIn,
  type LiveValue,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id, PackageFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { applyFilters, filterChoices, NO_FILTERS } from '../canvas/explore';
import { buildScene } from '../canvas/scene';
import type { ElementAnswers } from '../code/messages';
import { t } from '../i18n';
import { NO_LIVE_VALUES, type LiveView } from './book';
import { liveSceneOf } from './details';
import { AttributeLookup } from './lookup';

const OPS: PackageFile = {
  id: 'ops',
  name: 'Ops',
  components: [
    {
      id: 'ops.service',
      name: 'Service',
      derivesFrom: 'systems.service',
      attributes: [
        { name: 'latency', type: 'number', unit: 'ms', default: 0 },
        { name: 'tier', type: 'string', default: 'bronze' },
      ],
      appearance: { detail: { attributes: ['latency', 'tier'] } },
    },
  ],
  relationTypes: [],
};

function project(): ProjectSnapshot {
  return {
    project: { schemaVersion: 1, name: 'Ops', packages: ['systems', 'ops'] },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [
        { id: 'api', component: 'ops.service', name: 'API', attributes: { latency: 120 } },
        { id: 'web', component: 'ops.service', name: 'Web' },
        { id: 'db', component: 'systems.database', name: 'DB' },
      ],
      relations: [
        { id: 'api-reads-db', relationType: 'systems.reads-from', from: 'api', to: 'db' },
      ],
    },
    packages: [builtinPackage(SYSTEMS.id) ?? SYSTEMS, OPS],
    views: [
      {
        id: 'v',
        name: 'Overview',
        perspective: { name: 'Overview' },
        nestingRelationTypes: [],
        positions: [],
        freeShapes: [],
      },
    ],
    scenarios: [],
    tours: [],
    comments: [],
  };
}

function viewOf(values: LiveValue[], now = 20_000): LiveView {
  const byTarget = new Map<Id, Map<string, LiveValue>>();
  for (const each of values) {
    let map = byTarget.get(each.target);
    if (!map) byTarget.set(each.target, (map = new Map<string, LiveValue>()));
    map.set(each.attribute, each);
  }
  return {
    version: 1,
    now,
    of: (target) => byTarget.get(target),
    targets: new Set(byTarget.keys()),
    size: values.length,
  };
}

function live(
  target: string,
  attribute: string,
  value: LiveValue['value'],
  arrivedAt = 10_000,
): LiveValue {
  return { target, attribute, value, sender: { kind: 'claude' }, arrivedAt, freshFor: 60_000 };
}

const computedTier: ReadonlyMap<Id, ElementAnswers> = new Map([
  [
    'web',
    { element: 'web', attributes: [{ name: 'tier', value: 'gold', package: 'ops' }], problems: [] },
  ],
]);

describe('AttributeLookup', () => {
  const state = project();
  const definitions = definitionsIn(state);
  const api = { kind: 'element', element: state.model.elements[0]! } as const;
  const web = { kind: 'element', element: state.model.elements[1]! } as const;

  it('reads live over computed over stored over default, with where each comes from', () => {
    const lookup = new AttributeLookup(viewOf([live('api', 'latency', 95)]), computedTier);
    expect(lookup.read(api, 'latency', definitions)).toMatchObject({ value: 95, origin: 'live' });
    expect(lookup.read(api, 'tier', definitions)).toEqual({
      name: 'tier',
      value: 'bronze',
      origin: 'default',
    });
    expect(lookup.read(web, 'tier', definitions)).toEqual({
      name: 'tier',
      value: 'gold',
      origin: 'computed',
      package: 'ops',
    });
    expect(new AttributeLookup().read(api, 'latency', definitions)).toMatchObject({
      value: 120,
      origin: 'stored',
    });
    expect(lookup.overrides('api')).toBe(true);
    expect(lookup.overrides('db')).toBe(false);
  });
});

describe('what changed between two lookups', () => {
  it('names the targets whose live values or computed values changed, when it can tell', () => {
    const before = viewOf([live('api', 'latency', 95)]);
    const after: LiveView = {
      ...viewOf([live('api', 'latency', 95), live('web', 'latency', 3)]),
      changedSince: (view) => (view === before ? new Set(['web']) : undefined),
    };
    const first = new AttributeLookup(before, computedTier);
    expect(first.changedSince(first)).toEqual(new Set());
    expect(new AttributeLookup(after, computedTier).changedSince(first)).toEqual(new Set(['web']));
    // Package code answering anew for the API: it is named too.
    const answered: ReadonlyMap<Id, ElementAnswers> = new Map([
      ...computedTier,
      [
        'api',
        {
          element: 'api',
          attributes: [{ name: 'tier', value: 'silver', package: 'ops' }],
          problems: [],
        },
      ],
    ]);
    expect(new AttributeLookup(before, answered).changedSince(first)).toEqual(new Set(['api']));
    // Its answers for Web gone, and Web's live value new: Web, once.
    expect(new AttributeLookup(after, new Map()).changedSince(first)).toEqual(new Set(['web']));
    // A view that cannot say what changed since.
    expect(new AttributeLookup(viewOf([])).changedSince(first)).toBeUndefined();
  });
});

describe('the detail on the canvas', () => {
  const state = project();
  const definitions = definitionsIn(state);
  const scene = buildScene(state, 'v');
  const detailOf = (drawn: typeof scene, id: string) =>
    drawn.shapes.find((shape) => shape.element === id)?.detail;

  it('writes stored values as the view does, and leaves the scene as it is without values from outside', () => {
    expect(detailOf(scene, 'api')).toBe('Service · 120 ms · bronze');
    expect(liveSceneOf(scene, state, definitions, new AttributeLookup(NO_LIVE_VALUES), t)).toBe(
      scene,
    );
  });

  it('writes a live value with its mark, and a stale one faded with its age', () => {
    const fresh = liveSceneOf(
      scene,
      state,
      definitions,
      new AttributeLookup(viewOf([live('api', 'latency', 95)], 20_000)),
      t,
    );
    expect(detailOf(fresh, 'api')).toBe('Service · ● 95 ms · bronze');
    const stale = liveSceneOf(
      scene,
      state,
      definitions,
      new AttributeLookup(viewOf([live('api', 'latency', 95)], 10_000 + 3 * 60_000 + 1)),
      t,
    );
    expect(detailOf(stale, 'api')).toBe('Service · ○ 95 ms (3 min) · bronze');
  });

  it('writes a computed value with its mark', () => {
    const drawn = liveSceneOf(
      scene,
      state,
      definitions,
      new AttributeLookup(NO_LIVE_VALUES, computedTier),
      t,
    );
    expect(detailOf(drawn, 'web')).toBe('Service · 0 ms · ƒ gold');
  });

  it('changes only the shapes whose detail reads otherwise, the same objects for the same values', () => {
    const lookup = new AttributeLookup(viewOf([live('api', 'latency', 95)]));
    const drawn = liveSceneOf(scene, state, definitions, lookup, t);
    drawn.shapes.forEach((shape, at) => {
      const was = scene.shapes[at]!;
      if (shape.element === 'api') {
        expect(shape).not.toBe(was);
        expect(shape.rect).toBe(was.rect);
        expect(shape.key).toBe(was.key);
      } else expect(shape).toBe(was);
    });
    const again = liveSceneOf(
      scene,
      state,
      definitions,
      new AttributeLookup(viewOf([live('api', 'latency', 95)])),
      t,
    );
    expect(again).toBe(drawn);
  });
});

describe('filters', () => {
  const state = project();
  const scene = buildScene(state, 'v');
  const hidden = (lookup?: AttributeLookup) =>
    [
      ...applyFilters(
        scene,
        state,
        {
          ...NO_FILTERS,
          conditions: [{ of: 'elements', attribute: 'latency', test: 'above', value: '100' }],
        },
        lookup,
      ).hidden,
    ].sort();

  it('read live values over stored ones', () => {
    expect(hidden()).toEqual(['api-reads-db', 'db', 'web']);
    expect(
      hidden(
        new AttributeLookup(viewOf([live('api', 'latency', 95), live('web', 'latency', 300)])),
      ),
    ).toEqual(['api', 'api-reads-db', 'db']);
  });

  it('offer the attributes only live values give', () => {
    const lookup = new AttributeLookup(
      viewOf([live('db', 'connections', 12), live('api-reads-db', 'calls', 3)]),
    );
    const choices = filterChoices(scene, state, lookup);
    expect(choices.attributes.elements).toContain('connections');
    expect(choices.attributes.relations).toContain('calls');
  });
});
