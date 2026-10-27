/**
 * The live protocol's request to make a drawing from HTML, and its answer (ADR 0068). The app sends
 * the HTML text; the local program makes the drawing, which changes nothing, and answers with the
 * cleaned SVG and what it dropped, or with `command/rejected` and why. The app shows them as a preview
 * and then sends one command, made by `prepareDrawingImport`.
 *
 * Each reader keeps only what its message holds, or says why it cannot be read; the live protocol
 * turns that into its own error.
 */
import { DRAWING_LIMITS } from './drawing-limits';

/** Asks the local program to make a drawing of HTML, laid out at a width. */
export interface DrawingMakeMessage {
  type: 'drawing/make';
  requestId: string;
  /** The file's name, or what pasted HTML is called. */
  name: string;
  /** The HTML text, at most {@link DRAWING_LIMITS}'s input in UTF-8. */
  html: string;
  /** The width it is laid out at, in CSS pixels. */
  width: number;
}

/** The drawing the local program made: cleaned SVG text, its size, and what it dropped, in words. */
export interface DrawingMadeMessage {
  type: 'drawing/made';
  requestId: string;
  /** Cleaned as every SVG image is (ADR 0027). */
  svg: string;
  width: number;
  height: number;
  /** What making it dropped, in the core's words, kept in English (ADR 0038). */
  report: string[];
}

/** The longest file name a request to make a drawing names. */
export const MAX_DRAWING_NAME = 1000;

/** The most lines a drawing's report holds, and the longest. */
export const MAX_DRAWING_REPORT = { lines: 200, length: 1000 } as const;

/** The longest SVG text an answer carries: the cleaner's cap on its output (ADR 0027). */
const MAX_DRAWING_SVG = 64 * 1024;

/** A message read, or why it could not be. */
export type DrawingMessageRead<T> = { ok: true; message: T } | { ok: false; reason: string };

/** Reads an app's request to make a drawing. */
export function readDrawingMake(
  message: Record<string, unknown>,
  requestId: string,
): DrawingMessageRead<DrawingMakeMessage> {
  const { name, html, width } = message;
  if (typeof name !== 'string' || name === '' || name.length > MAX_DRAWING_NAME) {
    return { ok: false, reason: 'Making a drawing names its file, in 1 to 1000 characters.' };
  }
  // Each character is at least one byte of UTF-8; the program measures the bytes themselves.
  if (typeof html !== 'string' || html.length > DRAWING_LIMITS.input) {
    return { ok: false, reason: 'Making a drawing needs its HTML as text, of at most 512 KiB.' };
  }
  if (!isWidth(width)) {
    return {
      ok: false,
      reason: 'A drawing is laid out at a width of 64 to 2000 pixels, in whole pixels.',
    };
  }
  return { ok: true, message: { type: 'drawing/make', requestId, name, html, width } };
}

/** Reads the local program's answer to a request to make a drawing. */
export function readDrawingMade(
  message: Record<string, unknown>,
  requestId: string,
): DrawingMessageRead<DrawingMadeMessage> {
  const { svg, width, height, report } = message;
  const valid =
    typeof svg === 'string' &&
    svg.startsWith('<svg') &&
    svg.length <= MAX_DRAWING_SVG &&
    isSize(width) &&
    isSize(height) &&
    Array.isArray(report) &&
    report.length <= MAX_DRAWING_REPORT.lines &&
    report.every(
      (line: unknown) => typeof line === 'string' && line.length <= MAX_DRAWING_REPORT.length,
    );
  if (!valid) return { ok: false, reason: 'The drawing Visual Anything made cannot be read.' };
  return {
    ok: true,
    message: {
      type: 'drawing/made',
      requestId,
      svg,
      width,
      height,
      report: [...(report as string[])],
    },
  };
}

function isWidth(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= DRAWING_LIMITS.width.least &&
    (value as number) <= DRAWING_LIMITS.width.most
  );
}

function isSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 100_000;
}
