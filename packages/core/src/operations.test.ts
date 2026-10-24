import { describe, expect, it } from 'vitest';
import {
  OperationError,
  applyOperation,
  applyOperations,
  positionKey,
  type Operation,
} from './operations';
import { testProject } from './test/fixtures';

describe('applyOperation', () => {
  it('inserts, replaces and removes by key, and each inverse restores the project exactly', () => {
    const state = testProject();
    const operations: Operation[] = [
      {
        op: 'insert',
        collection: { name: 'elements' },
        index: 1,
        item: { id: 'cache', component: 'test.box', name: 'Cache' },
      },
      {
        op: 'replace',
        collection: { name: 'relations' },
        item: { id: 'api-reads-db', relationType: 'test.reads', from: 'api', to: 'cache' },
      },
      { op: 'remove', collection: { name: 'elements' }, key: 'client' },
      {
        op: 'replace',
        collection: { name: 'positions', view: 'overview' },
        item: { element: 'api', container: 'system', x: 99, y: 99, pinned: true },
      },
      { op: 'remove', collection: { name: 'freeShapes', view: 'overview' }, key: 'note' },
      { op: 'set-world', world: { id: 'world', component: 'essence', name: 'Everything' } },
      { op: 'set-project', project: { schemaVersion: 1, name: 'Renamed', packages: ['test'] } },
      {
        op: 'set-view',
        view: 'overview',
        properties: {
          id: 'overview',
          name: 'Overview',
          perspective: { name: 'Security' },
          nestingRelationTypes: [],
        },
      },
    ];
    const { state: after, inverse } = applyOperations(state, operations);
    expect(after.model.elements.map((element) => element.id)).toEqual([
      'system',
      'cache',
      'api',
      'db',
      'contract',
    ]);
    expect(after.views[0]?.perspective.name).toBe('Security');
    expect(after.views[0]?.positions).toHaveLength(4);
    expect(applyOperations(after, inverse).state).toEqual(state);
  });

  it('leaves the project it is given unchanged', () => {
    const state = testProject();
    const copy = JSON.parse(JSON.stringify(state)) as typeof state;
    applyOperation(state, { op: 'remove', collection: { name: 'elements' }, key: 'api' });
    expect(state).toEqual(copy);
  });

  it('replaces a whole list and restores it', () => {
    const state = testProject();
    const { state: after, inverse } = applyOperation(state, {
      op: 'replace-all',
      collection: { name: 'positions', view: 'overview' },
      items: [],
    });
    expect(after.views[0]?.positions).toEqual([]);
    expect(applyOperation(after, inverse).state).toEqual(state);
  });

  it('refuses operations that do not fit the project', () => {
    const state = testProject();
    expect(() =>
      applyOperation(state, { op: 'remove', collection: { name: 'elements' }, key: 'nothing' }),
    ).toThrow(OperationError);
    expect(() =>
      applyOperation(state, {
        op: 'insert',
        collection: { name: 'elements' },
        index: 0,
        item: { id: 'api', component: 'test.box', name: 'Again' },
      }),
    ).toThrow(OperationError);
    expect(() =>
      applyOperation(state, {
        op: 'insert',
        collection: { name: 'elements' },
        index: 99,
        item: { id: 'new', component: 'test.box', name: 'New' },
      }),
    ).toThrow(OperationError);
    expect(() =>
      applyOperation(state, {
        op: 'remove',
        collection: { name: 'positions', view: 'no-view' },
        key: 'x',
      }),
    ).toThrow(OperationError);
  });
});

describe('positionKey', () => {
  it('names the element and the container its shape sits in', () => {
    expect(positionKey({ element: 'api' })).toBe('api');
    expect(positionKey({ element: 'api', container: 'system' })).toBe('api in system');
  });
});
