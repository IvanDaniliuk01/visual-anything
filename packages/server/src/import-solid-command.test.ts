/**
 * `visual-anything import <folder> <file.glb|file.gltf> [--units] [--up] [--simplify]` (ADR 0075,
 * ADR-0049): a glTF file is cleaned by the program into `solids/<hash>.glb` and defined as a solid, as
 * one action of the person's, through the program that runs on the project, or by opening the
 * project and saving.
 */
import { mkdir, mkdtemp, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PROTOCOL_VERSION } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { currentContext, writeProgramRecord } from './claude/discovery';
import { parseImportCommandLine, runImport } from './import-command';
import { startServer } from './server';
import { openSession } from './session';
import { box, grid, inputGlb } from './solids/test/gltf';
import { openLiveClient, testProject, writeProjectFolder } from './test-support';

let root: string;
let folder: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'va-import-solid-')));
  folder = join(root, 'project');
  await writeProjectFolder(folder, testProject());
  await writeFile(
    join(root, 'arm.glb'),
    inputGlb({
      nodes: [
        { name: 'base', children: [1], mesh: 0 },
        { name: 'elbow', translation: [0, 0, 500], mesh: 0 },
      ],
      meshes: [box([0, 0, 0], [100, 100, 100])],
    }),
  );
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10 });
});

function environment() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    env: {
      cwd: root,
      out: (line: string) => out.push(line),
      err: (line: string) => err.push(line),
    },
  };
}

describe('importing a solid on the command line', () => {
  it('reads --units, --up and --simplify, and refuses what they do not take', () => {
    const parsed = parseImportCommandLine([
      'p',
      'arm.glb',
      '--units',
      'mm',
      '--up',
      'z',
      '--simplify',
    ]);
    expect(parsed.ok && 'value' in parsed && parsed.value.solid).toEqual({
      units: 'mm',
      up: 'z',
      simplify: true,
    });
    expect(parseImportCommandLine(['p', 'arm.glb', '--units', 'ft'])).toEqual({
      ok: false,
      message: '--units takes m, cm, mm or in, not "ft".',
    });
    expect(parseImportCommandLine(['p', 'arm.glb', '--up', 'x'])).toEqual({
      ok: false,
      message: '--up takes y or z, not "x".',
    });
  });

  it('opens the project, cleans the file, defines the solid as one action and saves', async () => {
    const { out, err, env } = environment();
    expect(await runImport(['project', 'arm.glb', '--units', 'mm', '--up', 'z'], env)).toBe(0);
    expect(err).toEqual([]);
    expect(out[0]).toBe(
      'Cleaned "arm.glb": 12 triangles, 8 vertices, 2 nodes, 2 named parts and 0 textures, 0.1 × 0.6 × 0.1 m.',
    );
    expect(out).toContain('  It was scaled from millimetres to meters.');
    expect(out).toContain('  It was turned so that +Y is up, where +Z was.');
    expect(out.at(-1)).toBe(
      'Done: Import "arm.glb" as a solid, as one action you can undo in the app.',
    );
    const files = await readdir(join(folder, 'solids'));
    expect(files).toHaveLength(1);
    const opened = await openSession(folder, { watch: false, out: () => {}, err: () => {} });
    if (!opened.ok) throw new Error('The project does not open.');
    try {
      const solid = opened.session.snapshot.packages.find((file) => file.id === 'shop')
        ?.solids?.[0];
      expect(files[0]).toBe(`${solid?.hash ?? ''}.glb`);
      expect(solid?.parts.map((part) => part.name)).toEqual(['base', 'elbow']);
      expect(opened.session.warnings()).toEqual([]);
    } finally {
      await opened.session.close();
    }
  }, 60_000);

  it('says what cleaning would do with --dry-run, and writes nothing', async () => {
    const { out, env } = environment();
    expect(await runImport(['project', 'arm.glb', '--dry-run'], env)).toBe(0);
    expect(out.at(-1)).toBe('Dry run: nothing was imported.');
    await expect(readdir(join(folder, 'solids'))).rejects.toThrow();
  }, 60_000);

  it('refuses a file that names anything outside itself, and options for other files', async () => {
    const gltf = JSON.stringify({
      asset: { version: '2.0' },
      buffers: [{ byteLength: 4, uri: 'https://example.com/arm.bin' }],
    });
    await writeFile(join(root, 'remote.gltf'), gltf);
    const { err, env } = environment();
    expect(await runImport(['project', 'remote.gltf'], env)).toBe(1);
    expect(err).toEqual([
      'Could not import "remote.gltf":',
      '  The file names "https://example.com/arm.bin" outside itself, which cleaning never reads: bundle it as .glb, with every buffer and image inside.',
    ]);
    const mixed = environment();
    expect(await runImport(['project', 'arm.glb', '--width', '400'], mixed.env)).toBe(2);
    const other = environment();
    await writeFile(join(root, 'notes.csv'), 'id,name\na,A\n');
    expect(await runImport(['project', 'notes.csv', '--simplify'], other.env)).toBe(2);
    expect(other.err[0]).toBe(
      '--units, --up and --simplify are for glTF files, which are imported as solids.',
    );
  }, 60_000);
});

describe('importing a solid into the program that runs on the project', () => {
  it('sends the file in pieces, and the program defines it as the person’s action', async () => {
    // A file of several pieces of 1 MiB.
    await writeFile(
      join(root, 'terrain.glb'),
      inputGlb({ nodes: [{ name: 'ground', mesh: 0 }], meshes: [grid(300)] }),
    );
    const opened = await openSession(folder, { watch: false, out: () => {}, err: () => {} });
    if (!opened.ok) throw new Error('The project does not open.');
    const { session } = opened;
    const appDir = join(root, 'dist');
    await mkdir(appDir);
    await writeFile(join(appDir, 'index.html'), '<!doctype html><title>Visual Anything</title>');
    const server = await startServer({ session, port: 0, app: { mode: 'static', dir: appDir } });
    const runtime = join(root, 'run');
    const context = { ...currentContext(), home: root };
    await writeProgramRecord(
      runtime,
      {
        format: 1,
        protocolVersion: PROTOCOL_VERSION,
        pid: process.pid,
        port: server.port,
        folder: session.folder.replaceAll('\\', '/'),
        credential: server.credential,
        startedAt: new Date(Date.now() - 1000).toISOString(),
      },
      context,
    );
    const app = await openLiveClient(server.port, server.token);
    try {
      const { out, err, env } = environment();
      expect(
        await runImport(['project', 'terrain.glb'], { ...env, runtimeFolder: runtime, context }),
      ).toBe(0);
      expect(err).toEqual([]);
      expect(out).toContain('Visual Anything runs on "Shop", so the import goes through it.');
      expect(session.actions).toMatchObject([
        { label: 'Import "terrain.glb" as a solid', author: 'user', undone: false },
      ]);
      const solid = session.snapshot.packages.find((file) => file.id === 'shop')?.solids?.[0];
      expect(solid?.counts.triangles).toBe(180_000);
      expect(await readdir(join(folder, 'solids'))).toEqual([`${solid?.hash ?? ''}.glb`]);
      expect(app.messages.some((message) => message.type === 'project/changed')).toBe(true);
    } finally {
      await app.close();
      await server.close();
      await session.close();
    }
  }, 120_000);
});
