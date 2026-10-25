/**
 * The commands that change a view's scope (ADR-0040): `set-scope`, `add-to-view` and
 * `leave-out-of-view`. Each is one action that changes only the view's file and undoes exactly.
 */
import fc from 'fast-check';
import type { Id, Scope } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { executeCommand, type Command } from './commands';
import { checkProject } from './check';
import { previewDelete } from './rules';
import { applyOperations } from './operations';
import { shownByScope } from './scope';
import type { ProjectSnapshot } from './snapshot';
import { sequentialIds, testProject } from './test/fixtures';

const VIEW = 'overview';

function run(command: Command, state: ProjectSnapshot = testProject()) {
  const outcome = executeCommand(state, command, { newId: sequentialIds() });
  if (outcome.ok) {
    expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(state);
    // Only the view's file changes.
    expect(outcome.state.model).toBe(state.model);
    expect(outcome.state.packages).toBe(state.packages);
  }
  return outcome;
}

function ok(command: Command, state?: ProjectSnapshot) {
  const outcome = run(command, state);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome;
}

function refused(command: Command, state?: ProjectSnapshot) {
  const outcome = run(command, state);
  if (outcome.ok) throw new Error(`Accepted: ${outcome.label}`);
  return outcome.problems.map((each) => each.code);
}

const scopeOf = (state: ProjectSnapshot) => state.views.find((view) => view.id === VIEW)?.scope;
const shownIn = (state: ProjectSnapshot) =>
  shownByScope(
    state,
    state.views.find((view) => view.id === VIEW)!,
  ).elements;

describe('set-scope', () => {
  it('gives a view a scope, stored with its lists sorted, and takes it away', () => {
    const outcome = ok({
      type: 'set-scope',
      view: VIEW,
      scope: {
        include: [{ kind: 'component', component: 'test.service' }],
        added: ['system', 'db'],
      },
    });
    expect(outcome.label).toBe('Set what "Overview" shows');
    expect(scopeOf(outcome.state)).toEqual({
      include: [{ kind: 'component', component: 'test.service' }],
      added: ['db', 'system'],
    });
    expect(shownIn(outcome.state)).toEqual(['world', 'system', 'api', 'db', 'client']);
    const whole = ok({ type: 'set-scope', view: VIEW, scope: null }, outcome.state);
    expect(whole.label).toBe('Show the whole model in "Overview"');
    expect(scopeOf(whole.state)).toBeUndefined();
  });

  it('stores no scope when every part of it is empty', () => {
    const outcome = ok({ type: 'set-scope', view: VIEW, scope: { include: [], added: [] } });
    expect(scopeOf(outcome.state)).toBeUndefined();
    expect(outcome.operations).toEqual([]);
  });

  it('refuses what is not a scope, an unknown definition or element, and an element both added and left out', () => {
    expect(refused({ type: 'set-scope', view: VIEW, scope: [] as never })).toEqual([
      'invalid-command',
    ]);
    expect(refused({ type: 'set-scope', view: VIEW, scope: { only: [] } as never })).toEqual([
      'invalid-command',
    ]);
    expect(
      refused({
        type: 'set-scope',
        view: VIEW,
        scope: { include: [{ kind: 'component', component: 'nope' }] },
      }),
    ).toEqual(['unknown-component']);
    expect(
      refused({
        type: 'set-scope',
        view: VIEW,
        scope: { include: [{ kind: 'relation-type', relationType: 'nope' }] },
      }),
    ).toEqual(['unknown-relation-type']);
    expect(
      refused({
        type: 'set-scope',
        view: VIEW,
        scope: { include: [{ kind: 'contents', container: 'nobody' }] },
      }),
    ).toEqual(['unknown-element']);
    expect(
      refused({
        type: 'set-scope',
        view: VIEW,
        scope: { include: [{ kind: 'contents', container: 'system', depth: 0 }] },
      }),
    ).toEqual(['invalid-command']);
    expect(
      refused({
        type: 'set-scope',
        view: VIEW,
        scope: { include: [{ kind: 'attribute', attribute: 'latency', test: 'below' } as never] },
      }),
    ).toEqual(['invalid-command']);
    expect(
      refused({ type: 'set-scope', view: VIEW, scope: { added: ['db'], leftOut: ['db'] } }),
    ).toEqual(['invalid-command']);
    expect(refused({ type: 'set-scope', view: VIEW, scope: { added: ['world'] } })).toEqual([
      'world-not-allowed',
    ]);
    expect(refused({ type: 'set-scope', view: 'nowhere', scope: null })).toEqual(['unknown-view']);
  });
});

describe('add-to-view and leave-out-of-view', () => {
  it('leaves an element out of a view without a scope by giving it one, and never deletes it', () => {
    const outcome = ok({ type: 'leave-out-of-view', view: VIEW, elements: ['db'] });
    expect(outcome.label).toBe('Leave "DB" out of "Overview"');
    expect(scopeOf(outcome.state)).toEqual({ leftOut: ['db'] });
    expect(outcome.state.model.elements.some((element) => element.id === 'db')).toBe(true);
    expect(shownIn(outcome.state)).not.toContain('db');
  });

  it('adds an element the rules leave out, and takes one out of the left-out list', () => {
    const services = ok({
      type: 'set-scope',
      view: VIEW,
      scope: { include: [{ kind: 'component', component: 'test.service' }], leftOut: ['client'] },
    }).state;
    const added = ok({ type: 'add-to-view', view: VIEW, elements: ['db', 'client'] }, services);
    expect(added.label).toBe('Add 2 elements to "Overview"');
    expect(scopeOf(added.state)).toEqual({
      include: [{ kind: 'component', component: 'test.service' }],
      added: ['db'],
    });
  });

  it('changes nothing when the view already shows or leaves out what is named', () => {
    expect(ok({ type: 'add-to-view', view: VIEW, elements: ['db'] }).operations).toEqual([]);
    const left = ok({ type: 'leave-out-of-view', view: VIEW, elements: ['db'] }).state;
    expect(
      ok({ type: 'leave-out-of-view', view: VIEW, elements: ['db'] }, left).operations,
    ).toEqual([]);
  });

  it('refuses World, unknown elements, an element given twice and an empty list', () => {
    expect(refused({ type: 'leave-out-of-view', view: VIEW, elements: ['world'] })).toEqual([
      'world-not-allowed',
    ]);
    expect(refused({ type: 'add-to-view', view: VIEW, elements: ['nobody'] })).toEqual([
      'unknown-element',
    ]);
    expect(refused({ type: 'add-to-view', view: VIEW, elements: ['db', 'db'] })).toEqual([
      'invalid-command',
    ]);
    expect(refused({ type: 'add-to-view', view: VIEW, elements: [] })).toEqual(['invalid-command']);
  });
});

const ELEMENTS = ['system', 'api', 'db', 'client', 'contract'] as const;

const scopes: fc.Arbitrary<Scope | null> = fc.option(
  fc.record(
    {
      include: fc.constantFrom(
        [{ kind: 'component' as const, component: 'test.service' }],
        [{ kind: 'contents' as const, container: 'system' }],
        [{ kind: 'relation-type' as const, relationType: 'test.calls' }],
      ),
      added: fc.subarray([...ELEMENTS], { minLength: 1 }),
    },
    { requiredKeys: [] },
  ),
);

describe('the scope commands, in any order', () => {
  it('leave out and add back show what was shown, and leave the model as it was', () => {
    fc.assert(
      fc.property(scopes, fc.constantFrom(...ELEMENTS), (scope, element) => {
        const start =
          scope === null ? testProject() : ok({ type: 'set-scope', view: VIEW, scope }).state;
        const left = ok({ type: 'leave-out-of-view', view: VIEW, elements: [element] }, start);
        expect(shownByScope(left.state, left.state.views[0]!).element(element)).toBe(false);
        const back = ok({ type: 'add-to-view', view: VIEW, elements: [element] }, left.state);
        expect(shownByScope(back.state, back.state.views[0]!).element(element)).toBe(true);
        const before = new Set<Id>(shownIn(start));
        before.add(element);
        expect(new Set(shownIn(back.state))).toEqual(before);
        expect(back.state.model).toBe(start.model);
      }),
    );
  });
});

describe('deleting what a scope names by hand', () => {
  it('takes it out of the scope’s lists, as the preview says, and leaves the rules', () => {
    const scope: Scope = {
      include: [{ kind: 'contents', container: 'system' }],
      added: ['client'],
      leftOut: ['db'],
    };
    const start = ok({ type: 'set-scope', view: VIEW, scope }).state;
    const preview = previewDelete(start, { elements: ['client', 'db'] });
    expect(preview.scopes).toEqual([
      { view: VIEW, list: 'added', element: 'client' },
      { view: VIEW, list: 'leftOut', element: 'db' },
    ]);
    const deleted = executeCommand(start, { type: 'delete', elements: ['client', 'db'] });
    if (!deleted.ok) throw new Error('refused');
    expect(applyOperations(deleted.state, deleted.inverse).state).toStrictEqual(start);
    expect(scopeOf(deleted.state)).toEqual({
      include: [{ kind: 'contents', container: 'system' }],
    });
  });
});

describe('making an element in a view with a scope', () => {
  it('shows it there, whatever the rules say, in the same action', () => {
    const services: Scope = { include: [{ kind: 'component', component: 'test.service' }] };
    const start = ok({ type: 'set-scope', view: VIEW, scope: services }).state;
    const made = executeCommand(
      start,
      {
        type: 'create-element',
        element: { id: 'cache', component: 'test.database', name: 'Cache' },
        inView: VIEW,
      },
      { newId: sequentialIds() },
    );
    if (!made.ok) throw new Error('refused');
    expect(scopeOf(made.state)).toEqual({ ...services, added: ['cache'] });
    expect(applyOperations(made.state, made.inverse).state).toStrictEqual(start);
    // One the rules show already stays out of the list.
    const service = executeCommand(start, {
      type: 'create-element',
      element: { id: 'billing', component: 'test.service', name: 'Billing' },
      inView: VIEW,
    });
    expect(service.ok && scopeOf(service.state)).toEqual(services);
  });
});

describe('opening a project whose scopes name what is gone', () => {
  it('warns, and the scope ignores what it names', () => {
    const state = testProject();
    state.views[0] = {
      ...state.views[0]!,
      scope: {
        include: [
          { kind: 'component', component: 'gone.box' },
          { kind: 'relation-type', relationType: 'gone.link' },
          { kind: 'contents', container: 'nobody' },
        ],
        added: ['ghost'],
      },
    };
    const warnings = checkProject(state).warnings.filter((each) => each.subjects?.includes(VIEW));
    expect(warnings.map((each) => each.code)).toEqual([
      'unknown-element',
      'unknown-component',
      'unknown-relation-type',
      'unknown-element',
    ]);
    expect(shownIn(state)).toEqual(['world']);
  });
});
