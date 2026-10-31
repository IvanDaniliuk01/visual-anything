/**
 * The program's solid files over the live connection (ADR 0075):
 *
 * - `solid/get` serves a file by its hash, in pieces, only when its bytes are its name's and the core's
 *   strict reader takes it, checked the first time it is read; otherwise it warns `solid-not-clean`;
 * - `solid/prepare` takes a file to import in pieces, cleans it in the worker and answers with what the
 *   program holds; `define-solid` is taken only for a file the program holds, with the description it
 *   worked out, and writes the file to `solids/` once;
 * - opening warns `solid-file-missing` for a named file that is not there, or not of its size, and no
 *   file is ever deleted on its own.
 */
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
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
import { solidFilePath } from './solids/serve';
import { box, grid, inputGlb } from './solids/test/gltf';
import { FakeClient, testProject, writeProjectFolder } from './test-support';

let folder: string | undefined;
let session: Session | undefined;

async function open(
  project: ProjectSnapshot = testProject(),
  now?: () => number,
): Promise<{ session: Session; folder: string }> {
  folder = await mkdtemp(join(tmpdir(), 'va-solids-'));
  await writeProjectFolder(folder, project);
  const result = await openSession(folder, {
    watch: false,
    out: () => {},
    err: () => {},
    ...(now === undefined ? {} : { now }),
  });
  if (!result.ok)
    throw new Error(`The test project does not open: ${JSON.stringify(result.errors)}`);
  session = result.session;
  return { session, folder };
}

afterEach(async () => {
  await session?.close();
  if (folder !== undefined) await rm(folder, { recursive: true, force: true, maxRetries: 10 });
  session = undefined;
  folder = undefined;
});

const ARM = inputGlb({
  nodes: [
    { name: 'base', children: [1], mesh: 0 },
    { name: 'elbow', translation: [0, 1, 0], mesh: 0 },
  ],
  meshes: [box([-0.5, 0, -0.5], [0.5, 1, 0.5])],
});

/** A canonical file, cleaned in this thread. */
async function canonical(input = ARM) {
  const cleaned = await cleanSolid(input.slice());
  if (!cleaned.ok) throw new Error('The test solid does not clean.');
  return cleaned;
}

async function writeSolid(at: string, bytes: Uint8Array, name = solidHash(bytes)): Promise<string> {
  await mkdir(join(at, 'solids'), { recursive: true });
  await writeFile(solidFilePath(at, name), bytes);
  return name;
}

function ask(target: Session, client: FakeClient, message: AppMessage): Promise<void> {
  return target.receive(client, encodeMessage(message));
}

/** Sends a file to import in pieces, as the app does. */
async function sendFile(
  target: Session,
  client: FakeClient,
  bytes: Uint8Array,
  requestId = 'p1',
  options?: { units?: 'mm'; up?: 'z'; simplify?: boolean },
): Promise<void> {
  const count = Math.max(1, Math.ceil(bytes.length / SOLID_PIECE_BYTES));
  for (let index = 0; index < count; index++) {
    const data = encodeBase64(
      bytes.subarray(index * SOLID_PIECE_BYTES, (index + 1) * SOLID_PIECE_BYTES),
    );
    await ask(target, client, {
      type: 'solid/prepare',
      requestId,
      fileName: 'arm.glb',
      piece: { index, count, data },
      ...(index === 0 && options !== undefined ? { options } : {}),
    });
  }
}

/** A solid's definition as an app would send it, with a description it makes up. */
function definition(hash: string, more: Partial<SolidDefinition> = {}): SolidDefinition {
  return {
    id: 'shop.arm',
    name: 'Arm',
    hash,
    bytes: 1,
    bounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 9, y: 9, z: 9 } },
    counts: { triangles: 1, vertices: 1, nodes: 1, textures: 0 },
    parts: [{ name: 'made-up' }],
    camera: { azimuth: 30, elevation: 20 },
    ...more,
  };
}

function withSolid(definitionOf: SolidDefinition): ProjectSnapshot {
  const project = testProject();
  return {
    ...project,
    packages: project.packages.map((file) =>
      file.id === 'shop' ? { ...file, solids: [definitionOf] } : file,
    ),
  };
}

describe('solid/get (ADR 0075)', () => {
  it('serves a canonical file in pieces of at most 1 MiB, in order, which make its bytes again', async () => {
    const { bytes, hash } = await canonical(
      inputGlb({ nodes: [{ name: 'g', mesh: 0 }], meshes: [grid(400)] }),
    );
    expect(bytes.length).toBeGreaterThan(SOLID_PIECE_BYTES * 2);
    const { session: opened, folder: at } = await open();
    await writeSolid(at, bytes);
    const client = new FakeClient();
    await ask(opened, client, { type: 'solid/get', requestId: 'r1', hash });
    const pieces = client.ofType('solid/piece');
    const count = Math.ceil(bytes.length / SOLID_PIECE_BYTES);
    expect(pieces.map((each) => each.piece.index)).toEqual([...Array(count).keys()]);
    expect(pieces.every((each) => each.requestId === 'r1' && each.hash === hash)).toBe(true);
    const joined = Buffer.concat(pieces.map((each) => decodeBase64(each.piece.data) as Uint8Array));
    expect(joined.equals(Buffer.from(bytes))).toBe(true);
  }, 60_000);

  it('refuses a file that is missing, with solid-file-missing', async () => {
    const { session: opened } = await open();
    const client = new FakeClient();
    await ask(opened, client, { type: 'solid/get', requestId: 'r1', hash: 'b'.repeat(64) });
    expect(client.ofType('solid/piece')).toEqual([]);
    expect(client.ofType('solid/refused')).toEqual([
      {
        type: 'solid/refused',
        requestId: 'r1',
        code: 'solid-file-missing',
        message: `The project has no solid file "solids/${'b'.repeat(64)}.glb".`,
      },
    ]);
  });

  it('never serves a file whose bytes are not its name’s', async () => {
    const { session: opened, folder: at } = await open();
    const name = await writeSolid(at, new Uint8Array([1, 2, 3]), 'c'.repeat(64));
    const client = new FakeClient();
    await ask(opened, client, { type: 'solid/get', requestId: 'r1', hash: name });
    expect(client.ofType('solid/piece')).toEqual([]);
    expect(client.ofType('solid/refused')[0]?.code).toBe('solid-not-clean');
  });

  it('never serves a file the cleaner did not write, and warns of it', async () => {
    // Bytes named by their own hash, but a GLB no cleaner wrote: the core's reader refuses it.
    const { session: opened, folder: at } = await open();
    const hash = await writeSolid(at, ARM);
    const app = new FakeClient();
    opened.connect(app);
    await ask(opened, app, { type: 'solid/get', requestId: 'r1', hash });
    expect(app.ofType('solid/piece')).toEqual([]);
    const refused = app.ofType('solid/refused')[0];
    expect(refused?.code).toBe('solid-not-clean');
    expect(refused?.message).toMatch(/is not one Visual Anything cleaned: /);
    expect(
      app
        .ofType('notice')
        .some((each) => each.message.includes('is not one Visual Anything cleaned')),
    ).toBe(true);
  }, 60_000);

  it('serves a canonical file whose definition says another description, and warns of it', async () => {
    const { bytes, hash } = await canonical();
    const { session: opened, folder: at } = await open(
      withSolid(definition(hash, { bytes: 0 + 1 })),
    );
    await writeSolid(at, bytes);
    const app = new FakeClient();
    await ask(opened, app, { type: 'solid/get', requestId: 'r1', hash });
    expect(app.ofType('solid/piece').length).toBe(1);
    expect(opened.warnings().map((each) => each.message)).toContain(
      `The solid "Arm" says another description than its file "solids/${hash}.glb" holds; it is drawn as its file is.`,
    );
  }, 60_000);

  it('refuses a name that is a folder rather than a regular file', async () => {
    const { session: opened, folder: at } = await open();
    await mkdir(solidFilePath(at, 'd'.repeat(64)), { recursive: true });
    const client = new FakeClient();
    await ask(opened, client, { type: 'solid/get', requestId: 'r1', hash: 'd'.repeat(64) });
    expect(client.ofType('solid/refused')[0]?.code).toBe('solid-file-missing');
  });
});

describe('solid/prepare and define-solid (ADR 0075)', () => {
  it('cleans a file sent in pieces, holds it, and defines it with its own description, writing it once', async () => {
    const { session: opened, folder: at } = await open();
    const client = new FakeClient();
    await sendFile(opened, client, ARM, 'p1', { units: 'mm' });
    const prepared = client.ofType('solid/prepared')[0];
    expect(prepared).toBeDefined();
    if (prepared === undefined) return;
    expect(prepared.parts.map((part) => part.name)).toEqual(['base', 'elbow']);
    expect(prepared.bounds.max).toEqual({ x: 0.0005, y: 0.002, z: 0.0005 });
    expect(prepared.report).toContain('It was scaled from millimetres to meters.');
    // Nothing is written while the person reads the preview.
    await expect(stat(solidFilePath(at, prepared.hash))).rejects.toThrow();

    await ask(opened, client, {
      type: 'command',
      requestId: 'c1',
      command: {
        type: 'define-solid',
        package: 'shop',
        solid: definition(prepared.hash),
        fileName: 'arm.glb',
      },
    });
    expect(client.ofType('command/rejected')).toEqual([]);
    const stored = opened.snapshot.packages.find((file) => file.id === 'shop')?.solids?.[0];
    expect(stored).toEqual({
      ...definition(prepared.hash),
      bytes: prepared.bytes,
      bounds: prepared.bounds,
      counts: prepared.counts,
      parts: prepared.parts,
    });
    const written = await readFile(solidFilePath(at, prepared.hash));
    expect(solidHash(written)).toBe(prepared.hash);
    expect(opened.history.undo?.label).toBe('Import "arm.glb" as a solid');

    // Undoing the import leaves the file where it is.
    await opened.undo();
    expect(opened.snapshot.packages.find((file) => file.id === 'shop')?.solids ?? []).toEqual([]);
    expect((await stat(solidFilePath(at, prepared.hash))).size).toBe(prepared.bytes);
  }, 60_000);

  it('takes define-solid for a canonical file already in solids/, and for no file it does not hold', async () => {
    const { bytes, hash } = await canonical();
    const { session: opened, folder: at } = await open();
    const client = new FakeClient();
    await ask(opened, client, {
      type: 'command',
      requestId: 'c1',
      command: { type: 'define-solid', package: 'shop', solid: definition(hash) },
    });
    expect(client.ofType('command/rejected')[0]?.problems[0]).toEqual({
      code: 'invalid-solid',
      message: `Visual Anything holds no cleaned file "solids/${hash}.glb": import the file, and the program cleans it first.`,
    });
    // A file a branch brought, which the program reads and checks.
    await writeSolid(at, bytes);
    await ask(opened, client, {
      type: 'command',
      requestId: 'c2',
      command: { type: 'define-solid', package: 'shop', solid: definition(hash) },
    });
    expect(client.ofType('command/rejected')).toHaveLength(1);
    expect(opened.snapshot.packages.find((file) => file.id === 'shop')?.solids?.[0]?.parts).toEqual(
      (await canonical()).description.parts,
    );
  }, 60_000);

  it('refuses define-solid inside a batch for a file it does not hold', async () => {
    const { session: opened } = await open();
    const client = new FakeClient();
    await ask(opened, client, {
      type: 'command',
      requestId: 'c1',
      command: {
        type: 'batch',
        label: 'Import "x.glb"',
        commands: [{ type: 'define-solid', package: 'shop', solid: definition('e'.repeat(64)) }],
      },
    });
    expect(client.ofType('command/rejected')[0]?.problems[0]?.code).toBe('invalid-solid');
  });

  it('holds a prepared file for ten minutes', async () => {
    let time = 1_000_000;
    const { session: opened } = await open(testProject(), () => time);
    const client = new FakeClient();
    await sendFile(opened, client, ARM);
    const hash = client.ofType('solid/prepared')[0]?.hash as string;
    time += 10 * 60 * 1000 + 1;
    await ask(opened, client, {
      type: 'command',
      requestId: 'c1',
      command: { type: 'define-solid', package: 'shop', solid: definition(hash) },
    });
    expect(client.ofType('command/rejected')[0]?.problems[0]?.code).toBe('invalid-solid');
  }, 60_000);

  it('answers a file that does not clean with why, and pieces that do not fit together', async () => {
    const { session: opened } = await open();
    const client = new FakeClient();
    await sendFile(opened, client, new TextEncoder().encode('{"asset":{"version":"1.0"}}'), 'p1');
    expect(client.ofType('solid/refused')).toEqual([
      {
        type: 'solid/refused',
        requestId: 'p1',
        code: 'invalid-solid',
        message: 'The file is not glTF 2.0.',
      },
    ]);
    // A first piece that is not a whole MiB, of a file in two.
    for (const index of [0, 1]) {
      await ask(opened, client, {
        type: 'solid/prepare',
        requestId: 'p2',
        fileName: 'arm.glb',
        piece: { index, count: 2, data: 'AAAA' },
      });
    }
    expect(client.ofType('solid/refused')[1]).toEqual({
      type: 'solid/refused',
      requestId: 'p2',
      code: 'invalid-solid',
      message: 'The pieces of the file to import do not fit together.',
    });
  }, 60_000);

  it('imports a prepared file as the one action the command line and Claude ask for', async () => {
    const { session: opened, folder: at } = await open();
    const prepared = await opened.prepareSolid(ARM.slice(), 'arm.glb');
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const outcome = await opened.importSolid(prepared.prepared.hash, {}, 'user');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.label).toBe('Import "arm.glb" as a solid');
    expect(outcome.author).toBe('user');
    const stored = opened.snapshot.packages.find((file) => file.id === 'shop')?.solids?.[0];
    expect(stored?.name).toBe('arm');
    expect(stored?.id).toMatch(/^shop\.arm-[a-z0-9]+$/);
    expect(stored?.camera).toEqual({ azimuth: 30, elevation: 20 });
    expect((await stat(solidFilePath(at, prepared.prepared.hash))).isFile()).toBe(true);
  }, 60_000);
});

describe('opening, and the solid files (ADR 0075)', () => {
  it('warns of a named file that is missing or not of its size, and of none that is', async () => {
    const { bytes, hash } = await canonical();
    const good = definition(hash, { id: 'shop.good', name: 'Good', bytes: bytes.length });
    const missing = definition('f'.repeat(64), { id: 'shop.missing', name: 'Missing' });
    const short = definition('a'.repeat(64), { id: 'shop.short', name: 'Short', bytes: 10 });
    const project = testProject();
    const { session: opened, folder: at } = await open({
      ...project,
      packages: project.packages.map((file) =>
        file.id === 'shop' ? { ...file, solids: [good, missing, short] } : file,
      ),
    });
    await writeSolid(at, bytes);
    await writeSolid(at, new Uint8Array(3), 'a'.repeat(64));
    const messages = opened.warnings().map((each) => each.message);
    expect(messages).toContain(
      `The solid "Missing" names the file "solids/${'f'.repeat(64)}.glb", which the project does not have; it is drawn as its placeholder.`,
    );
    expect(messages).toContain(
      `The solid "Short" names the file "solids/${'a'.repeat(64)}.glb" of 10 bytes, but it holds 3; it is drawn as its placeholder.`,
    );
    expect(messages.some((each) => each.includes('"Good"'))).toBe(false);
  }, 60_000);
});
