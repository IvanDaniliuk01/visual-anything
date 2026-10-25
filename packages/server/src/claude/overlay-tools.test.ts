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

const byOwner = {
  name: 'Team',
  of: 'elements',
  attribute: 'owner',
  channel: 'fill',
  mapping: {
    kind: 'discrete',
    cases: [
      { value: 'Team A', color: '#ffff00', label: 'A' },
      { value: 'Team B', color: '#FFFF33' },
    ],
    otherwise: '#6B7280',
  },
};

describe('set_overlays and get_overlays', () => {
  it('sets a view’s overlays as one undoable action, kept in its file, and reads them back', async () => {
    const result = await tools.value('set_overlays', { view: 'overview', overlays: [byOwner] });
    expect(result.done).toBe('Set the overlays of "Overview"');
    expect(result.undo).toBeDefined();
    // The legend warns about the colors hard to tell apart, in either theme.
    expect(result.legendWarnings).toContain(
      '"A" and "Team B" of "Team" are 1.0:1 apart, under 3:1.',
    );
    const file = JSON.parse(
      await readFile(join(tools.session.folder, 'views', 'overview.vaview'), 'utf8'),
    ) as { overlays?: { id: string; mapping: { cases: { color: string }[] } }[] };
    // An id made from the attribute and the channel, and colors in capitals.
    expect(file.overlays?.[0]?.id).toMatch(/^owner-fill-[0-9a-z]{6}$/);
    expect(file.overlays?.[0]?.mapping.cases[0]?.color).toBe('#FFFF00');
    const read = await tools.value('get_overlays', { view: 'overview' });
    expect(read.overlays).toHaveLength(1);
    expect(read.legend).toEqual([
      expect.objectContaining({
        title: 'Team',
        channel: 'fill',
        entries: [
          { kind: 'case', label: 'A', color: '#FFFF00' },
          { kind: 'case', label: 'Team B', color: '#FFFF33' },
          { kind: 'otherwise', color: '#6B7280' },
        ],
      }),
    ]);
  });

  it('says plainly what it refuses, and changes nothing then', async () => {
    const message = await tools.failure('set_overlays', {
      view: 'overview',
      overlays: [{ ...byOwner, of: 'relations' }],
    });
    expect(message).toMatch(/A relation has no fill/);
    expect(message).toMatch(/invalid-overlay/);
    expect(await tools.failure('get_overlays', { view: 'nowhere' })).toBe(
      'There is no view "nowhere".',
    );
    expect(tools.session.snapshot.views[0]?.overlays).toBeUndefined();
  });

  it('takes them all away with an empty list', async () => {
    await tools.value('set_overlays', { view: 'overview', overlays: [byOwner] });
    const result = await tools.value('set_overlays', { view: 'overview', overlays: [] });
    expect(result.done).toBe('Remove the overlays of "Overview"');
    expect(tools.session.snapshot.views[0]?.overlays).toBeUndefined();
  });
});

describe('set_levels', () => {
  it('gives a built-in component levels of detail and a scale to expand from, in the project file', async () => {
    const result = await tools.value('set_levels', {
      component: 'systems.service',
      levels: [
        { from: 0.9, shows: ['name', 'detail'] },
        { from: 0.3, shows: ['name'] },
      ],
      expandFrom: 2,
    });
    expect(result.done).toBe('Change the appearance of the component "Service"');
    const project = JSON.parse(
      await readFile(join(tools.session.folder, 'project.vaproject'), 'utf8'),
    ) as { appearances?: { components?: Record<string, unknown> } };
    expect(project.appearances?.components?.['systems.service']).toEqual({
      levels: [
        { from: 0.3, shows: ['name'] },
        { from: 0.9, shows: ['name', 'detail'] },
      ],
      expandFrom: 2,
    });
    // Taken away again, inherited once more.
    await tools.value('set_levels', {
      component: 'systems.service',
      levels: null,
      expandFrom: null,
    });
    expect(tools.session.snapshot.project.appearances).toBeUndefined();
  });

  it('refuses levels that are not as levels are written, and a call that sets nothing', async () => {
    const message = await tools.failure('set_levels', {
      component: 'systems.service',
      levels: [{ from: 1, shows: ['silhouette', 'name'] }],
    });
    expect(message).toMatch(/shows a silhouette only/);
    expect(await tools.failure('set_levels', { component: 'systems.service' })).toBe(
      'Give levels, expandFrom or both.',
    );
  });
});
