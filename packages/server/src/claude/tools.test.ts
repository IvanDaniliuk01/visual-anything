import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeCommand, type Command } from '@visual-anything/core';
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

/**
 * Whether the core of this build knows a kind of command: one it does not know is refused as not a
 * command, whatever it holds.
 */
function coreKnows(type: string): boolean {
  const outcome = executeCommand(testProject(), { type } as unknown as Command);
  return outcome.ok || !outcome.problems.some((each) => each.message.includes('is not a command'));
}

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

  it('say which only read: those that get, list, find, read, preview or link to', () => {
    const readOnly = TOOLS.filter((each) => each.hints.readOnlyHint).map((each) => each.name);
    expect(readOnly).toEqual(
      TOOLS.map((each) => each.name).filter((name) =>
        /^(get|list|find|read|preview|link)_/.test(name),
      ),
    );
    expect(readOnly).toEqual(
      expect.arrayContaining(['get_project', 'read_scenario', 'list_images']),
    );
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

  it('collapse a container, or say collapsing is not there yet while the core lacks it', async () => {
    const args = { view: 'overview', elements: ['system'], collapsed: true };
    if (!coreKnows('set-collapsed')) {
      expect(await failure('set_collapsed', args)).toBe(
        'Collapsing and expanding are not in this build of Visual Anything yet.',
      );
      return;
    }
    await value('set_collapsed', args);
    expect((session.snapshot.views[0] as { collapsed?: string[] }).collapsed).toEqual(['system']);
    expect(session.history.undo?.author).toBe('claude');
  });

  it('rename a package, or say it is not there yet', async () => {
    const args = { id: 'shop', name: 'Shop things' };
    if (!coreKnows('update-package')) {
      expect(await failure('update_package', args)).toBe(
        'Changing a package is not in this build of Visual Anything yet.',
      );
      return;
    }
    await value('update_package', args);
    expect(session.snapshot.packages.find((each) => each.id === 'shop')?.name).toBe('Shop things');
  });

  it('change a component trait by trait, or say it is not there yet', async () => {
    const args = { id: 'shop.cart', name: 'Basket', appearance: { fill: '#E3F2E9' } };
    if (!coreKnows('update-component')) {
      expect(await failure('update_component', args)).toBe(
        'Changing a component trait by trait is not in this build of Visual Anything yet.',
      );
      return;
    }
    await value('update_component', args);
    const cart = session.snapshot.packages
      .find((each) => each.id === 'shop')
      ?.components.find((each) => each.id === 'shop.cart');
    expect(cart?.name).toBe('Basket');
    expect(cart?.attributes).toEqual([{ name: 'items', type: 'number', default: 0 }]);
  });

  it('change a relation type trait by trait, or say it is not there yet', async () => {
    const args = { id: 'shop.holds', name: 'contains' };
    if (!coreKnows('update-relation-type')) {
      expect(await failure('update_relation_type', args)).toBe(
        'Changing a relation type trait by trait is not in this build of Visual Anything yet.',
      );
      return;
    }
    await value('update_relation_type', args);
    const holds = session.snapshot.packages
      .find((each) => each.id === 'shop')
      ?.relationTypes.find((each) => each.id === 'shop.holds');
    expect(holds?.name).toBe('contains');
  });

  it('reorder elements, or say it is not there yet', async () => {
    const args = { elements: ['cart'], before: 'system' };
    if (!coreKnows('reorder-elements')) {
      expect(await failure('reorder_elements', args)).toBe(
        'Reordering elements is not in this build of Visual Anything yet.',
      );
      return;
    }
    await value('reorder_elements', args);
    expect(session.snapshot.model.elements[0]?.id).toBe('cart');
  });

  it('define a component with an id it makes, created only once', async () => {
    const component = { name: 'Queue', derivesFrom: 'systems.service' };
    const outcome = await call('define_component', {
      package: 'shop',
      createOnly: true,
      component,
    });
    // Builds whose core makes definition ids create it; older ones need an id.
    if (!outcome.ok) {
      expect(outcome.message).toMatch(/^Refused, so nothing changed/);
      return;
    }
    const created = (outcome.value as { created: string[] }).created;
    expect(created[0]).toMatch(/^shop\./);
    const defined = session.snapshot.packages.find((each) => each.id === 'shop')?.components;
    expect(defined?.map((each) => each.name)).toContain('Queue');
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

  it('open the app', async () => {
    expect(await value('open_app')).toMatchObject({ opened: expect.any(String) as string });
    expect(opened).toBe(1);
  });
});
