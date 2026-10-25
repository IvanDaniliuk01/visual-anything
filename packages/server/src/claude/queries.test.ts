import type { ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { testProject } from '../test-support';
import {
  MAX_RESULTS,
  describeItem,
  findElements,
  findRelations,
  idKind,
  listDefinitions,
  readScenario,
  readView,
  summarizeProject,
} from './queries';

const shop = testProject();

describe('summarizeProject', () => {
  it('gives the project in brief', () => {
    expect(summarizeProject(shop)).toMatchObject({
      name: 'Shop',
      world: { id: 'world', name: 'World' },
      packages: [
        { id: 'systems', name: 'Systems', builtIn: true },
        { id: 'shop', name: 'Shop', builtIn: false, components: 1, relationTypes: 1 },
      ],
      counts: { elements: 5, relations: 4, views: 1, scenarios: 1 },
      nestingRelationTypes: ['systems.is-part-of'],
      views: [
        {
          id: 'overview',
          name: 'Overview',
          perspective: 'Data flow',
          nestingRelationTypes: ['systems.is-part-of'],
          positions: 4,
        },
      ],
      scenarios: [{ id: 'request', name: 'A request', view: 'overview', steps: 2, brokenSteps: 0 }],
      directlyInWorld: {
        total: 3,
        elements: [
          { id: 'system', name: 'Shop system', component: 'systems.system' },
          { id: 'customer', name: 'Customer', component: 'systems.person' },
          { id: 'cart', name: 'Cart', component: 'shop.cart' },
        ],
      },
    });
  });
});

describe('listDefinitions', () => {
  it('lists every component and relation type in use, Essence and "relates to" first', () => {
    const { components, relationTypes } = listDefinitions(shop);
    expect(components[0]).toMatchObject({ id: 'essence', package: null, derivesFrom: null });
    expect(relationTypes[0]).toMatchObject({ id: 'relates-to', package: null });
    expect(components.find((each) => each.id === 'shop.cart')).toMatchObject({
      name: 'Cart',
      package: 'shop',
      derivesFrom: 'systems.box',
      attributes: expect.arrayContaining([
        { name: 'items', type: 'number', default: 0 },
      ]) as unknown,
    });
    expect(relationTypes.find((each) => each.id === 'systems.is-part-of')).toMatchObject({
      nests: true,
      direction: 'directed',
    });
  });

  it('lists the definitions of one package', () => {
    const { components, relationTypes } = listDefinitions(shop, { package: 'shop' });
    expect(components.map((each) => each.id)).toEqual(['shop.cart']);
    expect(relationTypes.map((each) => each.id)).toEqual(['shop.holds']);
  });
});

describe('findElements', () => {
  const ids = (result: ReturnType<typeof findElements>) => result.elements.map((each) => each.id);

  it('finds elements created from a component or one deriving from it', () => {
    expect(ids(findElements(shop, { component: 'systems.box' }))).toEqual([
      'system',
      'api',
      'db',
      'cart',
    ]);
    expect(ids(findElements(shop, { component: 'systems.box', exactComponent: true }))).toEqual([]);
  });

  it('finds elements by attribute, and by its value', () => {
    expect(ids(findElements(shop, { attribute: { name: 'owner' } }))).toEqual(['api']);
    expect(ids(findElements(shop, { attribute: { name: 'owner', equals: 'Team B' } }))).toEqual([]);
  });

  it('finds what sits inside a container, directly or at any depth, and what sits in World', () => {
    expect(ids(findElements(shop, { container: 'system' }))).toEqual(['api', 'db']);
    expect(ids(findElements(shop, { container: 'world' }))).toEqual(['system', 'customer', 'cart']);
  });

  it('finds what lies deeper with deep', () => {
    const nested: ProjectSnapshot = {
      ...shop,
      model: {
        ...shop.model,
        elements: [...shop.model.elements, { id: 'table', component: 'systems.box', name: 'T' }],
        relations: [
          ...shop.model.relations,
          { id: 'table-in-db', relationType: 'systems.is-part-of', from: 'table', to: 'db' },
        ],
      },
    };
    expect(ids(findElements(nested, { container: 'system' }))).toEqual(['api', 'db']);
    expect(ids(findElements(nested, { container: 'system', deep: true }))).toEqual([
      'api',
      'db',
      'table',
    ]);
  });

  it('finds elements by name, whatever its case', () => {
    expect(ids(findElements(shop, { nameContains: 'SHOP' }))).toEqual(['system']);
  });

  it('pages through what it finds, at most the largest page', () => {
    const page = findElements(shop, { limit: 2, offset: 1 });
    expect(page).toMatchObject({ total: 5, offset: 1 });
    expect(ids(page)).toEqual(['api', 'db']);
    expect(findElements(shop, { limit: MAX_RESULTS * 10 }).elements).toHaveLength(5);
  });

  it('gives each element its containers and its attributes', () => {
    expect(findElements(shop, { nameContains: 'API' }).elements).toEqual([
      {
        id: 'api',
        name: 'API',
        component: 'systems.service',
        containers: ['system'],
        attributes: { owner: 'Team A' },
      },
    ]);
  });
});

describe('findRelations', () => {
  it('finds relations by type, deriving ones included, and by their ends', () => {
    const touching = findRelations(shop, { touching: 'api' }).relations.map((each) => each.id);
    expect(touching).toEqual(['api-in-system', 'customer-calls-api', 'api-reads-db']);
    expect(findRelations(shop, { relationType: 'relates-to' }).total).toBe(4);
    expect(findRelations(shop, { relationType: 'systems.reads-from', from: 'api' })).toEqual({
      total: 1,
      offset: 0,
      relations: [
        {
          id: 'api-reads-db',
          relationType: 'systems.reads-from',
          from: 'api',
          to: 'db',
          fromName: 'API',
          toName: 'DB',
        },
      ],
    });
  });

  it('finds relations by name', () => {
    expect(findRelations(shop, { nameContains: 'https' }).relations.map((each) => each.id)).toEqual(
      ['customer-calls-api'],
    );
  });
});

describe('describeItem', () => {
  it('describes an element with its containers, contents and relations', () => {
    expect(describeItem(shop, 'api')).toMatchObject({
      kind: 'element',
      id: 'api',
      name: 'API',
      componentName: 'Service',
      attributes: { owner: 'Team A' },
      containers: [
        {
          id: 'system',
          name: 'Shop system',
          relation: 'api-in-system',
          relationType: 'systems.is-part-of',
        },
      ],
      contents: [],
      relationsTo: [{ id: 'customer-calls-api', fromName: 'Customer', name: 'HTTPS' }],
      inViews: ['overview'],
    });
    expect(describeItem(shop, 'system')).toMatchObject({
      contents: [
        { id: 'api', name: 'API' },
        { id: 'db', name: 'DB' },
      ],
    });
  });

  it('describes a relation with its ends and the scenario steps that use it', () => {
    expect(describeItem(shop, 'api-reads-db')).toMatchObject({
      kind: 'relation',
      relationTypeName: 'reads from',
      fromName: 'API',
      toName: 'DB',
      inScenarios: [{ scenario: 'request', step: 'read' }],
    });
  });

  it('says nothing about an id the model lacks', () => {
    expect(describeItem(shop, 'nothing')).toBeUndefined();
  });
});

describe('readView', () => {
  it('reads a view with its positions and the order it draws each container, back to front', () => {
    const stacked: ProjectSnapshot = {
      ...shop,
      views: shop.views.map((view) => ({ ...view, stackingOrder: { system: ['db'] } })),
    };
    const view = readView(stacked, 'overview');
    expect(view).toMatchObject({
      id: 'overview',
      arrangedBy: ['systems.is-part-of'],
      positions: shop.views[0]?.positions,
      freeShapes: shop.views[0]?.freeShapes,
    });
    expect(view?.stacking).toEqual([
      { container: 'world', name: 'World', backToFront: ['system', 'customer', 'cart'] },
      { container: 'system', name: 'Shop system', backToFront: ['db', 'api'] },
    ]);
  });

  it('says nothing about a view the project lacks', () => {
    expect(readView(shop, 'nothing')).toBeUndefined();
  });
});

describe('readScenario', () => {
  it('reads each step with its relations, and marks broken steps', () => {
    const broken: ProjectSnapshot = {
      ...shop,
      model: {
        ...shop.model,
        relations: shop.model.relations.filter((relation) => relation.id !== 'api-reads-db'),
      },
    };
    const scenario = readScenario(broken, 'request');
    expect(scenario?.steps).toEqual([
      {
        number: 1,
        id: 'call',
        description: 'The customer calls the API.',
        relations: [
          {
            id: 'customer-calls-api',
            relationType: 'systems.communicates-with',
            from: 'customer',
            to: 'api',
            name: 'HTTPS',
            fromName: 'Customer',
            toName: 'API',
          },
        ],
        broken: false,
      },
      {
        number: 2,
        id: 'read',
        description: 'The API reads the DB.',
        relations: [{ id: 'api-reads-db', missing: true }],
        broken: true,
        dataOut: { rows: 3 },
      },
    ]);
    expect(scenario?.brokenSteps).toEqual([{ number: 2, step: 'read', missing: ['api-reads-db'] }]);
    expect(scenario?.playsAs).toEqual({ steps: 2, aggregated: [] });
  });

  it('says which steps play as one inside a container the view collapses', () => {
    const collapsed: ProjectSnapshot = {
      ...shop,
      views: shop.views.map((view) => ({ ...view, collapsed: ['system'] })),
    };
    expect(readScenario(collapsed, 'request')?.playsAs).toEqual({
      steps: 2,
      aggregated: [{ steps: [2], container: 'system', containerName: 'Shop system' }],
    });
  });
});

describe('idKind', () => {
  it('tells elements, relations and free shapes apart', () => {
    expect(idKind(shop, 'world')).toBe('element');
    expect(idKind(shop, 'api')).toBe('element');
    expect(idKind(shop, 'api-reads-db')).toBe('relation');
    expect(idKind(shop, 'note')).toBe('free-shape');
    expect(idKind(shop, 'nothing')).toBeUndefined();
  });
});
