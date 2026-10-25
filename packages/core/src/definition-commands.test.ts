/**
 * The commands that define and change components, relation types and packages: trait by trait,
 * created only once, with every value checked.
 */
import fc from 'fast-check';
import type { Appearance, Component, PackageFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { executeCommand, type AppearanceChanges, type Command } from './commands';
import { definitionsIn } from './state';
import { applyOperations } from './operations';
import type { ProblemCode } from './problems';
import type { ProjectSnapshot } from './snapshot';
import { sequentialIds, testProject } from './test/fixtures';

function run(command: Command, state: ProjectSnapshot = testProject()) {
  return executeCommand(state, command, { newId: sequentialIds() });
}

function ok(command: Command, state: ProjectSnapshot = testProject()) {
  const outcome = run(command, state);
  if (!outcome.ok) {
    throw new Error(`Rejected: ${outcome.problems.map((each) => each.message).join(' ')}`);
  }
  expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(state);
  return outcome;
}

function refused(command: Command, state?: ProjectSnapshot): ProblemCode[] {
  const outcome = run(command, state);
  if (outcome.ok) throw new Error(`Accepted: ${outcome.label}`);
  return outcome.problems.map((each) => each.code);
}

/** The test project as a copy of its own, which a test may change before running commands. */
function freshProject(): ProjectSnapshot {
  return JSON.parse(JSON.stringify(testProject())) as ProjectSnapshot;
}

function component(state: ProjectSnapshot, id: string): Component | undefined {
  return state.packages.flatMap((file) => file.components).find((each) => each.id === id);
}

function element(state: ProjectSnapshot, id: string) {
  return state.model.elements.find((each) => each.id === id);
}

const defineQueue = (extra: Partial<Component> = {}): Command => ({
  type: 'define-component',
  package: 'test',
  component: { id: 'test.queue', name: 'Queue', derivesFrom: 'test.service', ...extra },
});

describe('define-component and define-relation-type', () => {
  it('make the id from the package and the name when none is given', () => {
    const outcome = ok({
      type: 'define-component',
      package: 'test',
      component: { name: 'Message queue', derivesFrom: 'test.box' },
    });
    expect(outcome.created).toEqual(['test.message-queue-1']);
    expect(component(outcome.state, 'test.message-queue-1')?.name).toBe('Message queue');
    const type = ok({
      type: 'define-relation-type',
      package: 'test',
      relationType: { name: 'feeds', derivesFrom: 'relates-to' },
    });
    expect(type.created).toEqual(['test.feeds-1']);
  });

  it('create only, when asked, refusing an id the package already has', () => {
    expect(
      refused({
        type: 'define-component',
        package: 'test',
        createOnly: true,
        component: { id: 'test.box', name: 'Box', derivesFrom: 'essence' },
      }),
    ).toEqual(['id-taken']);
    expect(
      refused({
        type: 'define-relation-type',
        package: 'test',
        createOnly: true,
        relationType: { id: 'test.calls', name: 'calls', derivesFrom: 'relates-to' },
      }),
    ).toEqual(['id-taken']);
    const created = ok({ ...defineQueue(), createOnly: true } as Command);
    expect(created.label).toBe('Define the component "Queue"');
  });

  it('accept every trait, and refuse each value outside what it allows', () => {
    const appearance: Appearance = {
      shape: 'rounded-rectangle',
      fill: '#FFF4E5',
      width: 240,
      detail: {
        componentName: false,
        attributes: ['latency', 'owner'],
        badges: [
          { when: 'attribute', text: 'ORD', attribute: 'ordered' },
          { when: 'from-end', text: 'FK', relationType: 'test.calls' },
        ],
      },
      contentsAsRows: true,
      connectionPoints: [
        { name: 'in', side: 'left', at: 0.5 },
        { name: 'out', side: 'right', at: 0.5 },
      ],
    };
    const attributes = [
      { name: 'ordered', type: 'boolean' as const },
      { name: 'depth', type: 'number' as const, unit: 'msgs' },
      {
        name: 'delivery',
        type: 'string' as const,
        default: 'at least once',
        choices: ['at most once', 'at least once'],
      },
    ];
    expect(ok(defineQueue({ appearance, attributes })).warnings).toEqual([]);

    const appearanceRefusals: [string, unknown][] = [
      ['a colour that is not #rrggbb', { fill: 'orange' }],
      ['a width of zero', { width: 0 }],
      ['a width above 100,000', { width: 100_001 }],
      ['a height that is not finite', { height: Number.POSITIVE_INFINITY }],
      ['an unknown shape', { shape: 'hexagon' }],
      ['rows on an ellipse, set together', { shape: 'ellipse', contentsAsRows: true }],
      [
        'connection points with the same name',
        {
          connectionPoints: [
            { name: 'in', side: 'left', at: 0.5 },
            { name: 'in', side: 'right', at: 0.5 },
          ],
        },
      ],
      [
        'a connection point beyond its side',
        { connectionPoints: [{ name: 'in', side: 'left', at: 1.5 }] },
      ],
      [
        'a connection point on no side',
        { connectionPoints: [{ name: 'in', side: 'middle', at: 0 }] },
      ],
      [
        'nine detail attributes',
        { detail: { attributes: Array.from({ length: 9 }, (_, at) => `a${at}`) } },
      ],
      ['a detail attribute written twice', { detail: { attributes: ['owner', 'owner'] } }],
      [
        'a badge text longer than 4',
        { detail: { badges: [{ when: 'attribute', text: 'ORDERED', attribute: 'ordered' }] } },
      ],
      [
        'an attribute badge on an attribute that is not boolean',
        { detail: { badges: [{ when: 'attribute', text: 'D', attribute: 'depth' }] } },
      ],
      ['a trait no appearance has', { icon: 'queue' }],
    ];
    for (const [, value] of appearanceRefusals) {
      expect(refused(defineQueue({ appearance: value as Appearance, attributes }))).toEqual([
        'invalid-appearance',
      ]);
    }
    // Rows on an ellipse that only one of the two sets are drawn as a rectangle: no refusal.
    expect(
      ok({
        type: 'define-component',
        package: 'test',
        component: {
          id: 'test.list',
          name: 'List',
          derivesFrom: 'test.database',
          appearance: { contentsAsRows: true },
        },
      }).ok,
    ).toBe(true);

    const attributeRefusals: unknown[] = [
      [{ name: 'depth', type: 'number', default: 'deep' }],
      [{ name: 'depth', type: 'number', choices: ['1', '2'] }],
      [{ name: 'label', type: 'string', unit: 'ms' }],
      [{ name: 'mode', type: 'string', default: 'z', choices: ['a', 'b'] }],
      [{ name: 'mode', type: 'string', choices: [] }],
      [{ name: 'mode', type: 'string', choices: ['a', 'a'] }],
      [{ name: 'depth', type: 'number', unit: '' }],
      [
        { name: 'depth', type: 'number' },
        { name: 'depth', type: 'string' },
      ],
      [{ name: 'depth', type: 'date' }],
      [{ name: 'depth', type: 'number', formula: '1 + 1' }],
    ];
    for (const value of attributeRefusals) {
      expect(refused(defineQueue({ attributes: value as Component['attributes'] }))).toEqual([
        'invalid-attribute',
      ]);
    }

    expect(refused(defineQueue({ appearance: { detail: { attributes: ['missing'] } } }))).toEqual([
      'unknown-attribute',
    ]);
    expect(
      refused(
        defineQueue({
          appearance: {
            detail: { badges: [{ when: 'attribute', text: 'X', attribute: 'missing' }] },
          },
        }),
      ),
    ).toEqual(['unknown-attribute']);
    expect(
      refused(
        defineQueue({
          appearance: {
            detail: { badges: [{ when: 'from-end', text: 'X', relationType: 'test.nope' }] },
          },
        }),
      ),
    ).toEqual(['unknown-relation-type']);
  });

  it('check limits: a list of known ids, or "any"; an empty list is refused', () => {
    const define = (limits: unknown): Command => ({
      type: 'define-relation-type',
      package: 'test',
      relationType: {
        id: 'test.feeds',
        name: 'feeds',
        derivesFrom: 'test.calls',
        limits: limits as never,
      },
    });
    const lifted = ok(define({ from: 'any', to: ['test.database', 'test.calls'] }));
    expect(definitionsIn(lifted.state).relationType('test.feeds')?.limits).toEqual({
      to: ['test.database', 'test.calls'],
    });
    expect(refused(define({ to: [] }))).toEqual(['invalid-command']);
    expect(refused(define({ to: ['test.nope'] }))).toEqual(['unknown-component']);
    expect(refused(define({ to: 'all' }))).toEqual(['invalid-command']);
    expect(refused(define({ to: ['test.box', 'test.box'] }))).toEqual(['invalid-command']);
    expect(refused(define({ middle: 'any' }))).toEqual(['invalid-command']);
  });

  it('warn about values outside new choices, at most 20 and a summary', () => {
    const many = freshProject();
    many.model.elements.push(
      ...Array.from({ length: 25 }, (_, at) => ({
        id: `svc-${at}`,
        component: 'test.service',
        name: `Service ${at}`,
        attributes: { owner: 'Nobody' },
      })),
    );
    const outcome = ok(
      {
        type: 'update-component',
        id: 'test.service',
        changes: {
          attributes: { set: [{ name: 'owner', type: 'string', choices: ['Ops', 'Data'] }] },
        },
      },
      many,
    );
    expect(outcome.warnings).toHaveLength(21);
    expect(outcome.warnings.every((each) => each.code === 'choice-broken')).toBe(true);
    expect(outcome.warnings.at(-1)?.message).toBe('…and 5 more values are outside their choices.');
  });
});

describe('update-component', () => {
  it('changes only the traits it names, and inherits again what it sets to null', () => {
    const outcome = ok({
      type: 'update-component',
      id: 'test.service',
      changes: { appearance: { fill: '#ABCDEF', width: null, detail: { componentName: false } } },
    });
    expect(component(outcome.state, 'test.service')).toEqual({
      ...component(testProject(), 'test.service'),
      appearance: { shape: 'rounded-rectangle', fill: '#ABCDEF', detail: { componentName: false } },
    });
    expect(outcome.label).toBe('Edit the component "Service"');
    const emptied = ok(
      {
        type: 'update-component',
        id: 'test.service',
        changes: { appearance: { shape: null, fill: null, detail: { componentName: null } } },
      },
      outcome.state,
    );
    // An appearance, or a detail, left with nothing is no appearance.
    expect(component(emptied.state, 'test.service')?.appearance).toBeUndefined();
  });

  it('names a rename alone as one, and refuses an empty name', () => {
    const outcome = ok({ type: 'update-component', id: 'test.box', changes: { name: 'Block' } });
    expect(outcome.label).toBe('Rename the component "Box" to "Block"');
    expect(refused({ type: 'update-component', id: 'test.box', changes: { name: ' ' } })).toEqual([
      'empty-name',
    ]);
    expect(
      refused({ type: 'update-component', id: 'test.box', changes: { colour: 'red' } as never }),
    ).toEqual(['invalid-command']);
  });

  it('commutes for changes to different traits, and touches nothing else', () => {
    const traits = ['shape', 'fill', 'stroke', 'width', 'height', 'contentsAsRows'] as const;
    const value = (trait: (typeof traits)[number], seed: number) => {
      switch (trait) {
        case 'shape':
          return seed % 3 === 0 ? null : seed % 2 === 0 ? 'rectangle' : 'rounded-rectangle';
        case 'fill':
        case 'stroke':
          return seed % 3 === 0 ? null : `#${(seed % 0xffffff).toString(16).padStart(6, '0')}`;
        case 'width':
        case 'height':
          return seed % 3 === 0 ? null : (seed % 1000) + 1;
        case 'contentsAsRows':
          return seed % 3 === 0 ? null : seed % 2 === 0;
      }
    };
    fc.assert(
      fc.property(
        fc.shuffledSubarray([...traits], { minLength: 2 }),
        fc.nat(),
        fc.nat(),
        // Not the database: rows on its cylinder are refused, so order would matter there.
        fc.constantFrom('test.box', 'test.service'),
        (picked, first, second, id) => {
          const half = Math.ceil(picked.length / 2);
          const changes = (names: readonly (typeof traits)[number][], seed: number) =>
            Object.fromEntries(names.map((name) => [name, value(name, seed)])) as AppearanceChanges;
          const a: Command = {
            type: 'update-component',
            id,
            changes: { appearance: changes(picked.slice(0, half), first) },
          };
          const b: Command = {
            type: 'update-component',
            id,
            changes: { appearance: changes(picked.slice(half), second) },
          };
          const start = testProject();
          const ab = ok(b, ok(a, start).state).state;
          const ba = ok(a, ok(b, start).state).state;
          expect(ab).toEqual(ba);
          // Nothing but that one component changed.
          expect(ab.model).toBe(start.model);
          expect(ab.views).toBe(start.views);
          const others = (state: ProjectSnapshot) =>
            state.packages.flatMap((file) => file.components).filter((each) => each.id !== id);
          expect(others(ab)).toEqual(others(start));
        },
      ),
    );
  });

  it('renames an attribute: values move where it comes from this definition, and details follow', () => {
    const state = freshProject();
    const own = state.packages[0] as PackageFile;
    own.components.push({
      id: 'test.worker',
      name: 'Worker',
      derivesFrom: 'test.box',
      appearance: { detail: { attributes: ['owner'] } },
    });
    own.components[0] = {
      ...(own.components[0] as Component),
      appearance: { detail: { attributes: ['owner'] } },
    };
    state.model.elements.push(
      { id: 'w', component: 'test.worker', name: 'W', attributes: { owner: 'Ops' } },
      { id: 'b', component: 'test.box', name: 'B', attributes: { owner: 'Data' } },
      // A service redefines "owner" nearer, so its values stay.
      { id: 's', component: 'test.service', name: 'S', attributes: { owner: 'Web' } },
      {
        id: 'own',
        component: 'test.worker',
        name: 'Own',
        appearance: {
          detail: { badges: [{ when: 'attribute', text: 'T', attribute: 'owner' }] },
        },
      },
    );
    const outcome = ok(
      {
        type: 'update-component',
        id: 'test.box',
        changes: { attributes: { rename: [{ from: 'owner', to: 'team' }] } },
      },
      state,
    );
    const after = outcome.state;
    expect(element(after, 'w')?.attributes).toEqual({ team: 'Ops' });
    expect(element(after, 'b')?.attributes).toEqual({ team: 'Data' });
    expect(element(after, 's')?.attributes).toEqual({ owner: 'Web' });
    expect(component(after, 'test.box')?.attributes).toEqual([{ name: 'team', type: 'string' }]);
    expect(component(after, 'test.box')?.appearance?.detail).toEqual({ attributes: ['team'] });
    expect(component(after, 'test.worker')?.appearance?.detail).toEqual({ attributes: ['team'] });
    expect(element(after, 'own')?.appearance?.detail?.badges).toEqual([
      { when: 'attribute', text: 'T', attribute: 'team' },
    ]);
    // The service redefines "owner" itself, so it is untouched.
    expect(component(after, 'test.service')).toEqual(component(state, 'test.service'));
  });

  it('refuses a rename of an attribute it does not define itself, or to a name it already has', () => {
    const rename = (id: string, from: string, to: string): Command => ({
      type: 'update-component',
      id,
      changes: { attributes: { rename: [{ from, to }] } },
    });
    expect(refused(rename('test.database', 'owner', 'team'))).toEqual(['unknown-attribute']);
    expect(refused(rename('test.service', 'latency', 'owner'))).toEqual(['name-taken']);
    const holding = freshProject();
    holding.model.elements.push({
      id: 'x',
      component: 'test.service',
      name: 'X',
      attributes: { delay: 1 },
    });
    expect(refused(rename('test.service', 'latency', 'delay'), holding)).toEqual(['name-taken']);
  });

  it('sets attributes: new ones last, its own redefined in place, its chain’s redefined here', () => {
    const outcome = ok({
      type: 'update-component',
      id: 'test.service',
      changes: {
        attributes: {
          set: [
            { name: 'replicas', type: 'number', default: 1 },
            { name: 'latency', type: 'number', unit: 'ms' },
          ],
        },
      },
    });
    expect(component(outcome.state, 'test.service')?.attributes).toEqual([
      { name: 'latency', type: 'number', unit: 'ms' },
      { name: 'owner', type: 'string', description: 'The team that runs it.' },
      { name: 'replicas', type: 'number', default: 1 },
    ]);
    const redefined = ok({
      type: 'update-component',
      id: 'test.database',
      changes: { attributes: { set: [{ name: 'owner', type: 'string', choices: ['Ops'] }] } },
    });
    expect(component(redefined.state, 'test.database')?.attributes).toEqual([
      { name: 'owner', type: 'string', choices: ['Ops'] },
    ]);
  });

  it('removes its own attributes, keeping the values held, unless a detail still needs them', () => {
    const state = freshProject();
    state.model.elements.push({
      id: 'n',
      component: 'test.service',
      name: 'N',
      attributes: { latency: 5 },
      appearance: { detail: { attributes: ['latency', 'owner'] } },
    });
    const remove = (id: string, name: string): Command => ({
      type: 'update-component',
      id,
      changes: { attributes: { remove: [name] } },
    });
    expect(refused(remove('test.service', 'latency'), state)).toEqual(['in-use']);
    const outcome = ok(remove('test.service', 'latency'));
    expect(component(outcome.state, 'test.service')?.attributes).toEqual([
      { name: 'owner', type: 'string', description: 'The team that runs it.' },
    ]);
    expect(element(outcome.state, 'api')?.attributes).toEqual({ latency: 20 });
    // Box still defines "owner", so the service may stop redefining it whatever names it.
    expect(ok(remove('test.service', 'owner'), state).ok).toBe(true);
    expect(refused(remove('test.database', 'owner'))).toEqual(['unknown-attribute']);
  });

  it('orders its own attributes, those left out after them', () => {
    const outcome = ok({
      type: 'update-component',
      id: 'test.service',
      changes: {
        attributes: {
          set: [{ name: 'replicas', type: 'number' }],
          order: ['replicas', 'latency'],
        },
      },
    });
    expect(component(outcome.state, 'test.service')?.attributes?.map((each) => each.name)).toEqual([
      'replicas',
      'latency',
      'owner',
    ]);
    const order = (names: string[]): Command => ({
      type: 'update-component',
      id: 'test.service',
      changes: { attributes: { order: names } },
    });
    expect(refused(order(['missing']))).toEqual(['unknown-attribute']);
    expect(refused(order(['owner', 'owner']))).toEqual(['invalid-command']);
  });

  it('changes what it derives from, refusing a cycle and a detail that would no longer resolve', () => {
    const outcome = ok({
      type: 'update-component',
      id: 'test.database',
      changes: { derivesFrom: 'test.service' },
    });
    expect(definitionsIn(outcome.state).component('test.database')?.lineage).toEqual([
      'test.database',
      'test.service',
      'test.box',
      'essence',
    ]);
    expect(
      refused({
        type: 'update-component',
        id: 'test.box',
        changes: { derivesFrom: 'test.service' },
      }),
    ).toEqual(['derivation-cycle']);
    const detailed = ok({
      type: 'update-component',
      id: 'test.database',
      changes: { appearance: { detail: { attributes: ['owner'] } } },
    }).state;
    expect(
      refused(
        { type: 'update-component', id: 'test.database', changes: { derivesFrom: 'essence' } },
        detailed,
      ),
    ).toEqual(['unknown-attribute']);
  });

  it('lets a detail problem a file already had stand in the way only of changes to the detail', () => {
    const state = freshProject();
    const box = state.packages[0]?.components[0];
    if (box) box.appearance = { detail: { attributes: ['typo'] } };
    const fill = ok(
      { type: 'update-component', id: 'test.box', changes: { appearance: { fill: '#010203' } } },
      state,
    );
    expect(component(fill.state, 'test.box')?.appearance).toEqual({
      detail: { attributes: ['typo'] },
      fill: '#010203',
    });
    expect(
      refused(
        {
          type: 'update-component',
          id: 'test.box',
          changes: { appearance: { detail: { componentName: false } } },
        },
        state,
      ),
    ).toEqual(['unknown-attribute']);
    const fixed = ok(
      {
        type: 'update-component',
        id: 'test.box',
        changes: { appearance: { detail: { attributes: ['owner'] } } },
      },
      state,
    );
    expect(component(fixed.state, 'test.box')?.appearance?.detail).toEqual({
      attributes: ['owner'],
    });
  });

  it('refuses to change a built-in component, which offers to derive one instead', () => {
    const systems = ok({ type: 'update-project', changes: { packages: ['test', 'systems'] } });
    expect(
      refused(
        { type: 'update-component', id: 'systems.box', changes: { name: 'Mine' } },
        systems.state,
      ),
    ).toEqual(['built-in-package']);
  });
});

describe('update-relation-type', () => {
  it('cannot stop nesting while a view nests by it', () => {
    expect(
      refused({ type: 'update-relation-type', id: 'test.inside', changes: { nests: false } }),
    ).toEqual(['in-use']);
    // "relates to" does not nest, so inheriting again would stop it nesting too.
    expect(
      refused({ type: 'update-relation-type', id: 'test.inside', changes: { nests: null } }),
    ).toEqual(['in-use']);
    const outcome = run({
      type: 'update-relation-type',
      id: 'test.inside',
      changes: { nests: false },
    });
    expect(outcome.ok ? [] : outcome.problems[0]?.subjects).toEqual(['overview']);
    // Redefining it whole is held to the same rule.
    expect(
      refused({
        type: 'define-relation-type',
        package: 'test',
        relationType: { id: 'test.inside', name: 'is inside', derivesFrom: 'relates-to' },
      }),
    ).toEqual(['in-use']);
  });

  it('sets, lifts and inherits limits end by end, and warns about relations that break them', () => {
    const outcome = ok({
      type: 'update-relation-type',
      id: 'test.reads',
      changes: { limits: { from: ['test.database'], to: 'any' } },
    });
    expect(definitionsIn(outcome.state).relationType('test.reads')?.limits).toEqual({
      from: ['test.database'],
    });
    expect(outcome.warnings.map((each) => each.code)).toEqual(['limit-broken']);
    const inherited = ok(
      {
        type: 'update-relation-type',
        id: 'test.reads',
        changes: { limits: { from: null, to: null } },
      },
      outcome.state,
    );
    const own = inherited.state.packages[0]?.relationTypes.find((each) => each.id === 'test.reads');
    expect(own?.limits).toBeUndefined();
    expect(
      refused({ type: 'update-relation-type', id: 'test.reads', changes: { limits: { to: [] } } }),
    ).toEqual(['invalid-command']);
  });

  it('changes its direction, line and attributes trait by trait', () => {
    const outcome = ok({
      type: 'update-relation-type',
      id: 'test.calls',
      changes: {
        direction: null,
        appearance: { dash: 'dotted', stroke: null },
        attributes: { set: [{ name: 'protocol', type: 'string', choices: ['HTTPS', 'gRPC'] }] },
      },
    });
    const own = outcome.state.packages[0]?.relationTypes.find((each) => each.id === 'test.calls');
    expect(own).toEqual({
      id: 'test.calls',
      name: 'calls',
      derivesFrom: 'relates-to',
      limits: { from: ['test.service'] },
      appearance: { dash: 'dotted' },
      attributes: [{ name: 'protocol', type: 'string', choices: ['HTTPS', 'gRPC'] }],
    });
    expect(outcome.label).toBe('Edit the relation type "calls"');
    expect(
      refused({
        type: 'update-relation-type',
        id: 'test.calls',
        changes: { appearance: { width: -1 } },
      }),
    ).toEqual(['invalid-appearance']);
  });

  it('renames an attribute, moving the values of its relations', () => {
    const state = freshProject();
    const own = state.packages[0] as PackageFile;
    own.relationTypes[0] = {
      ...(own.relationTypes[0] as PackageFile['relationTypes'][number]),
      attributes: [{ name: 'protocol', type: 'string' }],
    };
    const call = state.model.relations.find((each) => each.id === 'client-calls-api');
    if (call) call.attributes = { protocol: 'HTTPS' };
    const outcome = ok(
      {
        type: 'update-relation-type',
        id: 'test.calls',
        changes: { attributes: { rename: [{ from: 'protocol', to: 'transport' }] } },
      },
      state,
    );
    expect(
      outcome.state.model.relations.find((each) => each.id === 'client-calls-api')?.attributes,
    ).toEqual({ transport: 'HTTPS' });
  });
});

describe('update-package', () => {
  it('renames and describes a package of the project, and never a built-in one', () => {
    const outcome = ok({ type: 'update-package', id: 'test', changes: { name: 'Clinic' } });
    expect(outcome.label).toBe('Rename the package "Test" to "Clinic"');
    expect(outcome.state.packages[0]?.name).toBe('Clinic');
    expect(outcome.operations).toEqual([
      {
        op: 'set-package',
        package: 'test',
        properties: { id: 'test', name: 'Clinic' },
      },
    ]);
    const described = ok({
      type: 'update-package',
      id: 'test',
      changes: { description: 'Ours.' },
    });
    expect(described.label).toBe('Edit the package "Test"');
    expect(
      ok({ type: 'update-package', id: 'test', changes: { description: null } }, described.state)
        .state.packages[0],
    ).toEqual(testProject().packages[0]);
    const systems = ok({ type: 'update-project', changes: { packages: ['test', 'systems'] } });
    expect(
      refused({ type: 'update-package', id: 'systems', changes: { name: 'S' } }, systems.state),
    ).toEqual(['built-in-package']);
  });

  it('sets and takes out its version, license and attribution, each checked (ADR 0047)', () => {
    const licensed = ok({
      type: 'update-package',
      id: 'test',
      changes: { version: '1.0.0', license: 'CC-BY-4.0', attribution: 'Jane Doe' },
    });
    expect(licensed.label).toBe('Edit the package "Test"');
    expect(licensed.state.packages[0]).toMatchObject({
      version: '1.0.0',
      license: 'CC-BY-4.0',
      attribution: 'Jane Doe',
    });
    const cleared = ok(
      {
        type: 'update-package',
        id: 'test',
        changes: { version: null, license: null, attribution: null },
      },
      licensed.state,
    );
    expect(cleared.state.packages[0]).toEqual(testProject().packages[0]);
    for (const changes of [
      { version: '1' },
      { license: 'CC BY' },
      { attribution: '' },
      { attribution: 5 },
    ]) {
      expect(
        refused({ type: 'update-package', id: 'test', changes } as unknown as Command),
      ).toEqual(['invalid-command']);
    }
  });
});

describe('create-package', () => {
  it('creates an empty package with its version, license and attribution', () => {
    const outcome = ok({
      type: 'create-package',
      package: { id: 'shop', name: 'Shop', version: '0.1.0', license: 'MIT', attribution: 'Us' },
    });
    expect(outcome.state.packages.at(-1)).toEqual({
      id: 'shop',
      name: 'Shop',
      version: '0.1.0',
      license: 'MIT',
      attribution: 'Us',
      components: [],
      relationTypes: [],
    });
    expect(
      refused({
        type: 'create-package',
        package: { id: 'shop', name: 'Shop', license: 'MIT or ISC' },
      }),
    ).toEqual(['invalid-command']);
  });
});

describe("an element's own appearance and values", () => {
  it('changes trait by trait, inherits again what it sets to null, and keeps nothing when empty', () => {
    const traits = ok({
      type: 'update-element',
      id: 'api',
      changes: { appearanceTraits: { fill: '#112233', detail: { attributes: ['latency'] } } },
    });
    expect(element(traits.state, 'api')?.appearance).toEqual({
      fill: '#112233',
      detail: { attributes: ['latency'] },
    });
    const cleared = ok(
      {
        type: 'update-element',
        id: 'api',
        changes: { appearanceTraits: { fill: null, detail: null } },
      },
      traits.state,
    );
    expect(element(cleared.state, 'api')).not.toHaveProperty('appearance');
  });

  it('checks the values it sets, and what its detail names', () => {
    const update = (changes: object): Command => ({ type: 'update-element', id: 'api', changes });
    expect(refused(update({ appearance: { fill: '#1122' } }))).toEqual(['invalid-appearance']);
    expect(refused(update({ appearanceTraits: { width: -5 } }))).toEqual(['invalid-appearance']);
    expect(
      refused(update({ appearance: { fill: '#112233' }, appearanceTraits: { fill: null } })),
    ).toEqual(['invalid-command']);
    expect(refused(update({ appearanceTraits: { detail: { attributes: ['missing'] } } }))).toEqual([
      'unknown-attribute',
    ]);
    // An attribute the element holds itself counts, though its component does not define it.
    expect(
      ok(
        update({
          attributes: { tier: 'gold', primary: true },
          appearanceTraits: {
            detail: {
              attributes: ['tier'],
              badges: [{ when: 'attribute', text: 'P', attribute: 'primary' }],
            },
          },
        }),
      ).ok,
    ).toBe(true);
    expect(
      refused({
        type: 'create-element',
        element: { component: 'test.box', name: 'X', appearance: { shape: 'star' } as never },
      }),
    ).toEqual(['invalid-appearance']);
  });

  it('warns, without refusing, about a value outside its choices', () => {
    const choosy = ok({
      type: 'update-component',
      id: 'test.box',
      changes: { attributes: { set: [{ name: 'owner', type: 'string', choices: ['Ops'] }] } },
    }).state;
    const created = ok(
      {
        type: 'create-element',
        element: { component: 'test.box', name: 'X', attributes: { owner: 'Data' } },
      },
      choosy,
    );
    expect(created.warnings.map((each) => each.code)).toEqual(['choice-broken']);
    const fine = ok(
      { type: 'update-element', id: 'system', changes: { attributes: { owner: 'Ops' } } },
      choosy,
    );
    expect(fine.warnings).toEqual([]);
  });
});

describe('removing definitions and creating packages', () => {
  it('refuses to remove a definition a limit or a badge names', () => {
    const named = ok({
      type: 'define-component',
      package: 'test',
      component: { id: 'test.queue', name: 'Queue', derivesFrom: 'essence' },
    });
    const limited = ok(
      {
        type: 'update-relation-type',
        id: 'test.governs',
        changes: { limits: { from: ['test.queue'] } },
      },
      named.state,
    );
    expect(refused({ type: 'remove-component', id: 'test.queue' }, limited.state)).toEqual([
      'in-use',
    ]);
    const badged = ok({
      type: 'update-component',
      id: 'test.box',
      changes: {
        appearance: {
          detail: { badges: [{ when: 'from-end', text: 'G', relationType: 'test.governs' }] },
        },
      },
    });
    const unused = ok({ type: 'delete', relations: ['contract-governs-call'] }, badged.state);
    expect(refused({ type: 'remove-relation-type', id: 'test.governs' }, unused.state)).toEqual([
      'in-use',
    ]);
  });

  it('refuses a package id kept for a built-in package, now or planned', () => {
    for (const id of ['systems', 'data-modeling', 'neuroscience']) {
      expect(refused({ type: 'create-package', package: { id, name: 'Mine' } })).toEqual([
        'built-in-package',
      ]);
    }
  });
});
