import type { Element, Id, ModelFile, Relation } from '@visual-anything/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { draftIndexOf, indexModel, type DraftIndex, type ModelIndex } from './model-index';
import { applyOperation, type Operation } from './operations';
import { testProject } from './test/fixtures';
import type { ProjectSnapshot } from './snapshot';

const NESTING: ReadonlySet<Id> = new Set(['nests']);
const WORLD: Element = { id: 'world', component: 'essence', name: 'World' };
const TYPES = ['nests', 'calls'] as const;
const RENAMED = '(renamed)';
const TWIN = '(twin)';
const IDS = ['a', 'b', 'c', 'd', 'e', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6'];

/** Everything an index answers about every id that can come up. */
function answers(index: ModelIndex) {
  return {
    world: index.world,
    ids: Object.fromEntries(
      [...IDS, 'world', 'nowhere'].map((id) => [
        id,
        {
          element: index.element(id),
          relation: index.relation(id),
          has: index.has(id),
          on: [...index.relationsOn(id)],
          containers: [...index.containersOf(id)],
          contents: [...index.contentsOf(id)],
        },
      ]),
    ),
  };
}

/** A model indexed from scratch: a copy, so that no cached index answers for it. */
function fresh(model: ModelFile): ModelIndex {
  return indexModel({ ...model }, NESTING);
}

const ends = fc.constantFrom('a', 'b', 'c', 'world', 'r1');
const relation = fc.record({
  id: fc.constantFrom('r1', 'r2', 'r3', 'r4', 'r5', 'r6'),
  relationType: fc.constantFrom(...TYPES),
  from: ends,
  to: ends,
});
const element = fc.record({
  id: fc.constantFrom('a', 'b', 'c', 'd', 'e'),
  component: fc.constant('essence'),
  name: fc.constantFrom('One', 'Two'),
});

/** Makes a marked operation from the model as it is; `undefined` when it cannot be made. */
function made(each: Operation, model: ModelFile): Operation | undefined {
  if (each.op === 'replace' && (each.item as Relation).relationType === RENAMED) {
    const current = model.relations.find((relation) => relation.id === (each.item as Relation).id);
    return current && { ...each, item: { ...current, name: `${current.name ?? ''}!` } };
  }
  if (each.op === 'insert' && each.index === -1) {
    const item = each.item as Relation;
    const first = model.relations[0];
    if (item.relationType === TWIN && first === undefined) return undefined;
    return {
      ...each,
      index: model.relations.length,
      item: item.relationType === TWIN ? { ...(first as Relation), id: item.id } : item,
    };
  }
  return each;
}

/** An operation on the model, possibly one that does not fit it, which applying then refuses. */
const operation: fc.Arbitrary<Operation> = fc.oneof(
  element.map((item): Operation => ({
    op: 'insert',
    collection: { name: 'elements' },
    index: 0,
    item,
  })),
  fc.tuple(element, fc.nat(6)).map(([item, index]): Operation => ({
    op: 'insert',
    collection: { name: 'elements' },
    index,
    item,
  })),
  element.map((item): Operation => ({ op: 'replace', collection: { name: 'elements' }, item })),
  fc
    .constantFrom('a', 'b', 'c', 'd', 'e')
    .map((key): Operation => ({ op: 'remove', collection: { name: 'elements' }, key })),
  fc.tuple(relation, fc.nat(7)).map(([item, index]): Operation => ({
    op: 'insert',
    collection: { name: 'relations' },
    index,
    item,
  })),
  relation.map((item): Operation => ({
    op: 'insert',
    collection: { name: 'relations' },
    index: -1,
    item,
  })),
  relation.map((item): Operation => ({ op: 'replace', collection: { name: 'relations' }, item })),
  fc
    .constantFrom('r1', 'r2', 'r3', 'r4', 'r5', 'r6')
    .map((key): Operation => ({ op: 'remove', collection: { name: 'relations' }, key })),
  // Marked operations, which the test makes from the model as it is: a relation renamed, which keeps
  // its ends, and a twin of the first relation, between the same ends.
  fc.constantFrom('r1', 'r2', 'r3').map((id): Operation => ({
    op: 'replace',
    collection: { name: 'relations' },
    item: { id, relationType: RENAMED, from: '', to: '' },
  })),
  fc.constantFrom('r4', 'r5', 'r6').map((id): Operation => ({
    op: 'insert',
    collection: { name: 'relations' },
    index: -1,
    item: { id, relationType: TWIN, from: '', to: '' },
  })),
  fc.constantFrom('World', 'Everything').map((name): Operation => ({
    op: 'set-world',
    world: { id: 'world', component: 'essence', name },
  })),
);

function project(model: ModelFile): ProjectSnapshot {
  return { ...testProject(), model };
}

describe('draftIndexOf', () => {
  it('answers as an index of the model built from scratch, after any operations', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(operation, fc.boolean()), { maxLength: 40 }), (steps) => {
        let state = project({
          world: { id: 'world', component: 'essence', name: 'World' },
          elements: [],
          relations: [],
        });
        let index: DraftIndex = draftIndexOf(state.model, NESTING);
        // Reading the index hands its lists out, after which it copies them before changing them:
        // only some steps read it, so that it also changes its own lists in place.
        for (const [each, read] of steps) {
          // A relation goes last when its place says so: -1 stands for the end of the list.
          const operation = made(each, state.model);
          if (operation === undefined) continue;
          let next: ProjectSnapshot;
          try {
            next = applyOperation(state, operation).state;
          } catch {
            continue;
          }
          state = next;
          if (!index.follow(operation)) index = draftIndexOf(state.model, NESTING);
          if (read) expect(answers(index)).toEqual(answers(fresh(state.model)));
        }
        expect(answers(index)).toEqual(answers(fresh(state.model)));
      }),
      { numRuns: 300 },
    );
  });

  it('keeps a containment that a second relation between the same two elements still makes', () => {
    const elements: Element[] = ['a', 'c'].map((id) => ({ id, component: 'essence', name: id }));
    const first: Relation = { id: 'r1', relationType: 'nests', from: 'a', to: 'c' };
    const model: ModelFile = { world: WORLD, elements, relations: [first] };
    const index = draftIndexOf(model, NESTING);
    const twin = { ...first, id: 'r2' };
    expect(
      index.follow({ op: 'insert', collection: { name: 'relations' }, index: 1, item: twin }),
    ).toBe(true);
    // Removing either one leaves the other; the index is built again or keeps the containment.
    const removed = index.follow({ op: 'remove', collection: { name: 'relations' }, key: 'r1' });
    const now = removed
      ? index
      : indexModel({ world: WORLD, elements, relations: [twin] }, NESTING);
    expect(now.containersOf('a')).toEqual(['c']);
    expect(now.contentsOf('c')).toEqual(['a']);
  });

  it('cannot follow a relation put anywhere but last, whose place in model order it would lose', () => {
    const elements: Element[] = ['a', 'b'].map((id) => ({ id, component: 'essence', name: id }));
    const relations: Relation[] = [{ id: 'r1', relationType: 'calls', from: 'a', to: 'b' }];
    const index = draftIndexOf({ world: WORLD, elements, relations }, NESTING);
    const item: Relation = { id: 'r0', relationType: 'calls', from: 'a', to: 'b' };
    expect(index.follow({ op: 'insert', collection: { name: 'relations' }, index: 0, item })).toBe(
      false,
    );
  });

  it('never changes a list it handed out', () => {
    const world: Element = { id: 'world', component: 'essence', name: 'World' };
    const elements: Element[] = ['a', 'b', 'c'].map((id) => ({
      id,
      component: 'essence',
      name: id,
    }));
    const relations: Relation[] = [{ id: 'r1', relationType: 'nests', from: 'a', to: 'c' }];
    const model: ModelFile = { world, elements, relations };
    const index = draftIndexOf(model, NESTING);
    const on = index.relationsOn('c');
    const contents = index.contentsOf('c');
    const added: Relation = { id: 'r2', relationType: 'nests', from: 'b', to: 'c' };
    expect(
      index.follow({ op: 'insert', collection: { name: 'relations' }, index: 1, item: added }),
    ).toBe(true);
    expect(on).toEqual([relations[0]]);
    expect(contents).toEqual(['a']);
    expect(index.relationsOn('c')).toEqual([relations[0], added]);
    expect(index.contentsOf('c')).toEqual(['a', 'b']);
  });

  it('leaves the shared index of the model it starts from as it was', () => {
    const { model } = testProject();
    const shared = indexModel(model, NESTING);
    const before = answers(shared);
    const index = draftIndexOf(model, NESTING);
    const item: Relation = { id: 'r1', relationType: 'nests', from: 'api', to: 'db' };
    index.follow({
      op: 'insert',
      collection: { name: 'relations' },
      index: model.relations.length,
      item,
    });
    index.follow({ op: 'remove', collection: { name: 'elements' }, key: 'contract' });
    expect(answers(shared)).toEqual(before);
    expect(indexModel(model, NESTING)).toBe(shared);
  });

  it('becomes the shared index of the model it fits once sealed, and follows nothing more', () => {
    const { model } = testProject();
    const index = draftIndexOf(model, NESTING);
    const item: Element = { id: 'cache', component: 'test.box', name: 'Cache' };
    const next: ModelFile = { ...model, elements: [...model.elements, item] };
    index.follow({
      op: 'insert',
      collection: { name: 'elements' },
      index: model.elements.length,
      item,
    });
    index.seal(next);
    expect(indexModel(next, NESTING)).toBe(index);
    expect(() =>
      index.follow({ op: 'remove', collection: { name: 'elements' }, key: 'cache' }),
    ).toThrow();
  });
});
