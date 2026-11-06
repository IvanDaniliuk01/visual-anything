/**
 * Faces through Claude's tools (ADR 0083), called through MCP as Claude calls them: `set_face` sets a
 * component's face, an element's, or one variant, as one undoable action of Claude's, and refuses a
 * bad face at its line and column; `preview_face` lays one out on an element and changes nothing.
 */
import { DATA_MODELING, type ProjectSnapshot } from '@visual-anything/core';
import { afterEach, describe, expect, it } from 'vitest';
import { testProject } from '../test-support';
import { startToolHarness, type ToolHarness } from './tool-harness';

let tools: ToolHarness | undefined;

afterEach(async () => {
  await tools?.close();
  tools = undefined;
});

/** The test project with a small database: a table of two columns, one referencing another table's. */
function withDatabase(): ProjectSnapshot {
  const base = testProject();
  return {
    ...base,
    project: { ...base.project, packages: [...base.project.packages, 'data-modeling'] },
    packages: [...base.packages, DATA_MODELING],
    model: {
      ...base.model,
      elements: [
        ...base.model.elements,
        {
          id: 'orders',
          component: 'data-modeling.table',
          name: 'orders',
          attributes: { schema: 'billing' },
        },
        { id: 'customers', component: 'data-modeling.table', name: 'customers' },
        {
          id: 'order-id',
          component: 'data-modeling.column',
          name: 'id',
          attributes: { type: 'uuid', primaryKey: true, notNull: true },
        },
        {
          id: 'order-customer',
          component: 'data-modeling.column',
          name: 'customer_id',
          attributes: { type: 'uuid', notNull: true },
        },
        {
          id: 'customer-id',
          component: 'data-modeling.column',
          name: 'id',
          attributes: { type: 'uuid', primaryKey: true, unique: true },
        },
      ],
      relations: [
        ...base.model.relations,
        { id: 'r1', relationType: 'data-modeling.is-column-of', from: 'order-id', to: 'orders' },
        {
          id: 'r2',
          relationType: 'data-modeling.is-column-of',
          from: 'order-customer',
          to: 'orders',
        },
        {
          id: 'r3',
          relationType: 'data-modeling.is-column-of',
          from: 'customer-id',
          to: 'customers',
        },
        {
          id: 'r4',
          relationType: 'data-modeling.references',
          from: 'order-customer',
          to: 'customer-id',
        },
      ],
    },
  };
}

async function start(project = withDatabase()) {
  const harness = await startToolHarness(project);
  tools = harness;
  return {
    session: harness.session,
    value: (name: string, args?: Record<string, unknown>) => harness.value(name, args),
    failure: (name: string, args?: Record<string, unknown>) => harness.failure(name, args),
  };
}

describe('preview_face', () => {
  it('lays out a built-in table’s face on the first table, and a column’s on its row', async () => {
    const { value, session } = await start();
    const before = session.snapshot;
    const table = await value('preview_face', { component: 'data-modeling.table' });
    expect(table).toMatchObject({
      of: 'The component "Table"',
      filledFrom: 'the element "orders" (orders)',
      width: 240,
      cut: false,
      lines: ['orders  billing'],
      text: 'orders\nbilling',
      regions: [{ kind: 'rows', y: 32, height: 52 }],
      problems: [],
      see: 'capture_view { "region": ["orders"] } shows it drawn, on a view the open app shows.',
      from: { markup: 'the component "Table"', style: 'the component "Table"' },
    });
    const column = await value('preview_face', { element: 'order-customer' });
    expect(column).toMatchObject({
      filledFrom: 'the element "customer_id" (order-customer), on its row',
      width: 240,
      height: 24,
      lines: ['customer_id  uuid  FK  NOT NULL'],
      problems: [],
    });
    expect(session.snapshot).toBe(before);
    expect(session.actions).toEqual([]);
  });

  it('tries a face without saving it, and lists its problems at their lines and columns', async () => {
    const { value, session } = await start();
    const tried = await value('preview_face', {
      element: 'api',
      face: {
        size: 'content',
        markup: '<b>{{name}}</b>\n<p class="pale">{{owner}} {{nope}}</p>',
        style: ['.pale { color: #EEEEEE; }'],
      },
    });
    expect(tried).toMatchObject({ tried: true, lines: ['API', 'Team A'], cut: false });
    expect(tried.problems).toEqual([
      {
        severity: 'warning',
        code: 'unknown-face-attribute',
        message:
          'Line 2, column 17 of the markup: it names the attribute "nope", which the component does not have.',
      },
      {
        severity: 'warning',
        code: 'face-contrast',
        message:
          'Line 2, column 17 of the markup: its text, #EEEEEE on #DCEBFF, reads at 1.0:1 in the light theme, under 4.5:1.',
      },
    ]);
    const broken = await value('preview_face', {
      component: 'systems.service',
      face: { markup: ['<b>{{name}}</b>', '  <img src="x"/>'] },
    });
    expect(broken).toMatchObject({ laidOut: false });
    expect(broken.problems).toEqual([
      {
        severity: 'error',
        code: 'invalid-face',
        message:
          'Line 2, column 3 of the markup: <img> is not part of a face: nothing in a face runs or is fetched.',
      },
    ]);
    expect(session.actions).toEqual([]);
  });

  it('lays a face of size content out as wide as the canvas makes its shape: not cut (#15)', async () => {
    const { value } = await start();
    const face = {
      size: 'content',
      markup: '<b>{{name}}</b>\n<p>{{owner}} — Hugo Ferreyra (Paciente de prueba)</p>',
      style: 'face { padding: 4px 8px; }\np { white-space: nowrap; }',
    };
    const grown = await value('preview_face', { element: 'api', face });
    expect(grown).toMatchObject({ cut: false });
    expect(grown.width).toBeGreaterThan(176);
    expect(grown.lines).toContain('Team A — Hugo Ferreyra (Paciente de prueba)');
    // A width given is kept, the face cut in it.
    expect(await value('preview_face', { element: 'api', face, width: 120 })).toMatchObject({
      width: 120,
      cut: true,
    });
  });

  it('lays a variant out at the width the face itself takes, as the canvas draws a level’s (#15)', async () => {
    const { value } = await start();
    const face = {
      size: 'content',
      markup: '<p>{{name}} — {{owner}} — Hugo Ferreyra (Paciente de prueba)</p>',
      style: ['face { padding: 4px 8px; }', 'p { white-space: nowrap; }'],
      variants: [{ id: 'far', markup: '<b>{{name}}</b>' }],
    };
    const whole = await value('preview_face', { element: 'api', face });
    expect(whole.width).toBeGreaterThan(176);
    const far = await value('preview_face', { element: 'api', face, variant: 'far' });
    expect(far).toMatchObject({ width: whole.width, lines: ['API'], cut: false });
  });

  it('lays a face of size content out as a view does when given one, and says otherwise', async () => {
    const face = {
      size: 'content',
      markup: '<p>{{name}} — {{owner}} — Hugo Ferreyra (Paciente de prueba)</p>',
      style: 'p { white-space: nowrap; }',
    };
    const base = withDatabase();
    const sized: ProjectSnapshot = {
      ...base,
      views: base.views.map((view) =>
        view.id === 'overview'
          ? {
              ...view,
              positions: view.positions.map((each) =>
                each.element === 'api' ? { ...each, width: 150 } : each,
              ),
            }
          : view,
      ),
    };
    const { value, failure } = await start(sized);
    const free = await value('preview_face', { element: 'api', face });
    expect(free.width).toBeGreaterThan(176);
    expect(free.widthNote).toContain('give view');
    // The view stores a width for its shape: the canvas keeps it, the face cut in it.
    const inView = await value('preview_face', { element: 'api', face, view: 'overview' });
    expect(inView).toMatchObject({ width: 150, cut: true });
    expect(inView.widthNote).toBeUndefined();
    // The view nests the API in the system: the system keeps its own width, though the model's
    // contents would too.
    const holder = await value('preview_face', { element: 'system', face, view: 'overview' });
    expect(holder.width).toBe(400);
    expect(await failure('preview_face', { element: 'api', face, view: 'nowhere' })).toBe(
      'There is no view "nowhere".',
    );
  });

  it('lays out a variant and a collapsed container, and says when there is no face', async () => {
    const { value, failure } = await start();
    expect(
      await value('preview_face', {
        element: 'system',
        face: {
          markup: ['<b>{{name}}</b>', '<contents/>'],
          variants: [{ id: 'closed', markup: '<b>{{name}}</b> <small>{{count}} inside</small>' }],
          collapsed: 'closed',
        },
        collapsed: true,
      }),
    ).toMatchObject({ lines: ['Shop system 2 inside'] });
    expect(await failure('preview_face', { component: 'systems.service' })).toBe(
      'The component "Service" draws no face: give face a markup to try one, and set_face to set it.',
    );
    expect(await failure('preview_face', {})).toBe('Give one of component or element.');
  });
});

describe('set_face', () => {
  it('sets a built-in component’s face in the project file, part by part, as one action of Claude’s', async () => {
    const { value, session } = await start();
    const set = await value('set_face', {
      component: 'systems.service',
      face: { markup: '<b>{{name}}</b>\n<p if="owner">{{owner}}</p>' },
    });
    expect(set).toMatchObject({
      done: 'Change the appearance of the component "Service"',
      undo: 'The person can undo it in the app.',
      keptIn: expect.stringContaining('the project file') as string,
      from: { markup: 'the component "Service", in the project file' },
    });
    expect(session.snapshot.project.appearances?.components?.['systems.service']).toEqual({
      face: { markup: ['<b>{{name}}</b>', '<p if="owner">{{owner}}</p>'] },
    });
    // Restyled, keeping its markup.
    await value('set_face', {
      component: 'systems.service',
      face: { style: 'p { color: var(--text-muted); }' },
    });
    expect(session.snapshot.project.appearances?.components?.['systems.service']?.face).toEqual({
      markup: ['<b>{{name}}</b>', '<p if="owner">{{owner}}</p>'],
      style: ['p { color: var(--text-muted); }'],
    });
    expect(session.actions.map((each) => each.author)).toEqual(['claude', 'claude']);
  });

  it('refuses a bad face at its line and column, and changes nothing', async () => {
    const { failure, session } = await start();
    const before = session.snapshot;
    const refused = await failure('set_face', {
      component: 'data-modeling.table',
      face: { markup: ['<header>', '  <b onclick="x()">{{name}}</b>', '</header>', '<rows/>'] },
    });
    expect(refused).toContain('Refused, so nothing changed: The face of the component "Table":');
    expect(refused).toContain('Line 2, column 6 of the markup:');
    expect(refused).toContain('(invalid-face)');
    expect(refused).toContain('preview_face, given the same face, lists every problem');
    expect(session.snapshot).toBe(before);
  });

  it('gives one element a face of its own, sets and takes away a variant, and goes back with null', async () => {
    const { value, session } = await start();
    const own = await value('set_face', {
      element: 'orders',
      face: { markup: ['<b>{{name}}</b>', '<rows/>'] },
    });
    expect(own).toMatchObject({
      keptIn: 'the element itself, as a particularity of its own',
      from: { markup: 'the element itself', style: 'the component "Table"' },
    });
    const orders = () => session.snapshot.model.elements.find((each) => each.id === 'orders');
    expect(orders()?.appearance?.face).toEqual({ markup: ['<b>{{name}}</b>', '<rows/>'] });

    await value('set_face', {
      component: 'data-modeling.table',
      variant: { id: 'far', markup: '<b>{{name}}</b>' },
    });
    const table = () => session.snapshot.project.appearances?.components?.['data-modeling.table'];
    expect(table()?.face).toEqual({ variants: [{ id: 'far', markup: ['<b>{{name}}</b>'] }] });
    await value('set_face', {
      component: 'data-modeling.table',
      variant: { id: 'far', markup: null },
    });
    expect(table()?.face).toEqual({ variants: [] });

    await value('set_face', { element: 'orders', face: null });
    expect(orders()?.appearance).toBeUndefined();
    expect(session.actions).toHaveLength(4);
  });

  it('warns about unknown attributes and contrast, and asks for one target and one change', async () => {
    const { value, failure } = await start();
    const warned = await value('set_face', {
      element: 'api',
      face: { markup: '<p class="pale">{{nope}}</p>', style: '.pale { color: #F0F0F0; }' },
    });
    expect(warned.warnings).toEqual([
      'Line 1, column 17 of the markup: it names the attribute "nope", which the component does not have.',
      'Line 1, column 17 of the markup: its text, #F0F0F0 on #DCEBFF, reads at 1.1:1 in the light theme, under 4.5:1.',
    ]);
    expect(await failure('set_face', { face: { markup: '<b/>' } })).toBe(
      'Give one of component or element.',
    );
    expect(await failure('set_face', { element: 'api' })).toBe(
      'Give face, to set its parts, or variant, to set one variant.',
    );
  });
});
