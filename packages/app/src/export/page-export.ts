/**
 * Export → Read-only page, from the app (ADR 0041): the page is written in the browser from the
 * project as this tab holds it and the viewer the local program serves beside the app, then the
 * browser saves it, as it saves a PNG. Nothing is written by the local program, and nothing of the
 * session goes into the page: its data is the project's files, and its scripts are the viewer's.
 *
 * A page whose views show solids holds them (ADR 0075): by default their files, which the program
 * sends as it sends them to the canvas, with the solid worker the program serves beside the viewer;
 * or, when the person asks, only the pictures the solid worker draws of them here.
 */
import {
  encodeBase64,
  mediaNamedBy,
  type MathFont,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { MediaFiles } from '../canvas/pictures/files';
import { solidPictureKey } from '../canvas/shape-solids';
import type { SolidFiles } from '../solids/solid-client';
import { solidAskFor } from '../solids/ask';
import { solidBucketFor } from '../solids/views';
import { pageDataOf } from '../viewer/data';
import { mathFontFile, mathFontsOfFiles } from '../viewer/math-families';
import { pageTitle, writePage, type ViewerAssets, type WrittenPage } from '../viewer/page';
import {
  pagePictureOf,
  shapesShowingSolids,
  solidHashesShown,
  type PageSolidPicture,
  type PageSolids,
} from '../viewer/solids';
import { imageFileName } from './image';
import { encodePng } from './png';
import { SVG_SOLID_PIXELS, type SolidPainter } from './solid-pictures';

/** Where the viewer's build lies beside the app's, as `pnpm build` puts it in `dist/viewer`. */
export const VIEWER_FILES = {
  script: 'viewer/viewer.js',
  style: 'viewer/viewer.css',
  solidWorker: 'viewer/solid-worker.js',
} as const;

/** Why the viewer could not be had: it was not built, as when the app runs from its sources. */
export class ViewerMissing extends Error {
  override name = 'ViewerMissing';
}

/** Fetches a file the local program serves. */
export type Fetch = (
  url: string,
) => Promise<Pick<Response, 'ok' | 'headers' | 'text'> & Partial<Pick<Response, 'arrayBuffer'>>>;

/**
 * The viewer's script and stylesheet, fetched from the local program beside the app, the solid
 * worker when `solidWorker` asks for it, and KaTeX's fonts that `mathFonts` names (ADR 0106). A
 * response that is not the file asked for, as a page served in its place, counts as missing; a font
 * that is missing is left out, and the page's formulas draw without its glyphs.
 */
export async function fetchViewerAssets(
  base: string = document.baseURI,
  fetchFile: Fetch = (url) => fetch(url),
  {
    solidWorker = false,
    mathFonts = [],
  }: { solidWorker?: boolean; mathFonts?: readonly MathFont[] } = {},
): Promise<ViewerAssets> {
  const get = async (path: string, type: RegExp): Promise<string> => {
    let response: Awaited<ReturnType<Fetch>>;
    try {
      response = await fetchFile(new URL(path, base).href);
    } catch (error) {
      throw new ViewerMissing(error instanceof Error ? error.message : String(error));
    }
    if (!response.ok || !type.test(response.headers.get('content-type') ?? '')) {
      throw new ViewerMissing(`${path} is not served`);
    }
    return response.text();
  };
  const font = async (name: MathFont): Promise<[MathFont, Uint8Array] | undefined> => {
    try {
      const response = await fetchFile(new URL(`viewer/${mathFontFile(name)}`, base).href);
      if (!response.ok || !/font\/woff2/i.test(response.headers.get('content-type') ?? '')) {
        return undefined;
      }
      if (!response.arrayBuffer) return undefined;
      return [name, new Uint8Array(await response.arrayBuffer())];
    } catch {
      return undefined;
    }
  };
  const [script, style, worker, fonts] = await Promise.all([
    get(VIEWER_FILES.script, /javascript/i),
    get(VIEWER_FILES.style, /css/i),
    solidWorker ? get(VIEWER_FILES.solidWorker, /javascript/i) : Promise.resolve(undefined),
    Promise.all(mathFonts.map(font)),
  ]);
  const held = fonts.filter((each) => each !== undefined);
  return {
    script,
    style,
    ...(worker === undefined ? {} : { solidWorker: worker }),
    ...(held.length === 0 ? {} : { mathFonts: Object.fromEntries(held) }),
  };
}

/** The families of KaTeX's fonts a project's Math uses, which its page holds (ADR 0106). */
export function mathFontsOfProject(project: ProjectSnapshot): MathFont[] {
  return mathFontsOfFiles(pageDataOf(project));
}

/** How a page holds the solids its views show: their files, to turn them, or only their pictures. */
export type PageSolidForm = PageSolids['form'];

/** Where the export gets what a page holds of its solids: the program's files, and the solid worker. */
export interface PageSolidSource {
  files: SolidFiles;
  painter?: SolidPainter;
}

/** What a page holds of its solids, and how many it could not hold, which then draw placeholders. */
export interface GatheredSolids {
  solids?: PageSolids;
  missing: number;
}

/**
 * Gathers what a page holds of the solids its views show (ADR 0075): every file they draw from, by its
 * hash, from the program; or every picture their shapes draw, at two pixels a unit, as the SVG's,
 * drawn by the solid worker, once for each picture. Nothing for a project whose views show no solid,
 * nor when no file could be had, so that the page holds no solid worker for nothing.
 */
export async function gatherPageSolids(
  project: ProjectSnapshot,
  form: PageSolidForm,
  source: PageSolidSource,
): Promise<GatheredSolids> {
  if (form === 'files') {
    const hashes = solidHashesShown(project);
    if (hashes.length === 0) return { missing: 0 };
    const files: Record<string, string> = {};
    let missing = 0;
    for (const hash of hashes) {
      const got = await source.files.get(hash);
      if (got.ok) files[hash] = encodeBase64(got.bytes);
      else missing += 1;
    }
    if (missing === hashes.length) return { missing };
    return { solids: { form: 'files', files }, missing };
  }
  const asks = new Map<string, NonNullable<ReturnType<typeof solidAskFor>>>();
  for (const shape of shapesShowingSolids(project)) {
    const key = solidPictureKey(shape);
    const rect = shape.solid?.rect;
    if (key === undefined || !rect || asks.has(key)) continue;
    const ask = solidAskFor(shape, Math.max(rect.width, rect.height) * SVG_SOLID_PIXELS, 0);
    if (ask) asks.set(key, ask);
  }
  if (asks.size === 0) return { missing: 0 };
  const listed = [...asks.values()];
  const painted = source.painter ? await source.painter.paint(listed) : listed.map(() => undefined);
  const pictures: PageSolidPicture[] = [];
  let missing = 0;
  for (const [at, ask] of listed.entries()) {
    const picture = painted[at];
    if (!picture) {
      missing += 1;
      continue;
    }
    const png = await encodePng(picture.pixels, picture.width, picture.height);
    pictures.push(
      pagePictureOf(ask.key, solidBucketFor(Math.max(picture.width, picture.height)), {
        width: picture.width,
        height: picture.height,
        png,
        ...(picture.partBuffer ? { partBuffer: picture.partBuffer } : {}),
      }),
    );
  }
  return { solids: { form: 'pictures', pictures }, missing };
}

/**
 * The media files a page's pictures show (ADR 0098), by hash, in base64, as the program serves them:
 * every one it could have, and how many it could not, which then draw as missing pictures.
 */
export async function gatherPageMedia(
  project: ProjectSnapshot,
  files: MediaFiles | undefined,
): Promise<{ media: Record<string, string>; missing: number }> {
  const hashes = [...mediaNamedBy(project.views)].sort();
  const media: Record<string, string> = {};
  let missing = 0;
  for (const hash of hashes) {
    const bytes = files === undefined ? undefined : await files(hash);
    if (bytes === undefined) missing += 1;
    else media[hash] = encodeBase64(bytes);
  }
  return { media, missing };
}

/** What a page opens at and says of itself. */
export interface PageOptions {
  /** The view state it opens at, as a view address's fragment writes it. */
  start?: string | undefined;
  made?: Date;
  /** What it holds of the solids its views show (ADR 0075); none for a page without solids. */
  solids?: PageSolids | undefined;
  /** The media files its pictures show, by hash, in base64 (ADR 0098). */
  media?: Record<string, string> | undefined;
}

/** Writes the read-only page of a project. */
export function makePage(
  project: ProjectSnapshot,
  assets: ViewerAssets,
  { start, made, solids, media }: PageOptions = {},
): Promise<WrittenPage> {
  return writePage({
    assets,
    data: pageDataOf(project, {
      ...(start === undefined ? {} : { start }),
      ...(made === undefined ? {} : { made }),
      ...(solids === undefined ? {} : { solids }),
      ...(media === undefined ? {} : { media }),
    }),
    title: pageTitle(project.project.name),
  });
}

/** The name a page is saved under: the project's, without what a file name cannot hold. */
export function pageFileName(projectName: string): string {
  return `${imageFileName(projectName, '').slice(0, -'.png'.length)}.html`;
}

/** The fragment of a view address, without its `#`; undefined for an address without one. */
export function fragmentOf(address: string | undefined): string | undefined {
  if (address === undefined) return undefined;
  const at = address.indexOf('#');
  const fragment = at === -1 ? '' : address.slice(at + 1);
  return fragment === '' ? undefined : fragment;
}

/** How large a file is, as people read it: bytes, kB or MB, in the language read in. */
export function sizeText(language: string, bytes: number): string {
  const [value, unit] =
    bytes < 1000
      ? [bytes, 'byte']
      : bytes < 1_000_000
        ? [bytes / 1000, 'kilobyte']
        : [bytes / 1_000_000, 'megabyte'];
  return new Intl.NumberFormat(language, {
    style: 'unit',
    unit,
    unitDisplay: 'short',
    maximumFractionDigits: unit === 'byte' ? 0 : 1,
  }).format(value);
}
