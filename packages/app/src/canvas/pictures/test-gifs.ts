/**
 * GIFs of one pixel a frame, for the tests of pictures (ADR 0098): red, green, blue and white in the
 * palette, each frame's index encoded with the shortest LZW the format allows.
 */
import { writeGif } from '@visual-anything/core';

/** A one-pixel frame's LZW data: clear, the index, end, at three bits each. */
function onePixel(index: number): Uint8Array {
  const bits = 4 | (index << 3) | (5 << 6);
  return Uint8Array.from([bits & 0xff, bits >> 8]);
}

export const GIF_PALETTE = Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);

/** A GIF of one pixel, a frame for each index given, with its delay in hundredths. */
export function gifOf(
  frames: readonly { indices: readonly [number]; delay?: number }[],
  loop?: number,
): Uint8Array {
  return writeGif({
    width: 1,
    height: 1,
    palette: GIF_PALETTE,
    background: 0,
    ...(loop === undefined ? {} : { loop }),
    frames: frames.map((frame) => ({
      left: 0,
      top: 0,
      width: 1,
      height: 1,
      delay: frame.delay ?? 0,
      disposal: 0,
      interlaced: false,
      minCodeSize: 2,
      data: onePixel(frame.indices[0]),
    })),
  });
}
