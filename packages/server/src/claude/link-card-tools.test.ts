/**
 * Claude's link card tool (ADR 0098, stage 3), the whole way from an MCP client through the bridge to
 * the program: add_link_card places a card as one undoable action of Claude's and fetches nothing;
 * read_view lists cards under links; update_free_shape and delete_free_shapes take them.
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
  await mkdir(join(tools.session.folder, 'photos'), { recursive: true });
  await writeFile(join(tools.session.folder, 'photos', 'guide.png'), PNG);
}, 30_000);

afterEach(async () => {
  await tools.close();
});

const cards = () =>
  tools.session.snapshot.views[0]?.freeShapes.filter((shape) => shape.kind === 'link') ?? [];

describe('add_link_card', () => {
  it('places a card as one undoable action of Claude’s, fetching nothing', async () => {
    const answer = await tools.value('add_link_card', {
      view: 'overview',
      url: 'https://www.example.org/intake',
      title: 'The intake guide',
      description: 'How a patient is received.',
      x: 600,
      y: 40,
    });
    expect(answer).toMatchObject({
      url: 'https://www.example.org/intake',
      host: 'example.org',
      placed: { x: 600, y: 40, width: 320, height: 112 },
    });
    expect(String(answer.preview)).toMatch(/fetches nothing for Claude/);
    expect(tools.session.history.undo).toMatchObject({ author: 'claude' });

    const view = await tools.value('read_view', { view: 'overview' });
    expect(view.links).toEqual([
      {
        id: answer.shape,
        url: 'https://www.example.org/intake',
        host: 'example.org',
        title: 'The intake guide',
        description: 'How a patient is received.',
        x: 600,
        y: 40,
        width: 320,
        height: 112,
      },
    ]);

    await tools.value('update_free_shape', {
      view: 'overview',
      shape: { id: answer.shape, title: 'Intake', description: null },
    });
    expect(cards()[0]).toMatchObject({ title: 'Intake' });
    expect(cards()[0]).not.toHaveProperty('description');

    await tools.value('delete_free_shapes', { view: 'overview', ids: [answer.shape] });
    expect(cards()).toEqual([]);
  });

  it('keeps a picture from the project folder, and grows the card to show it', async () => {
    const answer = await tools.value('add_link_card', {
      view: 'overview',
      url: 'https://example.org/',
      title: 'Guide',
      picture: 'photos/guide.png',
    });
    const file = String(answer.picture);
    expect(file).toMatch(/^media\/[0-9a-f]{64}\.png$/);
    expect((await stat(join(tools.session.folder, file))).isFile()).toBe(true);
    // A 1 × 1 picture at the card's 320 units is 320 tall, at most 240 more.
    expect(answer.placed).toMatchObject({ width: 320, height: 352 });
  });

  it.each([
    ['an address of javascript:', { url: 'javascript:alert(1)' }, /not an http or https address/],
    ['an address of file:', { url: 'file:///etc/passwd' }, /not an http or https address/],
    ['a picture at an address', { picture: 'https://example.org/a.png' }, /never fetches/],
    ['a picture outside the folder', { picture: '../a.png' }, /outside the project folder/],
  ])('refuses %s, and changes nothing', async (_, change, says) => {
    expect(
      await tools.failure('add_link_card', {
        view: 'overview',
        url: 'https://example.org/',
        title: 'Guide',
        ...change,
      }),
    ).toMatch(says);
    expect(cards()).toEqual([]);
  });
});
