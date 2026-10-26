/**
 * A view leaves out relation types (ADR 0064): their relations it does not draw, with the types
 * derived from each unless `exactly`; a relation type it nests by is never left out. The command
 * that sets the list is one action that changes only the view's file and undoes exactly; deleting a
 * relation type takes it out of every view's list in the same action; and a step on a relation the
 * view leaves out plays as outside the view.
 */
import fc from 'fast-check';
import type { Id, RelationTypeLeftOut, ViewFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { checkProject } from './check';
import { executeCommand, type Command } from './commands';
import { applyOperations } from './operations';
import { scenarioTimeline } from './scenarios/timeline';
import { relationTypesLeftOutBy, shownByScope } from './scope';
import type { ProjectSnapshot } from './snapshot';
import { sequentialIds, testProject } from './test/fixtures';

const VIEW = 'overview';

const viewOf = (state: ProjectSnapshot): ViewFile =>
  state.views.find((view) => view.id === VIEW) as ViewFile;

/** The test project with its view leaving out these relation types, and the scope given. */
function leaving(
  relationTypesLeftOut: RelationTypeLeftOut[] | undefined,
  scope?: ViewFile['scope'],
): ProjectSnapshot {
  const state = testProject();
  return {
    ...state,
    views: state.views.map((view) => ({
      ...view,
      ...(relationTypesLeftOut === undefined ? {} : { relationTypesLeftOut }),
      ...(scope === undefined ? {} : { scope }),
    })),
  };
}

function run(command: Command, state: ProjectSnapshot = testProject()) {
  const outcome = executeCommand(state, command, { newId: sequentialIds() });
  if (outcome.ok) {
    expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(state);
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

const RELATIONS = [
  'api-in-system',
  'db-in-system',
  'client-calls-api',
  'api-reads-db',
  'contract-governs-call',
];

/** The relations the view draws, in model order. */
function drawn(state: ProjectSnapshot): string[] {
  const shown = shownByScope(state, viewOf(state));
  return RELATIONS.filter((id) => shown.relation(id));
}

describe('what a view leaves out by relation type', () => {
  it('draws no relation of a type it leaves out, nor of one derived from it unless exactly', () => {
    // "reads" derives from "calls", and "governs" ends on the call.
    expect(drawn(leaving([{ relationType: 'test.calls' }]))).toEqual([
      'api-in-system',
      'db-in-system',
    ]);
    expect(drawn(leaving([{ relationType: 'test.calls', exactly: true }]))).toEqual([
      'api-in-system',
      'db-in-system',
      'api-reads-db',
    ]);
    expect(drawn(leaving([{ relationType: 'test.reads' }]))).toEqual([
      'api-in-system',
      'db-in-system',
      'client-calls-api',
      'contract-governs-call',
    ]);
  });

  it('never leaves out a relation type the view nests by, even under one that covers it', () => {
    const state = leaving([{ relationType: 'relates-to' }]);
    expect(drawn(state)).toEqual(['api-in-system', 'db-in-system']);
    const types = relationTypesLeftOutBy(state, viewOf(state));
    expect(types.any).toBe(true);
    expect(types.has('test.calls')).toBe(true);
    expect(types.has('test.inside')).toBe(false);
  });

  it('shows every element still, and keeps what the scope alone shows apart', () => {
    const state = leaving([{ relationType: 'test.calls' }], { leftOut: ['db'] });
    const shown = shownByScope(state, viewOf(state));
    expect(shown.element('api')).toBe(true);
    expect(shown.element('db')).toBe(false);
    // The call's ends both show: only its type leaves it out. The read's end does not show.
    expect(shown.relation('client-calls-api')).toBe(false);
    expect(shown.relationByScope('client-calls-api')).toBe(true);
    expect(shown.relationByScope('api-reads-db')).toBe(false);
  });

  it('leaves the view as it was without a list', () => {
    const state = leaving(undefined);
    expect(drawn(state)).toEqual(RELATIONS);
    expect(relationTypesLeftOutBy(state, viewOf(state)).any).toBe(false);
  });

  it('shows a relation exactly while its ends show and no type it leaves out takes it, on any list', () => {
    const types = ['relates-to', 'test.calls', 'test.reads', 'test.inside', 'test.governs'];
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.tuple(fc.constantFrom(...types), fc.boolean()), {
          maxLength: 4,
          selector: ([type]) => type,
        }),
        fc.subarray(['system', 'api', 'db', 'client', 'contract']),
        (entries, out) => {
          const list = entries.map(([relationType, exactly]) => ({
            relationType,
            ...(exactly ? { exactly } : {}),
          }));
          const state = leaving(list, out.length > 0 ? { leftOut: out } : undefined);
          const shown = shownByScope(state, viewOf(state));
          const lineage: Record<string, string[]> = {
            'test.calls': ['test.calls', 'relates-to'],
            'test.reads': ['test.reads', 'test.calls', 'relates-to'],
            'test.inside': ['test.inside', 'relates-to'],
            'test.governs': ['test.governs', 'relates-to'],
          };
          const typeLeftOut = (type: string) =>
            type !== 'test.inside' &&
            list.some((entry) =>
              entry.exactly
                ? entry.relationType === type
                : lineage[type]?.includes(entry.relationType),
            );
          for (const relation of state.model.relations) {
            const end = (id: Id): boolean =>
              state.model.relations.some((each) => each.id === id)
                ? shown.relation(id)
                : shown.element(id);
            const expected =
              end(relation.from) && end(relation.to) && !typeLeftOut(relation.relationType);
            expect(shown.relation(relation.id)).toBe(expected);
          }
        },
      ),
    );
  });
});

describe('set-relation-types-left-out', () => {
  it('stores the list sorted by relation type, says what it did, and draws them all again with an empty list', () => {
    const one = ok({
      type: 'set-relation-types-left-out',
      view: VIEW,
      relationTypes: [{ relationType: 'test.governs' }],
    });
    expect(one.label).toBe('Leave the relations of "governs" out of "Overview"');
    const two = ok(
      {
        type: 'set-relation-types-left-out',
        view: VIEW,
        relationTypes: [
          { relationType: 'test.governs' },
          { relationType: 'test.calls', exactly: true },
        ],
      },
      one.state,
    );
    expect(two.label).toBe('Leave the relations of "calls" out of "Overview"');
    expect(viewOf(two.state).relationTypesLeftOut).toEqual([
      { relationType: 'test.calls', exactly: true },
      { relationType: 'test.governs' },
    ]);
    const back = ok(
      {
        type: 'set-relation-types-left-out',
        view: VIEW,
        relationTypes: [{ relationType: 'test.calls', exactly: true }],
      },
      two.state,
    );
    expect(back.label).toBe('Draw the relations of "governs" in "Overview" again');
    const several = ok(
      {
        type: 'set-relation-types-left-out',
        view: VIEW,
        relationTypes: [{ relationType: 'test.governs' }, { relationType: 'test.reads' }],
      },
      back.state,
    );
    expect(several.label).toBe('Change which relation types "Overview" leaves out');
    const none = ok(
      { type: 'set-relation-types-left-out', view: VIEW, relationTypes: [] },
      several.state,
    );
    expect(none.label).toBe('Draw every relation type in "Overview"');
    expect(viewOf(none.state)).not.toHaveProperty('relationTypesLeftOut');
    const many = ok({
      type: 'set-relation-types-left-out',
      view: VIEW,
      relationTypes: [{ relationType: 'test.governs' }, { relationType: 'test.reads' }],
    });
    expect(many.label).toBe('Leave the relations of 2 relation types out of "Overview"');
  });

  it('changes only the view, and nothing when the list stays the same', () => {
    const state = testProject();
    const outcome = ok(
      {
        type: 'set-relation-types-left-out',
        view: VIEW,
        relationTypes: [{ relationType: 'test.governs', exactly: false }],
      },
      state,
    );
    expect(outcome.state.model).toBe(state.model);
    expect(outcome.state.packages).toBe(state.packages);
    expect(viewOf(outcome.state).relationTypesLeftOut).toEqual([{ relationType: 'test.governs' }]);
    const again = ok(
      {
        type: 'set-relation-types-left-out',
        view: VIEW,
        relationTypes: [{ relationType: 'test.governs' }],
      },
      outcome.state,
    );
    expect(again.operations).toEqual([]);
  });

  it('refuses a relation type no package defines, one given twice, a nesting type of the view, and what is not a list', () => {
    expect(
      refused({
        type: 'set-relation-types-left-out',
        view: VIEW,
        relationTypes: [{ relationType: 'nope' }],
      }),
    ).toEqual(['unknown-relation-type']);
    expect(
      refused({
        type: 'set-relation-types-left-out',
        view: VIEW,
        relationTypes: [
          { relationType: 'test.calls' },
          { relationType: 'test.calls', exactly: true },
        ],
      }),
    ).toEqual(['invalid-command']);
    expect(
      refused({
        type: 'set-relation-types-left-out',
        view: VIEW,
        relationTypes: [{ relationType: 'test.inside' }],
      }),
    ).toEqual(['not-drawn-as-line']);
    expect(
      refused({
        type: 'set-relation-types-left-out',
        view: VIEW,
        relationTypes: [{ relationType: 'test.calls', exactly: 'yes' } as never],
      }),
    ).toEqual(['invalid-command']);
    expect(
      refused({ type: 'set-relation-types-left-out', view: VIEW, relationTypes: {} as never }),
    ).toEqual(['invalid-command']);
    expect(
      refused({ type: 'set-relation-types-left-out', view: 'nowhere', relationTypes: [] }),
    ).toEqual(['unknown-view']);
  });

  it('undoes and redoes exactly, from any list to any other', () => {
    const types = ['relates-to', 'test.calls', 'test.reads', 'test.governs'];
    const list = fc
      .uniqueArray(fc.tuple(fc.constantFrom(...types), fc.boolean()), {
        maxLength: 4,
        selector: ([type]) => type,
      })
      .map((entries) =>
        entries.map(([relationType, exactly]) => ({
          relationType,
          ...(exactly ? { exactly } : {}),
        })),
      );
    fc.assert(
      fc.property(list, list, (first, second) => {
        const start = ok({ type: 'set-relation-types-left-out', view: VIEW, relationTypes: first });
        const next = executeCommand(start.state, {
          type: 'set-relation-types-left-out',
          view: VIEW,
          relationTypes: second,
        });
        if (!next.ok) throw new Error(next.problems.map((each) => each.message).join(' '));
        const undone = applyOperations(next.state, next.inverse).state;
        expect(undone).toStrictEqual(start.state);
        expect(applyOperations(undone, next.operations).state).toStrictEqual(next.state);
        // The list is kept sorted, each relation type once.
        const kept = viewOf(next.state).relationTypesLeftOut ?? [];
        expect(kept.map((each) => each.relationType)).toEqual(
          [...new Set(second.map((each) => each.relationType))].sort(),
        );
      }),
    );
  });
});

describe('a view nests by a relation type it leaves out', () => {
  it('is refused, until the view draws the relation type again', () => {
    const state = leaving([{ relationType: 'test.governs' }]);
    expect(
      refused(
        {
          type: 'update-view',
          id: VIEW,
          changes: { nestingRelationTypes: ['test.inside', 'test.governs'] },
        },
        state,
      ),
    ).toEqual(['not-nesting']);
    const withNesting: ProjectSnapshot = {
      ...state,
      packages: state.packages.map((file) => ({
        ...file,
        relationTypes: file.relationTypes.map((type) =>
          type.id === 'test.governs' ? { ...type, nests: true } : type,
        ),
      })),
    };
    expect(
      refused(
        {
          type: 'update-view',
          id: VIEW,
          changes: { nestingRelationTypes: ['test.inside', 'test.governs'] },
        },
        withNesting,
      ),
    ).toEqual(['in-use']);
  });
});

describe('removing a relation type', () => {
  it('takes it out of every view that leaves it out, in the same action', () => {
    const defined = ok({
      type: 'define-relation-type',
      package: 'test',
      relationType: { id: 'test.watches', name: 'watches', derivesFrom: 'relates-to' },
    });
    const left = ok(
      {
        type: 'set-relation-types-left-out',
        view: VIEW,
        relationTypes: [{ relationType: 'test.watches' }, { relationType: 'test.governs' }],
      },
      defined.state,
    );
    const removed = ok({ type: 'remove-relation-type', id: 'test.watches' }, left.state);
    expect(viewOf(removed.state).relationTypesLeftOut).toEqual([{ relationType: 'test.governs' }]);
    expect(applyOperations(removed.state, removed.inverse).state).toStrictEqual(left.state);
    const alone = ok(
      {
        type: 'set-relation-types-left-out',
        view: VIEW,
        relationTypes: [{ relationType: 'test.watches' }],
      },
      defined.state,
    );
    const gone = ok({ type: 'remove-relation-type', id: 'test.watches' }, alone.state);
    expect(viewOf(gone.state)).not.toHaveProperty('relationTypesLeftOut');
  });
});

describe('checking a project', () => {
  it('warns about a relation type left out that no package in use defines', () => {
    const { errors, warnings } = checkProject(leaving([{ relationType: 'gone.type' }]));
    expect(errors).toEqual([]);
    expect(warnings).toContainEqual(
      expect.objectContaining({
        code: 'unknown-relation-type',
        message:
          'The view "Overview" leaves out the relation type "gone.type", which no package in use defines.',
      }),
    );
  });
});

describe('a step on a relation the view leaves out', () => {
  it('plays as outside the view, and a step with a relation it draws plays as before', () => {
    const state = leaving([{ relationType: 'test.reads' }]);
    const scenario = state.scenarios[0]!;
    const timeline = scenarioTimeline(state, scenario);
    expect(
      timeline.entries.map((entry) => entry.kind === 'step' && entry.outside === true),
    ).toEqual([false, true]);
    const whole = scenarioTimeline(testProject(), testProject().scenarios[0]!);
    expect(whole.entries.some((entry) => entry.kind === 'step' && entry.outside)).toBe(false);
  });
});
