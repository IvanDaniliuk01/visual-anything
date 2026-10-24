import fc from 'fast-check';
import type { Element, Id, Relation, ViewFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { containmentTree, type Placement } from './containment';
import { nestingTypesInView } from './containers';
import { applyOperations, type Collection } from './operations';
import type { ProjectSnapshot } from './snapshot';
import {
  contentsInView,
  orderByStacking,
  stackingKey,
  stackingListFor,
  stackingOperations,
  stackingOrderOf,
} from './stacking';
import { TEST_PACKAGE, testProject } from './test/fixtures';

const NESTING = ['test.inside', 'test.part-of'];

/** The test project's package with a second relation type that nests. */
const PACKAGE = {
  ...TEST_PACKAGE,
  relationTypes: [
    ...TEST_PACKAGE.relationTypes,
    {
      id: 'test.part-of',
      name: 'is part of',
      derivesFrom: 'relates-to',
      direction: 'directed' as const,
      nests: true,
    },
  ],
};

/**
 * A random project without containment cycles: each element may sit in elements made before it,
 * through either relation type that nests, or through one that does not.
 */
const projects = fc
  .record({
    size: fc.integer({ min: 1, max: 9 }),
    edges: fc.array(
      fc.record({
        from: fc.nat(),
        to: fc.nat(),
        type: fc.constantFrom('test.inside', 'test.part-of', 'test.calls'),
      }),
      { maxLength: 14 },
    ),
    listed: fc.subarray(NESTING),
  })
  .map(({ size, edges, listed }): { project: ProjectSnapshot; view: ViewFile } => {
    const elements: Element[] = Array.from({ length: size }, (_, at) => ({
      id: `e${at}`,
      component: 'test.box',
      name: `E${at}`,
    }));
    const relations: Relation[] = [];
    edges.forEach((edge, at) => {
      const from = (edge.from % size) + 1;
      const to = edge.to % from;
      if (from >= size) return;
      relations.push({
        id: `r${at}`,
        relationType: edge.type,
        from: `e${from}`,
        to: `e${to}`,
      });
    });
    const base = testProject();
    const [view] = base.views;
    if (!view) throw new Error('No view.');
    const arranged: ViewFile = { ...view, nestingRelationTypes: listed, positions: [] };
    return {
      project: {
        ...base,
        model: { ...base.model, elements, relations },
        packages: [PACKAGE],
        views: [arranged],
        scenarios: [],
      },
      view: arranged,
    };
  });

/** The contents of every placement in a containment tree, by container, World under ''. */
function contentsByContainer(tree: readonly Placement[]): Map<string, Id[]> {
  const byContainer = new Map<string, Id[]>();
  const visit = (placements: readonly Placement[], container: string) => {
    const list = byContainer.get(container) ?? [];
    for (const placement of placements) {
      if (!list.includes(placement.element)) list.push(placement.element);
      visit(placement.contents, placement.element);
    }
    byContainer.set(container, list);
  };
  visit(tree, '');
  return byContainer;
}

describe('stackingKey', () => {
  it('keys World by its id, and a container by its own', () => {
    expect(stackingKey('world', undefined)).toBe('world');
    expect(stackingKey('world', 'world')).toBe('world');
    expect(stackingKey('world', 'system')).toBe('system');
  });
});

describe('contentsInView', () => {
  it('agrees with the containment tree of the view’s nesting relation types', () => {
    fc.assert(
      fc.property(projects, ({ project, view }) => {
        const types = new Set(nestingTypesInView(project, view));
        const tree = containmentTree(project.model, (type) => types.has(type));
        const expected = contentsByContainer(tree);
        expect(contentsInView(project, view, undefined)).toEqual(expected.get('') ?? []);
        for (const element of project.model.elements) {
          expect(contentsInView(project, view, element.id)).toEqual(expected.get(element.id) ?? []);
        }
      }),
    );
  });

  it('gives the test project’s contents in model order', () => {
    const project = testProject();
    const view = project.views[0] as ViewFile;
    expect(contentsInView(project, view, undefined)).toEqual(['system', 'client', 'contract']);
    expect(contentsInView(project, view, 'world')).toEqual(['system', 'client', 'contract']);
    expect(contentsInView(project, view, 'system')).toEqual(['api', 'db']);
    expect(contentsInView(project, view, 'api')).toEqual([]);
  });
});

describe('orderByStacking', () => {
  it('puts the listed items first, in the list’s order, then the others in theirs', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 20 }), { maxLength: 12 }),
        fc.uniqueArray(fc.integer({ min: 0, max: 30 }), { maxLength: 12 }),
        (items, stored) => {
          const ids = items.map(String);
          const list = stored.map(String);
          const ordered = orderByStacking(ids, (id) => id, list);
          expect([...ordered].sort()).toEqual([...ids].sort());
          const listed = list.filter((id) => ids.includes(id));
          expect(ordered.slice(0, listed.length)).toEqual(listed);
          expect(ordered.slice(listed.length)).toEqual(ids.filter((id) => !list.includes(id)));
        },
      ),
    );
  });

  it('ignores ids that are not among the items', () => {
    expect(orderByStacking(['a', 'b', 'c'], (id) => id, ['x', 'c'])).toEqual(['c', 'a', 'b']);
    expect(orderByStacking(['a', 'b'], (id) => id, undefined)).toEqual(['a', 'b']);
  });
});

describe('stackingListFor', () => {
  it('gives the shortest list that draws an order, back to front', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.integer({ min: 0, max: 40 }), { maxLength: 12 }), (ranks) => {
        const order = ranks.map((rank) => `e${rank}`);
        const rankOf = (id: Id) => Number(id.slice(1));
        const modelOrder = [...order].sort((a, b) => rankOf(a) - rankOf(b));
        const list = stackingListFor(order, rankOf);
        expect(orderByStacking(modelOrder, (id) => id, list)).toEqual(order);
        // No shorter list draws it.
        if (list.length > 0) {
          expect(orderByStacking(modelOrder, (id) => id, list.slice(0, -1))).not.toEqual(order);
        }
      }),
    );
  });

  it('needs no list for the model’s order, and names everything behind an older shape in front', () => {
    const rankOf = (id: Id) => ['a', 'b', 'c', 'd'].indexOf(id);
    expect(stackingListFor(['a', 'b', 'c', 'd'], rankOf)).toEqual([]);
    expect(stackingListFor(['b', 'a', 'c', 'd'], rankOf)).toEqual(['b']);
    expect(stackingListFor(['b', 'c', 'd', 'a'], rankOf)).toEqual(['b', 'c', 'd']);
  });
});

describe('stackingOperations', () => {
  const collection: Collection = { name: 'stackingOrder', view: 'overview', container: 'system' };
  const withList = (list: readonly Id[]): ProjectSnapshot => {
    const project = testProject();
    const [view] = project.views;
    if (!view) throw new Error('No view.');
    return {
      ...project,
      views: [{ ...view, ...(list.length > 0 ? { stackingOrder: { system: [...list] } } : {}) }],
    };
  };
  const listIn = (state: ProjectSnapshot) => state.views[0]?.stackingOrder?.system ?? [];

  /** The length of the longest common subsequence that keeps the order of both lists. */
  const kept = (stored: readonly Id[], next: readonly Id[]) => {
    const positions = stored.filter((id) => next.includes(id)).map((id) => next.indexOf(id));
    const tails: number[] = [];
    for (const position of positions) {
      let low = 0;
      let high = tails.length;
      while (low < high) {
        const mid = (low + high) >> 1;
        if ((tails[mid] as number) < position) low = mid + 1;
        else high = mid;
      }
      tails[low] = position;
    }
    return tails.length;
  };

  it('turns one list into another in as few single-id changes as there can be', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 15 }), { maxLength: 10 }),
        fc.uniqueArray(fc.integer({ min: 0, max: 15 }), { maxLength: 10 }),
        (from, to) => {
          const stored = from.map((at) => `e${at}`);
          const next = to.map((at) => `e${at}`);
          const operations = stackingOperations(collection, stored, next);
          const { state } = applyOperations(withList(stored), operations);
          expect(listIn(state)).toEqual(next);
          expect(operations).toHaveLength(stored.length + next.length - 2 * kept(stored, next));
        },
      ),
    );
  });

  it('replaces the whole list in one operation when it changes too much', () => {
    const stored = Array.from({ length: 150 }, (_, at) => `e${at}`);
    const next = Array.from({ length: 150 }, (_, at) => `f${at}`);
    const operations = stackingOperations(collection, stored, next);
    expect(operations).toEqual([{ op: 'replace-all', collection, items: next }]);
    expect(listIn(applyOperations(withList(stored), operations).state)).toEqual(next);
    expect(stackingOperations(collection, next, next)).toEqual([]);
  });
});

describe('stackingOrderOf', () => {
  it('gives the order a view draws a container’s contents in, live ids only', () => {
    const project = testProject();
    const [view] = project.views;
    if (!view) throw new Error('No view.');
    const ordered: ProjectSnapshot = {
      ...project,
      views: [{ ...view, stackingOrder: { system: ['db', 'gone'], world: ['contract'] } }],
    };
    expect(stackingOrderOf(ordered, 'overview', 'system')).toEqual(['db', 'api']);
    expect(stackingOrderOf(ordered, 'overview')).toEqual(['contract', 'system', 'client']);
    expect(stackingOrderOf(project, 'overview', 'system')).toEqual(['api', 'db']);
  });
});
