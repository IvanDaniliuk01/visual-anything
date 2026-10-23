/** Helpers for the tests that talk to a running local program over HTTP and WebSocket. */
import { request, type IncomingHttpHeaders, type OutgoingHttpHeaders } from 'node:http';
import { connect } from 'node:net';
import { WebSocket, type RawData } from 'ws';

/** An HTTP response, with its body read as text. */
export interface Reply {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

/** Options for one request: the target is sent exactly as written, and Host defaults to the real one. */
export interface RequestOptions {
  method?: string;
  path?: string;
  headers?: OutgoingHttpHeaders;
}

/** Sends one HTTP request to 127.0.0.1 on a fresh connection. */
export function send(port: number, options: RequestOptions = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const outgoing = request(
      {
        host: '127.0.0.1',
        port,
        method: options.method ?? 'GET',
        path: options.path ?? '/',
        headers: options.headers,
        agent: false,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('error', reject);
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    outgoing.on('error', reject);
    outgoing.end();
  });
}

/** Writes raw bytes to the port and collects everything until the server closes the connection. */
export function sendRaw(port: number, text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port });
    const chunks: Buffer[] = [];
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.on('error', reject);
    socket.on('close', () => resolve(Buffer.concat(chunks).toString('utf8')));
    socket.end(text);
  });
}

/** The outcome of a WebSocket upgrade sent with http.request: refused with a status, or upgraded. */
export type UpgradeOutcome =
  | { upgraded: false; status: number; closed: Promise<void> }
  | { upgraded: true; protocol: string | undefined; close: () => void };

/** Sends a WebSocket upgrade request with the headers given and reports how the server answered. */
export function sendUpgrade(
  port: number,
  path: string,
  headers: OutgoingHttpHeaders = {},
): Promise<UpgradeOutcome> {
  return new Promise((resolve, reject) => {
    const outgoing = request({
      host: '127.0.0.1',
      port,
      path,
      agent: false,
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': Buffer.from('0123456789abcdef').toString('base64'),
        ...headers,
      },
    });
    outgoing.on('error', reject);
    outgoing.on('response', (response) => {
      const closed = new Promise<void>((done) => response.socket.once('close', () => done()));
      response.resume();
      resolve({ upgraded: false, status: response.statusCode ?? 0, closed });
    });
    outgoing.on('upgrade', (response, socket) => {
      socket.on('error', () => {});
      const protocol = response.headers['sec-websocket-protocol'];
      resolve({ upgraded: true, protocol, close: () => socket.destroy() });
    });
    outgoing.end();
  });
}

/** The outcome of opening the live connection: refused with a status, or open with its first message. */
export type LiveOutcome =
  { open: false; status: number } | { open: true; socket: WebSocket; firstMessage: string };

/** Options for opening the live connection with the `ws` client. */
export interface LiveOptions {
  /** The request target, `/live?token=…`. */
  path: string;
  /** The Origin header; none is sent when absent. */
  origin?: string;
  /** Replaces the Host header. */
  host?: string;
}

/** Opens the live connection with the `ws` client and waits for its first message or its refusal. */
export function openLive(port: number, options: LiveOptions): Promise<LiveOutcome> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (outcome: LiveOutcome) => {
      settled = true;
      resolve(outcome);
    };
    const socket = new WebSocket(`ws://127.0.0.1:${port}${options.path}`, {
      ...(options.origin !== undefined && { origin: options.origin }),
      ...(options.host !== undefined && { headers: { Host: options.host } }),
    });
    socket.on('error', (error) => {
      if (!settled) reject(error);
    });
    socket.once('unexpected-response', (outgoing, response) => {
      settle({ open: false, status: response.statusCode ?? 0 });
      outgoing.destroy();
    });
    socket.once('message', (data) => settle({ open: true, socket, firstMessage: textOf(data) }));
  });
}

/** The text of a WebSocket message. */
export function textOf(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return data.toString('utf8');
}
