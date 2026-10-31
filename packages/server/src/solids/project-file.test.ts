/**
 * A glTF file to import from the project folder (ADR 0075), as Claude's `import_solid` names one: by
 * its path from the folder, read only as a regular file inside it, within the 256 MiB cleaning reads.
 * Every path outside the folder, every link and every other kind of file is refused before anything
 * is read.
 */
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readProjectSolidFile } from './project-file';

let root: string;
let folder: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'va-solid-path-')));
  folder = join(root, 'project');
  await mkdir(join(folder, 'models'), { recursive: true });
  await writeFile(join(folder, 'models', 'arm.glb'), Buffer.from('glTF'));
  await writeFile(join(folder, 'arm.gltf'), '{}');
  await writeFile(join(root, 'secret.glb'), Buffer.from('outside'));
  await writeFile(join(folder, 'notes.txt'), 'not a solid');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10 });
});

describe('readProjectSolidFile', () => {
  it('reads a .glb or .gltf file inside the project folder, by its path from the folder', async () => {
    expect(await readProjectSolidFile(folder, 'models/arm.glb')).toMatchObject({
      ok: true,
      fileName: 'arm.glb',
      bytes: Buffer.from('glTF'),
    });
    expect(await readProjectSolidFile(folder, 'models\\arm.glb')).toMatchObject({ ok: true });
    expect(await readProjectSolidFile(folder, './arm.gltf')).toMatchObject({
      ok: true,
      fileName: 'arm.gltf',
    });
    expect(await readProjectSolidFile(folder, 'models/../arm.gltf')).toMatchObject({ ok: true });
  });

  it.each([
    ['a path that leaves the folder', '../secret.glb'],
    ['a path deep that leaves the folder', 'models/../../secret.glb'],
    ['the folder itself', '.'],
  ])('refuses %s', async (_case, path) => {
    expect(await readProjectSolidFile(folder, path)).toEqual({
      ok: false,
      problem: {
        code: 'invalid-file',
        message: `"${path}" lies outside the project folder: import_solid reads only a .glb or .gltf file inside it, named by its path from the folder, such as "models/arm.glb".`,
      },
    });
  });

  it('refuses an absolute path, a drive and a network share, even one inside the folder', async () => {
    for (const path of [
      join(folder, 'models', 'arm.glb'),
      '/etc/passwd.glb',
      'C:/Windows/arm.glb',
      'C:arm.glb',
      '\\\\server\\share\\arm.glb',
      '//server/share/arm.glb',
    ]) {
      const read = await readProjectSolidFile(folder, path);
      expect(read).toMatchObject({ ok: false, problem: { code: 'invalid-file' } });
      if (!read.ok) expect(read.problem.message).toContain('a path from the project folder');
    }
  });

  it('refuses a file that is no glTF file by its name, before reading it', async () => {
    expect(await readProjectSolidFile(folder, 'notes.txt')).toEqual({
      ok: false,
      problem: {
        code: 'invalid-file',
        message:
          '"notes.txt" is not a glTF file: import_solid imports a .glb file, or a .gltf file whose data is all inside it.',
      },
    });
  });

  it('refuses a name with a NUL, and an empty or overlong path', async () => {
    for (const path of ['arm\0.glb', '', 'a/'.repeat(600) + 'arm.glb']) {
      expect(await readProjectSolidFile(folder, path)).toMatchObject({
        ok: false,
        problem: { code: 'invalid-file' },
      });
    }
  });

  it('says when there is no such file, or it is a folder', async () => {
    expect(await readProjectSolidFile(folder, 'models/leg.glb')).toEqual({
      ok: false,
      problem: {
        code: 'invalid-file',
        message: 'The project folder has no file "models/leg.glb".',
      },
    });
    await mkdir(join(folder, 'folder.glb'));
    expect(await refusalOf('folder.glb')).toContain('not a regular file');
  });

  it('refuses a link inside the folder that leads outside it', async (context) => {
    try {
      await symlink(join(root, 'secret.glb'), join(folder, 'link.glb'), 'file');
    } catch {
      context.skip();
    }
    expect(await refusalOf('link.glb')).toContain('link');
  });

  it('refuses a file reached through a junction to a folder outside', async (context) => {
    await mkdir(join(root, 'elsewhere'));
    await writeFile(join(root, 'elsewhere', 'arm.glb'), Buffer.from('outside'));
    try {
      await symlink(join(root, 'elsewhere'), join(folder, 'through'), 'junction');
    } catch {
      context.skip();
    }
    expect(await refusalOf('through/arm.glb')).toContain('outside the project');
  });
});

/** Why a path was refused, with the code every refusal has; throws when it was read. */
async function refusalOf(path: string): Promise<string> {
  const read = await readProjectSolidFile(folder, path);
  if (read.ok) throw new Error(`"${path}" was read.`);
  expect(read.problem.code).toBe('invalid-file');
  return read.problem.message;
}
