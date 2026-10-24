import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PROTOCOL_VERSION } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  RUNTIME_ENV,
  isAlive,
  listProgramRecords,
  readProgramRecord,
  recordName,
  removeProgramRecord,
  runtimeFolder,
  writeProgramRecord,
  type ProgramRecord,
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
  let runtime: string;
  const record = (overrides: Partial<ProgramRecord> = {}): ProgramRecord => ({
    format: 1,
    protocolVersion: PROTOCOL_VERSION,
    pid: process.pid,
    port: 51234,
    folder: '/projects/shop',
    credential: 'c'.repeat(43),
    startedAt: '2026-10-24T12:00:00.000Z',
    ...overrides,
  });

  beforeEach(async () => {
    runtime = join(await mkdtemp(join(tmpdir(), 'va-runtime-')), 'run');
  });

  afterEach(async () => {
    await rm(join(runtime, '..'), { recursive: true, force: true });
  });

  it('writes a record and reads it back by its folder', async () => {
    const path = await writeProgramRecord(runtime, record());
    expect(path).toBe(join(runtime, recordName('/projects/shop')));
    expect(await readProgramRecord(runtime, '/projects/shop')).toEqual(record());
    expect(await readProgramRecord(runtime, '/projects/other')).toBeUndefined();
  });

  it('lists every record', async () => {
    await writeProgramRecord(runtime, record());
    await writeProgramRecord(runtime, record({ folder: '/projects/other', port: 4 }));
    const folders = (await listProgramRecords(runtime)).map((each) => each.folder).sort();
    expect(folders).toEqual(['/projects/other', '/projects/shop']);
  });

  it('lists nothing when there is no runtime folder', async () => {
    expect(await listProgramRecords(join(runtime, 'missing'))).toEqual([]);
  });

  it.skipIf(process.platform === 'win32')('keeps the folder and the record private', async () => {
    const path = await writeProgramRecord(runtime, record());
    expect((await stat(runtime)).mode & 0o777).toBe(0o700);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it('removes a record only while it names this program', async () => {
    const path = await writeProgramRecord(runtime, record());
    await removeProgramRecord(path, process.pid + 1);
    expect(await readProgramRecord(runtime, '/projects/shop')).toBeDefined();
    await removeProgramRecord(path, process.pid);
    expect(await readdir(runtime)).toEqual([]);
    await expect(removeProgramRecord(path, process.pid)).resolves.toBeUndefined();
  });

  it.each([
    ['not JSON', '{'],
    ['an array', '[]'],
    ['a record of a later format', JSON.stringify({ ...record(), format: 2 })],
    ['a record without its credential', JSON.stringify({ ...record(), credential: undefined })],
    ['a port that is no port', JSON.stringify({ ...record(), port: 70000 })],
  ])('reads a file that holds %s as no record', async (_case, text) => {
    await writeProgramRecord(runtime, record());
    await writeFile(join(runtime, recordName('/projects/shop')), text);
    expect(await readProgramRecord(runtime, '/projects/shop')).toBeUndefined();
    expect(await listProgramRecords(runtime)).toEqual([]);
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
