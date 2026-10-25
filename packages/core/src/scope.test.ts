/**
 * What a view shows through its scope (ADR-0040): each rule, what is added and left out, World, and
 * relations, which show while both their ends do.
 */
import fc from 'fast-check';
import type { Id, Scope, ScopeRule } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { shownByScope } from './scope';
import type { ProjectSnapshot } from './snapshot';
import { testProject } from './test/fixtures';

/** The test project with a scope on its view. */
function scoped(scope: Scope | undefined): ProjectSnapshot {
  const state = testProject();
  const view = state.views[0]!;
  state.views[0] = scope === undefined ? view : { ...view, scope };
  return state;
}

function shown(scope: Scope | undefined): Id[] {
  const state = scoped(scope);
  return [...shownByScope(state, state.views[0]!).elements];
}

describe('shownByScope', () => {
  it('shows the whole model without a scope', () => {
    const state = scoped(undefined);
    const result = shownByScope(state, state.views[0]!);
    expect(result.scoped).toBe(false);
    expect(result.elements).toEqual(['world', 'system', 'api', 'db', 'client', 'contract']);
    expect(result.relation('contract-governs-call')).toBe(true);
  });

  it('takes a component with what derives from it, or only itself', () => {
    expect(shown({ include: [{ kind: 'component', component: 'test.box' }] })).toEqual([
      'world',
      'system',
      'api',
      'db',
      'client',
      'contract',
    ]);
    expect(
      shown({ include: [{ kind: 'component', component: 'test.box', exactly: true }] }),
    ).toEqual(['world', 'system', 'contract']);
    expect(shown({ include: [{ kind: 'component', component: 'test.service' }] })).toEqual([
      'world',
      'api',
      'client',
    ]);
  });

  it('takes the ends of relations of a relation type, and of those derived from it', () => {
    expect(shown({ include: [{ kind: 'relation-type', relationType: 'test.calls' }] })).toEqual([
      'world',
      'api',
      'db',
      'client',
    ]);
    expect(
      shown({ include: [{ kind: 'relation-type', relationType: 'test.calls', exactly: true }] }),
    ).toEqual(['world', 'api', 'client']);
  });

  it('takes a container with what sits inside it, to a depth or to every level', () => {
    expect(shown({ include: [{ kind: 'contents', container: 'system' }] })).toEqual([
      'world',
      'system',
      'api',
      'db',
    ]);
    const nested = scoped({ include: [{ kind: 'contents', container: 'system', depth: 1 }] });
    nested.model.elements.push({ id: 'cache', component: 'test.database', name: 'Cache' });
    nested.model.relations.push({
      id: 'cache-in-db',
      relationType: 'test.inside',
      from: 'cache',
      to: 'db',
    });
    expect(shownByScope(nested, nested.views[0]!).element('cache')).toBe(false);
    const deep = {
      ...nested.views[0]!,
      scope: { include: [{ kind: 'contents', container: 'system' }] },
    };
    expect(shownByScope(nested, deep as never).element('cache')).toBe(true);
  });

  it('takes elements whose attribute meets a test, with the component’s default when unset', () => {
    expect(
      shown({ include: [{ kind: 'attribute', attribute: 'latency', test: 'below', value: '50' }] }),
    ).toEqual(['world', 'api']);
    // The client has no latency of its own: its component's default, 100, counts.
    expect(
      shown({ include: [{ kind: 'attribute', attribute: 'latency', test: 'above', value: '50' }] }),
    ).toEqual(['world', 'client']);
  });

  it('leaves out what an exclude rule takes, adds and leaves out by hand, and always shows World', () => {
    expect(
      shown({
        include: [{ kind: 'component', component: 'test.box' }],
        exclude: [{ kind: 'component', component: 'test.database' }],
        added: ['db'],
        leftOut: ['client', 'world'],
      }),
    ).toEqual(['world', 'system', 'api', 'db', 'contract']);
  });

  it('shows a relation while both its ends show, a relation end through its own ends', () => {
    const state = scoped({ leftOut: ['db'] });
    const result = shownByScope(state, state.views[0]!);
    expect(result.relation('api-reads-db')).toBe(false);
    expect(result.relation('client-calls-api')).toBe(true);
    expect(result.relation('contract-governs-call')).toBe(true);
    const withoutApi = scoped({ leftOut: ['api'] });
    const other = shownByScope(withoutApi, withoutApi.views[0]!);
    expect(other.relation('client-calls-api')).toBe(false);
    expect(other.relation('contract-governs-call')).toBe(false);
    expect(other.relation('nothing')).toBe(false);
  });

  it('is worked out once for each state and view', () => {
    const state = scoped({ leftOut: ['db'] });
    expect(shownByScope(state, state.views[0]!)).toBe(shownByScope(state, state.views[0]!));
  });
});

const ELEMENTS = ['system', 'api', 'db', 'client', 'contract'] as const;

const rule: fc.Arbitrary<ScopeRule> = fc.oneof(
  fc.record({
    kind: fc.constant('component' as const),
    component: fc.constantFrom('test.box', 'test.service', 'test.database', 'essence', 'nope'),
    exactly: fc.boolean(),
  }),
  fc.record({
    kind: fc.constant('relation-type' as const),
    relationType: fc.constantFrom('test.calls', 'test.reads', 'test.inside', 'relates-to'),
    exactly: fc.boolean(),
  }),
  fc.record(
    {
      kind: fc.constant('contents' as const),
      container: fc.constantFrom(...ELEMENTS),
      depth: fc.integer({ min: 1, max: 3 }),
    },
    { requiredKeys: ['kind', 'container'] },
  ),
  fc.record({
    kind: fc.constant('attribute' as const),
    attribute: fc.constantFrom('latency', 'owner'),
    test: fc.constantFrom('is', 'is-not', 'below', 'above', 'set', 'unset' as const),
    value: fc.constantFrom('20', '100', 'x'),
  }),
);

describe('shownByScope, on any scope', () => {
  it('shows what the rules, the added and the left out give, World always, and relations by their ends', () => {
    fc.assert(
      fc.property(
        fc.array(rule, { maxLength: 3 }),
        fc.array(rule, { maxLength: 2 }),
        fc.subarray([...ELEMENTS]),
        fc.subarray([...ELEMENTS]),
        (include, exclude, added, leftOut) => {
          const state = scoped({ include, exclude, added, leftOut });
          const view = state.views[0]!;
          const result = shownByScope(state, view);
          const takenBy = (rules: readonly ScopeRule[], id: Id) =>
            rules.some((each) =>
              shownByScope(state, { ...view, scope: { include: [each] } }).element(id),
            );
          for (const id of ELEMENTS) {
            const byRules = (include.length === 0 || takenBy(include, id)) && !takenBy(exclude, id);
            expect(result.element(id)).toBe(
              (byRules || added.includes(id)) && !leftOut.includes(id),
            );
          }
          expect(result.element('world')).toBe(true);
          for (const relation of state.model.relations) {
            const end = (id: Id): boolean =>
              ELEMENTS.includes(id as never) || id === 'world'
                ? result.element(id)
                : result.relation(id);
            expect(result.relation(relation.id)).toBe(end(relation.from) && end(relation.to));
          }
        },
      ),
    );
  });
});
