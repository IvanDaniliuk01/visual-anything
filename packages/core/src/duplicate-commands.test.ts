/**
 * The command that duplicates elements (ADR 0103): new elements with what their originals hold, the
 * relations among what is duplicated, landing in a container, in World or beside their originals, as
 * one action that undoes exactly.
 */
import fc from 'fast-check';
import type { Id, Relation } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { checkProject } from './check';
import { executeCommand, type Command } from './commands';
import { applyOperations } from './operations';
import { containmentCycles } from './rules';
import { shownByScope } from './scope';
import type { ProjectSnapshot } from './snapshot';
import { definitionsIn, modelIndexOf } from './state';
import { sequentialIds, testProject } from './test/fixtures';
import { commandFor, intent, pick, propertyProject } from './test/random-commands';

const VIEW = 'overview';

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
  return outcome.problems;
}

const duplicate = (
  elements: Id[],
  more: Partial<Extract<Command, { type: 'duplicate-elements' }>> = {},
): Command => ({ type: 'duplicate-elements', view: VIEW, elements, ...more });

const elementOf = (state: ProjectSnapshot, id: Id | undefined) =>
  state.model.elements.find((each) => each.id === id);
const relationsFrom = (state: ProjectSnapshot, id: Id | undefined) =>
  state.model.relations.filter((each) => each.from === id);
const positionsOf = (state: ProjectSnapshot, id: Id | undefined) =>
  state.views.find((view) => view.id === VIEW)?.positions.filter((each) => each.element === id);

describe('duplicate-elements', () => {
  it('duplicates a container with its contents and the relations among them, in World', () => {
    const outcome = ok(duplicate(['system'], { positions: [{ element: 'system', x: 500, y: 0 }] }));
    expect(outcome.label).toBe('Duplicate "System"');
    const [system, api, db, ...relations] = outcome.created;
    const { state } = outcome;
    // System sits in World, where its duplicate lands: it says it is a copy; its contents do not.
    expect(elementOf(state, system)).toMatchObject({
      component: 'test.box',
      name: 'System (copy)',
    });
    expect(elementOf(state, api)).toMatchObject({
      component: 'test.service',
      name: 'API',
      attributes: { latency: 20 },
    });
    expect(elementOf(state, db)).toMatchObject({ name: 'DB' });
    // The two nesting relations and "reads", between the duplicates; "calls" ends on the client.
    expect(relations).toHaveLength(3);
    expect(relationsFrom(state, api).map((each) => [each.relationType, each.to])).toEqual([
      ['test.inside', system],
      ['test.reads', db],
    ]);
    expect(relationsFrom(state, db).map((each) => [each.relationType, each.to])).toEqual([
      ['test.inside', system],
    ]);
    expect(relationsFrom(state, system)).toEqual([]);
    // The duplicate goes where it was asked, its size kept and left for layout; what it holds keeps
    // its place inside it.
    expect(positionsOf(state, system)).toEqual([
      { element: system, x: 500, y: 0, width: 400, height: 300 },
    ]);
    expect(positionsOf(state, api)).toEqual([{ element: api, container: system, x: 20, y: 40 }]);
    expect(checkProject(state).errors).toEqual([]);
  });

  it('duplicates into a container through the nesting relation type it chooses', () => {
    const outcome = ok(
      duplicate(['client'], {
        container: 'system',
        positions: [{ element: 'client', x: 200, y: 40 }],
      }),
    );
    const [client, nesting] = outcome.created;
    // The client sits in World, not in System: its duplicate keeps its name.
    expect(elementOf(outcome.state, client)?.name).toBe('Client');
    expect(outcome.state.model.relations.find((each) => each.id === nesting)).toMatchObject({
      relationType: 'test.inside',
      from: client,
      to: 'system',
    });
    expect(positionsOf(outcome.state, client)).toEqual([
      { element: client, container: 'system', x: 200, y: 40 },
    ]);
  });

  it('names a copy only when it lands in the container its original sits in', () => {
    const into = ok(duplicate(['api'], { container: 'system' }));
    expect(elementOf(into.state, into.created[0])?.name).toBe('API (copy)');
    const elsewhere = ok(duplicate(['api']));
    expect(elementOf(elsewhere.state, elsewhere.created[0])?.name).toBe('API');
    const spanish = ok(duplicate(['api'], { container: 'system', suffix: ' (copia)' }));
    expect(elementOf(spanish.state, spanish.created[0])?.name).toBe('API (copia)');
  });

  it('duplicates beside the originals, in the containers they sit in', () => {
    const outcome = ok(
      duplicate(['api', 'client'], {
        beside: true,
        positions: [
          { element: 'api', x: 220, y: 40 },
          { element: 'client', x: -250, y: 200 },
        ],
      }),
    );
    expect(outcome.label).toBe('Duplicate 2 elements');
    const [api, client] = outcome.created;
    const { state } = outcome;
    expect(elementOf(state, api)?.name).toBe('API (copy)');
    expect(elementOf(state, client)?.name).toBe('Client (copy)');
    expect(relationsFrom(state, api).map((each) => [each.relationType, each.to])).toEqual([
      ['test.inside', 'system'],
    ]);
    // "calls" runs between the two duplicated.
    expect(relationsFrom(state, client).map((each) => [each.relationType, each.to])).toEqual([
      ['test.calls', api],
    ]);
    expect(positionsOf(state, api)).toEqual([{ element: api, container: 'system', x: 220, y: 40 }]);
    expect(positionsOf(state, client)).toEqual([{ element: client, x: -250, y: 200 }]);
  });

  it('places a duplicate beside its original in each container it sits in, by the place for each', () => {
    // API sits in System and in Contract, with a place of its own in each.
    const start = testProject();
    const twice: ProjectSnapshot = {
      ...start,
      model: {
        ...start.model,
        relations: [
          ...start.model.relations,
          { id: 'api-in-contract', relationType: 'test.inside', from: 'api', to: 'contract' },
        ],
      },
      views: start.views.map((view) =>
        view.id === VIEW
          ? {
              ...view,
              positions: [
                ...view.positions.filter((each) => each.element !== 'api'),
                { element: 'api', container: 'system', x: 20, y: 40, width: 120 },
                { element: 'api', container: 'contract', x: 300, y: 10 },
              ],
            }
          : view,
      ),
    };
    const outcome = ok(
      duplicate(['api'], {
        beside: true,
        positions: [
          { element: 'api', container: 'system', x: 180, y: 40 },
          { element: 'api', container: 'contract', x: 460, y: 10 },
        ],
      }),
      twice,
    );
    const [api] = outcome.created;
    expect(
      relationsFrom(outcome.state, api)
        .filter((each) => each.relationType === 'test.inside')
        .map((each) => each.to)
        .sort(),
    ).toEqual(['contract', 'system']);
    expect(positionsOf(outcome.state, api)).toEqual(
      expect.arrayContaining([
        { element: api, container: 'system', x: 180, y: 40, width: 120 },
        { element: api, container: 'contract', x: 460, y: 10 },
      ]),
    );
    expect(positionsOf(outcome.state, api)).toHaveLength(2);
    // A place that names no container goes wherever there is no place of its own.
    const either = ok(
      duplicate(['api'], {
        beside: true,
        positions: [
          { element: 'api', x: 0, y: 0 },
          { element: 'api', container: 'contract', x: 460, y: 10 },
        ],
      }),
      twice,
    );
    const [other] = either.created;
    expect(positionsOf(either.state, other)).toEqual(
      expect.arrayContaining([
        { element: other, container: 'system', x: 0, y: 0, width: 120 },
        { element: other, container: 'contract', x: 460, y: 10 },
      ]),
    );
    expect(
      refused(
        duplicate(['api'], {
          beside: true,
          positions: [{ element: 'api', container: '', x: 0, y: 0 }],
        }),
        twice,
      ).map((each) => each.code),
    ).toEqual(['invalid-id']);
  });

  it('duplicates a relation that ends on a relation when both its ends are duplicated', () => {
    const outcome = ok(duplicate(['client', 'system', 'contract']));
    const { state, created } = outcome;
    const [client, , contract] = created;
    const [call] = relationsFrom(state, client);
    expect(call).toMatchObject({ relationType: 'test.calls' });
    expect(relationsFrom(state, contract)).toEqual([
      expect.objectContaining({ relationType: 'test.governs', to: call?.id }),
    ]);
    expect(checkProject(state).errors).toEqual([]);
  });

  it('shows the duplicates in a view whose scope would leave them out', () => {
    const scoped = ok({
      type: 'set-scope',
      view: VIEW,
      scope: { include: [{ kind: 'component', component: 'test.box', exactly: true }] },
    }).state;
    const outcome = ok(duplicate(['system']), scoped);
    const view = outcome.state.views.find((each) => each.id === VIEW)!;
    const shown = shownByScope(outcome.state, view);
    const [system, api, db] = outcome.created;
    // The duplicate that lands shows; what it holds shows as its originals did, which was not.
    expect(shown.element(system as Id)).toBe(true);
    expect(shown.element(api as Id)).toBe(false);
    expect(shown.element(db as Id)).toBe(false);
  });

  it('makes the view nest by the relation type that holds the duplicates when it does not yet', () => {
    const start = ok({
      type: 'update-view',
      id: VIEW,
      changes: { nestingRelationTypes: [] },
    }).state;
    const outcome = ok(duplicate(['client'], { container: 'system' }), start);
    expect(outcome.state.views.find((each) => each.id === VIEW)?.nestingRelationTypes).toEqual([
      'test.inside',
    ]);
  });

  it('refuses what cannot be duplicated, and changes nothing', () => {
    expect(refused(duplicate([])).map((each) => each.code)).toEqual(['invalid-command']);
    expect(refused(duplicate(['world'])).map((each) => each.code)).toEqual(['world-not-allowed']);
    expect(refused(duplicate(['ghost'])).map((each) => each.code)).toEqual(['unknown-element']);
    expect(refused(duplicate(['api', 'api'])).map((each) => each.code)).toEqual([
      'invalid-command',
    ]);
    expect(
      refused(duplicate(['api'], { beside: true, container: 'system' })).map((each) => each.code),
    ).toEqual(['invalid-command']);
    expect(
      refused(duplicate(['api'], { positions: [{ element: 'db', x: 0, y: 0 }] })).map(
        (each) => each.code,
      ),
    ).toEqual(['invalid-command']);
    // With no relation type that nests, nothing can hold the duplicates.
    const flat = testProject();
    const [own] = flat.packages;
    const unnested: ProjectSnapshot = {
      ...flat,
      packages: [
        {
          ...own!,
          relationTypes: own!.relationTypes.map((type) => ({ ...type, nests: false })),
        },
      ],
    };
    expect(
      refused(duplicate(['client'], { container: 'system' }), unnested).map((each) => each.code),
    ).toEqual(['not-nesting']);
  });
});

/** Everything an element holds through any nesting relation type, it included, at any depth. */
function heldBy(state: ProjectSnapshot, given: readonly Id[]): Set<Id> {
  const nesting = definitionsIn(state).nestingRelationTypes;
  const held = new Set(given);
  let grew = true;
  while (grew) {
    grew = false;
    for (const relation of state.model.relations) {
      if (!nesting.has(relation.relationType)) continue;
      const element = modelIndexOf(state).element(relation.from);
      if (!element || element.id === state.model.world.id) continue;
      if (held.has(relation.to) && !held.has(relation.from)) {
        held.add(relation.from);
        grew = true;
      }
    }
  }
  return held;
}

/** The relations among a set of elements: both ends in it, or on a relation among it. */
function relationsAmong(state: ProjectSnapshot, elements: ReadonlySet<Id>): Relation[] {
  const among = new Set<Id>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const relation of state.model.relations) {
      if (among.has(relation.id)) continue;
      const inside = (end: Id) => elements.has(end) || among.has(end);
      if (inside(relation.from) && inside(relation.to)) {
        among.add(relation.id);
        grew = true;
      }
    }
  }
  return state.model.relations.filter((relation) => among.has(relation.id));
}

/** Runs commands for intents on the property project, then duplicates; checks what it made. */
const duplicatesKeepTheRules = fc.property(
  fc.array(intent, { maxLength: 25 }),
  fc.array(fc.nat({ max: 1000 }), { minLength: 1, maxLength: 3 }),
  fc.option(fc.nat({ max: 1000 })),
  fc.boolean(),
  (intents, picks, into, beside) => {
    let state = propertyProject();
    for (const wish of intents) {
      if (wish.kind === 'undo' || wish.kind === 'redo') continue;
      const command = commandFor(state, wish);
      if (!command) continue;
      const outcome = executeCommand(state, command);
      if (outcome.ok) state = outcome.state;
    }
    const view = state.views[0];
    const ids = state.model.elements.map((element) => element.id);
    if (!view || ids.length === 0) return;
    const given = [...new Set(picks.map((at) => pick(ids, at) as Id))];
    const container = into === null ? undefined : pick(ids, into);
    const outcome = executeCommand(state, {
      type: 'duplicate-elements',
      view: view.id,
      elements: given,
      ...(beside ? { beside: true } : container === undefined ? {} : { container }),
    });
    if (!outcome.ok) {
      // Only a container no nesting relation type can hold refuses.
      expect(outcome.problems.map((each) => each.code)).toEqual(['not-nesting']);
      return;
    }
    const after = outcome.state;
    expect(checkProject(after).errors).toEqual([]);
    const all = [after.model.world.id, ...after.model.elements.map((element) => element.id)];
    expect(containmentCycles(modelIndexOf(after), all)).toEqual([]);
    expect(applyOperations(after, outcome.inverse).state).toStrictEqual(state);

    // One duplicate for each element held, and the relations among the duplicates mirror
    // exactly those among what was copied.
    const copied = heldBy(state, given);
    const made = new Set(after.model.elements.slice(state.model.elements.length).map((e) => e.id));
    expect(made.size).toBe(copied.size);
    const among = relationsAmong(state, copied);
    const amongMade = relationsAmong(after, made);
    expect(amongMade.map((each) => each.relationType).sort()).toEqual(
      among.map((each) => each.relationType).sort(),
    );
    // Besides those, only the relations that land the duplicates in a container are new.
    const landing = after.model.relations
      .slice(state.model.relations.length)
      .filter((relation) => !amongMade.includes(relation));
    for (const relation of landing) {
      expect(made.has(relation.from)).toBe(true);
      expect(made.has(relation.to)).toBe(false);
      expect(definitionsIn(after).nestingRelationTypes.has(relation.relationType)).toBe(true);
    }
  },
);

describe('duplicate-elements, on projects made at random', () => {
  it('never breaks the invariants, and duplicates exactly the relations among what it copies', () => {
    fc.assert(duplicatesKeepTheRules, { numRuns: 60 });
  }, 60_000);

  it('duplicates a relation between two relations among what it copies', () => {
    // Found by the property above (seed 78695494): "governs" ran from one relation among the copied
    // set to another, touching no element, and was left behind.
    fc.assert(duplicatesKeepTheRules, {
      numRuns: 1,
      seed: 78695494,
      path: '28:3:6:2:2:11:4:7:8:8:5:5',
      endOnFailure: true,
    });
  });
});
