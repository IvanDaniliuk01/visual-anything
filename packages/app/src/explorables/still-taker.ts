/**
 * Taking an explorable's still (ADR 0107, A10.3): in one hidden frame, loaded from the program's
 * listener under a fresh label like any other, sized as the shape it is for. Once the frame said
 * hello, the taker waits for `va.ready()` or for two frames drawn, whichever comes first, then asks
 * for the still at its bucket's width; the runtime waits for `document.fonts.ready` at most 2 s
 * itself. The whole take gives up after 5 s. The PNG the frame posts is read again by the core's
 * bitmap reader (`readBitmap`), which keeps only what draws, before anything decodes it.
 *
 * The frame never takes the pointer or the focus, and is hidden from screen readers; it lies in the
 * page, under everything and fully transparent, so that its browser draws it as a frame on screen.
 */
import {
  MAX_STILL_BYTES,
  STILL_WAIT,
  readBitmap,
  type BitmapCaps,
  type VaData,
} from '@visual-anything/core';
import {
  FrameHost,
  PAGE_CLOCK,
  type FrameEnd,
  type FrameHostClock,
  type HostedFrame,
} from './host';

/** What a take is asked for: the frame's address, the data the page is given, and the width. */
export interface StillTake {
  address: string;
  data: VaData;
  /** The still's width, in pixels: 256, 512 or 1,024. */
  width: number;
}

/** What a take gave: the cleaned PNG and its size, or why there is none; with the page's errors. */
export type StillOutcome =
  | { ok: true; png: Uint8Array; width: number; height: number; errors: string[]; ready: boolean }
  | { ok: false; why: 'stopped'; end: FrameEnd; errors: string[] }
  | { ok: false; why: 'failed'; message: string; errors: string[] };

/** What a still's PNG is read within: its message's cap, its width, and at most four times as tall. */
export const STILL_CAPS: BitmapCaps = {
  bytes: MAX_STILL_BYTES,
  side: 4 * 1024,
  pixels: 1024 * 4 * 1024,
  jpegScans: 64,
};

/** A frame the taker loads, and how it goes; the page's, or a test's. */
export interface StillFrames {
  /** Makes a hidden frame at an address, sized in CSS pixels. */
  make(address: string, width: number, height: number): HostedFrame & { remove(): void };
  clock: FrameHostClock;
  /** Calls `callback` after `ms`; returns what cancels it. */
  later(ms: number, callback: () => void): () => void;
}

/** Takes one still; a taker takes one at a time, which its queue keeps to. */
export function takeStill(
  take: StillTake,
  frames: StillFrames = PAGE_FRAMES,
): Promise<StillOutcome> {
  return new Promise<StillOutcome>((resolve) => {
    const { width: cssWidth, height: cssHeight } = take.data.size;
    const frame = frames.make(take.address, Math.max(1, cssWidth), Math.max(1, cssHeight));
    let ready = false;
    let asked = false;
    let done = false;
    let framesLeft = STILL_WAIT.framesForReady;
    let cancelFrame: (() => void) | undefined;
    const ask = () => {
      if (asked || done) return;
      asked = true;
      cancelFrame?.();
      host.askStill(take.width);
    };
    const countFrame = () => {
      cancelFrame = frames.clock.nextFrame(() => {
        cancelFrame = undefined;
        framesLeft -= 1;
        if (framesLeft <= 0) ask();
        else countFrame();
      });
    };
    const finish = (outcome: StillOutcome) => {
      if (done) return;
      done = true;
      cancelGiveUp();
      cancelFrame?.();
      frame.removeEventListener('load', loaded);
      host.dispose();
      frame.remove();
      resolve(outcome);
    };
    const host = new FrameHost(
      frame,
      take.data,
      {
        ready: () => {
          ready = true;
          ask();
        },
        still: (width, png) => {
          if (!asked || width !== take.width) return;
          const read = readBitmap(png, 'png', STILL_CAPS);
          if (!read.ok) {
            finish({
              ok: false,
              why: 'failed',
              message: read.problem.message,
              errors: [...host.errors],
            });
            return;
          }
          const { bytes, width: pixels, height } = read.value;
          if (pixels !== take.width) {
            finish({
              ok: false,
              why: 'failed',
              message: `Its still is ${pixels} pixels wide, not ${take.width}.`,
              errors: [...host.errors],
            });
            return;
          }
          finish({ ok: true, png: bytes, width: pixels, height, errors: [...host.errors], ready });
        },
        stopped: (end) => finish({ ok: false, why: 'stopped', end, errors: [...host.errors] }),
      },
      frames.clock,
    );
    // Two frames drawn after the hello stand for `va.ready()` when the page never says it.
    const loaded = () => {
      if (!asked && cancelFrame === undefined) countFrame();
    };
    frame.addEventListener('load', loaded);
    const cancelGiveUp = frames.later(STILL_WAIT.giveUp, () =>
      finish({
        ok: false,
        why: 'failed',
        message: `It drew no still within ${STILL_WAIT.giveUp / 1000} s.`,
        errors: [...host.errors],
      }),
    );
  });
}

/** The page's hidden frames. */
export const PAGE_FRAMES: StillFrames = {
  clock: PAGE_CLOCK,
  later: (ms, callback) => {
    const timer = setTimeout(callback, ms);
    return () => clearTimeout(timer);
  },
  make: (address, width, height) => {
    const element = document.createElement('iframe');
    element.setAttribute('sandbox', 'allow-scripts');
    element.setAttribute('referrerpolicy', 'no-referrer');
    element.setAttribute('aria-hidden', 'true');
    element.setAttribute('tabindex', '-1');
    element.width = String(Math.round(width));
    element.height = String(Math.round(height));
    // Through the CSSOM, which the app's policy allows: in the page so that its browser draws it,
    // under everything, transparent, and out of the pointer's way.
    Object.assign(element.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: `${Math.round(width)}px`,
      height: `${Math.round(height)}px`,
      border: '0',
      opacity: '0',
      pointerEvents: 'none',
      zIndex: '-1',
    });
    element.src = address;
    document.body.append(element);
    return element;
  },
};
