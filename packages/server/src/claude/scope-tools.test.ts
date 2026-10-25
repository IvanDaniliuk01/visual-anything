/**
 * Claude's tools for a view's scope (ADR-0040): reading it, setting it, and adding elements to a view
 * or leaving them out, each write one undoable action of Claude's that changes only the view's file.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startToolHarness, type ToolHarness } from './tool-harness';

let tools: ToolHarness;

beforeEach(async () => {
  tools = await startToolHarness();
});

afterEach(async () => {
  await tools.close();
});

const overview = () => tools.session.snapshot.views.find((view) => view.id === 'overview');

describe('get_scope', () => {
  it('says a view without a scope shows the whole model', async () => {
    expect(await tools.value('get_scope', { view: 'overview' })).toMatchObject({
      view: 'overview',
      scope: null,
      shows: { whole: true, elements: 5, ofElements: 5, relations: 4, ofRelations: 4 },
    });
  });

  it('gives the scope, what it adds and leaves out by name, and the elements it shows', async () => {
    await tools.asPerson({
      type: 'set-scope',
      view: 'overview',
      scope: { include: [{ kind: 'contents', container: 'system' }], added: ['customer'] },
    });
    const result = await tools.value('get_scope', { view: 'overview' });
    expect(result).toMatchObject({
      scope: { include: [{ kind: 'contents', container: 'system' }], added: ['customer'] },
      added: [{ id: 'customer', name: 'Customer' }],
      leftOut: [],
      shows: { whole: false, elements: 4, ofElements: 5, relations: 4, ofRelations: 4 },
      elements: [
        { id: 'system', name: 'Shop system' },
        { id: 'api', name: 'API' },
        { id: 'db', name: 'DB' },
        { id: 'customer', name: 'Customer' },
      ],
    });
  });

  it('refuses a view that does not exist', async () => {
    expect(await tools.failure('get_scope', { view: 'nowhere' })).toMatch(/no view "nowhere"/);
  });
});

describe('set_scope', () => {
  it('sets a scope as one action of Claude’s, and takes it away with null', async () => {
    const result = await tools.value('set_scope', {
      view: 'overview',
      scope: {
        include: [{ kind: 'component', component: 'systems.service' }],
        exclude: [{ kind: 'attribute', attribute: 'owner', test: 'is', value: 'Team B' }],
      },
    });
    expect(result).toMatchObject({
      done: 'Set what "Overview" shows',
      shows: { whole: false, elements: 1, ofElements: 5 },
    });
    expect(overview()?.scope).toEqual({
      include: [{ kind: 'component', component: 'systems.service' }],
      exclude: [{ kind: 'attribute', attribute: 'owner', test: 'is', value: 'Team B' }],
    });
    expect(tools.session.history.undo).toEqual({
      label: 'Set what "Overview" shows',
      author: 'claude',
    });
    expect(await tools.value('set_scope', { view: 'overview', scope: null })).toMatchObject({
      done: 'Show the whole model in "Overview"',
    });
    expect(overview()?.scope).toBeUndefined();
  });

  it('takes a number or a boolean for an attribute rule’s value, as text', async () => {
    await tools.value('set_scope', {
      view: 'overview',
      scope: { include: [{ kind: 'attribute', attribute: 'replicas', test: 'above', value: 2 }] },
    });
    expect(overview()?.scope?.include).toEqual([
      { kind: 'attribute', attribute: 'replicas', test: 'above', value: '2' },
    ]);
  });

  it('refuses a rule that names nothing the project has, changing nothing', async () => {
    const before = tools.session.snapshot;
    expect(
      await tools.failure('set_scope', {
        view: 'overview',
        scope: { include: [{ kind: 'component', component: 'nothing.here' }] },
      }),
    ).toMatch(/^Refused, so nothing changed/);
    expect(tools.session.snapshot).toBe(before);
  });
});

describe('add_to_view and leave_out_of_view', () => {
  it('leave out and add back as one action each, and never delete from the model', async () => {
    const left = await tools.value('leave_out_of_view', { view: 'overview', elements: ['db'] });
    expect(left).toMatchObject({
      done: 'Leave "DB" out of "Overview"',
      shows: { elements: 4, ofElements: 5, relations: 2, ofRelations: 4 },
    });
    expect(overview()?.scope).toEqual({ leftOut: ['db'] });
    expect(tools.session.snapshot.model.elements.some((element) => element.id === 'db')).toBe(true);
    const added = await tools.value('add_to_view', { view: 'overview', elements: ['db'] });
    expect(added).toMatchObject({
      done: 'Add "DB" to "Overview"',
      shows: { elements: 5, ofElements: 5 },
    });
    expect(overview()?.scope).toBeUndefined();
  });

  it('read_view says how many elements the view shows out of how many', async () => {
    await tools.value('leave_out_of_view', { view: 'overview', elements: ['customer', 'cart'] });
    expect(await tools.value('read_view', { view: 'overview' })).toMatchObject({
      shows: { whole: false, elements: 3, ofElements: 5 },
      scope: { leftOut: ['cart', 'customer'] },
    });
  });

  it('refuses World and elements that do not exist', async () => {
    expect(
      await tools.failure('leave_out_of_view', { view: 'overview', elements: ['world'] }),
    ).toMatch(/world-not-allowed/);
    expect(await tools.failure('add_to_view', { view: 'overview', elements: ['ghost'] })).toMatch(
      /^Refused/,
    );
  });
});
