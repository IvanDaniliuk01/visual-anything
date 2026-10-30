/**
 * Claude sees a view as the app draws it (ADR 0081). `capture_view` is a read: the program asks the
 * open apps for a picture with `capture/request`, and the tab the person used last answers with
 * `capture/answer`, matched by the request's id, as `layout/done` answers layout guidance: a PNG of
 * the view as its canvas draws it, rendered off screen at the width asked for, or why it took none.
 * The other tabs pass it over, saying so. Nothing changes: no view file, no history, no camera.
 * Protocol 7 carries both, since no build of 7 has shipped.
 */
import type { Id } from '@visual-anything/schema';
import { isId } from './ids';
import type { ThemeName } from './preferences';

/** The width of a picture, in pixels: from 256 to 2,048, 1,280 when not given. */
export const CAPTURE_WIDTH = Object.freeze({ least: 256, most: 2048, initial: 1280 });

/**
 * The most pixels a picture is tall. A region taller than it is at the width asked for is drawn
 * narrower, so that the whole of it shows.
 */
export const MAX_CAPTURE_HEIGHT = 4096;

/**
 * The most a picture takes, in base64 as it travels and as Claude reads it: 4 MiB, a PNG of 3 MiB.
 * It stays under the 5 MB the Claude API takes for one image, and the live connection carries it.
 */
export const MAX_CAPTURE_BYTES = 4 * 1024 * 1024;

/**
 * The most pixels a picture has on a side, the legend's band of its overlays included, as an image of
 * the canvas has (the PNG export's most); {@link MAX_CAPTURE_BYTES} bounds it first.
 */
export const MAX_CAPTURE_SIDE = 16_384;

/** The most elements a region frames, as many as guidance names. */
export const MAX_CAPTURE_ELEMENTS = 500;

/** How long the program waits for a picture: 20 s (ADR 0081). */
export const CAPTURE_WAIT = 20_000;

/** The longest reason a capture failed that an answer carries. */
export const MAX_CAPTURE_WHY = 500;

/**
 * What a picture shows: the whole view, what the tab's canvas shows now, or the shapes of these
 * elements, with some room around them.
 */
export type CaptureRegion = 'whole' | 'viewport' | Id[];

/** What Claude asks a picture of: the view the tab shows when none is named. */
export interface CaptureAsk {
  view?: Id;
  region: CaptureRegion;
  /** Its width in pixels, from {@link CAPTURE_WIDTH}'s least to its most. */
  width: number;
  /** The theme to draw it in; the tab's when not given. */
  theme?: ThemeName;
}

/** Asks the open apps for a picture of a view; the tab the person used last answers. */
export interface CaptureRequestMessage extends CaptureAsk {
  type: 'capture/request';
  requestId: string;
}

/** A picture the app took: a PNG in base64, as the canvas draws the view. */
export interface CapturePicture {
  png: string;
  width: number;
  height: number;
  /** The view it shows. */
  view: Id;
  theme: ThemeName;
  /**
   * How many pixels each canvas unit took: the canvas writes names and details as at that zoom. Its
   * size includes the legend's band below the drawing, when the view has overlays.
   */
  scale: number;
  /** For a region of elements: those named that have no shape the canvas draws there. */
  missing?: Id[];
}

/** Why a tab took no picture: it is not the tab the person used last. */
export const CAPTURE_PASSES = ['other-tab'] as const;
export type CapturePass = (typeof CAPTURE_PASSES)[number];

/**
 * Why the tab the person used last could not take one: it shows another view (`shows`), the
 * picture would be larger than {@link MAX_CAPTURE_BYTES} (`bytes`), the view draws nothing, none of
 * the elements named has a shape the canvas draws, the tab draws no canvas now, or drawing failed
 * (`why`).
 */
export const CAPTURE_FAILURES = [
  'other-view',
  'too-large',
  'empty',
  'not-drawn',
  'no-canvas',
  'failed',
] as const;
export type CaptureFailureKind = (typeof CAPTURE_FAILURES)[number];

/** Why a picture could not be taken, with what each kind says. */
export interface CaptureFailure {
  failed: CaptureFailureKind;
  /** For `other-view`: the view the tab shows. */
  shows?: Id;
  /** For `too-large`: how large it would have been, in base64. */
  bytes?: number;
  /** For `failed`: why, in English, as the app says it. */
  why?: string;
}

/** The app's answer: exactly one of a picture, a pass and a failure. */
export type CaptureAnswerMessage = { type: 'capture/answer'; requestId: string } & (
  { picture: CapturePicture } | { passed: CapturePass } | CaptureFailure
);

/**
 * What the program tells Claude: how many apps it asked, and the picture or the failure of the tab
 * that answered; or, when none did, why: every tab passed it over, the wait ran out, or the apps went.
 */
export interface CaptureReport {
  apps: number;
  picture?: CapturePicture;
  failure?: CaptureFailure;
  unanswered?: 'passed' | 'timed-out' | 'gone';
  /** For `timed-out`: how long the program waited, in milliseconds. */
  waited?: number;
}

/** How long base64 text is for so many bytes. */
export function base64Length(bytes: number): number {
  return 4 * Math.ceil(bytes / 3);
}

/** What a message reads as, or why it cannot be read. */
export type CaptureRead<T> = { ok: true; value: T } | { ok: false; reason: string };

const THEMES: readonly ThemeName[] = ['light', 'dark'];

const isTheme = (value: unknown): value is ThemeName => THEMES.some((each) => each === value);

const isWhole = (value: unknown, least: number, most: number): value is number =>
  Number.isSafeInteger(value) && (value as number) >= least && (value as number) <= most;

/** Base64 as PNG's bytes start: the signature `\x89PNG\r\n\x1a\n`. */
const PNG_START = 'iVBORw0KGgo';
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** Reads what a picture is asked of, keeping only what it holds. */
export function readCaptureAsk(message: Record<string, unknown>): CaptureRead<CaptureAsk> {
  const { view, region, width, theme } = message;
  if (view !== undefined && !isId(view)) {
    return { ok: false, reason: 'A capture names its view by id.' };
  }
  if (!isWhole(width, CAPTURE_WIDTH.least, CAPTURE_WIDTH.most)) {
    return {
      ok: false,
      reason: `A capture is ${CAPTURE_WIDTH.least} to ${CAPTURE_WIDTH.most} pixels wide, a whole number.`,
    };
  }
  let read: CaptureRegion;
  if (region === 'whole' || region === 'viewport') read = region;
  else if (
    Array.isArray(region) &&
    region.length > 0 &&
    region.length <= MAX_CAPTURE_ELEMENTS &&
    region.every(isId)
  ) {
    read = [...region];
  } else {
    return {
      ok: false,
      reason: `A capture shows "whole", "viewport", or 1 to ${MAX_CAPTURE_ELEMENTS} elements by id.`,
    };
  }
  if (theme !== undefined && !isTheme(theme)) {
    return { ok: false, reason: 'A capture is drawn in the light or the dark theme.' };
  }
  return {
    ok: true,
    value: {
      ...(view === undefined ? {} : { view }),
      region: read,
      width,
      ...(theme === undefined ? {} : { theme }),
    },
  };
}

/** Reads `capture/request` strictly. */
export function readCaptureRequest(
  message: Record<string, unknown>,
  requestId: string,
): CaptureRead<CaptureRequestMessage> {
  const ask = readCaptureAsk(message);
  if (!ask.ok) return ask;
  return { ok: true, value: { type: 'capture/request', requestId, ...ask.value } };
}

/** Reads a picture strictly: a PNG in base64 within the cap, and how it was drawn. */
export function readCapturePicture(value: unknown): CaptureRead<CapturePicture> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, reason: 'A picture is an object.' };
  }
  const { png, width, height, view, theme, scale, missing } = value as Record<string, unknown>;
  if (typeof png !== 'string' || png.length > MAX_CAPTURE_BYTES) {
    return { ok: false, reason: 'A picture is a PNG of at most 4 MiB in base64.' };
  }
  if (png.length % 4 !== 0 || !png.startsWith(PNG_START) || !BASE64.test(png)) {
    return { ok: false, reason: 'A picture is a PNG in base64.' };
  }
  if (!isWhole(width, 1, MAX_CAPTURE_SIDE) || !isWhole(height, 1, MAX_CAPTURE_SIDE)) {
    return { ok: false, reason: `A picture is 1 to ${MAX_CAPTURE_SIDE} pixels a side.` };
  }
  if (!isId(view)) return { ok: false, reason: 'A picture names the view it shows.' };
  if (!isTheme(theme)) return { ok: false, reason: 'A picture is in the light or the dark theme.' };
  if (typeof scale !== 'number' || !Number.isFinite(scale) || !(scale > 0)) {
    return { ok: false, reason: 'A picture says how many pixels each canvas unit took.' };
  }
  if (
    missing !== undefined &&
    (!Array.isArray(missing) || missing.length > MAX_CAPTURE_ELEMENTS || !missing.every(isId))
  ) {
    return { ok: false, reason: 'The elements a picture misses are a list of ids.' };
  }
  return {
    ok: true,
    value: {
      png,
      width,
      height,
      view,
      theme,
      scale,
      ...(missing === undefined ? {} : { missing: [...missing] }),
    },
  };
}

/** Reads why a capture failed strictly. */
export function readCaptureFailure(message: Record<string, unknown>): CaptureRead<CaptureFailure> {
  const { failed, shows, bytes, why } = message;
  if (!CAPTURE_FAILURES.some((each) => each === failed)) {
    return { ok: false, reason: `A capture fails as one of: ${CAPTURE_FAILURES.join(', ')}.` };
  }
  if (shows !== undefined && !isId(shows)) {
    return { ok: false, reason: 'The view a tab shows is named by id.' };
  }
  if (bytes !== undefined && !isWhole(bytes, 0, Number.MAX_SAFE_INTEGER)) {
    return { ok: false, reason: 'How large a picture would be is a whole number of bytes.' };
  }
  if (why !== undefined && (typeof why !== 'string' || why.length > MAX_CAPTURE_WHY)) {
    return {
      ok: false,
      reason: `Why a capture failed is a text of at most ${MAX_CAPTURE_WHY} characters.`,
    };
  }
  return {
    ok: true,
    value: {
      failed: failed as CaptureFailureKind,
      ...(shows === undefined ? {} : { shows }),
      ...(bytes === undefined ? {} : { bytes }),
      ...(why === undefined ? {} : { why }),
    },
  };
}

/** Reads `capture/answer` strictly: exactly one of a picture, a pass and a failure. */
export function readCaptureAnswer(
  message: Record<string, unknown>,
  requestId: string,
): CaptureRead<CaptureAnswerMessage> {
  const { picture, passed, failed } = message;
  const given = [picture, passed, failed].filter((each) => each !== undefined).length;
  if (given !== 1) {
    return {
      ok: false,
      reason: 'A capture’s answer gives a picture, why the tab passed it over, or why it failed.',
    };
  }
  if (picture !== undefined) {
    const read = readCapturePicture(picture);
    if (!read.ok) return read;
    return { ok: true, value: { type: 'capture/answer', requestId, picture: read.value } };
  }
  if (passed !== undefined) {
    if (!CAPTURE_PASSES.some((each) => each === passed)) {
      return {
        ok: false,
        reason: `A tab passes a capture over as one of: ${CAPTURE_PASSES.join(', ')}.`,
      };
    }
    return {
      ok: true,
      value: { type: 'capture/answer', requestId, passed: passed as CapturePass },
    };
  }
  const read = readCaptureFailure(message);
  if (!read.ok) return read;
  return { ok: true, value: { type: 'capture/answer', requestId, ...read.value } };
}
