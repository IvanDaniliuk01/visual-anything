import { SOLID_CAPS } from '@visual-anything/core';
import type { PackageFile, SolidDefinition } from '@visual-anything/schema';
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_SHARED_PACKAGE,
  copySolidFiles,
  namedSolidFiles,
  readChosenProject,
  solidFilesOf,
  type ChosenFile,
  type SendSolidFile,
} from './sharedPackages';

const SHOP = {
  id: 'shop',
  name: 'Shop',
  version: '1.0.0',
  components: [{ id: 'shop.cart', name: 'Cart', derivesFrom: 'essence' }],
  relationTypes: [],
};

function file(path: string, text: string, size = text.length): ChosenFile {
  let reads = 0;
  return {
    path,
    size,
    text: () => {
      reads += 1;
      if (reads > 1) throw new Error(`${path} was read twice.`);
      return Promise.resolve(text);
    },
  };
}

function unread(path: string): ChosenFile {
  return {
    path,
    size: 10,
    text: () => {
      throw new Error(`${path} should not be read.`);
    },
  };
}

describe('readChosenProject', () => {
  it('reads the project’s name and its own packages, and nothing else in the folder', async () => {
    const chosen = await readChosenProject([
      file('other-shop/project.vaproject', JSON.stringify({ name: 'Other shop' })),
      file('other-shop/packages/shop.vapackage', JSON.stringify(SHOP)),
      unread('other-shop/model.vamodel'),
      unread('other-shop/views/overview.vaview'),
      unread('other-shop/.git/objects/ab/cdef'),
      unread('other-shop/node_modules/x/packages/y.vapackage'),
      unread('other-shop/packages/notes.txt'),
    ]);
    expect(chosen).toEqual({
      name: 'Other shop',
      packages: [{ path: 'packages/shop.vapackage', file: SHOP }],
      problems: [],
      solids: new Map(),
    });
  });

  it('finds the project in a folder chosen above it', async () => {
    const chosen = await readChosenProject([
      file('work/shop/project.vaproject', JSON.stringify({ name: 'Shop' })),
      file('work/shop/packages/shop.vapackage', JSON.stringify(SHOP)),
    ]);
    expect(chosen.name).toBe('Shop');
    expect(chosen.packages.map((each) => each.file.id)).toEqual(['shop']);
  });

  it('says which package files it could not read, and why', async () => {
    const chosen = await readChosenProject([
      file('p/project.vaproject', '{'),
      file('p/packages/a.vapackage', 'not json'),
      file('p/packages/b.vapackage', '[1, 2]'),
      file('p/packages/c.vapackage', '{}', MAX_SHARED_PACKAGE + 1),
    ]);
    expect(chosen).toEqual({
      packages: [],
      problems: [
        { path: 'packages/a.vapackage', message: 'The file is not valid JSON.' },
        { path: 'packages/b.vapackage', message: 'The file holds no package.' },
        { path: 'packages/c.vapackage', message: 'The file is over 4 MiB.' },
      ],
      solids: new Map(),
    });
  });

  it('reads a folder that holds no project file as one with no name', async () => {
    const chosen = await readChosenProject([
      file('loose/packages/shop.vapackage', JSON.stringify(SHOP)),
    ]);
    expect(chosen.name).toBeUndefined();
    expect(chosen.packages).toHaveLength(1);
  });
});

describe('a package’s solid files from the folder chosen (ADR 0089’s M14.6 clarification)', () => {
  const A = 'a'.repeat(64);
  const B = 'b'.repeat(64);
  const C = 'c'.repeat(64);
  const solid = (id: string, hash: string): SolidDefinition => ({
    id,
    name: id,
    hash,
    bytes: 3,
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
    counts: { triangles: 1, vertices: 3, nodes: 1, textures: 0 },
    parts: [],
    camera: { azimuth: 30, elevation: 20 },
  });
  const withBytes = (path: string, bytes: number[], size = bytes.length): ChosenFile => ({
    ...unread(path),
    size,
    bytes: () => Promise.resolve(new Uint8Array(bytes)),
  });

  it('keeps the solids folder’s files named by a hash, unread, and passes over the others', async () => {
    const chosen = await readChosenProject([
      file('shop/project.vaproject', JSON.stringify({ name: 'Shop' })),
      withBytes(`shop/solids/${A}.glb`, [1]),
      unread('shop/solids/arm.glb'),
      unread(`shop/solids/deeper/${B}.glb`),
      unread(`shop/other/${C}.glb`),
    ]);
    expect([...chosen.solids.keys()]).toEqual([A]);
  });

  it('copies each file once, but those the project names already, and lists those it lacks', async () => {
    const chosen = await readChosenProject([
      withBytes(`shop/solids/${A}.glb`, [1]),
      withBytes(`shop/solids/${B}.glb`, [2]),
    ]);
    const pkg: PackageFile = {
      ...SHOP,
      solids: [solid('shop.a', A), solid('shop.a2', A), solid('shop.b', B), solid('shop.c', C)],
    };
    const named = namedSolidFiles([{ ...SHOP, id: 'other', solids: [solid('other.b', B)] }]);
    const files = solidFilesOf(chosen, pkg, named);
    expect(files.copy.map((each) => each.hash)).toEqual([A]);
    expect(files.missing.map((each) => each.id)).toEqual(['shop.c']);
  });

  it('sends each file kept by its hash, and stops at the first the local program refuses', async () => {
    const send = vi.fn<SendSolidFile>((name) =>
      Promise.resolve(
        name.startsWith('b')
          ? { ok: false as const, problems: [{ message: 'Not clean.' }] }
          : {
              ok: true as const,
              answer: {
                type: 'solid/prepared' as const,
                requestId: 'r',
                hash: A,
                bytes: 1,
                bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
                counts: { triangles: 1, vertices: 3, nodes: 1, textures: 0 },
                parts: [],
                report: [],
              },
            },
      ),
    );
    const copy = [
      { hash: A, file: withBytes(`s/solids/${A}.glb`, [1]) },
      { hash: B, file: withBytes(`s/solids/${B}.glb`, [2]) },
      { hash: C, file: withBytes(`s/solids/${C}.glb`, [3]) },
    ];
    expect(await copySolidFiles(copy, send)).toEqual({ ok: false, message: 'Not clean.' });
    expect(send.mock.calls.map(([name, , options]) => [name, options])).toEqual([
      [`${A}.glb`, { keep: A }],
      [`${B}.glb`, { keep: B }],
    ]);
    // A file past the cleaned file's cap is refused unread.
    const large = [{ hash: C, file: withBytes(`s/solids/${C}.glb`, [], SOLID_CAPS.fileBytes + 1) }];
    expect(await copySolidFiles(large, send)).toEqual({
      ok: false,
      message: `The solid file "solids/${C}.glb" is over ${SOLID_CAPS.fileBytes} bytes, the most a cleaned file holds.`,
    });
    expect(send).toHaveBeenCalledTimes(2);
  });
});
