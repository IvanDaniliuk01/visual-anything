/**
 * The local program's HTTP server. It listens on 127.0.0.1 only, checks the Host and Origin of every
 * request, serves the app (its build, from a folder or from the single executable's assets, or its
 * sources through Vite in dev mode) and opens the live connection for a page that holds the
 * per-session token or a launch code that works once. Each live connection is an app of the open
 * project's session: it gets the project and every change, and its messages go to the session. The Claude endpoint, on its own path and with its own credential,
 * attaches Claude's MCP entry point to the same session.
 */
import { realpath } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import type { Duplex } from 'node:stream';
import {
  LAUNCH_PARAM,
  LIVE_PATH,
  SESSION_PROOF_PATH,
  encodeServerMessage,
  withViewState,
  type CodeApproval,
  type ViewState,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { attachClaude } from './claude/endpoint';
import type { ClaudeSetup } from './claude-setup';
import { answerClaudeSetup, claudeSetupAsked } from './claude-setup-answer';
import {
  CLAUDE_MAX_PAYLOAD,
  CLAUDE_PATH,
  encodeClaudeMessage,
  type AppOpening,
} from './claude/messages';
import { errorReason } from './errors';
import { startFrameListener, type FrameListener } from './explorables/listener';
import { frameRuntime } from './explorables/runtime';
import { toForwardSlashes } from './paths';
import { refuseUpgrade, sendText, setSecurityHeaders } from './responses';
import {
  LaunchCodes,
  challengeOf,
  checkClaudeRequest,
  checkLiveRequest,
  checkRequest,
  createToken,
  sessionProof,
  type RequestHeaders,
} from './security';
import {
  LIVE_MAX_PAYLOAD,
  CODE_WORKER_POLICY,
  WORKER_POLICY,
  applyContentPolicies,
  createNonce,
  inlineScriptHashes,
  pagePolicy,
  servesProjectFile,
} from './policies';
import type { LiveSession, SessionClient } from './session';
import {
  AppNotBuiltError,
  folderFiles,
  openStaticRoot,
  serveAppFile,
  type AppFiles,
} from './static';

/** The address the local program listens on by default, so other machines cannot reach it. */
export const HOST = '127.0.0.1';

/**
 * The addresses the local program may listen on: 127.0.0.1, or every interface of a container, whose
 * port is published only on the host's 127.0.0.1 (ADR 0094). Either way, requests must name
 * 127.0.0.1 or localhost in their Host and Origin.
 */
export const LISTEN_ADDRESSES = [HOST, '0.0.0.0'] as const;

/** An address the local program may listen on. */
export type ListenAddress = (typeof LISTEN_ADDRESSES)[number];

/** Where the app comes from. */
export type AppSource =
  /** The built app: a folder holding its `index.html`. */
  | { mode: 'static'; dir: string }
  /** The built app as the single executable holds it, or any other files not in a folder. */
  | { mode: 'embedded'; files: AppFiles }
  /** The app's sources, served by Vite with hot reload; `configFile: false` uses no config file. */
  | { mode: 'dev'; root: string; configFile: string | false };

/** What the local program serves. */
export interface ServerOptions {
  /** The open project's session: it greets each app that connects and handles what the app sends. */
  session: LiveSession;
  /** The port to listen on; 0 lets the operating system pick a free one. */
  port: number;
  /** The address to listen on: 127.0.0.1 when absent; 0.0.0.0 only inside a container (ADR 0094). */
  listen?: ListenAddress;
  app: AppSource;
  /**
   * Opens the browser at an address, for Claude's request to open the app while no tab is connected;
   * without it, or when it fails, the launch address is printed in the terminal instead, and never
   * given to Claude (ADR 0099).
   */
  openBrowser?: (url: string) => Promise<unknown>;
  /**
   * The session token, kept from an earlier run on the same folder and port (ADR 0099), so that a tab
   * of that run reconnects; absent, a new one is made.
   */
  token?: string;
  /** Told when a launch address that was already used came again. */
  onLaunchReused?: () => void;
  /** Told how many apps and Claudes are connected, each time that changes. */
  onConnections?: (count: number) => void;
  /**
   * The theme the person chose, carried in every launch address as `theme=` beside the launch code,
   * so that the page paints its first frame in it; a function is asked each time. It is no secret.
   */
  themeHint?: ThemeHint | (() => ThemeHint | undefined);
  /**
   * The person's approvals of package code, from their preferences, which Claude's endpoint answers
   * about for the project's own code only (ADR 0054); absent, no code is approved for Claude.
   */
  codeApprovals?: () => readonly CodeApproval[];
  /**
   * The packages whose code the person turned off on this computer, from their preferences (ADR
   * 0089), whose code Claude's tools then run neither.
   */
  codeTurnedOff?: () => readonly Id[];
  /**
   * Adds this program to Claude Desktop's configuration, as `setup-claude` does, when an app asks
   * with `claude/setup` (ADR 0093). Whatever is open, or nothing, the program answers it itself;
   * absent, it refuses to.
   */
  setupClaude?: () => Promise<ClaudeSetup>;
  /**
   * The `va` runtime every explorable's frame starts with (ADR 0107), asked for each frame; the
   * stand-in until the app's own runtime lands.
   */
  explorableRuntime?: () => string;
}

/** A theme the page can paint its first frame in. */
export type ThemeHint = 'light' | 'dark';

/** The fragment parameter the theme hint travels under. */
export const THEME_HINT_PARAM = 'theme';

/** The running local program. */
export interface RunningServer {
  /** The address the app is served at, which holds no secret: `http://127.0.0.1:<port>/`. */
  address: string;
  port: number;
  /**
   * The per-session token the live connection requires. It is never printed, never put in an address
   * and never handed to another program; only the kept session's private record holds it besides
   * this process (ADR 0099). A page gets it only by redeeming a launch code, or kept from the run
   * before.
   */
  token: string;
  /** Claude's credential for the Claude endpoint, which only the discovery file holds. */
  credential: string;
  /**
   * The port of the explorables' listener on 127.0.0.1 (ADR 0107), which the app's page policy
   * allows frames from, as `http://*.localhost:<port>`.
   */
  framePort: number;
  /**
   * Makes an address that opens the app once, within two minutes, and ends the one made before:
   * `http://127.0.0.1:<port>/#launch=<code>`.
   */
  launchUrl(): string;
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
  /** The content security policy of the app's page, served from a port, framing the listener's. */
  pagePolicyAt(port: number, framePort: number): string;
  close(): Promise<void>;
}

/** Starts the local program and resolves once it listens. */
export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const token = options.token ?? createToken();
  const credential = createToken();
  const launchCodes = new LaunchCodes();
  // The real port, known once the server listens; no request arrives before that.
  let port = options.port;
  const launchUrl = () => {
    const hint = typeof options.themeHint === 'function' ? options.themeHint() : options.themeHint;
    const theme = hint === 'light' || hint === 'dark' ? `&${THEME_HINT_PARAM}=${hint}` : '';
    return `http://${HOST}:${port}/#${LAUNCH_PARAM}=${launchCodes.create()}${theme}`;
  };

  const httpServer = createServer();
  const sockets = new Set<Socket>();
  httpServer.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });

  let connections = 0;
  const counted = (socket: WebSocket) => {
    connections += 1;
    options.onConnections?.(connections);
    socket.once('close', () => {
      connections -= 1;
      options.onConnections?.(connections);
    });
  };

  const live = new WebSocketServer({ noServer: true, maxPayload: LIVE_MAX_PAYLOAD });
  live.on('connection', (socket: WebSocket, _request: IncomingMessage, via: 'token' | 'launch') => {
    // A message over the payload limit makes ws close the connection with code 1009 itself, so that
    // the app can say the change was too large; only a connection that is not closing is cut.
    socket.on('error', () => {
      if (socket.readyState !== WebSocket.CLOSING) socket.terminate();
    });
    counted(socket);
    const client: SessionClient = {
      send: (message) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(encodeServerMessage(message));
      },
    };
    const disconnect = options.session.connect(client, via === 'launch' ? { token } : {});
    socket.on('close', disconnect);
    socket.on('message', (data) => {
      const text = textOf(data);
      const setup = claudeSetupAsked(text);
      const received =
        setup === undefined
          ? options.session.receive(client, text)
          : answerClaudeSetup(client, setup, options.setupClaude);
      received.catch((error: unknown) => {
        console.error(error);
      });
    });
  });

  /**
   * Opens the app for Claude, or for `visual-anything open` (ADR 0099): while a tab is connected, and
   * no new tab is asked for, that tab comes forward rather than another opening; otherwise the browser
   * opens a launch address, and when it cannot, the address is printed in the program's terminal and
   * answered to the command line, never to Claude (ADR 0030). The session token is never in it.
   */
  const openAppFor = async (
    state: ViewState | undefined,
    how: { newTab?: boolean } = {},
  ): Promise<AppOpening> => {
    const tabs = [...live.clients].filter((each) => each.readyState === WebSocket.OPEN);
    if (how.newTab !== true && tabs.length > 0) {
      const shown = encodeServerMessage(
        state === undefined ? { type: 'app/shown' } : { type: 'app/shown', state },
      );
      for (const tab of tabs) tab.send(shown);
      return { how: 'tab', tabs: tabs.length };
    }
    const address = state === undefined ? launchUrl() : withViewState(launchUrl(), state);
    const printed = (why: string): AppOpening => {
      console.log(`Open Visual Anything at ${address} within two minutes (${why})`);
      return { how: 'address', address, why };
    };
    if (options.openBrowser === undefined)
      return printed('This Visual Anything cannot open a browser.');
    try {
      await options.openBrowser(address);
      return { how: 'browser' };
    } catch (error) {
      return printed(`Could not open the browser: ${errorReason(error)}.`);
    }
  };

  const claude = new WebSocketServer({ noServer: true, maxPayload: CLAUDE_MAX_PAYLOAD });
  claude.on('connection', (socket: WebSocket) => {
    socket.on('error', () => socket.terminate());
    counted(socket);
    const connection = attachClaude(
      options.session,
      (message) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(encodeClaudeMessage(message));
      },
      {
        openApp: openAppFor,
        launchAddress: launchUrl,
        ...(options.codeApprovals === undefined ? {} : { codeApprovals: options.codeApprovals }),
        ...(options.codeTurnedOff === undefined ? {} : { codeTurnedOff: options.codeTurnedOff }),
      },
    );
    socket.on('close', () => connection.detach());
    socket.on('message', (data) => {
      connection.receive(textOf(data)).catch((error: unknown) => console.error(error));
    });
  });

  const app = await openApp(options.app, httpServer, options.session.folder);

  httpServer.on('request', (request: IncomingMessage, response: ServerResponse) => {
    setSecurityHeaders(response);
    const check = checkRequest(headersOf(request), port);
    if (!check.ok) {
      sendText(response, check.status, check.message);
      return;
    }
    if (pathOf(request.url ?? '') === SESSION_PROOF_PATH) {
      answerSessionProof(request, response, token);
      return;
    }
    applyContentPolicies(response, {
      page: app.pagePolicyAt(port, frames.port),
      worker: WORKER_POLICY,
      codeWorker: CODE_WORKER_POLICY,
    });
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
      const liveCheck = checkLiveRequest(
        { ...headersOf(request), url: target },
        { port, token, launchCodes },
      );
      if (!liveCheck.ok) {
        if (liveCheck.reused) options.onLaunchReused?.();
        refuseUpgrade(socket, liveCheck.status, liveCheck.message);
        return;
      }
      live.handleUpgrade(request, socket, head, (client) =>
        live.emit('connection', client, request, liveCheck.via),
      );
      return;
    }
    if (pathOf(target) === CLAUDE_PATH) {
      const claudeCheck = checkClaudeRequest(
        { ...headersOf(request), authorization: request.headers.authorization },
        { port, credential },
      );
      if (!claudeCheck.ok) {
        refuseUpgrade(socket, claudeCheck.status, claudeCheck.message);
        return;
      }
      claude.handleUpgrade(request, socket, head, (client) =>
        claude.emit('connection', client, request),
      );
      return;
    }
    if (app.upgrades.length === 0) {
      refuseUpgrade(socket, 404, 'Not found.');
      return;
    }
    for (const listener of app.upgrades) listener.call(httpServer, request, socket, head);
  });

  // The explorables' listener (ADR 0107) starts with the program, so that the page's policy names
  // its port from the first page the program serves.
  let frames: FrameListener;
  try {
    frames = await startFrameListener({
      serve: (explorable, hash) =>
        options.session.serveExplorableFrame?.(
          explorable,
          hash,
          `http://${HOST}:${port}`,
          (options.explorableRuntime ?? frameRuntime)(),
        ) ?? Promise.resolve({ ok: false, status: 404, message: 'No project is open.' }),
      err: (line) => console.error(line),
    });
  } catch (error) {
    live.close();
    claude.close();
    await app.close();
    throw error;
  }
  try {
    port = await listen(httpServer, options.port, options.listen ?? HOST);
    // Package code never fetches from the program itself (ADR 0057's clarification on addresses).
    options.session.servesAt?.(port);
    options.session.servesAt?.(frames.port);
    options.session.servesExplorablesAt?.({ port: frames.port, nonce: frames.nonce });
  } catch (error) {
    live.close();
    claude.close();
    await app.close();
    await frames.close();
    throw error;
  }
  httpServer.on('error', (error) => console.error(error));

  let closing: Promise<void> | undefined;
  const closeAll = async () => {
    const stopped = new Promise<void>((resolve, reject) =>
      httpServer.close((error) => (error ? reject(error) : resolve())),
    );
    for (const client of [...live.clients, ...claude.clients]) client.terminate();
    await new Promise<void>((resolve) => live.close(() => resolve()));
    await new Promise<void>((resolve) => claude.close(() => resolve()));
    await app.close();
    await frames.close();
    // Whatever is still open: idle keep-alive connections and upgrades that no one took.
    for (const socket of sockets) socket.destroy();
    await stopped;
  };

  return {
    address: `http://${HOST}:${port}/`,
    port,
    token,
    credential,
    framePort: frames.port,
    launchUrl,
    close: () => (closing ??= closeAll()),
  };
}

/**
 * Prepares the app: its build from a folder or from the executable's assets, or its sources through
 * Vite. In dev mode, no file inside the project folder is ever served.
 */
async function openApp(
  source: AppSource,
  httpServer: Server,
  projectFolder: string | undefined,
): Promise<App> {
  if (source.mode === 'static') {
    const root = await openStaticRoot(source.dir);
    return openBuiltApp(
      folderFiles(root),
      `The app is not built: ${toForwardSlashes(root)}/index.html is not a file inside it. Run \`pnpm build\` first.`,
    );
  }
  if (source.mode === 'embedded') {
    return openBuiltApp(
      source.files,
      'This Visual Anything holds no built app: make the executable again with `pnpm package`.',
    );
  }

  // Imported only in dev mode, so that serving the build never loads Vite.
  const { createServer: createViteServer } = await import('vite');
  const before = new Set(httpServer.listeners('upgrade'));
  // Vite puts it on the scripts and styles it writes into the page, which the page's policy allows.
  const nonce = createNonce();
  // The real path: Vite's file allow list rejects files under a Windows short path (`PCDIM-~1`).
  const root = await realpath(source.root);
  const vite = await createViteServer({
    root,
    configFile: source.configFile,
    appType: 'spa',
    // Keeps the address the local program printed on screen.
    clearScreen: false,
    // Hot reload shares the local program's server; `ws.server` is the current name of `hmr.server`.
    server: { middlewareMode: true, ws: { server: httpServer } },
    html: { cspNonce: nonce },
  });
  const upgrades = httpServer
    .listeners('upgrade')
    .filter((listener) => !before.has(listener)) as UpgradeListener[];
  for (const listener of upgrades) httpServer.off('upgrade', listener);

  const serve = (request: IncomingMessage, response: ServerResponse) => {
    // Vite calls this when none of its middlewares answered, or with the error one of them hit.
    vite.middlewares(request, response, (error?: unknown) => {
      if (error) fail(response, error);
      else sendText(response, 404, 'Not found.');
    });
  };
  return {
    serve: (request, response) => {
      if (projectFolder === undefined) {
        serve(request, response);
        return;
      }
      servesProjectFile(request, { project: projectFolder, root })
        .then((refused) => {
          if (refused) sendText(response, 403, 'Dev mode serves no file of the open project.');
          else serve(request, response);
        })
        .catch((error: unknown) => fail(response, error));
    },
    upgrades,
    // Without Trusted Types, because Vite's error overlay writes HTML.
    pagePolicyAt: (port, framePort) => pagePolicy(port, { trustedTypes: false, nonce, framePort }),
    close: () => vite.close(),
  };
}

/** Serves the built app from its files; without its `index.html`, refuses with `missing`. */
async function openBuiltApp(files: AppFiles, missing: string): Promise<App> {
  const index = await files.read('index.html');
  if (index === undefined) throw new AppNotBuiltError(missing);
  // The built page's own inline scripts, such as the one that applies the theme before the first
  // paint, are allowed by their hashes, read from the page that is served.
  const scriptHashes = inlineScriptHashes(Buffer.from(index).toString('utf8'));
  return {
    serve: (request, response) => {
      serveAppFile(files, request, response).catch((error: unknown) => fail(response, error));
    },
    upgrades: [],
    pagePolicyAt: (port, framePort) =>
      pagePolicy(port, { trustedTypes: true, scriptHashes, framePort }),
    close: async () => {},
  };
}

/**
 * Answers a tab that asks this program to prove it holds the tab's session token before the tab
 * sends it (ADR 0099), with `{ "proof": … }`, never cached; a request without a challenge of the
 * form a tab makes is refused.
 */
function answerSessionProof(
  request: IncomingMessage,
  response: ServerResponse,
  token: string,
): void {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendText(response, 405, 'The session proof is read with GET.', { Allow: 'GET, HEAD' });
    return;
  }
  const challenge = challengeOf(request.url ?? '');
  if (challenge === undefined) {
    sendText(response, 400, 'The session proof needs one challenge: 32 to 128 hex digits.');
    return;
  }
  const body = Buffer.from(JSON.stringify({ proof: sessionProof(token, challenge) }), 'utf8');
  response.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  response.end(request.method === 'HEAD' ? undefined : body);
}

/** Answers a request that failed unexpectedly, and reports the error. */
function fail(response: ServerResponse, error: unknown): void {
  console.error(error);
  if (response.headersSent) response.destroy();
  else sendText(response, 500, 'The local program failed to answer this request.');
}

function listen(server: Server, port: number, host: ListenAddress): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ port, host }, () => {
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

/** The text of a message from the app, which sends text; anything else is read as UTF-8. */
function textOf(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return data.toString('utf8');
}
