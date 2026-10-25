import { describe, expect, it } from 'vitest';
import { executeCommand, type Command, type CommandOutcome } from './commands';
import { applyOperations } from './operations';
import type { ProblemCode } from './problems';
import type { ProjectSnapshot } from './snapshot';
import { sequentialIds, testProject } from './test/fixtures';

function run(command: Command, state: ProjectSnapshot = testProject()) {
  const outcome = executeCommand(state, command, { newId: sequentialIds() });
  return { state, outcome };
}

function ok(command: Command, state?: ProjectSnapshot): Extract<CommandOutcome, { ok: true }> {
  const { state: before, outcome } = run(command, state);
  if (!outcome.ok)
    throw new Error(`Rejected: ${outcome.problems.map((each) => each.message).join(' ')}`);
  // Whatever a command does, its inverse undoes exactly.
  expect(applyOperations(outcome.state, outcome.inverse).state).toEqual(before);
  return outcome;
}

function rejected(command: Command, state?: ProjectSnapshot): ProblemCode[] {
  const { outcome } = run(command, state);
  if (outcome.ok) throw new Error(`Accepted: ${outcome.label}`);
  return outcome.problems.map((each) => each.code);
}

describe('create-element', () => {
  it('creates an element with an id made from its name and returns it', () => {
    const outcome = ok({
      type: 'create-element',
      element: { component: 'test.database', name: 'Cache', attributes: { engine: 'redis' } },
    });
    expect(outcome.created).toEqual(['cache-1']);
    expect(outcome.label).toBe('Create "Cache"');
    expect(outcome.state.model.elements.at(-1)).toEqual({
      id: 'cache-1',
      component: 'test.database',
      name: 'Cache',
      attributes: { engine: 'redis' },
    });
  });

  it('places it in containers and in views in the same action', () => {
    const outcome = ok({
      type: 'create-element',
      element: { component: 'test.service', name: 'Worker' },
      containers: [{ container: 'system', relationType: 'test.inside' }],
      positions: [{ view: 'overview', container: 'system', x: 200, y: 40 }],
    });
    expect(outcome.created).toEqual(['worker-1', 'is-inside-2']);
    expect(outcome.state.model.relations.at(-1)).toEqual({
      id: 'is-inside-2',
      relationType: 'test.inside',
      from: 'worker-1',
      to: 'system',
    });
    expect(outcome.state.views[0]?.positions.at(-1)).toEqual({
      element: 'worker-1',
      container: 'system',
      x: 200,
      y: 40,
    });
  });

  it('refuses an unknown component, an empty name and a taken or invalid id', () => {
    expect(
      rejected({ type: 'create-element', element: { component: 'test.nope', name: 'A' } }),
    ).toEqual(['unknown-component']);
    expect(
      rejected({ type: 'create-element', element: { component: 'test.box', name: ' ' } }),
    ).toEqual(['empty-name']);
    expect(
      rejected({
        type: 'create-element',
        element: { id: 'api', component: 'test.box', name: 'A' },
      }),
    ).toEqual(['id-taken']);
    expect(
      rejected({
        type: 'create-element',
        element: { id: 'has space', component: 'test.box', name: 'A' },
      }),
    ).toEqual(['invalid-id']);
  });

  it('refuses a command that is missing a part, as not well formed', () => {
    expect(rejected({ type: 'create-element' } as unknown as Command)).toEqual(['invalid-command']);
    expect(rejected({ type: 'update-element', id: 'api' } as unknown as Command)).toEqual([
      'invalid-command',
    ]);
  });

  it('keeps no part of a command it refuses', () => {
    const state = testProject();
    const { outcome } = run(
      {
        type: 'create-element',
        element: { component: 'test.box', name: 'Unplaced' },
        positions: [{ view: 'no-view', x: 0, y: 0 }],
      },
      state,
    );
    expect(outcome.ok).toBe(false);
    expect(state).toEqual(testProject());
  });
});

describe('update-element', () => {
  it('renames, sets and removes attributes, and removes optional traits with null', () => {
    const renamed = ok({ type: 'update-element', id: 'api', changes: { name: 'Gateway' } });
    expect(renamed.label).toBe('Rename "API" to "Gateway"');

    const edited = ok({
      type: 'update-element',
      id: 'api',
      changes: {
        description: 'Fronts the DB.',
        attributes: { owner: 'Team A' },
        removeAttributes: ['latency'],
        appearance: { fill: '#FF0000' },
      },
    });
    expect(edited.state.model.elements[1]).toEqual({
      id: 'api',
      component: 'test.service',
      name: 'API',
      description: 'Fronts the DB.',
      attributes: { owner: 'Team A' },
      appearance: { fill: '#FF0000' },
    });

    const cleared = ok(
      {
        type: 'update-element',
        id: 'api',
        changes: { description: null, appearance: null, removeAttributes: ['owner'] },
      },
      edited.state,
    );
    expect(cleared.state.model.elements[1]).toEqual({
      id: 'api',
      component: 'test.service',
      name: 'API',
    });
  });

  it('keeps an attribute named __proto__ as an attribute', () => {
    const outcome = ok({
      type: 'update-element',
      id: 'db',
      changes: { attributes: JSON.parse('{"__proto__": 1}') as Record<string, number> },
    });
    const attributes = outcome.state.model.elements[2]?.attributes ?? {};
    expect(Object.keys(attributes)).toEqual(['__proto__']);
    expect(Object.getPrototypeOf(attributes)).toBe(Object.prototype);
  });

  it('renames World', () => {
    const outcome = ok({ type: 'update-element', id: 'world', changes: { name: 'Everything' } });
    expect(outcome.state.model.world.name).toBe('Everything');
  });

  it('warns when a new component breaks the limits of relations on the element', () => {
    const outcome = ok({
      type: 'update-element',
      id: 'client',
      changes: { component: 'test.box' },
    });
    expect(outcome.warnings.map((warning) => warning.code)).toEqual(['limit-broken']);
  });
});

describe('delete', () => {
  it('deletes elements, the relations that cascade and their positions, and keeps broken steps', () => {
    const outcome = ok({ type: 'delete', elements: ['api'] });
    expect(outcome.label).toBe('Delete "API"');
    expect(outcome.state.model.elements.map((element) => element.id)).toEqual([
      'system',
      'db',
      'client',
      'contract',
    ]);
    expect(outcome.state.model.relations.map((relation) => relation.id)).toEqual(['db-in-system']);
    expect(outcome.state.views[0]?.positions.map((position) => position.element)).toEqual([
      'system',
      'db',
      'client',
    ]);
    expect(outcome.state.scenarios).toEqual(testProject().scenarios);
  });

  it('never gives a broken step’s relation id to something new', () => {
    const deleted = ok({ type: 'delete', relations: ['client-calls-api'] }).state;
    expect(
      rejected(
        {
          type: 'create-relation',
          relation: { id: 'client-calls-api', relationType: 'test.reads', from: 'api', to: 'db' },
        },
        deleted,
      ),
    ).toEqual(['id-taken']);
    expect(
      rejected(
        {
          type: 'create-element',
          element: { id: 'client-calls-api', component: 'test.box', name: 'A' },
        },
        deleted,
      ),
    ).toEqual(['id-taken']);
  });

  it('takes deleted elements out of stacking lists, and drops a deleted container’s list', () => {
    const project = testProject();
    const [view] = project.views;
    if (!view) throw new Error('No view.');
    const stacked: ProjectSnapshot = {
      ...project,
      views: [{ ...view, stackingOrder: { system: ['db', 'api'], world: ['client', 'system'] } }],
    };
    expect(ok({ type: 'delete', elements: ['db'] }, stacked).state.views[0]?.stackingOrder).toEqual(
      { system: ['api'], world: ['client', 'system'] },
    );
    expect(
      ok({ type: 'delete', elements: ['system'] }, stacked).state.views[0]?.stackingOrder,
    ).toEqual({ world: ['client'] });
    const everything = ok({ type: 'delete', elements: ['system', 'client'] }, stacked).state;
    expect(everything.views[0]).not.toHaveProperty('stackingOrder');
  });

  it('rewrites each list once when it deletes many things', () => {
    const base = testProject();
    const many = Array.from({ length: 300 }, (_, at) => ({
      id: `e${at}`,
      component: 'test.box',
      name: `E${at}`,
    }));
    const crowded: ProjectSnapshot = {
      ...base,
      model: { ...base.model, elements: [...base.model.elements, ...many] },
    };
    const outcome = ok({ type: 'delete', elements: many.map((element) => element.id) }, crowded);
    expect(outcome.operations).toEqual([
      { op: 'replace-all', collection: { name: 'elements' }, items: base.model.elements },
    ]);
  });

  it('names what it deletes', () => {
    expect(ok({ type: 'delete', relations: ['api-reads-db'] }).label).toBe(
      'Delete the relation "API → DB"',
    );
    expect(ok({ type: 'delete', elements: ['db', 'client'] }).label).toBe(
      'Delete 2 elements and 4 relations',
    );
  });

  it('refuses World, unknown ids and an empty request', () => {
    expect(rejected({ type: 'delete', elements: ['world'] })).toEqual(['world-not-allowed']);
    expect(rejected({ type: 'delete', relations: ['nothing'] })).toEqual(['unknown-relation']);
    expect(rejected({ type: 'delete' })).toEqual(['invalid-command']);
  });
});

describe('create-relation', () => {
  it('relates elements, and relations too, with a generated id', () => {
    const outcome = ok({
      type: 'create-relation',
      relation: { relationType: 'test.governs', from: 'contract', to: 'api-reads-db' },
    });
    expect(outcome.created).toEqual(['governs-1']);
    expect(outcome.label).toBe('Add the relation "Contract → (API → DB)"');
    expect(outcome.warnings).toEqual([]);
  });

  it('warns, without refusing, when the relation breaks the limits of its type', () => {
    const outcome = ok({
      type: 'create-relation',
      relation: { relationType: 'test.reads', from: 'db', to: 'client' },
    });
    expect(outcome.warnings.map((warning) => warning.subjects)).toEqual([['db'], ['client']]);
  });

  it('refuses containment that would form a cycle', () => {
    expect(
      rejected({
        type: 'create-relation',
        relation: { relationType: 'test.inside', from: 'system', to: 'api' },
      }),
    ).toEqual(['containment-cycle']);
    expect(
      rejected({
        type: 'create-relation',
        relation: { relationType: 'test.inside', from: 'db', to: 'db' },
      }),
    ).toEqual(['containment-cycle']);
  });

  it('refuses nesting that involves a relation or puts World inside something', () => {
    expect(
      rejected({
        type: 'create-relation',
        relation: { relationType: 'test.inside', from: 'client', to: 'api-reads-db' },
      }),
    ).toEqual(['nesting-end-not-element']);
    expect(
      rejected({
        type: 'create-relation',
        relation: { relationType: 'test.inside', from: 'world', to: 'system' },
      }),
    ).toEqual(['world-not-allowed']);
  });

  it('refuses unknown ends and relation types', () => {
    expect(
      rejected({
        type: 'create-relation',
        relation: { relationType: 'test.calls', from: 'client', to: 'nope' },
      }),
    ).toEqual(['unknown-end']);
    expect(
      rejected({
        type: 'create-relation',
        relation: { relationType: 'test.nope', from: 'client', to: 'api' },
      }),
    ).toEqual(['unknown-relation-type']);
  });
});

describe('update-relation', () => {
  it('moves an end and checks the rules again', () => {
    const outcome = ok({
      type: 'update-relation',
      id: 'api-reads-db',
      changes: { to: 'client', name: 'SQL' },
    });
    expect(outcome.state.model.relations[3]).toEqual({
      id: 'api-reads-db',
      relationType: 'test.reads',
      from: 'api',
      to: 'client',
      name: 'SQL',
    });
    expect(outcome.warnings.map((warning) => warning.subjects)).toEqual([['client']]);
  });

  it('refuses a change that would make containment form a cycle', () => {
    expect(
      rejected({
        type: 'update-relation',
        id: 'api-in-system',
        changes: { from: 'system', to: 'db' },
      }),
    ).toEqual(['containment-cycle']);
  });

  it('accepts moving a nesting relation where the old one no longer counts', () => {
    ok({ type: 'update-relation', id: 'db-in-system', changes: { from: 'system', to: 'db' } });
  });

  it('refuses a relation that would end on itself, directly or through relations on it', () => {
    expect(
      rejected({
        type: 'update-relation',
        id: 'client-calls-api',
        changes: { to: 'client-calls-api' },
      }),
    ).toEqual(['invalid-command']);
    expect(
      rejected({
        type: 'update-relation',
        id: 'client-calls-api',
        changes: { to: 'contract-governs-call' },
      }),
    ).toEqual(['invalid-command']);
  });
});

describe('packages and definitions', () => {
  it('creates a package of the project and starts using it', () => {
    const outcome = ok({ type: 'create-package', package: { id: 'clinic', name: 'Clinic' } });
    expect(outcome.state.project.packages).toEqual(['test', 'clinic']);
    expect(outcome.state.packages.at(-1)).toEqual({
      id: 'clinic',
      name: 'Clinic',
      components: [],
      relationTypes: [],
    });
    expect(rejected({ type: 'create-package', package: { id: 'test', name: 'Again' } })).toEqual([
      'id-taken',
    ]);
  });

  it('defines and redefines components, checking ids, parents and cycles', () => {
    const defined = ok({
      type: 'define-component',
      package: 'test',
      component: { id: 'test.queue', name: 'Queue', derivesFrom: 'test.box' },
    });
    expect(defined.label).toBe('Define the component "Queue"');
    expect(
      ok(
        {
          type: 'define-component',
          package: 'test',
          component: { id: 'test.queue', name: 'Topic', derivesFrom: 'essence' },
        },
        defined.state,
      ).label,
    ).toBe('Redefine the component "Topic"');
    expect(
      rejected({
        type: 'define-component',
        package: 'test',
        component: { id: 'other.queue', name: 'Q', derivesFrom: 'essence' },
      }),
    ).toEqual(['id-outside-package']);
    expect(
      rejected({
        type: 'define-component',
        package: 'test',
        component: { id: 'test.queue', name: 'Q', derivesFrom: 'test.nope' },
      }),
    ).toEqual(['unknown-parent']);
    expect(
      rejected({
        type: 'define-component',
        package: 'test',
        component: { id: 'test.box', name: 'Box', derivesFrom: 'test.service' },
      }),
    ).toEqual(['derivation-cycle']);
    expect(
      rejected({
        type: 'define-component',
        package: 'nope',
        component: { id: 'nope.x', name: 'X', derivesFrom: 'essence' },
      }),
    ).toEqual(['unknown-package']);
  });

  it('removes only components nothing uses', () => {
    expect(rejected({ type: 'remove-component', id: 'test.box' })).toEqual(['in-use']);
    const added = ok({
      type: 'define-component',
      package: 'test',
      component: { id: 'test.queue', name: 'Queue', derivesFrom: 'test.box' },
    });
    expect(ok({ type: 'remove-component', id: 'test.queue' }, added.state).label).toBe(
      'Remove the component "Queue"',
    );
  });

  it('refuses to make a relation type nest when its relations cannot', () => {
    expect(
      rejected({
        type: 'define-relation-type',
        package: 'test',
        relationType: {
          id: 'test.governs',
          name: 'governs',
          derivesFrom: 'relates-to',
          nests: true,
        },
      }),
    ).toEqual(['nesting-end-not-element']);
  });

  it('removes only relation types nothing uses', () => {
    expect(rejected({ type: 'remove-relation-type', id: 'test.inside' })).toEqual(['in-use']);
  });
});

describe('views', () => {
  it('creates a view arranged by every nesting relation type unless told otherwise', () => {
    const outcome = ok({
      type: 'create-view',
      view: { name: 'Security', perspective: { name: 'Security' } },
    });
    expect(outcome.state.views.at(-1)).toEqual({
      id: 'security-1',
      name: 'Security',
      perspective: { name: 'Security' },
      nestingRelationTypes: ['test.inside'],
      positions: [],
      freeShapes: [],
    });
    expect(
      rejected({
        type: 'create-view',
        view: { name: 'V', perspective: { name: 'P' }, nestingRelationTypes: ['test.calls'] },
      }),
    ).toEqual(['not-nesting']);
  });

  it('changes a view and keeps its shapes', () => {
    const outcome = ok({
      type: 'update-view',
      id: 'overview',
      changes: { name: 'Everything', nestingRelationTypes: [] },
    });
    expect(outcome.state.views[0]?.name).toBe('Everything');
    expect(outcome.state.views[0]?.positions).toEqual(testProject().views[0]?.positions);
  });

  it('deletes only views no scenario plays over', () => {
    expect(rejected({ type: 'delete-view', id: 'overview' })).toEqual(['in-use']);
  });

  it('moves shapes and pins them, and places new ones', () => {
    const outcome = ok({
      type: 'set-positions',
      view: 'overview',
      positions: [
        { element: 'api', container: 'system', x: 30, y: 50, pinned: true },
        { element: 'contract', x: 500, y: 0 },
      ],
    });
    expect(outcome.label).toBe('Move 2 shapes in "Overview"');
    expect(outcome.state.views[0]?.positions).toEqual([
      { element: 'system', x: 0, y: 0, width: 400, height: 300 },
      { element: 'api', container: 'system', x: 30, y: 50, pinned: true },
      { element: 'db', container: 'system', x: 20, y: 160 },
      { element: 'client', x: -250, y: 40, pinned: true },
      { element: 'contract', x: 500, y: 0 },
    ]);
  });

  it('refuses positions inside a container the element does not sit in, and for World', () => {
    expect(
      rejected({
        type: 'set-positions',
        view: 'overview',
        positions: [{ element: 'client', container: 'system', x: 0, y: 0 }],
      }),
    ).toEqual(['unknown-position']);
    expect(
      rejected({
        type: 'set-positions',
        view: 'overview',
        positions: [{ element: 'world', x: 0, y: 0 }],
      }),
    ).toEqual(['world-not-allowed']);
  });

  it('refuses a coordinate or a size more than ten million canvas units from 0, as the file format does', () => {
    const at = (position: { x: number; y: number; width?: number }) =>
      run({
        type: 'set-positions',
        view: 'overview',
        positions: [{ element: 'client', ...position }],
      }).outcome;
    expect(at({ x: 10_000_000, y: -10_000_000 }).ok).toBe(true);
    for (const position of [
      { x: 10_000_001, y: 0 },
      { x: 0, y: -1e12 },
      { x: 0, y: 0, width: 2e7 },
    ]) {
      const outcome = at(position);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.problems[0]?.code).toBe('invalid-command');
        expect(outcome.problems[0]?.message).toMatch(
          /must be (at most|from -10,000,000 to) 10,000,000\.$/,
        );
      }
    }
    expect(
      rejected({
        type: 'create-free-shape',
        view: 'overview',
        shape: { kind: 'arrow', from: { x: 0, y: 0 }, to: { x: 3e7, y: 0 } },
      }),
    ).toEqual(['invalid-command']);
  });

  it('sends many positions as one operation', () => {
    const state = testProject();
    for (let each = 0; each < 250; each++) {
      state.model.elements.push({ id: `e${each}`, component: 'test.box', name: `E${each}` });
    }
    const outcome = ok(
      {
        type: 'set-positions',
        view: 'overview',
        positions: state.model.elements
          .slice(5)
          .map((element, each) => ({ element: element.id, x: each, y: 0 })),
      },
      state,
    );
    expect(outcome.operations.map((operation) => operation.op)).toEqual(['replace-all']);
    expect(outcome.state.views[0]?.positions).toHaveLength(254);
  });

  it('forgets positions so that layout places those shapes again', () => {
    const outcome = ok({
      type: 'remove-positions',
      view: 'overview',
      positions: [{ element: 'client' }],
    });
    expect(outcome.state.views[0]?.positions.map((position) => position.element)).toEqual([
      'system',
      'api',
      'db',
    ]);
    expect(
      rejected({
        type: 'remove-positions',
        view: 'overview',
        positions: [{ element: 'contract' }],
      }),
    ).toEqual(['unknown-position']);
  });

  it('adds, changes and deletes free shapes', () => {
    const added = ok({
      type: 'create-free-shape',
      view: 'overview',
      shape: { kind: 'arrow', from: { x: 0, y: 0 }, to: { x: 10, y: 10 } },
    });
    expect(added.created).toEqual(['arrow-1']);
    const changed = ok(
      {
        type: 'update-free-shape',
        view: 'overview',
        shape: { kind: 'note', id: 'note', x: 1, y: 2, width: 3, height: 4, text: 'Bye' },
      },
      added.state,
    );
    const deleted = ok(
      { type: 'delete-free-shapes', view: 'overview', ids: ['note', 'arrow-1'] },
      changed.state,
    );
    expect(deleted.state.views[0]?.freeShapes).toEqual([]);
    expect(
      rejected({
        type: 'create-free-shape',
        view: 'overview',
        shape: { kind: 'note', x: 0, y: 0, width: 0, height: 1, text: '' },
      }),
    ).toEqual(['invalid-command']);
  });
});

describe('scenarios', () => {
  it('creates a scenario whose steps use relations of the model', () => {
    const outcome = ok({
      type: 'create-scenario',
      scenario: {
        name: 'Read',
        view: 'overview',
        steps: [{ description: 'Reads.', relations: ['api-reads-db'], dataOut: { rows: 2 } }],
      },
    });
    expect(outcome.state.scenarios.at(-1)).toEqual({
      id: 'read-1',
      name: 'Read',
      view: 'overview',
      steps: [
        { id: 'step-2', description: 'Reads.', relations: ['api-reads-db'], dataOut: { rows: 2 } },
      ],
    });
    expect(
      rejected({
        type: 'create-scenario',
        scenario: {
          name: 'R',
          view: 'overview',
          steps: [{ description: '', relations: ['nope'] }],
        },
      }),
    ).toEqual(['unknown-step-relation']);
    expect(
      rejected({
        type: 'create-scenario',
        scenario: { name: 'R', view: 'overview', steps: [{ description: '', relations: [] }] },
      }),
    ).toEqual(['invalid-command']);
  });

  it('keeps a broken step kept as it was, and refuses one that changes', () => {
    const deleted = ok({ type: 'delete', relations: ['api-reads-db'] });
    const steps = deleted.state.scenarios[0]?.steps ?? [];
    const kept = ok(
      { type: 'update-scenario', id: 'request', changes: { name: 'Renamed', steps } },
      deleted.state,
    );
    expect(kept.state.scenarios[0]?.steps).toEqual(steps);
    expect(
      rejected(
        {
          type: 'update-scenario',
          id: 'request',
          changes: {
            steps: steps.map((step) => ({ ...step, relations: [...step.relations, 'nope'] })),
          },
        },
        deleted.state,
      ),
    ).toEqual(['unknown-step-relation']);
  });
});

describe('the project and batches', () => {
  it('changes the name, and refuses to stop using a package in use', () => {
    expect(ok({ type: 'update-project', changes: { name: 'Renamed' } }).state.project.name).toBe(
      'Renamed',
    );
    expect(rejected({ type: 'update-project', changes: { packages: [] } })).toEqual(['in-use']);
    expect(rejected({ type: 'update-project', changes: { packages: ['test', 'nope'] } })).toEqual([
      'unknown-package',
    ]);
  });

  it('runs a batch as one action, and refuses all of it when one command breaks a rule', () => {
    const outcome = ok({
      type: 'batch',
      label: 'Add a cache',
      commands: [
        {
          type: 'create-element',
          element: { id: 'cache', component: 'test.database', name: 'Cache' },
        },
        {
          type: 'create-relation',
          relation: { relationType: 'test.reads', from: 'api', to: 'cache' },
        },
      ],
    });
    expect(outcome.label).toBe('Add a cache');
    expect(outcome.created).toEqual(['cache', 'reads-1']);

    const { outcome: refused } = run({
      type: 'batch',
      label: 'Broken',
      commands: [
        { type: 'create-element', element: { component: 'test.box', name: 'A' } },
        { type: 'delete', elements: ['world'] },
      ],
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.problems[0]?.message).toMatch(/^Command 2 of the batch: /);
  });

  it('refuses what is not a command', () => {
    expect(rejected({ type: 'explode' } as unknown as Command)).toEqual(['invalid-command']);
  });
});
