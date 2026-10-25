import { describe, expect, it } from 'vitest';
import { MAX_SHARED_PACKAGE, readChosenProject, type ChosenFile } from './sharedPackages';

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
