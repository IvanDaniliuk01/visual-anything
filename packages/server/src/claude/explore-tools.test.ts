import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startToolHarness, type ToolHarness } from './tool-harness';

let tools: ToolHarness;

beforeEach(async () => {
  tools = await startToolHarness();
});

afterEach(async () => {
  await tools.close();
});

describe('filter_view', () => {
  it('sets the open view’s filters through the live connection, writing nothing', async () => {
    const app = await tools.openApp();
    const view = await readFile(join(tools.session.folder, 'views', 'overview.vaview'), 'utf8');
    const before = tools.session.snapshot;
    const result = await tools.value('filter_view', {
      components: ['systems.database'],
      relationTypes: ['systems.is-part-of'],
      conditions: [
        { of: 'elements', attribute: 'owner', test: 'is', value: 'Team A' },
        { of: 'relations', attribute: 'protocol', test: 'set' },
        { of: 'elements', attribute: 'items', test: 'above', value: 2 },
      ],
      view: 'overview',
    });
    expect(result).toMatchObject({
      shown: 1,
      hidden: { components: ['systems.database'], relationTypes: ['systems.is-part-of'] },
      conditions: 3,
    });
    expect(result.note).toMatch(/Nothing is written to the view/);
    await expect.poll(() => tools.guidanceOf(app).length).toBe(1);
    expect(tools.guidanceOf(app)).toEqual([
      {
        kind: 'filter',
        filters: {
          components: ['systems.database'],
          relationTypes: ['systems.is-part-of'],
          conditions: [
            { of: 'elements', attribute: 'owner', test: 'is', value: 'Team A' },
            { of: 'relations', attribute: 'protocol', test: 'set', value: '' },
            { of: 'elements', attribute: 'items', test: 'above', value: '2' },
          ],
        },
        view: 'overview',
      },
    ]);
    expect(tools.session.snapshot).toBe(before);
    expect(tools.session.history).toEqual({});
    expect(await readFile(join(tools.session.folder, 'views', 'overview.vaview'), 'utf8')).toBe(
      view,
    );
  });

  it('keeps only some components and relation types, with those that derive from them', async () => {
    const services = await tools.value('filter_view', {
      onlyComponents: ['systems.service', 'shop.cart'],
      onlyRelationTypes: ['systems.communicates-with'],
    });
    expect(services.hidden).toEqual({
      components: ['systems.system', 'systems.database', 'systems.person'],
      relationTypes: ['systems.is-part-of', 'systems.reads-from'],
    });
    // Everything but the person derives from Box, so it stays with it.
    const boxes = await tools.value('filter_view', { onlyComponents: ['systems.box'] });
    expect(boxes.hidden).toEqual({ components: ['systems.person'], relationTypes: [] });
  });

  it('says that filters which hide nothing show everything again', async () => {
    expect(await tools.value('filter_view', {})).toMatchObject({
      shown: 0,
      hidden: { components: [], relationTypes: [] },
    });
  });

  it.each([
    [{ components: ['systems.nothing'] }, /No package in use defines "systems\.nothing"/],
    [{ onlyRelationTypes: ['shop.nothing'] }, /No package in use defines "shop\.nothing"/],
    [{ components: ['systems.service'], onlyComponents: ['systems.box'] }, /not both/],
    [{ relationTypes: [], onlyRelationTypes: ['relates-to'] }, /not both/],
    [{ view: 'nowhere' }, /There is no view "nowhere"/],
    [
      { conditions: [{ of: 'elements', attribute: 'owner', test: 'is' }] },
      /A condition that tests with "is" needs a value/,
    ],
    [{ conditions: [{ of: 'views', attribute: 'owner', test: 'set' }] }, /of/],
  ])('refuses %j', async (args, message) => {
    expect(await tools.failure('filter_view', args)).toMatch(message);
  });
});

describe('focus_view', () => {
  it('turns focus mode on in the open app, with its reach', async () => {
    const app = await tools.openApp();
    expect(
      await tools.value('focus_view', {
        targets: ['api', 'customer-calls-api'],
        degrees: 'all',
        direction: 'outgoing',
        isolate: true,
      }),
    ).toMatchObject({ shown: 1, from: '1 element and 1 relation' });
    await tools.value('focus_view', { targets: ['db'], view: 'overview' });
    await expect.poll(() => tools.guidanceOf(app).length).toBe(2);
    expect(tools.guidanceOf(app)).toEqual([
      {
        kind: 'focus-view',
        targets: ['api', 'customer-calls-api'],
        degrees: 'all',
        direction: 'outgoing',
        isolate: true,
      },
      {
        kind: 'focus-view',
        targets: ['db'],
        degrees: 1,
        direction: 'both',
        isolate: false,
        view: 'overview',
      },
    ]);
  });

  it.each([
    [{ targets: ['nothing'] }, /Nothing has these ids: nothing/],
    [{ targets: ['note'] }, /Focus starts from elements and relations, and note is a free shape/],
    [{ targets: [] }, /targets/],
    [{ targets: ['api'], degrees: 6 }, /degrees/],
    [{ targets: ['api'], view: 'nowhere' }, /There is no view "nowhere"/],
  ])('refuses %j', async (args, message) => {
    expect(await tools.failure('focus_view', args)).toMatch(message);
  });
});

describe('clear_explore', () => {
  it('ends the filters and the focus of the open view', async () => {
    const app = await tools.openApp();
    expect(await tools.value('clear_explore')).toEqual({ shown: 1 });
    await tools.value('clear_explore', { view: 'overview' });
    await expect.poll(() => tools.guidanceOf(app).length).toBe(2);
    expect(tools.guidanceOf(app)).toEqual([
      { kind: 'clear-explore' },
      { kind: 'clear-explore', view: 'overview' },
    ]);
    expect(await tools.failure('clear_explore', { view: 'nowhere' })).toMatch(/no view "nowhere"/);
  });
});
