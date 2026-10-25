import { readViewState } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startToolHarness, type ToolHarness } from './tool-harness';

let tools: ToolHarness;

beforeEach(async () => {
  tools = await startToolHarness();
});

afterEach(async () => {
  await tools.close();
});

describe('link_to', () => {
  it('answers the view address of a view state, as the app writes it, changing nothing', async () => {
    const before = tools.session.snapshot;
    const result = await tools.value('link_to', { view: 'overview', select: ['api', 'note'] });
    expect(result).toMatchObject({
      address: '#view=overview&select=api,note',
      viewState: { view: 'overview', select: ['api', 'note'] },
    });
    expect(result.note).toMatch(/visual-anything open/);
    expect(tools.session.snapshot).toBe(before);
  });

  it('holds the camera, the filters, focus and the step, which the app reads back', async () => {
    const result = await tools.value('link_to', {
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
    const read = readViewState(String(result.address));
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

  it('refuses what the project does not hold, saying what', async () => {
    expect(await tools.failure('link_to', { view: 'nowhere' })).toMatch(
      /^The project has no view "nowhere"\./,
    );
    expect(await tools.failure('link_to', { view: 'overview', select: ['ghost'] })).toMatch(
      /Nothing in the view "Overview" has the id "ghost"\./,
    );
    expect(await tools.failure('link_to', { view: 'overview', scenario: 'request', step: 9 })).toBe(
      'The scenario "A request" has no step 9: it has 2.',
    );
    expect(await tools.failure('link_to', { view: 'overview', step: 'read' })).toBe(
      'A step needs its scenario: give scenario too.',
    );
  });
});
