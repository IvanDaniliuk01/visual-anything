/**
 * The program serves a solid's file over the live connection (ADR 0075): `solid/get` names the file by
 * its hash, and the program answers with its pieces, or with why not. A file whose bytes are not its
 * name's is never served, and solids add no HTTP route.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SOLID_PIECE_BYTES,
  decodeBase64,
  encodeMessage,
  solidHash,
  type AppMessage,
} from '@visual-anything/core';
import { afterEach, describe, expect, it } from 'vitest';
import { openSession, type Session } from './session';
import { solidFilePath } from './solids/serve';
import { FakeClient, testProject, writeProjectFolder } from './test-support';

let folder: string | undefined;
let session: Session | undefined;

async function open(): Promise<{ session: Session; folder: string }> {
  folder = await mkdtemp(join(tmpdir(), 'va-solids-'));
  await writeProjectFolder(folder, testProject());
  const result = await openSession(folder, { watch: false, out: () => {}, err: () => {} });
  if (!result.ok) throw new Error('The test project does not open.');
  session = result.session;
  return { session, folder };
}

afterEach(async () => {
  await session?.close();
  if (folder !== undefined) await rm(folder, { recursive: true, force: true, maxRetries: 10 });
  session = undefined;
  folder = undefined;
});

async function writeSolid(at: string, bytes: Uint8Array, name = solidHash(bytes)): Promise<string> {
  await mkdir(join(at, 'solids'), { recursive: true });
  await writeFile(solidFilePath(at, name), bytes);
  return name;
}

function ask(target: Session, client: FakeClient, message: AppMessage): Promise<void> {
  return target.receive(client, encodeMessage(message));
}

describe('solid/get (ADR 0075)', () => {
  it('answers with the file’s pieces of at most 1 MiB, in order, which make its bytes again', async () => {
    const { session: opened, folder: at } = await open();
    const bytes = new Uint8Array(SOLID_PIECE_BYTES * 2 + 5);
    for (let index = 0; index < bytes.length; index++) bytes[index] = (index * 31) % 251;
    const hash = await writeSolid(at, bytes);
    const client = new FakeClient();
    await ask(opened, client, { type: 'solid/get', requestId: 'r1', hash });
    const pieces = client.ofType('solid/piece');
    expect(pieces.map((each) => [each.piece.index, each.piece.count])).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
    ]);
    expect(pieces.every((each) => each.requestId === 'r1' && each.hash === hash)).toBe(true);
    const parts = pieces.map((each) => decodeBase64(each.piece.data) as Uint8Array);
    expect(parts.map((each) => each.length)).toEqual([SOLID_PIECE_BYTES, SOLID_PIECE_BYTES, 5]);
    const joined = new Uint8Array(bytes.length);
    let offset = 0;
    for (const part of parts) {
      joined.set(part, offset);
      offset += part.length;
    }
    expect(joined).toEqual(bytes);
  });

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

  it('refuses a name that is a folder rather than a regular file', async () => {
    const { session: opened, folder: at } = await open();
    await mkdir(solidFilePath(at, 'd'.repeat(64)), { recursive: true });
    const client = new FakeClient();
    await ask(opened, client, { type: 'solid/get', requestId: 'r1', hash: 'd'.repeat(64) });
    expect(client.ofType('solid/refused')[0]?.code).toBe('solid-file-missing');
  });

  it('answers an import with a refusal until the cleaner comes, once for its pieces', async () => {
    const { session: opened } = await open();
    const client = new FakeClient();
    for (const index of [0, 1]) {
      await ask(opened, client, {
        type: 'solid/prepare',
        requestId: 'r2',
        fileName: 'arm.glb',
        piece: { index, count: 2, data: 'AAAA' },
      });
    }
    expect(client.ofType('solid/refused').map((each) => [each.requestId, each.code])).toEqual([
      ['r2', 'program-failed'],
    ]);
  });
});
