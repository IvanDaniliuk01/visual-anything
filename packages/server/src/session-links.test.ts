/**
 * Link cards in the program (ADR 0098, stage 3):
 *
 * - `link/fetch` fetches a card's preview only over https, from a stub server here, never the
 *   internet, and answers `link/fetched` with its title, description and picture, the picture kept
 *   in `media/` as any picture's file, or `link/refused`;
 * - a card is taken only when the picture it names is in `media/`, and that file is never listed as
 *   unnamed.
 */
import { createServer, request as httpRequest, type Server } from 'node:http';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkMediaFile,
  cleanMedia,
  decodeBase64,
  encodeMessage,
  type AppMessage,
} from '@visual-anything/core';
import type { MediaRef } from '@visual-anything/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Requester, Resolver } from './live-fetch';
import { mediaFilePath } from './media/files';
import { openSession, type Session } from './session';
import { FakeClient, testProject, writeProjectFolder } from './test-support';

/** A 1 × 1 PNG. */
const PNG = decodeBase64(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
) as Uint8Array;

let server: Server;
let port: number;
let paths: string[];
let folder: string | undefined;
let session: Session | undefined;

beforeEach(async () => {
  paths = [];
  server = createServer((request, response) => {
    paths.push(request.url ?? '');
    if (request.url === '/guide') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(`<head><title>Intake</title>
        <meta property="og:description" content="How a patient is received.">
        <meta property="og:image" content="/intake.png"></head>`);
    } else if (request.url === '/intake.png') {
      response.writeHead(200, { 'content-type': 'image/png' });
      response.end(Buffer.from(PNG));
    } else if (request.url === '/fake') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<meta property="og:image" content="/not-an-image.png"><title>Fake</title>');
    } else {
      response.writeHead(200, { 'content-type': 'image/png' });
      response.end('<svg xmlns="http://www.w3.org/2000/svg"/>');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterEach(async () => {
  await session?.close();
  if (folder !== undefined) await rm(folder, { recursive: true, force: true, maxRetries: 10 });
  session = undefined;
  folder = undefined;
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const PUBLIC: Resolver = () => Promise.resolve([{ address: '93.184.216.34', family: 4 }]);

/** Every request goes to the stub server here, whatever it was meant to reach. */
const toStub: Requester = (_secure, options, onResponse) =>
  httpRequest(
    { host: '127.0.0.1', port, path: options.path, method: 'GET', headers: options.headers },
    onResponse,
  );

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

async function open(): Promise<{ session: Session; folder: string }> {
  folder = await mkdtemp(join(tmpdir(), 'va-links-'));
  await writeProjectFolder(folder, testProject());
  const result = await openSession(folder, {
    watch: false,
    out: () => {},
    err: () => {},
    media: inThread,
    links: { resolve: PUBLIC, request: toStub },
  });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  session = result.session;
  return { session, folder };
}

function ask(target: Session, client: FakeClient, message: AppMessage): Promise<void> {
  return target.receive(client, encodeMessage(message));
}

describe('link/fetch (ADR 0098, stage 3)', () => {
  it('fetches a page’s preview, and keeps its image in media/', async () => {
    const { session: opened, folder: at } = await open();
    const client = new FakeClient();
    await ask(opened, client, { type: 'link/fetch', requestId: 'f', url: 'https://a.org/guide' });
    const [fetched] = client.ofType('link/fetched');
    expect(fetched).toMatchObject({
      requestId: 'f',
      preview: {
        title: 'Intake',
        description: 'How a patient is received.',
        picture: { format: 'png', width: 1, height: 1 },
      },
      notes: [],
    });
    const picture = fetched?.preview.picture as MediaRef;
    expect((await stat(mediaFilePath(at, picture.hash, 'png'))).size).toBe(picture.bytes);
    expect(paths).toEqual(['/guide', '/intake.png']);
    // Fetching changed no project file and nothing in the history.
    expect(opened.snapshot.views[0]?.freeShapes.some((shape) => shape.kind === 'link')).toBe(false);
  });

  it('leaves out an image that is not one, and says why', async () => {
    const { session: opened, folder: at } = await open();
    const client = new FakeClient();
    await ask(opened, client, { type: 'link/fetch', requestId: 'f', url: 'https://a.org/fake' });
    const [fetched] = client.ofType('link/fetched');
    expect(fetched?.preview).toEqual({ title: 'Fake' });
    expect(fetched?.notes).toEqual([
      "The page's image, https://a.org/not-an-image.png, is left out: it is not a PNG, JPEG, WebP or GIF.",
    ]);
    await expect(stat(join(at, 'media'))).rejects.toThrow();
  });

  it('refuses an address that is not https, reaching nothing', async () => {
    const { session: opened } = await open();
    const client = new FakeClient();
    await ask(opened, client, { type: 'link/fetch', requestId: 'f', url: 'http://a.org/guide' });
    expect(client.ofType('link/refused')[0]).toMatchObject({
      requestId: 'f',
      code: 'link-refused',
    });
    expect(paths).toEqual([]);
  });
});

describe('link cards name only pictures the program kept', () => {
  const card = {
    kind: 'link' as const,
    x: 0,
    y: 0,
    width: 320,
    height: 280,
    url: 'https://a.org/guide',
    title: 'Intake',
  };

  it('takes a card whose picture is kept, never lists that file as unnamed, and refuses one that is not', async () => {
    const { session: opened } = await open();
    const client = new FakeClient();
    await ask(opened, client, { type: 'link/fetch', requestId: 'f', url: 'https://a.org/guide' });
    const picture = client.ofType('link/fetched')[0]?.preview.picture as MediaRef;
    const missing = await opened.execute(
      {
        type: 'create-free-shape',
        view: 'overview',
        shape: { ...card, picture: { ...picture, hash: 'e'.repeat(64) } },
      },
      'claude',
    );
    expect(missing).toMatchObject({ ok: false, problems: [{ code: 'media-file-missing' }] });
    const changed = await opened.execute(
      { type: 'create-free-shape', view: 'overview', shape: { ...card, id: 'guide' } },
      'user',
    );
    expect(changed.ok).toBe(true);
    const unknown = await opened.execute(
      {
        type: 'update-free-shape',
        view: 'overview',
        id: 'guide',
        changes: { picture: { ...picture, hash: 'e'.repeat(64) } },
      },
      'claude',
    );
    expect(unknown).toMatchObject({ ok: false, problems: [{ code: 'media-file-missing' }] });
    const given = await opened.execute(
      { type: 'update-free-shape', view: 'overview', id: 'guide', changes: { picture } },
      'user',
    );
    expect(given.ok).toBe(true);
    await ask(opened, client, { type: 'media-files/list', requestId: 'l' });
    expect(client.ofType('media-files/listed')[0]?.files).toEqual([]);
  });
});
