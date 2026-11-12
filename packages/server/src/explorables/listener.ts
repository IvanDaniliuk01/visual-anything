/**
 * The explorables' listener (ADR 0107): the local program's second loopback listener, which serves
 * each approved explorable's frame document and nothing else.
 *
 * - It binds to 127.0.0.1 only, on a port of its own, and is reached as
 *   `http://<label>.localhost:<port>/<nonce>/frame/<explorable>/<approval hash>`, with a fresh label
 *   for each frame, so that each frame is a site of its own, and the nonce made for this run of the
 *   program, which is not the session token.
 * - It refuses any request that carries an `Origin` header, and any `Host` that is not a label of its
 *   port under `localhost` (`isFrameHost`), which stops DNS rebinding; any method but GET; and a
 *   request the browser says is for anything but a frame (`Sec-Fetch-Dest`).
 * - It serves the frame with the frame's policy as its `Content-Security-Policy` header, with
 *   `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and no caching, and no other
 *   header: none that loosens anything.
 *
 * What it serves, and whether it may, is the session's to say (`serve`): it hashes the exact text and
 * library bytes it serves and serves only an approved frame whose hash the address names.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { FRAME_NONCE, isFrameHost, readExplorableFramePath } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { sendText } from '../responses';

/** The address the listener binds to: this computer only. */
export const FRAME_HOST = '127.0.0.1';

/** What the session says of a frame an address names: its document and policy, or why not. */
export type FrameAnswer =
  | { ok: true; html: string; policy: string }
  | { ok: false; status: 403 | 404 | 500; message: string };

export interface FrameListenerOptions {
  /** The port to listen on; 0 or absent lets the system pick a free one. */
  port?: number;
  /** The nonce every frame's path starts with; a fresh one by default. */
  nonce?: string;
  /** Serves the frame an address names, once the request passed every check. */
  serve(explorable: Id, hash: string): Promise<FrameAnswer>;
  /** Hears of a request that failed unexpectedly. */
  err?: (line: string) => void;
}

/** The running listener. */
export interface FrameListener {
  readonly port: number;
  readonly nonce: string;
  close(): Promise<void>;
}

/** A nonce for a run of the program: 24 random bytes in base64url, 32 characters. */
export function createFrameNonce(): string {
  return randomBytes(24).toString('base64url');
}

/** Headers of the frame document: its policy, and nothing that loosens it. */
function frameHeaders(policy: string, length: number): Record<string, string | number> {
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': length,
    'Content-Security-Policy': policy,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
  };
}

/** Starts the explorables' listener on 127.0.0.1, and resolves once it listens. */
export async function startFrameListener(options: FrameListenerOptions): Promise<FrameListener> {
  const nonce = options.nonce ?? createFrameNonce();
  if (!FRAME_NONCE.test(nonce)) throw new Error('A frame nonce is 22 to 64 base64url characters.');
  let port = options.port ?? 0;
  const server = createServer();
  const sockets = new Set<Socket>();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  const refuse = (response: ServerResponse, status: number, message: string) =>
    sendText(response, status, message, { 'Cache-Control': 'no-store' });

  server.on('request', (request: IncomingMessage, response: ServerResponse) => {
    const { headers } = request;
    // A frame's navigation carries no Origin; a script's fetch or a form from any page does.
    if (headers.origin !== undefined) {
      refuse(response, 403, 'The explorables’ listener answers no request that says its origin.');
      return;
    }
    if (!isFrameHost(headers.host, port)) {
      refuse(response, 403, 'The explorables’ listener answers only its own frames’ addresses.');
      return;
    }
    if (request.method !== 'GET') {
      sendText(response, 405, 'A frame is read with GET.', {
        Allow: 'GET',
        'Cache-Control': 'no-store',
      });
      return;
    }
    const destination = headers['sec-fetch-dest'];
    if (destination !== undefined && destination !== 'iframe') {
      refuse(response, 403, 'The explorables’ listener serves frames only.');
      return;
    }
    const path = request.url ?? '';
    const named = sameNonce(path, nonce) ? readExplorableFramePath(path, nonce) : undefined;
    if (named === undefined) {
      refuse(response, 404, 'Not found.');
      return;
    }
    options
      .serve(named.explorable, named.hash)
      .then((answer) => {
        if (!answer.ok) {
          refuse(response, answer.status, answer.message);
          return;
        }
        const body = Buffer.from(answer.html, 'utf8');
        response.writeHead(200, frameHeaders(answer.policy, body.length));
        response.end(body);
      })
      .catch((error: unknown) => {
        options.err?.(`The explorables’ listener failed to answer: ${String(error)}`);
        if (response.headersSent) response.destroy();
        else refuse(response, 500, 'The local program failed to answer this request.');
      });
  });

  port = await new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen({ port, host: FRAME_HOST }, () => {
      server.off('error', reject);
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('The explorables’ listener listens on no TCP port.'));
      } else resolve(address.port);
    });
  });
  server.on('error', (error) =>
    options.err?.(`The explorables’ listener failed: ${String(error)}`),
  );

  let closing: Promise<void> | undefined;
  return {
    port,
    nonce,
    close: () =>
      (closing ??= new Promise<void>((resolve) => {
        server.close(() => resolve());
        for (const socket of sockets) socket.destroy();
      })),
  };
}

/** Whether a path's first part is the nonce, compared in constant time. */
function sameNonce(path: string, nonce: string): boolean {
  const first = path.split('/')[1] ?? '';
  const given = Buffer.from(first, 'utf8');
  const expected = Buffer.from(nonce, 'utf8');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
