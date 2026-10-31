/**
 * The read-only page (ADR 0041) as `visual-anything export <folder> --format page [--view <id>]`
 * writes it (`export-command.ts`): the project as data, opening at the view asked for, beside the
 * viewer the build holds next to the app, or the executable's copy of it. It says how large the page
 * is, and past 25 MB says so before it is written.
 *
 * A page whose views show solids holds their files, read from the project's `solids/` folder, and the
 * solid worker the build holds beside the viewer, so that they turn in the page as in the app
 * (ADR 0075). The command line has no GPU to draw their pictures, so it never writes a page of
 * pictures only; without the worker, or a file, the page draws those solids as placeholders, and says
 * so.
 */
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { encodeBase64, writeViewState, type ProjectSnapshot } from '@visual-anything/core';
import { pageDataOf } from '@visual-anything/app/src/viewer/data';
import { solidHashesShown, type PageSolids } from '@visual-anything/app/src/viewer/solids';
import {
  LARGE_PAGE,
  pageTitle,
  writePage,
  type ViewerAssets,
} from '@visual-anything/app/src/viewer/page';
import { appPackageDir } from './app-source';
import { embeddedAppFiles, isExecutable } from './executable';
import { folderFiles, type AppFiles } from './static';

/** What the command says when the build holds no viewer. */
export const NO_VIEWER =
  'The read-only page needs its viewer, which this copy of Visual Anything does not hold. Run `pnpm build`, which builds it into packages/app/dist/viewer.';

/** A page written for the command line, or why it could not be. */
export type PageExport =
  | { ok: true; html: string; bytes: number; large: boolean; warning?: string }
  | { ok: false; message: string };

/** Writes the read-only page of a project, opening at a view when one is given. */
export async function exportPage(
  project: ProjectSnapshot,
  options: {
    view?: string;
    viewer: ViewerAssets | undefined;
    now?: Date;
    /** Reads a solid's file by its hash, checked against it; none when it cannot. */
    solidFile?: (hash: string) => Promise<Uint8Array | undefined>;
  },
): Promise<PageExport> {
  if (options.viewer === undefined) return { ok: false, message: NO_VIEWER };
  const warnings: string[] = [];
  const solids = await solidsOfPage(project, options.viewer, options.solidFile, warnings);
  const page = await writePage({
    assets: options.viewer,
    data: pageDataOf(project, {
      ...(options.view === undefined ? {} : { start: writeViewState({ view: options.view }) }),
      made: options.now ?? new Date(),
      ...(solids === undefined ? {} : { solids }),
    }),
    title: pageTitle(project.project.name),
  });
  if (page.solidBytes > 0) warnings.push(`Its solids take ${megabytes(page.solidBytes)} of it.`);
  if (page.large) {
    warnings.push(
      `The page is ${megabytes(page.bytes)}, past ${megabytes(LARGE_PAGE)}: it may open slowly, and some hosts and mail refuse files this large.`,
    );
  }
  return {
    ok: true,
    html: page.html,
    bytes: page.bytes,
    large: page.large,
    ...(warnings.length > 0 ? { warning: warnings.join('\n') } : {}),
  };
}

/**
 * The files of the solids the project's views show, for a page (ADR 0075): none for views that show
 * none; none, said in `warnings`, without the solid worker that draws them; and those it could not
 * read left out, said there too.
 */
async function solidsOfPage(
  project: ProjectSnapshot,
  viewer: ViewerAssets,
  read: ((hash: string) => Promise<Uint8Array | undefined>) | undefined,
  warnings: string[],
): Promise<PageSolids | undefined> {
  const hashes = solidHashesShown(project);
  if (hashes.length === 0) return undefined;
  if (viewer.solidWorker === undefined || read === undefined) {
    warnings.push(
      'The page draws its solids as placeholders: this copy of Visual Anything holds no solid worker for pages. Run `pnpm build`, which builds it beside the viewer.',
    );
    return undefined;
  }
  const files: Record<string, string> = {};
  let missing = 0;
  for (const hash of hashes) {
    const bytes = await read(hash);
    if (bytes) files[hash] = encodeBase64(bytes);
    else missing += 1;
  }
  if (missing > 0) {
    warnings.push(
      missing === 1
        ? 'One solid’s file could not be read, and the page draws it as its placeholder.'
        : `${missing} solids’ files could not be read, and the page draws them as their placeholders.`,
    );
  }
  return { form: 'files', files };
}

/** A size in megabytes, as the terminal says it. */
function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/** The viewer as the build holds it: beside the app in its folder, or among the executable's files. */
export async function builtViewer(files?: AppFiles): Promise<ViewerAssets | undefined> {
  const from = files ?? (isExecutable() ? embeddedAppFiles() : await appFolderFiles());
  if (from === undefined) return undefined;
  const [script, style, solidWorker] = await Promise.all([
    from.read('viewer/viewer.js'),
    from.read('viewer/viewer.css'),
    from.read('viewer/solid-worker.js'),
  ]);
  if (script === undefined || style === undefined) return undefined;
  const text = new TextDecoder('utf-8', { fatal: true });
  return {
    script: text.decode(script),
    style: text.decode(style),
    ...(solidWorker === undefined ? {} : { solidWorker: text.decode(solidWorker) }),
  };
}

/** The files of the app's build folder, by its real path; none when it was not built. */
async function appFolderFiles(): Promise<AppFiles | undefined> {
  try {
    return folderFiles(await realpath(join(appPackageDir(), 'dist')));
  } catch {
    return undefined;
  }
}
