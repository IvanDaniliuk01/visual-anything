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
 * so. A page whose elements have poses holds the worker too, from no files if need be, for its
 * physical-space panel (ADR 0076); without the worker, it has no panel, and says so.
 */
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import {
  encodeBase64,
  pageMediaOf,
  writeViewState,
  type MathFont,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { pageDataOf } from '@visual-anything/app/src/viewer/data';
import { MATH_FAMILIES, mathFontFile } from '@visual-anything/app/src/viewer/math-families';
import {
  holdsPoses,
  solidHashesShown,
  withPoses,
  type PageSolids,
} from '@visual-anything/app/src/viewer/solids';
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

/** What the command says of a page whose solids it cannot hold without the solid worker. */
const NO_SOLID_WORKER =
  'The page draws its solids as placeholders: this copy of Visual Anything holds no solid worker for pages. Run `pnpm build`, which builds it beside the viewer.';

/** What the command says of a page with poses that cannot hold the worker its panel needs (ADR 0076). */
const NO_SPACE_PANEL =
  'The page has no physical-space panel: this copy of Visual Anything holds no solid worker for pages. Run `pnpm build`, which builds it beside the viewer.';

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
    /**
     * Reads a picture's media file by its hash, only when it is exactly what cleaning writes
     * (ADR 0098); none when it cannot.
     */
    mediaFile?: (hash: string) => Promise<Uint8Array | undefined>;
  },
): Promise<PageExport> {
  if (options.viewer === undefined) return { ok: false, message: NO_VIEWER };
  const warnings: string[] = [];
  const solids = await solidsOfPage(project, options.viewer, options.solidFile, warnings);
  const media = await mediaOfPage(project, options.mediaFile, warnings);
  const page = await writePage({
    assets: options.viewer,
    data: pageDataOf(project, {
      ...(options.view === undefined ? {} : { start: writeViewState({ view: options.view }) }),
      made: options.now ?? new Date(),
      ...(solids === undefined ? {} : { solids }),
      media,
    }),
    title: pageTitle(project.project.name),
  });
  if (page.solidBytes > 0) {
    warnings.push(
      solids?.form !== 'files' || Object.keys(solids.files).length > 0
        ? `Its solids take ${megabytes(page.solidBytes)} of it.`
        : `Its physical-space panel takes ${megabytes(page.solidBytes)} of it.`,
    );
  }
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
 * read left out, said there too. When it could read none, the page holds none, and so no worker for
 * nothing, unless its elements have poses, which the worker draws in the physical-space panel
 * (ADR 0076): then it holds the worker, with the files it could read, if any.
 */
async function solidsOfPage(
  project: ProjectSnapshot,
  viewer: ViewerAssets,
  read: ((hash: string) => Promise<Uint8Array | undefined>) | undefined,
  warnings: string[],
): Promise<PageSolids | undefined> {
  const hashes = solidHashesShown(project);
  const posed = holdsPoses(project);
  if (hashes.length === 0 && !posed) return undefined;
  if (viewer.solidWorker === undefined) {
    if (hashes.length > 0) warnings.push(NO_SOLID_WORKER);
    if (posed) warnings.push(NO_SPACE_PANEL);
    return undefined;
  }
  if (hashes.length === 0) return withPoses(project, undefined);
  if (read === undefined) {
    warnings.push(NO_SOLID_WORKER);
    return withPoses(project, undefined);
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
  if (missing === hashes.length) return withPoses(project, undefined);
  return { form: 'files', files };
}

/**
 * The media files a page's pictures show (ADR 0098), in base64 by hash, read from the project's
 * `media/` folder; those it could not read, or that are not what cleaning writes, are left out and
 * said in `warnings`, and the page draws them as missing pictures.
 */
async function mediaOfPage(
  project: ProjectSnapshot,
  read: ((hash: string) => Promise<Uint8Array | undefined>) | undefined,
  warnings: string[],
): Promise<Record<string, string>> {
  const media: Record<string, string> = {};
  let missing = 0;
  // A video's file only within 32 MiB; a larger one shows its poster (ADR 0098, stage 2).
  const { hashes, videosLeftOut } = pageMediaOf(project.views);
  if (videosLeftOut.length > 0) {
    warnings.push(
      videosLeftOut.length === 1
        ? 'One video is past 32 MiB: the page shows its poster, and it does not play.'
        : `${videosLeftOut.length} videos are past 32 MiB: the page shows their posters, and they do not play.`,
    );
  }
  for (const hash of hashes) {
    const bytes = read === undefined ? undefined : await read(hash);
    if (bytes) media[hash] = encodeBase64(bytes);
    else missing += 1;
  }
  if (missing > 0) {
    warnings.push(
      missing === 1
        ? 'One picture’s file could not be read, and the page draws it as a gray box.'
        : `${missing} pictures’ files could not be read, and the page draws them as gray boxes.`,
    );
  }
  return media;
}

/** A size in megabytes, as the terminal says it. */
function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/** The viewer as the build holds it: beside the app in its folder, or among the executable's files. */
export async function builtViewer(files?: AppFiles): Promise<ViewerAssets | undefined> {
  const from = files ?? (isExecutable() ? embeddedAppFiles() : await appFolderFiles());
  if (from === undefined) return undefined;
  const [script, style, solidWorker, fonts] = await Promise.all([
    from.read('viewer/viewer.js'),
    from.read('viewer/viewer.css'),
    from.read('viewer/solid-worker.js'),
    // KaTeX's fonts, of which a page holds those its Math uses (ADR 0106).
    Promise.all(
      MATH_FAMILIES.map(
        async (font) => [font, await from.read(`viewer/${mathFontFile(font)}`)] as const,
      ),
    ),
  ]);
  if (script === undefined || style === undefined) return undefined;
  const text = new TextDecoder('utf-8', { fatal: true });
  const mathFonts: Partial<Record<MathFont, Uint8Array>> = {};
  for (const [font, bytes] of fonts) if (bytes !== undefined) mathFonts[font] = bytes;
  return {
    script: text.decode(script),
    style: text.decode(style),
    ...(solidWorker === undefined ? {} : { solidWorker: text.decode(solidWorker) }),
    ...(Object.keys(mathFonts).length === 0 ? {} : { mathFonts }),
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
