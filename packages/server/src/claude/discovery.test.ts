import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PROTOCOL_VERSION } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  RUNTIME_ENV,
  UnsafeRuntimeFolderError,
  currentContext,
  isAlive,
  listProgramRecords,
  readProgramRecord,
  recordName,
  removeProgramRecord,
  runtimeFolder,
  writeProgramRecord,
  type ProgramRecord,
  type RuntimeContext,
} from './discovery';

describe('runtimeFolder', () => {
  it('is in the local application data on Windows', () => {
    expect(
      runtimeFolder('win32', { LOCALAPPDATA: 'C:\\Users\\ana\\AppData\\Local' }, 'C:\\Users\\ana'),
    ).toBe('C:\\Users\\ana\\AppData\\Local\\Visual Anything\\run');
    expect(runtimeFolder('win32', { LOCALAPPDATA: 'relative' }, 'C:\\Users\\ana')).toBe(
      'C:\\Users\\ana\\AppData\\Local\\Visual Anything\\run',
    );
  });

  it('is in Application Support on macOS', () => {
    expect(runtimeFolder('darwin', {}, '/Users/ana')).toBe(
      '/Users/ana/Library/Application Support/Visual Anything/run',
    );
  });

  it('is in the runtime folder elsewhere, or the state folder without one', () => {
    expect(runtimeFolder('linux', { XDG_RUNTIME_DIR: '/run/user/1000' }, '/home/ana')).toBe(
      '/run/user/1000/visual-anything',
    );
    expect(runtimeFolder('linux', { XDG_STATE_HOME: '/home/ana/state' }, '/home/ana')).toBe(
      '/home/ana/state/visual-anything/run',
    );
    expect(runtimeFolder('linux', { XDG_RUNTIME_DIR: 'relative' }, '/home/ana')).toBe(
      '/home/ana/.local/state/visual-anything/run',
    );
  });

  it('takes an absolute folder from the environment, and ignores a relative one', () => {
    expect(runtimeFolder('linux', { [RUNTIME_ENV]: '/tmp/va' }, '/home/ana')).toBe('/tmp/va');
    expect(runtimeFolder('linux', { [RUNTIME_ENV]: 'va' }, '/home/ana')).toBe(
      '/home/ana/.local/state/visual-anything/run',
    );
  });
});

describe('recordName', () => {
  it('names a record after its folder, the same however the folder is spelt on Windows', () => {
    const name = recordName('C:\\Projects\\Shop', 'win32');
    expect(name).toMatch(/^[0-9a-f]{24}\.json$/);
    expect(recordName('c:/projects/shop', 'win32')).toBe(name);
    expect(recordName('/projects/shop', 'linux')).not.toBe(recordName('/projects/Shop', 'linux'));
  });
});

describe('program records', () => {
  let profile: string;
  let runtime: string;
  let context: RuntimeContext;
  const record = (overrides: Partial<ProgramRecord> = {}): ProgramRecord => ({
    format: 1,
    protocolVersion: PROTOCOL_VERSION,
    pid: process.pid,
    port: 51234,
    folder: '/projects/shop',
    credential: 'c'.repeat(43),
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    ...overrides,
  });

  beforeEach(async () => {
    profile = await realpath(await mkdtemp(join(tmpdir(), 'va-profile-')));
    runtime = join(profile, 'run');
    context = { ...currentContext(), home: profile };
  });

  afterEach(async () => {
    await rm(profile, { recursive: true, force: true });
  });

  it('writes a record and reads it back by its folder', async () => {
    const shop = record();
    const path = await writeProgramRecord(runtime, shop, context);
    expect(path).toBe(join(runtime, recordName('/projects/shop')));
    expect(await readProgramRecord(runtime, '/projects/shop', context)).toEqual(shop);
    expect(await readProgramRecord(runtime, '/projects/other', context)).toBeUndefined();
  });

  it('lists every record', async () => {
    await writeProgramRecord(runtime, record(), context);
    await writeProgramRecord(runtime, record({ folder: '/projects/other', port: 4 }), context);
    const folders = (await listProgramRecords(runtime, context)).map((each) => each.folder).sort();
    expect(folders).toEqual(['/projects/other', '/projects/shop']);
  });

  it('lists nothing when there is no runtime folder', async () => {
    expect(await listProgramRecords(join(runtime, 'missing'), context)).toEqual([]);
  });

  it('removes a record only while it names this program', async () => {
    const path = await writeProgramRecord(runtime, record(), context);
    await removeProgramRecord(path, process.pid + 1, context);
    expect(await readProgramRecord(runtime, '/projects/shop', context)).toBeDefined();
    await removeProgramRecord(path, process.pid, context);
    expect(await readdir(runtime)).toEqual([]);
    await expect(removeProgramRecord(path, process.pid, context)).resolves.toBeUndefined();
  });

  it.each([
    ['not JSON', '{'],
    ['an array', '[]'],
    ['a record of a later format', JSON.stringify({ ...record(), format: 2 })],
    ['a record without its credential', JSON.stringify({ ...record(), credential: undefined })],
    ['a port that is no port', JSON.stringify({ ...record(), port: 70000 })],
    ['a start that is no date', JSON.stringify({ ...record(), startedAt: 'yesterday' })],
  ])('reads a file that holds %s as no record', async (_case, text) => {
    await writeProgramRecord(runtime, record(), context);
    await writeFile(join(runtime, recordName('/projects/shop')), text, { mode: 0o600 });
    expect(await readProgramRecord(runtime, '/projects/shop', context)).toBeUndefined();
    expect(await listProgramRecords(runtime, context)).toEqual([]);
  });

  it('trusts no record older than the start of the program it names', async () => {
    const path = await writeProgramRecord(runtime, record(), context);
    // As if left there before the program it claims to be had started.
    const before = new Date(Date.now() - 10 * 60_000);
    await utimes(path, before, before);
    expect(await readProgramRecord(runtime, '/projects/shop', context)).toBeUndefined();
  });

  it('trusts no record that is a link, even to a valid record', async (ctx) => {
    const elsewhere = await mkdtemp(join(profile, 'elsewhere-'));
    const real = join(elsewhere, 'record.json');
    await writeFile(real, `${JSON.stringify(record())}\n`, { mode: 0o600 });
    await mkdir(runtime, { recursive: true, mode: 0o700 });
    try {
      await symlink(real, join(runtime, recordName('/projects/shop')), 'file');
    } catch {
      ctx.skip();
    }
    expect(await readProgramRecord(runtime, '/projects/shop', context)).toBeUndefined();
  });

  it('refuses a runtime folder that is a link', async (ctx) => {
    const elsewhere = await mkdtemp(join(profile, 'elsewhere-'));
    try {
      await symlink(elsewhere, runtime, 'junction');
    } catch {
      ctx.skip();
    }
    await expect(writeProgramRecord(runtime, record(), context)).rejects.toThrow(
      UnsafeRuntimeFolderError,
    );
    await expect(listProgramRecords(runtime, context)).rejects.toThrow(/is not a real folder/);
  });

  describe('on Windows', () => {
    let windows: RuntimeContext;

    beforeEach(() => {
      windows = { platform: 'win32', home: profile };
    });

    it('keeps records in a folder inside the profile', async () => {
      const shop = record();
      await writeProgramRecord(runtime, shop, windows);
      expect(await readProgramRecord(runtime, '/projects/shop', windows)).toEqual(shop);
    });

    it('refuses a runtime folder outside the profile, and says why', async () => {
      const outside = await realpath(await mkdtemp(join(tmpdir(), 'va-shared-')));
      try {
        await expect(writeProgramRecord(outside, record(), windows)).rejects.toThrow(
          `lies outside your profile (${profile}), where other accounts on this computer could read Claude's credential`,
        );
        await expect(listProgramRecords(outside, windows)).rejects.toThrow(
          UnsafeRuntimeFolderError,
        );
        expect(await readdir(outside)).toEqual([]);
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });

    it('refuses a folder in the profile reached through a link that leads outside it', async (ctx) => {
      const outside = await realpath(await mkdtemp(join(tmpdir(), 'va-shared-')));
      try {
        await mkdir(join(profile, 'link-parent'));
        try {
          await symlink(outside, join(profile, 'link-parent', 'run'), 'junction');
        } catch {
          ctx.skip();
        }
        // The runtime folder itself is a real folder, but a folder on the way to it leads outside.
        await mkdir(join(outside, 'inner'));
        await expect(
          writeProgramRecord(join(profile, 'link-parent', 'run', 'inner'), record(), windows),
        ).rejects.toThrow('lies outside your profile');
        expect(await readdir(join(outside, 'inner'))).toEqual([]);
      } finally {
        await rm(outside, { recursive: true, force: true });
      }
    });

    it('takes the local application data only when it lies in the profile', () => {
      expect(
        runtimeFolder('win32', { LOCALAPPDATA: 'D:\\Shared\\AppData' }, 'C:\\Users\\ana'),
      ).toBe('C:\\Users\\ana\\AppData\\Local\\Visual Anything\\run');
    });
  });

  describe.skipIf(process.platform === 'win32')('where files have owners', () => {
    it('keeps the folder and the record private', async () => {
      const path = await writeProgramRecord(runtime, record(), context);
      expect((await stat(runtime)).mode & 0o777).toBe(0o700);
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    });

    it('trusts no record that others may read', async () => {
      const path = await writeProgramRecord(runtime, record(), context);
      await chmod(path, 0o644);
      expect(await readProgramRecord(runtime, '/projects/shop', context)).toBeUndefined();
    });

    it('refuses a runtime folder others may write in', async () => {
      await writeProgramRecord(runtime, record(), context);
      await chmod(runtime, 0o777);
      await expect(listProgramRecords(runtime, context)).rejects.toThrow(/Other users may write/);
    });

    it('refuses a runtime folder of another user', async () => {
      await mkdir(runtime, { mode: 0o700 });
      const stranger = { ...context, uid: (context.uid ?? 0) + 1 };
      await expect(writeProgramRecord(runtime, record(), stranger)).rejects.toThrow(
        /belongs to another user/,
      );
    });
  });
});

describe('isAlive', () => {
  it('knows this process is alive', () => {
    expect(isAlive(process.pid)).toBe(true);
  });

  it('knows a process that does not exist is not', () => {
    expect(isAlive(2 ** 22 + 12345)).toBe(false);
  });
});
