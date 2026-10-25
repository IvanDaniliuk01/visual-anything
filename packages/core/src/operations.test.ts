import type { Element } from '@visual-anything/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  OperationError,
  applyOperation,
  applyOperations,
  keyOf,
  positionKey,
  type Operation,
} from './operations';
import type { ProjectSnapshot } from './snapshot';
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

  // Tours and threads of comments (ADR 0058, ADR 0059).
  it('inserts, replaces and removes tours and threads by id, and undoes them exactly', () => {
    const state = testProject();
    const tour = {
      id: 'walk',
      name: 'A walk',
      steps: [{ id: 'start', viewState: { view: 'overview' }, caption: { title: 'Start' } }],
    };
    const thread = {
      id: 'why',
      anchor: { kind: 'element' as const, element: 'api' },
      comments: [
        {
          id: 'c',
          author: { kind: 'claude' as const },
          time: '2026-10-25T09:30:00Z',
          text: 'Why?',
        },
      ],
    };
    const operations: Operation[] = [
      { op: 'insert', collection: { name: 'tours' }, index: 0, item: tour },
      { op: 'insert', collection: { name: 'comments' }, index: 0, item: thread },
      { op: 'replace', collection: { name: 'tours' }, item: { ...tour, name: 'Renamed' } },
      { op: 'replace', collection: { name: 'comments' }, item: { ...thread, resolved: true } },
    ];
    const { state: after, inverse } = applyOperations(state, operations);
    expect(after.tours).toEqual([{ ...tour, name: 'Renamed' }]);
    expect(after.comments).toEqual([{ ...thread, resolved: true }]);
    expect(keyOf({ name: 'comments' }, thread)).toBe('why');
    expect(applyOperations(after, inverse).state).toEqual(state);

    const removed = applyOperations(after, [
      { op: 'remove', collection: { name: 'tours' }, key: 'walk' },
      { op: 'remove', collection: { name: 'comments' }, key: 'why' },
    ]);
    expect(removed.state).toEqual(state);
    expect(applyOperations(removed.state, removed.inverse).state).toEqual(after);
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

describe('stacking lists', () => {
  const list = (container: string) =>
    ({ name: 'stackingOrder', view: 'overview', container }) as const;

  it('creates a view’s stacking order with its first id, and drops it with its last', () => {
    const state = testProject();
    const inserted = applyOperation(state, {
      op: 'insert',
      collection: list('system'),
      index: 0,
      item: 'db',
    });
    expect(inserted.state.views[0]?.stackingOrder).toEqual({ system: ['db'] });
    const removed = applyOperation(inserted.state, inserted.inverse);
    // The view is back exactly: without the key, not with it set to undefined.
    expect(removed.state).toStrictEqual(state);
    expect(Object.keys(removed.state.views[0] ?? {})).not.toContain('stackingOrder');
  });

  it('keeps the other lists when one empties, and replaces a whole list', () => {
    let state = testProject();
    state = applyOperation(state, {
      op: 'insert',
      collection: list('system'),
      index: 0,
      item: 'db',
    }).state;
    state = applyOperation(state, {
      op: 'replace-all',
      collection: list('world'),
      items: ['system', 'client'],
    }).state;
    expect(state.views[0]?.stackingOrder).toEqual({ system: ['db'], world: ['system', 'client'] });
    const emptied = applyOperation(state, {
      op: 'replace-all',
      collection: list('world'),
      items: [],
    });
    expect(emptied.state.views[0]?.stackingOrder).toEqual({ system: ['db'] });
    expect(applyOperation(emptied.state, emptied.inverse).state).toEqual(state);
  });

  it('refuses an id a list already holds, and keys ids by themselves', () => {
    const { state } = applyOperation(testProject(), {
      op: 'insert',
      collection: list('system'),
      index: 0,
      item: 'db',
    });
    expect(() =>
      applyOperation(state, { op: 'insert', collection: list('system'), index: 1, item: 'db' }),
    ).toThrow(OperationError);
    expect(keyOf(list('system'), 'db')).toBe('db');
  });

  it('keeps the stacking order when a view’s own properties change', () => {
    const { state } = applyOperation(testProject(), {
      op: 'insert',
      collection: list('system'),
      index: 0,
      item: 'db',
    });
    const renamed = applyOperation(state, {
      op: 'set-view',
      view: 'overview',
      properties: {
        id: 'overview',
        name: 'Renamed',
        perspective: { name: 'Data flow' },
        nestingRelationTypes: ['test.inside'],
      },
    });
    expect(renamed.state.views[0]?.stackingOrder).toEqual({ system: ['db'] });
    expect(applyOperation(renamed.state, renamed.inverse).state).toStrictEqual(state);
  });
});

describe('positionKey', () => {
  it('names the element and the container its shape sits in', () => {
    expect(positionKey({ element: 'api' })).toBe('api');
    expect(positionKey({ element: 'api', container: 'system' })).toBe('api in system');
  });
});

describe('the places of a list', () => {
  /** What an operation on the elements does, worked out by passes over the list. */
  function byPasses(items: readonly Element[], operation: Operation): Element[] | 'refused' {
    if (operation.op === 'insert') {
      const item = operation.item as Element;
      if (items.some((each) => each.id === item.id)) return 'refused';
      if (operation.index < 0 || operation.index > items.length) return 'refused';
      return items.toSpliced(operation.index, 0, item);
    }
    if (operation.op === 'replace') {
      const item = operation.item as Element;
      const at = items.findIndex((each) => each.id === item.id);
      return at === -1 ? 'refused' : items.with(at, item);
    }
    if (operation.op === 'remove') {
      const at = items.findIndex((each) => each.id === operation.key);
      return at === -1 ? 'refused' : items.toSpliced(at, 1);
    }
    return 'refused';
  }

  const id = fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f');
  const item = fc.record({
    id,
    component: fc.constant('essence'),
    name: fc.constantFrom('x', 'y'),
  });
  const collection = { name: 'elements' } as const;
  const operation: fc.Arbitrary<Operation> = fc.oneof(
    fc.tuple(item, fc.integer({ min: -1, max: 7 })).map(([item, index]) => ({
      op: 'insert' as const,
      collection,
      index,
      item,
    })),
    item.map((item) => ({ op: 'replace' as const, collection, item })),
    id.map((key) => ({ op: 'remove' as const, collection, key })),
  );

  it('finds items as passes over the list do, however the list was made', () => {
    fc.assert(
      fc.property(fc.array(operation, { maxLength: 60 }), fc.boolean(), (operations, undo) => {
        let state: ProjectSnapshot = {
          ...testProject(),
          model: { ...testProject().model, elements: [] },
        };
        const states: ProjectSnapshot[] = [state];
        for (const each of operations) {
          const expected = byPasses(state.model.elements, each);
          let actual: Element[] | 'refused';
          try {
            const result = applyOperation(state, each);
            state = result.state;
            states.push(state);
            actual = state.model.elements;
          } catch (error) {
            if (!(error instanceof OperationError)) throw error;
            actual = 'refused';
          }
          expect(actual).toEqual(expected);
        }
        // An earlier list, whose places went to the list made from it, still finds its items.
        if (undo && states.length > 2) {
          const earlier = states[Math.floor(states.length / 2)]!;
          for (const element of earlier.model.elements) {
            const replaced = { ...element, name: 'z' };
            const next = applyOperation(earlier, { op: 'replace', collection, item: replaced });
            expect(next.state.model.elements.find((each) => each.id === element.id)).toBe(replaced);
          }
        }
      }),
      { numRuns: 300 },
    );
  });
});
