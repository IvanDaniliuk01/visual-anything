import { readViewState } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Program } from './bridge';
import { startToolHarness, type ToolHarness } from './tool-harness';
import { TOOLS, runTool } from './tools';

let tools: ToolHarness;

beforeEach(async () => {
  tools = await startToolHarness();
});

afterEach(async () => {
  await tools.close();
});

describe('get_view_address', () => {
  it('answers the full view address of a view state, as the app writes it, changing nothing', async () => {
    const before = tools.session.snapshot;
    const result = await tools.value('get_view_address', {
      view: 'overview',
      select: ['api', 'note'],
    });
    expect(result).toMatchObject({
      address: `${tools.address}#view=overview&select=api,note`,
      fragment: '#view=overview&select=api,note',
      viewState: { view: 'overview', select: ['api', 'note'] },
    });
    expect(tools.address).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(result.note).toMatch(/open_app/);
    expect(JSON.stringify(result)).not.toMatch(/token|launch/);
    expect(tools.session.snapshot).toBe(before);
  });

  it('holds the camera, the filters, focus and the step, which the app reads back', async () => {
    const result = await tools.value('get_view_address', {
      view: 'overview',
      camera: { x: 120, y: -40.5, zoom: 1.5 },
      filters: {
        components: ['systems.database'],
        conditions: [
          { of: 'elements', attribute: 'owner', test: 'is', value: 'Team A' },
          { of: 'relations', attribute: 'protocol', test: 'set', value: 'ignored' },
        ],
      },
      focus: { degrees: 2, direction: 'outgoing', from: ['customer'] },
      scenario: 'request',
      step: 2,
    });
    const read = readViewState(String(result.fragment));
    expect(read).toEqual({
      ok: true,
      state: {
        view: 'overview',
        camera: { x: 120, y: -40.5, zoom: 1.5 },
        filters: {
          components: ['systems.database'],
          relationTypes: [],
          conditions: [
            { of: 'elements', attribute: 'owner', test: 'is', value: 'Team A' },
            { of: 'relations', attribute: 'protocol', test: 'set', value: '' },
          ],
        },
        focus: { degrees: 2, direction: 'outgoing', isolate: false, from: ['customer'] },
        scenario: 'request',
        step: 'read',
      },
    });
    expect(result.address).not.toMatch(/token|launch/);
  });

  it('answers the fragment alone when the program’s address is not known', async () => {
    const unreachable = () => Promise.reject(new Error('Not reached.'));
    const program: Program = {
      project: () => Promise.resolve(tools.session.snapshot),
      execute: unreachable,
      guide: unreachable,
      openApp: unreachable,
    };
    const getViewAddress = TOOLS.find((each) => each.name === 'get_view_address');
    if (getViewAddress === undefined) throw new Error('There is no get_view_address.');
    expect(await runTool(getViewAddress, { view: 'overview' }, program)).toMatchObject({
      ok: true,
      value: { address: '#view=overview', fragment: '#view=overview' },
    });
  });

  it('refuses what the project does not hold, saying what', async () => {
    expect(await tools.failure('get_view_address', { view: 'nowhere' })).toMatch(
      /^The project has no view "nowhere"\./,
    );
    expect(
      await tools.failure('get_view_address', { view: 'overview', select: ['ghost'] }),
    ).toMatch(/Nothing in the view "Overview" has the id "ghost"\./);
    expect(
      await tools.failure('get_view_address', { view: 'overview', scenario: 'request', step: 9 }),
    ).toBe('The scenario "A request" has no step 9: it has 2.');
    expect(await tools.failure('get_view_address', { view: 'overview', step: 'read' })).toBe(
      'A step needs its scenario: give scenario too.',
    );
  });
});

describe('open_app', () => {
  it('opens the app in the browser at a view state, and never answers the launch address', async () => {
    const result = await tools.value('open_app', { view: 'overview', select: ['api'] });
    expect(result).toMatchObject({ viewState: { view: 'overview', select: ['api'] } });
    expect(tools.opened).toHaveLength(1);
    expect(tools.opened[0]).toMatch(/#launch=[\w-]+&view=overview&select=api$/);
    expect(JSON.stringify(result)).not.toMatch(/launch=|token/);
  });

  it('opens the app at a view state whose filters hold a time range', async () => {
    const range = { of: 'elements', attribute: 'since', kind: 'date', from: 0, to: 86_400_000 };
    const result = await tools.value('open_app', { view: 'overview', filters: { range } });
    const state = {
      view: 'overview',
      filters: { components: [], relationTypes: [], conditions: [], range },
    };
    expect(result).toMatchObject({ viewState: state });
    expect(tools.opened[0]).toMatch(/#launch=[\w-]+&view=overview&filters=range:/);
    expect(readViewState(new URL(tools.opened[0] ?? '').hash)).toEqual({ ok: true, state });
    const linked = await tools.value('get_view_address', {
      view: 'overview',
      filters: { components: ['systems.database'], range: { ...range, until: 'until' } },
    });
    expect(readViewState(String(linked.fragment))).toEqual({
      ok: true,
      state: {
        view: 'overview',
        filters: {
          components: ['systems.database'],
          relationTypes: [],
          conditions: [],
          range: { ...range, until: 'until' },
        },
      },
    });
    expect(
      await tools.failure('get_view_address', {
        view: 'overview',
        filters: { range: { ...range, from: 0, to: 1, attribute: ' ' } },
      }),
    ).toBe('A time range names the attributes it reads.');
  });

  it('opens the app with no view state when given none', async () => {
    expect(await tools.value('open_app')).toMatchObject({ opened: expect.any(String) as string });
    expect(tools.opened).toHaveLength(1);
    expect(tools.opened[0]).toMatch(/#launch=[\w-]+$/);
  });

  it('refuses a view state the project does not hold, and a state without its view', async () => {
    expect(await tools.failure('open_app', { view: 'nowhere' })).toMatch(
      /^The project has no view "nowhere"\./,
    );
    expect(await tools.failure('open_app', { select: ['api'] })).toBe(
      'A view state names its view: give view too.',
    );
    expect(tools.opened).toEqual([]);
  });
});
