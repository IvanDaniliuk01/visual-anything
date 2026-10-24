/**
 * Helpers for the tests: a small project and its folder, and clients that talk to a running local
 * program over HTTP and WebSocket.
 */
import { realpathSync } from 'node:fs';
import * as fsp from 'node:fs/promises';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { request, type IncomingHttpHeaders, type OutgoingHttpHeaders } from 'node:http';
import { connect } from 'node:net';
import { dirname, join, relative } from 'node:path';
import {
  SYSTEMS,
  builtinPackage,
  decodeServerMessage,
  type ProjectSnapshot,
  type ServerMessage,
} from '@visual-anything/core';
import type { FileContentByKind, FileKind, PackageFile } from '@visual-anything/schema';
import { formatFile } from '@visual-anything/schema/format';
import { WebSocket, type RawData } from 'ws';
import type { SessionClient } from './session';
import { isTemporaryFile, type WriterFs } from './writer';

/** The project's own package in {@link testProject}. */
export const SHOP: PackageFile = {
  id: 'shop',
  name: 'Shop',
  description: 'What a shop needs beyond the built-in Systems package.',
  components: [
    {
      id: 'shop.cart',
      name: 'Cart',
      derivesFrom: 'systems.box',
      attributes: [{ name: 'items', type: 'number', default: 0 }],
    },
  ],
  relationTypes: [
    { id: 'shop.holds', name: 'holds', derivesFrom: 'relates-to', direction: 'directed' },
  ],
};

/**
 * A small project that uses the built-in Systems package and one of its own: a system holding an API
 * and a database, a customer outside it, one view and one scenario.
 */
export function testProject(): ProjectSnapshot {
  return {
    project: { schemaVersion: 1, name: 'Shop', packages: ['systems', 'shop'] },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [
        { id: 'system', component: 'systems.system', name: 'Shop system' },
        { id: 'api', component: 'systems.service', name: 'API', attributes: { owner: 'Team A' } },
        { id: 'db', component: 'systems.database', name: 'DB' },
        { id: 'customer', component: 'systems.person', name: 'Customer' },
        { id: 'cart', component: 'shop.cart', name: 'Cart', appearance: { fill: '#F8E1EC' } },
      ],
      relations: [
        { id: 'api-in-system', relationType: 'systems.is-part-of', from: 'api', to: 'system' },
        { id: 'db-in-system', relationType: 'systems.is-part-of', from: 'db', to: 'system' },
        {
          id: 'customer-calls-api',
          relationType: 'systems.communicates-with',
          from: 'customer',
          to: 'api',
          name: 'HTTPS',
        },
        { id: 'api-reads-db', relationType: 'systems.reads-from', from: 'api', to: 'db' },
      ],
    },
    packages: [SYSTEMS, SHOP],
    views: [
      {
        id: 'overview',
        name: 'Overview',
        perspective: { name: 'Data flow' },
        nestingRelationTypes: ['systems.is-part-of'],
        positions: [
          { element: 'system', x: 0, y: 0, width: 400, height: 300 },
          { element: 'api', container: 'system', x: 20, y: 40 },
          { element: 'db', container: 'system', x: 20, y: 160 },
          { element: 'customer', x: -250, y: 40, pinned: true },
        ],
        freeShapes: [
          { kind: 'note', id: 'note', x: 0, y: 320, width: 200, height: 60, text: 'Hi' },
        ],
      },
    ],
    scenarios: [
      {
        id: 'request',
        name: 'A request',
        view: 'overview',
        steps: [
          {
            id: 'call',
            description: 'The customer calls the API.',
            relations: ['customer-calls-api'],
          },
          {
            id: 'read',
            description: 'The API reads the DB.',
            relations: ['api-reads-db'],
            dataOut: { rows: 3 },
          },
        ],
      },
    ],
  };
}

/** Formats a project file as {@link formatFile} does, or in another way. */
export type Formatter = <K extends FileKind>(kind: K, value: FileContentByKind[K]) => string;

/**
 * Writes a project into a folder, each file where a new one goes: `project.vaproject`,
 * `model.vamodel`, and `packages/`, `views/` and `scenarios/` files named after their ids. Built-in
 * packages get no file. Files are in {@link formatFile} form unless another formatter is given.
 */
export async function writeProjectFolder(
  folder: string,
  snapshot: ProjectSnapshot,
  format: Formatter = formatFile,
): Promise<void> {
  const files: [string, string][] = [
    ['project.vaproject', format('project', snapshot.project)],
    ['model.vamodel', format('model', snapshot.model)],
    ...snapshot.packages
      .filter((file) => builtinPackage(file.id) === undefined)
      .map((file): [string, string] => [`packages/${file.id}.vapackage`, format('package', file)]),
    ...snapshot.views.map((view): [string, string] => [
      `views/${view.id}.vaview`,
      format('view', view),
    ]),
    ...snapshot.scenarios.map((scenario): [string, string] => [
      `scenarios/${scenario.id}.vascenario`,
      format('scenario', scenario),
    ]),
  ];
  for (const [path, text] of files) await writeText(folder, path, text);
}

/** Writes text to a file of a folder, creating the folders it needs. */
export async function writeText(folder: string, path: string, text: string): Promise<void> {
  await mkdir(dirname(join(folder, path)), { recursive: true });
  await writeFile(join(folder, path), text);
}

/** Every file under a folder with its bytes, by path relative to it with forward slashes. */
export async function filesIn(folder: string): Promise<Map<string, Buffer>> {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true });
  const files = new Map<string, Buffer>();
  const paths = entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
  for (const path of paths) {
    files.set(relative(folder, path).replaceAll('\\', '/'), await readFile(path));
  }
  return files;
}

/** The text of a file under a folder. */
export function readText(folder: string, path: string): Promise<string> {
  return readFile(join(folder, path), 'utf8');
}

/** An app that keeps every message the local program sends it. */
export class FakeClient implements SessionClient {
  readonly messages: ServerMessage[] = [];

  send(message: ServerMessage): void {
    this.messages.push(message);
  }

  /** The messages of one type, in the order they came. */
  ofType<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }>[] {
    return this.messages.filter(
      (message): message is Extract<ServerMessage, { type: T }> => message.type === type,
    );
  }
}

/**
 * The real file system for the writer, recording the project files it writes and deletes, by path
 * relative to the folder.
 */
export function recordingFs(folder: string) {
  const written: string[] = [];
  const deleted: string[] = [];
  // The session writes through the folder's real path, which on Windows spells out a short name such
  // as `PCDIM-~1` in full.
  const real = realpathSync.native(folder);
  const project = (path: string) => relative(real, path).replaceAll('\\', '/');
  const fs: WriterFs = {
    open: (path, flags) => fsp.open(path, flags),
    rename: async (from, to) => {
      await fsp.rename(from, to);
      written.push(project(to));
    },
    unlink: async (path) => {
      await fsp.unlink(path);
      if (!isTemporaryFile(path)) deleted.push(project(path));
    },
    mkdir: (path, options) => fsp.mkdir(path, options),
  };
  return { fs, written, deleted };
}

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

/** An app on the live connection that keeps every message the local program sends it. */
export interface LiveClient {
  readonly messages: ServerMessage[];
  /** Sends a message: an object is sent as JSON, a string as it is. */
  send(message: object | string): void;
  /** Closes the connection and waits until it is closed. */
  close(): Promise<void>;
}

/** Opens the live connection from the app's own origin, with the session token. */
export async function openLiveClient(port: number, token: string): Promise<LiveClient> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/live?token=${token}`, {
    origin: `http://127.0.0.1:${port}`,
  });
  const messages: ServerMessage[] = [];
  socket.on('message', (data) => messages.push(decodeServerMessage(textOf(data))));
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });
  const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()));
  return {
    messages,
    send: (message) => socket.send(typeof message === 'string' ? message : JSON.stringify(message)),
    close: async () => {
      socket.close();
      await closed;
    },
  };
}
