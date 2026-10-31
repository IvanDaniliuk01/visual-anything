/**
 * The command that exports a view (M6b):
 *
 *   visual-anything export <folder> --view <id> --format svg|pdf|md|mermaid|structurizr|page
 *                          [--theme light|dark] [--out <file>]
 *
 * It opens the project itself, with the same checks as the local program, and needs no program
 * running: CI can export the views of a repository for its README or a pull request. It writes only
 * the file it is given, atomically, or standard output without one, and never a file of the project.
 * `page` writes the whole project's read-only page (ADR 0041), which opens at the view given, or at
 * the first without one (`export-page.ts`).
 */
import { lstat, realpath, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { ThemeName } from '@visual-anything/core';
import { FILE_EXTENSIONS } from '@visual-anything/schema';
import {
  EXPORT_FORMATS,
  exportView,
  isExportFormat,
  type ExportFormat,
} from '@visual-anything/app/src/export/exports';
import type { ViewerAssets } from '@visual-anything/app/src/viewer/page';
import { errorCode, errorReason } from './errors';
import { builtViewer, exportPage } from './export-page';
import { hashOf, readSolidFile } from './solids/files';
import { formatProjectProblem, loadProject } from './project';
import { writeFileAtomic } from './writer';

/** The read-only page, which `export` writes besides the formats of a view. */
const PAGE = 'page';

/** What `--format` takes. */
const FORMATS = [...EXPORT_FORMATS, PAGE] as const;

export const EXPORT_USAGE = `Usage: visual-anything export <folder> --view <id> --format <format> [--theme light|dark]
                             [--out <file>]

Writes one view of the project in folder as a file: svg and pdf draw it as the app does, md writes
its outline in Markdown, mermaid a Mermaid flowchart and structurizr a Structurizr DSL workspace of
its Systems components. page writes the read-only page of the whole project: one HTML file that
opens offline in any browser, shows every view and plays every scenario. It opens the project
itself, with no Visual Anything running, and writes only the file it is given; what the format could
not hold is said on standard error.

  --view <id>     The view to export, by its id; for page, the view it opens at, the first by default.
  --format <f>    ${FORMATS.join(', ')}.
  --theme <t>     The colors to draw in: light, the default, or dark; a page follows its reader.
  --out <file>    The file to write, which is replaced when it exists; its folder must exist. Without
                  it, the export goes to standard output, but for a PDF to a terminal.
  -h, --help      Show this help.`;

/** What the export command line asks for. */
export interface ExportCommandLine {
  folder: string;
  /** The view to export; for the page, the view it opens at, if any. */
  view?: string;
  format: ExportFormat | typeof PAGE;
  theme: ThemeName;
  out?: string;
}

export type ParsedExportCommandLine =
  | { ok: true; help: true }
  | { ok: true; help: false; value: ExportCommandLine }
  | { ok: false; message: string };

/** Reads the export command line: `<folder> --view <id> --format <f> [--theme <t>] [--out <file>]`. */
export function parseExportCommandLine(argv: readonly string[]): ParsedExportCommandLine {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  const { values, positionals } = parsed;
  if (values.help === true) return { ok: true, help: true };
  if (positionals.length !== 1) {
    return {
      ok: false,
      message:
        positionals.length === 0
          ? 'Give the project folder to export from.'
          : `Give one project folder, not ${positionals.length}.`,
    };
  }
  const page = values.format === PAGE;
  if (values.view === '' || (values.view === undefined && !page)) {
    return { ok: false, message: 'Give the view to export with --view <id>.' };
  }
  if (values.format === undefined || !(page || isExportFormat(values.format))) {
    return {
      ok: false,
      message:
        values.format === undefined
          ? `Give the format with --format: ${FORMATS.join(', ')}.`
          : `"${values.format}" is no format to export to; give one of ${FORMATS.join(', ')}.`,
    };
  }
  const theme = values.theme ?? 'light';
  if (theme !== 'light' && theme !== 'dark') {
    return { ok: false, message: `"${theme}" is no theme; give light or dark.` };
  }
  if (values.out === '') return { ok: false, message: 'Give the file to write after --out.' };
  return {
    ok: true,
    help: false,
    value: {
      folder: positionals[0] as string,
      ...(values.view === undefined ? {} : { view: values.view }),
      format: page ? PAGE : (values.format as ExportFormat),
      theme,
      ...(values.out === undefined ? {} : { out: values.out }),
    },
  };
}

function parse(argv: readonly string[]) {
  return parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      view: { type: 'string' },
      format: { type: 'string' },
      theme: { type: 'string' },
      out: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
}

/** Where the export command writes and says things, and where it runs. */
export interface ExportEnvironment {
  cwd: string;
  /** Writes the export to standard output. */
  stdout: (data: string | Uint8Array) => void;
  /** Whether standard output is a terminal, which a PDF is not written to. */
  stdoutIsTerminal: boolean;
  /** Writes a line to standard error. */
  err: (line: string) => void;
  /** The read-only page's viewer; the one the build holds by default. */
  viewer?: () => Promise<ViewerAssets | undefined>;
  /** When a page is made; now by default. */
  now?: () => Date;
}

/** The extensions of project files, which an export never replaces. */
const PROJECT_EXTENSIONS = Object.values(FILE_EXTENSIONS);

/** How a size reads, in bytes, kilobytes or megabytes. */
function sizeOf(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / (1024 * 104.8576)) / 10} MB`;
}

/**
 * Runs the export command, and resolves with its exit code: 0 when it wrote the export, 1 when the
 * project, the view or the file would not do, and 2 for a command line it does not understand.
 */
export async function runExport(argv: readonly string[], env: ExportEnvironment): Promise<number> {
  const parsed = parseExportCommandLine(argv);
  if (!parsed.ok) {
    env.err(parsed.message);
    env.err(EXPORT_USAGE);
    return 2;
  }
  if (parsed.help) {
    env.err(EXPORT_USAGE);
    return 0;
  }
  const line = parsed.value;
  const out = line.out === undefined ? undefined : resolve(env.cwd, line.out);
  if (out === undefined && line.format === 'pdf' && env.stdoutIsTerminal) {
    env.err('A PDF is not written to a terminal: give the file to write with --out <file>.');
    return 2;
  }
  if (out !== undefined) {
    const refused = await refusedTarget(out);
    if (refused !== undefined) {
      env.err(refused);
      return 1;
    }
  }

  const folder = resolve(env.cwd, line.folder);
  const loaded = await loadProject(folder);
  if (!loaded.ok) {
    env.err(`The project in ${folder} does not open:`);
    for (const problem of loaded.errors) env.err(`  ${formatProjectProblem(problem)}`);
    return 1;
  }
  const { project } = loaded;
  const { view } = line;
  if (view !== undefined && !project.views.some((each) => each.id === view)) {
    const ids = project.views.map((each) => each.id);
    env.err(
      `The project has no view "${view}".${ids.length === 0 ? ' It has no views.' : ` Its views: ${ids.join(', ')}.`}`,
    );
    return 1;
  }

  let written: { data: Uint8Array; out: string | Uint8Array; size: number };
  if (line.format === PAGE) {
    const page = await exportPage(project, {
      ...(view === undefined ? {} : { view }),
      viewer: await (env.viewer ?? (() => builtViewer()))(),
      ...(env.now ? { now: env.now() } : {}),
      // Solids' files, from the project's own folder, each checked against its name (ADR 0075).
      solidFile: async (hash) => {
        const read = await readSolidFile(await realpath(folder), hash);
        return read.ok && hashOf(read.bytes) === hash ? new Uint8Array(read.bytes) : undefined;
      },
    });
    if (!page.ok) {
      env.err(page.message);
      return 1;
    }
    // Past 25 MB it says so before the page is written (ADR 0041), and what its solids take.
    for (const line of page.warning?.split('\n') ?? []) env.err(line);
    const data = new TextEncoder().encode(page.html);
    written = { data, out: page.html, size: page.bytes };
  } else {
    const exported = await exportView(project, view as string, line.format, {
      theme: line.theme,
    });
    for (const lost of exported.lost) env.err(`Lost: ${lost}`);
    const data = exported.bytes ?? new TextEncoder().encode(exported.text);
    written = { data, out: exported.bytes ?? exported.text, size: exported.size };
  }
  if (out === undefined) {
    env.stdout(written.out);
    return 0;
  }
  try {
    await writeFileAtomic(out, written.data);
  } catch (error) {
    env.err(`${out} could not be written: ${errorReason(error)}`);
    return 1;
  }
  env.err(`Wrote ${out} (${sizeOf(written.size)}).`);
  return 0;
}

/** Why the export may not write to a file: one of a project's, a folder, a link, or no folder. */
async function refusedTarget(out: string): Promise<string | undefined> {
  if (PROJECT_EXTENSIONS.some((extension) => out.toLowerCase().endsWith(extension))) {
    return `${out} would be a project file: an export never replaces one. Give another --out.`;
  }
  const noFolder = `The folder of ${out} does not exist: an export writes only the file it is given.`;
  try {
    if (!(await stat(dirname(out))).isDirectory()) return noFolder;
  } catch {
    return noFolder;
  }
  try {
    const found = await lstat(out);
    if (!found.isFile()) {
      return `${out} is ${found.isDirectory() ? 'a folder' : found.isSymbolicLink() ? 'a link' : 'not a regular file'}: an export replaces only a regular file.`;
    }
  } catch (error) {
    if (errorCode(error) !== 'ENOENT')
      return `${out} could not be looked at: ${errorReason(error)}`;
  }
  return undefined;
}
