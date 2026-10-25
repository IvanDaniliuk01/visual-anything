/**
 * The local program's command line, for `cli.ts`, `mcp-cli.ts` and the single executable alike:
 *
 *   visual-anything [folder] [--port <n>] [--no-open] [--dev] [--stop-when-idle]
 *   visual-anything mcp [folder] [--dev]
 *
 * The first opens the project folder, serves the app on 127.0.0.1 and opens the browser on it. The
 * second is Claude's MCP entry point, which Claude Code and Claude Desktop start: it speaks MCP on
 * stdin and stdout, so it writes nothing else there, and every line of its own goes to stderr.
 */
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import open from 'open';
import { ProgramBridge } from './claude/bridge';
import { runtimeFolder } from './claude/discovery';
import { MCP_USAGE, createMcpServer, parseMcpCommandLine } from './claude/mcp';
import { parseCommandLine, runCommand, type KeyInput } from './command';
import { errorCode } from './errors';
import { DEV_IN_EXECUTABLE, isExecutable, startProgramWith } from './executable';
import { preferencesFolder } from './preferences';

/** The subcommand that runs Claude's MCP entry point. */
export const MCP_COMMAND = 'mcp';

/** Which entry point a command line runs, with the arguments that entry point reads. */
export interface Entry {
  kind: 'program' | 'mcp';
  argv: string[];
}

/**
 * Which entry point a command line runs: the MCP entry point when its first argument is `mcp`, the
 * local program otherwise. A folder named `mcp` is opened as `./mcp`.
 */
export function entryOf(argv: readonly string[]): Entry {
  return argv[0] === MCP_COMMAND
    ? { kind: 'mcp', argv: argv.slice(1) }
    : { kind: 'program', argv: [...argv] };
}

/** Runs the entry point a command line asks for, and leaves its exit code to the process. */
export function main(argv: readonly string[]): void {
  const entry = entryOf(argv);
  const run =
    entry.kind === 'mcp'
      ? runMcp(entry.argv, {
          usage: MCP_USAGE.replace('visual-anything-mcp', 'visual-anything mcp'),
        })
      : runProgram(entry.argv);
  void run.then((code) => {
    if (code !== undefined) process.exitCode = code;
  });
}

/**
 * Runs the local program on the command line's folder until it is stopped, and resolves with its
 * exit code. The executable refuses `--dev`, having no sources to serve.
 */
export async function runProgram(
  argv: readonly string[],
  executable: boolean = isExecutable(),
): Promise<number> {
  if (executable) {
    const parsed = parseCommandLine(argv);
    if (parsed.ok && parsed.value.dev) {
      console.error(DEV_IN_EXECUTABLE);
      return 2;
    }
  }
  const keys = terminalKeys();
  return runCommand(argv, {
    cwd: process.cwd(),
    out: (line) => console.log(line),
    err: (line) => console.error(line),
    openBrowser: browserOpener((url) => open(url), process.platform),
    signals: process,
    preferences: preferencesFolder(process.platform, process.env, homedir()),
    ...(keys === undefined ? {} : { keys }),
    runtimeFolder: runtimeFolder(process.platform, process.env, homedir()),
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
