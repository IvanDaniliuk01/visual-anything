import { execFileSync } from 'node:child_process';
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  REAL_READER_FS,
  SIZE_CAPS,
  capOf,
  describeCap,
  readRegularFile,
  sameFile,
  type ReaderFs,
} from './regular-files';

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'va-regular-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

/** Makes a symbolic link, or says the platform does not let this user make one. */
async function tryLink(target: string, path: string, type?: 'file' | 'junction'): Promise<boolean> {
  try {
    await symlink(target, path, type);
    return true;
  } catch {
    return false;
  }
}

describe('readRegularFile', () => {
  it('reads a regular file, every byte of it', async () => {
    const bytes = Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d, 0x0a]);
    await writeFile(join(folder, 'a.vaview'), bytes);
    const read = await readRegularFile(join(folder, 'a.vaview'), 1024);
    expect(read).toEqual({ ok: true, bytes });
  });

  it('reads an empty file', async () => {
    await writeFile(join(folder, 'empty.vaview'), '');
    expect(await readRegularFile(join(folder, 'empty.vaview'), 1024)).toEqual({
      ok: true,
      bytes: Buffer.alloc(0),
    });
  });

  it('says when there is no file', async () => {
    const read = await readRegularFile(join(folder, 'missing.vaview'), 1024);
    expect(read).toMatchObject({ ok: false, reason: 'missing' });
  });

  it('reads a file exactly at its cap and refuses one byte more', async () => {
    await writeFile(join(folder, 'at.vaview'), Buffer.alloc(16, 0x20));
    await writeFile(join(folder, 'over.vaview'), Buffer.alloc(17, 0x20));
    expect(await readRegularFile(join(folder, 'at.vaview'), 16)).toMatchObject({ ok: true });
    expect(await readRegularFile(join(folder, 'over.vaview'), 16)).toEqual({
      ok: false,
      reason: 'too-large',
      message: 'The file holds more than 16 bytes, the most a file of this kind may hold.',
    });
  });

  it('refuses a folder', async () => {
    await mkdir(join(folder, 'folder.vaview'));
    expect(await readRegularFile(join(folder, 'folder.vaview'), 1024)).toEqual({
      ok: false,
      reason: 'not-regular',
      message:
        'The file is not a regular file; Visual Anything opens only regular files inside the project folder.',
    });
  });

  it('refuses a symbolic link, even to a regular file', async (context) => {
    await writeFile(join(folder, 'real.vaview'), '{}');
    if (!(await tryLink(join(folder, 'real.vaview'), join(folder, 'link.vaview'), 'file'))) {
      context.skip();
    }
    expect(await readRegularFile(join(folder, 'link.vaview'), 1024)).toEqual({
      ok: false,
      reason: 'link',
      message:
        'The file is a link; Visual Anything opens only regular files inside the project folder.',
    });
  });

  it('refuses a junction or a link to a folder', async (context) => {
    await mkdir(join(folder, 'target'));
    if (!(await tryLink(join(folder, 'target'), join(folder, 'junction.vaview'), 'junction'))) {
      context.skip();
    }
    expect(await readRegularFile(join(folder, 'junction.vaview'), 1024)).toMatchObject({
      ok: false,
      reason: 'link',
    });
  });

  it.skipIf(process.platform === 'win32')('refuses a FIFO without waiting on it', async () => {
    const fifo = join(folder, 'pipe.vaview');
    execFileSync('mkfifo', [fifo]);
    expect(await readRegularFile(fifo, 1024)).toMatchObject({ ok: false, reason: 'not-regular' });
  });

  it.skipIf(process.platform === 'win32')('refuses a device', async () => {
    expect(await readRegularFile('/dev/zero', 1024)).toMatchObject({
      ok: false,
      reason: 'not-regular',
    });
  });
});

describe('readRegularFile, when a name is swapped while it is read', () => {
  let project: string;
  let outside: string;

  beforeEach(async () => {
    project = await realpath(await mkdtemp(join(tmpdir(), 'va-swap-project-')));
    outside = await realpath(await mkdtemp(join(tmpdir(), 'va-swap-outside-')));
    await mkdir(join(project, 'views'));
    await writeFile(join(project, 'views/a.vaview'), 'inside');
    await writeFile(join(outside, 'a.vaview'), 'SECRET');
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  /** The real file system with some calls replaced. */
  const fsWith = (overrides: Partial<ReaderFs>): ReaderFs => ({ ...REAL_READER_FS, ...overrides });

  it('reads a file inside the project folder', async () => {
    const read = await readRegularFile(join(project, 'views/a.vaview'), 1024, { inside: project });
    expect(read).toEqual({ ok: true, bytes: Buffer.from('inside') });
  });

  it('refuses a file swapped for another between the look and the open', async () => {
    // As if the name became a link to the outside file right after it was looked at: Windows opens
    // through the link, having no flag to stop it.
    const fs = fsWith({ open: (_path, flags) => open(join(outside, 'a.vaview'), flags) });
    const read = await readRegularFile(join(project, 'views/a.vaview'), 1024, {
      inside: project,
      fs,
    });
    expect(read).toEqual({
      ok: false,
      reason: 'changed',
      message:
        'The file changed while it was being opened; Visual Anything opens only regular files inside the project folder.',
    });
  });

  it('refuses a file reached through a folder swapped for a junction to the outside', async (context) => {
    const swapThenLook = async (path: string) => {
      await rename(join(project, 'views'), join(project, 'views-before'));
      await symlink(outside, join(project, 'views'), 'junction');
      return lstat(path, { bigint: true });
    };
    if (!(await tryLink(outside, join(project, 'probe'), 'junction'))) context.skip();
    await rm(join(project, 'probe'), { recursive: true, force: true });

    const read = await readRegularFile(join(project, 'views/a.vaview'), 1024, {
      inside: project,
      fs: fsWith({ lstat: swapThenLook }),
    });
    expect(read).toEqual({
      ok: false,
      reason: 'link',
      message:
        'The file lies outside the project folder; Visual Anything opens only regular files inside the project folder.',
    });
  });

  it('refuses a real path that leads to another file than the one opened', async () => {
    await writeFile(join(project, 'views/b.vaview'), 'other');
    const fs = fsWith({ realpath: () => Promise.resolve(join(project, 'views/b.vaview')) });
    const read = await readRegularFile(join(project, 'views/a.vaview'), 1024, {
      inside: project,
      fs,
    });
    expect(read).toMatchObject({ ok: false, reason: 'changed' });
  });

  it('compares the files it saw by device and file number', async () => {
    const a = await stat(join(project, 'views/a.vaview'), { bigint: true });
    const again = await lstat(join(project, 'views/a.vaview'), { bigint: true });
    const other = await stat(join(outside, 'a.vaview'), { bigint: true });
    expect(sameFile(a, again)).toBe(true);
    expect(sameFile(a, other)).toBe(false);
  });
});

describe('the size caps', () => {
  it('are those of each kind of project file', () => {
    expect(SIZE_CAPS).toEqual({
      project: 1024 * 1024,
      model: 64 * 1024 * 1024,
      package: 8 * 1024 * 1024,
      view: 64 * 1024 * 1024,
      scenario: 64 * 1024 * 1024,
    });
    expect(capOf('package')).toBe(8 * 1024 * 1024);
  });

  it('are written in words', () => {
    expect(describeCap(1024 * 1024)).toBe('1 MiB');
    expect(describeCap(64 * 1024 * 1024)).toBe('64 MiB');
    expect(describeCap(256 * 1024)).toBe('256 KiB');
    expect(describeCap(100)).toBe('100 bytes');
  });
});
