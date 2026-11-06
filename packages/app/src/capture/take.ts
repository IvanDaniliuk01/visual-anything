/**
 * The tab the person used last takes a picture for Claude (ADR 0081): of the view its canvas draws,
 * never another, so that the tab neither moves nor changes view. The region is framed in the scene
 * the canvas shows and sized for the width asked for (`frame.ts`); the canvas draws it through the
 * PNG export's path in its own theme, and a canvas off screen draws it in the other one
 * (`mirror.ts`). The PNG goes in base64, at most 4 MiB; a larger one is refused, saying how large.
 */
import {
  MAX_CAPTURE_BYTES,
  MAX_CAPTURE_WHY,
  base64Length,
  type CaptureAsk,
  type CaptureFailure,
  type CapturePicture,
  type ThemeName,
} from '@visual-anything/core';
import type { Id } from '@visual-anything/schema';
import type { CaptureImage, DrawnImage } from '../canvas/renderer';
import { ImageError } from '../export/image';
import { frameOf, sizeFor, type CaptureSeen } from './frame';

/** What a picture is taken from: the canvas of the tab. */
export interface CaptureCanvas {
  /** The view the canvas draws. */
  readonly view: Id;
  /** The theme it draws in now. */
  readonly theme: ThemeName;
  /** What it shows now; undefined while it has not started. */
  seen(): CaptureSeen | undefined;
  /** Draws a picture in the canvas's own theme. */
  draw(image: CaptureImage): Promise<DrawnImage>;
  /**
   * Draws a picture off screen in another theme, from what the canvas draws, waiting for nothing past
   * `until`, a time of `performance.now()` (#16).
   */
  drawIn(theme: ThemeName, image: CaptureImage, until?: number): Promise<DrawnImage>;
}

/** A picture taken, or why none was. */
export type CaptureOutcome = { picture: CapturePicture } | CaptureFailure;

/**
 * Takes the picture Claude asked for, or says why it took none; what drawing it waits for, it waits
 * for until `until` at most, a time of `performance.now()` (#16).
 */
export async function takeCapture(
  ask: CaptureAsk,
  canvas: CaptureCanvas,
  until?: number,
): Promise<CaptureOutcome> {
  const view = canvas.view;
  if (ask.view !== undefined && ask.view !== view) return { failed: 'other-view', shows: view };
  const seen = canvas.seen();
  if (seen === undefined) return { failed: 'no-canvas' };
  const framed = frameOf(ask.region, seen);
  if (!framed.ok) return { failed: framed.failed };
  const size = sizeFor(framed.frame, ask.width, framed.asShown);
  const image: CaptureImage = {
    frame: size.frame,
    pixelsPerUnit: size.pixelsPerUnit,
    width: size.width,
    height: size.height,
    asShown: framed.asShown,
    whole: framed.whole,
  };
  const theme = ask.theme ?? canvas.theme;
  let drawn: DrawnImage;
  try {
    drawn =
      theme === canvas.theme ? await canvas.draw(image) : await canvas.drawIn(theme, image, until);
  } catch (error) {
    return failureOf(error);
  }
  const bytes = base64Length(drawn.blob.size);
  if (bytes > MAX_CAPTURE_BYTES) return { failed: 'too-large', bytes };
  return {
    picture: {
      png: await base64Of(drawn.blob),
      width: drawn.width,
      height: drawn.height,
      view,
      theme,
      scale: size.pixelsPerUnit,
      ...(framed.missing === undefined ? {} : { missing: framed.missing }),
    },
  };
}

/** Why drawing failed, as the answer carries it. */
function failureOf(error: unknown): CaptureFailure {
  if (error instanceof ImageError) {
    if (error.problem.reason === 'not-ready') return { failed: 'no-canvas' };
    if (error.problem.reason === 'empty') return { failed: 'empty' };
  }
  const why = error instanceof Error ? error.message : String(error);
  return {
    failed: 'failed',
    why: why.length > MAX_CAPTURE_WHY ? `${why.slice(0, MAX_CAPTURE_WHY - 1)}…` : why,
  };
}

/** A blob's bytes in base64. */
async function base64Of(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  // In pieces, so that no call takes more arguments than the engine allows.
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(binary);
}
