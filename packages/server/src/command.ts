/**
 * The `visual-anything` command: reads its arguments, opens the project folder, starts the local
 * program and opens the browser on it, then runs until it is stopped. Everything it touches outside
 * itself comes in through a {@link CommandEnvironment}, so it runs the same in tests.
 *
 * The session token never appears on screen or in an address: the browser is opened, or an address
 * printed, with a launch code that works once, within two minutes. In a terminal, `o` opens another
 * tab and `a` prints another such address.
 */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { PROTOCOL_VERSION } from '@visual-anything/core';
import { resolveAppSource } from './app-source';
import { removeProgramRecord, writeProgramRecord } from './claude/discovery';
import { errorCode, errorReason } from './errors';
import { toForwardSlashes } from './paths';
import { formatProjectProblem } from './project';
import { startServer, type AppSource, type RunningServer } from './server';
import { openSession } from './session';
import { AppNotBuiltError } from './static';

export const USAGE = `Usage: visual-anything [folder] [--port <n>] [--no-open] [--dev] [--stop-when-idle]

Opens the project in folder (the current folder when left out) and serves the app on 127.0.0.1.

  --port <n>        Listen on port n, from 0 to 65535 (default 0: any free port).
  --no-open         Print an address that works once, instead of opening the browser.
  --dev             Serve the app from its sources through Vite, with hot reload.
  --stop-when-idle  Stop once no app and no Claude has been connected for a minute, as when
                    Claude started the program.
  -h, --help        Show this help.`;

/** What the command line asks for. */
export interface CommandLine {
  /** The project folder, as written; relative to the working folder. */
  folder: string;
  port: number;
  /** Whether to open the browser. */
  open: boolean;
  dev: boolean;
  /** Whether to stop once nothing has been connected for a while. */
  stopWhenIdle: boolean;
  help: boolean;
}

/** The arguments read, or why they could not be. */
export type ParsedCommandLine = { ok: true; value: CommandLine } | { ok: false; message: string };

/** The signals that stop the program arrive here: `process`, in the real program. */
export interface Signals {
  once(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
  off(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
}

/** The keys pressed in the terminal the program runs in, one at a time. */
export interface KeyInput {
  /** Calls `onKey` with each key pressed, until the function it returns is called. */
  listen(onKey: (key: string) => void): () => void;
}

/** Everything the command uses from the world around it. */
export interface CommandEnvironment {
  /** The folder relative paths are resolved against. */
  cwd: string;
  /** Prints a line of normal output. */
  out(line: string): void;
  /** Prints a line about a problem. */
  err(line: string): void;
  /** Opens the browser at a URL. */
  openBrowser(url: string): Promise<unknown>;
  signals: Signals;
  /** The keys pressed, when the program runs in a terminal; absent otherwise. */
  keys?: KeyInput;
  /**
   * The runtime folder, where the program leaves the record that lets Claude's MCP entry point
   * attach to it; `null` or absent leaves none.
   */
  runtimeFolder?: string | null;
  /** How long `--stop-when-idle` waits with nothing connected, in milliseconds; a minute by default. */
  idleStopDelay?: number;
  /** Where the app comes from: by default the app package, built or in dev mode its sources. */
  appSource?: (dev: boolean) => AppSource;
}

/** How long a program started with `--stop-when-idle` waits with nothing connected. */
export const IDLE_STOP_DELAY = 60_000;

/** The keys the program answers in a terminal. */
const KEY_HELP =
  'Press o to open Visual Anything in a new tab, or a to print an address that works once.';

/** Reads the command line: `[folder] [--port <n>] [--no-open] [--dev] [--stop-when-idle] [--help]`. */
export function parseCommandLine(argv: readonly string[]): ParsedCommandLine {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        port: { type: 'string' },
        'no-open': { type: 'boolean' },
        dev: { type: 'boolean' },
        'stop-when-idle': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  const { values, positionals } = parsed;
  if (positionals.length > 1) {
    return {
      ok: false,
      message: `Give at most one project folder, not ${positionals.length}: ${positionals.join(' ')}.`,
    };
  }
  const port = values.port === undefined ? 0 : parsePort(values.port);
  if (port === undefined) {
    return {
      ok: false,
      message: `--port takes an integer from 0 to 65535, not ${JSON.stringify(values.port)}.`,
    };
  }
  return {
    ok: true,
    value: {
      folder: positionals[0] ?? '.',
      port,
      open: values['no-open'] !== true,
      dev: values.dev === true,
      stopWhenIdle: values['stop-when-idle'] === true,
      help: values.help === true,
    },
  };
}

/**
 * Runs the command and resolves with its exit code: 0 once stopped by SIGINT, SIGTERM, Ctrl+C in its
 * terminal or, with `--stop-when-idle`, by being idle; 1 when the project cannot be opened or the
 * local program cannot start; 2 for arguments it does not understand.
 */
export async function runCommand(
  argv: readonly string[],
  environment: CommandEnvironment,
): Promise<number> {
  const parsed = parseCommandLine(argv);
  if (!parsed.ok) {
    environment.err(parsed.message);
    environment.err(USAGE);
    return 2;
  }
  const options = parsed.value;
  if (options.help) {
    environment.out(USAGE);
    return 0;
  }

  const folder = resolve(environment.cwd, options.folder);
  const opened = await openSession(folder, {
    out: (line) => environment.out(line),
    err: (line) => environment.err(line),
  });
  if (!opened.ok) {
    environment.err(`Could not open the project in ${toForwardSlashes(folder)}:`);
    for (const error of opened.errors) environment.err(formatProjectProblem(error));
    return 1;
  }
  const { session } = opened;

  const stopper = new Stopper();
  const idle = options.stopWhenIdle
    ? new IdleStop(environment.idleStopDelay ?? IDLE_STOP_DELAY, () => {
        environment.out('Nothing has been connected for a while, so Visual Anything stops.');
        stopper.stop();
      })
    : undefined;

  const openBrowser = async (url: string) => {
    try {
      await environment.openBrowser(url);
    } catch (error) {
      environment.err(
        `Could not open the browser (${errorReason(error)}). ${environment.keys ? 'Press a to print an address that works once.' : 'Start Visual Anything again with --no-open to print an address that works once.'}`,
      );
      throw error;
    }
  };

  let server: RunningServer;
  try {
    const app = (environment.appSource ?? resolveAppSource)(options.dev);
    server = await startServer({
      session,
      port: options.port,
      app,
      openBrowser,
      onLaunchReused: () =>
        environment.err(
          'The launch address was used twice; if your tab did not open the project, something else on this computer used it first.',
        ),
      ...(idle === undefined ? {} : { onConnections: (count: number) => idle.connections(count) }),
    });
  } catch (error) {
    idle?.cancel();
    await session.close();
    environment.err(describeStartFailure(error, options.port));
    return 1;
  }
  stopper.onSignals(environment.signals);
  // Before saying it runs, so that Claude can attach as soon as it does.
  const record = await recordForClaude(environment, server, session.folder);

  environment.out(`Opened "${session.snapshot.project.name}" from ${toForwardSlashes(folder)}.`);
  for (const warning of session.warnings()) {
    environment.err(`Warning: ${formatProjectProblem(warning)}`);
  }
  environment.out(`Visual Anything is running at ${server.address}`);
  if (options.dev) {
    environment.out('Dev mode: Vite serves the app from its sources, with hot reload.');
  }

  if (options.open) {
    void openBrowser(server.launchUrl()).catch(() => {});
  } else {
    environment.out(
      `Open Visual Anything at this address, which works once, within two minutes: ${server.launchUrl()}`,
    );
  }
  const stopKeys = environment.keys?.listen((key) => {
    if (key === 'o') void openBrowser(server.launchUrl()).catch(() => {});
    else if (key === 'a') {
      environment.out(`This address works once, within two minutes: ${server.launchUrl()}`);
    } else if (key === '\u0003') stopper.stop();
  });
  if (stopKeys !== undefined) environment.out(KEY_HELP);
  environment.out('Press Ctrl+C to stop.');
  idle?.start();

  await stopper.stopped;
  stopKeys?.();
  idle?.cancel();
  try {
    await server.close();
  } catch (error) {
    environment.err(`Could not stop cleanly: ${errorReason(error)}`);
    return 1;
  } finally {
    if (record !== undefined) await removeProgramRecord(record, process.pid);
    // Waits for the changes already sent to be saved, and stops watching the folder.
    await session.close();
  }
  environment.out('Visual Anything stopped.');
  return 0;
}

/**
 * Leaves the record that lets Claude's MCP entry point attach, and returns its path; says why when
 * it cannot, and the program runs on without it.
 */
async function recordForClaude(
  environment: CommandEnvironment,
  server: RunningServer,
  folder: string,
): Promise<string | undefined> {
  const runtime = environment.runtimeFolder;
  if (runtime === undefined || runtime === null) return undefined;
  try {
    return await writeProgramRecord(runtime, {
      format: 1,
      protocolVersion: PROTOCOL_VERSION,
      pid: process.pid,
      port: server.port,
      folder: toForwardSlashes(folder),
      credential: server.credential,
      startedAt: new Date().toISOString(),
    });
  } catch (error) {
    environment.err(
      `Claude cannot attach to this program: its record could not be written in ${toForwardSlashes(runtime)} (${errorReason(error)}).`,
    );
    return undefined;
  }
}

/** What stops the program: the first SIGINT or SIGTERM, Ctrl+C in its terminal, or being idle. */
class Stopper {
  readonly stopped: Promise<void>;
  #resolve: () => void = () => {};
  #release: (() => void) | undefined;

  constructor() {
    this.stopped = new Promise((resolve) => {
      this.#resolve = resolve;
    });
  }

  /**
   * Stops on the first SIGINT or SIGTERM. It stops listening at once, so a second signal gets the
   * default behavior and ends the process even if closing hangs.
   */
  onSignals(signals: Signals): void {
    const stop = () => this.stop();
    signals.once('SIGINT', stop);
    signals.once('SIGTERM', stop);
    this.#release = () => {
      signals.off('SIGINT', stop);
      signals.off('SIGTERM', stop);
    };
  }

  stop(): void {
    this.#release?.();
    this.#release = undefined;
    this.#resolve();
  }
}

/** Calls `onIdle` once nothing has been connected for `delay` milliseconds, counted from the start. */
class IdleStop {
  readonly #delay: number;
  readonly #onIdle: () => void;
  #count = 0;
  #started = false;
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(delay: number, onIdle: () => void) {
    this.#delay = delay;
    this.#onIdle = onIdle;
  }

  start(): void {
    this.#started = true;
    this.#schedule();
  }

  connections(count: number): void {
    this.#count = count;
    this.#schedule();
  }

  cancel(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#started = false;
  }

  #schedule(): void {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    if (!this.#started || this.#count > 0) return;
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      this.#onIdle();
    }, this.#delay);
  }
}

/** Reads a port: decimal digits only, from 0 to 65535. */
function parsePort(text: string): number | undefined {
  if (!/^\d{1,5}$/.test(text)) return undefined;
  const port = Number(text);
  return port <= 65535 ? port : undefined;
}

function describeStartFailure(error: unknown, port: number): string {
  switch (errorCode(error)) {
    case 'EADDRINUSE':
      return `Port ${port} is already in use. Choose another with --port, or leave --port out to use any free port.`;
    case 'EACCES':
      return `Port ${port} may not be used here. Choose another with --port, or leave --port out to use any free port.`;
    default:
      if (error instanceof AppNotBuiltError) return error.message;
      return `Could not start: ${toForwardSlashes(error instanceof Error ? error.message : String(error))}`;
  }
}
