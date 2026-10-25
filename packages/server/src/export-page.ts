/**
 * The read-only page (ADR 0041) as `visual-anything export <folder> --format page [--view <id>]`
 * writes it (`export-command.ts`): the project as data, opening at the view asked for, beside the
 * viewer the build holds next to the app, or the executable's copy of it. It says how large the page
 * is, and past 25 MB says so before it is written.
 */
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
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
  options: { view?: string; viewer: ViewerAssets | undefined; now?: Date },
): Promise<PageExport> {
  if (options.viewer === undefined) return { ok: false, message: NO_VIEWER };
  const page = await writePage({
    assets: options.viewer,
    data: pageDataOf(project, {
      ...(options.view === undefined ? {} : { start: writeViewState({ view: options.view }) }),
      made: options.now ?? new Date(),
    }),
    title: pageTitle(project.project.name),
  });
  return {
    ok: true,
    html: page.html,
    bytes: page.bytes,
    large: page.large,
    ...(page.large
      ? {
          warning: `The page is ${megabytes(page.bytes)}, past ${megabytes(LARGE_PAGE)}: it may open slowly, and some hosts and mail refuse files this large.`,
        }
      : {}),
  };
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
