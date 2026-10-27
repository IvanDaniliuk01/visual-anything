/**
 * Claude's `align_shapes` (ADR 0074): it aligns, distributes and sizes alike the shapes of elements in
 * a view as the canvas's Align does, as one undoable action of Claude's, and says plainly why it
 * changes nothing.
 */
import { buildSceneAfresh } from '@visual-anything/app/src/canvas/scene';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ALIGN_TOOLS } from './align-tools';
import { startToolHarness, type ToolHarness } from './tool-harness';

let tools: ToolHarness;

// The canvas's maths, which the tool loads on its first call, loaded once, before the tests time it.
beforeAll(async () => {
  await import('@visual-anything/app/src/canvas/alignActions');
}, 120_000);

beforeEach(async () => {
  tools = await startToolHarness();
});

afterEach(async () => {
  await tools.close();
});

const positionOf = (element: string) =>
  tools.session.snapshot.views
    .find((view) => view.id === 'overview')
    ?.positions.find((position) => position.element === element);

describe('align_shapes', () => {
  it('aligns shapes in different containers on the canvas, as one action of Claude’s', async () => {
    // The customer sits in World at x −250; the API inside the shop system, which starts at 0.
    expect(
      await tools.value('align_shapes', {
        view: 'overview',
        elements: ['customer', 'api'],
        how: 'left',
      }),
    ).toMatchObject({ done: 'Align 2 shapes to the left' });
    expect(positionOf('api')).toMatchObject({ container: 'system', x: -250, pinned: true });
    expect(positionOf('customer')).toMatchObject({ x: -250 });
    expect(tools.session.history.undo).toEqual({
      label: 'Align 2 shapes to the left',
      author: 'claude',
    });
  });

  it('gives shapes the same width, and distributes three or more', async () => {
    await tools.value('align_shapes', {
      view: 'overview',
      elements: ['customer', 'db'],
      how: 'same-width',
    });
    const scene = buildSceneAfresh(tools.session.snapshot, 'overview');
    const width = (key: string) => scene.shapes.find((shape) => shape.key === key)?.rect.width;
    expect(width('customer')).toBe(width('system/db'));
    // What sits inside a shape that takes part goes with it, as in a drag: one shape is too few.
    expect(
      await tools.failure('align_shapes', {
        view: 'overview',
        elements: ['api', 'system'],
        how: 'same-width',
      }),
    ).toBe('Select two or more shapes whose size can change.');
    expect(
      await tools.failure('align_shapes', {
        view: 'overview',
        elements: ['api', 'db'],
        how: 'distribute-vertically',
      }),
    ).toBe('Select three or more shapes to distribute them.');
  });

  it('changes nothing when they are aligned already, and says so', async () => {
    // Both tops are at 40 on the canvas.
    const before = tools.session.snapshot;
    expect(
      await tools.value('align_shapes', {
        view: 'overview',
        elements: ['customer', 'api'],
        how: 'top',
      }),
    ).toEqual({
      done: 'Nothing changed, so nothing was recorded.',
      note: 'They are aligned already.',
    });
    expect(tools.session.snapshot).toBe(before);
  });

  it('refuses what is not there, and too few shapes', async () => {
    expect(
      await tools.failure('align_shapes', { view: 'nowhere', elements: ['api'], how: 'left' }),
    ).toMatch(/no view "nowhere"/);
    expect(
      await tools.failure('align_shapes', {
        view: 'overview',
        elements: ['api', 'nothing'],
        how: 'left',
      }),
    ).toMatch(/no elements "nothing"/);
    expect(
      await tools.failure('align_shapes', { view: 'overview', elements: ['api'], how: 'left' }),
    ).toBe('Select two or more shapes to align them.');
  });

  it('describes every way with examples', () => {
    const [tool] = ALIGN_TOOLS;
    expect(tool?.description).toContain('Example:');
    for (const how of ['centers', 'middles', 'distribute-horizontally', 'same-height']) {
      expect(tool?.description).toContain(how);
    }
  });
});
