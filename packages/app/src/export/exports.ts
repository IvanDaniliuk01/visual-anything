/**
 * The exports of a view (M6b), in one place for the Export dialog, the command line and Claude's
 * tools: SVG and PDF drawn from the scene, and the outline in Markdown, Mermaid and Structurizr DSL as
 * text. Each answers its text or its bytes, the media type and the file name to save it under, and
 * what it could not hold; none writes a file, which is up to whoever asked.
 *
 *   const exported = await exportView(project, 'system-overview', 'pdf', { theme: 'dark' });
 *   // { format: 'pdf', bytes, mediaType: 'application/pdf', fileName: 'My systems - System overview.pdf', size, lost }
 */
import type { ProjectSnapshot, ThemeName } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { t } from '../i18n';
import { writeMermaid } from './mermaid';
import { writeOutline } from './outline';
import { writePdf } from './pdf';
import { structurizrApplies, writeStructurizr } from './structurizr';
import { svgSolidsOf, writeSvg, type SvgSolidPicture } from './svg';
import { SVG_SOLID_PIXELS, solidShotsOf, type SolidPainter } from './solid-pictures';
import { buildScene } from '../canvas/scene';

/** The formats a view exports to, but the PNG the canvas draws and the read-only page. */
export const EXPORT_FORMATS = ['svg', 'pdf', 'md', 'mermaid', 'structurizr'] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/** What each format is written as. */
export const FORMAT_FILES: Readonly<
  Record<ExportFormat, { extension: string; mediaType: string; binary: boolean }>
> = {
  svg: { extension: 'svg', mediaType: 'image/svg+xml', binary: false },
  pdf: { extension: 'pdf', mediaType: 'application/pdf', binary: true },
  md: { extension: 'md', mediaType: 'text/markdown;charset=utf-8', binary: false },
  mermaid: { extension: 'mmd', mediaType: 'text/plain;charset=utf-8', binary: false },
  structurizr: { extension: 'dsl', mediaType: 'text/plain;charset=utf-8', binary: false },
};

/** Whether a text is one of the formats. */
export function isExportFormat(text: string): text is ExportFormat {
  return (EXPORT_FORMATS as readonly string[]).includes(text);
}

/** How a view is exported. */
export interface ExportOptions {
  /** The theme SVG, PDF, Mermaid and Structurizr take their colors from; light by default. */
  theme?: ThemeName;
  /** When a PDF is made; now by default. A fixed date makes the same file each time. */
  date?: Date;
  /**
   * Stops the export: it then rejects with the signal's reason, an `AbortError` unless the signal was
   * given another, and does no further work. A PDF stops between two pieces of its drawing; the
   * others, which take a moment, before and after they are written.
   */
  signal?: AbortSignal;
  /**
   * What draws solids' pictures, for the SVG and the PDF: the solid worker, through the app's client
   * (ADR 0075). Without it, as from the command line and Claude's `export_view`, which have no GPU,
   * each solid is drawn as its placeholder, and the export says so.
   */
  solids?: SolidPainter;
}

/**
 * Whether an export ended because it was stopped, rather than failing: its signal was aborted, which
 * whatever it threw then answers, or it threw an `AbortError`.
 */
export function isStopped(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || isAbortError(error);
}

/** Whether an error is the `AbortError` an aborted signal throws by default. */
function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

/** A view exported: its text or its bytes, and how to save it. */
export type Exported = {
  format: ExportFormat;
  /** The name to save it under: the project's and the view's, with the format's extension. */
  fileName: string;
  mediaType: string;
  /** Its size in bytes, as saved. */
  size: number;
  /** What it could not hold, in the language the app reads in. */
  lost: string[];
} & ({ text: string; bytes?: never } | { bytes: Uint8Array; text?: never });

/** Why a view cannot be exported. */
export class ExportError extends Error {
  override name = 'ExportError';
}

/** The longest a file name gets before its extension. */
const MOST_NAME = 120;

/**
 * The name an export is saved under: the project's and the view's, without what Windows, macOS or
 * Linux cannot hold in a file name, and the format's extension.
 */
export function exportFileName(project: string, view: string, format: ExportFormat): string {
  const clean = (text: string) =>
    text
      // eslint-disable-next-line no-control-regex -- control characters cannot be in a file name
      .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '-')
      .trim()
      .replace(/^\.+|\.+$/g, '');
  const parts = [clean(project), clean(view)].filter((part) => part !== '');
  const name = parts.join(' - ').slice(0, MOST_NAME).trim();
  return `${name === '' ? 'view' : name}.${FORMAT_FILES[format].extension}`;
}

/** How many bytes a text takes in UTF-8. */
function utf8Size(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

/**
 * Exports the view with this id to a format. Throws an `ExportError` when the project has no such
 * view, and rejects with the signal's reason once `options.signal` stops it.
 */
export async function exportView(
  project: ProjectSnapshot,
  viewId: Id,
  format: ExportFormat,
  options: ExportOptions = {},
): Promise<Exported> {
  const { signal } = options;
  signal?.throwIfAborted();
  const view = project.views.find((each) => each.id === viewId);
  if (!view) throw new ExportError(`The project has no view "${viewId}".`);
  const fileName = exportFileName(project.project.name, view.name, format);
  const outlineFile = exportFileName(project.project.name, view.name, 'md');
  const { mediaType } = FORMAT_FILES[format];
  const theme = options.theme === undefined ? {} : { theme: options.theme };
  const textOf = (written: { text: string; lost: string[] }): Exported => {
    // Written all at once, so stopped only once it is: what it wrote goes unused.
    signal?.throwIfAborted();
    return {
      format,
      fileName,
      mediaType,
      text: written.text,
      size: utf8Size(written.text),
      lost: written.lost,
    };
  };
  // The pictures of the view's solids, drawn at the drawing's scale, for the SVG and the PDF.
  const solids =
    options.solids && (format === 'svg' || format === 'pdf')
      ? { solids: await solidPicturesFor(project, viewId, options.solids, options.theme ?? 'light') }
      : {};
  signal?.throwIfAborted();
  switch (format) {
    case 'svg':
      return textOf(writeSvg(project, viewId, { ...theme, outlineFile, ...solids }));
    case 'md':
      return textOf(writeOutline(project, viewId));
    case 'mermaid':
      return textOf(writeMermaid(project, viewId, theme));
    case 'structurizr':
      return textOf(writeStructurizr(project, viewId, theme));
    case 'pdf': {
      const pdf = await writePdf(project, viewId, {
        ...theme,
        ...solids,
        outline: { text: writeOutline(project, viewId).text, file: outlineFile },
        language: t.language,
        ...(options.date === undefined ? {} : { date: options.date }),
        ...(signal === undefined ? {} : { signal }),
      });
      return {
        format,
        fileName,
        mediaType,
        bytes: pdf.bytes,
        size: pdf.bytes.byteLength,
        lost: pdf.lost,
      };
    }
  }
}

/**
 * The pictures of a view's solids, as an SVG or a PDF holds them: drawn by `painter` at two pixels a
 * canvas unit, with their parts' states as the view's overlays leave them (ADR 0075).
 */
export async function solidPicturesFor(
  project: ProjectSnapshot,
  viewId: Id,
  painter: SolidPainter,
  theme: ThemeName,
): Promise<Map<string, SvgSolidPicture>> {
  const scene = buildScene(project, viewId);
  const shots = await solidShotsOf(project, scene, painter, {
    pixelsPerUnit: SVG_SOLID_PIXELS,
    theme,
  });
  return svgSolidsOf(shots.pictures);
}

/** Whether a format can export a view, and why not when it cannot. */
export interface FormatChoice {
  format: ExportFormat;
  available: boolean;
  /** Why it is not, in the language the app reads in. */
  why?: string;
  /** What it leaves out of every view, in the language the app reads in. */
  leavesOut: string;
}

/** What each format leaves out of every view, whatever the view holds. */
function leavesOut(format: ExportFormat): string {
  switch (format) {
    case 'svg':
      return t(
        'The whole view as the canvas draws it, without the selection, filters, focus or guidance.',
      );
    case 'pdf':
      return t(
        'The whole view on one page, without the selection, filters, focus or guidance; WebP pictures and the colors of bitmap silhouettes are left out.',
      );
    case 'md':
      return t(
        'Every shape and relation as text, and the scenarios; no positions, colors or pictures.',
      );
    case 'mermaid':
      return t(
        'Shapes and relations for Mermaid to lay out; no positions, details, notes or pictures.',
      );
    case 'structurizr':
      return t(
        'The C4 model of the view’s Systems components; no positions, notes, pictures or scenarios.',
      );
  }
}

/** The formats a view exports to, each with whether it can and what it leaves out. */
export function formatsFor(project: ProjectSnapshot, viewId: Id): FormatChoice[] {
  return EXPORT_FORMATS.map((format) => {
    const choice: FormatChoice = { format, available: true, leavesOut: leavesOut(format) };
    if (format === 'structurizr' && !structurizrApplies(project, viewId)) {
      return {
        ...choice,
        available: false,
        why: t('The view shows no element of the Systems package.'),
      };
    }
    return choice;
  });
}
