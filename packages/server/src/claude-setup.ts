/**
 * Claude connected in one step (ADR 0093, section 3): `visual-anything setup-claude`, and the app's
 * "Connect Claude…" through `claude/setup`, add Visual Anything to Claude Desktop's configuration,
 * `claude_desktop_config.json` in Claude's folder for the system, as
 * `mcpServers["visual-anything"] = { command: <this executable>, args: ["mcp"] }`. That attaches to
 * whichever single Visual Anything is running (ADR 0029).
 *
 * It copies the file to `claude_desktop_config.json.bak` before writing it, changes no other key,
 * refuses a file that is not valid JSON, and run again changes nothing. It writes only that file and
 * its backup, and never starts, restarts or configures Claude itself: for Claude Code it gives the
 * `claude mcp add` command to run. Run from the sources there is no single executable to name, so it
 * writes nothing and gives the entry to add by hand instead.
 */
import { copyFile, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { posix, win32 } from 'node:path';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ClaudeServerEntry,
  ClaudeSetupAnswerMessage,
  ClaudeSetupOutcome,
} from '@visual-anything/core';
import { errorCode, errorReason } from './errors';
import { writeFileAtomic } from './writer';

/** The name Visual Anything's server has in Claude's configuration and in Claude Code. */
export const CLAUDE_SERVER_NAME = 'visual-anything';

/** Claude Desktop's configuration file, in its folder. */
export const CLAUDE_CONFIG_FILE = 'claude_desktop_config.json';

/** What is added to the configuration file's name for the copy kept before writing it. */
export const BACKUP_SUFFIX = '.bak';

/** The subcommand, as `visual-anything setup-claude`. */
export const SETUP_CLAUDE_COMMAND = 'setup-claude';

export const SETUP_CLAUDE_USAGE = `Usage: visual-anything ${SETUP_CLAUDE_COMMAND}

Adds Visual Anything to Claude Desktop's configuration, so that Claude Desktop can work on the
project Visual Anything has open. It keeps a copy of the file as it was, changes nothing else in it,
and prints the command that adds Visual Anything to Claude Code. Restart Claude Desktop afterwards.`;

/** The longest configuration file read, which Claude's own is far below. */
const MAX_CONFIG_BYTES = 4 * 1024 * 1024;

/** What Claude starts: this single executable by its absolute path, or the sources' entry point. */
export type ClaudeProgram =
  { executable: true; path: string } | { executable: false; entry: ClaudeServerEntry };

export interface ClaudeSetupOptions {
  /** Claude Desktop's folder, as {@link claudeDesktopFolder} finds it; `null` when there is none. */
  folder: string | null;
  program: ClaudeProgram;
  /** The system the commands are written for; this one by default. */
  platform?: NodeJS.Platform;
}

/** What setting Claude up came to, as `claude/setup-answer` carries it without its envelope. */
export type ClaudeSetup = Omit<ClaudeSetupAnswerMessage, 'type' | 'requestId'>;

/**
 * Claude Desktop's folder on a system: `%APPDATA%\Claude` on Windows,
 * `~/Library/Application Support/Claude` on macOS, and `$XDG_CONFIG_HOME/Claude` or `~/.config/Claude`
 * elsewhere, where Electron keeps an application's data. A relative variable is passed over; `null`
 * when there is no home folder to find it in.
 */
export function claudeDesktopFolder(
  platform: NodeJS.Platform,
  env: Readonly<Record<string, string | undefined>>,
  home: string,
): string | null {
  const path = platform === 'win32' ? win32 : posix;
  const absolute = (value: string | undefined): value is string =>
    value !== undefined && value !== '' && path.isAbsolute(value);
  if (platform === 'win32' && absolute(env.APPDATA)) return path.join(env.APPDATA, 'Claude');
  if (!absolute(home)) return null;
  if (platform === 'win32') return path.join(home, 'AppData', 'Roaming', 'Claude');
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Claude');
  const config = absolute(env.XDG_CONFIG_HOME) ? env.XDG_CONFIG_HOME : path.join(home, '.config');
  return path.join(config, 'Claude');
}

/**
 * How Claude starts this program from its sources: Node.js, by its absolute path, running the MCP
 * entry point through the TypeScript loader the repository installs, which reads the program's own
 * configuration (ADR 0029, ADR 0072's clarification of 2026-10-29), as the guide writes it.
 */
export function sourcesEntry(): ClaudeServerEntry {
  const slashes = (path: string) => path.replaceAll('\\', '/');
  return {
    command: process.execPath,
    args: [
      slashes(createRequire(import.meta.url).resolve('tsx/cli')),
      slashes(fileURLToPath(new URL('./mcp-cli.ts', import.meta.url))),
    ],
    env: {
      TSX_TSCONFIG_PATH: slashes(fileURLToPath(new URL('../tsconfig.json', import.meta.url))),
    },
  };
}

/** The entry Claude's configuration holds for a program. */
function entryFor(program: ClaudeProgram): ClaudeServerEntry {
  return program.executable ? { command: program.path, args: ['mcp'] } : program.entry;
}

/**
 * The `claude mcp add` command that adds the same server to Claude Code. What a shell would split or
 * expand is quoted, and Windows paths are written with forward slashes, which every shell there keeps.
 */
export function claudeCodeCommand(
  entry: ClaudeServerEntry,
  platform: NodeJS.Platform = process.platform,
): string {
  const word = (text: string) => {
    const written = platform === 'win32' ? text.replaceAll('\\', '/') : text;
    return /^[\w@%+=:,./-]+$/u.test(written) ? written : `"${written.replaceAll('"', '\\"')}"`;
  };
  const env = Object.entries(entry.env ?? {}).map(
    ([name, value]) => `-e ${word(`${name}=${value}`)}`,
  );
  return [
    'claude mcp add',
    CLAUDE_SERVER_NAME,
    ...env,
    '--',
    word(entry.command),
    ...entry.args.map(word),
  ].join(' ');
}

/**
 * Adds Visual Anything to Claude Desktop's configuration, as the module says, and resolves with what
 * it did. It never rejects: a file it cannot read or write is a refusal, with why.
 */
export async function setUpClaude(options: ClaudeSetupOptions): Promise<ClaudeSetup> {
  const entry = entryFor(options.program);
  const claudeCode = claudeCodeCommand(entry, options.platform);
  const outcome = (
    what: ClaudeSetupOutcome,
    more: { config?: string; backup?: string; why?: string } = {},
  ): ClaudeSetup => ({
    outcome: what,
    ...(more.config === undefined ? {} : { config: more.config }),
    ...(more.backup === undefined ? {} : { backup: more.backup }),
    entry,
    claudeCode,
    ...(more.why === undefined ? {} : { why: more.why }),
  });
  if (options.folder === null) {
    return outcome('refused', {
      why: 'There is no folder for Claude Desktop’s configuration on this computer.',
    });
  }
  const config = join(options.folder, CLAUDE_CONFIG_FILE);
  if (!options.program.executable) return outcome('from-sources', { config });

  let text: string | undefined;
  try {
    const bytes = await readFile(config);
    if (bytes.byteLength > MAX_CONFIG_BYTES) {
      return outcome('refused', {
        config,
        why: 'Claude Desktop’s configuration is larger than 4 MiB, so nothing was changed.',
      });
    }
    text = bytes.toString('utf8');
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') {
      return outcome('refused', {
        config,
        why: `Could not read Claude Desktop’s configuration, so nothing was changed: ${errorReason(error)}`,
      });
    }
  }

  let settings: Record<string, unknown> = {};
  if (text !== undefined) {
    let parsed: unknown;
    try {
      // A byte order mark, which some editors write, is not part of the JSON.
      parsed = JSON.parse(text.startsWith('\u{FEFF}') ? text.slice(1) : text);
    } catch (error) {
      return outcome('refused', {
        config,
        why: `Claude Desktop’s configuration is not valid JSON, so nothing was changed: ${errorReason(error)}`,
      });
    }
    if (!isRecord(parsed)) {
      return outcome('refused', {
        config,
        why: 'Claude Desktop’s configuration is not a JSON object, so nothing was changed.',
      });
    }
    settings = parsed;
  }
  const servers = settings.mcpServers ?? {};
  if (!isRecord(servers)) {
    return outcome('refused', {
      config,
      why: 'The servers in Claude Desktop’s configuration, its "mcpServers", are not a JSON object, so nothing was changed.',
    });
  }
  if (sameEntry(servers[CLAUDE_SERVER_NAME], entry)) return outcome('already', { config });

  const updated = { ...settings, mcpServers: { ...servers, [CLAUDE_SERVER_NAME]: entry } };
  const backup = `${config}${BACKUP_SUFFIX}`;
  try {
    if (text !== undefined) await copyFile(config, backup);
    await writeFileAtomic(
      config,
      new TextEncoder().encode(`${JSON.stringify(updated, null, 2)}\n`),
    );
  } catch (error) {
    return outcome('refused', {
      config,
      why: `Could not write Claude Desktop’s configuration: ${errorReason(error)}`,
    });
  }
  return outcome('written', { config, ...(text === undefined ? {} : { backup }) });
}

/** Whether the configuration's entry for Visual Anything is this one, keys in any order. */
function sameEntry(value: unknown, entry: ClaudeServerEntry): boolean {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  const wanted = Object.keys(entry).sort();
  if (keys.join() !== wanted.join()) return false;
  if (value.command !== entry.command) return false;
  if (!Array.isArray(value.args) || JSON.stringify(value.args) !== JSON.stringify(entry.args)) {
    return false;
  }
  if (entry.env === undefined) return true;
  const env = value.env;
  if (!isRecord(env)) return false;
  const names = Object.keys(entry.env);
  return (
    Object.keys(env).length === names.length &&
    names.every((name) => env[name] === entry.env![name])
  );
}

/** Reads `setup-claude`'s command line: nothing, or `--help`. */
export function parseSetupClaudeCommandLine(
  argv: readonly string[],
): { ok: true; help: boolean } | { ok: false; message: string } {
  if (argv.length === 0) return { ok: true, help: false };
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h'))
    return { ok: true, help: true };
  return { ok: false, message: `${SETUP_CLAUDE_COMMAND} takes no arguments: ${argv.join(' ')}` };
}

/** What `setup-claude` prints of what it did, a line each. */
export function describeClaudeSetup(setup: ClaudeSetup): string[] {
  const config = setup.config ?? '';
  const claudeCode = [`For Claude Code, run: ${setup.claudeCode}`];
  switch (setup.outcome) {
    case 'written':
      return [
        `Added Visual Anything to Claude Desktop's configuration, ${config}.`,
        ...(setup.backup === undefined ? [] : [`The file as it was is kept in ${setup.backup}.`]),
        'Restart Claude Desktop to use it: quit it fully, then open it again.',
        ...claudeCode,
      ];
    case 'already':
      return [
        `Claude Desktop's configuration, ${config}, already has Visual Anything: nothing was changed.`,
        'If Claude Desktop does not show it, restart Claude Desktop: quit it fully, then open it again.',
        ...claudeCode,
      ];
    case 'from-sources':
      return [
        'This Visual Anything runs from its sources, so nothing was written: setup-claude names the single executable, which Claude starts by itself.',
        `To have Claude Desktop start these sources instead, add this to "mcpServers" in ${config}, then restart Claude Desktop:`,
        JSON.stringify({ [CLAUDE_SERVER_NAME]: setup.entry }, null, 2),
        ...claudeCode,
      ];
    case 'refused':
      return [setup.why ?? 'Nothing was changed.'];
  }
}

/** Runs `setup-claude`, printing what it did; 1 when it was refused, 2 for a wrong command line. */
export async function runSetupClaude(
  argv: readonly string[],
  io: {
    out: (line: string) => void;
    err: (line: string) => void;
    setUp: () => Promise<ClaudeSetup>;
  },
): Promise<number> {
  const parsed = parseSetupClaudeCommandLine(argv);
  if (!parsed.ok) {
    io.err(parsed.message);
    io.err(SETUP_CLAUDE_USAGE);
    return 2;
  }
  if (parsed.help) {
    io.out(SETUP_CLAUDE_USAGE);
    return 0;
  }
  const setup = await io.setUp();
  const lines = describeClaudeSetup(setup);
  if (setup.outcome === 'refused') {
    for (const line of lines) io.err(line);
    if (setup.config !== undefined) io.err(`The file is ${setup.config}.`);
    return 1;
  }
  for (const line of lines) io.out(line);
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
