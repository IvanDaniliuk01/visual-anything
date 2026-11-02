/**
 * Claude's tools for drawing defaults (A5.4, ADR 0086), the whole way from an MCP client through the
 * bridge to the program: `get_drawing` reads the values resolved for the project or a view, with what
 * each sets, and `set_drawing` writes what the project or a view sets, whole, as one action of
 * Claude's, kept in its file.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DRAWING_PRESETS } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TOOLS } from './tools';
import { startToolHarness, type ToolHarness } from './tool-harness';

let tools: ToolHarness;

beforeEach(async () => {
  tools = await startToolHarness();
}, 30_000);

afterEach(async () => {
  await tools.close();
});

describe('get_drawing', () => {
  it('reads Clean as built in while nothing is set, with what each value may be', async () => {
    const read = await tools.value('get_drawing');
    expect(read).toMatchObject({
      resolved: { preset: 'clean', lines: { width: DRAWING_PRESETS.clean.lines.width } },
      project: {},
      presets: ['clean', 'dense', 'expressive', 'high-contrast'],
      allowed: {
        lines: { width: '0.5 to 8', arrowhead: 'filled, open or none' },
        text: { nameWeight: '400, 500 or 700' },
        grid: { look: 'lines or dots' },
      },
    });
    expect((read.resolved as { lines: Record<string, unknown> }).lines.arrow).toBeUndefined();
    expect(read.view).toBeUndefined();
  });

  it('refuses a view there is not', async () => {
    expect(await tools.failure('get_drawing', { view: 'nowhere' })).toBe(
      'There is no view "nowhere".',
    );
  });
});

describe('set_drawing', () => {
  it('sets the project’s drawing defaults as one action of Claude’s, kept in its file', async () => {
    const result = await tools.value('set_drawing', {
      drawing: { preset: 'dense', lines: { width: 1.5 } },
    });
    expect(result).toMatchObject({
      done: 'Set the drawing defaults of the project',
      undo: 'The person can undo it in the app.',
      project: { preset: 'dense', lines: { width: 1.5 } },
      resolved: {
        preset: 'dense',
        lines: { width: 1.5 },
        text: { nameSize: DRAWING_PRESETS.dense.text.nameSize },
      },
      check: 'Call capture_view on a view to see it drawn.',
    });
    expect(tools.session.actions).toMatchObject([
      { label: 'Set the drawing defaults of the project', author: 'claude' },
    ]);
    const file = JSON.parse(
      await readFile(join(tools.session.folder, 'project.vaproject'), 'utf8'),
    ) as { drawing?: unknown };
    expect(file.drawing).toEqual({ preset: 'dense', lines: { width: 1.5 } });
  });

  it('sets a view’s own, which get_drawing resolves over the project’s', async () => {
    await tools.value('set_drawing', { drawing: { lines: { width: 3 } } });
    const result = await tools.value('set_drawing', {
      view: 'overview',
      drawing: { grid: { look: 'lines' }, text: { nameSize: 18 } },
    });
    expect(result).toMatchObject({
      done: 'Set the drawing defaults of "Overview"',
      view: { id: 'overview', sets: { grid: { look: 'lines' }, text: { nameSize: 18 } } },
    });
    const read = await tools.value('get_drawing', { view: 'overview' });
    expect(read).toMatchObject({
      resolved: { lines: { width: 3 }, text: { nameSize: 18 }, grid: { look: 'lines' } },
      project: { lines: { width: 3 } },
      view: { id: 'overview', name: 'Overview' },
    });
    const file = JSON.parse(
      await readFile(join(tools.session.folder, 'views', 'overview.vaview'), 'utf8'),
    ) as { drawing?: unknown };
    expect(file.drawing).toEqual({ text: { nameSize: 18 }, grid: { look: 'lines' } });
    // A preset of the view's own leaves the project's values out, and says so.
    const own = await tools.value('set_drawing', {
      view: 'overview',
      drawing: { preset: 'expressive' },
    });
    expect(own).toMatchObject({
      resolved: { preset: 'expressive', lines: { width: DRAWING_PRESETS.expressive.lines.width } },
      note: '"Overview" names a preset of its own, so the project\'s values do not reach it.',
    });
  });

  it('goes back to the layer under it with null', async () => {
    await tools.value('set_drawing', { view: 'overview', drawing: { grid: { look: 'lines' } } });
    const result = await tools.value('set_drawing', { view: 'overview', drawing: null });
    expect(result.done).toBe('Reset the drawing defaults of "Overview"');
    expect(tools.session.snapshot.views.find((each) => each.id === 'overview')?.drawing).toBe(
      undefined,
    );
  });

  it('says plainly what it refuses, and changes nothing then', async () => {
    const wide = await tools.failure('set_drawing', { drawing: { lines: { width: 20 } } });
    expect(wide).toMatch(/lines\.width is a number from 0\.5 to 8\./);
    expect(wide).toMatch(/invalid-drawing/);
    expect(await tools.failure('set_drawing', { drawing: { lines: { lineWidth: 2 } } })).toMatch(
      /The drawing group "lines" has no value "lineWidth"/,
    );
    expect(await tools.failure('set_drawing', { drawing: { preset: 'loud' } })).toMatch(
      /There is no drawing preset "loud"/,
    );
    expect(
      await tools.failure('set_drawing', { view: 'nowhere', drawing: { grid: { look: 'dots' } } }),
    ).toMatch(/nowhere/);
    expect(tools.session.actions).toEqual([]);
    expect(tools.session.snapshot.project.drawing).toBeUndefined();
  });

  it('explains the presets and groups, points at capture_view, and gives examples', () => {
    const description = TOOLS.find((each) => each.name === 'set_drawing')?.description ?? '';
    for (const words of [
      'clean, the default',
      'dense',
      'expressive',
      'high-contrast',
      '- lines: width (0.5 to 8)',
      '- reading:',
      'capture_view',
      'Example:',
    ]) {
      expect(description).toContain(words);
    }
  });
});
