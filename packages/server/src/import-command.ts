/**
 * `visual-anything import <folder> <file>` (ADR-0042, ADR-0049): reads a file made elsewhere, maps its
 * kinds from the built-in suggestions and the `--map` choices, and lands it as one undoable action of
 * the person's. An HTML file becomes an imported drawing instead (ADR 0068), made in a worker of its
 * own, shown by a new element or the one `--element` names. When a program runs on the project, the
 * import goes through it, since one program owns a project's files (ADR-0044); otherwise the command
 * opens the project itself, applies the import and saves. It reads only the file it is given.
 */
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  DRAWING_LIMITS,
  MAX_IMPORT_TEXT,
  MAX_SOLID_INPUT_BYTES,
  recordOf,
  type BatchCommand,
  type ProjectSnapshot,
  type SolidImportOptions,
  type SolidPreparedMessage,
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
import { describeDrawing, isDrawingImport, prepareMadeDrawing } from './drawings/import';
import { makeDrawing, type MadeDrawing } from './drawings/make';
import { errorReason } from './errors';
import { describePreview, previewImport, type ImportRequest } from './import';
import { toForwardSlashes } from './paths';
import { formatProjectProblem } from './project';
import { openSession } from './session';
import { describeSolidImport, isSolidFile } from './solids/import';
import { preparedMessage } from './solids/store';

export const IMPORT_USAGE = `Usage: visual-anything import <folder> <file> [--map <kind>=<id>]... [--nesting <id>]
                             [--key <column>] [--format <format>] [--no-view] [--dry-run]
       visual-anything import <folder> <file.html> [--width <px>] [--component <id>]
                             [--element <id>] [--view <id>] [--dry-run]
       visual-anything import <folder> <file.glb|file.gltf> [--units m|cm|mm|in] [--up y|z]
                             [--simplify] [--dry-run]

Imports a Mermaid diagram (flowchart, C4, ER or class), a spreadsheet (CSV or TSV), JSON, a
Structurizr workspace in JSON, a LikeC4 model or a draw.io file (.drawio, .xml, .drawio.svg or
.drawio.png) into the project in folder, as one action you can undo in the app. Structurizr DSL is
not read: export it to JSON first, with structurizr-cli export -workspace workspace.dsl -format json.
A static HTML file or fragment (.html or .htm, at most 512 KiB) is imported as a drawing instead: a
picture of the page, laid out without running anything in it or fetching anything it names, shown
by a new element or by the one you name. A glTF file (.glb, or .gltf with its data inside, at most
256 MiB) is imported as a solid: cleaned into solids/<hash>.glb, keeping only geometry, materials,
textures, named nodes and animations that move them, with nothing that runs and nothing it names
outside itself. When Visual Anything runs on the project, the import goes through it; otherwise the
project is opened, the import applied and saved.

  --map <kind>=<id>  Map a kind of the file, as --dry-run lists them, to a component or relation
                     type by its id; give it again for more, and =<id> for rows that name no
                     component. Other kinds take the suggested ones.
  --nesting <id>     The relation type that puts what sits inside what in its container.
  --key <column>     For a spreadsheet or JSON: match rows to the project's elements by this column,
                     to import again; the id column by default.
  --format <format>  Read the file as structurizr, likec4, drawio, json, mermaid, table or html,
                     whatever its name says.
  --no-view          Do not create the view a diagram brings.
  --width <px>       For HTML: the width the page is laid out at, from 64 to 2000; 800 by default.
  --component <id>   For HTML: the component of the new element that shows the drawing; Box by
                     default.
  --element <id>     For HTML: show the drawing on this element instead of a new one.
  --view <id>        For HTML: the view the new element is made in.
  --units <unit>     For a solid: the unit the file is written in, m, cm, mm or in; meters by
                     default. The solid is stored in meters.
  --up <axis>        For a solid: the axis that is up in the file, y or z; y by default. The solid
                     is stored with +Y up.
  --simplify         For a solid past 1,000,000 triangles or vertices: simplify it to fit, rather
                     than refuse it.
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
  /** For a solid: its units, its up axis and whether to simplify it (ADR 0075). */
  solid: SolidImportOptions;
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
        width: { type: 'string' },
        component: { type: 'string' },
        element: { type: 'string' },
        view: { type: 'string' },
        units: { type: 'string' },
        up: { type: 'string' },
        simplify: { type: 'boolean' },
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
  let width: number | undefined;
  if (values.width !== undefined) {
    width = /^\d+$/.test(values.width) ? Number(values.width) : Number.NaN;
    if (
      !Number.isSafeInteger(width) ||
      width < DRAWING_LIMITS.width.least ||
      width > DRAWING_LIMITS.width.most
    ) {
      return {
        ok: false,
        message: `--width takes a whole number of pixels from ${DRAWING_LIMITS.width.least} to ${DRAWING_LIMITS.width.most}, not ${JSON.stringify(values.width)}.`,
      };
    }
  }
  if (values.units !== undefined && !['m', 'cm', 'mm', 'in'].includes(values.units)) {
    return {
      ok: false,
      message: `--units takes m, cm, mm or in, not ${JSON.stringify(values.units)}.`,
    };
  }
  if (values.up !== undefined && values.up !== 'y' && values.up !== 'z') {
    return { ok: false, message: `--up takes y or z, not ${JSON.stringify(values.up)}.` };
  }
  const [folder, file] = positionals as [string, string];
  return {
    ok: true,
    value: {
      folder,
      file,
      dryRun: values['dry-run'] === true,
      solid: {
        ...(values.units === undefined
          ? {}
          : { units: values.units as NonNullable<SolidImportOptions['units']> }),
        ...(values.up === undefined ? {} : { up: values.up }),
        ...(values.simplify === true ? { simplify: true } : {}),
      },
      request: {
        ...(map.length === 0 ? {} : { map: recordOf(map) }),
        ...(values.nesting === undefined ? {} : { nesting: values.nesting }),
        ...(values.key === undefined ? {} : { key: values.key }),
        ...(values.format === undefined ? {} : { format: values.format }),
        ...(values['no-view'] === true ? { views: false } : {}),
        ...(width === undefined ? {} : { width }),
        ...(values.component === undefined ? {} : { component: values.component }),
        ...(values.element === undefined ? {} : { element: values.element }),
        ...(values.view === undefined ? {} : { view: values.view }),
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
  const { folder: written, file: fileWritten, request, dryRun, solid } = parsed.value;
  const folder = resolve(environment.cwd, written);
  const path = resolve(environment.cwd, fileWritten);
  const name = path.split(/[\\/]/).pop() ?? fileWritten;
  if (isSolidFile(name) && request.format === undefined) {
    const mixed = Object.keys(request).length > 0;
    if (mixed) {
      environment.err(
        '--map, --nesting, --key, --no-view, --width, --component, --element and --view are not for glTF files, which are imported as solids.',
      );
      environment.err(IMPORT_USAGE);
      return 2;
    }
    return importSolid(folder, path, name, solid, dryRun, environment);
  }
  if (Object.keys(solid).length > 0) {
    environment.err(
      '--units, --up and --simplify are for glTF files, which are imported as solids.',
    );
    environment.err(IMPORT_USAGE);
    return 2;
  }
  const file = await readImportFile(path);
  if (!file.ok) {
    environment.err(file.message);
    return 1;
  }
  const drawing = isDrawingImport({
    name,
    ...(request.format === undefined ? {} : { format: request.format }),
  });
  const mixed = drawing
    ? request.map !== undefined ||
      request.nesting !== undefined ||
      request.key !== undefined ||
      request.views === false
    : request.width !== undefined ||
      request.component !== undefined ||
      request.element !== undefined ||
      request.view !== undefined;
  if (mixed) {
    environment.err(
      drawing
        ? '--map, --nesting, --key and --no-view are for diagrams and spreadsheets: an HTML file is imported as a drawing.'
        : '--width, --component, --element and --view are for HTML files, which are imported as drawings.',
    );
    environment.err(IMPORT_USAGE);
    return 2;
  }
  if (
    request.element !== undefined &&
    (request.component !== undefined || request.view !== undefined)
  ) {
    environment.err(
      'Give --element to show the drawing on an element, or --component and --view for a new one, not both.',
    );
    return 2;
  }
  // A drawing is made here first, to say what it drops and for --dry-run; through a program that
  // runs, the program makes it again of the same file, and that is what lands.
  let made: Extract<MadeDrawing, { ok: true }> | undefined;
  if (drawing) {
    const outcome = await makeDrawing(
      file.value.text,
      request.width ?? DRAWING_LIMITS.width.initial,
    );
    if (!outcome.ok) {
      environment.err(`Could not import "${name}":`);
      for (const problem of outcome.problems) environment.err(`  ${problem.message}`);
      return 1;
    }
    made = outcome;
  }

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
      return await importInto(running, full, dryRun, environment, made, () => {
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
        made,
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

/**
 * Imports a glTF file as a solid (ADR 0075): the program that runs on the project cleans it in its
 * worker and defines it, as the person's action; without one, the project is opened here, and its
 * session does the same. With `--dry-run`, the file is cleaned and nothing is imported.
 */
async function importSolid(
  folder: string,
  path: string,
  name: string,
  options: SolidImportOptions,
  dryRun: boolean,
  environment: ImportEnvironment,
): Promise<number> {
  const file = await readSolidImportFile(path);
  if (!file.ok) {
    environment.err(file.message);
    return 1;
  }
  const say = (prepared: SolidPreparedMessage): void => {
    for (const line of describeSolidImport(name, prepared)) environment.out(line);
  };
  const refused = (problems: readonly { message: string }[]): number => {
    environment.err(`Could not import "${name}":`);
    for (const problem of problems) environment.err(`  ${problem.message}`);
    return 1;
  };
  const done = (answer: CommandAnswer): number => {
    if (!answer.ok) return refused(answer.problems);
    environment.out(
      answer.changed
        ? `Done: ${answer.label}, as one action you can undo in the app.`
        : 'Nothing changed, so nothing was recorded.',
    );
    for (const warning of answer.warnings) environment.err(`Warning: ${warning.message}`);
    return 0;
  };

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
      environment.out(
        `Visual Anything runs on "${running.project.name}", so the import goes through it.`,
      );
      const prepared = await bridge.prepareSolid(name, file.bytes, options);
      if (prepared.type === 'solid/refused') return refused([prepared]);
      say(prepared);
      if (dryRun) {
        environment.out('Dry run: nothing was imported.');
        return 0;
      }
      return done(await bridge.importSolidAsPerson(name, prepared.hash));
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
      const prepared = await session.prepareSolid(file.bytes, name, options);
      if (!prepared.ok) return refused(prepared.problems);
      say(preparedMessage('import', prepared.prepared));
      if (dryRun) {
        environment.out('Dry run: nothing was imported.');
        return 0;
      }
      const outcome = await session.importSolid(prepared.prepared.hash, {}, 'user');
      return done(
        outcome.ok
          ? {
              ok: true,
              label: outcome.label,
              changed: outcome.operations.length > 0,
              created: outcome.created,
              warnings: outcome.warnings,
            }
          : { ok: false, problems: outcome.problems },
      );
    } finally {
      // Waits for the import to be saved.
      await session.close();
    }
  } finally {
    bridge?.close();
  }
}

/** A glTF file to import as a solid, read whole: at most 256 MiB, as cleaning reads. */
async function readSolidImportFile(
  path: string,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; message: string }> {
  try {
    const info = await stat(path);
    if (!info.isFile()) return { ok: false, message: `${toForwardSlashes(path)} is not a file.` };
    if (info.size > MAX_SOLID_INPUT_BYTES) {
      return {
        ok: false,
        message: `${toForwardSlashes(path)} is larger than 256 MiB; a solid is cleaned from at most 256 MiB.`,
      };
    }
    const bytes = await readFile(path);
    return { ok: true, bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) };
  } catch (error) {
    return {
      ok: false,
      message: `Could not read ${toForwardSlashes(path)}: ${errorReason(error)}`,
    };
  }
}

/** What an import would do, line by line, and the one batch it sends, or why it cannot be done. */
type Planned =
  { ok: true; lines: string[]; command: BatchCommand } | { ok: false; problems: string[] };

/** Plans an import against the project: a drawing already made, or a file read and mapped. */
function plannedImport(
  state: ProjectSnapshot,
  request: ImportRequest,
  made: Extract<MadeDrawing, { ok: true }> | undefined,
): Planned {
  if (made !== undefined) {
    const prepared = prepareMadeDrawing(state, request.name, made, request);
    return prepared.ok
      ? {
          ok: true,
          lines: describeDrawing(state, request.name, made, prepared, request),
          command: prepared.command,
        }
      : prepared;
  }
  const preview = previewImport(state, request);
  return preview.ok
    ? { ok: true, lines: describePreview(preview), command: preview.prepared.command }
    : { ok: false, problems: preview.problems };
}

/** Previews an import, says what it does, and unless it is a dry run, applies it. */
async function importInto(
  state: ProjectSnapshot,
  request: ImportRequest,
  dryRun: boolean,
  environment: ImportEnvironment,
  made: Extract<MadeDrawing, { ok: true }> | undefined,
  apply: (command: BatchCommand) => Promise<CommandAnswer>,
): Promise<number> {
  const preview = plannedImport(state, request, made);
  if (!preview.ok) {
    environment.err(`Could not import "${request.name}":`);
    for (const problem of preview.problems) environment.err(`  ${problem}`);
    return 1;
  }
  for (const line of preview.lines) environment.out(line);
  if (dryRun) {
    environment.out('Dry run: nothing was imported.');
    return 0;
  }
  const answer = await apply(preview.command);
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
