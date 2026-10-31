/**
 * Removing the files no package names (ADR 0075) checks that `solids/` is the project's own right
 * before each file it removes, not only once before the first: a `solids/` swapped for a link to a
 * folder elsewhere while earlier files are removed loses nothing more.
 */
import * as realFs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { solidHash } from '@visual-anything/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { testProject } from '../test-support';
import { removeUnnamedSolidFiles, solidFilePath } from './files';

/** What runs after each file is removed, so that the test can swap the folder between two. */
const hooks = vi.hoisted(() => ({ afterUnlink: undefined as (() => Promise<void>) | undefined }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...real,
    unlink: async (path: Parameters<typeof real.unlink>[0]) => {
      await real.unlink(path);
      const after = hooks.afterUnlink;
      hooks.afterUnlink = undefined;
      await after?.();
    },
  };
});

const { lstat, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } = realFs;

let folders: string[] = [];

afterEach(async () => {
  hooks.afterUnlink = undefined;
  for (const each of folders) await rm(each, { recursive: true, force: true, maxRetries: 10 });
  folders = [];
});

async function temporary(prefix: string): Promise<string> {
  const made = await mkdtemp(join(tmpdir(), prefix));
  folders.push(made);
  return made;
}

const A = new Uint8Array([1, 2, 3]);
const B = new Uint8Array([4, 5, 6, 7]);

describe('removing solid files no package names (ADR 0075)', () => {
  it('checks solids/ again before each file, and keeps what a link swapped in reaches', async (context) => {
    const folder = await temporary('va-solid-removal-');
    const elsewhere = await temporary('va-elsewhere-');
    const [first, second] = [solidHash(A), solidHash(B)];
    await mkdir(join(folder, 'solids'));
    await writeFile(solidFilePath(folder, first), A);
    await writeFile(solidFilePath(folder, second), B);
    // Elsewhere holds a file of the second's name, which must never be removed.
    await writeFile(join(elsewhere, `${second}.glb`), B);

    let swapped = false;
    hooks.afterUnlink = async () => {
      await rename(join(folder, 'solids'), join(folder, 'solids-moved'));
      try {
        await symlink(elsewhere, join(folder, 'solids'), 'junction');
        swapped = true;
      } catch {
        // This user may not make a link to a folder here.
      }
    };
    const done = await removeUnnamedSolidFiles(folder, testProject(), [first, second]);
    if (!swapped) context.skip('This user may not make a link to a folder here.');

    expect(done.removed).toEqual([first]);
    expect(done.kept).toEqual([
      {
        hash: second,
        message: `The project's solids/ folder is not a folder of its own, so "solids/${second}.glb" stays.`,
      },
    ]);
    expect(await readFile(join(elsewhere, `${second}.glb`))).toEqual(Buffer.from(B));
    expect(await lstat(join(folder, 'solids-moved', `${second}.glb`))).toBeDefined();
  });
});
