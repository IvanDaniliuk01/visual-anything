/**
 * Claude's picture tools (ADR 0098), the whole way from an MCP client through the bridge to the
 * program: add_picture keeps an image file inside the project folder as a media file and places it
 * as one undoable action of Claude's; read_view lists pictures; update_free_shape names one and
 * delete_free_shapes deletes it, keeping its file. A path outside the folder is refused.
 */
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { decodeBase64 } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startToolHarness, type ToolHarness } from './tool-harness';

/** A 1 × 1 PNG. */
const PNG = decodeBase64(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
) as Uint8Array;

let tools: ToolHarness;

beforeEach(async () => {
  tools = await startToolHarness();
  const folder = tools.session.folder;
  await mkdir(join(folder, 'photos'), { recursive: true });
  await writeFile(join(folder, 'photos', 'desk.png'), PNG);
  await writeFile(join(folder, 'photos', 'notes.txt'), 'not a picture');
}, 30_000);

afterEach(async () => {
  await tools.close();
});

describe('add_picture', () => {
  it('keeps the file in media/ and places it as one undoable action of Claude’s', async () => {
    const answer = await tools.value('add_picture', {
      view: 'overview',
      path: 'photos/desk.png',
      name: 'The front desk',
    });
    expect(answer).toMatchObject({ format: 'png', ownSize: { width: 1, height: 1 } });
    // Its own size, scaled up so that neither side is under 32.
    expect(answer.placed).toMatchObject({ width: 32, height: 32 });
    const file = String(answer.file);
    expect(file).toMatch(/^media\/[0-9a-f]{64}\.png$/);
    expect((await stat(join(tools.session.folder, file))).isFile()).toBe(true);
    expect(tools.session.history.undo).toMatchObject({ author: 'claude' });

    const view = await tools.value('read_view', { view: 'overview' });
    expect(view.pictures).toEqual([
      expect.objectContaining({ id: answer.shape, name: 'The front desk', file, format: 'png' }),
    ]);

    await tools.value('update_free_shape', {
      view: 'overview',
      shape: { id: answer.shape, name: null, width: 64, height: 64 },
    });
    const renamed = tools.session.snapshot.views[0]?.freeShapes.find(
      (shape) => shape.id === answer.shape,
    );
    expect(renamed).toMatchObject({ kind: 'picture', width: 64 });
    expect(renamed && 'name' in renamed).toBe(false);

    await tools.value('delete_free_shapes', { view: 'overview', ids: [answer.shape] });
    expect((await stat(join(tools.session.folder, file))).isFile()).toBe(true);
  });

  it.each([
    ['a path outside the folder', '../outside.png', /outside the project folder/],
    ['an address', 'https://example.com/a.png', /never fetches anything/],
    ['a file that is not an image', 'photos/notes.txt', /not an image file/],
  ])('refuses %s, and changes nothing', async (_, path, says) => {
    expect(await tools.failure('add_picture', { view: 'overview', path })).toMatch(says);
    expect(
      tools.session.snapshot.views[0]?.freeShapes.some((shape) => shape.kind === 'picture'),
    ).toBe(false);
    await expect(stat(join(tools.session.folder, 'media'))).rejects.toThrow();
  });

  it('refuses a picture whose file is not a picture, saying why', async () => {
    await writeFile(join(tools.session.folder, 'photos', 'fake.png'), 'plain text');
    expect(
      await tools.failure('add_picture', { view: 'overview', path: 'photos/fake.png' }),
    ).toMatch(/invalid-image/);
  });
});
