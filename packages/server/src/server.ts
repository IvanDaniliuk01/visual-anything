/**
 * The local program's HTTP server. It listens on 127.0.0.1 only, checks the Host and Origin of every
 * request, serves the app (its build, or its sources through Vite in dev mode) and opens the live
 * connection for a page that holds the per-session token.
 */
import { realpath } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import type { Duplex } from 'node:stream';
import {
  LIVE_PATH,
  PROTOCOL_VERSION,
  TOKEN_PARAM,
  encodeServerMessage,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { WebSocketServer } from 'ws';
import { refuseUpgrade, sendText, setSecurityHeaders } from './responses';
import { checkLiveRequest, checkRequest, createToken, type RequestHeaders } from './security';
import { openStaticRoot, serveStatic } from './static';

/** The only address the local program listens on, so other machines cannot reach it. */
export const HOST = '127.0.0.1';

/** Where the app comes from. */
export type AppSource =
  /** The built app: a folder holding its `index.html`. */
  | { mode: 'static'; dir: string }
  /** The app's sources, served by Vite with hot reload; `configFile: false` uses no config file. */
  | { mode: 'dev'; root: string; configFile: string | false };

/** What the local program serves. */
export interface ServerOptions {
  /** The open project, sent to the app when the live connection opens. */
  project: ProjectSnapshot;
  /** The port to listen on; 0 lets the operating system pick a free one. */
  port: number;
  app: AppSource;
}

/** The running local program. */
export interface RunningServer {
  /** The address to open the app at, with the session token in its fragment. */
  url: string;
  port: number;
  /** The per-session token the live connection requires. */
  token: string;
  /** Closes the live connections and stops listening. */
  close(): Promise<void>;
}

type UpgradeListener = (request: IncomingMessage, socket: Duplex, head: Buffer) => void;

/** How the app is served. */
interface App {
  /** Answers a request that passed the checks. */
  serve(request: IncomingMessage, response: ServerResponse): void;
  /**
   * The upgrade listeners the app's server added to the HTTP server, such as Vite's hot reload. They
   * are taken off the HTTP server and called only for upgrades that pass the checks.
   */
  upgrades: UpgradeListener[];
  close(): Promise<void>;
}

/** Starts the local program and resolves once it listens. */
export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const token = createToken();
  const opened = encodeServerMessage({
    type: 'project/opened',
    protocolVersion: PROTOCOL_VERSION,
    project: options.project,
    history: {},
  });
  // The real port, known once the server listens; no request arrives before that.
  let port = options.port;

  const httpServer = createServer();
  const sockets = new Set<Socket>();
  httpServer.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });

  const live = new WebSocketServer({ noServer: true });
  live.on('connection', (socket) => {
    socket.on('error', () => socket.terminate());
    // Messages from the app carry commands from M1 on; until then they are ignored.
    socket.send(opened);
  });

  const app = await openApp(options.app, httpServer);

  httpServer.on('request', (request: IncomingMessage, response: ServerResponse) => {
    setSecurityHeaders(response);
    const check = checkRequest(headersOf(request), port);
    if (!check.ok) {
      sendText(response, check.status, check.message);
      return;
    }
    app.serve(request, response);
  });

  httpServer.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    socket.on('error', () => socket.destroy());
    const check = checkRequest(headersOf(request), port);
    if (!check.ok) {
      refuseUpgrade(socket, check.status, check.message);
      return;
    }
    const target = request.url ?? '';
    if (pathOf(target) === LIVE_PATH) {
      const liveCheck = checkLiveRequest({ ...headersOf(request), url: target }, { port, token });
      if (!liveCheck.ok) {
        refuseUpgrade(socket, liveCheck.status, liveCheck.message);
        return;
      }
      live.handleUpgrade(request, socket, head, (client) =>
        live.emit('connection', client, request),
      );
      return;
    }
    if (app.upgrades.length === 0) {
      refuseUpgrade(socket, 404, 'Not found.');
      return;
    }
    for (const listener of app.upgrades) listener.call(httpServer, request, socket, head);
  });

  try {
    port = await listen(httpServer, options.port);
  } catch (error) {
    live.close();
    await app.close();
    throw error;
  }
  httpServer.on('error', (error) => console.error(error));

  let closing: Promise<void> | undefined;
  const closeAll = async () => {
    const stopped = new Promise<void>((resolve, reject) =>
      httpServer.close((error) => (error ? reject(error) : resolve())),
    );
    for (const client of live.clients) client.terminate();
    await new Promise<void>((resolve) => live.close(() => resolve()));
    await app.close();
    // Whatever is still open: idle keep-alive connections and upgrades that no one took.
    for (const socket of sockets) socket.destroy();
    await stopped;
  };

  return {
    url: `http://${HOST}:${port}/#${TOKEN_PARAM}=${token}`,
    port,
    token,
    close: () => (closing ??= closeAll()),
  };
}

/** Prepares the app: its build from a folder, or its sources through Vite. */
async function openApp(source: AppSource, httpServer: Server): Promise<App> {
  if (source.mode === 'static') {
    const root = await openStaticRoot(source.dir);
    return {
      serve: (request, response) => {
        serveStatic(root, request, response).catch((error: unknown) => fail(response, error));
      },
      upgrades: [],
      close: async () => {},
    };
  }

  // Imported only in dev mode, so that serving the build never loads Vite.
  const { createServer: createViteServer } = await import('vite');
  const before = new Set(httpServer.listeners('upgrade'));
  const vite = await createViteServer({
    // The real path: Vite's file allow list rejects files under a Windows short path (`PCDIM-~1`).
    root: await realpath(source.root),
    configFile: source.configFile,
    appType: 'spa',
    // Keeps the address the local program printed on screen.
    clearScreen: false,
    // Hot reload shares the local program's server; `ws.server` is the current name of `hmr.server`.
    server: { middlewareMode: true, ws: { server: httpServer } },
  });
  const upgrades = httpServer
    .listeners('upgrade')
    .filter((listener) => !before.has(listener)) as UpgradeListener[];
  for (const listener of upgrades) httpServer.off('upgrade', listener);

  return {
    serve: (request, response) => {
      // Vite calls this when none of its middlewares answered, or with the error one of them hit.
      vite.middlewares(request, response, (error?: unknown) => {
        if (error) fail(response, error);
        else sendText(response, 404, 'Not found.');
      });
    },
    upgrades,
    close: () => vite.close(),
  };
}

/** Answers a request that failed unexpectedly, and reports the error. */
function fail(response: ServerResponse, error: unknown): void {
  console.error(error);
  if (response.headersSent) response.destroy();
  else sendText(response, 500, 'The local program failed to answer this request.');
}

function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ port, host: HOST }, () => {
      server.off('error', reject);
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('The server listens on no TCP port.'));
      } else {
        resolve(address.port);
      }
    });
  });
}

function headersOf(request: IncomingMessage): RequestHeaders {
  return { host: request.headers.host, origin: request.headers.origin };
}

function pathOf(target: string): string {
  const queryStart = target.indexOf('?');
  return queryStart === -1 ? target : target.slice(0, queryStart);
}
