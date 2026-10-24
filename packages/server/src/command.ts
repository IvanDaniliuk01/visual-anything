/**
 * The `visual-anything` command: reads its arguments, opens the project folder, starts the local
 * program and opens the browser on it, then runs until it is stopped. Everything it touches outside
 * itself comes in through a {@link CommandEnvironment}, so it runs the same in tests.
 */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { resolveAppSource } from './app-source';
import { errorCode, errorReason } from './errors';
import { toForwardSlashes } from './paths';
import { openPreferences, themeHintOf, type PreferencesLocation } from './preferences';
import { formatProjectProblem } from './project';
import { startServer, type AppSource, type RunningServer } from './server';
import { openSession } from './session';
import { AppNotBuiltError } from './static';

export const USAGE = `Usage: visual-anything [folder] [--port <n>] [--no-open] [--dev]

Opens the project in folder (the current folder when left out) and serves the app on 127.0.0.1.

  --port <n>  Listen on port n, from 0 to 65535 (default 0: any free port).
  --no-open   Print the address without opening the browser.
  --dev       Serve the app from its sources through Vite, with hot reload.
  -h, --help  Show this help.`;

/** What the command line asks for. */
export interface CommandLine {
  /** The project folder, as written; relative to the working folder. */
  folder: string;
  port: number;
  /** Whether to open the browser. */
  open: boolean;
  dev: boolean;
  help: boolean;
}

/** The arguments read, or why they could not be. */
export type ParsedCommandLine = { ok: true; value: CommandLine } | { ok: false; message: string };

/** The signals that stop the program arrive here: `process`, in the real program. */
export interface Signals {
  once(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
  off(signal: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
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
  /** Where the app comes from: by default the app package, built or in dev mode its sources. */
  appSource?: (dev: boolean) => AppSource;
  /**
   * Where the person's preferences are kept (ADR-0032), as `preferencesFolder` works it out; absent,
   * they are kept in memory only, as tests do.
   */
  preferences?: PreferencesLocation;
}

/** Reads the command line: `[folder] [--port <n>] [--no-open] [--dev] [--help]`. */
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
      help: values.help === true,
    },
  };
}

/**
 * Runs the command and resolves with its exit code: 0 once stopped by SIGINT or SIGTERM, 1 when the
 * project cannot be opened or the local program cannot start, 2 for arguments it does not understand.
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

  const location = environment.preferences ?? { folder: null };
  if (location.warning !== undefined) environment.err(`Warning: ${location.warning}`);
  const { store: preferences, warning } = await openPreferences(location.folder);
  if (warning !== undefined) environment.err(`Warning: ${warning}`);

  const folder = resolve(environment.cwd, options.folder);
  const opened = await openSession(folder, {
    out: (line) => environment.out(line),
    err: (line) => environment.err(line),
    preferences,
  });
  if (!opened.ok) {
    environment.err(`Could not open the project in ${toForwardSlashes(folder)}:`);
    for (const error of opened.errors) environment.err(formatProjectProblem(error));
    await preferences.close();
    return 1;
  }
  const { session } = opened;

  let server: RunningServer;
  try {
    const app = (environment.appSource ?? resolveAppSource)(options.dev);
    server = await startServer({
      session,
      port: options.port,
      app,
      themeHint: themeHintOf(preferences.current()),
    });
  } catch (error) {
    await session.close();
    await preferences.close();
    environment.err(describeStartFailure(error, options.port));
    return 1;
  }
  const stopped = stopSignal(environment.signals);

  environment.out(`Opened "${session.snapshot.project.name}" from ${toForwardSlashes(folder)}.`);
  for (const warning of session.warnings()) {
    environment.err(`Warning: ${formatProjectProblem(warning)}`);
  }
  environment.out(`Visual Anything is running at ${server.url}`);
  if (options.dev) {
    environment.out('Dev mode: Vite serves the app from its sources, with hot reload.');
  }
  environment.out('Press Ctrl+C to stop.');
  if (options.open) {
    void Promise.resolve()
      .then(() => environment.openBrowser(server.url))
      .catch((error: unknown) =>
        environment.err(
          `Could not open the browser (${errorReason(error)}); open the address above by hand.`,
        ),
      );
  }

  await stopped;
  try {
    await server.close();
  } catch (error) {
    environment.err(`Could not stop cleanly: ${errorReason(error)}`);
    return 1;
  } finally {
    // Waits for the changes already sent to be saved, and stops watching the folder.
    await session.close();
    await preferences.close();
  }
  environment.out('Visual Anything stopped.');
  return 0;
}

/** Reads a port: decimal digits only, from 0 to 65535. */
function parsePort(text: string): number | undefined {
  if (!/^\d{1,5}$/.test(text)) return undefined;
  const port = Number(text);
  return port <= 65535 ? port : undefined;
}

/**
 * Resolves on the first SIGINT or SIGTERM. It stops listening at once, so a second signal gets the
 * default behavior and ends the process even if closing hangs.
 */
function stopSignal(signals: Signals): Promise<void> {
  return new Promise((resolve) => {
    const stop = () => {
      signals.off('SIGINT', stop);
      signals.off('SIGTERM', stop);
      resolve();
    };
    signals.once('SIGINT', stop);
    signals.once('SIGTERM', stop);
  });
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
