/**
 * The program's media files over the live connection (ADR 0098):
 *
 * - `media/put` takes a picture's file in pieces, cleans it in the worker, writes it to `media/` once
 *   and answers `media/stored` with its reference, or `media/refused`;
 * - a picture is taken only when the file it names is in `media/`, and undoing it leaves the file;
 * - `media/get` serves a file in pieces only when it is exactly what cleaning writes;
 * - `media-files/list` and `-/remove` list and remove the files no picture names, never others;
 * - `add_picture`'s reading takes a file inside the project folder only.
 */
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MEDIA_PIECE_BYTES,
  checkMediaFile,
  cleanMedia,
  decodeBase64,
  encodeBase64,
  encodeMessage,
  solidHash,
  type AppMessage,
  type MediaStoredMessage,
} from '@visual-anything/core';
import type { MediaRef } from '@visual-anything/schema';
import { afterEach, describe, expect, it } from 'vitest';
import { mediaFilePath } from './media/files';
import { openSession, type Session } from './session';
import { FakeClient, testProject, writeProjectFolder } from './test-support';

let folder: string | undefined;
let session: Session | undefined;

/** Cleaning and checking in this thread, as the worker does them, so the tests run quickly. */
const inThread = {
  clean: (bytes: Uint8Array) => {
    const cleaned = cleanMedia(bytes);
    return Promise.resolve(
      cleaned.ok
        ? {
            ok: true as const,
            media: cleaned.ref,
            bytes: cleaned.bytes,
            removed: [...cleaned.removed],
          }
        : { ok: false as const, problems: [cleaned.problem] },
    );
  },
  check: (bytes: Uint8Array, hash: string, format: MediaRef['format']) => {
    const checked = checkMediaFile(bytes, hash, format);
    return Promise.resolve(
      checked.ok
        ? { ok: true as const, checked: true as const }
        : { ok: false as const, problems: [checked.problem] },
    );
  },
};

async function open(worker = false): Promise<{ session: Session; folder: string }> {
  folder = await mkdtemp(join(tmpdir(), 'va-media-'));
  await writeProjectFolder(folder, testProject());
  const result = await openSession(folder, {
    watch: false,
    out: () => {},
    err: () => {},
    ...(worker ? {} : { media: inThread }),
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

/** A 1 × 1 PNG. */
const PNG = decodeBase64(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
) as Uint8Array;
/** A 1 × 1 GIF, with a comment before its end. */
const GIF_BODY = decodeBase64(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
) as Uint8Array;
const GIF = Uint8Array.from([
  ...GIF_BODY.subarray(0, -1),
  0x21,
  0xfe,
  5,
  ...[...'hello'].map((each) => each.charCodeAt(0)),
  0,
  0x3b,
]);

function ask(target: Session, client: FakeClient, message: AppMessage): Promise<void> {
  return target.receive(client, encodeMessage(message));
}

async function put(
  target: Session,
  client: FakeClient,
  bytes: Uint8Array,
  requestId = 'm1',
): Promise<void> {
  const count = Math.max(1, Math.ceil(bytes.length / MEDIA_PIECE_BYTES));
  for (let index = 0; index < count; index++) {
    const data = encodeBase64(
      bytes.subarray(index * MEDIA_PIECE_BYTES, (index + 1) * MEDIA_PIECE_BYTES),
    );
    await ask(target, client, {
      type: 'media/put',
      requestId,
      fileName: 'desk.gif',
      piece: { index, count, data },
    });
  }
}

function stored(client: FakeClient): MediaStoredMessage {
  const [message] = client.ofType('media/stored');
  if (message === undefined) throw new Error(JSON.stringify(client.messages));
  return message;
}

describe('media/put (ADR 0098)', () => {
  it('cleans a file sent in pieces and writes it to media/ once, named by its hash', async () => {
    const { session: opened, folder: at } = await open();
    const client = new FakeClient();
    await put(opened, client, GIF);
    const { media, removed } = stored(client);
    expect(media).toMatchObject({ format: 'gif', width: 1, height: 1 });
    expect(removed).toEqual(['1 comment']);
    const written = await readFile(mediaFilePath(at, media.hash, 'gif'));
    expect(solidHash(written)).toBe(media.hash);
    expect(written.length).toBe(media.bytes);
    expect(written.includes(Buffer.from('hello'))).toBe(false);
  });

  it('refuses what is not a picture, and writes nothing', async () => {
    const { session: opened, folder: at } = await open();
    const client = new FakeClient();
    await put(opened, client, new TextEncoder().encode('%PDF-1.7 not a picture'));
    expect(client.ofType('media/refused')[0]).toMatchObject({ code: 'invalid-image' });
    await expect(stat(join(at, 'media'))).rejects.toThrow();
  });

  it('refuses pieces that do not fit together', async () => {
    const { session: opened } = await open();
    const client = new FakeClient();
    await ask(opened, client, {
      type: 'media/put',
      requestId: 'm',
      fileName: 'a.png',
      piece: { index: 0, count: 2, data: encodeBase64(PNG) },
    });
    expect(client.ofType('media/refused')[0]).toMatchObject({ code: 'invalid-image' });
  });

  it('cleans in the worker thread', async () => {
    const { session: opened } = await open(true);
    const client = new FakeClient();
    await put(opened, client, GIF);
    expect(stored(client).media.format).toBe('gif');
  }, 60_000);
});

describe('pictures name only files the program kept (ADR 0098)', () => {
  it('takes a picture of a kept file, and undoing it leaves the file', async () => {
    const { session: opened, folder: at } = await open();
    const client = new FakeClient();
    await put(opened, client, PNG);
    const { media } = stored(client);
    const outcome = await opened.execute(
      {
        type: 'create-free-shape',
        view: 'overview',
        shape: { kind: 'picture', x: 0, y: 0, width: 32, height: 32, media },
      },
      'user',
    );
    expect(outcome.ok).toBe(true);
    await opened.undo();
    expect(opened.snapshot.views[0]?.freeShapes.some((shape) => shape.kind === 'picture')).toBe(
      false,
    );
    expect((await stat(mediaFilePath(at, media.hash, 'png'))).size).toBe(media.bytes);
  });

  it('refuses a picture whose file the project does not have', async () => {
    const { session: opened } = await open();
    const outcome = await opened.execute(
      {
        type: 'create-free-shape',
        view: 'overview',
        shape: {
          kind: 'picture',
          x: 0,
          y: 0,
          width: 32,
          height: 32,
          media: { hash: 'e'.repeat(64), format: 'png', width: 1, height: 1, bytes: 9 },
        },
      },
      'claude',
    );
    expect(outcome).toMatchObject({ ok: false, problems: [{ code: 'media-file-missing' }] });
  });

  it('refuses a picture changed part by part to a file the project does not have (ADR 0104)', async () => {
    const { session: opened } = await open();
    const client = new FakeClient();
    await put(opened, client, PNG);
    const { media } = stored(client);
    const created = await opened.execute(
      {
        type: 'create-free-shape',
        view: 'overview',
        shape: { kind: 'picture', id: 'photo', x: 0, y: 0, width: 32, height: 32, media },
      },
      'user',
    );
    expect(created.ok).toBe(true);
    const outcome = await opened.execute(
      {
        type: 'update-free-shape',
        view: 'overview',
        id: 'photo',
        changes: { media: { ...media, hash: 'e'.repeat(64), bytes: 9 } },
      },
      'claude',
    );
    expect(outcome).toMatchObject({ ok: false, problems: [{ code: 'media-file-missing' }] });
  });
});

describe('media/get (ADR 0098)', () => {
  it('serves a kept file in pieces', async () => {
    const { session: opened } = await open();
    const client = new FakeClient();
    await put(opened, client, PNG);
    const { media } = stored(client);
    await ask(opened, client, { type: 'media/get', requestId: 'g', hash: media.hash });
    const [piece] = client.ofType('media/piece');
    expect(piece?.piece.count).toBe(1);
    expect(solidHash(decodeBase64(piece?.piece.data ?? '') as Uint8Array)).toBe(media.hash);
  });

  it('refuses a missing file, and one placed by hand that cleaning would rewrite', async () => {
    const { session: opened, folder: at } = await open();
    const client = new FakeClient();
    await ask(opened, client, { type: 'media/get', requestId: 'g1', hash: 'f'.repeat(64) });
    expect(client.ofType('media/refused')[0]).toMatchObject({ code: 'media-file-missing' });
    // Named by its own hash, and the GIF reader takes it, but its comment is not cleaning's.
    const hash = solidHash(GIF);
    await mkdir(join(at, 'media'), { recursive: true });
    await writeFile(mediaFilePath(at, hash, 'gif'), GIF);
    await ask(opened, client, { type: 'media/get', requestId: 'g2', hash });
    expect(client.ofType('media/refused')[1]).toMatchObject({ code: 'media-not-clean' });
    expect(client.ofType('media/piece')).toEqual([]);
  });
});

describe('media-files/list and -/remove (ADR 0098)', () => {
  it('lists and removes only the files no picture names', async () => {
    const { session: opened, folder: at } = await open();
    const client = new FakeClient();
    await put(opened, client, PNG, 'a');
    await put(opened, client, GIF, 'b');
    const [png, gif] = client.ofType('media/stored').map((each) => each.media) as [
      MediaRef,
      MediaRef,
    ];
    await opened.execute(
      {
        type: 'create-free-shape',
        view: 'overview',
        shape: { kind: 'picture', x: 0, y: 0, width: 32, height: 32, media: png },
      },
      'user',
    );
    await ask(opened, client, { type: 'media-files/list', requestId: 'l' });
    expect(client.ofType('media-files/listed')[0]?.files).toEqual([
      { hash: gif.hash, format: 'gif', bytes: gif.bytes },
    ]);
    await ask(opened, client, {
      type: 'media-files/remove',
      requestId: 'r',
      hashes: [gif.hash, png.hash],
    });
    const answer = client.ofType('media-files/listed')[1];
    expect(answer?.removed).toEqual([gif.hash]);
    expect(answer?.kept).toEqual([
      { hash: png.hash, message: 'A picture names this media file, so it stays.' },
    ]);
    await expect(stat(mediaFilePath(at, gif.hash, 'gif'))).rejects.toThrow();
    expect((await stat(mediaFilePath(at, png.hash, 'png'))).isFile()).toBe(true);
  });
});

describe('add_picture’s reading (ADR 0098)', () => {
  it('keeps an image file inside the project folder, and nothing outside it', async () => {
    const { session: opened, folder: at } = await open();
    await mkdir(join(at, 'photos'), { recursive: true });
    await writeFile(join(at, 'photos', 'desk.png'), PNG);
    const kept = await opened.keepProjectPicture('photos/desk.png');
    expect(kept).toMatchObject({ ok: true, fileName: 'desk.png', media: { format: 'png' } });
    expect(await opened.keepProjectPicture('../outside.png')).toMatchObject({
      ok: false,
      problem: { code: 'invalid-file' },
    });
    expect(await opened.keepProjectPicture('project.vaproject')).toMatchObject({
      ok: false,
      problem: { code: 'invalid-file' },
    });
  });
});

/** A 64 × 48 MP4 of H.264, its container only, with a phone's place in udta. */
const MP4 = decodeBase64(
  'AAAAHGZ0eXBpc29tAAACAGlzb21pc28yYXZjMQAAAeVtb292AAAAbG12aGQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABT3RyYWsAAABcdGtoZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAQAAAADAAAAAAAOttZGlhAAAAIG1kaGQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAmaGRscgAAAAAAAAAAdmlkZQAAAAAAAAAAAAAAAFRyYWNrAAAAAJ1taW5mAAAACGRpbmYAAACNc3RibAAAAHVzdHNkAAAAAAAAAAEAAABlYXZjMQAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAABAADAASAAAAEgAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABj//wAAAA9hdmNDAWQAH//gAAAAABBzdHRzAAAAAAAAAAAAAAAidWR0YQAAABqpeHl6KzQ4Ljg1ODQrMDAyLjI5NDUvAAAADm1kYXQAAAACZYg=',
) as Uint8Array;

describe('videos (ADR 0098, stage 2)', () => {
  it('keeps an MP4, its place overwritten, and serves it back as kept', async () => {
    const { session: opened, folder: at } = await open();
    const client = new FakeClient();
    await put(opened, client, MP4);
    const { media, removed } = stored(client);
    expect(media).toMatchObject({ format: 'mp4', width: 64, height: 48, bytes: MP4.length });
    expect(removed).toContain('1 metadata box (udta)');
    const written = await readFile(mediaFilePath(at, media.hash, 'mp4'));
    expect(written.includes(Buffer.from('+48.8584'))).toBe(false);
    await ask(opened, client, { type: 'media/get', requestId: 'g', hash: media.hash });
    expect(client.ofType('media/piece')[0]?.piece.count).toBe(1);
  });

  it('takes a video only when its file and its poster are kept, and lists neither as unnamed', async () => {
    const { session: opened } = await open();
    const client = new FakeClient();
    await put(opened, client, MP4, 'v');
    await put(opened, client, PNG, 'p');
    const [media, poster] = client.ofType('media/stored').map((each) => each.media) as [
      MediaRef,
      MediaRef,
    ];
    const video = { kind: 'picture' as const, x: 0, y: 0, width: 64, height: 48, media };
    const missing = await opened.execute(
      {
        type: 'create-free-shape',
        view: 'overview',
        shape: { ...video, poster: { ...poster, hash: 'e'.repeat(64) } },
      },
      'user',
    );
    expect(missing).toMatchObject({ ok: false, problems: [{ code: 'media-file-missing' }] });
    const added = await opened.execute(
      { type: 'create-free-shape', view: 'overview', shape: { ...video, poster } },
      'user',
    );
    expect(added.ok).toBe(true);
    await ask(opened, client, { type: 'media-files/list', requestId: 'l' });
    expect(client.ofType('media-files/listed')[0]?.files).toEqual([]);
  });

  it('reads a video of the project folder for add_video', async () => {
    const { session: opened, folder: at } = await open();
    await writeFile(join(at, 'check-in.mp4'), MP4);
    const kept = await opened.keepProjectPicture('check-in.mp4');
    expect(kept).toMatchObject({ ok: true, media: { format: 'mp4' }, fileName: 'check-in.mp4' });
  });
});
