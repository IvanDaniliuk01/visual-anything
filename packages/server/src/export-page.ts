/**
 * `visual-anything export <folder> --format page [--view <id>] [--out <file>]`: writes the project's
 * read-only page (ADR 0041) from the command line. It reads the project itself, with the checks
 * opening makes and no program running, takes the viewer the build holds beside the app, and writes
 * only the file it is given, atomically, or else the page to stdout. It says how large the page is,
 * and past 25 MB says so before writing it.
 *
 * The other formats of `export` (SVG, PDF, Markdown, Mermaid and Structurizr) join `FORMATS` with
 * their writers.
 */
import { realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { writeViewState, type ProjectSnapshot } from '@visual-anything/core';
import { pageDataOf } from '@visual-anything/app/src/viewer/data';
import {
  LARGE_PAGE,
  pageTitle,
  writePage,
  type ViewerAssets,
} from '@visual-anything/app/src/viewer/page';
import { appPackageDir } from './app-source';
import { embeddedAppFiles, isExecutable } from './executable';
import { formatProjectProblem, loadProject } from './project';
import { folderFiles, type AppFiles } from './static';
import { writeFileAtomic } from './writer';

/** The subcommand that writes an export. */
export const EXPORT_COMMAND = 'export';

export const EXPORT_USAGE = `Usage: visual-anything export <folder> --format page [--view <id>] [--out <file>]

  --format page   the read-only page: one HTML file of the whole project, which opens offline in any
                  browser, shows every view and plays every scenario
  --view <id>     the view the page opens at; the project's first view by default
  --out <file>    the file to write; without it, the page goes to stdout`;

/** The formats `export` writes, by the name `--format` gives. */
const FORMATS = ['page'] as const;
type Format = (typeof FORMATS)[number];

/** What `export` was asked for. */
export interface ExportRequest {
  folder: string;
  format: Format;
  view?: string;
  out?: string;
}

/** Reads `export`'s arguments, or says what is wrong with them. */
export function parseExportCommandLine(
  argv: readonly string[],
): { ok: true; value: ExportRequest } | { ok: false; message: string } {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      strict: true,
      options: {
        format: { type: 'string' },
        view: { type: 'string' },
        out: { type: 'string' },
      },
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  const { positionals, values } = parsed;
  const [folder, ...rest] = positionals;
  if (folder === undefined) return { ok: false, message: 'Give the project folder to export.' };
  if (rest.length > 0)
    return { ok: false, message: `Only one folder is exported, not "${rest[0]}".` };
  if (values.format === undefined) return { ok: false, message: 'Give --format page.' };
  if (!(FORMATS as readonly string[]).includes(values.format)) {
    return {
      ok: false,
      message: `This build exports --format page; it has no format "${values.format}".`,
    };
  }
  return {
    ok: true,
    value: {
      folder,
      format: values.format as Format,
      ...(values.view === undefined ? {} : { view: values.view }),
      ...(values.out === undefined ? {} : { out: values.out }),
    },
  };
}

/** What `export` touches outside itself, so that it runs the same in tests. */
export interface ExportEnvironment {
  cwd: string;
  /** Writes the page itself, when no file is given. */
  write: (text: string) => void;
  /** Says what it did, or why it could not. */
  err: (line: string) => void;
  /** The viewer's script and stylesheet; `undefined` when the build holds none. */
  viewer: () => Promise<ViewerAssets | undefined>;
  now?: () => Date;
}

/** Runs `export`, and resolves with its exit code. */
export async function runExport(argv: readonly string[], env: ExportEnvironment): Promise<number> {
  const parsed = parseExportCommandLine(argv);
  if (!parsed.ok) {
    env.err(parsed.message);
    env.err(EXPORT_USAGE);
    return 2;
  }
  const { folder, view, out } = parsed.value;
  const loaded = await loadProject(resolve(env.cwd, folder));
  if (!loaded.ok) {
    env.err(`The project in ${folder} cannot be opened:`);
    for (const problem of loaded.errors) env.err(`  ${formatProjectProblem(problem)}`);
    return 1;
  }
  const project: ProjectSnapshot = loaded.project;
  if (view !== undefined && !project.views.some((each) => each.id === view)) {
    env.err(`The project has no view "${view}".`);
    return 2;
  }
  const assets = await env.viewer();
  if (assets === undefined) {
    env.err(
      'The read-only page needs its viewer, which this copy of Visual Anything does not hold. Run `pnpm build`, which builds it into packages/app/dist/viewer.',
    );
    return 1;
  }
  const page = await writePage({
    assets,
    data: pageDataOf(project, {
      ...(view === undefined ? {} : { start: writeViewState({ view }) }),
      made: (env.now ?? (() => new Date()))(),
    }),
    title: pageTitle(project.project.name),
  });
  const size = megabytes(page.bytes);
  if (page.large) {
    env.err(
      `The page is ${size}, past ${megabytes(LARGE_PAGE)}: it may open slowly, and some hosts and mail refuse files this large.`,
    );
  }
  if (out === undefined) {
    env.write(page.html);
    return 0;
  }
  const target = resolve(env.cwd, out);
  await writeFileAtomic(target, new TextEncoder().encode(page.html));
  env.err(`Wrote the read-only page of "${project.project.name}" to ${out}: ${size}.`);
  return 0;
}

/** A size in megabytes, as the terminal says it. */
function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/** The viewer as the build holds it: beside the app in its folder, or among the executable's files. */
export async function builtViewer(files?: AppFiles): Promise<ViewerAssets | undefined> {
  const from = files ?? (isExecutable() ? embeddedAppFiles() : await appFolderFiles());
  if (from === undefined) return undefined;
  const [script, style] = await Promise.all([
    from.read('viewer/viewer.js'),
    from.read('viewer/viewer.css'),
  ]);
  if (script === undefined || style === undefined) return undefined;
  const text = new TextDecoder('utf-8', { fatal: true });
  return { script: text.decode(script), style: text.decode(style) };
}

/** The files of the app's build folder, by its real path; none when it was not built. */
async function appFolderFiles(): Promise<AppFiles | undefined> {
  try {
    return folderFiles(await realpath(join(appPackageDir(), 'dist')));
  } catch {
    return undefined;
  }
}
