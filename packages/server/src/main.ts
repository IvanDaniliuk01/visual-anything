/**
 * The local program's command line, for `cli.ts`, `mcp-cli.ts` and the single executable alike:
 *
 *   visual-anything [open] [folder] [--view <id> [--select <id>]...] [--port <n>] [--no-open]
 *                   [--dev] [--stop-when-idle]
 *   visual-anything mcp [folder] [--dev]
 *   visual-anything new <folder> [--from <sample>] [--port <n>] [--no-open] [--dev]
 *   visual-anything export <folder> --view <id> --format <format> [--theme <theme>] [--out <file>]
 *   visual-anything compare <folder> --base <ref> [--head <ref>] [--view <id>]... --out <folder>
 *                           [--theme <theme>] [--image-url <prefix>]
 *   visual-anything import <folder> <file> [--map <kind>=<id>]... [--dry-run]
 *   visual-anything live <folder> [--fresh-for <seconds>] < values.jsonl
 *   visual-anything notices
 *   visual-anything merge-driver <ancestor> <ours> <theirs> <path> [<ours' name> <theirs' name>]
 *   visual-anything merge-driver --install [--global] [--no-attributes] | --uninstall [--global]
 *
 * The first opens the project folder, serves the app on 127.0.0.1 and opens the browser on it, at
 * the view and selection asked for; `open` says so and changes nothing. The second is Claude's MCP
 * entry point, which Claude Code and Claude Desktop start: it speaks MCP on
 * stdin and stdout, so it writes nothing else there, and every line of its own goes to stderr. `new`
 * starts a new project; `export` writes a view as a file, reading the project itself
 * (`export-command.ts`); `compare` writes what changed between two versions, for a pull request,
 * reading them itself (`compare-command.ts`, ADR 0070); `import` imports a file into a project as one action of the person's
 * (ADR-0042); `live` pipes live values into the program running on the folder
 * (`live-command.ts`, ADR 0057); and `merge-driver` is what git runs to merge two edits of a project
 * file by id, once `merge-driver --install` defines it in the person's git configuration
 * (`merge-driver.ts`, ADR 0072).
 */
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import open from 'open';
import { ProgramBridge } from './claude/bridge';
import { runtimeFolder } from './claude/discovery';
import { MCP_USAGE, createMcpServer, parseMcpCommandLine } from './claude/mcp';
import { parseCommandLine, runCommand, type KeyInput } from './command';
import { runImport } from './import-command';
import { errorCode } from './errors';
import { runNewCommand } from './new-command';
import { DEV_IN_EXECUTABLE, isExecutable, noticesText, startProgramWith } from './executable';
import { preferencesFolder } from './preferences';

/** The subcommand that runs Claude's MCP entry point. */
export const MCP_COMMAND = 'mcp';

/** The word that may come before the local program's folder, as in `visual-anything open shop`. */
export const OPEN_COMMAND = 'open';

/** The subcommand that exports a view as a file (M6b), with no program running. */
export const EXPORT_COMMAND = 'export';

/** The subcommand that compares two versions for a pull request (ADR 0070), with no program running. */
export const COMPARE_COMMAND = 'compare';

/** The subcommand that starts a new project, from a sample or empty, then opens it (ADR 0051). */
export const NEW_COMMAND = 'new';

/** The subcommand that imports a file into a project (ADR-0042). */
export const IMPORT_COMMAND = 'import';

/** The subcommand that pipes live values into the program running on a folder (ADR 0057). */
export const LIVE_COMMAND = 'live';

/** The subcommand that prints the notice of the code the executable bundles (ADR 0037, ADR 0068). */
export const NOTICES_COMMAND = 'notices';

/** The subcommand git runs to merge a project file by id, and that installs it (ADR 0072). */
export const MERGE_DRIVER_COMMAND = 'merge-driver';

/** Which entry point a command line runs, with the arguments that entry point reads. */
export interface Entry {
  kind:
    | 'program'
    | 'mcp'
    | 'new'
    | 'export'
    | 'compare'
    | 'import'
    | 'live'
    | 'notices'
    | 'merge-driver';
  argv: string[];
}

/**
 * Which entry point a command line runs: the MCP entry point when its first argument is `mcp`, the
 * export when it is `export`, the comparison when it is `compare`, the import when it is `import`, a new project when it is `new`, the
 * merge driver when it is `merge-driver`, the local program otherwise, with `open` before its folder
 * left out. A folder named like a subcommand, such as `mcp` or `open`, is opened as `./mcp` or
 * `./open`.
 */
export function entryOf(argv: readonly string[]): Entry {
  if (argv[0] === MCP_COMMAND) return { kind: 'mcp', argv: argv.slice(1) };
  if (argv[0] === EXPORT_COMMAND) return { kind: 'export', argv: argv.slice(1) };
  if (argv[0] === COMPARE_COMMAND) return { kind: 'compare', argv: argv.slice(1) };
  if (argv[0] === IMPORT_COMMAND) return { kind: 'import', argv: argv.slice(1) };
  if (argv[0] === OPEN_COMMAND) return { kind: 'program', argv: argv.slice(1) };
  if (argv[0] === NEW_COMMAND) return { kind: 'new', argv: argv.slice(1) };
  if (argv[0] === LIVE_COMMAND) return { kind: 'live', argv: argv.slice(1) };
  if (argv[0] === NOTICES_COMMAND) return { kind: 'notices', argv: argv.slice(1) };
  if (argv[0] === MERGE_DRIVER_COMMAND) return { kind: 'merge-driver', argv: argv.slice(1) };
  return { kind: 'program', argv: [...argv] };
}

/** Runs the entry point a command line asks for, and leaves its exit code to the process. */
export function main(argv: readonly string[]): void {
  const entry = entryOf(argv);
  const run =
    entry.kind === 'mcp'
      ? runMcp(entry.argv, {
          usage: MCP_USAGE.replace('visual-anything-mcp', 'visual-anything mcp'),
        })
      : entry.kind === 'export'
        ? runExportCommand(entry.argv)
        : entry.kind === 'compare'
          ? runCompareCommand(entry.argv)
          : entry.kind === 'import'
            ? runImport(entry.argv, {
                cwd: process.cwd(),
                out: (line) => console.log(line),
                err: (line) => console.error(line),
                runtimeFolder: runtimeFolder(process.platform, process.env, homedir()),
              })
            : entry.kind === 'live'
              ? runLiveCommand(entry.argv)
              : entry.kind === 'notices'
                ? Promise.resolve(printNotices())
                : entry.kind === 'merge-driver'
                  ? runMergeDriverCommand(entry.argv)
                  : runProgram(
                      entry.argv,
                      isExecutable(),
                      entry.kind === 'new' ? runNewCommand : runCommand,
                    );
  void run.then((code) => {
    if (code !== undefined) process.exitCode = code;
  });
}

/**
 * Runs the export command on the process's own streams. Its writers, which draw scenes and make PDFs,
 * are loaded only for it, so that the program and the MCP entry point start without them.
 */
export async function runExportCommand(argv: readonly string[]): Promise<number> {
  const { runExport } = await import('./export-command');
  return runExport(argv, {
    cwd: process.cwd(),
    stdout: (data) => process.stdout.write(data),
    stdoutIsTerminal: process.stdout.isTTY === true,
    err: (line) => console.error(line),
  });
}

/**
 * Runs the compare command on the process's own streams. Like the export, its writers are loaded only
 * for it.
 */
export async function runCompareCommand(argv: readonly string[]): Promise<number> {
  const { runCompare } = await import('./compare-command');
  return runCompare(argv, {
    cwd: process.cwd(),
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  });
}

/**
 * Runs the merge driver, or installs it, on the process's own streams. Git shows what the driver says
 * on stderr; what installing says goes to stdout.
 */
export async function runMergeDriverCommand(argv: readonly string[]): Promise<number> {
  const { runMergeDriver } = await import('./merge-driver');
  return runMergeDriver(argv, {
    cwd: process.cwd(),
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  });
}

/** Prints the notice of the code this executable bundles, with its licenses and sources. */
export function printNotices(executable: boolean = isExecutable()): number {
  console.log(noticesText(executable));
  return 0;
}

/** Runs the live command on the process's own streams, until its input ends. */
export async function runLiveCommand(argv: readonly string[]): Promise<number> {
  const { runLive } = await import('./live-command');
  return runLive(argv, {
    cwd: process.cwd(),
    input: process.stdin,
    out: (line) => console.log(line),
    err: (line) => console.error(line),
    runtimeFolder: runtimeFolder(process.platform, process.env, homedir()),
  });
}

/**
 * Runs the local program on the command line's folder until it is stopped, and resolves with its
 * exit code. The executable refuses `--dev`, having no sources to serve.
 */
export async function runProgram(
  argv: readonly string[],
  executable: boolean = isExecutable(),
  command: typeof runCommand = runCommand,
): Promise<number> {
  if (executable) {
    const parsed = parseCommandLine(argv);
    if (parsed.ok && parsed.value.dev) {
      console.error(DEV_IN_EXECUTABLE);
      return 2;
    }
  }
  const keys = terminalKeys();
  const runtime = runtimeFolder(process.platform, process.env, homedir());
  return command(argv, {
    cwd: process.cwd(),
    out: (line) => console.log(line),
    err: (line) => console.error(line),
    openBrowser: browserOpener((url) => open(url), process.platform),
    signals: process,
    preferences: preferencesFolder(process.platform, process.env, homedir()),
    ...(keys === undefined ? {} : { keys }),
    runtimeFolder: runtime,
    // The executable starts itself for another project a destination opens (ADR 0056).
    ...(executable ? { startProgram: startProgramWith(runtime) } : {}),
  });
}

/** How the MCP entry point was started, and where. */
export interface McpOptions {
  /** The usage it shows, under the name it was started by. */
  usage?: string;
  /** Whether it runs in the single executable; this process's own answer by default. */
  executable?: boolean;
}

/**
 * Runs Claude's MCP entry point on stdio. It resolves with an exit code when it ends at once, for
 * help or arguments it does not understand, and with `undefined` once it serves, which it does until
 * Claude closes stdin. It attaches to the running local program of the project, starting it when
 * needed, through the Claude endpoint and the credential the program's record holds; from the
 * executable, it starts the executable itself.
 */
export async function runMcp(
  argv: readonly string[],
  options: McpOptions = {},
): Promise<number | undefined> {
  const usage = options.usage ?? MCP_USAGE;
  const parsed = parseMcpCommandLine(argv);
  if (!parsed.ok) {
    console.error(parsed.message);
    console.error(usage);
    return 2;
  }
  if (parsed.help) {
    console.error(usage);
    return 0;
  }
  const executable = options.executable ?? isExecutable();
  if (executable && parsed.dev) {
    console.error(DEV_IN_EXECUTABLE);
    return 2;
  }
  const runtime = runtimeFolder(process.platform, process.env, homedir());
  const program = new ProgramBridge({
    ...(parsed.folder === undefined ? {} : { folder: resolve(process.cwd(), parsed.folder) }),
    runtime,
    dev: parsed.dev,
    ...(executable ? { start: startProgramWith(runtime) } : {}),
  });
  const server = createMcpServer(program);
  server.server.onclose = () => program.close();
  // Claude ends the session by closing stdin, and waits for the entry point to exit: it lets go of
  // the program, which keeps running for the app, and nothing is left to keep this process alive.
  process.stdin.once('end', () => {
    void server.close();
  });
  await server.connect(new StdioServerTransport());
  return undefined;
}

/**
 * Opens the browser through `openUrl`. On Linux, where the browser opens through the system's
 * `xdg-open`, a missing one is said in words.
 */
export function browserOpener(
  openUrl: (url: string) => Promise<unknown>,
  platform: NodeJS.Platform,
): (url: string) => Promise<unknown> {
  return async (url) => {
    try {
      return await openUrl(url);
    } catch (error) {
      if (platform === 'linux' && errorCode(error) === 'ENOENT') {
        throw new Error(
          'xdg-open, which opens the browser on Linux, is not installed; it comes with xdg-utils',
          { cause: error },
        );
      }
      throw error;
    }
  };
}

/** The keys pressed in this terminal, read one at a time; absent when stdin is not a terminal. */
function terminalKeys(): KeyInput | undefined {
  const { stdin } = process;
  if (!stdin.isTTY) return undefined;
  return {
    listen: (onKey) => {
      const onData = (data: string) => {
        for (const key of data) onKey(key);
      };
      stdin.setRawMode(true);
      stdin.setEncoding('utf8');
      stdin.on('data', onData);
      stdin.resume();
      return () => {
        stdin.off('data', onData);
        stdin.setRawMode(false);
        stdin.pause();
      };
    },
  };
}
