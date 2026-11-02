/**
 * The PDF export (M6b): made from the SVG the SVG writer writes, so that the two never draw a view
 * differently. PDFKit makes the document and SVG-to-PDFKit draws the SVG into it, as vectors; both are
 * MIT-licensed and run in Node, for the command line and Claude, and in the browser (ADR-0014's
 * clarification of 2026-10-25). They are loaded only when a PDF is made.
 *
 * - **Fonts.** The text is written in Roboto, one of the fonts the canvas writes in and the one whose
 *   license lets it ship (Apache-2.0, ADR-0047), embedded with only the glyphs the file uses: the PDF
 *   reads the same on every computer. A character Roboto lacks is said to be lost. Roboto 2.137
 *   Regular and Bold are in `fonts/roboto.json`, as WOFF files in base64, taken unchanged from the npm
 *   package `roboto-fontface` 0.10.0; `fonts/LICENSE-roboto.txt` holds their license. Text emphasis
 *   (ADR 0082) adds Roboto Italic and Bold Italic, from the same package, and Roboto Mono 3.000, all
 *   Apache-2.0, in `fonts/roboto-emphasis.json`: loaded and embedded only when a text uses them.
 *   Roboto Medium, from the same package, in `fonts/roboto-medium.json`, is loaded and embedded only
 *   when the drawing writes names at weight 500 (ADR 0086), which the SVG marks with the family
 *   `MEDIUM_FAMILY`.
 * - **Pictures.** SVG pictures are drawn as vectors, PNG and JPEG bitmaps as images; WebP, which PDF
 *   cannot hold, and the silhouettes of bitmaps, which need filters, are said to be lost.
 * - **The page** is the size of the view, a canvas unit to a CSS pixel, three quarters of a point, and
 *   is scaled down to stay within 200 inches a side, the most PDF readers open. The legend of the
 *   view's overlays is below the drawing, as the SVG writes it (ADR 0055).
 * - **Metadata:** the view's name as the title, its description as the subject, the packages'
 *   attribution (ADR-0047) and, attached, the view's outline in Markdown, its long description.
 * - **Piece by piece.** The SVG is drawn in pieces of a few of its shapes each (`svgPieces`), and the
 *   writer lets the page do what waits between two pieces, so that a large view never holds the tab
 *   for long, and stopping it (`signal`) stops it there: it rejects with the signal's reason, an
 *   `AbortError`, and draws nothing more.
 */
import type { ProjectSnapshot, ThemeName } from '@visual-anything/core';
import { decodeBase64, encodeBase64 } from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import { t, type PluralText } from '../i18n';
import { MEDIUM_FAMILY, svgPieces, writeSvg, type SvgDrawing, type SvgOptions } from './svg';
import { usesEmphasisFonts } from './emphasis-svg';

/** Points to a canvas unit: a CSS pixel is three quarters of a point. */
const POINTS_PER_UNIT = 0.75;
/** The largest side of a page, in points, that PDF readers open: 200 inches. */
export const LARGEST_PAGE_SIDE = 14_400;
/** How many characters the font lacks a PDF names, at most. */
const MOST_MISSING = 20;
/** How much of the SVG one piece draws at most, in characters, unless one of its parts is longer. */
const PIECE = 64_000;

const PARTS_NOT_DRAWN: PluralText = {
  one: 'One part of the drawing could not be drawn in the PDF.',
  other: '{count} parts of the drawing could not be drawn in the PDF.',
};

/** How a PDF is made. */
export interface PdfOptions {
  /** The theme the view is drawn in; light by default. */
  theme?: ThemeName;
  /** The view's outline in Markdown, its long description, attached to the file under `outlineFile`. */
  outline?: { text: string; file: string };
  /** When it is made; now by default. A fixed date makes the same file each time. */
  date?: Date;
  /** The language it is written in, for readers that speak it aloud; English by default. */
  language?: string;
  /** Whether its streams are compressed; true by default, false to read them in a test. */
  compress?: boolean;
  /** Solids' pictures, as the SVG takes them (ADR 0075); without, solids are their placeholders. */
  solids?: SvgOptions['solids'];
  /**
   * Stops making it, between two pieces of the drawing: it then rejects with the signal's reason, an
   * `AbortError` unless the signal was given another, and does no further work.
   */
  signal?: AbortSignal;
}

/** A PDF made from a view. */
export interface PdfFile {
  bytes: Uint8Array;
  /** Its page's size, in points. */
  page: { width: number; height: number };
  /** What it could not show, in the language the app reads in. */
  lost: string[];
}

/** The part of PDFKit's document this module uses. */
interface PdfDocument {
  registerFont(name: string, source: Uint8Array): PdfDocument;
  font(name: string): PdfDocument;
  file(source: string, options: Record<string, unknown>): PdfDocument;
  save(): PdfDocument;
  restore(): PdfDocument;
  scale(factor: number): PdfDocument;
  on(event: 'data', listener: (chunk: Uint8Array) => void): PdfDocument;
  on(event: 'end', listener: () => void): PdfDocument;
  on(event: 'error', listener: (error: unknown) => void): PdfDocument;
  end(): void;
  /** The font in use; its `font` is fontkit's, which knows which characters it has. */
  _font?: { font?: { hasGlyphForCodePoint?(codePoint: number): boolean } };
}

type PdfDocumentClass = new (options: Record<string, unknown>) => PdfDocument;

type SvgToPdf = (
  document: PdfDocument,
  svg: string,
  x: number,
  y: number,
  options: {
    width: number;
    height: number;
    assumePt: boolean;
    fontCallback: (family: string, bold: boolean, italic: boolean) => string;
    warningCallback: (warning: string) => void;
  },
) => void;

/** PDFKit, SVG-to-PDFKit and the fonts, loaded the first time a PDF is made. */
async function libraries(): Promise<{
  PDFDocument: PdfDocumentClass;
  svgToPdf: SvgToPdf;
  regular: Uint8Array;
  bold: Uint8Array;
}> {
  const [pdfkit, converter, fonts] = await Promise.all([
    import('pdfkit'),
    import('svg-to-pdfkit'),
    import('./fonts/roboto.json'),
  ]);
  const regular = decodeBase64(fonts.default.regular);
  const bold = decodeBase64(fonts.default.bold);
  if (!regular || !bold) throw new Error('The fonts the PDF embeds could not be read.');
  return {
    PDFDocument: (pdfkit as unknown as { default: PdfDocumentClass }).default,
    svgToPdf: (converter as unknown as { default: SvgToPdf }).default,
    regular,
    bold,
  };
}

/** Roboto Medium, loaded the first time a PDF writes names at weight 500. */
async function mediumFont(): Promise<Uint8Array> {
  const medium = decodeBase64((await import('./fonts/roboto-medium.json')).default.medium);
  if (!medium) throw new Error('The fonts the PDF embeds could not be read.');
  return medium;
}

/** The fonts text emphasis adds (ADR 0082), loaded the first time a PDF has a text that uses them. */
async function emphasisFonts(): Promise<{
  italic: Uint8Array;
  boldItalic: Uint8Array;
  mono: Uint8Array;
}> {
  const fonts = (await import('./fonts/roboto-emphasis.json')).default;
  const italic = decodeBase64(fonts.italic);
  const boldItalic = decodeBase64(fonts.boldItalic);
  const mono = decodeBase64(fonts.mono);
  if (!italic || !boldItalic || !mono) {
    throw new Error('The fonts the PDF embeds could not be read.');
  }
  return { italic, boldItalic, mono };
}

/**
 * The embedded font a text of this family, weight and style is written in: Roboto Medium, when it is
 * embedded, for upright text the SVG marks with its family.
 */
export function fontFor(
  family: string,
  bold: boolean,
  italic: boolean,
  more: boolean,
  medium = false,
): string {
  if (medium && !italic && family.includes(MEDIUM_FAMILY)) return 'va-medium';
  if (more && family.includes('Mono')) return 'va-mono';
  if (more && italic) return bold ? 'va-bold-italic' : 'va-italic';
  return bold ? 'va-bold' : 'va-regular';
}

/**
 * A message channel, as far as `pause` uses one: the browser's and Node's alike, typed here since the
 * command line's build knows no DOM.
 */
interface Channel {
  port1: { onmessage: (() => void) | null; close(): void };
  port2: { postMessage(message: unknown): void };
}

/**
 * Lets the page, or Node, do what waits, such as a click on Stop, and resolves right after: a message
 * through a channel of its own, which no browser delays as it delays timers.
 */
function pause(): Promise<void> {
  // The DOM's and Node's types of a channel differ, though both have what `Channel` names.
  const Made = (globalThis as unknown as { MessageChannel?: new () => Channel }).MessageChannel;
  return new Promise((resolve) => {
    if (Made === undefined) {
      setTimeout(resolve, 0);
      return;
    }
    const channel = new Made();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(undefined);
  });
}

/**
 * Makes a PDF of the view with this id. Throws when the project has no such view, and rejects with
 * the signal's reason once `options.signal` stops it.
 */
export async function writePdf(
  project: ProjectSnapshot,
  viewId: Id,
  options: PdfOptions = {},
): Promise<PdfFile> {
  const { signal } = options;
  signal?.throwIfAborted();
  const drawing = writeSvg(project, viewId, {
    ...(options.theme === undefined ? {} : { theme: options.theme }),
    ...(options.outline === undefined ? {} : { outlineFile: options.outline.file }),
    ...(options.solids === undefined ? {} : { solids: options.solids }),
    ...PDF_PICTURES,
  });
  const view = project.views.find((each) => each.id === viewId);
  const subject = view?.description?.trim();
  return pdfOfSvg(
    drawing,
    { title: view?.name ?? viewId, ...(subject ? { subject } : {}) },
    options,
  );
}

/**
 * What a drawing a PDF takes must leave out: bitmaps PDF cannot hold, filters, and the traced paths of
 * solids' anchored parts, which no one points at in a PDF (ADR 0075).
 */
export const PDF_PICTURES = {
  bitmaps: ['png', 'jpeg'],
  filters: false,
  tracedParts: false,
} as const;

/**
 * Makes a PDF of a drawing the SVG writer wrote, as it is, such as a comparison's (ADR 0070): its
 * pictures written as `PDF_PICTURES` says. Rejects with the signal's reason once stopped.
 */
export async function pdfOfSvg(
  drawing: SvgDrawing,
  about: { title: string; subject?: string },
  options: PdfOptions = {},
): Promise<PdfFile> {
  const { signal } = options;
  signal?.throwIfAborted();
  const { PDFDocument, svgToPdf, regular, bold } = await libraries();
  const uses = usesEmphasisFonts(drawing.text);
  const more = uses.italic || uses.mono ? await emphasisFonts() : undefined;
  const medium = drawing.text.includes(MEDIUM_FAMILY) ? await mediumFont() : undefined;
  signal?.throwIfAborted();

  const natural = {
    width: drawing.viewBox.width * POINTS_PER_UNIT,
    height: drawing.viewBox.height * POINTS_PER_UNIT,
  };
  const fit = Math.min(1, LARGEST_PAGE_SIDE / natural.width, LARGEST_PAGE_SIDE / natural.height);
  const page = { width: natural.width * fit, height: natural.height * fit };
  const lost = [...drawing.lost];
  if (fit < 1) {
    lost.push(
      t('Drawn at {percent}% of its size, so that its page stays within 200 inches a side.', {
        percent: Math.floor(fit * 1000) / 10,
      }),
    );
  }

  const info: Record<string, unknown> = {
    Title: about.title,
    Creator: 'Visual Anything',
    CreationDate: options.date ?? new Date(),
  };
  if (about.subject) info.Subject = about.subject;
  if (drawing.attribution.length > 0) info.Attribution = drawing.attribution.join('\n');

  const document = new PDFDocument({
    size: [page.width, page.height],
    margin: 0,
    font: regular,
    info,
    lang: options.language ?? 'en',
    displayTitle: true,
    compress: options.compress ?? true,
  });
  document.registerFont('va-regular', regular);
  document.registerFont('va-bold', bold);
  if (medium) document.registerFont('va-medium', medium);
  if (more) {
    document.registerFont('va-italic', more.italic);
    document.registerFont('va-bold-italic', more.boldItalic);
    document.registerFont('va-mono', more.mono);
  }
  const chunks: Uint8Array[] = [];
  const done = new Promise<void>((resolve, reject) => {
    document.on('data', (chunk) => chunks.push(chunk));
    document.on('end', () => resolve());
    document.on('error', (error) =>
      reject(error instanceof Error ? error : new Error(String(error))),
    );
  });

  const missing = missingCharacters(document, drawing.texts);
  if (missing.length > 0) {
    lost.push(
      t('The embedded font has no {characters}, which show as empty boxes.', {
        characters: missing.join(' '),
      }),
    );
  }

  const warnings: string[] = [];
  document.save().scale(fit);
  // Each piece draws over the same view box, in the drawing's order; between two, Stop can stop it.
  // There is one page, so the pieces are the only place to stop between.
  for (const piece of svgPieces(drawing.layers, PIECE)) {
    svgToPdf(document, piece, 0, 0, {
      width: natural.width,
      height: natural.height,
      assumePt: false,
      fontCallback: (family, isBold, isItalic) =>
        fontFor(family, isBold, isItalic, more !== undefined, medium !== undefined),
      warningCallback: (warning) => warnings.push(warning),
    });
    await pause();
    signal?.throwIfAborted();
  }
  document.restore();
  if (warnings.length > 0) {
    lost.push(t(PARTS_NOT_DRAWN, { count: warnings.length }));
  }

  if (options.outline) {
    // As a data address, which PDFKit reads alike whatever made the bytes.
    const outline = encodeBase64(new TextEncoder().encode(options.outline.text));
    document.file(`data:text/markdown;base64,${outline}`, {
      name: options.outline.file,
      type: 'text/markdown',
      description: t('The long description of the view: an outline of every shape and relation.'),
      ...(options.date === undefined
        ? {}
        : { creationDate: options.date, modifiedDate: options.date }),
    });
  }
  signal?.throwIfAborted();
  document.end();
  await done;
  // Stopped while it was being written out: what it made goes unused.
  signal?.throwIfAborted();
  return { bytes: joined(chunks), page, lost };
}

/** The characters of the texts that the document's font has no glyph for, up to a few. */
function missingCharacters(document: PdfDocument, texts: readonly string[]): string[] {
  const missing = new Set<string>();
  for (const name of ['va-regular', 'va-bold']) {
    document.font(name);
    const font = document._font?.font;
    if (typeof font?.hasGlyphForCodePoint !== 'function') return [];
    for (const text of texts) {
      for (const character of text) {
        const point = character.codePointAt(0) ?? 0;
        if (/\s/.test(character) || missing.has(character)) continue;
        if (!font.hasGlyphForCodePoint(point)) missing.add(character);
        if (missing.size >= MOST_MISSING) return [...missing];
      }
    }
  }
  document.font('va-regular');
  return [...missing];
}

/** Chunks of bytes as one array. */
function joined(chunks: readonly Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes;
}
