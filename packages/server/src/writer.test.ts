import * as fsp from 'node:fs/promises';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  NotRegularFileError,
  isTemporaryFile,
  removeFile,
  writeFileAtomic,
  type WriterFs,
} from './writer';

const TEMPORARY = '.va-tmp';

let folder: string;
let target: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'va-writer-'));
  target = join(folder, 'model.vamodel');
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true, maxRetries: 5 });
});

const bytes = (text: string) => Buffer.from(text, 'utf8');

/** A system error with a code, as Node raises them. */
function systemError(code: string): Error {
  return Object.assign(new Error(`${code}: simulated`), { code });
}

/** Every name in the folder and its subfolders. */
async function namesIn(root: string): Promise<string[]> {
  return (await readdir(root, { recursive: true }))
    .map((name) => name.replaceAll('\\', '/'))
    .sort();
}

/** The real file system, with some calls replaced. */
function fsWith(overrides: Partial<WriterFs>): WriterFs {
  return {
    open: (path, flags, mode) => fsp.open(path, flags, mode),
    rename: (from, to) => fsp.rename(from, to),
    unlink: (path) => fsp.unlink(path),
    mkdir: (path, options) => fsp.mkdir(path, options),
    ...overrides,
  };
}

/** A rename that fails with `code` for the first `times` calls, then works; it counts its calls. */
function blockedRename(code: string, times: number) {
  const calls = { count: 0 };
  const rename: WriterFs['rename'] = (from, to) => {
    calls.count += 1;
    return calls.count <= times ? Promise.reject(systemError(code)) : fsp.rename(from, to);
  };
  return { rename, calls };
}

describe('writeFileAtomic', () => {
  it('replaces the file with the new content and leaves no temporary file', async () => {
    await writeFile(target, 'old');

    await writeFileAtomic(target, bytes('new'));

    expect(await readFile(target, 'utf8')).toBe('new');
    expect(await namesIn(folder)).toEqual(['model.vamodel']);
  });

  it('writes the bytes exactly as given', async () => {
    const data = Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d, 0x0a, 0xc3, 0xa9]);

    await writeFileAtomic(target, data);

    expect(Buffer.compare(await readFile(target), data)).toBe(0);
  });

  it('creates the file and the folders it needs', async () => {
    const nested = join(folder, 'views', 'deep', 'overview.vaview');

    await writeFileAtomic(nested, bytes('{}\n'));

    expect(await readFile(nested, 'utf8')).toBe('{}\n');
    expect(await namesIn(folder)).toEqual(['views', 'views/deep', 'views/deep/overview.vaview']);
  });

  it('keeps the old file and leaves no temporary file when writing fails part way', async () => {
    await writeFile(target, 'old');
    const fs = fsWith({
      open: async (path, flags) => {
        const handle = await fsp.open(path, flags);
        handle.writeFile = async (data) => {
          await handle.write(Buffer.from(data as Uint8Array).subarray(0, 2));
          throw systemError('ENOSPC');
        };
        return handle;
      },
    });

    await expect(writeFileAtomic(target, bytes('new content'), { fs })).rejects.toMatchObject({
      code: 'ENOSPC',
    });

    expect(await readFile(target, 'utf8')).toBe('old');
    expect(await namesIn(folder)).toEqual(['model.vamodel']);
  });

  it('keeps the old file and leaves no temporary file when flushing fails', async () => {
    await writeFile(target, 'old');
    const fs = fsWith({
      open: async (path, flags) => {
        const handle = await fsp.open(path, flags);
        handle.sync = () => Promise.reject(systemError('EIO'));
        return handle;
      },
    });

    await expect(writeFileAtomic(target, bytes('new'), { fs })).rejects.toMatchObject({
      code: 'EIO',
    });

    expect(await readFile(target, 'utf8')).toBe('old');
    expect(await namesIn(folder)).toEqual(['model.vamodel']);
  });

  it.each(['EPERM', 'EBUSY', 'EACCES'])(
    'retries a rename that another program blocks for a moment with %s',
    async (code) => {
      await writeFile(target, 'old');
      const { rename, calls } = blockedRename(code, 2);

      await writeFileAtomic(target, bytes('new'), {
        fs: fsWith({ rename }),
        retryDelays: [1, 1, 1],
      });

      expect(calls.count).toBe(3);
      expect(await readFile(target, 'utf8')).toBe('new');
      expect(await namesIn(folder)).toEqual(['model.vamodel']);
    },
  );

  it('gives up after its retries, keeping the old file and leaving no temporary file', async () => {
    await writeFile(target, 'old');
    const { rename, calls } = blockedRename('EPERM', Infinity);

    await expect(
      writeFileAtomic(target, bytes('new'), { fs: fsWith({ rename }), retryDelays: [1, 1] }),
    ).rejects.toMatchObject({ code: 'EPERM' });

    expect(calls.count).toBe(3);
    expect(await readFile(target, 'utf8')).toBe('old');
    expect(await namesIn(folder)).toEqual(['model.vamodel']);
  });

  it('does not retry a failure that waiting cannot fix', async () => {
    await writeFile(target, 'old');
    const { rename, calls } = blockedRename('EXDEV', Infinity);

    await expect(
      writeFileAtomic(target, bytes('new'), { fs: fsWith({ rename }), retryDelays: [1, 1] }),
    ).rejects.toMatchObject({ code: 'EXDEV' });

    expect(calls.count).toBe(1);
    expect(await namesIn(folder)).toEqual(['model.vamodel']);
  });

  it('removes the temporary file even when its first removal is blocked', async () => {
    await writeFile(target, 'old');
    const { rename } = blockedRename('EPERM', Infinity);
    let unlinks = 0;
    const fs = fsWith({
      rename,
      unlink: (path) => {
        unlinks += 1;
        return unlinks === 1 ? Promise.reject(systemError('EBUSY')) : fsp.unlink(path);
      },
    });

    await expect(writeFileAtomic(target, bytes('new'), { fs, retryDelays: [1] })).rejects.toThrow();

    expect(unlinks).toBe(2);
    expect(await namesIn(folder)).toEqual(['model.vamodel']);
  });

  it('names its temporary files so that no project file is mistaken for one', async () => {
    const seen: string[] = [];
    const fs = fsWith({
      open: (path, flags) => {
        seen.push(path);
        return fsp.open(path, flags);
      },
    });

    await writeFileAtomic(target, bytes('new'), { fs });

    expect(seen).toHaveLength(1);
    const name = (seen[0] ?? '').replaceAll('\\', '/').split('/').at(-1) ?? '';
    expect(isTemporaryFile(name)).toBe(true);
    expect(name).not.toMatch(/\.va(project|model|package|view|scenario)$/);
    expect(isTemporaryFile('model.vamodel')).toBe(false);
  });
});

describe('writeFileAtomic for project files only', () => {
  /** Makes a link, or says this user may not make one here. */
  async function tryLink(to: string, path: string, type: 'file' | 'junction'): Promise<boolean> {
    try {
      await fsp.symlink(to, path, type);
      return true;
    } catch {
      return false;
    }
  }

  it('writes over a regular file', async () => {
    await writeFile(target, 'old');
    await writeFileAtomic(target, bytes('new'), { regularOnly: true });
    expect(await readFile(target, 'utf8')).toBe('new');
  });

  it('never renames over a link, and leaves what it points to alone', async (context) => {
    const outside = await mkdtemp(join(tmpdir(), 'va-outside-'));
    try {
      await writeFile(join(outside, 'secret'), 'secret');
      if (!(await tryLink(join(outside, 'secret'), target, 'file'))) context.skip();
      await expect(writeFileAtomic(target, bytes('new'), { regularOnly: true })).rejects.toThrow(
        'model.vamodel is not a regular file; Visual Anything writes only regular files inside the project folder.',
      );
      expect(await readFile(join(outside, 'secret'), 'utf8')).toBe('secret');
      expect((await fsp.lstat(target)).isSymbolicLink()).toBe(true);
      expect(await namesIn(folder)).toEqual(['model.vamodel']);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('never writes into a folder that is a link', async (context) => {
    const outside = await mkdtemp(join(tmpdir(), 'va-outside-'));
    try {
      if (!(await tryLink(outside, join(folder, 'views'), 'junction'))) context.skip();
      await expect(
        writeFileAtomic(join(folder, 'views', 'a.vaview'), bytes('{}'), { regularOnly: true }),
      ).rejects.toThrow(
        'views is not a real folder; Visual Anything writes only regular files inside the project folder.',
      );
      expect(await readdir(outside)).toEqual([]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('never renames over a folder', async () => {
    await mkdir(target);
    await expect(writeFileAtomic(target, bytes('new'), { regularOnly: true })).rejects.toThrow(
      /is not a regular file/,
    );
    expect(await namesIn(folder)).toEqual(['model.vamodel']);
  });
});

describe('writeFileAtomic for project files, when a folder is swapped while it writes', () => {
  let project: string;
  let outside: string;
  let views: string;
  let file: string;

  beforeEach(async () => {
    project = await fsp.realpath(await mkdtemp(join(tmpdir(), 'va-swap-project-')));
    outside = await fsp.realpath(await mkdtemp(join(tmpdir(), 'va-swap-outside-')));
    views = join(project, 'views');
    file = join(views, 'a.vaview');
    await mkdir(views);
    await writeFile(file, 'old');
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true, maxRetries: 5 });
    await rm(outside, { recursive: true, force: true, maxRetries: 5 });
  });

  /** Moves the views folder aside and puts a junction to the outside folder in its place. */
  async function swapViews(): Promise<void> {
    await fsp.rename(views, join(project, 'views-before'));
    await fsp.symlink(outside, views, 'junction');
  }

  it('writes a file inside the project folder and leaves nothing beside it', async () => {
    await writeFileAtomic(file, bytes('new'), { regularOnly: true, inside: project });
    expect(await readFile(file, 'utf8')).toBe('new');
    expect(await namesIn(project)).toEqual(['views', 'views/a.vaview']);
  });

  it('refuses before the rename when the folder became a junction to the outside', async () => {
    let swapped = false;
    const fs = fsWith({
      open: async (path, flags, mode) => {
        if (!swapped && String(path).endsWith(TEMPORARY)) {
          swapped = true;
          await swapViews();
        }
        return fsp.open(path, flags, mode);
      },
    });

    await expect(
      writeFileAtomic(file, bytes('new'), { regularOnly: true, inside: project, fs }),
    ).rejects.toThrow('views changed while a.vaview was written, so nothing was written there');

    expect(swapped).toBe(true);
    expect(await readdir(outside)).toEqual([]);
    expect(await readFile(join(project, 'views-before/a.vaview'), 'utf8')).toBe('old');
  });

  it('keeps the bytes of a file of that name outside when the swap comes just before the rename', async () => {
    await writeFile(join(outside, 'a.vaview'), 'SECRET');
    const fs = fsWith({
      link: async (existing, path) => {
        await swapViews();
        await fsp.link(existing, path);
      },
    });

    await expect(
      writeFileAtomic(file, bytes('new'), { regularOnly: true, inside: project, fs }),
    ).rejects.toThrow();

    expect(await readdir(outside)).toEqual(['a.vaview']);
    expect(await readFile(join(outside, 'a.vaview'), 'utf8')).toBe('SECRET');
    expect(await readFile(join(project, 'views-before/a.vaview'), 'utf8')).toBe('old');
  });

  it('puts the old bytes back and refuses when the file landed outside the project folder', async () => {
    // As if the rename had gone through a link: the name now leads outside.
    let renamed = false;
    const fs = fsWith({
      rename: async (from, to) => {
        await fsp.rename(from, to);
        if (to === file) renamed = true;
      },
      realpath: async (path) =>
        renamed && path === file ? join(outside, 'a.vaview') : fsp.realpath(path),
    });

    await expect(
      writeFileAtomic(file, bytes('new'), { regularOnly: true, inside: project, fs }),
    ).rejects.toThrow('views changed while a.vaview was written');

    expect(await readFile(file, 'utf8')).toBe('old');
    expect(await namesIn(project)).toEqual(['views', 'views/a.vaview']);
  });

  it('removes what it wrote when there was nothing to put back', async () => {
    await rm(file);
    let renamed = false;
    const fs = fsWith({
      rename: async (from, to) => {
        await fsp.rename(from, to);
        if (to === file) renamed = true;
      },
      realpath: async (path) =>
        renamed && path === file ? join(outside, 'a.vaview') : fsp.realpath(path),
    });

    await expect(
      writeFileAtomic(file, bytes('new'), { regularOnly: true, inside: project, fs }),
    ).rejects.toThrow(NotRegularFileError);

    expect(await namesIn(project)).toEqual(['views']);
  });

  it('refuses a folder whose real path lies outside the project folder', async () => {
    await expect(
      writeFileAtomic(join(outside, 'a.vaview'), bytes('new'), {
        regularOnly: true,
        inside: project,
      }),
    ).rejects.toThrow('lies outside the project folder');
    expect(await readdir(outside)).toEqual([]);
  });
});

describe('writeFileAtomic with a mode', () => {
  it.skipIf(process.platform === 'win32')(
    'gives the file the mode asked for, whatever the umask',
    async () => {
      await writeFileAtomic(target, bytes('secret'), { mode: 0o600 });
      expect((await fsp.stat(target)).mode & 0o777).toBe(0o600);
    },
  );
});

describe('removeFile', () => {
  it('deletes the file', async () => {
    await writeFile(target, 'old');

    await removeFile(target);

    expect(await namesIn(folder)).toEqual([]);
  });

  it('accepts a file that is already gone', async () => {
    await expect(removeFile(target)).resolves.toBeUndefined();
  });

  it('retries a delete that another program blocks for a moment', async () => {
    await writeFile(target, 'old');
    let calls = 0;
    const fs = fsWith({
      unlink: (path) => {
        calls += 1;
        return calls === 1 ? Promise.reject(systemError('EBUSY')) : fsp.unlink(path);
      },
    });

    await removeFile(target, { fs, retryDelays: [1] });

    expect(calls).toBe(2);
    expect(await namesIn(folder)).toEqual([]);
  });

  it('reports a delete that keeps failing', async () => {
    await mkdir(join(folder, 'views'));
    await writeFile(join(folder, 'views', 'a.vaview'), 'old');
    const fs = fsWith({ unlink: () => Promise.reject(systemError('EPERM')) });

    await expect(
      removeFile(join(folder, 'views', 'a.vaview'), { fs, retryDelays: [1] }),
    ).rejects.toMatchObject({ code: 'EPERM' });
    expect(await namesIn(folder)).toEqual(['views', 'views/a.vaview']);
  });
});
