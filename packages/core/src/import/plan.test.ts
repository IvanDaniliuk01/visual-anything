/**
 * An import plan becomes one batch command (ADR-0042): ids kept from the file when free, kinds mapped
 * to components and relation types, containment, views with their scope, positions and bend points,
 * and refusals when something is left unmapped or past the limits.
 */
import { describe, expect, it } from 'vitest';
import { executeCommand } from '../commands';
import { applyOperations } from '../operations';
import { shownByScope } from '../scope';
import { sequentialIds, testProject } from '../test/fixtures';
import { IMPORT_LIMITS, planToCommand, type ImportMapping, type ImportPlan } from './plan';

function plan(): ImportPlan {
  return {
    format: 'test',
    source: 'checkout.drawio',
    elements: [
      { key: 'shop', sourceId: 'shop', name: 'Shop', kind: 'box' },
      { key: 'cart', sourceId: 'api', name: 'Cart', kind: 'service' },
      { key: 'orders', name: 'Orders', kind: 'db', attributes: { engine: 'Postgres' } },
    ],
    relations: [{ key: 'e1', sourceId: '7', from: 'cart', to: 'orders', kind: 'arrow' }],
    containment: [
      { element: 'cart', container: 'shop' },
      { element: 'orders', container: 'shop' },
    ],
    views: [
      {
        key: 'page-1',
        name: 'Checkout',
        shows: ['shop', 'cart'],
        positions: [
          { element: 'shop', x: 0, y: 0, width: 400, height: 300 },
          { element: 'cart', container: 'shop', x: 24, y: 48 },
        ],
        bendPoints: [{ relation: 'e1', points: [{ x: 120, y: 200 }] }],
      },
    ],
    kinds: { elements: [], relations: [] },
    unmatched: [{ text: '<image>', why: 'Images in imports are left out.' }],
  };
}

const MAPPING: ImportMapping = {
  elements: { box: 'test.box', service: 'test.service', db: 'test.database' },
  relations: { arrow: 'test.calls' },
  nesting: 'test.inside',
};

describe('planToCommand', () => {
  it('makes one batch, named after the file, that applies cleanly and undoes exactly', () => {
    const state = testProject();
    const planned = planToCommand(state, plan(), MAPPING, sequentialIds());
    if (!planned.ok) throw new Error(planned.problems.join(' '));
    expect(planned.command.label).toBe('Import "checkout.drawio"');
    const outcome = executeCommand(state, planned.command, { newId: sequentialIds() });
    if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
    expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(state);

    const shop = planned.ids.get('shop');
    const cart = planned.ids.get('cart');
    // A free id from the file is kept; one taken in the project ("api") is not.
    expect(shop).toBe('shop');
    expect(cart).not.toBe('api');
    const elements = outcome.state.model.elements;
    expect(elements.find((element) => element.id === cart)).toMatchObject({
      component: 'test.service',
      name: 'Cart',
    });
    expect(
      outcome.state.model.relations.some(
        (relation) =>
          relation.relationType === 'test.inside' && relation.from === cart && relation.to === shop,
      ),
    ).toBe(true);
    const view = outcome.state.views.find((each) => each.id === planned.ids.get('page-1'))!;
    expect(view.nestingRelationTypes).toEqual(['test.inside']);
    expect([...shownByScope(outcome.state, view).elements]).toEqual(['world', shop, cart]);
    expect(view.positions).toContainEqual({
      element: cart,
      container: shop,
      x: 24,
      y: 48,
      pinned: true,
    });
    expect(view.routes?.[planned.ids.get('e1')!]?.bendPoints).toEqual([{ x: 120, y: 200 }]);
  });

  it('updates an element it matched, leaving the rest of it', () => {
    const state = testProject();
    const again: ImportPlan = {
      ...plan(),
      elements: [
        {
          key: 'api',
          name: 'API v2',
          kind: 'service',
          existing: 'api',
          attributes: { latency: 5 },
        },
      ],
      relations: [],
      containment: [],
      views: [],
    };
    const planned = planToCommand(state, again, MAPPING, sequentialIds());
    if (!planned.ok) throw new Error(planned.problems.join(' '));
    const outcome = executeCommand(state, planned.command, { newId: sequentialIds() });
    if (!outcome.ok) throw new Error('refused');
    expect(outcome.state.model.elements.find((element) => element.id === 'api')).toMatchObject({
      name: 'API v2',
      attributes: { latency: 5 },
    });
    expect(outcome.state.views[0]?.positions).toEqual(state.views[0]?.positions);
  });

  it('refuses kinds left unmapped, a component no package defines, unknown ends and the limits', () => {
    const state = testProject();
    const missing = planToCommand(state, plan(), { ...MAPPING, elements: { box: 'test.box' } });
    expect(missing.ok).toBe(false);
    expect(!missing.ok && missing.problems).toContain('No component is chosen for "service".');
    const unknown = planToCommand(state, plan(), {
      ...MAPPING,
      elements: { ...MAPPING.elements, box: 'nope.box' },
    });
    expect(!unknown.ok && unknown.problems).toContain(
      'No package in use defines the component "nope.box".',
    );
    const loose = planToCommand(
      state,
      { ...plan(), relations: [{ key: 'x', from: 'cart', to: 'ghost', kind: 'arrow' }] },
      MAPPING,
    );
    expect(!loose.ok && loose.problems).toContain(
      'The relation "x" ends on something the plan does not hold.',
    );
    const nowhere = planToCommand(state, plan(), { ...MAPPING, nesting: undefined });
    expect(!nowhere.ok && nowhere.problems).toContain(
      'No relation type that nests is chosen for what sits inside what.',
    );
    const huge = planToCommand(
      state,
      {
        ...plan(),
        elements: Array.from({ length: IMPORT_LIMITS.elements + 1 }, (_, at) => ({
          key: `e${at}`,
          name: `E${at}`,
          kind: 'box',
        })),
        relations: [],
        containment: [],
        views: [],
      },
      MAPPING,
    );
    expect(!huge.ok && huge.problems[0]).toMatch(/an import brings at most 20,000/);
  });
});

describe('planToCommand, past its limits', () => {
  it('counts what sits inside what as relations, once each, and caps views, positions and bend points', () => {
    const state = testProject();
    const many = Array.from({ length: 20_000 }, (_, at) => ({
      key: `e${at}`,
      name: `E${at}`,
      kind: 'box',
    }));
    // The same pair many times becomes one relation.
    const repeated = planToCommand(
      state,
      {
        ...plan(),
        containment: Array.from({ length: 5 }, () => ({ element: 'cart', container: 'shop' })),
      },
      MAPPING,
      sequentialIds(),
    );
    if (!repeated.ok) throw new Error(repeated.problems.join(' '));
    const nestings = repeated.command.commands.filter(
      (each) => each.type === 'create-relation' && each.relation.relationType === 'test.inside',
    );
    expect(nestings).toHaveLength(1);
    // What sits inside what counts toward the relations: 20,000 elements, each inside three others.
    const containment = many.flatMap((_, at) =>
      [1, 2, 3].map((step) => ({ element: `e${at}`, container: `e${(at + step) % many.length}` })),
    );
    const contained = planToCommand(
      state,
      { ...plan(), elements: many, relations: [], views: [], containment },
      MAPPING,
    );
    expect(!contained.ok && contained.problems.join(' ')).toMatch(
      /60,000 relations, those that put one thing inside another included/,
    );
    const views = planToCommand(
      state,
      {
        ...plan(),
        views: Array.from({ length: IMPORT_LIMITS.views + 1 }, (_, at) => ({
          key: `v${at}`,
          name: `V${at}`,
        })),
      },
      MAPPING,
    );
    expect(!views.ok && views.problems.join(' ')).toMatch(/an import brings at most 500/);
    const places = planToCommand(
      state,
      {
        ...plan(),
        views: [
          {
            key: 'v',
            name: 'V',
            bendPoints: [
              {
                relation: 'e1',
                points: Array.from({ length: IMPORT_LIMITS.places + 1 }, () => ({ x: 0, y: 0 })),
              },
            ],
          },
        ],
      },
      MAPPING,
    );
    expect(!places.ok && places.problems.join(' ')).toMatch(/positions and bend points/);
  });
});

describe('planToCommand, on what a mapping or a file can get wrong', () => {
  it('reads a mapping by its own entries only, never by what every object inherits', () => {
    const state = testProject();
    const named = planToCommand(
      state,
      {
        ...plan(),
        elements: [{ key: 'x', name: 'X', kind: 'toString' }],
        relations: [],
        containment: [],
        views: [],
      },
      MAPPING,
    );
    expect(!named.ok && named.problems).toEqual(['No component is chosen for "toString".']);
  });

  it('refuses a relation type no package defines, and a nesting relation type that does not nest', () => {
    const state = testProject();
    const unknown = planToCommand(state, plan(), {
      ...MAPPING,
      relations: { arrow: 'nope.link' },
    });
    expect(!unknown.ok && unknown.problems).toContain(
      'No package in use defines the relation type "nope.link".',
    );
    const flat = planToCommand(state, plan(), { ...MAPPING, nesting: 'test.calls' });
    expect(!flat.ok && flat.problems).toContain('The relation type "test.calls" does not nest.');
  });

  it('leaves out, and says so, positions inside what draws rows and bend points of what nests', () => {
    const state = testProject();
    state.packages = [
      {
        ...state.packages[0]!,
        components: [
          ...state.packages[0]!.components,
          {
            id: 'test.table',
            name: 'Table',
            derivesFrom: 'essence',
            appearance: { contentsAsRows: true },
          },
        ],
      },
    ];
    const rows: ImportPlan = {
      ...plan(),
      elements: [
        { key: 'users', name: 'users', kind: 'table' },
        { key: 'id', name: 'id', kind: 'box' },
        { key: 'shop', name: 'Shop', kind: 'box' },
      ],
      relations: [{ key: 'in', from: 'id', to: 'shop', kind: 'part' }],
      containment: [{ element: 'id', container: 'users' }],
      views: [
        {
          key: 'v',
          name: 'Tables',
          description: 'What the database holds.',
          positions: [
            { element: 'users', x: 0, y: 0 },
            { element: 'id', container: 'users', x: 0, y: 40 },
          ],
          bendPoints: [{ relation: 'in', points: [{ x: 10, y: 10 }] }],
        },
      ],
    };
    const planned = planToCommand(
      state,
      rows,
      {
        elements: { table: 'test.table', box: 'test.box' },
        relations: { part: 'test.inside' },
        nesting: 'test.inside',
      },
      sequentialIds(),
    );
    if (!planned.ok) throw new Error(planned.problems.join(' '));
    expect(planned.notes).toEqual([
      '1 position in "Tables" left out: rows take their place from their table.',
      'The bend points of a relation in "Tables" left out: it puts one thing inside another.',
    ]);
    const outcome = executeCommand(state, planned.command, { newId: sequentialIds() });
    if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
    const view = outcome.state.views.find((each) => each.id === planned.ids.get('v'))!;
    expect(view.description).toBe('What the database holds.');
    expect(view.positions.map((position) => position.element)).toEqual([planned.ids.get('users')]);
  });
});

describe('planToCommand, on a large plan', () => {
  it('stays linear: 40,000 relations, each with a bend point in one view', () => {
    const state = testProject();
    const elements = Array.from({ length: 2_000 }, (_, at) => ({
      key: `e${at}`,
      name: `E${at}`,
      kind: 'box',
    }));
    const relations = Array.from({ length: 40_000 }, (_, at) => ({
      key: `r${at}`,
      from: `e${at % 2_000}`,
      to: `e${(at * 7 + 1) % 2_000}`,
      kind: 'arrow',
    }));
    const big: ImportPlan = {
      ...plan(),
      elements,
      relations,
      containment: [],
      views: [
        {
          key: 'v',
          name: 'All',
          bendPoints: relations.map((relation) => ({
            relation: relation.key,
            points: [{ x: 1, y: 2 }],
          })),
        },
      ],
    };
    const start = Date.now();
    const planned = planToCommand(state, big, MAPPING, sequentialIds());
    expect(planned.ok).toBe(true);
    expect(Date.now() - start).toBeLessThan(3_000);
  });
});
