/**
 * `visual-anything import <folder> <file>` (ADR-0042, ADR-0049): reads a file made elsewhere, maps its
 * kinds from the built-in suggestions and the `--map` choices, and lands it as one undoable action of
 * the person's. When a program runs on the project, the import goes through it, since one program owns
 * a project's files (ADR-0044); otherwise the command opens the project itself, applies the import and
 * saves. It reads only the file it is given.
 */
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  MAX_IMPORT_TEXT,
  recordOf,
  type BatchCommand,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import {
  NoProgramRunningError,
  OtherBuildError,
  ProgramBridge,
  ProgramUnavailableError,
  type CommandAnswer,
} from './claude/bridge';
import type { RuntimeContext } from './claude/discovery';
import { CLAUDE_MAX_PAYLOAD, encodeClaudeMessage, importMessageRequest } from './claude/messages';
import { errorReason } from './errors';
import { describePreview, previewImport, type ImportRequest } from './import';
import { toForwardSlashes } from './paths';
import { formatProjectProblem } from './project';
import { openSession } from './session';

export const IMPORT_USAGE = `Usage: visual-anything import <folder> <file> [--map <kind>=<id>]... [--nesting <id>]
                             [--key <column>] [--format <format>] [--no-view] [--dry-run]

Imports a Mermaid diagram (flowchart, C4, ER or class), a spreadsheet (CSV or TSV), JSON, a
Structurizr workspace in JSON, a LikeC4 model or a draw.io file (.drawio, .xml, .drawio.svg or
.drawio.png) into the project in folder, as one action you can undo in the app. Structurizr DSL is
not read: export it to JSON first, with structurizr-cli export -workspace workspace.dsl -format json.
When Visual Anything runs on the project, the import goes through it; otherwise the project is
opened, the import applied and saved.

  --map <kind>=<id>  Map a kind of the file, as --dry-run lists them, to a component or relation
                     type by its id; give it again for more, and =<id> for rows that name no
                     component. Other kinds take the suggested ones.
  --nesting <id>     The relation type that puts what sits inside what in its container.
  --key <column>     For a spreadsheet or JSON: match rows to the project's elements by this column,
                     to import again; the id column by default.
  --format <format>  Read the file as structurizr, likec4, drawio, json, mermaid or table, whatever
                     its name says.
  --no-view          Do not create the view a diagram brings.
  --dry-run          Say what the import would do, and import nothing.
  -h, --help         Show this help.`;

/** What the import command uses from the world around it. */
export interface ImportEnvironment {
  /** The folder relative paths are resolved against. */
  cwd: string;
  out(line: string): void;
  err(line: string): void;
  /** Where running programs leave their records; `null` or absent looks for none. */
  runtimeFolder?: string | null;
  /** Whose runtime folder it is, as discovery checks records; this process's by default. */
  context?: RuntimeContext;
}

/** The import's arguments, read. */
interface ImportCommandLine {
  folder: string;
  file: string;
  request: Omit<ImportRequest, 'name' | 'text' | 'bytes'>;
  dryRun: boolean;
}

/** Reads the import's arguments, or says what is wrong with them. */
export function parseImportCommandLine(
  argv: readonly string[],
):
  | { ok: true; value: ImportCommandLine }
  | { ok: true; help: true }
  | { ok: false; message: string } {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        map: { type: 'string', multiple: true },
        nesting: { type: 'string' },
        key: { type: 'string' },
        format: { type: 'string' },
        'no-view': { type: 'boolean' },
        'dry-run': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  const { values, positionals } = parsed;
  if (values.help === true) return { ok: true, help: true };
  if (positionals.length !== 2) {
    return {
      ok: false,
      message: `Give the project folder and the file to import, not ${positionals.length === 0 ? 'nothing' : positionals.join(' ')}.`,
    };
  }
  const map: [string, Id][] = [];
  for (const each of values.map ?? []) {
    const at = each.lastIndexOf('=');
    if (at < 0 || at === each.length - 1) {
      return { ok: false, message: `--map takes <kind>=<id>, not ${JSON.stringify(each)}.` };
    }
    map.push([each.slice(0, at), each.slice(at + 1)]);
  }
  const [folder, file] = positionals as [string, string];
  return {
    ok: true,
    value: {
      folder,
      file,
      dryRun: values['dry-run'] === true,
      request: {
        ...(map.length === 0 ? {} : { map: recordOf(map) }),
        ...(values.nesting === undefined ? {} : { nesting: values.nesting }),
        ...(values.key === undefined ? {} : { key: values.key }),
        ...(values.format === undefined ? {} : { format: values.format }),
        ...(values['no-view'] === true ? { views: false } : {}),
      },
    },
  };
}

/**
 * Runs the import and resolves with its exit code: 0 when it was done or, with `--dry-run`, could be;
 * 1 when the file, the project or the import was refused; 2 for arguments it does not understand.
 */
export async function runImport(
  argv: readonly string[],
  environment: ImportEnvironment,
): Promise<number> {
  const parsed = parseImportCommandLine(argv);
  if (!parsed.ok) {
    environment.err(parsed.message);
    environment.err(IMPORT_USAGE);
    return 2;
  }
  if ('help' in parsed) {
    environment.out(IMPORT_USAGE);
    return 0;
  }
  const { folder: written, file: fileWritten, request, dryRun } = parsed.value;
  const folder = resolve(environment.cwd, written);
  const path = resolve(environment.cwd, fileWritten);
  const file = await readImportFile(path);
  if (!file.ok) {
    environment.err(file.message);
    return 1;
  }
  const name = path.split(/[\\/]/).pop() ?? fileWritten;

  // A program that runs on the project owns its files: the import goes through it.
  const bridge =
    environment.runtimeFolder === undefined || environment.runtimeFolder === null
      ? undefined
      : new ProgramBridge({
          folder,
          runtime: environment.runtimeFolder,
          attachOnly: true,
          ...(environment.context === undefined ? {} : { context: environment.context }),
        });
  try {
    let running: ProjectSnapshot | undefined;
    if (bridge !== undefined) {
      try {
        running = await bridge.project();
      } catch (error) {
        if (error instanceof OtherBuildError) {
          environment.err(error.message);
          return 1;
        }
        if (!(error instanceof NoProgramRunningError || error instanceof ProgramUnavailableError)) {
          throw error;
        }
      }
    }
    if (running !== undefined && bridge !== undefined) {
      const full: ImportRequest = { name, ...file.value, ...request };
      return await importInto(running, full, dryRun, environment, () => {
        const size = Buffer.byteLength(
          encodeClaudeMessage({
            type: 'import',
            requestId: 'x'.repeat(100),
            request: importMessageRequest(full),
          }),
        );
        if (size > CLAUDE_MAX_PAYLOAD) {
          return Promise.resolve({
            ok: false,
            problems: [
              {
                code: 'invalid-command',
                message: `This import is too large to send to the Visual Anything that runs on the project (${(size / 1024 / 1024).toFixed(1)} MiB; at most ${CLAUDE_MAX_PAYLOAD / 1024 / 1024} MiB). Stop it, and import again: the project is then opened here.`,
              },
            ],
          } satisfies CommandAnswer);
        }
        environment.out(
          `Visual Anything runs on "${running.project.name}", so the import goes through it.`,
        );
        return bridge.importAsPerson(full);
      });
    }
    const opened = await openSession(folder, {
      watch: false,
      out: (line) => environment.out(line),
      err: (line) => environment.err(line),
    });
    if (!opened.ok) {
      environment.err(`Could not open the project in ${toForwardSlashes(folder)}:`);
      for (const error of opened.errors) environment.err(formatProjectProblem(error));
      return 1;
    }
    const { session } = opened;
    try {
      return await importInto(
        session.snapshot,
        { name, ...file.value, ...request },
        dryRun,
        environment,
        async (command) => {
          const outcome = await session.execute(command, 'user');
          return outcome.ok
            ? {
                ok: true,
                label: outcome.label,
                changed: outcome.operations.length > 0,
                created: outcome.created,
                warnings: outcome.warnings,
              }
            : { ok: false, problems: outcome.problems };
        },
      );
    } finally {
      // Waits for the import to be saved.
      await session.close();
    }
  } finally {
    bridge?.close();
  }
}

/** Previews an import, says what it does, and unless it is a dry run, applies it. */
async function importInto(
  state: ProjectSnapshot,
  request: ImportRequest,
  dryRun: boolean,
  environment: ImportEnvironment,
  apply: (command: BatchCommand) => Promise<CommandAnswer>,
): Promise<number> {
  const preview = previewImport(state, request);
  if (!preview.ok) {
    environment.err(`Could not import "${request.name}":`);
    for (const problem of preview.problems) environment.err(`  ${problem}`);
    return 1;
  }
  for (const line of describePreview(preview)) environment.out(line);
  if (dryRun) {
    environment.out('Dry run: nothing was imported.');
    return 0;
  }
  const answer = await apply(preview.prepared.command);
  if (!answer.ok) {
    environment.err(`Could not import "${request.name}":`);
    for (const problem of answer.problems) environment.err(`  ${problem.message}`);
    return 1;
  }
  environment.out(
    answer.changed
      ? `Done: ${answer.label}, as one action you can undo in the app.`
      : 'Nothing changed, so nothing was recorded.',
  );
  for (const warning of answer.warnings) environment.err(`Warning: ${warning.message}`);
  return 0;
}

/** A file to import, read whole: at most as much as an import reads. */
async function readImportFile(
  path: string,
): Promise<
  { ok: true; value: { text: string; bytes: Uint8Array } } | { ok: false; message: string }
> {
  try {
    const info = await stat(path);
    if (!info.isFile()) return { ok: false, message: `${toForwardSlashes(path)} is not a file.` };
    if (info.size > MAX_IMPORT_TEXT) {
      return {
        ok: false,
        message: `${toForwardSlashes(path)} is larger than 32 MiB; an import reads at most 32 MiB.`,
      };
    }
    const bytes = await readFile(path);
    return { ok: true, value: { text: new TextDecoder('utf-8').decode(bytes), bytes } };
  } catch (error) {
    return {
      ok: false,
      message: `Could not read ${toForwardSlashes(path)}: ${errorReason(error)}`,
    };
  }
}
