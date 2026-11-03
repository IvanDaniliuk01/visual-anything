/**
 * The `visual-anything` command: reads its arguments, opens the project folder, starts the local
 * program and opens the browser on it, then runs until it is stopped. Everything it touches outside
 * itself comes in through a {@link CommandEnvironment}, so it runs the same in tests.
 *
 * The session token never appears on screen or in an address: the browser is opened, or an address
 * printed, with a launch code that works once, within two minutes. In a terminal, `o` opens another
 * tab and `a` prints another such address. With `--view`, and `--select`, every such address also
 * carries a view state (ADR-0030's addendum of 2026-10-25), which the tab applies once it has
 * redeemed the code.
 *
 * When a program already runs on the folder, the command starts no second one: it asks that program
 * to open a tab at the view state, as Claude's `open_app` does, or with `--no-open` prints its view
 * address (ADR-0044).
 */
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  PROTOCOL_VERSION,
  checkViewState,
  viewStateProblems,
  withViewState,
  type ProjectSnapshot,
  type ViewState,
} from '@visual-anything/core';
import { resolveAppSource } from './app-source';
import {
  OtherBuildError,
  ProgramBridge,
  ProgramUnavailableError,
  type StartProgram,
} from './claude/bridge';
import { removeProgramRecord, writeProgramRecord } from './claude/discovery';
import { errorCode, errorReason } from './errors';
import { otherProjectOpener } from './other-project';
import { toForwardSlashes } from './paths';
import { openPreferences, themeHintOf, type PreferencesLocation } from './preferences';
import { formatProjectProblem } from './project';
import type { ClaudeSetup } from './claude-setup';
import { startServer, type AppSource, type RunningServer } from './server';
import { openSession, type Session } from './session';
import { ProgramLog } from './program-log';
import { PROPOSAL_IDLE_LIMIT } from './proposals';

import { unnamedSolidFiles } from './solids/files';
import { StartingSession, startingOn } from './start';
import { AppNotBuiltError } from './static';

export const USAGE = `Usage: visual-anything [open] [folder] [--view <id> [--select <id>]...] [--port <n>] [--no-open]
                      [--dev] [--stop-when-idle] [--log <file>]
       visual-anything mcp [folder] [--dev]
       visual-anything new <folder> [--from <sample>]
       visual-anything export <folder> --view <id> --format <format> [--theme light|dark] [--out <file>]
       visual-anything import <folder> <file> [--map <kind>=<id>]... [--dry-run]
       visual-anything live <folder> [--fresh-for <seconds>] < values.jsonl
       visual-anything notices

Opens the project in folder (the current folder when left out) and serves the app on 127.0.0.1.
When Visual Anything already runs on that folder, it opens a new tab there instead, at the view
asked for. With mcp, runs the MCP server Claude Code and Claude Desktop start instead;
visual-anything mcp --help says more. With new, starts a new project in a folder that holds
nothing yet, from a sample or empty, then opens it; visual-anything new --help says more. With
export, writes a view as SVG, PDF or text; visual-anything export --help says more. With import,
imports a file into the project as one action; visual-anything import --help says more. With live,
shows the live values read from standard input in the Visual Anything running on folder;
visual-anything live --help says more. With notices, prints the code a single executable bundles,
with its licenses and where its source is. A folder that holds nothing yet opens on a start screen,
which starts a project there. A folder named open, new, mcp, export, import, live or notices is
opened as ./open, ./new, ./mcp, ./export, ./import, ./live or ./notices.

  --view <id>       Open the app at this view.
  --select <id>     Select this element, relation or free shape there; give it again, or a list
                    joined by commas, for more. It needs --view.
  --port <n>        Listen on port n, from 0 to 65535 (default 0: any free port).
  --no-open         Print an address that works once, instead of opening the browser.
  --dev             Serve the app from its sources through Vite, with hot reload; only from the
                    repository, not from the executable.
  --stop-when-idle  Stop once no app and no Claude has been connected for a minute, as when
                    Claude started the program; while Claude's proposal waits for review, not
                    before an hour after its last change.
  --log <file>      Append one JSON line to file for each action done, undone or redone, each
                    command refused, each app or Claude attached or gone, and each file of the
                    project changed on disk. It never holds a token, a launch code, a credential,
                    a preference or what a file holds.
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
  /** The file to append the program's log to, as written; relative to the working folder. */
  log?: string;
  help: boolean;
  /** The view state every launch address carries, from `--view` and `--select`; absent without. */
  state?: ViewState;
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
  /**
   * How long `--stop-when-idle` keeps running for Claude's proposal that waits, after its last change
   * joined it (ADR 0073), in milliseconds; an hour by default.
   */
  proposalIdleLimit?: number;
  /** Where the app comes from: by default the app package, built or in dev mode its sources. */
  appSource?: (dev: boolean) => AppSource;
  /**
   * Where the person's preferences are kept (ADR-0032), as `preferencesFolder` works it out; absent,
   * they are kept in memory only, as tests do.
   */
  preferences?: PreferencesLocation;
  /**
   * How to start the program for another project a destination opens, when none runs there: by
   * default a background process of this command's own program; the executable starts itself.
   */
  startProgram?: StartProgram;
  /**
   * Adds this program to Claude Desktop's configuration, when an app asks with `claude/setup` (ADR
   * 0093); absent, the program refuses to.
   */
  setupClaude?: () => Promise<ClaudeSetup>;
}

/** How long a program started with `--stop-when-idle` waits with nothing connected. */
export const IDLE_STOP_DELAY = 60_000;

/** The keys the program answers in a terminal. */
const KEY_HELP =
  'Press o to open Visual Anything in a new tab, or a to print an address that works once.';

/**
 * Reads the command line:
 * `[folder] [--port <n>] [--no-open] [--dev] [--stop-when-idle] [--log <file>] [--help]`.
 */
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
        log: { type: 'string' },
        view: { type: 'string' },
        select: { type: 'string', multiple: true },
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
  const state = stateOf(values.view, values.select ?? []);
  if (!state.ok) return state;
  if (values.log !== undefined && values.log.trim() === '') {
    return { ok: false, message: '--log takes the file to append the log to.' };
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
      ...(values.log === undefined ? {} : { log: values.log }),
      ...(state.value === undefined ? {} : { state: state.value }),
    },
  };
}

/** The view state `--view` and `--select` ask for, checked as an address's is. */
function stateOf(
  view: string | undefined,
  selected: readonly string[],
): { ok: true; value: ViewState | undefined } | { ok: false; message: string } {
  const select = selected.flatMap((each) => each.split(','));
  if (view === undefined) {
    return select.length === 0
      ? { ok: true, value: undefined }
      : { ok: false, message: '--select needs --view, the view to select in.' };
  }
  const checked = checkViewState({ view, ...(select.length === 0 ? {} : { select }) });
  return checked.ok
    ? { ok: true, value: checked.state }
    : { ok: false, message: `--view and --select take ids: ${checked.message}` };
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
  // A program running on the folder already opens the tab, so that one program owns its files.
  const joined = await openInRunningProgram(environment, options);
  if (joined !== undefined) return joined;

  // The program's log, with --log: one JSON line per event (ADR-0016's clarification of W46).
  let programLog: ProgramLog | undefined;
  if (options.log !== undefined) {
    const path = resolve(environment.cwd, options.log);
    try {
      programLog = await ProgramLog.open(path, { err: (line) => environment.err(line) });
    } catch (error) {
      environment.err(
        `Could not open the log ${toForwardSlashes(path)} to write to it (${errorReason(error)}).`,
      );
      return 1;
    }
  }
  try {
    return await runWithLog(environment, options, programLog);
  } finally {
    programLog?.write({ event: 'stopped' });
    await programLog?.close();
  }
}

/** Runs the program once it is known that it starts, with its log when it has one. */
async function runWithLog(
  environment: CommandEnvironment,
  options: CommandLine,
  programLog: ProgramLog | undefined,
): Promise<number> {
  const location = environment.preferences ?? { folder: null };
  if (location.warning !== undefined) environment.err(`Warning: ${location.warning}`);
  const { store: preferences, warning } = await openPreferences(location.folder);
  if (warning !== undefined) environment.err(`Warning: ${warning}`);

  const folder = resolve(environment.cwd, options.folder);
  const stopper = new Stopper();
  const idle = options.stopWhenIdle
    ? new IdleStop(
        environment.idleStopDelay ?? IDLE_STOP_DELAY,
        environment.proposalIdleLimit ?? PROPOSAL_IDLE_LIMIT,
        (proposal) => {
          environment.out(
            proposal
              ? 'Nothing has been connected for a while, and Claude’s proposal has waited an hour since its last change, so Visual Anything stops.'
              : 'Nothing has been connected for a while, so Visual Anything stops.',
          );
          stopper.stop();
        },
      )
    : undefined;
  const sessionOptions = {
    // While Claude's proposal waits, --stop-when-idle waits for the person to review it (ADR 0073).
    ...(idle === undefined
      ? {}
      : { onProposal: (lastJoined: number | undefined) => idle.proposal(lastJoined) }),
    out: (line: string) => environment.out(line),
    err: (line: string) => environment.err(line),
    preferences,
    // A destination to another project opens it through that project's own program (ADR 0056).
    openOtherProject: otherProjectOpener({
      runtime: environment.runtimeFolder,
      dev: options.dev,
      ...(environment.startProgram === undefined ? {} : { start: environment.startProgram }),
    }),
    ...(programLog === undefined ? {} : { log: programLog.write }),
  };
  const { state } = options;
  // A folder that holds nothing yet gets the start screen, from which the person starts a project
  // there, from a sample or empty (ADR 0051).
  const starting = await startingOn(
    folder,
    (each) => openSession(each, sessionOptions),
    preferences,
  );
  if (starting !== undefined && state !== undefined) {
    environment.err(
      `${toForwardSlashes(folder)} holds no project yet, so it has no view to open: leave out --view, and start a project in the browser.`,
    );
    await preferences.close();
    return 2;
  }
  let session: Session | StartingSession;
  if (starting !== undefined) {
    session = starting;
  } else {
    const opened = await openSession(folder, sessionOptions);
    if (!opened.ok) {
      environment.err(`Could not open the project in ${toForwardSlashes(folder)}:`);
      for (const error of opened.errors) environment.err(formatProjectProblem(error));
      await preferences.close();
      return 1;
    }
    session = opened.session;
  }
  const problems = state === undefined ? [] : viewStateProblems(session.snapshot, state);
  if (problems.length > 0) {
    environment.err(`Could not open "${session.snapshot.project.name}" there:`);
    for (const problem of problems) environment.err(`  ${problem}`);
    await session.close();
    await preferences.close();
    return 2;
  }

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
      themeHint: () => themeHintOf(preferences.current()),
      // What Claude's tools may run of package code (ADR 0054).
      codeApprovals: () => preferences.current().codeApprovals,
      codeTurnedOff: () => preferences.current().codeTurnedOff,
      ...(environment.setupClaude === undefined ? {} : { setupClaude: environment.setupClaude }),
    });
  } catch (error) {
    idle?.cancel();
    await session.close();
    await preferences.close();
    environment.err(describeStartFailure(error, options.port));
    return 1;
  }
  stopper.onSignals(environment.signals);
  // Every address that works once carries the view state asked for, beside its launch code.
  const launchUrl = () =>
    state === undefined ? server.launchUrl() : withViewState(server.launchUrl(), state);
  // Before saying it runs, so that Claude can attach as soon as it does.
  let record: string | undefined;
  if (session instanceof StartingSession) {
    environment.out(
      `${toForwardSlashes(folder)} holds no project yet: start one in the browser, from a sample or empty.`,
    );
    // Claude can attach once there is a project to attach to.
    void session.started.then(async (started) => {
      environment.out(
        `Started "${started.snapshot.project.name}" in ${toForwardSlashes(started.folder)}.`,
      );
      record = await recordForClaude(environment, server, started.folder);
    });
  } else {
    record = await recordForClaude(environment, server, session.folder);
    environment.out(`Opened "${session.snapshot.project.name}" from ${toForwardSlashes(folder)}.`);
    for (const warning of session.warnings()) {
      environment.err(`Warning: ${formatProjectProblem(warning)}`);
    }
    // Opening says how many solid files no package names; only the person removes them (ADR 0075).
    const unnamed = await unnamedSolidFiles(session.folder, session.snapshot);
    if (unnamed.length > 0) {
      environment.out(
        `The project's solids/ folder holds ${unnamed.length === 1 ? '1 file' : `${unnamed.length} files`} no package names; they stay until you remove them.`,
      );
    }
  }
  environment.out(`Visual Anything is running at ${server.address}`);
  programLog?.write({ event: 'started', folder: toForwardSlashes(folder), port: server.port });
  if (options.dev) {
    environment.out('Dev mode: Vite serves the app from its sources, with hot reload.');
  }

  if (options.open) {
    void openBrowser(launchUrl()).catch(() => {});
  } else {
    environment.out(
      `Open Visual Anything at this address, which works once, within two minutes: ${launchUrl()}`,
    );
  }
  const stopKeys = environment.keys?.listen((key) => {
    if (key === 'o') void openBrowser(launchUrl()).catch(() => {});
    else if (key === 'a') {
      environment.out(`This address works once, within two minutes: ${launchUrl()}`);
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
    await preferences.close();
  }
  environment.out('Visual Anything stopped.');
  return 0;
}

/**
 * When a program already runs on the command line's folder, asks it to open a tab at the view state
 * asked for, through the interface Claude's `open_app` uses, or with `--no-open` prints its view
 * address, rather than starting a second program on the same files (ADR-0044). Resolves with the exit
 * code then, and with undefined when none runs or none answers, so that the command starts one.
 */
async function openInRunningProgram(
  environment: CommandEnvironment,
  options: CommandLine,
): Promise<number | undefined> {
  const runtime = environment.runtimeFolder;
  if (runtime === undefined || runtime === null) return undefined;
  const bridge = new ProgramBridge({
    folder: resolve(environment.cwd, options.folder),
    runtime,
    attachOnly: true,
  });
  try {
    let project: ProjectSnapshot;
    let address: string;
    try {
      project = await bridge.project();
      address = await bridge.address();
    } catch (error) {
      if (error instanceof OtherBuildError) {
        environment.err(
          'A Visual Anything of another build already runs on this project. Stop it, then start this one again.',
        );
        return 1;
      }
      // Nothing runs there, or nothing that answers: the command starts the program itself.
      if (error instanceof ProgramUnavailableError) return undefined;
      throw error;
    }
    const { state } = options;
    const name = project.project.name;
    const problems = state === undefined ? [] : viewStateProblems(project, state);
    if (problems.length > 0) {
      environment.err(`Could not open "${name}" there:`);
      for (const problem of problems) environment.err(`  ${problem}`);
      return 2;
    }
    // What only a program that starts would use: said, so that nobody wonders why it did nothing.
    const unused = [
      ...(options.dev ? ['--dev'] : []),
      ...(options.log !== undefined ? ['--log'] : []),
      ...(options.port !== 0 && address !== `http://127.0.0.1:${options.port}/` ? ['--port'] : []),
    ];
    if (unused.length > 0) {
      environment.err(
        `${unused.join(' and ')} ${unused.length === 1 ? 'applies' : 'apply'} only to a Visual Anything that starts; stop the one running first to use ${unused.length === 1 ? 'it' : 'them'}.`,
      );
    }
    if (!options.open) {
      environment.out(`Visual Anything already runs on "${name}" at ${address}.`);
      if (state !== undefined) {
        environment.out(
          `This view address opens it there, in the browser where the project is open: ${withViewState(address, state)}`,
        );
      }
      environment.out(
        'Run this again without --no-open to open a new tab there, or press a in the terminal where it runs to print an address that works once.',
      );
      return 0;
    }
    environment.out(
      `Visual Anything already runs on "${name}" at ${address}, so it opens a new tab there.`,
    );
    try {
      await bridge.openApp(state);
    } catch (error) {
      if (!(error instanceof ProgramUnavailableError)) throw error;
      environment.err(`It could not open the tab: ${error.message}`);
      return 1;
    }
    return 0;
  } finally {
    bridge.close();
  }
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

/**
 * Calls `onIdle` once nothing has been connected for `delay` milliseconds, counted from the start or
 * from the last change it heard of. While Claude's proposal waits, it waits on, until `limit`
 * milliseconds after the proposal's last change, and then tells `onIdle` that a proposal waited.
 */
class IdleStop {
  readonly #delay: number;
  readonly #limit: number;
  readonly #onIdle: (proposal: boolean) => void;
  #count = 0;
  #started = false;
  /** When the last change joined the proposal that waits; undefined when none waits. */
  #proposal: number | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(delay: number, limit: number, onIdle: (proposal: boolean) => void) {
    this.#delay = delay;
    this.#limit = limit;
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

  /** Hears when the last change joined Claude's proposal, or that none waits. */
  proposal(lastJoined: number | undefined): void {
    this.#proposal = lastJoined;
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
    this.#timer = setTimeout(() => this.#fire(), this.#delay);
  }

  /** Stops, unless a proposal waits that has not waited its limit yet. */
  #fire(): void {
    this.#timer = undefined;
    if (this.#proposal !== undefined) {
      const left = this.#proposal + this.#limit - Date.now();
      if (left > 0) {
        this.#timer = setTimeout(() => this.#fire(), left);
        return;
      }
    }
    this.#onIdle(this.#proposal !== undefined);
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
