/** The commands that change the stacking order and the containers shapes sit in. */
import type { Element, Relation, ViewFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { executeCommand, previewChangeContainer, type Command } from './commands';
import { applyOperations } from './operations';
import type { ProblemCode } from './problems';
import type { ProjectSnapshot } from './snapshot';
import { stackingOrderOf } from './stacking';
import { sequentialIds, TEST_PACKAGE, testProject } from './test/fixtures';

function ok(command: Command, state: ProjectSnapshot = testProject()) {
  const outcome = executeCommand(state, command, { newId: sequentialIds() });
  if (!outcome.ok) {
    throw new Error(`Rejected: ${outcome.problems.map((each) => each.message).join(' ')}`);
  }
  // Whatever a command does, its inverse undoes exactly.
  expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(state);
  return outcome;
}

function refused(command: Command, state: ProjectSnapshot = testProject()) {
  const outcome = executeCommand(state, command, { newId: sequentialIds() });
  if (outcome.ok) throw new Error(`Accepted: ${outcome.label}`);
  return outcome.problems;
}

const codes = (command: Command, state?: ProjectSnapshot): ProblemCode[] =>
  refused(command, state).map((each) => each.code);

const viewOf = (state: ProjectSnapshot): ViewFile => state.views[0] as ViewFile;

function withView(state: ProjectSnapshot, changes: Partial<ViewFile>): ProjectSnapshot {
  return { ...state, views: [{ ...viewOf(state), ...changes }] };
}

function withRelations(state: ProjectSnapshot, ...relations: Relation[]): ProjectSnapshot {
  return {
    ...state,
    model: { ...state.model, relations: [...state.model.relations, ...relations] },
  };
}

/** The test project with a second relation type that nests, and its view arranged by both. */
function twoNestingTypes(): ProjectSnapshot {
  const project = testProject();
  const partOf = {
    id: 'test.part-of',
    name: 'is part of',
    derivesFrom: 'relates-to',
    direction: 'directed' as const,
    nests: true,
  };
  return withView(
    {
      ...project,
      packages: [{ ...TEST_PACKAGE, relationTypes: [...TEST_PACKAGE.relationTypes, partOf] }],
    },
    { nestingRelationTypes: ['test.inside', 'test.part-of'] },
  );
}

const restack = (...moves: Extract<Command, { type: 'restack' }>['moves']): Command => ({
  type: 'restack',
  view: 'overview',
  moves,
});

// The test project's World holds System, Client and Contract; System holds API and DB.
describe('restack', () => {
  it('brings a shape to the front or sends it to the back, storing the shortest list', () => {
    const front = ok(restack({ shape: { element: 'system' }, to: 'front' }));
    expect(front.label).toBe('Bring "System" to the front in "Overview"');
    expect(viewOf(front.state).stackingOrder).toEqual({ world: ['client', 'contract'] });
    expect(stackingOrderOf(front.state, 'overview')).toEqual(['client', 'contract', 'system']);

    const back = ok(restack({ shape: { element: 'db', container: 'system' }, to: 'back' }));
    expect(back.label).toBe('Send "DB" to the back in "Overview"');
    expect(viewOf(back.state).stackingOrder).toEqual({ system: ['db'] });
  });

  it('puts a shape just in front of or behind another', () => {
    const behind = ok(restack({ shape: { element: 'contract' }, to: { behind: 'client' } }));
    expect(behind.label).toBe('Send "Contract" behind "Client" in "Overview"');
    expect(stackingOrderOf(behind.state, 'overview')).toEqual(['system', 'contract', 'client']);
    const inFront = ok(restack({ shape: { element: 'system' }, to: { inFrontOf: 'client' } }));
    expect(inFront.label).toBe('Bring "System" in front of "Client" in "Overview"');
    expect(stackingOrderOf(inFront.state, 'overview')).toEqual(['client', 'system', 'contract']);
    expect(viewOf(inFront.state).stackingOrder).toEqual({ world: ['client'] });
  });

  it('changes nothing when the shape is already there, and takes World’s id as World', () => {
    expect(ok(restack({ shape: { element: 'contract' }, to: 'front' })).operations).toEqual([]);
    expect(
      ok(restack({ shape: { element: 'system', container: 'world' }, to: 'back' })).operations,
    ).toEqual([]);
  });

  it('stores no list once the order is the model’s again', () => {
    const back = ok(restack({ shape: { element: 'contract' }, to: 'back' })).state;
    expect(viewOf(back).stackingOrder).toEqual({ world: ['contract'] });
    const again = ok(restack({ shape: { element: 'contract' }, to: 'front' }), back).state;
    expect(viewOf(again)).not.toHaveProperty('stackingOrder');
    // An older shape brought back to the front leaves the list of what is drawn behind it.
    const client = ok(restack({ shape: { element: 'client' }, to: 'back' })).state;
    const returned = ok(restack({ shape: { element: 'client' }, to: 'front' }), client).state;
    expect(viewOf(returned).stackingOrder).toEqual({ world: ['system', 'contract'] });
  });

  it('drops ids that no longer sit there when it rewrites a list', () => {
    const stale = withView(testProject(), { stackingOrder: { system: ['gone', 'db'] } });
    const outcome = ok(
      restack({ shape: { element: 'api', container: 'system' }, to: 'back' }),
      stale,
    );
    expect(viewOf(outcome.state)).not.toHaveProperty('stackingOrder');
  });

  it('changes several containers in one action, naming what it did', () => {
    const outcome = ok(
      restack(
        { shape: { element: 'db', container: 'system' }, to: 'back' },
        { shape: { element: 'system' }, to: 'front' },
      ),
    );
    expect(outcome.label).toBe('Change the stacking order of 2 shapes in "Overview"');
    expect(viewOf(outcome.state).stackingOrder).toEqual({
      system: ['db'],
      world: ['client', 'contract'],
    });
    expect(
      ok(
        restack(
          { shape: { element: 'system' }, to: 'front' },
          { shape: { element: 'client' }, to: 'front' },
        ),
      ).label,
    ).toBe('Bring 2 shapes to the front in "Overview"');
    expect(
      ok(
        restack(
          { shape: { element: 'contract' }, to: 'back' },
          { shape: { element: 'client' }, to: 'back' },
        ),
      ).label,
    ).toBe('Send 2 shapes to the back in "Overview"');
    expect(
      ok(
        restack(
          { shape: { element: 'system' }, to: { inFrontOf: 'client' } },
          { shape: { element: 'db', container: 'system' }, to: { inFrontOf: 'api' } },
        ),
      ).label,
    ).toBe('Bring 2 shapes forward in "Overview"');
    expect(
      ok(
        restack(
          { shape: { element: 'contract' }, to: { behind: 'client' } },
          { shape: { element: 'db', container: 'system' }, to: { behind: 'api' } },
        ),
      ).label,
    ).toBe('Send 2 shapes backward in "Overview"');
  });

  it('replaces a whole list in one operation when it changes it a lot', () => {
    const base = testProject();
    const many: Element[] = Array.from({ length: 300 }, (_, at) => ({
      id: `e${at}`,
      component: 'test.box',
      name: `E${at}`,
    }));
    const crowded = {
      ...base,
      model: { ...base.model, elements: [...many, ...base.model.elements] },
    };
    const outcome = ok(restack({ shape: { element: 'e0' }, to: 'front' }), crowded);
    expect(outcome.operations).toHaveLength(1);
    expect(outcome.operations[0]).toMatchObject({
      op: 'replace-all',
      collection: { name: 'stackingOrder' },
    });
    expect(stackingOrderOf(outcome.state, 'overview').at(-1)).toBe('e0');
  });

  it('moves thousands of shapes in one command at once, in the order given', () => {
    const base = testProject();
    const many: Element[] = Array.from({ length: 9_000 }, (_, at) => ({
      id: `e${at}`,
      component: 'test.box',
      name: `E${at}`,
    }));
    const crowded = {
      ...base,
      model: { ...base.model, elements: [...many, ...base.model.elements] },
    };
    // Every other one to the front and the rest to the back, then one just behind another.
    const moves: Extract<Command, { type: 'restack' }>['moves'] = many.map((element, at) => ({
      shape: { element: element.id },
      to: at % 2 === 0 ? 'front' : 'back',
    }));
    moves.push({ shape: { element: 'client' }, to: { behind: 'e0' } });
    const started = Date.now();
    const outcome = executeCommand(crowded, restack(...moves), { newId: sequentialIds() });
    expect(Date.now() - started).toBeLessThan(250);
    if (!outcome.ok) throw new Error('Rejected');
    const order = stackingOrderOf(outcome.state, 'overview');
    expect(order.slice(0, 2)).toEqual(['e8999', 'e8997']);
    expect(order.slice(-3)).toEqual(['e8994', 'e8996', 'e8998']);
    expect(order[order.indexOf('e0') - 1]).toBe('client');
  });

  it('refuses what it cannot do, changing nothing', () => {
    expect(
      codes({
        type: 'restack',
        view: 'nothing',
        moves: [{ shape: { element: 'system' }, to: 'front' }],
      }),
    ).toEqual(['unknown-view']);
    expect(codes(restack())).toEqual(['invalid-command']);
    expect(codes(restack({ shape: { element: 'nothing' }, to: 'front' }))).toEqual([
      'unknown-element',
    ]);
    expect(codes(restack({ shape: { element: 'world' }, to: 'front' }))).toEqual([
      'world-not-allowed',
    ]);
    expect(
      codes(restack({ shape: { element: 'api', container: 'nothing' }, to: 'front' })),
    ).toEqual(['unknown-element']);
    expect(codes(restack({ shape: { element: 'api' }, to: 'front' }))).toEqual([
      'unknown-position',
    ]);
    expect(
      codes(
        restack(
          { shape: { element: 'system' }, to: 'front' },
          { shape: { element: 'system' }, to: 'back' },
        ),
      ),
    ).toEqual(['invalid-command']);
    expect(
      codes(restack({ shape: { element: 'system' }, to: 'top' as unknown as 'front' })),
    ).toEqual(['invalid-command']);
    expect(codes(restack({ shape: { element: 'system' }, to: { behind: 'system' } }))).toEqual([
      'invalid-command',
    ]);
    expect(codes(restack({ shape: { element: 'system' }, to: { behind: 'api' } }))).toEqual([
      'unknown-position',
    ]);
  });
});

const change = (
  command: Omit<Extract<Command, { type: 'change-container' }>, 'type' | 'view'>,
): Command => ({
  type: 'change-container',
  view: 'overview',
  ...command,
});

describe('change-container', () => {
  it('puts a shape from World inside a container, at a pinned position, in front', () => {
    const outcome = ok(
      change({ to: 'system', shapes: [{ element: 'client', at: { x: 30, y: 200 } }] }),
    );
    expect(outcome.label).toBe('Put "Client" inside "System"');
    const relation = outcome.state.model.relations.at(-1);
    expect(relation).toEqual({
      id: 'is-inside-1',
      relationType: 'test.inside',
      from: 'client',
      to: 'system',
    });
    expect(outcome.created).toEqual(['is-inside-1']);
    expect(viewOf(outcome.state).positions).toContainEqual({
      element: 'client',
      container: 'system',
      x: 30,
      y: 200,
      pinned: true,
    });
    expect(stackingOrderOf(outcome.state, 'overview', 'system')).toEqual(['api', 'db', 'client']);
  });

  it('keeps a position the program chose unpinned, so that layout may still move the shape', () => {
    const outcome = ok(
      change({
        to: 'system',
        shapes: [{ element: 'client', at: { x: 24, y: 48 }, pinned: false }],
      }),
    );
    expect(viewOf(outcome.state).positions).toContainEqual({
      element: 'client',
      container: 'system',
      x: 24,
      y: 48,
    });
  });

  it('moves a shape from one container into another, keeping the type of what it leaves', () => {
    const outcome = ok(change({ to: 'api', shapes: [{ element: 'db', from: 'system' }] }));
    expect(outcome.label).toBe('Move "DB" from "System" into "API"');
    const relations = outcome.state.model.relations;
    expect(relations.some((relation) => relation.id === 'db-in-system')).toBe(false);
    expect(relations.at(-1)).toMatchObject({ relationType: 'test.inside', from: 'db', to: 'api' });
    // The position it had in System stays, so that it comes back with the containment.
    expect(viewOf(outcome.state).positions.some((position) => position.element === 'db')).toBe(
      true,
    );
  });

  it('takes a shape out to World, in front, with a World position only when nothing else holds it', () => {
    const outcome = ok(
      change({ shapes: [{ element: 'api', from: 'system', at: { x: 600, y: 40 } }] }),
    );
    expect(outcome.label).toBe('Take "API" out of "System"');
    expect(viewOf(outcome.state).positions).toContainEqual({
      element: 'api',
      x: 600,
      y: 40,
      pinned: true,
    });
    expect(stackingOrderOf(outcome.state, 'overview')).toEqual([
      'system',
      'client',
      'contract',
      'api',
    ]);
    expect(viewOf(outcome.state).stackingOrder).toEqual({
      world: ['system', 'client', 'contract'],
    });

    const held = withRelations(testProject(), {
      id: 'api-in-contract',
      relationType: 'test.inside',
      from: 'api',
      to: 'contract',
    });
    const leaving = ok(
      change({ shapes: [{ element: 'api', from: 'system', at: { x: 1, y: 2 } }] }),
      held,
    );
    expect(
      viewOf(leaving.state).positions.some(
        (position) => position.element === 'api' && position.container === undefined,
      ),
    ).toBe(false);
  });

  it('only moves a shape that stays in its container, keeping its place in the order', () => {
    const stacked = withView(testProject(), { stackingOrder: { system: ['db'] } });
    const outcome = ok(
      change({ to: 'system', shapes: [{ element: 'db', from: 'system', at: { x: 5, y: 6 } }] }),
      stacked,
    );
    expect(outcome.label).toBe('Move "DB" in "Overview"');
    expect(outcome.state.model).toEqual(stacked.model);
    expect(viewOf(outcome.state).stackingOrder).toEqual({ system: ['db'] });
  });

  it('needs no new relation for an element that already sits in the container', () => {
    const twice = withRelations(testProject(), {
      id: 'client-in-system',
      relationType: 'test.inside',
      from: 'client',
      to: 'contract',
    });
    const outcome = ok(
      change({ to: 'system', shapes: [{ element: 'client', from: 'contract' }] }),
      twice,
    );
    expect(outcome.created).toEqual(['is-inside-1']);
    const again = withRelations(twice, {
      id: 'client-in-sys',
      relationType: 'test.inside',
      from: 'client',
      to: 'system',
    });
    const merged = ok(
      change({ to: 'system', shapes: [{ element: 'client', from: 'contract' }] }),
      again,
    );
    expect(merged.created).toEqual([]);
    expect(
      merged.state.model.relations.filter(
        (relation) => relation.from === 'client' && relation.relationType === 'test.inside',
      ),
    ).toHaveLength(1);
  });

  it('leaves every relation of the view’s types that places it, and takes the view’s first type then', () => {
    const project = withRelations(twoNestingTypes(), {
      id: 'api-part-of-system',
      relationType: 'test.part-of',
      from: 'api',
      to: 'system',
    });
    const outcome = ok(
      change({ to: 'contract', shapes: [{ element: 'api', from: 'system' }] }),
      project,
    );
    const ids = outcome.state.model.relations.map((relation) => relation.id);
    expect(ids).not.toContain('api-in-system');
    expect(ids).not.toContain('api-part-of-system');
    expect(outcome.state.model.relations.at(-1)).toMatchObject({
      relationType: 'test.inside',
      to: 'contract',
    });
  });

  it('counts an element given from two containers once', () => {
    const project = withRelations(testProject(), {
      id: 'api-in-contract',
      relationType: 'test.inside',
      from: 'api',
      to: 'contract',
    });
    const outcome = ok(
      change({
        to: 'client',
        shapes: [
          { element: 'api', from: 'system' },
          { element: 'api', from: 'contract' },
        ],
      }),
      project,
    );
    expect(outcome.label).toBe('Move "API" into "Client"');
    expect(outcome.created).toHaveLength(1);
  });

  it('brings an older element in front of what is already inside', () => {
    const first = ok(change({ to: 'contract', shapes: [{ element: 'client' }] })).state;
    const second = ok(change({ to: 'contract', shapes: [{ element: 'system' }] }), first).state;
    expect(stackingOrderOf(second, 'overview', 'contract')).toEqual(['client', 'system']);
    expect(viewOf(second).stackingOrder).toEqual({ contract: ['client'] });
  });

  it('deletes what ends on the relation it leaves, keeping the step that used it as a broken step', () => {
    const governed = withRelations(testProject(), {
      id: 'contract-governs-inside',
      relationType: 'test.governs',
      from: 'contract',
      to: 'api-in-system',
    });
    // A step that plays the relation that goes.
    const project: ProjectSnapshot = {
      ...governed,
      scenarios: governed.scenarios.map((scenario) => ({
        ...scenario,
        steps: [
          ...scenario.steps,
          {
            id: 'govern',
            description: 'The contract governs.',
            relations: ['contract-governs-inside'],
          },
        ],
      })),
    };
    const command = change({ shapes: [{ element: 'api', from: 'system' }] });
    const preview = previewChangeContainer(
      project,
      command as Extract<Command, { type: 'change-container' }>,
    );
    expect(preview.leaving).toEqual(['api-in-system']);
    expect(preview.cascaded).toEqual(['contract-governs-inside']);
    expect(preview.brokenSteps).toEqual([{ scenario: 'request', step: 'govern' }]);
    expect(preview.problems).toEqual([]);
    const outcome = ok(command, project);
    expect(outcome.state.model.relations.map((relation) => relation.id)).not.toContain(
      'contract-governs-inside',
    );
    expect(outcome.state.scenarios).toEqual(project.scenarios);
  });

  it('says which relations it deletes carry data of their own', () => {
    const named = {
      ...testProject(),
      model: {
        ...testProject().model,
        relations: testProject().model.relations.map((relation) =>
          relation.id === 'api-in-system' ? { ...relation, name: 'Deployed in' } : relation,
        ),
      },
    };
    const preview = previewChangeContainer(named, {
      type: 'change-container',
      view: 'overview',
      shapes: [{ element: 'api', from: 'system' }],
    });
    expect(preview.withData).toEqual(['api-in-system']);
  });

  it('refuses a cycle, through a type the view does not show too, and a shape into itself', () => {
    expect(codes(change({ to: 'api', shapes: [{ element: 'system' }] }))).toEqual([
      'containment-cycle',
    ]);
    expect(codes(change({ to: 'client', shapes: [{ element: 'client' }] }))).toEqual([
      'containment-cycle',
    ]);
    const hidden = withRelations(twoNestingTypes(), {
      id: 'db-part-of-client',
      relationType: 'test.part-of',
      from: 'db',
      to: 'client',
    });
    const onlyInside = withView(hidden, { nestingRelationTypes: ['test.inside'] });
    const problems = refused(change({ to: 'db', shapes: [{ element: 'client' }] }), onlyInside);
    expect(problems.map((each) => each.code)).toEqual(['containment-cycle']);
    expect(problems[0]?.message).toMatch(/which the view "Overview" does not show/);
    // The preview says the same as the command.
    expect(
      previewChangeContainer(onlyInside, {
        type: 'change-container',
        view: 'overview',
        to: 'db',
        shapes: [{ element: 'client' }],
      }).problems.map((each) => each.code),
    ).toEqual(['containment-cycle']);
  });

  it('refuses a type that does not nest or does not arrange the view, and a view that nests by none', () => {
    expect(
      codes(change({ to: 'system', relationType: 'test.calls', shapes: [{ element: 'client' }] })),
    ).toEqual(['not-nesting']);
    expect(
      codes(
        change({ to: 'system', relationType: 'test.part-of', shapes: [{ element: 'client' }] }),
        twoNestingTypes() && withView(twoNestingTypes(), { nestingRelationTypes: ['test.inside'] }),
      ),
    ).toEqual(['not-nesting']);
    expect(
      codes(change({ to: 'system', relationType: 'other.type', shapes: [{ element: 'client' }] })),
    ).toEqual(['unknown-relation-type']);
    expect(
      codes(
        change({ to: 'system', shapes: [{ element: 'client' }] }),
        withView(testProject(), { nestingRelationTypes: [] }),
      ),
    ).toEqual(['not-nesting']);
  });

  it('takes the view’s next type that nests when one it lists is gone, and never writes an unknown type', () => {
    const listing = withView(testProject(), {
      nestingRelationTypes: ['other.gone', 'test.inside'],
    });
    const outcome = ok(change({ to: 'system', shapes: [{ element: 'client' }] }), listing);
    expect(outcome.state.model.relations.at(-1)?.relationType).toBe('test.inside');
    const onlyGone = withView(testProject(), { nestingRelationTypes: ['other.gone'] });
    expect(codes(change({ to: 'system', shapes: [{ element: 'client' }] }), onlyGone)).toEqual([
      'not-nesting',
    ]);
  });

  it('refuses shapes that do not sit where it is told, and other malformed changes', () => {
    expect(codes(change({ to: 'system', shapes: [] }))).toEqual(['invalid-command']);
    expect(codes(change({ to: 'nothing', shapes: [{ element: 'client' }] }))).toEqual([
      'unknown-element',
    ]);
    expect(codes(change({ to: 'system', shapes: [{ element: 'nothing' }] }))).toEqual([
      'unknown-element',
    ]);
    expect(codes(change({ to: 'system', shapes: [{ element: 'world' }] }))).toEqual([
      'world-not-allowed',
    ]);
    expect(
      codes(change({ to: 'system', shapes: [{ element: 'client', from: 'contract' }] })),
    ).toEqual(['unknown-position']);
    expect(codes(change({ to: 'system', shapes: [{ element: 'api' }] }))).toEqual([
      'unknown-position',
    ]);
    expect(
      codes(change({ to: 'contract', shapes: [{ element: 'client' }, { element: 'client' }] })),
    ).toEqual(['invalid-command']);
    expect(
      codes(
        change({ to: 'contract', shapes: [{ element: 'client', at: { x: Number.NaN, y: 0 } }] }),
      ),
    ).toEqual(['invalid-command']);
    const pinnedByName = { element: 'client', at: { x: 0, y: 0 }, pinned: 'yes' };
    expect(
      codes(change({ to: 'contract', shapes: [pinnedByName as unknown as { element: string }] })),
    ).toEqual(['invalid-command']);
  });

  it('names what several shapes did', () => {
    expect(
      ok(change({ to: 'contract', shapes: [{ element: 'client' }, { element: 'system' }] })).label,
    ).toBe('Put 2 elements inside "Contract"');
    expect(
      ok(
        change({
          shapes: [
            { element: 'api', from: 'system' },
            { element: 'db', from: 'system' },
          ],
        }),
      ).label,
    ).toBe('Take 2 elements out of "System"');
    expect(
      ok(
        change({
          to: 'contract',
          shapes: [{ element: 'api', from: 'system' }, { element: 'client' }],
        }),
      ).label,
    ).toBe('Move 2 elements into "Contract"');
  });
});
