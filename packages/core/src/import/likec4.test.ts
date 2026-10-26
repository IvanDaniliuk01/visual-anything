/**
 * The LikeC4 reader (ADR-0042, R36): the model `likec4 export json` writes becomes a plan whose views
 * are scopes with their layout, that applies as one action; hostile models are refused or read safely.
 */
import { describe, expect, it } from 'vitest';
import { shownByScope } from '../scope';
import model from './fixtures/shop.likec4.json';
import { readLikeC4 } from './likec4';
import type { ImportPlan, PlannedView } from './plan';
import { applyPlan, optionsFor, planOf, systemsProject } from './test/apply';
import { cpuNow } from '../test/cpu';

const text = JSON.stringify(model);
const options = optionsFor(systemsProject());

function read(json: string = text): ImportPlan {
  return planOf(readLikeC4(json, 'shop.json', options));
}

function refusal(json: string): string {
  const outcome = readLikeC4(json, 'hostile.json');
  if (outcome.ok) throw new Error('It was read.');
  return outcome.problems.join(' ');
}

function view(plan: ImportPlan, name: string): PlannedView {
  const found = plan.views.find((each) => each.name === name);
  if (!found) throw new Error(`No view "${name}".`);
  return found;
}

describe('readLikeC4', () => {
  const plan = read();

  it('makes the modelâ€™s and the deploymentâ€™s elements elements, nested by their names', () => {
    expect(plan.format).toBe('likec4');
    expect(plan.elements.map((each) => [each.key, each.name, each.kind])).toEqual([
      ['e:shop/customer', 'Customer', 'actor'],
      ['e:shop/shop', 'Shop', 'system'],
      ['e:shop/shop.frontend', 'Frontend', 'container'],
      ['e:shop/shop.backend', 'Backend', 'container'],
      ['e:shop/shop.backend.api', 'API', 'component'],
      ['e:shop/shop.db', 'Orders', 'store'],
      ['e:shop/payments', 'Payments', 'system'],
      ['d:shop/prod', 'Production', 'deploymentNode environment'],
      ['d:shop/prod.vm1', 'VM 1', 'deploymentNode vm'],
      ['d:shop/prod.vm1.api', 'Backend', 'instanceOf'],
      ['d:shop/prod.vm2', 'VM 2', 'deploymentNode vm'],
      ['d:shop/prod.vm2.db', 'Primary orders', 'instanceOf'],
    ]);
    expect(plan.elements.find((each) => each.key === 'e:shop/shop.frontend')).toMatchObject({
      sourceId: 'shop.frontend',
      attributes: {
        technology: 'React',
        tags: ['next'],
        links: ['https://example.com/frontend'],
        owner: 'Web team',
        regions: ['eu', 'us'],
      },
    });
    expect(plan.elements.find((each) => each.key === 'e:shop/shop')?.description).toBe(
      'Sells things online.',
    );
    expect(plan.elements.find((each) => each.key === 'e:shop/shop.backend.api')?.description).toBe(
      'Serves the **frontend**.',
    );
    expect(plan.containment).toEqual(
      [
        ['e:shop/shop.frontend', 'e:shop/shop'],
        ['e:shop/shop.backend', 'e:shop/shop'],
        ['e:shop/shop.backend.api', 'e:shop/shop.backend'],
        ['e:shop/shop.db', 'e:shop/shop'],
        ['d:shop/prod.vm1', 'd:shop/prod'],
        ['d:shop/prod.vm1.api', 'd:shop/prod.vm1'],
        ['d:shop/prod.vm2', 'd:shop/prod'],
        ['d:shop/prod.vm2.db', 'd:shop/prod.vm2'],
      ].map(([element, container]) => ({ element, container })),
    );
  });

  it('suggests components and relation types by kind, and makes relations of the modelâ€™s and the deploymentâ€™s', () => {
    expect(plan.kinds.elements.map((each) => [each.kind, each.count, each.suggested])).toEqual([
      ['actor', 1, 'systems.person'],
      ['system', 2, 'systems.system'],
      ['container', 2, 'systems.service'],
      ['component', 1, 'systems.box'],
      ['store', 1, 'systems.database'],
      ['deploymentNode environment', 1, 'systems.box'],
      ['deploymentNode vm', 2, 'systems.box'],
      ['instanceOf', 2, 'systems.service'],
    ]);
    expect(plan.kinds.relations.map((each) => [each.kind, each.count, each.suggested])).toEqual([
      ['->', 4, 'systems.communicates-with'],
      ['async', 1, 'systems.communicates-with'],
      ['instanceOf', 2, 'relates-to'],
    ]);
    expect(plan.relations.map((each) => [each.key, each.from, each.to, each.name])).toEqual([
      ['r:shop/r1', 'e:shop/customer', 'e:shop/shop.frontend', 'uses'],
      ['r:shop/r2', 'e:shop/shop.frontend', 'e:shop/shop.backend.api', 'calls'],
      ['r:shop/r3', 'e:shop/shop.backend.api', 'e:shop/shop.db', 'reads and writes'],
      ['r:shop/r4', 'e:shop/shop.backend', 'e:shop/payments', 'charges'],
      ['dr:shop/d1', 'd:shop/prod.vm1.api', 'd:shop/prod.vm2.db', 'replicates to'],
      ['instance:d:shop/prod.vm1.api', 'd:shop/prod.vm1.api', 'e:shop/shop.backend', undefined],
      ['instance:d:shop/prod.vm2.db', 'd:shop/prod.vm2.db', 'e:shop/shop.db', undefined],
    ]);
  });

  it('makes each view show what its nodes stand for, where the layout places them', () => {
    expect(plan.views.map((each) => [each.key, each.name, each.shows])).toEqual([
      ['v:shop/index', 'Landscape', ['e:shop/customer', 'e:shop/shop', 'e:shop/payments']],
      [
        'v:shop/shop',
        'Shop containers',
        [
          'e:shop/customer',
          'e:shop/shop',
          'e:shop/shop.frontend',
          'e:shop/shop.backend',
          'e:shop/shop.db',
          'e:shop/payments',
        ],
      ],
      ['v:shop/checkout', 'Checkout flow', ['e:shop/customer', 'e:shop/shop.frontend']],
      [
        'v:shop/prod',
        'Production',
        [
          'd:shop/prod',
          'd:shop/prod.vm1',
          'd:shop/prod.vm1.api',
          'd:shop/prod.vm2',
          'd:shop/prod.vm2.db',
        ],
      ],
    ]);
    expect(view(plan, 'Shop containers').positions).toEqual([
      { element: 'e:shop/customer', x: 24, y: 0, width: 192, height: 108 },
      { element: 'e:shop/shop', x: 0, y: 156, width: 720, height: 180 },
      {
        element: 'e:shop/shop.frontend',
        container: 'e:shop/shop',
        x: 24,
        y: 36,
        width: 192,
        height: 108,
      },
      {
        element: 'e:shop/shop.backend',
        container: 'e:shop/shop',
        x: 264,
        y: 36,
        width: 192,
        height: 108,
      },
      {
        element: 'e:shop/shop.db',
        container: 'e:shop/shop',
        x: 504,
        y: 36,
        width: 192,
        height: 108,
      },
      { element: 'e:shop/payments', x: 804, y: 192, width: 192, height: 108 },
    ]);
    expect(view(plan, 'Shop containers').bendPoints).toEqual([
      { relation: 'r:shop/r1', points: [{ x: 120, y: 144 }] },
    ]);
    expect(view(plan, 'Production').positions).toEqual([
      { element: 'd:shop/prod', x: 0, y: 0, width: 540, height: 240 },
      {
        element: 'd:shop/prod.vm1',
        container: 'd:shop/prod',
        x: 24,
        y: 36,
        width: 228,
        height: 180,
      },
      {
        element: 'd:shop/prod.vm1.api',
        container: 'd:shop/prod.vm1',
        x: 18,
        y: 36,
        width: 192,
        height: 108,
      },
      {
        element: 'd:shop/prod.vm2',
        container: 'd:shop/prod',
        x: 288,
        y: 36,
        width: 228,
        height: 180,
      },
      {
        element: 'd:shop/prod.vm2.db',
        container: 'd:shop/prod.vm2',
        x: 18,
        y: 36,
        width: 192,
        height: 108,
      },
    ]);
  });

  it('reports groups, edges drawn between containers, dynamic steps and links that are not web addresses', () => {
    expect(plan.unmatched).toEqual([
      { text: 'vscode://file/frontend', why: 'A link that is not a web address is left out.' },
      {
        text: 'uses',
        why: 'It is drawn between containers of its ends; it shows in views that show its ends.',
      },
      {
        text: 'charges',
        why: 'It is drawn between containers of its ends; it shows in views that show its ends.',
      },
      {
        text: 'Third parties',
        why: 'Groups are left out; what they hold sits in the view without them.',
      },
      {
        text: 'calls',
        why: 'It is drawn between containers of its ends; it shows in views that show its ends.',
      },
      {
        text: 'shows the cart',
        why: 'A step that no relation of the model stands for is left out.',
      },
      {
        text: 'Checkout flow',
        why: 'The order of its steps is left out; a scenario can be recorded over the view.',
      },
    ]);
  });

  it('applies as one action that one undo takes back, each view a scope with its positions', () => {
    const { state, ids } = applyPlan(systemsProject(), plan);
    expect(ids.get('e:shop/shop.frontend')).toBe('shop.frontend');
    const shop = state.views.find((each) => each.id === ids.get('v:shop/shop'))!;
    expect(shownByScope(state, shop).elements).toHaveLength(7);
    expect(shop.positions).toContainEqual({
      element: 'shop.backend',
      container: 'shop',
      x: 264,
      y: 36,
      width: 192,
      height: 108,
      pinned: true,
    });
    expect(shop.routes?.r1?.bendPoints).toEqual([{ x: 120, y: 144 }]);
    expect(shownByScope(state, shop).relation('r4')).toBe(true);
    expect(shownByScope(state, shop).relation('r2')).toBe(false);
  });
});

describe('readLikeC4, on hostile models', () => {
  it('refuses what is not a LikeC4 model, with where it is wrong', () => {
    expect(refusal('{')).toBe('The file is not JSON.');
    expect(refusal('{"views": {}}')).toBe('The file is not a LikeC4 model: it has no elements.');
    expect(refusal('[]')).toBe('The file is not a LikeC4 model: it has no elements.');
    expect(refusal('{"elements": {"a": {"id": "a", "title": "A"}}}')).toBe(
      'The LikeC4 model\'s "elements.a.kind" is not what LikeC4 writes.',
    );
  });

  it('reads a relation to an element that does not exist as matching nothing', () => {
    const plan = read(
      JSON.stringify({
        elements: { a: { id: 'a', kind: 'system', title: 'A' } },
        relations: {
          r: { id: 'r', source: { model: 'a' }, target: { model: 'ghost' }, title: 'calls' },
        },
      }),
    );
    expect(plan.relations).toEqual([]);
    expect(plan.unmatched).toEqual([
      { text: 'calls', why: 'It ends on "ghost", which the model does not hold.' },
    ]);
  });

  it('never finds what every object inherits, by a kind, a metadata name or a project', () => {
    // Written out, since an object literal would take __proto__ as its prototype.
    const plan = read(
      '{"projectId": "__proto__", "elements": {' +
        '"a": {"id": "a", "kind": "constructor", "title": "<b>A</b>", "metadata": {"__proto__": "x", "toString": "y"}},' +
        '"b": {"id": "b", "kind": "__proto__", "title": "B"}}, ' +
        '"specification": {"elements": {"toString": {"style": {"shape": "person"}}}}, ' +
        '"relations": {"r": {"id": "r", "source": {"model": "a"}, "target": {"model": "b"}, "kind": "hasOwnProperty"}}}',
    );
    expect(plan.elements.map((each) => [each.kind, each.name])).toEqual([
      ['"constructor"', '<b>A</b>'],
      ['"__proto__"', 'B'],
    ]);
    expect(plan.kinds.elements.map((each) => each.label)).toEqual(['constructor', '__proto__']);
    expect(plan.kinds.relations.map((each) => each.kind)).toEqual(['"hasOwnProperty"']);
    const attributes = plan.elements[0]?.attributes as Record<string, unknown>;
    expect(Object.keys(attributes)).toEqual(['__proto__', 'toString']);
    expect(Object.getPrototypeOf(attributes)).toBe(Object.prototype);
    applyPlan(systemsProject(), plan);
  });

  it('refuses a name too long or too deep, and more elements than an import brings, before reading them', () => {
    const long = 'a.'.repeat(50_000) + 'a';
    let started = cpuNow();
    expect(
      refusal(JSON.stringify({ elements: { [long]: { id: long, kind: 'box', title: 'Long' } } })),
    ).toBe(
      `The LikeC4 model holds a name over 256 characters or 32 levels deep: "${'a.'.repeat(79)}a…".`,
    );
    expect(cpuNow() - started).toBeLessThan(2_000);
    const deep = Array.from({ length: 34 }, (_, at) => `n${at}`).join('.');
    expect(refusal(JSON.stringify({ elements: { x: { id: deep, kind: 'box' } } }))).toMatch(
      /^The LikeC4 model holds a name over 256 characters or 32 levels deep/,
    );
    const elements = Object.fromEntries(
      Array.from({ length: 20_001 }, (_, at) => [`e${at}`, { id: `e${at}`, kind: 'box' }]),
    );
    started = cpuNow();
    expect(refusal(JSON.stringify({ elements, relations: {} }))).toBe(
      'The file holds 20,001 elements; an import brings at most 20,000.',
    );
    expect(cpuNow() - started).toBeLessThan(2_000);
  });

  it('places an element whose parents the model leaves out inside the nearest one it holds', () => {
    const elements = Object.fromEntries([
      ['r', { id: 'r', kind: 'system', title: 'R' }],
      ...Array.from({ length: 1000 }, (_, at): [string, object] => [
        `r.m.n.e${at}`,
        { id: `r.m.n.e${at}`, kind: 'container' },
      ]),
    ]);
    const plan = read(JSON.stringify({ elements, relations: {} }));
    expect(plan.containment).toHaveLength(1000);
    expect(plan.containment.every((each) => each.container === 'e:project-1/r')).toBe(true);
    expect(plan.elements[1]?.name).toBe('e0');
  });

  it('brings at most 500 views, and at most 200,000 shapes across them', () => {
    const elements = Object.fromEntries(
      Array.from({ length: 20_000 }, (_, at) => [
        `e${at}`,
        { id: `e${at}`, kind: 'box', title: `E${at}` },
      ]),
    );
    const nodes = Array.from({ length: 20_000 }, (_, at) => ({ id: `e${at}`, modelRef: `e${at}` }));
    const views = Object.fromEntries(
      Array.from({ length: 12 }, (_, at) => [
        `v${at}`,
        { id: `v${at}`, title: `View ${at}`, nodes, edges: [] },
      ]),
    );
    const started = cpuNow();
    const plan = read(JSON.stringify({ elements, relations: {}, views }));
    expect(plan.views).toHaveLength(10);
    expect(plan.unmatched).toEqual([
      {
        text: 'View 10',
        why: 'The view is left out: the views would show over 200,000 shapes in all.',
      },
      {
        text: 'View 11',
        why: 'The view is left out: the views would show over 200,000 shapes in all.',
      },
    ]);
    expect(cpuNow() - started).toBeLessThan(10_000);
    const many = Object.fromEntries(
      Array.from({ length: 501 }, (_, at) => [`v${at}`, { id: `v${at}`, nodes: [], edges: [] }]),
    );
    const capped = read(JSON.stringify({ elements: {}, relations: {}, views: many }));
    expect(capped.views).toHaveLength(500);
    expect(capped.unmatched).toEqual([
      { text: 'v500', why: 'The view is left out: an import brings at most 500 views.' },
    ]);
  }, 60_000);
});
