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
    const nowhere = planToCommand(state, plan(), { ...MAPPING, nesting: undefined } as never);
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
