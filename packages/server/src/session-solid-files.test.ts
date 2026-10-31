/**
 * The files in `solids/` that no package names (ADR 0075), over the live connection: the Components
 * tab lists them with `solid-files/list`, and the person removes them with `solid-files/remove`, which
 * cannot be undone. Only a regular file named by a hash, directly in a `solids/` of the project's own
 * that no package names, is ever removed; nothing a message names can lie outside `solids/`. And the
 * import dialog's preview gets a prepared file with `solid/get` before it is defined.
 */
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SOLID_PIECE_BYTES,
  decodeBase64,
  encodeBase64,
  encodeMessage,
  solidHash,
  type AppMessage,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { SolidDefinition } from '@visual-anything/schema';
import { afterEach, describe, expect, it } from 'vitest';
import { openSession, type Session } from './session';
import { cleanSolid } from './solids/clean';
import { removeUnnamedSolidFiles, solidFilePath } from './solids/files';
import { box, inputGlb } from './solids/test/gltf';
import { FakeClient, testProject, writeProjectFolder } from './test-support';

let folders: string[] = [];
let session: Session | undefined;

async function temporary(prefix: string): Promise<string> {
  const made = await mkdtemp(join(tmpdir(), prefix));
  folders.push(made);
  return made;
}

async function open(
  project: ProjectSnapshot = testProject(),
): Promise<{ session: Session; folder: string }> {
  const folder = await temporary('va-solid-files-');
  await writeProjectFolder(folder, project);
  const result = await openSession(folder, { watch: false, out: () => {}, err: () => {} });
  if (!result.ok)
    throw new Error(`The test project does not open: ${JSON.stringify(result.errors)}`);
  session = result.session;
  return { session, folder };
}

afterEach(async () => {
  await session?.close();
  for (const each of folders) await rm(each, { recursive: true, force: true, maxRetries: 10 });
  folders = [];
  session = undefined;
});

function ask(target: Session, client: FakeClient, message: AppMessage): Promise<void> {
  return target.receive(client, encodeMessage(message));
}

async function writeSolid(at: string, bytes: Uint8Array, name = solidHash(bytes)): Promise<string> {
  await mkdir(join(at, 'solids'), { recursive: true });
  await writeFile(solidFilePath(at, name), bytes);
  return name;
}

async function exists(path: string): Promise<boolean> {
  return (await lstat(path).catch(() => undefined)) !== undefined;
}

async function tryLink(target: string, path: string, type?: 'file' | 'junction'): Promise<boolean> {
  try {
    await symlink(target, path, type);
    return true;
  } catch {
    return false;
  }
}

function withSolid(hash: string, bytes: number): ProjectSnapshot {
  const project = testProject();
  const solid: SolidDefinition = {
    id: 'shop.arm',
    name: 'Arm',
    hash,
    bytes,
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
    counts: { triangles: 12, vertices: 8, nodes: 1, textures: 0 },
    parts: [],
    camera: { azimuth: 30, elevation: 20 },
  };
  return {
    ...project,
    packages: project.packages.map((file) =>
      file.id === 'shop' ? { ...file, solids: [solid] } : file,
    ),
  };
}

const A = new Uint8Array([1, 2, 3]);
const B = new Uint8Array([4, 5, 6, 7]);

describe('solid-files/list (ADR 0075)', () => {
  it('lists the files no package names, with their sizes, in order', async () => {
    const named = solidHash(A);
    const { session: opened, folder } = await open(withSolid(named, A.length));
    await writeSolid(folder, A);
    const unnamed = await writeSolid(folder, B);
    // Neither a file of another name nor a folder named like a solid file is listed.
    await writeFile(join(folder, 'solids', 'notes.txt'), 'x');
    await mkdir(join(folder, 'solids', `${'d'.repeat(64)}.glb`));
    const client = new FakeClient();
    await ask(opened, client, { type: 'solid-files/list', requestId: 'l1' });
    expect(client.ofType('solid-files/listed')).toEqual([
      { type: 'solid-files/listed', requestId: 'l1', files: [{ hash: unnamed, bytes: B.length }] },
    ]);
  });

  it('lists nothing when the project has no solids/ folder', async () => {
    const { session: opened } = await open();
    const client = new FakeClient();
    await ask(opened, client, { type: 'solid-files/list', requestId: 'l1' });
    expect(client.ofType('solid-files/listed')[0]?.files).toEqual([]);
  });
});

describe('solid-files/remove (ADR 0075)', () => {
  it('removes the files no package names, keeps those one names, and says what is left', async () => {
    const named = solidHash(A);
    const { session: opened, folder } = await open(withSolid(named, A.length));
    await writeSolid(folder, A);
    const unnamed = await writeSolid(folder, B);
    const missing = 'e'.repeat(64);
    const client = new FakeClient();
    await ask(opened, client, {
      type: 'solid-files/remove',
      requestId: 'r1',
      hashes: [unnamed, named, missing],
    });
    expect(client.ofType('solid-files/listed')).toEqual([
      {
        type: 'solid-files/listed',
        requestId: 'r1',
        files: [],
        removed: [unnamed],
        kept: [
          {
            hash: named,
            message: `A package names the solid file "solids/${named}.glb", so it stays.`,
          },
          { hash: missing, message: `The project has no solid file "solids/${missing}.glb".` },
        ],
      },
    ]);
    expect(await exists(solidFilePath(folder, unnamed))).toBe(false);
    expect(await exists(solidFilePath(folder, named))).toBe(true);
    // It changes no project file, so the history holds nothing to undo.
    expect(opened.history.undo).toBeUndefined();
  });

  it('refuses, before the program hears of them, names that are not hashes', async () => {
    const { session: opened, folder } = await open();
    const outside = join(folder, 'project.vaproject');
    const before = await readFile(outside);
    const client = new FakeClient();
    for (const hash of [
      '../project.vaproject',
      '..\\project.vaproject',
      '/etc/passwd',
      'x'.repeat(64),
    ]) {
      await opened.receive(
        client,
        JSON.stringify({ type: 'solid-files/remove', requestId: 'r1', hashes: [hash] }),
      );
    }
    expect(client.ofType('solid-files/listed')).toEqual([]);
    expect(client.ofType('command/rejected').map((each) => each.problems[0]?.code)).toEqual([
      'invalid-command',
      'invalid-command',
      'invalid-command',
      'invalid-command',
    ]);
    expect(await readFile(outside)).toEqual(before);
  });

  it('never removes a folder named like a solid file, nor what it holds', async () => {
    const { session: opened, folder } = await open();
    const hash = 'f'.repeat(64);
    await mkdir(join(folder, 'solids', `${hash}.glb`), { recursive: true });
    await writeFile(join(folder, 'solids', `${hash}.glb`, 'inside.txt'), 'x');
    const client = new FakeClient();
    await ask(opened, client, { type: 'solid-files/remove', requestId: 'r1', hashes: [hash] });
    expect(client.ofType('solid-files/listed')[0]?.kept).toEqual([
      { hash, message: `"solids/${hash}.glb" is not a regular file, so it stays.` },
    ]);
    expect(await exists(join(folder, 'solids', `${hash}.glb`, 'inside.txt'))).toBe(true);
  });

  it('never removes through a link in solids/, nor what it leads to', async (context) => {
    const { session: opened, folder } = await open();
    const elsewhere = await temporary('va-elsewhere-');
    const target = join(elsewhere, 'keep.glb');
    await writeFile(target, B);
    await mkdir(join(folder, 'solids'), { recursive: true });
    const hash = solidHash(B);
    if (!(await tryLink(target, solidFilePath(folder, hash), 'file'))) {
      context.skip('This user may not make a link to a file here.');
    }
    const client = new FakeClient();
    await ask(opened, client, { type: 'solid-files/remove', requestId: 'r1', hashes: [hash] });
    expect(client.ofType('solid-files/listed')[0]?.removed).toEqual([]);
    expect(await readFile(target)).toEqual(Buffer.from(B));
    expect(await exists(solidFilePath(folder, hash))).toBe(true);
  });

  it('never removes anything when solids/ is a link to a folder elsewhere', async (context) => {
    const { session: opened, folder } = await open();
    const elsewhere = await temporary('va-elsewhere-');
    const hash = solidHash(B);
    await writeFile(join(elsewhere, `${hash}.glb`), B);
    if (!(await tryLink(elsewhere, join(folder, 'solids'), 'junction'))) {
      context.skip('This user may not make a link to a folder here.');
    }
    const client = new FakeClient();
    await ask(opened, client, { type: 'solid-files/remove', requestId: 'r1', hashes: [hash] });
    expect(client.ofType('solid-files/listed')[0]).toMatchObject({
      removed: [],
      kept: [
        {
          hash,
          message: `The project's solids/ folder is not a folder of its own, so "solids/${hash}.glb" stays.`,
        },
      ],
    });
    expect(await readFile(join(elsewhere, `${hash}.glb`))).toEqual(Buffer.from(B));
  });

  it('reads every hash again itself, whatever called it', async () => {
    const { folder } = await open();
    await writeSolid(folder, B);
    const done = await removeUnnamedSolidFiles(folder, testProject(), [
      '../solids',
      'A'.repeat(64),
    ]);
    expect(done.removed).toEqual([]);
    expect(done.kept.map((each) => each.message)).toEqual([
      'A solid file is named by its SHA-256, in lowercase hexadecimal.',
      'A solid file is named by its SHA-256, in lowercase hexadecimal.',
    ]);
  });
});

describe('solid/get of a prepared file (ADR 0075)', () => {
  it('serves a file the program holds prepared, before it is defined, for the preview', async () => {
    const { session: opened, folder } = await open();
    const input = inputGlb({
      nodes: [{ name: 'base', mesh: 0 }],
      meshes: [box([-0.5, 0, -0.5], [0.5, 1, 0.5])],
    });
    const client = new FakeClient();
    await ask(opened, client, {
      type: 'solid/prepare',
      requestId: 'p1',
      fileName: 'arm.glb',
      piece: { index: 0, count: 1, data: encodeBase64(input) },
    });
    const prepared = client.ofType('solid/prepared')[0];
    expect(prepared).toBeDefined();
    const hash = prepared?.hash as string;
    expect(await exists(solidFilePath(folder, hash))).toBe(false);
    await ask(opened, client, { type: 'solid/get', requestId: 'g1', hash });
    const pieces = client.ofType('solid/piece');
    expect(pieces).toHaveLength(1);
    const bytes = decodeBase64(pieces[0]?.piece.data ?? '') as Uint8Array;
    const cleaned = await cleanSolid(input.slice());
    expect(cleaned.ok && Buffer.from(bytes).equals(Buffer.from(cleaned.bytes))).toBe(true);
    expect(bytes.length).toBeLessThanOrEqual(SOLID_PIECE_BYTES);
    // Serving it writes nothing: only defining it does.
    expect(await exists(solidFilePath(folder, hash))).toBe(false);
  }, 60_000);
});
