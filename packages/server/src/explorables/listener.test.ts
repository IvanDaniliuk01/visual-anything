/**
 * The explorables' listener (ADR 0107), over real HTTP on 127.0.0.1: it serves only a frame's own
 * address, under the run's nonce, to a request with no Origin and a Host that is a fresh label of its
 * port under `localhost`, with the frame's policy as its header and nothing that loosens it.
 */
import { request, type IncomingHttpHeaders } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createFrameNonce, startFrameListener, type FrameListener } from './listener';

const HASH = 'a'.repeat(64);
const LABEL = 'k3f9q2xz8w7v6u5t';
const POLICY = "default-src 'none'; frame-ancestors http://127.0.0.1:47800; sandbox allow-scripts";

let listener: FrameListener | undefined;
let served: { explorable: string; hash: string }[] = [];

afterEach(async () => {
  await listener?.close();
  listener = undefined;
  served = [];
});

async function start(): Promise<FrameListener> {
  listener = await startFrameListener({
    serve: (explorable, hash) => {
      served.push({ explorable, hash });
      return Promise.resolve(
        explorable === 'math.missing'
          ? { ok: false, status: 404, message: 'No such explorable.' }
          : { ok: true, html: '<!DOCTYPE html><p>frame</p>', policy: POLICY },
      );
    },
  });
  return listener;
}

interface Reply {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

function get(
  port: number,
  path: string,
  headers: Record<string, string> = {},
  method = 'GET',
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const sent = request(
      { host: '127.0.0.1', port, path, method, headers, agent: false },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    sent.on('error', reject);
    sent.end();
  });
}

function framePath(nonce: string, explorable = 'math.quadratic', hash = HASH): string {
  return `/${nonce}/frame/${explorable}/${hash}`;
}

describe('the explorables’ listener', () => {
  it('serves an approved frame with its policy as the header, and no header that loosens it', async () => {
    const { port, nonce } = await start();
    const reply = await get(port, framePath(nonce), {
      host: `${LABEL}.localhost:${port}`,
      'sec-fetch-dest': 'iframe',
    });
    expect(reply.status).toBe(200);
    expect(reply.body).toBe('<!DOCTYPE html><p>frame</p>');
    expect(reply.headers['content-security-policy']).toBe(POLICY);
    expect(reply.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(reply.headers['x-content-type-options']).toBe('nosniff');
    expect(reply.headers['cache-control']).toBe('no-store');
    expect(reply.headers['referrer-policy']).toBe('no-referrer');
    for (const loosening of [
      'access-control-allow-origin',
      'x-frame-options',
      'set-cookie',
      'cross-origin-resource-policy',
    ]) {
      expect(reply.headers[loosening]).toBeUndefined();
    }
    expect(served).toEqual([{ explorable: 'math.quadratic', hash: HASH }]);
  });

  it('refuses any request that says its origin, whatever it is', async () => {
    const { port, nonce } = await start();
    for (const origin of ['null', 'http://127.0.0.1:47800', `http://${LABEL}.localhost:${port}`]) {
      const reply = await get(port, framePath(nonce), {
        host: `${LABEL}.localhost:${port}`,
        origin,
      });
      expect(reply.status).toBe(403);
      expect(reply.headers['x-frame-options']).toBe('DENY');
    }
    expect(served).toEqual([]);
  });

  it('refuses a Host that is not a label of its port under localhost, which stops DNS rebinding', async () => {
    const { port, nonce } = await start();
    for (const host of [
      `127.0.0.1:${port}`,
      `localhost:${port}`,
      `${LABEL}.localhost:${port + 1}`,
      `${LABEL}.localhost`,
      `${LABEL.toUpperCase()}.localhost:${port}`,
      `short.localhost:${port}`,
      `${LABEL}.evil.example:${port}`,
      `evil.example:${port}`,
      `a.${LABEL}.localhost:${port}`,
    ]) {
      const reply = await get(port, framePath(nonce), { host });
      expect(reply.status, host).toBe(403);
    }
    expect(served).toEqual([]);
  });

  it('answers only GET, and only for a frame', async () => {
    const { port, nonce } = await start();
    const host = `${LABEL}.localhost:${port}`;
    expect((await get(port, framePath(nonce), { host }, 'POST')).status).toBe(405);
    expect((await get(port, framePath(nonce), { host }, 'HEAD')).status).toBe(405);
    for (const destination of ['document', 'script', 'empty']) {
      const reply = await get(port, framePath(nonce), { host, 'sec-fetch-dest': destination });
      expect(reply.status).toBe(403);
    }
    expect(served).toEqual([]);
  });

  it('serves nothing but a frame’s address under the run’s nonce', async () => {
    const { port, nonce } = await start();
    const host = `${LABEL}.localhost:${port}`;
    for (const path of [
      '/',
      `/${nonce}`,
      `/${nonce}/frame/math.quadratic`,
      framePath(createFrameNonce()),
      framePath(nonce.slice(0, -1)),
      `${framePath(nonce)}?x=1`,
      framePath(nonce, 'math.quadratic', 'A'.repeat(64)),
      framePath(nonce, '../secret'),
      `/${nonce}/frame/math.quadratic/${HASH}/more`,
    ]) {
      expect((await get(port, path, { host })).status, path).toBe(404);
    }
    expect(served).toEqual([]);
    expect((await get(port, framePath(nonce, 'math.missing'), { host })).status).toBe(404);
  });

  it('listens on 127.0.0.1 only, with a nonce that is no token', async () => {
    const { port, nonce } = await start();
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{32}$/);
    await expect(
      new Promise((resolve, reject) => {
        const sent = request({ host: '::1', port, path: '/', agent: false }, resolve);
        sent.on('error', reject);
        sent.end();
      }),
    ).rejects.toThrow();
  });
});
