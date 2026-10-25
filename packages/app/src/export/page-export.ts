/**
 * Export → Read-only page, from the app (ADR 0041): the page is written in the browser from the
 * project as this tab holds it and the viewer the local program serves beside the app, then the
 * browser saves it, as it saves a PNG. Nothing is written by the local program, and nothing of the
 * session goes into the page: its data is the project's files, and its scripts are the viewer's.
 */
import type { ProjectSnapshot } from '@visual-anything/core';
import { pageDataOf } from '../viewer/data';
import { pageTitle, writePage, type ViewerAssets, type WrittenPage } from '../viewer/page';
import { imageFileName } from './image';

/** Where the viewer's build lies beside the app's, as `pnpm build` puts it in `dist/viewer`. */
export const VIEWER_FILES = { script: 'viewer/viewer.js', style: 'viewer/viewer.css' } as const;

/** Why the viewer could not be had: it was not built, as when the app runs from its sources. */
export class ViewerMissing extends Error {
  override name = 'ViewerMissing';
}

/** Fetches a file the local program serves. */
export type Fetch = (url: string) => Promise<Pick<Response, 'ok' | 'headers' | 'text'>>;

/**
 * The viewer's script and stylesheet, fetched from the local program beside the app. A response that
 * is not the file asked for, as a page served in its place, counts as missing.
 */
export async function fetchViewerAssets(
  base: string = document.baseURI,
  fetchFile: Fetch = (url) => fetch(url),
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
  const [script, style] = await Promise.all([
    get(VIEWER_FILES.script, /javascript/i),
    get(VIEWER_FILES.style, /css/i),
  ]);
  return { script, style };
}

/** What a page opens at and says of itself. */
export interface PageOptions {
  /** The view state it opens at, as a view address's fragment writes it. */
  start?: string | undefined;
  made?: Date;
}

/** Writes the read-only page of a project. */
export function makePage(
  project: ProjectSnapshot,
  assets: ViewerAssets,
  { start, made }: PageOptions = {},
): Promise<WrittenPage> {
  return writePage({
    assets,
    data: pageDataOf(project, {
      ...(start === undefined ? {} : { start }),
      ...(made === undefined ? {} : { made }),
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
