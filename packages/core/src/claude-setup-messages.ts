/**
 * The live protocol's request to connect Claude Desktop, and its answer (ADR 0093, section 3). The
 * app sends `claude/setup` once the person confirmed in "Connect Claude…"; the local program runs
 * what `visual-anything setup-claude` runs, and answers with `claude/setup-answer`: what it did to
 * Claude Desktop's configuration, the server entry it holds, and the command for Claude Code to copy.
 *
 * Each reader keeps only what its message holds, or says why it cannot be read; the live protocol
 * turns that into its own error.
 */

/** Asks the local program to add Visual Anything to Claude Desktop's configuration. */
export interface ClaudeSetupMessage {
  type: 'claude/setup';
  requestId: string;
}

/**
 * What setting Claude up came to: `written`, the configuration now holds Visual Anything; `already`,
 * it held it as it is, and nothing was changed; `from-sources`, this program runs from its sources,
 * which have no single executable to name, so nothing was written and the entry is to copy; and
 * `refused`, nothing was changed, for the reason `why` says.
 */
export type ClaudeSetupOutcome = 'written' | 'already' | 'from-sources' | 'refused';

/** The outcomes, in the order the type lists them. */
export const CLAUDE_SETUP_OUTCOMES: readonly ClaudeSetupOutcome[] = [
  'written',
  'already',
  'from-sources',
  'refused',
];

/** How Claude starts Visual Anything's MCP server: `mcpServers["visual-anything"]`. */
export interface ClaudeServerEntry {
  command: string;
  args: string[];
  /** Variables set for it, which only a program run from its sources needs. */
  env?: Record<string, string>;
}

/** What the local program did about Claude Desktop's configuration. */
export interface ClaudeSetupAnswerMessage {
  type: 'claude/setup-answer';
  requestId: string;
  outcome: ClaudeSetupOutcome;
  /** The configuration file's absolute path; absent when this computer has no folder for it. */
  config?: string;
  /** The copy of the file as it was, when one was made before writing. */
  backup?: string;
  /** The entry the configuration holds, or would hold, for Visual Anything. */
  entry: ClaudeServerEntry;
  /** The command that adds the same server to Claude Code, which the program never runs. */
  claudeCode: string;
  /** Why nothing was changed, in words; only for `refused`. */
  why?: string;
}

/** A message read, or why it could not be. */
export type ClaudeSetupRead<T> = { ok: true; message: T } | { ok: false; reason: string };

/** The longest path, command or reason such an answer carries. */
export const MAX_CLAUDE_SETUP_TEXT = 4096;

/** The most arguments or variables an entry holds. */
const MAX_ENTRY_PARTS = 32;

/** Reads an app's request to set Claude up: it holds nothing but its id. */
export function readClaudeSetup(requestId: string): ClaudeSetupRead<ClaudeSetupMessage> {
  return { ok: true, message: { type: 'claude/setup', requestId } };
}

/** Reads the local program's answer strictly: every text is text, of a bounded length. */
export function readClaudeSetupAnswer(
  message: Record<string, unknown>,
  requestId: string,
): ClaudeSetupRead<ClaudeSetupAnswerMessage> {
  const { outcome, config, backup, entry, claudeCode, why } = message;
  if (typeof outcome !== 'string' || !(CLAUDE_SETUP_OUTCOMES as string[]).includes(outcome)) {
    return {
      ok: false,
      reason: 'Setting up Claude ends written, already there, from the sources or refused.',
    };
  }
  const optional = [config, backup, why].every((each) => each === undefined || isText(each));
  if (!optional || !isText(claudeCode)) {
    return { ok: false, reason: 'Setting up Claude answers with paths and words as text.' };
  }
  const read = readEntry(entry);
  if (read === undefined) {
    return {
      ok: false,
      reason: 'Setting up Claude answers with the server’s command and arguments.',
    };
  }
  return {
    ok: true,
    message: {
      type: 'claude/setup-answer',
      requestId,
      outcome: outcome as ClaudeSetupOutcome,
      ...(config === undefined ? {} : { config: config as string }),
      ...(backup === undefined ? {} : { backup: backup as string }),
      entry: read,
      claudeCode,
      ...(why === undefined ? {} : { why: why as string }),
    },
  };
}

function readEntry(value: unknown): ClaudeServerEntry | undefined {
  if (!isRecord(value) || !isText(value.command) || !Array.isArray(value.args)) return undefined;
  const args: unknown[] = value.args;
  if (args.length > MAX_ENTRY_PARTS || !args.every(isText)) return undefined;
  if (value.env === undefined) return { command: value.command, args: args };
  if (!isRecord(value.env)) return undefined;
  const env = Object.entries(value.env);
  if (env.length > MAX_ENTRY_PARTS || !env.every(([, each]) => isText(each))) return undefined;
  return {
    command: value.command,
    args: args,
    env: Object.fromEntries(env) as Record<string, string>,
  };
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_CLAUDE_SETUP_TEXT;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
