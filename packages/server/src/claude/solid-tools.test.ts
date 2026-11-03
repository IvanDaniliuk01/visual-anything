/**
 * Claude's solid tools (ADR 0075), the whole way from an MCP client through the bridge to the
 * program, which reads a file inside its project folder and cleans it in its worker: importing a
 * solid as one undoable action of Claude's, listing solids and their parts, changing, replacing and
 * removing one, showing it and anchoring a drawing's contents to its parts, and turning it in the
 * open app. Every path outside the project folder is refused, and nothing changes.
 */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { solidsIn } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { box, inputGlb } from '../solids/test/gltf';
import { startToolHarness, type ToolHarness } from './tool-harness';

/** A shop drawn in three dimensions: its API, its database and a cache, each a named node. */
const SHOP = inputGlb({
  nodes: [
    { name: 'frame', children: [1, 2, 3], mesh: 0 },
    { name: 'api', translation: [0, 1, 0], mesh: 0 },
    { name: 'db', translation: [1, 0, 0], mesh: 0 },
    { name: 'cache', translation: [0, 0, 1], mesh: 0 },
  ],
  meshes: [box([0, 0, 0], [0.5, 0.5, 0.5])],
});

/** The same shop without its cache and its database. */
const SMALLER = inputGlb({
  nodes: [
    { name: 'frame', children: [1], mesh: 0 },
    { name: 'api', translation: [0, 1, 0], mesh: 0 },
  ],
  meshes: [box([0, 0, 0], [0.5, 0.5, 0.5])],
});

let tools: ToolHarness;

beforeEach(async () => {
  tools = await startToolHarness();
  const folder = tools.session.folder;
  await mkdir(join(folder, 'models'), { recursive: true });
  await writeFile(join(folder, 'models', 'shop.glb'), SHOP);
  await writeFile(join(folder, 'models', 'smaller.glb'), SMALLER);
  await writeFile(join(folder, 'models', 'broken.glb'), Buffer.from('not a glTF file at all'));
  await writeFile(join(folder, '..', 'outside.glb'), SHOP);
}, 30_000);

afterEach(async () => {
  await rm(join(tools.session.folder, '..', 'outside.glb'), { force: true });
  await tools.close();
});

const solids = () => [...solidsIn(tools.session.snapshot).solids.values()];

/** Imports the shop and answers its solid's id. */
async function imported(more: Record<string, unknown> = {}): Promise<string> {
  const answer = await tools.value('import_solid', { path: 'models/shop.glb', ...more });
  return answer.solid as string;
}

/** The shop system drawn with the shop's solid and its parts, holding the API and the DB. */
async function drawnWithParts(solid: string): Promise<void> {
  await tools.value('set_appearance', {
    element: 'system',
    appearanceTraits: { solid: { solid, placement: 'parts' } },
  });
}

describe('import_solid', () => {
  it('imports a glTF file inside the project folder as one undoable action of Claude’s', async () => {
    const answer = await tools.value('import_solid', {
      path: 'models/shop.glb',
      description: 'A shop of three boxes on a frame.',
      license: 'CC0-1.0',
      source: 'Drawn for a test',
    });
    expect(answer).toMatchObject({
      done: 'Import "shop.glb" as a solid',
      undo: 'The person can undo it in the app.',
      package: 'shop',
      parts: 4,
      partNames: ['frame', 'api', 'db', 'cache'],
      // One box, drawn by four nodes.
      counts: { triangles: 12, vertices: 8, nodes: 4 },
      size: { x: 1.5, y: 1.5, z: 1.5, unit: 'm' },
    });
    expect(answer.solid).toMatch(/^shop\.shop-/);
    expect(answer.cleaning).toEqual(expect.any(Array));
    expect(tools.session.history.undo).toEqual({
      label: 'Import "shop.glb" as a solid',
      author: 'claude',
    });
    const [solid] = solids();
    expect(solid?.definition).toMatchObject({
      name: 'shop',
      description: 'A shop of three boxes on a frame.',
      license: 'CC0-1.0',
      source: 'Drawn for a test',
      camera: { azimuth: 30, elevation: 20 },
    });
    // The cleaned file is in solids/, named by its hash.
    const files = await readdir(join(tools.session.folder, 'solids'));
    expect(files).toEqual([`${solid?.definition.hash}.glb`]);
    expect(answer.file).toBe(`solids/${solid?.definition.hash}.glb`);
  });

  it('scales the file to meters and turns Z up to Y, as units and up say', async () => {
    const answer = await tools.value('import_solid', {
      path: 'models/shop.glb',
      units: 'cm',
      up: 'z',
      name: 'Shop in centimetres',
    });
    expect(answer.size).toEqual({ x: 0.015, y: 0.015, z: 0.015, unit: 'm' });
    expect(answer.cleaning).toEqual(
      expect.arrayContaining([expect.stringMatching(/centimet/), expect.stringMatching(/Z/)]),
    );
    expect(solids()[0]?.definition.name).toBe('Shop in centimetres');
  });

  it('says a solid lacks a description, its text alternative', async () => {
    const answer = await tools.value('import_solid', { path: 'models/shop.glb' });
    expect(answer.description).toBe(
      'It has none: give it one with update_solid, since it is the solid’s text alternative.',
    );
  });

  it.each([
    ['a path out of the folder', '../outside.glb', 'lies outside the project folder'],
    [
      'a path deep out of the folder',
      'models/../../outside.glb',
      'lies outside the project folder',
    ],
    ['an absolute path', '/etc/shop.glb', 'is not a path from the project folder'],
    ['a drive', 'C:/shop.glb', 'is not a path from the project folder'],
    ['a network share', '\\\\server\\share\\shop.glb', 'is not a path from the project folder'],
    ['a web address', 'https://example.com/shop.glb', 'never fetches anything'],
    ['a file address', 'file:///C:/shop.glb', 'never fetches anything'],
    ['a file that is not glTF', 'project.vaproject', 'is not a glTF file'],
    ['a file that is not there', 'models/none.glb', 'The project folder has no file'],
  ])('refuses %s, and changes nothing', async (_case, path, says) => {
    const message = await tools.failure('import_solid', { path });
    expect(message).toContain(says);
    expect(solids()).toEqual([]);
    expect(tools.session.history).toEqual({});
  });

  it('refuses the absolute path of a file inside the folder: it reads only paths from the folder', async () => {
    const message = await tools.failure('import_solid', {
      path: join(tools.session.folder, 'models', 'shop.glb'),
    });
    expect(message).toContain('is not a path from the project folder');
    expect(solids()).toEqual([]);
  });

  it('refuses a file the cleaner cannot read, saying why', async () => {
    const message = await tools.failure('import_solid', { path: 'models/broken.glb' });
    expect(message).toMatch(/^Not imported: .*\(invalid-solid\)/);
    expect(tools.session.history).toEqual({});
  });

  it('refuses a built-in package, and one the project does not use, before reading', async () => {
    expect(
      await tools.failure('import_solid', { path: 'models/shop.glb', package: 'systems' }),
    ).toContain('is a built-in package');
    expect(
      await tools.failure('import_solid', { path: 'models/shop.glb', package: 'nowhere' }),
    ).toContain('The project uses no package "nowhere"');
    expect(solids()).toEqual([]);
  });

  it('refuses a license that is no SPDX identifier, as the core does', async () => {
    expect(
      await tools.failure('import_solid', { path: 'models/shop.glb', license: 'my own terms' }),
    ).toContain('Refused, so nothing changed');
    expect(solids()).toEqual([]);
  });
});

describe('list_solids and list_solid_parts', () => {
  it('list the solids, then a solid’s parts with their parents and points, changing nothing', async () => {
    const solid = await imported({ description: 'A shop.' });
    const before = tools.session.snapshot;
    const listed = await tools.value('list_solids');
    expect(listed).toMatchObject({
      total: 1,
      solids: [
        {
          id: solid,
          name: 'shop',
          package: 'shop',
          builtIn: false,
          description: 'A shop.',
          parts: 4,
          animations: [],
          shownBy: [],
        },
      ],
    });
    expect(await tools.value('list_solids', { package: 'systems' })).toEqual({
      total: 0,
      solids: [],
    });

    const parts = await tools.value('list_solid_parts', { solid });
    expect(parts).toMatchObject({
      solid: { id: solid, name: 'shop', description: 'A shop.' },
      total: 4,
    });
    expect(
      (
        parts.parts as {
          name: string;
          index: number;
          parent?: string;
          point?: unknown;
          origin?: unknown;
        }[]
      ).map(({ name, index, parent, point, origin }) => [
        name,
        index,
        parent,
        point !== undefined,
        origin !== undefined,
      ]),
    ).toEqual([
      ['frame', 0, undefined, true, true],
      ['api', 1, 'frame', true, true],
      ['db', 2, 'frame', true, true],
      ['cache', 3, 'frame', true, true],
    ]);
    expect(tools.session.snapshot).toBe(before);
  });

  it('pages a solid’s parts', async () => {
    const solid = await imported();
    const first = await tools.value('list_solid_parts', { solid, limit: 3 });
    expect((first.parts as unknown[]).length).toBe(3);
    expect(first).toMatchObject({ more: 1, next: 'Call again with offset 3.' });
    const rest = await tools.value('list_solid_parts', { solid, offset: 3 });
    expect(rest.parts).toEqual([expect.objectContaining({ name: 'cache', index: 3 })]);
  });

  it('say which elements are drawn as each part, and in which views', async () => {
    const solid = await imported();
    await drawnWithParts(solid);
    await tools.value('anchor_parts', { drawing: 'system', by: 'name', view: 'overview' });
    const parts = await tools.value('list_solid_parts', { drawing: 'system', view: 'overview' });
    const drawnAs = Object.fromEntries(
      (parts.parts as { name: string; drawnAs: unknown[] }[]).map((each) => [
        each.name,
        each.drawnAs,
      ]),
    );
    expect(drawnAs).toEqual({
      frame: [],
      api: [{ element: 'api', name: 'API', views: [{ view: 'overview', drawing: 'system' }] }],
      db: [{ element: 'db', name: 'DB', views: [{ view: 'overview', drawing: 'system' }] }],
      cache: [],
    });
    expect(await tools.value('list_solids')).toMatchObject({
      solids: [
        {
          shownBy: [
            { kind: 'element', id: 'system', name: 'Shop system' },
            { kind: 'element', id: 'api', name: 'API' },
            { kind: 'element', id: 'db', name: 'DB' },
          ],
        },
      ],
    });
  });

  it('refuse a solid no package defines, a drawing that shows none, and an unknown view', async () => {
    const solid = await imported();
    expect(await tools.failure('list_solid_parts', { solid: 'shop.none' })).toBe(
      'No package in use defines the solid "shop.none". list_solids lists them.',
    );
    expect(await tools.failure('list_solid_parts', { drawing: 'api' })).toContain(
      'does not show a solid with its parts',
    );
    expect(await tools.failure('list_solid_parts', { solid, view: 'nowhere' })).toBe(
      'There is no view "nowhere".',
    );
    expect(await tools.failure('list_solid_parts', {})).toBe(
      'Give solid, a solid’s id, or drawing, an element’s.',
    );
    await drawnWithParts(solid);
    expect(await tools.failure('list_image_parts', { drawing: 'system' })).toContain(
      'list_solid_parts lists',
    );
  });
});

describe('update_solid', () => {
  it('changes a solid’s name, description, license and camera, and takes a source away', async () => {
    const solid = await imported({ source: 'Somebody' });
    const answer = await tools.value('update_solid', {
      id: solid,
      name: 'Shop',
      description: 'A shop of three boxes on a frame.',
      license: 'CC-BY-4.0',
      source: null,
      camera: { azimuth: -45, elevation: 15, zoom: 1.5 },
    });
    expect(answer).toMatchObject({
      done: 'Change the solid "Shop"',
      solid: {
        id: solid,
        name: 'Shop',
        description: 'A shop of three boxes on a frame.',
        license: 'CC-BY-4.0',
        camera: { azimuth: -45, elevation: 15, zoom: 1.5 },
      },
    });
    expect((answer.solid as Record<string, unknown>).source).toBeUndefined();
    expect(tools.session.history.undo).toEqual({
      label: 'Change the solid "Shop"',
      author: 'claude',
    });
  });

  it('refuses nothing to change, a solid no package defines, and a camera out of range', async () => {
    const solid = await imported();
    expect(await tools.failure('update_solid', { id: solid })).toBe(
      'Give something to change: name, description, source, license or camera.',
    );
    expect(await tools.failure('update_solid', { id: 'shop.none', name: 'x' })).toContain(
      'No package in use defines the solid "shop.none"',
    );
    expect(
      await tools.failure('update_solid', { id: solid, camera: { azimuth: 0, elevation: 90 } }),
    ).toBeTruthy();
  });
});

describe('replace_solid', () => {
  it('says which anchored parts the new file lacks before replacing, then replaces with confirm', async () => {
    const solid = await imported();
    await drawnWithParts(solid);
    await tools.value('anchor_parts', { drawing: 'system', by: 'name', view: 'overview' });
    const before = tools.session.snapshot;
    const refused = await tools.failure('replace_solid', { id: solid, path: 'models/smaller.glb' });
    expect(refused).toBe(
      'Not replaced: the new file lacks 1 part that elements are drawn as: "db" ("DB"). Those elements would warn unknown-part and be drawn as ordinary shapes, keeping their anchors. Tell the person, then call again with confirm true.',
    );
    expect(tools.session.snapshot).toBe(before);

    const answer = await tools.value('replace_solid', {
      id: solid,
      path: 'models/smaller.glb',
      confirm: true,
    });
    expect(answer).toMatchObject({
      done: `Replace the solid "shop" with "smaller.glb"`,
      solid,
      parts: 2,
      partsLost: [{ part: 'db', elements: [{ id: 'db', name: 'DB' }] }],
    });
    expect(answer.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining('"db" of the solid "shop"')]),
    );
    const now = solidsIn(tools.session.snapshot).solid(solid)?.definition;
    expect(now?.parts.map((part) => part.name)).toEqual(['frame', 'api']);
    expect(tools.session.history.undo?.author).toBe('claude');
    // Both files stay in solids/.
    expect(await readdir(join(tools.session.folder, 'solids'))).toHaveLength(2);
  });

  it('replaces at once when no anchored part is lost, and changes nothing for the same file', async () => {
    const solid = await imported();
    expect(
      await tools.value('replace_solid', { id: solid, path: 'models/shop.glb' }),
    ).toMatchObject({ done: 'Nothing changed, so nothing was recorded.' });
    const answer = await tools.value('replace_solid', { id: solid, path: 'models/smaller.glb' });
    expect(answer).toMatchObject({ done: 'Replace the solid "shop" with "smaller.glb"' });
    expect(answer.partsLost).toBeUndefined();
  });

  it('refuses a path outside the project folder, and a solid no package defines', async () => {
    const solid = await imported();
    expect(await tools.failure('replace_solid', { id: solid, path: '../outside.glb' })).toContain(
      'lies outside the project folder',
    );
    expect(
      await tools.failure('replace_solid', { id: 'shop.none', path: 'models/smaller.glb' }),
    ).toContain('No package in use defines the solid "shop.none"');
  });
});

describe('remove_solid', () => {
  it('is refused while something shows the solid, then removes it and keeps its file', async () => {
    const solid = await imported();
    await tools.value('set_appearance', {
      element: 'api',
      appearanceTraits: { solid: { solid, placement: 'drawing' } },
    });
    expect(await tools.failure('remove_solid', { id: solid })).toContain(
      'element "api" (API). Make them show no solid first',
    );
    await tools.value('set_appearance', { element: 'api', appearanceTraits: { solid: null } });
    const answer = await tools.value('remove_solid', { id: solid });
    expect(answer).toMatchObject({ done: 'Remove the solid "shop"' });
    expect(solids()).toEqual([]);
    expect(await readdir(join(tools.session.folder, 'solids'))).toHaveLength(1);
    expect(await tools.failure('remove_solid', { id: solid })).toContain(
      'No package in use defines the solid',
    );
  });
});

describe('set_appearance with solids', () => {
  it('shows a solid on an element, and draws an element as a part of a solid', async () => {
    const solid = await imported();
    await tools.value('set_appearance', {
      element: 'api',
      appearanceTraits: {
        solid: { solid, placement: 'icon', lighting: 'flat', camera: { azimuth: 0, elevation: 0 } },
      },
    });
    const api = () => tools.session.snapshot.model.elements.find((each) => each.id === 'api');
    expect(api()?.appearance?.solid).toEqual({
      solid,
      placement: 'icon',
      lighting: 'flat',
      camera: { azimuth: 0, elevation: 0 },
    });
    await tools.value('set_appearance', {
      element: 'db',
      appearanceTraits: { part: { part: 'db', solid } },
    });
    expect(
      tools.session.snapshot.model.elements.find((each) => each.id === 'db')?.appearance?.part,
    ).toEqual({ part: 'db', solid });
  });

  it('warns about a part the solid lacks, and refuses a part of both an image and a solid', async () => {
    const solid = await imported();
    const answer = await tools.value('set_appearance', {
      element: 'db',
      appearanceTraits: { part: { part: 'tail', solid } },
    });
    expect(answer.warnings).toEqual([expect.stringContaining('has no such part')]);
    expect(
      await tools.failure('set_appearance', {
        element: 'db',
        appearanceTraits: { part: { part: 'db', solid, image: 'shop.picture' } },
      }),
    ).toContain('invalid-appearance');
  });
});

describe('anchor_parts on a solid', () => {
  it('anchors a drawing’s contents to its solid’s parts by name, naming the solid, in one action', async () => {
    const solid = await imported();
    await drawnWithParts(solid);
    const answer = await tools.value('anchor_parts', {
      drawing: 'system',
      by: 'name',
      view: 'overview',
    });
    expect(answer).toMatchObject({
      done: 'Anchor 2 parts of "Shop system"',
      solid: { id: solid, name: 'shop' },
      matched: [
        { part: 'api', element: 'api', name: 'API' },
        { part: 'db', element: 'db', name: 'DB' },
      ],
      unmatched: ['frame', 'cache'],
    });
    const api = tools.session.snapshot.model.elements.find((each) => each.id === 'api');
    expect(api?.appearance?.part).toEqual({ part: 'api', solid });
    expect(tools.session.history.undo).toEqual({
      label: 'Anchor 2 parts of "Shop system"',
      author: 'claude',
    });
  });

  it('creates an element for each part that matches nothing, when asked', async () => {
    const solid = await imported();
    await drawnWithParts(solid);
    const answer = await tools.value('anchor_parts', {
      drawing: 'system',
      by: 'name',
      view: 'overview',
      create: 'systems.service',
      parts: ['cache'],
    });
    expect(answer).toMatchObject({ created: [{ part: 'cache', name: 'Cache' }] });
    const cache = tools.session.snapshot.model.elements.find((each) => each.name === 'Cache');
    expect(cache?.appearance?.part).toEqual({ part: 'cache', solid });
  });

  it('refuses a part the solid lacks', async () => {
    const solid = await imported();
    await drawnWithParts(solid);
    expect(
      await tools.failure('anchor_parts', { drawing: 'system', by: 'name', parts: ['tail'] }),
    ).toBe(
      'Refused, so nothing changed: The solid of "Shop system" has no part "tail". (unknown-part)',
    );
  });
});

describe('turn_solid', () => {
  it('turns a shape’s solid to a camera in the open app, recording nothing', async () => {
    const solid = await imported();
    await tools.value('set_appearance', {
      element: 'api',
      appearanceTraits: { solid: { solid } },
    });
    const app = await tools.openApp();
    const history = tools.session.history;
    const answer = await tools.value('turn_solid', {
      target: 'api',
      camera: { azimuth: 90, elevation: 10, zoom: 2 },
      view: 'overview',
    });
    expect(answer).toMatchObject({
      shown: 1,
      solid,
      recorded: 'Nothing: turning changes nothing stored.',
    });
    await expect
      .poll(() => tools.guidanceOf(app))
      .toEqual([
        {
          kind: 'turn',
          target: 'api',
          camera: { azimuth: 90, elevation: 10, zoom: 2 },
          view: 'overview',
        },
      ]);
    expect(tools.session.history).toEqual(history);
  });

  it('refuses an element that shows no solid, an unknown element and an unknown view', async () => {
    const solid = await imported();
    expect(
      await tools.failure('turn_solid', { target: 'db', camera: { azimuth: 0, elevation: 0 } }),
    ).toContain('shows no solid');
    expect(
      await tools.failure('turn_solid', { target: 'nobody', camera: { azimuth: 0, elevation: 0 } }),
    ).toContain('There is no element "nobody"');
    await tools.value('set_appearance', { element: 'api', appearanceTraits: { solid: { solid } } });
    expect(
      await tools.failure('turn_solid', {
        target: 'api',
        camera: { azimuth: 0, elevation: 0 },
        view: 'nowhere',
      }),
    ).toBe('There is no view "nowhere".');
  });

  it('says nobody sees it when no app is open', async () => {
    const solid = await imported();
    await tools.value('set_appearance', { element: 'api', appearanceTraits: { solid: { solid } } });
    const answer = await tools.value('turn_solid', {
      target: 'api',
      camera: { azimuth: 0, elevation: 0 },
    });
    expect(answer.shown).toBe(0);
    expect(answer.note).toContain('nobody sees this');
  });
});
