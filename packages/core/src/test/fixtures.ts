/** Projects and packages for the core's tests. */
import type { PackageFile } from '@visual-anything/schema';
import type { IdGenerator } from '../ids';
import type { ProjectSnapshot } from '../snapshot';

/**
 * A package with a derivation chain, limits and a nesting relation type:
 * Box ← Service, Box ← Database; calls ← reads; "is inside" nests.
 */
export const TEST_PACKAGE: PackageFile = {
  id: 'test',
  name: 'Test',
  components: [
    {
      id: 'test.box',
      name: 'Box',
      derivesFrom: 'essence',
      attributes: [{ name: 'owner', type: 'string' }],
      appearance: { fill: '#EEEEEE', width: 150 },
    },
    {
      id: 'test.service',
      name: 'Service',
      derivesFrom: 'test.box',
      attributes: [
        { name: 'latency', type: 'number', default: 100 },
        { name: 'owner', type: 'string', description: 'The team that runs it.' },
      ],
      appearance: { shape: 'rounded-rectangle', width: 180 },
    },
    {
      id: 'test.database',
      name: 'Database',
      derivesFrom: 'test.box',
      appearance: { shape: 'cylinder' },
    },
  ],
  relationTypes: [
    {
      id: 'test.calls',
      name: 'calls',
      derivesFrom: 'relates-to',
      direction: 'directed',
      limits: { from: ['test.service'] },
      appearance: { stroke: '#333333' },
    },
    {
      id: 'test.reads',
      name: 'reads',
      derivesFrom: 'test.calls',
      limits: { to: ['test.database'] },
      appearance: { dash: 'dashed' },
    },
    {
      id: 'test.inside',
      name: 'is inside',
      derivesFrom: 'relates-to',
      direction: 'directed',
      nests: true,
    },
    { id: 'test.governs', name: 'governs', derivesFrom: 'relates-to', direction: 'directed' },
  ],
};

/**
 * A small project: a system holding an API and a database, a client outside it, relations between
 * them, a relation that ends on a relation, one view and one scenario.
 */
export function testProject(): ProjectSnapshot {
  return {
    project: { schemaVersion: 1, name: 'Test project', packages: ['test'] },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [
        { id: 'system', component: 'test.box', name: 'System' },
        { id: 'api', component: 'test.service', name: 'API', attributes: { latency: 20 } },
        { id: 'db', component: 'test.database', name: 'DB' },
        { id: 'client', component: 'test.service', name: 'Client' },
        { id: 'contract', component: 'test.box', name: 'Contract' },
      ],
      relations: [
        { id: 'api-in-system', relationType: 'test.inside', from: 'api', to: 'system' },
        { id: 'db-in-system', relationType: 'test.inside', from: 'db', to: 'system' },
        { id: 'client-calls-api', relationType: 'test.calls', from: 'client', to: 'api' },
        { id: 'api-reads-db', relationType: 'test.reads', from: 'api', to: 'db' },
        {
          id: 'contract-governs-call',
          relationType: 'test.governs',
          from: 'contract',
          to: 'client-calls-api',
        },
      ],
    },
    packages: [TEST_PACKAGE],
    views: [
      {
        id: 'overview',
        name: 'Overview',
        perspective: { name: 'Data flow' },
        nestingRelationTypes: ['test.inside'],
        positions: [
          { element: 'system', x: 0, y: 0, width: 400, height: 300 },
          { element: 'api', container: 'system', x: 20, y: 40 },
          { element: 'db', container: 'system', x: 20, y: 160 },
          { element: 'client', x: -250, y: 40, pinned: true },
        ],
        freeShapes: [
          { kind: 'note', id: 'note', x: 0, y: 320, width: 200, height: 60, text: 'Hi' },
        ],
      },
    ],
    scenarios: [
      {
        id: 'request',
        name: 'A request',
        view: 'overview',
        steps: [
          { id: 'call', description: 'The client calls the API.', relations: ['client-calls-api'] },
          { id: 'read', description: 'The API reads the DB.', relations: ['api-reads-db'] },
        ],
      },
    ],
  };
}

/** Ids `base-1`, `base-2`, … in order, so tests know what they get. */
export function sequentialIds(): IdGenerator {
  let next = 0;
  return (base) => `${base}-${(next += 1)}`;
}
