import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Command } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openSession, type Session } from '../session';
import { FakeClient, testProject, writeProjectFolder } from '../test-support';
import type { Program } from './bridge';
import { TOOLS, runTool, type ToolOutcome } from './tools';

let folder: string;
let session: Session;
let opened: number;

/** The tools' program, straight on a session: commands run as Claude's, as through the endpoint. */
function programOf(target: Session): Program {
  return {
    project: () => Promise.resolve(target.snapshot),
    execute: async (command: Command) => {
      const outcome = await target.execute(command, 'claude');
      return outcome.ok
        ? {
            ok: true,
            label: outcome.label,
            changed: outcome.recorded,
            created: outcome.created,
            warnings: outcome.warnings,
          }
        : { ok: false, problems: outcome.problems };
    },
    guide: (guidance) => target.guide(guidance),
    openApp: () => {
      opened += 1;
      return Promise.resolve();
    },
  };
}

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'va-tools-'));
  await writeProjectFolder(folder, testProject());
  const result = await openSession(folder, { watch: false, out: () => {}, err: () => {} });
  if (!result.ok) throw new Error('The test project does not open.');
  session = result.session;
  opened = 0;
});

afterEach(async () => {
  await session.close();
  await rm(folder, { recursive: true, force: true, maxRetries: 10 });
});

/** Calls a tool by name with its arguments. */
async function call(name: string, args: unknown = {}): Promise<ToolOutcome> {
  const definition = TOOLS.find((each) => each.name === name);
  if (!definition) throw new Error(`There is no tool ${name}.`);
  return runTool(definition, args, programOf(session));
}

/** The value of a tool call that worked. */
async function value(name: string, args: unknown = {}): Promise<Record<string, unknown>> {
  const outcome = await call(name, args);
  if (!outcome.ok) throw new Error(`${name} failed: ${outcome.message}`);
  return outcome.value as Record<string, unknown>;
}

/** The message of a tool call that failed. */
async function failure(name: string, args: unknown = {}): Promise<string> {
  const outcome = await call(name, args);
  if (outcome.ok) throw new Error(`${name} worked: ${JSON.stringify(outcome.value)}`);
  return outcome.message;
}

const element = (id: string) => session.snapshot.model.elements.find((each) => each.id === id);

describe('the tools', () => {
  it('have unique names, a title, and a description with an example', () => {
    const names = TOOLS.map((each) => each.name);
    expect(new Set(names).size).toBe(names.length);
    for (const each of TOOLS) {
      expect(each.name).toMatch(/^[a-z_]+$/);
      expect(each.title).not.toBe('');
      expect(each.description).toContain('Example:');
    }
  });

  it('say which only read: those that get, list, find, read, preview, export or check', () => {
    const readOnly = TOOLS.filter((each) => each.hints.readOnlyHint).map((each) => each.name);
    expect(readOnly).toEqual(
      TOOLS.map((each) => each.name).filter((name) =>
        /^(get|list|find|read|preview|export|check)_/.test(name),
      ),
    );
    expect(readOnly).toEqual(
      expect.arrayContaining([
        'get_project',
        'read_scenario',
        'list_images',
        'get_view_address',
        'check_tour',
      ]),
    );
  });

  it('use none of the words CONTEXT.md keeps out of names', () => {
    for (const each of TOOLS) expect(each.name).not.toMatch(/link|replay|edge|node/);
  });
});

describe('read tools', () => {
  it('read the project, an item and a view', async () => {
    expect(await value('get_project')).toMatchObject({ name: 'Shop' });
    expect(await value('get_item', { id: 'api' })).toMatchObject({ kind: 'element', name: 'API' });
    expect(await failure('get_item', { id: 'nothing' })).toBe(
      'There is no element or relation "nothing".',
    );
    expect(await value('read_view', { view: 'overview' })).toMatchObject({ id: 'overview' });
    expect(await value('find_elements', { container: 'system' })).toMatchObject({ total: 2 });
  });

  it('change nothing', async () => {
    const before = session.snapshot;
    for (const name of ['get_project', 'list_definitions', 'find_elements', 'find_relations']) {
      await call(name);
    }
    await call('preview_delete', { elements: ['api'] });
    expect(session.snapshot).toBe(before);
    expect(session.history).toEqual({});
  });
});

describe('add_to_model', () => {
  it('creates elements and relations as one action of Claude’s, nesting and relating them by ref', async () => {
    const result = await value('add_to_model', {
      elements: [
        { ref: 'billing', component: 'systems.system', name: 'Billing' },
        { ref: 'invoices', component: 'systems.service', name: 'Invoices', inside: ['billing'] },
        {
          ref: 'ledger',
          component: 'systems.database',
          name: 'Ledger',
          inside: ['billing'],
          attributes: { engine: 'postgres' },
          positions: [{ view: 'overview', inside: 'billing', x: 24, y: 48 }],
        },
      ],
      relations: [
        { relationType: 'systems.writes-to', from: 'invoices', to: 'ledger' },
        { relationType: 'systems.communicates-with', from: 'api', to: 'invoices', name: 'gRPC' },
      ],
    });

    expect(result).toMatchObject({
      done: 'Create 3 elements and 2 relations',
      undo: 'The person can undo it in the app.',
    });
    const ids = result.ids as Record<string, string>;
    expect(Object.keys(ids)).toEqual(['billing', 'invoices', 'ledger']);
    expect(ids.billing).toMatch(/^billing-[0-9a-z]{6}$/);
    expect(session.history.undo).toEqual({
      label: 'Create 3 elements and 2 relations',
      author: 'claude',
    });
    const relations = session.snapshot.model.relations;
    expect(relations).toContainEqual(
      expect.objectContaining({
        relationType: 'systems.is-part-of',
        from: ids.invoices,
        to: ids.billing,
      }),
    );
    expect(relations).toContainEqual(
      expect.objectContaining({
        relationType: 'systems.writes-to',
        from: ids.invoices,
        to: ids.ledger,
      }),
    );
    expect(relations).toContainEqual(
      expect.objectContaining({ from: 'api', to: ids.invoices, name: 'gRPC' }),
    );
    expect(element(ids.ledger ?? '')?.attributes).toEqual({ engine: 'postgres' });
    const overview = session.snapshot.views[0];
    expect(overview?.positions).toContainEqual({
      element: ids.ledger,
      container: ids.billing,
      x: 24,
      y: 48,
    });
  });

  it('names a single element’s action as the core does', async () => {
    await value('add_to_model', { elements: [{ component: 'systems.service', name: 'Worker' }] });
    expect(session.history.undo).toEqual({ label: 'Create "Worker"', author: 'claude' });
  });

  it('takes the label it is given', async () => {
    await value('add_to_model', {
      label: 'Add the worker',
      elements: [{ component: 'systems.service', name: 'Worker' }],
    });
    expect(session.history.undo?.label).toBe('Add the worker');
  });

  it('creates containers before their contents, whatever order they come in', async () => {
    const result = await value('add_to_model', {
      elements: [
        { ref: 'inner', component: 'systems.service', name: 'Inner', inside: ['outer'] },
        { ref: 'outer', component: 'systems.system', name: 'Outer' },
      ],
    });
    const ids = result.ids as Record<string, string>;
    expect(session.snapshot.model.relations).toContainEqual(
      expect.objectContaining({ from: ids.inner, to: ids.outer }),
    );
  });

  it.each([
    [
      'a ref given twice',
      {
        elements: [
          { ref: 'a', component: 'systems.service', name: 'A' },
          { ref: 'a', component: 'systems.service', name: 'B' },
        ],
      },
      'The ref "a" is given twice.',
    ],
    [
      'containers that contain each other',
      {
        elements: [
          { ref: 'a', component: 'systems.system', name: 'A', inside: ['b'] },
          { ref: 'b', component: 'systems.system', name: 'B', inside: ['a'] },
        ],
      },
      'contain each other',
    ],
    ['nothing at all', {}, 'Give at least one element or relation.'],
  ])('refuses %s and changes nothing', async (_case, args, message) => {
    expect(await failure('add_to_model', args)).toContain(message);
    expect(session.history).toEqual({});
  });

  it('says why the core refused, and changes nothing', async () => {
    const message = await failure('add_to_model', {
      elements: [{ component: 'systems.unknown', name: 'Ghost' }],
    });
    expect(message).toMatch(/^Refused, so nothing changed: .*\(unknown-component\)$/);
    expect(session.history).toEqual({});
  });
});

describe('other write tools', () => {
  it('change an element, and say when nothing changed', async () => {
    expect(await value('update_element', { id: 'api', name: 'Gateway' })).toMatchObject({
      done: 'Rename "API" to "Gateway"',
    });
    expect(element('api')?.name).toBe('Gateway');
    expect(await value('update_element', { id: 'api', name: 'Gateway' })).toEqual({
      done: 'Nothing changed, so nothing was recorded.',
    });
  });

  it('refuse a delete that cascades until told it may, then delete as one action', async () => {
    const message = await failure('delete_from_model', { elements: ['db'] });
    expect(message).toContain('would also delete 2 relation(s)');
    expect(message).toContain('mark 1 scenario step(s) broken');
    expect(element('db')).toBeDefined();

    const result = await value('delete_from_model', { elements: ['db'], cascade: true });
    expect(result).toMatchObject({
      deleted: { elements: ['db'], relations: ['db-in-system', 'api-reads-db'] },
      brokenSteps: [{ scenario: 'request', step: 'read' }],
    });
    expect(element('db')).toBeUndefined();
    expect(session.history.undo?.author).toBe('claude');
  });

  it('delete at once what takes nothing else with it', async () => {
    await value('delete_from_model', { elements: ['cart'] });
    expect(element('cart')).toBeUndefined();
  });

  it('run no delete that cascades until told it may, in words of delete_from_model', async () => {
    const commands = [{ type: 'delete', elements: ['api'] }];
    const message = await failure('run_commands', { label: 'Remove the API', commands });
    expect(message).toBe(
      'Nothing was done: this would also delete 3 relation(s) that end on what the commands delete (api-in-system, customer-calls-api, api-reads-db) and mark 2 scenario step(s) broken. Tell the person, then call again with cascade: true.',
    );
    expect(element('api')).toBeDefined();
    expect(session.history).toEqual({});

    await value('run_commands', { label: 'Remove the API', commands, cascade: true });
    expect(element('api')).toBeUndefined();
    expect(session.history.undo).toEqual({ label: 'Remove the API', author: 'claude' });
  });

  it('preview each delete in a batch over the project the commands before it leave', async () => {
    // The cart takes nothing with it now, but the batch first relates something to it.
    const commands = [
      {
        type: 'create-relation',
        relation: {
          id: 'customer-buys',
          relationType: 'systems.communicates-with',
          from: 'customer',
          to: 'cart',
        },
      },
      { type: 'batch', label: 'Inner', commands: [{ type: 'delete', elements: ['cart'] }] },
    ];
    expect(await failure('run_commands', { label: 'Relate, then delete', commands })).toContain(
      'would also delete 1 relation(s) that end on what the commands delete (customer-buys)',
    );
    expect(session.history).toEqual({});
    await value('run_commands', {
      label: 'Delete the cart',
      commands: [{ type: 'delete', elements: ['cart'] }],
    });
    expect(element('cart')).toBeUndefined();
  });

  it('run no change of container that takes data or relations away until told it may', async () => {
    await value('update_relation', { id: 'api-in-system', name: 'runs in' });
    const args = { view: 'overview', shapes: [{ element: 'api', from: 'system' }] };
    const message = await failure('change_container', args);
    expect(message).toMatch(/^Not moved: this would also delete 0 relation\(s\)/);
    expect(message).toContain(
      'It would also take away 1 nesting relation(s) with a name, a description or attributes of their own (api-in-system).',
    );
    const inside = { type: 'change-container', ...args };
    expect(await failure('run_commands', { label: 'Take it out', commands: [inside] })).toContain(
      '(api-in-system)',
    );
    expect(session.history.undo?.label).toBe('Edit the relation "runs in"');

    await value('change_container', { ...args, cascade: true });
    expect(session.snapshot.model.relations.some((each) => each.id === 'api-in-system')).toBe(
      false,
    );
  });

  it('refuse a change of container that deletes relations ending on its nesting relation', async () => {
    await value('add_to_model', {
      relations: [
        {
          ref: 'about',
          relationType: 'systems.communicates-with',
          from: 'customer',
          to: 'db-in-system',
        },
      ],
    });
    expect(
      await failure('change_container', {
        view: 'overview',
        shapes: [{ element: 'db', from: 'system' }],
      }),
    ).toContain('would also delete 1 relation(s) that end on the nesting relations it takes away');
  });

  it('take an element out of its container at once when that takes nothing else', async () => {
    await value('change_container', {
      view: 'overview',
      shapes: [{ element: 'api', from: 'system', at: { x: 480, y: 40 } }],
    });
    expect(session.snapshot.model.relations.some((each) => each.id === 'api-in-system')).toBe(
      false,
    );
    // Claude's place is left for layout to change.
    expect(session.snapshot.views[0]?.positions).toContainEqual({ element: 'api', x: 480, y: 40 });
  });

  it('pin a place it gives a shape only when told to', async () => {
    await value('change_container', {
      view: 'overview',
      shapes: [{ element: 'api', from: 'system', at: { x: 480, y: 40 }, pinned: true }],
    });
    expect(session.snapshot.views[0]?.positions).toContainEqual({
      element: 'api',
      x: 480,
      y: 40,
      pinned: true,
    });
  });

  it('place shapes unpinned unless told otherwise', async () => {
    await value('set_positions', {
      view: 'overview',
      positions: [
        { element: 'cart', x: 600, y: 40 },
        { element: 'customer', x: -240, y: 40, pinned: true },
      ],
    });
    const positions = session.snapshot.views[0]?.positions ?? [];
    // An unpinned position is stored without the flag.
    expect(positions).toContainEqual({ element: 'cart', x: 600, y: 40 });
    expect(positions).toContainEqual({ element: 'customer', x: -240, y: 40, pinned: true });
  });

  it('create a view and answer with its id', async () => {
    const result = await value('create_view', {
      name: 'Ownership',
      perspective: { name: 'Ownership' },
      nestingRelationTypes: ['systems.is-part-of'],
    });
    expect(session.snapshot.views.map((view) => view.id)).toContain(result.view);
  });

  it('remove a component of the project’s own', async () => {
    await value('delete_from_model', { elements: ['cart'] });
    await value('remove_definition', { id: 'shop.cart' });
    expect(session.snapshot.packages.find((each) => each.id === 'shop')?.components).toEqual([]);
    expect(await failure('remove_definition', { id: 'shop.nothing' })).toContain(
      'No package in use',
    );
  });

  it('run several commands as one action', async () => {
    await value('run_commands', {
      label: 'Tidy the shop',
      commands: [
        { type: 'update-element', id: 'api', changes: { name: 'Gateway' } },
        { type: 'update-element', id: 'db', changes: { name: 'Orders' } },
      ],
    });
    expect(session.history.undo).toEqual({ label: 'Tidy the shop', author: 'claude' });
    expect([element('api')?.name, element('db')?.name]).toEqual(['Gateway', 'Orders']);
  });

  it('collapse a container', async () => {
    await value('set_collapsed', { view: 'overview', elements: ['system'], collapsed: true });
    expect(session.snapshot.views[0]?.collapsed).toEqual(['system']);
    expect(session.history.undo?.author).toBe('claude');
  });

  it('rename a package', async () => {
    await value('update_package', { id: 'shop', name: 'Shop things' });
    expect(session.snapshot.packages.find((each) => each.id === 'shop')?.name).toBe('Shop things');
  });

  it('give a package a version, a license and an attribution, and take them out (ADR 0047)', async () => {
    await value('update_package', {
      id: 'shop',
      version: '1.0.0',
      license: 'CC-BY-4.0',
      attribution: 'Jane Doe',
    });
    expect(session.snapshot.packages.find((each) => each.id === 'shop')).toMatchObject({
      version: '1.0.0',
      license: 'CC-BY-4.0',
      attribution: 'Jane Doe',
    });
    expect(await failure('update_package', { id: 'shop', license: 'CC BY' })).toContain(
      'SPDX license identifier',
    );
    await value('update_package', { id: 'shop', version: null, license: null, attribution: null });
    expect(session.snapshot.packages.find((each) => each.id === 'shop')).not.toHaveProperty(
      'license',
    );
  });

  it('change a component trait by trait', async () => {
    await value('update_component', {
      id: 'shop.cart',
      name: 'Basket',
      appearance: { fill: '#E3F2E9' },
    });
    const cart = session.snapshot.packages
      .find((each) => each.id === 'shop')
      ?.components.find((each) => each.id === 'shop.cart');
    expect(cart?.name).toBe('Basket');
    expect(cart?.appearance?.fill).toBe('#E3F2E9');
    expect(cart?.attributes).toEqual([{ name: 'items', type: 'number', default: 0 }]);
  });

  it('change a relation type trait by trait', async () => {
    await value('update_relation_type', { id: 'shop.holds', name: 'contains' });
    const holds = session.snapshot.packages
      .find((each) => each.id === 'shop')
      ?.relationTypes.find((each) => each.id === 'shop.holds');
    expect(holds?.name).toBe('contains');
  });

  it('reorder elements', async () => {
    await value('reorder_elements', { elements: ['cart'], before: 'system' });
    expect(session.snapshot.model.elements[0]?.id).toBe('cart');
  });

  it('define a component with an id it makes, created only once', async () => {
    const component = { name: 'Queue', derivesFrom: 'systems.service' };
    const result = await value('define_component', {
      package: 'shop',
      createOnly: true,
      component,
    });
    const created = result.created as string[];
    expect(created[0]).toMatch(/^shop\./);
    const defined = session.snapshot.packages.find((each) => each.id === 'shop')?.components;
    expect(defined?.map((each) => each.name)).toContain('Queue');
    expect(
      await failure('define_component', {
        package: 'shop',
        createOnly: true,
        component: { ...component, id: created[0] },
      }),
    ).toMatch(/^Refused, so nothing changed/);
  });

  it('refuse to define in a built-in package, saying to derive in one of the project’s own', async () => {
    const before = session.snapshot;
    expect(
      await failure('define_component', {
        package: 'systems',
        component: { name: 'Queue', derivesFrom: 'systems.service' },
      }),
    ).toBe(
      'The package "systems" is built in, and built-in packages are closed: no project adds to them or changes them. Derive the component in a package of the project’s own instead, as in define_component { "package": "shop", "component": { "name": "Queue", "derivesFrom": "systems.service" } }.',
    );
    expect(
      await failure('define_component', {
        package: 'systems',
        component: { name: 'service', derivesFrom: 'systems.box' },
      }),
    ).toMatch(/Use "systems\.service", which "systems" defines already, or derive the component/);
    expect(
      await failure('define_relation_type', {
        package: 'systems',
        relationType: { name: 'publishes to', derivesFrom: 'systems.communicates-with' },
      }),
    ).toBe(
      'The package "systems" is built in, and built-in packages are closed: no project adds to them or changes them. Derive the relation type in a package of the project’s own instead, as in define_relation_type { "package": "shop", "relationType": { "name": "publishes to", "derivesFrom": "systems.communicates-with" } }.',
    );
    expect(session.snapshot).toBe(before);
  });

  it('add a note to a view', async () => {
    const result = await value('add_free_shape', {
      view: 'overview',
      shape: { kind: 'note', x: 0, y: 400, width: 200, height: 60, text: 'Orders go here.' },
    });
    expect(session.snapshot.views[0]?.freeShapes.map((shape) => shape.id)).toContain(result.shape);
  });
});

describe('guidance tools', () => {
  it('say when no app is open, and change nothing', async () => {
    expect(await value('highlight', { targets: ['api'] })).toEqual({
      shown: 0,
      note: expect.stringContaining('Call open_app') as string,
    });
    expect(session.history).toEqual({});
  });

  it('reach the open apps', async () => {
    const app = new FakeClient();
    session.connect(app);
    expect(await value('focus', { targets: ['api', 'api-reads-db'], view: 'overview' })).toEqual({
      shown: 1,
    });
    expect(await value('show_caption', { text: 'The API reads the DB.' })).toEqual({ shown: 1 });
    expect(await value('pan_to', { target: 'note' })).toEqual({ shown: 1 });
    expect(await value('clear_guidance')).toEqual({ shown: 1 });
    expect(app.ofType('guidance').map((message) => message.guidance)).toEqual([
      { kind: 'focus', targets: ['api', 'api-reads-db'], view: 'overview' },
      { kind: 'caption', text: 'The API reads the DB.' },
      { kind: 'pan-to', target: 'note' },
      { kind: 'clear' },
    ]);
  });

  it('refuse targets and views that do not exist', async () => {
    expect(await failure('highlight', { targets: ['api', 'ghost'] })).toContain(
      'Nothing has these ids: ghost.',
    );
    expect(await failure('pan_to', { target: 'api', view: 'nowhere' })).toBe(
      'There is no view "nowhere".',
    );
  });

  it('ask the open apps to lay out a view, or some containers’ contents, changing nothing', async () => {
    expect(await value('lay_out_view', { view: 'overview' })).toEqual({
      apps: 0,
      note: expect.stringContaining('nothing was laid out') as string,
    });
    const app = new FakeClient();
    session.connect(app);
    expect(await value('lay_out_view', { view: 'overview', containers: ['system'] })).toEqual({
      apps: 1,
      note: expect.stringContaining('Lay out') as string,
    });
    expect(await value('lay_out_view')).toMatchObject({ apps: 1 });
    expect(app.ofType('guidance').map((message) => message.guidance)).toEqual([
      { kind: 'layout', view: 'overview', containers: ['system'] },
      { kind: 'layout' },
    ]);
    // The layout is the app's to run and record; the guidance itself records nothing.
    expect(session.history).toEqual({});
  });

  it('refuse to lay out a view that is not there, or what holds nothing', async () => {
    expect(await failure('lay_out_view', { view: 'nowhere' })).toBe('There is no view "nowhere".');
    expect(await failure('lay_out_view', { containers: ['api', 'ghost', 'system'] })).toBe(
      'These hold nothing to lay out: api, ghost. Name containers, as find_elements finds them, or leave containers out to lay out the whole view.',
    );
  });

  it('open the app', async () => {
    expect(await value('open_app')).toMatchObject({ opened: expect.any(String) as string });
    expect(opened).toBe(1);
  });
});
